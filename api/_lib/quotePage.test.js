import { describe, it, expect, vi } from 'vitest';
import {
  buildSnapshot, parseQuoteSettings, quoteEmailHtml, quoteEmailText, quoteState, renderQuotePage, handleQuoteSend, handleQuotePage, newToken, TOKEN_REGEX, DEFAULT_TERMS
} from './quotePage.js';

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', RESEND_API_KEY: 'r' };
const NOW = new Date('2026-11-27T15:00:00Z');
const QID = '56761188-7520-42d8-8898-ff6fc54ce618';
const LID = '11111111-2222-4333-8444-555555555555';
const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345';

const items = [
  { key: 'blackjack', category: 'table', name: 'Blackjack Table', unit: 'table', price: 325, dealers: 1, taxable: true },
  { key: 'setup_fee', category: 'fee', name: 'Standard Delivery (Drop-Off)', unit: 'event', price: 350, taxable: true }
];
const quote = {
  id: QID, lead_id: LID, client_id: 7, status: 'draft', name: 'Smith party <b>', event_date: '2026-12-05', start_time: '19:00', end_time: '22:00',
  guest_count: 50, venue: 'Hall', address: '1 Main St', miles: 10, fundraiser: false, extra_hour_mode: 'ahead', tax_rate: 0.05, auto_off: [],
  lines: [{ id: 'l1', key: 'blackjack', category: 'table', name: 'Blackjack Table', unit: 'table', qty: 3, unit_price: 325, dealers: 1, taxable: true }]
};
const lead = { id: LID, name: 'Pat Smith', company: null, email: 'Pat@Example.com', phone: '555', stage: 'new' };

function fakeFetch(overrides = {}) {
  const calls = [];
  const fn = vi.fn(async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
    const json = (d, status = 200) => ({ ok: status < 300, status, json: async () => d });
    if (url.includes('/quotes?id=eq.') && (opts.method || 'GET') === 'GET') return json([overrides.quote || quote]);
    if (url.includes('/quotes?public_token=')) return json(overrides.byToken ? [overrides.byToken] : []);
    if (url.includes('/quotes?id=eq.') && opts.method === 'PATCH') return json(overrides.patched ?? [{ ...(overrides.byToken || quote), status: 'accepted', accepted_name: 'Pat Smith' }]);
    if (url.includes('/leads?id=eq.') && (opts.method || 'GET') === 'GET') return json([overrides.lead || lead]);
    if (url.includes('/leads?id=eq.')) return json(null, 204);
    if (url.includes('/price_items?')) return json(items);
    if (url.includes('/settings?')) return json([]);
    if (url.includes('/admin_email_signatures?')) return json([{ signature: 'Dylan', logo_url: null }]);
    if (url.includes('/client_messages?')) return json([{ id: 'm1' }]);
    if (url.includes('api.resend.com/emails')) return json({ id: 'sent-1' }, overrides.resendStatus || 200);
    return json(null, 404);
  });
  fn.calls = calls;
  return fn;
}

function fakeRes() {
  return { code: 0, html: '', headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, send(h) { this.html = h; return this; }, end() { return this; } };
}

describe('quote page helpers', () => {
  it('makes 32-character link codes', () => {
    const t = newToken();
    expect(TOKEN_REGEX.test(t)).toBe(true);
    expect(newToken()).not.toBe(t);
  });

  it('freezes the priced quote', () => {
    const s = buildSnapshot(quote, items, lead, NOW);
    expect(s.lines.map(l => l.name)).toEqual(['Blackjack Table', 'Standard Delivery (Drop-Off)']);
    expect(s).toMatchObject({ subtotal: 1325, tax: 66.25, total: 1391.25, deposit: 695.63, balance_due: '2026-11-28', dealers: 3 });
    expect(s.contact.email).toBe('Pat@Example.com');
  });

  it('reads quote settings with safe defaults', () => {
    expect(parseQuoteSettings(null).terms).toBe(DEFAULT_TERMS);
    expect(parseQuoteSettings('{"terms":"Pay on time","link_base":"https://quotes.vegasonwheels.com"}')).toEqual({ terms: 'Pay on time', link_base: 'https://quotes.vegasonwheels.com' });
    expect(parseQuoteSettings({ link_base: 'javascript:alert(1)' }).link_base).toBe('https://www.gigstaffpro.com');
  });

  it('lays out the email like the Goodshuffle one, escaped and unbranded', () => {
    const url = `https://www.gigstaffpro.com/q/${TOKEN}`;
    const html = quoteEmailHtml({ message: 'Hello Pat,\n\nSee <your> quote.', signature: 'Dylan\nSales', url, logo: 'javascript:x', snapshot: buildSnapshot(quote, items, lead, NOW) });
    expect(html.match(/>View Quote</g)).toHaveLength(2);
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain('See &lt;your&gt; quote.');
    expect(html).toContain('Smith party &lt;b&gt;');
    expect(html).toContain('$1,391.25');
    expect(html).toContain('Have Questions?');
    expect(html).toContain('535 S 93rd St');
    expect(html).toContain('vegasonwheels.com/wp-content');
    expect(html).not.toContain('javascript:');
    expect(html.split(url).join('')).not.toMatch(/gigstaff/i);
    expect(quoteEmailText('Hi\n\nSincerely,', url, 'Dylan')).toBe(`Hi\n\nSincerely,\n\nDylan\n\nView and accept your quote: ${url}`);
  });

  it('knows when a quote can be accepted', () => {
    const snap = { sent_snapshot: {} };
    expect(quoteState({ ...snap, status: 'sent', event_date: '2026-12-05' }, NOW)).toBe('open');
    expect(quoteState({ ...snap, status: 'sent', event_date: '2026-11-01' }, NOW)).toBe('expired');
    expect(quoteState({ ...snap, status: 'accepted' }, NOW)).toBe('accepted');
    expect(quoteState({ ...snap, status: 'cancelled' }, NOW)).toBe('closed');
    expect(quoteState({ status: 'sent' }, NOW)).toBe('missing');
  });

  it('escapes everything it shows', () => {
    const html = renderQuotePage({ quote: { sent_snapshot: buildSnapshot(quote, items, lead, NOW) }, settings: { terms: '<script>x</script>' }, state: 'open' });
    expect(html).not.toContain('<b>');
    expect(html).toContain('Smith party &lt;b&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Accept quote');
    expect(html).not.toMatch(/gigstaff/i);
  });
});

describe('handleQuoteSend', () => {
  it('prices, saves the snapshot and link, emails the lead and moves it to Quoted', async () => {
    const f = fakeFetch();
    const r = await handleQuoteSend({ body: { quoteId: QID, subject: 'Your quote', message: 'Hi Pat' }, adminUserId: LID, env, fetchImpl: f, now: NOW });
    expect(r.status).toBe(200);
    expect(r.body.url).toMatch(/^https:\/\/www\.gigstaffpro\.com\/q\/[A-Za-z0-9_-]{32}$/);
    const patch = f.calls.find(c => c.url.includes('/quotes?id=eq.') && c.method === 'PATCH').body;
    expect(patch).toMatchObject({ status: 'sent', total: 1391.25 });
    expect(TOKEN_REGEX.test(patch.public_token)).toBe(true);
    const email = f.calls.find(c => c.url.includes('api.resend.com')).body;
    expect(email.to).toEqual(['pat@example.com']);
    expect(email.text).toContain(r.body.url);
    expect(email.text).toContain('Dylan');
    expect(email.html).toContain(`href="${r.body.url}"`);
    const leadPatch = f.calls.find(c => c.url.includes('/leads?id=eq.') && c.method === 'PATCH').body;
    expect(leadPatch).toMatchObject({ stage: 'quoted', followup_sent_at: null });
  });

  it('keeps the same link when sent again and refuses accepted quotes', async () => {
    const f = fakeFetch({ quote: { ...quote, status: 'sent', public_token: TOKEN }, lead: { ...lead, stage: 'quoted' } });
    const r = await handleQuoteSend({ body: { quoteId: QID, subject: 'Updated', message: 'New version' }, env, fetchImpl: f, now: NOW });
    expect(r.body.url.endsWith(TOKEN)).toBe(true);
    expect(f.calls.find(c => c.url.includes('/leads?id=eq.') && c.method === 'PATCH').body.stage).toBeUndefined();
    const g = fakeFetch({ quote: { ...quote, status: 'accepted' } });
    expect((await handleQuoteSend({ body: { quoteId: QID, subject: 'x', message: 'y' }, env, fetchImpl: g, now: NOW })).status).toBe(409);
  });

  it('checks its input', async () => {
    const f = fakeFetch();
    expect((await handleQuoteSend({ body: { quoteId: 'nope', subject: 'x', message: 'y' }, env, fetchImpl: f })).status).toBe(400);
    expect((await handleQuoteSend({ body: { quoteId: QID, subject: 'a\nb', message: 'y' }, env, fetchImpl: f })).status).toBe(400);
    const noEmail = fakeFetch({ lead: { ...lead, email: '' } });
    expect((await handleQuoteSend({ body: { quoteId: QID, subject: 'x', message: 'y' }, env, fetchImpl: noEmail })).status).toBe(400);
  });
});

describe('handleQuotePage', () => {
  const sent = { ...quote, status: 'sent', public_token: TOKEN, sent_snapshot: buildSnapshot(quote, items, lead, NOW), viewed_at: null };
  const req = (method, body = {}, token = TOKEN) => ({ method, query: { token }, body, headers: {}, socket: { remoteAddress: '1.2.3.4' } });

  it('shows the quote and notes the first view', async () => {
    const f = fakeFetch({ byToken: sent });
    const res = fakeRes();
    await handleQuotePage(req('GET'), res, { env, fetchImpl: f, now: NOW });
    expect(res.code).toBe(200);
    expect(res.html).toContain('$1,391.25');
    expect(res.headers['Content-Security-Policy']).toMatch(/default-src 'none'/);
    expect(f.calls.some(c => c.method === 'PATCH' && c.body?.viewed_at)).toBe(true);
  });

  it('rejects bad or unknown codes', async () => {
    const res = fakeRes();
    await handleQuotePage(req('GET', {}, 'short'), res, { env, fetchImpl: fakeFetch(), now: NOW });
    expect(res.code).toBe(404);
    const res2 = fakeRes();
    await handleQuotePage(req('GET'), res2, { env, fetchImpl: fakeFetch(), now: NOW });
    expect(res2.code).toBe(404);
  });

  it('accepts with a name and gratuity, books the lead and tells the team', async () => {
    const f = fakeFetch({ byToken: sent });
    const res = fakeRes();
    await handleQuotePage(req('POST', { action: 'accept', name: ' Pat  Smith ', gratuity: '20', agree: 'yes' }), res, { env, fetchImpl: f, now: NOW });
    expect(res.code).toBe(200);
    const patch = f.calls.find(c => c.url.includes('status=eq.sent')).body;
    expect(patch).toMatchObject({ status: 'accepted', accepted_name: 'Pat Smith', gratuity_per_dealer: 20, total: 1451.25 });
    expect(patch.sent_snapshot.lines.at(-1)).toMatchObject({ name: 'Gratuity for dealers', qty: 3, amount: 60, taxable: false });
    expect(f.calls.find(c => c.url.includes('/leads?id=eq.') && c.method === 'PATCH').body.stage).toBe('booked');
    expect(f.calls.some(c => c.url.includes('api.resend.com'))).toBe(true);
  });

  it('needs a name and the box ticked, and never accepts twice', async () => {
    for (const body of [{ action: 'accept', name: '', agree: 'yes' }, { action: 'accept', name: 'Pat', agree: '' }, { action: 'accept', name: 'Pat', agree: 'yes', gratuity: '9999' }]) {
      const res = fakeRes();
      await handleQuotePage(req('POST', body), res, { env, fetchImpl: fakeFetch({ byToken: sent }), now: NOW });
      expect(res.code).toBe(400);
    }
    const res = fakeRes();
    await handleQuotePage(req('POST', { action: 'accept', name: 'Pat', agree: 'yes' }), res, { env, fetchImpl: fakeFetch({ byToken: { ...sent, status: 'accepted' } }), now: NOW });
    expect(res.code).toBe(409);
  });

  it('saves a question to Messages', async () => {
    const f = fakeFetch({ byToken: sent });
    const res = fakeRes();
    await handleQuotePage(req('POST', { action: 'question', message: 'Can we add roulette?' }), res, { env, fetchImpl: f, now: NOW });
    expect(res.code).toBe(200);
    const row = f.calls.find(c => c.url.includes('/client_messages?')).body[0];
    expect(row).toMatchObject({ direction: 'in', lead_id: LID, contact_email: 'pat@example.com', body_text: 'Can we add roulette?' });
  });
});
