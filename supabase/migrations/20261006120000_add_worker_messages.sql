-- Worker message inbox (2026-10-06). A push notification disappears from
-- the phone once it's tapped, so every Message Staff message is also saved
-- here, one row per worker it was sent to, and shown in the worker's 🔔
-- notifications in the app -- including workers without push turned on.
--
-- Written by api/send-email.js (admin push, kind 'message') and read by
-- api/worker-actions.js ('listMessages'), both with the service role.
-- Access: RLS on; admins can read; nothing else in the browser can.
--
-- Additive only: one new table. Deleting a worker removes their rows.

BEGIN;

CREATE TABLE IF NOT EXISTS public.worker_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  kind text NOT NULL DEFAULT 'message',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS worker_messages_worker_created_idx ON public.worker_messages (worker_id, created_at DESC);

ALTER TABLE public.worker_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "worker_messages_admin_read" ON public.worker_messages;
CREATE POLICY "worker_messages_admin_read" ON public.worker_messages
  FOR SELECT USING (public.is_admin());

REVOKE ALL ON TABLE public.worker_messages FROM anon;
GRANT SELECT ON TABLE public.worker_messages TO authenticated;
GRANT ALL ON TABLE public.worker_messages TO service_role;

COMMIT;
