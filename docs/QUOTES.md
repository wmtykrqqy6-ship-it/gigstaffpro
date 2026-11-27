# Quotes and availability (CRM Phase 2)

Reps build quotes in GigStaffPro instead of Goodshuffle: priced from the
price list, checked against table availability by time window, taxed by the
event's county, and sent to the client as a secure link to accept. Plan
reviewed and approved by Dylan on 2026-11-26 ("go"):
https://claude.ai/artifact/2CoDZ1AKhtViV8mmWWYmJQ

Build order (one PR and one SQL file each):

1. Price list in the app (Settings > Prices). **Done in this change.**
2. Quote builder on each lead, with the pricing rules below.
3. Sales tax by county.
4. Availability by time window.
5. Sending, the client's quote page, Accept.

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
