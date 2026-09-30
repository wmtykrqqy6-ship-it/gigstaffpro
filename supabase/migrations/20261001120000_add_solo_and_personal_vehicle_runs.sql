-- Delivery Logistics: solo truck runs and personal-vehicle deliveries.
-- Requires 20260928120000_add_logistics_dispatch.sql.
--
-- Confirmed with Dylan 2026-09-30: small events are sometimes delivered by
-- one person, on a truck or in their own car.
--
-- trucks.kind              'truck' (default) or 'personal'. One seeded
--                          "Personal vehicle" row holds what fits in a car;
--                          its capacities start at 0 and are entered on the
--                          Trucks tab (not guessed here).
-- daily_runs.is_personal   A personal-vehicle delivery: one person, their own
--                          car, checked against the Personal vehicle row.
--                          Several can exist on the same day.
-- daily_runs.solo          A truck run intentionally staffed by one person
--                          (silences the "only one team member" warning).
--
-- The one-run-per-truck-per-day rule now applies to real trucks only:
-- the (run_date, truck_id) unique constraint is replaced by a partial unique
-- index that skips personal-vehicle runs.
--
-- Additive except for that constraint swap; no existing rows change. Access
-- rules are unchanged (reads open, writes admin-only).

BEGIN;

ALTER TABLE public.trucks
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'truck'
  CONSTRAINT trucks_kind_check CHECK (kind IN ('truck', 'personal'));

INSERT INTO public.trucks
  (name, color, craps_capacity, craps_stretch, roulette_capacity, poker_capacity, blackjack_capacity, can_carry_archway, priority, kind)
VALUES
  ('Personal vehicle', '#9CA3AF', 0, 0, 0, 0, 0, false, 100, 'personal')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.daily_runs
  ADD COLUMN IF NOT EXISTS is_personal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS solo boolean NOT NULL DEFAULT false;

ALTER TABLE public.daily_runs DROP CONSTRAINT IF EXISTS daily_runs_run_date_truck_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS daily_runs_one_per_truck_per_day
  ON public.daily_runs (run_date, truck_id)
  WHERE NOT is_personal;

COMMENT ON COLUMN public.trucks.kind IS
  'truck = a company truck; personal = the "Personal vehicle" row (what fits in a crew member''s own car).';
COMMENT ON COLUMN public.daily_runs.is_personal IS
  'Delivery in a crew member''s own car (one person, several allowed per day).';
COMMENT ON COLUMN public.daily_runs.solo IS
  'Truck run intentionally staffed by one person.';

COMMIT;
