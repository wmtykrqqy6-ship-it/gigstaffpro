import { describe, it, expect, vi } from 'vitest';
import { dueBookedEmails, dueCustomEmails, buildBookedEmail, sendBookedLeadEmails } from './bookedLeadEmails.js';
import { normalizeClientEmailSettings } from './clientEmailSettings.js';

const ALL_ON = normalizeClientEmailSettings({
  thankyou: { on: true }, upsell: { on: true, days: 21 }, prep: { on: true, days: 7 }, review: { on: true },
  google_review_url: 'https://g.page/r/example'
});
const NOW = new Date('2027-01-09T16:00:00Z');
const lead = (over = {}) => ({
  id: 'L1', name: 'Pat Lee', email: 'pat@example.com', stage: 'booked', event_date: '2027-01-30',
  start_time: '7:00 PM', event_location: 'Elm Grove', booked_at: '2026-12-01T15:00:00Z', followup_paused: false, ...over
});
const kinds = (list) => list.map(d => `${d.lead.id}:${d.kind}`);

describe('dueBookedEmails', () => {
  it('sends the upsell 21 days out', () => {
    expect(kinds(dueBookedEmails([lead()], ALL_ON, { now: NOW, today: '2027-01-09' }))).toEqual(['L1:upsell']);
  });

  it('sends the thank-you right after booking, and skips an upsell date already passed', () => {
    const fresh = lead({ booked_at: '2027-01-09T14:00:00Z', event_date: '2027-01-25' });
    expect(kinds(dueBookedEmails([fresh], ALL_ON, { now: NOW, today: '2027-01-09' }))).toEqual(['L1:thankyou']);
  });

  it('sends the get-ready email 7 days out and the review the Monday after', () => {
    expect(kinds(dueBookedEmails([lead()], ALL_ON, { now: NOW, today: '2027-01-23' }))).toEqual(['L1:prep']);
    expect(kinds(dueBookedEmails([lead()], ALL_ON, { now: NOW, today: '2027-02-01' }))).toEqual(['L1:review']);
  });

  it('skips sent, paused, unbooked, off and long-missed emails', () => {
    const today = '2027-01-09';
    expect(dueBookedEmails([lead()], ALL_ON, { now: NOW, today, sent: new Set(['L1:upsell']) })).toHaveLength(0);
    expect(dueBookedEmails([lead({ followup_paused: true })], ALL_ON, { now: NOW, today })).toHaveLength(0);
    expect(dueBookedEmails([lead({ stage: 'lost' })], ALL_ON, { now: NOW, today })).toHaveLength(0);
    expect(dueBookedEmails([lead()], normalizeClientEmailSettings(null), { now: NOW, today })).toHaveLength(0);
    expect(dueBookedEmails([lead()], ALL_ON, { now: NOW, today: '2027-01-20' })).toHaveLength(0);
  });
});

describe('buildBookedEmail', () => {
  it('fills in the client and escapes it', () => {
    const { subject, html } = buildBookedEmail('thankyou', lead({ name: '<i>Pat</i>' }), ALL_ON);
    expect(subject).toContain('Saturday, January 30');
    expect(html).toContain('Hi &lt;i&gt;Pat&lt;/i&gt;,');
    expect(html).toContain('Elm Grove');
  });

  it('only shows the links that are set', () => {
    const html = buildBookedEmail('review', lead(), ALL_ON).html;
    expect(html).toContain('https://g.page/r/example');
    expect(html).not.toContain('Leave a tip');
    expect(buildBookedEmail('upsell', lead(), ALL_ON).subject).toContain('3 weeks to go');
  });
});

describe('sendBookedLeadEmails', () => {
  const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', RESEND_API_KEY: 'r' };
  const fakeFetch = ({ resendOk = true } = {}) => {
    const calls = [];
    const fn = vi.fn(async (url, opts = {}) => {
      calls.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
      if (url.includes('/settings?')) return { ok: true, json: async () => [{ setting_key: 'client_emails', setting_value: JSON.stringify(ALL_ON) }] };
      if (url.includes('/leads?')) return { ok: true, json: async () => [lead()] };
      if (url.includes('/lead_emails_sent?select')) return { ok: true, json: async () => [] };
      if (url.includes('/lead_emails_sent?on_conflict')) return { ok: true, json: async () => [{ id: 'x' }] };
      if (url.includes('/lead_emails_sent?lead_id')) return { ok: true, json: async () => null };
      if (url.includes('resend')) return { ok: resendOk, status: resendOk ? 200 : 422 };
      return { ok: false, status: 404 };
    });
    fn.calls = calls;
    return fn;
  };

  it('claims, then sends with reply-to sales', async () => {
    const f = fakeFetch();
    const r = await sendBookedLeadEmails({ now: NOW, today: '2027-01-09', env, fetchImpl: f });
    expect(r.sent).toBe(1);
    const mail = f.calls.find(c => c.url.includes('resend')).body;
    expect(mail.reply_to).toBe('sales@vegasonwheels.com');
    expect(mail.from).toBe('Vegas on Wheels <sales@vegasonwheels.com>');
    expect(f.calls.find(c => c.url.includes('on_conflict')).body).toEqual([{ lead_id: 'L1', kind: 'upsell' }]);
  });

  it('gives the claim back when the email is refused', async () => {
    const f = fakeFetch({ resendOk: false });
    const r = await sendBookedLeadEmails({ now: NOW, today: '2027-01-09', env, fetchImpl: f });
    expect(r.sent).toBe(0);
    expect(f.calls.some(c => c.method === 'DELETE')).toBe(true);
  });
});

describe('custom wording', () => {
  it('uses the saved subject and message, with blanks filled in', () => {
    const s = normalizeClientEmailSettings({ upsell: { on: true, days: 21, subject: '{days_away} left, {first_name}', message: 'Hi {first_name},\n\n- **Add a DJ**' } });
    const e = buildBookedEmail('upsell', lead(), s, { today: '2027-01-09' });
    expect(e.subject).toBe('3 weeks left, Pat');
    expect(e.html).toContain('<strong>Add a DJ</strong>');
    expect(e.text).toContain('Hi Pat,');
  });

  it('can change just the subject and keep the built-in message', () => {
    const s = normalizeClientEmailSettings({ thankyou: { on: true, subject: 'Welcome aboard!' } });
    const e = buildBookedEmail('thankyou', lead(), s);
    expect(e.subject).toBe('Welcome aboard!');
    expect(e.html).toContain('Thank you for choosing Vegas on Wheels!');
  });
});

describe('custom emails', () => {
  const custom = (over = {}) => normalizeClientEmailSettings({ custom: [{ id: 'abcd1234', name: 'Check-in', on: true, trigger: 'before_event', days: 30, subject: 'Hi {first_name}', message: 'Party on {event_date}!', ...over }] });
  const due = (s, l, today, sent) => kinds(dueCustomEmails([l], s, { today, sent }));

  it('goes out N days before the event, once', () => {
    expect(due(custom(), lead(), '2026-12-31')).toEqual(['L1:custom:abcd1234']);
    expect(due(custom(), lead(), '2026-12-30')).toEqual([]);
    expect(due(custom(), lead(), '2027-01-04')).toEqual([]); // more than 3 days late
    expect(due(custom(), lead(), '2026-12-31', new Set(['L1:custom:abcd1234']))).toEqual([]);
    expect(due(custom(), lead({ booked_at: '2027-01-02T12:00:00Z' }), '2026-12-31')).toEqual([]);
  });

  it('handles after-event, after-booking and after-quote timing', () => {
    expect(due(custom({ trigger: 'after_event', days: 2 }), lead(), '2027-02-01')).toEqual(['L1:custom:abcd1234']);
    expect(due(custom({ trigger: 'after_booked', days: 0 }), lead({ booked_at: '2027-01-09T14:00:00Z' }), '2027-01-09')).toEqual(['L1:custom:abcd1234']);
    const quoted = lead({ stage: 'quoted', quoted_at: '2027-01-01T15:00:00Z', last_contact_at: '2027-01-05T15:00:00Z' });
    expect(due(custom({ trigger: 'after_quote', days: 3 }), quoted, '2027-01-08')).toEqual(['L1:custom:abcd1234']);
    expect(due(custom({ trigger: 'after_quote', days: 3 }), lead(), '2027-01-08')).toEqual([]); // booked, not quoted
  });

  it('skips emails that are off, empty or paused', () => {
    expect(due(custom({ on: false }), lead(), '2026-12-31')).toEqual([]);
    expect(due(custom({ message: '' }), lead(), '2026-12-31')).toEqual([]);
    expect(due(custom(), lead({ followup_paused: true }), '2026-12-31')).toEqual([]);
  });

  it('builds the email from the templates', () => {
    const e = buildBookedEmail('custom:abcd1234', lead(), custom(), { today: '2026-12-31' });
    expect(e.subject).toBe('Hi Pat');
    expect(e.text).toContain('Party on Saturday, January 30!');
  });
});
