import { describe, it, expect } from 'vitest';
import {
  toMinutes, stopWindow, eventWindow, formatMinutes,
  requiredCounts, allocatedCounts, allocationStatus, formatCounts, checkLoad,
  dealingShifts, defaultStopsForEvent, computeDayConflicts,
  orderRunStops, sequenceChanges, moveStop, planAddEventToLoad,
  crewRoles, isDriver, isSetUp, eligibleForSpot,
  isOneSpotRun, spotFor, runLabel, planMoveEvent, dayStatus, monthStatuses,
  warehouseKeys, isWarehouseWorker, hasLogisticsRole, crewPositionKeys, eventPositionOptions
} from './dispatch';

const YELLOW = { id: 'tY', name: 'Yellow', craps_capacity: 1, craps_stretch: 2, roulette_capacity: 2, poker_capacity: 2, blackjack_capacity: 10, can_carry_archway: false, priority: 1 };
const BLACK = { id: 'tB', name: 'Black', craps_capacity: 2, craps_stretch: 3, roulette_capacity: 2, poker_capacity: 2, blackjack_capacity: 14, can_carry_archway: false, priority: 2 };
const TRUCKS = [YELLOW, BLACK];

const DATE = '2026-10-06';
// Grand Geneva-sized party and a small one the same night.
const GENEVA = { id: 'eG', name: 'Grand Geneva', date: DATE, time: '19:30', end_time: '22:30' };
const SMALL = { id: 'eS', name: 'Small Party', date: DATE, time: '18:00', end_time: '21:00' };
const EQUIPMENT = {
  eG: [
    { size_class: 'roulette', quantity: 2 }, { size_class: 'poker', quantity: 2 },
    { size_class: 'blackjack', quantity: 8 }, { size_class: 'craps', quantity: 2 },
    { size_class: 'accessory', quantity: 8, parent_line_no: 3 }
  ],
  eS: [{ size_class: 'blackjack', quantity: 3 }, { size_class: 'craps', quantity: 1 }]
};
const WORKERS = { w1: { id: 'w1', name: 'Ana' }, w2: { id: 'w2', name: 'Ben' }, w3: { id: 'w3', name: 'Cy' }, w4: { id: 'w4', name: 'Di' } };

// A clean plan: Black takes Geneva, Yellow takes the small party; nobody deals.
function cleanDay() {
  return {
    date: DATE,
    events: [GENEVA, SMALL],
    equipmentByEvent: EQUIPMENT,
    trucks: TRUCKS,
    workersById: WORKERS,
    assignments: [],
    runs: [
      { id: 'rB', truck_id: 'tB', worker1_id: 'w1', worker2_id: 'w2' },
      { id: 'rY', truck_id: 'tY', worker1_id: 'w3', worker2_id: 'w4' }
    ],
    loads: [{ id: 'lB1', run_id: 'rB', sequence: 1 }, { id: 'lY1', run_id: 'rY', sequence: 1 }],
    allocations: [
      { load_id: 'lB1', event_id: 'eG', size_class: 'roulette', quantity: 2 },
      { load_id: 'lB1', event_id: 'eG', size_class: 'poker', quantity: 2 },
      { load_id: 'lB1', event_id: 'eG', size_class: 'blackjack', quantity: 8 },
      { load_id: 'lB1', event_id: 'eG', size_class: 'craps', quantity: 2 },
      { load_id: 'lY1', event_id: 'eS', size_class: 'blackjack', quantity: 3 },
      { load_id: 'lY1', event_id: 'eS', size_class: 'craps', quantity: 1 }
    ],
    stops: [
      { id: 's1', run_id: 'rB', load_id: 'lB1', event_id: 'eG', stop_type: 'deliver', sequence: 1, scheduled_start: '16:00', scheduled_end: '17:30' },
      { id: 's2', run_id: 'rB', event_id: 'eG', stop_type: 'pickup', sequence: 2, scheduled_start: '22:45' },
      { id: 's3', run_id: 'rY', load_id: 'lY1', event_id: 'eS', stop_type: 'deliver', sequence: 1, scheduled_start: '15:00', scheduled_end: '16:00' },
      { id: 's4', run_id: 'rY', event_id: 'eS', stop_type: 'pickup', sequence: 2, scheduled_start: '21:15' }
    ]
  };
}

const codes = (conflicts) => conflicts.map(c => c.code);

describe('time helpers', () => {
  it('parses HH:MM and HH:MM:SS', () => {
    expect(toMinutes('19:30')).toBe(1170);
    expect(toMinutes('07:05:00')).toBe(425);
    expect(toMinutes('')).toBeNull();
  });

  it('treats stop times before 5 AM as after midnight', () => {
    expect(stopWindow({ scheduled_start: '00:30' })).toEqual({ start: 1470, end: 1470 });
    expect(stopWindow({ scheduled_start: '23:30', scheduled_end: '00:15' })).toEqual({ start: 1410, end: 1455 });
    expect(stopWindow({ scheduled_start: null })).toBeNull();
  });

  it('handles events ending after midnight', () => {
    expect(eventWindow({ time: '21:00', end_time: '01:00' })).toEqual({ start: 1260, end: 1500 });
  });

  it('formats minutes as 12-hour time', () => {
    expect(formatMinutes(1170)).toBe('7:30 PM');
    expect(formatMinutes(1470)).toBe('12:30 AM');
    expect(formatMinutes(720)).toBe('12:00 PM');
  });
});

describe('allocation math', () => {
  it('required counts skip accessories', () => {
    expect(requiredCounts(EQUIPMENT.eG)).toMatchObject({ roulette: 2, poker: 2, blackjack: 8, craps: 2, chairs: 0 });
  });

  it('sums allocations across loads, optionally per event', () => {
    const allocs = [
      { load_id: 'a', event_id: 'e1', size_class: 'blackjack', quantity: 5 },
      { load_id: 'b', event_id: 'e1', size_class: 'blackjack', quantity: 3 },
      { load_id: 'b', event_id: 'e2', size_class: 'craps', quantity: 1 }
    ];
    expect(allocatedCounts(allocs, 'e1').blackjack).toBe(8);
    expect(allocatedCounts(allocs).craps).toBe(1);
  });

  it('reports remaining and over-allocated classes (split across two trucks)', () => {
    const required = requiredCounts(EQUIPMENT.eG);
    const s = allocationStatus(required, { roulette: 2, poker: 2, blackjack: 5, craps: 3 });
    expect(s.remaining).toEqual({ blackjack: 3 });
    expect(s.over).toEqual({ craps: 1 });
    expect(s.complete).toBe(false);
    expect(allocationStatus(required, required).complete).toBe(true);
    expect(formatCounts({ blackjack: 3, craps: 1 })).toBe('1 Craps, 3 Blackjack');
  });

  it('checks a load combining two events', () => {
    const r = checkLoad(YELLOW, [
      { size_class: 'blackjack', quantity: 3 },
      { size_class: 'craps', quantity: 1 },
      { size_class: 'craps', quantity: 1 }
    ]);
    expect(r.status).toBe('yellow'); // 2 craps on Yellow = stretch
  });
});

describe('defaultStopsForEvent', () => {
  it('adds deliver + pickup, and a work stop when the team deals the party', () => {
    expect(defaultStopsForEvent(SMALL).map(s => s.stop_type)).toEqual(['deliver', 'pickup']);
    const withWork = defaultStopsForEvent(SMALL, { teamDealing: true });
    expect(withWork.map(s => [s.stop_type, s.scheduled_start, s.scheduled_end])).toEqual([
      ['deliver', null, null], ['work', '18:00', '21:00'], ['pickup', '21:00', null]
    ]);
  });
});

describe('dealingShifts', () => {
  it('only counts filled assignments on that date', () => {
    const shifts = dealingShifts(['w1'], [
      { worker_id: 'w1', event_id: 'eS', status: 'confirmed', position: 'blackjack_dealer' },
      { worker_id: 'w1', event_id: 'eG', status: 'cancelled' },
      { worker_id: 'w2', event_id: 'eG', status: 'confirmed' }
    ], { eS: SMALL, eG: GENEVA }, DATE);
    expect(shifts.map(s => s.eventId)).toEqual(['eS']);
    expect(shifts[0].window).toEqual({ start: 1080, end: 1260 });
  });
});

describe('computeDayConflicts', () => {
  it('a clean plan has no conflicts', () => {
    expect(computeDayConflicts(cleanDay())).toEqual([]);
  });

  it('flags an event with no truck', () => {
    const day = cleanDay();
    day.allocations = day.allocations.filter(a => a.event_id !== 'eS');
    day.stops = day.stops.filter(s => s.event_id !== 'eS');
    const c = computeDayConflicts(day);
    expect(c).toContainEqual(expect.objectContaining({ level: 'error', code: 'no-truck', eventId: 'eS' }));
  });

  it('flags unallocated gear (e.g. after a re-import added tables)', () => {
    const day = cleanDay();
    day.equipmentByEvent = { ...EQUIPMENT, eS: [{ size_class: 'blackjack', quantity: 5 }, { size_class: 'craps', quantity: 1 }] };
    const c = computeDayConflicts(day).find(x => x.code === 'unallocated');
    expect(c.message).toBe('Small Party: not on a truck yet — 2 Blackjack');
  });

  it('flags over-allocation (e.g. after a re-import removed tables)', () => {
    const day = cleanDay();
    day.equipmentByEvent = { ...EQUIPMENT, eS: [{ size_class: 'blackjack', quantity: 3 }] };
    expect(codes(computeDayConflicts(day))).toContain('over-allocated');
  });

  it('accepts one event split across two trucks when every table is covered', () => {
    const day = cleanDay();
    day.allocations = day.allocations.map(a => (a.event_id === 'eG' && a.size_class === 'blackjack' ? { ...a, quantity: 5 } : a));
    day.allocations.push({ load_id: 'lY1', event_id: 'eG', size_class: 'blackjack', quantity: 3 });
    day.stops.push({ id: 's5', run_id: 'rY', load_id: 'lY1', event_id: 'eG', stop_type: 'deliver', sequence: 1.5, scheduled_start: '16:30', scheduled_end: '17:00' });
    expect(computeDayConflicts(day)).toEqual([]);
  });

  it('flags a truck carrying gear with no delivery stop for it', () => {
    // Split Geneva's blackjack 6/2 across Black and Yellow, but give Yellow no delivery stop.
    const day = cleanDay();
    day.allocations = day.allocations.map(a => (a.event_id === 'eG' && a.size_class === 'blackjack' ? { ...a, quantity: 6 } : a));
    day.allocations.push({ load_id: 'lY1', event_id: 'eG', size_class: 'blackjack', quantity: 2 });
    const c = computeDayConflicts(day);
    expect(codes(c)).toEqual(['no-delivery-stop']);
    expect(c[0]).toMatchObject({ runId: 'rY', eventId: 'eG' });
  });

  it('flags per-load capacity (red is an error, yellow a warning)', () => {
    const day = cleanDay();
    day.allocations.push({ load_id: 'lY1', event_id: 'eS', size_class: 'craps', quantity: 1 }); // 2 craps on Yellow -> stretch
    let c = computeDayConflicts(day).find(x => x.code === 'capacity');
    expect(c).toMatchObject({ level: 'warning', loadId: 'lY1' });
    expect(c.message).toMatch(/^Yellow trip 1: Craps zone at 2\/1/);

    day.allocations.push({ load_id: 'lY1', event_id: 'eS', size_class: 'craps', quantity: 1 }); // 3 -> over stretch
    c = computeDayConflicts(day).find(x => x.code === 'capacity');
    expect(c.level).toBe('error');
  });

  it('flags a pickup scheduled before the event ends', () => {
    const day = cleanDay();
    day.stops = day.stops.map(s => (s.id === 's4' ? { ...s, scheduled_start: '20:30' } : s));
    const c = computeDayConflicts(day).find(x => x.code === 'early-pickup');
    expect(c.message).toBe('Pickup at Small Party is at 8:30 PM, before the event ends (9:00 PM)');
  });

  it('accepts a pickup after midnight', () => {
    const day = cleanDay();
    day.stops = day.stops.map(s => (s.id === 's2' ? { ...s, scheduled_start: '00:15' } : s));
    expect(computeDayConflicts(day)).toEqual([]);
  });

  it('flags a missing pickup and a delivery running into the party', () => {
    const day = cleanDay();
    day.stops = day.stops
      .filter(s => s.id !== 's4')
      .map(s => (s.id === 's3' ? { ...s, scheduled_end: '18:30' } : s));
    expect(codes(computeDayConflicts(day))).toEqual(expect.arrayContaining(['no-pickup', 'late-delivery']));
  });

  describe('team dealing a party', () => {
    // Yellow's team (w3) deals the small party 6–9 PM.
    const dealing = () => {
      const day = cleanDay();
      day.assignments = [{ worker_id: 'w3', event_id: 'eS', status: 'confirmed', position: 'blackjack_dealer' }];
      return day;
    };

    it('asks for a work stop so the truck is known to be parked', () => {
      const c = computeDayConflicts(dealing()).find(x => x.code === 'missing-work-stop');
      expect(c.message).toMatch(/^Cy is dealing Small Party — add a work stop to Yellow/);
    });

    it('is clean once the work stop is there', () => {
      const day = dealing();
      day.stops.push({ id: 'w', run_id: 'rY', event_id: 'eS', stop_type: 'work', sequence: 1.5, scheduled_start: '18:00', scheduled_end: '21:00' });
      expect(computeDayConflicts(day)).toEqual([]);
    });

    it('errors when the truck is scheduled elsewhere during the shift', () => {
      const day = dealing();
      day.stops.push({ id: 'w', run_id: 'rY', event_id: 'eS', stop_type: 'work', sequence: 1.5, scheduled_start: '18:00', scheduled_end: '21:00' });
      // Yellow also tries to pick up at Geneva at 8 PM, mid-shift.
      day.stops.push({ id: 'x', run_id: 'rY', event_id: 'eG', stop_type: 'pickup', sequence: 1.7, scheduled_start: '20:00' });
      const c = computeDayConflicts(day).find(x => x.code === 'dealing-conflict');
      expect(c).toMatchObject({ level: 'error', stopId: 'x' });
      expect(c.message).toBe('Cy is dealing Small Party (6:00 PM–9:00 PM) but Yellow has a pickup at Grand Geneva at 8:00 PM');
    });

    it('warns about a work stop where the team is not staffed', () => {
      const day = cleanDay();
      day.stops.push({ id: 'w', run_id: 'rB', event_id: 'eG', stop_type: 'work', sequence: 1.5, scheduled_start: '19:30', scheduled_end: '22:30' });
      expect(codes(computeDayConflicts(day))).toContain('work-unstaffed');
    });
  });

  it('flags team problems: missing, short, and one person on two trucks', () => {
    const day = cleanDay();
    day.runs = [
      { id: 'rB', truck_id: 'tB', worker1_id: 'w1', worker2_id: null },
      { id: 'rY', truck_id: 'tY', worker1_id: 'w1', worker2_id: 'w4' }
    ];
    const c = computeDayConflicts(day);
    expect(codes(c)).toEqual(expect.arrayContaining(['short-team', 'double-booked-driver']));
    expect(c.find(x => x.code === 'double-booked-driver').message).toBe('Ana is on Black and Yellow');
    expect(c[0].level).toBe('error'); // errors sorted first

    day.runs[0] = { id: 'rB', truck_id: 'tB' };
    expect(codes(computeDayConflicts(day))).toContain('no-team');
  });

  it('flags stops whose times go backwards', () => {
    const day = cleanDay();
    day.stops = day.stops.map(s => (s.id === 's2' ? { ...s, scheduled_start: '15:00' } : s));
    expect(codes(computeDayConflicts(day))).toContain('out-of-order');
  });

  it('ignores cancelled events', () => {
    const day = cleanDay();
    day.events = [GENEVA, { ...SMALL, status: 'cancelled' }];
    day.allocations = day.allocations.filter(a => a.event_id !== 'eS');
    day.stops = day.stops.filter(s => s.event_id !== 'eS');
    expect(computeDayConflicts(day)).toEqual([]);
  });
});

describe('board structure', () => {
  const loads = [{ id: 'L2', sequence: 2 }, { id: 'L1', sequence: 1 }];
  const stops = [
    { id: 'p1', load_id: null, stop_type: 'pickup', sequence: 5 },
    { id: 'd2', load_id: 'L2', stop_type: 'deliver', sequence: 4 },
    { id: 'd1', load_id: 'L1', stop_type: 'deliver', sequence: 2 },
    { id: 'w1', load_id: null, stop_type: 'work', sequence: 3 },
    { id: 'd0', load_id: 'L1', stop_type: 'deliver', sequence: 1 }
  ];

  it('orders trips by load, then work/pickups', () => {
    const { trips, evening, ordered } = orderRunStops(loads, stops);
    expect(trips.map(t => [t.load.id, t.stops.map(s => s.id)])).toEqual([['L1', ['d0', 'd1']], ['L2', ['d2']]]);
    expect(evening.map(s => s.id)).toEqual(['w1', 'p1']);
    expect(ordered.map(s => s.id)).toEqual(['d0', 'd1', 'd2', 'w1', 'p1']);
    expect(sequenceChanges(ordered)).toEqual([{ id: 'd2', sequence: 3 }, { id: 'w1', sequence: 4 }]);
  });

  it('moves a stop within its section only', () => {
    expect(moveStop(loads, stops, 'd1', -1).map(s => s.id)).toEqual(['d1', 'd0', 'd2', 'w1', 'p1']);
    expect(moveStop(loads, stops, 'd2', -1).map(s => s.id)).toEqual(['d0', 'd1', 'd2', 'w1', 'p1']); // already top of its trip
    expect(moveStop(loads, stops, 'w1', 1).map(s => s.id)).toEqual(['d0', 'd1', 'd2', 'p1', 'w1']);
  });
});

describe('planAddEventToLoad', () => {
  const run = { id: 'rY', worker1_id: 'w3', worker2_id: 'w4' };
  const load = { id: 'lY1', run_id: 'rY', sequence: 1 };

  it('allocates everything and adds deliver + pickup for a fresh event', () => {
    const plan = planAddEventToLoad({ event: SMALL, load, run, equipmentRows: EQUIPMENT.eS, date: DATE });
    expect(plan.allocations).toEqual([
      { load_id: 'lY1', event_id: 'eS', size_class: 'craps', quantity: 1 },
      { load_id: 'lY1', event_id: 'eS', size_class: 'blackjack', quantity: 3 }
    ]);
    expect(plan.stops.map(s => [s.stop_type, s.load_id, s.scheduled_start, s.sequence])).toEqual([
      ['deliver', 'lY1', null, 1], ['pickup', null, '21:00', 2]
    ]);
  });

  it('adds a work stop when a team member deals the party', () => {
    const plan = planAddEventToLoad({
      event: SMALL, load, run, equipmentRows: EQUIPMENT.eS, date: DATE,
      assignments: [{ worker_id: 'w4', event_id: 'eS', status: 'confirmed' }]
    });
    expect(plan.stops.map(s => s.stop_type)).toEqual(['deliver', 'work', 'pickup']);
    expect(plan.stops[1]).toMatchObject({ load_id: null, scheduled_start: '18:00', scheduled_end: '21:00' });
  });

  it('second truck on a split event starts at the remaining quantities', () => {
    const plan = planAddEventToLoad({
      event: GENEVA, load, run, equipmentRows: EQUIPMENT.eG, date: DATE,
      dayAllocations: [
        { load_id: 'lB1', event_id: 'eG', size_class: 'blackjack', quantity: 5 },
        { load_id: 'lB1', event_id: 'eG', size_class: 'craps', quantity: 2 },
        { load_id: 'lB1', event_id: 'eG', size_class: 'roulette', quantity: 2 },
        { load_id: 'lB1', event_id: 'eG', size_class: 'poker', quantity: 2 }
      ]
    });
    expect(plan.allocations.map(a => [a.size_class, a.quantity])).toEqual([
      ['craps', 0], ['roulette', 0], ['poker', 0], ['blackjack', 3]
    ]);
  });

  it('adding to a reload trip does not duplicate the pickup', () => {
    const plan = planAddEventToLoad({
      event: SMALL, load: { id: 'lY2', run_id: 'rY', sequence: 2 }, run, equipmentRows: EQUIPMENT.eS, date: DATE,
      runStops: [
        { run_id: 'rY', load_id: 'lY1', event_id: 'eS', stop_type: 'deliver', sequence: 1 },
        { run_id: 'rY', load_id: null, event_id: 'eS', stop_type: 'pickup', sequence: 2 }
      ]
    });
    expect(plan.stops.map(s => [s.stop_type, s.load_id, s.sequence])).toEqual([['deliver', 'lY2', 3]]);
  });
});

describe('truck team spots: 1 Driver + 1 Set Up', () => {
  // Live positions as of 2026-09-29: "Set Up Driver" has key 'driver' (added as
  // "Driver" and renamed), "Set Up" has key 'set_up'.
  const POSITIONS = [
    { key: 'blackjack', label: 'Blackjack' },
    { key: 'set_up', label: 'Set Up' },
    { key: 'driver', label: 'Set Up Driver' }
  ];
  const ana = { id: 'w1', name: 'Ana', skills: ['blackjack', 'driver'] };
  const ben = { id: 'w2', name: 'Ben', skills: ['set_up'] };
  const cy = { id: 'w3', name: 'Cy', skills: ['blackjack'] };
  const di = { id: 'w4', name: 'Di', skills: ['driver'], is_active: false };

  it('recognizes the live positions by key or label', () => {
    const roles = crewRoles(POSITIONS);
    expect([...roles.driverKeys]).toEqual(['driver']);
    expect([...roles.setupKeys]).toEqual(['set_up']);
    expect(roles.active).toBe(true);
    // A differently-keyed driver position is still found by its label.
    expect([...crewRoles([{ key: 'truck_guy', label: 'Box Truck Driver' }]).driverKeys]).toEqual(['truck_guy']);
    expect([...crewRoles([{ key: 'setup_crew', label: 'Setup' }]).setupKeys]).toEqual(['setup_crew']);
  });

  it('Driver spot lists only active Set Up Drivers', () => {
    expect(eligibleForSpot([ana, ben, cy, di], POSITIONS, 'driver').map(w => w.name)).toEqual(['Ana']);
  });

  it('Set Up spot lists Set Up and Set Up Drivers', () => {
    expect(eligibleForSpot([ana, ben, cy, di], POSITIONS, 'setup').map(w => w.name)).toEqual(['Ana', 'Ben']);
    const roles = crewRoles(POSITIONS);
    expect(isSetUp(ana, roles)).toBe(true);
    expect(isDriver(ben, roles)).toBe(false);
  });

  it('without a driver position, both spots list everyone active', () => {
    const noRoles = [{ key: 'blackjack', label: 'Blackjack' }];
    expect(crewRoles(noRoles).active).toBe(false);
    expect(eligibleForSpot([ana, ben, cy, di], noRoles, 'driver').map(w => w.name)).toEqual(['Ana', 'Ben', 'Cy']);
  });

  it('warns about the wrong person in a spot, only when the rule is active', () => {
    const day = cleanDay(); // rB: w1 (driver spot) + w2; rY: w3 + w4
    day.workersById = {
      w1: { ...WORKERS.w1, skills: ['set_up'] },   // Set Up person in the Driver spot
      w2: { ...WORKERS.w2, skills: ['blackjack'] }, // no crew skill at all
      w3: { ...WORKERS.w3, skills: ['driver'] },
      w4: { ...WORKERS.w4, skills: ['driver'] }     // a driver is fine in the Set Up spot
    };
    expect(computeDayConflicts(day)).toEqual([]);
    const c = computeDayConflicts({ ...day, positions: POSITIONS });
    expect(c.map(x => [x.code, x.message])).toEqual([
      ['not-a-driver', "Ana is in Black's Driver spot but isn't a Set Up Driver"],
      ['not-set-up', "Ben is on Black but isn't marked Set Up or Set Up Driver"]
    ]);
  });
});

describe('solo trucks and personal vehicles', () => {
  const POSITIONS = [{ key: 'set_up', label: 'Set Up' }, { key: 'driver', label: 'Set Up Driver' }];
  const CAR = { id: 'tP', name: 'Personal vehicle', kind: 'personal', craps_capacity: 0, craps_stretch: 0, roulette_capacity: 0, poker_capacity: 1, blackjack_capacity: 3, can_carry_archway: false };

  it('labels and spots', () => {
    const trucksById = { tB: BLACK, tP: CAR };
    expect(runLabel({ truck_id: 'tB' }, trucksById, WORKERS)).toBe('Black');
    expect(runLabel({ truck_id: 'tP', is_personal: true, worker1_id: 'w3' }, trucksById, WORKERS)).toBe('Personal vehicle (Cy)');
    expect(runLabel({ truck_id: 'tP', is_personal: true }, trucksById, WORKERS)).toBe('Personal vehicle');
    expect(spotFor({ is_personal: true }, 'worker1_id')).toBe('setup');
    expect(spotFor({}, 'worker1_id')).toBe('driver');
    expect(isOneSpotRun({ solo: true })).toBe(true);
    expect(isOneSpotRun({})).toBe(false);
  });

  it('a solo truck with one person has no short-team warning; without Solo it does', () => {
    const day = cleanDay();
    day.runs = [{ id: 'rB', truck_id: 'tB', worker1_id: 'w1', solo: true }, day.runs[1]];
    expect(computeDayConflicts(day)).toEqual([]);
    day.runs[0] = { ...day.runs[0], solo: false };
    const c = computeDayConflicts(day);
    expect(c.map(x => x.code)).toEqual(['short-team']);
    expect(c[0].message).toMatch(/switch on Solo/);
  });

  it('a personal-vehicle delivery: one person, own capacity, labelled by who is driving', () => {
    // Small Party (3 blackjack + 1 craps) moves from Yellow into Cy's car, which fits 3 blackjack and no craps.
    const day = cleanDay();
    day.trucks = [...TRUCKS, CAR];
    day.runs = [day.runs[0], { id: 'rP', truck_id: 'tP', is_personal: true, worker1_id: 'w3' }];
    day.loads = [day.loads[0], { id: 'lP1', run_id: 'rP', sequence: 1 }];
    day.allocations = day.allocations.map(a => (a.load_id === 'lY1' ? { ...a, load_id: 'lP1' } : a));
    day.stops = day.stops.map(s => (s.run_id === 'rY' ? { ...s, run_id: 'rP', load_id: s.load_id ? 'lP1' : null } : s));
    const c = computeDayConflicts(day);
    expect(c.map(x => [x.level, x.message])).toEqual([
      ['error', 'Personal vehicle (Cy) trip 1: Craps zone needs 1 units but holds 0 max — 1 craps table']
    ]);
    // Without the craps table it's clean -- and no "only one team member" warning.
    day.allocations = day.allocations.filter(a => !(a.load_id === 'lP1' && a.size_class === 'craps'));
    day.equipmentByEvent = { ...EQUIPMENT, eS: [{ size_class: 'blackjack', quantity: 3 }] };
    expect(computeDayConflicts(day)).toEqual([]);
  });

  it('several personal-vehicle deliveries on one day are fine; the same person twice is not', () => {
    const day = cleanDay();
    day.trucks = [...TRUCKS, CAR];
    day.events = [];
    day.allocations = [];
    day.stops = [];
    day.runs = [
      { id: 'p1', truck_id: 'tP', is_personal: true, worker1_id: 'w1' },
      { id: 'p2', truck_id: 'tP', is_personal: true, worker1_id: 'w2' }
    ];
    day.loads = [];
    expect(computeDayConflicts(day)).toEqual([]);
    day.runs[1].worker1_id = 'w1';
    expect(computeDayConflicts(day).map(x => x.message)).toEqual(['Ana is on Personal vehicle (Ana) and Personal vehicle (Ana)']);
  });

  it('a personal-vehicle driver needs Set Up or Set Up Driver, not the truck-driver skill', () => {
    const day = cleanDay();
    day.trucks = [...TRUCKS, CAR];
    day.events = []; day.allocations = []; day.stops = []; day.loads = [];
    day.runs = [{ id: 'p1', truck_id: 'tP', is_personal: true, worker1_id: 'w1' }];
    day.workersById = { w1: { ...WORKERS.w1, skills: ['set_up'] } };
    expect(computeDayConflicts({ ...day, positions: POSITIONS })).toEqual([]);
    day.workersById = { w1: { ...WORKERS.w1, skills: ['blackjack'] } };
    expect(computeDayConflicts({ ...day, positions: POSITIONS }).map(x => x.code)).toEqual(['not-set-up']);
  });
});

describe('planMoveEvent', () => {
  // Black (rB/lB1) carries Geneva + Small Party; Yellow (rY/lY1) has one other event.
  const base = () => ({
    loads: [{ id: 'lB1', run_id: 'rB', sequence: 1 }, { id: 'lY1', run_id: 'rY', sequence: 1 }],
    allocations: [
      { load_id: 'lB1', event_id: 'eG', size_class: 'blackjack', quantity: 8 },
      { load_id: 'lB1', event_id: 'eG', size_class: 'craps', quantity: 2 },
      { load_id: 'lB1', event_id: 'eS', size_class: 'blackjack', quantity: 3 }
    ],
    stops: [
      { id: 'dS', run_id: 'rB', load_id: 'lB1', event_id: 'eS', stop_type: 'deliver', sequence: 1 },
      { id: 'dG', run_id: 'rB', load_id: 'lB1', event_id: 'eG', stop_type: 'deliver', sequence: 2 },
      { id: 'wS', run_id: 'rB', load_id: null, event_id: 'eS', stop_type: 'work', sequence: 3 },
      { id: 'pG', run_id: 'rB', load_id: null, event_id: 'eG', stop_type: 'pickup', sequence: 4 },
      { id: 'pS', run_id: 'rB', load_id: null, event_id: 'eS', stop_type: 'pickup', sequence: 5 },
      { id: 'yX', run_id: 'rY', load_id: 'lY1', event_id: 'eX', stop_type: 'deliver', sequence: 1 }
    ]
  });
  const B = { id: 'lB1', run_id: 'rB' };
  const Y = { id: 'lY1', run_id: 'rY' };

  it('moves an event with its tables, delivery, dealing time and pickup to the other vehicle', () => {
    const plan = planMoveEvent({ eventId: 'eS', fromLoad: B, toLoad: Y, day: base() });
    expect(plan.allocationUpserts).toEqual([{ load_id: 'lY1', event_id: 'eS', size_class: 'blackjack', quantity: 3 }]);
    expect(plan.removeFrom).toEqual({ loadId: 'lB1', eventId: 'eS' });
    expect(plan.stopUpdates).toEqual([
      { id: 'dS', patch: { run_id: 'rY', load_id: 'lY1', sequence: 2 } },
      { id: 'wS', patch: { run_id: 'rY', load_id: null, sequence: 3 } },
      { id: 'pS', patch: { run_id: 'rY', load_id: null, sequence: 4 } }
    ]);
    expect(plan.stopDeletes).toEqual([]);
  });

  it('adds to tables the event already has on the target and drops duplicate stops', () => {
    const day = base();
    day.allocations.push({ load_id: 'lY1', event_id: 'eG', size_class: 'blackjack', quantity: 2 });
    day.stops.push({ id: 'dGy', run_id: 'rY', load_id: 'lY1', event_id: 'eG', stop_type: 'deliver', sequence: 2 });
    day.stops.push({ id: 'pGy', run_id: 'rY', load_id: null, event_id: 'eG', stop_type: 'pickup', sequence: 3 });
    const plan = planMoveEvent({ eventId: 'eG', fromLoad: B, toLoad: Y, day });
    expect(plan.allocationUpserts).toEqual([
      { load_id: 'lY1', event_id: 'eG', size_class: 'blackjack', quantity: 10 },
      { load_id: 'lY1', event_id: 'eG', size_class: 'craps', quantity: 2 }
    ]);
    expect(plan.stopUpdates).toEqual([]);
    expect(plan.stopDeletes).toEqual(['dG', 'pG']);
  });

  it('leaves pickup/dealing behind when the event is still on another trip of the source vehicle', () => {
    const day = base();
    day.loads.push({ id: 'lB2', run_id: 'rB', sequence: 2 });
    day.allocations.push({ load_id: 'lB2', event_id: 'eG', size_class: 'blackjack', quantity: 1 });
    const plan = planMoveEvent({ eventId: 'eG', fromLoad: B, toLoad: Y, day });
    expect(plan.stopUpdates.map(u => u.id)).toEqual(['dG']);
    expect(plan.stopDeletes).toEqual([]);
  });

  it('moving to another trip of the same vehicle only moves the delivery', () => {
    const day = base();
    day.loads.push({ id: 'lB2', run_id: 'rB', sequence: 2 });
    const plan = planMoveEvent({ eventId: 'eS', fromLoad: B, toLoad: { id: 'lB2', run_id: 'rB' }, day });
    expect(plan.allocationUpserts).toEqual([{ load_id: 'lB2', event_id: 'eS', size_class: 'blackjack', quantity: 3 }]);
    expect(plan.stopUpdates).toEqual([{ id: 'dS', patch: { run_id: 'rB', load_id: 'lB2', sequence: 6 } }]);
  });
});

describe('month calendar statuses', () => {
  it('dayStatus: none / scheduled / unscheduled / conflict', () => {
    const day = cleanDay();
    expect(dayStatus({ events: [] })).toBe('none');
    expect(dayStatus({ events: [{ id: 'x', status: 'cancelled' }] })).toBe('none');
    expect(dayStatus({ ...day, conflicts: computeDayConflicts(day) })).toBe('scheduled');
    // Small Party's 3 blackjack only partly loaded -> unscheduled (a warning, not an error).
    const partial = cleanDay();
    partial.allocations = partial.allocations.map(a => (a.event_id === 'eS' && a.size_class === 'blackjack' ? { ...a, quantity: 1 } : a));
    expect(dayStatus({ ...partial, conflicts: computeDayConflicts(partial) })).toBe('unscheduled');
    // Early pickup is an error -> conflict wins.
    const early = cleanDay();
    early.stops = early.stops.map(s => (s.id === 's4' ? { ...s, scheduled_start: '20:00' } : s));
    expect(dayStatus({ ...early, conflicts: computeDayConflicts(early) })).toBe('conflict');
  });

  it('an event without a pull sheet counts as scheduled once it has a stop', () => {
    const ev = { id: 'n', date: DATE };
    expect(dayStatus({ events: [ev], stops: [] })).toBe('unscheduled');
    expect(dayStatus({ events: [ev], stops: [{ event_id: 'n' }] })).toBe('scheduled');
  });

  it('monthStatuses works a whole range from one batch of data', () => {
    const day = cleanDay();
    const runs = day.runs.map(r => ({ ...r, run_date: DATE }));
    const nextDay = { id: 'eN', name: 'Next Day Party', date: '2026-10-07', time: '19:00', end_time: '22:00' };
    const result = monthStatuses({
      ...day, runs, dates: ['2026-10-05', DATE, '2026-10-07'],
      events: [GENEVA, SMALL, nextDay],
      equipmentByEvent: { ...EQUIPMENT, eN: [{ size_class: 'blackjack', quantity: 2 }] }
    });
    expect(result['2026-10-05'].status).toBe('none');
    expect(result[DATE]).toMatchObject({ status: 'scheduled', errors: 0 });
    expect(result[DATE].events.map(e => e.id)).toEqual(['eG', 'eS']);
    expect(result['2026-10-07']).toMatchObject({ status: 'conflict', errors: 1 }); // no truck
  });
});

describe('warehouse loaders', () => {
  const POSITIONS = [{ key: 'blackjack', label: 'Blackjack' }, { key: 'warehouse', label: 'Warehouse' }, { key: 'driver', label: 'Set Up Driver' }];

  it('recognizes the Warehouse position by key or label', () => {
    expect([...warehouseKeys(POSITIONS)]).toEqual(['warehouse']);
    expect([...warehouseKeys([{ key: 'loader', label: 'Warehouse Crew' }])]).toEqual(['loader']);
    expect([...warehouseKeys([{ key: 'blackjack', label: 'Blackjack' }])]).toEqual([]);
  });

  it('only workers with the skill see load sheets; nobody does before the position exists', () => {
    expect(isWarehouseWorker({ skills: ['warehouse'] }, POSITIONS)).toBe(true);
    expect(isWarehouseWorker({ skills: ['driver', 'blackjack'] }, POSITIONS)).toBe(false);
    expect(isWarehouseWorker({ skills: null }, POSITIONS)).toBe(false);
    expect(isWarehouseWorker({ skills: ['warehouse'] }, [{ key: 'blackjack' }])).toBe(false);
  });
});

describe('hasLogisticsRole (worker portal Logistics tab)', () => {
  const POSITIONS = [
    { key: 'blackjack', label: 'Blackjack' }, { key: 'driver', label: 'Set Up Driver' },
    { key: 'set_up', label: 'Set Up' }, { key: 'warehouse', label: 'Warehouse' }
  ];
  it('drivers and set up crew get the Logistics tab; warehouse-only staff and dealers do not', () => {
    expect(hasLogisticsRole({ skills: ['driver'] }, POSITIONS)).toBe(true);
    expect(hasLogisticsRole({ skills: ['set_up'] }, POSITIONS)).toBe(true);
    expect(hasLogisticsRole({ skills: ['warehouse'] }, POSITIONS)).toBe(false);
    expect(isWarehouseWorker({ skills: ['warehouse'] }, POSITIONS)).toBe(true);
    expect(hasLogisticsRole({ skills: ['blackjack'] }, POSITIONS)).toBe(false);
    expect(hasLogisticsRole(null, POSITIONS)).toBe(false);
  });
  it('nobody gets it before the positions exist', () => {
    expect(hasLogisticsRole({ skills: ['driver'] }, [{ key: 'blackjack', label: 'Blackjack' }])).toBe(false);
  });
});

describe('event form positions (crew roles hidden)', () => {
  const POSITIONS = [
    { key: 'blackjack', label: 'Blackjack' }, { key: 'host', label: 'Host' },
    { key: 'driver', label: 'Set Up Driver' }, { key: 'set_up', label: 'Set Up' }, { key: 'warehouse', label: 'Warehouse' }
  ];
  it('crew keys are driver, set up and warehouse', () => {
    expect([...crewPositionKeys(POSITIONS)].sort()).toEqual(['driver', 'set_up', 'warehouse']);
  });
  it('new events are offered dealer positions and Host only', () => {
    expect(eventPositionOptions(POSITIONS, []).map(p => p.key)).toEqual(['blackjack', 'host']);
  });
  it('an event that already has a crew position keeps it listed', () => {
    expect(eventPositionOptions(POSITIONS, [{ key: 'set_up', count: 1 }]).map(p => p.key)).toEqual(['blackjack', 'host', 'set_up']);
  });
});
