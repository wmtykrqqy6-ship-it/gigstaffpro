// Automatic emails to booked clients (CRM Phase 1; docs/CRM.md). Wording
// approved by Dylan 2026-11-24 (doc "Post-booking client emails"):
//   thankyou  right after a lead is marked Booked
//   upsell    N days before the event (default 21)
//   prep      N days before the event (default 7): get-ready checklist
//   review    the Monday after the event, or N days after: Google review + tip
// Timing and on/off live in settings (api/_lib/clientEmailSettings.js), set in
// Settings > Email, which can also change the wording and add custom emails
// (settings.custom, sent by the same loop; see dueCustomEmails). Runs on
// the hourly shift-reminder cron, 9 AM to 6 PM.
//
// Only leads in Booked with an email and event date, and not set to "Don't
// send auto emails" (followup_paused). Each email goes once per lead:
// lead_emails_sent holds a row per (lead, kind), inserted before sending
// (so overlapping runs can't double-send) and removed if the send fails.

import { escapeHtml } from './escapeHtml.js';
import { renderEmailShell, htmlToPlainText } from './emailShell.js';
import { CLIENT_EMAILS_KEY, normalizeClientEmailSettings, addDays, emailDueDate, DEFAULT_WORDING, templateValues, fillSubject, renderMessageHtml } from './clientEmailSettings.js';
import { firstName, fmtLeadDate, lastContactTime, BUSINESS_PHONE, DEFAULT_LEAD_EMAIL, CLIENT_FROM } from './leadFollowups.js';
import { recordClientMessage } from './recordClientMessage.js';

export const KINDS = ['thankyou', 'upsell', 'prep', 'review'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY_MS = 86400000;
const GRACE_DAYS = 3; // a missed day (cron outage) still sends within this

const p = (html) => `<p style="margin:0 0 12px">${html}</p>`;
const list = (items) => `<ul style="margin:0 0 12px;padding-left:20px">${items.map(i => `<li style="margin:0 0 6px">${i}</li>`).join('')}</ul>`;
const sign = (closing) => `<p style="margin:0">${closing},<br>Vegas on Wheels</p>`;

// Days from today to the event (null if unknown or past).
const daysUntil = (today, eventDate) => {
  if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(String(eventDate || ''))) return null;
  const n = Math.round((Date.parse(`${eventDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
  return n > 0 ? n : null;
};

const SUBTITLES = { thankyou: "You're booked", upsell: 'Make it even bigger', prep: 'Get-ready checklist', review: 'Thank you' };

export function buildBookedEmail(kind, lead, settings, { today } = {}) {
  if (String(kind).startsWith('custom:')) {
    const c = (settings.custom || []).find(x => `custom:${x.id}` === kind);
    if (!c) throw new Error(`Unknown email kind: ${kind}`);
    return buildCustomEmail(c, lead, settings, { today });
  }
  // Wording changed in Settings > Email replaces the built-in subject/message.
  const custom = settings[kind];
  if (custom?.subject || custom?.message) {
    const values = templateValues(lead, {
      settings, eventDateText: fmtLeadDate(lead.event_date), phone: BUSINESS_PHONE,
      daysAway: kind === 'upsell' ? settings.upsell.days : daysUntil(today, lead.event_date)
    });
    const subject = fillSubject(custom.subject || DEFAULT_WORDING[kind]?.subject, values);
    if (custom.message && SUBTITLES[kind]) {
      const html = renderEmailShell({ subtitle: SUBTITLES[kind], bodyHtml: renderMessageHtml(custom.message, values) });
      return { subject, html, text: htmlToPlainText(html) };
    }
    return { ...buildBookedEmail(kind, lead, { ...settings, [kind]: { ...custom, subject: '', message: '' } }), subject };
  }
  const name = escapeHtml(firstName(lead.name));
  const date = fmtLeadDate(lead.event_date);
  const dateText = date ? escapeHtml(date) : 'your event date';
  const where = lead.event_location ? ` at ${escapeHtml(lead.event_location)}` : '';
  const time = lead.start_time ? ` at ${escapeHtml(lead.start_time)}` : '';
  let subject, subtitle, body;

  if (kind === 'thankyou') {
    subject = `You're booked! Your casino party on ${date || 'your event date'}`;
    subtitle = "You're booked";
    body = p(`Hi ${name},`)
      + p(`Thank you for choosing Vegas on Wheels! Your casino party on ${dateText}${where} is on our calendar.`)
      + p("Here's what happens next:")
      + list([
        "A few weeks before, we'll send a few ideas to make the night even better.",
        "About a week before, we'll send a short get-ready checklist. Your remaining balance is due one week before the event.",
        'Our team arrives early to set up, so you can focus on your guests.'
      ])
      + p(`Questions anytime? Just reply to this email or call ${BUSINESS_PHONE}.`)
      + sign("We can't wait to deal you in");
  } else if (kind === 'upsell') {
    const weeks = Math.round(settings.upsell.days / 7);
    const away = settings.upsell.days % 7 === 0 ? `${weeks} week${weeks === 1 ? '' : 's'}` : `${settings.upsell.days} days`;
    subject = `${away} to go: ideas to make your casino night unforgettable`;
    subtitle = 'Make it even bigger';
    body = p(`Hi ${name},`)
      + p(`Your casino party is just ${away} away! Many of our hosts add one of these to make the night even bigger:`)
      + list([
        '<strong>More tables or dealers:</strong> keep lines short when the crowd gets busy.',
        '<strong>DJ or live music:</strong> a band, cocktail music or a string band sets the mood.',
        '<strong>Photobooth:</strong> guests take home a souvenir of the night.',
        '<strong>Decorations:</strong> casino-themed decor to transform the room.',
        '<strong>Magician:</strong> close-up magic between hands.'
      ])
      + p(`Want to add something or get a price? Reply to this email or call ${BUSINESS_PHONE}.`)
      + sign('Thanks');
  } else if (kind === 'prep') {
    subject = 'Getting ready: your casino party checklist';
    subtitle = 'Get-ready checklist';
    body = p(`Hi ${name},`)
      + p(`Your casino party is coming up on ${dateText}${time}. Here's a quick checklist so the night goes smoothly:`)
      + list([
        '<strong>Balance:</strong> your remaining balance is due one week before the event.',
        '<strong>Final guest count:</strong> reply with your final number so we bring the right number of tables and dealers.',
        '<strong>Space:</strong> please have the room clear and ready when our team arrives to set up.',
        '<strong>Access and parking:</strong> tell us about loading docks, elevators, stairs or parking passes.',
        '<strong>Day-of contact:</strong> who should our crew call when they arrive?',
        "<strong>Prizes:</strong> if you're giving out prizes, decide how guests win them. We can help."
      ])
      + p(`Reply to this email with anything we should know, or call ${BUSINESS_PHONE}.`)
      + sign('See you soon');
  } else if (kind === 'review') {
    const asks = [];
    if (settings.google_review_url) asks.push(`<strong>Leave us a Google review:</strong> it helps other hosts find us. <a href="${escapeHtml(settings.google_review_url)}" style="color:#7c0a02">Write a review</a>`);
    if (settings.tip_url) asks.push(`<strong>Tip your crew:</strong> if our dealers and setup team made your night, you can leave them a tip. Tips are shared with the whole crew. <a href="${escapeHtml(settings.tip_url)}" style="color:#7c0a02">Leave a tip</a>`);
    subject = 'Thank you for having us!';
    subtitle = 'Thank you';
    body = p(`Hi ${name},`)
      + p('Thank you for having Vegas on Wheels at your event! We hope you and your guests had a great time.')
      + (asks.length ? p(asks.length === 1 ? 'One quick favor, if you have a minute:' : 'Two quick favors, if you have a minute:') + list(asks) : '')
      + p("Planning another event? Reply anytime. We'd love to deal you in again.")
      + sign('Thanks');
  } else {
    throw new Error(`Unknown email kind: ${kind}`);
  }
  const html = renderEmailShell({ subtitle, bodyHtml: body });
  return { subject: subject.replace(/[\r\n]/g, ' '), html, text: htmlToPlainText(html) };
}

// A custom email from Settings > Email (subject and message templates).
export function buildCustomEmail(c, lead, settings, { today } = {}) {
  const values = templateValues(lead, {
    settings, eventDateText: fmtLeadDate(lead.event_date), phone: BUSINESS_PHONE,
    daysAway: c.trigger === 'before_event' ? c.days : daysUntil(today, lead.event_date)
  });
  const subject = fillSubject(c.subject, values) || 'A note from Vegas on Wheels';
  const html = renderEmailShell({ subtitle: subject, bodyHtml: renderMessageHtml(c.message, values) });
  return { subject, html, text: htmlToPlainText(html) };
}

const dateOf = (ts) => { const t = ts ? new Date(ts) : null; return t && !Number.isNaN(t.getTime()) ? t.toISOString().slice(0, 10) : null; };

// Which (lead, custom email) pairs are due today. Same rules as the built-in
// ones: once per lead, not when "Don't send auto emails" is set, and a day
// missed by the cron still goes out within GRACE_DAYS (never a pile of old
// ones when an email is first turned on).
export function dueCustomEmails(leads, settings, { today, sent = new Set() }) {
  const out = [];
  const list = (settings.custom || []).filter(c => c.on && c.subject && c.message);
  for (const l of leads || []) {
    if (!l || l.followup_paused || !l.email || !EMAIL_REGEX.test(String(l.email))) continue;
    const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(String(l.event_date || ''));
    for (const c of list) {
      const kind = `custom:${c.id}`;
      if (sent.has(`${l.id}:${kind}`)) continue;
      let due = null;
      if (c.trigger === 'after_quote') {
        if (l.stage !== 'quoted') continue;
        const start = lastContactTime(l);
        if (start === null) continue;
        if (hasDate && l.event_date < today) continue;
        due = addDays(dateOf(start), c.days);
      } else {
        if (l.stage !== 'booked') continue;
        if (c.trigger === 'before_event') {
          if (!hasDate || today >= l.event_date) continue;
          due = addDays(l.event_date, -c.days);
          const booked = dateOf(l.booked_at);
          if (booked && booked > due) continue; // booked after it was due
        } else if (c.trigger === 'after_event') {
          if (!hasDate) continue;
          due = addDays(l.event_date, c.days);
        } else if (c.trigger === 'after_booked') {
          const booked = dateOf(l.booked_at);
          if (!booked || (hasDate && today > l.event_date)) continue;
          due = addDays(booked, c.days);
        }
      }
      if (!due || today < due || today > addDays(due, GRACE_DAYS)) continue;
      out.push({ lead: l, kind });
    }
  }
  return out;
}

// Which (lead, kind) pairs are due today. `sent` = Set of `${leadId}:${kind}`.
// `today` = YYYY-MM-DD business date.
export function dueBookedEmails(leads, settings, { now = new Date(), today, sent = new Set() }) {
  const out = [];
  for (const l of leads || []) {
    if (!l || l.stage !== 'booked' || l.followup_paused) continue;
    if (!l.email || !EMAIL_REGEX.test(String(l.email))) continue;
    const bookedDate = l.booked_at ? new Date(l.booked_at).toISOString().slice(0, 10) : null;
    for (const kind of KINDS) {
      if (!settings[kind]?.on || sent.has(`${l.id}:${kind}`)) continue;
      if (kind === 'thankyou') {
        // Booked in the last 3 days, and the event isn't over.
        const age = l.booked_at ? now.getTime() - new Date(l.booked_at).getTime() : Infinity;
        if (age >= 0 && age < GRACE_DAYS * DAY_MS && !(l.event_date && l.event_date < today)) out.push({ lead: l, kind });
        continue;
      }
      if (!l.event_date) continue;
      const due = emailDueDate(kind, l.event_date, settings);
      if (!due || today < due || today > addDays(due, GRACE_DAYS)) continue;
      if (kind !== 'review' && today >= l.event_date) continue;
      // Booked after the upsell date: skip it, the thank-you just went out.
      if (kind === 'upsell' && bookedDate && bookedDate > due) continue;
      out.push({ lead: l, kind });
    }
  }
  return out;
}

export async function sendBookedLeadEmails({ now = new Date(), today, env = process.env, fetchImpl = fetch } = {}) {
  const results = { due: 0, sent: 0, errors: [] };
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = env.RESEND_API_KEY;
  if (!url || !key || !resendKey) return { ...results, message: 'Client emails not configured' };
  if (!today) return { ...results, message: 'No business date' };

  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const call = async (path, opts = {}) => {
    const r = await fetchImpl(`${url}/rest/v1/${path}`, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
    if (!r.ok) throw new Error(`${path.split('?')[0]}: HTTP ${r.status}`);
    return opts.method === 'DELETE' ? null : r.json();
  };

  const rows = await call(`settings?select=setting_key,setting_value&setting_key=in.(${CLIENT_EMAILS_KEY},lead_email)`);
  const byKey = Object.fromEntries((rows || []).map(s => [s.setting_key, s.setting_value]));
  const settings = normalizeClientEmailSettings(byKey[CLIENT_EMAILS_KEY]);
  const anyCustom = settings.custom.some(c => c.on);
  if (!KINDS.some(k => settings[k].on) && !anyCustom) return { ...results, message: 'Client emails are off' };
  const leadEmail = String(byKey.lead_email ?? '').replace(/"/g, '').trim();
  const replyTo = EMAIL_REGEX.test(leadEmail) ? leadEmail : DEFAULT_LEAD_EMAIL;

  const since = addDays(today, -40);
  const stages = settings.custom.some(c => c.on && c.trigger === 'after_quote') ? 'in.(booked,quoted)' : 'eq.booked';
  const leads = await call(`leads?select=id,client_id,name,email,stage,event_date,start_time,event_location,booked_at,quoted_at,last_contact_at,followup_paused&stage=${stages}&followup_paused=is.false&email=not.is.null&or=(event_date.gte.${since},event_date.is.null)&limit=1000`);
  if (!leads.length) return results;
  const ids = leads.map(l => l.id);
  const sentRows = await call(`lead_emails_sent?select=lead_id,kind&lead_id=in.(${ids.map(encodeURIComponent).join(',')})`);
  const sent = new Set(sentRows.map(s => `${s.lead_id}:${s.kind}`));

  const due = [...dueBookedEmails(leads, settings, { now, today, sent }), ...dueCustomEmails(leads, settings, { today, sent })];
  results.due = due.length;
  for (const { lead, kind } of due) {
    try {
      // Claim first: the unique (lead_id, kind) row means one email, ever.
      const claimed = await call('lead_emails_sent?on_conflict=lead_id,kind', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify([{ lead_id: lead.id, kind }])
      });
      if (!claimed.length) continue;
      const { subject, html, text } = buildBookedEmail(kind, lead, settings, { today });
      const r = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: CLIENT_FROM, to: [lead.email], reply_to: replyTo, subject, html, text })
      });
      if (!r.ok) {
        await call(`lead_emails_sent?lead_id=eq.${encodeURIComponent(lead.id)}&kind=eq.${encodeURIComponent(kind)}`, { method: 'DELETE' });
        results.errors.push({ leadId: lead.id, kind, error: `Resend HTTP ${r.status}` });
        continue;
      }
      results.sent++;
      // Show it in the Messages inbox (best effort).
      const sentId = (await r.json().catch(() => null))?.id;
      await recordClientMessage({ env, fetchImpl, row: {
        direction: 'out', kind: kind.startsWith('custom:') ? 'custom' : kind, lead_id: lead.id, client_id: lead.client_id ?? null,
        contact_email: String(lead.email).toLowerCase(), contact_name: lead.name || null,
        subject, body_text: text, resend_id: sentId ? `out:${sentId}` : null, read_at: now.toISOString()
      } });
    } catch (err) {
      results.errors.push({ leadId: lead.id, kind, error: err.message });
    }
  }
  return results;
}
