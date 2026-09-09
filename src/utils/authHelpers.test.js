import { describe, it, expect } from 'vitest';
import { hashPin, verifyPin } from './authHelpers';

// PIN hashing was rewritten this session from unsalted single-round SHA-256
// to salted, iterated PBKDF2 -- the single highest-risk change of the
// whole session, since it touches real worker login. These tests exist so
// that risk never has to be re-verified by hand again.
describe('hashPin / verifyPin', () => {
  it('produces a hash in the documented pbkdf2$<iterations>$<salt>$<hash> format', async () => {
    const hash = await hashPin('1234');
    const parts = hash.split('$');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('pbkdf2');
    expect(Number(parts[1])).toBeGreaterThan(0);
    expect(parts[2]).toMatch(/^[0-9a-f]{32}$/); // 16-byte salt as hex
    expect(parts[3]).toMatch(/^[0-9a-f]{64}$/); // 256-bit hash as hex
  });

  it('verifies a PIN against its own hash', async () => {
    const hash = await hashPin('4242');
    expect(await verifyPin('4242', hash)).toBe(true);
  });

  it('rejects the wrong PIN', async () => {
    const hash = await hashPin('4242');
    expect(await verifyPin('0000', hash)).toBe(false);
  });

  it('produces a different salt (and hash) for the same PIN on repeated calls', async () => {
    const hashA = await hashPin('1111');
    const hashB = await hashPin('1111');
    expect(hashA).not.toBe(hashB);
  });

  it('still verifies correctly against a hash created under a different iteration count', async () => {
    // Guards against the bug fixed this session where verifyPin always
    // recomputed under today's PBKDF2_ITERATIONS constant instead of the
    // count actually embedded in the stored hash -- harmless while only
    // one iteration count has ever existed, but would silently break
    // every existing hash the moment that constant is raised.
    const oldHash = await hashPin('9999', null, 50000);
    expect(oldHash.split('$')[1]).toBe('50000');
    expect(await verifyPin('9999', oldHash)).toBe(true);
  });

  it('rejects a hash in an unrecognized format rather than throwing', async () => {
    expect(await verifyPin('1234', 'not-a-real-hash')).toBe(false);
    expect(await verifyPin('1234', '')).toBe(false);
  });

  it('rejects a missing PIN or stored hash rather than throwing', async () => {
    expect(await verifyPin('', 'pbkdf2$100000$aa$bb')).toBe(false);
    expect(await verifyPin('1234', '')).toBe(false);
  });
});
