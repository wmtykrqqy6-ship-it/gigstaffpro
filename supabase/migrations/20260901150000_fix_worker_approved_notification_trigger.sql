-- Fixes a live regression: approving a worker (application approval, or
-- standby promotion) has been failing with "permission denied for table
-- workers" (HTTP 403) since 20260826120000_revoke_worker_pin_hash_select.sql
-- landed.
--
-- ---------------------------------------------------------------------------
-- Root cause
-- ---------------------------------------------------------------------------
-- public.notify_worker_application_approved(), the function behind the
-- non-SECURITY-DEFINER trigger "trigger_notify_worker_approved" on
-- public.assignments, does `SELECT * INTO worker_record FROM workers ...`.
-- Because the trigger isn't SECURITY DEFINER, that SELECT * runs as the
-- calling role -- the admin's own `authenticated` session for any direct
-- client-side approval (ApplicationsView.jsx's Approve button and standby
-- promotion, AssignWorkersModal.jsx's Promote button). `SELECT *` requires
-- privilege on every column, including pin_hash, which
-- 20260826120000_revoke_worker_pin_hash_select.sql correctly revoked from
-- `authenticated` (and `anon`) for an unrelated, valid reason -- protecting
-- legacy workers' login credential from client-readable exposure. Nobody
-- anticipated that revoke breaking this trigger, since apply/cancel/etc.
-- (api/worker-actions.js) run under service_role, which still has
-- unconditional table-level access and was never affected -- only paths
-- that set assignments.status = 'approved' directly from an authenticated
-- admin session hit this.
--
-- ---------------------------------------------------------------------------
-- Fix
-- ---------------------------------------------------------------------------
-- The function only ever reads worker_record.name, .email, and .phone (see
-- the notification payload below) -- none of which require pin_hash.
-- Narrowing the SELECT to just the columns actually used keeps this
-- running as the caller's own role (least privilege preserved, no new
-- SECURITY DEFINER surface) while no longer touching a column the caller
-- was never granted.
--
-- No trigger definition changes, no RLS/grant changes, no schema changes.
-- Only this one function body.

CREATE OR REPLACE FUNCTION public.notify_worker_application_approved()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  worker_record RECORD;
  event_record RECORD;
BEGIN
  -- Only trigger when status changes to 'approved'
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN

    -- Get worker details (name/email/phone only -- see migration header)
    SELECT id, name, email, phone INTO worker_record FROM workers WHERE id = NEW.worker_id;

    -- Get event details
    SELECT * INTO event_record FROM events WHERE id = NEW.event_id;

    -- Check if worker has email
    IF worker_record.email IS NOT NULL AND worker_record.email != '' THEN

      -- Call Edge Function to send email
      PERFORM net.http_post(
        url := 'https://ycsauzvkrbcynifkawuw.supabase.co/functions/v1/send-worker-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2F1enZrcmJjeW5pZmthd3V3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3MDQ4NTcsImV4cCI6MjA4NDI4MDg1N30.07H2LXdn2XKfpcrSmrp7_G0KXIJMH27fmJpCok10lrc'
        ),
        body := jsonb_build_object(
          'type', 'application_approved',
          'worker', jsonb_build_object(
            'name', worker_record.name,
            'email', worker_record.email,
            'phone', worker_record.phone
          ),
          'event', jsonb_build_object(
            'name', event_record.name,
            'date', event_record.date,
            'time', event_record.time,
            'venue', event_record.venue,
            'room', event_record.room,
            'address', event_record.address
          ),
          'position', NEW.position
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
