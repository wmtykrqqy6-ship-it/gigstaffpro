-- Closes the one table missed by 20260824120000_restrict_admin_only_table_writes.sql:
-- public.location_pay_rates had the same "Enable all for X" USING (true)
-- policy as pay_rates/settings/travel_tiers/bonuses, meaning the anon key
-- (embedded in the site's JS bundle) could INSERT/UPDATE/DELETE per-location
-- pay overrides with no authentication. Confirmed live on 2026-09-01 with a
-- disposable probe row, immediately deleted after confirming.
--
-- Same treatment as the other pay-related tables: reads stay open (worker
-- pay estimates need to see location overrides), writes become admin-only
-- via the existing public.is_admin() helper. All writes to this table
-- already originate from SettingsView.jsx's LocationPayRates component,
-- which is admin-UI-only, so this changes no legitimate behavior.

BEGIN;

DROP POLICY IF EXISTS "Enable all for location_pay_rates" ON public.location_pay_rates;
CREATE POLICY "location_pay_rates_public_read" ON public.location_pay_rates
  FOR SELECT USING (true);
CREATE POLICY "location_pay_rates_admin_write" ON public.location_pay_rates
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMIT;
