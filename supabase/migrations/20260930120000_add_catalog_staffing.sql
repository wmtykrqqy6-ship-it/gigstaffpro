-- Delivery Logistics: staffing per catalog item, so importing a pull sheet
-- can prefill the event's positions. Requires
-- 20260927120000_add_logistics_foundation.sql.
--
-- position_key    Which position this item needs (a key from the app's
--                 positions setting, e.g. 'blackjack'). Null = no staff.
-- staff_per_unit  How many of that position per item (per table).
--
-- Seeded from the Goodshuffle table descriptions ("comes with one dealer",
-- "includes two dealers"), confirmed with Dylan 2026-09-28: craps = 2
-- dealers, blackjack/roulette/poker = 1. Bigger events sometimes get extra
-- dealers -- those are added by hand on the event; the import prefills the
-- base count and never changes an existing event's staffing without asking.
--
-- Keys match the live positions setting as of 2026-09-28 (checked read-only):
-- blackjack, craps, roulette, poker (plus 3_card_poker, let_it_ride,
-- money_wheel, pai_gow, ultimate_hold'em, host).
--
-- Additive only: two nullable/defaulted columns, four seed updates. Access
-- rules unchanged (reads open, writes admin-only, from the phase 1 migration).

BEGIN;

ALTER TABLE public.equipment_catalog
  ADD COLUMN IF NOT EXISTS position_key text,
  ADD COLUMN IF NOT EXISTS staff_per_unit integer NOT NULL DEFAULT 0 CHECK (staff_per_unit >= 0);

COMMENT ON COLUMN public.equipment_catalog.position_key IS
  'Position this item needs when rented (key from the positions setting), or null for none.';
COMMENT ON COLUMN public.equipment_catalog.staff_per_unit IS
  'How many of position_key each unit (table) needs. Prefills event staffing on pull sheet import.';

UPDATE public.equipment_catalog SET position_key = 'blackjack', staff_per_unit = 1
  WHERE name_key = 'blackjack table' AND position_key IS NULL;
UPDATE public.equipment_catalog SET position_key = 'craps', staff_per_unit = 2
  WHERE name_key = '10ft craps table' AND position_key IS NULL;
UPDATE public.equipment_catalog SET position_key = 'roulette', staff_per_unit = 1
  WHERE name_key = 'roulette table' AND position_key IS NULL;
UPDATE public.equipment_catalog SET position_key = 'poker', staff_per_unit = 1
  WHERE name_key = 'texas hold''em poker' AND position_key IS NULL;

COMMIT;
