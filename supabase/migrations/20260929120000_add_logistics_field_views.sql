-- Delivery Logistics, phase 3: delivered / returned check-offs from the
-- crew route. Requires 20260928120000_add_logistics_dispatch.sql.
--
-- ---------------------------------------------------------------------------
-- Model
-- ---------------------------------------------------------------------------
-- route_item_checks  One row per item line checked off at a stop:
--                    'delivered' on a deliver stop, 'returned' on a pickup
--                    stop. quantity is what was actually counted (a short
--                    return is quantity < expected); expected is what the
--                    plan said should be there at the time of the check.
--                    item_key identifies the line by name (and parent table
--                    for accessories) rather than by event_equipment id, so a
--                    re-imported pull sheet doesn't orphan the checks.
--
-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
-- Reads open, like the other logistics tables. Direct writes admin-only
-- (the Returns tab lets an admin correct a count). Crew check-offs go
-- through api/worker-actions.js (actions routeCheck / routeStopStatus) with
-- the service role, which verifies the worker is on that stop's run and
-- that it's the run's day -- the same trust model as the existing checkIn
-- action (see that file's header).
--
-- ---------------------------------------------------------------------------
-- Scope / safety
-- ---------------------------------------------------------------------------
-- Additive only: one new table.

BEGIN;

CREATE TABLE IF NOT EXISTS public.route_item_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id uuid NOT NULL REFERENCES public.run_stops(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  item_name text NOT NULL,
  parent_name text,
  check_type text NOT NULL CHECK (check_type IN ('delivered', 'returned')),
  quantity integer NOT NULL CHECK (quantity >= 0),
  expected integer NOT NULL DEFAULT 0 CHECK (expected >= 0),
  checked_by_worker_id uuid REFERENCES public.workers(id) ON DELETE SET NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stop_id, item_key, check_type)
);

CREATE INDEX IF NOT EXISTS route_item_checks_stop_id_idx ON public.route_item_checks (stop_id);

ALTER TABLE public.route_item_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "route_item_checks_public_read" ON public.route_item_checks;
CREATE POLICY "route_item_checks_public_read" ON public.route_item_checks
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "route_item_checks_admin_write" ON public.route_item_checks;
CREATE POLICY "route_item_checks_admin_write" ON public.route_item_checks
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON TABLE public.route_item_checks TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.route_item_checks TO authenticated;
GRANT ALL ON TABLE public.route_item_checks TO service_role;

COMMIT;
