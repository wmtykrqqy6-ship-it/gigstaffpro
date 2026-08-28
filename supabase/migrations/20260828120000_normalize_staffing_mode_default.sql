-- Normalize events.staffing_mode before the app starts acting on it.
--
-- ---------------------------------------------------------------------------
-- Why
-- ---------------------------------------------------------------------------
-- public.events has a staffing_mode column (DEFAULT 'first-come') that has
-- existed since the table was created but nothing in the app has ever read
-- or written to it -- every self-application has always gone to 'pending'
-- and waited for manual admin approval, regardless of this column's value.
-- That means every existing event's staffing_mode is 'first-come' purely
-- from the unused column default, not because anyone chose first-come
-- signup for it.
--
-- The app is about to start honoring this column (worker-actions.js's
-- apply action will auto-confirm instead of setting 'pending' when
-- staffing_mode = 'first-come'). Without this migration, every existing
-- event would silently switch to auto-approve the moment that code
-- deployed, which is not a real admin choice and not today's behavior.
--
-- ---------------------------------------------------------------------------
-- What this does
-- ---------------------------------------------------------------------------
-- Sets every existing event's staffing_mode to 'approval' (the mode
-- they've actually been operating under this whole time), and changes the
-- column default going forward to match -- new events created before an
-- admin explicitly picks a mode in the UI keep today's actual behavior
-- instead of silently defaulting to first-come.

BEGIN;

UPDATE public.events SET staffing_mode = 'approval' WHERE staffing_mode IS DISTINCT FROM 'approval';

ALTER TABLE public.events ALTER COLUMN staffing_mode SET DEFAULT 'approval';

COMMIT;
