# GigStaffPro Current Direction and Missing Features Handoff

**Source conversations:**
1. `GigStaffPro missing features analysis` — February 25, 2026
2. `Starting a new chat session` — March 3, 2026 onward
3. `Continuing work on gigstaffpro` — later continuation work in March 2026

**Purpose:** Preserve the most recent product direction, competitor-driven priorities, bug fixes, payment and location decisions, and remaining feature gaps discussed after the main architecture and system-evolution phase.

> **Important:** This is a historical handoff. It records what was discussed, selected, reported as fixed, or proposed in these conversations. The current repository and newer approved decision documents remain the source of truth.

> **Security note:** Secret values, API keys, private addresses, personal email addresses, and tokens from the source chats are intentionally omitted.

---

## 1. Phase Overview

This phase moved GigStaffPro from broad system-building toward:

- Competitive comparison
- Operational prioritization
- Bug fixing
- Mobile polish
- Better payment automation
- Clearer location architecture
- More reliable worker and admin workflows
- Identifying the remaining features needed before a stronger MVP or SaaS release

The work became less about proving the app could function and more about making it dependable, easy to operate, and suitable for multiple casino-party companies.

---

## 2. Competitive Feature Analysis

GigStaffPro was compared against a competing event-staffing product referred to as Dealer Bookings.

The competitor review covered:

- Admin dashboard
- Event management
- Worker portal
- Dealer or worker management
- Staffing status
- Performance information
- Communication tools

### Competitor features identified as missing or weaker in GigStaffPro

Features noted during the review included:

- “Days open” tracking for unfilled positions
- Color-coded staffing and availability indicators
- Unfilled-position alerts on the dashboard
- Worker invite and acceptance workflow
- On-time percentage
- Late percentage
- No-show percentage
- Star ratings
- Worker performance metrics
- Geographic map view of events
- Bulk communication tools
- Clear visual indicators for urgent staffing problems
- Stronger operational summaries on the admin dashboard

### Top three recommended priorities

After reviewing the competitor screens, the top three recommendations were:

1. **Worker reliability and attendance metrics**
   - On-time percentage
   - Late percentage
   - No-show percentage
   - Clear performance history

2. **Unfilled-position alerts**
   - Surface understaffed events immediately
   - Help administrators focus on the most urgent events
   - Reduce the chance that an event remains unnoticed

3. **Worker invite and acceptance workflow**
   - Make staffing offers explicit
   - Track sent, accepted, declined, pending, and standby states
   - Reduce manual texting and unclear commitments

### Important interpretation

These recommendations did not necessarily mean the app had none of the underlying functionality.

By this point:

- Reliability scoring existed in some form.
- Invitations existed in some form.
- Staffing counts existed.
- Standby existed.

The competitor review highlighted the need to make these features more visible, measurable, consistent, and operationally useful.

---

## 3. Current Product Priorities Emerging From This Phase

The later direction favored completing and stabilizing core staffing workflows before expanding into less essential features.

### High-priority operational capabilities

- Fast identification of understaffed events
- Reliable worker availability and qualification matching
- Clear invitations and responses
- Accurate standby handling
- Accurate event and assignment counts
- Reliable pay calculations
- Reliable travel calculations
- Worker attendance and performance history
- Mobile usability
- Multi-location support without duplicate concepts
- Automated reminders
- Better safety checks before production changes

### Lower-priority or future features

- Client portal
- Native mobile application
- Offline mode
- Full payroll integration
- Advanced analytics and forecasting
- Geographic map dashboard
- Email-open analytics
- Batch admin email digests
- Saved advanced filters
- Automated client invoicing
- Stripe, Venmo, or other payout integrations

---

## 4. Worker Portal Calendar Decisions

The worker calendar had changed from pill-style event blocks to simple blue-dot indicators.

Dylan preferred the earlier pill-style design.

### Selected calendar behavior

- Calendar days should show event pills rather than only dots.
- On mobile, show a compact time-focused pill.
- On desktop, show time plus event name when space allows.
- Event pills should be clickable.
- Clicking should show event details.
- Calendar and list views should remain available.
- Calendar and list views should show consistent event dates and statuses.

### Responsive implementation direction

A responsive rendering approach was used:

- Mobile: shorter pill text
- Desktop: more descriptive pill text
- Same underlying event
- No separate mobile-only data logic

---

## 5. Event Filtering Decisions

The Events view filter area was considered too large and permanently visible.

### Selected direction

Replace the always-expanded filter grid with:

- Search field
- Filters button
- Expandable or collapsible filter panel
- Same general interaction on desktop and mobile

### Default date filter

The default date range was changed from:

```text
next-30
```

to:

```text
all
```

Rationale:

- Administrators should not think events are missing because the default hides them.
- A narrower date range should be a user-selected filter, not an invisible default limitation.

---

## 6. Standby Promotion Safety

A bug allowed the Promote button to remain visible when a position was already full.

### Selected fix

- Hide or disable Promote when the target position has no available slots.
- Prevent an administrator from overstaffing a position through standby promotion.
- Recheck current capacity at the moment of promotion.
- Do not rely only on the count displayed when the modal first opened.

This reinforces the wider rule that capacity checks must use fresh data.

---

## 7. Worker Editing Fix

The Edit Worker modal was discovered to be largely a copy of the Add Worker modal.

It did not correctly use the selected worker record.

### Intended correction

The edit modal should:

- Receive the selected worker as a prop.
- Populate existing fields when opened.
- Update when a different worker is selected.
- Use a lifecycle effect such as `useEffect` to set form state.

Fields expected to populate included:

- Name
- Email
- Phone
- Skills
- Rank
- Other current worker properties managed by the form

### Development lesson

Add and Edit forms may share components, but an Edit form must:

- Load existing data
- Preserve unchanged values
- Avoid overwriting fields with blank defaults
- Correctly distinguish create from update behavior

---

## 8. Worker Gig Count

The worker card displayed a stored `total_gigs` value that was not reliably updated.

### Selected correction

Calculate gig count from current assignment data rather than trusting a stale worker column.

Intended logic:

- Count qualifying assignments for the worker.
- Use consistent status rules.
- Decide whether cancelled, rejected, pending, standby, or future assignments count.
- Display the result dynamically.

The exact current count rules should be documented in `BUSINESS_RULES.md`.

---

## 9. Payment Configuration Repair

The Payment Calculator was missing travel-tier data.

The application loaded:

- Pay rates
- Bonuses

But did not load:

- Travel tiers

### Selected correction

`loadPaymentConfig` needed to query `travel_tiers` and place the results into application state.

### Important finding

A payment feature can appear configured while silently returning incorrect values if one part of the configuration is missing.

For payment work, verification should always include:

- Position rate
- Hours or flat-rate logic
- Event location
- Worker home location
- Miles
- Travel tier
- Bonuses
- Holiday rule
- Final total
- Saved assignment snapshot

---

## 10. Automatic Mileage Calculation

A new automatic mileage feature was introduced for payment calculation.

### Intended architecture

- A serverless endpoint calculates distance.
- Google Maps or Google Distance Matrix is called from the server.
- The API key is stored in a Vercel environment variable.
- The browser should not directly expose the unrestricted server key.
- The calculator loads a travel origin and event destination.
- Mileage is fetched automatically when the modal opens.
- The user sees a loading state and the resulting mileage.

### Historical endpoint

The conversation referenced:

```text
api/get-distance.js
```

The current repository should be checked for the actual route and implementation.

### Travel origin during this stage

The warehouse address was loaded from the Supabase `settings` table.

Historical setting key:

```text
warehouse_address
```

A default Milwaukee address appeared in the source conversation, but private or operational addresses are omitted from this handoff.

### Expected calculator experience

- Open payment calculator.
- System identifies origin and destination.
- Mileage calculation begins automatically.
- Loading indicator appears.
- Miles populate.
- Travel tier and pay populate.
- Admin can review or correct values before saving.

---

## 11. Travel Pay Display Inconsistency

A later problem showed correct travel pay in the admin Payment Calculator but incorrect or missing travel pay on the worker Available Events screen.

### Key diagnostic conclusion

The travel tiers themselves were probably not the problem because:

- The admin calculator used the same tiers and produced the correct amount.
- The worker portal showed a different result.

The likely difference was the data path:

- Admin calculator received `travelTiers` directly from application state.
- Worker portal received `travelTiers` through props.
- A missing, stale, or incorrectly shaped prop could cause one screen to fail while another worked.

### General lesson

When the same calculation works in one screen but not another:

1. Compare data sources.
2. Compare prop names.
3. Compare data shape.
4. Compare loading timing.
5. Compare helper functions.
6. Compare fallback values.
7. Do not immediately blame shared database data.

---

## 12. Location Versus Market Decision

A major later decision rejected a separate Markets concept.

### Final direction from this phase

**Locations should act as both the operational hub and the pay market.**

Examples:

- Milwaukee Warehouse
- Madison Warehouse
- Other future operating hubs

### Location fields discussed

A Location should store or support:

- Name
- Address
- Timezone
- Optional service radius
- Travel origin
- Pay rates by position
- Other location-level overrides

### Event pay rule

**The event’s Location determines the hourly or base position rate.**

Examples:

- Madison event uses Madison rates.
- Milwaukee event uses Milwaukee rates.

Workers receive the event-location market rate, not the worker’s home-location rate.

### Worker travel rule

**The worker’s Home Location determines the travel origin.**

Distance should be calculated from:

```text
worker Home Location → event destination
```

Examples:

- Madison worker at Madison event may receive no travel pay.
- Milwaukee worker at Madison event receives travel pay based on the Milwaukee origin.

### Assignment snapshot rule

When assigning a worker:

1. Read the event Location.
2. Pull the position rate for that Location.
3. Read the worker Home Location.
4. Calculate distance from Home Location to event.
5. Apply travel tiers and bonuses.
6. Save pay values on the assignment as a snapshot.

### Reason for snapshots

Rates and rules may change later.

Past assignments should preserve what the worker was expected to receive at the time.

### Superseded direction

A separate Markets system was considered duplicate and should be removed or avoided when it represents the same operational regions as Locations.

---

## 13. Pay Rate Overrides

A Location-based pay-rate override interface was discussed or implemented.

### Intended UI

- Location card can expand to show Pay Rate Overrides.
- Base rates remain available in the Pay Rates area.
- Location-specific overrides are managed from Locations.
- Pay Rates page explains that market or location overrides live under Locations.
- Standalone Markets section is removed.

### Intended fallback

When no Location override exists:

- Use the global base rate.

When an override exists:

- Use the event Location’s override for that position.

The exact schema and lookup order require verification.

---

## 14. Home Location

The later model introduced Worker Home Location.

### Intended purpose

Home Location is not necessarily where the worker is allowed to work.

It primarily supports:

- Travel origin
- Default operational affiliation
- Location-aware filtering
- Future regional management
- Location-specific communication or staffing

### Required questions for consolidation

- Is Home Location required for every worker?
- Can a worker work at multiple Locations?
- Is there still a worker-location membership table?
- Does Home Location affect visibility, eligibility, or only travel?
- What happens to existing workers with no Home Location?
- Can admin override the travel origin?

---

## 15. Worker Availability Remained a Major Missing Feature

Worker Availability repeatedly appeared as a high-impact next feature.

### Desired worker experience

Workers should be able to:

- Mark recurring availability
- Mark unavailable days
- Block vacation dates
- Indicate preferred work windows
- Update availability from mobile

### Desired admin experience

Admin should be able to:

- See availability before inviting
- Filter qualified workers by availability
- Avoid inviting people who are unavailable
- Identify staffing shortages earlier
- Use availability alongside skill, rank, location, and conflict checks

### Status at this phase

Availability was a priority but not reliably confirmed as fully implemented.

Later project planning identified the worker availability calendar as one of the next major MVP priorities.

---

## 16. Reliability and Attendance Direction

The competitor comparison reinforced the need for measurable worker performance.

### Desired metrics

- Total gigs
- On-time count or percentage
- Late count or percentage
- No-show count or percentage
- Reliability score
- Recent report history
- Trends over time

### Intended use

Admin should use reliability to:

- Decide whom to invite first
- Identify training needs
- Identify workers who require follow-up
- Support rank decisions
- Reduce event risk

### Caution

Reliability must not be an unexplained or unreviewed number.

Future design should document:

- Formula
- Inputs
- Weighting
- Who can submit data
- Admin review process
- Whether workers can see their rating
- Correction and appeal process

---

## 17. Unfilled Position Alerts

The competitor review recommended making urgent staffing problems visible immediately.

### Desired dashboard behavior

Show:

- Upcoming events with open positions
- Number of open slots
- Positions still needed
- Days until event
- Possibly days the position has remained open
- Staffing percentage
- Priority or risk indicator

### Sorting direction

The highest-risk events should appear first.

Possible factors:

- Event date
- Number of open positions
- Critical position type
- Days open
- Percentage staffed

The final priority formula was not established in these chats.

---

## 18. Invite and Acceptance Workflow

The competitor review reinforced the importance of clear staffing offers.

### Desired states

- Eligible
- Invited
- Accepted
- Declined
- Pending approval
- Approved
- Standby
- Cancelled
- Expired or no response

### Desired administrator view

- Who was invited
- When invitation was sent
- Who accepted
- Who declined
- Who has not answered
- Whether position capacity changed
- Who moved to standby
- Ability to re-invite where appropriate

### Desired worker view

- Clear event and position
- Remaining slots
- Pay information when allowed
- Deadline or urgency
- Accept or decline action
- Confirmation of resulting status

---

## 19. Mobile and UI Improvements Reported During This Phase

Reported changes or selected direction included:

- Worker calendar pill display restored
- Calendar pills responsive by screen size
- Collapsible Events filters
- Full date range as default
- Standby Promote button hidden when full
- Worker edit form correctly pre-populated
- Dynamic gig counts
- Payment calculator travel tiers repaired
- Automatic miles loading
- Cleaner loading and confirmation states

These improvements should be verified in the current branch before being treated as complete.

---

## 20. Technical Cleanup Still Needed

The source conversations continued to show several architecture issues.

### Duplicate API folders

Historical inspection showed both:

```text
API/
api/
```

Vercel is case-sensitive in deployment environments.

A duplicate uppercase and lowercase folder structure can cause:

- Confusion about which file is deployed
- Broken route assumptions
- Duplicate implementations
- Windows behavior differing from Linux deployment

This should be inspected and cleaned up as a scoped task.

### Build artifacts and dependencies in project copies

Historical project archives included:

- `dist`
- `node_modules`
- `.git` internals

These should not be used as source-of-truth documentation and should not be copied casually between project versions.

### Prop-drilling and duplicated calculation logic

The travel-pay inconsistency highlighted:

- Long prop chains
- Different screens using different calculation helpers
- Potential stale state
- Business logic implemented more than once

Long-term direction:

- Centralize pay calculation.
- Centralize location lookup.
- Centralize position-rate lookup.
- Centralize assignment status rules.
- Add tests around shared business logic.

---

## 21. Reported as Fixed or Working During These Conversations

Current code remains authoritative.

Reported as repaired or working at some point:

- Worker calendar event pills
- Responsive calendar labels
- Collapsible Events filters
- Default date range changed to All
- Standby promotion blocked when position full
- Edit Worker modal pre-population
- Dynamic gig counts
- Travel-tier loading
- Payment calculator travel pay
- Automatic mileage API
- Warehouse-address setting load
- Multi-location support
- Location pay-rate override interface
- Removal or planned removal of separate Markets section

---

## 22. Missing or Uncertain Features After This Phase

The following remained incomplete, uncertain, or in need of consolidation:

- Worker availability calendar
- Clear dashboard unfilled-position alerts
- “Days open” tracking
- Full attendance percentages
- Final reliability formula
- Full invite-response audit trail
- Bulk messaging
- SMS notifications
- Worker notification preferences
- Push notifications
- Regional-manager permissions
- Final Home Location behavior
- Final worker-location membership model
- Final pay override schema
- Final travel-origin logic
- Event profitability reports
- Position-demand analytics
- Booking trends
- Map view
- Client portal
- Automated payouts
- QuickBooks integration
- Formal automated testing
- Linting
- CI safety checks

---

## 23. MVP Versus Future SaaS Direction

### Core MVP direction

The MVP should reliably handle:

- Admin and worker login
- Workers and skills
- Events and positions
- Rank-based access
- Invitations and applications
- Assignment approval
- Standby
- Conflicts
- Worker schedule
- Reminders
- Check-in
- Event reporting
- Payments
- Location-aware pay
- Travel pay
- Mobile worker experience

### Strong post-MVP additions

- Worker availability
- Advanced reliability analytics
- Unfilled-position priority dashboard
- SMS and push notification preferences
- Regional managers
- Multi-company tenancy
- Location-specific business rules
- Client confirmation tools
- Automated accounting integration
- Native mobile app
- Advanced analytics

---

## 24. Decisions That Supersede Earlier Handoffs

### Markets versus Locations

Earlier direction allowed separate market concepts.

Newer direction:

- Use Locations as operational hubs and pay markets.
- Avoid duplicated Markets and Locations concepts.

### Global warehouse travel origin

Earlier direction:

- Use one warehouse address from Settings.

Newer direction:

- Use each worker’s Home Location as travel origin.
- Use event destination as travel endpoint.

### One global position rate

Earlier direction:

- Use global pay rates.

Newer direction:

- Event Location can override position rates.
- Fall back to global rate when no override exists.

### Stored total-gigs field

Earlier behavior:

- Read `total_gigs` from worker record.

Newer direction:

- Calculate gig count from assignments unless a reliable maintained aggregate is introduced.

### Always-visible event filters

Earlier behavior:

- Full filter grid was always visible.

Newer direction:

- Use a compact search and expandable Filters control.

### Blue calendar dots

Earlier behavior:
- Show blue dots.

Newer direction:
- Use event pills with responsive labels.

---

## 25. Open Questions for Final Product Documents

1. Is worker availability required before the next major release?
2. What exact availability data model should be used?
3. How do rank access and availability interact?
4. How do Home Location and worker-location membership interact?
5. Does Home Location affect eligibility or only travel?
6. Can an event use a pay Location different from its operational Location?
7. What happens when a Location has no rate override?
8. What happens when a worker has no Home Location?
9. Are miles one-way or round-trip?
10. Are travel tiers based on warehouse-to-event distance or total travel?
11. Should calculated mileage be editable?
12. Which assignment values are stored as snapshots?
13. Is pay hourly, flat, or configurable per event?
14. What does the worker see about pay before accepting?
15. What is the final reliability formula?
16. What creates an on-time, late, or no-show record?
17. Who can correct attendance records?
18. What defines an urgent unfilled event?
19. Should “days open” be tracked per event or per position?
20. Should invitations expire?
21. Is worker acceptance automatic approval or an application?
22. Which statuses belong in one unified workflow?
23. Which notification channels are included in the MVP?
24. Should the duplicate `API/` and `api/` folders be consolidated?
25. Which calculations need automated tests first?

---

## 26. Recommended Next Documentation Step

After the historical chat handoffs are complete, consolidate the project into:

- `docs/PRODUCT_SPEC.md`
- `docs/BUSINESS_RULES.md`
- `docs/CURRENT_STATE.md`
- `docs/ROADMAP.md`
- `docs/DECISION_LOG.md`
- `docs/ARCHITECTURE.md`

The consolidation process should:

1. Compare all handoffs.
2. Identify the newest confirmed decision.
3. Compare the decision to current code.
4. Label each feature:
   - Working
   - Partially working
   - Planned
   - Deprecated
   - Unknown
5. Ask Dylan to resolve remaining product conflicts.
6. Avoid implementing from historical handoffs alone.

---

## 27. Recommended Use by Claude Code

Before acting on anything in this document:

1. Read `CLAUDE.md`.
2. Read `docs/CODEBASE_AUDIT.md`.
3. Read the earlier historical handoffs.
4. Inspect current source code.
5. Check the current Git branch.
6. Identify whether the task touches production data.
7. Present the proposed files, risks, and verification steps.
8. Wait for approval before substantial changes.
9. Do not perform database-changing work until the production backup is complete.
