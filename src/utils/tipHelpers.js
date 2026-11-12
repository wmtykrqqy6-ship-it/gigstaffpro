// Client tips (Dylan, 2026-11-12): a client sometimes adds a tip to an
// event. The admin enters the total on Payments -> Client Tips and it is
// split evenly among the workers who worked the event. Each worker's share
// is stored on their assignment as tip_amount, separate from total_pay (so
// the holiday multiplier never touches it, and W-2 employees' tips can be
// reported to payroll as tips). See docs/PAY_RULES.md.

const toCents = (dollars) => Math.round((Number(dollars) || 0) * 100);

// Split a dollar total evenly across `count` people, to the penny. Leftover
// pennies go one each to the first people in the list, so the shares always
// add up to exactly the total: $100 / 3 -> [33.34, 33.33, 33.33].
export function splitEvenly(total, count) {
  const n = Math.floor(Number(count) || 0);
  const cents = toCents(total);
  if (n <= 0 || cents <= 0) return Array(Math.max(n, 0)).fill(0);
  const base = Math.floor(cents / n);
  const extra = cents - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < extra ? 1 : 0)) / 100);
}

// Sum of dollar amounts, done in cents so 0.1 + 0.2 shows as 0.30.
export const sumDollars = (amounts) =>
  amounts.reduce((sum, a) => sum + toCents(a), 0) / 100;

export const sameDollars = (a, b) => toCents(a) === toCents(b);

export const tipOf = (assignment) => Number(assignment?.tip_amount) || 0;

// What a worker is owed for one shift: their pay plus any client tip.
export const amountOwed = (assignment) =>
  (Number(assignment?.total_pay) || 0) + tipOf(assignment);

// Turn what the admin typed into a valid share: blank or junk -> 0,
// negative -> 0, rounded to the cent.
export function parseShare(value) {
  const n = Number(String(value ?? '').replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return toCents(n) / 100;
}
