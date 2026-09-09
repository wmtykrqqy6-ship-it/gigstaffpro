import { describe, it, expect } from 'vitest';
import { parseDateSafe, parseTimeToMinutes, timeRangesOverlap, formatTime } from './dateHelpers';

// parseDateSafe exists because raw `new Date("YYYY-MM-DD")` parses as UTC
// midnight, which can display as the previous day in US timezones. This
// exact bug recurred five separate times across the codebase this session
// (WorkerPortalView, DashboardView, ProfileView, AvailableEventsSection,
// PaymentsView, ScheduleView) before each was caught and fixed. These
// tests exist to make sure it doesn't come back a sixth time.
describe('parseDateSafe', () => {
  it('parses a YYYY-MM-DD string as a local date, not UTC', () => {
    const d = parseDateSafe('2026-12-25');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(11); // 0-indexed: December
    expect(d.getDate()).toBe(25);
  });

  it('does not shift the date backward regardless of the machine timezone', () => {
    // The bug this guards against: new Date('2026-01-01') in a
    // negative-UTC-offset timezone displays as Dec 31 of the prior year.
    const d = parseDateSafe('2026-01-01');
    expect(d.getDate()).toBe(1);
    expect(d.getMonth()).toBe(0);
  });

  it('strips a time component if present (handles a full ISO timestamp)', () => {
    const d = parseDateSafe('2026-06-15T00:00:00.000Z');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(15);
  });

  it('returns a Date (today) for an empty/null input rather than throwing', () => {
    expect(parseDateSafe(null)).toBeInstanceOf(Date);
    expect(parseDateSafe('')).toBeInstanceOf(Date);
  });
});

describe('parseTimeToMinutes', () => {
  it('converts HH:MM into minutes since midnight', () => {
    expect(parseTimeToMinutes('00:00')).toBe(0);
    expect(parseTimeToMinutes('01:30')).toBe(90);
    expect(parseTimeToMinutes('23:59')).toBe(1439);
  });

  it('returns null for missing input', () => {
    expect(parseTimeToMinutes(null)).toBeNull();
    expect(parseTimeToMinutes('')).toBeNull();
  });
});

describe('timeRangesOverlap', () => {
  it('detects a genuine overlap', () => {
    // 6pm-10pm vs 9pm-11pm overlaps
    expect(timeRangesOverlap(18 * 60, 22 * 60, 21 * 60, 23 * 60)).toBe(true);
  });

  it('returns false for back-to-back (non-overlapping) ranges', () => {
    // 6pm-9pm vs 9pm-11pm do not overlap (touching, not overlapping)
    expect(timeRangesOverlap(18 * 60, 21 * 60, 21 * 60, 23 * 60)).toBe(false);
  });

  it('returns false when either end time is missing (cannot determine)', () => {
    expect(timeRangesOverlap(18 * 60, 0, 21 * 60, 23 * 60)).toBe(false);
    expect(timeRangesOverlap(18 * 60, 22 * 60, 21 * 60, 0)).toBe(false);
  });
});

describe('formatTime', () => {
  it('formats to 12-hour with AM/PM by default', () => {
    expect(formatTime('00:00')).toBe('12:00 AM');
    expect(formatTime('13:05')).toBe('1:05 PM');
    expect(formatTime('23:59')).toBe('11:59 PM');
  });

  it('formats to 24-hour when requested', () => {
    expect(formatTime('13:05', '24')).toBe('13:05');
  });

  it('returns empty string for missing input', () => {
    expect(formatTime(null)).toBe('');
  });
});
