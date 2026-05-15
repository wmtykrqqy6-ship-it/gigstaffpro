// api/send-shift-reminders.js
// Runs every hour via GitHub Actions cron.
// Finds upcoming confirmed shifts and sends pre-shift reminders at
// 96h, 48h, 24h, and 4h before the shift start time.
// Deduplication is enforced via the shift_reminders_sent table.
// Built to support SMS in the future — add a sendSms() helper and
// call it alongside sendEmail() using the same prefs structure.

const SUPABASE_URL = 'https://ycsauzvkrbcynifkawuw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2F1enZrcmJjeW5pZmthd3V3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3MDQ4NTcsImV4cCI6MjA4NDI4MDg1N30.07H2LXdn2XKfpcrSmrp7_G0KXIJMH27fmJpCok10lrc';
const RESEND_KEY   = process.env.RESEND_API_KEY;

const REMINDER_TIERS = [96, 48, 24, 4]; // hours before shift

// ── Helpers ───────────────────────────────────────────────────────────

const sbHeaders = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
});

const fmtTime = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

const fmtDate = (d) => {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
};

const positionLabel = (key) =>
  (key || 'your position').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// Build shift start as a JS Date from event date + time strings
// Events are stored in local time (CST = UTC-6 / CDT = UTC-5)
// We use UTC constructor and add the offset so comparisons work correctly
const shiftStart = (date, time) => {
  if (!date || !time) return null;
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  // Determine CDT vs CST: CDT (UTC-5) runs Mar-Nov, CST (UTC-6) runs Nov-Mar
  const month = mo; // 1-indexed
  const isDST = month >= 3 && month <= 11; // approximate DST window
  const offsetHours = isDST ? 5 : 6; // CDT = UTC-5, CST = UTC-6
  // Build as UTC by adding the offset
  return new Date(Date.UTC(y, mo - 1, d, h + offsetHours, mi, 0, 0));
};

// ── Email sender ──────────────────────────────────────────────────────

async function sendEmail({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_KEY}`,
    },
    body: JSON.stringify({
      from: 'Vegas on Wheels <noreply@gigstaffpro.com>',
      to: [to],
      subject,
      html,
    }),
  });
  return res.ok;
}

// ── SMS sender (stub — wire up Twilio/etc here when ready) ────────────
// async function sendSms({ to, body }) {
//   // e.g. Twilio: POST to /Messages with from, to, body
//   return false;
// }

// ── Email HTML builder ────────────────────────────────────────────────

function buildReminderEmail({ worker, event, assignment, hoursUntil }) {
  const timeStr = event.time
    ? (event.end_time
        ? `${fmtTime(event.time)} – ${fmtTime(event.end_time)}`
        : fmtTime(event.time))
    : '';

  const urgencyLabel =
    hoursUntil >= 72 ? '4 days away' :
    hoursUntil >= 36 ? '2 days away' :
    hoursUntil >= 12 ? 'tomorrow'    : 'today';

  const rows = [
    ['📅', 'Date',      fmtDate(event.date)],
    timeStr          ? ['🕐', 'Time',      timeStr]            : null,
    ['🎴', 'Position', positionLabel(assignment.position)],
    event.venue      ? ['📍', 'Venue',     event.venue]        : null,
    event.address    ? ['🗺', 'Address',   event.address]      : null,
    event.dress_code ? ['👔', 'Dress Code',event.dress_code]   : null,
    event.parking    ? ['🅿', 'Parking',   event.parking]      : null,
    event.notes      ? ['📝', 'Notes',     event.notes]        : null,
    ['🆔', 'Event ID', String(event.id).slice(0, 8).toUpperCase()],
  ].filter(Boolean)
   .map(([icon, label, val]) =>
     `<tr>
       <td style="padding:5px 12px 5px 0;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top">${icon} ${label}</td>
       <td style="padding:5px 0;color:#111;font-size:13px">${val}</td>
     </tr>`
   ).join('');

  const portalUrl = 'https://gigstaffpro.vercel.app';

  return {
    subject: `⏰ Reminder: ${event.name} is ${urgencyLabel}`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif">
<div style="max-width:520px;margin:24px auto">

  <!-- Header -->
  <div style="background:#7c0a02;padding:24px 20px;border-radius:8px 8px 0 0;text-align:center">
    <div style="font-size:22px;font-weight:bold;color:#fff">🎰 Vegas on Wheels</div>
    <div style="font-size:13px;color:#fca5a5;margin-top:4px">Shift Reminder — ${hoursUntil} hours until your shift</div>
  </div>

  <!-- Body -->
  <div style="background:#fff;padding:24px 20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <p style="margin:0 0 6px;font-size:15px;color:#111">Hi ${worker.name},</p>
    <p style="margin:0 0 20px;color:#374151;font-size:14px">
      This is your <strong>${hoursUntil}-hour reminder</strong> for your upcoming shift at
      <strong>${event.name}</strong>.
    </p>

    <!-- Details table -->
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin-bottom:20px">
      <table style="border-collapse:collapse;width:100%">${rows}</table>
    </div>

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:20px">
      <a href="${portalUrl}" style="display:inline-block;background:#7c0a02;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px">
        View in Staff Portal →
      </a>
    </div>

    <hr style="border:none;border-top:1px solid #f3f4f6;margin:0 0 12px">
    <p style="color:#9ca3af;font-size:11px;text-align:center;margin:0">
      You're receiving this because you're scheduled for this event.<br>
      To update your reminder preferences, visit your
      <a href="${portalUrl}" style="color:#7c0a02">staff portal profile</a>.
    </p>
  </div>
</div>
</body></html>`,
  };
}

// ── Main handler ──────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!SUPABASE_KEY) return res.status(500).json({ error: 'Supabase not configured' });
  if (!RESEND_KEY)   return res.status(500).json({ error: 'Email service not configured' });

  const now = new Date();
  const results = { checked: 0, sent: 0, skipped: 0, errors: [] };

  try {
    // 1. Fetch all confirmed assignments with event + worker data
    const asgRes = await fetch(
      `${SUPABASE_URL}/rest/v1/assignments?select=id,worker_id,event_id,position,status&status=in.(approved,assigned)`,
      { headers: sbHeaders() }
    );
    const assignments = await asgRes.json();
    if (!assignments?.length) {
      return res.status(200).json({ ...results, message: 'No confirmed assignments' });
    }

    // 2. Batch-fetch events and workers (unique ids only)
    const eventIds  = [...new Set(assignments.map(a => a.event_id))];
    const workerIds = [...new Set(assignments.map(a => a.worker_id))];

    const [evRes, wrRes, prefsRes, sentRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/events?id=in.(${eventIds.join(',')})&select=id,name,date,time,end_time,venue,address,dress_code,parking,notes&status=neq.cancelled`, { headers: sbHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/workers?id=in.(${workerIds.join(',')})&select=id,name,email`, { headers: sbHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/worker_reminder_prefs?worker_id=in.(${workerIds.join(',')})&select=*`, { headers: sbHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/shift_reminders_sent?assignment_id=in.(${assignments.map(a=>a.id).join(',')})&select=assignment_id,hours_before,channel`, { headers: sbHeaders() }),
    ]);

    const [events, workers, prefs, alreadySent] = await Promise.all([
      evRes.json(), wrRes.json(), prefsRes.json(), sentRes.json(),
    ]);

    // Build lookup maps
    const eventMap  = Object.fromEntries((events  || []).map(e => [e.id, e]));
    const workerMap = Object.fromEntries((workers || []).map(w => [w.id, w]));
    const prefsMap  = Object.fromEntries((prefs   || []).map(p => [p.worker_id, p]));

    // Build sent set: "assignmentId:hoursBeforeChannel"
    const sentSet = new Set(
      (alreadySent || []).map(s => `${s.assignment_id}:${s.hours_before}:${s.channel}`)
    );

    // 3. For each assignment × tier, decide whether to send
    for (const asg of assignments) {
      const event  = eventMap[asg.event_id];
      const worker = workerMap[asg.worker_id];
      if (!event || !worker?.email) continue;

      const start = shiftStart(event.date, event.time);
      if (!start || start <= now) continue; // past shifts — skip

      const hoursUntilShift = (start - now) / (1000 * 60 * 60);

      // Debug: log timing info
      if (!results.debug) results.debug = [];
      results.debug.push({
        event: event.name,
        date: event.date,
        time: event.time,
        serverNow: now.toISOString(),
        shiftStart: start.toISOString(),
        hoursUntil: Math.round(hoursUntilShift * 100) / 100,
      });

      for (const tier of REMINDER_TIERS) {
        results.checked++;

        // Is now within the ±60min sending window for this tier?
        // Window is intentionally wide to handle timezone differences and cron timing variance
        const inWindow = hoursUntilShift >= (tier - 1) && hoursUntilShift <= (tier + 1);
        if (!inWindow) { results.skipped++; continue; }

        // Check worker prefs (default all ON if no row exists)
        const workerPrefs = prefsMap[asg.worker_id];
        const prefKey = `email_${tier}h`;
        const wantsEmail = workerPrefs ? workerPrefs[prefKey] !== false : true;
        if (!wantsEmail) { results.skipped++; continue; }

        // Deduplication check
        const sentKey = `${asg.id}:${tier}:email`;
        if (sentSet.has(sentKey)) { results.skipped++; continue; }

        // Build and send email
        const { subject, html } = buildReminderEmail({
          worker, event, assignment: asg, hoursUntil: tier,
        });

        try {
          const ok = await sendEmail({ to: worker.email, subject, html });
          if (ok) {
            // Log to shift_reminders_sent
            await fetch(`${SUPABASE_URL}/rest/v1/shift_reminders_sent`, {
              method: 'POST',
              headers: { ...sbHeaders(), Prefer: 'return=minimal' },
              body: JSON.stringify({
                assignment_id: asg.id,
                worker_id:     asg.worker_id,
                event_id:      asg.event_id,
                hours_before:  tier,
                channel:       'email',
              }),
            });
            sentSet.add(sentKey); // prevent double-send in same run
            results.sent++;
          } else {
            results.errors.push({ assignmentId: asg.id, tier, error: 'Email send failed' });
          }
        } catch (err) {
          results.errors.push({ assignmentId: asg.id, tier, error: err.message });
        }
      }
    }

    return res.status(200).json(results);
  } catch (err) {
    return res.status(500).json({ error: err.message, ...results });
  }
}
