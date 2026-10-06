# CLAUDE.md — GigStaffPro

Persistent instructions for Claude Code when working in this repository. Read this before making any change, and re-check it if a request seems to conflict with it.

## 1. Project Overview

GigStaffPro is a staffing and scheduling application initially built for Vegas on Wheels and intended for casino-party and other gig-workforce businesses.

It manages:
- Workers and events
- Shift assignments and worker applications
- Pay calculation (hourly rate + travel tiers + bonuses)
- Worker/admin communication (invites, reminders, notifications)
- Delivery logistics: Goodshuffle pull-sheet import, truck dispatch, load sheets, crew routes, returns (see `docs/LOGISTICS.md`)

Two user roles exist:
- **Admin** — staff/event management, payments, settings
- **Worker** — self-service portal: apply to events, view schedule/history, check in

Stack:
- Frontend: React 18 + Vite 5 + Tailwind CSS
- Backend: Supabase Postgres is the primary database; Supabase Storage may also be available through the platform. Admins use Supabase Auth; workers are mid-migration from a legacy phone + PIN login to Supabase Auth (see §3).
- Serverless: Vercel functions under `api/` for email (Resend), Google Maps distance lookups, calendar (`.ics`) generation, worker auth/actions, and scheduled reminder jobs
- Automation: GitHub Actions cron workflows that trigger those functions on a schedule, plus a CI workflow that runs the test suite
- Tests: Vitest (`npm test`)

## 2. Source-of-Truth Documents

- `docs/CODEBASE_AUDIT.md` — the current repository audit: architecture, known bugs, security findings, duplication, and stabilization priorities. Treat it as authoritative background.
- Consult the audit before touching auth, payments, or Supabase access code specifically — those are the areas it flags as highest-risk.
- `docs/PAY_RULES.md` — how worker pay is calculated, including the minimum-paid-hours rule.
- `docs/MEETING_POINT.md` — event meeting-point pin (who can set it) and the GPS check-in rules.
- `docs/LOGISTICS.md` — the Delivery Logistics feature: business rules (truck capacity, crew roles, staffing per table), data model, and decisions made with Dylan.
- Additional files will be added under `docs/` over time for product requirements and business rules — check that directory for relevant context before large changes.
- This file governs *how* to work in the repo; the audit governs *what state the code is currently in*.
- If the two ever seem to disagree on a fact about the code, re-verify against the actual source rather than trusting either document blindly — both can go stale.

## 3. Current Architecture Summary

- `src/App.jsx` is the root component and owns most application state, loading and mutating data via direct Supabase calls (no service/repository layer).
- `src/supabaseClient.js` holds the single Supabase client, using the anon key.
- Authentication:
  - Admin: Supabase Auth (email/password) + `get_authenticated_admin_profile()`. Backend admin routes verify the bearer token via `api/_lib/verifyAdmin.js`; RLS write policies use `public.is_admin()`.
  - Worker: migrated workers use Supabase Auth (phone-derived email + 6-digit PIN); legacy workers use phone + 4-digit PIN, checked server-side in `api/worker-pin-login.js` (salted PBKDF2). Worker writes go through `api/worker-actions.js` with the service role and currently trust the client-supplied worker id — a known gap (see the audit).
- Schema and RLS are tracked as SQL migrations in `supabase/migrations/`, applied by Dylan in the Supabase SQL editor (see §6).
- `api/*.js` are independent Vercel functions (shared helpers in `api/_lib/`). Server code that writes data uses `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from the environment. Four files still hardcode the Supabase URL/anon key as a fallback: `src/supabaseClient.js`, `api/calendar-event.js`, `api/send-availability-notifications.js`, `api/send-shift-reminders.js`.
- That hardcoded-key issue is a known finding — do not silently "fix" it as a side effect of unrelated work; treat it as its own scoped task (see §7).
- Tests: Vitest, colocated `*.test.js` files under `src/` and `api/`. CI (`.github/workflows/run-tests.yml`) runs them on every push to `main`/`development/claude-code` and on PRs. No linter is configured.

## 4. Development Safety Rules

- Inspect the relevant files before editing — read the current implementation, don't assume its behavior from the filename or memory of similar code elsewhere.
- Make small, reviewable changes scoped tightly to the actual request.
- Do not rewrite or refactor working systems unless that refactor is the explicit task at hand.
- Do not make unrelated formatting, whitespace, or design changes while doing something else, even if you notice something you'd improve.
- Do not install or upgrade packages without first explaining why and getting explicit approval.
- Do not run destructive shell or Git commands unless explicitly instructed for that specific action in that moment. This includes: `rm -rf`, `git reset --hard`, force-push, and branch deletion.
- Never expose, print, commit, or hardcode passwords, service-role keys, API secrets, tokens, or private user data — in code, comments, chat output, or logs.
- The Supabase anon key is public client configuration by nature (it's meant to be bundled into the browser).
- Even so, it must always be sourced from environment variables, never hardcoded as a fallback literal in source files.

## 5. Git and Deployment Rules

- The production site is deployed through Vercel from the `main` branch.
- Normal development happens on `development/claude-code` or a dedicated feature branch.
- Never commit directly to `main`.
- Do not deploy, merge, or push to `main` unless explicitly asked to do that in the current request.
- Do not modify any production or Vercel/Supabase project settings unless explicitly asked.
- Do not commit or push changes unless explicitly asked, even when working on a feature branch.
- A prior approval for one git action does not extend to later, similar-looking actions — confirm scope each time for anything that touches shared or remote state.
- When Dylan asks to "commit and deploy": commit on `development/claude-code`, push it, fast-forward `main` to it and push `main`, then switch back to `development/claude-code`. Confirm the Vercel status for the commit and that gigstaffpro.com serves the new bundle (it can lag ~20 seconds) before reporting it live.

## 6. Supabase and Database Rules

- **Claude never runs migrations, schema changes, data writes, or seed operations against the live database.** Schema changes are written as migration files in `supabase/migrations/`, explained, and run by Dylan in the Supabase SQL editor after he approves each one.
- **Backups:** a GitHub Actions workflow takes a nightly encrypted `pg_dump` (90-day retention; first run 2026-10-03). Setup and restore: `docs/BACKUPS.md`. Before a risky schema change, Dylan can also run it on demand (Actions → Backup Database → Run workflow).
- Do not connect to or query the live database as part of routine code work. Narrow read-only checks with the public anon key (e.g. confirming a migration Dylan just ran, or reading a setting the code depends on) are fine when they serve the current task.
- Do not weaken, disable, or add bypasses around Row Level Security under any circumstances.
- If RLS appears to be blocking something during investigation, flag it and ask — do not work around it.
- Any future schema or RLS change should be written as a reviewable migration file, not applied ad hoc.
- Explain any proposed schema/RLS change up front (what it does, why, what it affects) before it is ever applied.
- Never apply a schema or data change silently or directly against production.

## 7. Code-Change Workflow

For anything beyond a trivial one-line fix:
1. Explain the plan first: what will change, which files are affected, what the risks are, and how the change will be verified.
2. Wait for confirmation before editing anything ambiguous, risky, or touching auth, payments, or Supabase access.
3. Make the change, keeping it scoped to exactly what was discussed.
4. Flag — don't silently fix — any unrelated issues noticed along the way.
5. After changes, show the exact files changed and summarize the behavioral effect in plain terms.
6. Run whatever safe checks are appropriate (see §8) and report any remaining risk or recommended follow-up.

## 8. Testing and Verification Expectations

- A Vitest suite exists (`npm test`) and runs in CI; there is no linter and no browser/E2E testing.
- Do not claim something is "tested" without an actual check having been run, and say what kind of check it was (unit test, build, server-side render, live read-only check).
- Running `npm test` and `npm run build` locally is expected after code changes (both are read-only). Do not run installs or anything that changes `node_modules` without approval.
- Add or update tests for logic you change; keep logic in testable modules (e.g. `src/utils/`, `src/utils/logistics/`, `api/_lib/`).
- When real verification isn't possible or authorized — no harness, no safe way to exercise a live-data path — say so plainly rather than implying the change was validated.
- Where dynamic verification isn't available or allowed, prefer static review instead:
  - Read the diff carefully
  - Trace call sites of anything changed
  - Check null-safety and edge cases
  - Compare against existing usage patterns in the same file/module

## 9. Documentation Update Rules

- Keep `docs/CODEBASE_AUDIT.md` current — update it when a change materially affects its findings.
- Examples that should trigger an update: a listed bug gets fixed, a security issue gets resolved, duplication gets removed.
- Future product requirements and business rules will be added under `docs/` — place new documentation there rather than scattering it in code comments or ad hoc files.
- Update the relevant documentation whenever a meaningful feature ships or an architecture decision changes, as part of that same change rather than as a separate afterthought task.

## 10. Current Stabilization Priorities

From `docs/CODEBASE_AUDIT.md` (re-verified 2026-10-01), in priority order:

1. **Real worker sessions** — in progress, see `docs/WORKER_AUTH.md` (step 1 of 4 done 2026-10-05: tokens checked when sent; legacy PIN workers still trusted until enforcement).
2. **Remove the hardcoded Supabase URL/anon key** from the 4 remaining files (and consider rotating the key).
3. **Widen the safety net** — add a linter and a few browser smoke tests for the main flows.

Previously listed items now resolved: nightly encrypted database backups (`docs/BACKUPS.md`), core-table RLS write lockdown and `pin_hash` read revocation, the `Navigation.jsx`, `PaymentCalculatorModal.jsx` and `AssignWorkersModal.jsx` (`reliability.toFixed()`) crashes, legacy PIN hashing (now server-side salted PBKDF2), `getPayRateKey` / event-modal / email-template duplication, and the Vitest + CI safety net.

Default to working on these before adding new features, unless explicitly directed otherwise.
