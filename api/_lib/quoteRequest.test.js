import { describe, it, expect, vi } from 'vitest';
import { parseQuoteRequest, parseEventDate, handleQuoteRequest, allowedOrigins, leadEmailHtml, adminEmailFrom } from './quoteRequest.js';

const NOW = 1_800_000_000_000;
const good = {
  name: ' Pat  Lee ', email: 'PAT@Example.com', phone: '(414) 555-0100',
  company: 'Acme', event_date: '03/14/2027', start_time: '7:00 PM', guest_count: '120 guests',
  games: ['Blackjack', 'Craps', 'Blackjack'], services: 'DJ', message: 'Hi <b>there</b>',
  started_at: NOW - 60000, website: ''
};

describe('parseQuoteRequest', () => {
  it('cleans a good request', () => {
    const { lead } = parseQuoteRequest(good, NOW);
    expect(lead).toMatchObject({
      name: 'Pat  Lee', email: 'pat@example.com', phone: '(414) 555-0100', event_date: '2027-03-14',
      guest_count: 120, games: ['Blackjack', 'Craps'], services: ['DJ'], stage: 'new', source: 'website'
    });
  });

  it('requires name, email and phone', () => {
    expect(parseQuoteRequest({ ...good, name: '' }, NOW).error).toMatch(/name/);
    expect(parseQuoteRequest({ ...good, email: 'nope' }, NOW).error).toMatch(/email/);
    expect(parseQuoteRequest({ ...good, email: 'a@b.com,c@d.com' }, NOW).error).toMatch(/email/);
    expect(parseQuoteRequest({ ...good, phone: '12' }, NOW).error).toMatch(/phone/);
    expect(parseQuoteRequest(null, NOW).error).toBeTruthy();
  });

  it('flags bots: honeypot filled or sent too fast', () => {
    expect(parseQuoteRequest({ ...good, website: 'http://spam' }, NOW).spam).toBe(true);
    expect(parseQuoteRequest({ ...good, started_at: NOW - 500 }, NOW).spam).toBe(true);
  });
});

describe('parseEventDate', () => {
  it('reads both formats and rejects bad dates', () => {
    expect(parseEventDate('2027-03-14')).toBe('2027-03-14');
    expect(parseEventDate('3/4/2027')).toBe('2027-03-04');
    expect(parseEventDate('2027-02-30')).toBeNull();
    expect(parseEventDate('next spring')).toBeNull();
  });
});

describe('leadEmailHtml', () => {
  it('escapes what the visitor typed', () => {
    const { lead } = parseQuoteRequest(good, NOW);
    const html = leadEmailHtml(lead);
    expect(html).toContain('Hi &lt;b&gt;there&lt;/b&gt;');
    expect(html).not.toContain('<b>there</b>');
  });
});

function fakeRes() {
  const res = { headers: {}, statusCode: null, body: null };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.end = () => res;
  return res;
}

function fakeSupabase({ recent = [], client = [], insertError = null, adminEmail = 'boss@example.com' } = {}) {
  const inserted = [];
  const chain = (result) => {
    const q = {
      select: () => q, eq: () => q, gte: () => q, ilike: () => q, limit: async () => result,
      maybeSingle: async () => ({ data: adminEmail ? { setting_value: adminEmail } : null })
    };
    return q;
  };
  return {
    inserted,
    from: (table) => {
      if (table === 'leads') return { ...chain({ data: recent }), insert: async (rows) => { inserted.push(...rows); return { error: insertError }; } };
      if (table === 'clients') return chain({ data: client });
      return chain({ data: null });
    }
  };
}

const req = (body, extra = {}) => ({
  method: 'POST', body, headers: { origin: 'https://www.vegasonwheels.com', 'x-forwarded-for': '1.2.3.4' }, ...extra
});

describe('handleQuoteRequest', () => {
  const deps = (sb, more = {}) => ({
    supabase: sb, env: { RESEND_API_KEY: 'k' }, now: () => NOW, isRateLimited: () => false,
    fetchImpl: vi.fn(async () => ({ ok: true })), ...more
  });

  it('saves the lead, links an existing client and emails the admin', async () => {
    const sb = fakeSupabase({ client: [{ id: 42 }] });
    const d = deps(sb);
    const res = fakeRes();
    await handleQuoteRequest(req(good), res, d);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://www.vegasonwheels.com');
    expect(sb.inserted[0]).toMatchObject({ email: 'pat@example.com', client_id: 42 });
    const sent = JSON.parse(d.fetchImpl.mock.calls[0][1].body);
    expect(sent.to).toEqual(['boss@example.com']);
    expect(sent.reply_to).toBe('pat@example.com');
  });

  it('answers the browser preflight only for the Vegas on Wheels site', async () => {
    const ok = fakeRes();
    await handleQuoteRequest(req(null, { method: 'OPTIONS' }), ok, deps(fakeSupabase()));
    expect(ok.statusCode).toBe(204);
    const bad = fakeRes();
    await handleQuoteRequest(req(good, { headers: { origin: 'https://evil.example' } }), bad, deps(fakeSupabase()));
    expect(bad.statusCode).toBe(403);
  });

  it('ignores a repeat within minutes and quietly drops spam', async () => {
    const sb = fakeSupabase({ recent: [{ id: 'x' }] });
    const res = fakeRes();
    await handleQuoteRequest(req(good), res, deps(sb));
    expect(res.statusCode).toBe(200);
    expect(sb.inserted).toHaveLength(0);

    const sb2 = fakeSupabase();
    const res2 = fakeRes();
    await handleQuoteRequest(req({ ...good, website: 'x' }), res2, deps(sb2));
    expect(res2.body).toEqual({ ok: true });
    expect(sb2.inserted).toHaveLength(0);
  });

  it('rejects bad input and rate-limited callers', async () => {
    const res = fakeRes();
    await handleQuoteRequest(req({ ...good, email: 'x' }), res, deps(fakeSupabase()));
    expect(res.statusCode).toBe(400);
    const res2 = fakeRes();
    await handleQuoteRequest(req(good), res2, deps(fakeSupabase(), { isRateLimited: () => true }));
    expect(res2.statusCode).toBe(429);
  });

  it('still succeeds when the email fails', async () => {
    const sb = fakeSupabase();
    const res = fakeRes();
    await handleQuoteRequest(req(good), res, deps(sb, { fetchImpl: vi.fn(async () => { throw new Error('down'); }) }));
    expect(res.statusCode).toBe(200);
    expect(sb.inserted).toHaveLength(1);
  });
});

describe('allowedOrigins', () => {
  it('adds extra origins from the environment', () => {
    expect(allowedOrigins({ QUOTE_FORM_ORIGINS: 'https://staging.example.com' })).toContain('https://staging.example.com');
  });
});

describe('adminEmailFrom', () => {
  it('reads the address however the setting is stored', () => {
    expect(adminEmailFrom('boss@example.com')).toBe('boss@example.com');
    expect(adminEmailFrom('"boss@example.com"')).toBe('boss@example.com');
    expect(adminEmailFrom({ email: 'boss@example.com' })).toBe('boss@example.com');
    expect(adminEmailFrom(['boss@example.com'])).toBe('boss@example.com');
    expect(adminEmailFrom('')).toBe(null);
    expect(adminEmailFrom('a@b.com,c@d.com')).toBe(null);
  });
});

describe('handleQuoteRequest email errors', () => {
  it('keeps the lead and logs when Resend says no', async () => {
    const sb = fakeSupabase();
    const res = fakeRes();
    const errors = [];
    const orig = console.error; console.error = (m) => errors.push(String(m));
    try {
      await handleQuoteRequest(req(good), res, {
        supabase: sb, env: { RESEND_API_KEY: 'k' }, now: () => NOW, isRateLimited: () => false,
        fetchImpl: vi.fn(async () => ({ ok: false, status: 403, text: async () => 'domain not verified' }))
      });
    } finally { console.error = orig; }
    expect(res.statusCode).toBe(200);
    expect(sb.inserted).toHaveLength(1);
    expect(errors.join(' ')).toContain('Resend 403');
  });
});
