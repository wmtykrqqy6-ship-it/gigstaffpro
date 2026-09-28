import { describe, it, expect } from 'vitest';
import { findImportMatch, toEquipmentRows, groupEquipment, diffEquipment, formatDiff } from './importMatch';
import { normalizeItemName, buildCatalogMap, suggestSizeClass, classifyLineItems, applyClassifications } from './catalog';

const parsedItems = [
  { name: '50 Guests Package', quantity: 1, isAccessory: false, parentIndex: null },
  { name: 'Blackjack Table', quantity: 3, isAccessory: false, parentIndex: null },
  { name: 'Chip Trays', quantity: 3, isAccessory: true, parentIndex: 1 },
  { name: 'Roulette Table', quantity: 1, isAccessory: false, parentIndex: null },
  { name: 'Chip Trays', quantity: 1, isAccessory: true, parentIndex: 3 }
];

describe('findImportMatch', () => {
  const events = [
    { id: 'a', name: 'Existing', date: '2026-09-25', goodshuffle_invoice: '231849935' },
    { id: 'b', name: 'Manual one', date: '2026-09-26T00:00:00', goodshuffle_invoice: null },
    { id: 'c', name: 'Cancelled', date: '2026-09-26', goodshuffle_invoice: null, status: 'cancelled' },
    { id: 'd', name: 'Other invoice', date: '2026-09-27', goodshuffle_invoice: '999' }
  ];

  it('updates the event with the same invoice', () => {
    expect(findImportMatch({ invoice: '231849935', date: '2026-09-26' }, events)).toEqual({ type: 'update', event: events[0] });
  });

  it('offers to attach to same-date events without an invoice (not cancelled ones)', () => {
    const m = findImportMatch({ invoice: '111', date: '2026-09-26' }, events);
    expect(m.type).toBe('attach');
    expect(m.candidates.map(e => e.id)).toEqual(['b']);
  });

  it('never offers an event that already has a different invoice', () => {
    expect(findImportMatch({ invoice: '111', date: '2026-09-27' }, events)).toEqual({ type: 'create' });
  });

  it('creates when nothing matches', () => {
    expect(findImportMatch({ invoice: '111', date: '2026-10-01' }, events)).toEqual({ type: 'create' });
    expect(findImportMatch({ invoice: null, date: null }, events)).toEqual({ type: 'create' });
  });
});

describe('toEquipmentRows / groupEquipment', () => {
  it('links accessories to parents by line number and round-trips', () => {
    const rows = toEquipmentRows('evt', parsedItems.map(i => ({ ...i, size_class: 'x' })));
    expect(rows[2]).toMatchObject({ event_id: 'evt', line_no: 3, item_name: 'Chip Trays', parent_line_no: 2, quantity: 3 });
    const grouped = groupEquipment(rows);
    expect(grouped.map(g => [g.item_name, g.accessories.map(a => a.quantity)])).toEqual([
      ['50 Guests Package', []],
      ['Blackjack Table', [3]],
      ['Roulette Table', [1]]
    ]);
  });
});

describe('diffEquipment', () => {
  const oldRows = toEquipmentRows('evt', parsedItems);

  it('reports +/- per item, tables first, accessories summed', () => {
    const next = [
      { name: 'Blackjack Table', quantity: 5, parentIndex: null },
      { name: 'Chip Trays', quantity: 5, parentIndex: 0 },
      { name: '50 Guests Package', quantity: 1, parentIndex: null }
    ];
    const changes = diffEquipment(oldRows, next);
    expect(formatDiff(changes)).toBe('+2 Blackjack Table, −1 Roulette Table, +1 Chip Trays');
  });

  it('reports no changes for an identical re-import', () => {
    expect(diffEquipment(oldRows, parsedItems)).toEqual([]);
    expect(formatDiff([])).toBe('No equipment changes');
  });
});

describe('catalog', () => {
  it('normalizes quotes, case and whitespace', () => {
    expect(normalizeItemName('  Texas Hold’EM   Poker ')).toBe("texas hold'em poker");
  });

  it('suggests classes for unknown items, defaulting table-like items to blackjack', () => {
    expect(suggestSizeClass('8ft Craps Table')).toBe('craps');
    expect(suggestSizeClass('Mini Roulette Table')).toBe('roulette');
    expect(suggestSizeClass("Texas Hold'em Tournament Table")).toBe('poker');
    expect(suggestSizeClass('Poker Chips', true)).toBe('accessory');
    expect(suggestSizeClass('Black Folding Chairs')).toBe('chairs');
    expect(suggestSizeClass('Balloon Archway')).toBe('archway');
    expect(suggestSizeClass('Big Six Wheel Table')).toBe('blackjack');
    expect(suggestSizeClass('Let It Ride Table')).toBe('blackjack');
    expect(suggestSizeClass('100 Guests Package')).toBe('package');
    expect(suggestSizeClass('Red Carpet')).toBe('decor');
    expect(suggestSizeClass('Roulette Wheel', true)).toBe('accessory');
  });

  it('classifies known items and asks once per unknown name', () => {
    const map = buildCatalogMap([
      { goodshuffle_name: 'Blackjack Table', size_class: 'blackjack' },
      { goodshuffle_name: '50 Guests Package', size_class: 'package' }
    ]);
    const { items, unknown } = classifyLineItems(parsedItems, map);
    expect(items[1].size_class).toBe('blackjack');
    expect(items[2].size_class).toBeNull();
    expect(unknown).toEqual([
      { name: 'Chip Trays', suggestion: 'accessory' },
      { name: 'Roulette Table', suggestion: 'roulette' }
    ]);
    const done = applyClassifications(items, { 'chip trays': 'accessory', 'roulette table': 'roulette' });
    expect(done.every(i => i.size_class)).toBe(true);
  });
});

describe('catalog seed migration', () => {
  it('every seeded name_key equals normalizeItemName(goodshuffle_name)', async () => {
    const fs = await import('fs');
    const sql = fs.readFileSync(new URL('../../../supabase/migrations/20260927120000_add_logistics_foundation.sql', import.meta.url), 'utf8');
    const seed = sql.slice(sql.indexOf('INSERT INTO public.equipment_catalog'));
    const rows = [...seed.matchAll(/\(\s*'((?:[^']|'')+)',\s*'((?:[^']|'')+)',\s*'(\w+)'\)/g)]
      .map(m => [m[1].replace(/''/g, "'"), m[2].replace(/''/g, "'")]);
    expect(rows.length).toBe(13);
    for (const [name, key] of rows) expect(key).toBe(normalizeItemName(name));
  });
});
