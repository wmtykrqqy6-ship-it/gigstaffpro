// GigStaffPro service worker -- push notifications ONLY (2026-10-05).
//
// Deliberately has no 'fetch' handler and caches nothing: the site always
// loads fresh from the network, so an installed app can never get stuck on
// an old version. It only shows pushed notifications and opens the app when
// one is tapped. Served with Cache-Control: no-cache (vercel.json).

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || 'GigStaffPro';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || '/' }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.focus();
        if (client.url !== url && 'navigate' in client) { try { await client.navigate(url); } catch {} }
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
