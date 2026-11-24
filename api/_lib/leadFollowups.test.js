import { describe, it, expect, vi } from 'vitest';
import { dueLeads, buildFollowupEmail, firstName, fmtLeadDate, sendLeadFollowups } from './leadFollowups.js';

const NOW = new Date('2026-12-10T16:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();
const lead = (over = {}) => ({
  id: 'L1', name: 'Pat Lee', email: 'pat@example.com', stage: 'quoted',
  event_date: '2027-01-15', quoted_at: daysAgo(8), followup_sent_at: null, ...over
});

describe('dueLeads', () => {
  it('picks quoted leads 7 to 14 days old that have an email and no follow-up yet', () => {
    const leads = [
      lead(),
      lead({ id: 'young', quoted_at: daysAgo(6) }),
      lead({ id: 'old', quoted_at: daysAgo(20) }),
      lead({ id: 'sent', followup_sent_at: daysAgo(1) }),
      lead({ id: 'booked', stage: 'booked' }),
      lead({ id: 'noemail', email: null }),
      lead({ id: 'past', event_date: '2026-12-01' })
    ];
    expect(dueLeads(leads, NOW, '2026-12-10').map(l => l.id)).toEqual(['L1']);
  });
});

describe('buildFollowupEmail', () => {
  it('uses the first name and event date, and escapes them', () => {
    const { subject, html, text } = buildFollowupEmail(lead({ name: '<b>Pat</b> Lee' }));
    expect(subject).toBe('Still planning your casino party?');
    expect(html).toContain('Hi &lt;b&gt;Pat&lt;/b&gt;,');
    expect(html).toContain('Friday, January 15');
    expect(text).toContain('(262) 549-3559');
  });

  it('reads fine without a date or name', () => {
    expect(buildFollowupEmail(lead({ event_date: null })).html).toContain('the quote we sent. Are you');
    expect(firstName('')).toBe('there');
    expect(fmtLeadDate('soon')).toBe(null);
  });
});

function fakeFetch({ enabled = 'true', leads = [lead()], resendOk = true } = {}) {
  const calls = [];
  const fn = vi.fn(async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
    if (url.includes('/settings?')) return { ok: true, json: async () => [{ setting_key: 'lead_followup_enabled', setting_value: enabled }, { setting_key: 'lead_email', setting_value: 'boss@example.com' }] };
    if (url.includes('/leads?select=')) return { ok: true, json: async () => leads };
    if (url.includes('/leads?id=')) return { ok: true, json: async () => [{ id: 'L1' }] };
    if (url.includes('resend')) return { ok: resendOk, status: resendOk ? 200 : 422 };
    return { ok: false, status: 404 };
  });
  fn.calls = calls;
  return fn;
}

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', RESEND_API_KEY: 'r' };

describe('sendLeadFollowups', () => {
  it('does nothing while the setting is off', async () => {
    const f = fakeFetch({ enabled: 'false' });
    const r = await sendLeadFollowups({ now: NOW, env, fetchImpl: f });
    expect(r.sent).toBe(0);
    expect(f.calls.some(c => c.url.includes('resend'))).toBe(false);
  });

  it('claims, then emails with reply-to the admin', async () => {
    const f = fakeFetch();
    const r = await sendLeadFollowups({ now: NOW, today: '2026-12-10', env, fetchImpl: f });
    expect(r.sent).toBe(1);
    const claim = f.calls.find(c => c.method === 'PATCH');
    expect(claim.url).toContain('followup_sent_at=is.null');
    const mail = f.calls.find(c => c.url.includes('resend')).body;
    expect(mail.to).toEqual(['pat@example.com']);
    expect(mail.reply_to).toBe('boss@example.com');
  });

  it('undoes the claim when the email is refused', async () => {
    const f = fakeFetch({ resendOk: false });
    const r = await sendLeadFollowups({ now: NOW, today: '2026-12-10', env, fetchImpl: f });
    expect(r.sent).toBe(0);
    expect(r.errors).toHaveLength(1);
    const patches = f.calls.filter(c => c.method === 'PATCH');
    expect(patches[1].body).toEqual({ followup_sent_at: null });
  });
});
