// api/worker-leave-standby.js
// Worker removes themselves from a standby list. Service-role so this can
// keep working once anon write access to `assignments` is locked down;
// still trusts the client-supplied workerId (no real worker session token
// exists yet) — this endpoint narrows bulk-exposure and centralizes the
// validation, it does not add impersonation protection beyond what direct
// table access already had.

import { createClient } from '@supabase/supabase-js';

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

  const { assignmentId, workerId } = req.body || {};
  if (!assignmentId || !workerId) {
    return res.status(400).json({ ok: false, error: 'assignmentId and workerId are required' });
  }

  try {
    const { data: assignment, error: fetchError } = await supabase
      .from('assignments')
      .select('id, worker_id, status')
      .eq('id', assignmentId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!assignment || assignment.worker_id !== workerId) {
      return res.status(404).json({ ok: false, error: 'Assignment not found' });
    }
    if (assignment.status !== 'standby') {
      return res.status(400).json({ ok: false, error: 'This assignment is not on standby' });
    }

    const { error: deleteError } = await supabase
      .from('assignments')
      .delete()
      .eq('id', assignmentId);
    if (deleteError) throw deleteError;

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('worker-leave-standby error:', error);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
}
