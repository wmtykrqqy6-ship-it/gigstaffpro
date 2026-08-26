// api/worker-update-profile.js
// Worker edits their own contact info or profile photo. Service-role so
// this keeps working once anon write access to `workers` is locked down.
// Only ever touches a fixed allowlist of self-service fields — never
// skills/rank/reliability/is_active/role/pin_hash, which stay admin-only.
//
// Migrated (Supabase-Auth) workers already have a proper identity-checked
// path for email/address via the update_authenticated_worker_profile RPC;
// this endpoint is for everything that RPC doesn't cover (phone,
// shirt_size, photo_url) plus the entire legacy-worker path, none of which
// had any real identity check before this — same accepted limitation as
// every other endpoint in this batch (client-supplied workerId, no session
// token yet).

import { createClient } from '@supabase/supabase-js';

const ALLOWED_FIELDS = ['email', 'phone', 'address', 'shirt_size', 'photo_url'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ ok: false, error: 'Server not configured' });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { workerId, updates } = req.body || {};
  if (!workerId || !updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return res.status(400).json({ ok: false, error: 'workerId and updates are required' });
  }

  const safeUpdates = {};
  for (const field of ALLOWED_FIELDS) {
    if (field in updates) safeUpdates[field] = updates[field];
  }
  if (Object.keys(safeUpdates).length === 0) {
    return res.status(400).json({ ok: false, error: 'No editable fields provided' });
  }

  try {
    const { data: worker, error: fetchError } = await supabase
      .from('workers')
      .select('id')
      .eq('id', workerId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!worker) return res.status(404).json({ ok: false, error: 'Worker not found' });

    const { error: updateError } = await supabase
      .from('workers')
      .update(safeUpdates)
      .eq('id', workerId);
    if (updateError) throw updateError;

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('worker-update-profile error:', error);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
}
