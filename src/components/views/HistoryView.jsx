import React, { useState } from 'react';
import { Calendar, Clock, MapPin, DollarSign, Briefcase, TrendingUp, Award } from 'lucide-react';
import { parseDateSafe, formatTime } from '../../utils/dateHelpers';
import { getPositionLabel } from '../../utils/positionHelpers';

export default function HistoryView({ worker, assignments, events, timeFormat, paymentTrackingEnabled }) {
  const [viewMode, setViewMode] = useState('recent'); // 'recent' or 'all'

  if (!worker) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-red-600">Error: Worker not found.</p>
      </div>
    );
  }

  // Get past completed events
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const pastAssignments = assignments
    .filter(a => a.worker_id === worker.id && a.status === 'approved')
    .map(assignment => {
      const event = events.find(e => e.id === assignment.event_id);
      return { ...assignment, event };
    })
    .filter(a => {
      if (!a.event) return false;
      const eventDate = parseDateSafe(a.event.date);
      eventDate.setHours(0, 0, 0, 0);
      return eventDate < today;
    })
    .sort((a, b) => new Date(b.event.date) - new Date(a.event.date));

  // Show recent (last 10) or all
  const displayedAssignments = viewMode === 'recent' 
    ? pastAssignments.slice(0, 10) 
    : pastAssignments;

  // Calculate summary stats
  const totalEarnings = pastAssignments.reduce((sum, a) => sum + (a.payment || 0), 0);
  const totalHours = pastAssignments.reduce((sum, a) => sum + (a.hours || 0), 0);
  const uniqueVenues = [...new Set(pastAssignments.map(a => a.event?.venue).filter(Boolean))].length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-red-900 to-red-800 rounded-lg shadow p-6 text-white">
        <div className="flex items-center space-x-4">
          <div className="bg-white bg-opacity-20 rounded-full p-4">
            <Briefcase size={32} />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Work History</h2>
            <p className="text-red-100">Your completed events</p>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-600">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Total Events</p>
              <p className="text-2xl font-bold text-gray-900">{pastAssignments.length}</p>
            </div>
            <Calendar className="text-blue-600" size={32} />
          </div>
        </div>

        {paymentTrackingEnabled && (
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-purple-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total Earned</p>
                <p className="text-2xl font-bold text-gray-900">${totalEarnings.toLocaleString()}</p>
              </div>
              <DollarSign className="text-purple-600" size={32} />
            </div>
          </div>
        )}
      </div>

      {/* View Toggle */}
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold text-gray-900">
          {viewMode === 'recent' ? 'Recent Events' : 'All Events'}
        </h3>
        <button
          onClick={() => setViewMode(viewMode === 'recent' ? 'all' : 'recent')}
          className="bg-red-900 hover:bg-red-800 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          {viewMode === 'recent' ? `View All (${pastAssignments.length})` : 'View Recent (10)'}
        </button>
      </div>

      {/* Events List */}
      {displayedAssignments.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Briefcase size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Past Events</h3>
          <p className="text-gray-600">You haven't completed any events yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayedAssignments.map((assignment) => {
            const event = assignment.event;
            const eventDate = parseDateSafe(event.date);
            
            return (
              <div key={assignment.id} className="bg-white rounded-lg shadow p-6 border border-gray-200">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                  {/* Event Info */}
                  <div className="flex-1">
                    <h4 className="text-lg font-bold text-gray-900 mb-2">{event.name}</h4>
                    
                    <div className="space-y-1 text-sm text-gray-600">
                      <div className="flex items-center space-x-2">
                        <Calendar size={14} className="text-gray-400" />
                        <span>{eventDate.toLocaleDateString('en-US', { 
                          weekday: 'short', 
                          month: 'short', 
                          day: 'numeric', 
                          year: 'numeric' 
                        })}</span>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Clock size={14} className="text-gray-400" />
                        <span>{formatTime(event.time, timeFormat)} - {formatTime(event.end_time, timeFormat)}</span>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <MapPin size={14} className="text-gray-400" />
                        <span>{event.venue}</span>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Award size={14} className="text-gray-400" />
                        <span className="font-medium">{getPositionLabel(assignment.position)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Payment Info */}
                  {paymentTrackingEnabled && assignment.payment > 0 && (
                    <div className="mt-4 md:mt-0 md:ml-6 flex flex-col items-end">
                      <div className="bg-green-50 px-4 py-2 rounded-lg border border-green-200">
                        <p className="text-xs text-green-600 mb-1">Earned</p>
                        <p className="text-2xl font-bold text-green-900">${assignment.payment.toFixed(2)}</p>
                        {assignment.hours > 0 && (
                          <p className="text-xs text-gray-600 mt-1">{assignment.hours} hours</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
