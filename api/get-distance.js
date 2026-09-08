// Every caller in this codebase hits this via a same-origin relative fetch
// (App.jsx, AvailableEventsSection.jsx, and several modals) — same-origin
// requests never need CORS headers at all. The previous `Access-Control-
// Allow-Origin: *` had no legitimate purpose here and let any third-party
// site's visitors' browsers silently ride on this app's billed Google Maps
// key. Rate limiting (below) caps abuse from direct/scripted callers, which
// CORS can't do anyway since it's a browser-only mechanism.
import { createRateLimiter, getClientIp } from './_lib/rateLimit.js';

const isRateLimited = createRateLimiter(30, 60 * 1000);

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
      console.error('get-distance: Maps API error:', data.status);
      return res.status(400).json({ error: 'Could not calculate distance' });
    }

    const element = data.rows?.[0]?.elements?.[0];
    if (!element || element.status !== 'OK') {
      console.error('get-distance: route not found:', element?.status);
      return res.status(400).json({ error: 'Route not found' });
    }

    // Distance in meters → miles
    const meters = element.distance.value;
    const miles = Math.round(meters / 1609.34);

    return res.status(200).json({ miles, text: element.distance.text });
  } catch (err) {
    console.error('get-distance error:', err);
    return res.status(500).json({ error: 'Could not calculate distance' });
  }
}
