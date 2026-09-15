import React from 'react';
import { ChevronRight, Calendar } from 'lucide-react';
import { isAssignmentFilled } from '../utils/positionHelpers';
import { parseDateSafe, formatTime } from '../utils/dateHelpers';

// Flat, chronological "agenda" list of events -- the mobile-friendly
// alternative to MonthCalendar's 7-column grid, which gets cramped at phone
// width. Shared between ScheduleView and DashboardView's ScheduleSection so
// both default to this on mobile instead of the calendar.
export default function EventsAgendaList({ events, assignments, timeFormat, onSelectEvent }) {
  const sorted = [...events].sort((a, b) => {
    const dateA = a.date ? a.date.split('T')[0] : '';
    const dateB = b.date ? b.date.split('T')[0] : '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return (a.time || '').localeCompare(b.time || '');
  });

  if (sorted.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-10 text-center">
        <Calendar size={40} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500 text-sm">No events scheduled</p>
      </div>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="bg-white rounded-lg shadow divide-y divide-gray-100 overflow-hidden">
      {sorted.map(event => {
        const eventAssignments = assignments.filter(a => a.event_id === event.id);
        const total = event.positions?.reduce((sum, p) => sum + (p.count || 1), 0) || 0;
        const filled = eventAssignments.filter(a => isAssignmentFilled(a.status)).length;
        const isFullyStaffed = filled >= total && total > 0;
        const eventDate = parseDateSafe(event.date);
        const isPast = eventDate < today;

        return (
          <button
            key={event.id}
            type="button"
            onClick={() => onSelectEvent?.(event)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className={`text-sm font-semibold flex-shrink-0 ${isPast ? 'text-gray-400' : 'text-red-900'}`}>
                  {eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <span className={`text-sm font-medium truncate ${isPast ? 'text-gray-500' : 'text-gray-900'}`}>
                  {event.name}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                {[formatTime(event.time, timeFormat), event.venue].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                isFullyStaffed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
              }`}>
                {filled}/{total}
              </span>
              <ChevronRight size={16} className="text-gray-300" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
