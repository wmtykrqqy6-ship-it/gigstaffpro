import { describe, it, expect } from 'vitest';
import { isHostPosition, meetingPointWindowOpen, meetingPointOf, coordsFromMapsUrl, pinUrl } from './meetingPoint';

describe('meetingPointWindowOpen (local time)', () => {
  const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h);
  it('day before and event day', () => {
    expect(meetingPointWindowOpen('2026-10-06', at(2026, 10, 5))).toBe(true);
    expect(meetingPointWindowOpen('2026-10-06', at(2026, 10, 6, 23))).toBe(true);
  });
  it('early hours after only', () => {
    expect(meetingPointWindowOpen('2026-10-06', at(2026, 10, 7, 1))).toBe(true);
    expect(meetingPointWindowOpen('2026-10-06', at(2026, 10, 7, 8))).toBe(false);
  });
  it('closed earlier in the week', () => {
    expect(meetingPointWindowOpen('2026-10-06', at(2026, 10, 3))).toBe(false);
    expect(meetingPointWindowOpen(null)).toBe(false);
  });
});

describe('isHostPosition', () => {
  it('matches host keys and labels only', () => {
    expect(isHostPosition('host')).toBe(true);
    expect(isHostPosition('Host')).toBe(true);
    expect(isHostPosition('blackjack')).toBe(false);
    expect(isHostPosition('ghost_town')).toBe(false);
  });
});

describe('meetingPointOf', () => {
  it('null when nothing is set', () => {
    expect(meetingPointOf({})).toBeNull();
    expect(meetingPointOf({ meeting_point_lat: 0, meeting_point_lng: 0 })).toBeNull();
  });
  it('a pin without a description still counts, with a Maps link', () => {
    expect(meetingPointOf({ meeting_point_lat: 42.5, meeting_point_lng: -88.4 }))
      .toMatchObject({ hasPin: true, url: pinUrl(42.5, -88.4), description: '' });
  });
  it('a description alone counts', () => {
    expect(meetingPointOf({ meeting_point_description: 'North doors' })).toMatchObject({ hasPin: false, description: 'North doors' });
  });
  it('carries who set it', () => {
    expect(meetingPointOf({ meeting_point_lat: 1, meeting_point_lng: 2, meeting_point_set_by_name: 'William Finn' }).setByName).toBe('William Finn');
  });
});

describe('coordsFromMapsUrl', () => {
  it('reads the usual Google Maps link shapes', () => {
    expect(coordsFromMapsUrl('https://www.google.com/maps/@42.5871,-88.4335,17z')).toEqual({ lat: 42.5871, lng: -88.4335 });
    expect(coordsFromMapsUrl('https://www.google.com/maps?q=42.5871,-88.4335')).toEqual({ lat: 42.5871, lng: -88.4335 });
    expect(coordsFromMapsUrl('https://www.google.com/maps/place/Grand+Geneva/@42.5871,-88.4335,17z/data=x')).toEqual({ lat: 42.5871, lng: -88.4335 });
  });
  it('short share links and junk give null', () => {
    expect(coordsFromMapsUrl('https://maps.app.goo.gl/abc123')).toBeNull();
    expect(coordsFromMapsUrl('')).toBeNull();
  });
});
