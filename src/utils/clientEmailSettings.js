// Settings for the automatic client emails (docs/CRM.md): which ones are on
// and when each goes out. Stored as JSON in settings.setting_value under
// CLIENT_EMAILS_KEY and edited in the Leads tab. Everything is off until an
// admin turns it on.
//
// api/_lib/clientEmailSettings.js is the same file for the server (api/ isn't
// bundled through Vite); keep the two in step.

export const CLIENT_EMAILS_KEY = 'client_emails';

export const CLIENT_EMAIL_DEFAULTS = {
  followup: { on: false, days: 7 },   // quoted lead, days after the last contact
  thankyou: { on: false },            // right after a lead is marked Booked
  upsell: { on: false, days: 21 },    // days before the event
  prep: { on: false, days: 7 },       // days before the event
  review: { on: false, days: null },  // days after the event; null = the Monday after
  google_review_url: '',
  tip_url: ''
};

const LIMITS = { followup: [1, 60], upsell: [1, 120], prep: [1, 60], review: [1, 30] };

const clampDays = (v, [lo, hi], fallback) => {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

const cleanUrl = (v) => {
  const s = String(v ?? '').trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s.slice(0, 500) : '';
};

// Whatever is stored (object, JSON text, nothing) -> a full, safe settings object.
export function normalizeClientEmailSettings(value) {
  let v = value;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { v = {}; }
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = {}; } }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) v = {};
  const d = CLIENT_EMAIL_DEFAULTS;
  const on = (k) => v[k]?.on === true;
  return {
    followup: { on: on('followup'), days: clampDays(v.followup?.days, LIMITS.followup, d.followup.days) },
    thankyou: { on: on('thankyou') },
    upsell: { on: on('upsell'), days: clampDays(v.upsell?.days, LIMITS.upsell, d.upsell.days) },
    prep: { on: on('prep'), days: clampDays(v.prep?.days, LIMITS.prep, d.prep.days) },
    review: { on: on('review'), days: clampDays(v.review?.days, LIMITS.review, null) },
    google_review_url: cleanUrl(v.google_review_url),
    tip_url: cleanUrl(v.tip_url)
  };
}

// ---- dates (YYYY-MM-DD strings, no time zones) ----------------------------

export function addDays(date, n) {
  const [y, m, d] = String(date).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// The Monday after the event (an event on a Monday -> the next Monday).
export function mondayAfter(date) {
  const [y, m, d] = String(date).split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sun .. 6 Sat
  return addDays(date, ((8 - dow) % 7) || 7);
}

// The date each booked-lead email is due, or null.
export function emailDueDate(kind, eventDate, settings) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(eventDate || ''))) return null;
  if (kind === 'upsell') return addDays(eventDate, -settings.upsell.days);
  if (kind === 'prep') return addDays(eventDate, -settings.prep.days);
  if (kind === 'review') return settings.review.days ? addDays(eventDate, settings.review.days) : mondayAfter(eventDate);
  return null;
}
