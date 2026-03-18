import React, { useState } from 'react';
import { 
  Calendar, Users, AlertCircle, Plus, Clock, 
  MapPin, ChevronDown, CheckCircle, AlignJustify, History, ClipboardList, UserPlus
} from 'lucide-react';
import { getPositionLabel } from '../../utils/positionHelpers';
import { formatTime } from '../../utils/dateHelpers';

// --- Inline Schedule Section ---
function ScheduleSection({ events, assignments, workers, timeFormat, onOpenAssignModal, onNavigate }) {
  const [viewMode, setViewMode] = useState('calendar');
  const [selectedDate, setSelectedDate] = useState(new Date());

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const getEventsForDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    return events.filter(e => (e.date || '').split('T')[0] === dateStr);
  };

  const generateCalendarDays = () => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
    return days;
  };

  const changeMonth = (dir) => {
    const d = new Date(selectedDate);
    d.setMonth(d.getMonth() + dir);
    setSelectedDate(d);
  };

  const isToday = (date) => date && date.toDateString() === new Date().toDateString();

  const days = generateCalendarDays();
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // List view: events for selected date
  const selectedDateStr = (() => {
    const y = selectedDate.getFullYear();
    const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const d = String(selectedDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })();
  const dayEvents = events
    .filter(e => (e.date || '').split('T')[0] === selectedDateStr)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  return (
    <div className="bg-white rounded-lg shadow p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-gray-900">Schedule</h3>
        <div className="flex items-center space-x-2">
          {/* Toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors flex items-center space-x-1 ${
                viewMode === 'calendar' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Calendar size={14} />
              <span className="hidden sm:inline">Calendar</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors flex items-center space-x-1 ${
                viewMode === 'list' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <AlignJustify size={14} />
              <span className="hidden sm:inline">List</span>
            </button>
          </div>
          <button
            onClick={() => onNavigate('schedule')}
            className="text-xs text-red-900 hover:underline font-medium"
          >
            Full view →
          </button>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        <>
          {/* Month nav */}
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-gray-800">
              {selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h4>
            <div className="flex items-center space-x-1">
              <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-100 rounded">
                <ChevronDown size={18} className="rotate-90" />
              </button>
              <button onClick={() => setSelectedDate(new Date())} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs font-medium">
                Today
              </button>
              <button onClick={() => changeMonth(1)} className="p-2 hover:bg-gray-100 rounded">
                <ChevronDown size={18} className="-rotate-90" />
              </button>
            </div>
          </div>
          {/* Grid */}
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map(d => (
              <div key={d} className="text-center text-xs font-semibold text-gray-500 py-1">{d.charAt(0)}</div>
            ))}
            {days.map((date, i) => {
              if (!date) return <div key={`e-${i}`} className="min-h-10 md:min-h-14 bg-gray-50 rounded" />;
              const dayEvts = getEventsForDate(date);
              const isPast = date < new Date(today);
              return (
                <div
                  key={date.toISOString()}
                  onClick={() => { setSelectedDate(date); if (dayEvts.length) setViewMode('list'); }}
                  className={`min-h-10 md:min-h-14 p-1 border rounded cursor-pointer transition-colors ${
                    isToday(date) ? 'bg-red-50 border-red-300 ring-1 ring-red-200'
                    : isPast ? 'bg-gray-50 border-gray-100'
                    : dayEvts.length ? 'bg-blue-50 border-blue-200 hover:bg-blue-100'
                    : 'bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className={`text-xs font-semibold mb-0.5 ${isPast && !isToday(date) ? 'text-gray-300' : 'text-gray-800'}`}>
                    {date.getDate()}
                  </div>
                  {dayEvts.slice(0, 2).map(ev => {
                    const filled = assignments.filter(a => a.event_id === ev.id).length;
                    const total = ev.positions?.reduce((s, p) => s + p.count, 0) || 0;
                    return (
                      <div key={ev.id} className={`text-xs p-0.5 rounded mb-0.5 truncate ${
                        isPast
                          ? 'bg-gray-300 text-gray-500'
                          : filled >= total && total > 0 ? 'bg-green-600 text-white' : 'bg-yellow-500 text-white'
                      }`}>
                        {ev.name}
                      </div>
                    );
                  })}
                  {dayEvts.length > 2 && <div className="text-xs text-gray-400">+{dayEvts.length - 2}</div>}
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div className="flex items-center space-x-4 mt-3 text-xs text-gray-600">
            <span className="flex items-center space-x-1"><span className="w-3 h-3 bg-green-600 rounded inline-block" /> Staffed</span>
            <span className="flex items-center space-x-1"><span className="w-3 h-3 bg-yellow-500 rounded inline-block" /> Needs Staff</span>
          </div>
        </>
      ) : (
        <>
          {/* List view header */}
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-base font-semibold text-gray-800">
              {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h4>
            <button onClick={() => setViewMode('calendar')} className="text-xs text-red-900 hover:underline flex items-center space-x-1">
              <Calendar size={13} />
              <span>Calendar</span>
            </button>
          </div>
          {dayEvents.length === 0 ? (
            <div className="text-center py-8">
              <Calendar size={40} className="mx-auto text-gray-300 mb-2" />
              <p className="text-gray-500 text-sm">No events on this date</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dayEvents.map(event => {
                const eventAssignments = assignments.filter(a => a.event_id === event.id);
                const total = event.positions?.reduce((s, p) => s + p.count, 0) || 0;
                const filled = eventAssignments.length;
                return (
                  <div key={event.id} className="border rounded-lg p-3 hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h5 className="font-bold text-gray-900">{event.name}</h5>
                        <div className="flex flex-wrap gap-3 text-xs text-gray-600 mt-1">
                          <span className="flex items-center space-x-1"><Clock size={12} /><span>{formatTime(event.time, timeFormat)}{event.end_time ? ` - ${formatTime(event.end_time, timeFormat)}` : ''}</span></span>
                          <span className="flex items-center space-x-1"><MapPin size={12} /><span>{event.venue}</span></span>
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${
                        filled >= total && total > 0 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>{filled}/{total}</span>
                    </div>
                    {eventAssignments.length > 0 && (
                      <div className="mt-2 pt-2 border-t grid grid-cols-1 sm:grid-cols-2 gap-1">
                        {eventAssignments.map(a => {
                          const w = workers.find(w => w.id === a.worker_id);
                          if (!w) return null;
                          return (
                            <div key={a.id} className="flex items-center space-x-2 text-xs bg-gray-50 p-1.5 rounded">
                              <CheckCircle size={12} className="text-green-600 flex-shrink-0" />
                              <span className="font-medium">{w.name}</span>
                              <span className="text-gray-500">• {getPositionLabel(a.position)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <button
                      onClick={() => onOpenAssignModal(event)}
                      className="mt-2 w-full text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 flex items-center justify-center space-x-1"
                    >
                      <Users size={12} />
                      <span>Assign Staff</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// --- Main Dashboard ---

export default function DashboardView({
  events,
  workers,
  assignments,
  timeFormat,
  onNavigate,
  onShowAddEvent,
  onShowAddWorker,
  onOpenAssignModal,
  activeLocation = 'all'
}) {
  // Filter events by active location context
  const scopedEvents = activeLocation === 'all'
    ? events
    : events.filter(e => e.location_id === activeLocation);

  // Scope workers by location using worker_locations (passed via assignments proxy)
  // We scope by events in this location to find active workers
  const scopedWorkerIds = activeLocation === 'all'
    ? null
    : [...new Set(assignments
        .filter(a => scopedEvents.some(e => e.id === a.event_id))
        .map(a => a.worker_id))];
  const scopedWorkers = scopedWorkerIds
    ? workers.filter(w => scopedWorkerIds.includes(w.id))
    : workers;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ── Unfilled Position Alerts ──
  const getUnfilledAlerts = () => {
    const now = new Date();
    const alerts = [];
    scopedEvents.forEach(event => {
      if (event.status === 'cancelled' || event.status === 'archived' || event.status === 'completed') return;
      if (!event.positions || event.positions.length === 0) return;

      // Parse date safely — treat YYYY-MM-DD as local, not UTC
      const [y, m, d] = (event.date || '').split('-').map(Number);
      if (!y) return;
      const eventDate = new Date(y, m - 1, d);
      eventDate.setHours(0, 0, 0, 0);
      if (eventDate < today) return;

      const daysUntil = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
      let hoursUntil = daysUntil * 24;
      if (event.time) {
        const [th, tm] = event.time.split(':').map(Number);
        const eventDateTime = new Date(y, m - 1, d, th, tm || 0);
        hoursUntil = (eventDateTime - now) / (1000 * 60 * 60);
      }

      const is24h = hoursUntil >= 0 && hoursUntil <= 24;
      const is7day = daysUntil <= 7;
      if (!is24h && !is7day) return;

      const unfilledPositions = event.positions.map(pos => {
        const posKey = pos.key || pos.name;
        const filled = assignments.filter(a =>
          a.event_id === event.id &&
          !['standby', 'rejected', 'cancelled', 'pending'].includes(a.status) &&
          (a.position === posKey || a.position === pos.key || a.position === pos.name)
        ).length;
        const open = (pos.count || 1) - filled;
        const label = getPositionLabel(posKey) !== posKey
          ? getPositionLabel(posKey)
          : (pos.label || posKey);
        return open > 0 ? { label, open, needed: pos.count || 1 } : null;
      }).filter(Boolean);

      if (unfilledPositions.length === 0) return;
      alerts.push({ event, unfilledPositions, daysUntil, hoursUntil, tier: is24h ? '24h' : '7day' });
    });
    return alerts.sort((a, b) => a.tier === b.tier ? a.daysUntil - b.daysUntil : a.tier === '24h' ? -1 : 1);
  };
  const unfilledAlerts = getUnfilledAlerts();

  const upcomingEvents = scopedEvents.filter(e => {
    if (e.status === 'completed' || e.status === 'cancelled' || e.status === 'archived') return false;
    const eventDate = new Date(e.date);
    eventDate.setHours(0, 0, 0, 0);
    return eventDate >= today;
  }).length;
  const needStaffing = scopedEvents.filter(e => {
    if (e.status === 'completed' || e.status === 'cancelled' || e.status === 'archived') return false;
    const eventDate = new Date(e.date);
    eventDate.setHours(0, 0, 0, 0);
    if (eventDate < today) return false;
    const eventAssignments = assignments.filter(a => a.event_id === e.id);
    const totalNeeded = e.positions?.reduce((sum, p) => sum + p.count, 0) || 0;
    const filled = eventAssignments.length;
    return filled < totalNeeded && totalNeeded > 0;
  }).length;

  // Get recent activity
  const getRecentActivity = () => {
    const activities = [];
    
    // Recent events (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    events.forEach(event => {
      const eventDate = new Date(event.created_at);
      if (eventDate >= sevenDaysAgo) {
        activities.push({
          type: 'event_created',
          date: event.created_at,
          message: `Event created: ${event.name}`,
          icon: Calendar,
          color: 'blue'
        });
      }
    });

    // Recent assignments (last 7 days)
    assignments.forEach(assignment => {
      const assignmentDate = new Date(assignment.created_at);
      if (assignmentDate >= sevenDaysAgo) {
        const worker = workers.find(w => w.id === assignment.worker_id);
        const event = events.find(e => e.id === assignment.event_id);
        if (worker && event) {
          activities.push({
            type: 'assignment',
            date: assignment.created_at,
            message: `${worker.name} assigned to ${event.name} as ${getPositionLabel(assignment.position)}`,
            icon: Users,
            color: 'green'
          });
        }
      }
    });

    // New worker signups (last 7 days)
    workers.forEach(worker => {
      if (!worker.created_at) return;
      const workerDate = new Date(worker.created_at);
      if (workerDate >= sevenDaysAgo) {
        activities.push({
          type: 'new_worker',
          date: worker.created_at,
          message: `New worker signed up: ${worker.name}`,
          icon: UserPlus,
          color: 'purple'
        });
      }
    });

    // Sort by date (newest first) and take top 10
    return activities
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);
  };

  const recentActivity = getRecentActivity();

  // Navigate to events filtered by status
  const viewEventsByFilter = (filter) => {
    onNavigate('events');
    // In a full implementation, you'd pass the filter to EventsView
    // For now, just navigate to events
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <h2 className="text-3xl font-bold text-gray-900">Dashboard</h2>
        <div className="flex space-x-2">
          <button
            onClick={onShowAddEvent}
            className="flex-1 sm:flex-none bg-red-900 text-white px-4 py-2 rounded-lg hover:bg-red-800 flex items-center justify-center space-x-2 text-sm"
          >
            <Plus size={18} />
            <span>New Event</span>
          </button>
          <button
            onClick={onShowAddWorker}
            className="flex-1 sm:flex-none bg-gray-700 text-white px-4 py-2 rounded-lg hover:bg-gray-600 flex items-center justify-center space-x-2 text-sm"
          >
            <Plus size={18} />
            <span>New Worker</span>
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        <button
          onClick={() => onNavigate('events')}
          className="bg-white p-4 md:p-6 rounded-lg shadow border-l-4 border-red-600 hover:shadow-lg transition-shadow text-left"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-xs md:text-sm">Upcoming Events</p>
              <p className="text-2xl md:text-3xl font-bold text-gray-900">{upcomingEvents}</p>
              <p className="text-xs text-red-600 mt-1">View all →</p>
            </div>
            <Calendar className="text-red-600" size={32} />
          </div>
        </button>
        
        <button
          onClick={() => viewEventsByFilter('needs-staff')}
          className="bg-white p-4 md:p-6 rounded-lg shadow border-l-4 border-yellow-500 hover:shadow-lg transition-shadow text-left"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-xs md:text-sm">Need Staffing</p>
              <p className="text-2xl md:text-3xl font-bold text-gray-900">{needStaffing}</p>
              <p className="text-xs text-yellow-600 mt-1">View →</p>
            </div>
            <AlertCircle className="text-yellow-500" size={32} />
          </div>
        </button>

        <button
          onClick={() => onNavigate('staff')}
          className="bg-white p-4 md:p-6 rounded-lg shadow border-l-4 border-green-600 hover:shadow-lg transition-shadow text-left"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-xs md:text-sm">Active Workers</p>
              <p className="text-2xl md:text-3xl font-bold text-gray-900">{scopedWorkers.length}</p>
              <p className="text-xs text-green-600 mt-1">Manage →</p>
            </div>
            <Users className="text-green-600" size={32} />
          </div>
        </button>

        <button
          onClick={() => onNavigate('schedule')}
          className="bg-white p-4 md:p-6 rounded-lg shadow border-l-4 border-blue-600 hover:shadow-lg transition-shadow text-left"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-xs md:text-sm">Total Events</p>
              <p className="text-2xl md:text-3xl font-bold text-gray-900">{scopedEvents.length}</p>
              <p className="text-xs text-blue-600 mt-1">Schedule →</p>
            </div>
            <ClipboardList className="text-blue-600" size={32} />
          </div>
        </button>
      </div>

      {/* Staffing Alerts */}
      {unfilledAlerts.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center space-x-2 mb-4">
            <AlertCircle size={20} className="text-red-500 flex-shrink-0" />
            <h3 className="text-xl font-bold text-gray-900">Staffing Alerts</h3>
            <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">{unfilledAlerts.length}</span>
          </div>
          <div className="space-y-2">
            {unfilledAlerts.map(({ event, unfilledPositions, daysUntil, hoursUntil, tier }) => (
              <div
                key={event.id}
                onClick={() => onOpenAssignModal(event)}
                className={`flex items-center justify-between p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                  tier === '24h'
                    ? 'bg-red-50 border-red-200 hover:border-red-400'
                    : 'bg-amber-50 border-amber-200 hover:border-amber-400'
                }`}
              >
                <div className="min-w-0 flex-1">
                  {/* Event name + time badge */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${
                      tier === '24h'
                        ? 'bg-red-500 text-white'
                        : daysUntil === 0 ? 'bg-orange-500 text-white'
                        : daysUntil === 1 ? 'bg-orange-400 text-white'
                        : 'bg-amber-400 text-amber-900'
                    }`}>
                      {tier === '24h'
                        ? hoursUntil < 1 ? 'NOW' : `${Math.round(hoursUntil)}h away`
                        : daysUntil === 0 ? 'TODAY'
                        : daysUntil === 1 ? 'TOMORROW'
                        : `${daysUntil} days`
                      }
                    </span>
                    <span className="font-bold text-gray-900 text-sm truncate">{event.name}</span>
                    {event.venue && (
                      <span className="text-xs text-gray-400 truncate hidden sm:block">· {event.venue}</span>
                    )}
                  </div>
                  {/* Open position pills */}
                  <div className="flex flex-wrap gap-1.5">
                    {unfilledPositions.map(({ label, open }) => (
                      <span key={label} className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-semibold ${
                        tier === '24h'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {label}
                        <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-xs font-bold ${
                          tier === '24h' ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'
                        }`}>{open}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <button className={`flex-shrink-0 ml-4 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                  tier === '24h'
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-amber-500 text-white hover:bg-amber-600'
                }`}>
                  Assign
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next 7 Days - high priority, right after stat cards */}
      {(() => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const sevenDaysOut = new Date(now);
        sevenDaysOut.setDate(now.getDate() + 7);
        sevenDaysOut.setHours(23, 59, 59, 999);

        const weekEvents = scopedEvents
          .filter(event => {
            if (event.status === 'cancelled' || event.status === 'archived') return false;
            const eventDate = new Date(event.date);
            return eventDate >= now && eventDate <= sevenDaysOut;
          })
          .sort((a, b) => new Date(a.date) - new Date(b.date));

        return (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Next 7 Days</h3>
              <button onClick={() => onNavigate('events')} className="text-xs text-red-600 hover:underline font-medium">View all →</button>
            </div>

            {weekEvents.length === 0 ? (
              <div className="text-center py-10">
                <Calendar size={40} className="mx-auto text-gray-200 mb-3" />
                <p className="text-gray-400 text-sm">No events in the next 7 days</p>
                <button onClick={() => onNavigate('events')} className="mt-3 text-xs text-red-600 hover:underline font-medium">+ Create an event</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {weekEvents.map(event => {
                  const eventAssignments = assignments.filter(a => a.event_id === event.id);
                  const totalNeeded = event.positions?.reduce((sum, p) => sum + p.count, 0) || 0;
                  const filled = eventAssignments.length;
                  const isFullyStaffed = filled >= totalNeeded && totalNeeded > 0;
                  const eventDate = new Date(event.date);
                  const daysUntil = Math.ceil((eventDate - now) / (1000 * 60 * 60 * 24));
                  const urgencyBorder = daysUntil === 0 ? 'border-l-red-500'
                    : daysUntil === 1 ? 'border-l-orange-400'
                    : !isFullyStaffed ? 'border-l-yellow-400'
                    : 'border-l-green-500';

                  return (
                    <div
                      key={event.id}
                      className={`p-3 border border-l-4 ${urgencyBorder} rounded-lg hover:shadow-md transition-all cursor-pointer bg-white`}
                      onClick={() => onOpenAssignModal(event)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-semibold text-gray-900 text-sm truncate">{event.name}</h4>
                          <div className="flex items-center space-x-1 mt-0.5">
                            {daysUntil === 0 && <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded font-bold">TODAY</span>}
                            {daysUntil === 1 && <span className="bg-orange-400 text-white text-xs px-1.5 py-0.5 rounded font-bold">TOMORROW</span>}
                            {daysUntil > 1 && <span className="text-xs text-gray-400">in {daysUntil} days</span>}
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0 ml-2 ${
                          isFullyStaffed ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {filled}/{totalNeeded}
                        </span>
                      </div>
                      <div className="space-y-1 text-xs text-gray-500">
                        <div className="flex items-center space-x-1">
                          <Calendar size={11} className="flex-shrink-0" />
                          <span>{eventDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                          <span className="text-gray-300">·</span>
                          <Clock size={11} className="flex-shrink-0" />
                          <span>{formatTime(event.time, timeFormat)}</span>
                        </div>
                        {event.venue && (
                          <div className="flex items-center space-x-1">
                            <MapPin size={11} className="flex-shrink-0" />
                            <span className="truncate">{event.venue}</span>
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
      })()}

      {/* Schedule Calendar */}
      <ScheduleSection
        events={scopedEvents}
        assignments={assignments}
        workers={workers}
        timeFormat={timeFormat}
        onOpenAssignModal={onOpenAssignModal}
        onNavigate={onNavigate}
      />

      {/* Recent Activity - full width at bottom */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-900">Recent Activity</h3>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">Last 7 days</span>
        </div>
        {recentActivity.length === 0 ? (
          <div className="text-center py-10">
            <History size={40} className="mx-auto text-gray-200 mb-3" />
            <p className="text-gray-400 text-sm">No activity in the last 7 days</p>
          </div>
        ) : (
          <div className="relative">
            <div
              className="grid grid-cols-1 md:grid-cols-2 gap-1 max-h-64 overflow-y-auto pr-1"
              style={{ scrollbarWidth: 'thin', scrollbarColor: '#e5e7eb transparent' }}
            >
              {recentActivity.map((activity, index) => {
                const Icon = activity.icon;
                const colorClasses = {
                  blue: 'bg-blue-100 text-blue-600',
                  green: 'bg-green-100 text-green-600',
                  red: 'bg-red-100 text-red-600',
                  yellow: 'bg-yellow-100 text-yellow-600',
                  purple: 'bg-purple-100 text-purple-600'
                };
                return (
                  <div key={index} className="flex items-start space-x-3 px-3 py-2.5 hover:bg-gray-50 rounded-lg transition-colors">
                    <div className={`p-1.5 rounded-lg flex-shrink-0 ${colorClasses[activity.color]}`}>
                      <Icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 leading-snug">{activity.message}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(activity.date).toLocaleString('en-US', {
                          month: 'short', day: 'numeric',
                          hour: 'numeric', minute: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none rounded-b" />
          </div>
        )}
      </div>
    </div>
  );
}
