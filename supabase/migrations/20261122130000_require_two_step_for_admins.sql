-- Phase 0 (CRM plan): the database only treats a login as an admin once it
-- has passed 2-step sign-in (an authenticator-app code).
--
-- RUN THIS LAST, and only after:
--   1. the app with 2-step sign-in is live, and
--   2. you (and every sales manager) have signed in once and set up the
--      authenticator app.
-- Run it earlier and any admin who hasn't set up 2-step yet can still sign
-- in and set it up (that part doesn't use is_admin()), but can't save or
-- see admin-only data until they do.
--
-- ---------------------------------------------------------------------------
-- What this does
-- ---------------------------------------------------------------------------
-- public.is_admin() is what every admin-only rule in the database uses
-- (client details, clients, venues, the access log, and admin writes to
-- events, workers, pay rates, settings, logistics...). Today it only checks
-- that the login is linked to an admin. After this it also checks that the
-- login's session passed 2-step sign-in (Supabase marks that as
-- aal = 'aal2' on the session token). So someone who has only the
-- password can't read client data by calling the database directly, even
-- if they skip the app's screens.
--
-- Workers are unaffected: they were never admins.
-- Server jobs use the service role, which doesn't go through these rules.
-- Signing in (get_authenticated_admin_profile) doesn't use is_admin(), so
-- an admin with only a password can still reach the 2-step screen.
--
-- ---------------------------------------------------------------------------
-- Check afterwards
-- ---------------------------------------------------------------------------
-- Sign out of the app, sign back in with your code, and open
-- Settings -> Clients. The list should load as before.
--
-- ---------------------------------------------------------------------------
-- Undo (puts back the password-only check)
-- ---------------------------------------------------------------------------
--   CREATE OR REPLACE FUNCTION public.is_admin()
--   RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
--   SET search_path TO 'public', 'pg_temp'
--   AS $f$
--     SELECT EXISTS (SELECT 1 FROM public.admin_auth_links
--                    WHERE auth_user_id = auth.uid());
--   $f$;
--
-- Locked out (lost phone)? See docs/CLIENT_SECURITY.md, "Lost phone".

BEGIN;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     AND EXISTS (
       SELECT 1 FROM public.admin_auth_links
       WHERE auth_user_id = auth.uid()
     );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

COMMIT;
