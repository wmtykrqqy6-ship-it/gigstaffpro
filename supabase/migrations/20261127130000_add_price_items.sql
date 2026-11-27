-- CRM Phase 2, step 1: the price list. See docs/QUOTES.md.
--
-- Run AFTER 20261127120000_add_message_delete_and_block.sql (either order
-- works; nothing here depends on it).
--
-- ---------------------------------------------------------------------------
-- What this does
-- ---------------------------------------------------------------------------
-- public.price_items: everything a quote can charge for (tables, packages,
-- staff hours, fees, add-ons, discounts), edited in Settings > Prices.
--   * key: a stable code the quote's pricing rules look for (extra_hour,
--     setup_fee, setup_fee_far, travel_per_dealer, fundraiser_discount,
--     gratuity, craps_10, ...). Items added in Settings get a generated key.
--   * price NULL = priced on each quote (magician, gratuity).
--   * dealers: dealers each unit needs (tables only).
--   * bonus_game: a table that counts as a package's "bonus game".
--   * contents (packages only): [{"key": "blackjack", "qty": 3}, ...];
--     "bonus" means any bonus-game table.
--   * taxable: false only where the price already includes tax.
-- Seeded from Dylan's price list sheet (website prices, Goodshuffle add-ons)
-- and the table descriptions on his Goodshuffle contract. Re-running the file
-- adds missing rows and never overwrites edits made in Settings.
--
-- Access: admins and sales managers only (RLS public.is_admin()), like the
-- other CRM tables. The client's quote page will read prices through the
-- server (service key), never from the browser.
--
-- ---------------------------------------------------------------------------
-- Undo (only if needed)
-- ---------------------------------------------------------------------------
--   DROP TABLE IF EXISTS public.price_items;

BEGIN;

CREATE TABLE IF NOT EXISTS public.price_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9_]{2,40}$'),
  category    text NOT NULL CHECK (category IN ('table', 'package', 'staff', 'fee', 'addon', 'event', 'discount')),
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  unit        text NOT NULL DEFAULT 'each' CHECK (unit IN ('each', 'table', 'dealer', 'dealer_hour', 'event', 'custom')),
  price       numeric(10, 2) CHECK (price IS NULL OR price BETWEEN -100000 AND 1000000),
  dealers     integer NOT NULL DEFAULT 0 CHECK (dealers BETWEEN 0 AND 20),
  size        text CHECK (size IS NULL OR length(size) <= 120),
  taxable     boolean NOT NULL DEFAULT true,
  bonus_game  boolean NOT NULL DEFAULT false,
  contents    jsonb CHECK (contents IS NULL OR jsonb_typeof(contents) = 'array'),
  description text CHECK (description IS NULL OR length(description) <= 2000),
  photo_url   text CHECK (photo_url IS NULL OR photo_url ~ '^https://'),
  active      boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.price_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "price_items_admin_all" ON public.price_items;
CREATE POLICY "price_items_admin_all" ON public.price_items
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.price_items FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.price_items TO authenticated;
GRANT ALL ON TABLE public.price_items TO service_role;

INSERT INTO public.price_items (key, category, name, unit, price, dealers, size, taxable, bonus_game, contents, description, sort_order) VALUES
  ('blackjack', 'table', 'Blackjack Table', 'table', 325, 1, '7 players, 6 x 9 ft', true, false, NULL, 'Our blackjack rentals are the perfect addition to any party or event, offering the classic casino game that''s fun for all ages. Our blackjack table rentals feature a semi-circular shape with a green felt surface and designated areas for placing bets. We provide professional dealers and equipment to ensure an authentic casino experience. Blackjack tables accommodate 7 guests at one time. Client to provide 8 chairs for each table rented. Our blackjack table comes with one dealer.', 10),
  ('blackjack_standup', 'table', 'Stand-up Blackjack Table', 'table', 325, 1, NULL, true, true, NULL, NULL, 20),
  ('roulette', 'table', 'Roulette Table', 'table', 475, 1, '8 players, 6 x 12 ft', true, false, NULL, 'Our roulette tables are designed to provide an authentic and engaging gaming experience. Our high-quality roulette tables feature a captivating layout with a high quality wooden wheel. Each table is meticulously crafted to replicate the atmosphere of a real casino, ensuring that your guests enjoy a truly immersive experience. Roulette accommodates 8 guests at one-time. Roulette table rentals include one dealer.', 30),
  ('holdem', 'table', 'Texas Hold''em Poker Table', 'table', 375, 1, '10 players, 6 x 12 ft', true, false, NULL, NULL, 40),
  ('ultimate_holdem', 'table', 'Ultimate Texas Hold''em', 'table', 325, 1, NULL, true, true, NULL, NULL, 50),
  ('casino_war', 'table', 'Casino War', 'table', 325, 1, '7 players, 6 x 9 ft', true, true, NULL, NULL, 60),
  ('pai_gow', 'table', 'Pai Gow Poker', 'table', 325, 1, '7 players, 6 x 9 ft', true, true, NULL, NULL, 70),
  ('three_card', 'table', 'Three Card Poker', 'table', 325, 1, NULL, true, true, NULL, NULL, 80),
  ('let_it_ride', 'table', 'Let It Ride', 'table', 325, 1, NULL, true, true, NULL, NULL, 90),
  ('money_wheel', 'table', 'Money Wheel Table', 'table', 325, 1, '7 players, 6 x 9 ft', true, true, NULL, 'Spin with us by taking a chance and spinning our Big Wheel. The money wheel is a casino game that is played on a large vertical wheel with different sections that are marked with various amounts of money or symbols. Each section has different payouts depending on the probability. Money Wheel table requires 8 chairs. Chairs are provided by the client. Our money wheel table includes one dealer.', 100),
  ('craps_8', 'table', '8ft Craps Table', 'table', 600, 1, '8 players, 7 x 12 ft', true, false, NULL, NULL, 110),
  ('craps_10', 'table', '10ft Craps Table', 'table', 800, 2, '12 players, 6 x 14 ft', true, false, NULL, 'At Vegas on Wheels, we provide high-quality craps table rentals to enhance your casino-themed event. Our craps tables feature a vibrant layout with clearly marked betting areas and a variety of betting options. With professional-grade craftsmanship, our tables ensure an authentic and immersive gaming atmosphere. Our 10ft Craps table will accommodate 12 guests at one-time. Our 10ft Craps table includes two dealers.', 120),
  ('craps_12', 'table', '12ft Super Craps Table', 'table', 950, 3, '16 players, 6 x 18 ft', true, false, NULL, NULL, 130),
  ('package_50', 'package', '50 Guests Package', 'event', 2625, 0, NULL, true, false, '[{"key": "blackjack", "qty": 3}, {"key": "roulette", "qty": 1}, {"key": "holdem", "qty": 1}, {"key": "craps_10", "qty": 1}]'::jsonb, NULL, 140),
  ('package_75', 'package', '75 Guests Package', 'event', 3600, 0, NULL, true, false, '[{"key": "blackjack", "qty": 5}, {"key": "roulette", "qty": 1}, {"key": "holdem", "qty": 1}, {"key": "craps_10", "qty": 1}, {"key": "bonus", "qty": 1}]'::jsonb, NULL, 150),
  ('package_100', 'package', '100 Guests Package', 'event', 5225, 0, NULL, true, false, '[{"key": "blackjack", "qty": 9}, {"key": "roulette", "qty": 1}, {"key": "holdem", "qty": 1}, {"key": "craps_10", "qty": 1}, {"key": "bonus", "qty": 2}]'::jsonb, NULL, 160),
  ('package_150', 'package', '150 Guests Package', 'event', 7525, 0, NULL, true, false, '[{"key": "blackjack", "qty": 11}, {"key": "roulette", "qty": 2}, {"key": "holdem", "qty": 2}, {"key": "craps_10", "qty": 2}, {"key": "bonus", "qty": 2}]'::jsonb, NULL, 170),
  ('package_200', 'package', '200 Guests Package', 'event', 9950, 0, NULL, true, false, '[{"key": "blackjack", "qty": 15}, {"key": "roulette", "qty": 2}, {"key": "holdem", "qty": 2}, {"key": "craps_10", "qty": 3}, {"key": "bonus", "qty": 3}]'::jsonb, NULL, 180),
  ('package_250', 'package', '250 Guests Package', 'event', 12075, 0, NULL, true, false, '[{"key": "blackjack", "qty": 19}, {"key": "roulette", "qty": 2}, {"key": "holdem", "qty": 3}, {"key": "craps_10", "qty": 2}, {"key": "craps_12", "qty": 1}, {"key": "bonus", "qty": 4}]'::jsonb, NULL, 190),
  ('extra_hour', 'staff', 'Additional hour (booked ahead)', 'dealer_hour', 75, 0, NULL, true, false, NULL, 'Per dealer, per hour past the standard 3 hours, when added before the event. Tax is added.', 200),
  ('extra_hour_at_event', 'staff', 'Additional hour (added at the event)', 'dealer_hour', 80, 0, NULL, false, false, NULL, 'Per dealer, per hour, when added during the event and paid at the end. Tax is included in the price.', 210),
  ('dealers_only_small', 'staff', 'Dealers only (2 to 3 dealers, no tables)', 'event', 450, 0, NULL, true, false, NULL, NULL, 220),
  ('dealers_only_medium', 'staff', 'Dealers only (4 to 6 dealers, no tables)', 'event', 900, 0, NULL, true, false, NULL, NULL, 230),
  ('dealers_only_large', 'staff', 'Dealers only (8+ dealers, no tables)', 'event', 1800, 0, NULL, true, false, NULL, NULL, 240),
  ('setup_fee', 'fee', 'Standard Delivery (Drop-Off)', 'event', 350, 0, NULL, true, false, NULL, 'First floor setup and delivery with no stairs. Second floor set up and delivery with elevator.', 250),
  ('setup_fee_far', 'fee', 'Delivery past 30 miles', 'event', 450, 0, NULL, true, false, NULL, 'Setup and delivery when the event is more than 30 miles from our warehouse. First floor setup and delivery with no stairs. Second floor set up and delivery with elevator.', 260),
  ('travel_per_dealer', 'fee', 'Dealer travel fee', 'dealer', 75, 0, NULL, true, false, NULL, 'Per dealer, when the event is more than 30 miles from our warehouse.', 270),
  ('gratuity', 'fee', 'Gratuity for dealers', 'dealer', NULL, 0, NULL, false, false, NULL, 'Optional. Gratuity is at your discretion and goes to the dealers at your event.', 280),
  ('chairs', 'addon', 'Chairs', 'each', 4, 0, NULL, true, false, NULL, NULL, 290),
  ('folding_chair', 'addon', 'Folding Chair', 'each', 5, 0, NULL, true, false, NULL, NULL, 300),
  ('table_rental', 'addon', 'Table Rental (plain table)', 'each', 30, 0, NULL, true, false, NULL, NULL, 310),
  ('lighted_roulette', 'addon', 'Upgraded Roulette with Lighted Board', 'table', 200, 0, NULL, true, false, NULL, NULL, 320),
  ('dj', 'addon', 'DJ Service', 'event', 1200, 0, NULL, true, false, NULL, NULL, 330),
  ('photo_booth', 'addon', 'Photo Booth (green screen and props)', 'event', 975, 0, NULL, true, false, NULL, NULL, 340),
  ('archway', 'addon', 'Archway Decorations', 'event', 3000, 0, NULL, true, false, NULL, NULL, 350),
  ('marquee', 'addon', 'CASINO Marquee Letters', 'event', 750, 0, NULL, true, false, NULL, NULL, 360),
  ('showgirls', 'addon', 'Fabulous Showgirls', 'event', 2000, 0, NULL, true, false, NULL, NULL, 370),
  ('jumbo_cards', 'addon', 'Large Playing Cards (prop)', 'event', 550, 0, NULL, true, false, NULL, NULL, 380),
  ('magician', 'addon', 'Magician', 'custom', NULL, 0, NULL, true, false, NULL, NULL, 390),
  ('decorations', 'addon', 'Casino Decorations', 'event', NULL, 0, NULL, true, false, NULL, NULL, 400),
  ('custom_chips', 'addon', 'Custom Chips', 'event', NULL, 0, NULL, true, false, NULL, NULL, 410),
  ('poker_tournament', 'event', 'Poker Tournament', 'event', NULL, 0, NULL, true, false, NULL, NULL, 420),
  ('night_at_races', 'event', 'Night at the Races', 'event', NULL, 0, NULL, true, false, NULL, NULL, 430),
  ('fundraiser_discount', 'discount', 'Fundraiser discount', 'table', -50, 0, NULL, true, false, NULL, '$50 off per table for fundraisers, April to October, within 30 miles of Milwaukee.', 440)
ON CONFLICT (key) DO NOTHING;

COMMIT;
