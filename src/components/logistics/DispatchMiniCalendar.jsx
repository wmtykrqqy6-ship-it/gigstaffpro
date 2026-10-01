import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { parseDateSafe } from '../../utils/dateHelpers';

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Month picker for the dispatch board: click a day to plan it. Each day with
// events is marked like a scheduling app (Dylan's reference, 2026-09-30):
//   ✓ green       every event is on a vehicle
//   — grey        something isn't on a vehicle yet
//   red dashed    the day has a problem (no truck, over capacity, clash...)
// Below: quick lists of the month's days that need a truck / have conflicts.
//
// statuses: { 'YYYY-MM-DD': { status, events, errors } } from monthStatuses().
export default function DispatchMiniCalendar({ date, onSelectDate, month, onMonthChange, statuses = {}, loading = false }) {
  const [listTab, setListTab] = useState('unscheduled');
  const today = ymd(new Date());

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: first.getDay() }, () => null), // Sunday-start, like the reference
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))
  ];
  const shiftMonth = (n) => onMonthChange(new Date(month.getFullYear(), month.getMonth() + n, 1));

  const monthDays = Object.entries(statuses)
    .filter(([d]) => d.startsWith(ymd(first).slice(0, 7)))
    .sort(([a], [b]) => a.localeCompare(b));
  const lists = {
    unscheduled: monthDays.filter(([, s]) => s.status === 'unscheduled'),
    conflict: monthDays.filter(([, s]) => s.status === 'conflict')
  };

  return (
    <div className="bg-white rounded-lg shadow p-3 select-none">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold text-gray-900 tracking-wide">
          {month.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()}
          {loading && <span className="ml-2 text-[10px] font-normal text-gray-400">updating…</span>}
        </span>
        <span className="flex items-center">
          <button onClick={() => shiftMonth(-1)} className="p-1 rounded hover:bg-gray-100" title="Previous month"><ChevronLeft size={18} /></button>
          <button onClick={() => shiftMonth(1)} className="p-1 rounded hover:bg-gray-100" title="Next month"><ChevronRight size={18} /></button>
        </span>
      </div>

      <div className="grid grid-cols-7 text-center text-[11px] text-gray-500 border-b pb-1 mb-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i}>{d}</span>)}
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {cells.map((d, i) => {
          if (!d) return <span key={`b${i}`} />;
          const key = ymd(d);
          const info = statuses[key];
          const status = info?.status || 'none';
          const selected = key === date;
          const isToday = key === today;
          const tip = info?.events?.length
            ? `${info.events.map(e => e.name).join(', ')}${status === 'conflict' ? ` — ${info.errors} problem${info.errors === 1 ? '' : 's'}` : status === 'unscheduled' ? ' — not all on a truck' : ''}`
            : undefined;
          return (
            <button key={key} onClick={() => onSelectDate(key)} title={tip} className="flex flex-col items-center py-0.5 group">
              <span
                className={`w-8 h-8 flex items-center justify-center rounded-full text-sm ${
                  selected ? 'bg-red-900 text-white font-semibold'
                    : status === 'conflict' ? 'border-2 border-dashed border-red-500 text-gray-900 font-semibold'
                    : isToday ? 'ring-1 ring-red-900 text-red-900 font-semibold'
                    : status !== 'none' ? 'text-gray-900 font-semibold group-hover:bg-gray-100'
                    : 'text-gray-500 group-hover:bg-gray-100'
                }`}
              >
                {d.getDate()}
              </span>
              <span className="h-3 flex items-center justify-center">
                {status === 'scheduled' && <Check size={11} className="text-green-600" strokeWidth={3} />}
                {status === 'unscheduled' && <span className="block w-2.5 h-0.5 bg-gray-500 rounded" />}
                {status === 'conflict' && <span className="block w-1 h-1 rounded-full bg-red-500" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-2 pt-2 border-t text-[11px] text-gray-600">
        <span className="flex items-center gap-1"><Check size={11} className="text-green-600" strokeWidth={3} /> Scheduled</span>
        <span className="flex items-center gap-1"><span className="block w-2.5 h-0.5 bg-gray-500 rounded" /> Not on a truck</span>
        <span className="flex items-center gap-1"><span className="block w-3 h-3 rounded-full border border-dashed border-red-500" /> Conflict</span>
      </div>

      <div className="mt-3 border-t pt-2">
        <div className="flex gap-1 mb-1.5">
          {[['unscheduled', 'Needs a truck'], ['conflict', 'Conflicts']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setListTab(id)}
              className={`flex-1 text-xs font-medium py-1 border-b-2 ${listTab === id ? 'border-red-900 text-red-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {label} ({lists[id].length})
            </button>
          ))}
        </div>
        {lists[listTab].length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-2">
            {listTab === 'unscheduled' ? 'Every event this month is on a truck.' : 'No conflicts this month.'}
          </p>
        ) : (
          <ul className="space-y-0.5 max-h-48 overflow-y-auto">
            {lists[listTab].map(([d, info]) => (
              <li key={d}>
                <button
                  onClick={() => onSelectDate(d)}
                  className={`w-full text-left rounded px-2 py-1 text-xs hover:bg-gray-50 ${d === date ? 'bg-red-50' : ''}`}
                >
                  <span className="font-semibold text-gray-900">
                    {parseDateSafe(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                  <span className="text-gray-500"> · {info.events.map(e => e.name).join(', ')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
