import React, { useState } from 'react';
import { Clock, CheckCircle, FileText, XCircle } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { getPositionLabel, getPositionKey } from '../../utils/positionHelpers';
import { parseDateSafe, formatTime } from '../../utils/dateHelpers';

export default function ApplicationsView({
  assignments,
  workers,
  events,
  timeFormat,
  onReloadAssignments
}) {
  const [filter, setFilter] = useState('all'); // 'all', 'pending', 'approved', 'rejected'
  const [searchTerm, setSearchTerm] = useState('');
  const [processingId, setProcessingId] = useState(null);

  // Helper: check if a position is full for a given app
  const isPositionFull = (app) => {
    const event = events.find(e => e.id === app.event_id);
    if (!event?.positions) return false;
    const positionDef = event.positions.find(p =>
      p.key === app.position || p.name === app.position ||
      getPositionKey(p.name || p.key) === getPositionKey(app.position) ||
      getPositionLabel(p.key) === app.position
    );
    if (!positionDef) return false;
    const maxCount = positionDef.count || 1;
    const currentApproved = assignments.filter(a => {
      if (a.event_id !== app.event_id) return false;
      if (a.id === app.id) return false;
      if (['standby','pending','rejected','cancelled'].includes(a.status)) return false;
      return a.position === app.position ||
             a.position === positionDef.key ||
             getPositionKey(a.position) === getPositionKey(app.position);
    }).length;
    return currentApproved >= maxCount;
  };

  const handleApproveToStandby = async (applicationId) => {
    if (!confirm('Position is full — add this applicant to the standby list?')) return;
    setProcessingId(applicationId);
    try {
      const { error } = await supabase
        .from('assignments')
        .update({ status: 'standby' })
        .eq('id', applicationId);
      if (error) throw error;
      onReloadAssignments();
    } catch (error) {
      alert('Error adding to standby: ' + error.message);
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

    const isStandbyPromotion = app.status === 'standby';

    // ✅ Check if position is already full - SKIP this check for standby promotions
    // (admin is intentionally promoting someone from the standby list)
    const event = events.find(e => e.id === app.event_id);
    if (!isStandbyPromotion && event && event.positions && Array.isArray(event.positions)) {
      const positionDef = event.positions.find(p => {
        const pKey = p.key || p.name;
        return pKey === app.position ||
               p.name === app.position ||
               p.key === app.position ||
               getPositionKey(p.name || p.key) === getPositionKey(app.position) ||
               getPositionLabel(p.key) === app.position ||
               getPositionLabel(p.name) === app.position;
      });

      if (positionDef) {
        const maxCount = positionDef.count || 1;
        const currentApproved = assignments.filter(a => {
          if (a.event_id !== app.event_id) return false;
          if (a.id === applicationId) return false;
          // Exclude standby workers from count
          if (a.status === 'standby') return false;
          // Admin-assigned directly = null/undefined status. Count anything NOT pending/rejected/cancelled.
          const s = a.status;
          if (s === 'pending' || s === 'rejected' || s === 'cancelled') return false;
          return a.position === app.position ||
                 a.position === positionDef.key ||
                 a.position === positionDef.name ||
                 getPositionKey(a.position) === getPositionKey(app.position) ||
                 getPositionLabel(a.position) === getPositionLabel(app.position);
        }).length;

        console.log(`Approve check: "${app.position}" | approved: ${currentApproved} | max: ${maxCount}`);

        if (currentApproved >= maxCount) {
          // Position is full — caller should have used handleApproveToStandby instead
          return;
        }
      }
    }

    if (!confirm('Approve this application?')) return;
    
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
        const positionDef = event.positions.find(p => {
          const pKey = p.key || p.name;
          return pKey === app.position ||
                 p.name === app.position ||
                 p.key === app.position ||
                 getPositionKey(p.name || p.key) === getPositionKey(app.position);
        });
        
        if (positionDef) {
          const maxCount = positionDef.count || 1;
          
          // Fetch FRESH assignments data (we just updated one!)
          const { data: freshAssignments } = await supabase
            .from('assignments')
            .select('*')
            .eq('event_id', app.event_id);
          
          // Count currently approved workers (excluding standby)
          const currentApproved = (freshAssignments || []).filter(a => {
            if (a.status === 'standby') return false;
            const s = a.status;
            if (s === 'pending' || s === 'rejected' || s === 'cancelled') return false;
            return a.position === app.position ||
                   a.position === positionDef.key ||
                   a.position === positionDef.name ||
                   getPositionKey(a.position) === getPositionKey(app.position);
          }).length;
          
          console.log(`Position check: ${app.position} | Approved: ${currentApproved} | Max: ${maxCount}`);
          
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
              } else {
                console.log(`✅ Auto-converted ${pendingApps.length} pending applications to standby`);
              }
            }
          }
        }
      }
      
      onReloadAssignments();
      alert('Application approved!');
    } catch (error) {
      alert('Error approving application: ' + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleBulkApprove = async () => {
    const pendingApps = filteredApplications.filter(app => app.status === 'pending');
    
    if (pendingApps.length === 0) {
      alert('No pending applications to approve.');
      return;
    }

    // ✅ Check each application for position capacity before bulk approving
    const overfilledApps = [];
    const approvableApps = [];

    for (const app of pendingApps) {
      const event = events.find(e => e.id === app.event_id);
      if (!event) { approvableApps.push(app); continue; }

      const positionDef = event.positions?.find(p => 
        p.key === app.position || p.name === app.position
      );
      if (!positionDef) { approvableApps.push(app); continue; }

      const maxCount = positionDef.count || 1;
      // Count currently approved + any we've already added to approvableApps
      const currentApproved = assignments.filter(a => 
        a.event_id === app.event_id && 
        a.position === app.position && 
        a.status === 'approved'
      ).length;
      const pendingApprovalCount = approvableApps.filter(a =>
        a.event_id === app.event_id && a.position === app.position
      ).length;

      if (currentApproved + pendingApprovalCount >= maxCount) {
        overfilledApps.push(app);
      } else {
        approvableApps.push(app);
      }
    }

    // Warn about overfilled positions
    if (overfilledApps.length > 0) {
      const names = overfilledApps.map(a => `• ${a.worker?.name} - ${a.position} @ ${a.event?.name}`).join('\n');
      const proceed = confirm(
        `⚠️ ${overfilledApps.length} application(s) cannot be approved - position already full:\n\n${names}\n\n` +
        `Approve the remaining ${approvableApps.length} application(s)?`
      );
      if (!proceed) return;
    } else {
      if (!confirm(`Approve ${approvableApps.length} pending application(s)?`)) return;
    }

    if (approvableApps.length === 0) {
      alert('No applications could be approved - all positions are full.');
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
      alert(`✓ ${approvableApps.length} application(s) approved!${overfilledApps.length > 0 ? `\n${overfilledApps.length} skipped (position full).` : ''}`);
    } catch (error) {
      alert('Error bulk approving: ' + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (applicationId) => {
    if (!confirm('Reject this application? This will remove the assignment.')) return;
    
    setProcessingId(applicationId);
    try {
      const { error } = await supabase
        .from('assignments')
        .delete()
        .eq('id', applicationId);
      
      if (error) throw error;
      
      onReloadAssignments();
      alert('Application rejected and removed.');
    } catch (error) {
      alert('Error rejecting application: ' + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const pendingCount = applications.filter(a => a.status === 'pending').length;
  const approvedCount = applications.filter(a => a.status === 'approved').length;
  const standbyCount = applications.filter(a => a.status === 'standby').length;

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
                  {(app.worker.reliability ?? 0) >= 4.5 && (
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
