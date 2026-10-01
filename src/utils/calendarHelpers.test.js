import { describe, it, expect } from 'vitest';
import { ymd, startOfWeek, weekOf, monthWeeks, eventsOn, eventStaffing, staffingState, daySummary, cityState } from './calendarHelpers';

const d = (s) => { const [y, m, day] = s.split('-').map(Number); return new Date(y, m - 1, day); };

describe('weeks (Monday start)', () => {
  it('startOfWeek goes back to Monday, including from a Sunday', () => {
    expect(ymd(startOfWeek(d('2026-10-01')))).toBe('2026-09-28'); // Thu -> Mon
    expect(ymd(startOfWeek(d('2026-10-04')))).toBe('2026-09-28'); // Sun -> previous Mon
    expect(ymd(startOfWeek(d('2026-09-28')))).toBe('2026-09-28');
  });

  it('weekOf returns Mon..Sun', () => {
    expect(weekOf(d('2026-10-06')).map(ymd)).toEqual([
      '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'
    ]);
  });

  it('monthWeeks covers the whole month and nothing past it', () => {
    const weeks = monthWeeks(d('2026-10-15'));
    expect(weeks).toHaveLength(5);
    expect(ymd(weeks[0][0])).toBe('2026-09-28');
    expect(ymd(weeks.at(-1)[6])).toBe('2026-11-01');
    // February 2027 starts on a Monday and is exactly 4 weeks.
    expect(monthWeeks(d('2027-02-10'))).toHaveLength(4);
  });
});

const GENEVA = { id: 'g', name: 'Kass - Grand Geneva', date: '2026-10-06T00:00:00', time: '19:30', address: '7036 Grand Geneva Way, Lake Geneva, WI 53147', venue: 'Grand Geneva Resort & Spa', positions: [{ key: 'blackjack', count: 8 }, { key: 'craps', count: 4 }] };
const SMALL = { id: 's', name: 'Small', date: '2026-10-06', time: '18:00', positions: [{ key: 'blackjack', count: 2 }] };
const CANCELLED = { id: 'c', name: 'Gone', date: '2026-10-06', time: '12:00', status: 'cancelled', positions: [{ key: 'blackjack', count: 5 }] };
const ASSIGNMENTS = [
  { event_id: 's', status: 'confirmed' }, { event_id: 's', status: 'confirmed' }, { event_id: 's', status: 'confirmed' }, // over-filled
  { event_id: 'g', status: 'confirmed' }, { event_id: 'g', status: 'cancelled' }, { event_id: 'g', status: 'pending' }
];

describe('events and staffing', () => {
  it('eventsOn matches the date (ignoring a time suffix) and sorts by start time', () => {
    expect(eventsOn([GENEVA, SMALL, CANCELLED], d('2026-10-06')).map(e => e.id)).toEqual(['c', 's', 'g']);
    expect(eventsOn([GENEVA], d('2026-10-07'))).toEqual([]);
  });

  it('counts needed shifts and filled assignments', () => {
    expect(eventStaffing(GENEVA, ASSIGNMENTS)).toEqual({ needed: 12, filled: 1 });
    expect(eventStaffing({ id: 'x', positions: null }, [])).toEqual({ needed: 0, filled: 0 });
  });

  it('classifies staffing state', () => {
    expect(staffingState(SMALL, ASSIGNMENTS)).toBe('full');
    expect(staffingState(GENEVA, ASSIGNMENTS)).toBe('open');
    expect(staffingState({ id: 'n', positions: [] }, [])).toBe('none');
    expect(staffingState(CANCELLED, [])).toBe('cancelled');
  });

  it('day summary skips cancelled events and never counts more filled than needed', () => {
    expect(daySummary([GENEVA, SMALL, CANCELLED], ASSIGNMENTS)).toEqual({ events: 2, needed: 14, filled: 3 });
  });
});

describe('cityState', () => {
  it('pulls city and state from a full address', () => {
    expect(cityState(GENEVA)).toBe('Lake Geneva, WI');
    expect(cityState({ address: 'N112W13131 Mequon Rd, Germantown, WI 53022' })).toBe('Germantown, WI');
    expect(cityState({ address: '123 Main St, Darien, IL' })).toBe('Darien, IL');
  });

  it('falls back to the venue, then the raw address', () => {
    expect(cityState({ address: 'somewhere odd', venue: 'The Hall' })).toBe('The Hall');
    expect(cityState({ address: 'somewhere odd' })).toBe('somewhere odd');
    expect(cityState({})).toBe('');
  });
});
