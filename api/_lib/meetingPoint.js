// "Set meeting point where I'm standing" (Dylan, 2026-10-04), dispatched from
// api/worker-actions.js as 'setMeetingPoint'. Lets the people on site drop the
// event's meeting-point pin from their phone so everyone else can find them:
//   - the worker assigned as Host on the event, and
//   - the Set Up Driver / Set Up crew on a truck run that stops at the event.
// Allowed from the day before the event through the event day (plus the
// early hours after, for late parties), in business time.
//
// Same trust model as the file's other worker actions (see its header): the
// service role does the write and the client-supplied workerId isn't yet
// verified against a session. Admins set the pin in the event form instead.

import { businessNow } from './routeActions.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v) => typeof v === 'string' && UUID.test(v);
const UNFILLED = ['standby', 'pending', 'rejected', 'cancelled'];
const LATE_HOURS_CUTOFF = 6;

export const meetingPointUrl = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;

export function validCoords(lat, lng) {
  const a = Number(lat), b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 && !(a === 0 && b === 0);
}

const dayBefore = (ymd) => {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
};

// Day before, event day, or the early hours after it.
export function meetingPointWindowOk(eventDate, now) {
  if (!eventDate) return false;
  if (now.date === eventDate || now.date === dayBefore(eventDate)) return true;
  return now.yesterday === eventDate && now.hour < LATE_HOURS_CUTOFF;
}

export const isHostPosition = (position) => /\bhost\b/i.test(String(position ?? '').replace(/_/g, ' '));

// Pure role rule. assignments: this worker's rows on the event;
// runs: daily_runs rows that have a stop at the event.
export function canSetMeetingPoint({ workerId, assignments = [], runs = [] }) {
  const isHost = assignments.some(a => a.worker_id === workerId && !UNFILLED.includes(a.status) && isHostPosition(a.position));
  const onCrew = runs.some(r => r && (r.worker1_id === workerId || r.worker2_id === workerId));
  return isHost || onCrew;
}

const fail = (status, error) => ({ status, body: { ok: false, error } });
const isMissingColumn = (err) => err && (err.code === '42703' || err.code === 'PGRST204' || /meeting_point_set_(by_name|at)/.test(err.message || ''));

export async function handleSetMeetingPoint(supabase, params = {}, now = businessNow()) {
  const { workerId, eventId, lat, lng } = params;
  if (!isId(workerId) || !isId(eventId)) return fail(400, 'workerId and eventId are required');
  if (!validCoords(lat, lng)) return fail(400, 'A valid location is required');
  const description = typeof params.description === 'string' ? params.description.trim().slice(0, 200) : '';

  const { data: event, error: evError } = await supabase
    .from('events').select('id, date, meeting_point_description').eq('id', eventId).maybeSingle();
  if (evError) throw evError;
  if (!event) return fail(404, 'Event not found');
  if (!meetingPointWindowOk(event.date, now)) {
    return fail(403, 'The meeting point can be set from the day before the event through the event day');
  }

  const [{ data: assignments, error: aError }, { data: stops, error: sError }] = await Promise.all([
    supabase.from('assignments').select('worker_id, status, position').eq('event_id', eventId).eq('worker_id', workerId),
    supabase.from('run_stops').select('daily_runs(worker1_id, worker2_id)').eq('event_id', eventId)
  ]);
  if (aError) throw aError;
  if (sError) throw sError;
  const runs = (stops || []).map(s => s.daily_runs).filter(Boolean);
  if (!canSetMeetingPoint({ workerId, assignments: assignments || [], runs })) {
    return fail(403, 'Only the Host or the setup crew for this event can set the meeting point');
  }

  const { data: worker } = await supabase.from('workers').select('name').eq('id', workerId).maybeSingle();
  const point = {
    meeting_point_lat: Number(lat),
    meeting_point_lng: Number(lng),
    meeting_point_url: meetingPointUrl(Number(lat), Number(lng)),
    meeting_point_description: description || event.meeting_point_description || null
  };
  const setBy = { meeting_point_set_by_name: worker?.name || null, meeting_point_set_at: new Date().toISOString() };

  let { error } = await supabase.from('events').update({ ...point, ...setBy }).eq('id', eventId);
  // "Set by" columns are an optional migration (20261004120000); save the pin without them if absent.
  if (error && isMissingColumn(error)) ({ error } = await supabase.from('events').update(point).eq('id', eventId));
  if (error) throw error;

  return {
    status: 200,
    body: { ok: true, meetingPoint: { ...point, ...setBy } }
  };
}
