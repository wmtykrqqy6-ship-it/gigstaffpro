-- Worker portal: "Not interested" on Available Events. One row per event a
-- worker has hidden from their Available Events list, so the list doesn't
-- get cluttered with events they've already passed on. Hiding is not a
-- commitment either way: the worker can show hidden events again, and admin
-- invites still reach them.
--
-- Written and read only by api/worker-actions.js (actions 'hideEvent',
-- 'unhideEvent', 'listHiddenEvents') with the service role. Access: RLS on
-- with no anon policies; admins can read it. Nothing in the browser queries
-- the table directly.
--
-- Additive only: one new table. Deleting an event or worker removes its rows.

BEGIN;

CREATE TABLE IF NOT EXISTS public.hidden_events (
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  hidden_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (worker_id, event_id)
);

ALTER TABLE public.hidden_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hidden_events_admin_read" ON public.hidden_events;
CREATE POLICY "hidden_events_admin_read" ON public.hidden_events
  FOR SELECT USING (public.is_admin());

REVOKE ALL ON TABLE public.hidden_events FROM anon;
GRANT SELECT ON TABLE public.hidden_events TO authenticated;
GRANT ALL ON TABLE public.hidden_events TO service_role;

COMMIT;
