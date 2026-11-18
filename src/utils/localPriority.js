// "Local crew first": for the first 48 hours after an event is posted, only
// workers whose primary market (home_location_id) is the event's market
// (location_id) can see and sign up for it. See docs/LOCAL_PRIORITY.md.
// The server enforces the same rule in api/_lib/localPriority.js -- these
// decide what to show.

export const LOCAL_PRIORITY_HOURS = 48;

// When a new event's window should end: 48 hours from now, but never past
// midnight at the start of the day before the event, so non-local workers
// always get at least a day to sign up. Returns null (no window) when that
// leaves no time at all.
export function computeLocalPriorityUntil(eventDate, now = new Date(), hours = LOCAL_PRIORITY_HOURS) {
  const end = new Date(now.getTime() + hours * 3600 * 1000);
  if (eventDate) {
    const [y, m, d] = String(eventDate).split('T')[0].split('-').map(Number);
    if (y && m && d) {
      const cap = new Date(y, m - 1, d - 1);
      if (cap < end) return cap > now ? cap : null;
    }
  }
  return end;
}

export function localPriorityActive(event, now = new Date()) {
  if (!event?.location_id || !event?.local_priority_until) return false;
  const until = new Date(event.local_priority_until);
  return !Number.isNaN(until.getTime()) && until > now;
}

// Workers in several markets count as local only at their primary one.
export function isLocalWorker(worker, event) {
  return !!worker?.home_location_id && worker.home_location_id === event?.location_id;
}

export function canSelfBookDuringWindow(worker, event, now = new Date()) {
  return !localPriorityActive(event, now) || isLocalWorker(worker, event);
}

// "31h left" / "45m left"
export function localPriorityTimeLeft(event, now = new Date()) {
  if (!localPriorityActive(event, now)) return '';
  const mins = Math.ceil((new Date(event.local_priority_until) - now) / 60000);
  return mins >= 60 ? `${Math.floor(mins / 60)}h left` : `${mins}m left`;
}

// Nearest market to an event address, from [{ id, miles }] distance lookups.
// Unknown distances (null/undefined/NaN) are ignored; null when none known.
export function nearestLocationId(distances) {
  let best = null;
  for (const d of distances || []) {
    if (typeof d?.miles !== 'number' || !Number.isFinite(d.miles)) continue;
    if (!best || d.miles < best.miles) best = d;
  }
  return best ? best.id : null;
}
