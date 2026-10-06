import { describe, it, expect } from 'vitest';
import { cleanBusinessName, buildManifest, PRODUCT_NAME } from './businessName';

describe('cleanBusinessName', () => {
  it('trims, collapses spaces and caps the length', () => {
    expect(cleanBusinessName('  Vegas   On Wheels ')).toBe('Vegas On Wheels');
    expect(cleanBusinessName('x'.repeat(60))).toHaveLength(40);
    expect(cleanBusinessName(null)).toBe('');
  });
});

describe('buildManifest', () => {
  const m = buildManifest('Vegas On Wheels', 'https://www.gigstaffpro.com');
  it('names the app after the business', () => {
    expect(m.name).toBe('Vegas On Wheels');
    expect(m.short_name).toBe('Vegas On Wheels');
    expect(m.display).toBe('standalone');
  });
  it('uses absolute URLs (the manifest is served from a blob: URL)', () => {
    expect(m.start_url).toBe('https://www.gigstaffpro.com/');
    expect(m.id).toBe('https://www.gigstaffpro.com/');
    expect(m.icons.map(i => i.src)).toEqual([
      'https://www.gigstaffpro.com/icons/icon-192.png',
      'https://www.gigstaffpro.com/icons/icon-512.png',
      'https://www.gigstaffpro.com/icons/icon-maskable-512.png'
    ]);
  });
  it('falls back to the product name', () => {
    expect(buildManifest('   ', 'https://x.test').name).toBe(PRODUCT_NAME);
  });
});
