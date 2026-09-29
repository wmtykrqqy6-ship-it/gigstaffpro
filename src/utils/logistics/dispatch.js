// ============================================
// DISPATCH BOARD LOGIC (pure)
// ============================================
// Everything the dispatch board computes from a day's data: per-load
// capacity, how much of each event is allocated to trucks, default stops,
// and conflict warnings. No Supabase here -- the board loads rows and hands
// them in, so this is fully unit-testable.
import { checkLoadCapacity, summarizeEquipment } from './capacity';
import { isAssignmentFilled } from '../positionHelpers';

// Size classes that can be allocated to a load (anything with a physical
// presence on the truck; accessories ride with their tables).
export const ALLOCATABLE_CLASSES = ['craps', 'roulette', 'poker', 'blackjack', 'chairs', 'archway', 'decor'];

export const CLASS_LABELS = {
  craps: 'Craps', roulette: 'Roulette', poker: 'Poker', blackjack: 'Blackjack',
  chairs: 'Chairs', archway: 'Archway', decor: 'Decor'
};

const dateOnly = (d) => (d ? String(d).split('T')[0] : '');
const emptyCounts = () => Object.fromEntries(ALLOCATABLE_CLASSES.map(c => [c, 0]));

// ---- Time helpers ---------------------------------------------------------
// Times are "HH:MM" (or "HH:MM:SS") strings, like events.time. Minutes since
// midnight of the run date. Pickups happen the same night, often after
// midnight, so a *stop* time before 5:00 AM is treated as the next morning.
export const LATE_NIGHT_CUTOFF = 5 * 60;

export function toMinutes(t) {
  if (!t) return null;
  const [h, m] = String(t).split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
}

export function stopWindow(stop) {
  let start = toMinutes(stop.scheduled_start);
  let end = toMinutes(stop.scheduled_end);
  if (start == null) return null;
  if (start < LATE_NIGHT_CUTOFF) start += 1440;
  if (end == null) end = start;
  else if (end < LATE_NIGHT_CUTOFF) end += 1440;
  if (end < start) end += 1440;
  return { start, end };
}

export function eventWindow(event) {
  const start = toMinutes(event?.time);
  if (start == null) return null;
  let end = toMinutes(event.end_time);
  if (end == null) end = start;
  if (end <= start && event.end_time) end += 1440; // ends after midnight
  return { start, end };
}

const overlaps = (a, b) => a && b && a.start < b.end && b.start < a.end;

export function formatMinutes(min) {
  if (min == null) return '';
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h >= 12 ? 'PM' : 'AM'}`;
}

// ---- Allocation math ------------------------------------------------------

// What an event needs moved, by size class (from its event_equipment rows).
export function requiredCounts(equipmentRows = []) {
  const counts = summarizeEquipment(equipmentRows);
  return Object.fromEntries(ALLOCATABLE_CLASSES.map(c => [c, counts[c] || 0]));
}

// Sum allocations (optionally only one event's) by size class.
export function allocatedCounts(allocations = [], eventId = null) {
  const counts = emptyCounts();
  for (const a of allocations) {
    if (eventId && a.event_id !== eventId) continue;
    if (a.size_class in counts) counts[a.size_class] += Number(a.quantity) || 0;
  }
  return counts;
}

// Compare required vs allocated for one event.
export function allocationStatus(required, allocated) {
  const remaining = {};
  const over = {};
  for (const c of ALLOCATABLE_CLASSES) {
    const diff = (required[c] || 0) - (allocated[c] || 0);
    if (diff > 0) remaining[c] = diff;
    if (diff < 0) over[c] = -diff;
  }
  const hasRequired = ALLOCATABLE_CLASSES.some(c => required[c] > 0);
  const anyAllocated = ALLOCATABLE_CLASSES.some(c => allocated[c] > 0);
  return {
    remaining,
    over,
    anyAllocated,
    complete: hasRequired && !Object.keys(remaining).length && !Object.keys(over).length
  };
}

export function formatCounts(counts) {
  return ALLOCATABLE_CLASSES
    .filter(c => counts[c] > 0)
    .map(c => `${counts[c]} ${CLASS_LABELS[c]}`)
    .join(', ');
}

// Capacity check for one load: sum of its allocations on its run's truck.
export function checkLoad(truck, loadAllocations) {
  return checkLoadCapacity(truck, allocatedCounts(loadAllocations));
}

// ---- Team / dealing -------------------------------------------------------

export const teamIds = (run) => [run?.worker1_id, run?.worker2_id].filter(Boolean);

// Filled assignments of these workers on events that day -> dealing windows.
export function dealingShifts(workerIds, assignments = [], eventsById = {}, date) {
  const ids = new Set(workerIds);
  const shifts = [];
  for (const a of assignments) {
    if (!ids.has(a.worker_id) || !isAssignmentFilled(a.status)) continue;
    const ev = eventsById[a.event_id];
    if (!ev || dateOnly(ev.date) !== date || ev.status === 'cancelled') continue;
    shifts.push({ workerId: a.worker_id, eventId: ev.id, position: a.position, window: eventWindow(ev), assignment: a });
  }
  return shifts;
}

// Default stops when an event is first added to a run: a delivery on the
// load, a pickup at the event's end time, and -- if a team member is already
// staffed on it -- a work stop covering the party (the truck stays parked).
export function defaultStopsForEvent(event, { teamDealing = false } = {}) {
  const stops = [{ stop_type: 'deliver', event_id: event.id, scheduled_start: null, scheduled_end: null }];
  if (teamDealing) {
    stops.push({ stop_type: 'work', event_id: event.id, scheduled_start: event.time || null, scheduled_end: event.end_time || null });
  }
  stops.push({ stop_type: 'pickup', event_id: event.id, scheduled_start: event.end_time || null, scheduled_end: null, onPickupList: true });
  return stops;
}

// ---- Conflicts ------------------------------------------------------------

// input: {
//   date: 'YYYY-MM-DD',
//   events: events on that date,
//   allEventsById: every event by id (to resolve team members' other shifts),
//   equipmentByEvent: { eventId: event_equipment[] },
//   trucks, runs, loads, allocations, stops, assignments,
//   workersById: { id: worker }
// }
// Returns [{ level: 'error'|'warning', code, message, runId?, eventId?, stopId?, loadId? }]
export function computeDayConflicts(input) {
  const {
    date, events = [], allEventsById = {}, equipmentByEvent = {}, trucks = [],
    runs = [], loads = [], allocations = [], stops = [], assignments = [], workersById = {}
  } = input;

  const out = [];
  const push = (level, code, message, ctx = {}) => out.push({ level, code, message, ...ctx });

  const trucksById = Object.fromEntries(trucks.map(t => [t.id, t]));
  const runsById = Object.fromEntries(runs.map(r => [r.id, r]));
  const loadsById = Object.fromEntries(loads.map(l => [l.id, l]));
  const eventsById = { ...allEventsById, ...Object.fromEntries(events.map(e => [e.id, e])) };
  const workerName = (id) => workersById[id]?.name || 'A team member';
  const truckName = (run) => trucksById[run?.truck_id]?.name || 'Truck';
  const eventName = (id) => eventsById[id]?.name || 'an event';

  const allocationsByLoad = {};
  for (const a of allocations) (allocationsByLoad[a.load_id] ||= []).push(a);
  const stopsByRun = {};
  for (const s of stops) (stopsByRun[s.run_id] ||= []).push(s);
  for (const list of Object.values(stopsByRun)) list.sort((a, b) => a.sequence - b.sequence);

  // 1. Per-load capacity.
  for (const load of loads) {
    const run = runsById[load.run_id];
    const truck = trucksById[run?.truck_id];
    if (!truck) continue;
    const result = checkLoad(truck, allocationsByLoad[load.id] || []);
    if (result.status === 'green') continue;
    for (const reason of result.reasons) {
      push(result.status === 'red' ? 'error' : 'warning', 'capacity', `${truck.name} trip ${load.sequence}: ${reason}`, { runId: run.id, loadId: load.id });
    }
  }

  // 2. Team composition, and nobody on two trucks.
  const runsByWorker = {};
  for (const run of runs) {
    const team = teamIds(run);
    if (team.length === 0) push('warning', 'no-team', `${truckName(run)} has no team assigned`, { runId: run.id });
    else if (team.length === 1) push('warning', 'short-team', `${truckName(run)} has only one team member`, { runId: run.id });
    for (const id of team) (runsByWorker[id] ||= []).push(run);
  }
  for (const [workerId, list] of Object.entries(runsByWorker)) {
    if (list.length > 1) {
      push('error', 'double-booked-driver', `${workerName(workerId)} is on ${list.map(truckName).join(' and ')}`, { runId: list[0].id });
    }
  }

  // 3. Per event that needs moving: allocation, delivery, pickup, timing.
  for (const ev of events) {
    if (ev.status === 'cancelled') continue;
    const rows = equipmentByEvent[ev.id] || [];
    const required = requiredCounts(rows);
    const allocated = allocatedCounts(allocations, ev.id);
    const status = allocationStatus(required, allocated);
    const needsTruck = ALLOCATABLE_CLASSES.some(c => required[c] > 0);
    const evStops = stops.filter(s => s.event_id === ev.id);
    const window = eventWindow(ev);

    if (needsTruck && !status.anyAllocated && !evStops.length) {
      push('error', 'no-truck', `${ev.name} has no truck assigned`, { eventId: ev.id });
      continue;
    }
    if (needsTruck && Object.keys(status.remaining).length) {
      push('warning', 'unallocated', `${ev.name}: not on a truck yet — ${formatCounts(status.remaining)}`, { eventId: ev.id });
    }
    if (Object.keys(status.over).length) {
      push('warning', 'over-allocated', `${ev.name}: more loaded than the pull sheet lists — ${formatCounts(status.over)} extra`, { eventId: ev.id });
    }

    // Every run carrying this event's gear should deliver it.
    const runsCarrying = new Set(
      allocations.filter(a => a.event_id === ev.id && a.quantity > 0).map(a => loadsById[a.load_id]?.run_id).filter(Boolean)
    );
    for (const runId of runsCarrying) {
      if (!evStops.some(s => s.run_id === runId && s.stop_type === 'deliver')) {
        push('warning', 'no-delivery-stop', `${truckName(runsById[runId])} carries gear for ${ev.name} but has no delivery stop`, { runId, eventId: ev.id });
      }
    }
    if ((needsTruck || evStops.length) && !evStops.some(s => s.stop_type === 'pickup')) {
      push('warning', 'no-pickup', `${ev.name} has no pickup scheduled`, { eventId: ev.id });
    }

    for (const s of evStops) {
      const sw = stopWindow(s);
      if (!sw || !window) continue;
      if (s.stop_type === 'pickup' && sw.start < window.end) {
        push('error', 'early-pickup', `Pickup at ${ev.name} is at ${formatMinutes(sw.start)}, before the event ends (${formatMinutes(window.end)})`, { runId: s.run_id, eventId: ev.id, stopId: s.id });
      }
      if (s.stop_type === 'deliver' && sw.end > window.start) {
        push('warning', 'late-delivery', `Delivery to ${ev.name} runs past the event start (${formatMinutes(window.start)})`, { runId: s.run_id, eventId: ev.id, stopId: s.id });
      }
    }
  }

  // 4. Team dealing vs. truck movements (truck is parked during the shift).
  for (const run of runs) {
    const team = teamIds(run);
    if (!team.length) continue;
    const shifts = dealingShifts(team, assignments, eventsById, date);
    const runStops = stopsByRun[run.id] || [];

    for (const shift of shifts) {
      const evName = eventName(shift.eventId);
      if (!runStops.some(s => s.stop_type === 'work' && s.event_id === shift.eventId)) {
        push('warning', 'missing-work-stop', `${workerName(shift.workerId)} is dealing ${evName} — add a work stop to ${truckName(run)} (the truck is parked there during the shift)`, { runId: run.id, eventId: shift.eventId });
      }
      for (const s of runStops) {
        if (s.stop_type === 'work' || s.event_id === shift.eventId) continue;
        const sw = stopWindow(s);
        if (overlaps(sw, shift.window)) {
          push('error', 'dealing-conflict',
            `${workerName(shift.workerId)} is dealing ${evName} (${formatMinutes(shift.window.start)}–${formatMinutes(shift.window.end)}) but ${truckName(run)} has a ${s.stop_type} at ${eventName(s.event_id)} at ${formatMinutes(sw.start)}`,
            { runId: run.id, eventId: s.event_id, stopId: s.id });
        }
      }
    }

    for (const s of runStops) {
      if (s.stop_type !== 'work') continue;
      if (!shifts.some(sh => sh.eventId === s.event_id)) {
        push('warning', 'work-unstaffed', `${truckName(run)} has a work stop at ${eventName(s.event_id)}, but neither team member is staffed on it — assign them from Events`, { runId: run.id, eventId: s.event_id, stopId: s.id });
      }
    }

    // 5. Stop times going backwards within a run.
    let prev = null;
    for (const s of runStops) {
      const sw = stopWindow(s);
      if (!sw) continue;
      if (prev && sw.start < prev.start) {
        push('warning', 'out-of-order', `${truckName(run)}: stop ${s.sequence} (${eventName(s.event_id)}) is scheduled before the stop above it`, { runId: run.id, stopId: s.id });
      }
      prev = sw;
    }
  }

  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
}

// ---- Board structure ------------------------------------------------------

// A run's stops, grouped the way the board shows them: each trip's delivery
// stops (in load order), then the "evening" section -- work and pickup stops,
// which have no load because pickup gear never rides with delivery gear.
// `ordered` is that full order; sequence numbers are derived from it.
export function orderRunStops(runLoads = [], runStops = []) {
  const bySeq = (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0);
  const loads = runLoads.slice().sort((a, b) => a.sequence - b.sequence);
  const trips = loads.map(load => ({
    load,
    stops: runStops.filter(s => s.load_id === load.id).sort(bySeq)
  }));
  const loadIds = new Set(loads.map(l => l.id));
  const evening = runStops.filter(s => !s.load_id || !loadIds.has(s.load_id)).sort(bySeq);
  return { trips, evening, ordered: [...trips.flatMap(t => t.stops), ...evening] };
}

// [{ id, sequence }] for stops whose stored sequence differs from 1..n order.
export function sequenceChanges(ordered = []) {
  return ordered
    .map((s, i) => ({ id: s.id, sequence: i + 1, prev: s.sequence }))
    .filter(c => c.prev !== c.sequence)
    .map(({ id, sequence }) => ({ id, sequence }));
}

// Move one stop up/down within its section; returns the new full order.
export function moveStop(runLoads, runStops, stopId, direction) {
  const { trips, evening } = orderRunStops(runLoads, runStops);
  const sections = [...trips.map(t => t.stops.slice()), evening.slice()];
  for (const list of sections) {
    const i = list.findIndex(s => s.id === stopId);
    if (i < 0) continue;
    const j = i + direction;
    if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
  }
  return sections.flat();
}

// What to write when an event is added to a load:
//  - allocations for whatever of the event isn't on any truck yet (a split
//    event's second truck starts at zero and is stepped up by hand);
//  - a delivery stop on that load (if this run doesn't have one there);
//  - a work stop if a team member is staffed on the event, and a pickup,
//    unless this run already has them.
// New stops are numbered after the run's existing ones; the board
// re-sequences everything afterwards anyway.
export function planAddEventToLoad({ event, load, run, equipmentRows = [], dayAllocations = [], runStops = [], assignments = [], eventsById = {}, date }) {
  const required = requiredCounts(equipmentRows);
  const already = allocatedCounts(dayAllocations, event.id);
  const onThisLoad = dayAllocations.filter(a => a.load_id === load.id && a.event_id === event.id);

  const allocations = ALLOCATABLE_CLASSES
    .filter(c => required[c] > 0 && !onThisLoad.some(a => a.size_class === c))
    .map(c => ({ load_id: load.id, event_id: event.id, size_class: c, quantity: Math.max(0, required[c] - already[c]) }));

  const has = (type, extra = () => true) => runStops.some(s => s.event_id === event.id && s.stop_type === type && extra(s));
  const teamDealing = dealingShifts(teamIds(run), assignments, { ...eventsById, [event.id]: event }, date)
    .some(s => s.eventId === event.id);

  let seq = runStops.reduce((m, s) => Math.max(m, s.sequence || 0), 0);
  const stops = defaultStopsForEvent(event, { teamDealing })
    .filter(s => (s.stop_type === 'deliver' ? !has('deliver', x => x.load_id === load.id) : !has(s.stop_type)))
    .map(({ onPickupList, ...s }) => ({
      ...s,
      run_id: run.id,
      load_id: s.stop_type === 'deliver' ? load.id : null,
      sequence: ++seq
    }));

  return { allocations, stops };
}
