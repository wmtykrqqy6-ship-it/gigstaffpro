// api/worker-cancel-assignment.js
// Worker self-cancels a confirmed assignment (outside the 7-day window).
// Service-role so this keeps working once anon write access to
// `assignments` is locked down. Re-enforces the 7-day rule server-side
// instead of trusting the client's own check, and triggers standby
// auto-promotion the same way the client used to.

import { createClient } from '@supabase/supabase-js';

const UNFILLED = ['standby', 'pending', 'rejected', 'cancelled'];

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
      .select('id, worker_id, status, event_id, position, events(date)')
      .eq('id', assignmentId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!assignment || assignment.worker_id !== workerId) {
      return res.status(404).json({ ok: false, error: 'Assignment not found' });
    }
    if (UNFILLED.includes(assignment.status)) {
      return res.status(400).json({ ok: false, error: 'This assignment is not currently confirmed' });
    }

    const eventDate = assignment.events?.date;
    if (eventDate) {
      const [y, m, d] = eventDate.split('-').map(Number);
      const daysUntil = Math.ceil((new Date(y, m - 1, d) - new Date()) / (1000 * 60 * 60 * 24));
      if (daysUntil < 7) {
        return res.status(400).json({
          ok: false,
          error: `This event is ${daysUntil} day${daysUntil !== 1 ? 's' : ''} away. Events within 7 days can't be cancelled online — contact your admin directly.`,
        });
      }
    }

    const { error: deleteError } = await supabase
      .from('assignments')
      .delete()
      .eq('id', assignmentId);
    if (deleteError) throw deleteError;

    // Best-effort standby promotion — mirrors what the client used to call
    // directly. Never blocks the cancellation response on this.
    let promoted = null;
    try {
      const promoRes = await fetch(`https://${req.headers.host}/api/promote-standby`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: assignment.event_id, position: assignment.position }),
      });
      const promoResult = await promoRes.json();
      if (promoResult?.promoted) promoted = promoResult.workerName || true;
    } catch (_) {}

    return res.status(200).json({ ok: true, promoted });
  } catch (error) {
    console.error('worker-cancel-assignment error:', error);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
}
