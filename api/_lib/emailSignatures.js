// Each rep's email signature for replies sent from the Messages screen
// (docs/CRM.md). Every reply still comes from sales@vegasonwheels.com; the
// signature says which rep wrote it. Stored in public.admin_email_signatures,
// which only the server (service key) can read or write: names and phone
// numbers stay off the public-read settings table.

export const MAX_SIGNATURE = 1000;
export const MAX_DISPLAY_NAME = 80;

export function cleanSignature(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/[^\S\n]+$/gm, '').trim().slice(0, MAX_SIGNATURE);
}

export function cleanDisplayName(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_DISPLAY_NAME);
}

// The reply text as sent: the message, a blank line, then the signature.
export function withSignature(text, signature) {
  const sig = cleanSignature(signature);
  return sig ? `${text}\n\n${sig}` : text;
}

const missingTable = (error) => error?.code === '42P01' || error?.code === 'PGRST205' || /does not exist|schema cache/i.test(error?.message || '');

// Admin-only actions on api/send-email.js (the caller is already verified):
//   signature-get  -> { ok, myId, mine: { display_name, signature }, team: { [adminId]: display_name } }
//   signature-save -> saves the caller's own signature (never someone else's)
// Returns { status, body }.
export async function handleSignatureAction(supabaseAdmin, body, adminUserId) {
  const table = supabaseAdmin.from('admin_email_signatures');
  if (body.action === 'signature-get') {
    const { data, error } = await table.select('admin_user_id, display_name, signature');
    if (error) {
      if (missingTable(error)) return { status: 200, body: { ok: true, needsSql: true, myId: adminUserId, mine: null, team: {} } };
      return { status: 500, body: { ok: false, error: 'Could not load signatures.' } };
    }
    const team = {};
    let mine = null;
    for (const row of data || []) {
      if (row.display_name) team[row.admin_user_id] = row.display_name;
      if (row.admin_user_id === adminUserId) mine = { display_name: row.display_name || '', signature: row.signature || '' };
    }
    return { status: 200, body: { ok: true, myId: adminUserId, mine, team } };
  }

  if (body.action === 'signature-save') {
    const row = {
      admin_user_id: adminUserId,
      display_name: cleanDisplayName(body.displayName) || null,
      signature: cleanSignature(body.signature) || null,
      updated_at: new Date().toISOString()
    };
    const { error } = await table.upsert(row, { onConflict: 'admin_user_id' });
    if (error) {
      if (missingTable(error)) return { status: 400, body: { ok: false, error: 'Signatures turn on once the signatures SQL file has been run.' } };
      return { status: 500, body: { ok: false, error: 'Could not save your signature.' } };
    }
    return { status: 200, body: { ok: true, mine: { display_name: row.display_name || '', signature: row.signature || '' } } };
  }

  return { status: 400, body: { ok: false, error: 'Unknown action' } };
}
