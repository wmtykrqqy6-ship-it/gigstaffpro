-- Push notifications (installable web app, 2026-10-05): one row per phone or
-- browser a worker has turned notifications on for. Written by
-- api/worker-actions.js ('savePushSubscription' / 'removePushSubscription')
-- and read by the push sender (api/_lib/push.js), both with the service role.
--
-- Access: RLS on, no anon/authenticated policies at all -- the subscription
-- endpoint and keys let anyone holding them send that phone notifications,
-- so nothing in the browser can read this table. Admins don't need to.
--
-- Additive only: one new table. Deleting a worker removes their rows.

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz
);

CREATE INDEX IF NOT EXISTS push_subscriptions_worker_idx ON public.push_subscriptions (worker_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.push_subscriptions FROM anon, authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;

COMMIT;
