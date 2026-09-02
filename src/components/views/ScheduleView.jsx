import React, { useState } from 'react';
import { Calendar, ChevronDown, Users, Clock, MapPin, CheckCircle } from 'lucide-react';
import { parseDateSafe, formatTime } from '../../utils/dateHelpers';
import { getPositionLabel, isAssignmentFilled } from '../../utils/positionHelpers';
import AssignWorkersModal from '../modals/AssignWorkersModal';

export default function ScheduleView({
  events,
  assignments,
  workers,
  timeFormat,
  positions,
  eventPaymentSettings,
  onAssign,
  onUnassign,
  onSavePaymentSettings
}) {
    const [viewMode, setViewMode] = useState('calendar'); // 'calendar' or 'list'
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [selectedWorker, setSelectedWorker] = useState(null);
    const [selectedEvent, setSelectedEvent] = useState(null);

    // Get events for a specific date
    const getEventsForDate = (date) => {
      // Format date as YYYY-MM-DD without timezone conversion
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      return events.filter(event => {
        // Extract just the date part from event.date (handles "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ss")
        const eventDateStr = event.date ? event.date.split('T')[0] : '';
        return eventDateStr === dateStr;
      });
    };

    // Get all assignments for a specific worker
    const getWorkerAssignments = (workerId) => {
      return assignments.filter(a => a.worker_id === workerId).map(assignment => {
        const event = events.find(e => e.id === assignment.event_id);
        return { ...assignment, event };
      }).filter(a => a.event); // Only include assignments with valid events
    };

    // Generate calendar days for current month
    const generateCalendarDays = () => {
      const year = selectedDate.getFullYear();
      const month = selectedDate.getMonth();
      
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const daysInMonth = lastDay.getDate();
      const startingDayOfWeek = firstDay.getDay();
      
      const days = [];
      
      // Add empty cells for days before month starts
      for (let i = 0; i < startingDayOfWeek; i++) {
        days.push(null);
      }
      
      // Add days of the month
      for (let day = 1; day <= daysInMonth; day++) {
        days.push(new Date(year, month, day));
      }
      
      return days;
    };

    const changeMonth = (direction) => {
      const newDate = new Date(selectedDate);
      newDate.setMonth(newDate.getMonth() + direction);
      setSelectedDate(newDate);
    };

    const formatMonthYear = (date) => {
      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    };

    const isToday = (date) => {
      if (!date) return false;
      const today = new Date();
      return date.toDateString() === today.toDateString();
    };

    const CalendarView = () => {
      const days = generateCalendarDays();
      const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      return (
        <div className="bg-white rounded-lg shadow p-6">
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold text-gray-900">{formatMonthYear(selectedDate)}</h3>
            <div className="flex space-x-2">
              <button
                onClick={() => changeMonth(-1)}
                className="p-2 hover:bg-gray-100 rounded"
              >
                <ChevronDown size={20} className="transform rotate-90" />
              </button>
              <button
                onClick={() => setSelectedDate(new Date())}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm font-medium"
              >
                Today
              </button>
              <button
                onClick={() => changeMonth(1)}
                className="p-2 hover:bg-gray-100 rounded"
              >
                <ChevronDown size={20} className="transform -rotate-90" />
              </button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-2">
            {/* Week day headers */}
            {weekDays.map(day => (
              <div key={day} className="text-center font-semibold text-gray-700 py-2">
                {day}
              </div>
            ))}
            
            {/* Calendar days */}
            {days.map((date, index) => {
              if (!date) {
                return <div key={`empty-${index}`} className="min-h-24 p-2 bg-gray-50 rounded"></div>;
              }
              
              const dayEvents = getEventsForDate(date);
              const hasEvents = dayEvents.length > 0;
              
              // Sort events by start time
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
                    setSelectedDate(date);
                    if (hasEvents) {
                      setViewMode('list');
                    }
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
    };

    const ListView = () => {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const dayEvents = events
        .filter(event => event.date === dateStr)
        .sort((a, b) => {
          // Sort by start time (earliest first)
          const timeA = a.time || '00:00';
          const timeB = b.time || '00:00';
          return timeA.localeCompare(timeB);
        });

      return (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-bold text-gray-900">
                {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </h3>
              <button
                onClick={() => setViewMode('calendar')}
                className="text-red-900 hover:text-red-700 flex items-center space-x-1"
              >
                <Calendar size={18} />
                <span>Back to Calendar</span>
              </button>
            </div>

            {dayEvents.length === 0 ? (
              <div className="text-center py-12">
                <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
                <p className="text-gray-600">No events scheduled for this date</p>
              </div>
            ) : (
              <div className="space-y-4">
                {dayEvents.map(event => {
                  const eventAssignments = assignments.filter(a => a.event_id === event.id);
                  const totalNeeded = event.positions?.reduce((sum, p) => sum + p.count, 0) || 0;
                  const filled = eventAssignments.filter(a => isAssignmentFilled(a.status)).length;
                  
                  return (
                    <div key={event.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="text-lg font-bold text-gray-900">{event.name}</h4>
                          <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                            <span className="flex items-center space-x-1">
                              <Clock size={14} />
                              <span>{formatTime(event.time, timeFormat)}{event.end_time ? ` - ${formatTime(event.end_time, timeFormat)}` : ''}</span>
                            </span>
                            <span className="flex items-center space-x-1">
                              <MapPin size={14} />
                              <span>{event.venue}</span>
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                            filled >= totalNeeded && totalNeeded > 0
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {filled}/{totalNeeded} Staffed
                          </div>
                        </div>
                      </div>

                      {/* Assigned Workers */}
                      {eventAssignments.length > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-sm font-semibold text-gray-700 mb-2">Assigned Staff:</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {eventAssignments.map(assignment => {
                              const worker = workers.find(w => w.id === assignment.worker_id);
                              if (!worker) return null;
                              
                              return (
                                <div key={assignment.id} className="flex items-center space-x-2 text-sm bg-gray-50 p-2 rounded">
                                  <CheckCircle size={16} className="text-green-600" />
                                  <span className="font-medium text-gray-900">{worker.name}</span>
                                  <span className="text-gray-600">•</span>
                                  <span className="text-gray-600">{getPositionLabel(assignment.position)}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="mt-3 flex space-x-2">
                        <button
                          onClick={() => setSelectedEvent(event)}
                          className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                        >
                          Manage Staff
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      );
    };

    const WorkerScheduleView = () => {
      if (!selectedWorker) {
        return (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Worker Schedule</h3>
            <p className="text-gray-600 mb-4">Select a worker to see their schedule:</p>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {workers.map(worker => {
                const workerAssignments = getWorkerAssignments(worker.id);
                return (
                  <button
                    key={worker.id}
                    onClick={() => setSelectedWorker(worker)}
                    className="w-full text-left p-3 hover:bg-gray-50 rounded border flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{worker.name}</p>
                      <p className="text-sm text-gray-600">{workerAssignments.length} upcoming events</p>
                    </div>
                    <ChevronDown size={20} className="transform -rotate-90 text-gray-400" />
                  </button>
                );
              })}
            </div>
          </div>
        );
      }

      const workerAssignments = getWorkerAssignments(selectedWorker.id)
        .sort((a, b) => new Date(a.event.date) - new Date(b.event.date));

      return (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-2xl font-bold text-gray-900">{selectedWorker.name}'s Schedule</h3>
              <p className="text-sm text-gray-600 mt-1">{workerAssignments.length} upcoming events</p>
            </div>
            <button
              onClick={() => setSelectedWorker(null)}
              className="text-red-900 hover:text-red-700"
            >
              Back to Workers
            </button>
          </div>

          {workerAssignments.length === 0 ? (
            <div className="text-center py-12">
              <Users size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-600">No events assigned yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {workerAssignments.map(assignment => (
                <div key={assignment.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="font-bold text-gray-900">{assignment.event.name}</h4>
                      <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                        <span className="flex items-center space-x-1">
                          <Calendar size={14} />
                          <span>{new Date(assignment.event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <Clock size={14} />
                          <span>{formatTime(assignment.event.time, timeFormat)}</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <MapPin size={14} />
                          <span>{assignment.event.venue}</span>
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-medium">{getPositionLabel(assignment.position)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-3xl font-bold text-gray-900">Schedule</h2>
          <div className="flex space-x-2">
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${
                viewMode === 'calendar'
                  ? 'bg-red-900 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              <Calendar size={18} />
              <span>Calendar</span>
            </button>
            <button
              onClick={() => setViewMode('worker')}
              className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${
                viewMode === 'worker'
                  ? 'bg-red-900 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              <Users size={18} />
              <span>By Worker</span>
            </button>
          </div>
        </div>

        {viewMode === 'calendar' && <CalendarView />}
        {viewMode === 'list' && <ListView />}
        {viewMode === 'worker' && <WorkerScheduleView />}

      {/* Assign Workers Modal */}
      <AssignWorkersModal
        open={!!selectedEvent}
        event={selectedEvent}
        workers={workers}
        events={events}
        assignments={assignments}
        positions={positions}
        eventPaymentSettings={eventPaymentSettings}
        onClose={() => setSelectedEvent(null)}
        onAssign={onAssign}
        onUnassign={onUnassign}
        onSavePaymentSettings={onSavePaymentSettings}
      />
      </div>
    );
}
