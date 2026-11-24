-- CRM Phase 1, step 4: automatic "still interested?" follow-up for leads.
--
-- Run AFTER 20261124140000_add_leads.sql.
--
-- ---------------------------------------------------------------------------
-- What this does
-- ---------------------------------------------------------------------------
-- Adds two columns to public.leads:
--   quoted_at         when the lead was moved to "Quoted" (the 7-day clock)
--   followup_sent_at  when the automatic follow-up email went out
-- The Leads tab fills quoted_at when you move a lead to Quoted. Leads that
-- are already Quoted get their last-changed time as a starting point.
--
-- No new tables, policies or permissions. The follow-up stays OFF until an
-- admin turns it on in the Leads tab.
--
-- ---------------------------------------------------------------------------
-- Undo (only if needed)
-- ---------------------------------------------------------------------------
--   ALTER TABLE public.leads DROP COLUMN IF EXISTS quoted_at,
--                            DROP COLUMN IF EXISTS followup_sent_at;

BEGIN;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS quoted_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_sent_at timestamptz;

UPDATE public.leads SET quoted_at = updated_at
WHERE stage = 'quoted' AND quoted_at IS NULL;

CREATE INDEX IF NOT EXISTS leads_followup_idx ON public.leads (quoted_at)
  WHERE stage = 'quoted' AND followup_sent_at IS NULL;

COMMIT;
