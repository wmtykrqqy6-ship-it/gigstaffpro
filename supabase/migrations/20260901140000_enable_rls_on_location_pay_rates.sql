-- Follow-up to 20260901130000: that migration added admin-only write
-- policies to location_pay_rates, but a live re-test with the anon key
-- (disposable probe insert, immediately deleted) showed the write still
-- succeeding -- unlike the same probe against pay_rates, which correctly
-- failed with 42501. Root cause: Row Level Security was never enabled on
-- this table at all, so policies exist but are never evaluated, and the
-- table's underlying GRANT ALL ... TO anon (from before any lockdown work)
-- lets every operation through regardless of policy content.
--
-- The other four tables in 20260824120000 didn't need this statement
-- because their RLS was already on (confirmed by the "Enable all for X"
-- policy actually being enforced pre-lockdown, e.g. reads still worked
-- through a real policy rather than a bare grant). location_pay_rates
-- apparently never had RLS turned on in the first place.

BEGIN;

ALTER TABLE public.location_pay_rates ENABLE ROW LEVEL SECURITY;

COMMIT;
