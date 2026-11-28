import { describe, it, expect, vi } from 'vitest';
import { encodeForm, nextOnlinePayment, checkoutParams, paymentRowFromSession, recordSession, handleStripeWebhook, stripeEnabled } from './stripePay.js';
import { buildSnapshot, handleQuotePage } from './quotePage.js';

const QID = '56761188-7520-42d8-8898-ff6fc54ce618';
const LID = '11111111-2222-4333-8444-555555555555';
const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345';
const NOW = new Date('2026-11-27T15:00:00Z');
const SID = 'cs_test_a1B2c3D4e5F6g7H8i9J0';
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', STRIPE_SECRET_KEY: 'sk_test_abc123' };

const items = [{ key: 'blackjack', category: 'table', name: 'Blackjack Table', unit: 'table', price: 325, dealers: 1, taxable: true }];
const draft = {
  id: QID, lead_id: LID, client_id: 7, status: 'draft', name: 'Smith party', event_date: '2026-12-20', start_time: '19:00', end_time: '22:00',
  guest_count: 50, venue: 'Hall', address: '1 Main St', miles: 10, fundraiser: false, extra_hour_mode: 'ahead', tax_rate: 0.05, auto_off: [],
  lines: [{ id: 'l1', key: 'blackjack', category: 'table', name: 'Blackjack Table', unit: 'table', qty: 2, unit_price: 500, dealers: 1, taxable: true }]
};
const lead = { id: LID, name: 'Pat Smith', email: 'pat@example.com' };
const snapshot = buildSnapshot(draft, items, lead, NOW); // total 1050, deposit 525
const accepted = { ...draft, status: 'accepted', public_token: TOKEN, sent_snapshot: snapshot, accepted_at: '2026-11-27T14:00:00Z', viewed_at: NOW.toISOString(), total: snapshot.total, deposit: snapshot.deposit };

const session = (over = {}) => ({
  id: SID, object: 'checkout.session', status: 'complete', payment_status: 'paid', amount_total: 52500, livemode: false,
  created: 1795791600, metadata: { quote_id: QID, kind: 'deposit' }, payment_method_types: ['card', 'us_bank_account'], url: 'https://checkout.stripe.com/c/pay/cs_test_x', ...over
});

function fakeFetch({ payments = [], existing = [], sessionObj = session(), event = null } = {}) {
  const calls = [];
  const fn = vi.fn(async (url, opts = {}) => {
    const method = opts.method || 'GET';
    calls.push({ url, method, body: opts.body, headers: opts.headers || {} });
    const json = (d, status = 200) => ({ ok: status < 300, status, json: async () => d });
    if (url.includes('/quotes?public_token=')) return json([accepted]);
    if (url.includes('/quotes?id=eq.')) return json(null, 204);
    if (url.includes('/settings?')) return json([]);
    if (url.includes('/quote_payments?quote_id=')) return json(payments);
    if (url.includes('/quote_payments?provider_ref=')) return json(existing);
    if (url.includes('/quote_payments') && method !== 'GET') return json(null, 201);
    if (url === 'https://api.stripe.com/v1/checkout/sessions' && method === 'POST') return json(sessionObj);
    if (url.startsWith('https://api.stripe.com/v1/checkout/sessions/')) return json(sessionObj);
    if (url.startsWith('https://api.stripe.com/v1/events/')) return event ? json(event) : json({ error: { code: 'resource_missing' } }, 404);
    return json(null, 404);
  });
  fn.calls = calls;
  return fn;
}

function fakeRes() {
  return { code: 0, html: '', body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, send(h) { this.html = h; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
}
const req = (method, { body = {}, query = {} } = {}) => ({ method, query: { token: TOKEN, ...query }, body, headers: {}, socket: { remoteAddress: '9.9.9.9' } });

describe('stripe helpers', () => {
  it('encodes nested forms the way Stripe wants', () => {
    expect(encodeForm({ a: 1, b: { c: 'x y' }, d: ['p', 'q'], e: [{ f: 2 }], skip: undefined }))
      .toBe('a=1&b%5Bc%5D=x%20y&d%5B0%5D=p&d%5B1%5D=q&e%5B0%5D%5Bf%5D=2');
  });

  it('knows when a key is set', () => {
    expect(stripeEnabled(env)).toBe(true);
    expect(stripeEnabled({})).toBe(false);
    expect(stripeEnabled({ STRIPE_SECRET_KEY: 'pk_test_x' })).toBe(false);
    expect(stripeEnabled({ STRIPE_SECRET_KEY: 'rk_live_x' })).toBe(true);
    expect(stripeEnabled({ STRIPE_SECRET_KEY: '  sk_test_x\n' })).toBe(true);
  });

  it('next payment: deposit, then balance, then nothing', () => {
    expect(nextOnlinePayment(accepted, [], '2026-11-27')).toMatchObject({ kind: 'deposit', amount: 525 });
    expect(nextOnlinePayment(accepted, [{ kind: 'deposit', amount: 525, status: 'paid' }], '2026-11-27')).toMatchObject({ kind: 'balance', amount: 525 });
    expect(nextOnlinePayment(accepted, [{ kind: 'deposit', amount: 1050, status: 'paid' }], '2026-11-27')).toMatchObject({ kind: null });
    expect(nextOnlinePayment({ ...accepted, status: 'sent' }, [])).toBe(null);
  });

  it('builds checkout params from the server-side amount', () => {
    const p = checkoutParams({ quote: accepted, snapshot, kind: 'deposit', amount: 525, pageUrl: 'https://quotes.vegasonwheels.com/q/' + TOKEN });
    expect(p.line_items[0].price_data.unit_amount).toBe(52500);
    expect(p.metadata).toEqual({ quote_id: QID, kind: 'deposit' });
    expect(p.customer_email).toBe('pat@example.com');
    expect(p.success_url).toBe(`https://quotes.vegasonwheels.com/q/${TOKEN}?paid={CHECKOUT_SESSION_ID}`);
    expect(p.payment_method_types).toEqual(['card', 'us_bank_account']);
  });

  it('turns a session into a payment row', () => {
    expect(paymentRowFromSession(session())).toMatchObject({ quote_id: QID, kind: 'deposit', amount: 525, method: 'card', status: 'paid', provider: 'stripe', provider_ref: SID, note: 'Stripe test mode' });
    expect(paymentRowFromSession(session({ payment_status: 'unpaid' }))).toMatchObject({ method: 'ach', status: 'pending' });
    expect(paymentRowFromSession(session(), { async: true })).toMatchObject({ method: 'ach', status: 'paid' });
    expect(paymentRowFromSession(session({ payment_status: 'unpaid' }), { failed: true, async: true })).toMatchObject({ status: 'failed' });
    expect(paymentRowFromSession(session({ status: 'open' }))).toBe(null);
    expect(paymentRowFromSession(session({ metadata: { quote_id: 'nope', kind: 'deposit' } }))).toBe(null);
    expect(paymentRowFromSession(session({ metadata: { quote_id: QID, kind: 'tip' } }))).toBe(null);
    expect(paymentRowFromSession(session({ id: 'pi_123' }))).toBe(null);
  });
});

describe('recordSession', () => {
  const callFrom = (f) => async (path, opts = {}) => {
    const r = await f(`https://x.supabase.co/rest/v1/${path}`, opts);
    if (!r.ok) { const e = new Error('x'); e.status = r.status; throw e; }
    return r.status === 201 || r.status === 204 ? null : r.json();
  };

  it('inserts once, upgrades pending to paid, never downgrades', async () => {
    let f = fakeFetch();
    expect(await recordSession({ call: callFrom(f), session: session() })).toMatchObject({ recorded: true, status: 'paid' });
    expect(f.calls.find(c => c.method === 'POST').url).toContain('on_conflict=provider_ref');

    f = fakeFetch({ existing: [{ id: 'p1', status: 'paid' }] });
    expect(await recordSession({ call: callFrom(f), session: session() })).toMatchObject({ recorded: false });
    expect(f.calls.some(c => c.method !== 'GET')).toBe(false);

    f = fakeFetch({ existing: [{ id: 'p1', status: 'pending' }] });
    expect(await recordSession({ call: callFrom(f), session: session(), async: true })).toMatchObject({ recorded: true, status: 'paid', updated: true });
    expect(JSON.parse(f.calls.find(c => c.method === 'PATCH').body).status).toBe('paid');

    f = fakeFetch({ existing: [{ id: 'p1', status: 'paid' }] });
    expect(await recordSession({ call: callFrom(f), session: session({ payment_status: 'unpaid' }) })).toMatchObject({ recorded: false, status: 'paid' });
  });
});

describe('handleStripeWebhook', () => {
  const call = vi.fn(async (path) => (path.includes('provider_ref') ? [] : null));

  it('fetches the event from Stripe and records it', async () => {
    const f = fakeFetch({ event: { id: 'evt_1234567890ab', type: 'checkout.session.completed', data: { object: session() } } });
    const res = fakeRes();
    await handleStripeWebhook({ method: 'POST', body: { id: 'evt_1234567890ab', type: 'checkout.session.completed', data: { object: { forged: true } } } }, res, { env, fetchImpl: f, call });
    expect(res.code).toBe(200);
    expect(f.calls[0].url).toBe('https://api.stripe.com/v1/events/evt_1234567890ab');
    expect(f.calls[0].headers.Authorization).toBe('Bearer sk_test_abc123');
    const insert = call.mock.calls.find(([p]) => p.startsWith('quote_payments?on_conflict'));
    expect(JSON.parse(insert[1].body)).toMatchObject({ provider_ref: SID, status: 'paid' });
  });

  it('ignores unknown events, bad ids and other events types', async () => {
    let res = fakeRes();
    await handleStripeWebhook({ method: 'POST', body: { id: 'evt_1234567890ab' } }, res, { env, fetchImpl: fakeFetch(), call });
    expect(res.body).toMatchObject({ ok: true, ignored: true });
    res = fakeRes();
    await handleStripeWebhook({ method: 'POST', body: { id: 'nope' } }, res, { env, fetchImpl: fakeFetch(), call });
    expect(res.code).toBe(400);
    res = fakeRes();
    await handleStripeWebhook({ method: 'POST', body: { id: 'evt_1234567890ab' } }, res, { env, fetchImpl: fakeFetch({ event: { type: 'charge.refunded', data: { object: {} } } }), call });
    expect(res.body).toMatchObject({ ignored: true });
    res = fakeRes();
    await handleStripeWebhook({ method: 'POST', body: { id: 'evt_1234567890ab' } }, res, { env: {}, fetchImpl: fakeFetch(), call });
    expect(res.code).toBe(503);
  });
});

describe('quote page payments', () => {
  it('shows a Pay deposit button on a signed quote', async () => {
    const res = fakeRes();
    await handleQuotePage(req('GET'), res, { env, fetchImpl: fakeFetch(), now: NOW });
    expect(res.code).toBe(200);
    expect(res.html).toContain('Pay $525.00 deposit to book');
    expect(res.html).toContain('Test mode');
    expect(res.headers['Content-Security-Policy']).toContain('form-action \'self\' https://checkout.stripe.com');
  });

  it('no button without a Stripe key or once paid in full', async () => {
    let res = fakeRes();
    await handleQuotePage(req('GET'), res, { env: { ...env, STRIPE_SECRET_KEY: '' }, fetchImpl: fakeFetch(), now: NOW });
    expect(res.html).not.toContain('Pay $');
    res = fakeRes();
    await handleQuotePage(req('GET'), res, { env, fetchImpl: fakeFetch({ payments: [{ kind: 'deposit', amount: 525, status: 'paid' }, { kind: 'balance', amount: 525, status: 'paid' }] }), now: NOW });
    expect(res.html).not.toContain('Pay $');
    expect(res.html).toContain('Paid in full');
  });

  it('Pay redirects to Stripe checkout for the amount the server works out', async () => {
    const f = fakeFetch({ payments: [{ kind: 'deposit', amount: 525, status: 'paid' }] });
    const res = fakeRes();
    await handleQuotePage(req('POST', { body: { action: 'pay', amount: '1' } }), res, { env, fetchImpl: f, now: NOW });
    expect(res.code).toBe(303);
    expect(res.headers.Location).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const create = f.calls.find(c => c.url === 'https://api.stripe.com/v1/checkout/sessions');
    expect(create.body).toContain('line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=52500');
    expect(create.body).toContain('metadata%5Bkind%5D=balance');
    expect(create.headers['Idempotency-Key']).toMatch(/^quote-/);
  });

  it('records the payment when the client comes back from Stripe', async () => {
    const f = fakeFetch();
    const res = fakeRes();
    await handleQuotePage(req('GET', { query: { paid: SID } }), res, { env, fetchImpl: f, now: NOW });
    expect(res.html).toContain('Your payment went through');
    const insert = f.calls.find(c => c.url.includes('quote_payments?on_conflict'));
    expect(JSON.parse(insert.body)).toMatchObject({ quote_id: QID, amount: 525, status: 'paid' });
  });

  it('ignores a session that belongs to another quote', async () => {
    const f = fakeFetch({ sessionObj: session({ metadata: { quote_id: '99999999-2222-4333-8444-555555555555', kind: 'deposit' } }) });
    const res = fakeRes();
    await handleQuotePage(req('GET', { query: { paid: SID } }), res, { env, fetchImpl: f, now: NOW });
    expect(f.calls.some(c => c.url.includes('quote_payments?on_conflict'))).toBe(false);
    expect(res.html).not.toContain('went through');
  });
});
