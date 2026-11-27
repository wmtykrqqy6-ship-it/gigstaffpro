-- CRM Phase 2, step 5: sending quotes and the client's quote page.
-- See docs/QUOTES.md.
--
-- Run AFTER 20261127160000_add_stock_pools.sql.
--
-- ---------------------------------------------------------------------------
-- What this does
-- ---------------------------------------------------------------------------
-- New columns on public.quotes (no policy changes; quotes stay admin-only):
--   * public_token: the random code in the client's link (/q/<code>). Made
--     by the server when a rep sends the quote; 32 URL-safe characters.
--     The client's page is served by the server with the service key, which
--     looks the quote up by this exact code. The browser never queries it.
--   * sent_snapshot: the quote exactly as sent (lines, totals, event,
--     contact), so the client always sees what was sent even if prices
--     change later.
--   * viewed_at: when the client first opened the link.
--   * accepted_name: the name the client typed to accept.
--   * gratuity_per_dealer: the optional gratuity the client added.
--
-- ---------------------------------------------------------------------------
-- Undo (only if needed)
-- ---------------------------------------------------------------------------
--   ALTER TABLE public.quotes DROP COLUMN IF EXISTS public_token,
--     DROP COLUMN IF EXISTS sent_snapshot, DROP COLUMN IF EXISTS viewed_at,
--     DROP COLUMN IF EXISTS accepted_name, DROP COLUMN IF EXISTS gratuity_per_dealer;

BEGIN;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS public_token text UNIQUE CHECK (public_token IS NULL OR public_token ~ '^[A-Za-z0-9_-]{32}$'),
  ADD COLUMN IF NOT EXISTS sent_snapshot jsonb CHECK (sent_snapshot IS NULL OR jsonb_typeof(sent_snapshot) = 'object'),
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_name text CHECK (accepted_name IS NULL OR length(accepted_name) <= 120),
  ADD COLUMN IF NOT EXISTS gratuity_per_dealer numeric(8, 2) CHECK (gratuity_per_dealer IS NULL OR gratuity_per_dealer BETWEEN 0 AND 500);

COMMIT;
