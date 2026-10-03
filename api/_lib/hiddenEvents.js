// "Not interested" on the worker's Available Events list, dispatched from
// api/worker-actions.js as 'hideEvent', 'unhideEvent' and 'listHiddenEvents'.
//
// Same trust model as that file's other worker actions (see its header):
// the service role does the write and the client-supplied workerId is not
// yet verified against a session. The data is low-stakes -- it only decides
// what one worker's own list shows -- and hiding never changes staffing.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v) => typeof v === 'string' && UUID.test(v);
const bad = (error) => ({ status: 400, body: { ok: false, error } });

export async function handleHideEvent(supabase, { workerId, eventId } = {}) {
  if (!isId(workerId) || !isId(eventId)) return bad('workerId and eventId are required');
  const { error } = await supabase
    .from('hidden_events')
    .upsert({ worker_id: workerId, event_id: eventId }, { onConflict: 'worker_id,event_id', ignoreDuplicates: true });
  if (error) throw error;
  return { status: 200, body: { ok: true } };
}

export async function handleUnhideEvent(supabase, { workerId, eventId } = {}) {
  if (!isId(workerId) || !isId(eventId)) return bad('workerId and eventId are required');
  const { error } = await supabase
    .from('hidden_events')
    .delete()
    .eq('worker_id', workerId)
    .eq('event_id', eventId);
  if (error) throw error;
  return { status: 200, body: { ok: true } };
}

export async function handleListHiddenEvents(supabase, { workerId } = {}) {
  if (!isId(workerId)) return bad('workerId is required');
  const { data, error } = await supabase
    .from('hidden_events')
    .select('event_id')
    .eq('worker_id', workerId);
  if (error) throw error;
  return { status: 200, body: { ok: true, eventIds: (data || []).map(r => r.event_id) } };
}
