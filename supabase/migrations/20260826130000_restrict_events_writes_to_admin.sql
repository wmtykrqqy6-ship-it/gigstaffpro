-- Restrict write access on events; leave anon/authenticated read access
-- untouched. Security lockdown, phase 3 (phase 1: admin-only tables
-- pay_rates/settings/travel_tiers/bonuses; phase 2: workers.pin_hash).
--
-- ---------------------------------------------------------------------------
-- Confirmed exposure
-- ---------------------------------------------------------------------------
-- public.events has the same "Enable all for events" USING (true) RLS
-- policy and GRANT ALL ... TO anon documented in
-- 20260824120000_restrict_admin_only_table_writes.sql. Anyone holding the
-- public anon key can currently INSERT/UPDATE/DELETE any event -- rewrite
-- venue/date/time/positions on a real event, or delete it outright -- with
-- no authentication at all. (This is also exactly what let a test I ran
-- earlier this session accidentally email 13 real workers about a
-- fabricated event -- the write path that made that possible is the one
-- this migration closes.)
--
-- ---------------------------------------------------------------------------
-- Why this is safe
-- ---------------------------------------------------------------------------
-- Application review (grep across src/ for `.from('events')`) shows every
-- INSERT/UPDATE/DELETE against events originates from admin-only surfaces:
-- App.jsx's admin handlers, AddEventModal, EditEventModal, AssignWorkersModal,
-- SettingsView, DashboardView, ReportsView. Zero worker-facing components
-- (WorkerPortalView, AvailableEventsSection, ProfileView, HistoryView,
-- LoginScreen) write to this table -- workers only ever read it to browse
-- and apply for shifts. This migration does not change who can read
-- events, only who can write to it, so nothing worker-facing changes.
--
-- Admin identity is established the same way the phase-1 migration's
-- is_admin() helper already establishes it (a row in admin_auth_links
-- matching auth.uid()); this migration reuses that existing function.
--
-- ---------------------------------------------------------------------------
-- Scope
-- ---------------------------------------------------------------------------
-- No columns added, dropped, or altered. No data read, modified, or
-- deleted. SELECT access is unchanged. Only INSERT/UPDATE/DELETE on events
-- now requires is_admin().

BEGIN;

DROP POLICY IF EXISTS "Enable all for events" ON public.events;
CREATE POLICY "events_public_read" ON public.events
  FOR SELECT USING (true);
CREATE POLICY "events_admin_write" ON public.events
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMIT;
