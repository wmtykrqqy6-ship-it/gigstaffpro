-- CRM: "Upload logo" for email signatures. See docs/CRM.md.
--
-- Run AFTER 20261126130000_add_signature_logo.sql.
--
-- What this does: creates a Storage bucket 'email-assets' for the logo
-- images reps upload on Messages > My signature. It is public-read so that
-- clients' email apps can load the logo from its link (that's how every
-- email logo works). Nothing else goes in it. There are no upload policies:
-- only the server (service key) can add files, after checking the person is
-- an admin and the file is a real PNG, JPG or GIF under 500 KB.
--
-- Undo (only if needed; delete its files first in Storage):
--   DELETE FROM storage.buckets WHERE id = 'email-assets';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('email-assets', 'email-assets', true, 512000, ARRAY['image/png', 'image/jpeg', 'image/gif'])
ON CONFLICT (id) DO NOTHING;
