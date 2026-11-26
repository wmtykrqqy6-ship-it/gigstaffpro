-- CRM: an optional logo under each rep's email signature. See docs/CRM.md.
--
-- Run AFTER 20261126120000_add_admin_email_signatures.sql.
--
-- What this does: adds logo_url (a web link to the logo image, https only)
-- to public.admin_email_signatures. The image itself stays on the website
-- (e.g. vegasonwheels.com), so clients' email loads it from there. Same
-- access as the rest of the table: server only.
--
-- Undo (only if needed):
--   ALTER TABLE public.admin_email_signatures DROP COLUMN IF EXISTS logo_url;

BEGIN;

ALTER TABLE public.admin_email_signatures
  ADD COLUMN IF NOT EXISTS logo_url text
  CHECK (logo_url IS NULL OR (length(logo_url) <= 500 AND logo_url LIKE 'https://%'));

COMMIT;
