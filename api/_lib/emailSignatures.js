// Each rep's email signature for replies sent from the Messages screen
// (docs/CRM.md). Every reply still comes from sales@vegasonwheels.com; the
// signature says which rep wrote it. Stored in public.admin_email_signatures,
// which only the server (service key) can read or write: names and phone
// numbers stay off the public-read settings table.

export const MAX_SIGNATURE = 1000;
export const MAX_DISPLAY_NAME = 80;
export const MAX_LOGO_URL = 500;
// Offered as a one-click choice on the signature screen: hosted on our own
// website, so clients see vegasonwheels.com, not GigStaffPro.
export const DEFAULT_LOGO_URL = 'https://vegasonwheels.com/wp-content/uploads/2025/11/logo-transparent-16-to-9.png';

export function cleanSignature(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/[^\S\n]+$/gm, '').trim().slice(0, MAX_SIGNATURE);
}

export function cleanDisplayName(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_DISPLAY_NAME);
}

// A logo image link: https only, no quotes, spaces or angle brackets (it goes
// into an <img src>). Anything else is dropped.
export function cleanLogoUrl(value) {
  const s = String(value ?? '').trim();
  if (!s || s.length > MAX_LOGO_URL || !/^https:\/\/[^\s"'<>`]+$/i.test(s)) return '';
  try { return new URL(s).protocol === 'https:' ? s : ''; } catch { return ''; }
}

// The logo under the signature in the HTML email (the plain-text version has none).
export function logoHtml(logoUrl) {
  const url = cleanLogoUrl(logoUrl);
  if (!url) return '';
  return `<p style="margin:12px 0 0"><img src="${url.replace(/&/g, '&amp;')}" alt="Vegas on Wheels" width="160" style="display:block;width:160px;max-width:100%;height:auto;border:0"></p>`;
}

// The reply text as sent: the message, a blank line, then the signature.
export function withSignature(text, signature) {
  const sig = cleanSignature(signature);
  return sig ? `${text}\n\n${sig}` : text;
}

const missingTable = (error) => error?.code === '42P01' || error?.code === 'PGRST205' || /does not exist|schema cache/i.test(error?.message || '');

// Admin-only actions on api/send-email.js (the caller is already verified):
//   signature-get  -> { ok, myId, mine: { display_name, signature, logo_url }, team: { [adminId]: display_name } }
//   signature-save -> saves the caller's own signature (never someone else's)
// Returns { status, body }.
export async function handleSignatureAction(supabaseAdmin, body, adminUserId) {
  const table = supabaseAdmin.from('admin_email_signatures');
  if (body.action === 'signature-get') {
    let { data, error } = await table.select('admin_user_id, display_name, signature, logo_url');
    // Before the logo SQL is run there's no logo_url column yet.
    if (error && /logo_url/.test(error.message || '')) ({ data, error } = await table.select('admin_user_id, display_name, signature'));
    if (error) {
      if (missingTable(error)) return { status: 200, body: { ok: true, needsSql: true, myId: adminUserId, mine: null, team: {} } };
      return { status: 500, body: { ok: false, error: 'Could not load signatures.' } };
    }
    const team = {};
    let mine = null;
    for (const row of data || []) {
      if (row.display_name) team[row.admin_user_id] = row.display_name;
      if (row.admin_user_id === adminUserId) mine = { display_name: row.display_name || '', signature: row.signature || '', logo_url: row.logo_url || '' };
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
    if (body.logoUrl !== undefined) row.logo_url = cleanLogoUrl(body.logoUrl) || null;
    let { error } = await table.upsert(row, { onConflict: 'admin_user_id' });
    if (error && 'logo_url' in row && /logo_url/.test(error.message || '')) {
      if (row.logo_url) return { status: 400, body: { ok: false, error: 'Logos turn on once the logo SQL file has been run.' } };
      delete row.logo_url;
      ({ error } = await table.upsert(row, { onConflict: 'admin_user_id' }));
    }
    if (error) {
      if (missingTable(error)) return { status: 400, body: { ok: false, error: 'Signatures turn on once the signatures SQL file has been run.' } };
      return { status: 500, body: { ok: false, error: 'Could not save your signature.' } };
    }
    return { status: 200, body: { ok: true, mine: { display_name: row.display_name || '', signature: row.signature || '', logo_url: row.logo_url || '' } } };
  }

  return { status: 400, body: { ok: false, error: 'Unknown action' } };
}
