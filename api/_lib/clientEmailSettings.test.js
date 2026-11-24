import { describe, it, expect } from 'vitest';
import { normalizeClientEmailSettings, addDays, mondayAfter, emailDueDate } from './clientEmailSettings.js';

describe('normalizeClientEmailSettings', () => {
  it('is all off with defaults when nothing is stored', () => {
    const s = normalizeClientEmailSettings(null);
    expect(s.followup).toEqual({ on: false, days: 7 });
    expect(s.upsell).toEqual({ on: false, days: 21 });
    expect(s.review).toEqual({ on: false, days: null });
  });

  it('reads JSON text, clamps days and drops bad links', () => {
    const s = normalizeClientEmailSettings(JSON.stringify({
      followup: { on: true, days: '3' }, upsell: { on: true, days: 500 }, prep: { on: 'yes', days: -2 },
      google_review_url: 'javascript:alert(1)', tip_url: 'https://tips.example.com/x'
    }));
    expect(s.followup).toEqual({ on: true, days: 3 });
    expect(s.upsell.days).toBe(120);
    expect(s.prep).toEqual({ on: false, days: 1 });
    expect(s.google_review_url).toBe('');
    expect(s.tip_url).toBe('https://tips.example.com/x');
  });
});

describe('dates', () => {
  it('adds days across months', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2027-01-02', -21)).toBe('2026-12-12');
  });

  it('finds the Monday after', () => {
    expect(mondayAfter('2026-12-12')).toBe('2026-12-14'); // Saturday
    expect(mondayAfter('2026-12-13')).toBe('2026-12-14'); // Sunday
    expect(mondayAfter('2026-12-14')).toBe('2026-12-21'); // Monday -> next
  });

  it('works out when each email is due', () => {
    const s = normalizeClientEmailSettings({ upsell: { days: 21 }, prep: { days: 7 }, review: { days: 2 } });
    expect(emailDueDate('upsell', '2027-01-30', s)).toBe('2027-01-09');
    expect(emailDueDate('prep', '2027-01-30', s)).toBe('2027-01-23');
    expect(emailDueDate('review', '2027-01-30', s)).toBe('2027-02-01');
    expect(emailDueDate('prep', null, s)).toBe(null);
  });
});
