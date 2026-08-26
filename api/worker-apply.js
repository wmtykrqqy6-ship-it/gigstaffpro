// api/worker-apply.js
// Worker applies for an open position, or joins standby if it's full.
// Service-role so this keeps working once anon write access to
// `assignments` is locked down. Faithfully replicates the capacity,
// combinability and time-conflict rules from
// src/components/AvailableEventsSection.jsx's applyToEvent() — including
// its existing capacity check counting anything that isn't
// pending/rejected/cancelled (i.e. standby assignments count toward
// capacity there too). That looks inconsistent with isAssignmentFilled()
// used everywhere else in the app, but this migration preserves existing
// behavior exactly rather than silently changing it; worth a separate
// look later.

import { createClient } from '@supabase/supabase-js';

const COMBINABLE_POSITIONS = ['host', 'setup', 'cleanup'];

const parseTime = (t) => {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const positionMatches = (workerSkillKey, positionKey) => {
  if (workerSkillKey === positionKey) return true;
  if (workerSkillKey === 'dealer' && positionKey.includes('dealer')) return true;
  if (positionKey === 'dealer' && workerSkillKey.includes('dealer')) return true;
  return false;
};

const toKey = (label) => String(label || '').toLowerCase().replace(/\s+/g, '_');

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

  const { eventId, workerId, position } = req.body || {};
  if (!eventId || !workerId || !position) {
    return res.status(400).json({ ok: false, error: 'eventId, workerId and position are required' });
  }

  try {
    const [{ data: event, error: eventError }, { data: worker, error: workerError }, { data: allAssignments, error: assignmentsError }] = await Promise.all([
      supabase.from('events').select('id, name, date, time, end_time, positions').eq('id', eventId).maybeSingle(),
      supabase.from('workers').select('id, skills, is_active').eq('id', workerId).maybeSingle(),
      supabase.from('assignments').select('id, event_id, worker_id, position, status, created_at').or(`event_id.eq.${eventId},worker_id.eq.${workerId}`),
    ]);
    if (eventError) throw eventError;
    if (workerError) throw workerError;
    if (assignmentsError) throw assignmentsError;

    if (!event) return res.status(404).json({ ok: false, error: 'Event not found' });
    if (!worker || worker.is_active === false) return res.status(404).json({ ok: false, error: 'Worker not found' });

    const positionKey = toKey(position);

    // Confirm the worker is actually qualified for this position.
    const workerSkills = Array.isArray(worker.skills) ? worker.skills : [];
    const isQualified = workerSkills.some(skill => positionMatches(skill, positionKey));
    if (!isQualified) {
      return res.status(400).json({ ok: false, error: 'You are not qualified for this position' });
    }

    const positionDef = (event.positions || []).find(p => {
      const pKey = p.key || toKey(p.name || String(p));
      const pLabel = p.label || p.name || pKey;
      return pLabel === position || pKey === positionKey || positionMatches(positionKey, pKey);
    });
    if (!positionDef) {
      return res.status(400).json({ ok: false, error: 'That position does not exist on this event' });
    }
    const pKey = positionDef.key || toKey(positionDef.name || String(positionDef));
    const maxCount = positionDef.count || 1;

    // Same-event, cross-event helpers.
    const eventAssignments = (allAssignments || []).filter(a => a.event_id === eventId);
    const workerOtherAssignments = (allAssignments || []).filter(a => a.worker_id === workerId && a.event_id !== eventId);
    const workerSameEventAssignments = (allAssignments || []).filter(a => a.worker_id === workerId && a.event_id === eventId);

    // Capacity check — matches applyToEvent()'s exact filter (excludes
    // only pending/rejected/cancelled; standby counts toward capacity here).
    const currentApproved = eventAssignments.filter(a => {
      const s = a.status;
      if (s === 'pending' || s === 'rejected' || s === 'cancelled') return false;
      const aKey = toKey(a.position);
      return positionMatches(aKey, pKey) || a.position === positionDef.name || a.position === positionDef.key || a.position === position;
    }).length;

    const isFull = currentApproved >= maxCount;

    const thisStart = parseTime(event.time);
    const thisEnd = parseTime(event.end_time);

    if (isFull) {
      // Standby path: conflict-check against the worker's other
      // approved/admin-assigned (null-status) assignments only.
      const approvedElsewhere = workerOtherAssignments.filter(a => a.status === 'approved' || !a.status);
      for (const a of approvedElsewhere) {
        const otherEvent = a.event_id === eventId ? event : (await supabase.from('events').select('id, name, date, time, end_time').eq('id', a.event_id).maybeSingle()).data;
        if (!otherEvent || otherEvent.date !== event.date) continue;
        const otherStart = parseTime(otherEvent.time);
        const otherEnd = parseTime(otherEvent.end_time);
        if (thisEnd && otherEnd && thisStart < otherEnd && thisEnd > otherStart) {
          return res.status(400).json({
            ok: false,
            error: `You're already confirmed for "${otherEvent.name}" which conflicts with this event's time.`,
          });
        }
      }

      const { error: insertError } = await supabase.from('assignments').insert([{
        event_id: eventId,
        worker_id: workerId,
        position: pKey,
        status: 'standby',
        applied_at: new Date().toISOString(),
      }]);
      if (insertError) throw insertError;

      return res.status(200).json({ ok: true, result: 'standby' });
    }

    // Open-slot path: conflict-check against approved/pending assignments
    // elsewhere (missing status defaults to counted, matching the client).
    const activeElsewhere = workerOtherAssignments.filter(a => ['approved', 'pending'].includes(a.status || 'approved'));
    for (const a of activeElsewhere) {
      const otherEvent = (await supabase.from('events').select('id, name, date, time, end_time').eq('id', a.event_id).maybeSingle()).data;
      if (!otherEvent || otherEvent.date !== event.date) continue;
      const otherStart = parseTime(otherEvent.time);
      const otherEnd = parseTime(otherEvent.end_time);
      if (thisEnd && otherEnd && thisStart < otherEnd && thisEnd > otherStart) {
        return res.status(400).json({
          ok: false,
          error: `You're already assigned/applied to "${otherEvent.name}" which conflicts with this event's time.`,
        });
      }
    }

    // Same-event combinability check.
    const isCombinable = COMBINABLE_POSITIONS.includes(pKey);
    if (!isCombinable) {
      const nonCombinableExisting = workerSameEventAssignments.filter(a =>
        ['approved', 'pending', 'standby'].includes(a.status) && !COMBINABLE_POSITIONS.includes(toKey(a.position))
      );
      if (nonCombinableExisting.length > 0) {
        const existing = nonCombinableExisting[0];
        const statusText = existing.status === 'approved' ? 'assigned to' : existing.status === 'standby' ? 'on standby for' : 'applied for';
        return res.status(400).json({
          ok: false,
          error: `You are already ${statusText} "${existing.position}" at this event. Workers can only work one position per event.`,
        });
      }
    }

    const { error: insertError } = await supabase.from('assignments').insert([{
      event_id: eventId,
      worker_id: workerId,
      position: pKey,
      status: 'pending',
      applied_at: new Date().toISOString(),
    }]);
    if (insertError) throw insertError;

    return res.status(200).json({ ok: true, result: 'pending' });
  } catch (error) {
    console.error('worker-apply error:', error);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
}
