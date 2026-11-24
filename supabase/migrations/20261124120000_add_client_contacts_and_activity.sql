-- CRM Phase 1, step 1: the Clients tab (client type, contacts, notes).
--
-- Run AFTER 20261122120000_add_sales_managers_and_client_access_log.sql (it
-- stops with a clear message if that one hasn't been run yet). It does not
-- need 20261122130000_require_two_step_for_admins.sql.
--
-- ---------------------------------------------------------------------------
-- What this does
-- ---------------------------------------------------------------------------
-- 1. public.clients gets two new columns, both optional:
--      client_type      'private', 'corporate', 'fundraiser' or 'planner'
--      billing_address  free text
--    Existing clients are left as they are (client_type stays empty until
--    someone picks one).
-- 2. public.client_contacts: the people at a client (name, role, phone,
--    email, how they like to be reached, one marked primary). Deleting a
--    client deletes its contacts.
-- 3. public.client_activity: the client's history in date order: notes,
--    calls, emails, texts and meetings someone logged. The person and time
--    are filled in by the database from the login, so an entry can't be
--    put in someone else's name. The Messages inbox (a later step) will
--    add emails here too. Deleting a client deletes its history.
-- 4. Both new tables are admin-only (admins and sales managers, through
--    public.is_admin()), exactly like public.clients: RLS on, anon access
--    revoked.
-- 5. Adds, changes and deletes on both tables go into the client access log
--    (same trigger as clients), listing changed field names, not values.
--
-- Data: nothing is deleted or rewritten.
--
-- ---------------------------------------------------------------------------
-- Check afterwards (in the SQL editor)
-- ---------------------------------------------------------------------------
--   SELECT tablename, policyname, cmd FROM pg_policies
--     WHERE tablename IN ('client_contacts', 'client_activity');  -- admin only
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'clients' AND column_name IN ('client_type', 'billing_address');
--
-- ---------------------------------------------------------------------------
-- Undo (only if needed; deletes any contacts and notes that were added)
-- ---------------------------------------------------------------------------
--   BEGIN;
--   DROP TABLE IF EXISTS public.client_activity;
--   DROP TABLE IF EXISTS public.client_contacts;
--   DROP FUNCTION IF EXISTS public.set_client_activity_author();
--   ALTER TABLE public.clients DROP COLUMN IF EXISTS client_type;
--   ALTER TABLE public.clients DROP COLUMN IF EXISTS billing_address;
--   COMMIT;

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.client_access_log') IS NULL THEN
    RAISE EXCEPTION 'Run 20261122120000_add_sales_managers_and_client_access_log.sql first';
  END IF;
END $$;

-- 1. New client columns ------------------------------------------------------

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS client_type text,
  ADD COLUMN IF NOT EXISTS billing_address text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'clients_client_type_check'
      AND conrelid = 'public.clients'::regclass
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_client_type_check
      CHECK (client_type IS NULL OR client_type IN ('private', 'corporate', 'fundraiser', 'planner'));
  END IF;
END $$;

-- 2 and 3. Contacts and activity ---------------------------------------------
-- public.clients was created by hand before migrations were kept, so its id
-- type isn't recorded here. The tables below use whatever type it has.

DO $$
DECLARE
  id_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO id_type
  FROM pg_attribute a
  WHERE a.attrelid = 'public.clients'::regclass
    AND a.attname = 'id'
    AND NOT a.attisdropped;

  IF id_type IS NULL THEN
    RAISE EXCEPTION 'public.clients has no id column';
  END IF;

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.client_contacts (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id         %s NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
      name              text NOT NULL CHECK (length(btrim(name)) > 0),
      role              text,
      phone             text,
      email             text,
      preferred_contact text CHECK (preferred_contact IS NULL OR preferred_contact IN ('phone', 'text', 'email')),
      is_primary        boolean NOT NULL DEFAULT false,
      notes             text,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now()
    )$sql$, id_type);

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.client_activity (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id       %s NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
      kind            text NOT NULL DEFAULT 'note'
                      CHECK (kind IN ('note', 'call', 'email', 'text', 'meeting')),
      body            text NOT NULL CHECK (length(btrim(body)) > 0),
      created_by      uuid,
      created_by_name text,
      created_at      timestamptz NOT NULL DEFAULT now()
    )$sql$, id_type);
END $$;

CREATE INDEX IF NOT EXISTS client_contacts_client_idx
  ON public.client_contacts (client_id);
CREATE INDEX IF NOT EXISTS client_activity_client_idx
  ON public.client_activity (client_id, created_at DESC);

-- Who wrote an activity entry comes from the login, never from the app.
CREATE OR REPLACE FUNCTION public.set_client_activity_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    NEW.created_at := now();
    SELECT u.username INTO NEW.created_by_name
    FROM public.admin_auth_links l
    JOIN public.admin_users u ON u.id = l.admin_user_id
    WHERE l.auth_user_id = auth.uid()
    LIMIT 1;
  ELSE
    -- Edits can change the text and kind, not who wrote it or when.
    NEW.created_by := OLD.created_by;
    NEW.created_by_name := OLD.created_by_name;
    NEW.created_at := OLD.created_at;
    NEW.client_id := OLD.client_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_client_activity_author() FROM PUBLIC;

DROP TRIGGER IF EXISTS client_activity_author ON public.client_activity;
CREATE TRIGGER client_activity_author
  BEFORE INSERT OR UPDATE ON public.client_activity
  FOR EACH ROW EXECUTE FUNCTION public.set_client_activity_author();

-- 4. Admin-only access ---------------------------------------------------------

ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_contacts_admin_all" ON public.client_contacts;
CREATE POLICY "client_contacts_admin_all" ON public.client_contacts
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "client_activity_admin_all" ON public.client_activity;
CREATE POLICY "client_activity_admin_all" ON public.client_activity
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.client_contacts FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.client_activity FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.client_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.client_activity TO authenticated;
GRANT ALL ON TABLE public.client_contacts TO service_role;
GRANT ALL ON TABLE public.client_activity TO service_role;

-- 5. Access log -----------------------------------------------------------------

DROP TRIGGER IF EXISTS client_contacts_access_log ON public.client_contacts;
CREATE TRIGGER client_contacts_access_log
  AFTER INSERT OR UPDATE OR DELETE ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.log_client_change();

DROP TRIGGER IF EXISTS client_activity_access_log ON public.client_activity;
CREATE TRIGGER client_activity_access_log
  AFTER INSERT OR UPDATE OR DELETE ON public.client_activity
  FOR EACH ROW EXECUTE FUNCTION public.log_client_change();

COMMIT;
