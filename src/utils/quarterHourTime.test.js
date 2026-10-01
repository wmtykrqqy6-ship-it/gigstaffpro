import { describe, it, expect } from 'vitest';
import { splitTime, joinTime } from './quarterHourTime';

describe('splitTime', () => {
  it('splits 24h values into 12h parts', () => {
    expect(splitTime('19:30')).toEqual({ hour: '7', minute: '30', meridiem: 'PM' });
    expect(splitTime('00:15')).toEqual({ hour: '12', minute: '15', meridiem: 'AM' });
    expect(splitTime('12:00')).toEqual({ hour: '12', minute: '00', meridiem: 'PM' });
    expect(splitTime('09:45:00')).toEqual({ hour: '9', minute: '45', meridiem: 'AM' });
  });

  it('shows off-quarter values rounded', () => {
    expect(splitTime('19:38')).toEqual({ hour: '7', minute: '45', meridiem: 'PM' });
  });

  it('supports the 24-hour setting', () => {
    expect(splitTime('19:30', '24')).toEqual({ hour: '19', minute: '30', meridiem: 'PM' });
    expect(splitTime('07:00', '24').hour).toBe('07');
  });

  it('handles empty/invalid values', () => {
    expect(splitTime('')).toEqual({ hour: '', minute: '', meridiem: 'PM' });
    expect(splitTime(null).hour).toBe('');
    expect(splitTime('soon').hour).toBe('');
  });
});

describe('joinTime', () => {
  it('joins 12h parts into 24h "HH:MM"', () => {
    expect(joinTime({ hour: '7', minute: '30', meridiem: 'PM' })).toBe('19:30');
    expect(joinTime({ hour: '12', minute: '00', meridiem: 'AM' })).toBe('00:00');
    expect(joinTime({ hour: '12', minute: '45', meridiem: 'PM' })).toBe('12:45');
    expect(joinTime({ hour: '9', minute: '15', meridiem: 'AM' })).toBe('09:15');
  });

  it('picking only an hour fills in :00, PM by default', () => {
    const empty = splitTime('');
    expect(joinTime({ ...empty, hour: '7' })).toBe('19:00');
  });

  it('clearing the hour clears the time', () => {
    expect(joinTime({ hour: '', minute: '30', meridiem: 'PM' })).toBe('');
  });

  it('supports the 24-hour setting', () => {
    expect(joinTime({ hour: '07', minute: '15', meridiem: 'AM' }, '24')).toBe('07:15');
    expect(joinTime({ hour: '19', minute: '45', meridiem: 'AM' }, '24')).toBe('19:45');
  });

  it('round-trips every quarter hour of the day', () => {
    for (let t = 0; t < 1440; t += 15) {
      const v = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
      expect(joinTime(splitTime(v))).toBe(v);
      expect(joinTime(splitTime(v, '24'), '24')).toBe(v);
    }
  });
});
