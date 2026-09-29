// ============================================
// FIELD VIEWS LOGIC (pure) — load sheets, crew route items, returns
// ============================================
// Turns the dispatch plan (size-class allocations per trip) back into named
// item lines -- "3× Blackjack Table, 3× Chip Trays, 3× Double Decks" -- for
// the warehouse load sheet, the crew's delivered/returned check-offs, and
// missing-item tracking.
import { ALLOCATABLE_CLASSES, CLASS_LABELS } from './dispatch';
import { normalizeItemName } from './catalog';

// Stable identity for an item line: its name plus its parent table's name
// (accessories like "Chip Trays" appear under several tables). Name-based so
// check-offs survive a pull sheet re-import.
export const itemKey = (name, parentName = null) =>
  `${normalizeItemName(parentName || '')}|${normalizeItemName(name)}`;

// Split `total` into whole parts proportional to `weights` (largest
// remainder), so parts always add back up to the total exactly.
export function apportion(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum || !total) return weights.map(() => 0);
  const raw = weights.map(w => (total * w) / sum);
  const parts = raw.map(Math.floor);
  let left = total - parts.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - parts[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) break;
    parts[i] += 1;
    left -= 1;
  }
  return parts;
}

// Deterministic trip order for splitting an event (same on every screen).
export const loadOrderOf = (loads = []) =>
  loads.slice().sort((a, b) => String(a.run_id).localeCompare(String(b.run_id)) || a.sequence - b.sequence).map(l => l.id);

// Split one event's equipment across the trips carrying it.
//   equipmentRows: that event's event_equipment rows
//   allocations:   that event's load_allocations rows (any trips)
//   loadOrder:     load ids in a stable order
// Tables of a class fill the event's rows of that class in pull-sheet order,
// trip by trip. Each table row's accessories follow its tables
// proportionally. Anything allocated beyond the pull sheet becomes an
// "(extra)" line so it still shows up on the sheet.
// Returns { [loadId]: item[] } with item =
//   { key, name, parentName, size_class, quantity, isAccessory }
export function splitEventAcrossLoads(equipmentRows = [], allocations = [], loadOrder = []) {
  const rows = equipmentRows.slice().sort((a, b) => (a.line_no ?? 0) - (b.line_no ?? 0));
  const byLine = new Map(rows.map(r => [r.line_no, r]));
  const parents = rows.filter(r => ALLOCATABLE_CLASSES.includes(r.size_class) && (r.parent_line_no == null || !byLine.has(r.parent_line_no)));
  const loads = loadOrder.filter(id => allocations.some(a => a.load_id === id));
  const out = Object.fromEntries(loads.map(id => [id, []]));

  const rowQty = new Map(); // line_no -> { loadId: qty }
  const extras = {};        // loadId -> { class: qty }

  for (const cls of ALLOCATABLE_CLASSES) {
    const classRows = parents.filter(r => r.size_class === cls);
    const remaining = new Map(classRows.map(r => [r.line_no, Number(r.quantity) || 0]));
    for (const loadId of loads) {
      let need = allocations
        .filter(a => a.load_id === loadId && a.size_class === cls)
        .reduce((s, a) => s + (Number(a.quantity) || 0), 0);
      for (const r of classRows) {
        if (need <= 0) break;
        const take = Math.min(need, remaining.get(r.line_no));
        if (!take) continue;
        remaining.set(r.line_no, remaining.get(r.line_no) - take);
        const m = rowQty.get(r.line_no) || {};
        m[loadId] = (m[loadId] || 0) + take;
        rowQty.set(r.line_no, m);
        need -= take;
      }
      if (need > 0) ((extras[loadId] ||= {})[cls] = need);
    }
  }

  for (const parent of parents) {
    const perLoad = rowQty.get(parent.line_no);
    if (!perLoad) continue;
    const weights = loads.map(id => perLoad[id] || 0);
    const assigned = weights.reduce((a, b) => a + b, 0);
    const accessoryShares = rows
      .filter(r => r.parent_line_no === parent.line_no)
      .map(acc => {
        const total = parent.quantity > 0 ? Math.round((acc.quantity * assigned) / parent.quantity) : 0;
        return { acc, parts: apportion(total, weights) };
      });
    loads.forEach((loadId, i) => {
      if (!weights[i]) return;
      out[loadId].push({
        key: itemKey(parent.item_name), name: parent.item_name, parentName: null,
        size_class: parent.size_class, quantity: weights[i], isAccessory: false
      });
      for (const { acc, parts } of accessoryShares) {
        if (!parts[i]) continue;
        out[loadId].push({
          key: itemKey(acc.item_name, parent.item_name), name: acc.item_name, parentName: parent.item_name,
          size_class: acc.size_class, quantity: parts[i], isAccessory: true
        });
      }
    });
  }

  for (const [loadId, classes] of Object.entries(extras)) {
    for (const [cls, qty] of Object.entries(classes)) {
      const name = `${CLASS_LABELS[cls]} (extra — not on pull sheet)`;
      out[loadId].push({ key: itemKey(name), name, parentName: null, size_class: cls, quantity: qty, isAccessory: false });
    }
  }
  return out;
}

// Merge item lists (same key -> quantities add).
export function mergeItems(lists) {
  const map = new Map();
  for (const item of lists.flat()) {
    const prev = map.get(item.key);
    map.set(item.key, prev ? { ...prev, quantity: prev.quantity + item.quantity } : { ...item });
  }
  return [...map.values()];
}

// Nest accessories under their parent line for display.
export function groupItems(items = []) {
  const groups = [];
  const byName = new Map();
  for (const item of items) {
    if (!item.isAccessory) {
      const g = { ...item, accessories: [] };
      groups.push(g);
      byName.set(item.name, g);
    }
  }
  for (const item of items) {
    if (!item.isAccessory) continue;
    const parent = byName.get(item.parentName);
    if (parent) parent.accessories.push(item);
    else groups.push({ ...item, accessories: [] });
  }
  return groups;
}

// ctx = { loads, allocations, equipmentByEvent } for the day.
function eventSplit(ctx, eventId) {
  return splitEventAcrossLoads(
    ctx.equipmentByEvent[eventId] || [],
    ctx.allocations.filter(a => a.event_id === eventId),
    loadOrderOf(ctx.loads)
  );
}

// Items a stop handles: a delivery drops what its trip carries for that
// event; a pickup collects everything that truck brought to the event.
export function stopItems(stop, ctx) {
  if (!stop?.event_id) return [];
  const split = eventSplit(ctx, stop.event_id);
  if (stop.stop_type === 'deliver') return split[stop.load_id] || [];
  if (stop.stop_type === 'pickup') {
    const runLoadIds = ctx.loads.filter(l => l.run_id === stop.run_id).map(l => l.id);
    return mergeItems(runLoadIds.map(id => split[id] || []));
  }
  return [];
}

// Warehouse load sheet for one trip: events in load order -- the last stop
// is loaded first (it goes deepest in the truck) -- each with its items.
export function buildLoadSheet(load, ctx, stops = []) {
  const eventIds = [...new Set(ctx.allocations.filter(a => a.load_id === load.id && a.quantity > 0).map(a => a.event_id))];
  const deliverSeq = (eventId) => {
    const s = stops.find(x => x.load_id === load.id && x.event_id === eventId && x.stop_type === 'deliver');
    return s ? s.sequence : Infinity; // no delivery stop yet -> treat as last stop
  };
  const ordered = eventIds.sort((a, b) => deliverSeq(b) - deliverSeq(a));
  return ordered.map((eventId, i) => ({
    eventId,
    loadPosition: i + 1,
    deliveryOrder: ordered.length - i,
    items: eventSplit(ctx, eventId)[load.id] || []
  }));
}

// ---- Returns --------------------------------------------------------------

const TYPE_FOR_STOP = { deliver: 'delivered', pickup: 'returned' };
export const checkTypeForStop = (stop) => TYPE_FOR_STOP[stop?.stop_type] || null;

// What should come back from a pickup: what this truck actually delivered
// to the event if the crew checked deliveries off, otherwise the plan.
export function expectedReturns(pickupStop, ctx, stops = [], checks = []) {
  const planned = stopItems(pickupStop, ctx);
  const deliverStopIds = new Set(stops
    .filter(s => s.run_id === pickupStop.run_id && s.event_id === pickupStop.event_id && s.stop_type === 'deliver')
    .map(s => s.id));
  const delivered = checks.filter(c => deliverStopIds.has(c.stop_id) && c.check_type === 'delivered');
  if (!delivered.length) return planned;
  return planned.map(item => {
    const got = delivered.filter(c => c.item_key === item.key);
    return got.length ? { ...item, quantity: got.reduce((s, c) => s + c.quantity, 0) } : item;
  });
}

// Per pickup stop: what came back vs. what should have.
//   state: 'pending'   nothing checked yet and it isn't overdue
//          'complete'  every item returned in full
//          'missing'   checked (or marked done), but items short/unchecked
//          'unchecked' the day has passed and nothing was checked at all
// `today` is 'YYYY-MM-DD'; runDate is the run's date.
export function returnReport(pickupStop, ctx, { stops = [], checks = [], runDate, today }) {
  const expected = expectedReturns(pickupStop, ctx, stops, checks);
  const returned = checks.filter(c => c.stop_id === pickupStop.id && c.check_type === 'returned');
  const byKey = new Map(returned.map(c => [c.item_key, c]));
  const lines = expected.map(item => {
    const c = byKey.get(item.key);
    return { ...item, expected: item.quantity, returned: c ? c.quantity : null };
  });
  const short = lines.filter(l => l.returned == null || l.returned < l.expected);
  const touched = returned.length > 0 || pickupStop.status === 'done';
  const overdue = runDate && today && runDate < today;

  let state;
  if (!expected.length) state = 'complete';
  else if (!short.length) state = 'complete';
  else if (touched) state = 'missing';
  else state = overdue ? 'unchecked' : 'pending';

  return {
    stopId: pickupStop.id,
    eventId: pickupStop.event_id,
    runId: pickupStop.run_id,
    state,
    lines,
    missing: short.map(l => ({ ...l, short: l.expected - (l.returned || 0) }))
  };
}
