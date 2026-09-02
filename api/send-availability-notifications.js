// api/send-availability-notifications.js
// Runs every hour via GitHub Actions cron.
// When a new event unlocks for a rank (based on rank_access_days settings),
// emails all eligible workers of that rank in the event's market.
// Deduplication: tracks sent notifications in event_availability_notifications table.

const SUPABASE_URL = 'https://ycsauzvkrbcynifkawuw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2F1enZrcmJjeW5pZmthd3V3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3MDQ4NTcsImV4cCI6MjA4NDI4MDg1N30.07H2LXdn2XKfpcrSmrp7_G0KXIJMH27fmJpCok10lrc';
const RESEND_KEY   = process.env.RESEND_API_KEY;

const PORTAL_URL = 'https://gigstaffpro.vercel.app';

// Default rank access days (fallback if settings not found)
const DEFAULT_RANK_ACCESS = { 1: 120, 2: 60, 3: 30, 4: 15, 5: 7 };

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
  const [y, mo, day] = d.split('-').map(Number);
  return new Date(y, mo - 1, day).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
};

async function sendEmail({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
    body: JSON.stringify({
      from: 'Vegas on Wheels <noreply@gigstaffpro.com>',
      to: [to],
      subject,
      html,
    }),
  });
  return res.ok;
}

function buildAvailabilityEmail({ worker, event, rank, positions }) {
  const timeStr = event.time
    ? (event.end_time ? `${fmtTime(event.time)} – ${fmtTime(event.end_time)}` : fmtTime(event.time))
    : '';

  const positionList = (positions || [])
    .map(p => {
      const label = (p.key || p.name || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return `<li style="margin:2px 0;font-size:13px;color:#374151">${label} (${p.count || 1} needed)</li>`;
    }).join('');

  const rows = [
    ['Date',    fmtDate(event.date)],
    timeStr ? ['Time', timeStr] : null,
    event.venue   ? ['Venue',   event.venue]   : null,
    event.address ? ['Address', event.address] : null,
    event.dress_code ? ['Dress Code', event.dress_code] : null,
  ].filter(Boolean).map(([label, val]) =>
    `<tr>
      <td style="padding:5px 12px 5px 0;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top">${label}</td>
      <td style="padding:5px 0;color:#111;font-size:13px">${val}</td>
    </tr>`
  ).join('');

  return {
    subject: `New shift available: ${event.name} on ${fmtDate(event.date)}`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif">
<div style="max-width:520px;margin:24px auto">

  <div style="background:#7c0a02;padding:24px 20px;border-radius:8px 8px 0 0;text-align:center">
    <div style="font-size:22px;font-weight:bold;color:#fff">Vegas on Wheels</div>
    <div style="font-size:13px;color:#fca5a5;margin-top:4px">New Shift Available — Sign up before it fills up</div>
  </div>

  <div style="background:#fff;padding:24px 20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <p style="margin:0 0 6px;font-size:15px;color:#111">Hi ${worker.name},</p>
    <p style="margin:0 0 20px;color:#374151;font-size:14px">
      A new shift is available for <strong>${event.name}</strong>.
      Sign up in the staff portal before spots fill up.
    </p>

    <!-- Event details -->
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin-bottom:16px">
      <table style="border-collapse:collapse;width:100%">${rows}</table>
    </div>

    <!-- Positions needed -->
    ${positionList ? `
    <div style="margin-bottom:20px">
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151">Positions needed:</p>
      <ul style="margin:0;padding-left:18px">${positionList}</ul>
    </div>` : ''}

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:20px">
      <a href="${PORTAL_URL}" style="display:inline-block;background:#7c0a02;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px">
        Sign Up in Staff Portal
      </a>
    </div>

    <hr style="border:none;border-top:1px solid #f3f4f6;margin:0 0 12px">
    <p style="color:#9ca3af;font-size:11px;text-align:center;margin:0">
      You're receiving this because you're an approved worker in this market.<br>
      Visit your <a href="${PORTAL_URL}" style="color:#7c0a02">staff portal profile</a> to manage notification preferences.
    </p>
  </div>
</div>
</body></html>`,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // Meant to be triggered only by the hourly GitHub Actions cron
  // (.github/workflows/send-availability-notifications.yml), which sends
  // this header. Without it, anyone who finds the URL could invoke it
  // directly — low-impact since sends are deduped via
  // event_availability_notifications, but this closes the gap rather than
  // relying on dedup alone.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers['x-cron-secret'] !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!RESEND_KEY) return res.status(500).json({ error: 'Email service not configured' });

  const results = { checked: 0, sent: 0, skipped: 0, errors: [] };

  try {
    // 1. Load rank access days from settings
    const settingsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/settings?setting_key=eq.rank_access_days&select=setting_value`,
      { headers: sbHeaders() }
    );
    const settingsData = await settingsRes.json();
    let rankAccessDays = DEFAULT_RANK_ACCESS;
    if (settingsData?.[0]?.setting_value) {
      try {
        rankAccessDays = JSON.parse(settingsData[0].setting_value);
      } catch {}
    }

    // 2. Load upcoming confirmed events (not cancelled/archived/completed)
    const eventsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/events?select=id,name,date,time,end_time,venue,address,dress_code,notes,positions,location_id&status=in.(confirmed,needs-staff)`,
      { headers: sbHeaders() }
    );
    const events = await eventsRes.json();
    if (!events?.length) return res.status(200).json({ ...results, message: 'No upcoming events' });

    // 3. Load already-sent notifications for deduplication
    const eventIds = events.map(e => e.id);
    const sentRes = await fetch(
      `${SUPABASE_URL}/rest/v1/event_availability_notifications?event_id=in.(${eventIds.join(',')})&select=event_id,rank,worker_id`,
      { headers: sbHeaders() }
    );
    const sentData = await sentRes.json();
    const sentSet = new Set((sentData || []).map(s => `${s.event_id}:${s.rank}:${s.worker_id}`));

    // 4. Load all workers with their rank, email, and location memberships
    const workersRes = await fetch(
      `${SUPABASE_URL}/rest/v1/workers?select=id,name,email,rank`,
      { headers: sbHeaders() }
    );
    const workers = await workersRes.json();

    // Load worker_locations (market memberships)
    const workerLocsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/worker_locations?select=worker_id,location_id`,
      { headers: sbHeaders() }
    );
    const workerLocs = await workerLocsRes.json();

    // Build: locationId → Set of workerIds
    const locationWorkerMap = {};
    (workerLocs || []).forEach(({ worker_id, location_id }) => {
      if (!locationWorkerMap[location_id]) locationWorkerMap[location_id] = new Set();
      locationWorkerMap[location_id].add(String(worker_id));
    });

    // Build worker lookup
    const workerMap = Object.fromEntries((workers || []).map(w => [String(w.id), w]));

    // 5. For each event × rank, check if it's unlock day
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    // Catchup mode: fired from AddEventModal for a specific newly-created event
    // Notifies all ranks whose windows are already open
    const catchupMode = req.query?.catchup === 'true' || req.body?.catchup === true;
    const catchupEventId = req.query?.event_id || req.body?.event_id;

    // Filter to just the new event if in catchup mode
    const eventsToProcess = catchupMode && catchupEventId
      ? events.filter(e => String(e.id) === String(catchupEventId))
      : events;

    for (const event of eventsToProcess) {
      if (!event.date) continue;

      const [ey, em, ed] = event.date.split('-').map(Number);
      const eventDate = new Date(Date.UTC(ey, em - 1, ed));
      const daysUntil = Math.round((eventDate - todayUTC) / 86400000);

      if (daysUntil < 0) continue; // past events

      // Get workers eligible for this event's market
      const eligibleWorkerIds = event.location_id
        ? locationWorkerMap[event.location_id] || new Set()
        : new Set(Object.keys(workerMap)); // no location = all workers

      for (let rank = 1; rank <= 5; rank++) {
        results.checked++;

        const unlockDays = rankAccessDays[rank] ?? DEFAULT_RANK_ACCESS[rank];

        let shouldNotify;
        if (catchupMode) {
          // Catchup: notify all ranks whose windows are already open (daysUntil <= unlockDays)
          shouldNotify = daysUntil <= unlockDays;
        } else {
          // Normal hourly cron: only notify on the day the window opens (within 24h window)
          shouldNotify = daysUntil <= unlockDays && daysUntil >= (unlockDays - 1);
        }

        if (!shouldNotify) { results.skipped++; continue; }

        // Find all workers of this rank approved for this market
        const rankWorkers = (workers || []).filter(w =>
          (w.rank || 5) === rank &&
          w.email &&
          eligibleWorkerIds.has(String(w.id))
        );

        if (!rankWorkers.length) { results.skipped++; continue; }

        // Send to each eligible worker (skip if already sent)
        for (const worker of rankWorkers) {
          const sentKey = `${event.id}:${rank}:${worker.id}`;
          if (sentSet.has(sentKey)) { results.skipped++; continue; }

          const { subject, html } = buildAvailabilityEmail({
            worker,
            event,
            rank,
            positions: event.positions || [],
          });

          try {
            const ok = await sendEmail({ to: worker.email, subject, html });
            if (ok) {
              sentSet.add(sentKey);
              results.sent++;
              // Log immediately, not batched at the end of the run — if this
              // function times out or crashes partway through a large worker
              // list, sends already made still get recorded, so the next run
              // (or an overlapping catchup call from AddEventModal) won't
              // re-send to everyone already notified.
              await fetch(`${SUPABASE_URL}/rest/v1/event_availability_notifications`, {
                method: 'POST',
                headers: { ...sbHeaders(), Prefer: 'return=minimal' },
                body: JSON.stringify([{
                  event_id: event.id,
                  worker_id: worker.id,
                  rank,
                  channel: 'email',
                }]),
              });
            } else {
              results.errors.push({ event: event.name, rank, worker: worker.name, error: 'Send failed' });
            }
          } catch (err) {
            results.errors.push({ event: event.name, rank, worker: worker.name, error: err.message });
          }
        }
      }
    }

    return res.status(200).json(results);
  } catch (err) {
    return res.status(500).json({ error: err.message, ...results });
  }
}
