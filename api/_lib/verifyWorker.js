// api/_lib/verifyWorker.js
// Worker identity for api/worker-actions.js -- the "real worker sessions"
// rollout (Dylan, 2026-10-05). Mirrors verifyAdmin.js for workers.
//
// Rollout (docs/WORKER_AUTH.md):
//   Step 1 (now): if the request carries a worker's Supabase Auth token,
//     the server checks it, and a workerId that doesn't match the logged-in
//     worker is refused. Requests WITHOUT a token (legacy 4-digit-PIN
//     workers) still work as before ("legacy trust").
//   Step 4 (later): set WORKER_AUTH_ENFORCE=true in Vercel and every
//     worker action must carry a valid token for the same worker.

// Pull "Bearer <token>" from the request, else null.
export function bearerToken(req) {
  const h = req?.headers?.authorization || req?.headers?.Authorization || '';
  return typeof h === 'string' && h.startsWith('Bearer ') ? h.slice(7).trim() || null : null;
}

// Who is calling? Returns one of:
//   { kind: 'none' }                      no token sent
//   { kind: 'invalid' }                   token sent but expired/bad
//   { kind: 'worker', workerId, authUserId }
//   { kind: 'not-worker', authUserId }    a real login, but not a linked worker (e.g. an admin)
export async function resolveWorkerIdentity(supabaseAdmin, token) {
  if (!token) return { kind: 'none' };
  // getUser(token) revalidates with the Auth server (rejects expired,
  // deleted or banned users), same as verifyAdmin.js.
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return { kind: 'invalid' };
  const authUserId = data.user.id;
  const { data: link, error: linkError } = await supabaseAdmin
    .from('worker_auth_links')
    .select('worker_id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (linkError) throw linkError;
  return link?.worker_id
    ? { kind: 'worker', workerId: link.worker_id, authUserId }
    : { kind: 'not-worker', authUserId };
}

// Actions anyone may call without being a logged-in worker.
const PUBLIC_ACTIONS = new Set(['signup', 'pushConfig']); // pushConfig only returns the public VAPID key

// Pure decision. Returns { allow: true, mode } or { allow: false, status, error }.
//   mode: 'public' | 'verified' | 'legacy-trust'
export function decideWorkerAccess({ action, claimedWorkerId, identity, enforce = false }) {
  if (PUBLIC_ACTIONS.has(action)) return { allow: true, mode: 'public' };

  if (identity?.kind === 'worker') {
    if (claimedWorkerId && claimedWorkerId !== identity.workerId) {
      return { allow: false, status: 403, error: "This request doesn't match the worker who is logged in. Please log in again." };
    }
    return { allow: true, mode: 'verified' };
  }

  if (enforce) {
    if (identity?.kind === 'invalid') return { allow: false, status: 401, error: 'Your session has expired. Please log in again.' };
    return { allow: false, status: 401, error: 'Please log in again to continue.' };
  }

  // Step 1-3: no (usable) worker token -> behave exactly as before.
  return { allow: true, mode: 'legacy-trust' };
}

export const workerAuthEnforced = () => String(process.env.WORKER_AUTH_ENFORCE || '').toLowerCase() === 'true';
