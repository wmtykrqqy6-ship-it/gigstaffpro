// Supabase reads/writes for the Logistics area. Kept together so the import
// modal and the Logistics view share one implementation.
import { supabase } from '../../supabaseClient';
import { normalizeItemName } from '../../utils/logistics/catalog';
import { toEquipmentRows } from '../../utils/logistics/importMatch';

export const LOGISTICS_MIGRATION = '20260927120000_add_logistics_foundation.sql';

// True when an error means the logistics migration hasn't been applied yet
// (table or column missing), so the UI can say so instead of a raw error.
export function isMissingSchemaError(error) {
  if (!error) return false;
  return ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(error.code) ||
    /does not exist|could not find the (table|column)/i.test(error.message || '');
}

export async function loadTrucks() {
  const { data, error } = await supabase.from('trucks').select('*').order('priority').order('name');
  if (error) throw error;
  return data || [];
}

export async function loadCatalog() {
  const { data, error } = await supabase.from('equipment_catalog').select('*').order('goodshuffle_name');
  if (error) throw error;
  return data || [];
}

export async function loadEventEquipment(eventIds) {
  if (!eventIds.length) return [];
  const rows = [];
  // Chunk to keep the `in` filter's URL a sane length.
  for (let i = 0; i < eventIds.length; i += 100) {
    const { data, error } = await supabase
      .from('event_equipment')
      .select('*')
      .in('event_id', eventIds.slice(i, i + 100))
      .order('line_no');
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

// answers: [{ name, size_class, position_key?, staff_per_unit? }] -- the
// staffing fields are only sent when given (they need the staffing migration).
export async function saveCatalogEntries(answers) {
  if (!answers.length) return;
  const { error } = await supabase.from('equipment_catalog').upsert(
    answers.map(a => ({
      goodshuffle_name: a.name.trim(),
      name_key: normalizeItemName(a.name),
      size_class: a.size_class,
      ...('staff_per_unit' in a ? { position_key: a.position_key || null, staff_per_unit: a.staff_per_unit || 0 } : {}),
      updated_at: new Date().toISOString()
    })),
    { onConflict: 'name_key' }
  );
  if (error) throw error;
}

// Replace an event's equipment with a freshly imported set. Not atomic
// (delete, then insert): if the insert fails the event is left with no
// equipment, and re-importing the pull sheet restores it.
export async function replaceEventEquipment(eventId, classifiedItems) {
  const { error: delError } = await supabase.from('event_equipment').delete().eq('event_id', eventId);
  if (delError) throw delError;
  const rows = toEquipmentRows(eventId, classifiedItems);
  if (!rows.length) return;
  const { error } = await supabase.from('event_equipment').insert(rows);
  if (error) throw error;
}

// address/venue are only written when given, so callers can leave an
// event's existing values alone by passing null.
// Replace an event's staffing positions ([{ key, count }]). Only called after
// the admin explicitly chose to apply a proposed change.
export async function updateEventPositions(eventId, positions) {
  const { error } = await supabase.from('events').update({ positions }).eq('id', eventId);
  if (error) throw error;
}

export async function linkEventToInvoice(eventId, { invoice, deliveryType, address, venue }) {
  const patch = { goodshuffle_invoice: invoice || null, delivery_type: deliveryType || null };
  if (address) patch.address = address;
  if (venue) patch.venue = venue;
  const { error } = await supabase.from('events').update(patch).eq('id', eventId);
  if (error) throw error;
}

// ---- Dispatch board (phase 2) ---------------------------------------------

export const DISPATCH_MIGRATION = '20260928120000_add_logistics_dispatch.sql';

const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

// Everything planned for one date: runs, their loads, allocations and stops.
export function loadDispatchDay(date) {
  return loadDispatchRange(date, date);
}

// Same, for a date range (inclusive) -- used by the Returns tab.
export async function loadDispatchRange(fromDate, toDate) {
  const runs = must(await supabase.from('daily_runs').select('*').gte('run_date', fromDate).lte('run_date', toDate)) || [];
  return loadRunDetails(runs);
}

// Loads, allocations and stops for a set of runs.
async function loadRunDetails(runs) {
  if (!runs.length) return { runs, loads: [], allocations: [], stops: [] };
  const runIds = runs.map(r => r.id);
  const [loads, stops] = await Promise.all([
    supabase.from('run_loads').select('*').in('run_id', runIds).order('sequence').then(must),
    supabase.from('run_stops').select('*').in('run_id', runIds).order('sequence').then(must)
  ]);
  const loadIds = (loads || []).map(l => l.id);
  const allocations = loadIds.length
    ? must(await supabase.from('load_allocations').select('*').in('load_id', loadIds)) || []
    : [];
  return { runs, loads: loads || [], allocations, stops: stops || [] };
}

// Creates the run plus its first load (the morning trip). `extra` carries
// e.g. { is_personal: true } for a personal-vehicle delivery.
export async function createRun(date, truckId, extra = {}) {
  const run = must(await supabase.from('daily_runs').insert([{ run_date: date, truck_id: truckId, ...extra }]).select().single());
  must(await supabase.from('run_loads').insert([{ run_id: run.id, sequence: 1 }]));
  return run;
}

export async function updateRun(runId, patch) {
  must(await supabase.from('daily_runs').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', runId));
}

export async function deleteRun(runId) {
  must(await supabase.from('daily_runs').delete().eq('id', runId));
}

export async function addLoad(runId, sequence) {
  return must(await supabase.from('run_loads').insert([{ run_id: runId, sequence }]).select().single());
}

export async function deleteLoad(loadId) {
  must(await supabase.from('run_loads').delete().eq('id', loadId));
}

// Set how many of one size class from an event ride on a load.
export async function setAllocation(loadId, eventId, sizeClass, quantity) {
  must(await supabase.from('load_allocations').upsert(
    [{ load_id: loadId, event_id: eventId, size_class: sizeClass, quantity: Math.max(0, quantity), updated_at: new Date().toISOString() }],
    { onConflict: 'load_id,event_id,size_class' }
  ));
}

export async function insertAllocations(rows) {
  if (!rows.length) return;
  must(await supabase.from('load_allocations').upsert(rows, { onConflict: 'load_id,event_id,size_class' }));
}

export async function deleteAllocationsFor(loadId, eventId) {
  must(await supabase.from('load_allocations').delete().eq('load_id', loadId).eq('event_id', eventId));
}

export async function insertStops(rows) {
  if (!rows.length) return;
  must(await supabase.from('run_stops').insert(rows));
}

export async function updateStop(stopId, patch) {
  must(await supabase.from('run_stops').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', stopId));
}

export async function deleteStops(stopIds) {
  if (!stopIds.length) return;
  must(await supabase.from('run_stops').delete().in('id', stopIds));
}

// Persist a new stop order: [{ id, sequence }] -- only rows that changed.
export async function resequenceStops(changes) {
  await Promise.all(changes.map(c => supabase.from('run_stops').update({ sequence: c.sequence }).eq('id', c.id).then(must)));
}

// ---- Field views (phase 3) ------------------------------------------------

export const FIELD_MIGRATION = '20260929120000_add_logistics_field_views.sql';

export async function loadChecks(stopIds) {
  if (!stopIds.length) return [];
  const rows = [];
  for (let i = 0; i < stopIds.length; i += 100) {
    rows.push(...(must(await supabase.from('route_item_checks').select('*').in('stop_id', stopIds.slice(i, i + 100))) || []));
  }
  return rows;
}

// A worker's runs in a date window, plus the full day plan for each of those
// dates (a split event's per-truck share depends on the other trucks too).
export async function loadWorkerRoutes(workerId, fromDate, toDate) {
  // Interpolated into a PostgREST filter string below, so only a UUID.
  if (!/^[0-9a-f-]{36}$/i.test(String(workerId))) return { mine: [], day: { runs: [], loads: [], allocations: [], stops: [] } };
  const mine = must(await supabase
    .from('daily_runs')
    .select('*')
    .or(`worker1_id.eq.${workerId},worker2_id.eq.${workerId}`)
    .gte('run_date', fromDate)
    .lte('run_date', toDate)
    .order('run_date')) || [];
  if (!mine.length) return { mine, day: { runs: [], loads: [], allocations: [], stops: [] } };
  const dates = [...new Set(mine.map(r => r.run_date))];
  const allRuns = must(await supabase.from('daily_runs').select('*').in('run_date', dates)) || [];
  return { mine, day: await loadRunDetails(allRuns) };
}

// Admin correction from the Returns tab (e.g. "found it at the warehouse").
export async function saveReturnCheck(row) {
  must(await supabase.from('route_item_checks').upsert(
    [{ ...row, check_type: 'returned', checked_by_worker_id: null, checked_at: new Date().toISOString() }],
    { onConflict: 'stop_id,item_key,check_type' }
  ));
}
