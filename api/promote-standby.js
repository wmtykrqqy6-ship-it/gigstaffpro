// api/promote-standby.js
// Best-effort auto-promotion: called right after a filled assignment is
// removed (worker self-cancel outside 7 days, or admin unassign) to move the
// longest-waiting standby worker for that event+position into the opened
// slot and email them. Uses the service-role key (not anon): this can be
// triggered with no user session at all, and needs to keep working once
// anon write access to assignments is locked down to admin-only. Keeps
// invite-respond.js's atomic-conditional-PATCH pattern to avoid
// double-promoting the same standby worker if this were ever triggered
// twice for one opening.
//
// Reachable from two different trust levels, so it needs two different
// gates: (1) App.jsx calls it directly from the admin dashboard right after
// an admin unassigns someone — gated on a real admin session below; (2)
// worker-actions.js's handleCancelAssignment calls it server-to-server after
// a worker cancels their own shift, where there's no admin session to check
// — gated on a shared internal secret instead. Previously this endpoint had
// neither: anyone on the internet could POST any eventId/position and force
// a real standby-to-approved promotion (plus the promotion email) for any
// event, any time.

import { verifyAdminRequest } from './_lib/verifyAdmin.js';
import { escapeHtml } from './_lib/escapeHtml.js';
import { renderEmailShell } from './_lib/emailShell.js';

const SUPABASE_URL = 'https://ycsauzvkrbcynifkawuw.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal'
};

// Mirrors src/utils/positionHelpers.js's UNFILLED_ASSIGNMENT_STATUSES — kept
// as an independent copy since api/ functions aren't bundled through Vite,
// matching the existing api/_lib/workerAuth.js convention.
const UNFILLED_ASSIGNMENT_STATUSES = ['standby', 'pending', 'rejected', 'cancelled'];
const isAssignmentFilled = (status) => !UNFILLED_ASSIGNMENT_STATUSES.includes(status);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!SUPABASE_KEY) {
    console.error('promote-standby: SUPABASE_SERVICE_ROLE_KEY not configured');
    return res.status(500).json({ promoted: false, reason: 'server not configured' });
  }

  const internalSecret = process.env.INTERNAL_API_SECRET;
  const suppliedSecret = req.headers['x-internal-secret'];
  const isTrustedInternalCall = !!internalSecret && suppliedSecret === internalSecret;

  if (!isTrustedInternalCall) {
    const adminCheck = await verifyAdminRequest(req);
    if (!adminCheck.ok) {
      return res.status(adminCheck.status).json({ promoted: false, reason: adminCheck.error });
    }
  }

  const { eventId, position } = req.body || {};
  if (!eventId || !position) {
    return res.status(400).json({ promoted: false, reason: 'missing eventId or position' });
  }

  try {
    const [eventRes, assignmentsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.${eventId}&select=name,date,time,end_time,venue,address,dress_code,parking,positions&limit=1`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/assignments?event_id=eq.${eventId}&select=id,worker_id,position,status,created_at`, { headers })
    ]);
    const [events, assignments] = await Promise.all([eventRes.json(), assignmentsRes.json()]);
    const event = events?.[0];
    if (!event) {
      return res.status(200).json({ promoted: false, reason: 'event not found' });
    }

    const posDef = (event.positions || []).find(p => p.key === position || p.name === position);
    const matchesPosition = (a) => a.position === position || (posDef && (a.position === posDef.key || a.position === posDef.name));

    const needed = (posDef && posDef.count) || 1;
    const filled = (assignments || []).filter(a => isAssignmentFilled(a.status) && matchesPosition(a)).length;
    if (filled >= needed) {
      return res.status(200).json({ promoted: false, reason: 'position still full' });
    }

    const standbyList = (assignments || [])
      .filter(a => a.status === 'standby' && matchesPosition(a))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    const candidate = standbyList[0];
    if (!candidate) {
      return res.status(200).json({ promoted: false, reason: 'no standby workers' });
    }

    // Atomic conditional claim — only promotes if this candidate is still on
    // standby at the moment of the write, so two near-simultaneous triggers
    // for the same opening can't both promote someone.
    const claimRes = await fetch(
      `${SUPABASE_URL}/rest/v1/assignments?id=eq.${candidate.id}&status=eq.standby`,
      {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ status: 'approved', updated_at: new Date().toISOString() })
      }
    );
    const claimed = await claimRes.json();
    if (!claimed || claimed.length === 0) {
      return res.status(200).json({ promoted: false, reason: 'race lost' });
    }

    // Log the promotion so the admin dashboard can surface it as a
    // notification — non-critical, promotion already happened.
    fetch(`${SUPABASE_URL}/rest/v1/standby_promotions`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        event_id: eventId,
        worker_id: candidate.worker_id,
        assignment_id: candidate.id,
        position,
      })
    }).catch(() => {});

    // Notify the promoted worker — non-critical, promotion already happened.
    try {
      const workerRes = await fetch(`${SUPABASE_URL}/rest/v1/workers?id=eq.${candidate.worker_id}&select=name,email&limit=1`, { headers });
      const workers = await workerRes.json();
      const worker = workers?.[0];

      if (worker?.email) {
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
        const positionLabel = (posDef && posDef.label) || position.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const calUrl = `https://gigstaffpro.vercel.app/api/calendar-event?event_id=${eventId}&position=${encodeURIComponent(positionLabel)}`;

        const rows = [
          ['📅', 'Date', fmtDate(event.date)],
          ['🎴', 'Position', positionLabel],
          event.venue ? ['📍', 'Venue', event.venue] : null,
          event.address ? ['🗺', 'Address', event.address] : null,
          timeStr ? ['🕐', 'Time', timeStr] : null,
          event.dress_code ? ['👔', 'Dress Code', event.dress_code] : null,
          event.parking ? ['🅿', 'Parking', event.parking] : null,
        ].filter(Boolean).map(([icon, label, val]) =>
          `<tr><td style="padding:6px 10px 6px 0;color:#6b7280;font-size:16px;white-space:nowrap">${icon} ${label}</td><td style="padding:6px 0;color:#111;font-size:16px">${escapeHtml(val)}</td></tr>`
        ).join('');

        const promoBody = `
<div style="text-align:center;margin:0 0 16px"><div style="font-size:44px">🎉</div>
<h2 style="margin:6px 0 2px;color:#111">You're off the waitlist!</h2>
<p style="color:#6b7280;margin:0">A spot opened up and you're confirmed for <strong>${escapeHtml(event.name)}</strong></p></div>
<table style="border-collapse:collapse;width:100%;margin:0 0 14px">${rows}</table>
<div style="text-align:center;margin:14px 0"><a href="${calUrl}" style="display:inline-block;background:#f8f9fa;border:1px solid #dadce0;color:#374151;padding:12px 22px;border-radius:6px;text-decoration:none;font-size:15px;font-weight:500">📅 Add to Calendar</a></div>
<hr style="border:none;border-top:1px solid #f3f4f6;margin:14px 0 10px">
<p style="color:#9ca3af;font-size:11px;text-align:center;margin:12px 0 0">View your schedule in the <a href="https://gigstaffpro.vercel.app" style="color:#7c0a02">staff portal</a><br><strong style="color:#7c0a02">Vegas on Wheels</strong></p>`;

        const promoHtml = renderEmailShell({ subtitle: 'Spot Opened Up', bodyHtml: promoBody });

        const resendKey = process.env.RESEND_API_KEY;
        if (resendKey) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
            body: JSON.stringify({
              from: 'Vegas on Wheels <noreply@gigstaffpro.com>',
              to: worker.email,
              subject: `🎉 You're confirmed: ${event.name}`,
              html: promoHtml
            })
          });
        }
      }

      return res.status(200).json({ promoted: true, workerName: worker?.name || null });
    } catch (_) {
      // Promotion already committed above — email failure is non-critical.
      return res.status(200).json({ promoted: true, workerName: null });
    }
  } catch (error) {
    console.error('promote-standby error:', error);
    return res.status(500).json({ promoted: false, reason: 'server error' });
  }
}
