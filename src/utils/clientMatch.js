// Linking an event's client to the Settings -> Clients list (2026-10-03).
// Typing a client name without picking a suggestion used to save only the
// text on the event, so new clients never reached the list. On save, the
// event form now links to an existing client with the same name, or adds a
// new one.

// "  Smith  Wedding " and "smith wedding" are the same client.
export const normalizeClientName = (name) =>
  String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

// Existing client with the same name (case/spacing-insensitive), else null.
// Inactive clients count too, so re-booking an old client doesn't duplicate it.
export function findClientByName(clients = [], name) {
  const key = normalizeClientName(name);
  if (!key) return null;
  return clients.find(c => normalizeClientName(c?.name) === key) || null;
}

// New client row from the event form's fields. The event's single contact
// field goes to email if it looks like one, otherwise phone.
export function newClientFromEvent({ client, client_contact } = {}) {
  const name = String(client ?? '').trim().replace(/\s+/g, ' ');
  const contact = String(client_contact ?? '').trim();
  const isEmail = /\S+@\S+\.\S+/.test(contact);
  return {
    name,
    phone: contact && !isEmail ? contact : null,
    email: isEmail ? contact : null,
    is_active: true
  };
}

// Settings -> Clients search: name, company, email, or phone. Phones match
// on digits only, so "414-555", "4145551212" and "(414) 555-1212" all find
// the same client.
export function clientMatchesSearch(client, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return true;
  const text = [client?.name, client?.company, client?.email]
    .filter(Boolean)
    .some(v => String(v).toLowerCase().includes(q));
  if (text) return true;
  const qDigits = q.replace(/\D/g, '');
  const phoneDigits = String(client?.phone ?? '').replace(/\D/g, '');
  return qDigits.length >= 3 && phoneDigits.includes(qDigits);
}

// Settings -> Clients "Add missing clients": events that have a client name
// but aren't linked to a client (saved before 2026-10-03). Groups them by
// cleaned name -> [{ name, contact, eventIds, existing }], where `existing`
// is the client to link to, or null if a new one is needed. `cleanName`
// turns raw text into { name, phone } (the pull-sheet client-line cleaner),
// so "Iyonna Isom  Sales Lead: ..." becomes "Iyonna Isom".
export function planMissingClients(events = [], clients = [], cleanName = (t) => ({ name: t, phone: null })) {
  const groups = new Map();
  for (const ev of events) {
    if (!ev || ev.client_id || !String(ev.client ?? '').trim()) continue;
    const cleaned = cleanName(String(ev.client));
    const name = String(cleaned?.name ?? '').trim().replace(/\s+/g, ' ');
    if (!name) continue;
    const key = normalizeClientName(name);
    if (!groups.has(key)) {
      groups.set(key, { name, contact: null, eventIds: [], existing: findClientByName(clients, name) });
    }
    const g = groups.get(key);
    g.eventIds.push(ev.id);
    g.contact = g.contact || String(ev.client_contact ?? '').trim() || cleaned?.phone || null;
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}
