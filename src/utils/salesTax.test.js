import { describe, it, expect } from 'vitest';
import { findTaxArea, formatRate, sortTaxAreas } from './salesTax';

const rates = [
  { area: 'Waukesha County', kind: 'county', county: 'Waukesha', city: null, rate: 0.05 },
  { area: 'Milwaukee County', kind: 'county', county: 'Milwaukee', city: null, rate: 0.059 },
  { area: 'City of Milwaukee', kind: 'city', county: 'Milwaukee', city: 'Milwaukee', rate: 0.079 },
  { area: 'St. Croix County', kind: 'county', county: 'St. Croix', city: null, rate: 0.055 }
];

describe('sales tax', () => {
  it('finds the county, and the city when it has its own rate', () => {
    expect(findTaxArea({ county: 'Waukesha', city: 'Menomonee Falls', state: 'WI' }, rates).rate).toBe(0.05);
    expect(findTaxArea({ county: 'Milwaukee County', city: 'West Allis', state: 'WI' }, rates).area).toBe('Milwaukee County');
    expect(findTaxArea({ county: 'Milwaukee', city: 'Milwaukee', state: 'WI' }, rates).rate).toBe(0.079);
    expect(findTaxArea({ county: 'St Croix', state: 'WI' }, rates).area).toBe('St. Croix County');
  });

  it('gives up outside Wisconsin or without a county', () => {
    expect(findTaxArea({ county: 'Cook', city: 'Chicago', state: 'IL' }, rates)).toBeNull();
    expect(findTaxArea({ city: 'Milwaukee' }, rates)).toBeNull();
    expect(findTaxArea(null, rates)).toBeNull();
  });

  it('formats and sorts', () => {
    expect(formatRate(0.055)).toBe('5.5%');
    expect(formatRate(0.079)).toBe('7.9%');
    expect(sortTaxAreas(rates).map(r => r.area)).toEqual(['Milwaukee County', 'City of Milwaukee', 'St. Croix County', 'Waukesha County']);
  });
});
