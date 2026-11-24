-- CRM Phase 1, step 4: automatic "still interested?" follow-up for leads.
--
-- Run AFTER 20261124140000_add_leads.sql.
--
-- ---------------------------------------------------------------------------
-- What this does
-- ---------------------------------------------------------------------------
-- Adds four columns to public.leads:
--   quoted_at         when the lead was moved to "Quoted"
--   last_contact_at   last time someone pressed "We talked" on the lead
--   followup_sent_at  when the automatic follow-up email went out
--   followup_paused   true = never send this lead the automatic email
-- The 7 days count from whichever is later: quoted_at or last_contact_at.
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
--     DROP COLUMN IF EXISTS last_contact_at, DROP COLUMN IF EXISTS followup_sent_at,
--     DROP COLUMN IF EXISTS followup_paused;

BEGIN;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS quoted_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_contact_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_paused boolean NOT NULL DEFAULT false;

UPDATE public.leads SET quoted_at = updated_at
WHERE stage = 'quoted' AND quoted_at IS NULL;

CREATE INDEX IF NOT EXISTS leads_followup_idx ON public.leads (stage)
  WHERE stage = 'quoted' AND followup_sent_at IS NULL AND NOT followup_paused;

COMMIT;
