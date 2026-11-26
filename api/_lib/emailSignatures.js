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

// Uploaded logos (signature-logo action): stored by the server in the public
// Storage bucket 'email-assets' so email apps can load them. Small images
// only, checked by their first bytes, not just the type the browser claims.
export const LOGO_BUCKET = 'email-assets';
export const MAX_LOGO_BYTES = 500 * 1024;
const LOGO_TYPES = {
  'image/png': { ext: 'png', magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/gif': { ext: 'gif', magic: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 }
};

// { buffer, contentType, ext } or { error }.
export function decodeLogo(dataBase64, contentType) {
  const type = LOGO_TYPES[String(contentType || '').toLowerCase()];
  if (!type) return { error: 'Use a PNG, JPG or GIF image.' };
  const b64 = String(dataBase64 || '').replace(/^data:[^,]*,/, '');
  if (!b64 || b64.length > Math.ceil(MAX_LOGO_BYTES / 3) * 4 + 8 || !/^[A-Za-z0-9+/=\s]+$/.test(b64)) {
    return { error: 'The image must be smaller than 500 KB.' };
  }
  const buffer = Buffer.from(b64, 'base64');
  if (!buffer.length || buffer.length > MAX_LOGO_BYTES) return { error: 'The image must be smaller than 500 KB.' };
  if (!type.magic(buffer)) return { error: "That file doesn't look like the image type it claims to be." };
  return { buffer, contentType: String(contentType).toLowerCase(), ext: type.ext };
}

const missingTable = (error) => error?.code === '42P01' || error?.code === 'PGRST205' || /does not exist|schema cache/i.test(error?.message || '');

// Admin-only actions on api/send-email.js (the caller is already verified):
//   signature-get  -> { ok, myId, mine: { display_name, signature, logo_url }, team: { [adminId]: display_name } }
//   signature-save -> saves the caller's own signature (never someone else's)
//   signature-logo -> uploads (or removes) the caller's own logo image
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

  if (body.action === 'signature-logo') {
    // Upload (or remove, with remove: true) the caller's own logo.
    let logoUrl = null;
    if (!body.remove) {
      const img = decodeLogo(body.dataBase64, body.contentType);
      if (img.error) return { status: 400, body: { ok: false, error: img.error } };
      const path = `signature-logos/${adminUserId}-${Date.now()}.${img.ext}`;
      const bucket = supabaseAdmin.storage.from(LOGO_BUCKET);
      const { error: upErr } = await bucket.upload(path, img.buffer, { contentType: img.contentType, upsert: false, cacheControl: '31536000' });
      if (upErr) {
        const noBucket = /bucket/i.test(upErr.message || '') && /not found|does not exist/i.test(upErr.message || '');
        return { status: noBucket ? 400 : 500, body: { ok: false, error: noBucket ? 'Logo uploads turn on once the logo upload SQL file has been run.' : 'Could not upload the logo.' } };
      }
      logoUrl = cleanLogoUrl(bucket.getPublicUrl(path)?.data?.publicUrl) || null;
      if (!logoUrl) return { status: 500, body: { ok: false, error: 'Could not upload the logo.' } };
    }
    const { error } = await table.upsert({ admin_user_id: adminUserId, logo_url: logoUrl, updated_at: new Date().toISOString() }, { onConflict: 'admin_user_id' });
    if (error) return { status: 500, body: { ok: false, error: 'Could not save the logo.' } };
    return { status: 200, body: { ok: true, logo_url: logoUrl || '' } };
  }

  return { status: 400, body: { ok: false, error: 'Unknown action' } };
}
