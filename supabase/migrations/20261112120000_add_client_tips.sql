-- Client tips on events (Dylan, 2026-11-12: "sometimes a client adds tips
-- to the event"). The admin enters the total the client gave on Payments ->
-- Client Tips, and it is split evenly among the workers who worked the event
-- (each share can be edited before saving).
--
-- Tips are kept in their own column, NOT folded into total_pay:
--   * the holiday multiplier applies to total_pay and must not multiply tips
--   * W-2 employees' tips have to be reported to QuickBooks Payroll as tips
-- What a worker is owed for a shift = total_pay + tip_amount.
--
-- Additive only. Existing rows get tip_amount 0, so nothing changes until
-- an admin enters tips.

BEGIN;

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS tip_amount numeric(10,2) NOT NULL DEFAULT 0;

-- The total the client gave, so the split screen can show it again later.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS client_tip_total numeric(10,2);

COMMIT;
