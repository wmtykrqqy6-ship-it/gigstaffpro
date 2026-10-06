// Push notifications for the installable web app (2026-10-05, see
// docs/PUSH_NOTIFICATIONS.md). Shared by api/worker-actions.js (saving a
// phone's subscription) and the senders (invites, reminders, test button) --
// kept in _lib so no new Vercel function is needed (Hobby plan is at 12).
//
// Keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in Vercel env. Without them
// everything here quietly does nothing, so email keeps working regardless.

import webpush from 'web-push';

const SUBJECT = 'https://www.gigstaffpro.com';
const TTL_SECONDS = 12 * 60 * 60; // drop a notification the phone hasn't picked up in 12h

export const pushConfigured = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

let vapidSet = false;
function ensureVapid() {
  if (vapidSet) return;
  webpush.setVapidDetails(SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  vapidSet = true;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v) => typeof v === 'string' && UUID.test(v);
const bad = (error) => ({ status: 400, body: { ok: false, error } });

// A browser PushSubscription as JSON: { endpoint, keys: { p256dh, auth } }.
export function validSubscription(sub) {
  if (!sub || typeof sub !== 'object') return false;
  const { endpoint, keys } = sub;
  if (typeof endpoint !== 'string' || endpoint.length > 1000 || !/^https:\/\//.test(endpoint)) return false;
  const ok = (v) => typeof v === 'string' && v.length > 0 && v.length <= 200 && /^[A-Za-z0-9_=-]+$/.test(v);
  return !!keys && ok(keys.p256dh) && ok(keys.auth);
}

// ---- worker-actions handlers ----

export function handlePushConfig() {
  return { status: 200, body: { ok: true, publicKey: pushConfigured() ? process.env.VAPID_PUBLIC_KEY : null } };
}

export async function handleSavePushSubscription(supabase, { workerId, subscription, userAgent } = {}, { send } = {}) {
  if (!isId(workerId)) return bad('workerId is required');
  if (!validSubscription(subscription)) return bad('A valid push subscription is required');
  // Upsert by endpoint: the same phone logging in as a different worker
  // moves the subscription to the new worker.
  const { error } = await supabase.from('push_subscriptions').upsert({
    worker_id: workerId,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    user_agent: typeof userAgent === 'string' ? userAgent.slice(0, 300) : null
  }, { onConflict: 'endpoint' });
  if (error) throw error;
  // Instant confirmation on that phone, so the worker sees it working.
  if (send || pushConfigured()) {
    try {
      const sender = send || ((sub, payload, opts) => { ensureVapid(); return webpush.sendNotification(sub, payload, opts); });
      await sender({ endpoint: subscription.endpoint, keys: subscription.keys }, JSON.stringify(confirmationNotification()), { TTL: 600 });
    } catch (err) {
      console.error('push confirmation failed:', err?.statusCode || '', err?.message || err);
    }
  }
  return { status: 200, body: { ok: true } };
}

export async function handleRemovePushSubscription(supabase, { workerId, endpoint } = {}) {
  if (!isId(workerId) || typeof endpoint !== 'string') return bad('workerId and endpoint are required');
  const { error } = await supabase.from('push_subscriptions').delete().eq('worker_id', workerId).eq('endpoint', endpoint);
  if (error) throw error;
  return { status: 200, body: { ok: true } };
}

// ---- sending ----

// Sends one notification to every phone of each worker. Never throws: push
// is a bonus on top of email, so a failure here must not break the caller.
// Phones that have uninstalled or revoked permission (404/410) are removed.
export async function sendPushToWorkers(supabase, workerIds, notification, { send } = {}) {
  const ids = [...new Set((workerIds || []).filter(isId))];
  const result = { sent: 0, failed: 0, removed: 0, skipped: null };
  if (!ids.length) return result;
  if (!send && !pushConfigured()) { result.skipped = 'not-configured'; return result; }
  try {
    const sender = send || ((sub, payload, opts) => { ensureVapid(); return webpush.sendNotification(sub, payload, opts); });
    const { data: subs, error } = await supabase
      .from('push_subscriptions').select('id, worker_id, endpoint, p256dh, auth').in('worker_id', ids);
    if (error) throw error;
    const payload = JSON.stringify(notification);
    await Promise.all((subs || []).map(async (s) => {
      try {
        await sender({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: TTL_SECONDS });
        result.sent++;
        await supabase.from('push_subscriptions').update({ last_success_at: new Date().toISOString() }).eq('id', s.id);
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', s.id);
          result.removed++;
        } else {
          result.failed++;
          console.error('push send failed:', err?.statusCode || '', err?.body || err?.message || err);
        }
      }
    }));
  } catch (err) {
    console.error('push: could not send:', err?.message || err);
  }
  return result;
}

// ---- notification text (pure, tested) ----

const shortDate = (ymd) => {
  if (!ymd) return '';
  const [y, m, d] = String(ymd).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
};
const shortTime = (hhmm) => {
  if (!hhmm) return '';
  const [h, mi] = String(hhmm).split(':').map(Number);
  if (!Number.isFinite(h)) return '';
  return `${((h + 11) % 12) + 1}:${String(mi || 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const when = (event) => [shortDate(event?.date), shortTime(event?.time)].filter(Boolean).join(' · ');

export const inviteNotification = (event, positionLabel) => ({
  title: `You're invited: ${event?.name || 'a new event'}`,
  body: [positionLabel, when(event)].filter(Boolean).join(' — ') + ' · Tap to accept or decline',
  url: '/',
  tag: `invite-${event?.id || ''}`
});

export const shiftReminderNotification = (event, hoursUntil) => ({
  title: `Shift reminder: ${event?.name || 'your shift'}`,
  body: [hoursUntil ? `Starts in ${hoursUntil} hour${hoursUntil === 1 ? '' : 's'}` : null, when(event)].filter(Boolean).join(' · '),
  url: '/',
  tag: `shift-${event?.id || ''}`
});

// Push via a service-role Supabase client built on demand (for the cron
// jobs, which otherwise talk to the REST API directly). No-op without keys.
let cronClient;
export async function sendPushFromCron(createClientFn, workerIds, notification) {
  if (!pushConfigured()) return { sent: 0, skipped: 'not-configured' };
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { sent: 0, skipped: 'no-supabase-env' };
  cronClient = cronClient || createClientFn(url, key);
  return sendPushToWorkers(cronClient, workerIds, notification);
}

export const routeReminderNotification = ({ vehicleLabel, runDate, stopCount }) => ({
  title: `Tomorrow: you're ${vehicleLabel}`,
  body: `${shortDate(runDate)} · ${stopCount} stop${stopCount === 1 ? '' : 's'} · Tap to see your route`,
  url: '/',
  tag: `route-${runDate || ''}`
});

export const confirmationNotification = () => ({
  title: 'Notifications are on 🎉',
  body: "You'll get invites, shift reminders and route updates here.",
  url: '/',
  tag: 'push-on'
});

// Message Staff broadcast: subject as the title, the text as the body.
// Each message gets its own tag so several don't replace each other.
export function messageNotification(title, message, event = null) {
  const raw = typeof message === 'string' ? message.trim().replace(/\s+/g, ' ') : '';
  if (!raw) return null;
  const t = typeof title === 'string' && title.trim() ? title.trim().slice(0, 80) : 'Message from your manager';
  // "Grand Geneva Resort & Spa · Tue, Oct 6: <message>" when it's about one event
  const text = event?.name ? `${[event.name, shortDate(event.date)].filter(Boolean).join(' · ')}: ${raw}` : raw;
  return {
    title: `📣 ${t}`,
    body: text.length > 300 ? `${text.slice(0, 297)}…` : text,
    url: '/?inbox=1',
    tag: `msg-${Date.now()}`
  };
}

export const testNotification = () => ({
  title: 'GigStaffPro notifications are on 🎉',
  body: "This is a test from your manager. You'll get invites and shift reminders here.",
  url: '/',
  tag: 'test'
});

// ---- admin-triggered pushes (via api/send-email.js, admin token required) ----

// body: { action: 'push', kind, ... }
//   kind 'invite'  { workerIds, eventId, positionLabel? }
//   kind 'test'    { workerIds }
//   kind 'message' { workerIds, title, message }   -- Message Staff
//   kind 'status'  {}  -> which workers have notifications on (Staff view)
export async function handleAdminPush(supabase, body = {}, opts = {}) {
  const { kind, eventId } = body;
  if (kind === 'status') {
    const { data, error } = await supabase.from('push_subscriptions').select('worker_id, last_success_at');
    if (error) throw error;
    const byWorker = {};
    for (const row of data || []) {
      const w = byWorker[row.worker_id] || (byWorker[row.worker_id] = { devices: 0, lastSuccessAt: null });
      w.devices++;
      if (row.last_success_at && (!w.lastSuccessAt || row.last_success_at > w.lastSuccessAt)) w.lastSuccessAt = row.last_success_at;
    }
    return { status: 200, body: { ok: true, configured: pushConfigured(), workers: byWorker } };
  }

  const workerIds = Array.isArray(body.workerIds) ? body.workerIds.filter(isId).slice(0, 200) : [];
  if (!workerIds.length) return bad('workerIds are required');
  const positionLabel = typeof body.positionLabel === 'string' ? body.positionLabel.slice(0, 60) : '';

  let notification;
  if (kind === 'test') {
    notification = testNotification();
  } else if (kind === 'message') {
    // Sent to one event's staff? Name the event so workers know which one.
    let event = null;
    if (isId(eventId)) {
      const { data } = await supabase.from('events').select('id, name, date, time').eq('id', eventId).maybeSingle();
      event = data || null;
    }
    notification = messageNotification(body.title, body.message, event);
    if (!notification) return bad('A message is required');
    // Keep a copy in each worker's in-app inbox (a tapped push disappears).
    // Missing table/column (migration not run yet) must not stop the push.
    const rows = workerIds.map(worker_id => ({ worker_id, title: notification.title, body: notification.body, kind: 'message', event_id: event?.id || null }));
    try {
      let { error: inboxError } = await supabase.from('worker_messages').insert(rows);
      if (inboxError && /event_id/.test(inboxError.message || '')) {
        ({ error: inboxError } = await supabase.from('worker_messages').insert(rows.map(({ event_id, ...r }) => r)));
      }
      if (inboxError) throw inboxError;
    } catch (err) {
      console.error('worker_messages insert failed:', err?.message || err);
    }
  } else if (kind === 'invite') {
    if (!isId(eventId)) return bad('eventId is required');
    const { data: event, error } = await supabase.from('events').select('id, name, date, time').eq('id', eventId).maybeSingle();
    if (error) throw error;
    if (!event) return { status: 404, body: { ok: false, error: 'Event not found' } };
    notification = inviteNotification(event, positionLabel);
  } else {
    return bad('Unknown push kind');
  }

  const result = await sendPushToWorkers(supabase, workerIds, notification, opts);
  return { status: 200, body: { ok: true, configured: pushConfigured() || !!opts.send, ...result } };
}

// ---- worker inbox (worker-actions 'listMessages') ----

// The worker's messages from the last 30 days, newest first (max 30).
export async function handleListMessages(supabase, { workerId } = {}) {
  if (!isId(workerId)) return bad('workerId is required');
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const query = (cols) => supabase
    .from('worker_messages')
    .select(cols)
    .eq('worker_id', workerId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(30);
  let { data, error } = await query('id, title, body, kind, created_at, event_id');
  // event_id is an optional later migration (20261006130000)
  if (error && /event_id/.test(error.message || '')) ({ data, error } = await query('id, title, body, kind, created_at'));
  if (error) throw error;
  return { status: 200, body: { ok: true, messages: data || [] } };
}
