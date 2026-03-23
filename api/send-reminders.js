// api/send-reminders.js
// Vercel cron job — runs every 30 minutes
// Finds pending invites past their halfway mark with no reminder sent yet, sends reminder email

const SUPABASE_URL = 'https://ycsauzvkrbcynifkawuw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2F1enZrcmJjeW5pZmthd3V3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3MDQ4NTcsImV4cCI6MjA4NDI4MDg1N30.07H2LXdn2XKfpcrSmrp7_G0KXIJMH27fmJpCok10lrc';

const sbHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

const fmtTime = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

const fmtDate = (d) => {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  });
};

export default async function handler(req, res) {
  // Allow GET (cron) or POST (manual trigger from admin)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return res.status(500).json({ error: 'Email service not configured' });
  }

  const now = new Date();

  try {
    // Fetch all pending invites that:
    // 1. Haven't expired yet
    // 2. Haven't had a reminder sent
    // 3. Have a window_hours set
    const invRes = await fetch(
      `${SUPABASE_URL}/rest/v1/invitations?status=eq.pending&reminder_sent_at=is.null&select=*`,
      { headers: sbHeaders }
    );
    const invites = await invRes.json();

    if (!invites?.length) {
      return res.status(200).json({ sent: 0, message: 'No reminders needed' });
    }

    // Filter to invites past their halfway mark and not yet expired
    const eligible = invites.filter(inv => {
      if (!inv.invited_at || !inv.window_hours || !inv.expires_at) return false;
      const expiry = new Date(inv.expires_at);
      if (expiry <= now) return false; // already expired
      const invitedAt = new Date(inv.invited_at);
      const halfwayMs = (inv.window_hours * 60 * 60 * 1000) / 2;
      const halfwayAt = new Date(invitedAt.getTime() + halfwayMs);
      return now >= halfwayAt;
    });

    if (!eligible.length) {
      return res.status(200).json({ sent: 0, message: 'No reminders due yet' });
    }

    let sent = 0;
    const errors = [];

    for (const inv of eligible) {
      try {
        // Fetch worker and event in parallel
        const [workerRes, eventRes] = await Promise.all([
          fetch(`${SUPABASE_URL}/rest/v1/workers?id=eq.${inv.worker_id}&select=name,email&limit=1`, { headers: sbHeaders }),
          fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.${inv.event_id}&select=name,date,time,end_time,venue,address,dress_code,parking&limit=1`, { headers: sbHeaders }),
        ]);
        const [workers, events] = await Promise.all([workerRes.json(), eventRes.json()]);
        const worker = workers?.[0];
        const event = events?.[0];

        if (!worker?.email || !event) continue;

        const positionLabel = inv.position_key
          ? inv.position_key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
          : 'your position';

        const expiresAt = new Date(inv.expires_at);
        const expiresStr = expiresAt.toLocaleString('en-US', {
          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
        });

        const acceptUrl = `https://gigstaffpro.vercel.app/api/invite-respond?token=${inv.token}&action=accepted`;
        const declineUrl = `https://gigstaffpro.vercel.app/api/invite-respond?token=${inv.token}&action=declined`;

        const timeStr = event.time
          ? (event.end_time ? `${fmtTime(event.time)} – ${fmtTime(event.end_time)}` : fmtTime(event.time))
          : '';

        const rows = [
          ['📅', 'Date',     fmtDate(event.date)],
          ['🎴', 'Position', positionLabel],
          event.venue   ? ['📍', 'Venue',   event.venue]      : null,
          event.address ? ['🗺', 'Address', event.address]    : null,
          timeStr       ? ['🕐', 'Time',    timeStr]          : null,
          event.dress_code ? ['👔', 'Dress Code', event.dress_code] : null,
          event.parking    ? ['🅿', 'Parking',    event.parking]    : null,
        ].filter(Boolean).map(([icon, label, val]) =>
          `<tr><td class="lbl">${icon} ${label}</td><td class="val">${val}</td></tr>`
        ).join('');

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:Arial,sans-serif;margin:0;padding:0}
.w{max-width:500px;margin:0 auto}
.h{background:#7c0a02;padding:20px;text-align:center;border-radius:8px 8px 0 0}
.h h1{color:#fff;margin:0;font-size:20px}
.h p{color:#fca5a5;margin:4px 0 0;font-size:13px}
.b{background:#fff;padding:20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px}
.lbl{padding:4px 8px 4px 0;color:#6b7280;font-size:13px;white-space:nowrap}
.val{padding:4px 0;color:#111;font-size:13px}
.btn{display:inline-block;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;margin:0 4px}
.ft{color:#9ca3af;font-size:11px;text-align:center;margin:12px 0 0}
</style></head><body><div class="w">
<div class="h"><h1>🎰 Vegas on Wheels</h1><p>⏰ Reminder — please respond</p></div>
<div class="b">
<p style="font-size:15px;color:#111;margin:0 0 4px">Hi ${worker.name},</p>
<p style="color:#374151;margin:0 0 16px">You haven't responded to your invite for <strong>${event.name}</strong> as <strong>${positionLabel}</strong>. Please respond before your window closes.</p>
<div style="text-align:center;margin:0 0 16px">
  <a href="${acceptUrl}" class="btn" style="background:#16a34a;color:#fff">✅ Accept</a>
  <a href="${declineUrl}" class="btn" style="background:#dc2626;color:#fff">✕ Decline</a>
</div>
<p style="color:#6b7280;font-size:12px;text-align:center;margin:0 0 16px">⏰ Respond by <strong>${expiresStr}</strong></p>
<table style="border-collapse:collapse;width:100%;margin:0 0 12px">${rows}</table>
<hr style="border:none;border-top:1px solid #f3f4f6;margin:12px 0 10px">
<p class="ft">Or <a href="https://gigstaffpro.vercel.app" style="color:#7c0a02">log in to the staff portal</a><br><strong style="color:#7c0a02">Vegas on Wheels</strong></p>
</div></div></body></html>`;

        // Send reminder email
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
          body: JSON.stringify({
            from: 'Vegas on Wheels <noreply@gigstaffpro.com>',
            to: worker.email,
            subject: `⏰ Reminder: Please respond to your ${event.name} invite`,
            html
          })
        });

        if (emailRes.ok) {
          // Stamp reminder_sent_at
          await fetch(`${SUPABASE_URL}/rest/v1/invitations?id=eq.${inv.id}`, {
            method: 'PATCH',
            headers: { ...sbHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify({ reminder_sent_at: now.toISOString() })
          });
          sent++;
        }
      } catch (err) {
        errors.push({ inviteId: inv.id, error: err.message });
      }
    }

    return res.status(200).json({ sent, eligible: eligible.length, errors });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
