-- Add flat_pay_amount to events, powering the "Flat event pay" option from
-- the MVP doc's Pay and Travel Calculation section (position-specific pay,
-- location overrides, travel tiers, and holiday multiplier already exist;
-- this was the one missing piece). Nullable, no default: existing events
-- and any event where the admin doesn't set this keep computing base pay
-- from position hourly rate × hours exactly as they do today. When set,
-- it replaces the hours × rate calculation as the assignment's base pay,
-- with travel pay, the Lake Geneva bonus, and the holiday multiplier still
-- layering on top -- matching the MVP formula "Assignment total = position
-- pay + travel pay + applicable overrides", with flat pay standing in for
-- "position pay".

BEGIN;

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS flat_pay_amount numeric(10,2);

COMMIT;
