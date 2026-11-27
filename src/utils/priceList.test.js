import { describe, it, expect } from 'vitest';
import { formatPrice, makeItemKey, normalizeContents, packageSummary, validatePriceItem, groupPriceItems, unitLabel } from './priceList';

describe('price list', () => {
  it('formats prices', () => {
    expect(formatPrice(325)).toBe('$325');
    expect(formatPrice(12075)).toBe('$12,075');
    expect(formatPrice(-50)).toBe('-$50');
    expect(formatPrice(4.5)).toBe('$4.50');
    expect(formatPrice(null)).toBe('Priced each time');
    expect(unitLabel('dealer_hour')).toBe('per dealer per hour');
  });

  it('makes unique keys', () => {
    expect(makeItemKey('Horse Racing Cages')).toBe('horse_racing_cages');
    expect(makeItemKey('DJ', ['dj'])).toBe('dj_2');
    expect(makeItemKey('!!')).toBe('item');
  });

  it('tidies package contents and describes them', () => {
    expect(normalizeContents([{ key: 'blackjack', qty: 2 }, { key: 'blackjack', qty: '1' }, { key: 'x y', qty: 1 }, { key: 'roulette', qty: 0 }]))
      .toEqual([{ key: 'blackjack', qty: 3 }]);
    expect(packageSummary([{ key: 'blackjack', qty: 3 }, { key: 'bonus', qty: 1 }], [{ key: 'blackjack', name: 'Blackjack Table' }]))
      .toBe('3 Blackjack Table, 1 bonus game');
  });

  it('validates an item', () => {
    expect(validatePriceItem({ name: '', category: 'table' }).error).toMatch(/name/);
    expect(validatePriceItem({ name: 'X', category: 'nope' }).error).toMatch(/category/);
    expect(validatePriceItem({ name: 'X', category: 'addon', price: 'abc' }).error).toMatch(/price/);
    expect(validatePriceItem({ name: 'X', category: 'addon', photo_url: 'http://a' }).error).toMatch(/https/);
    const { item } = validatePriceItem({ name: ' Ball Pit ', category: 'addon', unit: 'event', price: '250', dealers: 3, contents: [{ key: 'a1', qty: 1 }] }, { takenKeys: [] });
    expect(item).toMatchObject({ key: 'ball_pit', name: 'Ball Pit', price: 250, dealers: 0, contents: null, taxable: true, active: true });
    const custom = validatePriceItem({ key: 'magician', name: 'Magician', category: 'addon', unit: 'custom', price: 100 }).item;
    expect(custom).toMatchObject({ key: 'magician', price: null });
    const table = validatePriceItem({ name: 'Craps', category: 'table', unit: 'table', price: 800, dealers: 2, bonus_game: true }).item;
    expect(table).toMatchObject({ dealers: 2, bonus_game: true });
  });

  it('groups by category in order', () => {
    const groups = groupPriceItems([{ name: 'B', category: 'addon', sort_order: 2 }, { name: 'A', category: 'addon', sort_order: 1 }, { name: 'T', category: 'table' }]);
    expect(groups[0].items.map(i => i.name)).toEqual(['T']);
    expect(groups.find(g => g.id === 'addon').items.map(i => i.name)).toEqual(['A', 'B']);
  });
});
