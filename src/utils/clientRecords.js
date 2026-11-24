// Clients tab (CRM Phase 1, step 1): helpers for a client's record --
// type, contacts, past/upcoming events and activity. Tables:
// public.clients, public.client_contacts, public.client_activity
// (migration 20261124120000_add_client_contacts_and_activity.sql).
// All admin-only; see docs/CLIENT_SECURITY.md.

export const CLIENT_TYPES = [
  { id: 'private', label: 'Private party' },
  { id: 'corporate', label: 'Corporate' },
  { id: 'fundraiser', label: 'Fundraiser' },
  { id: 'planner', label: 'Event planner' }
];

export const clientTypeLabel = (type) =>
  CLIENT_TYPES.find(t => t.id === type)?.label || '';

export const ACTIVITY_KINDS = [
  { id: 'note', label: 'Note' },
  { id: 'call', label: 'Call' },
  { id: 'email', label: 'Email' },
  { id: 'text', label: 'Text' },
  { id: 'meeting', label: 'Meeting' }
];

export const activityKindLabel = (kind) =>
  ACTIVITY_KINDS.find(k => k.id === kind)?.label || 'Note';

export const PREFERRED_CONTACT = [
  { id: 'phone', label: 'Call' },
  { id: 'text', label: 'Text' },
  { id: 'email', label: 'Email' }
];

const clean = (v) => {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ');
  return s || null;
};

// Text areas keep their line breaks.
const cleanMultiline = (v) => {
  const s = String(v ?? '').trim();
  return s || null;
};

export const emptyClientForm = () => ({
  name: '', company: '', phone: '', email: '', billing_address: '',
  client_type: '', notes: '', tags: [], is_active: true
});

export function clientFormFrom(client) {
  if (!client) return emptyClientForm();
  return {
    name: client.name || '',
    company: client.company || '',
    phone: client.phone || '',
    email: client.email || '',
    billing_address: client.billing_address || '',
    client_type: client.client_type || '',
    notes: client.notes || '',
    tags: Array.isArray(client.tags) ? client.tags : [],
    is_active: client.is_active !== false
  };
}

// Row to save. `withCrmFields` is false when the database doesn't have
// client_type / billing_address yet (migration not run), so a save
// still works with the old columns.
export function clientPayloadFromForm(form, { withCrmFields = true } = {}) {
  const payload = {
    name: clean(form?.name),
    company: clean(form?.company),
    phone: clean(form?.phone),
    email: clean(form?.email)?.toLowerCase() ?? null,
    notes: cleanMultiline(form?.notes),
    tags: Array.isArray(form?.tags) ? form.tags : [],
    is_active: form?.is_active !== false
  };
  if (withCrmFields) {
    payload.billing_address = cleanMultiline(form?.billing_address);
    payload.client_type = CLIENT_TYPES.some(t => t.id === form?.client_type) ? form.client_type : null;
  }
  return payload;
}

export const emptyContactForm = () => ({
  name: '', role: '', phone: '', email: '', preferred_contact: '', is_primary: false, notes: ''
});

export function contactFormFrom(contact) {
  if (!contact) return emptyContactForm();
  return {
    name: contact.name || '',
    role: contact.role || '',
    phone: contact.phone || '',
    email: contact.email || '',
    preferred_contact: contact.preferred_contact || '',
    is_primary: !!contact.is_primary,
    notes: contact.notes || ''
  };
}

// Returns an error message, or null when the contact can be saved.
export function validateContact(form) {
  if (!clean(form?.name)) return 'Contact name is required.';
  const email = clean(form?.email);
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return 'That email address doesn’t look right.';
  return null;
}

export function contactPayloadFromForm(form, clientId) {
  return {
    client_id: clientId,
    name: clean(form?.name),
    role: clean(form?.role),
    phone: clean(form?.phone),
    email: clean(form?.email)?.toLowerCase() ?? null,
    preferred_contact: PREFERRED_CONTACT.some(p => p.id === form?.preferred_contact) ? form.preferred_contact : null,
    is_primary: !!form?.is_primary,
    notes: cleanMultiline(form?.notes),
    updated_at: new Date().toISOString()
  };
}

// Primary first, then by name.
export function sortContacts(contacts = []) {
  return [...contacts].sort((a, b) =>
    (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) ||
    String(a.name || '').localeCompare(String(b.name || ''))
  );
}

// Today as YYYY-MM-DD in local time.
export function localToday(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Splits a client's events into upcoming (soonest first) and past (latest
// first). An event today counts as upcoming. Events without a date go last
// in past.
export function splitClientEvents(events = [], today = localToday()) {
  const upcoming = [];
  const past = [];
  for (const ev of events) {
    if (!ev) continue;
    const date = String(ev.date || '').slice(0, 10);
    if (date && date >= today) upcoming.push(ev); else past.push(ev);
  }
  const key = (ev) => String(ev.date || '').slice(0, 10);
  upcoming.sort((a, b) => key(a).localeCompare(key(b)));
  past.sort((a, b) => {
    if (!key(a)) return 1;
    if (!key(b)) return -1;
    return key(b).localeCompare(key(a));
  });
  return { upcoming, past };
}

// For the client list: events per client, and the latest past / next
// upcoming date. `events` are rows with client_id and date.
export function summarizeClientEvents(events = [], today = localToday()) {
  const byClient = new Map();
  for (const ev of events) {
    if (!ev || ev.client_id === null || ev.client_id === undefined) continue;
    const id = String(ev.client_id);
    if (!byClient.has(id)) byClient.set(id, { total: 0, lastDate: null, nextDate: null });
    const s = byClient.get(id);
    s.total++;
    const date = String(ev.date || '').slice(0, 10);
    if (!date) continue;
    if (date >= today) {
      if (!s.nextDate || date < s.nextDate) s.nextDate = date;
    } else if (!s.lastDate || date > s.lastDate) {
      s.lastDate = date;
    }
  }
  return byClient;
}

// Total staff on an event's positions array.
export const eventStaffCount = (ev) =>
  Array.isArray(ev?.positions) ? ev.positions.reduce((sum, p) => sum + (Number(p?.count) || 0), 0) : 0;

// Newest first.
export function sortActivity(entries = []) {
  return [...entries].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

// "Missing table/column" errors from PostgREST, meaning the migration
// hasn't been run yet (as opposed to a permission or network error).
export function isMissingSchemaError(error) {
  if (!error) return false;
  const code = String(error.code || '');
  if (code === '42P01' || code === '42703' || code === 'PGRST205' || code === 'PGRST204') return true;
  return /does not exist|could not find the .*(table|column)/i.test(String(error.message || ''));
}

// "Jan 5, 2027" from YYYY-MM-DD (no time-zone shift).
export function formatEventDate(date) {
  const d = String(date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '—';
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Insert or update a client. If the database doesn't have the new CRM
// columns yet (migration not run), saves the old columns instead so the
// screen keeps working. Returns { id, crmFieldsSaved }; throws on any
// other error.
export async function saveClientRecord(supabase, form, existingId = null) {
  const attempt = async (withCrmFields) => {
    const payload = clientPayloadFromForm(form, { withCrmFields });
    const query = existingId
      ? supabase.from('clients').update(payload).eq('id', existingId).select('id').single()
      : supabase.from('clients').insert([payload]).select('id').single();
    return query;
  };
  let { data, error } = await attempt(true);
  if (error && isMissingSchemaError(error)) {
    ({ data, error } = await attempt(false));
    if (error) throw error;
    return { id: data?.id ?? existingId, crmFieldsSaved: false };
  }
  if (error) throw error;
  return { id: data?.id ?? existingId, crmFieldsSaved: true };
}

// Supabase returns at most 1,000 rows per request, and the client list
// passes that after the Goodshuffle import. Reads every page.
// `makeQuery` returns a fresh query with a stable order, e.g.
// () => supabase.from('clients').select('*').order('name').order('id').
export async function fetchAllRows(makeQuery, pageSize = 1000) {
  let all = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    all = all.concat(data || []);
    if (!data || data.length < pageSize) break;
  }
  return { data: all, error: null };
}
