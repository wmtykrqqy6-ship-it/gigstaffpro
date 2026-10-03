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
