import { describe, it, expect, vi } from 'vitest';
import { parseGeocodeResult, geocodeAddress } from './geocode.js';

const result = {
  formatted_address: 'N50W20830 Lisbon Rd, Menomonee Falls, WI 53051, USA',
  address_components: [
    { long_name: 'Menomonee Falls', short_name: 'Menomonee Falls', types: ['locality', 'political'] },
    { long_name: 'Waukesha County', short_name: 'Waukesha County', types: ['administrative_area_level_2', 'political'] },
    { long_name: 'Wisconsin', short_name: 'WI', types: ['administrative_area_level_1', 'political'] }
  ]
};

describe('geocode', () => {
  it('reads county, city and state', () => {
    expect(parseGeocodeResult(result)).toEqual({ county: 'Waukesha', city: 'Menomonee Falls', state: 'WI', formatted: result.formatted_address });
    expect(parseGeocodeResult({})).toEqual({ county: null, city: null, state: null, formatted: null });
  });

  it('calls Google and reports failures', async () => {
    const ok = vi.fn(async () => ({ status: 200, json: async () => ({ status: 'OK', results: [result] }) }));
    expect((await geocodeAddress('x', { apiKey: 'k', fetchImpl: ok })).county).toBe('Waukesha');
    const denied = vi.fn(async () => ({ status: 200, json: async () => ({ status: 'REQUEST_DENIED', results: [] }) }));
    await expect(geocodeAddress('x', { apiKey: 'k', fetchImpl: denied })).rejects.toThrow(/REQUEST_DENIED/);
  });
});
