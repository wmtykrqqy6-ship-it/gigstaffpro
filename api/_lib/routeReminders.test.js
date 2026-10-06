import { describe, it, expect } from 'vitest';
import {
  nextDate, reminderTargetDate, fmtTime, fmtDate, gearSummary, buildRouteReminder, sendRouteReminders
} from './routeReminders.js';

const TOMORROW = '2026-10-06';
const RUN = { id: 'r1', run_date: TOMORROW, truck_id: 'tB', worker1_id: 'w1', worker2_id: 'w2', notes: 'Dock B', is_personal: false };
const LOADS = [{ id: 'L1', run_id: 'r1', sequence: 1 }];
const STOPS = [
  { id: 's1', run_id: 'r1', load_id: 'L1', event_id: 'g', stop_type: 'deliver', sequence: 1, scheduled_start: '17:00', scheduled_end: '19:30' },
  { id: 's2', run_id: 'r1', load_id: null, event_id: 'g', stop_type: 'pickup', sequence: 2, scheduled_start: '22:30', scheduled_end: '23:00' }
];
const ALLOCS = [
  { load_id: 'L1', event_id: 'g', size_class: 'blackjack', quantity: 8 },
  { load_id: 'L1', event_id: 'g', size_class: 'craps', quantity: 2 },
  { load_id: 'L1', event_id: 'g', size_class: 'roulette', quantity: 2 },
  { load_id: 'L1', event_id: 'g', size_class: 'poker', quantity: 2 }
];
const GENEVA = { id: 'g', name: 'Kass - Grand Geneva Resort & Spa', date: TOMORROW, time: '19:30', end_time: '22:30', address: '7036 Grand Geneva Way, Lake Geneva, WI 53147', status: 'confirmed' };
const WORKERS = { w1: { id: 'w1', name: 'Dylan Finn', email: 'dylan@example.com' }, w2: { id: 'w2', name: 'William Finn', email: 'william@example.com' } };

describe('helpers', () => {
  it('nextDate crosses month ends', () => {
    expect(nextDate('2026-10-05')).toBe('2026-10-06');
    expect(nextDate('2026-10-31')).toBe('2026-11-01');
  });

  it('only targets tomorrow from 4 PM on', () => {
    expect(reminderTargetDate({ date: '2026-10-05', hour: 15 })).toBeNull();
    expect(reminderTargetDate({ date: '2026-10-05', hour: 16 })).toBe(TOMORROW);
    expect(reminderTargetDate({ date: '2026-10-05', hour: 23 })).toBe(TOMORROW);
  });

  it('formats times and dates', () => {
    expect(fmtTime('19:30')).toBe('7:30 PM');
    expect(fmtTime('00:15:00')).toBe('12:15 AM');
    expect(fmtDate(TOMORROW)).toBe('Tuesday, October 6');
  });

  it('summarizes the gear for one event on one trip', () => {
    expect(gearSummary(ALLOCS, 'L1', 'g')).toBe('2 Craps, 2 Roulette, 2 Poker, 8 Blackjack');
    expect(gearSummary(ALLOCS, 'L2', 'g')).toBe('');
  });
});

describe('buildRouteReminder', () => {
  const email = buildRouteReminder({
    run: RUN, truck: { name: 'Black' }, worker: WORKERS.w1, teammate: WORKERS.w2,
    stops: STOPS, loads: LOADS, allocations: ALLOCS, eventsById: { g: GENEVA }
  });

  it('subject names the truck and stop count', () => {
    expect(email.subject).toBe("🚚 Tomorrow's route: Black truck — 2 stops");
  });

  it('lists the stops in order with times, address, gear and the pickup note', () => {
    const t = email.text;
    expect(t).toMatch(/Hi Dylan Finn/);
    expect(t).toMatch(/Tuesday, October 6/);
    expect(t).toMatch(/with William Finn/);
    expect(t).toMatch(/Dock B/);
    expect(t.indexOf('1. Deliver')).toBeLessThan(t.indexOf('2. Pick up'));
    expect(t).toMatch(/5:00 PM – 7:30 PM/);
    expect(t).toMatch(/Bringing: 2 Craps, 2 Roulette, 2 Poker, 8 Blackjack/);
    expect(t).toMatch(/After the party \(ends 10:30 PM\)/);
    expect(email.html).toContain('https://www.google.com/maps/dir/?api=1&amp;destination=') ;
  });

  it('escapes names (no HTML injection from event names)', () => {
    const e = buildRouteReminder({
      run: RUN, truck: { name: 'Black' }, worker: { name: '<b>x</b>' }, stops: STOPS, loads: LOADS,
      allocations: [], eventsById: { g: { ...GENEVA, name: '<script>alert(1)</script>' } }
    });
    expect(e.html).not.toContain('<script>');
    expect(e.html).toContain('&lt;script&gt;');
  });

  it('personal vehicle wording and reload marker', () => {
    const e = buildRouteReminder({
      run: { ...RUN, is_personal: true, worker2_id: null }, truck: { name: 'Personal vehicle' }, worker: WORKERS.w1,
      stops: [
        STOPS[0],
        { id: 's3', run_id: 'r1', load_id: 'L2', event_id: 'g', stop_type: 'deliver', sequence: 2, scheduled_start: '18:00' }
      ],
      loads: [...LOADS, { id: 'L2', run_id: 'r1', sequence: 2 }], allocations: ALLOCS, eventsById: { g: GENEVA }
    });
    expect(e.subject).toBe("🚚 Tomorrow's route: personal vehicle — 2 stops");
    expect(e.text).toMatch(/you're on your own vehicle/);
    expect(e.text).toMatch(/Back to the warehouse to reload/);
  });
});

// Fake Supabase REST + Resend.
function fakeFetch({ sent = [], workers = Object.values(WORKERS), resendOk = true } = {}) {
  const calls = { resend: [], logged: [], paths: [] };
  const json = (data, status = 200) => Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(data) });
  const fetchImpl = (url, opts = {}) => {
    if (url.startsWith('https://api.resend.com')) {
      calls.resend.push(JSON.parse(opts.body));
      return json({ id: 'x' }, resendOk ? 200 : 500);
    }
    const path = url.split('/rest/v1/')[1];
    calls.paths.push(path.split('?')[0]);
    if (opts.method === 'POST') { calls.logged.push(JSON.parse(opts.body)); return json(null, 201); }
    if (path.startsWith('daily_runs')) return json([RUN]);
    if (path.startsWith('run_loads')) return json(LOADS);
    if (path.startsWith('run_stops')) return json(STOPS);
    if (path.startsWith('route_reminders_sent')) return json(sent);
    if (path.startsWith('load_allocations')) return json(ALLOCS);
    if (path.startsWith('events')) return json([GENEVA]);
    if (path.startsWith('workers')) return json(workers);
    if (path.startsWith('trucks')) return json([{ id: 'tB', name: 'Black' }]);
    return json([]);
  };
  return { fetchImpl, calls };
}
const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc', RESEND_API_KEY: 're' };
const AT_5PM = { date: '2026-10-05', hour: 17 };

describe('sendRouteReminders', () => {
  it('does nothing before 4 PM', async () => {
    const { fetchImpl, calls } = fakeFetch();
    const r = await sendRouteReminders({ now: { date: '2026-10-05', hour: 10 }, env: ENV, fetchImpl });
    expect(r.target).toBeNull();
    expect(calls.paths).toEqual([]);
  });

  it('also pushes to each crew member when push is wired in', async () => {
    const { fetchImpl } = fakeFetch();
    const pushed = [];
    await sendRouteReminders({ now: AT_5PM, env: ENV, fetchImpl, pushImpl: async (ids, n) => { pushed.push([ids[0], n.title]); } });
    expect(pushed).toHaveLength(2);
    expect(pushed[0][1]).toMatch(/^Tomorrow: you're on the .* truck$/);
  });

  it('emails each crew member once and logs it', async () => {
    const { fetchImpl, calls } = fakeFetch();
    const r = await sendRouteReminders({ now: AT_5PM, env: ENV, fetchImpl });
    expect(r).toMatchObject({ target: TOMORROW, runs: 1, sent: 2, errors: [] });
    expect(calls.resend.map(m => m.to[0])).toEqual(['dylan@example.com', 'william@example.com']);
    expect(calls.resend[0].text).toMatch(/with William Finn/);
    expect(calls.logged).toEqual([
      { run_id: 'r1', worker_id: 'w1', run_date: TOMORROW },
      { run_id: 'r1', worker_id: 'w2', run_date: TOMORROW }
    ]);
  });

  it('skips people already reminded and people without an email', async () => {
    const { fetchImpl, calls } = fakeFetch({
      sent: [{ run_id: 'r1', worker_id: 'w1' }],
      workers: [WORKERS.w1, { ...WORKERS.w2, email: null }]
    });
    const r = await sendRouteReminders({ now: AT_5PM, env: ENV, fetchImpl });
    expect(r.sent).toBe(0);
    expect(r.skipped).toBe(2);
    expect(calls.resend).toEqual([]);
  });

  it('does not log a send that failed (so the next hour retries)', async () => {
    const { fetchImpl, calls } = fakeFetch({ resendOk: false });
    const r = await sendRouteReminders({ now: AT_5PM, env: ENV, fetchImpl });
    expect(r.sent).toBe(0);
    expect(r.errors).toHaveLength(2);
    expect(calls.logged).toEqual([]);
  });

  it('refuses to run without its environment', async () => {
    const { fetchImpl, calls } = fakeFetch();
    const r = await sendRouteReminders({ now: AT_5PM, env: {}, fetchImpl });
    expect(r.message).toMatch(/not configured/);
    expect(calls.paths).toEqual([]);
  });
});
