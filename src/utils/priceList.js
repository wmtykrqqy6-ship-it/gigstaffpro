// Price list (CRM Phase 2 step 1, docs/QUOTES.md). Rows come from
// public.price_items (admin-only), edited in Settings > Prices.

export const PRICE_CATEGORIES = [
  { id: 'table', label: 'Tables' },
  { id: 'package', label: 'Packages' },
  { id: 'staff', label: 'Staff' },
  { id: 'fee', label: 'Delivery and fees' },
  { id: 'addon', label: 'Add-ons' },
  { id: 'event', label: 'Events' },
  { id: 'discount', label: 'Discounts' }
];

export const PRICE_UNITS = [
  { id: 'each', label: 'each' },
  { id: 'table', label: 'per table' },
  { id: 'dealer', label: 'per dealer' },
  { id: 'dealer_hour', label: 'per dealer per hour' },
  { id: 'event', label: 'per event' },
  { id: 'custom', label: 'priced each time' }
];

// "Any bonus game" inside a package's contents.
export const BONUS_KEY = 'bonus';

const CATEGORY_IDS = new Set(PRICE_CATEGORIES.map(c => c.id));
const UNIT_IDS = new Set(PRICE_UNITS.map(u => u.id));
const KEY_REGEX = /^[a-z0-9_]{2,40}$/;

export const unitLabel = (unit) => PRICE_UNITS.find(u => u.id === unit)?.label || 'each';

export function formatPrice(price) {
  if (price === null || price === undefined || price === '') return 'Priced each time';
  const n = Number(price);
  if (!Number.isFinite(n)) return 'Priced each time';
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return `${n < 0 ? '-' : ''}$${abs}`;
}

// A key for a new item: from its name, made unique against `taken`.
export function makeItemKey(name, taken = []) {
  const used = new Set(taken);
  const slug = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 34);
  const base = slug.length >= 2 ? slug : 'item';
  let key = base;
  for (let i = 2; used.has(key); i += 1) key = `${base}_${i}`;
  return key;
}

// Package contents -> [{ key, qty }] with whole positive quantities only.
export function normalizeContents(contents) {
  if (!Array.isArray(contents)) return [];
  const byKey = new Map();
  for (const c of contents) {
    const key = String(c?.key || '');
    const qty = Math.floor(Number(c?.qty));
    if (!KEY_REGEX.test(key) || !(qty > 0)) continue;
    byKey.set(key, Math.min((byKey.get(key) || 0) + qty, 500));
  }
  return [...byKey].map(([key, qty]) => ({ key, qty }));
}

// "3 Blackjack Table, 1 Roulette Table, 1 bonus game"
export function packageSummary(contents, items = []) {
  const names = new Map((items || []).map(i => [i.key, i.name]));
  return normalizeContents(contents)
    .map(({ key, qty }) => (key === BONUS_KEY ? `${qty} bonus game${qty === 1 ? '' : 's'}` : `${qty} ${names.get(key) || key}`))
    .join(', ');
}

// Check and tidy an item before saving. Returns { item } or { error }.
export function validatePriceItem(input, { takenKeys = [] } = {}) {
  const name = String(input?.name || '').trim();
  if (!name) return { error: 'Give the item a name.' };
  if (name.length > 120) return { error: 'Keep the name under 120 characters.' };
  const category = CATEGORY_IDS.has(input?.category) ? input.category : null;
  if (!category) return { error: 'Pick a category.' };
  const unit = UNIT_IDS.has(input?.unit) ? input.unit : 'each';
  let price = null;
  if (unit !== 'custom' && input?.price !== '' && input?.price !== null && input?.price !== undefined) {
    price = Math.round(Number(input.price) * 100) / 100;
    if (!Number.isFinite(price) || price < -100000 || price > 1000000) return { error: 'Enter a price in dollars.' };
  }
  const dealers = Math.floor(Number(input?.dealers) || 0);
  if (dealers < 0 || dealers > 20) return { error: 'Dealers must be between 0 and 20.' };
  const description = String(input?.description || '').trim();
  if (description.length > 2000) return { error: 'Keep the description under 2,000 characters.' };
  const photo = String(input?.photo_url || '').trim();
  if (photo && !/^https:\/\/\S+$/.test(photo)) return { error: 'The photo link must start with https://' };
  const size = String(input?.size || '').trim().slice(0, 120);
  const key = KEY_REGEX.test(String(input?.key || '')) ? input.key : makeItemKey(name, takenKeys);
  return {
    item: {
      key,
      category,
      name,
      unit,
      price,
      dealers: category === 'table' ? dealers : 0,
      size: size || null,
      taxable: input?.taxable !== false,
      bonus_game: category === 'table' && !!input?.bonus_game,
      contents: category === 'package' ? normalizeContents(input?.contents) : null,
      description: description || null,
      photo_url: photo || null,
      active: input?.active !== false,
      sort_order: Math.floor(Number(input?.sort_order) || 0)
    }
  };
}

// Items grouped by category (in PRICE_CATEGORIES order), each sorted.
export function groupPriceItems(items) {
  const sorted = [...(items || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.name).localeCompare(String(b.name)));
  return PRICE_CATEGORIES.map(c => ({ ...c, items: sorted.filter(i => i.category === c.id) }));
}
