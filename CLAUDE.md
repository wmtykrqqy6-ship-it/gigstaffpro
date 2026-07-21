# CLAUDE.md — GigStaffPro

Persistent instructions for Claude Code when working in this repository. Read this before making any change, and re-check it if a request seems to conflict with it.

## 1. Project Overview

GigStaffPro is a staffing and scheduling application initially built for Vegas on Wheels and intended for casino-party and other gig-workforce businesses.

It manages:
- Workers and events
- Shift assignments and worker applications
- Pay calculation (hourly rate + travel tiers + bonuses)
- Worker/admin communication (invites, reminders, notifications)

Two user roles exist:
- **Admin** — staff/event management, payments, settings
- **Worker** — self-service portal: apply to events, view schedule/history, check in

Stack:
- Frontend: React 18 + Vite 5 + Tailwind CSS
- Backend: Supabase Postgres is the primary database; Supabase Storage may also be available through the platform. Authentication is currently a custom client-side system (see §3), not Supabase Auth.
- Serverless: Vercel functions under `api/` for email (Resend), Google Maps distance lookups, and calendar (`.ics`) generation
- Automation: GitHub Actions cron workflows that trigger those functions on a schedule

## 2. Source-of-Truth Documents

- `docs/CODEBASE_AUDIT.md` — the current repository audit: architecture, known bugs, security findings, duplication, and stabilization priorities. Treat it as authoritative background.
- Consult the audit before touching auth, payments, or Supabase access code specifically — those are the areas it flags as highest-risk.
- Additional files will be added under `docs/` over time for product requirements and business rules — check that directory for relevant context before large changes.
- This file governs *how* to work in the repo; the audit governs *what state the code is currently in*.
- If the two ever seem to disagree on a fact about the code, re-verify against the actual source rather than trusting either document blindly — both can go stale.

## 3. Current Architecture Summary

- `src/App.jsx` is the root component and owns most application state, loading and mutating data via direct Supabase calls (no service/repository layer).
- `src/supabaseClient.js` holds the single Supabase client, using the anon key.
- Two custom auth flows exist, checked against `admin_users`/`workers` tables client-side:
  - Admin: username/password
  - Worker: phone number + 4-digit PIN
- This is **not** Supabase Auth — see the audit for known weaknesses in this scheme.
- No RLS policies or SQL migrations are currently tracked in this repo; `supabase/` only contains local CLI config (`config.toml`).
- Schema and access-control state currently live only in the hosted Supabase project, not in git.
- `api/*.js` are independent Vercel functions. Several currently duplicate a hardcoded Supabase URL/anon key instead of reading environment variables.
- That hardcoded-key issue is a known finding — do not silently "fix" it as a side effect of unrelated work; treat it as its own scoped task (see §7).
- No automated tests, linter, or CI checks currently exist in this repo.

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

## 6. Supabase and Database Rules

- **No database-changing work is allowed right now**: the live Supabase database has not yet been fully backed up.
- Until a backup is confirmed complete and explicit approval is given, do not run: migrations, schema changes, data writes, or seed operations.
- Do not connect to or query the live database as part of routine code work.
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

- There is currently no test suite, linter, or CI pipeline in this repo.
- Do not assume one exists, and do not claim something is "tested" without an actual check having been run.
- Do not run builds, tests, linting, or installs unless explicitly asked to do so for that task.
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

From `docs/CODEBASE_AUDIT.md`, in priority order:

1. **Verify and secure Supabase data access and RLS** — confirm the anon role cannot read password/PIN hashes or write sensitive fields (rank, reliability) directly.
2. **Fix confirmed crash bugs** — `Navigation.jsx` missing `MapPin`/`ChevronDown` imports, `PaymentCalculatorModal.jsx` hook-order violation, unguarded `reliability.toFixed()` in `AssignWorkersModal.jsx`.
3. **Improve authentication security** — move off unsalted SHA-256 for admin passwords and worker PINs toward a proper server-side scheme.
4. **Reduce duplicated high-risk business logic** — `getPayRateKey` (5+ copies), the near-duplicate `AddEventModal`/`EditEventModal` pair, and the repeated email-template code.
5. **Add a minimal test, lint, and CI safety net** — there is currently no automated check of any kind before changes reach production.

Default to working on these before adding new features, unless explicitly directed otherwise.
