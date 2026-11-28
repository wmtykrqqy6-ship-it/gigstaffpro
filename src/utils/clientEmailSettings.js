// Settings for the automatic client emails (docs/CRM.md): which ones are on
// and when each goes out. Stored as JSON in settings.setting_value under
// CLIENT_EMAILS_KEY and edited in Settings > Email. Everything is off until an
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
  balance: { on: false, days: 3 },    // days before the balance is due (signed quotes, deposit paid)
  late_alert: { on: false },          // note to the team when a deposit or balance is late
  google_review_url: '',
  tip_url: ''
};

const LIMITS = { followup: [1, 60], upsell: [1, 120], prep: [1, 60], review: [1, 30], balance: [0, 30] };

const clampDays = (v, [lo, hi], fallback) => {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

const cleanUrl = (v) => {
  const s = String(v ?? '').trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s.slice(0, 500) : '';
};

// ---- wording (Dylan, 2026-11-26: customize the emails and add new ones) ----
// Every email can have its own subject and message. Empty = the built-in
// wording. Messages are plain text with {blanks} (see TEMPLATE_VARS), blank
// lines between paragraphs, "- " for bullet points and **bold**.

export const MAX_SUBJECT = 150;
export const MAX_MESSAGE = 4000;
export const MAX_NAME = 60;
export const MAX_CUSTOM_EMAILS = 10;
export const BUILT_IN_KINDS = ['followup', 'thankyou', 'upsell', 'prep', 'review', 'balance'];

// When a custom email goes out, and to whom.
export const CUSTOM_TRIGGERS = {
  before_event: { label: 'days before the event', who: 'Booked clients', limits: [1, 365] },
  after_event: { label: 'days after the event', who: 'Booked clients', limits: [1, 365] },
  after_booked: { label: 'days after booking', who: 'Booked clients', limits: [0, 365] },
  after_quote: { label: 'days after the quote (or last "We talked")', who: 'Quoted leads', limits: [1, 90] }
};

export const TEMPLATE_VARS = [
  { key: 'first_name', about: "client's first name" },
  { key: 'name', about: "client's full name" },
  { key: 'event_date', about: 'e.g. Saturday, January 30' },
  { key: 'start_time', about: 'start time' },
  { key: 'location', about: 'event location' },
  { key: 'days_away', about: 'e.g. 3 weeks (emails before the event)' },
  { key: 'phone', about: 'our phone number' },
  { key: 'review_link', about: 'Google review link (line left out if not set)' },
  { key: 'tip_link', about: 'tip link (line left out if not set)' },
  { key: 'amount_owed', about: 'balance still owed (balance reminder)' },
  { key: 'balance_due_date', about: 'when the balance is due (balance reminder)' },
  { key: 'pay_link', about: 'link to pay online (balance reminder; line left out if online payments are off)' }
];

// The built-in wording, written as templates: what the editor starts from.
// The server still uses its own HTML for an email nobody has changed.
export const DEFAULT_WORDING = {
  followup: {
    subject: 'Still planning your casino party?',
    message: "Hi {first_name},\n\nWe wanted to check in on the quote we sent for your event on {event_date}. Are you still planning your casino party?\n\nIf you have questions, want to change anything, or are ready to book, just reply to this email or call us at {phone}. Dates fill up, so let us know soon and we'll hold yours.\n\nThanks,\nVegas on Wheels"
  },
  thankyou: {
    subject: "You're booked! Your casino party on {event_date}",
    message: "Hi {first_name},\n\nThank you for choosing Vegas on Wheels! Your casino party on {event_date} is on our calendar.\n\nHere's what happens next:\n- A few weeks before, we'll send a few ideas to make the night even better.\n- About a week before, we'll send a short get-ready checklist. Your remaining balance is due one week before the event.\n- Our team arrives early to set up, so you can focus on your guests.\n\nQuestions anytime? Just reply to this email or call {phone}.\n\nWe can't wait to deal you in,\nVegas on Wheels"
  },
  upsell: {
    subject: '{days_away} to go: ideas to make your casino night unforgettable',
    message: "Hi {first_name},\n\nYour casino party is just {days_away} away! Many of our hosts add one of these to make the night even bigger:\n- **More tables or dealers:** keep lines short when the crowd gets busy.\n- **DJ or live music:** a band, cocktail music or a string band sets the mood.\n- **Photobooth:** guests take home a souvenir of the night.\n- **Decorations:** casino-themed decor to transform the room.\n- **Magician:** close-up magic between hands.\n\nWant to add something or get a price? Reply to this email or call {phone}.\n\nThanks,\nVegas on Wheels"
  },
  prep: {
    subject: 'Getting ready: your casino party checklist',
    message: "Hi {first_name},\n\nYour casino party is coming up on {event_date}. Here's a quick checklist so the night goes smoothly:\n- **Balance:** your remaining balance is due one week before the event.\n- **Final guest count:** reply with your final number so we bring the right number of tables and dealers.\n- **Space:** please have the room clear and ready when our team arrives to set up.\n- **Access and parking:** tell us about loading docks, elevators, stairs or parking passes.\n- **Day-of contact:** who should our crew call when they arrive?\n- **Prizes:** if you're giving out prizes, decide how guests win them. We can help.\n\nReply to this email with anything we should know, or call {phone}.\n\nSee you soon,\nVegas on Wheels"
  },
  review: {
    subject: 'Thank you for having us!',
    message: "Hi {first_name},\n\nThank you for having Vegas on Wheels at your event! We hope you and your guests had a great time.\n\nIf you have a minute:\n- **Leave us a Google review:** it helps other hosts find us. {review_link}\n- **Tip your crew:** if our dealers and setup team made your night, you can leave them a tip. Tips are shared with the whole crew. {tip_link}\n\nPlanning another event? Reply anytime. We'd love to deal you in again.\n\nThanks,\nVegas on Wheels"
  },
  balance: {
    subject: 'Your balance for {event_date} is due {balance_due_date}',
    message: "Hi {first_name},\n\nWe're looking forward to your casino party on {event_date}! Your remaining balance of **{amount_owed}** is due on {balance_due_date}, one week before the event.\n\n{pay_link}\n\nYou can also pay by check or call us at {phone}. If you've already sent it, thank you, and please ignore this email.\n\nThanks,\nVegas on Wheels"
  }
};

const cleanText = (v, max) => String(v ?? '').replace(/\r\n/g, '\n').replace(/[^\S\n]+$/gm, '').trim().slice(0, max);
const cleanLine = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// Adds subject/message to an email's settings only when they're set, so an
// untouched email stays { on, days }.
const withWording = (base, v) => {
  const subject = cleanLine(v?.subject, MAX_SUBJECT);
  const message = cleanText(v?.message, MAX_MESSAGE);
  return { ...base, ...(subject ? { subject } : {}), ...(message ? { message } : {}) };
};

function normalizeCustom(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const c of list) {
    if (!c || typeof c !== 'object') continue;
    const id = String(c.id ?? '').toLowerCase();
    if (!/^[a-z0-9]{4,24}$/.test(id) || seen.has(id)) continue;
    const trigger = CUSTOM_TRIGGERS[c.trigger] ? c.trigger : 'before_event';
    const lim = CUSTOM_TRIGGERS[trigger].limits;
    seen.add(id);
    out.push({
      id,
      name: cleanLine(c.name, MAX_NAME) || 'Custom email',
      on: c.on === true,
      trigger,
      days: clampDays(c.days, lim, Math.max(lim[0], 7)),
      subject: cleanLine(c.subject, MAX_SUBJECT),
      message: cleanText(c.message, MAX_MESSAGE)
    });
    if (out.length >= MAX_CUSTOM_EMAILS) break;
  }
  return out;
}

// A new id for a custom email (letters and digits).
export function newCustomEmailId() {
  return Math.random().toString(36).slice(2, 10).padEnd(8, '0');
}

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
    followup: withWording({ on: on('followup'), days: clampDays(v.followup?.days, LIMITS.followup, d.followup.days) }, v.followup),
    thankyou: withWording({ on: on('thankyou') }, v.thankyou),
    upsell: withWording({ on: on('upsell'), days: clampDays(v.upsell?.days, LIMITS.upsell, d.upsell.days) }, v.upsell),
    prep: withWording({ on: on('prep'), days: clampDays(v.prep?.days, LIMITS.prep, d.prep.days) }, v.prep),
    review: withWording({ on: on('review'), days: clampDays(v.review?.days, LIMITS.review, null) }, v.review),
    balance: withWording({ on: on('balance'), days: clampDays(v.balance?.days, LIMITS.balance, d.balance.days) }, v.balance),
    late_alert: { on: on('late_alert') },
    google_review_url: cleanUrl(v.google_review_url),
    tip_url: cleanUrl(v.tip_url),
    custom: normalizeCustom(v.custom)
  };
}

// ---- filling in a template -------------------------------------------------

const esc = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// "3 weeks" for 21, "10 days" for 10, "1 day" for 1.
export function awayText(days) {
  const n = Math.round(Number(days));
  if (!Number.isFinite(n) || n < 1) return 'only days';
  if (n % 7 === 0) { const w = n / 7; return `${w} week${w === 1 ? '' : 's'}`; }
  return `${n} day${n === 1 ? '' : 's'}`;
}

// The {blank} values for one lead. Plain text; links are full URLs.
// `payment` (balance reminder only): { owed, dueDateText, payUrl }.
export function templateValues(lead, { settings, eventDateText, daysAway, phone, payment = null }) {
  const first = String(lead?.name || '').trim().split(/\s+/)[0] || 'there';
  return {
    first_name: first,
    name: String(lead?.name || '').trim() || 'there',
    event_date: eventDateText || 'your event date',
    start_time: String(lead?.start_time || '').trim() || 'the start time',
    location: String(lead?.event_location || '').trim() || 'your venue',
    days_away: daysAway == null ? 'just a few weeks' : awayText(daysAway),
    phone: phone || '',
    review_link: settings?.google_review_url || '',
    tip_link: settings?.tip_url || '',
    amount_owed: payment?.owed || 'your balance',
    balance_due_date: payment?.dueDateText || 'one week before the event',
    pay_link: payment?.payUrl || ''
  };
}

const LINK_TEXT = { review_link: 'Write a review', tip_link: 'Leave a tip', pay_link: 'Pay your balance online' };
const LINK_STYLE = 'color:#7c0a02';

// A subject with its blanks filled in (one line).
export function fillSubject(template, values) {
  return String(template || '').replace(/\{([a-z_]+)\}/g, (m, k) => (k in values ? values[k] : m)).replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
}

// One line of the message as HTML: escaped, blanks filled, **bold**, links.
function lineHtml(line, values) {
  let out = '';
  let last = 0;
  const re = /\{([a-z_]+)\}/g;
  let m;
  while ((m = re.exec(line))) {
    out += inlineHtml(line.slice(last, m.index));
    const k = m[1];
    if (k in LINK_TEXT) out += values[k] ? `<a href="${esc(values[k])}" style="${LINK_STYLE}">${LINK_TEXT[k]}</a>` : '';
    else out += k in values ? esc(values[k]) : esc(m[0]);
    last = re.lastIndex;
  }
  return out + inlineHtml(line.slice(last));
}

function inlineHtml(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/https:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]/g, (u) => `<a href="${u}" style="${LINK_STYLE}">${u}</a>`);
}

// The message body as email HTML (what goes inside the email design).
// A line that uses {review_link} or {tip_link} is left out when that link
// isn't set.
export function renderMessageHtml(message, values) {
  const lines = String(message || '').replace(/\r\n/g, '\n').split('\n')
    .filter(l => !Object.keys(LINK_TEXT).some(k => l.includes(`{${k}}`) && !values[k]));
  const blocks = [];
  let para = [];
  let bullets = [];
  const flushPara = () => { if (para.length) blocks.push(`<p style="margin:0 0 12px">${para.map(l => lineHtml(l, values)).join('<br>')}</p>`); para = []; };
  const flushList = () => { if (bullets.length) blocks.push(`<ul style="margin:0 0 12px;padding-left:20px">${bullets.map(l => `<li style="margin:0 0 6px">${lineHtml(l, values)}</li>`).join('')}</ul>`); bullets = []; };
  for (const raw of lines) {
    const line = raw.trim();
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (!line) { flushPara(); flushList(); }
    else if (bullet) { flushPara(); bullets.push(bullet[1]); }
    else { flushList(); para.push(line); }
  }
  flushPara(); flushList();
  return blocks.join('');
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
