-- Phase 0 (CRM plan): sales manager role, venues admin-only, and an
-- access log for client records.
--
-- Run AFTER 20261121120000_make_client_details_admin_only.sql (it stops
-- with a clear message if that one hasn't been run yet).
--
-- ---------------------------------------------------------------------------
-- What this does
-- ---------------------------------------------------------------------------
-- 1. Sales managers. public.admin_users gets a role column: 'admin'
--    (everyone today, the default) or 'sales_manager'. Sales managers get a
--    normal admin login (admin_auth_links), so is_admin() is true for them
--    and they can see and do everything an admin can, as decided
--    2026-11-21. The role is a label for the access log and the app.
--    public.my_staff_role() returns the signed-in person's role.
--    admin_users.password_hash (the old pre-Supabase-Auth admin password,
--    no longer used for login) stops being required, so a new login can
--    be added without one. See docs/CLIENT_SECURITY.md for adding one.
-- 2. public.venues (Settings -> Venues: contact name, phone, email):
--    RLS on, existing policies replaced by one admin-only policy, anon
--    access revoked. Only admin screens read it; workers see the venue
--    name and address on the event itself, which doesn't change.
-- 3. public.client_access_log: who viewed, exported, added, changed or
--    deleted a client record, and when.
--    * Adds, changes and deletes on public.clients and
--      public.event_client_details are written by database triggers, so
--      they're logged however the change was made.
--    * Views and exports are logged by the app through
--      public.log_client_access(), which takes the person from their
--      login (auth.uid()), so an entry can't be made in someone else's
--      name.
--    * Admins (and sales managers) can read it. Nobody can edit or delete
--      entries through the app or the API: there are no insert, update or
--      delete permissions on the table, only the two logging functions.
--    * Changes record which fields changed, not the old or new values, so
--      the log doesn't become a second copy of the contact details.
--
-- Data: nothing is deleted or rewritten. Existing admins get role 'admin'.
--
-- ---------------------------------------------------------------------------
-- Check afterwards (in the SQL editor)
-- ---------------------------------------------------------------------------
--   SELECT username, role FROM public.admin_users;              -- all 'admin'
--   SELECT policyname, cmd, qual FROM pg_policies
--     WHERE tablename IN ('venues', 'client_access_log');      -- admin only
--   -- Edit a client in Settings -> Clients, then:
--   SELECT at, actor_name, action, record_type, label, changed_fields
--     FROM public.client_access_log ORDER BY at DESC LIMIT 5;
--
-- ---------------------------------------------------------------------------
-- Undo (only if needed)
-- ---------------------------------------------------------------------------
--   BEGIN;
--   DROP TRIGGER IF EXISTS clients_access_log ON public.clients;
--   DROP TRIGGER IF EXISTS event_client_details_access_log ON public.event_client_details;
--   DROP FUNCTION IF EXISTS public.log_client_change();
--   DROP FUNCTION IF EXISTS public.log_client_access(text, text, text[], jsonb);
--   DROP TABLE IF EXISTS public.client_access_log;
--   DROP FUNCTION IF EXISTS public.my_staff_role();
--   ALTER TABLE public.admin_users DROP COLUMN IF EXISTS role;
--   -- venues: re-create whatever read policy you want it to have
--   COMMIT;

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.event_client_details') IS NULL THEN
    RAISE EXCEPTION 'Run 20261121120000_make_client_details_admin_only.sql first';
  END IF;
END $$;

-- 1. Sales manager role ------------------------------------------------------

ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'admin';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_users_role_check'
      AND conrelid = 'public.admin_users'::regclass
  ) THEN
    ALTER TABLE public.admin_users
      ADD CONSTRAINT admin_users_role_check
      CHECK (role IN ('admin', 'sales_manager'));
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_users'
      AND column_name = 'password_hash' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.admin_users ALTER COLUMN password_hash DROP NOT NULL;
  END IF;
END $$;

-- The signed-in person's role, or NULL if they aren't an admin login.
CREATE OR REPLACE FUNCTION public.my_staff_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT u.role
  FROM public.admin_auth_links l
  JOIN public.admin_users u ON u.id = l.admin_user_id
  WHERE l.auth_user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.my_staff_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_staff_role() TO authenticated;

-- 2. Venues: admins only -----------------------------------------------------

DO $$
DECLARE
  pol record;
BEGIN
  IF to_regclass('public.venues') IS NULL THEN
    RAISE NOTICE 'public.venues not found; skipping';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY';

  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'venues'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.venues', pol.policyname);
  END LOOP;

  EXECUTE 'CREATE POLICY "venues_admin_all" ON public.venues
             FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin())';

  EXECUTE 'REVOKE ALL ON TABLE public.venues FROM anon';
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.venues TO authenticated';
END $$;

-- 3. Access log --------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.client_access_log (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at             timestamptz NOT NULL DEFAULT now(),
  auth_user_id   uuid,          -- NULL = a server job (service role)
  actor_name     text,          -- admin_users.username at the time
  actor_role     text,          -- 'admin' / 'sales_manager' at the time
  action         text NOT NULL
                 CHECK (action IN ('view', 'export', 'create', 'update', 'delete')),
  record_type    text NOT NULL, -- 'clients' or 'event_client_details'
  record_id      text,          -- one record; NULL for a list view/export
  record_count   integer,       -- how many records a view/export covered
  label          text,          -- client name, so a deleted one is still named
  changed_fields text[],        -- updates: which fields changed (no values)
  details        jsonb
);

CREATE INDEX IF NOT EXISTS client_access_log_at_idx
  ON public.client_access_log (at DESC);

ALTER TABLE public.client_access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_access_log_admin_read" ON public.client_access_log;
CREATE POLICY "client_access_log_admin_read" ON public.client_access_log
  FOR SELECT USING (public.is_admin());

REVOKE ALL ON TABLE public.client_access_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.client_access_log TO authenticated;
GRANT ALL ON TABLE public.client_access_log TO service_role;

-- Changes: one row per added, changed or deleted record.
CREATE OR REPLACE FUNCTION public.log_client_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  rec       jsonb;
  old_rec   jsonb;
  changed   text[];
  v_name    text;
  v_role    text;
  v_id      text;
  v_label   text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    rec := to_jsonb(OLD);
  ELSE
    rec := to_jsonb(NEW);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    old_rec := to_jsonb(OLD);
    SELECT array_agg(n.key ORDER BY n.key) INTO changed
    FROM jsonb_each(rec) n
    WHERE n.key NOT IN ('updated_at', 'created_at')
      AND n.value IS DISTINCT FROM (old_rec -> n.key);
    IF changed IS NULL THEN
      RETURN NULL; -- nothing really changed
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'event_client_details' THEN
    v_id := rec ->> 'event_id';
    v_label := rec ->> 'client';
  ELSE
    v_id := rec ->> 'id';
    v_label := coalesce(rec ->> 'name', rec ->> 'company');
  END IF;

  SELECT u.username, u.role INTO v_name, v_role
  FROM public.admin_auth_links l
  JOIN public.admin_users u ON u.id = l.admin_user_id
  WHERE l.auth_user_id = auth.uid()
  LIMIT 1;

  INSERT INTO public.client_access_log
    (auth_user_id, actor_name, actor_role, action, record_type,
     record_id, record_count, label, changed_fields)
  VALUES
    (auth.uid(), v_name, v_role,
     CASE TG_OP WHEN 'INSERT' THEN 'create' WHEN 'UPDATE' THEN 'update' ELSE 'delete' END,
     TG_TABLE_NAME, v_id, 1, v_label, changed);

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.log_client_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS clients_access_log ON public.clients;
CREATE TRIGGER clients_access_log
  AFTER INSERT OR UPDATE OR DELETE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.log_client_change();

DROP TRIGGER IF EXISTS event_client_details_access_log ON public.event_client_details;
CREATE TRIGGER event_client_details_access_log
  AFTER INSERT OR UPDATE OR DELETE ON public.event_client_details
  FOR EACH ROW EXECUTE FUNCTION public.log_client_change();

-- Views and exports, called by the app. Admins only; the person is taken
-- from the login, never from the arguments.
CREATE OR REPLACE FUNCTION public.log_client_access(
  p_action      text,
  p_record_type text,
  p_record_ids  text[] DEFAULT NULL,
  p_details     jsonb  DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_name text;
  v_role text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('view', 'export') THEN
    RAISE EXCEPTION 'action must be view or export';
  END IF;
  IF p_record_type NOT IN ('clients', 'event_client_details') THEN
    RAISE EXCEPTION 'unknown record type';
  END IF;

  SELECT u.username, u.role INTO v_name, v_role
  FROM public.admin_auth_links l
  JOIN public.admin_users u ON u.id = l.admin_user_id
  WHERE l.auth_user_id = auth.uid()
  LIMIT 1;

  INSERT INTO public.client_access_log
    (auth_user_id, actor_name, actor_role, action, record_type,
     record_id, record_count, details)
  VALUES
    (auth.uid(), v_name, v_role, p_action, p_record_type,
     CASE WHEN cardinality(p_record_ids) = 1 THEN p_record_ids[1] END,
     coalesce(cardinality(p_record_ids), 0),
     p_details);
END;
$$;

REVOKE ALL ON FUNCTION public.log_client_access(text, text, text[], jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_client_access(text, text, text[], jsonb) TO authenticated;

COMMIT;
