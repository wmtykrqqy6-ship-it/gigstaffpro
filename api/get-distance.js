// Every caller in this codebase hits this via a same-origin relative fetch
// (App.jsx, AvailableEventsSection.jsx, and several modals) — same-origin
// requests never need CORS headers at all. The previous `Access-Control-
// Allow-Origin: *` had no legitimate purpose here and let any third-party
// site's visitors' browsers silently ride on this app's billed Google Maps
// key. Rate limiting (below) caps abuse from direct/scripted callers, which
// CORS can't do anyway since it's a browser-only mechanism.
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const rateLimitBuckets = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(ip);
  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(ip, { count: 1, windowStart: now });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

export default async function handler(req, res) {
  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const { origin, destination } = req.query;

  if (!origin || !destination) {
    return res.status(400).json({ error: 'Missing origin or destination' });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Google Maps API key not configured' });
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&units=imperial&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
      return res.status(400).json({ error: `Maps API error: ${data.status}` });
    }

    const element = data.rows?.[0]?.elements?.[0];
    if (!element || element.status !== 'OK') {
      return res.status(400).json({ error: `Route not found: ${element?.status}` });
    }

    // Distance in meters → miles
    const meters = element.distance.value;
    const miles = Math.round(meters / 1609.34);

    return res.status(200).json({ miles, text: element.distance.text });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
