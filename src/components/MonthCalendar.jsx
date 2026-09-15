import React from 'react';
import { ChevronDown } from 'lucide-react';
import { isAssignmentFilled } from '../utils/positionHelpers';

// Extracted from ScheduleView.jsx's CalendarView so the Dashboard can show
// the same full-month view the user specifically asked for after comparing
// it favorably against their previous staffing software's calendar --
// rather than a second, drifting copy of this same rendering + day-matching
// logic.
//
// Controlled on which month is showing (viewDate/onViewDateChange) rather
// than owning that state internally: ScheduleView reuses the exact same
// Date value for "which month is the calendar on" AND "which day is
// selected for its List view" today, so its calendar remembers the viewed
// month across a drill-into-a-day-and-back round trip. Making this
// component self-contained would have reset that back to the current
// month on every remount instead.
export default function MonthCalendar({ events, assignments, viewDate, onViewDateChange, onDayClick }) {
  const getEventsForDate = (date) => {
    // Format date as YYYY-MM-DD without timezone conversion
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    return events.filter(event => {
      const eventDateStr = event.date ? event.date.split('T')[0] : '';
      return eventDateStr === dateStr;
    });
  };

  const generateCalendarDays = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) days.push(null);
    for (let day = 1; day <= daysInMonth; day++) days.push(new Date(year, month, day));
    return days;
  };

  const changeMonth = (direction) => {
    const newDate = new Date(viewDate);
    newDate.setMonth(newDate.getMonth() + direction);
    onViewDateChange(newDate);
  };

  const formatMonthYear = (date) => date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const isToday = (date) => {
    if (!date) return false;
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const days = generateCalendarDays();
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="bg-white rounded-lg shadow p-6">
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-bold text-gray-900">{formatMonthYear(viewDate)}</h3>
        <div className="flex space-x-2">
          <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-100 rounded">
            <ChevronDown size={20} className="transform rotate-90" />
          </button>
          <button
            onClick={() => onViewDateChange(new Date())}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm font-medium"
          >
            Today
          </button>
          <button onClick={() => changeMonth(1)} className="p-2 hover:bg-gray-100 rounded">
            <ChevronDown size={20} className="transform -rotate-90" />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-2">
        {weekDays.map(day => (
          <div key={day} className="text-center font-semibold text-gray-700 py-2">
            {day}
          </div>
        ))}

        {days.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} className="min-h-24 p-2 bg-gray-50 rounded"></div>;
          }

          const dayEvents = getEventsForDate(date);
          const hasEvents = dayEvents.length > 0;

          const sortedDayEvents = [...dayEvents].sort((a, b) => {
            const timeA = a.time || '00:00';
            const timeB = b.time || '00:00';
            return timeA.localeCompare(timeB);
          });

          return (
            <div
              key={date.toISOString()}
              className={`min-h-24 p-2 border rounded cursor-pointer transition-colors ${
                isToday(date)
                  ? 'bg-red-50 border-red-300 ring-2 ring-red-200'
                  : hasEvents
                  ? 'bg-blue-50 border-blue-200 hover:bg-blue-100'
                  : 'bg-white hover:bg-gray-50'
              }`}
              onClick={() => {
                onViewDateChange(date);
                if (hasEvents) onDayClick?.(date, sortedDayEvents);
              }}
            >
              <div className="text-sm font-semibold text-gray-900 mb-1">
                {date.getDate()}
              </div>
              {sortedDayEvents.slice(0, 2).map(event => {
                const eventAssignments = assignments.filter(a => a.event_id === event.id);
                const totalNeeded = event.positions?.reduce((sum, p) => sum + p.count, 0) || 0;
                const filled = eventAssignments.filter(a => isAssignmentFilled(a.status)).length;
                const isFullyStaffed = filled >= totalNeeded && totalNeeded > 0;

                return (
                  <div
                    key={event.id}
                    className={`text-xs p-1 rounded mb-1 truncate ${
                      isFullyStaffed ? 'bg-green-600 text-white' : 'bg-yellow-500 text-white'
                    }`}
                    title={event.name}
                  >
                    {event.name}
                  </div>
                );
              })}
              {dayEvents.length > 2 && (
                <div className="text-xs text-gray-600 font-medium">
                  +{dayEvents.length - 2} more
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center space-x-4 mt-4 text-sm">
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-green-600 rounded"></div>
          <span className="text-gray-700">Fully Staffed</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-yellow-500 rounded"></div>
          <span className="text-gray-700">Needs Staff</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-red-50 border-2 border-red-300 rounded"></div>
          <span className="text-gray-700">Today</span>
        </div>
      </div>
    </div>
  );
}
