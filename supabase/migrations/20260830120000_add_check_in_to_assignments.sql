-- Check-in: the one MVP-blocking capability confirmed missing from the
-- codebase entirely (no column, no endpoint, no UI). Recorded on the
-- assignment itself (worker + event + timestamp is exactly what an
-- assignment row already identifies) rather than a separate table.
-- Nullable, no default: null means "not checked in yet."

BEGIN;

ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;

COMMIT;
