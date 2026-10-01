import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { formatTime } from '../utils/dateHelpers';
import {
  ymd, weekOf, monthWeeks, eventsOn, eventStaffing, staffingState, daySummary, cityState
} from '../utils/calendarHelpers';

// The Schedule tab's calendar. Layout modelled on a competitor's calendar
// Dylan preferred (2026-09-30): Monday-start weeks, a header per day with an
// "N events | filled/needed shifts" summary, and a full card per event (name,
// time range, city, one dot per shift) coloured by staffing.
//
// Controlled on which date is showing (viewDate/onViewDateChange) rather than
// owning it: ScheduleView reuses that same Date for "which day is selected"
// in its List view, so the calendar remembers where it was across a
// drill-into-a-day-and-back round trip.
const CARD_STYLES = {
  full: 'bg-green-50 border-green-200 border-l-green-600',
  open: 'bg-yellow-50 border-yellow-200 border-l-yellow-500',
  none: 'bg-gray-50 border-gray-200 border-l-gray-400',
  cancelled: 'bg-gray-50 border-gray-200 border-l-gray-300 opacity-60'
};
const MAX_DOTS = 24;

export default function MonthCalendar({
  events = [],
  assignments = [],
  viewDate,
  onViewDateChange,
  onDayClick,
  onSelectEvent,
  timeFormat
}) {
  const [range, setRange] = useState('month'); // 'month' | 'week'

  const today = ymd(new Date());
  const weeks = range === 'month' ? monthWeeks(viewDate) : [weekOf(viewDate)];
  const inViewMonth = (date) => range === 'week' || date.getMonth() === viewDate.getMonth();

  const shift = (direction) => {
    const d = new Date(viewDate);
    if (range === 'month') {
      d.setDate(1);
      d.setMonth(d.getMonth() + direction);
    } else {
      d.setDate(d.getDate() + 7 * direction);
    }
    onViewDateChange(d);
  };

  const monthKey = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`;
  const titleCount = range === 'month'
    ? events.filter(e => (e.date || '').startsWith(monthKey) && e.status !== 'cancelled').length
    : weeks[0].reduce((n, day) => n + daySummary(eventsOn(events, day), assignments).events, 0);
  const title = range === 'month'
    ? viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : `${weeks[0][0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weeks[0][6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const time = (t) => (t ? formatTime(t.slice(0, 5), timeFormat) : '');

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b">
        <h3 className="text-xl font-semibold text-gray-900">
          {title} <span className="text-gray-500 font-normal">({titleCount})</span>
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-sm">
            {[['week', '7-Day View'], ['month', 'Month View']].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setRange(id)}
                className={`px-3 py-1.5 font-medium ${range === id ? 'bg-red-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-sm">
            <button onClick={() => shift(-1)} className="px-2 py-1.5 bg-white hover:bg-gray-50" title="Previous">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => onViewDateChange(new Date())} className="px-3 py-1.5 bg-white hover:bg-gray-50 font-medium border-x border-gray-300">
              Go to Today
            </button>
            <button onClick={() => shift(1)} className="px-2 py-1.5 bg-white hover:bg-gray-50" title="Next">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Weeks: wide grid, scrolls sideways on narrow screens */}
      <div className="overflow-x-auto">
        <div className="min-w-[56rem]">
          {weeks.map(week => (
            <div key={ymd(week[0])} className="grid grid-cols-7 border-b last:border-b-0">
              {week.map(day => {
                const key = ymd(day);
                const dayEvents = eventsOn(events, day);
                const summary = daySummary(dayEvents, assignments);
                const isToday = key === today;
                const muted = !inViewMonth(day);
                return (
                  <div
                    key={key}
                    className={`border-r last:border-r-0 flex flex-col ${range === 'week' ? 'min-h-[24rem]' : 'min-h-[9rem]'} ${
                      isToday ? 'bg-red-50/60' : muted ? 'bg-gray-50' : ''
                    }`}
                  >
                    <button
                      onClick={() => { onViewDateChange(day); if (dayEvents.length) onDayClick?.(day, dayEvents); }}
                      className={`text-left px-3 pt-2 pb-2 border-b ${isToday ? 'border-t-4 border-t-red-900 pt-1' : ''} hover:bg-gray-50`}
                    >
                      <div className={`text-sm font-semibold ${isToday ? 'text-red-900' : muted ? 'text-gray-400' : 'text-gray-800'}`}>
                        {day.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}{' '}
                        <span className="font-normal">{day.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })}</span>
                      </div>
                      <div className={`text-[11px] ${isToday ? 'text-red-800' : 'text-gray-500'}`}>
                        {summary.events
                          ? `${summary.events} event${summary.events === 1 ? '' : 's'}`
                          : dayEvents.length ? `${dayEvents.length} cancelled` : 'No events'} | {summary.filled}/{summary.needed} shifts
                      </div>
                    </button>

                    <div className="p-1.5 space-y-1.5 flex-1">
                      {dayEvents.map(event => {
                        const state = staffingState(event, assignments);
                        const { needed, filled } = eventStaffing(event, assignments);
                        const shown = Math.min(needed, MAX_DOTS);
                        const where = cityState(event);
                        return (
                          <button
                            key={event.id}
                            onClick={() => onSelectEvent?.(event)}
                            title={`${event.name}${needed ? ` — ${Math.min(filled, needed)}/${needed} shifts filled` : ''}`}
                            className={`block w-full text-left border border-l-4 rounded px-2 py-1.5 hover:shadow-sm transition-shadow ${CARD_STYLES[state]}`}
                          >
                            <div className={`text-xs font-semibold text-gray-900 leading-snug line-clamp-2 ${state === 'cancelled' ? 'line-through' : ''}`}>
                              {event.name}
                            </div>
                            {event.time && (
                              <div className="text-[11px] text-gray-600">
                                {time(event.time)}{event.end_time ? ` – ${time(event.end_time)}` : ''}
                              </div>
                            )}
                            {where && (
                              <div className="text-[11px] text-gray-600 flex items-center gap-0.5 truncate">
                                <MapPin size={10} className="flex-shrink-0" /> <span className="truncate">{where}</span>
                              </div>
                            )}
                            {needed > 0 && state !== 'cancelled' && (
                              <div className="flex flex-wrap items-center gap-[3px] mt-1">
                                {Array.from({ length: shown }, (_, i) => (
                                  <span
                                    key={i}
                                    className={`inline-block w-1.5 h-1.5 rounded-full ${
                                      i < filled ? 'bg-green-600' : 'border border-yellow-500 bg-white'
                                    }`}
                                  />
                                ))}
                                {needed > MAX_DOTS && <span className="text-[10px] text-gray-500 ml-0.5">+{needed - MAX_DOTS}</span>}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 sm:px-6 py-3 border-t text-xs text-gray-600">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-50 border border-green-200 border-l-4 border-l-green-600" /> Fully staffed</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-yellow-50 border border-yellow-200 border-l-4 border-l-yellow-500" /> Needs staff</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-600" /> Filled shift</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full border border-yellow-500" /> Open shift</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 border-t-4 border-t-red-900 bg-red-50" /> Today</span>
      </div>
    </div>
  );
}
