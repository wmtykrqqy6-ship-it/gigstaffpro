import { describe, it, expect } from 'vitest';
import { duePaymentEmails, buildBalanceEmail, buildLateEmail, sendPaymentReminders } from './paymentReminders.js';
import { normalizeClientEmailSettings } from './clientEmailSettings.js';

const ON = normalizeClientEmailSettings({ balance: { on: true, days: 3 }, late_alert: { on: true } });
const QID = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEF';
// Event Jan 30: balance due Jan 23, reminder from Jan 20.
const quote = (over = {}) => ({
  id: QID, lead_id: 'L1', client_id: null, status: 'accepted', name: 'Holiday party', event_date: '2027-01-30',
  start_time: '19:00', venue: 'Elm Grove', total: 0, deposit: 0, accepted_at: '2026-12-01T15:00:00Z', public_token: TOKEN,
  sent_snapshot: { name: 'Holiday party', total: 2000, deposit: 1000, contact: { name: 'Pat Lee', email: 'pat@example.com' } },
  ...over
});
const depositPaid = new Map([[QID, [{ kind: 'deposit', amount: 1000, status: 'paid' }]]]);
const leads = new Map([['L1', { id: 'L1', name: 'Pat Lee', email: 'pat@example.com', followup_paused: false }]]);

describe('duePaymentEmails', () => {
  it('reminds the client from 3 days before the balance is due until it is due', () => {
    expect(duePaymentEmails([quote()], depositPaid, ON, { today: '2027-01-19', leads }).reminders).toHaveLength(0);
    const due = duePaymentEmails([quote()], depositPaid, ON, { today: '2027-01-20', leads });
    expect(due.reminders).toHaveLength(1);
    expect(due.reminders[0].summary.owed).toBe(1000);
    expect(due.reminders[0].email).toBe('pat@example.com');
    expect(duePaymentEmails([quote()], depositPaid, ON, { today: '2027-01-23', leads }).reminders).toHaveLength(1);
    expect(duePaymentEmails([quote()], depositPaid, ON, { today: '2027-01-24', leads }).reminders).toHaveLength(0);
  });

  it('uses the signed amounts, not the quote row', () => {
    const due = duePaymentEmails([quote({ total: 5000, deposit: 2500 })], depositPaid, ON, { today: '2027-01-21', leads });
    expect(due.reminders[0].summary.total).toBe(2000);
  });

  it('skips paid in full, deposit not paid, clearing payments, paused leads, already sent, and off', () => {
    const paid = new Map([[QID, [{ kind: 'deposit', amount: 1000, status: 'paid' }, { kind: 'balance', amount: 1000, status: 'paid' }]]]);
    const clearing = new Map([[QID, [{ kind: 'deposit', amount: 1000, status: 'paid' }, { kind: 'balance', amount: 1000, status: 'pending' }]]]);
    const opts = { today: '2027-01-21', leads };
    expect(duePaymentEmails([quote()], paid, ON, opts).reminders).toHaveLength(0);
    expect(duePaymentEmails([quote()], new Map(), ON, opts).reminders).toHaveLength(0);
    expect(duePaymentEmails([quote()], clearing, ON, opts).reminders).toHaveLength(0);
    const paused = new Map([['L1', { id: 'L1', followup_paused: true }]]);
    expect(duePaymentEmails([quote()], depositPaid, ON, { today: '2027-01-21', leads: paused }).reminders).toHaveLength(0);
    expect(duePaymentEmails([quote()], depositPaid, ON, { ...opts, sent: new Set([`${QID}:balance`]) }).reminders).toHaveLength(0);
    expect(duePaymentEmails([quote()], depositPaid, normalizeClientEmailSettings({}), opts).reminders).toHaveLength(0);
    expect(duePaymentEmails([quote({ status: 'sent' })], depositPaid, ON, opts).reminders).toHaveLength(0);
  });

  it('flags a late deposit and a past-due balance for the team, once each', () => {
    // Signed Dec 1, nothing paid by Dec 5: deposit late.
    expect(duePaymentEmails([quote()], new Map(), ON, { today: '2026-12-05', leads }).late.map(l => l.kind)).toEqual(['deposit_late']);
    expect(duePaymentEmails([quote()], new Map(), ON, { today: '2026-12-04', leads }).late).toHaveLength(0);
    expect(duePaymentEmails([quote()], depositPaid, ON, { today: '2027-01-24', leads }).late.map(l => l.kind)).toEqual(['balance_late']);
    expect(duePaymentEmails([quote()], depositPaid, ON, { today: '2027-01-24', leads, sent: new Set([`${QID}:balance_late`]) }).late).toHaveLength(0);
    // Event over: nothing.
    expect(duePaymentEmails([quote()], depositPaid, ON, { today: '2027-01-31', leads }).late).toHaveLength(0);
  });
});

describe('emails', () => {
  it('balance reminder has the amount, due date and pay link', () => {
    const [r] = duePaymentEmails([quote()], depositPaid, ON, { today: '2027-01-20', leads }).reminders;
    const e = buildBalanceEmail({ ...r, payUrl: `https://quotes.vegasonwheels.com/q/${TOKEN}`, settings: ON });
    expect(e.subject).toBe('Your balance for Saturday, January 30 is due Saturday, January 23');
    expect(e.html).toContain('$1,000.00');
    expect(e.html).toContain(`href="https://quotes.vegasonwheels.com/q/${TOKEN}"`);
    expect(e.text).toContain('Hi Pat,');
  });

  it('leaves out the pay line without online payments', () => {
    const [r] = duePaymentEmails([quote()], depositPaid, ON, { today: '2027-01-20', leads }).reminders;
    const e = buildBalanceEmail({ ...r, payUrl: '', settings: ON });
    expect(e.html).not.toContain('Pay your balance online');
    expect(e.html).toContain('$1,000.00');
  });

  it('team note lists each late payment', () => {
    const late = duePaymentEmails([quote()], new Map(), ON, { today: '2026-12-05', leads }).late;
    const e = buildLateEmail(late);
    expect(e.subject).toBe('Deposit late: Holiday party');
    expect(e.text).toContain('Owed: $1,000.00 of $2,000.00');
  });
});

describe('sendPaymentReminders', () => {
  const env = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'k', RESEND_API_KEY: 'r', STRIPE_SECRET_KEY: 'sk_test_abc' };
  const fakeFetch = (log, { resendOk = true } = {}) => async (url, opts = {}) => {
    log.push({ url, method: opts.method || 'GET', body: opts.body });
    const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
    if (url.startsWith('https://api.resend.com')) return json({ id: 'em1' }, resendOk ? 200 : 500);
    if (url.includes('/settings?')) return json([{ setting_key: 'client_emails', setting_value: JSON.stringify({ balance: { on: true }, late_alert: { on: true } }) }, { setting_key: 'quote_settings', setting_value: { link_base: 'https://quotes.vegasonwheels.com' } }]);
    if (url.includes('/quotes?')) return json([quote()]);
    if (url.includes('/quote_emails_sent?select')) return json([]);
    if (url.includes('/quote_emails_sent?on_conflict')) return json([{ id: 'x' }]);
    if (url.includes('/quote_emails_sent?quote_id')) return json(null, 204);
    if (url.includes('/quote_payments?')) return json([{ quote_id: QID, kind: 'deposit', amount: 1000, status: 'paid' }]);
    if (url.includes('/leads?')) return json([{ id: 'L1', name: 'Pat Lee', email: 'pat@example.com', followup_paused: false }]);
    if (url.includes('/client_messages')) return json(null, 201);
    return json([]);
  };

  it('sends the reminder once, with the pay link, and saves it to Messages', async () => {
    const log = [];
    const r = await sendPaymentReminders({ today: '2027-01-21', env, fetchImpl: fakeFetch(log) });
    expect(r.sent).toBe(1);
    const mail = log.find(l => l.url.startsWith('https://api.resend.com'));
    const body = JSON.parse(mail.body);
    expect(body.to).toEqual(['pat@example.com']);
    expect(body.from).toContain('sales@vegasonwheels.com');
    expect(body.html).toContain(`https://quotes.vegasonwheels.com/q/${TOKEN}`);
    const claim = log.findIndex(l => l.url.includes('quote_emails_sent?on_conflict'));
    expect(claim).toBeGreaterThan(-1);
    expect(claim).toBeLessThan(log.indexOf(mail));
  });

  it('gives the claim back when the email fails', async () => {
    const log = [];
    const r = await sendPaymentReminders({ today: '2027-01-21', env, fetchImpl: fakeFetch(log, { resendOk: false }) });
    expect(r.sent).toBe(0);
    expect(r.errors).toHaveLength(1);
    expect(log.some(l => l.method === 'DELETE' && l.url.includes('quote_emails_sent?quote_id'))).toBe(true);
  });

  it('does nothing when both are off', async () => {
    const log = [];
    const offFetch = async (url) => ({ ok: true, status: 200, json: async () => (url.includes('/settings?') ? [] : []) });
    const r = await sendPaymentReminders({ today: '2027-01-21', env, fetchImpl: async (u, o) => { log.push(u); return offFetch(u, o); } });
    expect(r.message).toBe('Payment emails are off');
    expect(log).toHaveLength(1);
  });
});
