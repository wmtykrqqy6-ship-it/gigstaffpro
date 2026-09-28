// ============================================
// PULL SHEET IMPORT — matching and equipment diffs
// ============================================
import { normalizeItemName } from './catalog';

const dateOnly = (d) => (d ? String(d).split('T')[0] : '');

// Decide what an import should do:
//   update — an event already carries this Goodshuffle invoice
//   attach — no invoice match, but events on the same date have no invoice yet
//   create — neither
export function findImportMatch(parsed, events = []) {
  const invoice = parsed?.invoice ? String(parsed.invoice).trim() : null;
  if (invoice) {
    const existing = events.find(e => e.goodshuffle_invoice && String(e.goodshuffle_invoice).trim() === invoice);
    if (existing) return { type: 'update', event: existing };
  }
  if (parsed?.date) {
    const candidates = events.filter(e =>
      dateOnly(e.date) === parsed.date &&
      !e.goodshuffle_invoice &&
      e.status !== 'cancelled'
    );
    if (candidates.length) return { type: 'attach', candidates };
  }
  return { type: 'create' };
}

// Turn classified parsed items into event_equipment rows. Accessories point
// at their parent by line number (line_no is the item's position on the pull
// sheet), so the whole set inserts in one call without a two-pass id lookup.
export function toEquipmentRows(eventId, items = []) {
  return items.map((item, index) => ({
    event_id: eventId,
    line_no: index + 1,
    item_name: item.name,
    size_class: item.size_class,
    quantity: Math.max(0, Math.floor(Number(item.quantity) || 0)),
    parent_line_no: item.parentIndex != null ? item.parentIndex + 1 : null
  }));
}

// Group equipment rows back into parents with nested accessories, for display.
export function groupEquipment(rows = []) {
  const sorted = rows.slice().sort((a, b) => (a.line_no ?? 0) - (b.line_no ?? 0));
  const parents = [];
  const byLine = new Map();
  for (const row of sorted) {
    if (row.parent_line_no == null || !byLine.has(row.parent_line_no)) {
      const group = { ...row, accessories: [] };
      parents.push(group);
      byLine.set(row.line_no, group);
    } else {
      byLine.get(row.parent_line_no).accessories.push(row);
    }
  }
  return parents;
}

function totalsByName(rows) {
  const totals = new Map();
  for (const row of rows) {
    const name = row.item_name ?? row.name;
    const key = normalizeItemName(name);
    const prev = totals.get(key);
    const isAccessory = row.parent_line_no != null || row.parentIndex != null;
    totals.set(key, {
      name: prev?.name || name,
      quantity: (prev?.quantity || 0) + (Number(row.quantity) || 0),
      isAccessory: prev ? prev.isAccessory && isAccessory : isAccessory
    });
  }
  return totals;
}

// Compare the equipment already saved on an event against a re-imported pull
// sheet. Accessory quantities are summed across parents (Chip Trays on three
// tables is one line). Tables come first in the result.
export function diffEquipment(oldRows = [], newRows = []) {
  const before = totalsByName(oldRows);
  const after = totalsByName(newRows);
  const keys = new Set([...before.keys(), ...after.keys()]);
  const changes = [];
  for (const key of keys) {
    const a = before.get(key);
    const b = after.get(key);
    const delta = (b?.quantity || 0) - (a?.quantity || 0);
    if (delta !== 0) {
      changes.push({
        name: (b || a).name,
        delta,
        from: a?.quantity || 0,
        to: b?.quantity || 0,
        isAccessory: (b || a).isAccessory
      });
    }
  }
  return changes.sort((x, y) => Number(x.isAccessory) - Number(y.isAccessory));
}

export function formatDiff(changes = []) {
  if (!changes.length) return 'No equipment changes';
  return changes.map(c => `${c.delta > 0 ? '+' : '−'}${Math.abs(c.delta)} ${c.name}`).join(', ');
}
