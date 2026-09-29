-- Delivery Logistics, phase 2: dispatch board (daily runs, loads,
-- allocations, stops). Requires 20260927120000_add_logistics_foundation.sql.
--
-- ---------------------------------------------------------------------------
-- Model
-- ---------------------------------------------------------------------------
-- daily_runs        One truck on one day, driven by a 2-person setup team.
--                   One run per truck per day.
-- run_loads         A trip out of the warehouse within a run (sequence 1 is
--                   the morning load; 2+ are reloads). Capacity is checked
--                   per load.
-- load_allocations  How many tables of each size class from an event ride
--                   on a load. Allocated by size class, not by
--                   event_equipment row: tables of one class are
--                   interchangeable, splitting an event across two trucks is
--                   just two rows, and re-importing a pull sheet (which
--                   replaces event_equipment rows) can't orphan a plan -- the
--                   dispatch board recomputes allocated vs. required and
--                   flags any difference.
-- run_stops         Ordered stops: deliver / work (team deals the party,
--                   truck parked there) / pickup / warehouse. Deliver and
--                   work stops belong to a load; pickups have no load (pickup
--                   gear never rides with delivery gear).
--
-- Delivered/returned per-item check-offs are phase 3 and not included here.
--
-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
-- Same as phase 1: RLS on, reads open (the phase 3 crew route in the worker
-- portal reads runs and stops), INSERT/UPDATE/DELETE require is_admin().
--
-- ---------------------------------------------------------------------------
-- Scope / safety
-- ---------------------------------------------------------------------------
-- Additive only: four new tables. No existing table, row or policy changes.
-- Deleting an event cascades to its allocations and stops; deleting a worker
-- clears them from a run's team rather than deleting the run.

BEGIN;

-- ---- daily_runs ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.daily_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date date NOT NULL,
  truck_id uuid NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  worker1_id uuid REFERENCES public.workers(id) ON DELETE SET NULL,
  worker2_id uuid REFERENCES public.workers(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_date, truck_id),
  CHECK (worker1_id IS NULL OR worker2_id IS NULL OR worker1_id <> worker2_id)
);

CREATE INDEX IF NOT EXISTS daily_runs_run_date_idx ON public.daily_runs (run_date);

-- ---- run_loads ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.run_loads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.daily_runs(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence >= 1),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, sequence) DEFERRABLE INITIALLY DEFERRED
);

-- ---- load_allocations ---------------------------------------------------

CREATE TABLE IF NOT EXISTS public.load_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id uuid NOT NULL REFERENCES public.run_loads(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  size_class text NOT NULL CHECK (size_class IN (
    'craps', 'roulette', 'poker', 'blackjack', 'chairs', 'archway', 'decor'
  )),
  quantity integer NOT NULL CHECK (quantity >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (load_id, event_id, size_class)
);

CREATE INDEX IF NOT EXISTS load_allocations_event_id_idx ON public.load_allocations (event_id);

-- ---- run_stops ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.run_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.daily_runs(id) ON DELETE CASCADE,
  load_id uuid REFERENCES public.run_loads(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  stop_type text NOT NULL CHECK (stop_type IN ('deliver', 'work', 'pickup', 'warehouse')),
  sequence integer NOT NULL,
  -- "HH:MM", same format as events.time / events.end_time.
  scheduled_start text,
  scheduled_end text,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'en_route', 'arrived', 'done', 'skipped')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (stop_type = 'warehouse' OR event_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS run_stops_run_id_idx ON public.run_stops (run_id);
CREATE INDEX IF NOT EXISTS run_stops_event_id_idx ON public.run_stops (event_id);

-- ---- RLS + grants (identical pattern for all four) ----------------------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['daily_runs', 'run_loads', 'load_allocations', 'run_stops'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_public_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (true)', t || '_public_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_write', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin())', t || '_admin_write', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon, authenticated', t);
    EXECUTE format('GRANT INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

COMMIT;
