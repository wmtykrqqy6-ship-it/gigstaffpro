-- CRM Phase 2: e-signature record for accepted quotes. See docs/QUOTES.md.
--
-- Run AFTER 20261127170000_add_quote_sending.sql.
--
-- ---------------------------------------------------------------------------
-- What this does
-- ---------------------------------------------------------------------------
-- New column on public.quotes (no policy changes; quotes stay admin-only):
--   * signature: what the server saves when a client accepts on the quote
--     page: the typed name, the time, IP address, device (browser), the
--     exact terms they accepted, and fingerprints (SHA-256) of the quote and
--     the terms, so a later change would show. Written only by the server
--     (service key); admins can read it.
--
-- ---------------------------------------------------------------------------
-- Undo (only if needed)
-- ---------------------------------------------------------------------------
--   ALTER TABLE public.quotes DROP COLUMN IF EXISTS signature;

BEGIN;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS signature jsonb CHECK (signature IS NULL OR jsonb_typeof(signature) = 'object');

COMMIT;
