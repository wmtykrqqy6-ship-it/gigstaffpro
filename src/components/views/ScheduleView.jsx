import React, { useState } from 'react';
import { Calendar, ChevronDown, Users, Clock, MapPin, CheckCircle } from 'lucide-react';
import { parseDateSafe, formatTime } from '../../utils/dateHelpers';
import { getPositionLabel, positionMatches } from '../../utils/positionHelpers';
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
  onSavePaymentSettings,
  onReloadAssignments
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
                    const filled = eventAssignments.length;
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
                  const filled = eventAssignments.length;
                  
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
                          onClick={() => {
                            setSelectedEvent(event);
                            setShowAssignModal(true);
                          }}
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
      </div>
    );
  };

  const AvailableEventsSection = ({ currentWorker, events, assignments, rankAccessDays, timeFormat }) => {
    const [applying, setApplying] = useState(false);
    
    // Calculate which events the worker can see based on rank
    const getAvailableEvents = () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset to start of day
      const workerRank = currentWorker.rank || 5;
      const accessDays = rankAccessDays[workerRank] || 14;
      
      
      return events
        .filter(event => {
          
          // Must be future event
          const eventDate = new Date(event.date);
          eventDate.setHours(0, 0, 0, 0);
          if (eventDate < today) {
            return false;
          }
          
          // Calculate days until event
          const daysUntil = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
          
          // Check if within access window (Rank 1 with 0 days can see all future events)
          if (accessDays > 0 && daysUntil > accessDays) {
            return false;
          }
          
          // Must have positions that match worker skills (using position keys)
          const eventPositions = Array.isArray(event.positions) ? event.positions : [];
          
          // Extract position keys from position objects
          const positionKeys = eventPositions.map(pos => 
            pos.key || getPositionKey(pos.name || pos)
          );
          
          const workerSkillKeys = currentWorker.skills || [];
          const hasMatchingSkill = positionKeys.some(posKey => 
            workerSkillKeys.some(skillKey => positionMatches(skillKey, posKey))
          );
          
          // DEBUG: Show which positions/skills are being compared
          positionKeys.forEach(posKey => {
            const matches = workerSkillKeys.some(skillKey => positionMatches(skillKey, posKey));
          });
          
          if (!hasMatchingSkill) {
            return false;
          }
          
          // Not already assigned or applied
          const alreadyAssigned = assignments.some(a => 
            a.event_id === event.id && 
            a.worker_id === currentWorker.id &&
            ['approved', 'pending'].includes(a.status || 'approved')
          );
          
          if (alreadyAssigned) {
            return false;
          }
          
          return true;
        })
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    };
    
    const availableEvents = getAvailableEvents();
    
    const applyToEvent = async (event, position) => {
      // Check for time conflicts first
      const workerAssignments = assignments.filter(a => 
        a.worker_id === currentWorker.id && 
        a.event_id !== event.id &&
        ['approved', 'pending'].includes(a.status || 'approved')
      );
      
      let hasTimeConflict = false;
      let conflictEvent = null;
      
      if (workerAssignments.length > 0) {
        const conflicts = workerAssignments.filter(assignment => {
          const otherEvent = events.find(e => e.id === assignment.event_id);
          if (!otherEvent || otherEvent.date !== event.date) return false;
          
          const parseTime = (timeStr) => {
            if (!timeStr) return null;
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
          };
          
          const thisStart = parseTime(event.time);
          const thisEnd = parseTime(event.end_time);
          const otherStart = parseTime(otherEvent.time);
          const otherEnd = parseTime(otherEvent.end_time);
          
          if (!thisEnd || !otherEnd) return false;
          
          return (thisStart < otherEnd) && (thisEnd > otherStart);
        });
        
        if (conflicts.length > 0) {
          hasTimeConflict = true;
          conflictEvent = events.find(e => e.id === conflicts[0].event_id);
        }
      }
      
      if (hasTimeConflict && conflictEvent) {
        alert(`⚠️ TIME CONFLICT!\n\nYou're already assigned/applied to:\n${conflictEvent.name}\n${formatTime(conflictEvent.time, timeFormat)} - ${formatTime(conflictEvent.end_time, timeFormat)}\n\nThis conflicts with:\n${event.name}\n${formatTime(event.time, timeFormat)} - ${formatTime(event.end_time, timeFormat)}\n\nPlease contact admin if you need to change assignments.`);
        return;
      }
      
      if (!confirm(`Apply for ${position} position at ${event.name}?`)) return;
      
      setApplying(true);
      try {
        // Convert position label back to key for storage
        const positionKey = getPositionKey(position);
        
        const { error } = await supabase
          .from('assignments')
          .insert([{
            event_id: event.id,
            worker_id: currentWorker.id,
            position: positionKey,
            status: 'pending',
            applied_at: new Date().toISOString()
          }]);
        
        if (error) throw error;
        
        loadAssignments();
        alert(`✓ Application submitted for ${event.name}!\n\nYour application is pending admin approval. You'll be notified once it's reviewed.`);
      } catch (error) {
        alert('Error submitting application: ' + error.message);
      } finally {
        setApplying(false);
      }
    };
    
    if (availableEvents.length === 0) {
      return (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Available Events</h3>
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-600">No events available to apply for right now.</p>
            <p className="text-sm text-gray-500 mt-2">
              Check back later or contact admin for more opportunities.
            </p>
          </div>
        </div>
      );
    }
    
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-gray-900">Available Events</h3>
          <span className="bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full">
            {availableEvents.length} Available
          </span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {availableEvents.map(event => {
            // Get positions that match worker skills (using position keys)
            const eventPositions = Array.isArray(event.positions) ? event.positions : [];
            
            // Extract position keys
            const positionKeys = eventPositions.map(pos => 
              pos.key || getPositionKey(pos.name || pos)
            );
            
            // Find matching positions
            const workerSkillKeys = currentWorker.skills || [];
            const matchingPositionKeys = positionKeys.filter(posKey => 
              workerSkillKeys.some(skillKey => positionMatches(skillKey, posKey))
            );
            
            // Convert back to labels for display
            const matchingPositions = matchingPositionKeys.map(key => getPositionLabel(key));
            
            const daysUntil = Math.ceil((parseDateSafe(event.date) - new Date()) / (1000 * 60 * 60 * 24));
            
            return (
              <div key={event.id} className="border-2 border-blue-200 rounded-lg p-4 hover:shadow-md transition-shadow bg-blue-50">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-bold text-gray-900">{event.name}</h4>
                  {daysUntil <= 7 && (
                    <span className="bg-orange-500 text-white text-xs px-2 py-1 rounded font-semibold">
                      Soon!
                    </span>
                  )}
                </div>
                
                <div className="space-y-1 text-sm text-gray-700 mb-3">
                  <div className="flex items-center space-x-2">
                    <Calendar size={14} className="text-gray-500" />
                    <span>{parseDateSafe(event.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Clock size={14} className="text-gray-500" />
                    <span>{formatTime(event.time, timeFormat)}{event.end_time ? ` - ${formatTime(event.end_time, timeFormat)}` : ''}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <MapPin size={14} className="text-gray-500" />
                    <span>
                      {event.venue}
                      {event.room && <span className="text-gray-600"> - {event.room}</span>}
                    </span>
                  </div>
                  {event.address && (
                    <div className="mt-2 p-2 bg-white rounded border border-gray-200">
                      <p className="text-xs font-semibold text-gray-700 mb-1">Address:</p>
                      <p className="text-xs text-gray-900 mb-1">{event.address}</p>
                      <a 
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 text-xs font-medium inline-flex items-center space-x-1"
                      >
                        <MapPin size={12} />
                        <span>Open in Google Maps</span>
                      </a>
                    </div>
                  )}
                  {paymentTrackingEnabled && eventPaymentSettings[event.id] && (
                    <div className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-700">Estimated Pay:</span>
                        <span className="text-sm font-bold text-green-700">
                          ~${eventPaymentSettings[event.id].hours && payRates[matchingPositions[0]] 
                            ? (eventPaymentSettings[event.id].hours * payRates[matchingPositions[0]]).toFixed(0)
                            : '???'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">
                        {eventPaymentSettings[event.id].hours || '?'} hrs • Plus travel pay
                      </p>
                    </div>
                  )}
                </div>
                
                <div className="mb-3">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Available Positions:</p>
                  <div className="flex flex-wrap gap-2">
                    {matchingPositions.map(position => (
                      <button
                        key={position}
                        onClick={() => applyToEvent(event, position)}
                        disabled={applying}
                        className="bg-green-600 text-white text-xs px-3 py-1 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                      >
                        Apply: {position}
                      </button>
                    ))}
                  </div>
                </div>
                
                {event.notes && (
                  <p className="text-xs text-gray-600 bg-yellow-50 p-2 rounded border border-yellow-200">
                    📝 {event.notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

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
    );
}
