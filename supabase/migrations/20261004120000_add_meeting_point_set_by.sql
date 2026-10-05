-- Meeting point: remember who dropped the pin and when, so the crew sees
-- "Set by William Finn, 4:12 PM" (Dylan, 2026-10-04). Written by
-- api/worker-actions.js ('setMeetingPoint', service role) when the Host or
-- the setup crew sets the pin from their phone; cleared when an admin moves
-- the pin in the event form.
--
-- Optional: the feature works without these columns (the pin still saves,
-- just without the "set by" line).
--
-- Additive only: two nullable columns on events. They inherit the events
-- table's existing RLS (public read, admin write).

BEGIN;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS meeting_point_set_by_name text,
  ADD COLUMN IF NOT EXISTS meeting_point_set_at timestamptz;

COMMIT;
