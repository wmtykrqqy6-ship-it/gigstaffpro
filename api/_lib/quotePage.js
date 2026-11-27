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
// optional gratuity per dealer) and Ask a question (saved to Messages).
// The code is the only key: 32 random URL-safe characters, checked exactly.
// Pages stop working once the event date has passed or the quote is
// cancelled or declined.

import crypto from 'node:crypto';
import { escapeHtml } from './escapeHtml.js';
import { createRateLimiter, getClientIp } from './rateLimit.js';
import { CLIENT_FROM, DEFAULT_LEAD_EMAIL, BUSINESS_PHONE } from './leadFollowups.js';
import { recordClientMessage } from './recordClientMessage.js';
import { withSignature, logoHtml, DEFAULT_LOGO_URL } from './emailSignatures.js';
import { priceQuote, partyHours, formatTime12 } from './quotePricing.js';
import { DEFAULT_TERMS } from './quoteTerms.js';

export { DEFAULT_TERMS };

export const QUOTE_SETTINGS_KEY = 'quote_settings';
export const DEFAULT_QUOTE_BASE_URL = 'https://www.gigstaffpro.com';
export const TOKEN_REGEX = /^[A-Za-z0-9_-]{32}$/;
const ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_GRATUITY = 500;


const isLimited = createRateLimiter(60, 60 * 1000);
const cents = (n) => Math.round((Number(n) || 0) * 100) / 100;
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
  const body = `${String(message || '').trim()}\n\nView and accept your quote: ${url}`;
  return withSignature(body, signature);
}

export function quoteEmailHtml(text, url, logo) {
  const paras = String(text).split(/\n{2,}/).map(p => {
    const safe = escapeHtml(p).replace(/\n/g, '<br>');
    return `<p style="margin:0 0 12px">${safe.replace(escapeHtml(url), `<a href="${escapeHtml(url)}" style="color:#7f1d1d;font-weight:bold">View and accept your quote</a>`)}</p>`;
  });
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111827">${paras.join('')}${logoHtml(logo)}</div>`;
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
    body: JSON.stringify({ from: CLIENT_FROM, to: [to], reply_to: replyTo, subject, html: quoteEmailHtml(text, url, logo), text })
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
  const terms = String(settings.terms || '').split('\n').map(t => t.trim()).filter(Boolean).map(t => `<li>${escapeHtml(t)}</li>`).join('');
  const due = s.balance_due ? ` due ${escapeHtml(longDate(s.balance_due))}` : '';
  let action = '';
  if (state === 'accepted') {
    action = `<div class="ok">Accepted${quote.accepted_name ? ` by ${escapeHtml(quote.accepted_name)}` : ''}${quote.accepted_at ? ` on ${escapeHtml(new Date(quote.accepted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' }))}` : ''}. Thank you! We'll be in touch about your deposit and the details.</div>`;
  } else if (state === 'open') {
    action = `
      <form method="post"><input type="hidden" name="action" value="accept">
        <label for="name">Your full name</label><input id="name" name="name" maxlength="120" required autocomplete="name">
        <label for="tip">Optional gratuity for the dealers, per dealer ($)</label><input id="tip" name="gratuity" type="number" min="0" max="${MAX_GRATUITY}" step="1" placeholder="0">
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
    [quote] = (await call(`quotes?public_token=eq.${token}&select=id,lead_id,client_id,status,event_date,sent_snapshot,accepted_at,accepted_name,viewed_at,public_token`)) || [];
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
    const tip = body.gratuity === '' || body.gratuity === undefined ? 0 : Math.floor(Number(body.gratuity));
    if (!Number.isFinite(tip) || tip < 0 || tip > MAX_GRATUITY) return send(res, 400, renderQuotePage({ quote, settings, state, error: `Gratuity must be between $0 and $${MAX_GRATUITY} per dealer.` }));

    // Gratuity is a line of its own, never taxed; the deposit and balance
    // are worked out again with it.
    let snapshot = s;
    if (tip > 0 && s.dealers > 0) {
      const amount = cents(tip * s.dealers);
      const total = cents(s.total + amount);
      const deposit = cents(total / 2);
      snapshot = {
        ...s,
        lines: [...(s.lines || []), { name: 'Gratuity for dealers', description: 'Goes to the dealers at your event.', category: 'fee', unit: 'dealer', qty: s.dealers, unit_price: tip, amount, taxable: false, auto: null }],
        subtotal: cents(s.subtotal + amount), total, deposit, balance: cents(total - deposit)
      };
    }
    const at = now.toISOString();
    // Only a quote still "sent" can be accepted (no double accept).
    const updated = await call(`quotes?id=eq.${quote.id}&status=eq.sent`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'accepted', accepted_at: at, accepted_name: name, gratuity_per_dealer: tip, sent_snapshot: snapshot, total: snapshot.total, deposit: snapshot.deposit, subtotal: snapshot.subtotal, updated_at: at })
    }).catch(err => { console.error('quote accept failed:', err.message); return null; });
    if (!updated?.length) return send(res, 500, renderMessagePage('Something went wrong', 'Your acceptance did not go through. Please try again or call us.'));
    if (quote.lead_id) {
      await call(`leads?id=eq.${quote.lead_id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ stage: 'booked', booked_at: at, last_contact_at: at, updated_at: at }) }).catch(() => {});
    }
    // Let the team know.
    if (env.RESEND_API_KEY) {
      const leadEmailSetting = String(await readSetting(call, 'lead_email') ?? '').replace(/"/g, '').trim();
      const teamTo = EMAIL_REGEX.test(leadEmailSetting) ? leadEmailSetting : DEFAULT_LEAD_EMAIL;
      const textMsg = `${name} accepted the quote "${s.name || ''}" for ${longDate(s.event?.date)}.\nTotal: ${money(snapshot.total)}${tip ? ` (includes ${money(tip)} per dealer gratuity)` : ''}\nDeposit due to book: ${money(snapshot.deposit)}\n\nThe lead is now Booked in GigStaffPro.`;
      await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: CLIENT_FROM, to: [teamTo], subject: `Quote accepted: ${s.name || name}`.slice(0, 300), text: textMsg })
      }).catch(() => {});
    }
    return send(res, 200, renderQuotePage({ quote: updated[0], settings, state: 'accepted' }));
  }
  return send(res, 400, renderQuotePage({ quote, settings, state }));
}
