// Access log for client records (public.client_access_log, migration
// 20261122120000_add_sales_managers_and_client_access_log.sql).
//
// Adds, changes and deletes are logged by the database itself. Views and
// exports can't be seen by the database, so the app reports them here
// through log_client_access(), which records the signed-in person.
//
// Screens reload client lists often (every events refresh), so a view of
// the same list from the same screen is logged at most once every
// VIEW_LOG_INTERVAL_MS. Exports are always logged.

export const VIEW_LOG_INTERVAL_MS = 10 * 60 * 1000;

const lastLogged = new Map();

export function shouldLogView(key, now = Date.now(), seen = lastLogged) {
  const last = seen.get(key);
  if (last !== undefined && now - last < VIEW_LOG_INTERVAL_MS) return false;
  seen.set(key, now);
  return true;
}

// recordType: 'clients' | 'event_client_details' (views/exports; changes
// to client_contacts and client_activity are logged by the database)
// where: which screen, e.g. 'settings_clients' (stored in details)
// Never throws: a logging failure (or the migration not run yet) must not
// break the screen.
export async function logClientAccess(supabase, { action, recordType, recordIds = [], where }) {
  try {
    if (action === 'view' && !shouldLogView(`${recordType}|${where}`)) return;
    const ids = (recordIds || []).filter(id => id !== null && id !== undefined).map(String);
    const { error } = await supabase.rpc('log_client_access', {
      p_action: action,
      p_record_type: recordType,
      p_record_ids: ids,
      p_details: where ? { where } : null
    });
    if (error) console.warn('Could not write the client access log:', error.message);
  } catch (err) {
    console.warn('Could not write the client access log:', err?.message);
  }
}

// For tests.
export function _resetViewLog() {
  lastLogged.clear();
}

const ACTION_WORDS = {
  view: 'viewed',
  export: 'exported',
  create: 'added',
  update: 'changed',
  delete: 'deleted'
};

const RECORD_WORDS = {
  clients: 'saved client',
  event_client_details: 'event client details',
  client_contacts: 'client contact',
  client_activity: 'client history entry',
  goodshuffle_projects: 'Goodshuffle project',
  leads: 'lead'
};

// One readable line for Settings -> Access log, e.g.
// "Dylan (admin) changed saved client Acme Corp: email, phone"
export function describeAccessEntry(entry) {
  if (!entry) return '';
  const who = entry.actor_name
    ? `${entry.actor_name}${entry.actor_role ? ` (${entry.actor_role.replace('_', ' ')})` : ''}`
    : (entry.auth_user_id ? 'Unknown login' : 'System');
  const did = ACTION_WORDS[entry.action] || entry.action;
  const what = RECORD_WORDS[entry.record_type] || entry.record_type;
  let target;
  if (entry.record_id) {
    target = `${what}${entry.label ? ` ${entry.label}` : ''}`;
  } else {
    const n = entry.record_count ?? 0;
    target = `${n} ${what}${n === 1 ? '' : (what.endsWith('details') ? '' : 's')}`;
  }
  const fields = entry.changed_fields?.length ? `: ${entry.changed_fields.join(', ')}` : '';
  return `${who} ${did} ${target}${fields}`;
}
