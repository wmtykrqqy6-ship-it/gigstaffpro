import { describe, it, expect } from 'vitest';
import {
  validCoords, meetingPointWindowOk, isHostPosition, canSetMeetingPoint, handleSetMeetingPoint, meetingPointUrl
} from './meetingPoint.js';

const W = '11111111-1111-4111-8111-111111111111';
const E = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const now = (date, yesterday, hour = 12) => ({ date, yesterday, hour });

describe('validCoords', () => {
  it('accepts real coordinates, rejects junk and 0,0', () => {
    expect(validCoords(42.58, -88.43)).toBe(true);
    expect(validCoords('42.58', '-88.43')).toBe(true);
    expect(validCoords(0, 0)).toBe(false);
    expect(validCoords(91, 0)).toBe(false);
    expect(validCoords('x', 1)).toBe(false);
  });
});

describe('meetingPointWindowOk', () => {
  it('day before and event day', () => {
    expect(meetingPointWindowOk('2026-10-06', now('2026-10-05', '2026-10-04'))).toBe(true);
    expect(meetingPointWindowOk('2026-10-06', now('2026-10-06', '2026-10-05'))).toBe(true);
  });
  it('early hours after a late party, not later', () => {
    expect(meetingPointWindowOk('2026-10-06', now('2026-10-07', '2026-10-06', 2))).toBe(true);
    expect(meetingPointWindowOk('2026-10-06', now('2026-10-07', '2026-10-06', 9))).toBe(false);
  });
  it('not weeks ahead', () => {
    expect(meetingPointWindowOk('2026-10-06', now('2026-10-01', '2026-09-30'))).toBe(false);
  });
  it('handles month boundaries', () => {
    expect(meetingPointWindowOk('2026-11-01', now('2026-10-31', '2026-10-30'))).toBe(true);
  });
});

describe('canSetMeetingPoint', () => {
  it('the confirmed Host can', () => {
    expect(isHostPosition('host')).toBe(true);
    expect(isHostPosition('Host')).toBe(true);
    expect(canSetMeetingPoint({ workerId: W, assignments: [{ worker_id: W, status: 'approved', position: 'host' }] })).toBe(true);
  });
  it('a Host who only applied or is on standby cannot', () => {
    expect(canSetMeetingPoint({ workerId: W, assignments: [{ worker_id: W, status: 'pending', position: 'host' }] })).toBe(false);
    expect(canSetMeetingPoint({ workerId: W, assignments: [{ worker_id: W, status: 'standby', position: 'host' }] })).toBe(false);
  });
  it('a dealer on the event cannot', () => {
    expect(canSetMeetingPoint({ workerId: W, assignments: [{ worker_id: W, status: 'approved', position: 'blackjack' }] })).toBe(false);
  });
  it('the truck crew stopping at the event can; another truck cannot', () => {
    expect(canSetMeetingPoint({ workerId: W, runs: [{ worker1_id: OTHER, worker2_id: W }] })).toBe(true);
    expect(canSetMeetingPoint({ workerId: W, runs: [{ worker1_id: OTHER, worker2_id: null }] })).toBe(false);
  });
});

// Minimal Supabase stand-in for the handler.
function fakeSupabase({ event, assignments = [], stops = [], workerName = 'William Finn', setByMissing = false }) {
  const updates = [];
  const from = (table) => {
    const q = { table };
    const api = {
      select() { return api; },
      eq() {
        if (table === 'assignments' && q.eqCount === 1) return Promise.resolve({ data: assignments, error: null });
        if (table === 'run_stops') return Promise.resolve({ data: stops, error: null });
        q.eqCount = (q.eqCount || 0) + 1;
        if (q.op === 'update') {
          updates.push(q.row);
          const missing = setByMissing && 'meeting_point_set_by_name' in q.row;
          return Promise.resolve({ error: missing ? { code: '42703', message: 'column meeting_point_set_by_name does not exist' } : null });
        }
        return api;
      },
      maybeSingle() {
        if (table === 'events') return Promise.resolve({ data: event, error: null });
        if (table === 'workers') return Promise.resolve({ data: { name: workerName }, error: null });
        return Promise.resolve({ data: null, error: null });
      },
      update(row) { q.op = 'update'; q.row = row; return api; }
    };
    return api;
  };
  return { from, updates };
}

describe('handleSetMeetingPoint', () => {
  const EVENT = { id: E, date: '2026-10-06', meeting_point_description: 'Old note' };
  const onDay = now('2026-10-06', '2026-10-05');

  it('saves the pin, keeps the old note when none is given, and records who set it', async () => {
    const sb = fakeSupabase({ event: EVENT, stops: [{ daily_runs: { worker1_id: W, worker2_id: OTHER } }] });
    const res = await handleSetMeetingPoint(sb, { workerId: W, eventId: E, lat: 42.58, lng: -88.43 }, onDay);
    expect(res.status).toBe(200);
    expect(sb.updates[0]).toMatchObject({
      meeting_point_lat: 42.58, meeting_point_lng: -88.43,
      meeting_point_url: meetingPointUrl(42.58, -88.43),
      meeting_point_description: 'Old note',
      meeting_point_set_by_name: 'William Finn'
    });
  });

  it('still saves the pin before the optional "set by" migration is run', async () => {
    const sb = fakeSupabase({ event: EVENT, setByMissing: true, assignments: [{ worker_id: W, status: 'approved', position: 'host' }] });
    const res = await handleSetMeetingPoint(sb, { workerId: W, eventId: E, lat: 42.58, lng: -88.43, description: 'North doors' }, onDay);
    expect(res.status).toBe(200);
    expect(sb.updates).toHaveLength(2);
    expect(sb.updates[1]).not.toHaveProperty('meeting_point_set_by_name');
    expect(sb.updates[1].meeting_point_description).toBe('North doors');
  });

  it('refuses a dealer, outside the window, and bad input', async () => {
    const dealer = fakeSupabase({ event: EVENT, assignments: [{ worker_id: W, status: 'approved', position: 'craps' }] });
    expect((await handleSetMeetingPoint(dealer, { workerId: W, eventId: E, lat: 42.5, lng: -88.4 }, onDay)).status).toBe(403);
    const early = fakeSupabase({ event: EVENT, assignments: [{ worker_id: W, status: 'approved', position: 'host' }] });
    expect((await handleSetMeetingPoint(early, { workerId: W, eventId: E, lat: 42.5, lng: -88.4 }, now('2026-10-01', '2026-09-30'))).status).toBe(403);
    expect((await handleSetMeetingPoint(early, { workerId: W, eventId: E, lat: 0, lng: 0 }, onDay)).status).toBe(400);
    expect(dealer.updates).toHaveLength(0);
    expect(early.updates).toHaveLength(0);
  });
});
