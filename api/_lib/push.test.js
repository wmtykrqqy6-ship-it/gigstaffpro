import { describe, it, expect } from 'vitest';
import {
  validSubscription, handleSavePushSubscription, handleRemovePushSubscription, sendPushToWorkers,
  inviteNotification, shiftReminderNotification, routeReminderNotification, testNotification, handleAdminPush, messageNotification, handleListMessages
} from './push.js';

const W1 = '11111111-1111-4111-8111-111111111111';
const W2 = '22222222-2222-4222-8222-222222222222';
const SUB = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'BPx_abc-123=', auth: 'xyz_789' } };

// Records every Supabase call; `subs` are the push_subscriptions rows.
function fakeSupabase(subs = []) {
  const calls = [];
  const from = (table) => {
    const q = { table, filters: [] };
    const done = (extra = {}) => { calls.push({ ...q, ...extra }); return Promise.resolve({ data: null, error: null }); };
    const api = {
      upsert(row, opts) { calls.push({ table, op: 'upsert', row, opts }); return Promise.resolve({ error: null }); },
      select() { q.op = 'select'; return api; },
      in(col, vals) { return Promise.resolve({ data: subs.filter(s => vals.includes(s.worker_id)), error: null }); },
      update(row) { q.op = 'update'; q.row = row; return api; },
      delete() { q.op = 'delete'; return api; },
      eq(col, val) {
        q.filters.push([col, val]);
        if (q.op === 'delete' && (q.filters.length === 2 || col === 'id')) return done();
        if (q.op === 'update') return done();
        return api;
      }
    };
    return api;
  };
  return { from, calls };
}

describe('validSubscription', () => {
  it('accepts a real-looking browser subscription', () => {
    expect(validSubscription(SUB)).toBe(true);
  });
  it('rejects junk, http endpoints and missing keys', () => {
    expect(validSubscription(null)).toBe(false);
    expect(validSubscription({ ...SUB, endpoint: 'http://evil.example/x' })).toBe(false);
    expect(validSubscription({ endpoint: SUB.endpoint, keys: { p256dh: 'a' } })).toBe(false);
    expect(validSubscription({ ...SUB, keys: { p256dh: 'has spaces', auth: 'x' } })).toBe(false);
  });
});

describe('save / remove subscription', () => {
  it('upserts by endpoint for the worker and sends a confirmation to that phone', async () => {
    const sb = fakeSupabase();
    const sent = [];
    const res = await handleSavePushSubscription(sb, { workerId: W1, subscription: SUB, userAgent: 'iPhone' }, { send: async (s, p) => sent.push([s.endpoint, JSON.parse(p).title]) });
    expect(sent).toEqual([[SUB.endpoint, 'Notifications are on 🎉']]);
    expect(res.status).toBe(200);
    expect(sb.calls[0]).toMatchObject({ op: 'upsert', row: { worker_id: W1, endpoint: SUB.endpoint, p256dh: SUB.keys.p256dh, auth: SUB.keys.auth }, opts: { onConflict: 'endpoint' } });
  });
  it('rejects bad input without touching the database', async () => {
    const sb = fakeSupabase();
    expect((await handleSavePushSubscription(sb, { workerId: 'nope', subscription: SUB })).status).toBe(400);
    expect((await handleSavePushSubscription(sb, { workerId: W1, subscription: {} })).status).toBe(400);
    expect((await handleRemovePushSubscription(sb, { workerId: W1 })).status).toBe(400);
    expect(sb.calls).toHaveLength(0);
  });
  it('remove only deletes that worker’s endpoint', async () => {
    const sb = fakeSupabase();
    await handleRemovePushSubscription(sb, { workerId: W1, endpoint: SUB.endpoint });
    expect(sb.calls[0]).toMatchObject({ op: 'delete', filters: [['worker_id', W1], ['endpoint', SUB.endpoint]] });
  });
});

describe('sendPushToWorkers', () => {
  const subs = [
    { id: 's1', worker_id: W1, endpoint: 'https://push/1', p256dh: 'k', auth: 'a' },
    { id: 's2', worker_id: W1, endpoint: 'https://push/2', p256dh: 'k', auth: 'a' },
    { id: 's3', worker_id: W2, endpoint: 'https://push/3', p256dh: 'k', auth: 'a' }
  ];

  it('sends to every phone of the chosen workers only', async () => {
    const sent = [];
    const r = await sendPushToWorkers(fakeSupabase(subs), [W1], { title: 'Hi' }, { send: async (s, p) => { sent.push([s.endpoint, JSON.parse(p).title]); } });
    expect(r).toMatchObject({ sent: 2, failed: 0, removed: 0 });
    expect(sent.map(s => s[0]).sort()).toEqual(['https://push/1', 'https://push/2']);
  });

  it('removes phones that are gone (410) and counts other failures', async () => {
    const sb = fakeSupabase(subs);
    const r = await sendPushToWorkers(sb, [W1, W2], { title: 'Hi' }, {
      send: async (s) => {
        if (s.endpoint.endsWith('/1')) throw Object.assign(new Error('gone'), { statusCode: 410 });
        if (s.endpoint.endsWith('/3')) throw Object.assign(new Error('boom'), { statusCode: 500 });
      }
    });
    expect(r).toMatchObject({ sent: 1, removed: 1, failed: 1 });
    expect(sb.calls.some(c => c.op === 'delete' && c.filters[0][1] === 's1')).toBe(true);
  });

  it('does nothing (and never throws) without keys or workers', async () => {
    const prevPub = process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PUBLIC_KEY;
    expect(await sendPushToWorkers(fakeSupabase(subs), [W1], { title: 'x' })).toMatchObject({ sent: 0, skipped: 'not-configured' });
    if (prevPub !== undefined) process.env.VAPID_PUBLIC_KEY = prevPub;
    expect(await sendPushToWorkers(fakeSupabase(subs), [], { title: 'x' }, { send: async () => {} })).toMatchObject({ sent: 0 });
  });
});

describe('notification text', () => {
  const EVENT = { id: 'e1', name: 'Grand Geneva Resort & Spa', date: '2026-10-06', time: '19:30' };
  it('invite', () => {
    expect(inviteNotification(EVENT, 'Blackjack')).toEqual({
      title: "You're invited: Grand Geneva Resort & Spa",
      body: 'Blackjack — Tue, Oct 6 · 7:30 PM · Tap to accept or decline',
      url: '/', tag: 'invite-e1'
    });
  });
  it('shift reminder', () => {
    expect(shiftReminderNotification(EVENT, 24).body).toBe('Starts in 24 hours · Tue, Oct 6 · 7:30 PM');
    expect(shiftReminderNotification(EVENT, 1).body).toBe('Starts in 1 hour · Tue, Oct 6 · 7:30 PM');
  });
  it('route reminder', () => {
    expect(routeReminderNotification({ vehicleLabel: 'on the Black truck', runDate: '2026-10-06', stopCount: 2 }))
      .toMatchObject({ title: "Tomorrow: you're on the Black truck", body: 'Tue, Oct 6 · 2 stops · Tap to see your route' });
  });
  it('test', () => {
    expect(testNotification().title).toMatch(/notifications are on/);
  });
});

describe('handleAdminPush', () => {
  const subs = [{ id: 's1', worker_id: W1, endpoint: 'https://push/1', p256dh: 'k', auth: 'a' }];
  const EVENT = { id: '33333333-3333-4333-8333-333333333333', name: 'Grand Geneva Resort & Spa', date: '2026-10-06', time: '19:30' };
  const withEvent = () => {
    const sb = fakeSupabase(subs);
    const from = sb.from;
    sb.from = (table) => table === 'events'
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: EVENT, error: null }) }) }) }
      : from(table);
    return sb;
  };

  it('invite: builds the text from the event and sends', async () => {
    const sent = [];
    const r = await handleAdminPush(withEvent(), { kind: 'invite', workerIds: [W1], eventId: EVENT.id, positionLabel: 'Craps' }, { send: async (s, p) => sent.push(JSON.parse(p)) });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, sent: 1 });
    expect(sent[0].title).toBe("You're invited: Grand Geneva Resort & Spa");
  });

  it('test push', async () => {
    const sent = [];
    const r = await handleAdminPush(fakeSupabase(subs), { kind: 'test', workerIds: [W1] }, { send: async (s, p) => sent.push(JSON.parse(p)) });
    expect(r.body.sent).toBe(1);
    expect(sent[0].tag).toBe('test');
  });

  it('rejects missing workers, bad kinds and invites without an event', async () => {
    expect((await handleAdminPush(fakeSupabase(), { kind: 'test', workerIds: [] })).status).toBe(400);
    expect((await handleAdminPush(fakeSupabase(), { kind: 'spam', workerIds: [W1] })).status).toBe(400);
    expect((await handleAdminPush(fakeSupabase(), { kind: 'invite', workerIds: [W1] })).status).toBe(400);
  });
});

describe('Message Staff push + status', () => {
  const subs = [
    { id: 's1', worker_id: W1, endpoint: 'https://push/1', p256dh: 'k', auth: 'a', last_success_at: '2026-10-05T10:00:00Z' },
    { id: 's2', worker_id: W1, endpoint: 'https://push/2', p256dh: 'k', auth: 'a', last_success_at: null },
    { id: 's3', worker_id: W2, endpoint: 'https://push/3', p256dh: 'k', auth: 'a', last_success_at: null }
  ];
  const withAll = () => {
    const sb = fakeSupabase(subs);
    const from = sb.from;
    sb.from = (table) => {
      const api = from(table);
      const select = api.select;
      api.select = (cols) => cols === 'worker_id, last_success_at' ? Promise.resolve({ data: subs, error: null }) : select(cols);
      return api;
    };
    return sb;
  };

  it('messageNotification uses the subject and trims long text', () => {
    const n = messageNotification('Parking change', 'Use the  north lot\ntonight.');
    expect(n.title).toBe('📣 Parking change');
    expect(n.body).toBe('Use the north lot tonight.');
    expect(messageNotification('x', '   ')).toBeNull();
    expect(messageNotification('', 'a'.repeat(400)).body).toHaveLength(298);
  });

  it('message push goes to the chosen workers', async () => {
    const sent = [];
    const r = await handleAdminPush(fakeSupabase(subs), { kind: 'message', workerIds: [W2], title: 'Hi', message: 'Team meeting' }, { send: async (s, p) => sent.push(JSON.parse(p).body) });
    expect(r.body.sent).toBe(1);
    expect(sent).toEqual(['Team meeting']);
    expect((await handleAdminPush(fakeSupabase(subs), { kind: 'message', workerIds: [W2], message: '' })).status).toBe(400);
  });

  it('status lists who has notifications on and on how many devices', async () => {
    const r = await handleAdminPush(withAll(), { kind: 'status' });
    expect(r.status).toBe(200);
    expect(r.body.workers[W1]).toEqual({ devices: 2, lastSuccessAt: '2026-10-05T10:00:00Z' });
    expect(r.body.workers[W2].devices).toBe(1);
  });
});

describe('worker inbox', () => {
  it('Message Staff saves a copy for every targeted worker, even without a phone set up', async () => {
    const inserted = [];
    const sb = fakeSupabase([]);
    const from = sb.from;
    sb.from = (table) => table === 'worker_messages'
      ? { insert: async (rows) => { inserted.push(...rows); return { error: null }; } }
      : from(table);
    const r = await handleAdminPush(sb, { kind: 'message', workerIds: [W1, W2], title: 'Time Change', message: 'Now 6-9' }, { send: async () => {} });
    expect(r.status).toBe(200);
    expect(inserted).toEqual([
      { worker_id: W1, title: '📣 Time Change', body: 'Now 6-9', kind: 'message', event_id: null },
      { worker_id: W2, title: '📣 Time Change', body: 'Now 6-9', kind: 'message', event_id: null }
    ]);
  });

  it('a missing inbox table does not stop the push', async () => {
    const sb = fakeSupabase([{ id: 's1', worker_id: W1, endpoint: 'https://push/1', p256dh: 'k', auth: 'a' }]);
    const from = sb.from;
    sb.from = (table) => table === 'worker_messages'
      ? { insert: async () => ({ error: { message: 'relation "worker_messages" does not exist' } }) }
      : from(table);
    const r = await handleAdminPush(sb, { kind: 'message', workerIds: [W1], title: 'x', message: 'y' }, { send: async () => {} });
    expect(r.body.sent).toBe(1);
  });

  it('tapping a message push opens the inbox', () => {
    expect(messageNotification('a', 'b').url).toBe('/?inbox=1');
  });

  it('listMessages returns that worker’s recent messages', async () => {
    const calls = [];
    const chain = {
      select: () => chain,
      eq: (c, v) => { calls.push(['eq', c, v]); return chain; },
      gte: (c) => { calls.push(['gte', c]); return chain; },
      order: () => chain,
      limit: async () => ({ data: [{ id: 'm1', title: 't', body: 'b' }], error: null })
    };
    const r = await handleListMessages({ from: () => chain }, { workerId: W1 });
    expect(r.body.messages).toHaveLength(1);
    expect(calls).toContainEqual(['eq', 'worker_id', W1]);
    expect((await handleListMessages({ from: () => chain }, {})).status).toBe(400);
  });
});

describe('messages about one event', () => {
  const EV = { id: '44444444-4444-4444-8444-444444444444', name: 'Grand Geneva Resort & Spa', date: '2026-10-06', time: '18:00' };
  const sbWith = (inserted, { rejectEventId = false } = {}) => {
    const sb = fakeSupabase([]);
    const from = sb.from;
    sb.from = (table) => {
      if (table === 'events') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: EV, error: null }) }) }) };
      if (table === 'worker_messages') return {
        insert: async (rows) => {
          if (rejectEventId && 'event_id' in rows[0]) return { error: { message: "Could not find the 'event_id' column" } };
          inserted.push(...rows); return { error: null };
        }
      };
      return from(table);
    };
    return sb;
  };

  it('names the event in the push and saves the event link', async () => {
    const inserted = [];
    await handleAdminPush(sbWith(inserted), { kind: 'message', workerIds: [W1], eventId: EV.id, title: 'Time Change', message: 'Time changed to 6-9' }, { send: async () => {} });
    expect(inserted[0]).toEqual({
      worker_id: W1, title: '📣 Time Change', kind: 'message', event_id: EV.id,
      body: 'Tue, Oct 6 · Grand Geneva Resort & Spa: Time changed to 6-9'
    });
  });

  it('still saves the message before the event_id column exists', async () => {
    const inserted = [];
    await handleAdminPush(sbWith(inserted, { rejectEventId: true }), { kind: 'message', workerIds: [W1], eventId: EV.id, title: 'x', message: 'y' }, { send: async () => {} });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).not.toHaveProperty('event_id');
  });
});
