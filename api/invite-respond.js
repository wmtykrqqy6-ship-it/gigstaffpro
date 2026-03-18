// api/invite-respond.js
// Handles one-click accept/decline from email links
// URL: /api/invite-respond?token=<uuid>&action=accepted  OR  &action=declined

const SUPABASE_URL = 'https://ycsauzvkrbcynifkawuw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2F1enZrcmJjeW5pZmthd3V3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3MDQ4NTcsImV4cCI6MjA4NDI4MDg1N30.07H2LXdn2XKfpcrSmrp7_G0KXIJMH27fmJpCok10lrc';

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal'
};

export default async function handler(req, res) {
  const { token, action } = req.query;

  if (!token || !['accepted', 'declined'].includes(action)) {
    return res.status(400).send(errorPage('Invalid link. Please log in to the staff portal.'));
  }

  // Look up the invitation by token
  const getRes = await fetch(
    `${SUPABASE_URL}/rest/v1/invitations?token=eq.${token}&select=*`,
    { headers }
  );
  const invites = await getRes.json();

  if (!invites || invites.length === 0) {
    return res.status(404).send(errorPage('Invitation not found. It may have already been responded to.'));
  }

  const invite = invites[0];

  if (invite.status !== 'pending') {
    const msg = invite.status === 'accepted' || invite.status === 'confirmed'
      ? 'You already accepted this invitation!'
      : invite.status === 'declined'
      ? 'You already declined this invitation.'
      : invite.status === 'expired'
      ? 'This invitation has expired.'
      : `This invitation is no longer pending (status: ${invite.status}).`;
    return res.status(200).send(alreadyRespondedPage(msg));
  }

  // Check expiry
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    await fetch(`${SUPABASE_URL}/rest/v1/invitations?id=eq.${invite.id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ status: 'expired' })
    });
    return res.status(200).send(errorPage('Sorry, this invitation has expired. Contact your manager.'));
  }

  if (action === 'accepted') {
    // 1. Create the assignment immediately
    await fetch(`${SUPABASE_URL}/rest/v1/assignments`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        event_id: invite.event_id,
        worker_id: invite.worker_id,
        position: invite.position_key,
        status: 'approved'
      })
    });

    // 2. Mark invite as confirmed
    await fetch(`${SUPABASE_URL}/rest/v1/invitations?id=eq.${invite.id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ status: 'confirmed', responded_at: new Date().toISOString() })
    });

    // 3. Expire any other pending invites for this same event+position slot if now full
    const posRes = await fetch(
      `${SUPABASE_URL}/rest/v1/invitations?event_id=eq.${invite.event_id}&position_key=eq.${encodeURIComponent(invite.position_key)}&status=eq.pending&select=id`,
      { headers }
    );
    const others = await posRes.json();
    if (others?.length > 0) {
      const ids = others.map(i => i.id);
      await fetch(`${SUPABASE_URL}/rest/v1/invitations?id=in.(${ids.join(',')})`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ status: 'expired' })
      });
    }

    // 4. Send confirmation email with calendar link
    try {
      const [eventRes, workerRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.${invite.event_id}&select=name,date,time,end_time,venue,address,dress_code,parking&limit=1`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/workers?id=eq.${invite.worker_id}&select=name,email&limit=1`, { headers })
      ]);
      const [events, workers] = await Promise.all([eventRes.json(), workerRes.json()]);
      const event = events?.[0];
      const worker = workers?.[0];

      if (event && worker?.email) {
        const fmtDate = (d) => {
          if (!d) return d;
          const [y, m, day] = d.split('-');
          const dt = new Date(Number(y), Number(m) - 1, Number(day));
          return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        };
        const fmtTime = (t) => {
          if (!t) return '';
          const [h, m] = t.split(':').map(Number);
          return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
        };
        const timeStr = event.time
          ? (event.end_time ? `${fmtTime(event.time)} – ${fmtTime(event.end_time)}` : fmtTime(event.time))
          : '';
        const positionLabel = invite.position_key
          ? invite.position_key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
          : 'your position';
        const calUrl = `https://gigstaffpro.vercel.app/api/calendar-event?event_id=${invite.event_id}&position=${encodeURIComponent(positionLabel)}`;

        const detailRows = [
          `<tr><td style="padding:4px 8px 4px 0;color:#6b7280;font-size:13px;white-space:nowrap">📅 Date</td><td style="padding:4px 0;color:#111;font-size:13px">${fmtDate(event.date)}</td></tr>`,
          `<tr><td style="padding:4px 8px 4px 0;color:#6b7280;font-size:13px;white-space:nowrap">🎴 Position</td><td style="padding:4px 0;color:#111;font-size:13px">${positionLabel}</td></tr>`,
          event.venue ? `<tr><td style="padding:4px 8px 4px 0;color:#6b7280;font-size:13px;white-space:nowrap">📍 Venue</td><td style="padding:4px 0;color:#111;font-size:13px">${event.venue}</td></tr>` : '',
          event.address ? `<tr><td style="padding:4px 8px 4px 0;color:#6b7280;font-size:13px;white-space:nowrap">🗺 Address</td><td style="padding:4px 0;color:#111;font-size:13px">${event.address}</td></tr>` : '',
          timeStr ? `<tr><td style="padding:4px 8px 4px 0;color:#6b7280;font-size:13px;white-space:nowrap">🕐 Time</td><td style="padding:4px 0;color:#111;font-size:13px">${timeStr}</td></tr>` : '',
          event.dress_code ? `<tr><td style="padding:4px 8px 4px 0;color:#6b7280;font-size:13px;white-space:nowrap">👔 Dress Code</td><td style="padding:4px 0;color:#111;font-size:13px">${event.dress_code}</td></tr>` : '',
          event.parking ? `<tr><td style="padding:4px 8px 4px 0;color:#6b7280;font-size:13px;white-space:nowrap">🅿 Parking</td><td style="padding:4px 0;color:#111;font-size:13px">${event.parking}</td></tr>` : '',
        ].filter(Boolean).join('');

        const confirmHtml = `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">
            <div style="background:#7c0a02;padding:24px;text-align:center;border-radius:8px 8px 0 0">
              <h1 style="color:white;margin:0;font-size:22px">🎰 Vegas on Wheels</h1>
              <p style="color:#fca5a5;margin:6px 0 0">Booking Confirmed</p>
            </div>
            <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
              <div style="text-align:center;margin-bottom:20px">
                <div style="font-size:48px">🎉</div>
                <h2 style="margin:8px 0 4px;color:#111">You're confirmed!</h2>
                <p style="color:#6b7280;margin:0">You've been booked for <strong>${event.name}</strong></p>
              </div>
              <table style="border-collapse:collapse;width:100%;margin:0 0 16px">${detailRows}</table>
              <div style="text-align:center;margin:16px 0">
                <a href="${calUrl}" style="display:inline-block;background:#f8f9fa;border:1px solid #dadce0;color:#374151;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500">
                  📅 Add to Calendar
                </a>
              </div>
              <hr style="border:none;border-top:1px solid #f3f4f6;margin:16px 0 12px">
              <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0">
                Questions? Log in to the <a href="https://gigstaffpro.vercel.app" style="color:#7c0a02">staff portal</a> to view your schedule.<br>
                <strong style="color:#7c0a02">The Vegas on Wheels Team</strong>
              </p>
            </div>
          </div>`;

        const resendKey = process.env.RESEND_API_KEY;
        if (resendKey) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
            body: JSON.stringify({
              from: 'Vegas on Wheels <noreply@vegasonwheels.com>',
              to: worker.email,
              subject: `✅ Confirmed: ${event.name}`,
              html: confirmHtml
            })
          });
        }
      }
    } catch (_) {
      // Confirmation email failure is non-critical — worker is still confirmed
    }

    return res.status(200).send(successPage(
      '✅ Invitation Accepted!',
      "You're confirmed for this event. Log in to the staff portal to view your upcoming schedule.",
      'accepted'
    ));
  } else {
    // Declined
    await fetch(`${SUPABASE_URL}/rest/v1/invitations?id=eq.${invite.id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ status: 'declined', responded_at: new Date().toISOString() })
    });

    return res.status(200).send(successPage(
      'Invitation Declined',
      "We've noted your response. Log in to the staff portal to view other available events.",
      'declined'
    ));
  }
}

function basePage(content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GigStaffPro</title>
  <style>
    body { font-family: Arial, sans-serif; background: #111; min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; padding: 16px; }
    .card { background: white; border-radius: 12px; max-width: 460px; width: 100%; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.4); }
    .header { background: #7c0a02; padding: 28px 24px; text-align: center; }
    .header h1 { color: white; margin: 0; font-size: 22px; }
    .header p { color: #fca5a5; margin: 6px 0 0; font-size: 14px; }
    .body { padding: 28px 24px; text-align: center; }
    .icon { font-size: 52px; margin-bottom: 12px; }
    h2 { color: #111; margin: 0 0 10px; font-size: 20px; }
    p { color: #6b7280; margin: 0 0 24px; line-height: 1.5; }
    .btn { display: inline-block; background: #7c0a02; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px; }
  </style>
</head>
<body><div class="card">${content}</div></body>
</html>`;
}

function successPage(title, message, type) {
  const icon = type === 'accepted' ? '🎉' : '👋';
  return basePage(`
    <div class="header"><h1>🎰 Vegas on Wheels</h1><p>Staff Portal</p></div>
    <div class="body">
      <div class="icon">${icon}</div>
      <h2>${title}</h2>
      <p>${message}</p>
      <a class="btn" href="https://gigstaffpro.vercel.app">Go to Staff Portal →</a>
    </div>`);
}

function alreadyRespondedPage(message) {
  return basePage(`
    <div class="header"><h1>🎰 Vegas on Wheels</h1><p>Staff Portal</p></div>
    <div class="body">
      <div class="icon">ℹ️</div>
      <h2>Already Responded</h2>
      <p>${message}</p>
      <a class="btn" href="https://gigstaffpro.vercel.app">Go to Staff Portal →</a>
    </div>`);
}

function errorPage(message) {
  return basePage(`
    <div class="header"><h1>🎰 Vegas on Wheels</h1><p>Staff Portal</p></div>
    <div class="body">
      <div class="icon">⚠️</div>
      <h2>Something went wrong</h2>
      <p>${message}</p>
      <a class="btn" href="https://gigstaffpro.vercel.app">Go to Staff Portal →</a>
    </div>`);
}