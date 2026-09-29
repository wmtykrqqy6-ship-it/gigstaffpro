import { describe, it, expect } from 'vitest';
import fs from 'fs';
import {
  suggestStaffing, dealersPerTable, buildStaffingMap, staffingFromItems,
  positionCounts, toPositionList, proposeStaffing, staffingWarnings
} from './staffing';

// The live positions setting (read 2026-09-28): positions are named after games.
const LIVE_POSITIONS = [
  { key: '3_card_poker', label: '3 Card Poker' }, { key: 'blackjack', label: 'Blackjack' },
  { key: 'craps', label: 'Craps' }, { key: 'host', label: 'Host' },
  { key: 'let_it_ride', label: 'Let it Ride' }, { key: 'money_wheel', label: 'Money Wheel' },
  { key: 'pai_gow', label: 'Pai Gow' }, { key: 'poker', label: 'Poker' },
  { key: 'roulette', label: 'Roulette' }, { key: "ultimate_hold'em", label: "Ultimate Hold'em" }
];

// Catalog as seeded by the two migrations.
const CATALOG = [
  { goodshuffle_name: 'Blackjack Table', size_class: 'blackjack', position_key: 'blackjack', staff_per_unit: 1 },
  { goodshuffle_name: '10ft Craps Table', size_class: 'craps', position_key: 'craps', staff_per_unit: 2 },
  { goodshuffle_name: 'Roulette Table', size_class: 'roulette', position_key: 'roulette', staff_per_unit: 1 },
  { goodshuffle_name: "Texas Hold'EM Poker", size_class: 'poker', position_key: 'poker', staff_per_unit: 1 },
  { goodshuffle_name: 'Chip Trays', size_class: 'accessory', position_key: null, staff_per_unit: 0 },
  { goodshuffle_name: '50 Guests Package', size_class: 'package', position_key: null, staff_per_unit: 0 }
];
const MAP = buildStaffingMap(CATALOG);

// Grand Geneva pull sheet (231581508), parsed line items.
const GENEVA = [
  { name: 'Roulette Table', quantity: 2 }, { name: 'Chip Trays', quantity: 2, parentIndex: 0 },
  { name: "Texas Hold’EM Poker", quantity: 2 }, // curly apostrophe still matches
  { name: 'Blackjack Table', quantity: 8 }, { name: 'Chip Trays', quantity: 8, parentIndex: 3 },
  { name: '10ft Craps Table', quantity: 2 }
];

describe('staffingFromItems', () => {
  it('Grand Geneva needs 16 dealers: 8 blackjack, 4 craps, 2 roulette, 2 poker', () => {
    expect(staffingFromItems(GENEVA, MAP)).toEqual({ roulette: 2, poker: 2, blackjack: 8, craps: 4 });
  });

  it('works on saved event_equipment rows too (item_name)', () => {
    expect(staffingFromItems([{ item_name: '10ft Craps Table', quantity: 1 }], MAP)).toEqual({ craps: 2 });
  });

  it('packages, accessories and unknown items add no staff', () => {
    expect(staffingFromItems([{ name: '50 Guests Package', quantity: 1 }, { name: 'Mystery', quantity: 3 }], MAP)).toEqual({});
  });
});

describe('suggestStaffing (new catalog items)', () => {
  const s = (name, cls) => suggestStaffing(name, cls, LIVE_POSITIONS);

  it('matches the pull sheet tables to the live positions; craps is 2 dealers', () => {
    expect(s('Blackjack Table', 'blackjack')).toEqual({ position_key: 'blackjack', staff_per_unit: 1 });
    expect(s('8ft Craps Table', 'craps')).toEqual({ position_key: 'craps', staff_per_unit: 2 });
    expect(s('Roulette Table', 'roulette')).toEqual({ position_key: 'roulette', staff_per_unit: 1 });
    expect(s("Texas Hold'EM Poker", 'poker')).toEqual({ position_key: 'poker', staff_per_unit: 1 });
  });

  it('matches other games by name, preferring the most specific', () => {
    expect(s('Let It Ride Table', 'blackjack').position_key).toBe('let_it_ride');
    expect(s('Money Wheel', 'blackjack').position_key).toBe('money_wheel');
    expect(s('3 Card Poker Table', 'blackjack').position_key).toBe('3_card_poker');
    expect(s('Pai Gow Poker Table', 'blackjack').position_key).toBe('pai_gow');
    expect(s("Ultimate Hold'em Table", 'poker').position_key).toBe("ultimate_hold'em");
  });

  it('falls back by size class when no game name matches', () => {
    expect(s('Big Six Table', 'blackjack')).toEqual({ position_key: 'blackjack', staff_per_unit: 1 });
    expect(suggestStaffing('Poker Table', 'poker', [{ key: 'poker_dealer', label: 'Poker Dealer' }]).position_key).toBe('poker_dealer');
    expect(suggestStaffing('Odd Table', 'poker', [{ key: 'dealer', label: 'Dealer' }]).position_key).toBe('dealer');
  });

  it('suggests no staff for non-tables, the host position, or when positions are unknown', () => {
    expect(s('Black Folding Chairs', 'chairs')).toEqual({ position_key: null, staff_per_unit: 0 });
    expect(s('Chip Trays', 'accessory')).toEqual({ position_key: null, staff_per_unit: 0 });
    expect(s('Host Table', 'blackjack').position_key).toBe('blackjack');
    expect(suggestStaffing('Blackjack Table', 'blackjack', [])).toEqual({ position_key: null, staff_per_unit: 0 });
  });

  it('dealersPerTable: craps 2, everything else 1', () => {
    expect(dealersPerTable('craps')).toBe(2);
    expect(dealersPerTable('roulette')).toBe(1);
  });
});

describe('position lists', () => {
  it('round-trips counts and keeps the event’s existing order', () => {
    expect(positionCounts([{ key: 'host', count: 1 }, { key: 'blackjack', count: 8 }, 'legacy-string'])).toEqual({ host: 1, blackjack: 8 });
    expect(toPositionList({ craps: 4, host: 1, poker: 0 }, ['host'])).toEqual([{ key: 'host', count: 1 }, { key: 'craps', count: 4 }]);
  });
});

describe('proposeStaffing', () => {
  it('re-import applies only the table difference, keeping hand-added dealers', () => {
    // Event had 8 blackjack tables but Dylan staffed 10 dealers + a host.
    const current = [{ key: 'blackjack', count: 10 }, { key: 'host', count: 1 }];
    const { positions, changes } = proposeStaffing({
      current, before: { blackjack: 8 }, after: { blackjack: 10, craps: 2 }, mode: 'delta'
    });
    expect(changes).toEqual([{ key: 'blackjack', from: 10, to: 12 }, { key: 'craps', from: 0, to: 2 }]);
    expect(positions).toEqual([{ key: 'blackjack', count: 12 }, { key: 'host', count: 1 }, { key: 'craps', count: 2 }]);
  });

  it('re-import removing tables lowers staff, never below zero', () => {
    const { changes } = proposeStaffing({ current: [{ key: 'roulette', count: 1 }], before: { roulette: 2 }, after: {}, mode: 'delta' });
    expect(changes).toEqual([{ key: 'roulette', from: 1, to: 0 }]);
  });

  it('no table changes -> no staffing changes', () => {
    const s = { blackjack: 3 };
    expect(proposeStaffing({ current: [{ key: 'blackjack', count: 5 }], before: s, after: s }).changes).toEqual([]);
  });

  it('attaching to a manually staffed event only raises, never lowers', () => {
    const { changes } = proposeStaffing({
      current: [{ key: 'blackjack', count: 10 }, { key: 'craps', count: 1 }],
      after: { blackjack: 8, craps: 4 },
      mode: 'atLeast'
    });
    expect(changes).toEqual([{ key: 'craps', from: 1, to: 4 }]);
  });
});

describe('staffingWarnings', () => {
  it('warns when lowering below people already assigned', () => {
    const assignments = [
      { event_id: 'e', position: 'roulette', status: 'confirmed' },
      { event_id: 'e', position: 'roulette', status: 'confirmed' },
      { event_id: 'e', position: 'roulette', status: 'cancelled' }
    ];
    expect(staffingWarnings([{ key: 'roulette', from: 2, to: 1 }], assignments, 'e')).toEqual([{ key: 'roulette', filled: 2, to: 1 }]);
    expect(staffingWarnings([{ key: 'roulette', from: 2, to: 3 }], assignments, 'e')).toEqual([]);
  });
});

describe('staffing seed migration', () => {
  it('seeds live position keys with the same counts suggestStaffing gives', () => {
    const sql = fs.readFileSync(new URL('../../../supabase/migrations/20260930120000_add_catalog_staffing.sql', import.meta.url), 'utf8');
    const seeds = [...sql.matchAll(/position_key = '(\w+)', staff_per_unit = (\d+)\s+WHERE name_key = '((?:[^']|'')+)'/g)]
      .map(m => [m[3].replace(/''/g, "'"), m[1], Number(m[2])]);
    expect(seeds).toEqual([
      ['blackjack table', 'blackjack', 1], ['10ft craps table', 'craps', 2],
      ['roulette table', 'roulette', 1], ["texas hold'em poker", 'poker', 1]
    ]);
    const classes = { blackjack: 'blackjack', craps: 'craps', roulette: 'roulette', poker: 'poker' };
    for (const [name, key, n] of seeds) {
      expect(suggestStaffing(name, classes[key], LIVE_POSITIONS)).toEqual({ position_key: key, staff_per_unit: n });
      expect(LIVE_POSITIONS.map(p => p.key)).toContain(key);
    }
  });
});
