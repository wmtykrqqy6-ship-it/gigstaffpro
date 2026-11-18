-- Local crew first (Dylan, 2026-11-18). For the first 48 hours after an
-- event is posted, only workers whose primary market (workers.home_location_id)
-- is the event's market (events.location_id, the "home warehouse") can see
-- it in Available Events and sign up. Then it opens to every market. An
-- admin can open it early ("Open to everyone now"), and can still invite or
-- assign anyone at any time.
--
-- local_priority_until: when the local-first window ends.
--   * NULL  = no window (all events that exist today, and any event the
--             admin posts with "Local crew first" turned off).
--   * past  = window is over / was released early.
--   * future = window active.
-- Set by the admin app when the event is created; the worker app and
-- api/worker-actions.js (apply) both check it.
--
-- Additive only. Existing events get NULL, so nothing changes for them.
-- No RLS change: events reads stay public and writes stay admin-only
-- (20260826130000_restrict_events_writes_to_admin.sql).

BEGIN;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS local_priority_until timestamptz;

COMMIT;
