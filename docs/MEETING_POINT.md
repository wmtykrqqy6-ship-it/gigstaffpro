# Meeting point and check-in

For large venues and resorts, each event can have a meeting-point pin: the exact spot where workers
meet. GPS check-in is measured from it.

## Who can set the pin (2026-10-04)

- **Admins** (you and the office manager, with admin logins): in New / Edit Event → 📍 Meeting Point.
  Tap the satellite map to drop the pin, or drag it to move it. Pasting a Google Maps link that
  contains coordinates also works. Short `maps.app.goo.gl` links don't contain coordinates.
- **The Host** confirmed on the event, from their shift card: **Set meeting point here** uses their
  phone's GPS.
- **The setup crew** (Set Up Driver / Set Up on a truck run that stops at the event), from the stop in
  their Logistics tab, the same way.

Workers can set it from the day before the event through the event day, plus the early hours after a
late party. The server enforces who and when (`api/_lib/meetingPoint.js`, action `setMeetingPoint` in
`api/worker-actions.js`). It has the same client-supplied workerId trust gap as the other worker
actions (see the audit).

Optional migration `20261004120000_add_meeting_point_set_by.sql` records who set it ("Set by William
Finn, Tue 4:12 PM"). Without it the pin still saves. When an admin moves the pin in the form, that
line is cleared.

## What workers see

Every worker on the event sees the 📍 Meeting Point box on their shift card: the note, "Open Meeting
Point in Maps", and who set it. It shows when there's a pin, a note, or both.

## Check-in rules (unchanged)

| Rule | Setting |
|---|---|
| Check In button appears | 1 hour before the start until 8 hours after |
| Counts as on site | Within 0.25 mi of the pin → 📍 GPS verified |
| Farther away | Manual check-in, flagged for admin review, distance saved |
| No pin on the event | Every check-in is manual and flagged |
| GPS off or denied | Manual and flagged |

Code: `CheckInSection` and `handleCheckIn` in `src/components/views/WorkerPortalView.jsx`.
