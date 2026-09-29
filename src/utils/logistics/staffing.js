// ============================================
// STAFFING FROM PULL SHEETS (pure)
// ============================================
// Each catalog item can say which position it needs and how many per unit
// (e.g. 10ft Craps Table -> 2 craps_dealer). Importing a pull sheet turns
// its tables into a suggested staffing list for the event.
//
// Rules (confirmed with Dylan 2026-09-28):
//   - New events are prefilled; the admin can add dealers before saving
//     (bigger events sometimes get extra).
//   - An existing event's staffing is never changed without asking. When a
//     re-import changes the tables, the proposal applies only the difference
//     from the tables, so dealers someone added by hand are kept.
import { normalizeItemName } from './catalog';
import { isAssignmentFilled } from '../positionHelpers';

// Only game tables get staff suggested automatically; everything else
// (chairs, decor, accessories, packages) starts with none.
const TABLE_CLASSES = ['craps', 'roulette', 'poker', 'blackjack'];
const NONE = { position_key: null, staff_per_unit: 0 };

// Dealers per table, from the Goodshuffle descriptions ("comes with one
// dealer", "includes two dealers"): craps is 2, every other game is 1.
export const dealersPerTable = (positionKey) => (/craps/i.test(positionKey || '') ? 2 : 1);

const phrase = (s) => normalizeItemName(String(s || '').replace(/_/g, ' ')).replace(/\s*dealer$/, '');
const containsWords = (haystack, needle) =>
  needle && new RegExp(`(^|[^a-z0-9'])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9'])`).test(haystack);

// Suggested staffing for a newly classified item, using the app's own
// positions (Settings -> Positions; Vegas on Wheels names them after games:
// blackjack, craps, roulette, poker, let_it_ride, money_wheel, ...).
//   1. A position whose name appears in the item name wins -- the longest
//      match, so "3 Card Poker Table" -> 3 Card Poker, not Poker.
//   2. Otherwise fall back by size class: "<class>_dealer", "<class>", "dealer".
export function suggestStaffing(itemName, sizeClass, positions = []) {
  if (!TABLE_CLASSES.includes(sizeClass) || !positions?.length) return NONE;
  const name = normalizeItemName(itemName);
  let best = null;
  for (const p of positions) {
    if (p.key === 'host') continue;
    for (const candidate of [phrase(p.label), phrase(p.key)]) {
      if (candidate && containsWords(name, candidate) && (!best || candidate.length > best.len)) {
        best = { key: p.key, len: candidate.length };
      }
    }
  }
  if (!best) {
    const keys = new Set(positions.map(p => p.key));
    const key = [`${sizeClass}_dealer`, sizeClass, 'dealer'].find(k => keys.has(k));
    if (!key) return NONE;
    best = { key };
  }
  return { position_key: best.key, staff_per_unit: dealersPerTable(best.key) };
}

// name_key -> { position_key, staff_per_unit } from catalog rows.
export function buildStaffingMap(catalogRows = []) {
  const map = new Map();
  for (const row of catalogRows) {
    if (row.position_key && row.staff_per_unit > 0) {
      map.set(normalizeItemName(row.goodshuffle_name), { position_key: row.position_key, staff_per_unit: row.staff_per_unit });
    }
  }
  return map;
}

// Items (parsed line items or event_equipment rows) -> { positionKey: count }.
export function staffingFromItems(items = [], staffingMap = new Map()) {
  const counts = {};
  for (const item of items) {
    const s = staffingMap.get(normalizeItemName(item.name ?? item.item_name));
    if (!s) continue;
    const qty = Math.max(0, Math.floor(Number(item.quantity) || 0));
    counts[s.position_key] = (counts[s.position_key] || 0) + qty * s.staff_per_unit;
  }
  return counts;
}

// Event positions ([{ key, count }]) -> { key: count }.
export function positionCounts(eventPositions = []) {
  const counts = {};
  for (const p of eventPositions || []) {
    if (p && typeof p === 'object' && p.key) counts[p.key] = (counts[p.key] || 0) + (Number(p.count) || 0);
  }
  return counts;
}

export function toPositionList(counts, order = []) {
  const keys = [...new Set([...order, ...Object.keys(counts)])];
  return keys.filter(k => counts[k] > 0).map(k => ({ key: k, count: counts[k] }));
}

// Propose new staffing for an existing event.
//   mode 'delta'   (re-import of the same pull sheet): current + (after - before)
//   mode 'atLeast' (attaching a pull sheet to a manually staffed event):
//                  never lower anything, raise to what the tables need
// Returns { positions, changes: [{ key, from, to }] }.
export function proposeStaffing({ current = [], before = {}, after = {}, mode = 'delta' }) {
  const cur = positionCounts(current);
  const keys = new Set([...Object.keys(cur), ...Object.keys(before), ...Object.keys(after)]);
  const next = {};
  for (const k of keys) {
    const c = cur[k] || 0;
    next[k] = mode === 'atLeast'
      ? Math.max(c, after[k] || 0)
      : Math.max(0, c + (after[k] || 0) - (before[k] || 0));
  }
  const changes = [...keys]
    .filter(k => (cur[k] || 0) !== next[k])
    .map(k => ({ key: k, from: cur[k] || 0, to: next[k] }));
  return { positions: toPositionList(next, (current || []).map(p => p?.key).filter(Boolean)), changes };
}

// Lowering a position below the number of people already on it needs a
// heads-up (the extra assignments aren't removed automatically).
export function staffingWarnings(changes = [], assignments = [], eventId) {
  const warnings = [];
  for (const c of changes) {
    if (c.to >= c.from) continue;
    const filled = assignments.filter(a => a.event_id === eventId && a.position === c.key && isAssignmentFilled(a.status)).length;
    if (filled > c.to) warnings.push({ key: c.key, filled, to: c.to });
  }
  return warnings;
}
