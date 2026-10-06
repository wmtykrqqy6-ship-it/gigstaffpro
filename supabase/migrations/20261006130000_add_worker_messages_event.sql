-- Worker inbox: remember which event a Message Staff message was about
-- (when it was sent to one event's staff), so tapping it in the app shows
-- that event's details (Dylan, 2026-10-06: "how do i know what event time
-- changed").
--
-- Additive only: one nullable column. If the event is deleted the message
-- stays, just without the link.

BEGIN;

ALTER TABLE public.worker_messages
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;

COMMIT;
