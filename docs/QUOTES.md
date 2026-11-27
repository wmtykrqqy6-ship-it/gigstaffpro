# Quotes and availability (CRM Phase 2)

Reps build quotes in GigStaffPro instead of Goodshuffle: priced from the
price list, checked against table availability by time window, taxed by the
event's county, and sent to the client as a secure link to accept. Plan
reviewed and approved by Dylan on 2026-11-26 ("go"):
https://claude.ai/artifact/2CoDZ1AKhtViV8mmWWYmJQ

Build order (one PR and one SQL file each):

1. Price list in the app (Settings > Prices). Done (PR #26).
2. Quote builder on each lead, with the pricing rules below. Done (drafts).
3. Sales tax by county. Done.
4. Availability by time window. Done.
5. Sending, the client's quote page, Accept. Done.

## Business rules (Dylan, 2026-11-26)

- Prices are the website prices; add-on prices come from Goodshuffle.
- A standard party is 3 hours. Extra hours: $75 per dealer per hour plus tax
  when booked ahead; $80 per dealer per hour, tax included, when added during
  the event (contract terms).
- Dealers per table: 1, except craps: 8 ft 1, 10 ft 2, 12 ft super craps 3.
- Travel: past 30 driving miles from the warehouse (535 S 93rd St,
  Milwaukee), $75 per dealer, and the delivery/setup fee is $450 instead of
  $350.
- Fundraisers: $50 off per table (website: April to October, within 30 miles).
- Gratuity: optional, the client picks an amount per dealer (or none). Not
  taxed.
- Magician and other one-off items are priced on each quote.
- Tax is added on top of prices and charged on everything, delivery
  included (as Goodshuffle contracts do), until Dylan's accountant says
  otherwise. Each price item has a "taxable" switch.
- Payment: 50% deposit at signing, balance due 7 days before the event
  (Dylan: "it should just say 7 days").
- Sent quotes don't hold tables until accepted (they show as pending).
- Delivery/pickup window for availability: 2 hours before the start to 1 hour
  after the end by default; reps can change it.
- The client page follows the Goodshuffle contract layout: event details,
  tables with photo, size and description, delivery on its own line, tax,
  total, deposit and balance dates, check mailing address, terms and
  cancellation policy.

## Price list (step 1)

- Table `public.price_items` (migration
  `20261127130000_add_price_items.sql`), admin-only (RLS `is_admin()`); the
  client page will read prices through the server only.
- Columns: `key` (stable code the pricing rules look for: `extra_hour`,
  `extra_hour_at_event`, `setup_fee`, `setup_fee_far`, `travel_per_dealer`,
  `gratuity`, `fundraiser_discount`, `craps_8` / `craps_10` / `craps_12`,
  `package_50` ... ; new items get a key from their name), `category`
  (table, package, staff, fee, addon, event, discount), `unit` (each, table,
  dealer, dealer_hour, event, custom), `price` (NULL = priced on each quote),
  `dealers` (tables), `size`, `taxable`, `bonus_game` (counts as a package's
  "bonus game"), `contents` (packages: `[{key, qty}]`, key `bonus` = any
  bonus game), `description`, `photo_url`, `active` ("Offer on quotes"),
  `sort_order`.
- Seeded from Dylan's price list sheet
  (https://claude.ai/artifact/Tzw3FAeacsYMnePRyRVxPV) and the table
  descriptions on his Goodshuffle contract. Re-running the file only adds
  missing rows.
- Screen: Settings > Prices (`src/components/settings/PricesSettingsTab.jsx`),
  logic in `src/utils/priceList.js`. Deleting an item doesn't change quotes
  already sent (quotes will copy each line's name and price).
- Still blank (priced on each quote until Dylan sets them): decorations,
  custom chips, poker tournament, Night at the Races, magician.

## Quote builder (step 2)

- Table `public.quotes` (migration `20261127140000_add_quotes.sql`),
  admin-only, changes written to the client access log. A quote stores its
  picked lines as `lines` jsonb, each a copy of the price item (name, price,
  tax, description, photo, package contents), so price list edits never
  change a saved quote. Totals (`subtotal`, `tax`, `total`, `deposit`) are
  saved with it; rule lines are worked out again from the settings on the
  quote (`miles`, `fundraiser`, `extra_hour_mode`, `auto_off`, times).
- Screen: "Build quote" on each lead card (Leads tab) opens
  `src/components/quotes/QuoteBuilder.jsx`; saved quotes show as chips on the
  card. It fills the date, start time (+3 hours for the end), guests and
  address from the lead, suggests the smallest package for the guest count,
  ticks Fundraiser when the client's type is fundraiser, and looks up driving
  miles from the market's warehouse address (Settings > Locations) with
  `/api/get-distance`.
- Rules (`src/utils/quotePricing.js`, tested against the Goodshuffle sample
  contract: 3 blackjack, 10 ft craps, roulette, money wheel + delivery at 5%
  = $3,071.25): delivery `setup_fee` (or `setup_fee_far` past 30 miles) when
  there are tables; `travel_per_dealer` x dealers past 30 miles; extra hours
  past 3 x dealers at `extra_hour` ($75 + tax) or `extra_hour_at_event` ($80,
  no tax added); `fundraiser_discount` x tables. Packages count their tables
  and dealers; a bonus game counts as 1 table, 1 dealer. The rep can leave a
  rule off a quote, edit any picked line's quantity, price and tax, and add
  custom lines (magician, gratuity).
- Status stays "draft" until step 5 (sending).

## Sales tax (step 3)

- Table `public.tax_rates` (migration `20261127150000_add_tax_rates.sql`),
  admin-only: the total rate per area. 72 Wisconsin counties (5% state +
  0.5% county in most; Milwaukee County 5.9%; Waukesha and Winnebago 5%)
  and City of Milwaukee 7.9% (`kind 'city'`, wins over its county). Resort
  taxes are left out (they apply to lodging/food sellers). Edited under
  Settings > Prices > Sales tax rates.
- The builder's map-pin button looks up both the driving miles and the
  address's county/city (`/api/get-distance?geocode=1&address=...`, Google
  Geocoding, parsed by `api/_lib/geocode.js`; needs the Geocoding API enabled
  on the Google Maps key) and fills the tax area and rate
  (`src/utils/salesTax.js` `findTaxArea`). Outside Wisconsin, or if the lookup
  fails, the rep picks the area or types the rate. New quotes start at 5.5%.
- Caveat: Google's "locality" is the mailing city. A few addresses outside
  the City of Milwaukee use a Milwaukee mailing address; check the tax area
  on those.

## Availability (step 4)

- Table `public.stock_pools` (migration `20261127160000_add_stock_pools.sql`),
  admin-only: how many of each kind of table are owned (from Dylan's
  inventory list: blackjack 40, stand-up 11, bonus game tables 13, pai gow 1,
  money wheel 3, roulette 10, lighted roulette boards 3, Hold'em 11, craps 8 ft
  2 / 10 ft 10 / 12 ft 1). Several price items share a pool
  (`price_items.stock_pool`): Three Card, Let It Ride, Ultimate Hold'em and
  Casino War all use "bonus"; a package's bonus game does too.
  `match_names` maps Goodshuffle item names on imported pull sheets to pools.
  Edited under Settings > Prices > Tables you own; each item's pool is set in
  its editor.
- Windows: each booking holds tables from delivery (`quotes.setup_minutes`,
  default 120) before the start to pickup (`pickup_minutes`, default 60)
  after the end. Events in the app use the same defaults. Logic:
  `src/utils/availability.js`; panel: `src/components/quotes/AvailabilityPanel.jsx`.
- Counted: events (not cancelled/archived) with an imported pull sheet
  (`event_equipment`) and accepted quotes, on the day before through the day
  after. Sent quotes show as "pending" and don't hold tables. Warns, never
  blocks.
- Gap: future bookings that exist only in Goodshuffle (about 222 projects
  from the Phase 1 import, which has no item lists) aren't counted until
  their pull sheets are imported or their items are backfilled.

## Sending and the client's page (step 5)

- Migration `20261127170000_add_quote_sending.sql` adds to `quotes`:
  `public_token` (32 random URL-safe characters, unique), `sent_snapshot`
  (the quote as sent), `viewed_at`, `accepted_name`, `gratuity_per_dealer`.
  Quotes stay admin-only; nothing is opened to the browser.
- **Send** (builder: "Send to client"): saves, then calls the admin action
  `quote-send` on `api/send-email.js` (email rate limit applies). The server
  (`api/_lib/quotePage.js` `handleQuoteSend`) re-prices the saved lines with
  the current price list using server copies of the pricing code
  (`api/_lib/priceList.js`, `quotePricing.js`, `quoteTerms.js`; a test keeps
  them identical to `src/utils/`), freezes `sent_snapshot`, keeps or makes
  the link code, emails the lead's address (only that address) from
  sales@ with the rep's signature and logo, saves the email in Messages, and
  moves a New lead to Quoted (starting the follow-up clock). Sending again
  updates the same link.
- **The email** (`quoteEmailHtml`) follows the layout of Goodshuffle's quote
  emails (Dylan's sample, 2026-11-27): logo and View Quote button, a "Quote"
  heading, the rep's message and signature, a big View Quote button, event +
  subtotal/tax/total, "Have Questions?", and the Vegas on Wheels address
  footer. No "Powered by" line. The builder's default message uses the same
  wording as Goodshuffle's.
- **Client's page** `/q/<code>` (`vercel.json` rewrite to
  `api/send-email.js?route=quote`, `handleQuotePage`): server-rendered HTML,
  Vegas on Wheels logo and contact details only, everything escaped, strict
  CSP (no scripts), `noindex`, `no-store`, rate limited per IP. Shows the
  snapshot (lines with photo/size/description, tax, total, 50% deposit,
  balance due 7 days before) and the quote terms.
  - **Accept**: typed full name + tick the terms box + optional gratuity per
    dealer ($0-500, added as an untaxed line; deposit and balance worked out
    again). Only a quote still "sent" can be accepted (the update is
    conditional). Marks the quote accepted, the lead Booked (so the booking
    thank-you email goes out if it's on), and emails the team (`lead_email`
    setting or sales@).
  - **Ask a question**: saved to Messages as an incoming email on the lead.
  - The page stops accepting once the event date has passed (Central time)
    or the quote isn't "sent".
- **Quote terms**: Settings > Prices > Quote terms, stored in the settings
  row `quote_settings` (`terms`; empty = the standard terms from the
  Goodshuffle contract in `src/utils/quoteTerms.js`). The check mailing
  address from the Goodshuffle contract is left out on purpose (the repo is
  public); add it to the terms in Settings if wanted.
- **Link domain**: links use `https://www.gigstaffpro.com/q/...` unless
  `quote_settings.link_base` is set (an `https://` host only), e.g. a
  `quotes.vegasonwheels.com` domain pointed at the Vercel project.
