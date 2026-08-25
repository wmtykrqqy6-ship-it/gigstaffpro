-- Log table so the admin dashboard can surface "a standby worker was
-- auto-promoted" as a notification. api/promote-standby.js already flips an
-- assignment's status from 'standby' to 'approved' when a spot opens, but
-- that's indistinguishable from a manual admin action once written --
-- nothing records that the *system* did it, so admins had no way to notice
-- it happened short of spotting the roster change themselves.
--
-- Minimal, append-only log: no PII beyond ids already visible elsewhere in
-- the app, insert-only from the anon key (same access level the app's own
-- client already has to the assignments/events/workers tables this
-- references), read-only otherwise.

BEGIN;

CREATE TABLE public.standby_promotions (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  position text NOT NULL,
  promoted_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.standby_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "standby_promotions_read" ON public.standby_promotions
  FOR SELECT USING (true);
CREATE POLICY "standby_promotions_insert" ON public.standby_promotions
  FOR INSERT WITH CHECK (true);

GRANT SELECT, INSERT ON TABLE public.standby_promotions TO anon, authenticated;
GRANT ALL ON TABLE public.standby_promotions TO service_role;

COMMIT;
