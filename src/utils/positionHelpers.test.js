import { describe, it, expect } from 'vitest';
import { isAssignmentFilled, positionMatches, getPayRateKey } from './positionHelpers';

// isAssignmentFilled is the single source of truth for "does this
// assignment count as filling a slot". Code that reimplements a narrower
// raw-status check (e.g. status === 'approved' || status === 'assigned')
// instead of using this helper was the single most repeated bug class
// this session -- it silently missed 'confirmed'-status rows in at least
// six different files across six audit rounds.
describe('isAssignmentFilled', () => {
  it('treats approved and confirmed as filled', () => {
    expect(isAssignmentFilled('approved')).toBe(true);
    expect(isAssignmentFilled('confirmed')).toBe(true);
  });

  it('treats standby, pending, rejected, and cancelled as NOT filled', () => {
    expect(isAssignmentFilled('standby')).toBe(false);
    expect(isAssignmentFilled('pending')).toBe(false);
    expect(isAssignmentFilled('rejected')).toBe(false);
    expect(isAssignmentFilled('cancelled')).toBe(false);
  });

  it('treats a legacy null/undefined status as filled (admin-assigned with no status set)', () => {
    expect(isAssignmentFilled(null)).toBe(true);
    expect(isAssignmentFilled(undefined)).toBe(true);
  });

  it('treats an unrecognized status as filled by default (allowlist, not denylist)', () => {
    expect(isAssignmentFilled('some_future_status')).toBe(true);
  });
});

describe('positionMatches', () => {
  it('matches identical keys', () => {
    expect(positionMatches('host', 'host')).toBe(true);
  });

  it('matches the generic "dealer" skill against any specific dealer position', () => {
    expect(positionMatches('dealer', 'blackjack_dealer')).toBe(true);
    expect(positionMatches('blackjack_dealer', 'dealer')).toBe(true);
  });

  it('does not match unrelated keys', () => {
    expect(positionMatches('host', 'bartender')).toBe(false);
  });
});

describe('getPayRateKey', () => {
  it('buckets specific dealer position labels to their shared rate key', () => {
    expect(getPayRateKey('Blackjack Dealer')).toBe('blackjack_dealer');
    expect(getPayRateKey('Roulette Wheel')).toBe('roulette_dealer');
  });

  it('is case-insensitive', () => {
    expect(getPayRateKey('BARTENDER')).toBe('bartender');
  });

  it('falls back to a slugified version of unrecognized labels', () => {
    expect(getPayRateKey('Some New Role')).toBe('some_new_role');
  });
});
