import { describe, it, expect, vi } from 'vitest';
import { parseAddress, isForInbox, messageText, pickLead, handleInboundEmail, handleClientReply, replyHtml } from './clientMessages.js';

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', RESEND_API_KEY: 'r' };
const ID = '56761188-7520-42d8-8898-ff6fc54ce618';
const NOW = new Date('2026-12-01T15:00:00Z');

function fakeRes() {
  return { code: 0, data: null, status(c) { this.code = c; return this; }, json(d) { this.data = d; return this; } };
}

function fakeFetch({ email, emailStatus = 200, leads = [], clients = [], saved = [{ id: 'm1' }], resendOk = true, signature = null } = {}) {
  const calls = [];
  const fn = vi.fn(async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
    if (url.includes('/emails/receiving/')) return { ok: emailStatus === 200, status: emailStatus, json: async () => email };
    if (url.includes('/leads?select=')) return { ok: true, json: async () => leads };
    if (url.includes('/clients?select=')) return { ok: true, json: async () => clients };
    if (url.includes('/client_contacts?select=')) return { ok: true, json: async () => [] };
    if (url.includes('/client_messages?')) return { ok: true, json: async () => saved };
    if (url.includes('/leads?id=')) return { ok: true, status: 204, json: async () => null };
    if (url.includes('/settings?')) return { ok: true, json: async () => [] };
    if (url.includes('/admin_email_signatures?')) return { ok: true, json: async () => (signature ? [{ signature }] : []) };
    if (url.includes('api.resend.com/emails')) return { ok: resendOk, status: resendOk ? 200 : 422, json: async () => (resendOk ? { id: 'sent-1' } : { message: 'nope' }) };
    return { ok: false, status: 404, json: async () => null };
  });
  fn.calls = calls;
  return fn;
}

const inbound = (over = {}) => ({
  id: ID, from: 'Pat Smith <Pat@Example.com>', to: ['inbox@in.vegasonwheels.com'],
  subject: 'Re: Your quote', text: 'Yes, still planning!', html: '<p>Yes</p>', created_at: '2026-12-01T14:59:00Z', ...over
});
const req = (body, method = 'POST') => ({ method, body, headers: {}, socket: { remoteAddress: '1.2.3.4' } });
const event = { type: 'email.received', data: { email_id: ID } };

describe('helpers', () => {
  it('parses addresses', () => {
    expect(parseAddress('Pat Smith <Pat@Example.com>')).toEqual({ email: 'pat@example.com', name: 'Pat Smith' });
    expect(parseAddress('"Smith, Pat" <pat@example.com>')).toEqual({ email: 'pat@example.com', name: 'Smith, Pat' });
    expect(parseAddress('pat@example.com')).toEqual({ email: 'pat@example.com', name: '' });
    expect(parseAddress('not an email')).toBe(null);
  });

  it('knows mail meant for the inbox and reads its text', () => {
    expect(isForInbox(inbound())).toBe(true);
    expect(isForInbox(inbound({ to: ['someone@else.com'] }))).toBe(false);
    expect(messageText({ text: '', html: '<p>Hi<br>there</p>' })).toContain('Hi');
    expect(messageText({ text: 'a\r\nb' })).toBe('a\nb');
  });

  it('prefers an open lead', () => {
    expect(pickLead([{ id: 1, stage: 'lost' }, { id: 2, stage: 'quoted' }]).id).toBe(2);
    expect(pickLead([{ id: 1, stage: 'lost' }]).id).toBe(1);
    expect(pickLead([])).toBe(null);
  });

  it('escapes reply text', () => {
    expect(replyHtml('<b>hi</b>\nthere')).toContain('&lt;b&gt;hi&lt;/b&gt;<br>there');
  });
});

describe('handleInboundEmail', () => {
  it('saves a client email, links the lead and restarts its clock', async () => {
    const f = fakeFetch({ email: inbound(), leads: [{ id: 'L1', client_id: 7, name: 'Pat', stage: 'quoted' }] });
    const res = fakeRes();
    await handleInboundEmail(req(event), res, { env, fetchImpl: f, now: NOW });
    expect(res.code).toBe(200);
    expect(res.data).toMatchObject({ saved: true, matched: true });
    const row = f.calls.find(c => c.url.includes('/client_messages?')).body[0];
    expect(row).toMatchObject({ direction: 'in', lead_id: 'L1', client_id: 7, contact_email: 'pat@example.com', contact_name: 'Pat Smith', resend_id: `in:${ID}` });
    const patch = f.calls.find(c => c.method === 'PATCH');
    expect(patch.url).toContain('leads?id=eq.L1');
    expect(patch.body).toMatchObject({ followup_sent_at: null, last_contact_at: NOW.toISOString() });
  });

  it('keeps unknown senders unmatched', async () => {
    const f = fakeFetch({ email: inbound() });
    const res = fakeRes();
    await handleInboundEmail(req(event), res, { env, fetchImpl: f, now: NOW });
    expect(res.data).toMatchObject({ saved: true, matched: false });
    expect(f.calls.some(c => c.method === 'PATCH')).toBe(false);
  });

  it('ignores forged ids, other addresses and our own mail', async () => {
    for (const [opts, why] of [[{ emailStatus: 404 }, 'unknown'], [{ email: inbound({ to: ['x@y.com'] }) }, 'address'], [{ email: inbound({ from: 'sales@vegasonwheels.com' }) }, 'sender']]) {
      const f = fakeFetch(opts);
      const res = fakeRes();
      await handleInboundEmail(req(event), res, { env, fetchImpl: f, now: NOW });
      expect(res.data.ignored).toBe(why);
      expect(f.calls.some(c => c.url.includes('/client_messages'))).toBe(false);
    }
  });

  it('rejects bad calls', async () => {
    const res = fakeRes();
    await handleInboundEmail(req({ type: 'email.received', data: { email_id: '../x' } }), res, { env, fetchImpl: fakeFetch() });
    expect(res.code).toBe(400);
    const res2 = fakeRes();
    await handleInboundEmail(req({}, 'GET'), res2, { env, fetchImpl: fakeFetch() });
    expect(res2.code).toBe(405);
  });
});

describe('handleClientReply', () => {
  it('sends from sales@, saves it and counts as contact', async () => {
    const f = fakeFetch();
    const r = await handleClientReply({ body: { to: 'pat@example.com', subject: 'Re: quote', text: 'Hi Pat', leadId: '11111111-2222-3333-4444-555555555555' }, adminUserId: 'a1', env, fetchImpl: f, now: NOW });
    expect(r.status).toBe(200);
    const mail = f.calls.find(c => c.url === 'https://api.resend.com/emails').body;
    expect(mail.from).toBe('Vegas on Wheels <sales@vegasonwheels.com>');
    expect(mail.reply_to).toBe('sales@vegasonwheels.com');
    const row = f.calls.find(c => c.url.includes('/client_messages?')).body[0];
    expect(row).toMatchObject({ direction: 'out', kind: 'reply', resend_id: 'out:sent-1', sent_by: 'a1' });
    expect(f.calls.some(c => c.method === 'PATCH')).toBe(true);
  });

  it("adds the rep's signature to the email and the saved copy", async () => {
    const f = fakeFetch({ signature: 'Sam Lee\nSales, Vegas on Wheels' });
    const admin = '99999999-8888-7777-6666-555555555555';
    const r = await handleClientReply({ body: { to: 'pat@example.com', subject: 'Re: quote', text: 'Hi Pat' }, adminUserId: admin, env, fetchImpl: f, now: NOW });
    expect(r.status).toBe(200);
    expect(f.calls.find(c => c.url.includes('/admin_email_signatures?')).url).toContain(`admin_user_id=eq.${admin}`);
    const mail = f.calls.find(c => c.url === 'https://api.resend.com/emails').body;
    expect(mail.text).toBe('Hi Pat\n\nSam Lee\nSales, Vegas on Wheels');
    expect(mail.html).toContain('Sam Lee<br>Sales, Vegas on Wheels');
    expect(mail.from).toBe('Vegas on Wheels <sales@vegasonwheels.com>');
    expect(f.calls.find(c => c.url.includes('/client_messages?')).body[0].body_text).toBe(mail.text);
  });

  it('checks its input', async () => {
    const f = fakeFetch();
    expect((await handleClientReply({ body: { to: 'bad', subject: 's', text: 't' }, env, fetchImpl: f })).status).toBe(400);
    expect((await handleClientReply({ body: { to: 'a@b.com', subject: 'a\nb', text: 't' }, env, fetchImpl: f })).status).toBe(400);
    expect((await handleClientReply({ body: { to: 'a@b.com', subject: 's', text: '  ' }, env, fetchImpl: f })).status).toBe(400);
  });
});
