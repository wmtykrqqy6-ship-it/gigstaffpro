import { describe, it, expect } from 'vitest';
import { summarizePayments, paymentStatusLabel, suggestPayment, validatePayment, centralToday } from './quotePayments';

const quote = { id: 'q1', status: 'accepted', total: 3071.25, deposit: 1535.63, event_date: '2027-03-20', accepted_at: '2027-01-10T18:00:00Z' };
const pay = (kind, amount, extra = {}) => ({ kind, amount, status: 'paid', ...extra });

describe('summarizePayments', () => {
  it('nothing paid yet: deposit due, not late right after signing', () => {
    const s = summarizePayments(quote, [], '2027-01-11');
    expect(s).toMatchObject({ paid: 0, owed: 3071.25, depositOwed: 1535.63, status: 'deposit_due', overdue: null, balanceDue: '2027-03-13' });
    expect(paymentStatusLabel(s)).toBe('deposit due');
  });

  it('deposit late after 3 days', () => {
    expect(summarizePayments(quote, [], '2027-01-14').overdue).toBe('deposit');
    expect(summarizePayments(quote, [], '2027-01-13').overdue).toBe(null);
  });

  it('deposit paid, balance owed, late after the due date', () => {
    const rows = [pay('deposit', 1535.63)];
    const s = summarizePayments(quote, rows, '2027-02-01');
    expect(s).toMatchObject({ paid: 1535.63, owed: 1535.62, status: 'deposit_paid', overdue: null });
    expect(summarizePayments(quote, rows, '2027-03-13').overdue).toBe(null);
    expect(summarizePayments(quote, rows, '2027-03-14').overdue).toBe('balance');
    expect(paymentStatusLabel(summarizePayments(quote, rows, '2027-03-14'))).toBe('balance late');
  });

  it('paid in full; tips are separate; pending and failed do not count', () => {
    const rows = [
      pay('deposit', 1535.63),
      pay('balance', 1535.62),
      pay('tip', 100),
      pay('extra', 50, { status: 'pending' }),
      pay('extra', 75, { status: 'failed' })
    ];
    const s = summarizePayments(quote, rows, '2027-03-25');
    expect(s).toMatchObject({ paid: 3071.25, owed: 0, tips: 100, pending: 50, status: 'paid', overdue: null });
  });

  it('refunds come off what was paid', () => {
    const rows = [pay('deposit', 1535.63), pay('balance', 1600), pay('refund', 64.38)];
    expect(summarizePayments(quote, rows, '2027-03-25')).toMatchObject({ paid: 3071.25, status: 'paid' });
    expect(summarizePayments(quote, rows.slice(0, 2), '2027-03-25').status).toBe('overpaid');
  });

  it('no total: nothing to collect', () => {
    expect(summarizePayments({ total: 0 }, []).status).toBe('none');
    expect(paymentStatusLabel(summarizePayments({ total: 0 }, []))).toBe('');
  });
});

describe('suggestPayment', () => {
  it('suggests what is next', () => {
    expect(suggestPayment(summarizePayments(quote, [], '2027-01-11'))).toEqual({ kind: 'deposit', amount: '1535.63' });
    expect(suggestPayment(summarizePayments(quote, [pay('deposit', 1535.63)], '2027-01-11'))).toEqual({ kind: 'balance', amount: '1535.62' });
    expect(suggestPayment(summarizePayments(quote, [pay('deposit', 3071.25)], '2027-01-11'))).toEqual({ kind: 'extra', amount: '' });
  });
});

describe('validatePayment', () => {
  const form = { kind: 'deposit', method: 'check', amount: '$1,535.63', paid_on: '2027-01-12', note: ' Check #1042 ' };
  it('builds a manual paid row', () => {
    expect(validatePayment(form, 'q1')).toEqual({
      row: { quote_id: 'q1', kind: 'deposit', method: 'check', amount: 1535.63, paid_on: '2027-01-12', note: 'Check #1042', status: 'paid', provider: 'manual' }
    });
  });
  it('rejects bad input', () => {
    expect(validatePayment(form, null).error).toMatch(/save/i);
    expect(validatePayment({ ...form, kind: 'bogus' }, 'q1').error).toBeTruthy();
    expect(validatePayment({ ...form, method: 'bitcoin' }, 'q1').error).toBeTruthy();
    expect(validatePayment({ ...form, amount: '0' }, 'q1').error).toBeTruthy();
    expect(validatePayment({ ...form, amount: '-5' }, 'q1').error).toBeTruthy();
    expect(validatePayment({ ...form, amount: '12.345' }, 'q1').error).toBeTruthy();
    expect(validatePayment({ ...form, paid_on: 'yesterday' }, 'q1').error).toBeTruthy();
  });
});

describe('centralToday', () => {
  it('uses Central time', () => {
    expect(centralToday(new Date('2027-01-01T05:30:00Z'))).toBe('2026-12-31');
    expect(centralToday(new Date('2027-01-01T06:30:00Z'))).toBe('2027-01-01');
  });
});
