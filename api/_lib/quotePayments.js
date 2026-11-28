// Server copy of src/utils/quotePayments.js (api/ functions aren't bundled by Vite).
// Keep the two files identical below this line; api/_lib/pricingCopies.test.js checks.
// Payments on booked quotes (CRM Phase 3, docs/PAYMENTS.md).
// Pure helpers: what's been paid, what's owed, and whether the deposit and
// balance are on time. Rows come from public.quote_payments.

import { cents, balanceDueDate } from './quotePricing.js';

export const PAYMENT_KINDS = [
  { value: 'deposit', label: 'Deposit' },
  { value: 'balance', label: 'Balance' },
  { value: 'extra', label: 'Extra (added items, extra hours)' },
  { value: 'tip', label: 'Tip for the crew' },
  { value: 'refund', label: 'Refund' }
];

export const PAYMENT_METHODS = [
  { value: 'check', label: 'Check' },
  { value: 'card', label: 'Card' },
  { value: 'ach', label: 'Bank transfer (ACH)' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' }
];

export const kindLabel = (k) => (PAYMENT_KINDS.find(x => x.value === k)?.label || k || '').replace(/ \(.*\)$/, '');
export const methodLabel = (m) => PAYMENT_METHODS.find(x => x.value === m)?.label || m || '';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Today in Central time as YYYY-MM-DD.
export function centralToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function daysBetween(a, b) {
  const t = (d) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.round((t(b) - t(a)) / 86400000);
}

// Paid / owed summary for one quote.
//   status: 'none' (nothing to collect), 'deposit_due', 'deposit_paid'
//   (balance still owed), 'paid' (paid in full) or 'overpaid'.
//   overdue: 'deposit' or 'balance' when that payment is late, else null.
// Tips are counted separately and never reduce what's owed. Pending and
// failed payments don't count as paid.
export function summarizePayments(quote, payments = [], today = centralToday()) {
  const total = cents(quote?.total);
  const deposit = cents(quote?.deposit);
  const rows = (payments || []).filter(Boolean);
  let paid = 0;
  let tips = 0;
  let pending = 0;
  for (const p of rows) {
    const amt = Number(p.amount || 0);
    if (p.status === 'pending' && p.kind !== 'tip' && p.kind !== 'refund') pending += amt;
    if (p.status !== 'paid') continue;
    if (p.kind === 'tip') tips += amt;
    else if (p.kind === 'refund') paid -= amt;
    else paid += amt;
  }
  paid = cents(paid);
  tips = cents(tips);
  pending = cents(pending);
  const owed = cents(Math.max(0, total - paid));
  const depositOwed = cents(Math.max(0, deposit - paid));
  const balanceDue = balanceDueDate(quote?.event_date);

  let status;
  if (total <= 0) status = 'none';
  else if (paid > total + 0.005) status = 'overpaid';
  else if (owed <= 0.005) status = 'paid';
  else if (depositOwed > 0.005) status = 'deposit_due';
  else status = 'deposit_paid';

  let overdue = null;
  const isDay = ISO_DATE.test(String(today || ''));
  if (status === 'deposit_due' && quote?.status === 'accepted' && isDay && quote?.accepted_at) {
    // The deposit is due at signing: late once 3 days have passed.
    const signed = String(quote.accepted_at).slice(0, 10);
    if (ISO_DATE.test(signed) && daysBetween(signed, today) > 3) overdue = 'deposit';
  }
  if (!overdue && (status === 'deposit_due' || status === 'deposit_paid') && balanceDue && isDay && today > balanceDue) {
    overdue = 'balance';
  }

  return { total, deposit, paid, tips, pending, owed, depositOwed, balanceDue, status, overdue };
}

// Short label for a quote chip / list.
export function paymentStatusLabel(summary) {
  if (!summary) return '';
  if (summary.overdue === 'deposit') return 'deposit late';
  if (summary.overdue === 'balance') return 'balance late';
  return {
    none: '',
    deposit_due: 'deposit due',
    deposit_paid: 'deposit paid',
    paid: 'paid in full',
    overpaid: 'overpaid'
  }[summary.status] || '';
}

// What the "Record payment" form should start with for this quote.
export function suggestPayment(summary) {
  if (!summary || summary.status === 'none') return { kind: 'deposit', amount: '' };
  if (summary.status === 'deposit_due') return { kind: 'deposit', amount: summary.depositOwed.toFixed(2) };
  if (summary.status === 'deposit_paid') return { kind: 'balance', amount: summary.owed.toFixed(2) };
  return { kind: 'extra', amount: '' };
}

// Checks a typed-in payment. Returns { row } or { error }.
export function validatePayment(form, quoteId) {
  if (!quoteId) return { error: 'Save the quote first.' };
  const kind = PAYMENT_KINDS.some(k => k.value === form?.kind) ? form.kind : null;
  if (!kind) return { error: 'Pick what the payment is for.' };
  const method = PAYMENT_METHODS.some(m => m.value === form?.method) ? form.method : null;
  if (!method) return { error: 'Pick how it was paid.' };
  const raw = String(form?.amount ?? '').replace(/[$,\s]/g, '');
  const amount = /^\d+(\.\d{1,2})?$/.test(raw) ? cents(raw) : 0;
  if (!(amount > 0) || amount > 1000000) return { error: 'Enter an amount greater than $0.' };
  const paidOn = String(form?.paid_on || '');
  if (!ISO_DATE.test(paidOn)) return { error: 'Enter the date it was paid.' };
  const note = String(form?.note || '').trim().slice(0, 500);
  return {
    row: { quote_id: quoteId, kind, method, amount, paid_on: paidOn, note: note || null, status: 'paid', provider: 'manual' }
  };
}

export const formatMoney = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
