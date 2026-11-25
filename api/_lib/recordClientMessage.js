// Saves one row to public.client_messages (docs/CRM.md, Messages inbox).
// Its own file, with no imports, so the automatic-email senders
// (leadFollowups.js, bookedLeadEmails.js) can use it without an import cycle.
//
// Returns true if the row was new. Never throws: a failure (or the SQL not
// run yet) must not stop an email that already went out.
export async function recordClientMessage({ env = process.env, fetchImpl = fetch, row }) {
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !row) return false;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    const r = await fetchImpl(`${env.SUPABASE_URL}/rest/v1/client_messages?on_conflict=resend_id`, {
      method: 'POST',
      headers: {
        apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=representation'
      },
      body: JSON.stringify([row])
    });
    if (!r.ok) { console.warn(`Could not save client message: HTTP ${r.status}`); return false; }
    const saved = await r.json();
    return Array.isArray(saved) && saved.length > 0;
  } catch (err) {
    console.warn('Could not save client message:', err?.message);
    return false;
  }
}
