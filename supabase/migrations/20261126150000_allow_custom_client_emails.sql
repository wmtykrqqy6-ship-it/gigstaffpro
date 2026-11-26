-- CRM: custom automatic emails added in Settings > Email. See docs/CRM.md.
--
-- Run AFTER 20261125120000_add_client_messages.sql.
--
-- ---------------------------------------------------------------------------
-- What this does
-- ---------------------------------------------------------------------------
-- Admins can now add their own automatic emails (up to 10). Each one has a
-- short id, and the server records "this lead got it" in lead_emails_sent as
-- kind 'custom:<id>' so a client never gets the same email twice. The sent
-- copy is saved in client_messages as kind 'custom' so it shows in Messages.
--
-- Both columns only allowed the five built-in email kinds. This replaces
-- those two checks with ones that also allow the new values. Nothing else
-- changes: no rows, no RLS policies, no grants.
--
-- ---------------------------------------------------------------------------
-- Undo (only if needed, and only if no custom email has been sent yet)
-- ---------------------------------------------------------------------------
--   ALTER TABLE public.lead_emails_sent DROP CONSTRAINT lead_emails_sent_kind_check;
--   ALTER TABLE public.lead_emails_sent ADD CONSTRAINT lead_emails_sent_kind_check
--     CHECK (kind IN ('thankyou', 'upsell', 'prep', 'review'));
--   ALTER TABLE public.client_messages DROP CONSTRAINT client_messages_kind_check;
--   ALTER TABLE public.client_messages ADD CONSTRAINT client_messages_kind_check
--     CHECK (kind IN ('email', 'reply', 'followup', 'thankyou', 'upsell', 'prep', 'review'));

BEGIN;

ALTER TABLE public.lead_emails_sent DROP CONSTRAINT IF EXISTS lead_emails_sent_kind_check;
ALTER TABLE public.lead_emails_sent ADD CONSTRAINT lead_emails_sent_kind_check
  CHECK (kind IN ('thankyou', 'upsell', 'prep', 'review') OR kind ~ '^custom:[a-z0-9]{4,24}$');

ALTER TABLE public.client_messages DROP CONSTRAINT IF EXISTS client_messages_kind_check;
ALTER TABLE public.client_messages ADD CONSTRAINT client_messages_kind_check
  CHECK (kind IN ('email', 'reply', 'followup', 'thankyou', 'upsell', 'prep', 'review', 'custom'));

COMMIT;
