// api/calendar-event.js
// Serves an .ics file for any calendar app (Apple, Google, Outlook, etc.)
// Usage: /api/calendar-event?name=...&date=YYYY-MM-DD&start=HH:MM&end=HH:MM&location=...&description=...

export default function handler(req, res) {
  const { name, date, start, end, location, description } = req.query;

  if (!name || !date) {
    return res.status(400).send('Missing required fields');
  }

  // Build datetime strings in iCal format (local time, no timezone suffix = floating)
  const [y, m, d] = date.split('-');
  const pad = (n) => String(n || 0).padStart(2, '0');

  let dtStart, dtEnd;
  if (start) {
    const [sh, sm] = start.split(':').map(Number);
    dtStart = `${y}${pad(m)}${pad(d)}T${pad(sh)}${pad(sm)}00`;
    if (end) {
      const [eh, em] = end.split(':').map(Number);
      dtEnd = `${y}${pad(m)}${pad(d)}T${pad(eh)}${pad(em)}00`;
    } else {
      // Default: 3 hour event
      const eh = (parseInt(sh) + 3) % 24;
      dtEnd = `${y}${pad(m)}${pad(d)}T${pad(eh)}${pad(sm)}00`;
    }
  } else {
    // All-day event
    dtStart = `${y}${pad(m)}${pad(d)}`;
    dtEnd = `${y}${pad(m)}${pad(d)}`;
  }

  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@vegasonwheels.com`;
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  // Escape special chars for iCal
  const esc = (str) => (str || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Vegas on Wheels//Staff Portal//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    start ? `DTSTART:${dtStart}` : `DTSTART;VALUE=DATE:${dtStart}`,
    start ? `DTEND:${dtEnd}` : `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:${esc(name)}`,
    location ? `LOCATION:${esc(location)}` : '',
    description ? `DESCRIPTION:${esc(description)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="event.ics"`);
  res.setHeader('Cache-Control', 'no-cache');
  res.send(ics);
}
