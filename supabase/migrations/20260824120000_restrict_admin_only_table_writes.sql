-- Restrict write access on admin-only tables; leave anon/authenticated
-- read access untouched.
--
-- ---------------------------------------------------------------------------
-- Confirmed exposure (from local backup gigstaffpro-db-backup-2026-08-09.sql
-- and live REST checks against the anon key on 2026-08-24)
-- ---------------------------------------------------------------------------
-- public.pay_rates, public.settings, public.travel_tiers and public.bonuses
-- each have RLS enabled, but the only policy on each is:
--   CREATE POLICY "Enable all for X" ON public.X USING (true);
-- This has no FOR clause (defaults to ALL: SELECT/INSERT/UPDATE/DELETE) and
-- no TO clause (defaults to PUBLIC). Combined with GRANT ALL ... TO anon,
-- this means anyone holding the public anon key (embedded in the site's JS
-- bundle) can INSERT/UPDATE/DELETE rows in these tables directly via
-- PostgREST -- e.g. rewrite hourly pay rates, travel tiers, location
-- bonuses, or app settings -- with no authentication at all.
--
-- public.event_reports has the same "Enable all" policy and anon/
-- authenticated grants, but grep across src/ and api/ found zero references
-- to a table literally named event_reports anywhere in the app (the app's
-- actual post-event report feature uses a different, separate table named
-- post_event_reports, which is not touched by this migration). event_reports
-- appears to be dead schema, so access to it is fully revoked, mirroring the
-- 20260809130000_secure_admin_users.sql precedent for unused tables.
--
-- ---------------------------------------------------------------------------
-- Why this is safe
-- ---------------------------------------------------------------------------
-- Application review (grep across src/ for `.from('pay_rates')`,
-- `.from('settings')`, `.from('travel_tiers')`, `.from('bonuses')`) shows
-- every INSERT/UPDATE/DELETE against these four tables originates from
-- src/components/views/SettingsView.jsx, which is only reachable from the
-- admin UI. Every read (SELECT) is left completely untouched -- this
-- migration does not change who can read these tables, only who can write
-- to them -- so worker-facing pay/travel/settings displays keep working
-- exactly as before.
--
-- Admin identity is established the same way api/_lib/verifyAdmin.js and
-- get_authenticated_admin_profile() already establish it: a row in
-- public.admin_auth_links matching auth.uid(). The is_admin() helper below
-- reuses that exact check inside a SECURITY DEFINER function so the policies
-- below don't need any new grants on admin_auth_links.
--
-- ---------------------------------------------------------------------------
-- Scope
-- ---------------------------------------------------------------------------
-- No columns are added, dropped, or altered. No data is read, modified, or
-- deleted. No table's SELECT access changes. Only INSERT/UPDATE/DELETE on
-- pay_rates, settings, travel_tiers and bonuses now require is_admin();
-- event_reports (unused) loses anon/authenticated access entirely, matching
-- how admin_users was handled previously.

BEGIN;

-- Reusable admin check, mirroring get_authenticated_admin_profile()'s join
-- of admin_auth_links to auth.uid(). SECURITY DEFINER so callers don't need
-- their own grant on admin_auth_links to evaluate this.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_auth_links
    WHERE auth_user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- pay_rates: reads stay open (worker pay estimates), writes admin-only.
DROP POLICY IF EXISTS "Enable all for pay_rates" ON public.pay_rates;
CREATE POLICY "pay_rates_public_read" ON public.pay_rates
  FOR SELECT USING (true);
CREATE POLICY "pay_rates_admin_write" ON public.pay_rates
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- settings: reads stay open (time_format, payment_tracking_enabled,
-- rank_access_days, positions, timezone are all read by worker-facing
-- views), writes admin-only.
DROP POLICY IF EXISTS "Enable all for settings" ON public.settings;
CREATE POLICY "settings_public_read" ON public.settings
  FOR SELECT USING (true);
CREATE POLICY "settings_admin_write" ON public.settings
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- travel_tiers: reads stay open (worker travel pay display), writes
-- admin-only.
DROP POLICY IF EXISTS "Enable all for travel_tiers" ON public.travel_tiers;
CREATE POLICY "travel_tiers_public_read" ON public.travel_tiers
  FOR SELECT USING (true);
CREATE POLICY "travel_tiers_admin_write" ON public.travel_tiers
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- bonuses: reads stay open (location bonus payout display), writes
-- admin-only.
DROP POLICY IF EXISTS "Enable all for bonuses" ON public.bonuses;
CREATE POLICY "bonuses_public_read" ON public.bonuses
  FOR SELECT USING (true);
CREATE POLICY "bonuses_admin_write" ON public.bonuses
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- event_reports: unused table (app uses post_event_reports instead).
-- Remove access entirely, same treatment as admin_users previously.
DROP POLICY IF EXISTS "Enable all for event_reports" ON public.event_reports;
REVOKE ALL ON TABLE public.event_reports FROM anon;
REVOKE ALL ON TABLE public.event_reports FROM authenticated;
REVOKE ALL ON TABLE public.event_reports FROM PUBLIC;

COMMIT;
