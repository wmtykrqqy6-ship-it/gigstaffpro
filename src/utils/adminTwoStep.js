// 2-step sign-in (authenticator-app codes) for admins and sales managers.
// Uses Supabase Auth MFA (TOTP). See docs/CLIENT_SECURITY.md.
//
// After the password, a session is "aal1". Entering a code from the
// authenticator app upgrades it to "aal2". The app only opens the admin
// dashboard on an aal2 session, and the database (is_admin()) and the
// admin API routes (api/_lib/verifyAdmin.js) check for it too.

// What the admin has to do next:
//   'done'   - this session already passed 2-step
//   'verify' - an authenticator app is set up; ask for a code
//   'enroll' - nothing set up yet; show the QR code to set one up
export function twoStepNeeded(aal, verifiedFactorCount) {
  if (aal?.currentLevel === 'aal2') return 'done';
  if (aal?.nextLevel === 'aal2' || verifiedFactorCount > 0) return 'verify';
  return 'enroll';
}

// Authenticator codes are 6 digits; people paste them with spaces.
export function cleanCode(input) {
  return String(input ?? '').replace(/\D/g, '').slice(0, 6);
}

// Supabase returns the QR code as an SVG. Depending on the version it
// already starts with "data:" or is the bare SVG markup.
export function qrImageSrc(qrCode) {
  if (!qrCode) return '';
  if (qrCode.startsWith('data:')) return qrCode;
  return `data:image/svg+xml;utf-8,${encodeURIComponent(qrCode)}`;
}

// Reads the current state from Supabase. Returns { step, factorId } or
// throws on a network/auth error.
export async function loadTwoStepState(supabase) {
  const { data: aal, error: aalError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError) throw aalError;

  const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
  if (factorError) throw factorError;

  const verified = (factors?.totp || []).filter(f => f.status === 'verified');
  return {
    step: twoStepNeeded(aal, verified.length),
    factorId: verified[0]?.id || null
  };
}

// True only when this session has passed 2-step. Fails closed.
export async function sessionHasTwoStep(supabase) {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return !error && data?.currentLevel === 'aal2';
  } catch {
    return false;
  }
}

// Starts setting up an authenticator app. A setup that was started and
// never finished leaves an unverified factor behind, so those are cleared
// first. Each setup gets its own name: names must be unique, and React's
// dev mode can start two setups at once.
export async function startEnrollment(supabase) {
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const stale = (factors?.all || []).filter(
    f => f.factor_type === 'totp' && f.status !== 'verified'
  );
  for (const f of stale) {
    await supabase.auth.mfa.unenroll({ factorId: f.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `GigStaffPro ${Date.now()}`,
    issuer: 'GigStaffPro'
  });
  if (error) throw error;
  return {
    factorId: data.id,
    qrSrc: qrImageSrc(data.totp?.qr_code),
    secret: data.totp?.secret || ''
  };
}

export async function verifyCode(supabase, factorId, code) {
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: cleanCode(code)
  });
  if (error) throw error;
}
