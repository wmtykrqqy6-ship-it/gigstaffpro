-- Secure public.admin_users: remove anon/authenticated access to a table
-- that stores password_hash.
--
-- DRAFT ONLY. Not applied by Claude Code. Requires explicit review/approval
-- and a confirmed backup before this is run against any environment.
--
-- ---------------------------------------------------------------------------
-- Confirmed exposure (from local backup gigstaffpro-db-backup-2026-08-09.sql)
-- ---------------------------------------------------------------------------
-- public.admin_users has RLS enabled, but the only policy on it is:
--   CREATE POLICY "Enable all for admin_users" ON public.admin_users
--     USING (true);
-- This policy has no FOR clause (defaults to ALL commands: SELECT/INSERT/
-- UPDATE/DELETE) and no TO clause (defaults to PUBLIC, i.e. every role).
-- Combined with:
--   GRANT ALL ON TABLE public.admin_users TO anon;
--   GRANT ALL ON TABLE public.admin_users TO authenticated;
-- this means the anon role (unauthenticated callers using the public anon
-- key) can SELECT every column -- including password_hash -- and can
-- INSERT/UPDATE/DELETE rows in this table directly via PostgREST.
--
-- ---------------------------------------------------------------------------
-- Why this is safe to remove
-- ---------------------------------------------------------------------------
-- Application review (src/App.jsx, src/components/LoginScreen.jsx,
-- api/_lib/verifyAdmin.js) shows no code path that queries admin_users
-- directly through the anon or authenticated Postgres role:
--   * The admin login/session flow calls the SECURITY DEFINER RPC
--     public.get_authenticated_admin_profile(), which explicitly selects
--     only (id, username) and runs with the privileges of its owner
--     (postgres), not the caller -- so it does not require anon/authenticated
--     to hold table-level grants on admin_users.
--   * The only server-side direct table query against admin_users is in
--     api/_lib/verifyAdmin.js, and it uses a Supabase client constructed
--     with SUPABASE_SERVICE_ROLE_KEY (service_role), not the anon key.
-- Removing anon/authenticated access therefore preserves current behavior.
--
-- ---------------------------------------------------------------------------
-- Scope
-- ---------------------------------------------------------------------------
-- No columns are added, dropped, or altered. No data is read, modified, or
-- deleted. No other tables are touched. RLS remains ENABLED on admin_users
-- (it already was). service_role table privileges are reset to SELECT only
-- below, matching the single read-only query in api/_lib/verifyAdmin.js;
-- service_role bypasses RLS regardless of table grants.

BEGIN;

-- Drop the overly-permissive policy. It applied to ALL commands, targeted
-- PUBLIC (every role), and had no restricting USING/CHECK condition beyond
-- literal `true`. No replacement policy is added: no current caller other
-- than service_role (which bypasses RLS entirely) needs direct row access
-- to this table.
DROP POLICY IF EXISTS "Enable all for admin_users" ON public.admin_users;

-- Remove direct table privileges from anon (unauthenticated/public callers).
REVOKE ALL ON TABLE public.admin_users FROM anon;

-- Remove direct table privileges from authenticated (logged-in Supabase Auth
-- users, e.g. workers). Admin identity is resolved server-side via the
-- get_authenticated_admin_profile() RPC and admin_auth_links, not by
-- querying this table directly from an authenticated client.
REVOKE ALL ON TABLE public.admin_users FROM authenticated;

-- Defense in depth: the backup's ACL dump shows no explicit `TO PUBLIC`
-- grant on this table today, so this is expected to be a no-op. Included
-- so no implicit PUBLIC grant (present or future) is silently missed.
REVOKE ALL ON TABLE public.admin_users FROM PUBLIC;

-- Reduce service_role to least privilege. service_role already bypasses RLS,
-- and the only code path that touches this table via service_role
-- (api/_lib/verifyAdmin.js) performs a SELECT only -- it never inserts,
-- updates, or deletes admin_users rows. Revoke the prior ALL grant and
-- grant back SELECT only, rather than leaving unused write privileges in
-- place.
REVOKE ALL ON TABLE public.admin_users FROM service_role;
GRANT SELECT ON TABLE public.admin_users TO service_role;

COMMIT;
