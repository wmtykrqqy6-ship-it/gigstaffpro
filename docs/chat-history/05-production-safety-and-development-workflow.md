# GigStaffPro Handoff 05: Production Safety and Development Workflow

**Purpose:** Define how Claude Code should safely work on GigStaffPro now that the application has live data, active workflows, and production users.

**Status:** Required operating guide

**Priority:** Preserving working production behavior is more important than aggressive cleanup, large refactors, or fast feature delivery.

---

## 1. Core Working Principle

GigStaffPro is no longer an isolated prototype.

It includes:

- Live application data
- Supabase authentication
- Row Level Security
- Production database tables
- Worker and administrator workflows
- Email notifications
- Scheduled reminders
- Pay and travel calculations
- Active deployment through Vercel
- Real users and operational business data

Claude Code must treat every change as a production-system change.

Do not assume that a small frontend edit is isolated. A feature may depend on:

- React components
- Custom hooks
- Supabase tables
- RLS policies
- Database triggers
- Edge Functions
- Vercel API routes
- GitHub Actions
- Email templates
- Environment variables
- Historical records

Before changing a workflow, trace it from the user action through the full system.

---

## 2. Required Branch Rules

The designated development branch is:

```text
development/claude-code
```

Claude Code must:

- Confirm the current branch before making changes.
- Work only on `development/claude-code` unless Dylan explicitly approves another branch.
- Never commit directly to `main`.
- Never push directly to `main`.
- Never merge into `main` without Dylan’s explicit approval.
- Never rewrite published Git history.
- Never force-push unless Dylan explicitly requests it and understands the risk.

If the current branch is not `development/claude-code`, stop and explain the issue before editing files.

---

## 3. Required Startup Checklist

At the beginning of a new work session, Claude Code should inspect:

```text
CLAUDE.md
docs/chat-history/01-foundational-build-handoff.md
docs/chat-history/02-architecture-and-system-evolution-handoff.md
docs/chat-history/03-current-direction-and-missing-features-handoff.md
docs/chat-history/04-current-technical-architecture.md
docs/chat-history/05-production-safety-and-development-workflow.md
```

Then confirm:

1. Current Git branch
2. Current working-tree status
3. Recent commits
4. Repository structure
5. Package scripts
6. Whether the local branch is behind or ahead of the remote
7. Whether uncommitted user work already exists
8. Whether generated files or secrets are present

Do not overwrite or discard uncommitted work.

If unrelated changes already exist, explain them before making new edits.

---

## 4. Read Before Writing

Before changing a feature, Claude Code must inspect all files that participate in the workflow.

For example, changing worker approval may require reviewing:

- Applications view
- Assignment data hook
- Supabase query logic
- Assignment status helpers
- Database schema
- RLS policies
- Database webhook
- Worker notification Edge Function
- Email template
- Worker portal display
- Pay calculation
- Standby promotion behavior

Do not edit the first matching file and assume the feature is complete.

Search the repository globally for:

- Function names
- Component names
- Table names
- Column names
- Status values
- Event types
- Notification types
- API route names
- Environment-variable names

---

## 5. No Guessing About the Database

The live Supabase schema is the final source of truth for database structure.

Do not rely only on:

- Old SQL snippets
- Chat-history examples
- Comments
- README files
- Frontend assumptions
- Prototype data models

Before changing database-dependent code, verify:

- Current table names
- Current column names
- Data types
- Nullability
- Default values
- Foreign keys
- Unique constraints
- Indexes
- RLS policies
- Triggers
- Webhooks
- Existing historical data patterns

If Claude Code cannot inspect the live schema, it should clearly state the limitation and avoid speculative migrations.

---

## 6. Database Migration Rules

Any schema change must be deliberate and reversible.

A database change should include:

1. A migration file
2. A plain-language explanation
3. Expected effect on existing rows
4. Backfill requirements
5. Rollback considerations
6. RLS impact
7. Trigger and webhook impact
8. Frontend compatibility
9. Historical-record compatibility
10. Verification steps

Do not:

- Rename a production column without checking all references.
- Drop a table or column because it appears unused.
- Change a data type without checking existing values.
- Reset production data.
- Disable RLS as a shortcut.
- Apply destructive SQL without Dylan’s explicit approval.
- Paste secret values into migration files.

When possible, prefer additive changes before destructive cleanup.

---

## 7. Row Level Security Rules

RLS is a critical security boundary.

Claude Code must never disable RLS globally to make a query work.

Any RLS change must be tested for:

- Administrator access
- Worker access
- Anonymous access
- Cross-user access
- Future multi-company isolation
- Private client data exposure
- Worker contact data exposure
- Assignment ownership
- Open-shift eligibility

A worker must not gain access to:

- Other workers’ private profiles
- Other companies’ data
- Hidden client information
- Administrator-only notes
- Unauthorized pay data
- Unrelated assignments

If a frontend query fails because of RLS, fix the policy or query intentionally. Do not bypass security with a service-role key in browser code.

---

## 8. Secret and Credential Safety

All secret values were intentionally removed from the handoff documents.

Claude Code must preserve that safety.

Never expose:

- Supabase service-role key
- Resend API key
- Webhook secret
- GitHub Actions secrets
- Vercel secrets
- Mapping API keys
- Authentication tokens
- Database passwords
- Private environment files

Never place server-only secrets in a variable beginning with:

```text
VITE_
```

Vite-prefixed variables are exposed to the browser.

The Supabase anonymous key may be frontend-safe when used as intended, but the service-role key is never frontend-safe.

When documenting environment variables, list names only:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
RESEND_API_KEY
SUPABASE_SERVICE_ROLE_KEY
WEBHOOK_SECRET
```

Do not print their values.

If a secret is found in tracked history or source code:

1. Do not repeat it in chat.
2. Identify the file and risk.
3. Recommend rotation.
4. Remove it from active source.
5. Confirm whether Git history cleanup is required.
6. Ask before destructive history rewriting.

---

## 9. Production Data Safety

Do not use production data as disposable test data.

Claude Code must not:

- Delete real workers
- Delete real events
- Approve real applications for testing
- Cancel real assignments
- Mark real payments as paid
- Trigger real notification blasts
- Change real worker rank or reliability
- Alter historical pay totals
- Create fake production users without approval

Use one of these approaches:

- Read-only verification
- Local mock data
- A dedicated test account
- A dedicated test event
- Supabase staging project
- Transaction rollback
- Clearly labeled temporary test records approved by Dylan

Any production write test must be explicitly approved.

---

## 10. Notification Safety

Notifications can affect real workers and administrators.

Before changing or testing notifications, determine:

- What event triggers the notification
- Which system sends it
- Who receives it
- Whether duplicate triggers exist
- Whether the function is production-active
- Whether the message includes private information
- Whether retries can cause duplicates
- Whether scheduling windows use the correct timezone
- Whether test messages will reach real recipients

Do not test by triggering a live workflow unless Dylan approves the recipients.

Prefer:

- Template rendering without sending
- Logging to a safe test recipient
- Dedicated test worker
- Dry-run mode
- Disabled-send environment
- Preview output

Notification changes should verify:

- Subject
- Recipient
- Sender
- Event details
- Position
- Pay
- Date and time
- Location
- Dress code
- Directions
- Calendar links
- Cancellation rules
- Unsubscribe or preference behavior where applicable

---

## 11. Pay and Travel Calculation Safety

Pay calculations directly affect workers and business operations.

Before changing pay logic, identify all calculation inputs:

```text
position rate
location override
travel tier
distance
holiday multiplier
Lake Geneva adjustment
event-specific override
bonus
manual adjustment
historical stored total
```

Claude Code must:

- Find every existing calculation path.
- Identify the authoritative source.
- Test multiple locations.
- Test multiple worker home locations.
- Test flat-fee positions.
- Test hourly positions.
- Test overnight events.
- Test missing distance data.
- Test manual overrides.
- Preserve completed and paid historical amounts.

Do not silently recalculate old assignments.

If calculation logic changes, explain whether it applies to:

- New assignments only
- Future unpaid assignments
- All unpaid assignments
- Historical assignments
- Paid assignments

Paid assignments should remain unchanged unless Dylan explicitly approves a correction process.

---

## 12. Standby Safety

Standby behavior must preserve the established rules:

- FIFO queue
- Queue number visible to the worker
- Other standby worker names hidden
- Standby workers excluded from filled-position counts
- Auto-promotion when an opening occurs
- Promoted worker auto-confirmed
- Promoted worker notified

Before changing assignment statuses, test:

- Normal approved assignment
- Pending application
- Standby assignment
- Cancellation
- Promotion
- Full position
- Reopened position
- Multiple standby workers
- Simultaneous updates

Do not use a broad status rewrite that could reorder the queue or promote the wrong worker.

---

## 13. Authentication Safety

Authentication changes can lock users out or expose private data.

Before changing auth logic, inspect:

- Supabase Auth configuration
- Session handling
- Role determination
- Worker profile linkage
- Admin profile linkage
- Login redirect
- Logout
- Magic link behavior
- Password reset behavior
- Invite flow
- Expired session behavior
- Mobile browser behavior

Do not replace working authentication with a prototype role switch.

Do not make a user an administrator based only on a frontend variable.

Authorization must be enforced by secure backend rules and RLS, not only by hiding interface elements.

---

## 14. Refactoring Rules

Refactoring is allowed, but only when it reduces risk rather than increasing it.

Claude Code should:

- Refactor one logical area at a time.
- Preserve behavior.
- Keep commits small.
- Run the build after each meaningful change.
- Separate refactors from feature work.
- Avoid renaming many files without a clear benefit.
- Preserve existing public component interfaces when possible.
- Add tests or verification steps around risky logic.

Do not:

- Rewrite the entire app.
- Replace working libraries casually.
- Convert the whole project to TypeScript during unrelated work.
- Change framework or state-management architecture without approval.
- Rebuild modular views inside `App.jsx`.
- Perform cosmetic cleanup across dozens of files during a bug fix.
- Delete “unused” code without checking runtime and deployment references.

A smaller diff is usually safer.

---

## 15. Duplicate and Obsolete Code Rules

The repository may contain duplicate or historical files.

Examples may include:

```text
API/
api/
send-email.js
old notification code
prototype components
unused helpers
deprecated SQL scripts
```

Before deleting anything:

1. Search all imports and references.
2. Check Vercel route behavior.
3. Check GitHub Actions.
4. Check Supabase webhooks.
5. Check Edge Functions.
6. Check deployment configuration.
7. Check case sensitivity.
8. Confirm production logs if available.
9. Explain why the file is obsolete.
10. Delete it in a separate cleanup commit.

Do not combine uncertain deletion with a feature release.

---

## 16. Build and Verification Rules

Before presenting work as complete, run the available project checks.

Inspect `package.json` for the real commands.

Likely checks may include:

```bash
npm install
npm run dev
npm run build
npm run lint
npm test
```

Use only commands that actually exist.

At minimum, verify:

- Dependencies install
- Production build succeeds
- No unresolved imports
- No syntax errors
- No obvious browser console errors
- Main admin view loads
- Main worker view loads
- Changed workflow behaves correctly
- Mobile layout remains usable
- Desktop layout remains usable

If tests do not exist, say so. Do not claim the feature is fully tested.

---

## 17. Mobile and Desktop Requirements

GigStaffPro is used on both desktop and mobile.

Every user-facing change should be checked at:

- Desktop width
- Tablet width
- Mobile width

Important mobile behaviors include:

- Navigation menu
- Worker portal tabs
- Event cards
- Shift claim actions
- Assignment details
- Calendar downloads
- Directions links
- Forms
- Modals
- Tables
- Buttons
- Long event names
- Long venue addresses

Do not approve a desktop-only layout.

Avoid interfaces that require horizontal scrolling for basic worker actions.

---

## 18. Date and Time Safety

GigStaffPro events may cross midnight and are primarily based in Wisconsin.

Date and time logic must account for:

- Local timezone
- UTC storage
- Browser timezone
- Daylight-saving transitions
- Overnight events
- Missing end times
- Reminder windows
- Cancellation deadlines
- Calendar file formatting
- Event sorting
- Historical records

Do not use naive date parsing without checking timezone behavior.

A reminder should not be sent at the wrong local time because a UTC value was treated as local time.

---

## 19. Commit Rules

Commits should be small, readable, and reversible.

Good commit examples:

```text
Fix standby workers counting as filled
Add worker home location to travel calculation
Extract pay calculation helper
Document reminder function environment variables
Fix mobile open-shifts card layout
```

Avoid vague messages such as:

```text
updates
fix stuff
changes
final
misc
```

Each commit should contain one clear purpose whenever possible.

Do not include:

- Secrets
- `.env` files
- `node_modules`
- Build output unless intentionally required
- Temporary screenshots
- Debug logs
- Database exports with private data
- Personal worker information

---

## 20. Pull Request and Review Rules

Before merging to production, Claude Code should prepare a summary containing:

### What changed

- Files changed
- Main logic changed
- Database changes
- API changes
- Edge Function changes
- Environment-variable changes

### Why it changed

- Problem being solved
- User workflow affected
- Product decision being preserved

### Risk assessment

- Authentication risk
- Data risk
- Notification risk
- Pay risk
- RLS risk
- Deployment risk
- Historical compatibility risk

### Verification completed

- Build
- Lint
- Tests
- Manual admin test
- Manual worker test
- Mobile test
- Desktop test
- Database verification
- Notification dry run

### Remaining limitations

- Untested scenarios
- Missing automated tests
- Required manual setup
- Required Supabase deployment
- Required Vercel environment variable
- Required GitHub secret
- Required migration

Do not say “done” if external deployment or configuration steps remain.

---

## 21. Communication Style for Dylan

Dylan is capable of making product decisions but is still learning the technical workflow.

Claude Code should:

- Use plain language.
- Explain one step at a time.
- Avoid unnecessary jargon.
- Define technical terms when needed.
- Clearly separate required steps from optional improvements.
- Explain what a command will do before asking Dylan to run it.
- Avoid dumping long command lists without context.
- State where a command should be run.
- State what result Dylan should expect.
- Stop when a screenshot or confirmation is needed.
- Never assume Dylan knows Git, Supabase, Vercel, or terminal conventions.

When asking Dylan to perform a step, use a structure like:

```text
Step 1: Open GitHub Desktop.

What this does:
Confirms you are working on the safe development branch.

What to click:
Current Branch → development/claude-code

What you should see:
The branch name should appear at the top.
```

Do not move five steps ahead while Dylan is still completing step one.

---

## 22. Decision Authority

Claude Code may make routine implementation decisions that preserve established behavior.

Claude Code must ask Dylan before:

- Changing product rules
- Changing worker eligibility
- Changing rank windows
- Changing cancellation rules
- Changing standby behavior
- Changing pay amounts
- Changing travel tiers
- Changing notification timing
- Changing visible worker information
- Changing client-facing content
- Changing user roles
- Adding payroll processing
- Adding billing or subscriptions
- Removing a major feature
- Changing production branch strategy
- Performing destructive database actions
- Rotating credentials
- Sending live test notifications
- Recalculating historical pay

When requirements are unclear, present the options and recommend one. Do not silently choose a product rule.

---

## 23. Established Product Rules to Preserve

Unless Dylan explicitly changes them, preserve the following:

### Roles

- Admin has full access.
- Manager or lead access is limited to assigned events.
- Worker access is limited to eligible or assigned work.
- Clients do not have a direct portal in the current MVP.

### Scheduling

- Scheduling is position-based.
- Setup and teardown are separate positions.
- Workers must have the required skill.
- Rank controls how early workers can self-schedule.
- Rank is separate from certification.
- Per-event staffing mode remains configurable.
- Workers cannot self-cancel within seven days.

### Rank windows

```text
Level 1: immediately
Level 2: 3 months
Level 3: 2 months
Level 4: 1 month
Level 5: 2 weeks
```

### Standby

- FIFO
- Queue number visible
- Names hidden
- Auto-promotion
- Auto-confirm after promotion

### Pay

- Flat-fee and hourly positions are supported.
- Event location determines position pay rates.
- Worker home location is used for travel pay.
- Holiday multiplier is supported.
- Lake Geneva adjustment is supported.
- Workers are paid outside the system.
- Completed historical pay should remain stable.

### Notifications

Known reminder requirements include:

```text
96 hours
48 hours
24 hours
4 hours
```

Earlier versions also emphasized 48-, 24-, and 4-hour reminders. Claude Code must verify the current implemented schedule and settings before changing it.

### Privacy

- Workers do not see private client details.
- Workers do not see other workers’ contact information.
- Standby names remain private.
- Future SaaS companies must remain isolated.

---

## 24. Stop Conditions

Claude Code should stop and ask for guidance when:

- The current branch is wrong.
- There are unexplained uncommitted changes.
- A requested change would affect production data.
- A schema change is destructive.
- RLS behavior is uncertain.
- A secret appears exposed.
- Two conflicting implementations appear active.
- Pay behavior is unclear.
- Notification recipients cannot be safely isolated.
- A product rule conflicts with the handoffs.
- The live schema cannot be confirmed.
- A deployment requires access Dylan has not granted.
- A feature could lock out administrators or workers.
- Testing would send real emails or SMS messages.
- Historical data may be recalculated.
- The change requires merging to `main`.

Stopping to verify is preferred over guessing.

---

## 25. Recommended Development Sequence

For each new feature or bug fix:

### Phase 1: Understand

1. Read the handoffs.
2. Confirm the branch.
3. Inspect the relevant files.
4. Trace the full workflow.
5. Identify database and integration dependencies.
6. Restate the expected behavior.

### Phase 2: Plan

1. Propose the smallest safe change.
2. Identify files to modify.
3. Identify schema changes.
4. Identify risks.
5. Define verification steps.
6. Get approval for product-rule changes.

### Phase 3: Implement

1. Make one logical change.
2. Preserve existing interfaces.
3. Add migration if needed.
4. Update documentation.
5. Avoid unrelated cleanup.
6. Keep secrets out of source.

### Phase 4: Verify

1. Run build.
2. Run lint or tests.
3. Verify admin behavior.
4. Verify worker behavior.
5. Verify mobile layout.
6. Verify desktop layout.
7. Verify database behavior.
8. Verify notification behavior safely.
9. Check historical compatibility.

### Phase 5: Commit

1. Review diff.
2. Remove debug output.
3. Confirm no secrets.
4. Commit with a clear message.
5. Explain what remains.
6. Do not merge to `main` without approval.

---

## 26. First Task After Transition

After all five handoffs are committed, Claude Code should perform a read-only current-state audit before starting major development.

The audit should confirm:

- Current repository structure
- Current branch
- Current component structure
- Current custom hooks
- Current Supabase tables
- Current RLS policies
- Current Edge Functions
- Current Vercel API routes
- Current notification flow
- Current environment-variable names
- Duplicate or obsolete code candidates
- Security risks
- Broken workflows
- Recommended build order

The audit should not modify production data.

The audit should clearly distinguish:

```text
confirmed from code
confirmed from live configuration
inferred
unknown
outdated documentation
```

---

## 27. Final Instruction to Claude Code

Work carefully.

GigStaffPro has grown through many iterative development sessions. Some old files, comments, and documentation may conflict with the live implementation.

The safe order of authority is:

```text
1. Dylan’s current explicit instruction
2. Confirmed live production behavior
3. Current repository code
4. Current Supabase schema and policies
5. Current deployment configuration
6. These handoff documents
7. Old comments and historical snippets
```

When two sources disagree, do not silently choose one.

Explain the conflict and ask before changing established behavior.

The goal is not to make the code look cleaner at any cost.

The goal is to improve GigStaffPro without breaking the business.
