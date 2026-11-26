-- CRM: each rep's email signature for replies sent from the Messages
-- screen. See docs/CRM.md.
--
-- Run AFTER 20261125120000_add_client_messages.sql.
--
-- ---------------------------------------------------------------------------
-- What this does
-- ---------------------------------------------------------------------------
-- public.admin_email_signatures: one row per admin / sales manager login,
-- with the name shown on their replies and the signature added to the end
-- of every reply they send (replies still come from sales@vegasonwheels.com).
-- Only the server (service key) reads or writes it: the app saves your own
-- signature through api/send-email.js, which checks who you are first. No
-- browser access at all, so reps' names and phone numbers never sit on a
-- public table. Deleting an admin login deletes their signature.
--
-- ---------------------------------------------------------------------------
-- Undo (only if needed)
-- ---------------------------------------------------------------------------
--   DROP TABLE IF EXISTS public.admin_email_signatures;

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_email_signatures (
  admin_user_id uuid PRIMARY KEY REFERENCES public.admin_users(id) ON DELETE CASCADE,
  display_name  text CHECK (display_name IS NULL OR length(display_name) <= 80),
  signature     text CHECK (signature IS NULL OR length(signature) <= 1000),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_email_signatures ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only the service role (which bypasses RLS) uses it.

REVOKE ALL ON TABLE public.admin_email_signatures FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.admin_email_signatures TO service_role;

COMMIT;
