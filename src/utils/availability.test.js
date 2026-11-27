import { describe, it, expect } from 'vitest';
import { bookingWindow, windowsOverlap, needsFromLines, needsFromEquipment, checkAvailability } from './availability';

const items = [
  { key: 'blackjack', stock_pool: 'blackjack' },
  { key: 'three_card', stock_pool: 'bonus' },
  { key: 'craps_10', stock_pool: 'craps_10' },
  { key: 'dj', stock_pool: null }
];
const pools = [
  { key: 'blackjack', name: 'Blackjack tables', owned: 40, match_names: ['Blackjack Table'] },
  { key: 'bonus', name: 'Bonus game tables', owned: 13, match_names: ['Three Card Poker', 'Let It Ride'] },
  { key: 'craps_10', name: '10 ft craps tables', owned: 10, match_names: ['10ft Craps Table'] }
];

describe('availability', () => {
  it('builds delivery-to-pickup windows', () => {
    const w = bookingWindow({ date: '2026-12-05', start: '19:00', end: '22:00' });
    expect(w.end - w.start).toBe(120 + 180 + 60);
    const late = bookingWindow({ date: '2026-12-05', start: '21:00', end: '01:00', setup: 0, pickup: 0 });
    expect(late.end - late.start).toBe(240);
    expect(bookingWindow({ date: '2026-12-05', start: '19:00' }).end - bookingWindow({ date: '2026-12-05', start: '19:00' }).start).toBe(360);
    expect(bookingWindow({ date: '', start: '19:00' })).toBeNull();
  });

  it('lets an early party and an evening party share tables', () => {
    const lunch = bookingWindow({ date: '2026-12-05', start: '11:00', end: '14:00' }); // 9:00-15:00
    const evening = bookingWindow({ date: '2026-12-05', start: '18:00', end: '21:00' }); // 16:00-22:00
    const afternoon = bookingWindow({ date: '2026-12-05', start: '15:00', end: '18:00' }); // 13:00-19:00
    expect(windowsOverlap(lunch, evening)).toBe(false);
    expect(windowsOverlap(lunch, afternoon)).toBe(true);
  });

  it('counts what lines and pull sheets need', () => {
    const lines = [
      { key: 'blackjack', category: 'table', qty: 3 },
      { key: 'package_75', category: 'package', qty: 1, contents: [{ key: 'blackjack', qty: 5 }, { key: 'bonus', qty: 1 }, { key: 'craps_10', qty: 1 }] },
      { key: 'dj', category: 'addon', qty: 1 },
      { auto: 'delivery', key: 'setup_fee', qty: 1 }
    ];
    expect(Object.fromEntries(needsFromLines(lines, items))).toEqual({ blackjack: 8, bonus: 1, craps_10: 1 });
    const rows = [
      { item_name: 'Blackjack Table', size_class: 'blackjack', quantity: 4 },
      { item_name: 'Let It Ride', size_class: 'poker', quantity: 1 },
      { item_name: '50 Guests Package', size_class: 'package', quantity: 1 },
      { item_name: 'Chip Trays', size_class: 'accessory', quantity: 4 }
    ];
    expect(Object.fromEntries(needsFromEquipment(rows, pools))).toEqual({ blackjack: 4, bonus: 1 });
  });

  it('flags a pool that runs short, counting only overlapping bookings', () => {
    const window = bookingWindow({ date: '2026-12-05', start: '19:00', end: '22:00' });
    const bookings = [
      { label: 'Party A', window: bookingWindow({ date: '2026-12-05', start: '18:00', end: '21:00' }), needs: new Map([['craps_10', 9]]) },
      { label: 'Party B', window: bookingWindow({ date: '2026-12-05', start: '10:00', end: '13:00' }), needs: new Map([['craps_10', 5]]) },
      { label: 'Quote C', pending: true, window, needs: new Map([['blackjack', 10]]) }
    ];
    const res = checkAvailability({ window, needs: new Map([['craps_10', 2], ['blackjack', 3]]), pools, bookings });
    expect(res[0]).toMatchObject({ key: 'craps_10', booked: 9, free: 1, short: true });
    expect(res[1]).toMatchObject({ key: 'blackjack', booked: 0, pending: 10, free: 40, short: false });
  });
});
