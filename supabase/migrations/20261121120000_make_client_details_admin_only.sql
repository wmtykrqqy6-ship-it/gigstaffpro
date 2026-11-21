-- Make event client details (client name + client contact) admin-only, and
-- lock the saved-clients list (public.clients) to admins.
--
-- ---------------------------------------------------------------------------
-- The exposure
-- ---------------------------------------------------------------------------
-- public.events has "events_public_read" (FOR SELECT USING (true), from
-- 20260826130000_restrict_events_writes_to_admin.sql), and the worker portal
-- loads every event with select('*'). So events.client and
-- events.client_contact (the client's name and phone/email) can be read by
-- every worker and by anyone holding the public anon key. Workers need the
-- rest of the event row (date, venue, address, positions...) to browse and
-- apply, so the row stays readable; only the client fields move.
--
-- public.clients (Settings -> Clients: name, phone, email) was created
-- outside the repo's migrations, so its read rules aren't known here. Only
-- admin screens use it, so it gets the same admin-only rule.
--
-- ---------------------------------------------------------------------------
-- What this does
-- ---------------------------------------------------------------------------
-- 1. New table public.event_client_details (one row per event), readable
--    and writable only by admins (is_admin()). anon gets no access at all.
-- 2. Copies every event's client + client_contact into it.
-- 3. Clears events.client and events.client_contact (the columns stay, so
--    nothing that names them breaks; they are just always NULL from now on).
-- 4. A trigger on events: whenever an insert/update puts a value in
--    events.client or events.client_contact, the value is saved to
--    event_client_details instead and the events columns are set back to
--    NULL. So the existing admin save paths (event form, Goodshuffle import,
--    Settings "Add missing clients") keep working unchanged, and even an old
--    browser tab can't put client details back on the public row.
-- 5. public.clients: RLS on, every existing policy dropped, one admin-only
--    policy added, anon access revoked.
--
-- The app (same PR) reads client details for admins from
-- event_client_details. Workers never showed client details, so the worker
-- portal is unaffected.
--
-- Data: no rows are deleted. Client details move from events into
-- event_client_details in the same transaction, so nothing is lost if any
-- step fails (the whole migration rolls back).
--
-- ---------------------------------------------------------------------------
-- Check afterwards (in the SQL editor)
-- ---------------------------------------------------------------------------
--   SELECT count(*) FROM public.event_client_details;           -- > 0
--   SELECT count(*) FROM public.events
--     WHERE client IS NOT NULL OR client_contact IS NOT NULL;   -- 0
--   SELECT policyname, cmd, qual FROM pg_policies
--     WHERE tablename IN ('clients', 'event_client_details');  -- admin only
--
-- ---------------------------------------------------------------------------
-- Undo (only if needed; puts the details back on the public events row)
-- ---------------------------------------------------------------------------
--   BEGIN;
--   DROP TRIGGER IF EXISTS events_move_client_details ON public.events;
--   UPDATE public.events e SET client = d.client, client_contact = d.client_contact
--     FROM public.event_client_details d WHERE d.event_id = e.id;
--   COMMIT;

BEGIN;

-- 1. Admin-only table -------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.event_client_details (
  -- DEFERRABLE so the BEFORE INSERT trigger below can save a brand-new
  -- event's details before the event row itself has been written.
  event_id       uuid PRIMARY KEY
                 REFERENCES public.events(id) ON DELETE CASCADE
                 DEFERRABLE INITIALLY DEFERRED,
  client         text,
  client_contact text,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_client_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_client_details_admin_all" ON public.event_client_details;
CREATE POLICY "event_client_details_admin_all" ON public.event_client_details
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.event_client_details FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.event_client_details TO authenticated;
GRANT ALL ON TABLE public.event_client_details TO service_role;

-- 2. Copy existing details --------------------------------------------------

INSERT INTO public.event_client_details (event_id, client, client_contact)
SELECT id, client, client_contact
FROM public.events
WHERE client IS NOT NULL OR client_contact IS NOT NULL
ON CONFLICT (event_id) DO UPDATE
  SET client = EXCLUDED.client,
      client_contact = EXCLUDED.client_contact,
      updated_at = now();

-- 3. Clear them from the public row (before the trigger exists, so this
--    doesn't write NULLs into the new table). Other triggers on events,
--    including any Supabase database webhooks, are paused for this one
--    statement so clearing the fields can't set off notifications. -------

ALTER TABLE public.events DISABLE TRIGGER USER;

UPDATE public.events
SET client = NULL, client_contact = NULL
WHERE client IS NOT NULL OR client_contact IS NOT NULL;

ALTER TABLE public.events ENABLE TRIGGER USER;

-- 4. Keep them off the public row from now on -------------------------------
--
-- Runs as the caller (SECURITY INVOKER): only admins can write events
-- (events_admin_write), and admins pass event_client_details' RLS.
-- A field counts as "set" when it differs from what's stored on events
-- (always NULL after step 3), so an update that doesn't touch the client
-- fields (e.g. positions, host) leaves the saved details alone, and an
-- update that sets only one field keeps the other.

CREATE OR REPLACE FUNCTION public.events_move_client_details()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  set_client  boolean;
  set_contact boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    set_client  := NEW.client IS NOT NULL;
    set_contact := NEW.client_contact IS NOT NULL;
  ELSE
    set_client  := NEW.client IS DISTINCT FROM OLD.client;
    set_contact := NEW.client_contact IS DISTINCT FROM OLD.client_contact;
  END IF;

  IF set_client OR set_contact THEN
    INSERT INTO public.event_client_details AS d (event_id, client, client_contact)
    VALUES (
      NEW.id,
      CASE WHEN set_client  THEN NEW.client END,
      CASE WHEN set_contact THEN NEW.client_contact END
    )
    ON CONFLICT (event_id) DO UPDATE
      SET client         = CASE WHEN set_client  THEN EXCLUDED.client         ELSE d.client END,
          client_contact = CASE WHEN set_contact THEN EXCLUDED.client_contact ELSE d.client_contact END,
          updated_at     = now();
  END IF;

  NEW.client := NULL;
  NEW.client_contact := NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.events_move_client_details() FROM PUBLIC;

DROP TRIGGER IF EXISTS events_move_client_details ON public.events;
CREATE TRIGGER events_move_client_details
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_move_client_details();

-- 5. Saved clients list: admins only ----------------------------------------

DO $$
DECLARE
  pol record;
BEGIN
  IF to_regclass('public.clients') IS NULL THEN
    RAISE NOTICE 'public.clients not found; skipping';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY';

  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clients'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.clients', pol.policyname);
  END LOOP;

  EXECUTE 'CREATE POLICY "clients_admin_all" ON public.clients
             FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin())';

  EXECUTE 'REVOKE ALL ON TABLE public.clients FROM anon';
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.clients TO authenticated';
END $$;

COMMIT;
