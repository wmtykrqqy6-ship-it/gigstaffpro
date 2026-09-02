import React, { useState } from 'react';
import { Clock, CheckCircle, FileText, XCircle } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { getPositionLabel, getPositionKey, isAssignmentFilled } from '../../utils/positionHelpers';
import { parseDateSafe, formatTime } from '../../utils/dateHelpers';
import { RELIABILITY_THRESHOLDS } from '../../utils/reliabilityHelpers';
import { useConfirm } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';

// Find the position definition on an event that corresponds to an application's position value
const findPositionDef = (event, position) => {
  if (!event?.positions) return null;
  return event.positions.find(p => {
    const pKey = p.key || p.name;
    return pKey === position ||
           p.name === position ||
           p.key === position ||
           getPositionKey(p.name || p.key) === getPositionKey(position) ||
           getPositionLabel(p.key) === position ||
           getPositionLabel(p.name) === position;
  }) || null;
};

// Count assignments currently occupying a position's slots for an event
const countFilledForPosition = (assignmentsList, eventId, positionDef, position, excludeId = null) => {
  return assignmentsList.filter(a => {
    if (a.event_id !== eventId) return false;
    if (excludeId && a.id === excludeId) return false;
    if (!isAssignmentFilled(a.status)) return false;
    return a.position === position ||
           a.position === positionDef.key ||
           a.position === positionDef.name ||
           getPositionKey(a.position) === getPositionKey(position) ||
           getPositionLabel(a.position) === getPositionLabel(position);
  }).length;
};

export default function ApplicationsView({
  assignments,
  workers,
  events,
  timeFormat,
  onReloadAssignments,
  onSessionExpired
}) {
  const [filter, setFilter] = useState('pending'); // 'all', 'pending', 'approved', 'rejected'
  const [searchTerm, setSearchTerm] = useState('');
  const [processingId, setProcessingId] = useState(null);
  const confirm = useConfirm();
  const notify = useToast();

  // Send confirmation email with calendar link when a worker is approved
  const sendConfirmationEmail = async (app) => {
    try {
      const worker = workers.find(w => w.id === app.worker_id);
      const event = events.find(e => e.id === app.event_id);
      if (!worker?.email || !event) return;

      const positionLabel = getPositionLabel(app.position) || app.position;
      const calUrl = `https://gigstaffpro.vercel.app/api/calendar-event?event_id=${event.id}&position=${encodeURIComponent(positionLabel)}`;

      const fmtDate = (d) => {
        if (!d) return '';
        const [y, m, day] = d.split('-').map(Number);
        return new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      };
      const fmtT = (t) => {
        if (!t) return '';
        const [h, m] = t.split(':').map(Number);
        return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
      };
      const timeStr = event.time
        ? (event.end_time ? `${fmtT(event.time)} – ${fmtT(event.end_time)}` : fmtT(event.time))
        : '';

      const rows = [
        ['📅', 'Date',      fmtDate(event.date)],
        ['🎴', 'Position',  positionLabel],
        event.venue      ? ['📍', 'Venue',      event.venue]      : null,
        event.address    ? ['🗺', 'Address',    event.address]    : null,
        timeStr          ? ['🕐', 'Time',       timeStr]          : null,
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
.cal{display:inline-block;background:#f8f9fa;border:1px solid #dadce0;color:#374151;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500}
.ft{color:#9ca3af;font-size:11px;text-align:center;margin:12px 0 0}
</style></head><body><div class="w">
<div class="h"><h1>🎰 Vegas on Wheels</h1><p>Booking Confirmed</p></div>
<div class="b">
<div style="text-align:center;margin:0 0 16px"><div style="font-size:44px">🎉</div>
<h2 style="margin:6px 0 2px;color:#111">You're confirmed!</h2>
<p style="color:#6b7280;margin:0">Booked for <strong>${event.name}</strong></p></div>
<table style="border-collapse:collapse;width:100%;margin:0 0 14px">${rows}</table>
<div style="text-align:center;margin:14px 0"><a href="${calUrl}" class="cal">📅 Add to Calendar</a></div>
<hr style="border:none;border-top:1px solid #f3f4f6;margin:14px 0 10px">
<p class="ft">View your schedule in the <a href="https://gigstaffpro.vercel.app" style="color:#7c0a02">staff portal</a><br><strong style="color:#7c0a02">Vegas on Wheels</strong></p>
</div></div></body></html>`;

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (sessionError || !token) {
        await onSessionExpired();
        return;
      }

      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ to: worker.email, subject: `✅ Confirmed: ${event.name}`, html })
      });

      if (res.status === 401) {
        await onSessionExpired();
        return;
      }
    } catch (_) {
      // Non-critical — approval already saved
    }
  };

  // Helper: check if a position is full for a given app
  const isPositionFull = (app) => {
    const event = events.find(e => e.id === app.event_id);
    const positionDef = findPositionDef(event, app.position);
    if (!positionDef) return false;
    const maxCount = positionDef.count || 1;
    const currentApproved = countFilledForPosition(assignments, app.event_id, positionDef, app.position, app.id);
    return currentApproved >= maxCount;
  };

  const handleApproveToStandby = async (applicationId) => {
    if (!(await confirm('Position is full — add this applicant to the standby list?'))) return;
    setProcessingId(applicationId);
    try {
      const { error } = await supabase
        .from('assignments')
        .update({ status: 'standby' })
        .eq('id', applicationId);
      if (error) throw error;
      onReloadAssignments();
    } catch (error) {
      notify('Error adding to standby: ' + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  // Get all applications with worker and event details
  const applications = assignments
    .map(assignment => {
      const worker = workers.find(w => w.id === assignment.worker_id);
      const event = events.find(e => e.id === assignment.event_id);
      return { ...assignment, worker, event };
    })
    .filter(app => app.worker && app.event) // Only include valid applications
    .sort((a, b) => new Date(b.applied_at || b.created_at) - new Date(a.applied_at || a.created_at)); // Newest first

  // Apply filters
  const filteredApplications = applications.filter(app => {
    // Status filter
    if (filter === 'pending' && app.status !== 'pending') return false;
    if (filter === 'approved' && app.status !== 'approved') return false;
    if (filter === 'rejected' && app.status !== 'rejected') return false;
    if (filter === 'standby' && app.status !== 'standby') return false;

    // Hide past events from pending and standby views
    if (filter === 'pending' || filter === 'standby') {
      const [ey, em, ed] = (app.event?.date || '').split('-').map(Number);
      if (ey) {
        const eventDate = new Date(ey, em - 1, ed);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (eventDate < today) return false;
      }
    }
    
    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const matchesWorker = app.worker.name.toLowerCase().includes(search);
      const matchesEvent = app.event.name.toLowerCase().includes(search);
      const matchesPosition = (app.position || '').toLowerCase().includes(search);
      if (!matchesWorker && !matchesEvent && !matchesPosition) return false;
    }
    
    return true;
  });

  const handleApprove = async (applicationId) => {
    const app = applications.find(a => a.id === applicationId);
    if (!app) return;

    // Capacity check — applies to standby promotions too. countFilledForPosition
    // already excludes this applicant's own row and only counts truly-filled
    // (approved) slots, so a standby promotion is checked against every OTHER
    // already-approved worker exactly like a pending approval is. Without this,
    // "Approve to Event" on a standby applicant could overstaff a position that
    // filled up through another path (AssignWorkersModal, auto-promotion,
    // another admin approving first) in the time since they joined standby.
    const event = events.find(e => e.id === app.event_id);
    if (event && event.positions && Array.isArray(event.positions)) {
      const positionDef = findPositionDef(event, app.position);

      if (positionDef) {
        const maxCount = positionDef.count || 1;
        const currentApproved = countFilledForPosition(assignments, app.event_id, positionDef, app.position, applicationId);

        if (currentApproved >= maxCount) {
          notify('This position filled up since this applicant joined the list — refresh and check standby.');
          return;
        }
      }
    }

    if (!(await confirm('Approve this application?'))) return;
    
    setProcessingId(applicationId);
    try {
      const { error } = await supabase
        .from('assignments')
        .update({ status: 'approved' })
        .eq('id', applicationId);
      
      if (error) throw error;
      
      // ✅ AUTO-CONVERT: Check if position is now full, convert pending to standby
      const event = events.find(e => e.id === app.event_id);
      if (event && event.positions) {
        const positionDef = findPositionDef(event, app.position);

        if (positionDef) {
          const maxCount = positionDef.count || 1;

          // Fetch FRESH assignments data (we just updated one!)
          const { data: freshAssignments } = await supabase
            .from('assignments')
            .select('*')
            .eq('event_id', app.event_id);

          // Count currently filled slots (includes this app's own now-'approved' row)
          const currentApproved = countFilledForPosition(freshAssignments || [], app.event_id, positionDef, app.position);

          // If position is now full, convert all pending applications to standby
          if (currentApproved >= maxCount) {
            const pendingApps = (freshAssignments || []).filter(a => {
              if (a.status !== 'pending') return false;
              return a.position === app.position ||
                     a.position === positionDef.key ||
                     a.position === positionDef.name ||
                     getPositionKey(a.position) === getPositionKey(app.position);
            });
            
            if (pendingApps.length > 0) {
              // Convert all pending to standby
              const { error: standbyError } = await supabase
                .from('assignments')
                .update({ status: 'standby' })
                .in('id', pendingApps.map(a => a.id));
              
              if (standbyError) {
                console.error('Error converting to standby:', standbyError);
              }
            }
          }
        }
      }
      
      onReloadAssignments();
      await sendConfirmationEmail(app);
    } catch (error) {
      notify('Error approving application: ' + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleBulkApprove = async () => {
    const pendingApps = filteredApplications.filter(app => app.status === 'pending');
    
    if (pendingApps.length === 0) {
      notify('No pending applications to approve.');
      return;
    }

    // ✅ Check each application for position capacity before bulk approving
    const overfilledApps = [];
    const approvableApps = [];

    for (const app of pendingApps) {
      const event = events.find(e => e.id === app.event_id);
      if (!event) { approvableApps.push(app); continue; }

      // Same normalized position matching as handleApprove's capacity check
      // (findPositionDef/countFilledForPosition) — this loop used to do its
      // own raw string-equality matching, which could disagree with
      // handleApprove about when a position is full and let bulk-approve
      // overstaff a position single-approve would have correctly blocked.
      const positionDef = findPositionDef(event, app.position);
      if (!positionDef) { approvableApps.push(app); continue; }

      const maxCount = positionDef.count || 1;
      const currentFilled = countFilledForPosition(assignments, app.event_id, positionDef, app.position);
      // + any we've already staged for approval earlier in this same batch
      const pendingApprovalCount = approvableApps.filter(a => {
        if (a.event_id !== app.event_id) return false;
        return a.position === app.position ||
               a.position === positionDef.key ||
               a.position === positionDef.name ||
               getPositionKey(a.position) === getPositionKey(app.position) ||
               getPositionLabel(a.position) === getPositionLabel(app.position);
      }).length;

      if (currentFilled + pendingApprovalCount >= maxCount) {
        overfilledApps.push(app);
      } else {
        approvableApps.push(app);
      }
    }

    // Warn about overfilled positions
    if (overfilledApps.length > 0) {
      const names = overfilledApps.map(a => `• ${a.worker?.name} - ${a.position} @ ${a.event?.name}`).join('\n');
      const proceed = await confirm(
        `⚠️ ${overfilledApps.length} application(s) cannot be approved - position already full:\n\n${names}\n\n` +
        `Approve the remaining ${approvableApps.length} application(s)?`
      );
      if (!proceed) return;
    } else {
      if (!(await confirm(`Approve ${approvableApps.length} pending application(s)?`))) return;
    }

    if (approvableApps.length === 0) {
      notify('No applications could be approved - all positions are full.');
      return;
    }
    
    setProcessingId('bulk');
    try {
      const ids = approvableApps.map(app => app.id);
      
      const { error } = await supabase
        .from('assignments')
        .update({ status: 'approved' })
        .in('id', ids);
      
      if (error) throw error;
      
      onReloadAssignments();
      notify(`✓ ${approvableApps.length} application(s) approved!${overfilledApps.length > 0 ? `\n${overfilledApps.length} skipped (position full).` : ''}`);
    } catch (error) {
      notify('Error bulk approving: ' + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (applicationId) => {
    if (!(await confirm('Reject this application? This will remove the assignment.'))) return;
    
    setProcessingId(applicationId);
    try {
      const { error } = await supabase
        .from('assignments')
        .delete()
        .eq('id', applicationId);
      
      if (error) throw error;
      
      onReloadAssignments();
      notify('Application rejected and removed.');
    } catch (error) {
      notify('Error rejecting application: ' + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isUpcoming = (app) => {
    const [ey, em, ed] = (app.event?.date || '').split('-').map(Number);
    if (!ey) return true;
    return new Date(ey, em - 1, ed) >= today;
  };
  const pendingCount = applications.filter(a => a.status === 'pending' && isUpcoming(a)).length;
  const approvedCount = applications.filter(a => a.status === 'approved').length;
  const standbyCount = applications.filter(a => a.status === 'standby' && isUpcoming(a)).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Applications</h2>
        <p className="text-sm text-gray-600 mt-1">Review and manage worker applications</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-yellow-600 font-medium">Pending Review</p>
              <p className="text-3xl font-bold text-yellow-900 mt-1">{pendingCount}</p>
            </div>
            <Clock size={32} className="text-yellow-600" />
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 font-medium">Approved</p>
              <p className="text-3xl font-bold text-green-900 mt-1">{approvedCount}</p>
            </div>
            <CheckCircle size={32} className="text-green-600" />
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 font-medium">Total Applications</p>
              <p className="text-3xl font-bold text-blue-900 mt-1">{applications.length}</p>
            </div>
            <FileText size={32} className="text-blue-600" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Status filter */}
          <div className="flex space-x-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-red-900 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('pending')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'pending'
                  ? 'bg-yellow-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Pending ({pendingCount})
            </button>
            <button
              onClick={() => setFilter('approved')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'approved'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Approved
            </button>
            <button
              onClick={() => setFilter('standby')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'standby'
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Standby ({standbyCount})
            </button>
          </div>

          {/* Search */}
          <div className="flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by worker, event, or position..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
          
          {/* Bulk Actions */}
          {pendingCount > 0 && (
            <button
              onClick={handleBulkApprove}
              disabled={processingId === 'bulk'}
              className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium whitespace-nowrap flex items-center space-x-2"
            >
              <CheckCircle size={18} />
              <span>Approve All Pending ({pendingCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Applications List */}
      <div className="bg-white rounded-lg shadow">
        {filteredApplications.length === 0 ? (
          <div className="p-12 text-center">
            <FileText size={48} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Applications Found</h3>
            <p className="text-gray-600">
              {filter === 'pending' 
                ? 'No pending applications to review.' 
                : 'Try adjusting your filters or search terms.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredApplications.map(app => (
              <div key={app.id} className="p-4 sm:p-6 hover:bg-gray-50 transition-colors">
                {/* Application Info */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <h3 className="text-lg font-bold text-gray-900">{app.worker.name}</h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    app.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    app.status === 'approved' ? 'bg-green-100 text-green-800' :
                    app.status === 'standby' ? 'bg-orange-100 text-orange-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {app.status === 'pending' ? 'Pending Review' : 
                     app.status === 'approved' ? 'Approved' :
                     app.status === 'standby' ? 'Standby' : 'Rejected'}
                  </span>
                  {app.worker.rank <= 2 && (
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      app.worker.rank === 1 ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      Rank {app.worker.rank}
                    </span>
                  )}
                  {(app.worker.reliability ?? 0) >= RELIABILITY_THRESHOLDS.EXCELLENT && (
                    <span className="text-sm text-yellow-600">⭐ {(app.worker.reliability ?? 0).toFixed(1)}</span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm mb-4">
                  <div>
                    <p className="text-gray-500">Event</p>
                    <p className="font-medium text-gray-900">{app.event.name}</p>
                    <p className="text-xs text-gray-600">
                      {app.event.date ? parseDateSafe(app.event.date).toLocaleDateString('en-US', { 
                        weekday: 'short', month: 'short', day: 'numeric' 
                      }) : 'TBD'} • {formatTime(app.event.time, timeFormat)}
                    </p>
                  </div>

                  <div>
                    <p className="text-gray-500">Position</p>
                    <p className="font-medium text-gray-900">{getPositionLabel(app.position)}</p>
                  </div>

                  <div>
                    <p className="text-gray-500">Applied</p>
                    <p className="font-medium text-gray-900">
                      {app.applied_at 
                        ? new Date(app.applied_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                        : 'N/A'}
                    </p>
                  </div>
                </div>

                {/* Actions - always full width below info */}
                {app.status === 'pending' && (() => {
                  const full = isPositionFull(app);
                  return (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        onClick={() => full ? handleApproveToStandby(app.id) : handleApprove(app.id)}
                        disabled={processingId === app.id}
                        className={`${full ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-green-600 hover:bg-green-700'} text-white px-4 py-2 rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2 transition-colors w-full sm:w-auto`}
                      >
                        <CheckCircle size={18} />
                        <span>{full ? '+ Add to Standby' : 'Approve'}</span>
                      </button>
                      {full && (
                        <span className="self-center text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 px-2 py-1 rounded-lg">
                          Position full
                        </span>
                      )}
                      <button
                        onClick={() => handleReject(app.id)}
                        disabled={processingId === app.id}
                        className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2 transition-colors w-full sm:w-auto"
                      >
                        <XCircle size={18} />
                        <span>Reject</span>
                      </button>
                    </div>
                  );
                })()}
                {app.status === 'standby' && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={() => handleApprove(app.id)}
                      disabled={processingId === app.id}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2 transition-colors w-full sm:w-auto"
                    >
                      <CheckCircle size={18} />
                      <span>Approve to Event</span>
                    </button>
                    <button
                      onClick={() => handleReject(app.id)}
                      disabled={processingId === app.id}
                      className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2 transition-colors w-full sm:w-auto"
                    >
                      <XCircle size={18} />
                      <span>Remove</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
