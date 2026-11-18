import { describe, it, expect } from 'vitest';
import {
  computeLocalPriorityUntil, localPriorityActive, isLocalWorker,
  canSelfBookDuringWindow, localPriorityTimeLeft, nearestLocationId,
} from './localPriority';

const MKE = 'loc-mke';
const CHI = 'loc-chi';
const now = new Date(2026, 10, 18, 10, 0); // Wed Nov 18 2026, 10:00 local

describe('computeLocalPriorityUntil', () => {
  it('is 48 hours out for an event weeks away', () => {
    expect(computeLocalPriorityUntil('2026-12-19', now)).toEqual(new Date(2026, 10, 20, 10, 0));
  });
  it('ends at the start of the day before a close event', () => {
    // Event Sat Nov 21 -> window ends Fri Nov 20 00:00, not Fri 10:00.
    expect(computeLocalPriorityUntil('2026-11-21', now)).toEqual(new Date(2026, 10, 20));
  });
  it('gives no window when the event is tomorrow or sooner', () => {
    expect(computeLocalPriorityUntil('2026-11-19', now)).toBeNull();
    expect(computeLocalPriorityUntil('2026-11-18', now)).toBeNull();
  });
  it('falls back to 48 hours without a date', () => {
    expect(computeLocalPriorityUntil('', now)).toEqual(new Date(2026, 10, 20, 10, 0));
  });
});

describe('localPriorityActive / canSelfBookDuringWindow', () => {
  const event = { location_id: MKE, local_priority_until: new Date(2026, 10, 20, 10, 0).toISOString() };
  const local = { home_location_id: MKE };
  const away = { home_location_id: CHI };

  it('is active before the end time only', () => {
    expect(localPriorityActive(event, now)).toBe(true);
    expect(localPriorityActive(event, new Date(2026, 10, 20, 10, 1))).toBe(false);
  });
  it('is never active without a market or an end time', () => {
    expect(localPriorityActive({ ...event, location_id: null }, now)).toBe(false);
    expect(localPriorityActive({ location_id: MKE, local_priority_until: null }, now)).toBe(false);
  });
  it('lets only primary-market workers book during the window', () => {
    expect(canSelfBookDuringWindow(local, event, now)).toBe(true);
    expect(canSelfBookDuringWindow(away, event, now)).toBe(false);
    expect(canSelfBookDuringWindow({ home_location_id: null }, event, now)).toBe(false);
  });
  it('opens to everyone after the window', () => {
    expect(canSelfBookDuringWindow(away, event, new Date(2026, 10, 21))).toBe(true);
  });
  it('counts a worker as local only at their primary market', () => {
    expect(isLocalWorker({ home_location_id: CHI, other_locations: [MKE] }, event)).toBe(false);
  });
  it('shows time left', () => {
    expect(localPriorityTimeLeft(event, now)).toBe('48h left');
    expect(localPriorityTimeLeft(event, new Date(2026, 10, 20, 9, 30))).toBe('30m left');
    expect(localPriorityTimeLeft(event, new Date(2026, 10, 21))).toBe('');
  });
});

describe('nearestLocationId', () => {
  it('picks the closest known distance', () => {
    expect(nearestLocationId([{ id: MKE, miles: 40 }, { id: CHI, miles: 12 }])).toBe(CHI);
  });
  it('ignores failed lookups', () => {
    expect(nearestLocationId([{ id: MKE, miles: null }, { id: CHI, miles: 90 }])).toBe(CHI);
    expect(nearestLocationId([{ id: MKE, miles: undefined }])).toBeNull();
    expect(nearestLocationId([])).toBeNull();
  });
});
