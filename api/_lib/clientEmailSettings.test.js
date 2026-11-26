import { describe, it, expect } from 'vitest';
import { normalizeClientEmailSettings, addDays, mondayAfter, emailDueDate, MAX_CUSTOM_EMAILS, templateValues, fillSubject, renderMessageHtml, awayText } from './clientEmailSettings.js';

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

describe('custom wording and custom emails', () => {
  it('keeps wording only when set, and cleans custom emails', () => {
    const s = normalizeClientEmailSettings({
      upsell: { on: true, days: 21, subject: '  Big  night ', message: 'Hi {first_name}\r\n' },
      prep: { on: true, subject: '', message: '' },
      custom: [
        { id: 'abc123', name: 'Halloween', on: true, trigger: 'before_event', days: 400, subject: 'Boo', message: 'Hi' },
        { id: 'abc123', name: 'dupe' },
        { id: 'bad id!', name: 'x' },
        { id: 'zz9999', trigger: 'nonsense', days: 'x' }
      ]
    });
    expect(s.upsell).toEqual({ on: true, days: 21, subject: 'Big night', message: 'Hi {first_name}' });
    expect(s.prep).toEqual({ on: true, days: 7 });
    expect(s.custom.map(c => c.id)).toEqual(['abc123', 'zz9999']);
    expect(s.custom[0].days).toBe(365);
    expect(s.custom[1]).toMatchObject({ name: 'Custom email', on: false, trigger: 'before_event', days: 7 });
  });

  it('caps the number of custom emails', () => {
    const custom = Array.from({ length: 15 }, (_, i) => ({ id: `id${String(i).padStart(4, '0')}` }));
    expect(normalizeClientEmailSettings({ custom }).custom).toHaveLength(MAX_CUSTOM_EMAILS);
  });

  it('fills in blanks, escapes, makes bullets, bold and links', () => {
    const values = templateValues({ name: 'Pat <b>Lee</b>', event_date: '2027-01-30' },
      { settings: { google_review_url: 'https://g.page/r/x', tip_url: '' }, eventDateText: 'Saturday, January 30', daysAway: 21, phone: '(262) 549-3559' });
    expect(values.first_name).toBe('Pat');
    expect(fillSubject('{days_away} to go, {first_name}! {nope}', values)).toBe('3 weeks to go, Pat! {nope}');
    const html = renderMessageHtml('Hi {name},\n\n- **Review:** {review_link}\n- Tip: {tip_link}\n\nSee https://vegasonwheels.com.', values);
    expect(html).toContain('Pat &lt;b&gt;Lee&lt;/b&gt;');
    expect(html).toContain('<li style="margin:0 0 6px"><strong>Review:</strong> <a href="https://g.page/r/x"');
    expect(html).not.toContain('Tip:'); // no tip link set: line left out
    expect(html).toContain('<a href="https://vegasonwheels.com" style="color:#7c0a02">https://vegasonwheels.com</a>.');
  });

  it('says how far away the event is', () => {
    expect(awayText(21)).toBe('3 weeks');
    expect(awayText(7)).toBe('1 week');
    expect(awayText(10)).toBe('10 days');
    expect(awayText(1)).toBe('1 day');
  });
});
