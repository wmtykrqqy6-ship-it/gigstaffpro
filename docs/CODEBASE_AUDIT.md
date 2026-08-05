# GigStaffPro — Codebase Audit

**Date:** 2026-07-20
**Branch audited:** `development/claude-code` (confirmed current branch, up to date with `origin/development/claude-code`, working tree clean at time of audit)
**Method:** Read-only inspection — no files were created, edited, or executed as part of the analysis itself. No database connections, builds, tests, or deployments were performed.

---

## 1. Technology Stack

- **Frontend**: React 18 + Vite 5, Tailwind CSS 3 (+ PostCSS/autoprefixer), `lucide-react` for icons. Plain JavaScript (`.jsx`/`.js`) — `@types/react*` are present but there is no TypeScript actually in use.
- **Backend/data**: Supabase (Postgres + Auth + Storage platform), accessed via `@supabase/supabase-js` directly from the React client (no custom backend layer for most operations).
- **Serverless functions**: 8 Vercel Node functions under `api/` (email sending via Resend, Google Maps distance lookups, calendar `.ics` generation, invite accept/decline, scheduled reminder jobs).
- **Automation**: 3 GitHub Actions cron workflows that hit those Vercel endpoints (and one Supabase Edge Function URL — see §7).
- **Deployment target**: Vercel (empty `vercel.json`, so it's using framework auto-detection for the Vite build + `api/` functions).
- No test framework, no linter/formatter config anywhere in the repo.

---

## 2. Folder/File Structure

```
/                     package.json, vite.config.js, tailwind/postcss config, index.html, vercel.json
/api/                 8 Vercel serverless functions (email, distance, calendar, invite-respond, 3 reminder crons)
/src/
  App.jsx             ~1360-line root component — owns nearly all state and Supabase calls
  supabaseClient.js    single Supabase client instance
  constants.js         business-rule constants (pay, ranks, statuses, messages)
  main.jsx, index.css
  components/          LoginScreen, Header, Navigation, NotificationsModal, AddressAutocomplete, AvailableEventsSection
    modals/            10 modal components (Add/Edit Worker & Event, Assign, Bulk/Invite Workers, Payment Calculator, Post-Event Report, Set PIN)
    views/             11 view components (Dashboard, Staff, Events, Schedule, Applications, Reports, Payments, Settings, WorkerPortal, Profile, History)
  utils/               authHelpers (PIN hashing), dateHelpers, hostLabelHelper, positionHelpers
/supabase/             config.toml only — no tracked migrations, no seed files, no edge functions
/database-backup/      exists in the working tree, empty, not gitignored (currently harmless but a footgun if a real backup ever lands there)
/dist/                 build output present locally, correctly untracked by git
```

60 files tracked in git total; 29 `.jsx` + 18 `.js` app files.

---

## 3. Start & Build

- `npm run dev` → `vite` dev server; `npm run build` → `vite build`; `npm run preview` → `vite preview`. That's the entire script surface — no `test`, `lint`, or `typecheck` script exists.
- Entry point: `index.html` → `src/main.jsx` → `App.jsx`.
- `vercel.json` is an empty `{}` — Vercel deploy relies entirely on auto-detecting Vite + the `api/` folder convention.

---

## 4. Supabase Integration

- Single client (`src/supabaseClient.js`) created with the anon key, used directly from nearly every component — there is no service layer/repository abstraction.
- **Concerning pattern**: the real project URL and a live-looking anon key are hardcoded as fallback literals in source (not just referenced via env var) — see §8.
- `supabase/config.toml` (local CLI config) is tracked, but **no SQL migrations, seed files, or RLS policy definitions exist anywhere in the repo**. The database schema and its security rules are entirely unmanaged in version control — the schema, constraints, and RLS policies cannot currently be reconstructed or reviewed from this codebase alone.
- `supabase/.temp/*` local CLI cache files are present on disk (untracked, fine).

---

## 5. Authentication & Roles

Admin authentication was migrated to Supabase Auth in Phase C (development branch only — see Production note below). Worker authentication remains a separate, only-partially-migrated system. The two are documented independently below.

### 5.1 Admin login (current, post-Phase C)

- Supabase Auth email/password is the **only** admin login path (`LoginScreen.jsx handleAdminLogin`). A bare, non-email username (e.g. `admin`) is rejected before any Supabase call is made.
- The former client-side login — querying `admin_users` and comparing an unsalted SHA-256 `password_hash` in the browser — has been removed entirely. `admin_users.password_hash` is no longer read or compared anywhere in the frontend.
- A successful login requires, in order: `supabase.auth.signInWithPassword`, then a successful `get_authenticated_admin_profile()` RPC call resolving a real admin profile. Dashboard access (`isAuthenticated`/`userRole`) is granted only after both succeed; a sign-in that succeeds but fails profile resolution is signed back out immediately.

### 5.2 Backend admin authorization

- Protected admin routes verify the caller through `api/_lib/verifyAdmin.js` (`verifyAdminRequest`): extracts the Bearer token, revalidates it against the Supabase Auth server (`supabaseAdmin.auth.getUser(token)` — not the local/cached `getSession()`), then resolves the Supabase Auth user through `admin_auth_links` to a linked `admin_users` record (explicit column allow-list — `id, username` only, never `password_hash`).
- This bearer-token verification currently gates `api/admin-set-worker-pin.js`. **It does not gate every admin-facing endpoint** — see Open Items below.

### 5.3 Session restoration

- `App.jsx checkSession()` restores admin access only through a real Supabase session whose `get_authenticated_admin_profile()` call succeeds.
- `sessionStorage` alone can no longer restore admin access. A stale `sessionStorage` admin marker found with no live Supabase session is detected and cleared, not trusted.

### 5.4 Logout and session expiration

- Normal admin logout (`handleLogout`) signs out of Supabase and clears local authentication and application state.
- A separate, centralized handler (`handleAdminSessionExpired`) fires when a protected action finds no session/token, or the backend returns HTTP 401. It performs the same cleanup, additionally resets the Set PIN modal state, and returns the admin to the login screen showing exactly: `Your admin session has expired. Please log in again.`
- HTTP 403, HTTP 500, validation failures, and network failures do **not** trigger this forced-logout flow — they surface a generic, non-specific in-modal error instead, without forcing the admin out of the dashboard.

### 5.5 Worker authentication (unchanged by Phase C — documented for contrast)

- Workers are migrated individually, not all at once. Migrated workers authenticate via Supabase Auth using a synthetic email derived from their phone number, plus a permanent 6-digit PIN (`worker_auth_links` table).
- Non-migrated workers still use the original legacy flow during the pilot period: phone number + 4-digit PIN, checked via unsalted SHA-256 against `workers.pin_hash`, compared client-side against a direct anon-key `SELECT` from `workers`.
- This legacy worker flow is a separate system from the removed legacy admin login and was intentionally left untouched — Phase C was scoped to admin authentication only.
- A `rank` field (1–5) on workers drives progressive event-visibility windows (`RANK_ACCESS_DAYS`) and remains writable directly from the admin client with no visible server-side authorization gate — unaffected by Phase C.

### 5.6 Open items (not addressed by Phase C)

- `api/send-email.js` has no `verifyAdminRequest` (or any) bearer-token check, despite being called only from admin-only UI (`ApplicationsView.jsx`, `BulkInviteModal.jsx`, `InviteWorkersModal.jsx`).
- Most admin dashboard writes (workers, events, pay settings, etc.) go directly from the browser to Supabase via the anon key, with no backend authorization gate at all — their protection, if any, depends entirely on RLS.
- RLS policies are not tracked anywhere in this repo and have not received a dedicated verification pass (see §8, item 2).
- Preview and Production may currently point at the same Supabase project: `src/supabaseClient.js` hardcodes fallback literals for `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, so any Vercel environment missing one of those variables silently falls back to the same project used everywhere else in this repo (see §8, item 1).
- **Production has not received any Phase C change.** `main`/`origin/main` remain untouched by this work; the legacy admin login, the unverified `sessionStorage` admin restoration, and pre-Phase-C session behavior are all still live in Production until this branch is explicitly merged and deployed.

---

## 6. Major Features Present

- Admin dashboard, staff directory/CRUD, event creation/editing/archiving, scheduling & worker assignment, applications review (approve/reject signups), payments (hourly rate + travel-tier + Lake Geneva bonus + holiday multiplier calculator, with per-location rate overrides), post-event reports & reliability rating approval, settings (positions, pay rates, locations, travel tiers, bonuses, rank windows).
- Worker self-service portal: apply to events, profile, history, geofenced event check-in (client-reported GPS), PIN-based self-signup.
- Notification system (in-app, dismissible, per-user, admin vs. worker variants).
- Invite workflows (bulk invite new workers, invite existing workers to specific events) with one-click email accept/decline links, `.ics` calendar generation, and three separate cron-driven email jobs (shift reminders, availability notifications, invite reminders) via Resend.

---

## 7. Incomplete / Duplicated / Abandoned

- **`getPayRateKey`** — the position→pay-rate-key normalizer — is copy-pasted (not shared) across at least 5 locations (`App.jsx`, `AvailableEventsSection.jsx`, `InviteWorkersModal.jsx`, `WorkerPortalView.jsx`, twice inside `SettingsView.jsx`). Any rule change requires editing all of them in sync.
- **`AddEventModal.jsx` (651 lines) and `EditEventModal.jsx` (713 lines) are ~90% duplicated** — same autocomplete, position-count logic, distance auto-calc, and JSX layout. Prime candidate for a shared `EventForm`.
- **Time-conflict-check logic** duplicated ~5 times across `AvailableEventsSection.jsx` and `AssignWorkersModal.jsx`.
- **"Convert pending→standby when a position fills"** is independently re-implemented in `ApplicationsView.jsx` and `PaymentCalculatorModal.jsx`, with subtly different matching logic — risk of the two flows disagreeing about when a slot is "full."
- **Branded HTML email template** (colors, "Vegas on Wheels" header/footer) is hand-rolled and duplicated across `BulkInviteModal.jsx`, three places inside `InviteWorkersModal.jsx`, and each of the reminder cron functions in `api/` — six-plus copies instead of one shared template helper.
- **`api/calculate-distance.js` looks superseded/abandoned**: nothing in `src` calls it (the app calls `api/get-distance.js` instead), and its design — accepting a Google Maps API key from the POST body rather than reading it server-side — is itself a bad pattern that should just be deleted rather than left reachable.
- **Orphaned Supabase Edge Function reference**: `.github/workflows/event-reminders.yml` calls `.../functions/v1/send-event-reminders`, but there is no `supabase/functions/` directory in this repo — that function's source is not version-controlled here, so it's either deployed out-of-band or stale.
- `database-backup/` directory exists but is empty and (prior to this audit) untracked by `.gitignore` — vestigial.
- The "Coming Soon" fallback view in `App.jsx`'s `renderView()` appears currently unreachable (every nav item maps to a built view) — likely dead code from an earlier iteration.

---

## 8. Broken Imports, Errors, Security Concerns

### Confirmed active bugs

- **`src/components/Navigation.jsx:82,84,97,109`** — uses `MapPin` and `ChevronDown` JSX elements that are never imported (only 8 other `lucide-react` icons are imported at the top). This throws `ReferenceError` and crashes the nav bar the moment a second location/market is configured (`locations.length > 1`).
- **`src/components/modals/PaymentCalculatorModal.jsx:37-64`** — an early `return null` sits *before* three `useEffect` calls later in the function (lines 83, 104, 130). This is a Rules-of-Hooks violation: if `paymentTrackingEnabled` flips while the modal is mounted, React calls a different number of hooks between renders and crashes.
- **`src/components/modals/AssignWorkersModal.jsx:792`** — `worker.reliability.toFixed(1)` with no null-guard, inconsistent with the rest of the codebase which uses `?? 5.0`. Breaks the worker list for any worker with a null `reliability`.
- **`src/components/AvailableEventsSection.jsx`** — a no-op debug loop (~lines 136-139) and an empty `else {}` branch (~lines 323-324), both leftover dead code.

### Security concerns (ranked by severity)

1. **Hardcoded live Supabase project URL + anon key** appear as fallback literals directly in source across **6 files**: `src/supabaseClient.js`, `api/invite-respond.js`, `api/calendar-event.js`, `api/send-reminders.js`, `api/send-shift-reminders.js`, `api/send-availability-notifications.js`. These should be sourced exclusively from environment variables — the key is already committed to git history regardless of what `.env` currently holds, so it should be treated as already public and ideally rotated.
2. **No RLS policies are visible in the repo** (no migrations tracked at all). Post-Phase C, admin login no longer reads `admin_users.password_hash` client-side — the only read of `admin_users` is a backend, service-role query in `verifyAdminRequest` using an explicit safe-column allow-list (`id, username`, never `password_hash`). This risk remains fully live for **workers**: the legacy (non-migrated) worker login still directly `SELECT`s from `workers` with the anon key and reads `pin_hash` client-side to compare against a locally computed hash. Unless RLS on the live database explicitly blocks anon `SELECT` on that column (unverifiable from this repo), anyone holding the anon key (trivially extracted from the deployed JS bundle) could dump all worker PIN hashes directly via the Supabase REST API.
3. **Weak hashing**: unsalted SHA-256 for 4-digit worker PINs (`workers.pin_hash`, legacy/non-migrated workers only — migrated workers authenticate through Supabase Auth instead). A 4-digit PIN space (10,000 values) is trivially brute-forced offline if hashes are ever exposed, which risk #2 makes plausible. Admin passwords are no longer hashed or compared client-side as of Phase C — see §5.
4. **Client-side writes to sensitive fields with no server-side check**: `EditWorkerModal.jsx`/`AddWorkerModal.jsx` write `workers.rank` directly, and `ReportsView.jsx` writes `workers.reliability` directly — both fields drive access windows and trust signals elsewhere, so a modified/compromised client session could self-promote or fabricate ratings absent RLS/RPC enforcement.
5. **Unauthenticated public endpoints**: `api/send-shift-reminders.js`, `api/send-availability-notifications.js`, `api/invite-respond.js`, `api/calendar-event.js` have no shared-secret or auth-header check — anyone who discovers the URL can invoke them (partially mitigated by dedup logic, but there's no rate limiting or token gating on the trigger itself).
6. `.env` is correctly gitignored and **not** tracked in git — good practice already in place. It currently holds only a Google Places browser key (`VITE_GOOGLE_PLACES_KEY`), which is inherently public once bundled — worth confirming it's HTTP-referrer-restricted in Google Cloud Console, but that's outside what this repo can show.

---

## 9. Environment Variable References (names only, no values recorded)

- **Client/Vite** (must be prefixed `VITE_` to reach the browser bundle): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_PLACES_KEY`.
- **Server/Vercel functions**: `RESEND_API_KEY`, `GOOGLE_MAPS_API_KEY`.
- **GitHub Actions secret**: `SUPABASE_ANON_KEY`.
- **Supabase CLI config placeholders** (default template values, not confirmed in active use): `OPENAI_API_KEY`, `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN`, `SUPABASE_AUTH_EXTERNAL_APPLE_SECRET`, `S3_HOST`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`.

---

## 10. Tests / Scripts / CI / APIs / Deployment

- **Tests**: none — no test files, no test runner in `package.json`.
- **Lint/format**: none configured.
- **Scripts**: `dev`, `build`, `preview` only.
- **GitHub Actions** (3, all cron + `workflow_dispatch`):
  - `event-reminders.yml` (hourly, calls a Supabase Edge Function not present in this repo)
  - `send-shift-reminders.yml` (hourly, calls a Vercel endpoint)
  - `send-availability-notifications.yml` (hourly, calls a Vercel endpoint)
- **APIs**: 8 Vercel serverless functions under `api/` (documented in §6/§8).
- **Deployment**: Vercel, zero custom config (`vercel.json` is `{}`), relying on framework auto-detection.

---

## 11. Branch Confirmation

Confirmed: current branch is `development/claude-code`, up to date with `origin/development/claude-code`, working tree clean.

---

## 12. Five Highest-Priority Stabilization Areas

1. **Get Supabase credentials out of source and lock down data access.** Remove the hardcoded URL/key fallbacks from all 6 files, rotate the anon key, bring RLS policies and schema into version-controlled migrations, and verify the anon role cannot read `password_hash`/`pin_hash` or write `rank`/`reliability` directly.
2. **Fix the live crash bugs before anything else ships**: `Navigation.jsx`'s missing icon imports (breaks with 2+ locations), `PaymentCalculatorModal.jsx`'s hook-order violation, and the unguarded `reliability.toFixed()` call.
3. **Replace the remaining homegrown auth scheme.** Admin authentication now runs on Supabase Auth (Phase C — see §5), on the `development/claude-code` branch only. The legacy worker PIN scheme (unsalted SHA-256, non-migrated workers) still needs the same treatment: either complete the phone/PIN-to-Supabase-Auth migration for all workers, or move remaining legacy PINs to a salted hash behind a server-side RPC. Phase C also still needs to reach Production via merge/deploy.
4. **De-duplicate the highest-drift-risk logic** — `getPayRateKey` (5+ copies), the `AddEventModal`/`EditEventModal` pair, and the branded email template — before adding new features on top of them, since bugs fixed in one copy silently persist in the others.
5. **Stand up a minimal safety net**: no tests, no lint, no CI check on the build currently exist, so every change is unverified until a human manually clicks through the app. Even a smoke-test build step in CI plus basic lint would catch bugs like #2 automatically going forward.
