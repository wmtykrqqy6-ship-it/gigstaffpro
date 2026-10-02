# Delivery Logistics

Admin nav → **Logistics**. Plans which truck carries which casino tables, using
Goodshuffle pull sheet PDFs as the data source (Goodshuffle has no API).

## Status

| Phase | Scope | Status |
|---|---|---|
| 1 — Foundation | Migration + seeds, pull sheet parser, import (create / update-with-diff / attach), per-event "Fits on" check, truck + catalog settings | Committed on `feature/logistics` (bdb06e0) |
| 2 — Dispatch board | Day view by truck, 2-person teams, runs/loads/stops, split events, reloads, conflict warnings | Committed on `feature/logistics` (bfa803b) |
| 3 — Field views | Warehouse load sheet, crew route in worker portal, delivered/returned check-offs, missing-item flags | Built on `feature/logistics`, uncommitted |

## Where things live

| What | File |
|---|---|
| Capacity check (pure, tested) | `src/utils/logistics/capacity.js` |
| Pull sheet parser (pure, tested against fixtures) | `src/utils/logistics/pullSheetParser.js` |
| Browser PDF text extraction (pdf.js, lazy-loaded) | `src/utils/logistics/pdfText.js` |
| Catalog name → size class | `src/utils/logistics/catalog.js` |
| Import matching + equipment diff | `src/utils/logistics/importMatch.js` |
| Dispatch: allocations, stop order, conflicts (pure, tested) | `src/utils/logistics/dispatch.js` |
| Field views: per-trip item lists, load sheet order, returns (pure, tested) | `src/utils/logistics/fieldViews.js` |
| Crew check-off endpoint logic (tested) | `api/_lib/routeActions.js` (actions `routeCheck`, `routeStopStatus` in `api/worker-actions.js`) |
| UI | `src/components/views/LogisticsView.jsx`, `src/components/logistics/*` |
| Schema | `supabase/migrations/20260927120000_add_logistics_foundation.sql`, `20260928120000_add_logistics_dispatch.sql`, `20260929120000_add_logistics_field_views.sql`, `20260930120000_add_catalog_staffing.sql`, `20261001120000_add_solo_and_personal_vehicle_runs.sql`, `20261002120000_add_route_reminders_sent.sql` |
| Test fixtures (3 real pull sheets + their receipts) | `src/utils/logistics/__fixtures__/` |

## Staffing from pull sheets

Each catalog item can need staff: a position (from Settings → Positions) and a count per table.
Seeded from the Goodshuffle descriptions and confirmed 2026-09-28: craps = 2 dealers; blackjack,
roulette and poker = 1. Vegas on Wheels' positions are named after games (`blackjack`, `craps`,
`roulette`, `poker`, `let_it_ride`, `money_wheel`, …), so a new table is matched to a position by
name (most specific wins: "3 Card Poker Table" → 3 Card Poker), falling back to its size class.
Editable per item on the Catalog tab. Logic: `src/utils/logistics/staffing.js` (tested).

- **New event from a pull sheet:** the event form opens with staffing prefilled. Add extra dealers
  there for bigger events.
- **Re-import that changes the tables:** staffing is never changed without asking. The import shows
  each change ("Blackjack: 10 → 12") with Apply / Leave as is. Only the difference in tables is
  applied, so dealers added by hand stay. Lowering below the number of people already assigned shows
  a warning (nobody is unassigned automatically).
- **Attaching to a manually staffed event:** offers to raise positions to what the tables need; never
  lowers.
- Needs migration `20260930120000_add_catalog_staffing.sql`; before it's run, imports work as before
  without staffing.

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

Start it from **Logistics → Import Pull Sheet**, or from **New Event / Create Event** on the Dashboard
and Events pages ("Upload pull sheet" at the top of the blank form, which hands off to the same
import — `PullSheetImportLauncher` loads the trucks/catalog it needs).

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

## Dispatch board (phase 2)

Logistics → **Dispatch**. One day at a time, one column per active truck.

- **Edit Event → Delivery & pickup:** the same delivery / dealing / pickup times per vehicle, editable
  there too (`EventDeliveryTimes.jsx`, saves straight to `run_stops`). Warns if the event's date was
  changed after it was planned, since the truck plan stays on the old date.
- **Mini calendar** (left of the board): click a day to plan it. Days are marked ✓ scheduled (every
  event on a vehicle), — not on a truck yet, or a red dashed ring for a conflict (any error from the
  board's own checks), with "Needs a truck" / "Conflicts" lists for the month. Statuses come from
  `monthStatuses()` / `dayStatus()` in `dispatch.js` (tested) over one batch of the month's data.
- **Run** (`daily_runs`): a truck on a day with its 2-person setup team. One per truck per day.
- **Team spots (1 Driver + 1 Set Up, confirmed 2026-09-29):** the Driver spot lists only workers with
  the **Set Up Driver** skill; the Set Up spot lists anyone with **Set Up** or **Set Up Driver**. Both
  are ordinary positions (Settings → Positions) ticked on the worker's profile; only admins can change
  skills. Position keys are fixed from the name first typed (renaming changes only the label), so roles
  are matched by key or label — live keys are `driver` ("Set Up Driver") and `set_up` ("Set Up"). Until a
  driver position exists the dropdowns list everyone. Someone already in a spot without the skill stays
  listed and gets a warning, so nobody is dropped silently.
- **One-person deliveries (confirmed 2026-09-30):** small events are sometimes delivered by one person.
  - *Solo truck:* the **Solo** switch on a truck's team hides the Set Up spot and silences the
    one-person warning. An empty Set Up spot without Solo still warns.
  - *Personal vehicle:* "+ Personal vehicle delivery" adds a column with no truck and one crew member
    (Set Up or Set Up Driver). Several per day are allowed. Loads are checked against the
    **Personal vehicle** row on the Trucks tab — its capacities start at 0 and are entered by the
    office (what fits in a car); it's never suggested as a truck. Stops, load sheet, crew route and
    check-offs work the same. Migration `20261001120000_add_solo_and_personal_vehicle_runs.sql`.
- **Changing vehicles:** click the truck's name to **change the truck** — the crew, trips and stops move
  with it and capacity is re-checked. **Move to…** on an event card moves just that event (its tables,
  delivery, pickup and dealing time) to another trip or vehicle, including a truck not planned yet or a
  new personal-vehicle delivery (`planMoveEvent` in `dispatch.js`, tested). Moving onto a vehicle that
  already carries part of the event merges the tables and drops duplicate stops.
- **Trips** (`run_loads`): trip 1 is the morning load; "Add reload trip" adds trip 2, 3… Capacity bars and green/yellow/red are per trip.
- **Loaded tables** (`load_allocations`): per event, per size class, per trip, with +/− steppers.
  Allocation is by size class rather than by pull-sheet line, so a split event is just two numbers,
  and a re-imported pull sheet can't orphan the plan. Differences show up immediately as
  "not loaded" or "extra".
- **Stops** (`run_stops`): delivery stops live under their trip; work and pickup stops are in the
  "After deliveries" section (pickup gear never rides with delivery gear). Loading an event onto a
  trip adds its delivery stop and a pickup at the event's end time, plus a work stop if a team member
  is already staffed on that event. Work stops show the team member's assignment and position.
- Stop times before 5:00 AM count as after midnight (late pickups).

Conflict checks (`computeDayConflicts`):

| Check | Level |
|---|---|
| Event with gear but no truck | error |
| Trip over capacity (red) / using stretch or blackjack-in-craps (yellow) | error / warning |
| Team member delivering/picking up elsewhere while dealing a party | error |
| Pickup before the event ends | error |
| Same worker on two trucks | error |
| Gear not loaded / more loaded than the pull sheet lists | warning |
| Truck carries an event's gear but has no delivery stop for it | warning |
| No pickup scheduled | warning |
| Delivery runs past the event start | warning |
| Team member dealing but no work stop (truck parked there) | warning |
| Work stop where neither team member is staffed | warning |
| Missing or one-person team | warning |
| Stop times going backwards | warning |

All trucks run out of the Milwaukee warehouse and serve every market (confirmed 2026-09-28), so
Logistics always shows every market's events and ignores the market switcher.

## Field views (phase 3)

**Item lists per trip.** The plan stores table counts per size class; `splitEventAcrossLoads` turns that
back into named lines. Tables fill the event's pull-sheet rows in order, trip by trip, and each table
row's accessories follow proportionally (largest-remainder rounding, so a split always adds back up to
the pull sheet exactly). Anything loaded beyond the pull sheet shows as "(extra — not on pull sheet)".

**Warehouse load sheet.** Printer icon on each trip, or "All load sheets" for the day (one page per
trip). Events are listed in load order, last delivery stop first, with every table and accessory and a
checkbox, plus the delivery order and the truck's notes. Printing shows only the sheet.

**Day-before route reminder (email).** From 4 PM business time, everyone on tomorrow's truck or
personal-vehicle run gets one email: vehicle, teammate, notes, every stop in order with times, a Maps
link and what's being delivered, reload markers, the pickup time ("details open once the party
starts"), and a link to their route. Runs on the existing hourly `send-shift-reminders` cron
(`api/_lib/routeReminders.js`, tested; service-role key from the environment). One email per person per
run, logged in `route_reminders_sent` (migration `20261002120000`). Plans changed after the email went
out aren't re-sent — the portal route is always the latest.

**Warehouse loading (worker portal).** Workers with a **Warehouse** skill (a position in Settings →
Positions, matched by key or label) get a "Loading — next 7 days" card: every truck and trip planned
for the coming week with its live load sheet (load order, every table and accessory, delivery order,
notes) and "Print this day". Read-only; the tick boxes are a per-device scratchpad, not saved. Nobody
sees it until the Warehouse position exists (`WarehouseLoading.jsx`, `isWarehouseWorker` in
`dispatch.js`, tested).

**Crew route (worker portal).** A "Your route today" card at the top of the worker dashboard for
anyone on a truck team (upcoming days within a week show collapsed). Stops are in order, with trip
reload markers, times, a Google Maps link, and the gear list. The crew checks items off as they unload
(delivered) and load up (returned); on a pickup they can lower a count for a short return. "Mark stop
done" per stop. Check-offs open only on the route's day (and until 6 AM the next morning for late
pickups). Crews see only their own route.

Check-offs write through `api/worker-actions.js` (service role), which checks the worker is on that
run's team and that it's the right day. Like the existing `checkIn` action it trusts the worker id the
browser sends; there's no worker session token yet (see that file's header).

**Returns.** Logistics → Returns lists pickups from the last 14 days:

| State | Meaning |
|---|---|
| Missing items | Crew checked in (or marked the pickup done) and something is short or unchecked |
| Never checked in | The day has passed and nothing was checked at that pickup |
| Pickup pending | Not happened yet |
| All back | Everything returned in full |

What should come back is what the truck actually delivered (if deliveries were checked off), otherwise
the plan. "Found it" / "Mark all found" records items as returned.

## Open questions (for Dylan)

- Can the stretch craps slot hold chairs or blackjack overflow, or only craps tables? *Current: any craps-zone use, with a warning.*
- How do chairs, the archway, and decorations appear on pull sheets? *Not in the sample; the importer asks the first time it sees each name.*
- ~~Do Madison events run from the Milwaukee warehouse with the same trucks?~~ **Answered 2026-09-28:** yes, every truck comes from Milwaukee for now.
- Should drivers see other teams' routes, or only their own? *Current: only their own.*
- ~~Should missing returns also email the warehouse manager?~~ **Answered 2026-09-28:** no. Equipment is almost never lost, and when it is the venue calls. The Returns tab is enough. (The warehouse manager uses an admin login.)
