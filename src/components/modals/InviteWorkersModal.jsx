import React, { useState, useEffect } from 'react'; 
import { X, Send, Clock, CheckCircle, XCircle, Users, Star, Shield, AlertCircle, UserCheck, RefreshCw, Bell } from 'lucide-react';  
import { supabase } from '../../supabaseClient';
import { getPositionLabel, getPayRateKey, positionMatches, isAssignmentFilled } from '../../utils/positionHelpers';
import { getHostLabel } from '../../utils/hostLabelHelper';
import { RELIABILITY_THRESHOLDS } from '../../utils/reliabilityHelpers';
import { renderEmailShell } from '../../utils/emailShell.js';
import { escapeHtml } from '../../utils/escapeHtml.js';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';

const fmtDate = (d) => {
  if (!d) return d;
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  });
};

const fmtTime = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
};

export default function InviteWorkersModal({ open, event, workers, assignments, events, payRates = {}, eventPaymentSettings = {}, travelTiers = [], bonuses = {}, locations = [], getEffectiveRate, onClose, onReloadAssignments, defaultPosition = null, onSessionExpired }) {
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [selectedPosition, setSelectedPosition] = useState(null);
  // Apply defaultPosition when modal opens
  useEffect(() => {
    if (open && defaultPosition) setSelectedPosition(defaultPosition);
    if (!open) setSelectedPosition(null);
  }, [open, defaultPosition]);
  const [selectedRank, setSelectedRank] = useState(1);
  const [windowHours, setWindowHours] = useState(2);
  const [selectedWorkers, setSelectedWorkers] = useState(new Set());
  const [activeTab, setActiveTab] = useState('invite');
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [secondsSinceRefresh, setSecondsSinceRefresh] = useState(0);
  const [confirmSend, setConfirmSend] = useState(null); // holds {workerIds, rank} when awaiting confirmation
  const [reInviting, setReInviting] = useState(null);
  const [nudging, setNudging] = useState(null); // invite id being nudged
  const notify = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    if (open && event) {
      loadInvitations();
      const positions = event.positions || [];
      for (const pos of positions) {
        const filled = (assignments || []).filter(a => a.event_id === event.id && a.position === pos.key && isAssignmentFilled(a.status)).length;
        if (filled < pos.count) { setSelectedPosition(pos.key); break; }
      }
    }
  }, [open, event?.id]);

  useEffect(() => {
    if (!open || activeTab !== 'responses') return;
    const interval = setInterval(() => { loadInvitations(); }, 60000);
    return () => clearInterval(interval);
  }, [open, activeTab]);

  useEffect(() => {
    if (!lastRefreshed) return;
    const tick = setInterval(() => {
      setSecondsSinceRefresh(Math.floor((Date.now() - lastRefreshed) / 1000));
    }, 10000);
    return () => clearInterval(tick);
  }, [lastRefreshed]);

  // Calculate estimated pay for a worker at a position
  // workerMiles: pre-computed home→event miles (pass null to use settings.miles fallback)
  const calcEstimatedPay = (positionLabel, eventId, worker = null, workerMiles = null) => {
    const settings = eventPaymentSettings[eventId];
    if (!settings || !positionLabel) return null;
    const { hours, isLakeGeneva, isHoliday } = settings;
    const numHours = Number(hours) || 0;
    if (!numHours) return null;

    // Hourly rate: worker's own home market, not the event's — traveling
    // to a different market doesn't change their base rate, only travel pay.
    const rateKey = getPayRateKey(positionLabel);
    const eventLocationId = event?.location_id || settings.locationId || null;
    const hourlyRate = getEffectiveRate
      ? getEffectiveRate(positionLabel, worker?.home_location_id || null)
      : (payRates[rateKey] || payRates[positionLabel] || 0);
    if (!hourlyRate) return null;

    // Travel miles priority: explicit workerMiles > same-location=0 > settings.miles
    let numMiles;
    if (workerMiles !== null) {
      numMiles = workerMiles;
    } else if (worker?.home_location_id && worker.home_location_id === eventLocationId) {
      numMiles = 0;
    } else {
      numMiles = Number(settings.miles) || 0;
    }

    const basePay = numHours * hourlyRate;

    let travelPay = 0;
    for (const tier of travelTiers) {
      const min = Number(tier.min_miles ?? tier.minMiles ?? 0);
      const max = Number(tier.max_miles ?? tier.maxMiles ?? 0);
      const amt = Number(tier.pay_amount ?? tier.payAmount ?? tier.amount ?? 0);
      if (numMiles >= min && numMiles <= max) { travelPay = amt; break; }
    }

    const lakeGenevaBonus = isLakeGeneva ? (bonuses['Lake Geneva'] || 15) : 0;
    const subtotal = basePay + travelPay + lakeGenevaBonus;
    const holidayMult = isHoliday ? (bonuses['Holiday Multiplier'] || 1.5) : 1.0;
    const total = subtotal * holidayMult;

    return {
      total: total.toFixed(0),
      breakdown: [
        `${numHours} hrs × $${hourlyRate}/hr = $${basePay.toFixed(0)}`,
        travelPay > 0 ? `+ $${travelPay} travel` : null,
        lakeGenevaBonus > 0 ? `+ $${lakeGenevaBonus} Lake Geneva` : null,
        isHoliday ? `× ${holidayMult} holiday` : null,
      ].filter(Boolean).join(' • ')
    };
  };

  const loadInvitations = async () => {
    setLoading(true);
    const { data } = await supabase.from('invitations').select('*').eq('event_id', event.id).order('invited_at', { ascending: false });
    setInvitations(data || []);
    setLastRefreshed(Date.now());
    setSecondsSinceRefresh(0);
    setLoading(false);
  };

  if (!open || !event) return null;

  const positions = event.positions || [];
  const assignedWorkerIds = new Set((assignments || []).filter(a => a.event_id === event.id).map(a => a.worker_id));
  const positionConfig = positions.find(p => p.key === selectedPosition);
  const totalSlots = positionConfig?.count || 0;
  const filledSlots = (assignments || []).filter(a => a.event_id === event.id && a.position === selectedPosition && isAssignmentFilled(a.status)).length;
  const openSlots = Math.max(0, totalSlots - filledSlots);

  const positionInvites = invitations.filter(i => i.position_key === selectedPosition);
  const pendingInvites = positionInvites.filter(i => i.status === 'pending');
  const acceptedInvites = positionInvites.filter(i => i.status === 'accepted');
  const confirmedInvites = positionInvites.filter(i => i.status === 'confirmed');
  const declinedInvites = positionInvites.filter(i => i.status === 'declined');
  const standbyInvites = positionInvites.filter(i => i.status === 'standby');
  const invitedWorkerIds = new Set(positionInvites.filter(i => ['pending','accepted','confirmed','standby'].includes(i.status)).map(i => i.worker_id));

  const eligibleWorkers = (workers || [])
    .filter(w => {
      if (w.is_active === false) return false;
      if (assignedWorkerIds.has(w.id)) return false;
      if (invitedWorkerIds.has(w.id)) return false;
      if (!w.skills || !Array.isArray(w.skills)) return false;
      if (!w.skills.some(skill => positionMatches(skill, selectedPosition))) return false;
      return true;
    })
    .sort((a, b) => (b.reliability ?? 5) - (a.reliability ?? 5));

  // Check if worker has a same-day booking conflict with this event
  const getWorkerConflicts = (workerId) => {
    if (!event?.date) return [];
    return (assignments || [])
      .filter(a => a.worker_id === workerId && a.event_id !== event.id)
      .map(a => (events || []).find(e => e.id === a.event_id))
      .filter(e => e && e.date === event.date);
  };

  const workersByRank = {};
  for (let r = 1; r <= 5; r++) {
    workersByRank[r] = eligibleWorkers.filter(w => (w.rank || 1) === r);
  }

  const toggleWorker = (workerId) => {
    setSelectedWorkers(prev => {
      const next = new Set(prev);
      if (next.has(workerId)) next.delete(workerId); else next.add(workerId);
      return next;
    });
  };

  const selectAllRank = (rank) => {
    const rankWorkers = workersByRank[rank] || [];
    setSelectedWorkers(prev => {
      const next = new Set(prev);
      const allSelected = rankWorkers.every(w => next.has(w.id));
      if (allSelected) rankWorkers.forEach(w => next.delete(w.id));
      else rankWorkers.forEach(w => next.add(w.id));
      return next;
    });
  };

  const buildInviteRecords = (workerIds) => {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + windowHours);
    return workerIds.map(workerId => {
      const worker = workers.find(w => w.id === workerId);
      return { event_id: event.id, worker_id: workerId, position_key: selectedPosition, status: 'pending', rank_tier: worker?.rank || 1, window_hours: windowHours, expires_at: expiresAt.toISOString(), invited_at: new Date().toISOString() };
    });
  };

  const handleSendInvites = async () => {
    if (selectedWorkers.size === 0 || !selectedPosition) return;
    // Show confirmation first
    setConfirmSend({ workerIds: Array.from(selectedWorkers), rank: selectedRank, source: 'selected' });
  };

  const handleInviteAllRank = async (rank) => {
    const rankWorkers = workersByRank[rank] || [];
    if (rankWorkers.length === 0) return;
    setConfirmSend({ workerIds: rankWorkers.map(w => w.id), rank, source: 'all' });
  };

  const handleConfirmSend = async () => {
    if (!confirmSend) return;
    setSending(true);
    try {
      await supabase.from('invitations').insert(buildInviteRecords(confirmSend.workerIds));

      // Send email to workers who have an email address
      // Resolve to human-readable label immediately
      const positionLabel = getPositionLabel(selectedPosition) || selectedPosition || 'a position';
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + windowHours);
      const expiresStr = expiresAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

      // Obtained once for the whole batch — every email in this send reuses
      // the same accessToken rather than re-checking the session per worker.
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (sessionError || !accessToken) {
        await onSessionExpired();
        return;
      }

      const sendInviteEmailToWorker = async workerId => {
        const worker = workers.find(w => w.id === workerId);
        if (!worker?.email) return { outcome: 'skipped' };

        // Fetch the token for this worker's invite
        const { data: inviteRows } = await supabase
          .from('invitations')
          .select('token')
          .eq('event_id', event.id)
          .eq('worker_id', workerId)
          .eq('status', 'pending')
          .order('invited_at', { ascending: false })
          .limit(1);
        const token = inviteRows?.[0]?.token || '';
        const acceptUrl = `https://gigstaffpro.vercel.app/api/invite-respond?token=${token}&action=accepted`;
        const declineUrl = `https://gigstaffpro.vercel.app/api/invite-respond?token=${token}&action=declined`;

        // Fetch live distance from worker's home location → event address
        let workerMiles = null;
        const eventLocationId = event?.location_id || eventPaymentSettings[event.id]?.locationId || null;
        const workerHomeLocationId = worker.home_location_id || null;
        if (workerHomeLocationId && workerHomeLocationId === eventLocationId) {
          workerMiles = 0; // same location, no travel
        } else if (workerHomeLocationId && locations.length > 0 && event.address) {
          const homeLocation = locations.find(l => l.id === workerHomeLocationId);
          if (homeLocation?.address) {
            try {
              const res = await fetch(`/api/get-distance?origin=${encodeURIComponent(homeLocation.address)}&destination=${encodeURIComponent(event.address)}`);
              const distData = await res.json();
              if (distData.miles != null) workerMiles = distData.miles;
            } catch (_) {}
          }
        }

        const invitePay = calcEstimatedPay(positionLabel, event.id, worker, workerMiles);
        const invitePayHtml = invitePay
          ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:10px 14px;margin:10px 0"><p style="margin:0 0 2px;font-size:13px;color:#166534;font-weight:bold">💰 Estimated Pay: $${invitePay.total}</p><p style="margin:0;font-size:12px;color:#4b5563">${invitePay.breakdown}</p></div>`
          : '';

        const timeStr = event.time
          ? (event.end_time ? `${fmtTime(event.time)} - ${fmtTime(event.end_time)}` : fmtTime(event.time))
          : '';

        const rows = [
          ['📅', fmtDate(event.date)],
          ['🎴', positionLabel],
          event.venue ? ['📍', event.venue + (event.room ? `, ${event.room}` : '')] : null,
          event.address ? ['🗺', event.address] : null,
          timeStr ? ['🕐', timeStr] : null,
          event.dress_code ? ['👔', event.dress_code] : null,
          event.parking ? ['🅿', event.parking] : null,
        ].filter(Boolean).map(([icon, val]) =>
          `<tr><td style="padding:4px 8px 4px 0;color:#6b7280;font-size:13px;white-space:nowrap">${icon}</td><td style="padding:4px 0;color:#111;font-size:13px">${escapeHtml(val)}</td></tr>`
        ).join('');

        const detailsHtml = rows
          ? `<table style="border-collapse:collapse;width:100%;margin:12px 0">${rows}</table>`
          : '';

        const body = `
<p style="font-size:15px;color:#111;margin:0 0 4px">Hi ${escapeHtml(worker.name)},</p>
<p style="color:#374151;margin:0 0 16px">Invited to work <strong>${escapeHtml(event.name)}</strong> as <strong>${escapeHtml(positionLabel)}</strong>.</p>
<div style="text-align:center;margin:16px 0">
  <a href="${acceptUrl}" style="display:inline-block;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;margin:0 4px;background:#16a34a;color:#fff">✅ Accept</a>
  <a href="${declineUrl}" style="display:inline-block;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;margin:0 4px;background:#dc2626;color:#fff">✕ Decline</a>
</div>
<p style="color:#6b7280;font-size:12px;text-align:center;margin:0 0 16px">⏰ Respond by <strong>${expiresStr}</strong></p>
${detailsHtml}
${invitePayHtml}
<p style="color:#9ca3af;font-size:11px;text-align:center;margin:12px 0 0">Or <a href="https://gigstaffpro.vercel.app" style="color:#7c0a02">log in to the staff portal</a> to respond.<br><strong style="color:#7c0a02">Vegas on Wheels</strong></p>`;

        const html = renderEmailShell({ subtitle: "You've been invited — please respond", bodyHtml: body });

        const emailRes = await fetch('/api/send-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            to: worker.email,
            subject: `You're invited: ${event.name}`,
            html
          })
        });

        if (emailRes.status === 401) return { outcome: 'sessionExpired' };
        if (emailRes.status === 429) return { outcome: 'rateLimited' };
        return { outcome: emailRes.ok ? 'sent' : 'failed' };
      };

      // Send in fixed-size chunks (max 10 concurrent at a time) instead of
      // all at once, so a large invite batch doesn't fire every request in
      // the same instant. The next chunk only starts after the previous one
      // has fully settled. A 401 in any chunk halts the batch immediately
      // (checked first, so it always wins over a same-chunk 429). A 429 lets
      // the current chunk finish and is tallied, but no further chunk is
      // started — nothing here is ever retried automatically.
      const CHUNK_SIZE = 10;
      let sentCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      let rateLimitedCount = 0;
      let batchSessionExpired = false;
      let batchRateLimited = false;

      for (let i = 0; i < confirmSend.workerIds.length; i += CHUNK_SIZE) {
        const chunk = confirmSend.workerIds.slice(i, i + CHUNK_SIZE);
        const chunkResults = await Promise.allSettled(chunk.map(sendInviteEmailToWorker));

        batchSessionExpired = chunkResults.some(
          result => result.status === 'fulfilled' && result.value?.outcome === 'sessionExpired'
        );
        if (batchSessionExpired) break;

        batchRateLimited = chunkResults.some(
          result => result.status === 'fulfilled' && result.value?.outcome === 'rateLimited'
        );

        for (const result of chunkResults) {
          const outcome = result.status === 'fulfilled' ? result.value?.outcome : 'failed';
          if (outcome === 'sent') sentCount += 1;
          else if (outcome === 'skipped') skippedCount += 1;
          else if (outcome === 'rateLimited') rateLimitedCount += 1;
          else failedCount += 1;
        }

        if (batchRateLimited) break;
      }

      if (batchSessionExpired) {
        await onSessionExpired();
        return;
      }

      setSelectedWorkers(new Set());
      setConfirmSend(null);
      await loadInvitations();
      setActiveTab('responses');

      if (batchRateLimited) {
        const parts = [`Sent invite emails to ${sentCount} worker${sentCount !== 1 ? 's' : ''}.`];
        if (skippedCount > 0) parts.push(`${skippedCount} skipped (no email on file).`);
        if (failedCount > 0) parts.push(`${failedCount} failed to send.`);
        parts.push('The sending limit was reached, so some invitation emails were not sent. Wait a few minutes, then use Nudge on the Responses tab for any pending workers who still need their invite email.');
        notify(parts.join(' '));
      } else if (failedCount > 0 || skippedCount > 0) {
        const parts = [`${sentCount} invite${sentCount !== 1 ? 's' : ''} sent`];
        if (skippedCount > 0) parts.push(`${skippedCount} skipped (no email on file)`);
        if (failedCount > 0) parts.push(`${failedCount} failed to send`);
        notify(parts.join(', ') + '.');
      }
    } catch (err) { notify('Error sending invites: ' + err.message); }
    finally { setSending(false); }
  };

  const handleReInvite = async (inv) => {
    setReInviting(inv.id);
    try {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + windowHours);
      await supabase.from('invitations').update({
        status: 'pending',
        responded_at: null,
        invited_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        window_hours: windowHours
      }).eq('id', inv.id);

      // Re-send email if worker has one
      const worker = workers.find(w => w.id === inv.worker_id);
      if (worker?.email) {
        const expiresStr = expiresAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        // Fetch fresh token
        const { data: inviteRows } = await supabase
          .from('invitations')
          .select('token')
          .eq('id', inv.id)
          .limit(1);
        const token = inviteRows?.[0]?.token || '';
        const acceptUrl = `https://gigstaffpro.vercel.app/api/invite-respond?token=${token}&action=accepted`;
        const declineUrl = `https://gigstaffpro.vercel.app/api/invite-respond?token=${token}&action=declined`;

        // Live distance fetch for re-invite
        let reInviteWorkerMiles = null;
        const riEventLocationId = event?.location_id || eventPaymentSettings[event.id]?.locationId || null;
        if (worker.home_location_id && worker.home_location_id === riEventLocationId) {
          reInviteWorkerMiles = 0;
        } else if (worker.home_location_id && locations.length > 0 && event.address) {
          const homeLocation = locations.find(l => l.id === worker.home_location_id);
          if (homeLocation?.address) {
            try {
              const res = await fetch(`/api/get-distance?origin=${encodeURIComponent(homeLocation.address)}&destination=${encodeURIComponent(event.address)}`);
              const distData = await res.json();
              if (distData.miles != null) reInviteWorkerMiles = distData.miles;
            } catch (_) {}
          }
        }
        const reInvitePay = calcEstimatedPay(inv.position_key, event.id, worker, reInviteWorkerMiles);
        const reInvitePayHtml = reInvitePay
          ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:10px 14px;margin:10px 0"><p style="margin:0 0 2px;font-size:13px;color:#166534;font-weight:bold">💰 Estimated Pay: $${reInvitePay.total}</p><p style="margin:0;font-size:12px;color:#4b5563">${reInvitePay.breakdown}</p></div>`
          : '';

        const riTimeStr = event.time
          ? (event.end_time ? `${fmtTime(event.time)} - ${fmtTime(event.end_time)}` : fmtTime(event.time))
          : '';
        const riPositionLabel = getPositionLabel(inv.position_key) || inv.position_key;

        const riRows = [
          ['📅', fmtDate(event.date)],
          ['🎴', riPositionLabel],
          event.venue ? ['📍', event.venue + (event.room ? `, ${event.room}` : '')] : null,
          event.address ? ['🗺', event.address] : null,
          riTimeStr ? ['🕐', riTimeStr] : null,
          event.dress_code ? ['👔', event.dress_code] : null,
          event.parking ? ['🅿', event.parking] : null,
        ].filter(Boolean).map(([icon, val]) =>
          `<tr><td style="padding:4px 8px 4px 0;color:#6b7280;font-size:13px;white-space:nowrap">${icon}</td><td style="padding:4px 0;color:#111;font-size:13px">${escapeHtml(val)}</td></tr>`
        ).join('');
        const riDetailsHtml = riRows
          ? `<table style="border-collapse:collapse;width:100%;margin:12px 0">${riRows}</table>`
          : '';

        const riBody = `
<p style="font-size:15px;color:#111;margin:0 0 4px">Hi ${escapeHtml(worker.name)},</p>
<p style="color:#374151;margin:0 0 16px">Re-invited to work <strong>${escapeHtml(event.name)}</strong> as <strong>${escapeHtml(riPositionLabel)}</strong>.</p>
<div style="text-align:center;margin:16px 0">
  <a href="${acceptUrl}" style="display:inline-block;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;margin:0 4px;background:#16a34a;color:#fff">✅ Accept</a>
  <a href="${declineUrl}" style="display:inline-block;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;margin:0 4px;background:#dc2626;color:#fff">✕ Decline</a>
</div>
<p style="color:#6b7280;font-size:12px;text-align:center;margin:0 0 16px">⏰ Respond by <strong>${expiresStr}</strong></p>
${riDetailsHtml}
${reInvitePayHtml}
<p style="color:#9ca3af;font-size:11px;text-align:center;margin:12px 0 0">Or <a href="https://gigstaffpro.vercel.app" style="color:#7c0a02">log in to the staff portal</a> to respond.<br><strong style="color:#7c0a02">Vegas on Wheels</strong></p>`;

        const html = renderEmailShell({ subtitle: "You've been invited — please respond", bodyHtml: riBody });
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;

        if (sessionError || !accessToken) {
          await onSessionExpired();
          return;
        }

        const emailRes = await fetch('/api/send-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ to: worker.email, subject: `Re-invite: ${event.name}`, html })
        });

        if (emailRes.status === 401) {
          await onSessionExpired();
          return;
        }

        if (emailRes.status === 429) {
          notify('The sending limit was reached. Wait a few minutes and try again.');
          return;
        }

        if (!emailRes.ok) {
          notify('Failed to send re-invite email. Please try again.');
          return;
        }
      }

      await loadInvitations();
    } catch (err) { notify('Error re-inviting worker: ' + err.message); }
    finally { setReInviting(null); }
  };

  const handleNudge = async (inv) => {
    setNudging(inv.id);
    try {
      const worker = workers.find(w => w.id === inv.worker_id);
      if (!worker?.email) { notify('Worker has no email address.'); return; }

      const positionLabel = getPositionLabel(inv.position_key) || inv.position_key;
      const expiresAt = new Date(inv.expires_at);
      const expiresStr = expiresAt.toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
      });
      const acceptUrl = `https://gigstaffpro.vercel.app/api/invite-respond?token=${inv.token}&action=accepted`;
      const declineUrl = `https://gigstaffpro.vercel.app/api/invite-respond?token=${inv.token}&action=declined`;

      const nudgeBody = `
<p style="font-size:15px;color:#111;margin:0 0 4px">Hi ${escapeHtml(worker.name)},</p>
<p style="color:#374151;margin:0 0 16px">You haven't responded to your invite for <strong>${escapeHtml(event.name)}</strong> as <strong>${escapeHtml(positionLabel)}</strong>. Please respond before your window closes.</p>
<div style="text-align:center;margin:0 0 16px">
  <a href="${acceptUrl}" style="display:inline-block;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;margin:0 4px;background:#16a34a;color:#fff">✅ Accept</a>
  <a href="${declineUrl}" style="display:inline-block;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;margin:0 4px;background:#dc2626;color:#fff">✕ Decline</a>
</div>
<p style="color:#6b7280;font-size:12px;text-align:center;margin:0 0 8px">⏰ Respond by <strong>${expiresStr}</strong></p>
<hr style="border:none;border-top:1px solid #f3f4f6;margin:12px 0 10px">
<p style="color:#9ca3af;font-size:11px;text-align:center;margin:12px 0 0">Or <a href="https://gigstaffpro.vercel.app" style="color:#7c0a02">log in to the staff portal</a><br><strong style="color:#7c0a02">Vegas on Wheels</strong></p>`;

      const html = renderEmailShell({ subtitle: '⏰ Reminder — please respond', bodyHtml: nudgeBody });

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (sessionError || !token) {
        await onSessionExpired();
        return;
      }

      const emailRes = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to: worker.email,
          subject: `⏰ Reminder: Please respond to your ${event.name} invite`,
          html
        })
      });

      if (emailRes.status === 401) {
        await onSessionExpired();
        return;
      }

      if (emailRes.status === 429) {
        notify('The sending limit was reached. Wait a few minutes and try again.');
        return;
      }

      if (emailRes.ok) {
        // Stamp reminder_sent_at so auto-cron won't double-send
        await supabase
          .from('invitations')
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq('id', inv.id);
        await loadInvitations();
      } else {
        notify('Failed to send reminder. Please try again.');
      }
    } catch (err) {
      notify('Error sending reminder: ' + err.message);
    } finally {
      setNudging(null);
    }
  };

  const handleConfirmWorker = async (invitation) => {
    // Conflict check: does this worker already hold a filled assignment for
    // another event on this same date whose time overlaps this event?
    if (event?.date && event?.time) {
      const parseTime = (t) => {
        if (!t) return null;
        const [h, m] = t.split(':').map(Number);
        return h * 60 + (m || 0);
      };
      const thisStart = parseTime(event.time);
      const thisEnd = parseTime(event.end_time) ?? (thisStart + 8 * 60);

      const conflictAssignment = (assignments || []).find(a => {
        if (a.worker_id !== invitation.worker_id) return false;
        if (a.event_id === event.id) return false;
        if (!isAssignmentFilled(a.status)) return false;
        const otherEvent = (events || []).find(e => e.id === a.event_id);
        if (!otherEvent || otherEvent.date !== event.date) return false;
        const otherStart = parseTime(otherEvent.time);
        const otherEnd = parseTime(otherEvent.end_time) ?? (otherStart + 8 * 60);
        if (otherStart == null) return false;
        return thisStart < otherEnd && thisEnd > otherStart;
      });

      if (conflictAssignment) {
        const conflictEvent = (events || []).find(e => e.id === conflictAssignment.event_id);
        const proceed = await confirm(
          `⚠️ TIME CONFLICT!\n\n${getWorkerName(invitation.worker_id)} is already confirmed for:\n"${conflictEvent?.name}"\n\n` +
          `This conflicts with:\n"${event.name}"\n\n` +
          `Remove them from "${conflictEvent?.name}" and confirm here instead?`
        );
        if (!proceed) return;
        await supabase.from('assignments').delete().eq('id', conflictAssignment.id);
      }
    }

    setConfirming(invitation.id);
    try {
      await supabase.from('assignments').insert({ event_id: event.id, worker_id: invitation.worker_id, position: invitation.position_key, status: 'confirmed' });
      await supabase.from('invitations').update({ status: 'confirmed', responded_at: new Date().toISOString() }).eq('id', invitation.id);
      const otherAccepted = acceptedInvites.filter(i => i.id !== invitation.id);
      if (otherAccepted.length > 0) await supabase.from('invitations').update({ status: 'standby' }).in('id', otherAccepted.map(i => i.id));
      await loadInvitations();
      if (onReloadAssignments) onReloadAssignments();
    } catch (err) { notify('Error confirming worker: ' + err.message); }
    finally { setConfirming(null); }
  };

  const handleExpireAndCascade = async (rank) => {
    const toExpire = positionInvites.filter(i => i.status === 'pending' && i.rank_tier === rank);
    if (toExpire.length > 0) await supabase.from('invitations').update({ status: 'expired' }).in('id', toExpire.map(i => i.id));
    await loadInvitations();
    setSelectedRank(Math.min(5, rank + 1));
    setActiveTab('invite');
  };

  const getWorkerName = (id) => workers.find(w => w.id === id)?.name || 'Unknown';
  const getWorkerRank = (id) => workers.find(w => w.id === id)?.rank || 1;
  const getWorkerReliability = (id) => workers.find(w => w.id === id)?.reliability ?? 5.0;
  const isExpired = (inv) => inv.expires_at && new Date(inv.expires_at) < new Date();

  const formatExpiry = (inv) => {
    if (!inv.expires_at) return null;
    const exp = new Date(inv.expires_at);
    const now = new Date();
    if (exp < now) return 'Expired';
    const mins = Math.round((exp - now) / 60000);
    if (mins < 60) return `${mins}m left`;
    return `${Math.round(mins / 60)}h left`;
  };

  const formatLastRefreshed = () => {
    if (!lastRefreshed) return 'Loading...';
    if (secondsSinceRefresh < 10) return 'Updated just now · auto-refreshes every 60s';
    const m = Math.floor(secondsSinceRefresh / 60);
    const s = secondsSinceRefresh % 60;
    return `Updated ${m > 0 ? m + 'm ' : ''}${s}s ago · auto-refreshes every 60s`;
  };

  const totalAccepted = positionInvites.filter(i => i.status === 'accepted').length;
  const totalPending = positionInvites.filter(i => i.status === 'pending').length;
  const hasExpiredPending = pendingInvites.some(i => isExpired(i));
  const expiredRank = hasExpiredPending ? pendingInvites[0]?.rank_tier : null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col relative">

        <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Invite Workers</h2>
            <p className="text-sm text-gray-500">{event.name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X size={20} /></button>
        </div>

        <div className="px-6 py-3 border-b bg-gray-50 flex-shrink-0">
          <div className="flex flex-wrap gap-2">
            {[...positions]
              .map(pos => {
                const filled = (assignments || []).filter(a => a.event_id === event.id && a.position === pos.key && isAssignmentFilled(a.status)).length;
                const open = pos.count - filled;
                return { ...pos, filled, open };
              })
              .sort((a, b) => {
                if (b.open !== a.open) return b.open - a.open; // most open first
                return getPositionLabel(a.key).localeCompare(getPositionLabel(b.key)); // alpha tiebreaker
              })
              .map(pos => {
              const isFull = pos.open <= 0;
              const hasAccepted = invitations.filter(i => i.position_key === pos.key && i.status === 'accepted').length > 0;
              return (
                <button key={pos.key} onClick={() => setSelectedPosition(pos.key)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center space-x-1.5 ${selectedPosition === pos.key ? 'bg-red-900 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                  <span>{getPositionLabel(pos.key)}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${selectedPosition === pos.key ? 'bg-red-700 text-white' : isFull ? 'bg-green-100 text-green-700' : hasAccepted ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                    {isFull ? '✓ Full' : `${pos.open} open`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {!selectedPosition ? (
          <div className="flex-1 flex items-center justify-center p-10">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <Send size={22} className="text-gray-400" />
              </div>
              <p className="text-gray-500 font-medium">Select a position above to get started</p>
              <p className="text-xs text-gray-400 mt-1">Choose which role you want to invite workers for</p>
            </div>
          </div>
        ) : (
          <>
            <div className="px-6 py-2 border-b flex items-center justify-between flex-shrink-0">
              <div className="flex items-center space-x-4 text-sm">
                {openSlots <= 0 ? (
                  <span className="flex items-center space-x-1.5 text-green-700 font-medium">
                    <CheckCircle size={15} />
                    <span>This position is fully staffed ({filledSlots}/{totalSlots})</span>
                  </span>
                ) : (
                  <span className="text-gray-600">
                    <span className="font-bold text-gray-900">{openSlots}</span> open slot{openSlots !== 1 ? 's' : ''} · {filledSlots}/{totalSlots} filled for {getPositionLabel(selectedPosition)}
                  </span>
                )}
                {acceptedInvites.length > 0 && (
                  <span className="flex items-center space-x-1 text-green-700 font-medium"><CheckCircle size={14} /><span>{acceptedInvites.length} accepted</span></span>
                )}
                {pendingInvites.length > 0 && (
                  <span className="flex items-center space-x-1 text-yellow-700 font-medium"><Clock size={14} /><span>{pendingInvites.length} pending</span></span>
                )}
              </div>
              <button onClick={loadInvitations} className="p-1 hover:bg-gray-100 rounded text-gray-400">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="px-6 pt-3 flex space-x-1 flex-shrink-0">
              <button onClick={() => setActiveTab('invite')}
                className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${activeTab === 'invite' ? 'bg-white border border-b-white border-gray-200 text-red-900 -mb-px z-10' : 'text-gray-500 hover:text-gray-700'}`}>
                Send Invites
              </button>
              <button onClick={() => setActiveTab('responses')}
                className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors flex items-center space-x-1.5 ${activeTab === 'responses' ? 'bg-white border border-b-white border-gray-200 text-red-900 -mb-px z-10' : 'text-gray-500 hover:text-gray-700'}`}>
                <span>Responses</span>
                {(totalAccepted + totalPending) > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${totalAccepted > 0 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {totalAccepted > 0 ? `${totalAccepted} accepted` : `${totalPending} pending`}
                  </span>
                )}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto border-t border-gray-200">

              {activeTab === 'invite' && (
                <div className="p-6 space-y-4">
                  <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                    <Clock size={16} className="text-gray-400 flex-shrink-0" />
                    <span className="text-sm text-gray-600 flex-shrink-0">Response window:</span>
                    <select value={windowHours} onChange={e => setWindowHours(Number(e.target.value))}
                      className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-red-500">
                      <option value={0.5}>30 minutes</option>
                      <option value={1}>1 hour</option>
                      <option value={2}>2 hours</option>
                      <option value={4}>4 hours</option>
                      <option value={8}>8 hours</option>
                      <option value={24}>24 hours</option>
                    </select>
                    <span className="text-xs text-gray-400 hidden sm:inline">Workers have this long to respond</span>
                  </div>

                  <div className="flex items-center space-x-2 flex-wrap gap-y-2">
                    <span className="text-sm font-medium text-gray-700 flex-shrink-0">Invite Rank:</span>
                    <div className="flex items-center space-x-2">
                      {[1,2,3,4,5].map(r => (
                        <button key={r} onClick={() => setSelectedRank(r)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors flex-shrink-0 ${selectedRank === r ? 'bg-red-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                          R{r}{workersByRank[r]?.length > 0 && <span className="ml-1 text-xs opacity-75">({workersByRank[r].length})</span>}
                        </button>
                      ))}
                    </div>
                  </div>

                  {[1,2,3,4,5].filter(r => r === selectedRank).map(rank => {
                    const rankWorkers = workersByRank[rank] || [];
                    const allSelected = rankWorkers.length > 0 && rankWorkers.every(w => selectedWorkers.has(w.id));
                    return (
                      <div key={rank} className="border rounded-lg overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b gap-2">
                          <div className="flex items-center space-x-2 min-w-0">
                            <span className="font-semibold text-gray-800 text-sm">Rank {rank} Workers</span>
                            <span className="text-xs text-gray-500 flex-shrink-0">({rankWorkers.length} eligible)</span>
                          </div>
                          {rankWorkers.length > 0 && (
                            <div className="flex items-center space-x-2 flex-shrink-0">
                              <button onClick={() => selectAllRank(rank)} className="text-xs text-gray-500 hover:text-gray-700 font-medium hidden sm:inline">
                                {allSelected ? 'Deselect all' : 'Select all'}
                              </button>
                              <button onClick={() => handleInviteAllRank(rank)} disabled={sending}
                                className="text-xs bg-red-900 hover:bg-red-800 text-white px-2.5 py-1 rounded-lg font-medium disabled:opacity-50 transition-colors whitespace-nowrap">
                                {sending ? 'Sending...' : `Invite All R${rank}`}
                              </button>
                            </div>
                          )}
                        </div>
                        {rankWorkers.length === 0 ? (
                          <div className="px-4 py-6 text-center text-gray-400 text-sm">No eligible Rank {rank} workers for this position</div>
                        ) : (
                          <div className="divide-y">
                            {rankWorkers.map(worker => {
                              const isSelected = selectedWorkers.has(worker.id);
                              const reliability = worker.reliability ?? 5.0;
                              const reliabilityColor = reliability >= RELIABILITY_THRESHOLDS.EXCELLENT ? 'text-green-700' : reliability >= RELIABILITY_THRESHOLDS.GOOD ? 'text-yellow-600' : 'text-red-600';
                              return (
                                <div key={worker.id} onClick={() => toggleWorker(worker.id)}
                                  className={`flex items-center space-x-3 px-4 py-3 cursor-pointer transition-colors ${isSelected ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                                  <div className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${isSelected ? 'bg-red-900 border-red-900' : 'border-gray-300'}`}>
                                    {isSelected && <CheckCircle size={12} className="text-white" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center space-x-2 flex-wrap gap-y-0.5">
                                      <span className="font-medium text-gray-900 text-sm">{worker.name}</span>
                                      {worker.is_host === true && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700">
                                          <Shield size={9} className="mr-0.5" />{getHostLabel()}
                                        </span>
                                      )}
                                      {(() => {
                                        const conflicts = getWorkerConflicts(worker.id);
                                        if (conflicts.length === 0) return null;
                                        return (
                                          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700 font-medium" title={`Also booked: ${conflicts.map(e => e.name).join(', ')}`}>
                                            <AlertCircle size={9} />
                                            <span>Conflict: {conflicts[0].name}{conflicts.length > 1 ? ` +${conflicts.length - 1}` : ''}</span>
                                          </span>
                                        );
                                      })()}
                                    </div>
                                    {worker.total_gigs > 0 && (
                                      <p className="text-xs text-gray-400 mt-0.5">{worker.total_gigs} gig{worker.total_gigs !== 1 ? 's' : ''}</p>
                                    )}
                                  </div>
                                  <span className={`flex items-center space-x-0.5 text-xs font-medium flex-shrink-0 ${reliabilityColor}`}>
                                    <Star size={11} className="fill-current" />
                                    <span>{reliability.toFixed(1)}</span>
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {invitedWorkerIds.size > 0 && (
                    <div className="text-xs text-gray-400 flex items-center space-x-1">
                      <AlertCircle size={12} />
                      <span>{invitedWorkerIds.size} worker{invitedWorkerIds.size !== 1 ? 's' : ''} already invited (hidden from list)</span>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'responses' && (
                <div className="p-6 space-y-5">
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span className="flex items-center space-x-1">
                      <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
                      <span>{loading ? 'Refreshing...' : formatLastRefreshed()}</span>
                    </span>
                    <button onClick={loadInvitations} className="hover:text-gray-600 underline">Refresh now</button>
                  </div>

                  {hasExpiredPending && expiredRank < 5 && (
                    <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-300 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <AlertCircle size={16} className="text-orange-500 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-bold text-orange-800">Rank {expiredRank} window has closed</p>
                          <p className="text-xs text-orange-600">{pendingInvites.filter(i => isExpired(i)).length} worker{pendingInvites.filter(i => isExpired(i)).length !== 1 ? 's' : ''} didn't respond — ready to notify Rank {expiredRank + 1}</p>
                        </div>
                      </div>
                      <button onClick={() => handleExpireAndCascade(expiredRank)}
                        className="flex-shrink-0 ml-3 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition-colors">
                        Notify Rank {expiredRank + 1} →
                      </button>
                    </div>
                  )}

                  {acceptedInvites.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-green-800 mb-2 flex items-center space-x-1.5">
                        <CheckCircle size={15} className="text-green-600" />
                        <span>Accepted — Confirm to Assign ({acceptedInvites.length})</span>
                      </h4>
                      <div className="space-y-2">
                        {acceptedInvites.map(inv => (
                          <div key={inv.id} className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                            <div>
                              <p className="font-semibold text-gray-900 text-sm">{getWorkerName(inv.worker_id)}</p>
                              <p className="text-xs text-gray-500">Rank {getWorkerRank(inv.worker_id)} · ⭐ {getWorkerReliability(inv.worker_id).toFixed(1)} · Accepted {inv.responded_at ? new Date(inv.responded_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</p>
                            </div>
                            <button onClick={() => handleConfirmWorker(inv)} disabled={confirming === inv.id}
                              className="flex items-center space-x-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                              <UserCheck size={14} />
                              <span>{confirming === inv.id ? 'Confirming...' : 'Confirm'}</span>
                            </button>
                          </div>
                        ))}
                      </div>
                      {openSlots <= 0 && (
                        <p className="text-xs text-orange-600 mt-1 flex items-center space-x-1">
                          <AlertCircle size={12} /><span>All slots filled — confirming will move others to standby</span>
                        </p>
                      )}
                    </div>
                  )}

                      {pendingInvites.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-yellow-800 mb-2 flex items-center space-x-1.5">
                        <Clock size={15} className="text-yellow-600" />
                        <span>Pending Response ({pendingInvites.length})</span>
                      </h4>
                      <div className="space-y-2">
                        {pendingInvites.map(inv => (
                          <div key={inv.id} className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <div>
                              <p className="font-semibold text-gray-900 text-sm">{getWorkerName(inv.worker_id)}</p>
                              <p className="text-xs text-gray-500">
                                Rank {inv.rank_tier} · Invited {new Date(inv.invited_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                              </p>
                              {inv.reminder_sent_at && (
                                <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                                  <Bell size={10} />
                                  Reminded {new Date(inv.reminder_sent_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              <span className={`text-xs font-medium px-2 py-1 rounded-full ${isExpired(inv) ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                {formatExpiry(inv)}
                              </span>
                              {!isExpired(inv) && (
                                <button
                                  onClick={() => handleNudge(inv)}
                                  disabled={nudging === inv.id}
                                  className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50 transition-colors"
                                  title="Send reminder email"
                                >
                                  <Bell size={11} />
                                  {nudging === inv.id ? 'Sending...' : 'Nudge'}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {confirmedInvites.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-700 mb-2 flex items-center space-x-1.5">
                        <UserCheck size={15} className="text-gray-500" /><span>Confirmed ({confirmedInvites.length})</span>
                      </h4>
                      <div className="space-y-2">
                        {confirmedInvites.map(inv => (
                          <div key={inv.id} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
                            <p className="font-medium text-gray-700 text-sm">{getWorkerName(inv.worker_id)}</p>
                            <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">Assigned</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {standbyInvites.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-blue-700 mb-2 flex items-center space-x-1.5">
                        <Users size={15} className="text-blue-500" /><span>Standby ({standbyInvites.length})</span>
                      </h4>
                      <div className="space-y-2">
                        {standbyInvites.map(inv => (
                          <div key={inv.id} className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <div>
                              <p className="font-medium text-gray-800 text-sm">{getWorkerName(inv.worker_id)}</p>
                              <p className="text-xs text-gray-500">Accepted — moved to standby when slot filled</p>
                            </div>
                            <button onClick={() => handleConfirmWorker(inv)} disabled={confirming === inv.id} className="text-xs text-blue-700 hover:underline font-medium">Promote</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {declinedInvites.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-red-700 mb-2 flex items-center space-x-1.5">
                        <XCircle size={15} className="text-red-500" /><span>Declined ({declinedInvites.length})</span>
                      </h4>
                      <div className="space-y-1">
                        {declinedInvites.map(inv => (
                          <div key={inv.id} className="flex items-center justify-between px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
                            <div>
                              <p className="text-sm text-gray-700 font-medium">{getWorkerName(inv.worker_id)}</p>
                              <p className="text-xs text-gray-400">Rank {inv.rank_tier} · Declined {inv.responded_at ? new Date(inv.responded_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</p>
                            </div>
                            <button
                              onClick={() => handleReInvite(inv)}
                              disabled={reInviting === inv.id}
                              className="text-xs text-red-700 hover:bg-red-100 border border-red-200 px-2 py-1 rounded-lg font-medium disabled:opacity-50 transition-colors flex items-center space-x-1"
                            >
                              <Send size={10} />
                              <span>{reInviting === inv.id ? 'Sending...' : 'Re-invite'}</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {positionInvites.length === 0 && (
                    <div className="text-center py-12">
                      <Send size={36} className="mx-auto text-gray-200 mb-3" />
                      <p className="text-gray-400 text-sm">No invites sent yet for this position</p>
                      <button onClick={() => setActiveTab('invite')} className="mt-2 text-xs text-red-600 hover:underline font-medium">Send invites →</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm font-medium">Close</button>
          {activeTab === 'invite' && selectedPosition && (
            openSlots <= 0 ? (
              <span className="flex items-center space-x-2 text-sm text-green-700 font-medium">
                <CheckCircle size={15} /><span>Position fully staffed — no invites needed</span>
              </span>
            ) : (
              <button onClick={handleSendInvites} disabled={selectedWorkers.size === 0 || sending}
                className="flex items-center space-x-2 px-5 py-2 bg-red-900 hover:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors">
                <Send size={15} />
                <span>{sending ? 'Sending...' : selectedWorkers.size === 0 ? 'Select workers above' : `Send (${selectedWorkers.size}) Invite${selectedWorkers.size !== 1 ? 's' : ''}`}</span>
              </button>
            )
          )}
        </div>

        {/* Confirmation dialog */}
        {confirmSend && (
          <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center rounded-xl z-10">
            <div className="bg-white rounded-xl shadow-2xl p-6 mx-6 w-full max-w-sm">
              <h3 className="text-base font-bold text-gray-900 mb-1">Confirm Invites</h3>
              <p className="text-sm text-gray-500 mb-4">
                You're about to send invites to <span className="font-semibold text-gray-800">{confirmSend.workerIds.length} Rank {confirmSend.rank} worker{confirmSend.workerIds.length !== 1 ? 's' : ''}</span> for <span className="font-semibold text-gray-800">{getPositionLabel(selectedPosition)}</span> with a <span className="font-semibold text-gray-800">{windowHours < 1 ? '30 minute' : windowHours === 1 ? '1 hour' : `${windowHours} hour`}</span> response window.
              </p>
              <div className="bg-gray-50 rounded-lg px-4 py-3 mb-4 space-y-1">
                {confirmSend.workerIds.slice(0, 5).map(id => (
                  <p key={id} className="text-sm text-gray-700">• {getWorkerName(id)}</p>
                ))}
                {confirmSend.workerIds.length > 5 && (
                  <p className="text-sm text-gray-400">...and {confirmSend.workerIds.length - 5} more</p>
                )}
              </div>
              <div className="flex space-x-3">
                <button onClick={() => setConfirmSend(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={handleConfirmSend} disabled={sending}
                  className="flex-1 px-4 py-2 bg-red-900 hover:bg-red-800 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center space-x-1.5">
                  <Send size={14} />
                  <span>{sending ? 'Sending...' : 'Send Invites'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
