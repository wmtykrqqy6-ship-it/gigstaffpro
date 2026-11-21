import { describe, it, expect, vi } from 'vitest';
import {
  twoStepNeeded,
  cleanCode,
  qrImageSrc,
  loadTwoStepState,
  sessionHasTwoStep,
  startEnrollment,
  verifyCode
} from './adminTwoStep';

function fakeSupabase({ aal, factors, enrollResult, verifyError, aalError } = {}) {
  return {
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn(async () => ({ data: aal, error: aalError || null })),
        listFactors: vi.fn(async () => ({ data: factors || { all: [], totp: [] }, error: null })),
        unenroll: vi.fn(async () => ({ data: {}, error: null })),
        enroll: vi.fn(async () => enrollResult || { data: null, error: new Error('no') }),
        challengeAndVerify: vi.fn(async () => ({ data: {}, error: verifyError || null }))
      }
    }
  };
}

describe('twoStepNeeded', () => {
  it('is done on an aal2 session', () => {
    expect(twoStepNeeded({ currentLevel: 'aal2', nextLevel: 'aal2' }, 1)).toBe('done');
  });
  it('asks for a code when an app is set up', () => {
    expect(twoStepNeeded({ currentLevel: 'aal1', nextLevel: 'aal2' }, 1)).toBe('verify');
    expect(twoStepNeeded({ currentLevel: 'aal1', nextLevel: 'aal1' }, 1)).toBe('verify');
  });
  it('asks to set one up when there is none', () => {
    expect(twoStepNeeded({ currentLevel: 'aal1', nextLevel: 'aal1' }, 0)).toBe('enroll');
    expect(twoStepNeeded(null, 0)).toBe('enroll');
  });
});

describe('cleanCode', () => {
  it('keeps the first 6 digits', () => {
    expect(cleanCode(' 123 456 ')).toBe('123456');
    expect(cleanCode('12-34-5678')).toBe('123456');
    expect(cleanCode(null)).toBe('');
  });
});

describe('qrImageSrc', () => {
  it('passes a data URL through', () => {
    expect(qrImageSrc('data:image/svg+xml;utf-8,<svg/>')).toBe('data:image/svg+xml;utf-8,<svg/>');
  });
  it('wraps bare SVG markup', () => {
    expect(qrImageSrc('<svg></svg>')).toBe('data:image/svg+xml;utf-8,%3Csvg%3E%3C%2Fsvg%3E');
  });
  it('handles nothing', () => {
    expect(qrImageSrc(undefined)).toBe('');
  });
});

describe('loadTwoStepState', () => {
  it('returns the verified factor to challenge', async () => {
    const sb = fakeSupabase({
      aal: { currentLevel: 'aal1', nextLevel: 'aal2' },
      factors: { all: [], totp: [{ id: 'f1', status: 'verified' }] }
    });
    expect(await loadTwoStepState(sb)).toEqual({ step: 'verify', factorId: 'f1' });
  });
  it('asks to enroll with no verified factor', async () => {
    const sb = fakeSupabase({
      aal: { currentLevel: 'aal1', nextLevel: 'aal1' },
      factors: { all: [{ id: 'u', factor_type: 'totp', status: 'unverified' }], totp: [] }
    });
    expect(await loadTwoStepState(sb)).toEqual({ step: 'enroll', factorId: null });
  });
});

describe('sessionHasTwoStep', () => {
  it('is true only for aal2', async () => {
    expect(await sessionHasTwoStep(fakeSupabase({ aal: { currentLevel: 'aal2' } }))).toBe(true);
    expect(await sessionHasTwoStep(fakeSupabase({ aal: { currentLevel: 'aal1' } }))).toBe(false);
  });
  it('fails closed on an error', async () => {
    const sb = fakeSupabase({ aal: { currentLevel: 'aal2' }, aalError: new Error('x') });
    expect(await sessionHasTwoStep(sb)).toBe(false);
  });
});

describe('startEnrollment', () => {
  it('clears unfinished setups, then enrolls', async () => {
    const sb = fakeSupabase({
      factors: {
        all: [
          { id: 'old', factor_type: 'totp', status: 'unverified' },
          { id: 'good', factor_type: 'totp', status: 'verified' }
        ],
        totp: [{ id: 'good', status: 'verified' }]
      },
      enrollResult: {
        data: { id: 'new', totp: { qr_code: '<svg/>', secret: 'ABC' } },
        error: null
      }
    });
    const result = await startEnrollment(sb);
    expect(sb.auth.mfa.unenroll).toHaveBeenCalledTimes(1);
    expect(sb.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'old' });
    expect(result.factorId).toBe('new');
    expect(result.secret).toBe('ABC');
    expect(result.qrSrc.startsWith('data:image/svg+xml')).toBe(true);
  });
});

describe('verifyCode', () => {
  it('sends the cleaned code', async () => {
    const sb = fakeSupabase();
    await verifyCode(sb, 'f1', '123 456');
    expect(sb.auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f1', code: '123456' });
  });
  it('throws a wrong code', async () => {
    const sb = fakeSupabase({ verifyError: new Error('Invalid TOTP code entered') });
    await expect(verifyCode(sb, 'f1', '000000')).rejects.toThrow('Invalid');
  });
});
