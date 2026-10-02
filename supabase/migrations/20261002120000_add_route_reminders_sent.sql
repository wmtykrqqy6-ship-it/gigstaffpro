-- Delivery Logistics: log of day-before route reminder emails, so each crew
-- member gets one email per run. Written by api/_lib/routeReminders.js (run
-- from the hourly send-shift-reminders cron) with the service role.
--
-- Access: RLS on with no anon/authenticated policies except an admin read,
-- so only the server (service role) writes it. Nothing in the browser needs
-- it.
--
-- Additive only: one new table. Deleting a run or worker removes its rows.

BEGIN;

CREATE TABLE IF NOT EXISTS public.route_reminders_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.daily_runs(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  run_date date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, worker_id)
);

ALTER TABLE public.route_reminders_sent ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "route_reminders_sent_admin_read" ON public.route_reminders_sent;
CREATE POLICY "route_reminders_sent_admin_read" ON public.route_reminders_sent
  FOR SELECT USING (public.is_admin());

REVOKE ALL ON TABLE public.route_reminders_sent FROM anon;
GRANT SELECT ON TABLE public.route_reminders_sent TO authenticated;
GRANT ALL ON TABLE public.route_reminders_sent TO service_role;

COMMIT;
