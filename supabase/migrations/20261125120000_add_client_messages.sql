-- CRM Phase 1, step 5: Messages inbox. See docs/CRM.md.
--
-- Run AFTER 20261124160000_add_booked_lead_emails.sql.
--
-- ---------------------------------------------------------------------------
-- What this does
-- ---------------------------------------------------------------------------
-- public.client_messages: one row per email with a client.
--   * direction 'in':  a client's email. sales@vegasonwheels.com redirects a
--     copy to the receiving address on in.vegasonwheels.com (Resend), and
--     the server saves it here, matched to a lead or client by the sender's
--     email (left unmatched if nobody has that email).
--   * direction 'out': an email we sent the client: a reply written in the
--     Messages screen, or one of the automatic emails (kind says which).
-- Only text is kept (no HTML, no attachments). Admins and sales managers
-- can read it and mark messages read or link them to a lead/client; only
-- the server (service key) adds rows. Deleting a lead or client keeps its
-- messages (the link is cleared).
--
-- ---------------------------------------------------------------------------
-- Undo (only if needed)
-- ---------------------------------------------------------------------------
--   DROP TABLE IF EXISTS public.client_messages;

BEGIN;

DO $$
DECLARE
  id_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO id_type
  FROM pg_attribute a
  WHERE a.attrelid = 'public.clients'::regclass
    AND a.attname = 'id'
    AND NOT a.attisdropped;

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.client_messages (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      direction    text NOT NULL CHECK (direction IN ('in', 'out')),
      kind         text NOT NULL DEFAULT 'email'
                   CHECK (kind IN ('email', 'reply', 'followup', 'thankyou', 'upsell', 'prep', 'review')),
      lead_id      uuid REFERENCES public.leads(id) ON DELETE SET NULL,
      client_id    %s REFERENCES public.clients(id) ON DELETE SET NULL,
      contact_email text NOT NULL CHECK (length(contact_email) BETWEEN 3 AND 254),
      contact_name text,
      subject      text,
      body_text    text,
      resend_id    text UNIQUE,
      sent_by      text, -- admin_users id of who wrote a reply
      read_at      timestamptz,
      created_at   timestamptz NOT NULL DEFAULT now()
    )$sql$, id_type);
END $$;

CREATE INDEX IF NOT EXISTS client_messages_contact_idx ON public.client_messages (lower(contact_email), created_at DESC);
CREATE INDEX IF NOT EXISTS client_messages_lead_idx ON public.client_messages (lead_id);
CREATE INDEX IF NOT EXISTS client_messages_client_idx ON public.client_messages (client_id);
CREATE INDEX IF NOT EXISTS client_messages_unread_idx ON public.client_messages (created_at DESC) WHERE read_at IS NULL AND direction = 'in';

ALTER TABLE public.client_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_messages_admin_read" ON public.client_messages;
CREATE POLICY "client_messages_admin_read" ON public.client_messages
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "client_messages_admin_update" ON public.client_messages;
CREATE POLICY "client_messages_admin_update" ON public.client_messages
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.client_messages FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.client_messages TO authenticated;
-- Admins may only mark read and link a message, never rewrite it.
GRANT UPDATE (read_at, lead_id, client_id) ON TABLE public.client_messages TO authenticated;
GRANT ALL ON TABLE public.client_messages TO service_role;

COMMIT;
