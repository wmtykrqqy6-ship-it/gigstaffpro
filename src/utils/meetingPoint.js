// Meeting point helpers for the browser (worker shift cards, crew route,
// event form). The server enforces the same rules in
// api/_lib/meetingPoint.js -- these only decide what to show.

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const isHostPosition = (position) => /\bhost\b/i.test(String(position ?? '').replace(/_/g, ' '));

// Workers can drop the pin from the day before the event through the event
// day, plus the early hours after a late party.
export function meetingPointWindowOpen(eventDate, now = new Date()) {
  if (!eventDate) return false;
  const [y, m, d] = String(eventDate).split('-').map(Number);
  const event = new Date(y, m - 1, d);
  const before = new Date(y, m - 1, d - 1);
  const after = new Date(y, m - 1, d + 1);
  const today = ymd(now);
  if (today === ymd(event) || today === ymd(before)) return true;
  return today === ymd(after) && now.getHours() < 6;
}

export const pinUrl = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;

// The event's meeting point, or null if none is set.
export function meetingPointOf(event) {
  if (!event) return null;
  const lat = event.meeting_point_lat != null ? Number(event.meeting_point_lat) : null;
  const lng = event.meeting_point_lng != null ? Number(event.meeting_point_lng) : null;
  const hasPin = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  const description = event.meeting_point_description || '';
  const url = event.meeting_point_url || (hasPin ? pinUrl(lat, lng) : '');
  if (!hasPin && !description && !url) return null;
  return {
    lat: hasPin ? lat : null,
    lng: hasPin ? lng : null,
    hasPin,
    description,
    url,
    setByName: event.meeting_point_set_by_name || null,
    setAt: event.meeting_point_set_at || null
  };
}

// Pull coordinates out of a pasted Google Maps link ("/@43.03,-88.10,17z",
// "?q=43.03,-88.10", "/place/43.03,-88.10"), else null. Short share links
// (maps.app.goo.gl) don't contain coordinates.
export function coordsFromMapsUrl(url) {
  const m = String(url || '').match(/(?:[/@=]|q=)(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
