# GigStaffPro Foundational Build Handoff

**Source conversations:**  
1. `Casino party staffing software builder` — January 13–21, 2026  
2. `Casino party staffing software builder` — January 21–February 13, 2026  

**Purpose:** Preserve the important product decisions, business rules, implementation history, and unresolved issues from the two foundational Claude browser chats so Claude Code can use them as project history.

> **Important:** This is a historical handoff, not the final source of truth for the current code. When this document conflicts with the repository, `docs/CODEBASE_AUDIT.md`, or a newer decision document, inspect the current source and use the newer confirmed decision.

> **Security note:** API keys, passwords, tokens, private email addresses, and other credentials that appeared in the original chats are intentionally omitted. Never restore secrets from chat history into source code.

---

## 1. Product Vision

GigStaffPro was conceived as a simple, highly specialized staffing platform for independent casino-party operators.

The product should feel clearly designed for the casino-party industry rather than like a generic CRM, scheduling platform, or workforce tool.

The initial operating business is Vegas on Wheels, but the product direction is broader: it should eventually be useful to other casino-party and gig-workforce businesses.

Primary product goals established in the foundational chats:

- Make event staffing faster for administrators.
- Make open shifts easy for workers to understand and claim.
- Reduce manual calls, texts, spreadsheets, and follow-up.
- Support casino-specific positions and workflows.
- Work well on both desktop and mobile.
- Eventually behave like an installable app or dedicated mobile product.
- Keep the worker interface simpler than the admin interface.
- Automate reminders, invitations, status tracking, and follow-up.
- Track reliability and post-event performance.
- Support payment calculations and travel compensation.

---

## 2. User Roles

### Admin

Confirmed direction:

- Full access to workers, events, staffing, assignments, applications, payments, reports, and settings.
- Create and edit events.
- Create, edit, activate, and manage workers.
- Assign workers to event positions.
- Approve or reject worker applications.
- Invite workers to events.
- View accepted, declined, pending, and standby responses.
- Review post-event reports.
- Approve reliability changes.
- Calculate and track worker pay.
- Configure positions, ranks, pay rules, travel tiers, bonuses, and other business settings.

### Worker

Confirmed direction:

- Mobile-friendly login using phone number and a four-digit PIN.
- View open events for which the worker is qualified.
- Apply for available positions.
- View approved assignments and schedule.
- Check in at events.
- Receive invitations and reminders.
- Accept or decline invitations.
- View event details, including directions.
- Cancel an assignment outside the restricted cancellation window.
- Switch positions at the same event when qualified and when the target position is available.
- View event history and, where enabled, payment information.

### Client

A client-facing PDF was discussed early and explicitly rejected at that time.

No client portal was established as a foundational requirement.

---

## 3. Casino-Specific Positions and Skills

The system was designed around position-specific staffing rather than generic shifts.

Positions discussed or implemented during the foundational build included:

- Blackjack
- Poker
- Roulette
- Craps
- Three Card Poker
- Ultimate Hold'em
- Baccarat
- Event Lead
- Host
- Bartender

Later project decisions may contain a larger or revised position list.

### Stable position identifiers

A major technical decision was to separate internal identifiers from display labels.

Example:

```text
position_key: blackjack_dealer
display label: Blackjack Dealer
```

Confirmed rationale:

- Free-text position labels caused assignment, qualification, and pay-rate matching problems.
- Internal keys should remain stable.
- Display labels should be editable without breaking business logic.
- Assignments, skills, applications, and pay rates should use the same stable key system.

The foundational chats show this becoming an important standardization effort after several bugs involving position matching.

---

## 4. Event Management Requirements

Confirmed event-management direction:

- Create, edit, view, and archive events.
- Store event date and start/end times.
- Store venue address.
- Store room or area within the venue.
- Store staffing requirements by position.
- Store dress-code and event notes.
- Show events in list and calendar views.
- Sort multiple events on the same day by start time.
- Use consistent date and time handling across admin and worker screens.
- Support both 12-hour and 24-hour time display.
- Support timezone-aware display or a configurable timezone setting.

### Date and time history

The foundational chats contained repeated bugs where:

- Worker calendars showed events one day late.
- Event Management showed one date while other screens showed another.
- “Today,” “past,” and “upcoming” labels were inconsistent.
- Same-day events were not consistently sorted by time.

These problems were eventually reported as fixed during the conversation, but date-only values and timezone conversion remain high-risk areas that should be tested whenever event date logic changes.

---

## 5. Worker Qualification and Event Visibility

Confirmed direction:

- Workers should see only positions for which they are qualified.
- Qualification should use stable position keys.
- Workers should not need to be recreated when the position-key system changes; existing worker skills should be migrated or normalized.
- Available events should show only relevant qualified positions.
- The admin assignment view should avoid clutter from unrelated worker skills.

### Rank-based access

A worker rank system was established:

- Rank 1 represents the strongest or earliest-access workers.
- Higher-numbered ranks receive access later.
- Rank controls when workers can see or apply for open events.

The exact access windows were refined in later chats and should be defined in `docs/BUSINESS_RULES.md`, not inferred solely from this historical handoff.

---

## 6. Assignment and Application Workflow

### Worker applications

Confirmed workflow:

1. Worker sees an available qualified position.
2. Worker applies.
3. Application remains pending until admin action, unless the event uses a different staffing mode.
4. Admin approves or rejects the application.
5. The event should appear as a confirmed schedule item only after approval.
6. Notifications should reflect the resulting status.

A bug was identified where pending applications were added to the worker’s calendar before admin approval. The intended rule is that pending interest and approved assignments must be visibly distinct.

### Admin assignment

Confirmed direction:

- Admin can assign a worker directly to a specific event position.
- Position capacity must be checked correctly.
- The system should not report a position as fully staffed while open slots remain.
- Assignment records must preserve both the display position and stable position key where required by the current schema.
- Admin views should make it easy to focus on one position at a time.

### Conflict prevention

Confirmed rule:

- A worker must not be assigned to or approve themselves for overlapping events.
- Conflict checks must apply on both the admin and worker sides.
- Two events on the same date are allowed when their times do not overlap.
- Same-day assignments should be sorted chronologically.

---

## 7. Cancellation and Position Switching

### Seven-day cancellation restriction

Confirmed business rule:

- Workers may remove themselves from an assignment when the event is more than seven days away.
- Workers may not self-cancel within seven days of the event.
- Within seven days, they must contact an administrator.

The same restriction was intended to apply to worker-initiated position switching.

### Switching positions

Confirmed direction:

- An already-approved worker may switch to another open position at the same event.
- The worker must be qualified for the target position.
- The target position must have capacity.
- The switch must not violate the seven-day restriction.
- The original position should be released correctly.
- Notifications and staffing counts should update consistently.

---

## 8. Standby System

Standby was a central product feature.

Confirmed direction:

- Workers can be placed on standby when a requested position is full.
- The system should automatically notify standby workers when a spot opens.
- Standby promotion should avoid double-booking and position-capacity errors.
- Pending, approved, rejected, declined, cancelled, and standby statuses must remain distinct.

Later chats refined the standby order and promotion rules. Those newer rules should be captured in `docs/BUSINESS_RULES.md`.

---

## 9. Notifications and Email Automation

### In-app notifications

The notification bell existed early but initially lacked complete behavior.

Intended notification categories included:

- Worker application submitted
- Application approved
- Application rejected
- Worker cancellation
- Assignment or invitation changes
- Standby promotion
- Payment marked as paid
- Upcoming event reminders

### Automated reminders

Confirmed reminder schedule from the foundational chats:

- 48 hours before the event
- 24 hours before the event
- 4 hours before the event

The four-hour reminder should include a directions link.

### Email

Resend was selected for email delivery.

Email workflows discussed or implemented included:

- Worker invitation
- Application approval
- Application rejection
- Admin notification when a worker applies
- Admin notification when a worker cancels
- Event reminders
- Payment notifications

The chats included extensive Resend, DNS, sender-domain, Vercel, and Supabase troubleshooting.

### Security requirement

Several API keys and tokens were pasted into the original conversations. They must be treated as exposed historical credentials.

Do not place any credential from the exported chat into:

- Source code
- Markdown documentation
- Git history
- Claude prompts
- Screenshots
- Logs

Use environment variables and rotate credentials when appropriate.

---

## 10. Check-In

Confirmed direction:

- Workers should be able to check in for assigned events.
- Check-in should be worker-facing and mobile-friendly.
- The longer-term vision included location-aware or geofenced check-in.
- Check-in results should be visible to administrators.

The foundational chats do not establish a final authoritative geofence distance or approval workflow. Use newer business-rule documentation for those details.

---

## 11. Post-Event Reports and Reliability

Confirmed direction:

- A lead, host, manager, or administrator can submit a post-event report.
- Reports can rate workers and document issues.
- Worker reliability should be tracked over time.
- Admin should review or approve reliability changes rather than allowing unreviewed client-side changes.
- Reports should support operational follow-up after an event.

The role label for the person responsible for an event was expected to be configurable, such as:

- Host
- Manager
- Pit Boss
- Team Leader

---

## 12. Payments

Payment tracking became a major feature during the second foundational chat.

### Confirmed payment concepts

- Pay is associated with the worker’s assigned position.
- Dealer rates can differ by game.
- Travel pay is based on distance tiers.
- Lake Geneva can receive an additional bonus.
- Holiday events can receive a multiplier.
- Pay settings should be editable.
- Admin should be able to calculate and track payment status.
- Workers may be allowed to see pay for completed events.
- The system should support marking assignments paid or unpaid.
- QuickBooks integration was desired as a future enhancement because checks were being printed manually.

### Rates used during the foundational build

The conversation included the following initial/default hourly rates:

| Position | Rate |
|---|---:|
| Blackjack Dealer | $35/hour |
| Roulette Dealer | $40/hour |
| Poker Dealer | $35/hour |
| Craps Dealer | $45/hour |
| Event Lead | $60/hour |
| Host | $25/hour |
| Bartender | $25/hour |

These rates were implementation defaults from the foundational period, not necessarily the latest production rates.

### Travel tiers used during the foundational build

| Distance | Travel Pay |
|---|---:|
| 0–30 miles | $0 |
| 31–60 miles | $30 |
| 61–90 miles | $60 |
| 91–120 miles | $90 |
| 121–150 miles | $120 |
| 151–180 miles | $150 |
| 181–210 miles | $180 |
| 211–240 miles | $210 |
| 241–270 miles | $240 |
| 271–300 miles | $270 |
| 301–330 miles | $300 |

Additional rules discussed:

- Lake Geneva bonus: $15
- Holiday multiplier: 1.5×

### Payment implementation problems encountered

- Pay rates used display labels while application logic expected internal position keys.
- This caused payment calculations to show `$0.00`.
- The correction was to use consistent internal keys across positions, assignments, and pay-rate records.
- Database setup and UI calculation logic became temporarily out of sync.
- The Payment Calculator component later broke during large-file editing and required repair.

---

## 13. Authentication History

The foundational implementation used custom authentication rather than Supabase Auth.

### Worker login

- Phone number
- Four-digit PIN
- PIN stored as a hash
- Active/inactive worker status

### Admin login

- Username
- Password
- Password stored as a hash

### Problems encountered

- Phone formatting differences prevented valid workers from being found.
- Parentheses, spaces, and hyphens caused matching problems.
- Worker onboarding initially required manual SQL.
- The system needed a scalable flow for approximately 150 workers.
- Admin password setup required manual hashing and SQL updates.

### Historical security limitation

The foundational implementation used unsalted SHA-256 and client-side hash comparison. This is not considered a final secure authentication design.

Future authentication work should follow the security priorities in `docs/CODEBASE_AUDIT.md`.

---

## 14. Mobile and User Experience Requirements

Confirmed direction:

- Worker-facing screens must be mobile-first.
- Admin screens must still work well on desktop.
- Navigation should remain usable as the number of workers, events, positions, and locations grows.
- Worker assignment lists need filtering and uncluttered position views.
- Position tabs should open independently.
- A “show only unassigned workers” filter was added to reduce clutter.
- Calendar and list views should display the same dates and statuses.
- Event room/area must populate on worker screens.
- Schedule items should clearly distinguish pending applications from approved assignments.

---

## 15. Technical and Deployment History

The foundational build established:

- React
- Vite
- Tailwind CSS
- Supabase Postgres
- Vercel
- GitHub
- GitHub Desktop
- Lucide React
- Resend

Major setup and deployment issues included:

- Windows hiding file extensions and producing files such as `package.json.txt`
- Node.js not initially installed or available
- Vite entry-path errors
- Missing `src/main.jsx`
- Vercel build failures
- Very large `App.jsx`
- Duplicate or malformed component declarations
- JSX bracket and closing-tag errors
- Direct copy-and-paste code changes causing syntax problems
- Database schema and frontend code drifting out of sync

These issues directly motivated the move to Claude Code.

---

## 16. Features Reported as Implemented During These Chats

The conversations reported implementation or successful testing of many features. Current repository code remains the authority.

Reported as built or working at some point:

- Admin dashboard
- Worker directory
- Event creation and management
- Worker assignment
- Worker portal
- Phone-and-PIN worker login
- Admin login
- Worker self-application
- Rank-based event access
- Position qualification filtering
- Conflict checking
- Calendar and list schedule views
- Same-day chronological sorting
- Application approval and rejection
- Worker cancellation with seven-day restriction
- Position switching
- Standby handling
- In-app notification foundation
- Email approval notifications
- Resend sender-domain configuration
- Post-event reports
- Reliability tracking
- Payment calculator foundation
- Pay-rate, travel-tier, and bonus tables
- Supabase connection
- Vercel deployment

These claims should be verified against the current code and live application before relying on them.

---

## 17. Discussed but Not Reliably Confirmed as Complete

The following were discussed, partially attempted, planned, or inconsistently working:

- QuickBooks integration
- Complete automated reminder delivery at every interval
- Complete admin email notification coverage
- Payment notification email
- Fully secure authentication
- Server-side authorization
- Version-controlled RLS policies
- Version-controlled database migrations
- Fully automated standby promotion
- Complete geofenced check-in
- Client portal
- Client confirmation PDF
- Native mobile app
- Bulk approve for an event
- Bulk invite by position key and rank
- Bulk mark-paid by pay period
- Complete worker account self-creation at scale
- Clean separation of the very large `App.jsx`
- Removal of all hardcoded credentials
- Consistent environment-variable-only configuration

---

## 18. Superseded or Changed Decisions

### Client PDF

Early conversation text briefly referenced a client PDF, but Dylan explicitly stated that a client PDF was not needed at that time.

Treat “no client PDF required” as the foundational decision unless a newer document changes it.

### Local storage versus Supabase

The initial prototype used or discussed local persistence.

Supabase later became the primary database direction.

Do not treat localStorage as the intended authoritative production database.

### Display labels versus stable keys

Early implementation used free-text position labels.

This was superseded by stable `position_key` identifiers with separate display labels.

### Generic reminders versus exact schedule

General reminders were discussed first.

This was refined to:

- 48 hours
- 24 hours
- 4 hours, with directions

### Pending applications on the schedule

The early implementation added pending applications to the worker calendar.

The intended behavior was refined so pending and approved states are clearly separated, and confirmed schedule placement should follow approval.

---

## 19. Known Bugs and High-Risk Areas From the Foundational Period

- Overlapping-event checks differed between admin and worker flows.
- Date and timezone conversions shifted events by one day.
- “Today,” “past,” and “upcoming” labels disagreed.
- Position keys and display labels did not match.
- Assignment inserts failed when a required position field was null.
- Capacity checks incorrectly reported fully staffed positions.
- Pending applications appeared as confirmed schedule items.
- Position tabs expanded together.
- Worker qualification filters sometimes returned zero workers or zero positions.
- Room/area values did not appear in the worker portal.
- Email triggers delivered approvals but not all admin notifications.
- Duplicate assignment constraints caused test SQL failures.
- Payment rates returned zero because of identifier mismatches.
- Large manual edits introduced syntax and JSX errors.
- API credentials were hardcoded or pasted into chats.
- Authentication hashes were exposed to browser-side logic.

---

## 20. Testing and Verification Completed During These Chats

Testing was primarily manual.

Examples:

- Local Vite startup
- Vercel deployment checks
- Supabase table visibility
- Admin login
- Worker PIN login
- Worker application
- Admin approval
- Worker calendar
- Same-day event sorting
- Position assignment
- Position capacity
- Cancellation flow
- Email receipt tests across multiple addresses
- Resend domain verification
- Payment calculator UI checks

No formal automated test suite was established in these chats.

---

## 21. Open Questions for the Consolidated Product Specification

These should be resolved using later conversations and current business decisions:

1. What are the final rank access windows?
2. What is the final standby ordering rule?
3. Is standby promotion automatic or admin-approved?
4. What are the final staffing modes per event?
5. What are the final position keys and labels?
6. What are the final pay rates for each position?
7. Is pay hourly, flat-rate, or configurable per position/event?
8. What is the final holiday-pay rule?
9. What check-in geofence distance is authoritative?
10. Who approves check-in and post-event reports?
11. What notifications are email, SMS, push, or in-app?
12. Which reminder intervals remain active?
13. Should workers see pay before or only after an event?
14. Is worker self-registration allowed, invite-only, or administrator-created?
15. What parts of authentication will move to Supabase Auth or server-side functions?
16. Is QuickBooks integration still a target?
17. Is a client-facing confirmation or portal now required?
18. What bulk-admin tools are still needed?
19. Which features are required for the first SaaS-ready release?
20. What database schema and RLS policies currently exist in production?

---

## 22. Recommended Use of This Handoff

Use this document as historical context when preparing:

- `docs/PRODUCT_SPEC.md`
- `docs/BUSINESS_RULES.md`
- `docs/CURRENT_STATE.md`
- `docs/ROADMAP.md`
- `docs/DECISION_LOG.md`

Do not ask Claude Code to implement directly from this document alone.

Before any implementation:

1. Read `CLAUDE.md`.
2. Review `docs/CODEBASE_AUDIT.md`.
3. Review newer handoffs and decision documents.
4. Inspect the current code.
5. Identify conflicts between history and current behavior.
6. Present a small plan before editing.
