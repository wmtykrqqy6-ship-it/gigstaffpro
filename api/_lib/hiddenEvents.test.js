import { describe, it, expect } from 'vitest';
import { handleHideEvent, handleUnhideEvent, handleListHiddenEvents } from './hiddenEvents.js';

const W = '11111111-1111-4111-8111-111111111111';
const E = '22222222-2222-4222-8222-222222222222';

// Minimal Supabase stand-in that records calls.
function fakeSupabase(rows = []) {
  const calls = [];
  const builder = (table) => {
    const q = { table, filters: {} };
    const api = {
      upsert(row, opts) { calls.push({ op: 'upsert', table, row, opts }); return Promise.resolve({ error: null }); },
      delete() { q.op = 'delete'; return api; },
      select() { q.op = 'select'; return api; },
      eq(col, val) {
        q.filters[col] = val;
        if (q.op === 'delete' && Object.keys(q.filters).length === 2) { calls.push({ op: 'delete', table, filters: { ...q.filters } }); return Promise.resolve({ error: null }); }
        if (q.op === 'select') return Promise.resolve({ data: rows.filter(r => r.worker_id === val), error: null });
        return api;
      }
    };
    return api;
  };
  return { from: builder, calls };
}

describe('hidden events actions', () => {
  it('hide upserts one row for the worker + event', async () => {
    const sb = fakeSupabase();
    const res = await handleHideEvent(sb, { workerId: W, eventId: E });
    expect(res.status).toBe(200);
    expect(sb.calls[0]).toMatchObject({ op: 'upsert', table: 'hidden_events', row: { worker_id: W, event_id: E } });
  });

  it('unhide deletes only that worker + event', async () => {
    const sb = fakeSupabase();
    await handleUnhideEvent(sb, { workerId: W, eventId: E });
    expect(sb.calls[0]).toEqual({ op: 'delete', table: 'hidden_events', filters: { worker_id: W, event_id: E } });
  });

  it('list returns only that worker\'s event ids', async () => {
    const sb = fakeSupabase([{ worker_id: W, event_id: E }, { worker_id: 'other', event_id: 'x' }]);
    const res = await handleListHiddenEvents(sb, { workerId: W });
    expect(res.body.eventIds).toEqual([E]);
  });

  it('rejects missing or malformed ids without touching the database', async () => {
    const sb = fakeSupabase();
    expect((await handleHideEvent(sb, { workerId: W })).status).toBe(400);
    expect((await handleUnhideEvent(sb, { workerId: 'nope', eventId: E })).status).toBe(400);
    expect((await handleListHiddenEvents(sb, {})).status).toBe(400);
    expect(sb.calls).toHaveLength(0);
  });
});
