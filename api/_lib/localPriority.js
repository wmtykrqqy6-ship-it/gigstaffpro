// Server side of "Local crew first" (see docs/LOCAL_PRIORITY.md). The
// browser mirror is src/utils/localPriority.js; api/ doesn't import from src/.

export function localPriorityActive(event, now = new Date()) {
  if (!event?.location_id || !event?.local_priority_until) return false;
  const until = new Date(event.local_priority_until);
  return !Number.isNaN(until.getTime()) && until > now;
}

// Workers in several markets count as local only at their primary one.
export function isLocalWorker(worker, event) {
  return !!worker?.home_location_id && worker.home_location_id === event?.location_id;
}

// Error body for handleApply when a non-local worker tries to sign up during
// the window, or null when they may.
export function localPriorityBlock(worker, event, now = new Date()) {
  if (!localPriorityActive(event, now) || isLocalWorker(worker, event)) return null;
  return {
    status: 403,
    body: { ok: false, error: 'This event is open to the local crew first. It opens to everyone soon.' },
  };
}

// Availability emails. While the window is active, only local workers are
// emailed. "justReleased" is true for the day after the window ends, so the
// hourly cron can email everyone else whose rank window is already open
// (deduped by event_availability_notifications, like every other send).
export function availabilityAudience(event, now = new Date()) {
  if (localPriorityActive(event, now)) return { localOnly: true, justReleased: false };
  if (!event?.location_id || !event?.local_priority_until) return { localOnly: false, justReleased: false };
  const ended = new Date(event.local_priority_until);
  const justReleased = !Number.isNaN(ended.getTime()) && now - ended < 24 * 3600 * 1000;
  return { localOnly: false, justReleased };
}
