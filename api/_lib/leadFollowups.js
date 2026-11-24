// "Still interested?" follow-up for quoted leads (CRM Phase 1, step 4;
// docs/CRM.md).
//
// Runs on the hourly shift-reminder cron (api/send-shift-reminders.js), the
// same way the route reminders do, because the Vercel plan is at its
// 12-function limit. Does nothing unless the admin turned it on in the Leads
// tab (settings.lead_followup_enabled = 'true').
//
// A quoted lead gets a follow-up 7 days after the last contact: the later of
// when it was moved to Quoted and when someone last pressed "We talked"
// (Dylan, 2026-11-24: no email while we're still working with the client).
// Only leads whose last contact was within 14 days are considered, so turning
// this on never emails a pile of old quotes. "Don't send" on a lead
// (followup_paused) skips it for good. Each lead is claimed (followup_sent_at
// set) before the email goes out, so a lead is never emailed twice; if the
// send fails the claim is undone and the next hour tries again.

import { escapeHtml } from './escapeHtml.js';
import { renderEmailShell, htmlToPlainText } from './emailShell.js';

export const FOLLOWUP_AFTER_DAYS = 7;
export const FOLLOWUP_WINDOW_DAYS = 14;
export const DEFAULT_LEAD_EMAIL = 'sales@vegasonwheels.com'; // same as quoteRequest.js
export const BUSINESS_PHONE = '(262) 549-3559';

const DAY_MS = 24 * 60 * 60 * 1000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';

export function fmtLeadDate(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d || ''))) return null;
  const dt = new Date(`${d}T12:00:00Z`);
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

// When the 7-day clock started: the later of quoted_at and last_contact_at.
export function lastContactTime(lead) {
  const times = [lead?.quoted_at, lead?.last_contact_at].filter(Boolean).map(d => new Date(d).getTime()).filter(n => !Number.isNaN(n));
  return times.length ? Math.max(...times) : null;
}

// Which leads are due right now. `today` is YYYY-MM-DD (business time).
export function dueLeads(leads, now = new Date(), today = null) {
  const t = now.getTime();
  return (leads || []).filter(l => {
    if (!l || l.stage !== 'quoted' || l.followup_sent_at || l.followup_paused) return false;
    if (!l.email || !EMAIL_REGEX.test(String(l.email))) return false;
    const start = lastContactTime(l);
    if (start === null) return false;
    const age = t - start;
    if (!(age >= FOLLOWUP_AFTER_DAYS * DAY_MS && age < FOLLOWUP_WINDOW_DAYS * DAY_MS)) return false;
    if (today && l.event_date && l.event_date < today) return false; // event already happened
    return true;
  });
}

export function buildFollowupEmail(lead) {
  const date = fmtLeadDate(lead.event_date);
  const forEvent = date ? ` for your event on ${escapeHtml(date)}` : '';
  const body = `
    <p style="margin:0 0 12px">Hi ${escapeHtml(firstName(lead.name))},</p>
    <p style="margin:0 0 12px">We wanted to check in on the quote we sent${forEvent}. Are you still planning your casino party?</p>
    <p style="margin:0 0 12px">If you have questions, want to change anything, or are ready to book, just reply to this email or call us at ${BUSINESS_PHONE}. Dates fill up, so let us know soon and we'll hold yours.</p>
    <p style="margin:0">Thanks,<br>Vegas on Wheels</p>`;
  const html = renderEmailShell({ subtitle: 'Checking in on your quote', bodyHtml: body });
  return {
    subject: 'Still planning your casino party?',
    html,
    text: htmlToPlainText(html)
  };
}

const settingValue = (v) => String(v ?? '').trim().replace(/^"+|"+$/g, '').trim();

export async function sendLeadFollowups({ now = new Date(), today = null, env = process.env, fetchImpl = fetch } = {}) {
  const results = { due: 0, sent: 0, errors: [] };
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = env.RESEND_API_KEY;
  if (!url || !key || !resendKey) return { ...results, message: 'Lead follow-ups not configured' };

  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const get = async (path) => {
    const r = await fetchImpl(`${url}/rest/v1/${path}`, { headers });
    if (!r.ok) throw new Error(`${path.split('?')[0]}: HTTP ${r.status}`);
    return r.json();
  };
  const patch = async (id, body, extraFilter = '') => {
    const r = await fetchImpl(`${url}/rest/v1/leads?id=eq.${encodeURIComponent(id)}${extraFilter}`, {
      method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(`leads update: HTTP ${r.status}`);
    return r.json();
  };

  const settings = await get('settings?select=setting_key,setting_value&setting_key=in.(lead_followup_enabled,lead_email)');
  const byKey = Object.fromEntries((settings || []).map(s => [s.setting_key, settingValue(s.setting_value)]));
  if (byKey.lead_followup_enabled !== 'true') return { ...results, message: 'Lead follow-ups are off' };
  const replyTo = EMAIL_REGEX.test(byKey.lead_email || '') ? byKey.lead_email : DEFAULT_LEAD_EMAIL;

  const since = new Date(now.getTime() - FOLLOWUP_WINDOW_DAYS * DAY_MS).toISOString();
  const leads = await get(`leads?select=id,name,email,stage,event_date,quoted_at,last_contact_at,followup_sent_at,followup_paused&stage=eq.quoted&followup_sent_at=is.null&followup_paused=is.false&or=(quoted_at.gte.${encodeURIComponent(since)},last_contact_at.gte.${encodeURIComponent(since)})&limit=200`);
  const due = dueLeads(leads, now, today);
  results.due = due.length;

  for (const lead of due) {
    try {
      // Claim it first so two overlapping runs can't both send.
      const claimed = await patch(lead.id, { followup_sent_at: now.toISOString() }, '&followup_sent_at=is.null');
      if (!claimed.length) continue;
      const { subject, html, text } = buildFollowupEmail(lead);
      const r = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Vegas on Wheels <noreply@gigstaffpro.com>',
          to: [lead.email],
          ...(replyTo ? { reply_to: replyTo } : {}),
          subject, html, text
        })
      });
      if (!r.ok) {
        await patch(lead.id, { followup_sent_at: null });
        results.errors.push({ leadId: lead.id, error: `Resend HTTP ${r.status}` });
        continue;
      }
      results.sent++;
    } catch (err) {
      results.errors.push({ leadId: lead.id, error: err.message });
    }
  }
  return results;
}
