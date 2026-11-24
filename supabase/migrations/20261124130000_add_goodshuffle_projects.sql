-- CRM Phase 1, step 2: Goodshuffle history on each client.
--
-- Run AFTER 20261124120000_add_client_contacts_and_activity.sql (it stops
-- with a clear message if that one hasn't been run yet).
--
-- ---------------------------------------------------------------------------
-- What this does
-- ---------------------------------------------------------------------------
-- 1. public.goodshuffle_projects: one row per Goodshuffle project (quote,
--    signed contract or new project) brought over by the Clients tab's
--    "Import from Goodshuffle": project number, status, name, event date
--    and time, venue, sales lead, total, amount due, and the contact on the
--    quote. Each row points to the client it belongs to. The client page
--    lists them, and the leads pipeline (a later step) can use the
--    "Quote Sent" ones. The project number is the same number GigStaffPro
--    already stores on events from pull sheets (events.goodshuffle_invoice).
--    Deleting a client keeps its projects but unlinks them.
-- 2. public.clients gets a "source" column (where the client came from:
--    'goodshuffle', 'website', 'manual'...). Optional; existing clients
--    stay empty.
-- 3. Admin-only (admins and sales managers through public.is_admin()), like
--    the other client tables: RLS on, anon access revoked. Adds, changes and
--    deletes go into the client access log.
--
-- Data: nothing existing is deleted or rewritten. The table starts empty;
-- the import fills it from the app.
--
-- ---------------------------------------------------------------------------
-- Check afterwards (in the SQL editor)
-- ---------------------------------------------------------------------------
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'goodshuffle_projects';
--   SELECT count(*) FROM public.goodshuffle_projects;   -- 0 until the import
--
-- ---------------------------------------------------------------------------
-- Undo (only if needed; removes the imported project history)
-- ---------------------------------------------------------------------------
--   BEGIN;
--   DROP TABLE IF EXISTS public.goodshuffle_projects;
--   ALTER TABLE public.clients DROP COLUMN IF EXISTS source;
--   COMMIT;

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.client_contacts') IS NULL THEN
    RAISE EXCEPTION 'Run 20261124120000_add_client_contacts_and_activity.sql first';
  END IF;
END $$;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS source text;

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
    CREATE TABLE IF NOT EXISTS public.goodshuffle_projects (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id     text NOT NULL UNIQUE,
      client_id      %s REFERENCES public.clients(id) ON DELETE SET NULL,
      status         text,
      name           text,
      event_date     date,
      event_time     text,
      venue          text,
      venue_address  text,
      sales_lead     text,
      total          numeric(12,2),
      amount_due     numeric(12,2),
      contact_name   text,
      contact_email  text,
      contact_phone  text,
      imported_at    timestamptz NOT NULL DEFAULT now()
    )$sql$, id_type);
END $$;

CREATE INDEX IF NOT EXISTS goodshuffle_projects_client_idx
  ON public.goodshuffle_projects (client_id, event_date DESC);

ALTER TABLE public.goodshuffle_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "goodshuffle_projects_admin_all" ON public.goodshuffle_projects;
CREATE POLICY "goodshuffle_projects_admin_all" ON public.goodshuffle_projects
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.goodshuffle_projects FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.goodshuffle_projects TO authenticated;
GRANT ALL ON TABLE public.goodshuffle_projects TO service_role;

DROP TRIGGER IF EXISTS goodshuffle_projects_access_log ON public.goodshuffle_projects;
CREATE TRIGGER goodshuffle_projects_access_log
  AFTER INSERT OR UPDATE OR DELETE ON public.goodshuffle_projects
  FOR EACH ROW EXECUTE FUNCTION public.log_client_change();

COMMIT;
