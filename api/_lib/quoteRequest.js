// Website quote request (CRM Phase 1, step 3; docs/CRM.md).
//
// The quote form on vegasonwheels.com posts here (browser fetch, so the
// visitor stays on the Vegas on Wheels site). This checks the form, saves a
// lead in public.leads with the service key (the table itself is admin-only),
// links it to an existing client with the same email, and emails the admin.
//
// Lives in _lib and is called from api/send-email.js through the
// /api/quote-request rewrite in vercel.json, because the Vercel plan is at
// its 12-function limit. It is the only public (no login) path there and is
// handled before the admin check.

import { renderEmailShell, htmlToPlainText } from './emailShell.js';
import { escapeHtml } from './escapeHtml.js';
import { createRateLimiter, getClientIp } from './rateLimit.js';

export const DEFAULT_ORIGINS = ['https://vegasonwheels.com', 'https://www.vegasonwheels.com'];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_FILL_MS = 3000;           // faster than this is a bot
const DUPLICATE_WINDOW_MIN = 10;    // same email again within 10 min: ignore

export function allowedOrigins(env = process.env) {
  const extra = String(env.QUOTE_FORM_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return [...DEFAULT_ORIGINS, ...extra];
}

const text = (v, max) => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  return s ? s.slice(0, max) : null;
};

const list = (v) => {
  const arr = Array.isArray(v) ? v : (v ? [v] : []);
  return [...new Set(arr.map(x => text(x, 80)).filter(Boolean))].slice(0, 15);
};

// YYYY-MM-DD or MM/DD/YYYY -> YYYY-MM-DD, else null.
export function parseEventDate(v) {
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (us) m = [null, us[3], us[1].padStart(2, '0'), us[2].padStart(2, '0')];
  }
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== `${m[1]}-${m[2]}-${m[3]}`) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

// Checks the posted form. Returns { lead } or { error } or { spam: true }
// (spam gets a normal-looking success so bots learn nothing).
export function parseQuoteRequest(body, now = Date.now()) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid request.' };

  // Honeypot: a hidden field people never fill in.
  if (text(body.website, 200)) return { spam: true };
  const started = Number(body.started_at);
  if (Number.isFinite(started) && started > 0 && now - started < MIN_FILL_MS) return { spam: true };

  const name = text(body.name, 120);
  const email = text(body.email, 254)?.toLowerCase() || null;
  const phone = text(body.phone, 40);
  if (!name) return { error: 'Please enter your name.' };
  if (!email || !EMAIL_REGEX.test(email) || /[\r\n,;]/.test(email)) return { error: 'Please enter a valid email address.' };
  if (!phone || phone.replace(/\D/g, '').length < 7) return { error: 'Please enter a phone number.' };

  const guestsRaw = String(body.guest_count ?? '').replace(/[^\d]/g, '');
  const guests = guestsRaw ? Math.min(Number(guestsRaw), 100000) : null;

  return {
    lead: {
      name,
      email,
      phone,
      company: text(body.company, 160),
      event_location: text(body.event_location, 300),
      event_date: parseEventDate(body.event_date),
      start_time: text(body.start_time, 40),
      guest_count: guests,
      games: list(body.games),
      services: list(body.services),
      message: text(body.message, 4000),
      page_url: text(body.page_url, 500),
      source: 'website',
      stage: 'new'
    }
  };
}

export function leadEmailHtml(lead, appUrl = 'https://www.gigstaffpro.com') {
  const row = (label, value) => value
    ? `<tr><td style="padding:4px 8px 4px 0;color:#6b7280;vertical-align:top">${label}</td><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`
    : '';
  const body = `
    <p style="margin:0 0 12px">New quote request from the website.</p>
    <table style="border-collapse:collapse;font-size:14px">
      ${row('Name', lead.name)}
      ${row('Email', lead.email)}
      ${row('Phone', lead.phone)}
      ${row('Company', lead.company)}
      ${row('Event date', lead.event_date)}
      ${row('Start time', lead.start_time)}
      ${row('Location', lead.event_location)}
      ${row('Guests', lead.guest_count === null ? null : String(lead.guest_count))}
      ${row('Games', lead.games.join(', '))}
      ${row('Services', lead.services.join(', '))}
      ${row('Message', lead.message)}
    </table>
    <p style="margin:16px 0 0"><a href="${appUrl}" style="color:#7c0a02">Open GigStaffPro</a></p>`;
  return renderEmailShell({ subtitle: 'New quote request', bodyHtml: body, headerEmoji: '📝' });
}

// settings.setting_value may be a plain string, a JSON string with quotes,
// or a JSON object/array holding the address. Returns one email or null.
export function adminEmailFrom(value) {
  let v = value;
  if (v && typeof v === 'object') {
    v = Array.isArray(v) ? v[0] : (v.email ?? v.value ?? v.address ?? '');
  }
  const s = String(v ?? '').trim().replace(/^"+|"+$/g, '').trim();
  return EMAIL_REGEX.test(s) && !/[\r\n,;]/.test(s) ? s : null;
}

const limiter = createRateLimiter(5, 60 * 60 * 1000); // 5 per IP per hour

function setCors(req, res, origins) {
  const origin = req.headers?.origin;
  if (origin && origins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    return true;
  }
  return false;
}

// deps: { supabase (service role), env, fetchImpl, now, isRateLimited }
export async function handleQuoteRequest(req, res, deps) {
  const env = deps.env || process.env;
  const allowed = setCors(req, res, allowedOrigins(env));
  if (req.method === 'OPTIONS') return res.status(allowed ? 204 : 403).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  if (!allowed) return res.status(403).json({ ok: false, error: 'Not allowed' });

  const isLimited = deps.isRateLimited || limiter;
  if (isLimited(getClientIp(req))) {
    return res.status(429).json({ ok: false, error: 'Too many requests. Please call or email us instead.' });
  }

  const parsed = parseQuoteRequest(req.body, deps.now ? deps.now() : Date.now());
  if (parsed.spam) return res.status(200).json({ ok: true });
  if (parsed.error) return res.status(400).json({ ok: false, error: parsed.error });
  const lead = parsed.lead;
  const supabase = deps.supabase;

  try {
    // Same person pressing submit twice: keep the first.
    const since = new Date((deps.now ? deps.now() : Date.now()) - DUPLICATE_WINDOW_MIN * 60000).toISOString();
    const { data: recent } = await supabase
      .from('leads').select('id').eq('email', lead.email).gte('created_at', since).limit(1);
    if (recent && recent.length) return res.status(200).json({ ok: true });

    const { data: client } = await supabase
      .from('clients').select('id').ilike('email', lead.email.replace(/[\\%_]/g, (c) => `\\${c}`)).limit(1);
    if (client && client.length) lead.client_id = client[0].id;

    const { error } = await supabase.from('leads').insert([lead]);
    if (error) throw error;
  } catch (err) {
    console.error('quote request save failed:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please call or email us instead.' });
  }

  // Tell the admin. A failure here doesn't lose the lead (it's saved).
  try {
    const apiKey = env.RESEND_API_KEY;
    const { data: setting } = await supabase
      .from('settings').select('setting_value').eq('setting_key', 'admin_email').maybeSingle();
    const to = adminEmailFrom(setting?.setting_value);
    if (!apiKey || !to) {
      console.error(`quote request email skipped: ${!apiKey ? 'RESEND_API_KEY missing' : 'admin_email setting missing or not an email'}`);
    } else {
      const html = leadEmailHtml(lead);
      const fetchImpl = deps.fetchImpl || fetch;
      const sent = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Vegas on Wheels <noreply@gigstaffpro.com>',
          to: [to],
          reply_to: lead.email,
          subject: `New quote request: ${lead.name}${lead.event_date ? `, ${lead.event_date}` : ''}`.replace(/[\r\n]/g, ' '),
          html,
          text: htmlToPlainText(html)
        })
      });
      // fetch doesn't throw on a 4xx/5xx, so check what Resend said.
      if (sent && sent.ok === false) {
        const detail = typeof sent.text === 'function' ? await sent.text().catch(() => '') : '';
        console.error(`quote request email failed: Resend ${sent.status} ${String(detail).slice(0, 300)}`);
      }
    }
  } catch (err) {
    console.error('quote request email failed:', err?.message || err);
  }

  return res.status(200).json({ ok: true });
}
