-- Restrict write access on assignments and workers to admins; leave
-- anon/authenticated read access untouched. Security lockdown, phase 4 --
-- the last of the four tables that were fully open (phase 1: pay_rates/
-- settings/travel_tiers/bonuses; phase 2: workers.pin_hash column; phase 3:
-- events).
--
-- ---------------------------------------------------------------------------
-- Confirmed exposure
-- ---------------------------------------------------------------------------
-- public.assignments and public.workers each have the same "Enable all"
-- USING (true) RLS policy and GRANT ALL ... TO anon documented in
-- 20260824120000_restrict_admin_only_table_writes.sql. Anyone holding the
-- public anon key can currently INSERT/UPDATE/DELETE any assignment or
-- worker row -- rewrite pay amounts, fabricate confirmed shifts, edit any
-- worker's profile or reliability score, delete assignments outright --
-- with no authentication at all.
--
-- This is the harder half of the lockdown: unlike events/pay_rates/etc.,
-- these two tables DO have legitimate non-admin writers -- workers apply
-- for shifts, cancel, switch positions, join/leave standby, and edit their
-- own profile, all as direct writes from the browser. That's what made
-- this migration unsafe to ship on its own until now.
--
-- ---------------------------------------------------------------------------
-- Why this is safe now
-- ---------------------------------------------------------------------------
-- Every worker-initiated write has been moved to api/worker-actions.js,
-- which uses the Supabase service-role key (bypasses RLS entirely) instead
-- of the anon key:
--   - apply (open position or standby)      - switchPosition
--   - cancelAssignment                       - leaveStandby
--   - updateProfile (contact info/photo)     - signup (new worker account)
-- api/invite-respond.js and api/promote-standby.js (the one-click email
-- accept link and the standby auto-promotion trigger -- both run with no
-- user session at all) were also switched from the anon key to service-role
-- as part of this same change; they write to assignments and previously
-- had no way to keep doing so once this migration landed.
--
-- Every remaining direct anon-key write to these two tables was audited
-- (grep across src/ for `.from('assignments')` / `.from('workers')`,
-- cross-checked against App.jsx's renderView(), which returns a completely
-- separate component tree for userRole === 'worker' before ever reaching
-- the admin views) and confirmed reachable only from admin-only screens:
-- StaffView, ApplicationsView, PaymentsView, ReportsView, and the modals
-- opened exclusively from them (AssignWorkersModal, EditWorkerModal,
-- InviteWorkersModal, PaymentCalculatorModal, SetPinModal). Those keep
-- working unchanged since they run under an authenticated admin session
-- that is_admin() recognizes.
--
-- One latent bug found and fixed during this audit: App.jsx's loadWorkers()
-- self-heals old-format worker.skills data by writing corrected values back
-- to *other* workers' rows, and legacy-login workers also call this
-- function to load their own roster view. That write is now gated to
-- userRole === 'admin' (skipped, not attempted, for worker sessions) --
-- it was a no-op today (no old-format skill data exists), but would have
-- silently broken a legacy worker's entire roster view the next time it
-- fired, since the failed write would have thrown inside loadWorkers()'s
-- single try/catch before setWorkers() ever ran.
--
-- ---------------------------------------------------------------------------
-- Scope
-- ---------------------------------------------------------------------------
-- No columns added, dropped, or altered. No data read, modified, or
-- deleted. SELECT access is unchanged for both tables (including the
-- existing pin_hash column exclusion on workers, which is a separate
-- column-level grant untouched by this migration). Only INSERT/UPDATE/
-- DELETE on assignments and workers now requires is_admin().

BEGIN;

DROP POLICY IF EXISTS "Enable all for assignments" ON public.assignments;
CREATE POLICY "assignments_public_read" ON public.assignments
  FOR SELECT USING (true);
CREATE POLICY "assignments_admin_write" ON public.assignments
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Enable all for workers" ON public.workers;
CREATE POLICY "workers_public_read" ON public.workers
  FOR SELECT USING (true);
CREATE POLICY "workers_admin_write" ON public.workers
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMIT;
