-- CRM Phase 1, step 3: leads from the website quote form.
--
-- Run AFTER 20261124130000_add_goodshuffle_projects.sql (it stops with a
-- clear message if that one hasn't been run yet).
--
-- ---------------------------------------------------------------------------
-- What this does
-- ---------------------------------------------------------------------------
-- 1. public.leads: one row per quote request (an inquiry that isn't booked
--    yet). The quote form on vegasonwheels.com sends it to GigStaffPro's
--    server, which saves it here. Holds what the visitor typed (name, email,
--    phone, company, event date, start time, location, guest count, games,
--    extra services, message), where it came from, its stage
--    (new, quoted, booked, lost) and why it was lost. If the email matches
--    a client already in GigStaffPro, the lead is linked to that client.
--    Deleting a client keeps its leads but unlinks them.
-- 2. Admin-only (admins and sales managers through public.is_admin()), like
--    the other client tables: RLS on, anon access revoked. Website visitors
--    never touch the table: the server saves the lead with the service key
--    after checking the form. Adds, changes and deletes go into the client
--    access log.
--
-- Data: nothing existing is changed. The table starts empty.
--
-- ---------------------------------------------------------------------------
-- Check afterwards (in the SQL editor)
-- ---------------------------------------------------------------------------
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'leads';
--
-- ---------------------------------------------------------------------------
-- Undo (only if needed; deletes any leads received)
-- ---------------------------------------------------------------------------
--   DROP TABLE IF EXISTS public.leads;

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.goodshuffle_projects') IS NULL THEN
    RAISE EXCEPTION 'Run 20261124130000_add_goodshuffle_projects.sql first';
  END IF;
END $$;

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
    CREATE TABLE IF NOT EXISTS public.leads (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id       %s REFERENCES public.clients(id) ON DELETE SET NULL,
      stage           text NOT NULL DEFAULT 'new'
                      CHECK (stage IN ('new', 'quoted', 'booked', 'lost')),
      lost_reason     text,
      source          text NOT NULL DEFAULT 'website',
      name            text NOT NULL CHECK (length(btrim(name)) > 0),
      email           text,
      phone           text,
      company         text,
      event_date      date,
      start_time      text,
      event_location  text,
      guest_count     integer CHECK (guest_count IS NULL OR guest_count BETWEEN 0 AND 100000),
      games           text[] NOT NULL DEFAULT '{}',
      services        text[] NOT NULL DEFAULT '{}',
      message         text,
      page_url        text,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now()
    )$sql$, id_type);
END $$;

CREATE INDEX IF NOT EXISTS leads_created_idx ON public.leads (created_at DESC);
CREATE INDEX IF NOT EXISTS leads_client_idx ON public.leads (client_id);
CREATE INDEX IF NOT EXISTS leads_email_idx ON public.leads (lower(email));

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_admin_all" ON public.leads;
CREATE POLICY "leads_admin_all" ON public.leads
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.leads FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leads TO authenticated;
GRANT ALL ON TABLE public.leads TO service_role;

DROP TRIGGER IF EXISTS leads_access_log ON public.leads;
CREATE TRIGGER leads_access_log
  AFTER INSERT OR UPDATE OR DELETE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.log_client_change();

COMMIT;
