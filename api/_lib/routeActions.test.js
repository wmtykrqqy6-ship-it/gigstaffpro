import { describe, it, expect } from 'vitest';
import { businessNow, routeAccessError, handleRouteCheck, handleRouteStopStatus } from './routeActions.js';

const RUN = { run_date: '2026-10-06', worker1_id: 'w1', worker2_id: 'w2' };
const DAY = { date: '2026-10-06', yesterday: '2026-10-05', hour: 14 };

describe('businessNow', () => {
  it('uses Chicago time, not UTC', () => {
    // 03:30 UTC on Oct 7 is 10:30 PM CDT on Oct 6.
    expect(businessNow(new Date('2026-10-07T03:30:00Z'))).toEqual({ date: '2026-10-06', yesterday: '2026-10-05', hour: 22 });
  });

  it('handles month boundaries for yesterday', () => {
    expect(businessNow(new Date('2026-11-01T15:00:00Z')).yesterday).toBe('2026-10-31');
  });
});

describe('routeAccessError', () => {
  it('allows either team member on the run day', () => {
    expect(routeAccessError({ run: RUN, workerId: 'w1', now: DAY })).toBeNull();
    expect(routeAccessError({ run: RUN, workerId: 'w2', now: DAY })).toBeNull();
  });

  it('rejects someone not on the team', () => {
    expect(routeAccessError({ run: RUN, workerId: 'w9', now: DAY })).toMatch(/not on this truck/);
    expect(routeAccessError({ run: RUN, workerId: null, now: DAY })).toMatch(/not on this truck/);
  });

  it('allows late-night pickups until 6 AM the next day, then closes', () => {
    expect(routeAccessError({ run: RUN, workerId: 'w1', now: { date: '2026-10-07', yesterday: '2026-10-06', hour: 1 } })).toBeNull();
    expect(routeAccessError({ run: RUN, workerId: 'w1', now: { date: '2026-10-07', yesterday: '2026-10-06', hour: 6 } })).toMatch(/day of the route/);
  });

  it('rejects other days', () => {
    expect(routeAccessError({ run: RUN, workerId: 'w1', now: { date: '2026-10-05', yesterday: '2026-10-04', hour: 12 } })).toMatch(/day of the route/);
  });

  it('reports a missing stop', () => {
    expect(routeAccessError({ run: null, workerId: 'w1', now: DAY })).toBe('Stop not found');
  });
});

// Minimal Supabase stand-in: records writes, returns a canned stop.
function fakeSupabase(stop) {
  const calls = [];
  const builder = (table) => {
    const q = { table, filters: {}, op: null, payload: null };
    const api = {
      select() { return api; },
      eq(col, val) { q.filters[col] = val; return api; },
      maybeSingle: async () => ({ data: stop, error: null }),
      single: async () => ({ data: q.payload?.[0] || null, error: null }),
      delete() { q.op = 'delete'; calls.push(q); return api; },
      update(p) { q.op = 'update'; q.payload = p; calls.push(q); return api; },
      upsert(rows, opts) { q.op = 'upsert'; q.payload = rows; q.opts = opts; calls.push(q); return api; },
      then(resolve) { resolve({ data: null, error: null }); }
    };
    return api;
  };
  return { from: builder, calls };
}

const pickupStop = { id: 's1', run_id: 'r1', stop_type: 'pickup', event_id: 'e1', daily_runs: RUN };

describe('handleRouteCheck', () => {
  it('upserts a returned check for a team member', async () => {
    const sb = fakeSupabase(pickupStop);
    const r = await handleRouteCheck(sb, { workerId: 'w1', stopId: 's1', itemKey: '|chip trays', itemName: 'Chip Trays', quantity: 3, expected: 5 }, DAY);
    expect(r.status).toBe(200);
    const write = sb.calls.find(c => c.op === 'upsert');
    expect(write.payload[0]).toMatchObject({ stop_id: 's1', check_type: 'returned', quantity: 3, expected: 5, checked_by_worker_id: 'w1' });
    expect(write.opts).toEqual({ onConflict: 'stop_id,item_key,check_type' });
  });

  it('unchecking deletes the row', async () => {
    const sb = fakeSupabase(pickupStop);
    const r = await handleRouteCheck(sb, { workerId: 'w2', stopId: 's1', itemKey: 'k', itemName: 'X', checked: false }, DAY);
    expect(r.body.removed).toBe(true);
    expect(sb.calls[0]).toMatchObject({ op: 'delete', filters: { stop_id: 's1', item_key: 'k', check_type: 'returned' } });
  });

  it('refuses outsiders, work stops, and bad quantities without writing', async () => {
    let sb = fakeSupabase(pickupStop);
    expect((await handleRouteCheck(sb, { workerId: 'w9', stopId: 's1', itemKey: 'k', itemName: 'X', quantity: 1, expected: 1 }, DAY)).status).toBe(403);
    sb = fakeSupabase({ ...pickupStop, stop_type: 'work' });
    expect((await handleRouteCheck(sb, { workerId: 'w1', stopId: 's1', itemKey: 'k', itemName: 'X', quantity: 1, expected: 1 }, DAY)).status).toBe(400);
    sb = fakeSupabase(pickupStop);
    expect((await handleRouteCheck(sb, { workerId: 'w1', stopId: 's1', itemKey: 'k', itemName: 'X', quantity: -1, expected: 1 }, DAY)).status).toBe(400);
    expect(sb.calls).toEqual([]);
  });

  it('404s an unknown stop', async () => {
    const sb = fakeSupabase(null);
    expect((await handleRouteCheck(sb, { workerId: 'w1', stopId: 'nope', itemKey: 'k', itemName: 'X', quantity: 1, expected: 1 }, DAY)).status).toBe(404);
  });
});

describe('handleRouteStopStatus', () => {
  it('marks a stop done', async () => {
    const sb = fakeSupabase(pickupStop);
    const r = await handleRouteStopStatus(sb, { workerId: 'w1', stopId: 's1', status: 'done' }, DAY);
    expect(r.status).toBe(200);
    expect(sb.calls[0]).toMatchObject({ op: 'update', filters: { id: 's1' } });
    expect(sb.calls[0].payload.status).toBe('done');
  });

  it('rejects unknown statuses', async () => {
    const sb = fakeSupabase(pickupStop);
    expect((await handleRouteStopStatus(sb, { workerId: 'w1', stopId: 's1', status: 'teleported' }, DAY)).status).toBe(400);
  });
});
