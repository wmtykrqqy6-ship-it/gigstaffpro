import { describe, it, expect } from 'vitest';
import { localPriorityActive, localPriorityBlock, availabilityAudience } from './localPriority.js';

const MKE = 'loc-mke';
const CHI = 'loc-chi';
const now = new Date('2026-11-18T16:00:00Z');
const hours = (h) => new Date(now.getTime() + h * 3600 * 1000).toISOString();

describe('localPriorityBlock', () => {
  const event = { location_id: MKE, local_priority_until: hours(30) };
  it('blocks non-local workers during the window', () => {
    const r = localPriorityBlock({ home_location_id: CHI }, event, now);
    expect(r.status).toBe(403);
    expect(r.body.ok).toBe(false);
  });
  it('allows local workers', () => {
    expect(localPriorityBlock({ home_location_id: MKE }, event, now)).toBeNull();
  });
  it('allows everyone once the window ends or was released', () => {
    expect(localPriorityBlock({ home_location_id: CHI }, { ...event, local_priority_until: hours(-1) }, now)).toBeNull();
    expect(localPriorityBlock({ home_location_id: CHI }, { ...event, local_priority_until: null }, now)).toBeNull();
  });
  it('never blocks events without a market', () => {
    expect(localPriorityActive({ location_id: null, local_priority_until: hours(30) }, now)).toBe(false);
  });
});

describe('availabilityAudience', () => {
  it('is local-only during the window', () => {
    expect(availabilityAudience({ location_id: MKE, local_priority_until: hours(5) }, now))
      .toEqual({ localOnly: true, justReleased: false });
  });
  it('flags the day after the window ends for catch-up emails', () => {
    expect(availabilityAudience({ location_id: MKE, local_priority_until: hours(-2) }, now))
      .toEqual({ localOnly: false, justReleased: true });
    expect(availabilityAudience({ location_id: MKE, local_priority_until: hours(-30) }, now))
      .toEqual({ localOnly: false, justReleased: false });
  });
  it('is normal for events with no window', () => {
    expect(availabilityAudience({ location_id: MKE, local_priority_until: null }, now))
      .toEqual({ localOnly: false, justReleased: false });
  });
});
