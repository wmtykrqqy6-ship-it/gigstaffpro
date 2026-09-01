// api/worker-actions.js
// Consolidated dispatcher for every worker-initiated write against
// assignments/workers: apply, cancel, switchPosition, leaveStandby,
// checkIn, updateProfile. Combined into one file (rather than five) to keep the
// project's serverless function count down — Vercel's Hobby plan counts
// each function as a build against the hourly build-rate limit, and this
// project was already close to that with the existing endpoints.
//
// Service-role for all actions, so these keep working once anon write
// access to `assignments`/`workers` is locked down in a later migration.
// Still trusts the client-supplied workerId (no real worker session token
// exists yet) — this is the "reduce bulk exposure" tier, not full
// impersonation protection; see the commit message for the full context.

import { createClient } from '@supabase/supabase-js';

const UNFILLED = ['standby', 'pending', 'rejected', 'cancelled'];
const isFilled = (status) => !UNFILLED.includes(status);
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

async function handleApply(supabase, { eventId, workerId, position }) {
  if (!eventId || !workerId || !position) {
    return { status: 400, body: { ok: false, error: 'eventId, workerId and position are required' } };
  }

  const [{ data: event, error: eventError }, { data: worker, error: workerError }, { data: allAssignments, error: assignmentsError }] = await Promise.all([
    supabase.from('events').select('id, name, date, time, end_time, positions, staffing_mode').eq('id', eventId).maybeSingle(),
    supabase.from('workers').select('id, skills, is_active').eq('id', workerId).maybeSingle(),
    supabase.from('assignments').select('id, event_id, worker_id, position, status, created_at').or(`event_id.eq.${eventId},worker_id.eq.${workerId}`),
  ]);
  if (eventError) throw eventError;
  if (workerError) throw workerError;
  if (assignmentsError) throw assignmentsError;

  if (!event) return { status: 404, body: { ok: false, error: 'Event not found' } };
  if (!worker || worker.is_active === false) return { status: 404, body: { ok: false, error: 'Worker not found' } };

  const positionKey = toKey(position);
  const workerSkills = Array.isArray(worker.skills) ? worker.skills : [];
  const isQualified = workerSkills.some(skill => positionMatches(skill, positionKey));
  if (!isQualified) {
    return { status: 400, body: { ok: false, error: 'You are not qualified for this position' } };
  }

  const positionDef = (event.positions || []).find(p => {
    const pKey = p.key || toKey(p.name || String(p));
    const pLabel = p.label || p.name || pKey;
    return pLabel === position || pKey === positionKey || positionMatches(positionKey, pKey);
  });
  if (!positionDef) {
    return { status: 400, body: { ok: false, error: 'That position does not exist on this event' } };
  }
  const pKey = positionDef.key || toKey(positionDef.name || String(positionDef));
  const maxCount = positionDef.count || 1;

  const eventAssignments = (allAssignments || []).filter(a => a.event_id === eventId);
  const workerOtherAssignments = (allAssignments || []).filter(a => a.worker_id === workerId && a.event_id !== eventId);
  const workerSameEventAssignments = (allAssignments || []).filter(a => a.worker_id === workerId && a.event_id === eventId);

  // Capacity check — matches AvailableEventsSection.jsx's applyToEvent()
  // exact filter (excludes only pending/rejected/cancelled; standby counts
  // toward capacity there too — preserved as-is rather than silently
  // changed here).
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
    const approvedElsewhere = workerOtherAssignments.filter(a => a.status === 'approved' || !a.status);
    for (const a of approvedElsewhere) {
      const otherEvent = a.event_id === eventId ? event : (await supabase.from('events').select('id, name, date, time, end_time').eq('id', a.event_id).maybeSingle()).data;
      if (!otherEvent || otherEvent.date !== event.date) continue;
      const otherStart = parseTime(otherEvent.time);
      const otherEnd = parseTime(otherEvent.end_time);
      if (thisEnd && otherEnd && thisStart < otherEnd && thisEnd > otherStart) {
        return { status: 400, body: { ok: false, error: `You're already confirmed for "${otherEvent.name}" which conflicts with this event's time.` } };
      }
    }

    const { error: insertError } = await supabase.from('assignments').insert([{
      event_id: eventId, worker_id: workerId, position: pKey, status: 'standby', applied_at: new Date().toISOString(),
    }]);
    if (insertError) throw insertError;
    return { status: 200, body: { ok: true, result: 'standby' } };
  }

  const activeElsewhere = workerOtherAssignments.filter(a => ['approved', 'pending'].includes(a.status || 'approved'));
  for (const a of activeElsewhere) {
    const otherEvent = (await supabase.from('events').select('id, name, date, time, end_time').eq('id', a.event_id).maybeSingle()).data;
    if (!otherEvent || otherEvent.date !== event.date) continue;
    const otherStart = parseTime(otherEvent.time);
    const otherEnd = parseTime(otherEvent.end_time);
    if (thisEnd && otherEnd && thisStart < otherEnd && thisEnd > otherStart) {
      return { status: 400, body: { ok: false, error: `You're already assigned/applied to "${otherEvent.name}" which conflicts with this event's time.` } };
    }
  }

  const isCombinable = COMBINABLE_POSITIONS.includes(pKey);
  if (!isCombinable) {
    const nonCombinableExisting = workerSameEventAssignments.filter(a =>
      ['approved', 'pending', 'standby'].includes(a.status) && !COMBINABLE_POSITIONS.includes(toKey(a.position))
    );
    if (nonCombinableExisting.length > 0) {
      const existing = nonCombinableExisting[0];
      const statusText = existing.status === 'approved' ? 'assigned to' : existing.status === 'standby' ? 'on standby for' : 'applied for';
      return { status: 400, body: { ok: false, error: `You are already ${statusText} "${existing.position}" at this event. Workers can only work one position per event.` } };
    }
  }

  // First-come-first-served events skip the pending/approval step entirely
  // — the first worker to claim an open slot is instantly confirmed.
  const isFirstCome = event.staffing_mode === 'first-come';
  const { data: inserted, error: insertError } = await supabase.from('assignments').insert([{
    event_id: eventId, worker_id: workerId, position: pKey,
    status: isFirstCome ? 'approved' : 'pending',
    applied_at: new Date().toISOString(),
  }]).select('id, created_at').single();
  if (insertError) throw insertError;

  if (isFirstCome) {
    // Race guard: "first come" has to actually mean first. Two workers can
    // hit apply for the same last-open slot within milliseconds of each
    // other and both pass the capacity check above before either insert
    // lands. Re-count by creation order after the fact and demote anyone
    // who overshot capacity to standby instead of leaving the slot
    // overbooked.
    const { data: raceCheck } = await supabase
      .from('assignments')
      .select('id, status, position, created_at')
      .eq('event_id', eventId);
    const winners = (raceCheck || [])
      .filter(a => {
        const s = a.status;
        if (s === 'pending' || s === 'rejected' || s === 'cancelled') return false;
        const aKey = toKey(a.position);
        return positionMatches(aKey, pKey) || a.position === positionDef.name || a.position === positionDef.key || a.position === position;
      })
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .slice(0, maxCount)
      .map(a => a.id);

    if (!winners.includes(inserted.id)) {
      await supabase.from('assignments').update({ status: 'standby' }).eq('id', inserted.id);
      return { status: 200, body: { ok: true, result: 'standby', message: 'Someone else claimed that spot just before you — you have been added to standby instead.' } };
    }
  }

  return { status: 200, body: { ok: true, result: isFirstCome ? 'approved' : 'pending' } };
}

async function handleCancelAssignment(supabase, { assignmentId, workerId }, host) {
  if (!assignmentId || !workerId) {
    return { status: 400, body: { ok: false, error: 'assignmentId and workerId are required' } };
  }

  const { data: assignment, error: fetchError } = await supabase
    .from('assignments')
    .select('id, worker_id, status, event_id, position, events(date)')
    .eq('id', assignmentId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!assignment || assignment.worker_id !== workerId) {
    return { status: 404, body: { ok: false, error: 'Assignment not found' } };
  }
  if (UNFILLED.includes(assignment.status)) {
    return { status: 400, body: { ok: false, error: 'This assignment is not currently confirmed' } };
  }

  const eventDate = assignment.events?.date;
  if (eventDate) {
    const [y, m, d] = eventDate.split('-').map(Number);
    const daysUntil = Math.ceil((new Date(y, m - 1, d) - new Date()) / (1000 * 60 * 60 * 24));
    if (daysUntil < 7) {
      return { status: 400, body: { ok: false, error: `This event is ${daysUntil} day${daysUntil !== 1 ? 's' : ''} away. Events within 7 days can't be cancelled online — contact your admin directly.` } };
    }
  }

  const { error: deleteError } = await supabase.from('assignments').delete().eq('id', assignmentId);
  if (deleteError) throw deleteError;

  let promoted = null;
  try {
    const promoRes = await fetch(`https://${host}/api/promote-standby`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: assignment.event_id, position: assignment.position }),
    });
    const promoResult = await promoRes.json();
    if (promoResult?.promoted) promoted = promoResult.workerName || true;
  } catch (_) {}

  return { status: 200, body: { ok: true, promoted } };
}

async function handleLeaveStandby(supabase, { assignmentId, workerId }) {
  if (!assignmentId || !workerId) {
    return { status: 400, body: { ok: false, error: 'assignmentId and workerId are required' } };
  }
  const { data: assignment, error: fetchError } = await supabase
    .from('assignments').select('id, worker_id, status').eq('id', assignmentId).maybeSingle();
  if (fetchError) throw fetchError;
  if (!assignment || assignment.worker_id !== workerId) {
    return { status: 404, body: { ok: false, error: 'Assignment not found' } };
  }
  if (assignment.status !== 'standby') {
    return { status: 400, body: { ok: false, error: 'This assignment is not on standby' } };
  }
  const { error: deleteError } = await supabase.from('assignments').delete().eq('id', assignmentId);
  if (deleteError) throw deleteError;
  return { status: 200, body: { ok: true } };
}

async function handleSwitchPosition(supabase, { assignmentId, workerId, newPosition }) {
  if (!assignmentId || !workerId || !newPosition) {
    return { status: 400, body: { ok: false, error: 'assignmentId, workerId and newPosition are required' } };
  }

  const { data: assignment, error: fetchError } = await supabase
    .from('assignments').select('id, worker_id, status, event_id, position').eq('id', assignmentId).maybeSingle();
  if (fetchError) throw fetchError;
  if (!assignment || assignment.worker_id !== workerId) {
    return { status: 404, body: { ok: false, error: 'Assignment not found' } };
  }
  if (!isFilled(assignment.status)) {
    return { status: 400, body: { ok: false, error: 'This assignment is not currently confirmed' } };
  }

  const { data: event, error: eventError } = await supabase
    .from('events').select('id, date, positions').eq('id', assignment.event_id).maybeSingle();
  if (eventError) throw eventError;
  if (!event) return { status: 404, body: { ok: false, error: 'Event not found' } };

  const [y, m, d] = event.date.split('-').map(Number);
  const daysUntil = Math.ceil((new Date(y, m - 1, d) - new Date()) / (1000 * 60 * 60 * 24));
  if (daysUntil < 7) {
    return { status: 400, body: { ok: false, error: `This event is ${daysUntil} day${daysUntil !== 1 ? 's' : ''} away. Position changes within 7 days require admin approval — contact your admin directly.` } };
  }

  const posDef = (event.positions || []).find(p => (p.key || p.name) === newPosition);
  if (!posDef) {
    return { status: 400, body: { ok: false, error: 'That position no longer exists on this event' } };
  }

  const { data: eventAssignments, error: assignmentsError } = await supabase
    .from('assignments').select('id, position, status').eq('event_id', event.id);
  if (assignmentsError) throw assignmentsError;

  const filledCount = (eventAssignments || []).filter(a => a.id !== assignmentId && isFilled(a.status) && a.position === newPosition).length;
  const needed = posDef.count || 1;
  if (filledCount >= needed) {
    return { status: 400, body: { ok: false, error: 'That position is already full' } };
  }

  const { error: updateError } = await supabase.from('assignments').update({ position: newPosition }).eq('id', assignmentId);
  if (updateError) throw updateError;
  return { status: 200, body: { ok: true } };
}

async function handleCheckIn(supabase, { assignmentId, workerId }) {
  if (!assignmentId || !workerId) {
    return { status: 400, body: { ok: false, error: 'assignmentId and workerId are required' } };
  }

  const { data: assignment, error: fetchError } = await supabase
    .from('assignments')
    .select('id, worker_id, status, checked_in_at, events(date)')
    .eq('id', assignmentId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!assignment || assignment.worker_id !== workerId) {
    return { status: 404, body: { ok: false, error: 'Assignment not found' } };
  }
  if (!isFilled(assignment.status)) {
    return { status: 400, body: { ok: false, error: 'This assignment is not currently confirmed' } };
  }
  if (assignment.checked_in_at) {
    return { status: 200, body: { ok: true, checkedInAt: assignment.checked_in_at, alreadyCheckedIn: true } };
  }

  const eventDate = assignment.events?.date;
  if (eventDate) {
    // Vercel functions run in UTC, so comparing against `new Date()` directly
    // misjudges "today" for evening check-ins in the business's Central timezone
    // (e.g. 10pm CDT is already the next day in UTC). Compare date strings in
    // the business's local timezone instead.
    const todayInBusinessTz = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
    if (eventDate !== todayInBusinessTz) {
      return { status: 400, body: { ok: false, error: 'Check-in is only available on the day of the event.' } };
    }
  }

  const checkedInAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('assignments').update({ checked_in_at: checkedInAt }).eq('id', assignmentId);
  if (updateError) throw updateError;
  return { status: 200, body: { ok: true, checkedInAt } };
}

const PROFILE_ALLOWED_FIELDS = ['email', 'phone', 'address', 'shirt_size', 'photo_url'];

async function handleUpdateProfile(supabase, { workerId, updates }) {
  if (!workerId || !updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return { status: 400, body: { ok: false, error: 'workerId and updates are required' } };
  }
  const safeUpdates = {};
  for (const field of PROFILE_ALLOWED_FIELDS) {
    if (field in updates) safeUpdates[field] = updates[field];
  }
  if (Object.keys(safeUpdates).length === 0) {
    return { status: 400, body: { ok: false, error: 'No editable fields provided' } };
  }

  const { data: worker, error: fetchError } = await supabase.from('workers').select('id').eq('id', workerId).maybeSingle();
  if (fetchError) throw fetchError;
  if (!worker) return { status: 404, body: { ok: false, error: 'Worker not found' } };

  const { error: updateError } = await supabase.from('workers').update(safeUpdates).eq('id', workerId);
  if (updateError) throw updateError;
  return { status: 200, body: { ok: true } };
}

async function handleSignup(supabase, { name, phone, email, pinHash }) {
  if (!name || !phone || !pinHash) {
    return { status: 400, body: { ok: false, error: 'name, phone and pinHash are required' } };
  }
  const cleanPhone = String(phone).replace(/\D/g, '');
  if (!cleanPhone) {
    return { status: 400, body: { ok: false, error: 'Invalid phone number' } };
  }

  const { data: existing, error: existingError } = await supabase
    .from('workers').select('id').eq('phone', cleanPhone);
  if (existingError) throw existingError;
  if (existing && existing.length > 0) {
    return { status: 400, body: { ok: false, error: 'An account with this phone number already exists. Try logging in instead.' } };
  }

  const { data: newWorker, error: insertError } = await supabase
    .from('workers')
    .insert([{
      name: String(name).trim(),
      phone: cleanPhone,
      email: email ? String(email).trim() : null,
      pin_hash: pinHash,
      is_active: true,
      rank: 5,
    }])
    .select('*')
    .single();
  if (insertError) throw insertError;

  // Mark any matching invite as joined — best-effort, never blocks signup.
  try {
    await supabase.from('worker_invites').update({ status: 'joined' })
      .or(`contact.eq.${cleanPhone},contact.eq.${email ? String(email).trim() : ''}`);
  } catch (_) {}

  const { pin_hash, ...safeWorker } = newWorker;
  return { status: 200, body: { ok: true, worker: safeWorker } };
}

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

  const { action, ...params } = req.body || {};

  try {
    let result;
    switch (action) {
      case 'apply':
        result = await handleApply(supabase, params);
        break;
      case 'cancelAssignment':
        result = await handleCancelAssignment(supabase, params, req.headers.host);
        break;
      case 'leaveStandby':
        result = await handleLeaveStandby(supabase, params);
        break;
      case 'switchPosition':
        result = await handleSwitchPosition(supabase, params);
        break;
      case 'checkIn':
        result = await handleCheckIn(supabase, params);
        break;
      case 'updateProfile':
        result = await handleUpdateProfile(supabase, params);
        break;
      case 'signup':
        result = await handleSignup(supabase, params);
        break;
      default:
        return res.status(400).json({ ok: false, error: 'Unknown action' });
    }
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error(`worker-actions (${action}) error:`, error);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
}
