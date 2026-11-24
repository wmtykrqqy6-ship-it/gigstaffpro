// Goodshuffle history import (CRM Phase 1, step 2).
//
// Input: the import file built from Goodshuffle's bulk downloads
// ({ source: 'goodshuffle', format: 1, projects: [...] }). It holds client
// names and contacts, so it lives in the project's private files, never in
// this (public) repo.
//
// planGoodshuffleImport() groups the projects into clients and matches
// them to clients GigStaffPro already has. Nothing is written until the
// admin confirms the preview; the writes then run as that admin, so RLS
// and the access log apply as for any other change.

import { normalizeClientName } from './clientMatch';

export const SIGNED_STATUSES = ['Contract Signed', 'Unsigned Changes'];

export const isSignedProject = (p) => SIGNED_STATUSES.includes(p?.status);

const digits = (v) => String(v ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
const lowerEmail = (v) => {
  const e = String(v ?? '').trim().toLowerCase();
  return /^\S+@\S+\.\S+$/.test(e) ? e : '';
};

// Throws a readable error if this isn't an import file.
export function readImportFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t a Goodshuffle import file (it isn’t JSON).');
  }
  if (!data || data.source !== 'goodshuffle' || !Array.isArray(data.projects)) {
    throw new Error('That file isn’t a Goodshuffle import file.');
  }
  return data.projects.filter(p => p && p.project_id);
}

// The name a project's client goes by.
export function projectClientName(p) {
  return String(p?.client_name || p?.contact_name || '').trim().replace(/\s+/g, ' ');
}

// Groups projects that belong to the same client: same email, same client
// name, or same phone. Projects with no name, email or phone are skipped
// (Goodshuffle's empty "New Project" shells).
export function groupProjectsIntoClients(projects = []) {
  const parent = new Map();
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const union = (a, b) => { parent.set(find(a), find(b)); };

  const usable = [];
  const skipped = [];
  const byKey = new Map();
  for (const p of projects) {
    const keys = [];
    const name = normalizeClientName(projectClientName(p));
    const email = lowerEmail(p.contact_email);
    const phone = digits(p.contact_phone);
    if (name) keys.push(`n:${name}`);
    if (email) keys.push(`e:${email}`);
    if (phone.length >= 10) keys.push(`p:${phone}`);
    if (!keys.length) { skipped.push(p); continue; }
    usable.push(p);
    parent.set(p.project_id, p.project_id);
    for (const k of keys) {
      if (byKey.has(k)) union(p.project_id, byKey.get(k));
      else byKey.set(k, p.project_id);
    }
  }

  const groups = new Map();
  for (const p of usable) {
    const root = find(p.project_id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(p);
  }
  return { groups: [...groups.values()].map(summarizeGroup), skipped };
}

const mostCommon = (values) => {
  const counts = new Map();
  for (const v of values) if (v) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null, n = 0;
  for (const [v, c] of counts) if (c > n) { best = v; n = c; }
  return best;
};

// Latest project first (by event date, then project number).
const byLatest = (a, b) =>
  String(b.event_date || '').localeCompare(String(a.event_date || '')) ||
  String(b.project_id).localeCompare(String(a.project_id));

function summarizeGroup(projects) {
  const sorted = [...projects].sort(byLatest);
  const names = sorted.map(projectClientName).filter(Boolean);
  const fallback = sorted.find(p => p.name)?.name || lowerEmail(sorted.find(p => p.contact_email)?.contact_email) || 'Goodshuffle client';
  return {
    name: mostCommon(names) || fallback,
    emails: [...new Set(sorted.map(p => lowerEmail(p.contact_email)).filter(Boolean))],
    phones: [...new Set(sorted.map(p => String(p.contact_phone || '').trim()).filter(Boolean))],
    signed: sorted.some(isSignedProject),
    projects: sorted
  };
}

// Matches each group to an existing client: by email first (client email
// or one of its contacts), then by name. Returns
// { newClients, matched: [{ client, group }], skipped, projectCount }.
// `includeQuoteOnly` false leaves out clients who never signed (and their
// projects).
export function planGoodshuffleImport(projects = [], existingClients = [], existingContacts = [], { includeQuoteOnly = true } = {}) {
  const { groups, skipped } = groupProjectsIntoClients(projects);

  const byEmail = new Map();
  for (const c of existingClients) {
    const e = lowerEmail(c?.email);
    if (e && !byEmail.has(e)) byEmail.set(e, c);
  }
  const clientsById = new Map(existingClients.map(c => [String(c.id), c]));
  for (const ct of existingContacts) {
    const e = lowerEmail(ct?.email);
    const c = clientsById.get(String(ct?.client_id));
    if (e && c && !byEmail.has(e)) byEmail.set(e, c);
  }
  const byName = new Map();
  for (const c of existingClients) {
    const n = normalizeClientName(c?.name);
    if (n && !byName.has(n)) byName.set(n, c);
  }

  const newClients = [];
  const matched = [];
  let leftOut = 0;
  for (const g of groups) {
    if (!includeQuoteOnly && !g.signed) { leftOut++; continue; }
    const existing =
      g.emails.map(e => byEmail.get(e)).find(Boolean) ||
      g.projects.map(p => byName.get(normalizeClientName(projectClientName(p)))).find(Boolean) ||
      byName.get(normalizeClientName(g.name));
    if (existing) matched.push({ client: existing, group: g });
    else newClients.push(g);
  }
  newClients.sort((a, b) => a.name.localeCompare(b.name));
  matched.sort((a, b) => String(a.client.name).localeCompare(String(b.client.name)));
  const projectCount = [...newClients, ...matched.map(m => m.group)].reduce((n, g) => n + g.projects.length, 0);
  return { newClients, matched, skipped, leftOut, projectCount };
}

// New client row for a group.
export function clientRowFromGroup(g) {
  return {
    name: g.name,
    email: g.emails[0] || null,
    phone: g.phones[0] || null,
    source: 'goodshuffle',
    tags: g.signed ? [] : ['Quote only'],
    is_active: true
  };
}

// Fields to fill on an existing client: only ones it doesn't have yet.
export function fillMissingClientFields(client, g) {
  const patch = {};
  if (!client?.email && g.emails[0]) patch.email = g.emails[0];
  if (!client?.phone && g.phones[0]) patch.phone = g.phones[0];
  return patch;
}

// goodshuffle_projects row.
export function projectRow(p, clientId) {
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    project_id: String(p.project_id),
    client_id: clientId,
    status: p.status || null,
    name: p.name || null,
    event_date: /^\d{4}-\d{2}-\d{2}$/.test(String(p.event_date || '')) ? p.event_date : null,
    event_time: p.event_time || null,
    venue: p.venue || null,
    venue_address: p.venue_address || null,
    sales_lead: p.sales_lead || null,
    total: num(p.total),
    amount_due: num(p.amount_due),
    contact_name: p.contact_name || null,
    contact_email: lowerEmail(p.contact_email) || null,
    contact_phone: p.contact_phone || null
  };
}

export function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
