import { describe, it, expect } from 'vitest';
import {
  partyHours, balanceDueDate, toTime24, formatTime12, lineFromItem, customLine, countTablesAndDealers, autoLines, priceQuote, cleanLines, suggestPackage
} from './quotePricing';

const items = [
  { key: 'blackjack', category: 'table', name: 'Blackjack Table', unit: 'table', price: 325, dealers: 1, taxable: true },
  { key: 'craps_10', category: 'table', name: '10ft Craps Table', unit: 'table', price: 800, dealers: 2, taxable: true },
  { key: 'roulette', category: 'table', name: 'Roulette Table', unit: 'table', price: 475, dealers: 1, taxable: true },
  { key: 'money_wheel', category: 'table', name: 'Money Wheel Table', unit: 'table', price: 325, dealers: 1, taxable: true },
  { key: 'holdem', category: 'table', name: "Texas Hold'em", unit: 'table', price: 375, dealers: 1, taxable: true },
  { key: 'package_50', category: 'package', name: '50 Guests Package', unit: 'event', price: 2625, taxable: true,
    contents: [{ key: 'blackjack', qty: 3 }, { key: 'roulette', qty: 1 }, { key: 'holdem', qty: 1 }, { key: 'craps_10', qty: 1 }] },
  { key: 'package_75', category: 'package', name: '75 Guests Package', unit: 'event', price: 3600, taxable: true,
    contents: [{ key: 'blackjack', qty: 5 }, { key: 'bonus', qty: 1 }] },
  { key: 'setup_fee', category: 'fee', name: 'Standard Delivery (Drop-Off)', unit: 'event', price: 350, taxable: true },
  { key: 'setup_fee_far', category: 'fee', name: 'Delivery past 30 miles', unit: 'event', price: 450, taxable: true },
  { key: 'travel_per_dealer', category: 'fee', name: 'Dealer travel fee', unit: 'dealer', price: 75, taxable: true },
  { key: 'extra_hour', category: 'staff', name: 'Additional hour (booked ahead)', unit: 'dealer_hour', price: 75, taxable: true },
  { key: 'extra_hour_at_event', category: 'staff', name: 'Additional hour (added at the event)', unit: 'dealer_hour', price: 80, taxable: false },
  { key: 'fundraiser_discount', category: 'discount', name: 'Fundraiser discount', unit: 'table', price: -50, taxable: true },
  { key: 'gratuity', category: 'fee', name: 'Gratuity', unit: 'dealer', price: null, taxable: false }
];
const item = (key) => items.find(i => i.key === key);

describe('quote pricing', () => {
  it('works out party hours and the balance due date', () => {
    expect(partyHours('19:00', '22:00')).toBe(3);
    expect(partyHours('21:00', '01:30')).toBe(4.5);
    expect(partyHours('', '22:00')).toBe(0);
    expect(balanceDueDate('2026-12-05')).toBe('2026-11-28');
    expect(balanceDueDate('2026-03-03')).toBe('2026-02-24');
    expect(balanceDueDate('')).toBeNull();
  });

  it('reads the start time a client typed', () => {
    expect(toTime24('7:00 PM')).toBe('19:00');
    expect(toTime24('7pm')).toBe('19:00');
    expect(toTime24('12:30 a.m.')).toBe('00:30');
    expect(toTime24('18:15')).toBe('18:15');
    expect(toTime24('evening')).toBe('');
    expect(toTime24('7')).toBe('');
    expect(formatTime12('19:00')).toBe('7:00 PM');
    expect(formatTime12('00:30')).toBe('12:30 AM');
  });

  it('matches the Goodshuffle sample contract', () => {
    // 3 blackjack, 1 10ft craps, 1 roulette, 1 money wheel, 3 hours, Waukesha County (5%).
    const lines = [lineFromItem(item('blackjack'), 3), lineFromItem(item('craps_10')), lineFromItem(item('roulette')), lineFromItem(item('money_wheel'))];
    const q = priceQuote(lines, { items, hours: 3, miles: 12, taxRate: 0.05, eventDate: '2026-12-05' });
    expect(q.lines.map(l => l.name)).toContain('Standard Delivery (Drop-Off)');
    expect(q.subtotal).toBe(2925);
    expect(q.tax).toBe(146.25);
    expect(q.total).toBe(3071.25);
    expect(q.deposit).toBe(1535.63);
    expect(q.balance).toBe(1535.62);
    expect(q.balanceDue).toBe('2026-11-28');
    expect(q).toMatchObject({ tables: 6, dealers: 7 });
  });

  it('counts package tables and dealers (bonus game = 1 dealer)', () => {
    expect(countTablesAndDealers([lineFromItem(item('package_50'))], items)).toEqual({ tables: 6, dealers: 7 });
    expect(countTablesAndDealers([lineFromItem(item('package_75'), 2)], items)).toEqual({ tables: 12, dealers: 12 });
    expect(countTablesAndDealers([customLine({ name: 'Magician', unitPrice: 500 })], items)).toEqual({ tables: 0, dealers: 0 });
  });

  it('adds travel, the far delivery fee and extra hours past 30 miles', () => {
    const lines = [lineFromItem(item('blackjack'), 2), lineFromItem(item('craps_10'))]; // 4 dealers
    const auto = autoLines(lines, { items, miles: 45, hours: 4.5 });
    const byRule = Object.fromEntries(auto.map(l => [l.auto, l]));
    expect(byRule.delivery).toMatchObject({ key: 'setup_fee_far', unit_price: 450, qty: 1 });
    expect(byRule.travel).toMatchObject({ qty: 4, unit_price: 75 });
    expect(byRule.extra_hours).toMatchObject({ key: 'extra_hour', qty: 6, unit_price: 75, taxable: true });
    const atEvent = autoLines(lines, { items, hours: 4, extraHourMode: 'event' }).find(l => l.auto === 'extra_hours');
    expect(atEvent).toMatchObject({ key: 'extra_hour_at_event', qty: 4, unit_price: 80, taxable: false });
  });

  it('applies the fundraiser discount per table and respects rules turned off', () => {
    const lines = [lineFromItem(item('package_50'))];
    const q = priceQuote(lines, { items, hours: 3, fundraiser: true, taxRate: 0.055 });
    expect(q.lines.find(l => l.auto === 'fundraiser')).toMatchObject({ qty: 6, amount: -300 });
    expect(q.subtotal).toBe(2625 + 350 - 300);
    const off = priceQuote(lines, { items, hours: 3, fundraiser: true, autoOff: ['fundraiser', 'delivery'] });
    expect(off.lines.some(l => l.auto)).toBe(false);
  });

  it('leaves untaxed lines out of the tax', () => {
    const tip = { ...lineFromItem(item('gratuity'), 2), unit_price: 50 };
    const q = priceQuote([lineFromItem(item('blackjack')), tip], { items, autoOff: ['delivery'], taxRate: 0.1 });
    expect(q.subtotal).toBe(425);
    expect(q.tax).toBe(32.5);
  });

  it('cleans lines for saving and drops auto lines', () => {
    const saved = cleanLines([{ ...lineFromItem(item('blackjack')), qty: '2' }, { auto: 'delivery', name: 'x' }, { name: '', unit_price: 'abc', photo_url: 'http://x' }]);
    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject({ key: 'blackjack', qty: 2, unit_price: 325, dealers: 1 });
    expect(saved[1]).toMatchObject({ name: 'Item', unit_price: 0, photo_url: null, category: 'custom' });
  });

  it('suggests the smallest package that fits', () => {
    expect(suggestPackage(60, items).key).toBe('package_75');
    expect(suggestPackage(40, items).key).toBe('package_50');
    expect(suggestPackage(500, items).key).toBe('package_75');
    expect(suggestPackage(null, items)).toBeNull();
  });
});
