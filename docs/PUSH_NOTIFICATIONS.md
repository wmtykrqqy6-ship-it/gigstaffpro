# Installable app and push notifications

Added 2026-10-05. GigStaffPro is installable to a phone's home screen (a PWA) and can send push
notifications to workers who turn them on. Emails keep going as before; push is in addition.

## For workers

- **Install:**
  - **iPhone:** Safari → Share → **Add to Home Screen**. iOS 16.4+ only, and push only works from
    the home-screen icon.
  - **Android:** Chrome → **Install app**.
  - **First open:** log in once inside the installed app. On iPhone the installed app keeps its own
    login, separate from Safari.
- **Turn on:** the Dashboard banner **Turn on notifications**, or Profile → Notifications. A
  confirmation push ("Notifications are on 🎉") arrives right away.
- **Turn off:** Profile → Notifications → **Turn off on this device**, or the phone's settings.

## What sends a push

| Trigger | Where | Notes |
|---|---|---|
| Event invite / re-invite | `InviteWorkersModal.jsx` → `api/send-email.js` (`action: 'push'`, admin token) | Also reaches invited workers with no email |
| Staff → **Test** | `StaffView.jsx` → same | Tells you if the worker hasn't turned push on |
| Shift reminders | `api/send-shift-reminders.js` | Sent once, together with the reminder email (same tiers and preferences). Workers without an email get no reminder of either kind |
| Day-before route reminder | `api/_lib/routeReminders.js` | Sent once with the route email |
| Message Staff | `MessageStaffModal.jsx` → `api/send-email.js` (`kind: 'message'`) | Checkbox, on by default. Also reaches workers with no email |

**Inbox (2026-10-06).** A push disappears from the phone once it's tapped, so every Message Staff
message is also saved per worker (table `worker_messages`, migration `20261006120000`). It appears
in the worker's 🔔 bell, even for workers without push. Tapping a message push opens the app with
the bell open (`/?inbox=1`). The bell reloads messages whenever the app comes back to the front
(worker-actions `listMessages`). Dismissing hides a message on that device.

Staff shows a 🔔 **Notifications** chip on workers who have push on, and an "X of Y have notifications
on" count (`kind: 'status'`), so you know who still needs a text.

Ideas for later: standby promotion ("a spot opened up"), meeting point set, application approved.

## How it works

- **`public/manifest.webmanifest`, `public/icons/*`, and the `index.html` tags** make the site
  installable. The icons are generated from the header logo.
- **`public/sw.js`** is the service worker. It does **push only**: no fetch handler and no caching,
  so an installed app can never get stuck on an old version. It's served no-cache (`vercel.json`) and
  registered in `src/main.jsx`.
- **`src/utils/push.js`** (tested) handles the browser side: support detection, the permission
  prompt (it must come from a tap), subscribe and unsubscribe.
- **`src/components/PushSettings.jsx`** is the Dashboard banner and the Profile switch.
- **`api/_lib/push.js`** (tested) is the server side:
  - save/remove subscriptions (`api/worker-actions.js` actions `pushConfig`, `savePushSubscription`,
    `removePushSubscription`, behind the worker identity check)
  - `sendPushToWorkers`, which never throws and removes dead subscriptions (404/410)
  - the notification text
  - the admin push handler
- **No new Vercel functions.** The Hobby plan is at its limit of 12.
- **Table `push_subscriptions`:** migration `20261005120000`. RLS is on, with no browser access
  at all; only the service role can use it.
- **Keys:** `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in Vercel env. Without them nothing breaks;
  push just stays off. If the private key leaks, generate a new pair, and workers turn notifications
  on again.
- **Dependency:** `web-push` (server only), approved by Dylan 2026-10-05.
