# GigStaffPro Handoff 04: Current Technical Architecture

**Purpose:** Explain the technical system Claude Code is inheriting, including the application structure, data ownership, integrations, deployment flow, and known technical risks.

**Status:** Transition reference document

**Important:** This document describes the most recently known architecture from the prior development conversations. The repository and live Supabase project are the final source of truth. Claude Code must inspect both before making architectural changes.

---

## 1. System Overview

GigStaffPro is a responsive web application for managing event-based workers in the casino-party industry.

The system currently includes:

- An administrator-facing web application
- A worker-facing portal
- A Supabase backend
- Vercel-hosted frontend and API functions
- Supabase Edge Functions
- Database-triggered email notifications
- Scheduled reminder checks
- Calendar file generation
- Distance-based travel-pay calculations
- Location-based pay-rate configuration

The application began as a large React prototype with local sample data. It later evolved into a live application using Supabase as the backend.

The system is not a simple prototype anymore. It has live workflows, database relationships, notification automations, and production users.

---

## 2. Main Technology Stack

### Frontend

The frontend is built with:

- React
- Vite
- JavaScript
- Tailwind CSS
- Lucide React icons

The main entry files include:

```text
src/main.jsx
src/App.jsx
src/index.css
src/constants.js
src/supabaseClient.js
```

The app is organized into views, reusable components, modal components, helper utilities, and custom hooks.

### Backend

Supabase is used for:

- PostgreSQL database
- Authentication
- Row Level Security
- Database webhooks
- Edge Functions
- Application data storage

### Hosting and Serverless Functions

Vercel is used for:

- Frontend deployment
- Production hosting
- Serverless API routes

The production app has historically been deployed at:

```text
https://gigstaffpro.vercel.app
```

The custom domain and deployment configuration should be verified in the current Vercel project.

### Email Delivery

Resend is used for transactional email.

The notification system has sent from:

```text
notifications@gigstaffpro.com
```

The domain was authenticated for email delivery. Deliverability and domain-warming discussions occurred during development, but current status should be checked in Resend.

### Scheduled Jobs

GitHub Actions has been used to call a Supabase reminder function on an hourly schedule.

The known workflow file was:

```text
.github/workflows/event-reminders.yml
```

The historical schedule ran hourly near five minutes after the hour.

---

## 3. Repository Structure

The repository evolved from one very large `App.jsx` file into a more modular structure.

A previously inspected version of the project included:

```text
GIGSTAFFPRO/
├── .github/
│   └── workflows/
├── API/
│   ├── calculate-distance.js
│   └── send-email.js
├── api/
│   └── send-email.js
├── src/
│   ├── components/
│   ├── utils/
│   ├── App.jsx
│   ├── constants.js
│   ├── index.css
│   ├── main.jsx
│   └── supabaseClient.js
├── index.html
├── package.json
├── tailwind.config.js
├── vercel.json
└── vite.config.js
```

The existence of both `API/` and `api/` is a possible sign of duplicate or obsolete Vercel routes. Do not delete either folder until current references and production behavior are confirmed.

Generated or local-only folders such as the following may also exist:

```text
dist/
node_modules/
```

Claude Code should inspect `.gitignore` and confirm these are not improperly committed.

---

## 4. Frontend Architecture

### 4.1 App.jsx

`src/App.jsx` originally contained most of the application in one file and grew to more than 7,500 lines.

It was later refactored substantially.

In later repository inspections, `App.jsx` was approximately 35–38 KB rather than thousands of lines. This indicates that much of the interface and workflow logic had been moved into separate files.

The current responsibility of `App.jsx` should be limited primarily to:

- Application shell
- Authentication state
- Shared top-level state
- Navigation
- View routing
- Data-hook coordination
- Passing shared data and callbacks to views

Claude Code should not move completed components back into `App.jsx`.

### 4.2 Known Views

Versions of the modular application included views such as:

```text
DashboardView
EventsView
StaffView
ApplicationsView
PaymentsView
ScheduleView
HistoryView
SettingsView
ProfileView
WorkerPortalView
```

These names represent functional areas and may have evolved further.

The worker portal and settings sections were both large enough to require additional decomposition during later development.

### 4.3 WorkerPortalView

The worker portal includes or is intended to include:

- My Shifts
- Open Shifts
- Worker applications
- Standby status
- Worker profile
- Messages or notifications
- Event details
- Calendar downloads
- Directions
- Cancellation restrictions

The worker portal should use actual authenticated-worker data. It must not rely on the early prototype’s role-switching button or sample worker records.

### 4.4 SettingsView

Settings manages company-level configuration such as:

- Positions
- Locations
- Pay rates
- Travel tiers
- Bonuses
- Scheduling rules
- Notification settings
- Other company preferences

The settings area became complex and was later separated into smaller components. Preserve that modular structure.

### 4.5 Utilities

Known utility files included:

```text
src/utils/positionHelpers.js
src/utils/dateHelpers.js
src/utils/authHelpers.js
```

Position values require special care because internal keys and visible labels are not always identical.

Known helper patterns included:

```javascript
getPositionLabel(key)
getPositionKey(label)
positionMatches(a, b)
```

Use these helpers instead of adding new one-off position comparisons.

### 4.6 Constants

Shared constants are stored in:

```text
src/constants.js
```

This may include:

- Position definitions
- Status values
- Navigation definitions
- Default settings
- Scheduling windows
- Labels
- Other reusable application values

Before adding a hardcoded value to a component, check whether it belongs in `constants.js` or in a database-backed setting.

---

## 5. Data-Loading Architecture

During the refactor, data-fetching and state logic began moving out of view components and into custom hooks.

Claude Code should inspect the current hooks before adding new Supabase queries directly into large components.

The intended pattern is:

```text
Supabase
   ↓
custom data hook
   ↓
App or feature coordinator
   ↓
view/component
```

This helps avoid:

- Repeating the same query in multiple components
- Different screens calculating the same value differently
- Stale local copies of database data
- Excessive prop and state complexity
- Large, difficult-to-maintain view files

Before creating a new data hook, search for an existing hook that already owns the relevant data.

---

## 6. Supabase as the Source of Truth

Supabase should be treated as the source of truth for live operational data.

The frontend should not maintain a second permanent copy of production data in localStorage or hardcoded arrays.

Early prototypes used sample arrays and localStorage. Those patterns should not be reintroduced for live features.

### Core data domains include:

- Events
- Workers
- Assignments
- Settings
- Locations
- Pay rates
- Travel tiers
- Bonuses or adjustments
- Worker availability
- Standby records or standby assignment statuses
- Notification-related state
- Check-in or attendance data, where implemented

Exact current table and column names must be confirmed in the database and repository.

---

## 7. Core Database Model

The following models were used during development. Some fields may have changed.

### 7.1 Events

An event stores operational details such as:

- Event name
- Date
- Start time
- End time
- Venue
- Room
- Address
- Location
- Client information
- Dress code
- Parking notes
- Setup instructions
- Worker-visible notes
- Internal notes
- Staffing mode
- Self-scheduling settings
- Position requirements

Event positions have historically been stored as JSONB objects or arrays.

Claude Code must inspect the current event-position format before changing event creation, editing, staffing counts, or pay calculations.

### 7.2 Workers

A worker record may contain:

- Name
- Email
- Phone
- Skills
- Rank level
- Reliability rating
- Total gigs
- No-shows
- Home location
- Notification preferences
- Active or inactive status
- Authentication linkage
- Optional certifications or documents

Worker skills have historically used arrays of internal position keys.

Do not compare skill labels and position keys with direct string equality without using the existing position helper functions.

### 7.3 Assignments

Assignments connect a worker to an event and position.

Known fields or concepts include:

- Worker ID
- Event ID
- Position
- Assignment status
- Applied date
- Approval status
- Payment status
- Total pay
- Standby order or position
- Cancellation state
- Check-in state

Known assignment statuses have included:

```text
pending
approved
standby
rejected
cancelled
```

The exact allowed statuses and their lifecycle must be confirmed before modifying assignment logic.

### 7.4 Settings

The settings table stores editable company configuration.

A historical structure used:

```text
setting_key
setting_value
```

with `setting_value` stored as JSONB.

Some configuration may now have dedicated tables rather than remaining inside the general settings table.

### 7.5 Pay Rates

The pay-rate system stores rates by position and location.

The important current design decision is:

> Event location determines which position pay rates apply.

Pay rates should not be tied only to one universal company-wide value when a location-specific override exists.

### 7.6 Travel Tiers

Travel pay is determined separately from position pay.

The important design decision is:

> Worker home location is the starting point used to determine travel pay.

The event’s assigned location can provide the starting address or location-specific rules.

Travel-tier calculations should not be based on the administrator’s current browser location.

### 7.7 Locations

Locations replaced the earlier Markets concept.

A location can represent an operational base such as:

- Milwaukee Warehouse
- Madison Warehouse
- Another future operating location

A location may include:

- Name
- Address
- Default pay rates
- Pay-rate overrides
- Travel rules
- Active status
- Other operational defaults

Do not reintroduce a separate Markets system unless a new product requirement clearly requires it.

### 7.8 Bonuses and Adjustments

The payment architecture has included support for bonuses or modifiers such as:

- Holiday multiplier
- Lake Geneva adjustment
- Travel pay
- Position-specific overrides
- Other event adjustments

Check the current payment tables and calculation utilities before adding another adjustment mechanism.

---

## 8. Pay Calculation Ownership

Pay calculations may involve several inputs:

```text
base position rate
+ location-specific override
+ travel pay
+ event-specific adjustment
+ holiday multiplier
+ bonus
= total worker pay
```

There should be one authoritative calculation path.

Claude Code must search for all pay-calculation implementations before changing one. Historical development may have left calculations in:

- Frontend components
- Payment utilities
- Event forms
- Assignment approval logic
- Database records
- API functions

Avoid having different screens independently calculate pay.

Where possible:

- Centralize calculation logic
- Store enough calculation detail for auditing
- Distinguish calculated pay from manually overridden pay
- Preserve already-approved or already-paid historical amounts

Do not retroactively recalculate completed payments without an explicit migration plan.

---

## 9. Standby Architecture

Standby is part of assignment management, not a separate unrelated staffing system.

The known rules include:

- Standby follows FIFO order.
- Workers see their queue number, not other workers’ names.
- A worker can be promoted when a normal assignment opens.
- Promotion should auto-confirm.
- The promoted worker should be notified.
- Standby workers should not count toward filled-position totals.

Known status checks included logic similar to:

```javascript
assignment.status !== 'standby'
```

when calculating filled positions.

Approved-worker filtering has historically needed to account for older records where status may be blank or missing.

Do not simplify assignment counts without testing standby behavior.

---

## 10. Location and Distance Architecture

Distance calculations support travel compensation.

Known Vercel API files included:

```text
API/calculate-distance.js
API/send-email.js
api/send-email.js
```

`calculate-distance.js` should be inspected to determine:

- Which mapping provider it uses
- Required environment variables
- Request and response format
- Error handling
- Whether distance is one-way or round-trip
- Whether distance is measured from the worker, warehouse, or event location
- Whether the function is still actively called

Do not replace the current mapping provider or calculation method without checking how travel tiers rely on the returned distance.

The existence of duplicate capitalization in `API/` and `api/` may cause different behavior on Windows and Linux. Vercel uses case-sensitive deployment paths.

---

## 11. Calendar Architecture

Calendar functionality has included downloadable calendar events based on real event data.

A calendar event should use:

- Actual event name
- Actual date
- Start time
- End time
- Venue
- Full address
- Assigned position
- Worker-facing notes
- Directions information when appropriate

Calendar generation must not use hardcoded example dates.

Check for:

- `.ics` generation utilities
- Time-zone handling
- Events crossing midnight
- Missing end-time fallback
- URL encoding
- Mobile download behavior

Wisconsin event times should be handled consistently. Do not assume UTC values are already converted correctly.

---

## 12. Authentication and Authorization

### Administrators

Administrators use authenticated access to the management application.

Historically, administrator authentication was planned around email and password, with stronger security such as 2FA as a requirement.

The current implementation should be confirmed.

### Workers

Workers were designed for passwordless or simplified access.

The current implementation may use Supabase Auth and worker-profile linkage.

Claude Code must inspect:

- Auth provider configuration
- Session handling
- Worker-to-auth-user mapping
- Role determination
- Redirect behavior
- Password-reset or magic-link behavior
- Invite and onboarding flow

Do not use the early prototype’s manual “switch role” control as a production authorization method.

### Row Level Security

RLS is a critical security boundary.

The intended access rules include:

- Workers can see only their own assignments.
- Workers can see eligible open shifts.
- Workers cannot see private client information.
- Workers cannot see unrelated company data.
- Administrators can manage data for their company.
- Future SaaS tenants must not see one another’s data.

Never disable RLS globally as a shortcut.

Any RLS change must be:

1. Documented
2. Added through a migration
3. Tested as an administrator
4. Tested as a worker
5. Tested for cross-user data leakage

---

## 13. Notification Architecture

GigStaffPro has used a production notification system built around Supabase Edge Functions, database webhooks, GitHub Actions, and Resend.

A previously documented implementation had three Edge Functions.

### 13.1 Worker Notification Function

Historical function name:

```text
send-worker-notification
```

It handled worker-facing email types such as:

- Application approved
- Application rejected
- Payment received
- 48-hour event reminder
- 24-hour event reminder
- 4-hour event reminder

It was triggered partly through assignment updates and protected with a webhook secret.

### 13.2 Admin Notification Function

Historical function name:

```text
send-admin-notification
```

It handled admin-facing types such as:

- New worker application
- Worker cancellation

It was triggered through assignment inserts or deletes.

### 13.3 Scheduled Reminder Function

Historical function name:

```text
send-event-reminders
```

It was called by GitHub Actions.

Its job was to:

- Retrieve approved assignments
- Read associated events and workers
- Calculate time until each event
- Send reminders at the correct windows
- Track or report sends

### 13.4 Notification Count

The prior system documentation referred to eight notification types.

Claude Code should verify the current function code and templates because later features may have added, renamed, or retired notification types.

### 13.5 Notification Security

Webhook and scheduled-function security have included:

- Shared webhook secrets
- Authorization headers
- GitHub repository secrets
- Supabase environment secrets

Do not copy secret values into:

- Markdown documentation
- Frontend code
- Git commits
- Pull requests
- Chat prompts
- Console output

### 13.6 Notification Preferences

Worker-controlled email, SMS, and push preferences were part of the product requirements.

The historical email system was working before full preference controls and SMS were necessarily complete.

Verify current behavior before assuming:

- SMS is implemented
- Twilio is configured
- Push notifications are active
- All preference toggles are enforced

---

## 14. Email Architecture

Resend is the known transactional email provider.

Known characteristics include:

- Branded HTML templates
- Verified sending domain
- Worker and administrator notifications
- Delivery-status visibility in Resend
- Email triggered by Edge Functions

There may also be Vercel `send-email.js` routes left from an earlier implementation.

Determine which email pathway is currently active:

```text
Frontend → Vercel API → Resend
```

or:

```text
Database or scheduler → Supabase Edge Function → Resend
```

or both.

Do not maintain duplicate email paths for the same event unless there is a documented reason.

Check for duplicate-send risks when:

- An assignment is approved
- A worker cancels
- Payment status changes
- A scheduled reminder window is reached
- An administrator manually resends a notification

---

## 15. Environment Variables and Secrets

Expected integrations may require variables for:

- Supabase URL
- Supabase anonymous key
- Supabase service-role key
- Resend API key
- Webhook secret
- Mapping or distance API key
- Application URL
- Other deployment settings

Frontend-safe variables may use the Vite prefix:

```text
VITE_
```

Server-only secrets must never use a frontend-exposed variable.

The Supabase service-role key must never appear in browser code.

Claude Code must inspect:

```text
.env
.env.local
vercel.json
Supabase Edge Function secrets
GitHub repository secrets
Vercel environment settings
```

Do not print secret values while documenting the architecture.

A known technical improvement was to move remaining hardcoded keys into environment variables.

---

## 16. Deployment Flow

The expected deployment path is:

```text
Local repository
   ↓
Git commit
   ↓
GitHub
   ↓
Vercel deployment
```

Supabase schema changes and Edge Functions are deployed separately from the Vercel frontend.

A complete feature may therefore require multiple coordinated changes:

1. Frontend code
2. Vercel API route
3. Supabase table or column
4. RLS policy
5. Database webhook
6. Edge Function
7. Environment variable
8. GitHub Actions workflow

Do not assume a frontend deployment updates Supabase functions automatically.

---

## 17. Current Functional Areas

The application has included working or partially working functionality in the following areas:

### Administrator

- Dashboard
- Event creation and editing
- Multiple event positions
- Staff management
- Worker search and filtering
- Applications
- Assignment approval and rejection
- Standby queue management
- Pay calculations
- Payment tracking
- Locations
- Pay-rate settings
- Travel tiers
- Worker reliability data
- Event schedule
- History
- Notification workflows

### Worker

- Authentication
- Open shifts
- My shifts
- Applications
- Standby visibility
- Profile
- Event details
- Directions
- Calendar downloads
- Cancellation workflow
- Pay visibility
- Notification receipt

Not every originally planned requirement is necessarily complete. Handoff 03 identifies the current direction and missing features.

---

## 18. Known Technical Debt and Risks

### 18.1 Duplicate API Routes

Both uppercase and lowercase API folders have existed:

```text
API/
api/
```

This creates deployment and maintenance risk.

Determine which files are referenced before consolidating.

### 18.2 Duplicate Email Logic

Email sending may exist in both:

- Vercel API routes
- Supabase Edge Functions

Identify the active path for each notification type.

### 18.3 Hardcoded Credentials

Earlier implementations may have included keys or URLs directly in source files.

Search the repository for:

```text
supabase.co
eyJ
resend
Authorization
service_role
webhook
apiKey
secret
```

Do not expose any values found.

Move secrets to the correct environment-secret system before deleting or rotating anything.

### 18.4 Database Schema Drift

The schema evolved over many sessions.

Code comments, old SQL scripts, and documentation may describe outdated columns.

Inspect the live schema before writing migrations.

### 18.5 Large Components

Although the main refactor significantly reduced `App.jsx`, some views may still be large.

Refactor only when there is a functional reason or a safe, testable boundary.

Do not combine a major refactor with a major feature in the same commit.

### 18.6 Multiple Calculation Paths

Staffing counts, standby counts, pay totals, and travel pay may be calculated in more than one place.

Search globally before changing logic.

### 18.7 Historical Compatibility

Some older records may have:

- Missing assignment statuses
- Different position labels
- Missing location IDs
- Pre-location pay data
- Manually stored totals
- Null worker home locations

New logic should handle historical records safely.

### 18.8 Time and Date Handling

Events can cross midnight.

Reminder calculations, calendar files, cancellation windows, and payment durations must handle:

- Local time
- UTC storage
- Overnight events
- Daylight-saving changes
- Missing end times

---

## 19. Architecture Rules That Should Not Be Reversed

Claude Code should preserve these decisions unless Dylan explicitly changes them:

1. **Supabase is the live data source of truth.**
2. **The app should remain modular.**
3. **Do not rebuild the application inside one large `App.jsx`.**
4. **Locations replace Markets.**
5. **Event location determines position pay rates.**
6. **Worker home location is used for travel-pay calculations.**
7. **Standby is FIFO.**
8. **Standby workers do not count as filled assignments.**
9. **Promoted standby workers auto-confirm.**
10. **Workers see their queue number but not the names of other standby workers.**
11. **Position matching should use shared helper functions.**
12. **RLS must remain enabled and intentional.**
13. **Server secrets must never be exposed to the frontend.**
14. **Completed or paid historical assignments must not be silently recalculated.**
15. **Production behavior is more important than aggressive code cleanup.**

---

## 20. Required Architecture Audit Before New Development

Before implementing the next major feature, Claude Code should produce a read-only audit covering:

### Repository

- Current branch
- Working tree status
- Current folder structure
- Main views and hooks
- Current API routes
- Duplicate files
- Build scripts
- Test or lint commands
- Environment-variable names
- GitHub Actions workflows

### Supabase

- Current tables
- Current columns
- Foreign keys
- Indexes
- RLS policies
- Database triggers
- Database webhooks
- Edge Functions
- Function secrets by variable name only
- Authentication configuration

### Vercel

- Active production domain
- Build command
- Output directory
- Environment-variable names
- Deployed API routes
- Git branch connected to production

### Integrations

- Resend email path
- Mapping or distance provider
- Calendar generation
- GitHub Actions reminders
- Any SMS provider
- Any push-notification provider

### Functional verification

Test without changing production data where possible:

- Administrator login
- Worker login
- Event list
- Worker list
- Open shifts
- Application submission
- Assignment counts
- Standby counts
- Pay calculation display
- Calendar download
- Directions link
- Notification logs

---

## 21. Recommended Output From the Audit

Claude Code should return:

```text
1. Confirmed architecture
2. Current repository map
3. Current Supabase schema summary
4. Active API and Edge Function map
5. Active notification flow
6. Environment-variable inventory by name only
7. Duplicate or obsolete code candidates
8. Security risks
9. Broken or incomplete workflows
10. Recommended build order
```

No code should be changed during the first architecture audit unless a severe security issue requires immediate containment.

---

## 22. Final Guidance

This handoff is a map, not a substitute for inspecting the code.

When documentation and code disagree:

1. Check the current production branch.
2. Check the live Supabase schema.
3. Check active Vercel deployment settings.
4. Check Edge Function and webhook configuration.
5. Explain the discrepancy.
6. Ask Dylan before changing established product behavior.

GigStaffPro was developed iteratively across many sessions. Some old files and comments may be obsolete while still appearing authoritative.

Do not guess.

Trace the complete workflow from user action through frontend, database, server function, notification, and final stored state before changing it.
