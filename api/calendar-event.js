// api/calendar-event.js
// Dynamically generates an .ics file by fetching live event data from Supabase.
// Always reflects the current event time — safe to use even if time changes after invite sent.
// Usage: /api/calendar-event?event_id=...&position=Blackjack+Dealer

const SUPABASE_URL = 'https://ycsauzvkrbcynifkawuw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2F1enZrcmJjeW5pZmthd3V3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3MDQ4NTcsImV4cCI6MjA4NDI4MDg1N30.07H2LXdn2XKfpcrSmrp7_G0KXIJMH27fmJpCok10lrc';

export default async function handler(req, res) {
  const { event_id, position } = req.query;

  if (!event_id) {
    return res.status(400).send('Missing event_id');
  }

  // Fetch live event data from Supabase
  let event;
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/events?id=eq.${event_id}&select=name,date,time,end_time,venue,address,dress_code,parking&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const data = await response.json();
    event = data?.[0];
  } catch (err) {
    return res.status(500).send('Failed to fetch event');
  }

  if (!event) {
    return res.status(404).send('Event not found');
  }

  // Build iCal datetime strings (local time, no UTC suffix = floating/local)
  const pad = (n) => String(n || 0).padStart(2, '0');
  const [y, m, d] = (event.date || '').split('-');
  if (!y) return res.status(400).send('Invalid event date');

  let dtStart, dtEnd;
  if (event.time) {
    const [sh, sm] = event.time.split(':').map(Number);
    dtStart = `${y}${pad(m)}${pad(d)}T${pad(sh)}${pad(sm)}00`;
    if (event.end_time) {
      const [eh, em] = event.end_time.split(':').map(Number);
      dtEnd = `${y}${pad(m)}${pad(d)}T${pad(eh)}${pad(em)}00`;
    } else {
      dtEnd = `${y}${pad(m)}${pad(d)}T${pad((parseInt(sh) + 3) % 24)}${pad(sm)}00`;
    }
  } else {
    dtStart = `${y}${pad(m)}${pad(d)}`;
    dtEnd = `${y}${pad(m)}${pad(d)}`;
  }

  const uid = `${event_id}@vegasonwheels.com`;
  const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';

  const esc = (str) => (str || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');

  const description = [
    position ? `Position: ${position}` : null,
    event.dress_code ? `Dress Code: ${event.dress_code}` : null,
    event.parking ? `Parking: ${event.parking}` : null,
  ].filter(Boolean).join('\\n');

  const location = [event.venue, event.address].filter(Boolean).join(' — ');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Vegas on Wheels//Staff Portal//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    event.time ? `DTSTART:${dtStart}` : `DTSTART;VALUE=DATE:${dtStart}`,
    event.time ? `DTEND:${dtEnd}`   : `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:${esc(event.name)}`,
    location   ? `LOCATION:${esc(location)}` : '',
    description ? `DESCRIPTION:${esc(description)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(event.name || 'event')}.ics"`);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(ics);
}
