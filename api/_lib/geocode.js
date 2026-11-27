// County / city / state for an address, for sales tax on quotes
// (docs/QUOTES.md, step 3). Used by api/get-distance.js?geocode=1.

// Google Geocoding result -> { county, city, state, formatted }.
// "Waukesha County" -> "Waukesha"; city is the municipality (locality).
export function parseGeocodeResult(result) {
  const parts = Array.isArray(result?.address_components) ? result.address_components : [];
  const find = (type) => parts.find(p => Array.isArray(p?.types) && p.types.includes(type));
  const county = String(find('administrative_area_level_2')?.long_name || '').replace(/\s+County$/i, '').trim();
  const city = String((find('locality') || find('administrative_area_level_3') || find('sublocality'))?.long_name || '').trim();
  const state = String(find('administrative_area_level_1')?.short_name || '').trim();
  return { county: county || null, city: city || null, state: state || null, formatted: result?.formatted_address || null };
}

export async function geocodeAddress(address, { apiKey, fetchImpl = fetch } = {}) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
  const r = await fetchImpl(url);
  const data = await r.json();
  if (data?.status !== 'OK' || !data.results?.length) {
    const err = new Error(`Geocoding: ${data?.status || r.status}`);
    err.status = data?.status;
    throw err;
  }
  return parseGeocodeResult(data.results[0]);
}
