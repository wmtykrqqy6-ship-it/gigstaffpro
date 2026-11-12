import { describe, it, expect } from 'vitest';
import { splitEvenly, sumDollars, sameDollars, tipOf, amountOwed, parseShare } from './tipHelpers';

describe('splitEvenly', () => {
  it('splits evenly when it divides', () => {
    expect(splitEvenly(100, 4)).toEqual([25, 25, 25, 25]);
  });
  it('gives leftover pennies to the first people so it adds up exactly', () => {
    const shares = splitEvenly(100, 3);
    expect(shares).toEqual([33.34, 33.33, 33.33]);
    expect(sumDollars(shares)).toBe(100);
  });
  it('handles awkward totals', () => {
    const shares = splitEvenly(250.05, 7);
    expect(sumDollars(shares)).toBe(250.05);
    expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(0.011);
  });
  it('returns zeros for no tip and an empty list for no people', () => {
    expect(splitEvenly(0, 3)).toEqual([0, 0, 0]);
    expect(splitEvenly(100, 0)).toEqual([]);
    expect(splitEvenly('', 2)).toEqual([0, 0]);
  });
});

describe('sumDollars / sameDollars', () => {
  it('adds without floating point drift', () => {
    expect(sumDollars([0.1, 0.2])).toBe(0.3);
    expect(sameDollars(0.1 + 0.2, 0.3)).toBe(true);
    expect(sameDollars(100, 99.99)).toBe(false);
  });
});

describe('amountOwed', () => {
  it('is pay plus tip', () => {
    expect(amountOwed({ total_pay: 150, tip_amount: 25 })).toBe(175);
  });
  it('treats missing values as 0 (rows from before tips existed)', () => {
    expect(amountOwed({ total_pay: 150 })).toBe(150);
    expect(amountOwed({ tip_amount: '20.50' })).toBe(20.5);
    expect(tipOf(null)).toBe(0);
  });
});

describe('parseShare', () => {
  it('reads what an admin types', () => {
    expect(parseShare('25')).toBe(25);
    expect(parseShare('$1,025.555')).toBe(1025.56);
    expect(parseShare('')).toBe(0);
    expect(parseShare('abc')).toBe(0);
    expect(parseShare('-5')).toBe(0);
  });
});
