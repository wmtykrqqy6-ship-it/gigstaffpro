import React, { useState, useEffect } from 'react';
import { X, CheckCircle, XCircle, Clock, AlertTriangle, ChevronDown } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { getPositionLabel } from '../../utils/positionHelpers';
import { parseDateSafe, formatTime } from '../../utils/dateHelpers';

const ATTENDANCE_OPTIONS = [
  {
    value: 'completed',
    label: 'Completed',
    description: 'On time, finished event',
    ratingChange: 0,
    color: 'green',
    icon: CheckCircle
  },
  {
    value: 'late',
    label: 'Arrived Late',
    description: 'Showed up but late',
    ratingChange: -0.25,
    color: 'yellow',
    icon: Clock
  },
  {
    value: 'left_early',
    label: 'Left Early',
    description: 'Did not finish event',
    ratingChange: -0.25,
    color: 'yellow',
    icon: AlertTriangle
  },
  {
    value: 'late_cancel',
    label: 'Late Cancel',
    description: 'Cancelled within 24 hours',
    ratingChange: -0.5,
    color: 'orange',
    icon: AlertTriangle
  },
  {
    value: 'no_show',
    label: 'No Show',
    description: 'Never showed, no contact',
    ratingChange: -1.0,
    color: 'red',
    icon: XCircle
  }
];

const colorMap = {
  green: 'bg-green-100 border-green-400 text-green-800',
  yellow: 'bg-yellow-100 border-yellow-400 text-yellow-800',
  orange: 'bg-orange-100 border-orange-400 text-orange-800',
  red: 'bg-red-100 border-red-400 text-red-800'
};

const selectedColorMap = {
  green: 'bg-green-500 border-green-600 text-white',
  yellow: 'bg-yellow-500 border-yellow-600 text-white',
  orange: 'bg-orange-500 border-orange-600 text-white',
  red: 'bg-red-500 border-red-600 text-white'
};

export default function PostEventReportModal({
  open,
  event,
  assignments,
  workers,
  submittedBy, // worker id of host, or null for admin
  timeFormat,
  onClose,
  onSuccess
}) {
  const [attendance, setAttendance] = useState({});
  const [notes, setNotes] = useState({});
  const [reportNotes, setReportNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expandedWorker, setExpandedWorker] = useState(null);

  // Get workers assigned to this event
  const eventAssignments = assignments.filter(a =>
    a.event_id === event?.id &&
    (a.status === 'approved' || a.status === 'assigned')
  );

  const assignedWorkers = eventAssignments.map(a => ({
    ...a,
    worker: workers.find(w => w.id === a.worker_id)
  })).filter(a => a.worker);

  // Initialize all workers as 'completed' by default
  useEffect(() => {
    if (open && assignedWorkers.length > 0) {
      const defaultAttendance = {};
      const defaultNotes = {};
      assignedWorkers.forEach(a => {
        defaultAttendance[a.worker_id] = 'completed';
        defaultNotes[a.worker_id] = '';
      });
      setAttendance(defaultAttendance);
      setNotes(defaultNotes);
    }
  }, [open, event?.id]);

  if (!open || !event) return null;

  const eventDate = parseDateSafe(event.date);

  const handleSubmit = async () => {
    if (assignedWorkers.length === 0) {
      alert('No assigned workers found for this event.');
      return;
    }

    if (!confirm('Submit this post-event report? Rating changes will be pending admin review.')) return;

    setSubmitting(true);
    try {
      // 1. Create the report record
      const { data: report, error: reportError } = await supabase
        .from('post_event_reports')
        .insert([{
          event_id: event.id,
          submitted_by: submittedBy || null,
          report_notes: reportNotes,
          reviewed_by_admin: false
        }])
        .select()
        .single();

      if (reportError) throw reportError;

      // 2. Create attendance records for each worker
      const attendanceRecords = assignedWorkers.map(a => {
        const status = attendance[a.worker_id] || 'completed';
        const option = ATTENDANCE_OPTIONS.find(o => o.value === status);
        const ratingChange = option ? option.ratingChange : 0;
        // Completed events get a small recovery bonus
        const finalRatingChange = status === 'completed' ? 0.05 : ratingChange;

        return {
          report_id: report.id,
          worker_id: a.worker_id,
          event_id: event.id,
          status,
          notes: notes[a.worker_id] || null,
          rating_change: finalRatingChange,
          rating_applied: false
        };
      });

      const { error: attendanceError } = await supabase
        .from('attendance_records')
        .insert(attendanceRecords);

      if (attendanceError) throw attendanceError;

      if (onSuccess) await onSuccess();
      onClose();
      alert('✅ Report submitted! Admin will review before ratings are applied.');
    } catch (error) {
      alert('Error submitting report: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const issueCount = Object.values(attendance).filter(v => v !== 'completed').length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto">
      <div className="min-h-screen flex items-center justify-center p-4 py-8">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
          <div className="p-6 max-h-[90vh] overflow-y-auto">

            {/* Header */}
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">Post-Event Report</h3>
                <p className="text-gray-500 mt-1">{event.name}</p>
                <p className="text-sm text-gray-400">
                  {eventDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  {event.time && ` • ${formatTime(event.time, timeFormat)}`}
                </p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>

            {/* Summary bar */}
            <div className="flex items-center space-x-4 mb-6 p-3 bg-gray-50 rounded-lg text-sm">
              <span className="text-gray-600">{assignedWorkers.length} workers assigned</span>
              {issueCount > 0 ? (
                <span className="text-orange-600 font-medium">⚠️ {issueCount} issue{issueCount !== 1 ? 's' : ''} flagged</span>
              ) : (
                <span className="text-green-600 font-medium">✓ All completed</span>
              )}
            </div>

            {assignedWorkers.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No assigned workers found for this event.</p>
              </div>
            ) : (
              <div className="space-y-3 mb-6">
                {assignedWorkers.map(a => {
                  const currentStatus = attendance[a.worker_id] || 'completed';
                  const currentOption = ATTENDANCE_OPTIONS.find(o => o.value === currentStatus);
                  const isExpanded = expandedWorker === a.worker_id;
                  const Icon = currentOption?.icon || CheckCircle;

                  return (
                    <div key={a.worker_id} className={`border-2 rounded-lg overflow-hidden transition-all ${
                      currentStatus === 'completed' ? 'border-green-200' :
                      currentStatus === 'no_show' ? 'border-red-300' : 'border-orange-300'
                    }`}>
                      {/* Worker row */}
                      <div
                        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                        onClick={() => setExpandedWorker(isExpanded ? null : a.worker_id)}
                      >
                        <div className="flex items-center space-x-3">
                          <Icon size={20} className={
                            currentStatus === 'completed' ? 'text-green-500' :
                            currentStatus === 'no_show' ? 'text-red-500' : 'text-orange-500'
                          } />
                          <div>
                            <p className="font-semibold text-gray-900">{a.worker.name}</p>
                            <p className="text-xs text-gray-500">{getPositionLabel(a.position)}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className={`text-xs font-medium px-2 py-1 rounded-full border ${
                            currentStatus === 'completed' ? 'bg-green-100 border-green-300 text-green-800' :
                            currentStatus === 'no_show' ? 'bg-red-100 border-red-300 text-red-800' :
                            'bg-orange-100 border-orange-300 text-orange-800'
                          }`}>
                            {currentOption?.label}
                            {currentOption?.ratingChange !== 0 && ` (${currentOption.ratingChange > 0 ? '+' : ''}${currentOption.ratingChange})`}
                          </span>
                          <ChevronDown size={16} className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </div>

                      {/* Expanded options */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-3">
                          <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Attendance Status</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {ATTENDANCE_OPTIONS.map(option => {
                              const OIcon = option.icon;
                              const isSelected = currentStatus === option.value;
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => setAttendance(prev => ({ ...prev, [a.worker_id]: option.value }))}
                                  className={`flex items-center space-x-2 p-2 rounded-lg border-2 text-left transition-all ${
                                    isSelected ? selectedColorMap[option.color] : colorMap[option.color]
                                  }`}
                                >
                                  <OIcon size={16} />
                                  <div>
                                    <p className="text-xs font-semibold">{option.label}</p>
                                    <p className="text-xs opacity-80">
                                      {option.description}
                                      {option.ratingChange !== 0 && ` • ${option.ratingChange > 0 ? '+' : ''}${option.ratingChange} rating`}
                                      {option.ratingChange === 0 && option.value === 'completed' && ' • +0.05 rating'}
                                    </p>
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          {/* Per-worker notes */}
                          {currentStatus !== 'completed' && (
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
                              <input
                                type="text"
                                value={notes[a.worker_id] || ''}
                                onChange={(e) => setNotes(prev => ({ ...prev, [a.worker_id]: e.target.value }))}
                                placeholder="e.g. Arrived 20 minutes late, no explanation given"
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Overall report notes */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Overall Event Notes (optional)</label>
              <textarea
                value={reportNotes}
                onChange={(e) => setReportNotes(e.target.value)}
                rows="3"
                placeholder="Any general notes about the event, venue, or team performance..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
              />
            </div>

            {/* Info box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6 text-xs text-blue-700">
              <p className="font-medium mb-1">ℹ️ How ratings work after submission:</p>
              <p>• Completed events: +0.05 reliability (recovery bonus)</p>
              <p>• Late arrival / Left early: -0.25 reliability</p>
              <p>• Late cancellation: -0.50 reliability</p>
              <p>• No show: -1.00 reliability</p>
              <p className="mt-1 font-medium">Ratings are applied only after admin reviews and approves this report.</p>
            </div>

            {/* Buttons */}
            <div className="flex space-x-3">
              <button
                onClick={handleSubmit}
                disabled={submitting || assignedWorkers.length === 0}
                className="flex-1 bg-red-900 text-white px-6 py-3 rounded-lg hover:bg-red-800 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting...' : 'Submit Report'}
              </button>
              <button
                onClick={onClose}
                disabled={submitting}
                className="flex-1 bg-gray-200 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-300 font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
