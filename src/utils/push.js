// Browser side of push notifications (docs/PUSH_NOTIFICATIONS.md).
// The service worker is public/sw.js; the server side is api/_lib/push.js.
import { workerFetch } from './workerApi';

export function isIos(nav = typeof navigator !== 'undefined' ? navigator : {}) {
  const ua = nav.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1);
}

export function isInstalledApp(win = typeof window !== 'undefined' ? window : {}) {
  try {
    return !!(win.matchMedia?.('(display-mode: standalone)').matches || win.navigator?.standalone);
  } catch {
    return false;
  }
}

// What this phone/browser can do right now:
//   'ready'          can turn notifications on
//   'on'             already on (checked separately via currentSubscription)
//   'install-first'  iPhone in Safari: must Add to Home Screen first
//   'blocked'        the person said no; only phone settings can undo it
//   'unsupported'    this browser can't do web push
export function pushSupport(win = typeof window !== 'undefined' ? window : {}) {
  const nav = win.navigator || {};
  const hasApis = 'serviceWorker' in nav && 'PushManager' in win && 'Notification' in win;
  if (!hasApis) return isIos(nav) && !isInstalledApp(win) ? 'install-first' : 'unsupported';
  if (win.Notification.permission === 'denied') return 'blocked';
  return 'ready';
}

// VAPID public key (base64url) -> Uint8Array for pushManager.subscribe.
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

const withTimeout = (promise, ms, message) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
]);

async function registration() {
  return withTimeout(navigator.serviceWorker.ready, 8000, 'The app is still starting up — try again in a moment.');
}

export async function currentSubscription() {
  try {
    if (!('serviceWorker' in navigator)) return null;
    const reg = await registration();
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

async function postAction(body) {
  const res = await workerFetch({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await res.json().catch(() => ({}));
  if (!res.ok || !result.ok) throw new Error(result.error || 'Something went wrong');
  return result;
}

// Must be called straight from a tap (phones only allow the permission
// prompt in response to one) -- requestPermission is the first thing it awaits.
export async function enablePush(workerId) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? 'Notifications are blocked. Turn them on for GigStaffPro in your phone’s Settings.'
      : 'Notifications weren’t allowed.');
  }
  const { publicKey } = await postAction({ action: 'pushConfig' });
  if (!publicKey) throw new Error('Notifications aren’t set up on the server yet.');
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  }
  await postAction({ action: 'savePushSubscription', workerId, subscription: sub.toJSON(), userAgent: navigator.userAgent });
  return sub;
}

export async function disablePush(workerId) {
  const sub = await currentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => {});
  await postAction({ action: 'removePushSubscription', workerId, endpoint }).catch(() => {});
}
