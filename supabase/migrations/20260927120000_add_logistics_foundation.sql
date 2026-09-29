-- Delivery Logistics, phase 1: trucks, equipment catalog, per-event
-- equipment, and the Goodshuffle invoice link on events.
--
-- ---------------------------------------------------------------------------
-- What this adds
-- ---------------------------------------------------------------------------
-- events.goodshuffle_invoice  Goodshuffle project/invoice number from the
--                             pull sheet. Unique (nullable), so re-importing
--                             the same pull sheet updates that event instead
--                             of creating a duplicate.
-- events.delivery_type        e.g. "Standard Delivery Drop-Off", from the
--                             pull sheet's logistics block. The delivery
--                             address itself reuses the existing
--                             events.address column.
-- trucks                      Per-zone capacities used by the capacity check
--                             (src/utils/logistics/capacity.js). Seeded with
--                             Yellow / Black / White.
-- equipment_catalog           Goodshuffle item name -> size class. Seeded
--                             with every item on the sample pull sheet;
--                             unknown names are classified once during import
--                             and saved here.
-- event_equipment             Line items imported from an event's pull sheet.
--                             Accessories point at their parent table by
--                             line number (parent_line_no).
--
-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
-- Same pattern as 20260824120000_restrict_admin_only_table_writes.sql and
-- 20260826130000_restrict_events_writes_to_admin.sql: RLS on, reads open
-- (the phase 3 crew route in the worker portal will need to read trucks and
-- gear), INSERT/UPDATE/DELETE require public.is_admin(). Nothing here is
-- sensitive (no PII beyond what events already exposes).
--
-- ---------------------------------------------------------------------------
-- Scope / safety
-- ---------------------------------------------------------------------------
-- Additive only: two nullable columns on events, three new tables, seed
-- rows. No existing column, row, or policy is modified or removed. The app
-- only writes the new events columns from the Logistics import flow, so
-- event create/edit keeps working even before this is applied.

BEGIN;

-- ---- events -------------------------------------------------------------

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS goodshuffle_invoice text,
  ADD COLUMN IF NOT EXISTS delivery_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_goodshuffle_invoice_key'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_goodshuffle_invoice_key UNIQUE (goodshuffle_invoice);
  END IF;
END $$;

COMMENT ON COLUMN public.events.goodshuffle_invoice IS
  'Goodshuffle project/invoice number (from the pull sheet). Null for events not imported from Goodshuffle.';
COMMENT ON COLUMN public.events.delivery_type IS
  'Goodshuffle logistics type, e.g. "Standard Delivery Drop-Off".';

-- ---- trucks -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.trucks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT '#9CA3AF',
  craps_capacity integer NOT NULL DEFAULT 0 CHECK (craps_capacity >= 0),
  craps_stretch integer NOT NULL DEFAULT 0 CHECK (craps_stretch >= 0),
  roulette_capacity integer NOT NULL DEFAULT 0 CHECK (roulette_capacity >= 0),
  poker_capacity integer NOT NULL DEFAULT 0 CHECK (poker_capacity >= 0),
  blackjack_capacity integer NOT NULL DEFAULT 0 CHECK (blackjack_capacity >= 0),
  can_carry_archway boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 99,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.trucks.craps_stretch IS
  'Max craps-zone units including stretch space. Using more than craps_capacity (up to this) is allowed with a warning.';
COMMENT ON COLUMN public.trucks.priority IS
  'Suggestion order: the capacity check suggests the lowest-priority truck where a load is green.';

INSERT INTO public.trucks
  (name, color, craps_capacity, craps_stretch, roulette_capacity, poker_capacity, blackjack_capacity, can_carry_archway, priority)
VALUES
  ('Yellow', '#FACC15', 1, 2, 2, 2, 10, false, 1),
  ('Black',  '#111827', 2, 3, 2, 2, 14, false, 2),
  ('White',  '#FFFFFF', 4, 4, 2, 2, 20, true,  3)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.trucks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trucks_public_read" ON public.trucks;
CREATE POLICY "trucks_public_read" ON public.trucks
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "trucks_admin_write" ON public.trucks;
CREATE POLICY "trucks_admin_write" ON public.trucks
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON TABLE public.trucks TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.trucks TO authenticated;
GRANT ALL ON TABLE public.trucks TO service_role;

-- ---- equipment_catalog --------------------------------------------------

CREATE TABLE IF NOT EXISTS public.equipment_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goodshuffle_name text NOT NULL,
  -- Lowercased, quote/whitespace-normalized goodshuffle_name (computed by
  -- normalizeItemName() in src/utils/logistics/catalog.js). The unique key,
  -- so "Texas Hold’EM Poker" and "texas hold'em poker" are one entry.
  name_key text NOT NULL UNIQUE,
  size_class text NOT NULL CHECK (size_class IN (
    'craps', 'roulette', 'poker', 'blackjack', 'chairs',
    'archway', 'decor', 'accessory', 'package', 'ignore'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.equipment_catalog (goodshuffle_name, name_key, size_class) VALUES
  ('50 Guests Package',      '50 guests package',      'package'),
  ('Blackjack Table',        'blackjack table',        'blackjack'),
  ('10ft Craps Table',       '10ft craps table',       'craps'),
  ('Roulette Table',         'roulette table',         'roulette'),
  ('Texas Hold''EM Poker',   'texas hold''em poker',   'poker'),
  ('Chip Trays',             'chip trays',             'accessory'),
  ('Double Decks of Cards',  'double decks of cards',  'accessory'),
  ('Single Decks of Cards',  'single decks of cards',  'accessory'),
  ('Craps Chip',             'craps chip',             'accessory'),
  ('Craps Stick and Dice',   'craps stick and dice',   'accessory'),
  ('Roulette Chips',         'roulette chips',         'accessory'),
  ('Roulette Wheel',         'roulette wheel',         'accessory'),
  ('Dealer Pucks',           'dealer pucks',           'accessory')
ON CONFLICT (name_key) DO NOTHING;

ALTER TABLE public.equipment_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "equipment_catalog_public_read" ON public.equipment_catalog;
CREATE POLICY "equipment_catalog_public_read" ON public.equipment_catalog
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "equipment_catalog_admin_write" ON public.equipment_catalog;
CREATE POLICY "equipment_catalog_admin_write" ON public.equipment_catalog
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON TABLE public.equipment_catalog TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.equipment_catalog TO authenticated;
GRANT ALL ON TABLE public.equipment_catalog TO service_role;

-- ---- event_equipment ----------------------------------------------------

CREATE TABLE IF NOT EXISTS public.event_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  -- Position on the pull sheet (1-based). Accessories reference their
  -- parent table's line_no via parent_line_no.
  line_no integer NOT NULL,
  item_name text NOT NULL,
  -- Snapshot of the catalog class at import time (re-import refreshes it).
  size_class text NOT NULL CHECK (size_class IN (
    'craps', 'roulette', 'poker', 'blackjack', 'chairs',
    'archway', 'decor', 'accessory', 'package', 'ignore'
  )),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  parent_line_no integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, line_no)
);

CREATE INDEX IF NOT EXISTS event_equipment_event_id_idx ON public.event_equipment (event_id);

ALTER TABLE public.event_equipment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "event_equipment_public_read" ON public.event_equipment;
CREATE POLICY "event_equipment_public_read" ON public.event_equipment
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "event_equipment_admin_write" ON public.event_equipment;
CREATE POLICY "event_equipment_admin_write" ON public.event_equipment
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON TABLE public.event_equipment TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.event_equipment TO authenticated;
GRANT ALL ON TABLE public.event_equipment TO service_role;

COMMIT;
