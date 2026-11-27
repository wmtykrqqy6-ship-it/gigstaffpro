// Table availability for quotes (CRM Phase 2 step 4, docs/QUOTES.md).
//
// Each booking holds its tables from delivery (setup minutes before the
// start) to pickup (minutes after the end). For each stock pool the quote
// needs, add up every booking whose window overlaps the quote's and compare
// with how many are owned. Tables can work an early party and a later one on
// the same day, so it goes by time, not date.
//
// Bookings come from events in the app (their imported pull sheet,
// event_equipment) and accepted quotes; sent quotes are shown as "pending"
// and don't hold tables.

import { BONUS_KEY, normalizeContents } from './priceList.js';

export const DEFAULT_SETUP_MINUTES = 120;
export const DEFAULT_PICKUP_MINUTES = 60;

const DAY = 1440;
const normName = (s) => String(s || '').toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9']+/g, ' ').trim();

function dayNumber(date) {
  const m = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000) : null;
}

function minutesOf(t) {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// { start, end } in minutes from 1970 (local wall clock), or null when the
// date or start time is unknown. A missing end means a 3-hour party; an end
// before the start runs past midnight.
export function bookingWindow({ date, start, end, setup = DEFAULT_SETUP_MINUTES, pickup = DEFAULT_PICKUP_MINUTES }) {
  const day = dayNumber(date);
  const s = minutesOf(start);
  if (day === null || s === null) return null;
  let e = minutesOf(end);
  if (e === null) e = s + 180;
  else if (e <= s) e += DAY;
  const base = day * DAY;
  return { start: base + s - (Number(setup) || 0), end: base + e + (Number(pickup) || 0) };
}

export const windowsOverlap = (a, b) => !!(a && b && a.start < b.end && b.start < a.end);

// Pool -> quantity a quote's lines need. Packages count their contents; a
// bonus game uses the "bonus" pool.
export function needsFromLines(lines, items = []) {
  const poolOf = new Map((items || []).map(i => [i.key, i.stock_pool || null]));
  const needs = new Map();
  const add = (pool, qty) => { if (pool && qty > 0) needs.set(pool, (needs.get(pool) || 0) + qty); };
  for (const l of lines || []) {
    if (!l || l.auto) continue;
    const qty = Math.max(0, Number(l.qty) || 0);
    if (l.category === 'package') {
      for (const c of normalizeContents(l.contents)) add(c.key === BONUS_KEY ? 'bonus' : poolOf.get(c.key), c.qty * qty);
    } else if (l.key) {
      add(poolOf.get(l.key) || l.stock_pool, qty);
    }
  }
  return needs;
}

// Pool -> quantity from an event's imported pull sheet rows (event_equipment),
// matched by Goodshuffle item name (stock_pools.match_names).
export function needsFromEquipment(rows, pools = []) {
  const byName = new Map();
  for (const p of pools || []) for (const n of p.match_names || []) byName.set(normName(n), p.key);
  const needs = new Map();
  for (const r of rows || []) {
    if (!r || ['package', 'accessory', 'ignore', 'chairs'].includes(r.size_class)) continue;
    const pool = byName.get(normName(r.item_name));
    const qty = Math.max(0, Number(r.quantity) || 0);
    if (pool && qty > 0) needs.set(pool, (needs.get(pool) || 0) + qty);
  }
  return needs;
}

// For each pool the quote needs: { key, name, owned, need, booked, pending,
// free, short, bookings: [labels] }. bookings: [{ window, needs (Map),
// label, pending }].
export function checkAvailability({ window, needs, pools = [], bookings = [] }) {
  const poolBy = new Map((pools || []).map(p => [p.key, p]));
  const out = [];
  for (const [key, need] of needs || []) {
    const pool = poolBy.get(key);
    let booked = 0;
    let pending = 0;
    const who = [];
    for (const b of bookings || []) {
      if (!windowsOverlap(window, b.window)) continue;
      const n = b.needs?.get?.(key) || 0;
      if (!n) continue;
      if (b.pending) pending += n;
      else booked += n;
      who.push({ label: b.label, qty: n, pending: !!b.pending });
    }
    const owned = pool ? Number(pool.owned) || 0 : null;
    const free = owned === null ? null : owned - booked;
    out.push({ key, name: pool?.name || key, owned, need, booked, pending, free, short: free !== null && need > free, bookings: who });
  }
  return out.sort((a, b) => Number(b.short) - Number(a.short) || String(a.name).localeCompare(String(b.name)));
}
