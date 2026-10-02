import { describe, it, expect } from 'vitest';
import {
  itemKey, apportion, loadOrderOf, splitEventAcrossLoads, mergeItems, groupItems,
  stopItems, buildLoadSheet, checkTypeForStop, expectedReturns, returnReport, pickupUnlocked
} from './fieldViews';

// Grand Geneva's real pull sheet (231581508), as event_equipment rows.
const GENEVA_ROWS = [
  { line_no: 1, item_name: 'Roulette Table', size_class: 'roulette', quantity: 2, parent_line_no: null },
  { line_no: 2, item_name: 'Roulette Chips', size_class: 'accessory', quantity: 2, parent_line_no: 1 },
  { line_no: 3, item_name: 'Chip Trays', size_class: 'accessory', quantity: 2, parent_line_no: 1 },
  { line_no: 4, item_name: 'Roulette Wheel', size_class: 'accessory', quantity: 2, parent_line_no: 1 },
  { line_no: 5, item_name: "Texas Hold'EM Poker", size_class: 'poker', quantity: 2, parent_line_no: null },
  { line_no: 6, item_name: 'Single Decks of Cards', size_class: 'accessory', quantity: 2, parent_line_no: 5 },
  { line_no: 7, item_name: 'Dealer Pucks', size_class: 'accessory', quantity: 2, parent_line_no: 5 },
  { line_no: 8, item_name: 'Blackjack Table', size_class: 'blackjack', quantity: 8, parent_line_no: null },
  { line_no: 9, item_name: 'Chip Trays', size_class: 'accessory', quantity: 8, parent_line_no: 8 },
  { line_no: 10, item_name: 'Double Decks of Cards', size_class: 'accessory', quantity: 8, parent_line_no: 8 },
  { line_no: 11, item_name: '10ft Craps Table', size_class: 'craps', quantity: 2, parent_line_no: null },
  { line_no: 12, item_name: 'Chip Trays', size_class: 'accessory', quantity: 6, parent_line_no: 11 },
  { line_no: 13, item_name: 'Craps Chip', size_class: 'accessory', quantity: 2, parent_line_no: 11 },
  { line_no: 14, item_name: 'Craps Stick and Dice', size_class: 'accessory', quantity: 2, parent_line_no: 11 }
];

const full = (loadId) => [
  { load_id: loadId, event_id: 'eG', size_class: 'roulette', quantity: 2 },
  { load_id: loadId, event_id: 'eG', size_class: 'poker', quantity: 2 },
  { load_id: loadId, event_id: 'eG', size_class: 'blackjack', quantity: 8 },
  { load_id: loadId, event_id: 'eG', size_class: 'craps', quantity: 2 }
];

const summary = (items) => items.map(i => `${i.quantity} ${i.isAccessory ? '↳ ' : ''}${i.name}`);

describe('helpers', () => {
  it('itemKey distinguishes accessories by parent', () => {
    expect(itemKey('Chip Trays', 'Blackjack Table')).not.toBe(itemKey('Chip Trays', '10ft Craps Table'));
    expect(itemKey('Texas Hold’EM Poker')).toBe(itemKey("texas hold'em poker"));
  });

  it('apportion always sums to the total', () => {
    expect(apportion(8, [5, 3])).toEqual([5, 3]);
    expect(apportion(3, [1, 1])).toEqual([2, 1]);
    expect(apportion(6, [1, 1, 1])).toEqual([2, 2, 2]);
    expect(apportion(5, [0, 0])).toEqual([0, 0]);
    expect(apportion(7, [2, 1]).reduce((a, b) => a + b)).toBe(7);
  });

  it('loadOrderOf sorts by run then trip', () => {
    expect(loadOrderOf([{ id: 'b2', run_id: 'b', sequence: 2 }, { id: 'a1', run_id: 'a', sequence: 1 }, { id: 'b1', run_id: 'b', sequence: 1 }]))
      .toEqual(['a1', 'b1', 'b2']);
  });
});

describe('splitEventAcrossLoads', () => {
  it('one trip gets every item with its accessories', () => {
    const out = splitEventAcrossLoads(GENEVA_ROWS, full('L1'), ['L1']);
    expect(summary(out.L1)).toEqual([
      '2 Roulette Table', '2 ↳ Roulette Chips', '2 ↳ Chip Trays', '2 ↳ Roulette Wheel',
      "2 Texas Hold'EM Poker", '2 ↳ Single Decks of Cards', '2 ↳ Dealer Pucks',
      '8 Blackjack Table', '8 ↳ Chip Trays', '8 ↳ Double Decks of Cards',
      '2 10ft Craps Table', '6 ↳ Chip Trays', '2 ↳ Craps Chip', '2 ↳ Craps Stick and Dice'
    ]);
  });

  it('a split event divides tables and accessories proportionally, adding back up exactly', () => {
    // Black carries 5 blackjack + both craps; Yellow carries 3 blackjack + roulette + poker.
    const allocations = [
      { load_id: 'B', size_class: 'blackjack', quantity: 5 }, { load_id: 'B', size_class: 'craps', quantity: 2 },
      { load_id: 'Y', size_class: 'blackjack', quantity: 3 }, { load_id: 'Y', size_class: 'roulette', quantity: 2 },
      { load_id: 'Y', size_class: 'poker', quantity: 2 }
    ];
    const out = splitEventAcrossLoads(GENEVA_ROWS, allocations, ['B', 'Y']);
    expect(summary(out.B)).toEqual([
      '5 Blackjack Table', '5 ↳ Chip Trays', '5 ↳ Double Decks of Cards',
      '2 10ft Craps Table', '6 ↳ Chip Trays', '2 ↳ Craps Chip', '2 ↳ Craps Stick and Dice'
    ]);
    expect(summary(out.Y)).toEqual([
      '2 Roulette Table', '2 ↳ Roulette Chips', '2 ↳ Chip Trays', '2 ↳ Roulette Wheel',
      "2 Texas Hold'EM Poker", '2 ↳ Single Decks of Cards', '2 ↳ Dealer Pucks',
      '3 Blackjack Table', '3 ↳ Chip Trays', '3 ↳ Double Decks of Cards'
    ]);
  });

  it('uneven accessory ratios still add up (3 chip trays over 2 tables split 1/1)', () => {
    const rows = [
      { line_no: 1, item_name: 'Blackjack Table', size_class: 'blackjack', quantity: 2 },
      { line_no: 2, item_name: 'Chip Trays', size_class: 'accessory', quantity: 3, parent_line_no: 1 }
    ];
    const out = splitEventAcrossLoads(rows, [{ load_id: 'A', size_class: 'blackjack', quantity: 1 }, { load_id: 'B', size_class: 'blackjack', quantity: 1 }], ['A', 'B']);
    expect(out.A[1].quantity + out.B[1].quantity).toBe(3);
  });

  it('partially allocated events only list what is on the trip', () => {
    const out = splitEventAcrossLoads(GENEVA_ROWS, [{ load_id: 'L1', size_class: 'blackjack', quantity: 4 }], ['L1']);
    expect(summary(out.L1)).toEqual(['4 Blackjack Table', '4 ↳ Chip Trays', '4 ↳ Double Decks of Cards']);
  });

  it('over-allocation shows as an extra line', () => {
    const out = splitEventAcrossLoads(GENEVA_ROWS, [...full('L1'), { load_id: 'L1', size_class: 'blackjack', quantity: 1 }], ['L1']);
    expect(out.L1.at(-1)).toMatchObject({ name: 'Blackjack (extra — not on pull sheet)', quantity: 1 });
  });

  it('decor and chairs rows ride as items; packages are skipped', () => {
    const rows = [
      { line_no: 1, item_name: '50 Guests Package', size_class: 'package', quantity: 1 },
      { line_no: 2, item_name: 'Black Folding Chairs', size_class: 'chairs', quantity: 60 },
      { line_no: 3, item_name: 'Red Carpet', size_class: 'decor', quantity: 1 }
    ];
    const out = splitEventAcrossLoads(rows, [{ load_id: 'L', size_class: 'chairs', quantity: 60 }, { load_id: 'L', size_class: 'decor', quantity: 1 }], ['L']);
    expect(summary(out.L)).toEqual(['60 Black Folding Chairs', '1 Red Carpet']);
  });
});

describe('mergeItems / groupItems', () => {
  it('merges by key and nests accessories', () => {
    const merged = mergeItems([
      [{ key: 'a', name: 'Blackjack Table', quantity: 5, isAccessory: false }, { key: 'b', name: 'Chip Trays', parentName: 'Blackjack Table', quantity: 5, isAccessory: true }],
      [{ key: 'a', name: 'Blackjack Table', quantity: 3, isAccessory: false }]
    ]);
    expect(merged.map(i => i.quantity)).toEqual([8, 5]);
    const grouped = groupItems(merged);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].accessories[0].name).toBe('Chip Trays');
  });
});

// A day: Black does Geneva (split blackjack with Yellow) and Small Party on trip 1.
const day = () => ({
  loads: [{ id: 'B1', run_id: 'rB', sequence: 1 }, { id: 'Y1', run_id: 'rY', sequence: 1 }],
  allocations: [
    { load_id: 'B1', event_id: 'eG', size_class: 'blackjack', quantity: 5 },
    { load_id: 'B1', event_id: 'eG', size_class: 'craps', quantity: 2 },
    { load_id: 'Y1', event_id: 'eG', size_class: 'blackjack', quantity: 3 },
    { load_id: 'Y1', event_id: 'eG', size_class: 'roulette', quantity: 2 },
    { load_id: 'Y1', event_id: 'eG', size_class: 'poker', quantity: 2 },
    { load_id: 'B1', event_id: 'eS', size_class: 'blackjack', quantity: 2 }
  ],
  equipmentByEvent: {
    eG: GENEVA_ROWS,
    eS: [
      { line_no: 1, item_name: 'Blackjack Table', size_class: 'blackjack', quantity: 2 },
      { line_no: 2, item_name: 'Chip Trays', size_class: 'accessory', quantity: 2, parent_line_no: 1 }
    ]
  }
});
const STOPS = [
  { id: 'dS', run_id: 'rB', load_id: 'B1', event_id: 'eS', stop_type: 'deliver', sequence: 1 },
  { id: 'dG', run_id: 'rB', load_id: 'B1', event_id: 'eG', stop_type: 'deliver', sequence: 2 },
  { id: 'pG', run_id: 'rB', load_id: null, event_id: 'eG', stop_type: 'pickup', sequence: 3, status: 'planned' }
];

describe('stopItems', () => {
  it('delivery = that trip’s share; pickup = everything that truck brought', () => {
    expect(summary(stopItems(STOPS[1], day()))).toEqual([
      '5 Blackjack Table', '5 ↳ Chip Trays', '5 ↳ Double Decks of Cards',
      '2 10ft Craps Table', '6 ↳ Chip Trays', '2 ↳ Craps Chip', '2 ↳ Craps Stick and Dice'
    ]);
    expect(stopItems(STOPS[2], day())).toHaveLength(7);
    expect(stopItems({ stop_type: 'work', event_id: 'eG' }, day())).toEqual([]);
  });
});

describe('buildLoadSheet', () => {
  it('loads the last stop first', () => {
    const sheet = buildLoadSheet({ id: 'B1' }, day(), STOPS);
    expect(sheet.map(s => [s.eventId, s.loadPosition, s.deliveryOrder])).toEqual([['eG', 1, 2], ['eS', 2, 1]]);
    expect(summary(sheet[1].items)).toEqual(['2 Blackjack Table', '2 ↳ Chip Trays']);
  });
});

describe('returns', () => {
  const ctx = day();
  const key = (name, parent) => itemKey(name, parent);
  const allReturned = () => stopItems(STOPS[2], ctx).map(i => ({ stop_id: 'pG', item_key: i.key, check_type: 'returned', quantity: i.quantity }));

  it('maps stop types to check types', () => {
    expect(checkTypeForStop({ stop_type: 'deliver' })).toBe('delivered');
    expect(checkTypeForStop({ stop_type: 'pickup' })).toBe('returned');
    expect(checkTypeForStop({ stop_type: 'work' })).toBeNull();
  });

  it('pending until the crew starts checking, unchecked once the day has passed', () => {
    expect(returnReport(STOPS[2], ctx, { stops: STOPS, checks: [], runDate: '2026-10-06', today: '2026-10-06' }).state).toBe('pending');
    expect(returnReport(STOPS[2], ctx, { stops: STOPS, checks: [], runDate: '2026-10-06', today: '2026-10-07' }).state).toBe('unchecked');
  });

  it('complete when everything comes back', () => {
    expect(returnReport(STOPS[2], ctx, { stops: STOPS, checks: allReturned(), runDate: '2026-10-06', today: '2026-10-07' }).state).toBe('complete');
  });

  it('flags a short return and unchecked lines once checking has started', () => {
    const checks = allReturned()
      .filter(c => c.item_key !== key('Craps Chip', '10ft Craps Table'))
      .map(c => (c.item_key === key('Chip Trays', 'Blackjack Table') ? { ...c, quantity: 3 } : c));
    const r = returnReport(STOPS[2], ctx, { stops: STOPS, checks, runDate: '2026-10-06', today: '2026-10-06' });
    expect(r.state).toBe('missing');
    expect(r.missing.map(m => [m.name, m.parentName, m.expected, m.returned, m.short])).toEqual([
      ['Chip Trays', 'Blackjack Table', 5, 3, 2],
      ['Craps Chip', '10ft Craps Table', 2, null, 2]
    ]);
  });

  it('marking the pickup done with nothing checked flags everything', () => {
    const r = returnReport({ ...STOPS[2], status: 'done' }, ctx, { stops: STOPS, checks: [], runDate: '2026-10-06', today: '2026-10-06' });
    expect(r.state).toBe('missing');
    expect(r.missing).toHaveLength(7);
  });

  it('expects back what was actually delivered when deliveries were checked', () => {
    // Crew only delivered 4 of the 5 blackjack tables (one left on the truck, say).
    const delivered = [{ stop_id: 'dG', item_key: key('Blackjack Table'), check_type: 'delivered', quantity: 4 }];
    const exp = expectedReturns(STOPS[2], ctx, STOPS, delivered);
    expect(exp.find(i => i.name === 'Blackjack Table').quantity).toBe(4);
  });
});

describe('pickupUnlocked (crew route)', () => {
  const at = (s) => { const [d, t] = s.split(' '); const [y, m, dd] = d.split('-').map(Number); const [h, mi] = t.split(':').map(Number); return new Date(y, m - 1, dd, h, mi); };

  it('stays collapsed until the party starts on the route day', () => {
    expect(pickupUnlocked('2026-10-06', '19:30', at('2026-10-06 15:00'))).toBe(false);
    expect(pickupUnlocked('2026-10-06', '19:30', at('2026-10-06 19:29'))).toBe(false);
    expect(pickupUnlocked('2026-10-06', '19:30', at('2026-10-06 19:30'))).toBe(true);
    expect(pickupUnlocked('2026-10-06', '19:30:00', at('2026-10-06 23:10'))).toBe(true);
  });

  it('stays open after midnight and is collapsed on earlier days', () => {
    expect(pickupUnlocked('2026-10-06', '19:30', at('2026-10-07 00:30'))).toBe(true);
    expect(pickupUnlocked('2026-10-06', '19:30', at('2026-10-01 20:00'))).toBe(false);
  });

  it('never holds back an event without a start time', () => {
    expect(pickupUnlocked('2026-10-06', null)).toBe(true);
    expect(pickupUnlocked(null, '19:30')).toBe(true);
  });
});
