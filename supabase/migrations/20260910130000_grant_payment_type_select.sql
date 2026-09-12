-- Fixes a live break introduced by 20260910120000_add_worker_payment_type.sql.
--
-- public.workers doesn't grant anon/authenticated a blanket SELECT -- it
-- grants SELECT on an explicit column list, set up when pin_hash was
-- locked down (see 20260826120000_revoke_worker_pin_hash_select.sql).
-- That migration replaced "all columns except pin_hash" with an explicit
-- allowlist, so a brand-new column is NOT included by default -- it has
-- to be added to the grant by hand. payment_type was missed.
--
-- Effect of the bug: WORKER_COLUMNS (src/constants.js) now includes
-- payment_type in every worker SELECT app-wide. Postgres reports a
-- column-level SELECT denial at the table level, so ANY query selecting
-- payment_type failed with "permission denied for table workers" --
-- breaking Staff, Dashboard, Payments, and anywhere else workers load,
-- immediately after the previous migration landed.

BEGIN;

GRANT SELECT (payment_type) ON TABLE public.workers TO anon, authenticated;

COMMIT;
