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

// answers: [{ name, size_class }]
export async function saveCatalogEntries(answers) {
  if (!answers.length) return;
  const { error } = await supabase.from('equipment_catalog').upsert(
    answers.map(a => ({
      goodshuffle_name: a.name.trim(),
      name_key: normalizeItemName(a.name),
      size_class: a.size_class,
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
export async function linkEventToInvoice(eventId, { invoice, deliveryType, address, venue }) {
  const patch = { goodshuffle_invoice: invoice || null, delivery_type: deliveryType || null };
  if (address) patch.address = address;
  if (venue) patch.venue = venue;
  const { error } = await supabase.from('events').update(patch).eq('id', eventId);
  if (error) throw error;
}
