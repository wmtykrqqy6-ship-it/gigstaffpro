// Messages inbox (CRM Phase 1, step 5; docs/CRM.md).
//
// Incoming: sales@vegasonwheels.com (GoDaddy / Microsoft 365) has an Outlook
// rule that redirects client emails to an address on in.vegasonwheels.com,
// which Resend receives. Resend then calls /api/inbound-email (rewritten to
// api/send-email.js; the Vercel plan is at its function limit) with an
// `email.received` event. The event itself is never trusted: the server
// takes only the email id from it and fetches the email from Resend's API
// with our own key, so a forged call can at most make us look up an id that
// isn't ours (404, ignored). The email is matched to a lead or client by the
// sender's address and saved to public.client_messages. A client's email
// counts as contact on their lead, so the follow-up clock starts over.
//
// Outgoing: replies written in the Messages screen (handleClientReply,
// admin-only) and the automatic emails (recordClientMessage) are saved too.

import { escapeHtml } from './escapeHtml.js';
import { htmlToPlainText } from './emailShell.js';
import { createRateLimiter, getClientIp } from './rateLimit.js';
import { CLIENT_FROM, DEFAULT_LEAD_EMAIL } from './leadFollowups.js';
import { recordClientMessage } from './recordClientMessage.js';
import { withSignature, logoHtml } from './emailSignatures.js';

export { recordClientMessage };

export const INBOUND_DOMAIN = 'in.vegasonwheels.com';
// Our own senders: never saved as a client email (avoids loops).
const OUR_ADDRESSES = new Set(['sales@vegasonwheels.com', 'noreply@gigstaffpro.com']);
const MAX_BODY = 20000;
const MAX_REPLY = 10000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Addresses we look up with ilike: no wildcard characters other than '_'
// (escaped below).
const MATCHABLE = /^[a-z0-9._+'-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isLimited = createRateLimiter(120, 60 * 1000);

// "Pat Smith <Pat@Example.com>" -> { email: 'pat@example.com', name: 'Pat Smith' }
export function parseAddress(value) {
  const s = String(value ?? '').trim();
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^<>\s]+)>\s*$/);
  const email = (m ? m[2] : s).trim().toLowerCase();
  const name = m ? m[1].trim() : '';
  if (!EMAIL_REGEX.test(email) || email.length > 254) return null;
  return { email, name: name.slice(0, 200) };
}

const ilikeValue = (email) => encodeURIComponent(email.replace(/[\\%_]/g, (c) => `\\${c}`));

export function isForInbox(email) {
  const all = [...(email?.to || []), ...(email?.received_for || []), ...(email?.cc || [])];
  return all.some(a => (parseAddress(a)?.email || '').endsWith(`@${INBOUND_DOMAIN}`));
}

export function messageText(email) {
  const text = typeof email?.text === 'string' && email.text.trim() ? email.text : htmlToPlainText(String(email?.html || ''));
  return text.replace(/\r\n/g, '\n').trim().slice(0, MAX_BODY);
}

// Pick the lead to attach an email to: an open lead first, newest first.
export function pickLead(leads) {
  const list = (leads || []).filter(Boolean);
  return list.find(l => l.stage !== 'lost') || list[0] || null;
}

function rest(env, fetchImpl) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  return async (path, opts = {}) => {
    const r = await fetchImpl(`${url}/rest/v1/${path}`, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
    if (!r.ok) {
      const err = new Error(`${path.split('?')[0]}: HTTP ${r.status}`);
      err.status = r.status;
      throw err;
    }
    return opts.method === 'PATCH' && !(opts.headers || {}).Prefer ? null : r.json();
  };
}

// Who is this? { lead_id, client_id, name } (nulls when unknown).
export async function matchContact(call, email) {
  const out = { lead_id: null, client_id: null, name: null };
  if (!MATCHABLE.test(email)) return out;
  const v = ilikeValue(email);
  const leads = await call(`leads?select=id,client_id,name,stage&email=ilike.${v}&order=created_at.desc&limit=5`);
  const lead = pickLead(leads);
  if (lead) {
    out.lead_id = lead.id;
    out.client_id = lead.client_id ?? null;
    out.name = lead.name || null;
  }
  if (out.client_id === null) {
    const clients = await call(`clients?select=id,name&email=ilike.${v}&limit=1`).catch(() => []);
    if (clients?.length) { out.client_id = clients[0].id; out.name = out.name || clients[0].name || null; }
  }
  if (out.client_id === null) {
    const contacts = await call(`client_contacts?select=client_id,name&email=ilike.${v}&limit=1`).catch(() => []);
    if (contacts?.length) { out.client_id = contacts[0].client_id; out.name = out.name || contacts[0].name || null; }
  }
  return out;
}

// Senders an admin blocked in Messages (client_message_blocks). Before that
// SQL is run the table is missing, which counts as "not blocked".
export async function isBlocked(call, email) {
  const rows = await call(`client_message_blocks?select=email&email=eq.${encodeURIComponent(email)}&limit=1`).catch(() => []);
  return Array.isArray(rows) && rows.length > 0;
}

const contactNow = (now) => ({ last_contact_at: now, followup_sent_at: null, updated_at: now });

export async function handleInboundEmail(req, res, { env = process.env, fetchImpl = fetch, now = new Date() } = {}) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  if (isLimited(getClientIp(req))) return res.status(429).json({ ok: false });
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.RESEND_API_KEY) {
    return res.status(500).json({ ok: false, error: 'Not configured' });
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (body.type !== 'email.received') return res.status(200).json({ ok: true, ignored: 'event' });
  const id = body.data?.email_id;
  if (typeof id !== 'string' || !ID_REGEX.test(id)) return res.status(400).json({ ok: false });

  // The real email, from Resend, with our key.
  const r = await fetchImpl(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` }
  });
  if (r.status === 404) return res.status(200).json({ ok: true, ignored: 'unknown' });
  if (!r.ok) return res.status(502).json({ ok: false }); // Resend retries the webhook
  const email = await r.json();

  if (!isForInbox(email)) return res.status(200).json({ ok: true, ignored: 'address' });
  const from = parseAddress(email.from);
  if (!from || OUR_ADDRESSES.has(from.email)) return res.status(200).json({ ok: true, ignored: 'sender' });

  try {
    const call = rest(env, fetchImpl);
    if (await isBlocked(call, from.email)) return res.status(200).json({ ok: true, ignored: 'blocked' });
    const who = await matchContact(call, from.email);
    const saved = await call('client_messages?on_conflict=resend_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify([{
        direction: 'in',
        kind: 'email',
        lead_id: who.lead_id,
        client_id: who.client_id,
        contact_email: from.email,
        contact_name: from.name || who.name || null,
        subject: String(email.subject || '').slice(0, 500) || null,
        body_text: messageText(email),
        resend_id: `in:${id}`,
        created_at: email.created_at || now.toISOString()
      }])
    });
    if (saved?.length && who.lead_id) {
      // A client's email is contact: the follow-up clock starts over.
      await call(`leads?id=eq.${encodeURIComponent(who.lead_id)}`, { method: 'PATCH', body: JSON.stringify(contactNow(now.toISOString())) });
    }
    return res.status(200).json({ ok: true, saved: !!saved?.length, matched: !!(who.lead_id || who.client_id) });
  } catch (err) {
    console.error('inbound email failed:', err.message);
    return res.status(500).json({ ok: false }); // e.g. the SQL isn't run yet: Resend retries
  }
}

// extraHtml: already-safe HTML added at the end (the rep's logo).
export function replyHtml(text, extraHtml = '') {
  const paras = String(text).split(/\n{2,}/).map(p => `<p style="margin:0 0 12px">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`);
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111827">${paras.join('')}${extraHtml}</div>`;
}

// Admin reply from the Messages screen. Returns { status, body }.
export async function handleClientReply({ body, adminUserId, env = process.env, fetchImpl = fetch, now = new Date() }) {
  const to = parseAddress(body?.to);
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
  const text = typeof body?.text === 'string' ? body.text.replace(/\r\n/g, '\n').trim() : '';
  if (!to) return { status: 400, body: { success: false, error: 'Invalid recipient email address' } };
  if (!subject || subject.length > 300 || /[\r\n]/.test(subject)) return { status: 400, body: { success: false, error: 'Invalid email subject' } };
  if (!text || text.length > MAX_REPLY) return { status: 400, body: { success: false, error: 'Write a message (up to 10,000 characters).' } };
  const leadId = typeof body.leadId === 'string' && ID_REGEX.test(body.leadId) ? body.leadId : null;
  const clientId = body.clientId === null || body.clientId === undefined || body.clientId === '' ? null : String(body.clientId).slice(0, 64);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.RESEND_API_KEY) return { status: 500, body: { success: false, error: 'Email service not configured' } };

  const call = rest(env, fetchImpl);
  const setting = await call('settings?select=setting_value&setting_key=eq.lead_email').catch(() => []);
  const leadEmail = String(setting?.[0]?.setting_value ?? '').replace(/"/g, '').trim();
  const replyTo = EMAIL_REGEX.test(leadEmail) ? leadEmail : DEFAULT_LEAD_EMAIL;

  // The rep's own signature goes at the end (still sent from sales@).
  let signature = '';
  let logo = '';
  if (adminUserId && ID_REGEX.test(String(adminUserId))) {
    const q = `admin_email_signatures?admin_user_id=eq.${encodeURIComponent(adminUserId)}&select=`;
    // logo_url only exists once the logo SQL has been run.
    const sig = await call(`${q}signature,logo_url`).catch(() => call(`${q}signature`)).catch(() => []);
    signature = sig?.[0]?.signature || '';
    logo = sig?.[0]?.logo_url || '';
  }
  const fullText = withSignature(text, signature);

  const r = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: CLIENT_FROM, to: [to.email], reply_to: replyTo, subject, html: replyHtml(fullText, logoHtml(logo)), text: fullText })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { status: 400, body: { success: false, error: data.message || 'Failed to send email' } };

  await recordClientMessage({ env, fetchImpl, row: {
    direction: 'out', kind: 'reply', lead_id: leadId, client_id: clientId,
    contact_email: to.email, contact_name: to.name || null, subject, body_text: fullText,
    resend_id: data.id ? `out:${data.id}` : null, sent_by: adminUserId || null, read_at: now.toISOString()
  } });
  if (leadId) {
    await call(`leads?id=eq.${encodeURIComponent(leadId)}`, { method: 'PATCH', body: JSON.stringify(contactNow(now.toISOString())) }).catch(() => {});
  }
  return { status: 200, body: { success: true, id: data.id || null } };
}
