// Sending quotes and the client's quote page (CRM Phase 2 step 5,
// docs/QUOTES.md).
//
// Sending (admin-only action 'quote-send' on api/send-email.js): the server
// prices the saved quote again with the current price list (same code as the
// builder: ./quotePricing.js), freezes the result in quotes.sent_snapshot,
// gives the quote a long random link code (public_token), emails the client
// from sales@vegasonwheels.com with the rep's signature, saves the email in
// Messages, and moves a New lead to Quoted.
//
// The client's page (/q/<code>, rewritten to api/send-email.js?route=quote):
// a plain server-rendered HTML page with Vegas on Wheels branding only. It
// shows the frozen snapshot, never live data, and offers Accept (typed name,
// no gratuity: Dylan wants tips asked for only after the event, by the
// Monday-after email) and Ask a question (saved to Messages).
// The code is the only key: 32 random URL-safe characters, checked exactly.
// Accepting is the e-signature: typed full name + ticked "I accept". The
// server keeps a signature record in quotes.signature (time, IP, device, the
// exact terms accepted, and fingerprints of the quote and terms), shows
// "Signed electronically by ..." on the page, and emails a signed copy to
// the client and the team.
// Pages stop working once the event date has passed or the quote is
// cancelled or declined.

import crypto from 'node:crypto';
import { escapeHtml } from './escapeHtml.js';
import { createRateLimiter, getClientIp } from './rateLimit.js';
import { CLIENT_FROM, DEFAULT_LEAD_EMAIL, BUSINESS_PHONE } from './leadFollowups.js';
import { recordClientMessage } from './recordClientMessage.js';
import { withSignature, cleanSignature, cleanLogoUrl, DEFAULT_LOGO_URL } from './emailSignatures.js';
import { priceQuote, partyHours, formatTime12 } from './quotePricing.js';
import { DEFAULT_TERMS } from './quoteTerms.js';

export { DEFAULT_TERMS };

export const QUOTE_SETTINGS_KEY = 'quote_settings';
export const DEFAULT_QUOTE_BASE_URL = 'https://www.gigstaffpro.com';
export const TOKEN_REGEX = /^[A-Za-z0-9_-]{32}$/;
const ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


const isLimited = createRateLimiter(60, 60 * 1000);
const money = (n) => `${Number(n) < 0 ? '-' : ''}$${Math.abs(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const newToken = () => crypto.randomBytes(24).toString('base64url');

function rest(env, fetchImpl) {
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
  return async (path, opts = {}) => {
    const r = await fetchImpl(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
    if (!r.ok) {
      const err = new Error(`${path.split('?')[0]}: HTTP ${r.status}`);
      err.status = r.status;
      throw err;
    }
    if (r.status === 204) return null;
    return r.json().catch(() => null);
  };
}

async function readSetting(call, key) {
  const rows = await call(`settings?select=setting_value&setting_key=eq.${encodeURIComponent(key)}`).catch(() => []);
  return rows?.[0]?.setting_value ?? null;
}

export function parseQuoteSettings(value) {
  let v = value;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = {}; } }
  v = v && typeof v === 'object' ? v : {};
  const terms = typeof v.terms === 'string' && v.terms.trim() ? v.terms.slice(0, 8000) : DEFAULT_TERMS;
  const base = typeof v.link_base === 'string' && /^https:\/\/[a-z0-9.-]+$/i.test(v.link_base.trim()) ? v.link_base.trim() : DEFAULT_QUOTE_BASE_URL;
  return { terms, link_base: base };
}

export const quoteUrl = (base, token) => `${base}/q/${token}`;

// ---------------------------------------------------------------------------
// E-signature record
// ---------------------------------------------------------------------------

export const SIGN_STATEMENT = 'I accept this quote and the terms and conditions above.';
const sha256 = (x) => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
export const centralTime = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago', timeZoneName: 'short' });
};

// What we keep when a client accepts: who, when, from where, and exactly what
// they agreed to (the terms text and fingerprints of the quote and terms, so
// any later change would show).
export function buildSignature({ name, req, snapshot, terms, now = new Date() }) {
  return {
    method: 'Typed full name and ticked the accept box on the quote page',
    name,
    statement: SIGN_STATEMENT,
    signed_at: now.toISOString(),
    ip: String(getClientIp(req) || '').slice(0, 64) || null,
    user_agent: String(req?.headers?.['user-agent'] || '').slice(0, 400) || null,
    email: snapshot?.contact?.email || null,
    terms: String(terms || ''),
    terms_sha256: sha256(String(terms || '')),
    quote_sha256: sha256(snapshot || {})
  };
}

function signatureLines(sig) {
  return [
    `Signed electronically by ${sig.name} on ${centralTime(sig.signed_at)}.`,
    `Agreement: "${sig.statement || SIGN_STATEMENT}"`,
    sig.email ? `Quote sent to: ${sig.email}` : '',
    sig.ip ? `IP address: ${sig.ip}` : '',
    sig.user_agent ? `Device: ${sig.user_agent}` : '',
    sig.quote_sha256 ? `Record ID: ${String(sig.quote_sha256).slice(0, 16).toUpperCase()}` : ''
  ].filter(Boolean);
}

// The signed copy emailed to the client and the team (inline styles only).
export function signedCopyEmailHtml({ snapshot, signature, url }) {
  const s = snapshot || {};
  const ev = s.event || {};
  const time = ev.start ? `${formatTime12(ev.start)}${ev.end ? ` - ${formatTime12(ev.end)}` : ''}` : '';
  const td = 'padding:6px 4px;border-bottom:1px solid #e5e7eb;vertical-align:top';
  const rows = (s.lines || []).map(l => `<tr><td style="${td}">${escapeHtml(l.name)}</td><td style="${td};text-align:right">${escapeHtml(String(l.qty))}</td><td style="${td};text-align:right">${money(l.unit_price)}</td><td style="${td};text-align:right">${money(l.amount)}</td></tr>`).join('');
  const tot = (label, v, bold) => `<tr><td style="padding:3px 4px;${bold ? 'font-weight:bold' : ''}">${label}</td><td style="padding:3px 4px;text-align:right;${bold ? 'font-weight:bold' : ''}">${money(v)}</td></tr>`;
  const terms = String(signature?.terms || '').split('\n').map(t => t.trim()).filter(Boolean).map(t => `<li style="margin-bottom:4px">${escapeHtml(t)}</li>`).join('');
  const sigHtml = signatureLines(signature || {}).map(l => escapeHtml(l)).join('<br>');
  return `<div style="background:#f3f4f6;padding:16px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2937">
<tr><td style="padding:20px 24px"><img src="${escapeHtml(DEFAULT_LOGO_URL)}" alt="Vegas on Wheels" width="150" style="display:block;width:150px;height:auto;border:0"></td></tr>
<tr><td style="padding:0 24px 8px"><div style="font-size:24px;font-weight:bold;color:#374151">Signed quote</div><p style="margin:8px 0 0">Thank you${signature?.name ? `, ${escapeHtml(signature.name)}` : ''}! This is your signed copy. Please keep it for your records.</p></td></tr>
<tr><td style="padding:12px 24px"><strong>${escapeHtml(s.name || '')}</strong><br>${escapeHtml(longDate(ev.date))}${time ? `, ${escapeHtml(time)}` : ''}${ev.venue ? `<br>${escapeHtml(ev.venue)}` : ''}${ev.address ? `<br>${escapeHtml(ev.address)}` : ''}</td></tr>
<tr><td style="padding:8px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px"><tr><th style="text-align:left;padding:4px;color:#6b7280;font-weight:normal">Item</th><th style="text-align:right;padding:4px;color:#6b7280;font-weight:normal">Qty</th><th style="text-align:right;padding:4px;color:#6b7280;font-weight:normal">Unit</th><th style="text-align:right;padding:4px;color:#6b7280;font-weight:normal">Total</th></tr>${rows}</table>
<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:13px;margin:8px 0 0 auto;min-width:260px">${tot('Subtotal', s.subtotal)}${tot(`Sales tax${s.tax_rate ? ` (${escapeHtml(String(Math.round(s.tax_rate * 10000) / 100))}%)` : ''}`, s.tax)}${tot('Total', s.total, true)}${tot('50% deposit to book', s.deposit)}${tot(`Balance${s.balance_due ? ` due ${escapeHtml(longDate(s.balance_due))}` : ''}`, s.balance)}</table></td></tr>
${terms ? `<tr><td style="padding:12px 24px"><div style="font-weight:bold;margin-bottom:6px">Terms and conditions</div><ul style="margin:0;padding-left:18px;font-size:12px;color:#374151">${terms}</ul></td></tr>` : ''}
<tr><td style="padding:12px 24px"><div style="border:1px solid #d1d5db;border-radius:6px;padding:12px;background:#f9fafb;font-size:12px;color:#374151"><div style="font-weight:bold;font-size:13px;margin-bottom:4px">Electronic signature</div>${sigHtml}</div></td></tr>
${url ? `<tr><td style="padding:12px 24px 24px;text-align:center"><a href="${escapeHtml(url)}" style="display:inline-block;background:#c00000;color:#ffffff;text-decoration:none;font-weight:bold;padding:10px 18px;border-radius:5px">View signed quote online</a></td></tr>` : ''}
<tr><td style="padding:16px 24px;background:#4b5563;color:#e5e7eb;font-size:12px">Vegas on Wheels · ${escapeHtml(BUSINESS_PHONE)} · ${escapeHtml(DEFAULT_LEAD_EMAIL)}</td></tr>
</table></div>`;
}

export function signedCopyEmailText({ snapshot, signature, url }) {
  const s = snapshot || {};
  const lines = (s.lines || []).map(l => `- ${l.name}: ${l.qty} x ${money(l.unit_price)} = ${money(l.amount)}`);
  return [
    `Signed quote: ${s.name || ''}`, longDate(s.event?.date), '',
    ...lines, '',
    `Subtotal ${money(s.subtotal)} · Tax ${money(s.tax)} · Total ${money(s.total)}`,
    `50% deposit to book: ${money(s.deposit)}`, '',
    'Terms and conditions:', String(signature?.terms || ''), '',
    'Electronic signature:', ...signatureLines(signature || {}),
    url ? `\nView online: ${url}` : '', '', `Vegas on Wheels · ${BUSINESS_PHONE} · ${DEFAULT_LEAD_EMAIL}`
  ].join('\n');
}

// The frozen copy the client sees.
export function buildSnapshot(quote, items, lead, now = new Date()) {
  const priced = priceQuote(quote.lines || [], {
    items,
    hours: partyHours(quote.start_time, quote.end_time),
    miles: quote.miles,
    fundraiser: quote.fundraiser,
    taxRate: Number(quote.tax_rate) || 0,
    extraHourMode: quote.extra_hour_mode,
    autoOff: quote.auto_off || [],
    eventDate: quote.event_date
  });
  return {
    version: 1,
    sent_at: now.toISOString(),
    name: quote.name || null,
    event: {
      date: quote.event_date || null,
      start: quote.start_time || null,
      end: quote.end_time || null,
      guests: quote.guest_count ?? null,
      venue: quote.venue || null,
      address: quote.address || null
    },
    contact: { name: lead?.name || null, company: lead?.company || null, email: lead?.email || null, phone: lead?.phone || null },
    lines: priced.lines.map(l => ({
      name: l.name, description: l.description || null, size: l.size || null, photo_url: l.photo_url || null,
      category: l.category, unit: l.unit, qty: l.qty, unit_price: l.unit_price, amount: l.amount, taxable: l.taxable !== false, auto: l.auto || null
    })),
    tables: priced.tables,
    dealers: priced.dealers,
    subtotal: priced.subtotal,
    tax: priced.tax,
    tax_rate: Number(quote.tax_rate) || 0,
    tax_county: quote.tax_county || null,
    total: priced.total,
    deposit: priced.deposit,
    balance: priced.balance,
    balance_due: priced.balanceDue,
    client_notes: quote.client_notes || null
  };
}

export function quoteEmailText(message, url, signature) {
  // Signature first, so a message ending "Sincerely," reads right.
  return `${withSignature(String(message || '').trim(), signature)}\n\nView and accept your quote: ${url}`;
}

// The HTML email, laid out like the quote emails clients got from Goodshuffle
// (Dylan sent a sample 2026-11-27): logo and "View Quote" at the top, a
// "Quote" heading, the rep's message and signature, a big "View Quote"
// button, the event and totals, "Have questions?", and our address. Table
// layout with inline styles so Outlook and Gmail show it the same way.
const RED = '#c00000';
const BUSINESS_ADDRESS = ['535 S 93rd St', 'Milwaukee, WI 53214'];

function emailButton(url, label, big) {
  const pad = big ? '14px 28px' : '10px 18px';
  return `<a href="${url}" style="display:inline-block;background:${RED};color:#ffffff;text-decoration:none;font-weight:bold;font-size:${big ? 18 : 15}px;padding:${pad};border-radius:5px">${label}</a>`;
}

const htmlParas = (text) => String(text || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
  .map(p => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');

export function quoteEmailHtml({ message, signature, url, logo, snapshot }) {
  const s = snapshot || {};
  const ev = s.event || {};
  const c = s.contact || {};
  const href = escapeHtml(url);
  const logoUrl = escapeHtml(cleanLogoUrl(logo) || DEFAULT_LOGO_URL);
  const when = [longDate(ev.date), ev.start ? `${formatTime12(ev.start)}${ev.end ? ` - ${formatTime12(ev.end)}` : ''}` : ''].filter(Boolean).join(', ');
  const project = [
    s.name ? `<div style="font-weight:bold;margin-bottom:4px">${escapeHtml(s.name)}</div>` : '',
    when ? `<div>${escapeHtml(when)}</div>` : '',
    ev.venue ? `<div>${escapeHtml(ev.venue)}</div>` : '',
    c.name ? `<div style="font-weight:bold;margin:12px 0 4px">Contact</div><div>${escapeHtml(c.name)}</div>` : ''
  ].join('');
  const row = (label, value, bold) => `<tr><td style="padding:3px 0;${bold ? 'font-weight:bold;border-top:1px solid #d1d5db;padding-top:8px' : ''}">${label}</td><td style="padding:3px 0;text-align:right;${bold ? 'font-weight:bold;border-top:1px solid #d1d5db;padding-top:8px' : ''}">${money(value)}</td></tr>`;
  const summary = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">${row('Subtotal', s.subtotal)}${row('Taxes', s.tax)}${row('Total', s.total, true)}${s.deposit ? `<tr><td colspan="2" style="padding-top:8px;font-size:13px;color:#6b7280">${escapeHtml(`Deposit to book: ${money(s.deposit)}`)}</td></tr>` : ''}</table>`;
  const sig = cleanSignature(signature);
  const hr = '<tr><td style="border-top:1px solid #e5e7eb;font-size:0;line-height:0">&nbsp;</td></tr>';
  return `<div style="background:#f3f4f6;padding:16px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1f2937">
<tr><td style="padding:20px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td><img src="${logoUrl}" alt="Vegas on Wheels" width="150" style="display:block;width:150px;max-width:100%;height:auto;border:0"></td>
<td style="text-align:right;vertical-align:middle">${emailButton(href, 'View Quote')}</td></tr></table></td></tr>
${hr}
<tr><td style="padding:20px 24px 8px;text-align:center"><div style="font-size:30px;font-weight:bold;color:#374151">Quote</div></td></tr>
<tr><td style="padding:12px 24px 4px">${htmlParas(message)}${sig ? `<div style="margin-top:20px">${htmlParas(sig)}</div>` : ''}</td></tr>
<tr><td style="padding:12px 24px 24px;text-align:center">${emailButton(href, 'View Quote', true)}</td></tr>
${hr}
<tr><td style="padding:20px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px"><tr>
<td width="50%" style="vertical-align:top;padding-right:12px"><div style="font-weight:bold;color:#6b7280;font-size:12px;text-transform:uppercase;margin-bottom:6px">Event</div>${project}</td>
<td width="50%" style="vertical-align:top;padding-left:12px"><div style="font-weight:bold;color:#6b7280;font-size:12px;text-transform:uppercase;margin-bottom:6px">Summary</div>${summary}</td>
</tr></table></td></tr>
${hr}
<tr><td style="padding:20px 24px;text-align:center"><div style="font-size:18px;font-weight:bold;margin-bottom:4px">Have Questions?</div><div>Call ${escapeHtml(BUSINESS_PHONE)} or reply directly to this email.</div></td></tr>
<tr><td style="padding:20px 24px;background:#4b5563;color:#e5e7eb;font-size:13px;line-height:1.7"><div style="font-size:16px;margin-bottom:4px">Vegas on Wheels</div>${BUSINESS_ADDRESS.map(escapeHtml).join('<br>')}<br>P: ${escapeHtml(BUSINESS_PHONE)}<br>${escapeHtml(DEFAULT_LEAD_EMAIL)}</td></tr>
</table></div>`;
}

// Admin action 'quote-send'. body: { quoteId, subject, message }.
export async function handleQuoteSend({ body, adminUserId, env = process.env, fetchImpl = fetch, now = new Date() }) {
  const quoteId = typeof body?.quoteId === 'string' && ID_REGEX.test(body.quoteId) ? body.quoteId : null;
  if (!quoteId) return { status: 400, body: { ok: false, error: 'Save the quote first.' } };
  const subject = String(body?.subject || '').trim();
  const message = String(body?.message || '').replace(/\r\n/g, '\n').trim();
  if (!subject || subject.length > 300 || /[\r\n]/.test(subject)) return { status: 400, body: { ok: false, error: 'Add a subject (one line).' } };
  if (!message || message.length > 5000) return { status: 400, body: { ok: false, error: 'Write a short message (up to 5,000 characters).' } };
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.RESEND_API_KEY) return { status: 500, body: { ok: false, error: 'Email service not configured' } };

  const call = rest(env, fetchImpl);
  const [quote] = (await call(`quotes?id=eq.${quoteId}&select=*`)) || [];
  if (!quote) return { status: 404, body: { ok: false, error: 'Quote not found.' } };
  if (!['draft', 'sent'].includes(quote.status)) return { status: 409, body: { ok: false, error: `This quote is ${quote.status}.` } };
  if (!quote.lead_id) return { status: 400, body: { ok: false, error: 'This quote has no lead to send it to.' } };
  const [lead] = (await call(`leads?id=eq.${quote.lead_id}&select=id,name,company,email,phone,stage`)) || [];
  const to = String(lead?.email || '').trim().toLowerCase();
  if (!EMAIL_REGEX.test(to)) return { status: 400, body: { ok: false, error: "The lead doesn't have an email address." } };

  const items = (await call('price_items?select=*')) || [];
  const settings = parseQuoteSettings(await readSetting(call, QUOTE_SETTINGS_KEY));
  const snapshot = buildSnapshot(quote, items, lead, now);
  if (!snapshot.lines.length) return { status: 400, body: { ok: false, error: 'Add at least one item.' } };
  const token = TOKEN_REGEX.test(quote.public_token || '') ? quote.public_token : newToken();
  const url = quoteUrl(settings.link_base, token);

  let signature = '';
  let logo = '';
  if (adminUserId && ID_REGEX.test(String(adminUserId))) {
    const q = `admin_email_signatures?admin_user_id=eq.${encodeURIComponent(adminUserId)}&select=`;
    const sig = await call(`${q}signature,logo_url`).catch(() => call(`${q}signature`)).catch(() => []);
    signature = sig?.[0]?.signature || '';
    logo = sig?.[0]?.logo_url || '';
  }
  const leadEmailSetting = String(await readSetting(call, 'lead_email') ?? '').replace(/"/g, '').trim();
  const replyTo = EMAIL_REGEX.test(leadEmailSetting) ? leadEmailSetting : DEFAULT_LEAD_EMAIL;
  const text = quoteEmailText(message, url, signature);

  // Save first, so the link works the moment the email lands.
  await call(`quotes?id=eq.${quoteId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'sent', public_token: token, sent_snapshot: snapshot, sent_at: now.toISOString(), updated_at: now.toISOString(),
      subtotal: snapshot.subtotal, tax: snapshot.tax, total: snapshot.total, deposit: snapshot.deposit
    })
  });

  const r = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: CLIENT_FROM, to: [to], reply_to: replyTo, subject, html: quoteEmailHtml({ message, signature, url, logo, snapshot }), text })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { status: 502, body: { ok: false, error: data.message || 'The email did not send. The quote is saved; try again.' } };

  await recordClientMessage({ env, fetchImpl, row: {
    direction: 'out', kind: 'reply', lead_id: lead.id, client_id: quote.client_id ?? null,
    contact_email: to, contact_name: lead.name || null, subject, body_text: text,
    resend_id: data.id ? `out:${data.id}` : null, sent_by: adminUserId || null, read_at: now.toISOString()
  } });
  const leadPatch = { last_contact_at: now.toISOString(), updated_at: now.toISOString() };
  if (lead.stage === 'new') Object.assign(leadPatch, { stage: 'quoted', quoted_at: now.toISOString(), followup_sent_at: null });
  await call(`leads?id=eq.${lead.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(leadPatch) }).catch(() => {});
  return { status: 200, body: { ok: true, url, total: snapshot.total } };
}

// ---------------------------------------------------------------------------
// The client's page
// ---------------------------------------------------------------------------

const today = (now) => {
  const d = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function quoteState(quote, now = new Date()) {
  if (!quote || !quote.sent_snapshot) return 'missing';
  if (quote.status === 'accepted') return 'accepted';
  if (quote.status !== 'sent') return 'closed';
  if (quote.event_date && quote.event_date < today(now)) return 'expired';
  return 'open';
}

const longDate = (d) => {
  const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};

const PAGE_CSS = `
body{margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;font-size:15px;line-height:1.45}
.wrap{max-width:860px;margin:0 auto;padding:16px}
.card{background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.08);padding:20px;margin-bottom:16px}
.head{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-start}
.head img{max-width:180px;height:auto}
h1{color:#b91c1c;font-size:26px;margin:0}
h2{background:#b91c1c;color:#fff;font-size:15px;margin:0 0 8px;padding:4px 8px;border-radius:4px}
.muted{color:#6b7280;font-size:13px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
table{width:100%;border-collapse:collapse}
td,th{padding:8px 6px;vertical-align:top;border-bottom:1px solid #e5e7eb;text-align:left}
th{font-size:12px;color:#6b7280;font-weight:normal}
.num{text-align:right;white-space:nowrap}
.item img{width:90px;height:auto;border-radius:4px;margin-right:10px;float:left}
.desc{font-size:13px;color:#4b5563}
.totals td{border:0;padding:3px 6px}
.total td{font-weight:bold;font-size:17px;border-top:2px solid #111827}
.terms li{margin-bottom:6px;font-size:13px}
label{display:block;font-size:13px;color:#374151;margin:10px 0 4px}
input,textarea{width:100%;box-sizing:border-box;padding:9px;border:1px solid #d1d5db;border-radius:6px;font-size:15px}
button{background:#7f1d1d;color:#fff;border:0;border-radius:6px;padding:12px 18px;font-size:16px;cursor:pointer;margin-top:12px}
button.alt{background:#e5e7eb;color:#111827}
.ok{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;padding:12px;border-radius:8px}
.warn{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:12px;border-radius:8px}
@media(max-width:640px){.grid{grid-template-columns:1fr}.item img{width:64px}h1{font-size:22px}}
`;

function shell(title, inner) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)}</title><style>${PAGE_CSS}</style></head><body><div class="wrap">${inner}</div></body></html>`;
}

export function renderMessagePage(title, text) {
  return shell(title, `<div class="card"><img src="${escapeHtml(DEFAULT_LOGO_URL)}" alt="Vegas on Wheels" style="max-width:180px"><h1 style="margin-top:12px">${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p><p class="muted">Vegas on Wheels · ${escapeHtml(BUSINESS_PHONE)} · ${escapeHtml(DEFAULT_LEAD_EMAIL)}</p></div>`);
}

export function renderQuotePage({ quote, settings, state, notice = '', error = '' }) {
  const s = quote.sent_snapshot || {};
  const ev = s.event || {};
  const c = s.contact || {};
  const time = ev.start ? `${formatTime12(ev.start)}${ev.end ? ` - ${formatTime12(ev.end)}` : ''}` : '';
  const rows = (s.lines || []).map(l => `
    <tr><td class="item">${l.photo_url && /^https:\/\//.test(l.photo_url) ? `<img src="${escapeHtml(l.photo_url)}" alt="">` : ''}<strong>${escapeHtml(l.name)}</strong>${l.size ? `<div class="desc">${escapeHtml(l.size)}</div>` : ''}${l.description ? `<div class="desc">${escapeHtml(l.description)}</div>` : ''}</td>
    <td class="num">${escapeHtml(String(l.qty))}</td><td class="num">${money(l.unit_price)}</td><td class="num">${money(l.amount)}</td></tr>`).join('');
  const sig = state === 'accepted' && quote.signature && typeof quote.signature === 'object' ? quote.signature : null;
  // Once signed, show the terms exactly as the client accepted them.
  const terms = String(sig?.terms || settings.terms || '').split('\n').map(t => t.trim()).filter(Boolean).map(t => `<li>${escapeHtml(t)}</li>`).join('');
  const due = s.balance_due ? ` due ${escapeHtml(longDate(s.balance_due))}` : '';
  let action = '';
  if (state === 'accepted') {
    action = sig
      ? `<div class="ok"><strong>Signed electronically</strong><br>${signatureLines(sig).map(l => escapeHtml(l)).join('<br>')}<br><br>Thank you! We'll be in touch about your deposit and the details. A signed copy was emailed to you.</div>`
      : `<div class="ok">Accepted${quote.accepted_name ? ` by ${escapeHtml(quote.accepted_name)}` : ''}${quote.accepted_at ? ` on ${escapeHtml(new Date(quote.accepted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' }))}` : ''}. Thank you! We'll be in touch about your deposit and the details.</div>`;
  } else if (state === 'open') {
    action = `
      <form method="post"><input type="hidden" name="action" value="accept">
        <label for="name">Your full name</label><input id="name" name="name" maxlength="120" required autocomplete="name">
        <label style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" name="agree" value="yes" required style="width:auto;margin-top:3px"> <span>I accept this quote and the terms and conditions above.</span></label>
        <button type="submit">Accept quote</button>
      </form>
      <form method="post" style="margin-top:20px"><input type="hidden" name="action" value="question">
        <label for="q">Have a question or a change? Ask us here.</label><textarea id="q" name="message" rows="3" maxlength="3000" required></textarea>
        <button type="submit" class="alt">Send question</button>
      </form>`;
  }
  return shell(`Quote: ${s.name || 'Vegas on Wheels'}`, `
    <div class="card">
      <div class="head">
        <div><img src="${escapeHtml(DEFAULT_LOGO_URL)}" alt="Vegas on Wheels"><div class="muted">Vegas on Wheels<br>${escapeHtml(BUSINESS_PHONE)}<br>${escapeHtml(DEFAULT_LEAD_EMAIL)}<br>vegasonwheels.com</div></div>
        <div style="text-align:right"><h1>QUOTE</h1><div class="muted">${s.sent_at ? `Sent ${escapeHtml(new Date(s.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' }))}` : ''}</div></div>
      </div>
      ${notice ? `<p class="ok" style="margin-top:16px">${escapeHtml(notice)}</p>` : ''}
      ${error ? `<p class="warn" style="margin-top:16px">${escapeHtml(error)}</p>` : ''}
      <div class="grid" style="margin-top:16px">
        <div><strong>Contact</strong><br>${escapeHtml(c.name || '')}${c.company ? `<br>${escapeHtml(c.company)}` : ''}${c.phone ? `<br>${escapeHtml(c.phone)}` : ''}${c.email ? `<br>${escapeHtml(c.email)}` : ''}</div>
        <div><strong>Event</strong><br>${escapeHtml(s.name || '')}<br>${escapeHtml(longDate(ev.date))}${time ? ` @ ${escapeHtml(time)}` : ''}${ev.guests ? `<br>${escapeHtml(String(ev.guests))} guests` : ''}${ev.venue ? `<br>${escapeHtml(ev.venue)}` : ''}${ev.address ? `<br>${escapeHtml(ev.address)}` : ''}</div>
      </div>
    </div>
    <div class="card">
      <h2>Your quote</h2>
      <table><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Total</th></tr></thead><tbody>${rows}</tbody></table>
      <table class="totals" style="max-width:340px;margin-left:auto;margin-top:10px">
        <tr><td>Subtotal</td><td class="num">${money(s.subtotal)}</td></tr>
        <tr><td>Sales tax${s.tax_rate ? ` (${escapeHtml(String(Math.round(s.tax_rate * 10000) / 100))}%)` : ''}</td><td class="num">${money(s.tax)}</td></tr>
        <tr class="total"><td>Total</td><td class="num">${money(s.total)}</td></tr>
        <tr><td>50% deposit to book</td><td class="num">${money(s.deposit)}</td></tr>
        <tr><td>Balance${due}</td><td class="num">${money(s.balance)}</td></tr>
      </table>
      ${s.client_notes ? `<p style="white-space:pre-line;margin-top:12px">${escapeHtml(s.client_notes)}</p>` : ''}
    </div>
    <div class="card"><h2>Terms and conditions</h2><ul class="terms">${terms}</ul></div>
    <div class="card">${action || (state === 'expired' ? '<div class="warn">This quote has expired. Please call or email us for an updated quote.</div>' : '<div class="warn">This quote is no longer available. Please call or email us.</div>')}</div>
  `);
}

function setPageHeaders(res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
}

const send = (res, status, html) => { setPageHeaders(res); return res.status(status).send(html); };

// GET shows the quote; POST accepts it or sends a question.
export async function handleQuotePage(req, res, { env = process.env, fetchImpl = fetch, now = new Date() } = {}) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).end();
  if (isLimited(getClientIp(req))) return send(res, 429, renderMessagePage('Please wait a moment', 'Too many requests. Please try again in a minute.'));
  const token = String(req.query?.token || '');
  if (!TOKEN_REGEX.test(token)) return send(res, 404, renderMessagePage('Quote not found', 'Please check the link in your email, or contact us.'));
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return send(res, 500, renderMessagePage('Something went wrong', 'Please try again later.'));

  const call = rest(env, fetchImpl);
  let quote;
  try {
    const cols = 'id,lead_id,client_id,status,event_date,sent_snapshot,accepted_at,accepted_name,viewed_at,public_token';
    // signature (20261127180000) may not exist yet: fall back without it.
    [quote] = (await call(`quotes?public_token=eq.${token}&select=${cols},signature`)
      .catch(err => (err.status === 400 ? call(`quotes?public_token=eq.${token}&select=${cols}`) : Promise.reject(err)))) || [];
  } catch (err) {
    console.error('quote page load failed:', err.message);
    return send(res, 500, renderMessagePage('Something went wrong', 'Please try again later.'));
  }
  if (!quote || quote.public_token !== token) return send(res, 404, renderMessagePage('Quote not found', 'Please check the link in your email, or contact us.'));
  const settings = parseQuoteSettings(await readSetting(call, QUOTE_SETTINGS_KEY));
  let state = quoteState(quote, now);
  if (state === 'missing') return send(res, 404, renderMessagePage('Quote not found', 'Please check the link in your email, or contact us.'));

  if (req.method === 'GET') {
    if (!quote.viewed_at) {
      await call(`quotes?id=eq.${quote.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ viewed_at: now.toISOString() }) }).catch(() => {});
    }
    return send(res, 200, renderQuotePage({ quote, settings, state }));
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const s = quote.sent_snapshot || {};
  if (body.action === 'question') {
    const text = String(body.message || '').replace(/\r\n/g, '\n').trim().slice(0, 3000);
    if (!text) return send(res, 400, renderQuotePage({ quote, settings, state, error: 'Type your question first.' }));
    const email = String(s.contact?.email || '').toLowerCase();
    if (EMAIL_REGEX.test(email)) {
      await recordClientMessage({ env, fetchImpl, row: {
        direction: 'in', kind: 'email', lead_id: quote.lead_id, client_id: quote.client_id ?? null,
        contact_email: email, contact_name: s.contact?.name || null,
        subject: `Question about quote: ${s.name || 'casino party'}`.slice(0, 500), body_text: text
      } }).catch(() => {});
    }
    return send(res, 200, renderQuotePage({ quote, settings, state, notice: "Thanks! We got your question and will get back to you soon." }));
  }

  if (body.action === 'accept') {
    if (state !== 'open') return send(res, 409, renderQuotePage({ quote, settings, state }));
    const name = String(body.name || '').replace(/\s+/g, ' ').trim();
    if (name.length < 2 || name.length > 120) return send(res, 400, renderQuotePage({ quote, settings, state, error: 'Type your full name to accept.' }));
    if (body.agree !== 'yes' && body.agree !== true) return send(res, 400, renderQuotePage({ quote, settings, state, error: 'Tick the box to accept the terms.' }));
    const snapshot = s;
    const at = now.toISOString();
    const signature = buildSignature({ name, req, snapshot, terms: settings.terms, now });
    const fields = { status: 'accepted', accepted_at: at, accepted_name: name, sent_snapshot: snapshot, total: snapshot.total, deposit: snapshot.deposit, subtotal: snapshot.subtotal, updated_at: at };
    // Only a quote still "sent" can be accepted (no double accept).
    const accept = (extra) => call(`quotes?id=eq.${quote.id}&status=eq.sent`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...fields, ...extra })
    });
    // If the signature column isn't there yet (400), still accept.
    const updated = await accept({ signature })
      .catch(err => (err.status === 400 ? accept({}) : Promise.reject(err)))
      .catch(err => { console.error('quote accept failed:', err.message); return null; });
    if (!updated?.length) return send(res, 500, renderMessagePage('Something went wrong', 'Your acceptance did not go through. Please try again or call us.'));
    if (quote.lead_id) {
      await call(`leads?id=eq.${quote.lead_id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ stage: 'booked', booked_at: at, last_contact_at: at, updated_at: at }) }).catch(() => {});
    }
    // Signed copy to the client, and the team (with the same record).
    if (env.RESEND_API_KEY) {
      const leadEmailSetting = String(await readSetting(call, 'lead_email') ?? '').replace(/"/g, '').trim();
      const teamTo = EMAIL_REGEX.test(leadEmailSetting) ? leadEmailSetting : DEFAULT_LEAD_EMAIL;
      const url = quoteUrl(settings.link_base, token);
      const html = signedCopyEmailHtml({ snapshot, signature, url });
      const text = signedCopyEmailText({ snapshot, signature, url });
      const sendEmail = (payload) => fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: CLIENT_FROM, ...payload })
      }).then(r => r.json().catch(() => ({}))).catch(() => ({}));
      const clientEmail = String(s.contact?.email || '').trim().toLowerCase();
      if (EMAIL_REGEX.test(clientEmail)) {
        const subject = `Your signed quote: ${s.name || 'Vegas on Wheels'}`.slice(0, 300);
        const data = await sendEmail({ to: [clientEmail], reply_to: teamTo, subject, html, text });
        await recordClientMessage({ env, fetchImpl, row: {
          direction: 'out', kind: 'reply', lead_id: quote.lead_id, client_id: quote.client_id ?? null,
          contact_email: clientEmail, contact_name: s.contact?.name || null, subject, body_text: text,
          resend_id: data?.id ? `out:${data.id}` : null, read_at: at
        } }).catch(() => {});
      }
      const teamText = `${name} accepted and signed the quote "${s.name || ''}" for ${longDate(s.event?.date)}.\nTotal: ${money(snapshot.total)}\nDeposit due to book: ${money(snapshot.deposit)}\n\nThe lead is now Booked in GigStaffPro.\n\n${text}`;
      await sendEmail({ to: [teamTo], subject: `Quote accepted: ${s.name || name}`.slice(0, 300), html, text: teamText });
    }
    return send(res, 200, renderQuotePage({ quote: { ...updated[0], signature: updated[0].signature ?? signature }, settings, state: 'accepted' }));
  }
  return send(res, 400, renderQuotePage({ quote, settings, state }));
}
