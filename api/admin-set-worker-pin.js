// api/admin-set-worker-pin.js
// Admin-only. Migrates a worker to Supabase Auth (synthetic-email
// identity) or resets an already-migrated worker's Auth password.
// Never touches workers.pin_hash — that column is legacy-only and
// entirely out of scope for this endpoint.

import { createClient } from '@supabase/supabase-js';
import { verifyAdminRequest } from './_lib/verifyAdmin.js';
import { normalizeUsPhoneToE164, deriveSyntheticEmail } from './_lib/workerAuth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminCheck = await verifyAdminRequest(req);
  if (!adminCheck.ok) {
    return res.status(adminCheck.status).json({ error: adminCheck.error });
  }

  const { workerId, pin } = req.body || {};

  if (!workerId || typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
    return res.status(400).json({ error: 'workerId and a 6-digit pin are required' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data: worker, error: workerError } = await supabaseAdmin
      .from('workers')
      .select('id, phone, is_active')
      .eq('id', workerId)
      .maybeSingle();

    if (workerError) {
      return res.status(500).json({ error: 'Lookup failed' });
    }
    if (!worker) {
      return res.status(404).json({ error: 'Worker not found' });
    }
    if (!worker.is_active) {
      return res.status(400).json({ error: 'Worker is not active' });
    }

    const phoneE164 = normalizeUsPhoneToE164(worker.phone);
    if (!phoneE164) {
      return res.status(500).json({ error: 'Worker phone number could not be processed' });
    }

    const syntheticEmail = deriveSyntheticEmail(phoneE164);

    const { data: existingLink, error: linkLookupError } = await supabaseAdmin
      .from('worker_auth_links')
      .select('auth_user_id, phone_e164')
      .eq('worker_id', workerId)
      .maybeSingle();

    if (linkLookupError) {
      return res.status(500).json({ error: 'Migration status lookup failed' });
    }

    if (existingLink) {
      // Already migrated — the phone on file must still match what this
      // worker was migrated under before we touch Auth. Reset the Auth
      // password only; workers.pin_hash is never written here.
      if (existingLink.phone_e164 !== phoneE164) {
        return res.status(409).json({ error: 'Worker phone number does not match migrated record' });
      }

      const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
        existingLink.auth_user_id,
        { password: pin }
      );

      if (updateAuthError) {
        return res.status(500).json({ error: 'Failed to reset secure login' });
      }

      return res.status(200).json({ success: true, mode: 'reset' });
    }

    // New migration — create the Auth user under the synthetic email, then
    // link it. If the link insert fails, the Auth user must not be left
    // behind orphaned and unlinked.
    const { data: newAuthUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: syntheticEmail,
      password: pin,
      email_confirm: true,
    });

    if (createError || !newAuthUser?.user) {
      return res.status(500).json({ error: 'Failed to create secure login' });
    }

    const { error: linkInsertError } = await supabaseAdmin
      .from('worker_auth_links')
      .insert({
        auth_user_id: newAuthUser.user.id,
        worker_id: workerId,
        synthetic_email: syntheticEmail,
        phone_e164: phoneE164,
      });

    if (linkInsertError) {
      const { error: cleanupError } = await supabaseAdmin.auth.admin.deleteUser(newAuthUser.user.id);

      if (cleanupError) {
        // Cleanup itself failed — an orphaned Auth user now exists with no
        // link row. Reported clearly, with no identifiers, per spec.
        return res.status(500).json({
          error: 'Migration failed and automatic cleanup did not complete. Manual review required.',
        });
      }

      return res.status(500).json({ error: 'Failed to link worker to secure login' });
    }

    return res.status(200).json({ success: true, mode: 'created' });
  } catch (unexpectedError) {
    return res.status(500).json({ error: 'Unexpected error' });
  }
}
