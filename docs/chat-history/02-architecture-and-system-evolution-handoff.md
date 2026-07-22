# GigStaffPro Architecture and System Evolution Handoff

**Source conversations:**
1. `GigStaffPro system architecture and notification setup` — February 4–5, 2026
2. `App code review` — February 13–20, 2026
3. `Setting up chat with previous context` — February 20–March 3, 2026

**Purpose:** Preserve the major architecture changes, notification setup, standby refinements, admin and worker UI changes, post-event reporting work, multi-location design, invitation workflow, and documentation practices established after the foundational build.

> **Important:** This is a historical handoff, not a guarantee that every feature remains complete or unchanged in the current repository. When it conflicts with current source code, `docs/CODEBASE_AUDIT.md`, or a newer confirmed decision, inspect the current implementation and use the newer decision.

> **Security note:** The source chats contained live-looking Supabase and integration credentials. No secret values are reproduced here. Treat any credential pasted into those conversations as exposed historical material and rotate or replace it when appropriate.

---

## 1. Phase Overview

These conversations represent the period when GigStaffPro moved from a large working prototype toward a more structured, feature-complete application.

The main themes were:

- Finishing and securing email notifications
- Correcting position and time formatting in emails
- Building and refining the standby system
- Breaking a very large `App.jsx` into smaller components
- Cleaning up hardcoded values and shared business rules
- Improving mobile usability
- Separating the worker dashboard into focused tabs
- Adding worker profile editing and profile photos
- Adding worker event history
- Building post-event reports and reliability ratings
- Adding a configurable team-leader role label
- Adding multi-location support
- Improving worker invitation and acceptance workflows
- Creating reference documents for continuity across chat sessions

---

## 2. Architecture Evolution

### Original problem

During this phase, `App.jsx` had grown to more than 7,000 lines and contained:

- Root application state
- Supabase calls
- Views
- Modals
- Worker portal logic
- Business-rule helpers
- Payment logic
- Event and assignment logic

This made changes risky because:

- A small copy-and-paste mistake could break deployment.
- Extracted components often missed required props.
- Duplicate declarations and mismatched JSX tags were common.
- Fixes in one copy of a rule did not automatically update other copies.
- It was difficult to know which file owned a specific behavior.

### Confirmed modularization direction

The project began extracting code into:

```text
src/components/
src/components/views/
src/components/modals/
src/utils/
src/constants.js
```

Major extracted or separately managed areas included:

- WorkerPortalView
- AvailableEventsSection
- StaffView
- SettingsView
- HistoryView
- Profile-related components
- Event modals
- Assignment modals
- Shared utilities and constants

### WorkerPortalView extraction

The `GigStaffPro system architecture and notification setup` chat focused heavily on moving `WorkerPortalView` and `AvailableEventsSection` out of `App.jsx`.

Key lesson:

- Component extraction must include every required prop and callback.
- Payment-related props were initially missed.
- `AvailableEventsSection` needed configuration and refresh functions passed through `WorkerPortalView`.
- Extraction should be performed surgically, with exact import/export and prop verification.
- “The file builds” is not enough; login, available events, assignments, and payments all need manual testing afterward.

### Constants file

A constants file was introduced or expanded to centralize:

- Position keys
- Position labels
- Event and assignment statuses
- Rank access values
- Pay-related settings
- Database table names
- Error messages
- Success messages
- Feature flags

This was intended to replace scattered magic numbers and hardcoded strings.

### Current architectural caution

The later repository audit found that several important rules are still duplicated. Therefore, this modularization phase improved organization but did not fully complete the separation of concerns.

---

## 3. Notification System Architecture

The notification system was treated as production-ready at the beginning of this phase.

### Technologies and infrastructure discussed

- Supabase Edge Functions
- Supabase database webhooks
- GitHub Actions hourly schedules
- Resend
- Verified sender domain
- Shared webhook secrets
- Worker and admin notification functions

### Edge functions discussed

The historical project documentation referenced three primary Edge Functions:

- `send-worker-notification`
- `send-admin-notification`
- `send-event-reminders`

Current repository structure may differ. The source for these functions was not consistently tracked in Git during the later audit.

### Sender domain

Email delivery was moved to:

```text
notifications@gigstaffpro.com
```

The conversations reported that:

- The domain was verified.
- Worker and admin emails were received.
- Resend showed delivered status.
- Inbox versus spam placement was treated as a domain-warming issue rather than an application failure.

### Notification types reported as working

Worker notifications:

- Application approved
- Application rejected
- Payment received
- 48-hour event reminder
- 24-hour event reminder
- 4-hour event reminder

Admin notifications:

- New worker application
- Worker cancellation

### Formatting fixes

Two email-formatting problems were corrected:

- Internal position keys such as `3_card_poker` were converted to natural display labels.
- 24-hour times were converted to 12-hour times with AM/PM.

These fixes were applied to both worker and admin emails.

### Security work

The chats reported adding shared-secret validation to webhook-triggered functions.

The intended rule was:

- Webhooks and scheduled endpoints should not accept unauthenticated arbitrary calls.
- Shared secrets belong in environment variables or managed secrets.
- Secret values must never be committed to source.

The current codebase audit later found public endpoints without clear shared-secret checks. Therefore, this historical claim must be verified against the present implementation.

### Notification state bug

A worker-notification bug caused cleared notifications to reappear or reset.

The intended result after the fix:

- Clearing or dismissing notifications should persist.
- A dismissed notification should not immediately be recreated from stale state.
- Notification loading and dismissal should use the same current data source.

---

## 4. Standby System Evolution

Standby became one of the most heavily refined workflows.

### Full-position behavior

The worker portal originally hid full positions completely.

Dylan chose a direction where:

- A full position should still be understandable to the worker.
- The worker may join a standby queue where allowed.
- Once the worker joins standby, the event should move out of Available Events.
- Standby events should appear in a separate Standby section on the worker dashboard.

### Status handling

Important statuses discussed included:

- Pending
- Approved
- Standby
- Rejected
- Declined
- Cancelled

Confirmed intent:

- Standby must not count as approved staffing.
- Standby workers must not inflate filled-position counts.
- Standby workers should not appear in the normal approved roster.
- Admin views should show standby separately.

### Automatic conversion to standby

The application workflow was refined so that:

- A worker can apply while a position still has space.
- If the position fills before the admin processes all pending applications, excess pending applications should convert to standby.
- Admin should not receive a confusing error when approving someone for a now-full position.
- Full-position logic should use current data, not stale counts.

The exact final implementation should be verified in current code because multiple flows reimplemented this logic.

### Queue order

The standby system was described as timestamp-based.

Intended behavior:

- Earlier standby entries appear first.
- Admin can see numbered queue positions.
- Workers can see their queue position without seeing other workers’ names.

Later decisions refined this to FIFO.

### Time-conflict rules

A specific conflict policy was selected:

1. A worker approved for Event A cannot join standby for Event B when the times overlap.
2. A worker already on standby for Event A may join standby for Event B.
3. A worker may hold multiple standby positions.
4. Before promotion from standby, the system must recheck whether the worker has since been approved for a conflicting event.
5. Conflicting events should be removed from the worker’s Available Events view.

### One position per event

A worker should normally hold only one dealing position per event.

An exception was discussed for operational roles such as:

- Host
- Setup
- Cleanup

However, explanatory exception wording was later removed from the worker UI because it was considered unnecessary and cluttered.

The current business rules should define which combinable roles remain valid.

### Admin visibility

Dylan selected adding standby visibility in both places:

- Event list: an orange badge such as “3 on standby”
- Event details: pending and standby counts next to each needed position

### Promotion behavior

The conversations discussed automatic or assisted promotion, but the historical record contains implementation confusion around “auto-approved” standby workers.

Do not treat this handoff as the final authority on whether promotion is automatic or admin-approved. Use later business-rule decisions.

---

## 5. Event Archiving and Filtering

### Archiving direction

Past events created clutter and caused upcoming events to be difficult to find.

The direction chosen was to archive completed or old events rather than showing them at the top of the default list.

The exact number of days before archiving was discussed but not firmly established in these three chats.

### Event filters selected

The first filter set included:

- Status:
  - Needs Staff
  - Confirmed
  - Cancelled
  - Archived
- Date range:
  - This Week
  - This Month
  - All
- Search:
  - Event name
  - Venue
- Sort:
  - Date
  - Name
  - Staffing percentage

Reported result:

- The filters were implemented and considered a strong improvement.
- Default event sorting needed to prioritize active and upcoming events rather than archived events.

---

## 6. Staff Management Redesign

The Staff Management page was considered cluttered and insufficiently polished.

### Chosen direction

A card-based worker layout was preferred over a dense table.

Reasons:

- Cleaner appearance
- More whitespace
- Easier scanning
- Better mobile layout
- Support for worker photos
- Better space for badges and quick information

### Filters and controls discussed

- Search
- Skill
- Rank
- Availability
- Reliability rating
- Name sorting
- Rating sorting
- Total gigs sorting
- Quick filters such as Rank 1 or low-reliability workers

### UI cleanup decisions

- Remove “Connected to Supabase” from the visible interface.
- Reduce always-visible worker details.
- Use expandable or dropdown sections where helpful.
- Remove duplicate Rank 5 filter options.
- Show host/team-leader badge on worker cards.
- Show reliability rating on worker cards.
- Support filtering workers below a selected reliability threshold.

---

## 7. Worker Portal Navigation and Profile

### Worker dashboard cleanup

The worker dashboard was intentionally simplified.

The Profile section was moved out of the dashboard into its own tab.

The dashboard retained high-level stats such as:

- Upcoming events
- Total gigs
- Rating
- Earnings

### Worker navigation

A hamburger menu was introduced near the notification bell for mobile usability.

Worker tabs included or evolved toward:

- Dashboard
- Profile
- History
- Schedule or assignments
- Available events
- Standby section

### Profile editing

Workers were intended to edit:

- Phone
- Email
- Address
- Shirt size

### Profile photo

Profile-photo upload was added using Supabase Storage.

This involved:

- Storage bucket configuration
- Upload logic
- Updating the worker record with the stored image path or URL
- Handling missing photos with a fallback avatar

### Profile wording

The worker profile was revised to:

- Remove redundant welcome banners.
- Use natural-language labels.
- Avoid technical or system-focused wording.
- Display total gigs dynamically rather than relying on a broken stored value.

---

## 8. Worker History

A dedicated History tab was selected instead of placing full work history on the dashboard.

### History direction

The History tab should support:

- Past events
- Most recent events first
- Earnings history
- Future detailed earnings breakdown
- Future printable pay records
- Future performance trends

### UI decisions

- Remove Total Hours from History summary.
- Remove Total Venues.
- Make “View all” versus “View recent” controls easier to notice.
- Sort history from newest to oldest.

---

## 9. Post-Event Reports and Reliability

Post-event reports became a major feature after standby work.

### Fair reliability concept

The system should distinguish between:

- On time
- Late
- No-show
- Other reportable issues

A worker who is consistently on time should remain near 5.0.

Late arrivals and no-shows should affect reliability more significantly.

The exact numerical formula must be taken from current code or later business-rule documentation.

### Host or team-leader reports

A problem was identified: an administrator is not always present.

The selected direction was:

- A worker can be designated as the event host or team leader.
- The host has a limited worker-facing report workflow.
- The host can submit the event report.
- Admin reviews or approves reliability changes.

### Database work discussed

New or extended data structures included:

- `is_host` on workers
- `host_worker_id` on events
- Post-event reports
- Worker attendance or rating details
- Reliability history

### Schema problems encountered

Foreign-key creation failed because linked ID columns used incompatible types:

- `bigint`
- `uuid`

This established an important migration rule:

- Inspect actual column types before writing foreign keys.
- Never assume every table uses UUIDs.
- Migration SQL must match the production schema exactly.

### Report behavior fixes

Problems and intended fixes included:

- Submitting a report caused the application to crash.
- Submitted reports did not initially change reliability ratings.
- Completed reports remained available and could be submitted repeatedly.
- A submitted report should close or disappear.
- Duplicate reports for the same event should be prevented.
- Reliability history should be visible on the worker profile.
- Due reports should appear prominently at the top of the host’s dashboard.
- Duplicate report prompts lower on the page should be removed.

### Host assignment location

Host selection was moved from the event-edit screen to the Assign Staff workflow because host designation was considered a staffing decision rather than general event data entry.

---

## 10. Configurable Team-Leader Label

Different companies use different terms for the person leading an event.

Terms discussed:

- Host
- Manager
- Team Lead
- Pit Boss

### Selected direction

Build one configurable label instead of hardcoding “Host.”

A utility was created around functions such as:

- `getHostLabel()`
- `setHostLabel()`
- `getHostLabelPlural()`

The historical implementation used localStorage for this label and added a Settings UI.

The label was then used across multiple component files.

### Important product insight

This configurability supports the future SaaS direction because different casino-party operators use different terminology.

---

## 11. Multi-Location Support

Multi-location support was identified as a strong SaaS selling point.

### Options considered

The selected direction was described as “Locations as an entity,” with future expansion toward regional managers and RLS.

### Core design choices

1. Events have a `location_id`.
2. Workers can be approved for one or more locations through a join table.
3. Locations have a timezone.
4. Locations may have optional rules or overrides.
5. The design should make future regional-manager permissions possible.
6. A global location switcher should appear in the admin header.
7. Admin pages should filter data based on the selected location.

### Worker management issue

After adding a second location, workers did not appear in Staff Management.

This showed that:

- Adding the location table alone was not enough.
- Existing workers needed location memberships.
- Staff queries needed to use worker-location relationships.
- Default location assignment or migration was necessary for existing data.

### Scale target

The interface should remain usable for companies with approximately ten or more locations.

### Later architecture direction

Later decisions recommended using:

- A Locations tab
- Worker Home Location
- Event location
- Location-specific pay overrides

Those later documents should supersede any incomplete implementation from this phase.

---

## 12. Worker Invitation and Acceptance Workflow

A more formal invite workflow was explored to replace manual chasing.

### Intended workflow

- Admin sends invitations to eligible workers.
- Workers accept or decline.
- Admin sees a clear record of who was invited and how they responded.
- Workers should see how many slots remain to create urgency.
- When admin fills the final slot, other pending accepted workers for that position should move to standby.
- Full positions should prevent new invites while clearly showing the correct filled count.

### Existing bulk invite interaction

GigStaffPro already had a Bulk Invite feature.

New invite work needed to avoid conflicting with:

- Existing rank-based bulk invitations
- Existing worker applications
- Existing standby rules
- Position capacity logic

### New-worker problem

The bulk invite screen originally depended on worker ranks.

New workers may not have a meaningful rank yet.

This created a need to distinguish:

- Inviting existing ranked workers
- Inviting brand-new workers
- Inviting by position qualification
- Inviting by rank or access level

### Rank default

When the invite screen opened, Rank 5 was initially selected.

The desired default was Rank 1.

### Invite safety and declined workers

Two lower-priority improvements were selected:

1. Add a confirmation dialog before sending invites.
2. Allow declined workers to be re-invited.

### Additional invite UI improvements

Reported changes included:

- Better mobile wrapping
- Rank controls that fit on smaller screens
- Improved Invite All button placement
- Better hint text placement
- Gig count shown on worker cards
- Position pills sorted by:
  1. Most open slots
  2. Alphabetical order as a tiebreaker

---

## 13. Mobile-Only UI Work

A recurring design principle was to make mobile changes without unnecessarily altering desktop.

### Admin event management

Mobile problems included:

- Buttons extending off-screen
- Dense event cards
- Cluttered action areas

Reported improvements:

- More compact mobile event layout
- Better stacking
- Full-width Assign Staff button
- Cleaner event-host/team-leader section in the assignment modal

### Admin dashboard

The top area was considered cluttered.

Direction selected:

- Remove Quick Actions.
- Add schedule calendar and list content instead.
- Simplify mobile header layout.

### Applications screen

Approve and reject buttons extended off-screen.

The mobile layout was revised so actions wrap or stack correctly.

### Worker portal

Mobile refinements included:

- Hamburger navigation
- Cleaner profile page
- Dedicated History tab
- Separate Standby section
- Priority post-event report prompt at top
- Reduced duplicate information

---

## 14. Build and Deployment Problems During This Phase

Common causes of Vercel build failures included:

- Missing props after component extraction
- Missing component imports
- Incorrect filenames
- Accidentally copying one view into another file
- Unexpected closing JSX tags
- Forms and divs closed in the wrong order
- Duplicate declarations
- Broken template literals
- Large-file manual copy errors

### Specific file mix-up

At one point, StaffView and SettingsView displayed the same content.

The likely cause was copying the wrong file contents into one of these files:

```text
src/components/views/StaffView.jsx
src/components/views/SettingsView.jsx
```

### Development lesson

For every code change:

1. Confirm the target filename.
2. Confirm the target folder.
3. Compare the proposed diff.
4. Run a build before deployment when possible.
5. Test the affected screen after deployment.
6. Avoid replacing entire large files for a small change.

This history directly supports the move to Claude Code and Git branches.

---

## 15. Documentation and Continuity

These conversations repeatedly hit length limits.

To preserve context, Claude created historical files such as:

- `GIGSTAFFPRO_MASTER_PROMPT.md`
- `GIGSTAFFPRO_PROJECT_DOCUMENTATION.md`
- `GigStaffPro_Reference_v2.md`

### Contents included in those references

- Project overview
- Tech stack
- Database schema
- Position keys and labels
- Payment formulas
- Authentication
- Notification architecture
- File locations
- Known bugs
- Troubleshooting steps
- Working style
- Recent feature changes

### Historical security mistake

Some old reference-document instructions told Dylan to paste real credentials into the document before uploading it to a new chat.

That instruction is now superseded and must not be followed.

Current rule:

- Documentation stores environment-variable names only.
- Real values remain in managed environment settings.
- Never place live credentials in a repository handoff or Claude context file.

---

## 16. Features Reported as Working During This Phase

These were reported as implemented or working at some point. Current code remains the source of truth.

- Worker and admin notification emails
- Verified GigStaffPro sender domain
- Reminder scheduling
- Webhook secret protection
- Natural position labels in emails
- 12-hour time display in emails
- Extracted WorkerPortalView
- AvailableEventsSection
- Event archiving and filters
- Card-based Staff Management
- Worker Profile tab
- Worker profile editing
- Profile-photo upload
- Worker History tab
- Standby queue
- Worker standby section
- Admin standby counts
- Time-conflict rules for standby
- Mobile application-action layout
- Post-event report tables
- Host designation
- Host assignment
- Post-event report submission
- Reliability updates
- Reliability history
- Host report reminders
- Mobile event-management improvements
- Multi-location entity
- Global location switcher
- Worker invite acceptance workflow changes
- Invite confirmation
- Re-invite declined workers
- Configurable host/team-leader label
- Updated developer reference documentation

---

## 17. Incomplete or Uncertain Areas

The following require verification against current code and later decisions:

- Whether all three historical Edge Functions still exist
- Whether webhook shared-secret protection remains active
- Whether notification source code is tracked in Git
- Whether standby promotion is automatic or admin-approved
- Whether pending-to-standby conversion is identical in every workflow
- Whether setup, cleanup, and host can still be combined with another assignment
- The final event auto-archive timing
- The final reliability calculation formula
- Whether reliability changes require admin approval
- Whether post-event reports are fully duplicate-proof
- Whether location membership is required for all workers
- Whether every event now has a non-null location
- Whether location-specific rules and timezones are fully enforced
- Whether bulk invite and worker invitation are separate workflows
- Whether SMS notifications were ever completed
- Whether all old Edge Functions were replaced by Vercel API routes
- Whether the team-leader label still uses localStorage or database settings
- Whether profile photos are active in the current production app

---

## 18. Superseded or Corrected Decisions

### Secrets in reference documents

Old direction:
- Paste real Supabase credentials into a continuity document.

Current direction:
- Never place secret values in documentation or Claude context.

### Monolithic `App.jsx`

Old condition:
- Most logic lived in a single file.

New direction:
- Use modular views, modals, utilities, and constants.

### Full positions hidden completely

Old behavior:
- Full positions disappeared from the worker portal.

Refined behavior:
- Standby availability should be presented clearly, then move to a separate Standby section after joining.

### Standby included in staffing count

Old bug:
- Standby workers made an event appear overbooked.

Correct behavior:
- Only approved assignments count as filled.

### Host hardcoded everywhere

Old behavior:
- “Host” was fixed terminology.

Refined behavior:
- Use a configurable label for Host, Manager, Team Lead, Pit Boss, or another company term.

### Host selected in event editing

Old behavior:
- Host was chosen in event forms.

Refined behavior:
- Host/team leader is assigned in the staffing workflow.

### Worker profile on dashboard

Old behavior:
- Profile details took space on the dashboard.

Refined behavior:
- Move profile to its own tab.

### History embedded in dashboard

Old behavior:
- Past work competed with current priorities.

Refined behavior:
- Use a dedicated History tab.

---

## 19. Open Questions for Consolidation

These should be answered using later chats, current code, and current business decisions.

1. What is the authoritative standby promotion rule?
2. What is the final standby FIFO implementation?
3. Which roles can be combined at the same event?
4. What is the final event auto-archive timing?
5. Which notification types remain active?
6. Which notification transport is authoritative: Vercel APIs, Supabase Edge Functions, or both?
7. Are all notification endpoints authenticated?
8. Is SMS part of the current MVP?
9. What is the final reliability formula?
10. Does admin approval gate rating changes?
11. Who can be designated as an event lead?
12. Is the team-leader label stored globally, per company, or per location?
13. What multi-location permissions are required?
14. Can managers see only assigned locations?
15. Is worker membership per location required?
16. What is the default location for existing workers?
17. Are pay rates global or location-specific?
18. Are travel tiers global or location-specific?
19. How should brand-new, unranked workers be invited?
20. What is the relationship between Bulk Invite and event-specific Invite Workers?
21. Should workers see remaining position counts?
22. What happens to excess acceptances when the last slot is filled?
23. Are profile photos required or optional?
24. Which mobile pages still need redesign?
25. Which historical reference document contains decisions not yet captured in the repository?

---

## 20. Recommended Use

Use this document when preparing:

- `docs/PRODUCT_SPEC.md`
- `docs/BUSINESS_RULES.md`
- `docs/CURRENT_STATE.md`
- `docs/ROADMAP.md`
- `docs/DECISION_LOG.md`
- `docs/ARCHITECTURE.md`

Before implementing any feature described here:

1. Read `CLAUDE.md`.
2. Read `docs/CODEBASE_AUDIT.md`.
3. Review the foundational handoff.
4. Review newer handoffs.
5. Inspect current source files.
6. Compare current behavior to the historical decision.
7. Present a small, reviewable plan.
8. Do not make database changes until the production backup is complete.
