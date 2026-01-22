// api/calculate-distance.js
// Vercel serverless function to calculate distance using Google Maps

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { origin, destination, apiKey } = req.body;

  if (!origin || !destination || !apiKey) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&units=imperial&key=${apiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'OK' && data.rows[0].elements[0].status === 'OK') {
      const distanceInMeters = data.rows[0].elements[0].distance.value;
      const distanceInMiles = Math.round(distanceInMeters / 1609.34);
      
      return res.status(200).json({ 
        success: true,
        miles: distanceInMiles,
        distanceText: data.rows[0].elements[0].distance.text,
        durationText: data.rows[0].elements[0].duration.text
      });
    } else {
      return res.status(400).json({ 
        success: false,
        error: 'Could not calculate distance',
        details: data.error_message || data.status
      });
    }
  } catch (error) {
    console.error('Distance calculation error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Server error calculating distance'
    });
  }
}






