-- Data fix, not a schema change: 6 real active workers had no
-- home_location_id set at all, which meant they always fell back to the
-- global default pay rate regardless of any location_pay_rates override
-- (see the worker-home-location pay fix from 20260828). Confirmed with
-- the business owner that all 6 are Milwaukee-based. Deliberately excludes
-- the ZZTEST* accounts left over from RLS-lockdown verification testing.

BEGIN;

UPDATE public.workers
SET home_location_id = '00000000-0000-0000-0000-000000000001'
WHERE id IN (
  'd0104e88-e8fc-4fa7-8da4-e95a2835d78b', -- Mike Chen
  '20a5ab12-046a-4d8b-9c77-fac46b5e67a1', -- Jarett Plumb
  'dc061d99-fb15-4139-b365-02069df8e294', -- Tyler Newsom
  '0b767dd3-1c06-4004-acbe-302a26ce5db4', -- Jessica Brown
  'b19acf20-1ad5-476a-ad01-b79bef4b5c96', -- Sarah Martinez
  'b1011d9a-151a-4db5-b00b-945fdab54ebb'  -- David Kim
);

COMMIT;
