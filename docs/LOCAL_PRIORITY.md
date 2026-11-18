# Local crew first (warehouse priority window)

Agreed with Dylan on 2026-11-18. Goal: the crew at the warehouse nearest a
party gets first pick of it, so (for example) two rank 1 locals can be sure
to get on an event before workers from other markets fill it.

## Rules

- **Home warehouse.** An event's market (`events.location_id`, "Market /
  Region" on the event form) is its home warehouse. When creating an event
  with more than one market set up, the form picks the market nearest the
  event address (Google distance from each market's address) until the admin
  chooses one by hand.
- **Window.** New events get `events.local_priority_until` = 48 hours after
  posting, capped at midnight at the start of the day before the event (so
  other markets always get at least a day). No window when that leaves no
  time, when "Local crew first" is unticked, for invite-only events, or when
  the event has no market.
- **Who is local.** A worker is local only if their primary market
  (`workers.home_location_id`, "Home Location" on the worker) is the event's
  market. Workers in several markets (`worker_locations`) count as local only
  at their primary one.
- **During the window** non-local workers don't see the event in Available
  Events, and `api/worker-actions.js` (`apply`) refuses their sign-up or
  standby with a 403. Local workers see a "Local first pick · 31h left" badge.
- **After the window** (or once the admin presses **Open to everyone now** on
  the edit form) the event behaves as before: rank access days, skills,
  conflicts and so on.
- **Admins** can invite or assign anyone at any time. Invites go through
  `api/invite-respond.js` and direct assigns are admin writes, so neither
  checks the window.
- Existing events (created before this) have `local_priority_until` NULL and
  are not affected.

## Emails (`api/send-availability-notifications.js`)

- While the window is active, "new shift available" emails go only to local
  workers, with a "You get first pick" line.
- For 24 hours after the window ends, the hourly cron emails everyone else
  whose rank window is already open (deduped by
  `event_availability_notifications`, as before). Opening early is picked up
  by the next hourly run. (The edit form also calls the endpoint right away,
  like event creation does, but that browser call has no `x-cron-secret`, so
  it is refused while `CRON_SECRET` is set; see the audit.)

## Code

| What | Where |
| --- | --- |
| Migration | `supabase/migrations/20261118120000_add_event_local_priority.sql` |
| Browser helpers (tested) | `src/utils/localPriority.js` |
| Server helpers (tested) | `api/_lib/localPriority.js` |
| Event form: auto-pick market, checkbox, Open to everyone now | `src/components/modals/EventFormModal.jsx` |
| Worker list filter + badge | `src/components/AvailableEventsSection.jsx` |

## Possible follow-ups (not built)

- **Standby for non-local workers during the window** (join a waiting list
  that is offered spots when the window ends).
- **Limit far-away workers from taking too many parties** (Dylan: "if I see
  it's a problem I need to figure out a way to limit them from working
  further parties"), e.g. a cap per worker per week on events outside their
  primary market.
- Window length is fixed at 48 hours (`LOCAL_PRIORITY_HOURS`); it could
  become a setting.
