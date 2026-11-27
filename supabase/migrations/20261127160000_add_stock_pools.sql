-- CRM Phase 2, step 4: table availability for quotes. See docs/QUOTES.md.
--
-- Run AFTER 20261127150000_add_tax_rates.sql.
--
-- ---------------------------------------------------------------------------
-- What this does
-- ---------------------------------------------------------------------------
-- * public.stock_pools: how many of each kind of table you own. Several
--   price items can share one pool (Three Card, Let It Ride, Ultimate
--   Hold'em and Casino War all use the 13 bonus game tables). match_names
--   are the Goodshuffle item names on imported pull sheets, so events
--   already in the app count against the pool. Counts are from Dylan's
--   inventory list (Nov 2026; 8 ft craps now 2). Edited in Settings > Prices.
-- * price_items.stock_pool: which pool an item uses (NULL = not tracked).
-- * quotes.setup_minutes / pickup_minutes: how long before the start the
--   tables are delivered and after the end they're picked up (default 2
--   hours and 1 hour). Availability compares these windows, not dates,
--   because tables can work an early party and a later one the same day.
--
-- Access: stock_pools is admin-only (RLS public.is_admin()). Nothing
-- existing is loosened. Re-running the file only adds missing rows and
-- fills stock_pool where it is empty.
--
-- ---------------------------------------------------------------------------
-- Undo (only if needed)
-- ---------------------------------------------------------------------------
--   ALTER TABLE public.quotes DROP COLUMN IF EXISTS setup_minutes, DROP COLUMN IF EXISTS pickup_minutes;
--   ALTER TABLE public.price_items DROP COLUMN IF EXISTS stock_pool;
--   DROP TABLE IF EXISTS public.stock_pools;

BEGIN;

CREATE TABLE IF NOT EXISTS public.stock_pools (
  key         text PRIMARY KEY CHECK (key ~ '^[a-z0-9_]{2,40}$'),
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  owned       integer NOT NULL DEFAULT 0 CHECK (owned BETWEEN 0 AND 10000),
  match_names text[] NOT NULL DEFAULT '{}',
  sort_order  integer NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_pools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_pools_admin_all" ON public.stock_pools;
CREATE POLICY "stock_pools_admin_all" ON public.stock_pools
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.stock_pools FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stock_pools TO authenticated;
GRANT ALL ON TABLE public.stock_pools TO service_role;

INSERT INTO public.stock_pools (key, name, owned, match_names, sort_order) VALUES
  ('blackjack', 'Blackjack tables', 40, ARRAY['Blackjack Table']::text[], 10),
  ('blackjack_standup', 'Stand-up blackjack tables', 11, ARRAY['Blackjack Table Stand Up', 'Stand-up Blackjack Table']::text[], 20),
  ('bonus', 'Bonus game tables', 13, ARRAY['Bonus Game Tables', 'Three Card Poker', 'Let It Ride', 'Ultimate Texas Hold''em', 'Ultimate Texas Hold''EM', 'Casino War', 'Mississippi Stud', 'Caribbean Stud', 'Stud Poker']::text[], 30),
  ('pai_gow', 'Pai Gow tables', 1, ARRAY['Pai Gow Poker']::text[], 40),
  ('money_wheel', 'Money wheel tables', 3, ARRAY['Money Wheel Table']::text[], 50),
  ('roulette', 'Roulette tables', 10, ARRAY['Roulette Table']::text[], 60),
  ('lighted_roulette', 'Lighted roulette boards', 3, ARRAY['Upgraded Roulette (lighted board)', 'Upgraded Roulette with Lighted Board']::text[], 70),
  ('holdem', 'Texas Hold''em tables', 11, ARRAY['Texas Hold''em Poker', 'Texas Hold''EM Poker', 'Texas Hold''em Poker Table']::text[], 80),
  ('craps_8', '8 ft craps tables', 2, ARRAY['8ft Craps Table']::text[], 90),
  ('craps_10', '10 ft craps tables', 10, ARRAY['10ft Craps Table']::text[], 100),
  ('craps_12', '12 ft super craps tables', 1, ARRAY['12ft Craps Table', '12ft Super Craps Table']::text[], 110)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.price_items ADD COLUMN IF NOT EXISTS stock_pool text
  CHECK (stock_pool IS NULL OR stock_pool ~ '^[a-z0-9_]{2,40}$');

UPDATE public.price_items SET stock_pool = 'blackjack' WHERE key = 'blackjack' AND stock_pool IS NULL;
UPDATE public.price_items SET stock_pool = 'blackjack_standup' WHERE key = 'blackjack_standup' AND stock_pool IS NULL;
UPDATE public.price_items SET stock_pool = 'roulette' WHERE key = 'roulette' AND stock_pool IS NULL;
UPDATE public.price_items SET stock_pool = 'holdem' WHERE key = 'holdem' AND stock_pool IS NULL;
UPDATE public.price_items SET stock_pool = 'bonus' WHERE key = 'ultimate_holdem' AND stock_pool IS NULL;
UPDATE public.price_items SET stock_pool = 'bonus' WHERE key = 'casino_war' AND stock_pool IS NULL;
UPDATE public.price_items SET stock_pool = 'bonus' WHERE key = 'three_card' AND stock_pool IS NULL;
UPDATE public.price_items SET stock_pool = 'bonus' WHERE key = 'let_it_ride' AND stock_pool IS NULL;
UPDATE public.price_items SET stock_pool = 'pai_gow' WHERE key = 'pai_gow' AND stock_pool IS NULL;
UPDATE public.price_items SET stock_pool = 'money_wheel' WHERE key = 'money_wheel' AND stock_pool IS NULL;
UPDATE public.price_items SET stock_pool = 'craps_8' WHERE key = 'craps_8' AND stock_pool IS NULL;
UPDATE public.price_items SET stock_pool = 'craps_10' WHERE key = 'craps_10' AND stock_pool IS NULL;
UPDATE public.price_items SET stock_pool = 'craps_12' WHERE key = 'craps_12' AND stock_pool IS NULL;
UPDATE public.price_items SET stock_pool = 'lighted_roulette' WHERE key = 'lighted_roulette' AND stock_pool IS NULL;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS setup_minutes integer NOT NULL DEFAULT 120 CHECK (setup_minutes BETWEEN 0 AND 1440),
  ADD COLUMN IF NOT EXISTS pickup_minutes integer NOT NULL DEFAULT 60 CHECK (pickup_minutes BETWEEN 0 AND 1440);

COMMIT;
