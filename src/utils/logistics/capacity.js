// ============================================
// TRUCK CAPACITY CHECK (per load)
// ============================================
// A "load" is one trip out of the warehouse. It can carry gear for several
// events, so capacity is checked per load, never per day (trucks reload).
//
// Every truck has four zones: craps, roulette, poker, blackjack. Rules:
//   - Craps zone units = craps tables + ceil(chairs / 50).
//   - Roulette/poker fill their own zone first; overflow goes to the
//     blackjack zone at 1 blackjack slot each (normal, no warning).
//   - Blackjack-size tables (plus that overflow) fill the blackjack zone;
//     anything left rides in free craps units at 6 per unit -> warning.
//   - Craps usage above craps_capacity, up to craps_stretch -> warning.
//   - Craps usage above craps_stretch -> error.
//   - Archway on a truck that can't carry it -> error.
//   - Decor has no capacity cost (listed on the load sheet only).

export const SIZE_CLASSES = [
  'craps', 'roulette', 'poker', 'blackjack', 'chairs',
  'archway', 'decor', 'accessory', 'package', 'ignore'
];

export const CHAIRS_PER_CRAPS_UNIT = 50;
export const BLACKJACK_PER_CRAPS_UNIT = 6;

const n = (v) => Math.max(0, Math.floor(Number(v) || 0));

// Sum equipment rows ({ size_class, quantity }) into load counts. Accessories,
// packages and ignored lines carry no capacity cost and are skipped. Goes by
// size_class alone, so an indented line someone deliberately classified as a
// table still counts.
export function summarizeEquipment(items = []) {
  const counts = { craps: 0, roulette: 0, poker: 0, blackjack: 0, chairs: 0, archway: 0, decor: 0 };
  for (const item of items) {
    if (!item) continue;
    const cls = item.size_class;
    if (cls in counts) counts[cls] += n(item.quantity);
  }
  return counts;
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

// Pure capacity check for one load on one truck.
// Returns { status: 'green'|'yellow'|'red', reasons: string[], zones }.
export function checkLoadCapacity(truck, load) {
  const craps = n(load.craps);
  const roulette = n(load.roulette);
  const poker = n(load.poker);
  const blackjack = n(load.blackjack);
  const chairs = n(load.chairs);
  const archway = n(load.archway);

  const crapsCap = n(truck.craps_capacity);
  const crapsStretch = Math.max(crapsCap, n(truck.craps_stretch));
  const rouletteCap = n(truck.roulette_capacity);
  const pokerCap = n(truck.poker_capacity);
  const blackjackCap = n(truck.blackjack_capacity);

  const chairUnits = Math.ceil(chairs / CHAIRS_PER_CRAPS_UNIT);

  const rouletteInZone = Math.min(roulette, rouletteCap);
  const rouletteOverflow = roulette - rouletteInZone;
  const pokerInZone = Math.min(poker, pokerCap);
  const pokerOverflow = poker - pokerInZone;

  const blackjackDemand = blackjack + rouletteOverflow + pokerOverflow;
  const blackjackInZone = Math.min(blackjackDemand, blackjackCap);
  const blackjackOverflow = blackjackDemand - blackjackInZone;
  const blackjackCrapsUnits = Math.ceil(blackjackOverflow / BLACKJACK_PER_CRAPS_UNIT);

  const crapsUsed = craps + chairUnits + blackjackCrapsUnits;

  const errors = [];
  const warnings = [];

  if (archway > 0 && !truck.can_carry_archway) {
    errors.push(`Archway only fits on a truck that can carry it — not ${truck.name || 'this truck'}`);
  }

  if (crapsUsed > crapsStretch) {
    const parts = [];
    if (craps) parts.push(plural(craps, 'craps table'));
    if (chairUnits) parts.push(`${chairs} chairs (${plural(chairUnits, 'unit')})`);
    if (blackjackCrapsUnits) parts.push(`${blackjackOverflow} blackjack-size overflow (${plural(blackjackCrapsUnits, 'unit')})`);
    errors.push(
      `Craps zone needs ${crapsUsed} units but holds ${crapsStretch} max` +
      (crapsStretch > crapsCap ? ' even with stretch' : '') +
      (parts.length ? ` — ${parts.join(' + ')}` : '')
    );
  } else {
    if (crapsUsed > crapsCap) {
      warnings.push(`Craps zone at ${crapsUsed}/${crapsCap} — using stretch space (max ${crapsStretch})`);
    }
    if (blackjackCrapsUnits > 0) {
      warnings.push(
        `${plural(blackjackOverflow, 'blackjack-size table')} riding in the craps zone ` +
        `(${plural(blackjackCrapsUnits, 'unit')}) — allowed but not ideal`
      );
    }
  }

  const status = errors.length ? 'red' : warnings.length ? 'yellow' : 'green';

  return {
    status,
    reasons: [...errors, ...warnings],
    zones: {
      craps: {
        used: crapsUsed,
        capacity: crapsCap,
        stretch: crapsStretch,
        breakdown: { tables: craps, chairUnits, blackjackUnits: blackjackCrapsUnits }
      },
      roulette: { used: rouletteInZone, capacity: rouletteCap, overflow: rouletteOverflow },
      poker: { used: pokerInZone, capacity: pokerCap, overflow: pokerOverflow },
      blackjack: {
        used: blackjackInZone,
        capacity: blackjackCap,
        breakdown: { tables: blackjack, fromRoulette: rouletteOverflow, fromPoker: pokerOverflow },
        overflow: blackjackOverflow
      }
    }
  };
}

const STATUS_RANK = { green: 0, yellow: 1, red: 2 };

// Check a load against every active truck in priority order (Yellow -> Black
// -> White) and suggest the first one where it's green. If no truck is green,
// fall back to the first yellow so the UI can still point somewhere, flagged.
export function checkAllTrucks(trucks = [], load) {
  const ordered = trucks
    .filter(t => t.active !== false)
    .slice()
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

  const results = ordered.map(truck => ({ truck, ...checkLoadCapacity(truck, load) }));
  const suggestion =
    results.find(r => r.status === 'green') ||
    results.find(r => r.status === 'yellow') ||
    null;

  return { results, suggestion };
}

export function worstStatus(statuses = []) {
  return statuses.reduce((worst, s) => (STATUS_RANK[s] > STATUS_RANK[worst] ? s : worst), 'green');
}
