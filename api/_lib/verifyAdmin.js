// api/_lib/verifyAdmin.js
// Shared helper: verifies a Supabase Auth Bearer token belongs to a real,
// linked admin. Not a route itself — imported by privileged endpoints only.

import { createClient } from '@supabase/supabase-js';

// The session's assurance level from the token's payload: 'aal2' once the
// admin has entered their 2-step code, 'aal1' with only the password.
// Only read after getUser(token) has accepted the token, so the payload is
// genuine. Returns null for anything unreadable.
export function tokenAssuranceLevel(token) {
  try {
    const payload = String(token).split('.')[1];
    if (!payload) return null;
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const aal = JSON.parse(json)?.aal;
    return typeof aal === 'string' ? aal : null;
  } catch {
    return null;
  }
}

// 2-step sign-in is required for admin routes. ADMIN_2STEP_OFF=true in the
// Vercel settings turns the check off, for an emergency only.
export function twoStepRequired(env = process.env) {
  return env.ADMIN_2STEP_OFF !== 'true';
}

export async function verifyAdminRequest(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return { ok: false, status: 401, error: 'Missing authorization token' };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return { ok: false, status: 500, error: 'Server not configured' };
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  // getUser(token) revalidates against the Auth server on every call (unlike
  // getSession(), which is local/cached) — this is what makes it reject an
  // expired token, a deleted user, or a disabled/banned user, not just a
  // bad signature.
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return { ok: false, status: 401, error: 'Invalid or expired session' };
  }

  if (twoStepRequired() && tokenAssuranceLevel(token) !== 'aal2') {
    return { ok: false, status: 403, error: '2-step sign-in required' };
  }

  const { data: link, error: linkError } = await supabaseAdmin
    .from('admin_auth_links')
    .select('admin_user_id')
    .eq('auth_user_id', userData.user.id)
    .single();

  if (linkError || !link) {
    return { ok: false, status: 403, error: 'Not an authorized admin' };
  }

  const { data: adminRow, error: adminError } = await supabaseAdmin
    .from('admin_users')
    .select('id, username') // explicit safe columns only — never password_hash, never *
    .eq('id', link.admin_user_id)
    .single();

  if (adminError || !adminRow) {
    return { ok: false, status: 403, error: 'Not an authorized admin' };
  }

  return {
    ok: true,
    authUserId: userData.user.id,
    adminUserId: adminRow.id,
    adminUsername: adminRow.username,
  };
}
