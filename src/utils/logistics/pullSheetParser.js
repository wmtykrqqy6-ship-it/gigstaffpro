// ============================================
// GOODSHUFFLE PULL SHEET PARSER
// ============================================
// Pure parser over positioned text items (the shape pdf.js getTextContent()
// produces, flattened by textContentToItems below). Kept free of pdf.js
// itself so it can be unit-tested against real fixture output.
//
// Layout facts this relies on (from pullsheetlineitemgroup-v1-*.pdf):
//   - Quantities sit alone in a narrow left column (x ~37), vertically
//     centered on their item's block rather than aligned with its name.
//   - Item names are in a wider column (x ~125); accessories are indented a
//     bit further (x ~140). The ↑ arrow Goodshuffle draws next to them is an
//     image, not text, so indentation is the only reliable signal.
//   - Names use the body font size; Length/Description detail lines are a
//     size smaller.
//   - A checkbox tally column on the far right (x > 540) repeats quantities.
//   - Every page has a footer: "<printed at> - <Event Name> (#<invoice>)".

const RIGHT_COLUMN_X = 540;
const QTY_COLUMN_MAX_X = 80;
const TEXT_COLUMN_MIN_X = 100;
const FOOTER_MAX_Y = 15;
const LINE_Y_TOLERANCE = 2.5;
const ACCESSORY_INDENT = 6;

const DETAIL_PREFIX = /^(Length:|Width:|Height:|Description:|Wishlist View Order:|Notes?:|Color:|Size:)/i;
const FOOTER_RE = /\s-\s(.+?)\s\(#(\d+)\)\s*$/;
const PAGE_OF_RE = /^\d+\s+of\s+\d+$/i;

// Flatten a pdf.js TextContent into plain positioned items.
export function textContentToItems(textContent) {
  return (textContent?.items || [])
    .filter(it => typeof it.str === 'string' && it.str.trim() !== '')
    .map(it => ({
      str: it.str,
      x: it.transform[4],
      y: it.transform[5],
      height: it.height || Math.abs(it.transform[3]) || 0
    }));
}

// Group items on one page into visual lines (top to bottom, left to right).
function groupLines(items) {
  const sorted = items.slice().sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const line = lines.find(l => Math.abs(l.y - it.y) <= LINE_Y_TOLERANCE);
    if (line) line.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    line.x = line.items[0].x;
    line.height = Math.max(...line.items.map(i => i.height));
    line.text = line.items.map(i => i.str.trim()).join(' ').replace(/\s+/g, ' ').trim();
  }
  return lines.sort((a, b) => b.y - a.y);
}

const median = (nums) => {
  if (!nums.length) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const pad2 = (v) => String(v).padStart(2, '0');

function to24h(hour, minute, meridiem) {
  let h = Number(hour) % 12;
  if (/pm/i.test(meridiem)) h += 12;
  return `${pad2(h)}:${pad2(minute || 0)}`;
}

// A street line starts with a house number: "123 Main St", "123A Main St",
// or a Wisconsin grid address like "W175N11086 Stonewood Dr".
export const isStreetPart = (part) => /^[NSEW]?\d+(?:[NSEW]\d+|[A-Z])?\s+\S/i.test(String(part || '').trim());

// "undefined, Darien, IL" -> { full: "Darien, IL", venue: null, streetMissing: true }
// "The Grand Hall, 123 Main St, Darien, IL" -> { venue: "The Grand Hall", full: "123 Main St, Darien, IL" }
export function cleanAddress(raw) {
  const parts = String(raw || '')
    .split(',')
    .map(p => p.trim())
    .filter(p => p && !/^(undefined|null)$/i.test(p));
  const streetIdx = parts.findIndex(isStreetPart);
  // Anything before the street line is a venue/building name, not address.
  const venue = streetIdx > 0 ? parts.slice(0, streetIdx).join(', ') : null;
  const full = (streetIdx > 0 ? parts.slice(streetIdx) : parts).join(', ');
  return { raw: raw || '', full, venue, streetMissing: streetIdx < 0 };
}

// "Friday, 9/25 [7:00 PM - 10:00 PM CDT]" -> { month, day, start, end, tz }
export function parseEventTime(text) {
  const out = { month: null, day: null, year: null, start: null, end: null, timezone: null };
  const dateMatch = String(text || '').match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (dateMatch) {
    out.month = Number(dateMatch[1]);
    out.day = Number(dateMatch[2]);
    if (dateMatch[3]) out.year = Number(dateMatch[3].length === 2 ? '20' + dateMatch[3] : dateMatch[3]);
  }
  const bracket = (String(text || '').match(/\[([^\]]*)\]/) || [])[1] || '';
  const times = [...bracket.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/gi)];
  if (times[0]) out.start = to24h(times[0][1], times[0][2], times[0][3]);
  if (times[1]) out.end = to24h(times[1][1], times[1][2], times[1][3]);
  const tz = bracket.match(/\b([A-Z]{2,4})\s*$/);
  if (tz) out.timezone = tz[1];
  return out;
}

// Pick the year for a month/day using the rental date range
// ("9/25/2026 - 9/25/2026"). Handles ranges that cross New Year.
export function resolveYear(month, day, rangeText) {
  const m = String(rangeText || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m || !month || !day) return null;
  const start = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  const end = new Date(Number(m[6]), Number(m[4]) - 1, Number(m[5]));
  for (const year of [Number(m[3]), Number(m[6])]) {
    const d = new Date(year, month - 1, day);
    if (d >= start && d <= end) return year;
  }
  return Number(m[3]);
}

const isDayDateLine = (text) =>
  /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+\d{1,2}\/\d{1,2}/i.test(text) || /\[(TBD|[^\]]*(AM|PM)[^\]]*)\]/i.test(text);

// Main entry point. `pages` is [{ items: [{ str, x, y, height }] }] in page order.
export function parsePullSheet(pages) {
  const warnings = [];
  const result = {
    invoice: null,
    eventName: null,
    clientName: null,
    clientPhone: null,
    date: null,
    startTime: null,
    endTime: null,
    timezone: null,
    deliveryType: null,
    address: cleanAddress(''),
    lineItems: [],
    warnings
  };

  const pageLines = (pages || []).map(p => groupLines((p.items || []).filter(i => i.x < RIGHT_COLUMN_X)));
  if (!pageLines.length || !pageLines[0].length) {
    warnings.push('No text found in this PDF. Is it a Goodshuffle pull sheet?');
    return result;
  }

  result.isPullSheet = pageLines[0].some(l => /\bPULL SHEET\b/i.test(l.text));
  if (!result.isPullSheet) {
    warnings.push('This doesn\'t look like a Goodshuffle pull sheet (e.g. it may be the receipt). Upload the pull sheet PDF.');
  }

  // ---- Footer: proper-case event name + invoice ----
  for (const lines of pageLines) {
    const footer = lines.find(l => l.y < FOOTER_MAX_Y && FOOTER_RE.test(l.text));
    if (footer) {
      const [, name, inv] = footer.text.match(FOOTER_RE);
      result.eventName = name.trim();
      result.invoice = inv;
      break;
    }
  }

  // ---- Header (page 1, above "Rental Items") ----
  const first = pageLines[0];
  const rentalIdx = first.findIndex(l => /^Rental Items\b/i.test(l.text));
  const header = rentalIdx >= 0 ? first.slice(0, rentalIdx) : first;
  const rentalLine = rentalIdx >= 0 ? first[rentalIdx] : null;

  for (const line of header) {
    const t = line.text;
    let m;
    if ((m = t.match(/Project No:\s*(\d+)/i))) result.invoice = result.invoice || m[1];
    if (!result.invoice && (m = t.match(/(?:QUOTE|ORDER|INVOICE)\s*#\s*(\d+)/i))) result.invoice = m[1];
    if ((m = t.match(/Event Time:\s*(.+)$/i))) {
      const et = parseEventTime(m[1]);
      result.startTime = et.start;
      result.endTime = et.end;
      result.timezone = et.timezone;
      result._month = et.month;
      result._day = et.day;
      result._year = et.year;
    }
    if ((m = t.match(/Client:\s*(.+)$/i))) {
      const phone = m[1].match(/\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}/);
      result.clientPhone = phone ? phone[0].trim() : null;
      result.clientName = (phone ? m[1].replace(phone[0], '') : m[1]).trim() || null;
    }
  }

  // Title fallback for the event name ("PAWELEK SAMPLE" / "QUOTE #...").
  if (!result.eventName) {
    const titleLines = header.filter(l => l.height >= 18 && !/^(PULL SHEET|QUOTE|ORDER|INVOICE)\b/i.test(l.text));
    const title = titleLines.map(l => l.text.replace(/\bPULL SHEET\b.*$/i, '').trim()).find(Boolean);
    if (title) result.eventName = title.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
  }

  // Delivery block: left-column lines after "Client:" and before Rental Items,
  // skipping the big day/date badge on the far left.
  const clientIdx = header.findIndex(l => /Client:/i.test(l.text));
  const logisticsHeader = clientIdx < 0 ? [] : header
    .slice(clientIdx + 1)
    .map(l => ({
      ...l,
      text: l.items
        .filter(i => i.x >= 60 && i.x < 350 && i.height < 18)
        .map(i => i.str.trim())
        .join(' ')
        .trim()
    }))
    .filter(l => l.text);
  // The same delivery block is repeated in the Logistics section: type, date,
  // address lines, then Description / NOTES. The "Logistics" heading can sit
  // at the bottom of one page with its content on the next, so keep reading
  // across pages (skipping footers) until Description/NOTES.
  const logisticsSection = [];
  let inSection = false;
  sectionScan:
  for (const lines of pageLines) {
    for (const l of lines) {
      if (!inSection) {
        if (/^Logistics\b/i.test(l.text)) inSection = true;
        continue;
      }
      if (l.y < FOOTER_MAX_Y) continue;
      if (DETAIL_PREFIX.test(l.text) || /\bNOTES\b/.test(l.text)) break sectionScan;
      const text = l.items.filter(i => i.x >= TEXT_COLUMN_MIN_X).map(i => i.str.trim()).join(' ').trim();
      if (text) logisticsSection.push({ ...l, text });
    }
  }

  const readBlock = (lines) => lines.length
    ? {
        deliveryType: lines[0].text,
        address: cleanAddress(lines.slice(1).filter(l => !isDayDateLine(l.text)).map(l => l.text).join(', '))
      }
    : null;
  const fromHeader = readBlock(logisticsHeader);
  const fromSection = readBlock(logisticsSection);
  // Prefer whichever copy actually has a street address (header first).
  const block = [fromHeader, fromSection].find(b => b && !b.address.streetMissing) || fromHeader || fromSection;
  if (block) {
    result.deliveryType = block.deliveryType;
    result.address = block.address;
  }

  // Event date from Event Time + rental range year.
  if (result._month && result._day) {
    let year = result._year || resolveYear(result._month, result._day, rentalLine?.text);
    if (!year) {
      const printed = pageLines.flat().find(l => l.y < FOOTER_MAX_Y && /\d{1,2}\/\d{1,2}\/(\d{4})/.test(l.text));
      year = printed ? Number(printed.text.match(/\d{1,2}\/\d{1,2}\/(\d{4})/)[1]) : null;
      if (year) warnings.push('Event year was guessed from the print date — please double-check the date.');
    }
    if (year) result.date = `${year}-${pad2(result._month)}-${pad2(result._day)}`;
  }
  delete result._month;
  delete result._day;
  delete result._year;

  if (!result.date) warnings.push('Could not read the event date.');
  if (!result.startTime) warnings.push('Could not read the event start time.');
  if (!result.invoice) warnings.push('Could not find the Goodshuffle project/invoice number.');
  if (result.address.streetMissing) warnings.push('Street address is missing from the pull sheet — enter it before saving.');

  // ---- Rental items ----
  // Collected from the "Rental Items" header to the "Logistics" header.
  const regions = [];
  let started = false;
  let stopped = false;
  pageLines.forEach((lines, pageIndex) => {
    if (stopped) return;
    let region = [];
    for (const line of lines) {
      if (!started) {
        if (/^Rental Items\b/i.test(line.text)) started = true;
        continue;
      }
      if (/^Logistics\b/i.test(line.text)) { stopped = true; break; }
      if (line.y < FOOTER_MAX_Y && (FOOTER_RE.test(line.text) || PAGE_OF_RE.test(line.text))) continue;
      region.push(line);
    }
    if (started && region.length) regions.push({ pageIndex, lines: region });
  });

  // Quantities and item text are separate columns; split each line's items.
  const qtyHeights = [];
  const pageData = regions.map(({ pageIndex, lines }) => {
    const qtys = [];
    const textItems = [];
    for (const line of lines) {
      for (const it of line.items) {
        if (it.x < QTY_COLUMN_MAX_X && /^\d+$/.test(it.str.trim())) {
          qtys.push({ y: it.y, qty: Number(it.str.trim()), used: false });
          qtyHeights.push(it.height);
        } else if (it.x >= TEXT_COLUMN_MIN_X) {
          textItems.push(it);
        }
      }
    }
    return { pageIndex, qtys, textLines: groupLines(textItems) };
  });

  const nameHeight = median(qtyHeights) || median(pageData.flatMap(p => p.textLines.map(l => l.height)));
  const isNameLine = (l) => l.height >= nameHeight * 0.95 && !DETAIL_PREFIX.test(l.text);

  const names = [];
  for (const page of pageData) {
    const pageNames = page.textLines.filter(isNameLine);
    pageNames.forEach((line, i) => {
      const floor = i + 1 < pageNames.length ? pageNames[i + 1].y : -Infinity;
      const qty = page.qtys.find(q => !q.used && q.y <= line.y + 4 && q.y > floor);
      if (qty) qty.used = true;
      names.push({ text: line.text, x: line.x, quantity: qty ? qty.qty : null });
    });
  }

  const baseX = names.length ? Math.min(...names.map(n => n.x)) : 0;
  let lastParentIndex = null;
  names.forEach((n) => {
    const isAccessory = n.x > baseX + ACCESSORY_INDENT && lastParentIndex != null;
    if (n.quantity == null) warnings.push(`No quantity found for "${n.text}" — assumed 1.`);
    const item = {
      name: n.text,
      quantity: n.quantity ?? 1,
      isAccessory,
      parentIndex: isAccessory ? lastParentIndex : null
    };
    result.lineItems.push(item);
    if (!isAccessory) lastParentIndex = result.lineItems.length - 1;
  });

  if (!result.lineItems.length) warnings.push('No rental items found on this pull sheet.');
  return result;
}
