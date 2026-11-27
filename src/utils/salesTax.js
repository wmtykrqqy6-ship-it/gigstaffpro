// Sales tax for quotes (CRM Phase 2 step 3, docs/QUOTES.md). Rates come from
// public.tax_rates (admin-only), edited in Settings > Prices.

const norm = (s) => String(s || '').toLowerCase().replace(/\s+county$/, '').replace(/[^a-z]/g, '');

// The rate row for a place ({ county, city, state }), or null. A city row
// (City of Milwaukee) wins over its county, unless { cities: false }: the
// address lookup passes that, because Google's city is the mailing city and
// "Milwaukee" mail also covers West Allis, Wauwatosa, Greenfield and other
// suburbs that don't charge the city's 2%. Wisconsin only: other states
// return null and the rep types the rate.
export function findTaxArea(place, rates = [], { cities = true } = {}) {
  if (!place?.county) return null;
  if (place.state && String(place.state).toUpperCase() !== 'WI') return null;
  const county = norm(place.county);
  const city = norm(place.city);
  const list = rates || [];
  return (cities && list.find(r => r.kind === 'city' && norm(r.county) === county && city && norm(r.city) === city))
    || list.find(r => r.kind === 'county' && norm(r.county) === county)
    || null;
}

// "5.5%" from 0.055
export const formatRate = (rate) => `${Math.round((Number(rate) || 0) * 10000) / 100}%`;

// Rates sorted for a picker: counties A-Z, each city right after its county.
export function sortTaxAreas(rates = []) {
  return [...(rates || [])].sort((a, b) =>
    String(a.county).localeCompare(String(b.county)) || (a.kind === 'county' ? -1 : 1) - (b.kind === 'county' ? -1 : 1) || String(a.area).localeCompare(String(b.area)));
}
