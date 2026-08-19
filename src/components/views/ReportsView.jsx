import React, { useState, useEffect } from 'react';
import { ClipboardList, CheckCircle, Clock, XCircle, AlertTriangle, Star, ChevronDown, Eye } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { getPositionLabel } from '../../utils/positionHelpers';
import { parseDateSafe, formatTime } from '../../utils/dateHelpers';
import PostEventReportModal from '../modals/PostEventReportModal';
import { useConfirm } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';

const RATING_CHANGES = {
  completed: 0.05,
  late: -0.25,
  left_early: -0.25,
  late_cancel: -0.5,
  no_show: -1.0
};

const STATUS_LABELS = {
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800' },
  late: { label: 'Late', color: 'bg-yellow-100 text-yellow-800' },
  left_early: { label: 'Left Early', color: 'bg-yellow-100 text-yellow-800' },
  late_cancel: { label: 'Late Cancel', color: 'bg-orange-100 text-orange-800' },
  no_show: { label: 'No Show', color: 'bg-red-100 text-red-800' }
};

export default function ReportsView({ events, assignments, workers, timeFormat }) {
  const confirm = useConfirm();
  const notify = useToast();
  const [reports, setReports] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending'); // 'pending', 'reviewed', 'all', 'needs_report'
  const [expandedReport, setExpandedReport] = useState(null);
  const [approvingId, setApprovingId] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    setLoading(true);
    try {
      const { data: reportsData, error: reportsError } = await supabase
        .from('post_event_reports')
        .select('*')
        .order('submitted_at', { ascending: false });

      if (reportsError) throw reportsError;

      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance_records')
        .select('*');

      if (attendanceError) throw attendanceError;

      setReports(reportsData || []);
      setAttendanceRecords(attendanceData || []);
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveReport = async (report) => {
    if (!(await confirm('Approve this report? Reliability ratings will be applied to all workers.'))) return;

    setApprovingId(report.id);
    try {
      // Get attendance records for this report
      const records = attendanceRecords.filter(r => r.report_id === report.id);

      if (records.length === 0) {
        notify('No attendance records found for this report.');
        setApprovingId(null);
        return;
      }

      // Fetch fresh worker data directly from Supabase to avoid stale props
      const workerIds = [...new Set(records.map(r => r.worker_id))];
      const { data: freshWorkers, error: workerFetchError } = await supabase
        .from('workers')
        .select('id, name, reliability')
        .in('id', workerIds);

      if (workerFetchError) throw workerFetchError;

      // Apply rating changes to each worker
      for (const record of records) {
        const worker = freshWorkers.find(w => w.id === record.worker_id);
        if (!worker) {
          console.warn('Worker not found for record:', record.worker_id);
          continue;
        }

        const currentRating = worker.reliability ?? 5.0;
        const change = record.rating_change ?? 0;
        const newRating = Math.min(5.0, Math.max(0.0, parseFloat(currentRating) + parseFloat(change)));

        // Update worker reliability
        const { error: updateError } = await supabase
          .from('workers')
          .update({ reliability: parseFloat(newRating.toFixed(2)) })
          .eq('id', worker.id);

        if (updateError) {
          console.error('Error updating worker rating:', updateError);
          throw updateError;
        }

        // Log the change
        await supabase
          .from('reliability_log')
          .insert([{
            worker_id: worker.id,
            event_id: report.event_id,
            report_id: report.id,
            change_amount: parseFloat(change),
            reason: STATUS_LABELS[record.status]?.label || record.status,
            previous_rating: parseFloat(currentRating),
            new_rating: parseFloat(newRating.toFixed(2))
          }]);

        // Mark record as applied
        await supabase
          .from('attendance_records')
          .update({ rating_applied: true })
          .eq('id', record.id);
      }

      // Mark report as reviewed
      await supabase
        .from('post_event_reports')
        .update({
          reviewed_by_admin: true,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', report.id);

      await loadReports();
      notify('✅ Report approved! Reliability ratings have been updated.');
    } catch (error) {
      notify('Error approving report: ' + error.message);
    } finally {
      setApprovingId(null);
    }
  };

  // Past events that don't have a report yet
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const pastEvents = events.filter(e => {
    const eventDate = parseDateSafe(e.date);
    eventDate.setHours(0, 0, 0, 0);
    return eventDate < today;
  });

  const eventsWithReports = new Set(reports.map(r => r.event_id));
  const eventsNeedingReports = pastEvents.filter(e => !eventsWithReports.has(e.id));

  // Enrich reports with event/worker data
  const enrichedReports = reports.map(report => ({
    ...report,
    event: events.find(e => e.id === report.event_id),
    submittedByWorker: report.submitted_by ? workers.find(w => w.id === report.submitted_by) : null,
    records: attendanceRecords.filter(r => r.report_id === report.id)
  })).filter(r => r.event);

  const pendingReports = enrichedReports.filter(r => !r.reviewed_by_admin);
  const reviewedReports = enrichedReports.filter(r => r.reviewed_by_admin);

  const displayedReports = filter === 'pending' ? pendingReports
    : filter === 'reviewed' ? reviewedReports
    : filter === 'needs_report' ? []
    : enrichedReports;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Post-Event Reports</h2>
        <p className="text-sm text-gray-600 mt-1">Review attendance reports and apply reliability ratings</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-yellow-700 font-medium">Pending Review</p>
            <p className="text-3xl font-bold text-yellow-900">{pendingReports.length}</p>
          </div>
          <Clock size={32} className="text-yellow-500" />
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-orange-700 font-medium">Needs Report</p>
            <p className="text-3xl font-bold text-orange-900">{eventsNeedingReports.length}</p>
          </div>
          <ClipboardList size={32} className="text-orange-500" />
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-green-700 font-medium">Reviewed</p>
            <p className="text-3xl font-bold text-green-900">{reviewedReports.length}</p>
          </div>
          <CheckCircle size={32} className="text-green-500" />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'pending', label: `Pending Review (${pendingReports.length})` },
            { id: 'needs_report', label: `Needs Report (${eventsNeedingReports.length})` },
            { id: 'reviewed', label: `Reviewed (${reviewedReports.length})` },
            { id: 'all', label: 'All Reports' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                filter === tab.id
                  ? 'bg-red-900 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Needs Report section */}
      {filter === 'needs_report' && (
        <div className="bg-white rounded-lg shadow">
          {eventsNeedingReports.length === 0 ? (
            <div className="p-12 text-center">
              <CheckCircle size={48} className="mx-auto text-green-300 mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">All caught up!</h3>
              <p className="text-gray-500">All past events have reports submitted.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {eventsNeedingReports.map(event => {
                const eventDate = parseDateSafe(event.date);
                const eventAssignments = assignments.filter(a =>
                  a.event_id === event.id && (a.status === 'approved' || a.status === 'assigned')
                );
                return (
                  <div key={event.id} className="p-5 flex items-center justify-between hover:bg-gray-50">
                    <div>
                      <h4 className="font-bold text-gray-900">{event.name}</h4>
                      <p className="text-sm text-gray-500">
                        {eventDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                        {event.time && ` • ${formatTime(event.time, timeFormat)}`}
                        {event.venue && ` • ${event.venue}`}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">{eventAssignments.length} worker{eventAssignments.length !== 1 ? 's' : ''} assigned</p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedEvent(event);
                        setShowReportModal(true);
                      }}
                      className="bg-red-900 text-white px-4 py-2 rounded-lg hover:bg-red-800 text-sm font-medium flex items-center space-x-2"
                    >
                      <ClipboardList size={16} />
                      <span>Submit Report</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Reports list */}
      {filter !== 'needs_report' && (
        <div className="bg-white rounded-lg shadow">
          {loading ? (
            <div className="p-12 text-center text-gray-500">Loading reports...</div>
          ) : displayedReports.length === 0 ? (
            <div className="p-12 text-center">
              <ClipboardList size={48} className="mx-auto text-gray-300 mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Reports Found</h3>
              <p className="text-gray-500">
                {filter === 'pending' ? 'No reports pending review.' : 'No reports match this filter.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {displayedReports.map(report => {
                const isExpanded = expandedReport === report.id;
                const eventDate = parseDateSafe(report.event.date);
                const issueCount = report.records.filter(r => r.status !== 'completed').length;
                const submittedBy = report.submittedByWorker?.name || 'Admin';

                return (
                  <div key={report.id} className="overflow-hidden">
                    {/* Report header */}
                    <div
                      className="p-5 cursor-pointer hover:bg-gray-50 flex items-start justify-between"
                      onClick={() => setExpandedReport(isExpanded ? null : report.id)}
                    >
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-1">
                          <h4 className="font-bold text-gray-900">{report.event.name}</h4>
                          {report.reviewed_by_admin ? (
                            <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-0.5 rounded-full">Reviewed</span>
                          ) : (
                            <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2 py-0.5 rounded-full">Pending Review</span>
                          )}
                          {issueCount > 0 && (
                            <span className="bg-red-100 text-red-800 text-xs font-medium px-2 py-0.5 rounded-full">
                              {issueCount} issue{issueCount !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">
                          {eventDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                          {report.event.time && ` • ${formatTime(report.event.time, timeFormat)}`}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          Submitted by {submittedBy} • {new Date(report.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                      <ChevronDown size={18} className={`text-gray-400 mt-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 bg-gray-50 p-5 space-y-4">
                        {/* Attendance records */}
                        <div>
                          <h5 className="text-sm font-semibold text-gray-700 mb-3">Attendance</h5>
                          <div className="space-y-2">
                            {report.records.map(record => {
                              const worker = workers.find(w => w.id === record.worker_id);
                              const statusInfo = STATUS_LABELS[record.status] || { label: record.status, color: 'bg-gray-100 text-gray-800' };
                              const change = record.rating_change;

                              return (
                                <div key={record.id} className="flex items-center justify-between bg-white p-3 rounded-lg border">
                                  <div className="flex items-center space-x-3">
                                    <div>
                                      <p className="font-medium text-gray-900 text-sm">{worker?.name || 'Unknown'}</p>
                                      <p className="text-xs text-gray-500">{getPositionLabel(record.position || '')}</p>
                                      {record.notes && <p className="text-xs text-gray-400 italic mt-0.5">"{record.notes}"</p>}
                                    </div>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusInfo.color}`}>
                                      {statusInfo.label}
                                    </span>
                                    <span className={`text-xs font-bold ${change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                      {change > 0 ? '+' : ''}{change} ⭐
                                    </span>
                                    {record.rating_applied && (
                                      <span className="text-xs text-green-600">✓ Applied</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Report notes */}
                        {report.report_notes && (
                          <div>
                            <h5 className="text-sm font-semibold text-gray-700 mb-1">Event Notes</h5>
                            <p className="text-sm text-gray-600 bg-white p-3 rounded-lg border">{report.report_notes}</p>
                          </div>
                        )}

                        {/* Approve button */}
                        {!report.reviewed_by_admin && (
                          <div className="flex justify-end pt-2">
                            <button
                              onClick={() => handleApproveReport(report)}
                              disabled={approvingId === report.id}
                              className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 font-medium text-sm disabled:bg-gray-400 flex items-center space-x-2"
                            >
                              <CheckCircle size={16} />
                              <span>{approvingId === report.id ? 'Applying ratings...' : 'Approve & Apply Ratings'}</span>
                            </button>
                          </div>
                        )}

                        {report.reviewed_by_admin && report.reviewed_at && (
                          <p className="text-xs text-gray-400 text-right">
                            Reviewed {new Date(report.reviewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Submit report modal (admin) */}
      {showReportModal && selectedEvent && (
        <PostEventReportModal
          open={showReportModal}
          event={selectedEvent}
          assignments={assignments}
          workers={workers}
          submittedBy={null}
          timeFormat={timeFormat}
          onClose={() => {
            setShowReportModal(false);
            setSelectedEvent(null);
          }}
          onSuccess={loadReports}
        />
      )}
    </div>
  );
}
