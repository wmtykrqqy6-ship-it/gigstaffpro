-- Stop workers.pin_hash from being readable by anon/authenticated.
--
-- ---------------------------------------------------------------------------
-- Confirmed exposure
-- ---------------------------------------------------------------------------
-- public.workers has the same "Enable all for workers" USING (true) RLS
-- policy documented in 20260824120000_restrict_admin_only_table_writes.sql,
-- plus GRANT ALL ... TO anon. That migration intentionally left workers'
-- row-level access untouched (legacy PIN-login workers have no real
-- Postgres identity yet, so a blanket table lockdown would break their
-- login) -- but one specific column on that table is worse than a generic
-- PII leak: pin_hash is a legacy worker's login credential. It's an
-- unsalted single round of SHA-256 over a short numeric PIN
-- (src/utils/authHelpers.js), which is trivial to brute-force offline once
-- read. Anyone holding the public anon key could dump every legacy worker's
-- pin_hash and crack their PIN in well under a second, then log in as them.
--
-- ---------------------------------------------------------------------------
-- Why this is safe
-- ---------------------------------------------------------------------------
-- api/worker-pin-login.js now performs the legacy PIN comparison
-- server-side and never returns pin_hash to the caller; LoginScreen.jsx no
-- longer reads workers.pin_hash from the client at all (it previously
-- fetched the full row and compared hashes in the browser). The only other
-- client-side touch of this column is a WRITE (SetPinModal.jsx setting a
-- new PIN, LoginScreen.jsx's signup flow setting an initial PIN) -- column-
-- level SELECT restrictions have no effect on INSERT/UPDATE, so both keep
-- working unchanged. service_role (used by every other admin API endpoint)
-- already holds a separate, table-level "GRANT ALL" that this migration
-- does not touch, so nothing server-side loses access either.
--
-- ---------------------------------------------------------------------------
-- Scope
-- ---------------------------------------------------------------------------
-- Only column-level SELECT privileges change, and only for the anon and
-- authenticated roles, and only on this one column. No RLS policy changes,
-- no other table changes, no data modified. Every other column on workers
-- remains exactly as readable as it was before.

BEGIN;

REVOKE SELECT ON TABLE public.workers FROM anon, authenticated;

GRANT SELECT (
  id, name, phone, email, skills, rank, reliability, total_gigs, no_shows,
  last_worked, notes, certifications, preferred_contact, earnings,
  created_at, updated_at, is_active, address, shirt_size, photo_url,
  is_host, role, home_warehouse_id, home_location_id
) ON TABLE public.workers TO anon, authenticated;

COMMIT;
