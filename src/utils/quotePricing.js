// Quote pricing (CRM Phase 2 step 2, docs/QUOTES.md). Pure functions: the
// quote builder uses them in the browser, and the client's quote page will
// use the same rules on the server.
//
// A quote is a list of lines the rep picked (tables, packages, add-ons,
// custom lines) plus lines the rules add on their own ("auto" lines):
//   delivery     Standard Delivery ($350), or the past-30-miles fee ($450)
//   travel       $75 per dealer past 30 miles
//   extra_hours  per dealer per hour past 3 hours ($75 + tax booked ahead,
//                $80 tax included when added at the event)
//   fundraiser   $50 off per table
// Each rule reads its price from the price list by key, so a price change in
// Settings > Prices changes new quotes. A rep can turn a rule off per quote.

import { BONUS_KEY, normalizeContents } from './priceList.js';

export const STANDARD_HOURS = 3;
export const TRAVEL_FREE_MILES = 30;
export const DEPOSIT_SHARE = 0.5;
export const BALANCE_DAYS_BEFORE = 7;
export const MAX_LINES = 100;

export const AUTO_RULES = [
  { id: 'delivery', label: 'Delivery and setup' },
  { id: 'travel', label: 'Dealer travel (past 30 miles)' },
  { id: 'extra_hours', label: 'Extra hours' },
  { id: 'fundraiser', label: 'Fundraiser discount' }
];

export const cents = (n) => Math.round((Number(n) || 0) * 100) / 100;

// "19:00" + "22:30" -> 3.5. Past midnight counts as the next day. 0 if unknown.
export function partyHours(start, end) {
  const toMin = (t) => {
    const m = String(t || '').match(/^(\d{1,2}):(\d{2})$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const a = toMin(start);
  const b = toMin(end);
  if (a === null || b === null) return 0;
  const diff = b > a ? b - a : b + 24 * 60 - a;
  return Math.round((diff / 60) * 100) / 100;
}

// "7:00 PM", "7pm", "19:00" -> "19:00" (or '' when it can't tell). Leads
// keep the start time as the client typed it on the quote form.
export function toTime24(text) {
  const m = String(text || '').trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/);
  if (!m) return '';
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  const ap = m[3] ? m[3][0] : '';
  if (min > 59 || h > 23 || (ap && (h < 1 || h > 12))) return '';
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  if (!ap && !m[2]) return '';
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

// "19:00" -> "7:00 PM"
export function formatTime12(t) {
  const m = String(t || '').match(/^(\d{2}):(\d{2})$/);
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

// YYYY-MM-DD seven days before the event (or null).
export function balanceDueDate(eventDate) {
  const m = String(eventDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() - BALANCE_DAYS_BEFORE);
  return d.toISOString().slice(0, 10);
}

let seq = 0;
export const newLineId = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

// A quote line from a price list item.
export function lineFromItem(item, qty = 1) {
  return {
    id: newLineId(),
    key: item.key,
    category: item.category,
    name: item.name,
    description: item.description || null,
    size: item.size || null,
    photo_url: item.photo_url || null,
    unit: item.unit || 'each',
    qty: Number(qty) || 1,
    unit_price: item.price === null || item.price === undefined ? 0 : Number(item.price),
    dealers: item.category === 'table' ? Number(item.dealers) || 0 : 0,
    taxable: item.taxable !== false,
    contents: item.category === 'package' ? normalizeContents(item.contents) : null
  };
}

export function customLine({ name = '', unitPrice = 0, qty = 1, taxable = true } = {}) {
  return { id: newLineId(), key: null, category: 'custom', name, description: null, unit: 'each', qty, unit_price: unitPrice, dealers: 0, taxable, contents: null };
}

// Tables and dealers the quote's picked lines need (packages included; a
// bonus game counts as one table with one dealer).
export function countTablesAndDealers(lines, items = []) {
  const byKey = new Map((items || []).map(i => [i.key, i]));
  let tables = 0;
  let dealers = 0;
  for (const l of lines || []) {
    if (!l || l.auto) continue;
    const qty = Math.max(0, Number(l.qty) || 0);
    if (l.category === 'table') {
      tables += qty;
      dealers += qty * (Number(l.dealers) || 0);
    } else if (l.category === 'package') {
      for (const c of normalizeContents(l.contents)) {
        const per = c.key === BONUS_KEY ? 1 : (Number(byKey.get(c.key)?.dealers) || 1);
        tables += c.qty * qty;
        dealers += c.qty * qty * per;
      }
    }
  }
  return { tables, dealers };
}

function autoLine(rule, item, qty) {
  if (!item || item.price === null || item.price === undefined || !(qty > 0)) return null;
  return { ...lineFromItem(item, cents(qty)), id: `auto_${rule}`, auto: rule };
}

// The lines the rules add for this quote.
export function autoLines(lines, ctx = {}) {
  const items = ctx.items || [];
  const byKey = new Map(items.map(i => [i.key, i]));
  const off = new Set(ctx.autoOff || []);
  const { tables, dealers } = countTablesAndDealers(lines, items);
  const far = Number(ctx.miles) > TRAVEL_FREE_MILES;
  const out = [];
  if (tables > 0 && !off.has('delivery')) out.push(autoLine('delivery', byKey.get(far ? 'setup_fee_far' : 'setup_fee'), 1));
  if (far && dealers > 0 && !off.has('travel')) out.push(autoLine('travel', byKey.get('travel_per_dealer'), dealers));
  const extra = Math.max(0, (Number(ctx.hours) || 0) - STANDARD_HOURS);
  if (extra > 0 && dealers > 0 && !off.has('extra_hours')) {
    out.push(autoLine('extra_hours', byKey.get(ctx.extraHourMode === 'event' ? 'extra_hour_at_event' : 'extra_hour'), extra * dealers));
  }
  if (ctx.fundraiser && tables > 0 && !off.has('fundraiser')) out.push(autoLine('fundraiser', byKey.get('fundraiser_discount'), tables));
  return out.filter(Boolean);
}

export const lineAmount = (l) => cents((Number(l?.qty) || 0) * (Number(l?.unit_price) || 0));

// Everything the quote shows: picked lines + auto lines, and the totals.
export function priceQuote(lines, ctx = {}) {
  const picked = (lines || []).filter(l => l && !l.auto);
  const all = [...picked, ...autoLines(picked, ctx)].map(l => ({ ...l, amount: lineAmount(l) }));
  const subtotal = cents(all.reduce((s, l) => s + l.amount, 0));
  const taxableBase = cents(all.filter(l => l.taxable !== false).reduce((s, l) => s + l.amount, 0));
  const rate = Math.min(Math.max(Number(ctx.taxRate) || 0, 0), 0.2);
  const tax = cents(Math.max(0, taxableBase) * rate);
  const total = cents(subtotal + tax);
  const deposit = cents(total * DEPOSIT_SHARE);
  return {
    lines: all,
    ...countTablesAndDealers(picked, ctx.items),
    subtotal,
    taxableBase,
    tax,
    total,
    deposit,
    balance: cents(total - deposit),
    balanceDue: balanceDueDate(ctx.eventDate)
  };
}

// Picked lines tidied for saving (auto lines are worked out again on load).
export function cleanLines(lines) {
  return (lines || []).filter(l => l && !l.auto).slice(0, MAX_LINES).map(l => ({
    id: String(l.id || newLineId()).slice(0, 40),
    key: l.key ? String(l.key).slice(0, 40) : null,
    category: String(l.category || 'custom').slice(0, 20),
    name: String(l.name || '').trim().slice(0, 200) || 'Item',
    description: l.description ? String(l.description).slice(0, 2000) : null,
    size: l.size ? String(l.size).slice(0, 120) : null,
    photo_url: l.photo_url && /^https:\/\//.test(l.photo_url) ? String(l.photo_url).slice(0, 500) : null,
    unit: String(l.unit || 'each').slice(0, 20),
    qty: Math.min(Math.max(cents(l.qty), 0), 100000),
    unit_price: Math.min(Math.max(cents(l.unit_price), -100000), 1000000),
    dealers: Math.min(Math.max(Math.floor(Number(l.dealers) || 0), 0), 20),
    taxable: l.taxable !== false,
    contents: l.category === 'package' ? normalizeContents(l.contents) : null
  }));
}

// The default line-up when a package fits the guest count: the smallest
// package for at least that many guests (keys package_<guests>).
export function suggestPackage(guestCount, items = []) {
  const n = Number(guestCount) || 0;
  if (!(n > 0)) return null;
  const pkgs = (items || [])
    .filter(i => i.category === 'package' && i.active !== false && /^package_\d+$/.test(i.key))
    .map(i => ({ item: i, size: Number(i.key.slice(8)) }))
    .sort((a, b) => a.size - b.size);
  return (pkgs.find(p => p.size >= n) || pkgs[pkgs.length - 1] || {}).item || null;
}
