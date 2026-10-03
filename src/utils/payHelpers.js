// Minimum paid hours per shift (Dylan, 2026-10-03): dealers are paid at
// least N hours even when an event is shorter (a 2-hour party pays 3).
// Stored as one admin-editable row in `settings`:
//   setting_key 'minimum_paid_hours', setting_value JSON
//   { "hours": 3, "positions": ["blackjack", "craps", ..., "host"] }
// Applies only to the listed positions, and only to contractors -- a worker
// marked 'employee' (W-2, paid through QuickBooks Payroll) is exempt; a
// worker with no pay type yet is treated like a contractor. Flat-pay events
// ignore hours entirely, so they're unaffected.
//
// Every place that turns hours into pay goes through paidHours(), so the
// estimates workers see and the pay that gets recorded always agree.

export const MIN_HOURS_SETTING_KEY = 'minimum_paid_hours';

// Same normalization Settings -> Positions uses to make keys from labels,
// so 'Ultimate Hold'em' and "ultimate_hold'em" match.
export const normalizePositionKey = (p) =>
  String(p ?? '').trim().toLowerCase().replace(/\s+/g, '_');

// Setting value (JSON string or object) -> { hours, positions } | null.
export function parseMinHoursRule(value) {
  if (value == null || value === '') return null;
  let v = value;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return null; }
  }
  const hours = Number(v?.hours);
  if (!Number.isFinite(hours) || hours <= 0) return null;
  const positions = Array.isArray(v.positions) ? v.positions.map(normalizePositionKey).filter(Boolean) : [];
  return { hours, positions };
}

export const serializeMinHoursRule = ({ hours, positions }) =>
  JSON.stringify({ hours: Number(hours) || 0, positions: (positions || []).map(normalizePositionKey) });

export function minimumApplies(rule, position, worker = null) {
  if (!rule || !(rule.hours > 0)) return false;
  if (worker?.payment_type === 'employee') return false;
  return rule.positions.includes(normalizePositionKey(position));
}

// Hours to pay for: the scheduled hours, or the minimum if that's higher.
export function paidHours(hours, rule, position, worker = null) {
  const h = Number(hours) || 0;
  return minimumApplies(rule, position, worker) ? Math.max(h, rule.hours) : h;
}

// Default positions for the setting: every position except the logistics
// crew roles (Set Up, Set Up Driver, Warehouse).
export function defaultMinHoursPositions(positions = [], excludedKeys = new Set()) {
  return positions.map(p => p.key).filter(k => k && !excludedKeys.has(k));
}
