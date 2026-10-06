// Day-before route reminder for setup crews (Delivery Logistics).
//
// Called from api/send-shift-reminders.js on the same hourly GitHub Actions
// cron (one more step, not a new Vercel function -- the Hobby plan's function
// count is tight). From 4 PM business time, everyone on tomorrow's truck or
// personal-vehicle run gets one email with their stops in order; a run
// planned later that evening goes out on the next hourly pass. Each person
// gets it once per run (route_reminders_sent).
//
// Uses the service-role key from the environment (SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY, like api/worker-actions.js), not the hardcoded
// anon key in send-shift-reminders.js.
import { escapeHtml } from './escapeHtml.js';
import { routeReminderNotification } from './push.js';
import { renderEmailShell, htmlToPlainText } from './emailShell.js';
import { businessNow } from './routeActions.js';

export const SEND_FROM_HOUR = 16; // 4 PM business time, the day before
const PORTAL_URL = 'https://gigstaffpro.com';
const CLASS_LABELS = {
  craps: 'Craps', roulette: 'Roulette', poker: 'Poker', blackjack: 'Blackjack',
  chairs: 'Chairs', archway: 'Archway', decor: 'Decor'
};
const CLASS_ORDER = Object.keys(CLASS_LABELS);

// ---- pure helpers ---------------------------------------------------------

// 'YYYY-MM-DD' + 1 day.
export function nextDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

// The date whose routes should be reminded about right now, or null if it's
// too early in the day. `now` is businessNow()'s { date, hour }.
export function reminderTargetDate(now) {
  return now.hour >= SEND_FROM_HOUR ? nextDate(now.date) : null;
}

export const fmtTime = (t) => {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

export const fmtDate = (d) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
};

// "2 Craps, 8 Blackjack" for one event on one trip.
export function gearSummary(allocations, loadId, eventId) {
  const counts = {};
  for (const a of allocations) {
    if (a.load_id !== loadId || a.event_id !== eventId) continue;
    counts[a.size_class] = (counts[a.size_class] || 0) + (Number(a.quantity) || 0);
  }
  return CLASS_ORDER.filter(c => counts[c] > 0).map(c => `${counts[c]} ${CLASS_LABELS[c]}`).join(', ');
}

const mapsUrl = (address) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;

// Build the email for one crew member.
//   run: daily_runs row; truck: trucks row; worker/teammate: { name, email }
//   stops: the run's run_stops; loads: the run's run_loads
//   allocations: allocations for those loads; eventsById: { id: event }
export function buildRouteReminder({ run, truck, worker, teammate, stops, loads, allocations, eventsById }) {
  const loadSeq = Object.fromEntries(loads.map(l => [l.id, l.sequence]));
  const ordered = stops.slice().sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const vehicle = run.is_personal ? 'your own vehicle' : `the ${truck?.name || ''} truck`.replace('  ', ' ');
  const stopCount = ordered.length;

  let prevLoad;
  const rows = ordered.map((s, i) => {
    const ev = eventsById[s.event_id] || {};
    const reload = s.load_id && prevLoad && s.load_id !== prevLoad && (loadSeq[s.load_id] || 1) > 1;
    if (s.load_id) prevLoad = s.load_id;
    const when = s.scheduled_start ? `${fmtTime(s.scheduled_start)}${s.scheduled_end ? ` – ${fmtTime(s.scheduled_end)}` : ''}` : 'Time TBD';
    const label = s.stop_type === 'deliver' ? 'Deliver' : s.stop_type === 'pickup' ? 'Pick up' : s.stop_type === 'work' ? 'Dealing' : 'Stop';
    const gear = s.stop_type === 'deliver' ? gearSummary(allocations, s.load_id, s.event_id) : '';
    const note =
      s.stop_type === 'pickup' ? `After the party${ev.end_time ? ` (ends ${fmtTime(ev.end_time)})` : ''}. Pickup details open in your route once the party starts.`
      : s.stop_type === 'work' ? 'You\'re dealing this party — the truck stays parked here.'
      : '';
    return `
      ${reload ? `<div style="margin:10px 0 6px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em">↺ Back to the warehouse to reload</div>` : ''}
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;margin-bottom:8px">
        <div style="font-size:15px;color:#111"><strong>${i + 1}. ${label}</strong> — ${escapeHtml(ev.name || 'Event')}</div>
        <div style="font-size:14px;color:#374151;margin-top:2px">${escapeHtml(when)}</div>
        ${ev.address ? `<div style="font-size:14px;margin-top:2px"><a href="${escapeHtml(mapsUrl(ev.address))}" style="color:#1d4ed8">${escapeHtml(ev.address)}</a></div>` : ''}
        ${gear ? `<div style="font-size:13px;color:#374151;margin-top:4px">Bringing: ${escapeHtml(gear)}</div>` : ''}
        ${note ? `<div style="font-size:13px;color:#6b7280;margin-top:4px">${escapeHtml(note)}</div>` : ''}
      </div>`;
  }).join('');

  const body = `
    <p style="margin:0 0 6px;font-size:15px;color:#111">Hi ${escapeHtml(worker.name || 'there')},</p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px">
      Tomorrow, <strong>${escapeHtml(fmtDate(run.run_date))}</strong>, you're on ${escapeHtml(vehicle)}${teammate?.name ? ` with <strong>${escapeHtml(teammate.name)}</strong>` : ''}.
      Here's your route — ${stopCount} stop${stopCount === 1 ? '' : 's'}:
    </p>
    ${run.notes ? `<div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:14px;color:#374151"><strong>Notes:</strong> ${escapeHtml(run.notes)}</div>` : ''}
    ${rows}
    <div style="text-align:center;margin:18px 0 14px">
      <a href="${PORTAL_URL}" style="display:inline-block;background:#7c0a02;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px">
        Open your route →
      </a>
    </div>
    <p style="color:#9ca3af;font-size:11px;text-align:center;margin:0">
      Times can still change — your route in the staff portal is always the latest.
    </p>`;

  const html = renderEmailShell({ subtitle: 'Tomorrow\'s route', bodyHtml: body, headerEmoji: '🚚' });
  const subject = `🚚 Tomorrow's route: ${run.is_personal ? 'personal vehicle' : `${truck?.name || ''} truck`} — ${stopCount} stop${stopCount === 1 ? '' : 's'}`;
  return { subject, html, text: htmlToPlainText(html) };
}

// ---- runner ---------------------------------------------------------------

export async function sendRouteReminders({ now = businessNow(), env = process.env, fetchImpl = fetch, pushImpl = null } = {}) {
  const results = { target: null, runs: 0, sent: 0, skipped: 0, errors: [] };
  const target = reminderTargetDate(now);
  results.target = target;
  if (!target) return { ...results, message: `Route reminders start at ${SEND_FROM_HOUR}:00` };

  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = env.RESEND_API_KEY;
  if (!url || !key || !resendKey) return { ...results, message: 'Route reminders not configured' };

  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const get = async (path) => {
    const r = await fetchImpl(`${url}/rest/v1/${path}`, { headers });
    if (!r.ok) throw new Error(`${path.split('?')[0]}: HTTP ${r.status}`);
    return r.json();
  };
  const inList = (ids) => ids.map(encodeURIComponent).join(',');

  const runs = await get(`daily_runs?select=*&run_date=eq.${target}`);
  results.runs = runs.length;
  if (!runs.length) return results;

  const runIds = runs.map(r => r.id);
  const [loads, stops, sent] = await Promise.all([
    get(`run_loads?select=*&run_id=in.(${inList(runIds)})`),
    get(`run_stops?select=*&run_id=in.(${inList(runIds)})`),
    get(`route_reminders_sent?select=run_id,worker_id&run_id=in.(${inList(runIds)})`)
  ]);
  const loadIds = loads.map(l => l.id);
  const eventIds = [...new Set(stops.map(s => s.event_id).filter(Boolean))];
  const workerIds = [...new Set(runs.flatMap(r => [r.worker1_id, r.worker2_id]).filter(Boolean))];
  const truckIds = [...new Set(runs.map(r => r.truck_id))];
  const [allocations, events, workers, trucks] = await Promise.all([
    loadIds.length ? get(`load_allocations?select=*&load_id=in.(${inList(loadIds)})`) : [],
    eventIds.length ? get(`events?select=id,name,date,time,end_time,address,status&id=in.(${inList(eventIds)})`) : [],
    workerIds.length ? get(`workers?select=id,name,email&id=in.(${inList(workerIds)})`) : [],
    get(`trucks?select=id,name&id=in.(${inList(truckIds)})`)
  ]);

  const eventsById = Object.fromEntries(events.map(e => [e.id, e]));
  const workersById = Object.fromEntries(workers.map(w => [w.id, w]));
  const trucksById = Object.fromEntries(trucks.map(t => [t.id, t]));
  const sentSet = new Set(sent.map(s => `${s.run_id}:${s.worker_id}`));

  for (const run of runs) {
    const runStops = stops.filter(s => s.run_id === run.id && eventsById[s.event_id]?.status !== 'cancelled');
    if (!runStops.length) { results.skipped++; continue; }
    const crew = [run.worker1_id, run.worker2_id].filter(Boolean);
    for (const workerId of crew) {
      const worker = workersById[workerId];
      if (!worker?.email || sentSet.has(`${run.id}:${workerId}`)) { results.skipped++; continue; }
      const teammateId = crew.find(id => id !== workerId);
      const { subject, html, text } = buildRouteReminder({
        run, truck: trucksById[run.truck_id], worker, teammate: teammateId ? workersById[teammateId] : null,
        stops: runStops, loads: loads.filter(l => l.run_id === run.id), allocations, eventsById
      });
      try {
        const r = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
          body: JSON.stringify({ from: 'Vegas on Wheels <noreply@gigstaffpro.com>', to: [worker.email], subject, html, text })
        });
        if (!r.ok) { results.errors.push({ runId: run.id, workerId, error: `Resend HTTP ${r.status}` }); continue; }
        await fetchImpl(`${url}/rest/v1/route_reminders_sent`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify({ run_id: run.id, worker_id: workerId, run_date: run.run_date })
        });
        sentSet.add(`${run.id}:${workerId}`);
        results.sent++;
        // Push to their phone too, if they turned notifications on (never throws).
        if (pushImpl) {
          const vehicle = run.is_personal ? 'doing a delivery in your own vehicle' : `on the ${trucksById[run.truck_id]?.name || ''} truck`.replace('  ', ' ');
          await pushImpl([workerId], routeReminderNotification({ vehicleLabel: vehicle, runDate: run.run_date, stopCount: runStops.length }));
        }
      } catch (err) {
        results.errors.push({ runId: run.id, workerId, error: err.message });
      }
    }
  }
  return results;
}
