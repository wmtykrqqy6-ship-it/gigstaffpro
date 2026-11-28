-- CRM Phase 3 step 3: balance reminder emails and late-payment notes to the
-- team. See docs/PAYMENTS.md.
--
-- Run AFTER 20261128120000_add_quote_payments.sql.
--
-- ---------------------------------------------------------------------------
-- What this does
-- ---------------------------------------------------------------------------
-- 1. public.quote_emails_sent: one row per payment email sent for a booked
--    quote (which quote, which email, when):
--      balance        the "your balance is due" reminder to the client
--      deposit_late   the note to the team that a deposit is late
--      balance_late   the note to the team that a balance is late
--    It is how the server makes sure each one goes out only once. Admins and
--    sales managers can read it; only the server (service key) writes it.
--    Deleting a quote deletes its rows.
-- 2. client_messages may now hold kind 'balance', so the reminder shows in
--    Messages like the other automatic emails.
--
-- Nothing is sent until an admin turns these on in Settings > Email.
--
-- ---------------------------------------------------------------------------
-- Undo (only if needed)
-- ---------------------------------------------------------------------------
--   DROP TABLE IF EXISTS public.quote_emails_sent;
--   ALTER TABLE public.client_messages DROP CONSTRAINT client_messages_kind_check;
--   ALTER TABLE public.client_messages ADD CONSTRAINT client_messages_kind_check
--     CHECK (kind IN ('email', 'reply', 'followup', 'thankyou', 'upsell', 'prep', 'review', 'custom'));

BEGIN;

CREATE TABLE IF NOT EXISTS public.quote_emails_sent (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id  uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  kind      text NOT NULL CHECK (kind IN ('balance', 'deposit_late', 'balance_late')),
  sent_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quote_id, kind)
);

ALTER TABLE public.quote_emails_sent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_emails_sent_admin_read" ON public.quote_emails_sent;
CREATE POLICY "quote_emails_sent_admin_read" ON public.quote_emails_sent
  FOR SELECT USING (public.is_admin());

REVOKE ALL ON TABLE public.quote_emails_sent FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.quote_emails_sent TO authenticated;
GRANT ALL ON TABLE public.quote_emails_sent TO service_role;

ALTER TABLE public.client_messages DROP CONSTRAINT IF EXISTS client_messages_kind_check;
ALTER TABLE public.client_messages ADD CONSTRAINT client_messages_kind_check
  CHECK (kind IN ('email', 'reply', 'followup', 'thankyou', 'upsell', 'prep', 'review', 'custom', 'balance'));

COMMIT;
