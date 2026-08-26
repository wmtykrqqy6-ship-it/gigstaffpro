// api/worker-switch-position.js
// Worker switches their own confirmed assignment to a different open
// position on the same event (outside the 7-day window). Service-role so
// this keeps working once anon write access to `assignments` is locked
// down. Re-checks the 7-day rule and the target position's capacity
// server-side instead of trusting the client.

import { createClient } from '@supabase/supabase-js';

const UNFILLED = ['standby', 'pending', 'rejected', 'cancelled'];
const isFilled = (status) => !UNFILLED.includes(status);

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

  const { assignmentId, workerId, newPosition } = req.body || {};
  if (!assignmentId || !workerId || !newPosition) {
    return res.status(400).json({ ok: false, error: 'assignmentId, workerId and newPosition are required' });
  }

  try {
    const { data: assignment, error: fetchError } = await supabase
      .from('assignments')
      .select('id, worker_id, status, event_id, position')
      .eq('id', assignmentId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!assignment || assignment.worker_id !== workerId) {
      return res.status(404).json({ ok: false, error: 'Assignment not found' });
    }
    if (!isFilled(assignment.status)) {
      return res.status(400).json({ ok: false, error: 'This assignment is not currently confirmed' });
    }

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, date, positions')
      .eq('id', assignment.event_id)
      .maybeSingle();
    if (eventError) throw eventError;
    if (!event) return res.status(404).json({ ok: false, error: 'Event not found' });

    const [y, m, d] = event.date.split('-').map(Number);
    const daysUntil = Math.ceil((new Date(y, m - 1, d) - new Date()) / (1000 * 60 * 60 * 24));
    if (daysUntil < 7) {
      return res.status(400).json({
        ok: false,
        error: `This event is ${daysUntil} day${daysUntil !== 1 ? 's' : ''} away. Position changes within 7 days require admin approval — contact your admin directly.`,
      });
    }

    const posDef = (event.positions || []).find(p => (p.key || p.name) === newPosition);
    if (!posDef) {
      return res.status(400).json({ ok: false, error: 'That position no longer exists on this event' });
    }

    const { data: eventAssignments, error: assignmentsError } = await supabase
      .from('assignments')
      .select('id, position, status')
      .eq('event_id', event.id);
    if (assignmentsError) throw assignmentsError;

    const filledCount = (eventAssignments || []).filter(a =>
      a.id !== assignmentId && isFilled(a.status) && a.position === newPosition
    ).length;
    const needed = posDef.count || 1;
    if (filledCount >= needed) {
      return res.status(400).json({ ok: false, error: 'That position is already full' });
    }

    const { error: updateError } = await supabase
      .from('assignments')
      .update({ position: newPosition })
      .eq('id', assignmentId);
    if (updateError) throw updateError;

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('worker-switch-position error:', error);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
}
