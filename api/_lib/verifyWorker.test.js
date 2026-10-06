import { describe, it, expect, afterEach } from 'vitest';
import { bearerToken, resolveWorkerIdentity, decideWorkerAccess, workerAuthEnforced } from './verifyWorker.js';

const ME = '11111111-1111-4111-8111-111111111111';
const SOMEONE_ELSE = '22222222-2222-4222-8222-222222222222';

describe('bearerToken', () => {
  it('reads "Bearer <token>", else null', () => {
    expect(bearerToken({ headers: { authorization: 'Bearer abc.def' } })).toBe('abc.def');
    expect(bearerToken({ headers: { authorization: 'Basic xyz' } })).toBeNull();
    expect(bearerToken({ headers: {} })).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
  });
});

function fakeAdminClient({ user = null, userError = null, link = null }) {
  return {
    auth: { getUser: async () => ({ data: { user }, error: userError }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: link, error: null }) }) })
    })
  };
}

describe('resolveWorkerIdentity', () => {
  it('no token -> none', async () => {
    expect(await resolveWorkerIdentity(fakeAdminClient({}), null)).toEqual({ kind: 'none' });
  });
  it('bad or expired token -> invalid', async () => {
    expect(await resolveWorkerIdentity(fakeAdminClient({ userError: new Error('jwt expired') }), 't')).toEqual({ kind: 'invalid' });
  });
  it('linked worker -> worker with their id', async () => {
    const r = await resolveWorkerIdentity(fakeAdminClient({ user: { id: 'auth-1' }, link: { worker_id: ME } }), 't');
    expect(r).toEqual({ kind: 'worker', workerId: ME, authUserId: 'auth-1' });
  });
  it('a real login that is not a worker (e.g. an admin) -> not-worker', async () => {
    const r = await resolveWorkerIdentity(fakeAdminClient({ user: { id: 'auth-2' }, link: null }), 't');
    expect(r).toEqual({ kind: 'not-worker', authUserId: 'auth-2' });
  });
});

describe('decideWorkerAccess — step 1 (not enforced)', () => {
  const worker = { kind: 'worker', workerId: ME };

  it('a logged-in worker acting as themselves is verified', () => {
    expect(decideWorkerAccess({ action: 'apply', claimedWorkerId: ME, identity: worker })).toEqual({ allow: true, mode: 'verified' });
  });
  it('a logged-in worker claiming someone else is refused', () => {
    const d = decideWorkerAccess({ action: 'cancelAssignment', claimedWorkerId: SOMEONE_ELSE, identity: worker });
    expect(d.allow).toBe(false);
    expect(d.status).toBe(403);
  });
  it('legacy workers (no token) keep working exactly as before', () => {
    expect(decideWorkerAccess({ action: 'apply', claimedWorkerId: ME, identity: { kind: 'none' } })).toEqual({ allow: true, mode: 'legacy-trust' });
  });
  it('an expired token or non-worker login falls back to legacy trust (nothing breaks)', () => {
    expect(decideWorkerAccess({ action: 'apply', claimedWorkerId: ME, identity: { kind: 'invalid' } }).mode).toBe('legacy-trust');
    expect(decideWorkerAccess({ action: 'apply', claimedWorkerId: ME, identity: { kind: 'not-worker' } }).mode).toBe('legacy-trust');
  });
  it('signup never needs a login', () => {
    expect(decideWorkerAccess({ action: 'signup', identity: { kind: 'none' } })).toEqual({ allow: true, mode: 'public' });
  });
});

describe('decideWorkerAccess — step 4 (enforced)', () => {
  it('no token, bad token or non-worker login is refused', () => {
    expect(decideWorkerAccess({ action: 'apply', claimedWorkerId: ME, identity: { kind: 'none' }, enforce: true }).status).toBe(401);
    expect(decideWorkerAccess({ action: 'apply', claimedWorkerId: ME, identity: { kind: 'invalid' }, enforce: true }).status).toBe(401);
    expect(decideWorkerAccess({ action: 'apply', claimedWorkerId: ME, identity: { kind: 'not-worker' }, enforce: true }).allow).toBe(false);
  });
  it('a verified worker and signup still work', () => {
    expect(decideWorkerAccess({ action: 'apply', claimedWorkerId: ME, identity: { kind: 'worker', workerId: ME }, enforce: true }).allow).toBe(true);
    expect(decideWorkerAccess({ action: 'signup', identity: { kind: 'none' }, enforce: true }).allow).toBe(true);
  });
});

describe('workerAuthEnforced', () => {
  const prev = process.env.WORKER_AUTH_ENFORCE;
  afterEach(() => { if (prev === undefined) delete process.env.WORKER_AUTH_ENFORCE; else process.env.WORKER_AUTH_ENFORCE = prev; });
  it('off unless the env var is exactly "true"', () => {
    delete process.env.WORKER_AUTH_ENFORCE;
    expect(workerAuthEnforced()).toBe(false);
    process.env.WORKER_AUTH_ENFORCE = 'TRUE';
    expect(workerAuthEnforced()).toBe(true);
    process.env.WORKER_AUTH_ENFORCE = 'yes';
    expect(workerAuthEnforced()).toBe(false);
  });
});
