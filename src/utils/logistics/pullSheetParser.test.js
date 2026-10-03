import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parsePullSheet, textContentToItems, cleanAddress, isStreetPart, parseEventTime, resolveYear, parseClientLine } from './pullSheetParser';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => path.join(here, '__fixtures__', name);

// Same extraction the browser does (pdfText.js), minus the worker setup.
async function loadPages(file) {
  const data = new Uint8Array(fs.readFileSync(file));
  const doc = await getDocument({ data, verbosity: 0 }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    pages.push({ items: textContentToItems(await page.getTextContent()) });
  }
  await doc.destroy();
  return pages;
}

describe('parsePullSheet — sample fixture (231849935)', () => {
  let r;
  beforeAll(async () => {
    r = parsePullSheet(await loadPages(fixture('pullsheetlineitemgroup-v1-231849935.pdf')));
  });

  it('recognizes a pull sheet', () => {
    expect(r.isPullSheet).toBe(true);
  });

  it('reads the invoice / project number', () => {
    expect(r.invoice).toBe('231849935');
  });

  it('reads the event name in proper case', () => {
    expect(r.eventName).toBe('Pawelek Sample Quote');
  });

  it('reads client name and phone', () => {
    expect(r.clientName).toBe('Dave Pawelek');
    expect(r.clientPhone).toBe('(847) 373-6925');
  });

  it('reads date (year from the rental range) and times', () => {
    expect(r.date).toBe('2026-09-25');
    expect(r.startTime).toBe('19:00');
    expect(r.endTime).toBe('22:00');
    expect(r.timezone).toBe('CDT');
  });

  it('reads the delivery type and flags the missing street address', () => {
    expect(r.deliveryType).toBe('Standard Delivery Drop-Off');
    expect(r.address.full).toBe('Darien, IL');
    expect(r.address.streetMissing).toBe(true);
    expect(r.warnings.some(w => /Street address is missing/.test(w))).toBe(true);
  });

  it('reads every line item with the right quantity and accessory links', () => {
    const rows = r.lineItems.map(i => [
      i.quantity,
      i.name,
      i.isAccessory ? r.lineItems[i.parentIndex].name : null
    ]);
    expect(rows).toEqual([
      [1, '50 Guests Package', null],
      [3, 'Blackjack Table', null],
      [3, 'Chip Trays', 'Blackjack Table'],
      [3, 'Double Decks of Cards', 'Blackjack Table'],
      [1, '10ft Craps Table', null],
      [3, 'Chip Trays', '10ft Craps Table'],
      [1, 'Craps Chip', '10ft Craps Table'],
      [1, 'Craps Stick and Dice', '10ft Craps Table'],
      [1, 'Roulette Table', null],
      [1, 'Roulette Chips', 'Roulette Table'],
      [1, 'Chip Trays', 'Roulette Table'],
      [1, 'Roulette Wheel', 'Roulette Table'],
      [1, "Texas Hold'EM Poker", null],
      [1, 'Single Decks of Cards', "Texas Hold'EM Poker"],
      [1, 'Dealer Pucks', "Texas Hold'EM Poker"]
    ]);
  });

  it('does not pick up description text or the Logistics section as items', () => {
    const names = r.lineItems.map(i => i.name).join('|');
    expect(names).not.toMatch(/Description|Length|Standard Delivery|NOTES/);
  });

  it('has no warnings other than the missing street', () => {
    expect(r.warnings).toEqual(['Street address is missing from the pull sheet — enter it before saving.']);
  });
});

const WEIMER = 'pullsheetlineitemgroup-v2-Weimer-Bearing--Transmission-Inc-231273157.pdf';
const GENEVA = 'pullsheetlineitemgroup-v4-Grand-Geneva-Resort--Spa-231581508.pdf';

const itemRows = (r) => r.lineItems.map(i => [i.quantity, i.name, i.isAccessory ? r.lineItems[i.parentIndex].name : null]);

describe('parsePullSheet — Weimer Bearing fixture (231273157)', () => {
  let r;
  beforeAll(async () => { r = parsePullSheet(await loadPages(fixture(WEIMER))); });

  it('reads the header, keeping " - " inside the event name', () => {
    expect(r).toMatchObject({
      invoice: '231273157',
      eventName: 'Armstrong - Weimer Bearing & Transmission, Inc.',
      clientName: 'Catherine Armstrong',
      clientPhone: null,
      date: '2026-09-30',
      startTime: '17:30',
      endTime: '20:30',
      deliveryType: 'Standard Delivery Repeat Customer Drop-Off'
    });
    expect(r.warnings).toEqual([]);
  });

  it('takes the Wisconsin grid address and venue from the pull sheet', () => {
    expect(r.address).toMatchObject({
      venue: 'Weimer Bearing & Transmission, Inc.',
      full: 'N112W13131 Mequon Rd, Germantown, WI 53022',
      streetMissing: false
    });
  });

  it('reads every line item', () => {
    expect(itemRows(r)).toEqual([
      [3, 'Blackjack Table', null],
      [3, 'Chip Trays', 'Blackjack Table'],
      [3, 'Double Decks of Cards', 'Blackjack Table'],
      [1, 'Roulette Table', null],
      [1, 'Roulette Chips', 'Roulette Table'],
      [1, 'Chip Trays', 'Roulette Table'],
      [1, 'Roulette Wheel', 'Roulette Table'],
      [1, '10ft Craps Table', null],
      [3, 'Chip Trays', '10ft Craps Table'],
      [1, 'Craps Chip', '10ft Craps Table'],
      [1, 'Craps Stick and Dice', '10ft Craps Table'],
      [2, "Texas Hold'EM Poker", null],
      [2, 'Single Decks of Cards', "Texas Hold'EM Poker"],
      [2, 'Dealer Pucks', "Texas Hold'EM Poker"]
    ]);
  });

  it('falls back to the Logistics section even when its heading is on the previous page', async () => {
    const pages = await loadPages(fixture(WEIMER));
    // Blank out the page-1 header copy; the page-2 copy should be used.
    pages[0].items = pages[0].items.filter(i => !/Mequon Rd|^Weimer Bearing & Transmission, Inc\.$/.test(i.str));
    const fb = parsePullSheet(pages);
    expect(fb.address).toMatchObject({ full: 'N112W13131 Mequon Rd, Germantown, WI 53022', streetMissing: false });
  });
});

describe('parsePullSheet — Grand Geneva fixture (231581508)', () => {
  let r;
  beforeAll(async () => { r = parsePullSheet(await loadPages(fixture(GENEVA))); });

  it('reads the header', () => {
    expect(r).toMatchObject({
      invoice: '231581508',
      eventName: 'Kass - Grand Geneva Resort & Spa',
      clientName: 'Carly Kass',
      clientPhone: '(301) 331-2221',
      date: '2026-10-06',
      startTime: '19:30',
      endTime: '22:30',
      deliveryType: 'Delivery Fee Drop-Off'
    });
    expect(r.warnings).toEqual([]);
  });

  it('takes the address and venue from the pull sheet', () => {
    expect(r.address).toMatchObject({
      venue: 'Grand Geneva Resort & Spa',
      full: '7036 Grand Geneva Way, Lake Geneva, WI 53147',
      streetMissing: false
    });
  });

  it('reads every line item', () => {
    expect(itemRows(r)).toEqual([
      [2, 'Roulette Table', null],
      [2, 'Roulette Chips', 'Roulette Table'],
      [2, 'Chip Trays', 'Roulette Table'],
      [2, 'Roulette Wheel', 'Roulette Table'],
      [2, "Texas Hold'EM Poker", null],
      [2, 'Single Decks of Cards', "Texas Hold'EM Poker"],
      [2, 'Dealer Pucks', "Texas Hold'EM Poker"],
      [8, 'Blackjack Table', null],
      [8, 'Chip Trays', 'Blackjack Table'],
      [8, 'Double Decks of Cards', 'Blackjack Table'],
      [2, '10ft Craps Table', null],
      [6, 'Chip Trays', '10ft Craps Table'],
      [2, 'Craps Chip', '10ft Craps Table'],
      [2, 'Craps Stick and Dice', '10ft Craps Table']
    ]);
  });
});

describe('parsePullSheet — receipt fixtures (reference only)', () => {
  it.each([
    'fulfillment-confirmation-sheet-v1-231849935.pdf',
    'fulfillment-confirmation-sheet-v2-Weimer-Bearing--Transmission-Inc-231273157.pdf',
    'fulfillment-confirmation-sheet-v4-Grand-Geneva-Resort--Spa-231581508.pdf'
  ])('flags %s as not a pull sheet', async (file) => {
    const r = parsePullSheet(await loadPages(fixture(file)));
    expect(r.isPullSheet).toBe(false);
    expect(r.warnings[0]).toMatch(/doesn't look like a Goodshuffle pull sheet/);
  });
});

describe('parsePullSheet — edge cases', () => {
  it('handles an empty PDF', () => {
    const r = parsePullSheet([{ items: [] }]);
    expect(r.lineItems).toEqual([]);
    expect(r.warnings[0]).toMatch(/No text found/);
  });

  it('keeps a real street address', async () => {
    const pages = await loadPages(fixture('pullsheetlineitemgroup-v1-231849935.pdf'));
    const addr = pages[0].items.find(i => i.str === 'undefined, Darien, IL');
    addr.str = '1 Main St, Darien, IL 60561';
    const r = parsePullSheet(pages);
    expect(r.address.full).toBe('1 Main St, Darien, IL 60561');
    expect(r.address.streetMissing).toBe(false);
    expect(r.warnings).toEqual([]);
  });
});

describe('parsePullSheet — addresses', () => {
  // Real fixture layout with the address text swapped, so these exercise the
  // same positions/fonts Goodshuffle produces.
  const withAddress = async ({ header, section, venueLine } = {}) => {
    const pages = await loadPages(fixture('pullsheetlineitemgroup-v1-231849935.pdf'));
    if (header !== undefined) pages[0].items.find(i => i.str === 'undefined, Darien, IL').str = header;
    if (section !== undefined) pages[1].items.find(i => i.str === 'undefined, Darien, IL').str = section;
    if (venueLine) pages[0].items.push({ str: venueLine, x: 86, y: 645, height: 9 });
    return parsePullSheet(pages);
  };

  it('takes a full street address from the header block', async () => {
    const r = await withAddress({ header: '7550 S Cass Ave, Darien, IL 60561' });
    expect(r.address).toMatchObject({ full: '7550 S Cass Ave, Darien, IL 60561', venue: null, streetMissing: false });
    expect(r.warnings).toEqual([]);
  });

  it('accepts Wisconsin grid addresses as a street', async () => {
    const r = await withAddress({ header: 'W175N11086 Stonewood Dr, Germantown, WI 53022' });
    expect(r.address).toMatchObject({ full: 'W175N11086 Stonewood Dr, Germantown, WI 53022', streetMissing: false });
  });

  it('splits a venue name off the address (same line)', async () => {
    const r = await withAddress({ header: 'The Grand Hall, 123 Main St, Darien, IL 60561' });
    expect(r.address).toMatchObject({ venue: 'The Grand Hall', full: '123 Main St, Darien, IL 60561' });
  });

  it('splits a venue name off the address (its own line)', async () => {
    const r = await withAddress({ venueLine: 'The Grand Hall', header: '123 Main St, Darien, IL 60561' });
    expect(r.address).toMatchObject({ venue: 'The Grand Hall', full: '123 Main St, Darien, IL 60561' });
    expect(r.deliveryType).toBe('Standard Delivery Drop-Off');
  });

  it('falls back to the Logistics section when only it has the street', async () => {
    const r = await withAddress({ section: '123 Main St, Darien, IL 60561' });
    expect(r.address).toMatchObject({ full: '123 Main St, Darien, IL 60561', streetMissing: false });
    expect(r.deliveryType).toBe('Standard Delivery Drop-Off');
  });

  it('keeps street + city when Goodshuffle leaves one part undefined', async () => {
    const r = await withAddress({ header: '123 Main St, undefined, IL' });
    expect(r.address).toMatchObject({ full: '123 Main St, IL', streetMissing: false });
  });
});

describe('helpers', () => {
  it('cleanAddress drops undefined parts and separates the venue', () => {
    expect(cleanAddress('undefined, Darien, IL')).toMatchObject({ full: 'Darien, IL', venue: null, streetMissing: true });
    expect(cleanAddress('535 S 93rd St, Milwaukee, WI 53214')).toMatchObject({ venue: null, streetMissing: false });
    expect(cleanAddress('Drury Lane, 100 Drury Ln, Oakbrook Terrace, IL')).toMatchObject({ venue: 'Drury Lane', full: '100 Drury Ln, Oakbrook Terrace, IL' });
    expect(cleanAddress('')).toMatchObject({ full: '', streetMissing: true });
  });

  it('isStreetPart recognizes house numbers but not floors or zips', () => {
    for (const s of ['123 Main St', '123A Main St', 'W175N11086 Stonewood Dr', 'N56W16865 Ridgewood Dr']) expect(isStreetPart(s)).toBe(true);
    for (const s of ['2nd Floor', 'IL 60561', '60561', 'Darien', 'Suite 200']) expect(isStreetPart(s)).toBe(false);
  });

  it('parseEventTime handles AM/PM, noon/midnight and TBD', () => {
    expect(parseEventTime('Friday, 9/25 [7:00 PM - 10:00 PM CDT]')).toMatchObject({ month: 9, day: 25, start: '19:00', end: '22:00', timezone: 'CDT' });
    expect(parseEventTime('Sat, 1/3 [12:30 PM - 12:00 AM CST]')).toMatchObject({ start: '12:30', end: '00:00' });
    expect(parseEventTime('Friday, 9/25 [TBD]')).toMatchObject({ month: 9, day: 25, start: null, end: null });
  });

  it('resolveYear picks the year inside the rental range, including across New Year', () => {
    expect(resolveYear(9, 25, '9/25/2026 - 9/25/2026')).toBe(2026);
    expect(resolveYear(1, 1, '12/31/2026 - 1/1/2027')).toBe(2027);
    expect(resolveYear(12, 31, '12/31/2026 - 1/1/2027')).toBe(2026);
    expect(resolveYear(9, 25, '')).toBeNull();
  });
});

describe('parseClientLine', () => {
  it('stops at the next column label', () => {
    expect(parseClientLine('Iyonna Isom  Sales Lead: Alyssa Newsom')).toEqual({ name: 'Iyonna Isom', phone: null });
  });
  it('keeps an extension off the name', () => {
    expect(parseClientLine('Jessi H  x237')).toEqual({ name: 'Jessi H', phone: null });
    expect(parseClientLine('Jessi H (414) 555-1212 x237')).toEqual({ name: 'Jessi H', phone: '(414) 555-1212 x237' });
  });
  it('plain name and name + phone still work', () => {
    expect(parseClientLine('Carly Kass')).toEqual({ name: 'Carly Kass', phone: null });
    expect(parseClientLine('Dave Pawelek (262) 555-0100')).toEqual({ name: 'Dave Pawelek', phone: '(262) 555-0100' });
  });
  it('keeps names with x in them', () => {
    expect(parseClientLine('Alex Baxter')).toEqual({ name: 'Alex Baxter', phone: null });
  });
});
