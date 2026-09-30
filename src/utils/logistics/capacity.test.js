import { describe, it, expect } from 'vitest';
import { checkLoadCapacity, checkAllTrucks, summarizeEquipment, worstStatus } from './capacity';

// Seed values from the Delivery Logistics spec.
const YELLOW = { name: 'Yellow', craps_capacity: 1, craps_stretch: 2, roulette_capacity: 2, poker_capacity: 2, blackjack_capacity: 10, can_carry_archway: false, priority: 1, active: true };
const BLACK = { name: 'Black', craps_capacity: 2, craps_stretch: 3, roulette_capacity: 2, poker_capacity: 2, blackjack_capacity: 14, can_carry_archway: false, priority: 2, active: true };
const WHITE = { name: 'White', craps_capacity: 4, craps_stretch: 4, roulette_capacity: 2, poker_capacity: 2, blackjack_capacity: 20, can_carry_archway: true, priority: 3, active: true };
const TRUCKS = [WHITE, YELLOW, BLACK]; // deliberately out of order

// The Pawelek sample pull sheet: 3 blackjack, 1 craps, 1 roulette, 1 poker.
const SAMPLE = { craps: 1, roulette: 1, poker: 1, blackjack: 3 };

describe('checkLoadCapacity', () => {
  it('sample pull sheet is green on Yellow', () => {
    const r = checkLoadCapacity(YELLOW, SAMPLE);
    expect(r.status).toBe('green');
    expect(r.reasons).toEqual([]);
    expect(r.zones.craps).toMatchObject({ used: 1, capacity: 1, stretch: 2 });
    expect(r.zones.roulette).toMatchObject({ used: 1, capacity: 2 });
    expect(r.zones.poker).toMatchObject({ used: 1, capacity: 2 });
    expect(r.zones.blackjack).toMatchObject({ used: 3, capacity: 10 });
  });

  it('poker tournament overflow goes into the blackjack zone without a warning', () => {
    const r = checkLoadCapacity(YELLOW, { poker: 8 });
    expect(r.status).toBe('green');
    expect(r.zones.poker).toMatchObject({ used: 2, overflow: 6 });
    expect(r.zones.blackjack.used).toBe(6);
    expect(r.zones.blackjack.breakdown.fromPoker).toBe(6);
  });

  it('roulette overflow also costs 1 blackjack slot each', () => {
    const r = checkLoadCapacity(YELLOW, { roulette: 4, blackjack: 8 });
    expect(r.status).toBe('green');
    expect(r.zones.blackjack.used).toBe(10);
  });

  it('poker overflow that fills the blackjack zone spills into craps as a warning', () => {
    // 8 poker -> 6 overflow + 6 blackjack = 12 demand in a 10-slot zone, 2 over -> 1 craps unit.
    const r = checkLoadCapacity(YELLOW, { poker: 8, blackjack: 6 });
    expect(r.status).toBe('yellow');
    expect(r.zones.craps.used).toBe(1);
    expect(r.zones.craps.breakdown.blackjackUnits).toBe(1);
    expect(r.reasons.join(' ')).toMatch(/2 blackjack-size tables riding in the craps zone/);
  });

  describe('chairs', () => {
    it('1–50 chairs take one full craps unit', () => {
      expect(checkLoadCapacity(YELLOW, { chairs: 1 }).zones.craps.used).toBe(1);
      expect(checkLoadCapacity(YELLOW, { chairs: 50 }).zones.craps.used).toBe(1);
      expect(checkLoadCapacity(YELLOW, { chairs: 50 }).status).toBe('green');
    });

    it('51 chairs take two units (no partial slots) -> stretch warning on Yellow', () => {
      const r = checkLoadCapacity(YELLOW, { chairs: 51 });
      expect(r.zones.craps.used).toBe(2);
      expect(r.zones.craps.breakdown.chairUnits).toBe(2);
      expect(r.status).toBe('yellow');
    });

    it('chairs plus a craps table share the craps zone', () => {
      const r = checkLoadCapacity(BLACK, { craps: 1, chairs: 40 });
      expect(r.zones.craps.used).toBe(2);
      expect(r.status).toBe('green');
    });

    it('101 chairs need 3 units -> red on Yellow', () => {
      const r = checkLoadCapacity(YELLOW, { chairs: 101 });
      expect(r.status).toBe('red');
      expect(r.reasons[0]).toMatch(/needs 3 units but holds 2 max even with stretch/);
    });

    it('zero chairs cost nothing', () => {
      expect(checkLoadCapacity(YELLOW, { chairs: 0 }).zones.craps.used).toBe(0);
    });
  });

  it('blackjack spilling into free craps units rounds up at 6 per unit', () => {
    // Black: 14 blackjack slots, 16 tables -> 2 over -> 1 craps unit.
    const r = checkLoadCapacity(BLACK, { blackjack: 16 });
    expect(r.status).toBe('yellow');
    expect(r.zones.blackjack).toMatchObject({ used: 14, overflow: 2 });
    expect(r.zones.craps.used).toBe(1);
    expect(r.reasons[0]).toMatch(/not ideal/);

    // 7 over -> 2 units.
    expect(checkLoadCapacity(BLACK, { blackjack: 21 }).zones.craps.used).toBe(2);
  });

  it('stretch craps on Yellow: 2 craps is a warning', () => {
    const r = checkLoadCapacity(YELLOW, { craps: 2 });
    expect(r.status).toBe('yellow');
    expect(r.reasons).toEqual(['Craps zone at 2/1 — using stretch space (max 2)']);
  });

  it('stretch craps on Black: 3 craps is a warning, 4 is an error', () => {
    expect(checkLoadCapacity(BLACK, { craps: 2 }).status).toBe('green');
    expect(checkLoadCapacity(BLACK, { craps: 3 }).status).toBe('yellow');
    expect(checkLoadCapacity(BLACK, { craps: 4 }).status).toBe('red');
  });

  it('White has no stretch: 4 craps is green, 5 is red', () => {
    expect(checkLoadCapacity(WHITE, { craps: 4 }).status).toBe('green');
    const r = checkLoadCapacity(WHITE, { craps: 5 });
    expect(r.status).toBe('red');
    expect(r.reasons[0]).not.toMatch(/even with stretch/);
  });

  it('archway on Yellow is red even when everything else fits', () => {
    const r = checkLoadCapacity(YELLOW, { ...SAMPLE, archway: 1 });
    expect(r.status).toBe('red');
    expect(r.reasons[0]).toMatch(/Archway/);
    expect(checkLoadCapacity(WHITE, { ...SAMPLE, archway: 1 }).status).toBe('green');
  });

  it('over-capacity load is red on every truck', () => {
    const big = { craps: 3, blackjack: 30, roulette: 2, poker: 2, chairs: 100 };
    // craps 3 + chairs 2 + blackjack overflow on White (30-20=10 -> 2 units) = 7 > 4.
    for (const truck of TRUCKS) {
      expect(checkLoadCapacity(truck, big).status).toBe('red');
    }
  });

  it('decor has no capacity cost', () => {
    expect(checkLoadCapacity(YELLOW, { decor: 40 }).status).toBe('green');
  });

  it('treats a misconfigured stretch below capacity as no stretch', () => {
    const odd = { ...YELLOW, craps_capacity: 2, craps_stretch: 1 };
    expect(checkLoadCapacity(odd, { craps: 2 }).status).toBe('green');
    expect(checkLoadCapacity(odd, { craps: 3 }).status).toBe('red');
  });
});

describe('checkAllTrucks', () => {
  it('suggests Yellow for the sample', () => {
    const { suggestion, results } = checkAllTrucks(TRUCKS, SAMPLE);
    expect(results.map(r => r.truck.name)).toEqual(['Yellow', 'Black', 'White']);
    expect(suggestion.truck.name).toBe('Yellow');
  });

  it('skips a yellow-status truck for the first green one', () => {
    expect(checkAllTrucks(TRUCKS, { craps: 2 }).suggestion.truck.name).toBe('Black');
    expect(checkAllTrucks(TRUCKS, { craps: 3 }).suggestion.truck.name).toBe('White');
  });

  it('real pull sheets: Weimer Bearing fits Yellow, Grand Geneva needs Black', () => {
    // 231273157: 3 blackjack, 1 roulette, 1 craps, 2 poker.
    expect(checkAllTrucks(TRUCKS, { blackjack: 3, roulette: 1, craps: 1, poker: 2 }).suggestion.truck.name).toBe('Yellow');
    // 231581508: 2 roulette, 2 poker, 8 blackjack, 2 craps — 2 craps is stretch on Yellow.
    const geneva = { roulette: 2, poker: 2, blackjack: 8, craps: 2 };
    const { results, suggestion } = checkAllTrucks(TRUCKS, geneva);
    expect(results.map(r => r.status)).toEqual(['yellow', 'green', 'green']);
    expect(suggestion.truck.name).toBe('Black');
  });

  it('suggests White for an archway', () => {
    expect(checkAllTrucks(TRUCKS, { ...SAMPLE, archway: 1 }).suggestion.truck.name).toBe('White');
  });

  it('falls back to the first yellow when nothing is green', () => {
    // 26 blackjack: Yellow 16 over -> 3 units (red); Black 12 over -> 2 units
    // (yellow); White 6 over -> 1 unit (yellow). First yellow in priority wins.
    const { suggestion } = checkAllTrucks(TRUCKS, { blackjack: 26 });
    expect(suggestion.truck.name).toBe('Black');
    expect(suggestion.status).toBe('yellow');
  });

  it('returns no suggestion when nothing fits', () => {
    expect(checkAllTrucks(TRUCKS, { craps: 9 }).suggestion).toBeNull();
  });

  it('never suggests the Personal vehicle row', () => {
    const car = { name: 'Personal vehicle', kind: 'personal', craps_capacity: 9, craps_stretch: 9, roulette_capacity: 9, poker_capacity: 9, blackjack_capacity: 99, priority: 0 };
    const { results, suggestion } = checkAllTrucks([...TRUCKS, car], SAMPLE);
    expect(results.map(r => r.truck.name)).toEqual(['Yellow', 'Black', 'White']);
    expect(suggestion.truck.name).toBe('Yellow');
  });

  it('ignores inactive trucks', () => {
    const trucks = [{ ...YELLOW, active: false }, BLACK, WHITE];
    expect(checkAllTrucks(trucks, SAMPLE).suggestion.truck.name).toBe('Black');
  });
});

describe('summarizeEquipment', () => {
  it('sums by size class and skips accessories, packages and ignored lines', () => {
    const counts = summarizeEquipment([
      { size_class: 'package', quantity: 1 },
      { size_class: 'blackjack', quantity: 3 },
      { size_class: 'accessory', quantity: 3, parentIndex: 1 },
      { size_class: 'craps', quantity: 1 },
      { size_class: 'blackjack', quantity: 2 },
      { size_class: 'chairs', quantity: 60 },
      { size_class: 'decor', quantity: 4 },
      { size_class: 'ignore', quantity: 1 }
    ]);
    expect(counts).toEqual({ craps: 1, roulette: 0, poker: 0, blackjack: 5, chairs: 60, archway: 0, decor: 4 });
  });
});

describe('worstStatus', () => {
  it('returns the most severe status', () => {
    expect(worstStatus([])).toBe('green');
    expect(worstStatus(['green', 'yellow'])).toBe('yellow');
    expect(worstStatus(['yellow', 'red', 'green'])).toBe('red');
  });
});
