// Date and staffing helpers for the Schedule tab's calendar (MonthCalendar).
// Weeks start on Monday.
import { isAssignmentFilled } from './positionHelpers';

export const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (d.getDay() + 6) % 7; // Mon=0 ... Sun=6
  d.setDate(d.getDate() - offset);
  return d;
}

const addDays = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

export const weekOf = (date) => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date), i));

// Every Monday-start week that contains a day of viewDate's month.
export function monthWeeks(viewDate) {
  const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const last = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
  const weeks = [];
  for (let start = startOfWeek(first); start <= last; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  }
  return weeks;
}

export const eventsOn = (events, date) => {
  const key = ymd(date);
  return events
    .filter(e => (e.date || '').split('T')[0] === key)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
};

// Shifts needed (sum of position counts) vs filled assignments.
export function eventStaffing(event, assignments = []) {
  const needed = (event.positions || []).reduce((sum, p) => sum + (Number(p?.count) || 0), 0);
  const filled = assignments.filter(a => a.event_id === event.id && isAssignmentFilled(a.status)).length;
  return { needed, filled };
}

// 'full' (every shift filled), 'open' (shifts unfilled), 'none' (no positions), 'cancelled'.
export function staffingState(event, assignments = []) {
  if (event.status === 'cancelled') return 'cancelled';
  const { needed, filled } = eventStaffing(event, assignments);
  if (needed === 0) return 'none';
  return filled >= needed ? 'full' : 'open';
}

export function daySummary(dayEvents = [], assignments = []) {
  const active = dayEvents.filter(e => e.status !== 'cancelled');
  return active.reduce(
    (acc, e) => {
      const s = eventStaffing(e, assignments);
      return { events: acc.events + 1, needed: acc.needed + s.needed, filled: acc.filled + Math.min(s.filled, s.needed) };
    },
    { events: 0, needed: 0, filled: 0 }
  );
}

// "7036 Grand Geneva Way, Lake Geneva, WI 53147" -> "Lake Geneva, WI".
// Falls back to the venue, then the raw address.
export function cityState(event) {
  const parts = String(event?.address || '').split(',').map(p => p.trim()).filter(Boolean);
  const stateIdx = parts.findIndex(p => /^[A-Z]{2}(\s+\d{5}(-\d{4})?)?$/.test(p));
  if (stateIdx > 0) return `${parts[stateIdx - 1]}, ${parts[stateIdx].slice(0, 2)}`;
  return event?.venue || event?.address || '';
}
