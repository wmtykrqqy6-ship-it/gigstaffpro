// api/_lib/workerAuth.js
// Shared helpers for the worker Supabase-Auth migration pilot: phone
// normalization and synthetic email derivation. Both worker-auth-status
// and admin-set-worker-pin import from here so they can never disagree on
// what counts as the same phone number / identity.

const SYNTHETIC_EMAIL_DOMAIN = 'workers.gigstaffpro.invalid';

// Normalizes a US phone number to E.164 (+1XXXXXXXXXX).
// Returns null for anything that isn't a recognizable 10-digit or
// 11-digit-leading-1 US number — callers must treat null as "not a valid
// phone," never throw on it.
export function normalizeUsPhoneToE164(rawPhone) {
  if (!rawPhone) return null;
  const digits = String(rawPhone).replace(/\D/g, '');

  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  return null;
}

// Derives the synthetic Auth email for a given E.164 phone number.
// Input MUST already be a valid E.164 string (from normalizeUsPhoneToE164).
export function deriveSyntheticEmail(phoneE164) {
  const digitsOnly = phoneE164.replace(/^\+/, '');
  return `${digitsOnly}@${SYNTHETIC_EMAIL_DOMAIN}`;
}
