// ============================================
// EQUIPMENT CATALOG — Goodshuffle item name -> size class
// ============================================
import { SIZE_CLASSES } from './capacity';

export const SIZE_CLASS_LABELS = {
  craps: 'Craps table',
  roulette: 'Roulette table',
  poker: 'Poker table',
  blackjack: 'Blackjack-size table',
  chairs: 'Chairs',
  archway: 'Archway',
  decor: 'Decor (no capacity cost)',
  accessory: 'Accessory (rides with its table)',
  package: 'Package (tables listed separately)',
  ignore: 'Ignore'
};

export { SIZE_CLASSES };

// Case/quote/whitespace-insensitive key so "Texas Hold’EM Poker" and
// "texas hold'em  poker" hit the same catalog row.
export function normalizeItemName(name) {
  return String(name || '')
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function buildCatalogMap(rows = []) {
  const map = new Map();
  for (const row of rows) map.set(normalizeItemName(row.goodshuffle_name), row.size_class);
  return map;
}

// Best guess for an unrecognized item, shown preselected when asking the
// user to classify it. Anything table-like defaults to blackjack size.
export function suggestSizeClass(name, isAccessory = false) {
  const n = normalizeItemName(name);
  if (/\bpackage\b/.test(n)) return 'package';
  if (/\bcraps\b/.test(n) && /\btable\b/.test(n)) return 'craps';
  if (/\broulette\b/.test(n) && /\btable\b/.test(n)) return 'roulette';
  if (/\bpoker\b|hold'?em/.test(n) && !/\b(chips?|cards?|pucks?|buttons?)\b/.test(n)) return 'poker';
  if (/\bchairs?\b/.test(n)) return 'chairs';
  if (/\barch(way)?\b/.test(n)) return 'archway';
  if (isAccessory) return 'accessory';
  if (/\btable\b/.test(n)) return 'blackjack';
  return 'decor';
}

// Attach a size class to each parsed line item. Returns the classified items
// plus the distinct names the catalog doesn't know yet (each asked once).
export function classifyLineItems(lineItems = [], catalogMap = new Map()) {
  const unknownByKey = new Map();
  const items = lineItems.map(item => {
    const key = normalizeItemName(item.name);
    const known = catalogMap.get(key);
    if (!known && !unknownByKey.has(key)) {
      unknownByKey.set(key, { name: item.name, suggestion: suggestSizeClass(item.name, item.isAccessory) });
    }
    return { ...item, size_class: known || null };
  });
  return { items, unknown: [...unknownByKey.values()] };
}

// Apply the user's answers ({ normalizedName: size_class }) to classified items.
export function applyClassifications(items, answers = {}) {
  return items.map(item =>
    item.size_class ? item : { ...item, size_class: answers[normalizeItemName(item.name)] || null }
  );
}
