-- CRM Phase 1: automatic emails to booked clients (thank-you, upsell,
-- get-ready checklist, review + tip). See docs/CRM.md.
--
-- Run AFTER 20261124150000_add_lead_followups.sql.
--
-- ---------------------------------------------------------------------------
-- What this does
-- ---------------------------------------------------------------------------
-- 1. leads.booked_at: when the lead was marked Booked (starts the
--    thank-you email). Leads already Booked get their last-changed time.
-- 2. public.lead_emails_sent: one row per automatic email sent to a lead
--    (lead, which email, when). It is how the server makes sure each email
--    goes out only once. Admins and sales managers can read it; only the
--    server (service key) writes it. Deleting a lead deletes its rows.
--
-- Nothing is sent until an admin turns the emails on in the Leads tab.
--
-- ---------------------------------------------------------------------------
-- Undo (only if needed)
-- ---------------------------------------------------------------------------
--   DROP TABLE IF EXISTS public.lead_emails_sent;
--   ALTER TABLE public.leads DROP COLUMN IF EXISTS booked_at;

BEGIN;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS booked_at timestamptz;

UPDATE public.leads SET booked_at = updated_at
WHERE stage = 'booked' AND booked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.lead_emails_sent (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id  uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  kind     text NOT NULL CHECK (kind IN ('thankyou', 'upsell', 'prep', 'review')),
  sent_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, kind)
);

ALTER TABLE public.lead_emails_sent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_emails_sent_admin_read" ON public.lead_emails_sent;
CREATE POLICY "lead_emails_sent_admin_read" ON public.lead_emails_sent
  FOR SELECT USING (public.is_admin());

REVOKE ALL ON TABLE public.lead_emails_sent FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.lead_emails_sent TO authenticated;
GRANT ALL ON TABLE public.lead_emails_sent TO service_role;

COMMIT;
