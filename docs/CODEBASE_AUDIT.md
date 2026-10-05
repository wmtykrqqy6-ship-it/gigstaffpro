# GigStaffPro — Codebase Audit

**Original audit:** 2026-07-20 (read-only inspection of `development/claude-code`)
**Re-verified:** 2026-10-01 against the source on `development/claude-code` (= `main`, commit `6bed5d2`). Every item below was re-checked in the code; each original finding now carries a status: ✅ resolved, ⚠️ partly resolved, ❌ still open.

---

## 1. Technology Stack

- **Frontend**: React 18 + Vite 5, Tailwind CSS 3 (+ PostCSS/autoprefixer), `lucide-react` icons, `pdfjs-dist` 4.x (lazy-loaded, pull-sheet import only). Plain JavaScript (`.jsx`/`.js`).
- **Backend/data**: Supabase Postgres + Auth, accessed via `@supabase/supabase-js` directly from the React client (no service layer for most operations).
- **Serverless functions**: 12 Vercel Node functions under `api/` (+ shared helpers in `api/_lib/`): email (Resend), distance lookups, `.ics` calendar, invite accept/decline, standby promotion, worker auth/PIN, worker actions, admin PIN tools, two hourly cron jobs.
- **Automation**: GitHub Actions — two hourly crons (shift reminders + day-before crew route emails; availability notifications), one manual-only legacy workflow, and a test workflow.
- **Tests**: Vitest (2.x, pinned for Vite 5) — 243 tests in 15 files, run in CI on every push/PR.
- **Lint/format**: none configured.
- **Deployment**: Vercel from `main` (empty `vercel.json`, framework auto-detection).

---

## 2. Folder/File Structure

```
/                     package.json, vite/vitest/tailwind/postcss config, index.html, vercel.json
/api/                 12 Vercel functions; api/_lib/ shared helpers (verifyAdmin, rateLimit, workerAuth,
                      emailShell, escapeHtml, routeActions, routeReminders) + their tests
/src/
  App.jsx             ~1,790-line root component — owns most state and Supabase calls
  supabaseClient.js   single Supabase client
  constants.js        business-rule constants, WORKER_COLUMNS allow-list
  components/         LoginScreen, Header, Navigation, MonthCalendar, EventsAgendaList, ...
    logistics/        Delivery Logistics UI (import, dispatch board, load sheets, crew route,
                      warehouse loading, returns, trucks/catalog settings)
    modals/           EventFormModal (shared by Add/Edit), Assign/Invite/Bulk Invite, Payment Calculator, ...
    ui/               ConfirmDialog, Toast, QuarterHourInput
    views/            Dashboard, Events, Schedule, Applications, Logistics, Staff, Payments, Reports,
                      Settings, WorkerPortal, Profile, History
  utils/              date/position/auth/email helpers, calendarHelpers, quarterHourTime;
    logistics/        pure, tested logistics logic (capacity, parser, dispatch, field views, staffing)
/supabase/migrations/ 23 SQL migrations (RLS lockdown + features), applied by hand in the SQL editor
/docs/                CODEBASE_AUDIT.md (this file), LOGISTICS.md, chat-history/
/database-backup/     local backups — gitignored
```

161 files tracked in git; 83 `.js`/`.jsx` files under `src/`.

---

## 3. Start, Build & Test

- `npm run dev` (Vite), `npm run build`, `npm run preview`, `npm test` (Vitest, single run), `npm run test:watch`.
- Vitest config: node environment, `src/**/*.test.js` and `api/**/*.test.js`. Tests sit next to the code they cover.
- No browser/E2E tests: UI changes are checked by build + server-side rendering only, then by hand on the live site.

---

## 4. Supabase Integration

- Single anon-key client, used directly from components.
- ⚠️ **Hardcoded fallback URL + anon key** still in source — now **4 files** (was 6): `src/supabaseClient.js`, `api/calendar-event.js`, `api/send-availability-notifications.js`, `api/send-shift-reminders.js`. Should come from env vars only; the key is in git history, so treat as public and consider rotating.
- ✅ **Schema and RLS are now in version control**: 23 migrations in `supabase/migrations/`. Written by Claude, reviewed, and run by Dylan in the Supabase SQL editor (never applied by Claude).
- Server functions that write data use `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from the environment.

---

## 5. Authentication & Roles

### 5.1 Admins — ✅ Supabase Auth
- Email/password via `supabase.auth.signInWithPassword`, then `get_authenticated_admin_profile()`; dashboard access only after both succeed. Sessions restore only from a live Supabase session.
- Backend admin routes verify the bearer token with `api/_lib/verifyAdmin.js` (`send-email`, `admin-set-worker-pin`, `admin-worker-migration-status`, `promote-standby`).
- Database-level admin check: `public.is_admin()` (admin_auth_links ↔ `auth.uid()`), used by RLS write policies.

### 5.2 Workers — ⚠️ two systems, mid-migration
- **Migrated**: Supabase Auth with a synthetic phone-derived email + 6-digit PIN (`worker_auth_links`).
- **Legacy**: phone + 4-digit PIN, now checked **server-side** in `api/worker-pin-login.js`; stored hashes upgraded from unsalted SHA-256 to **salted PBKDF2** on login. `workers.pin_hash` is no longer readable by anon/authenticated (column-level grants).
- ❌ **Worker writes trust the client-supplied `workerId`**: `api/worker-actions.js` (apply, cancel, switch, check-in, profile, route check-offs, hide/unhide events, meeting-point pin) uses the service role but has no worker session token to verify — anyone with a worker's UUID can act as them. Rate-limited where abuse is cheapest. Fix: real worker sessions (finish the Supabase Auth migration, verify the token server-side).
- As of 2026-09-09, 15 of 16 real workers were still on legacy PINs.

---

## 6. Major Features Present

- Admin: dashboard, staff, events (shared Add/Edit form, Goodshuffle pull-sheet upload), schedule (Monday-start calendar with shift dots, agenda), applications, reports, payments (contractor checks / employee hours exports), settings.
- **Delivery Logistics** (see `docs/LOGISTICS.md`): pull-sheet import with staffing prefill, truck capacity rules, dispatch board (vehicles, trips, split events, solo/personal-vehicle runs, conflicts, month calendar), load sheets, crew route with check-offs, warehouse loading view, returns tracking, day-before route emails.
- Worker portal: apply, profile, history, geofenced check-in, crew route, warehouse loading.
- Email: invites, reminders (shift tiers, availability, crew routes) via Resend with a shared template.

---

## 7. Incomplete / Duplicated / Abandoned

- ✅ `getPayRateKey` — one shared definition in `src/utils/positionHelpers.js` (tested).
- ✅ Add/Edit event modals — thin wrappers around one `EventFormModal.jsx`.
- ✅ Branded email template — one helper, kept as two deliberate copies (`api/_lib/emailShell.js` and `src/utils/emailShell.js`) because `api/` isn't bundled through Vite.
- ✅ `api/calculate-distance.js` — removed.
- ✅ Legacy `event-reminders.yml` (unversioned Edge Function, double-sent reminders) — schedule removed, manual-only.
- ❓ Time-conflict and pending→standby logic duplication — not re-checked in this pass.
- ❌ "Coming Soon" fallback in `App.jsx renderView()` — still present, still unreachable.

---

## 8. Bugs & Security

### Bugs
- ✅ `Navigation.jsx` missing `MapPin`/`ChevronDown` imports — fixed.
- ✅ `PaymentCalculatorModal.jsx` Rules-of-Hooks violation — fixed (the no-payment path is a hook, not an early return).
- ✅ `AssignWorkersModal.jsx` `worker.reliability.toFixed(1)` with no null guard — fixed 2026-10-01 (`?? 5.0`, matching the rest of the code); the reliability sort in the same list now treats a missing score as 5.0 too, so the order matches what's displayed. No live worker had a null score at the time, so it was latent.

### Security (ranked)
1. ❌ **Worker actions trust the client `workerId`** (§5.2) — the main remaining gap.
2. ⚠️ **Hardcoded anon key** in 4 files (§4).
3. ✅ Anon writes to `pay_rates`, `settings`, `travel_tiers`, `bonuses`, `events`, `assignments`, `workers`, `location_pay_rates` and all logistics tables require `is_admin()`. `workers.pin_hash` not readable; `rank`/`reliability` only admin-writable.
4. ✅ Cron endpoints (`send-shift-reminders`, `send-availability-notifications`) require `x-cron-secret`. ❓ `api/calendar-event.js` has no auth check — it only builds `.ics` files for calendar links, so likely fine, but it also carries a hardcoded key.
5. ✅ **Database backups** — nightly encrypted `pg_dump` via GitHub Actions (`backup-database.yml`, 90-day retention; see `docs/BACKUPS.md`). First run succeeded 2026-10-03. A test decrypt with the saved passphrase is still worth doing once.
6. ✅ `.env` gitignored; holds only the browser Google Places key (confirm it's referrer-restricted in Google Cloud).

---

## 9. Environment Variables (names only)

- **Browser (Vite)**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_PLACES_KEY`.
- **Vercel functions**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `GOOGLE_MAPS_API_KEY`, `CRON_SECRET`, `INTERNAL_API_SECRET`, `VERCEL_ENV`.
- **GitHub Actions secrets**: `CRON_SECRET`, `SUPABASE_ANON_KEY` (legacy workflow).

---

## 10. CI & Deployment

- `.github/workflows/run-tests.yml` — `npm test` on pushes to `main` / `development/claude-code` and on PRs.
- `send-shift-reminders.yml` (hourly :10; also sends crew route emails from 4 PM the day before), `send-availability-notifications.yml` (hourly :15), `event-reminders.yml` (manual only).
- Deploy: push to `main` → Vercel. After a deploy, gigstaffpro.com can take ~20 s to serve the new bundle.

---

## 11. Highest-Priority Stabilization Areas (as of 2026-10-01)

1. **Real worker sessions** — verify worker identity server-side in `api/worker-actions.js`; finish moving workers off legacy PINs.
2. **Remove the hardcoded Supabase URL/anon key** from the 4 remaining files; consider rotating the key.
3. **Widen the safety net** — add a linter and a few browser smoke tests (e.g. Playwright) for the main flows; current tests cover logic, not the UI.
