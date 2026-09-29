// Crew route check-offs (Delivery Logistics phase 3), dispatched from
// api/worker-actions.js as actions 'routeCheck' and 'routeStopStatus'.
//
// Same trust model as that file's other worker actions (see its header):
// the service role does the write, and the client-supplied workerId is
// checked against the run's two-person team -- there's no worker session
// token to verify yet. Writes are limited to the run's own day, plus the
// early hours of the next morning for late-night pickups.

const BUSINESS_TZ = 'America/Chicago';
export const LATE_PICKUP_CUTOFF_HOUR = 6;
const STOP_STATUSES = ['planned', 'arrived', 'done'];
const CHECK_TYPE_FOR_STOP = { deliver: 'delivered', pickup: 'returned' };

// { date: 'YYYY-MM-DD', yesterday: 'YYYY-MM-DD', hour: 0-23 } in business time.
export function businessNow(now = new Date()) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ }).format(now);
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TZ, hour: 'numeric', hourCycle: 'h23' }).format(now));
  const [y, m, d] = date.split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  const yesterday = prev.toISOString().slice(0, 10);
  return { date, yesterday, hour };
}

// Pure access rule. Returns an error message, or null if allowed.
export function routeAccessError({ run, workerId, now }) {
  if (!run) return 'Stop not found';
  if (!workerId || (run.worker1_id !== workerId && run.worker2_id !== workerId)) {
    return 'You are not on this truck’s team';
  }
  const onDay = run.run_date === now.date;
  const latePickupWindow = run.run_date === now.yesterday && now.hour < LATE_PICKUP_CUTOFF_HOUR;
  if (!onDay && !latePickupWindow) return 'Check-offs are only available on the day of the route';
  return null;
}

async function loadStopAndRun(supabase, stopId) {
  const { data: stop, error } = await supabase
    .from('run_stops')
    .select('id, run_id, stop_type, event_id, daily_runs(run_date, worker1_id, worker2_id)')
    .eq('id', stopId)
    .maybeSingle();
  if (error) throw error;
  return { stop, run: stop?.daily_runs || null };
}

const cleanText = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const cleanQty = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 9999 ? n : null;
};

export async function handleRouteCheck(supabase, params, now = businessNow()) {
  const { workerId, stopId, checked } = params;
  if (!stopId || !workerId) return { status: 400, body: { ok: false, error: 'stopId and workerId are required' } };

  const { stop, run } = await loadStopAndRun(supabase, stopId);
  const denied = routeAccessError({ run, workerId, now });
  if (denied) return { status: stop ? 403 : 404, body: { ok: false, error: denied } };

  const checkType = CHECK_TYPE_FOR_STOP[stop.stop_type];
  if (!checkType) return { status: 400, body: { ok: false, error: 'Nothing to check off at this stop' } };

  const itemKey = cleanText(params.itemKey, 300);
  const itemName = cleanText(params.itemName, 200);
  if (!itemKey || !itemName) return { status: 400, body: { ok: false, error: 'itemKey and itemName are required' } };

  if (checked === false) {
    const { error } = await supabase.from('route_item_checks').delete()
      .eq('stop_id', stopId).eq('item_key', itemKey).eq('check_type', checkType);
    if (error) throw error;
    return { status: 200, body: { ok: true, removed: true } };
  }

  const quantity = cleanQty(params.quantity);
  const expected = cleanQty(params.expected);
  if (quantity == null || expected == null) return { status: 400, body: { ok: false, error: 'quantity and expected must be whole numbers' } };

  const row = {
    stop_id: stopId,
    item_key: itemKey,
    item_name: itemName,
    parent_name: cleanText(params.parentName, 200) || null,
    check_type: checkType,
    quantity,
    expected,
    checked_by_worker_id: workerId,
    checked_at: new Date().toISOString()
  };
  const { data, error } = await supabase.from('route_item_checks')
    .upsert([row], { onConflict: 'stop_id,item_key,check_type' }).select().single();
  if (error) throw error;
  return { status: 200, body: { ok: true, check: data } };
}

export async function handleRouteStopStatus(supabase, params, now = businessNow()) {
  const { workerId, stopId, status } = params;
  if (!stopId || !workerId) return { status: 400, body: { ok: false, error: 'stopId and workerId are required' } };
  if (!STOP_STATUSES.includes(status)) return { status: 400, body: { ok: false, error: 'Invalid status' } };

  const { stop, run } = await loadStopAndRun(supabase, stopId);
  const denied = routeAccessError({ run, workerId, now });
  if (denied) return { status: stop ? 403 : 404, body: { ok: false, error: denied } };

  const { error } = await supabase.from('run_stops')
    .update({ status, updated_at: new Date().toISOString() }).eq('id', stopId);
  if (error) throw error;
  return { status: 200, body: { ok: true, status } };
}
