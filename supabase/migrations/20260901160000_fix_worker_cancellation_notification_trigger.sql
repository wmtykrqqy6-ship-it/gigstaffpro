-- Fixes a second live regression from the same root cause as
-- 20260901150000: removing a worker's assignment (App.jsx's
-- handleUnassignWorker, a plain `.from('assignments').delete()`) has been
-- failing with "permission denied for table workers" since
-- 20260826120000_revoke_worker_pin_hash_select.sql landed. Every admin
-- unassign is currently broken.
--
-- Root cause: public.notify_admin_cancellation(), the function behind the
-- non-SECURITY-DEFINER trigger "trigger_notify_admin_cancellation" (BEFORE
-- DELETE on public.assignments), does `SELECT * INTO worker_record FROM
-- workers WHERE id = OLD.worker_id`. Not being SECURITY DEFINER, that
-- SELECT * runs as the calling role -- the admin's own `authenticated`
-- session for any direct client-side unassign -- and `SELECT *` requires
-- privilege on every column, including pin_hash, which
-- 20260826120000_revoke_worker_pin_hash_select.sql correctly revoked from
-- `authenticated` (and `anon`) for an unrelated, valid reason.
--
-- Note: this trigger's only externally-visible effect is a RAISE NOTICE
-- (server log only, no listener) -- the actual admin-facing cancellation
-- notification is already sent by the separate "Worker Cancellation"
-- AFTER DELETE trigger, which posts to send-admin-notification directly
-- from OLD/NEW without ever touching the workers table. So this function
-- is currently dead beyond its own RAISE NOTICE; it's left in place here
-- (just fixed to the same narrow-SELECT pattern as the approval-trigger
-- fix) rather than dropped, since removing a trigger outright is a bigger
-- call than restoring the code path it was blocking. Worth revisiting
-- separately.
--
-- Fix: narrow the SELECT to just the columns actually used (worker_record
-- and event_record's `name` fields, in the RAISE NOTICE), keeping this
-- running as the caller's own role with no new SECURITY DEFINER surface.

CREATE OR REPLACE FUNCTION public.notify_admin_cancellation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  worker_record RECORD;
  event_record RECORD;
  admin_email TEXT;
BEGIN
  -- Get admin email
  SELECT setting_value::text INTO admin_email FROM settings WHERE setting_key = 'admin_email';
  admin_email := trim(both '"' from admin_email);

  IF admin_email IS NOT NULL THEN
    -- Get worker and event details (name only -- see migration header)
    SELECT id, name INTO worker_record FROM workers WHERE id = OLD.worker_id;
    SELECT id, name INTO event_record FROM events WHERE id = OLD.event_id;

    -- For now, just log it
    RAISE NOTICE 'Would send cancellation notification for % from event %', worker_record.name, event_record.name;
  END IF;

  RETURN OLD;
END;
$function$;
