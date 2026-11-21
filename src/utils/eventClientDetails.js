// Client name + contact are admin-only. Since migration
// 20261121120000_make_client_details_admin_only.sql they live in
// event_client_details (admins only), and events.client / client_contact are
// always NULL. Writes still go through events: a database trigger moves the
// values into event_client_details, so save code doesn't change.
//
// Admin screens that show client details load them with
// loadEventClientDetails() and merge them onto the events.

export async function loadEventClientDetails(supabase) {
  const { data, error } = await supabase
    .from('event_client_details')
    .select('event_id, client, client_contact');
  if (error) {
    // Before the migration has been run the table doesn't exist, and the
    // details are still on the events rows, so carrying on is correct.
    console.warn('Could not load client details:', error.message);
    return [];
  }
  return data || [];
}

// Put each event's client details back on it. An event with no details row
// keeps whatever it already had (the pre-migration events columns).
export function mergeClientDetails(events = [], details = []) {
  if (!Array.isArray(events)) return [];
  if (!details?.length) return events;
  const byEvent = new Map(details.map(d => [d.event_id, d]));
  return events.map(ev => {
    const d = ev && byEvent.get(ev.id);
    if (!d) return ev;
    return {
      ...ev,
      client: d.client ?? ev.client ?? null,
      client_contact: d.client_contact ?? ev.client_contact ?? null
    };
  });
}

// Editing an event: leave out client fields the admin didn't change. If the
// details failed to load, the form shows them blank, and saving the blanks
// would wipe the stored details.
export function dropUnchangedClientFields(saveData, original = {}) {
  const out = { ...saveData };
  for (const field of ['client', 'client_contact']) {
    if ((out[field] ?? '') === (original?.[field] ?? '')) delete out[field];
  }
  return out;
}
