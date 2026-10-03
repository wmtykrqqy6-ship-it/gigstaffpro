import { describe, it, expect } from 'vitest';
import {
  normalizePositionKey, parseMinHoursRule, serializeMinHoursRule, minimumApplies, paidHours, defaultMinHoursPositions
} from './payHelpers';

const RULE = { hours: 3, positions: ['blackjack', 'craps', 'roulette', 'poker', "ultimate_hold'em", 'host'] };

describe('normalizePositionKey', () => {
  it('matches labels to keys the way Settings -> Positions does', () => {
    expect(normalizePositionKey("Ultimate Hold'em")).toBe("ultimate_hold'em");
    expect(normalizePositionKey('3 Card Poker')).toBe('3_card_poker');
    expect(normalizePositionKey('blackjack')).toBe('blackjack');
  });
});

describe('parse / serialize the setting', () => {
  it('round-trips', () => {
    expect(parseMinHoursRule(serializeMinHoursRule(RULE))).toEqual(RULE);
    expect(parseMinHoursRule({ hours: '3', positions: ['Blackjack'] })).toEqual({ hours: 3, positions: ['blackjack'] });
  });

  it('treats missing, zero or garbage as "no minimum"', () => {
    expect(parseMinHoursRule(null)).toBeNull();
    expect(parseMinHoursRule('')).toBeNull();
    expect(parseMinHoursRule('not json')).toBeNull();
    expect(parseMinHoursRule({ hours: 0, positions: ['blackjack'] })).toBeNull();
  });
});

describe('paidHours', () => {
  it('a 2-hour event pays a covered dealer 3 hours', () => {
    expect(paidHours(2, RULE, 'Craps', { payment_type: 'contractor' })).toBe(3);
    expect(paidHours(2, RULE, 'craps')).toBe(3); // no worker known (estimates)
  });

  it('longer events pay the real hours', () => {
    expect(paidHours(4, RULE, 'blackjack')).toBe(4);
    expect(paidHours(3.5, RULE, 'blackjack')).toBe(3.5);
  });

  it('Host is covered; crew roles are not', () => {
    expect(paidHours(2, RULE, 'Host')).toBe(3);
    expect(paidHours(2, RULE, 'set_up')).toBe(2);
    expect(paidHours(2, RULE, 'driver')).toBe(2);
  });

  it('W-2 employees are exempt; workers with no pay type get the minimum', () => {
    expect(paidHours(2, RULE, 'blackjack', { payment_type: 'employee' })).toBe(2);
    expect(paidHours(2, RULE, 'blackjack', { payment_type: null })).toBe(3);
    expect(minimumApplies(RULE, 'blackjack', { payment_type: 'employee' })).toBe(false);
  });

  it('no rule -> real hours', () => {
    expect(paidHours(2, null, 'blackjack')).toBe(2);
    expect(paidHours('2', null, 'blackjack')).toBe(2);
  });
});

describe('defaultMinHoursPositions', () => {
  it('everything except the crew roles', () => {
    const positions = [{ key: 'blackjack' }, { key: 'host' }, { key: 'set_up' }, { key: 'driver' }, { key: 'warehouse' }];
    expect(defaultMinHoursPositions(positions, new Set(['set_up', 'driver', 'warehouse']))).toEqual(['blackjack', 'host']);
  });
});
