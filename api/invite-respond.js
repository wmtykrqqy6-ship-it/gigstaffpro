// api/invite-respond.js
// Handles one-click accept/decline from email links
// URL: /api/invite-respond?token=<uuid>&action=accepted  OR  &action=declined

import { escapeHtml } from './_lib/escapeHtml.js';

const SUPABASE_URL = 'https://ycsauzvkrbcynifkawuw.supabase.co';
// Service-role, not anon: this handler creates/updates assignments and
// invitations with no user session at all (it's a one-click email link),
// so it needs to keep working once anon write access to those tables is
// locked down to admin-only.
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal'
};

export default async function handler(req, res) {
  if (!SUPABASE_KEY) {
    console.error('invite-respond: SUPABASE_SERVICE_ROLE_KEY not configured');
    return res.status(500).send(errorPage('Something went wrong. Please contact your admin.'));
  }

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
    // 0. Conflict check: does this worker already hold a filled assignment
    // that overlaps this invite's event, on the same date? Self-apply and
    // standby-join in the app both block on this; this one-click email link
    // previously didn't, so a worker could double-book straight from their
    // inbox with no warning. Best-effort (check-then-act, not atomic) — the
    // atomic claim below still guarantees this invite itself can't be
    // double-accepted.
    const [inviteEventRes, workerAssignmentsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.${invite.event_id}&select=id,name,date,time,end_time`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/assignments?worker_id=eq.${invite.worker_id}&select=event_id,status`, { headers }),
    ]);
    const [inviteEvents, workerAssignments] = await Promise.all([inviteEventRes.json(), workerAssignmentsRes.json()]);
    const inviteEvent = inviteEvents?.[0];

    const UNFILLED = ['standby', 'pending', 'rejected', 'cancelled'];
    const filledOtherEventIds = [...new Set(
      (workerAssignments || [])
        .filter(a => a.event_id !== invite.event_id && !UNFILLED.includes(a.status))
        .map(a => a.event_id)
    )];

    if (inviteEvent?.date && inviteEvent?.time && filledOtherEventIds.length > 0) {
      const otherEventsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/events?id=in.(${filledOtherEventIds.join(',')})&select=id,name,date,time,end_time`,
        { headers }
      );
      const otherEvents = await otherEventsRes.json();

      const parseTime = (t) => {
        if (!t) return null;
        const [h, m] = t.split(':').map(Number);
        return h * 60 + (m || 0);
      };
      const thisStart = parseTime(inviteEvent.time);
      const thisEnd = parseTime(inviteEvent.end_time) ?? (thisStart + 8 * 60); // assume 8h if no end time on record

      const conflict = (otherEvents || []).find(e => {
        if (e.date !== inviteEvent.date) return false;
        const otherStart = parseTime(e.time);
        const otherEnd = parseTime(e.end_time) ?? (otherStart + 8 * 60);
        if (otherStart == null) return false;
        return thisStart < otherEnd && thisEnd > otherStart;
      });

      if (conflict) {
        return res.status(200).send(errorPage(
          `You're already confirmed for "${escapeHtml(conflict.name)}" on this same date, and the times overlap with "${escapeHtml(inviteEvent.name)}". ` +
          `This invite hasn't been accepted — log in to the staff portal or contact your manager to sort out the conflict.`
        ));
      }
    }

    // 1. Atomically claim the invite: only proceed if THIS request is the one that
    // actually flips status pending -> confirmed. This link is a plain GET, and email
    // security scanners (Outlook Safe Links, Microsoft Defender, Proofpoint, etc.)
    // routinely pre-fetch links in incoming mail to scan them before the recipient
    // ever opens the message — which triggers this same handler. Without an atomic
    // claim here, that scanner hit and the worker's real click can race (both read
    // status='pending' before either write lands), creating two assignments and
    // sending two confirmation emails for one accept. The WHERE status=eq.pending
    // filter is enforced by Postgres itself, so only one concurrent request can ever
    // match and update the row — everyone else gets zero rows back.
    const claimRes = await fetch(
      `${SUPABASE_URL}/rest/v1/invitations?id=eq.${invite.id}&status=eq.pending`,
      {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ status: 'confirmed', responded_at: new Date().toISOString() })
      }
    );
    const claimed = await claimRes.json();

    if (!claimed || claimed.length === 0) {
      // Another request (a scanner pre-fetch, a double-click, a retry) already
      // claimed this invite. Don't create a second assignment or send a second email.
      return res.status(200).send(alreadyRespondedPage('You already accepted this invitation!'));
    }

    // 2. Create the assignment — safe now, this request is the sole winner of the claim
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

        const rows = [
          ['📅', 'Date', fmtDate(event.date)],
          ['🎴', 'Position', positionLabel],
          event.venue   ? ['📍', 'Venue',     event.venue]      : null,
          event.address ? ['🗺', 'Address',   event.address]    : null,
          timeStr       ? ['🕐', 'Time',      timeStr]          : null,
          event.dress_code ? ['👔', 'Dress Code', event.dress_code] : null,
          event.parking    ? ['🅿', 'Parking',    event.parking]    : null,
        ].filter(Boolean).map(([icon, label, val]) =>
          `<tr><td class="lbl">${icon} ${label}</td><td class="val">${escapeHtml(val)}</td></tr>`
        ).join('');

        const confirmHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:Arial,sans-serif;margin:0;padding:0}
.w{max-width:500px;margin:0 auto}
.h{background:#7c0a02;padding:20px;text-align:center;border-radius:8px 8px 0 0}
.h h1{color:#fff;margin:0;font-size:20px}
.h p{color:#fca5a5;margin:4px 0 0;font-size:13px}
.b{background:#fff;padding:20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px}
.lbl{padding:4px 8px 4px 0;color:#6b7280;font-size:13px;white-space:nowrap}
.val{padding:4px 0;color:#111;font-size:13px}
.cal{display:inline-block;background:#f8f9fa;border:1px solid #dadce0;color:#374151;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500}
.ft{color:#9ca3af;font-size:11px;text-align:center;margin:12px 0 0}
</style></head><body><div class="w">
<div class="h"><h1>🎰 Vegas on Wheels</h1><p>Booking Confirmed</p></div>
<div class="b">
<div style="text-align:center;margin:0 0 16px"><div style="font-size:44px">🎉</div>
<h2 style="margin:6px 0 2px;color:#111">You're confirmed!</h2>
<p style="color:#6b7280;margin:0">Booked for <strong>${escapeHtml(event.name)}</strong></p></div>
<table style="border-collapse:collapse;width:100%;margin:0 0 14px">${rows}</table>
<div style="text-align:center;margin:14px 0"><a href="${calUrl}" class="cal">📅 Add to Calendar</a></div>
<hr style="border:none;border-top:1px solid #f3f4f6;margin:14px 0 10px">
<p class="ft">View your schedule in the <a href="https://gigstaffpro.vercel.app" style="color:#7c0a02">staff portal</a><br><strong style="color:#7c0a02">Vegas on Wheels</strong></p>
</div></div></body></html>`;

        const resendKey = process.env.RESEND_API_KEY;
        if (resendKey) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
            body: JSON.stringify({
              from: 'Vegas on Wheels <noreply@gigstaffpro.com>',
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