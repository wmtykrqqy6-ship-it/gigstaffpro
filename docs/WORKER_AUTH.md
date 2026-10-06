# Worker logins: the "real worker sessions" rollout

Started 2026-10-05 with Dylan. The goal is that every worker action is tied to the worker who is
actually logged in, not to a worker ID the phone claims.

## Two worker logins today

| | Legacy | Migrated ("newer login") |
|---|---|---|
| Login | phone + 4-digit PIN, checked by `api/worker-pin-login.js` | phone + 6-digit PIN, Supabase Auth (synthetic email, `worker_auth_links`) |
| Session token in the browser | none | yes (Supabase Auth) |
| How a worker switches | an admin uses Staff → worker → **Set PIN** → "Set PIN & Activate" (`api/admin-set-worker-pin.js`) | |

On 2026-09-09, 15 of 16 workers were still legacy.

## The rollout

Each step is reversible until step 4.

1. **Accept the token when it's sent** (done 2026-10-05, non-breaking).
   - `src/utils/workerApi.js` (`workerFetch`) attaches the Supabase session token to every worker
     action when one exists.
   - `api/_lib/verifyWorker.js` (tested) checks it in `api/worker-actions.js`:
     - A token for worker A acting as worker B is refused (403).
     - No token, an expired token, or a non-worker login falls back to the old behavior ("legacy
       trust").
   - Each request logs `worker-actions <action>: verified | legacy-trust | public` in Vercel, which
     shows how much traffic is verified.
   - Sign-up stays public.
2. **Move everyone to the newer login.** Admins can do it today with Set PIN in Staff. A
   self-service "set your new 6-digit PIN" prompt at login is optional. Track progress until 16 of 16
   have switched.
3. **Close the writes that skip the server.** These go from the browser straight to the database
   today:
   - `check_ins` upsert (GPS check-in, `WorkerPortalView.jsx`), which can set `method: 'geo'` /
     `flagged: false` itself
   - `invitations` update (accept/decline in the portal)
   - `post_event_reports`
   - `worker_reminder_prefs` upsert (`ProfileView.jsx`)

   Move them into `api/worker-actions.js`, with the server computing the check-in distance, and add
   tracked RLS migrations for these tables. Their current RLS isn't in `supabase/migrations/`, so
   check it live first. Email invite links (`api/invite-respond.js`) use their own per-invite token
   and are fine.
4. **Enforce.** Only once everyone has switched:
   - Set `WORKER_AUTH_ENFORCE=true` in Vercel, so every worker action must carry a valid token for
     the same worker.
   - Turn off the 4-digit login (`api/worker-pin-login.js`).
   - Rate-limit or move sign-up as needed.

   This is the only step that can lock someone out. To undo it, remove the env var.
