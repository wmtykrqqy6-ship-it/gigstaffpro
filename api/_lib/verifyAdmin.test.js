import { describe, it, expect } from 'vitest';
import { tokenAssuranceLevel, twoStepRequired } from './verifyAdmin';

function fakeToken(payload) {
  const b64 = s => Buffer.from(JSON.stringify(s)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`;
}

describe('tokenAssuranceLevel', () => {
  it('reads aal2 and aal1', () => {
    expect(tokenAssuranceLevel(fakeToken({ sub: 'u', aal: 'aal2' }))).toBe('aal2');
    expect(tokenAssuranceLevel(fakeToken({ sub: 'u', aal: 'aal1' }))).toBe('aal1');
  });
  it('handles base64url characters in the payload', () => {
    expect(tokenAssuranceLevel(fakeToken({ aal: 'aal2', n: '???>>>~~~' }))).toBe('aal2');
  });
  it('returns null for junk', () => {
    expect(tokenAssuranceLevel('nope')).toBe(null);
    expect(tokenAssuranceLevel('a.!!!.c')).toBe(null);
    expect(tokenAssuranceLevel(fakeToken({ sub: 'u' }))).toBe(null);
    expect(tokenAssuranceLevel(undefined)).toBe(null);
  });
});

describe('twoStepRequired', () => {
  it('is on unless switched off', () => {
    expect(twoStepRequired({})).toBe(true);
    expect(twoStepRequired({ ADMIN_2STEP_OFF: 'false' })).toBe(true);
    expect(twoStepRequired({ ADMIN_2STEP_OFF: 'true' })).toBe(false);
  });
});
