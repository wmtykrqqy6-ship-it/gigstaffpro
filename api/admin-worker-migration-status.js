// api/admin-worker-migration-status.js
// Admin-only. Given a workerId, reports whether that worker has been
// migrated to Supabase Auth (i.e. has a worker_auth_links row). Used by
// the admin Edit Worker form to protect the phone field for migrated
// workers — editing workers.phone without also repointing
// worker_auth_links.phone_e164 desyncs the worker's login identity and
// locks them out (worker-auth-status.js looks up by phone_e164, not by
// workers.id).

import { createClient } from '@supabase/supabase-js';
import { verifyAdminRequest } from './_lib/verifyAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminCheck = await verifyAdminRequest(req);
  if (!adminCheck.ok) {
    return res.status(adminCheck.status).json({ error: adminCheck.error });
  }

  const { workerId } = req.body || {};
  if (!workerId) {
    return res.status(400).json({ error: 'workerId is required' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data: link, error } = await supabaseAdmin
      .from('worker_auth_links')
      .select('phone_e164')
      .eq('worker_id', workerId)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: 'Migration status lookup failed' });
    }

    return res.status(200).json({
      migrated: !!link,
      migratedPhoneE164: link?.phone_e164 || null,
    });
  } catch (unexpectedError) {
    return res.status(500).json({ error: 'Unexpected error' });
  }
}
