# Delivery Logistics

Admin nav → **Logistics**. Plans which truck carries which casino tables, using
Goodshuffle pull sheet PDFs as the data source (Goodshuffle has no API).

## Status

| Phase | Scope | Status |
|---|---|---|
| 1 — Foundation | Migration + seeds, pull sheet parser, import (create / update-with-diff / attach), per-event "Fits on" check, truck + catalog settings | Built on `feature/logistics` |
| 2 — Dispatch board | Day view by truck, 2-person teams, runs/loads/stops, split events, reloads, conflict warnings | Not started |
| 3 — Field views | Warehouse load sheet, crew route in worker portal, delivered/returned check-offs, missing-item flags | Not started |

## Where things live

| What | File |
|---|---|
| Capacity check (pure, tested) | `src/utils/logistics/capacity.js` |
| Pull sheet parser (pure, tested against fixtures) | `src/utils/logistics/pullSheetParser.js` |
| Browser PDF text extraction (pdf.js, lazy-loaded) | `src/utils/logistics/pdfText.js` |
| Catalog name → size class | `src/utils/logistics/catalog.js` |
| Import matching + equipment diff | `src/utils/logistics/importMatch.js` |
| UI | `src/components/views/LogisticsView.jsx`, `src/components/logistics/*` |
| Schema | `supabase/migrations/20260927120000_add_logistics_foundation.sql` |
| Test fixtures (3 real pull sheets + their receipts) | `src/utils/logistics/__fixtures__/` |

## Capacity rules (per load = one trip out of the warehouse)

| Truck | Craps | Craps stretch | Roulette | Poker | Blackjack zone | Archway |
|---|---|---|---|---|---|---|
| Yellow (priority 1) | 1 | 2 | 2 | 2 | 10 | no |
| Black (2) | 2 | 3 | 2 | 2 | 14 | no |
| White (3) | 4 | 4 (no stretch) | 2 | 2 | 20 | yes |

1. Craps units = craps tables + ceil(chairs / 50).
2. Roulette/poker beyond their zone → blackjack zone, 1 slot each (no warning).
3. Blackjack-size tables (+ that overflow) fill the blackjack zone; the rest goes into craps units at 6 per unit (round up) → **yellow**.
4. Craps units above normal, up to stretch → **yellow**. Above stretch → **red**.
5. Archway on a truck without `can_carry_archway` → **red**.
6. Decor, accessories, packages: no capacity cost.
7. Suggested truck = first **green** in priority order; if none, first yellow (flagged).

Capacities are editable under Logistics → Trucks.

## Pull sheet parsing notes

pdf.js returns positioned text. Quantities are in a narrow left column
(x≈37), vertically centered on each item's block; item names sit at x≈125
and accessories are indented to x≈140 (Goodshuffle's ↑ arrow is an image, so
indentation is the signal). Names use a larger font than description lines.
The event name + invoice come from the page footer
(`… - Pawelek Sample Quote (#231849935)`); the year comes from the rental
date range.

Address: read from the delivery block at the top of page 1; if that copy has
no street line, the repeat in the Logistics section is used. (That section's
heading can sit at the bottom of page 1 with its content on page 2.)
`undefined` parts are dropped. A street line starts with a house number,
including Wisconsin grid addresses (`W175N11086 Stonewood Dr`). Any line/part
before the street is treated as the venue name and prefills the event's Venue.
The import only asks for a street address when neither copy has one.

The receipt PDF (`fulfillment-confirmation-sheet-*.pdf`) is detected and rejected.

## Import flow

1. Upload pull sheet → parse → classify unknown item names (asked once, saved to `equipment_catalog`).
2. Event with same `goodshuffle_invoice` → replace its equipment, showing a diff (`+2 Blackjack Table, −1 Roulette Table`). Date/time differences are shown, not auto-applied.
3. Else same-date events with no invoice → "Attach to …?".

The pull sheet is the source of truth for the address: whenever it has a street
address, that address is written to the event on create, attach and re-import.
If the event already has a different address, the review screen shows both and
offers "Keep the event's current address instead".
4. Else → the normal Create Event form, prefilled. Staffing/positions work as before.

Re-import replaces an event's equipment (delete + insert, not atomic). Phase 2
allocations will need this to become an in-place update so allocations survive.

## Open questions (for Dylan)

- Can the stretch craps slot hold chairs or blackjack overflow, or only craps tables? *Current: any craps-zone use, with a warning.*
- How do chairs, the archway, and decorations appear on pull sheets? *Not in the sample; the importer asks the first time it sees each name.*
- Do Madison events run from the Milwaukee warehouse with the same trucks? *Trucks have no location yet.*
- Should drivers see other teams' routes, or only their own?
