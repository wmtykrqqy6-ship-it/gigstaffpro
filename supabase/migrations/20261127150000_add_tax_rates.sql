-- CRM Phase 2, step 3: sales tax rates for quotes. See docs/QUOTES.md.
--
-- Run AFTER 20261127140000_add_quotes.sql.
--
-- ---------------------------------------------------------------------------
-- What this does
-- ---------------------------------------------------------------------------
-- public.tax_rates: the total Wisconsin sales tax rate (5% state + county,
-- plus city where one applies) for each area. The quote builder looks up the
-- event address's county and city and fills in the rate; reps can still
-- change it on the quote. Rates are edited in Settings > Prices.
--   * area: the name shown ("Waukesha County", "City of Milwaukee").
--   * kind 'county' matches by county; kind 'city' matches county + city
--     and wins over its county.
-- Seeded from the Wisconsin Department of Revenue chart (Nov 23, 2026):
-- 0.5% county tax in most counties, Milwaukee County 0.9%, Waukesha and
-- Winnebago none, City of Milwaukee +2%. Resort taxes are left out: they
-- apply only to certain sellers (lodging, food). Re-running the file only
-- adds missing rows.
--
-- Access: admins and sales managers only (RLS public.is_admin()).
--
-- ---------------------------------------------------------------------------
-- Undo (only if needed)
-- ---------------------------------------------------------------------------
--   DROP TABLE IF EXISTS public.tax_rates;

BEGIN;

CREATE TABLE IF NOT EXISTS public.tax_rates (
  area       text PRIMARY KEY CHECK (length(area) BETWEEN 2 AND 80),
  kind       text NOT NULL CHECK (kind IN ('county', 'city')),
  county     text NOT NULL CHECK (length(county) BETWEEN 2 AND 60),
  city       text CHECK (city IS NULL OR length(city) <= 60),
  rate       numeric(6, 4) NOT NULL CHECK (rate BETWEEN 0 AND 0.2),
  note       text CHECK (note IS NULL OR length(note) <= 300),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind = 'county' OR city IS NOT NULL)
);

ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tax_rates_admin_all" ON public.tax_rates;
CREATE POLICY "tax_rates_admin_all" ON public.tax_rates
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.tax_rates FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tax_rates TO authenticated;
GRANT ALL ON TABLE public.tax_rates TO service_role;

INSERT INTO public.tax_rates (area, kind, county, city, rate, note) VALUES
  ('Adams County', 'county', 'Adams', NULL, 0.0550, NULL),
  ('Ashland County', 'county', 'Ashland', NULL, 0.0550, NULL),
  ('Barron County', 'county', 'Barron', NULL, 0.0550, NULL),
  ('Bayfield County', 'county', 'Bayfield', NULL, 0.0550, NULL),
  ('Brown County', 'county', 'Brown', NULL, 0.0550, NULL),
  ('Buffalo County', 'county', 'Buffalo', NULL, 0.0550, NULL),
  ('Burnett County', 'county', 'Burnett', NULL, 0.0550, NULL),
  ('Calumet County', 'county', 'Calumet', NULL, 0.0550, NULL),
  ('Chippewa County', 'county', 'Chippewa', NULL, 0.0550, NULL),
  ('Clark County', 'county', 'Clark', NULL, 0.0550, NULL),
  ('Columbia County', 'county', 'Columbia', NULL, 0.0550, NULL),
  ('Crawford County', 'county', 'Crawford', NULL, 0.0550, NULL),
  ('Dane County', 'county', 'Dane', NULL, 0.0550, NULL),
  ('Dodge County', 'county', 'Dodge', NULL, 0.0550, NULL),
  ('Door County', 'county', 'Door', NULL, 0.0550, NULL),
  ('Douglas County', 'county', 'Douglas', NULL, 0.0550, NULL),
  ('Dunn County', 'county', 'Dunn', NULL, 0.0550, NULL),
  ('Eau Claire County', 'county', 'Eau Claire', NULL, 0.0550, NULL),
  ('Florence County', 'county', 'Florence', NULL, 0.0550, NULL),
  ('Fond du Lac County', 'county', 'Fond du Lac', NULL, 0.0550, NULL),
  ('Forest County', 'county', 'Forest', NULL, 0.0550, NULL),
  ('Grant County', 'county', 'Grant', NULL, 0.0550, NULL),
  ('Green County', 'county', 'Green', NULL, 0.0550, NULL),
  ('Green Lake County', 'county', 'Green Lake', NULL, 0.0550, NULL),
  ('Iowa County', 'county', 'Iowa', NULL, 0.0550, NULL),
  ('Iron County', 'county', 'Iron', NULL, 0.0550, NULL),
  ('Jackson County', 'county', 'Jackson', NULL, 0.0550, NULL),
  ('Jefferson County', 'county', 'Jefferson', NULL, 0.0550, NULL),
  ('Juneau County', 'county', 'Juneau', NULL, 0.0550, NULL),
  ('Kenosha County', 'county', 'Kenosha', NULL, 0.0550, NULL),
  ('Kewaunee County', 'county', 'Kewaunee', NULL, 0.0550, NULL),
  ('La Crosse County', 'county', 'La Crosse', NULL, 0.0550, NULL),
  ('Lafayette County', 'county', 'Lafayette', NULL, 0.0550, NULL),
  ('Langlade County', 'county', 'Langlade', NULL, 0.0550, NULL),
  ('Lincoln County', 'county', 'Lincoln', NULL, 0.0550, NULL),
  ('Manitowoc County', 'county', 'Manitowoc', NULL, 0.0550, NULL),
  ('Marathon County', 'county', 'Marathon', NULL, 0.0550, NULL),
  ('Marinette County', 'county', 'Marinette', NULL, 0.0550, NULL),
  ('Marquette County', 'county', 'Marquette', NULL, 0.0550, NULL),
  ('Menominee County', 'county', 'Menominee', NULL, 0.0550, NULL),
  ('Milwaukee County', 'county', 'Milwaukee', NULL, 0.0590, NULL),
  ('Monroe County', 'county', 'Monroe', NULL, 0.0550, NULL),
  ('Oconto County', 'county', 'Oconto', NULL, 0.0550, NULL),
  ('Oneida County', 'county', 'Oneida', NULL, 0.0550, NULL),
  ('Outagamie County', 'county', 'Outagamie', NULL, 0.0550, NULL),
  ('Ozaukee County', 'county', 'Ozaukee', NULL, 0.0550, NULL),
  ('Pepin County', 'county', 'Pepin', NULL, 0.0550, NULL),
  ('Pierce County', 'county', 'Pierce', NULL, 0.0550, NULL),
  ('Polk County', 'county', 'Polk', NULL, 0.0550, NULL),
  ('Portage County', 'county', 'Portage', NULL, 0.0550, NULL),
  ('Price County', 'county', 'Price', NULL, 0.0550, NULL),
  ('Racine County', 'county', 'Racine', NULL, 0.0550, NULL),
  ('Richland County', 'county', 'Richland', NULL, 0.0550, NULL),
  ('Rock County', 'county', 'Rock', NULL, 0.0550, NULL),
  ('Rusk County', 'county', 'Rusk', NULL, 0.0550, NULL),
  ('St. Croix County', 'county', 'St. Croix', NULL, 0.0550, NULL),
  ('Sauk County', 'county', 'Sauk', NULL, 0.0550, NULL),
  ('Sawyer County', 'county', 'Sawyer', NULL, 0.0550, NULL),
  ('Shawano County', 'county', 'Shawano', NULL, 0.0550, NULL),
  ('Sheboygan County', 'county', 'Sheboygan', NULL, 0.0550, NULL),
  ('Taylor County', 'county', 'Taylor', NULL, 0.0550, NULL),
  ('Trempealeau County', 'county', 'Trempealeau', NULL, 0.0550, NULL),
  ('Vernon County', 'county', 'Vernon', NULL, 0.0550, NULL),
  ('Vilas County', 'county', 'Vilas', NULL, 0.0550, NULL),
  ('Walworth County', 'county', 'Walworth', NULL, 0.0550, NULL),
  ('Washburn County', 'county', 'Washburn', NULL, 0.0550, NULL),
  ('Washington County', 'county', 'Washington', NULL, 0.0550, NULL),
  ('Waukesha County', 'county', 'Waukesha', NULL, 0.0500, NULL),
  ('Waupaca County', 'county', 'Waupaca', NULL, 0.0550, NULL),
  ('Waushara County', 'county', 'Waushara', NULL, 0.0550, NULL),
  ('Winnebago County', 'county', 'Winnebago', NULL, 0.0500, NULL),
  ('Wood County', 'county', 'Wood', NULL, 0.0550, NULL),
  ('City of Milwaukee', 'city', 'Milwaukee', 'Milwaukee', 0.0790, 'City of Milwaukee adds 2% inside the city limits')
ON CONFLICT (area) DO NOTHING;

COMMIT;
