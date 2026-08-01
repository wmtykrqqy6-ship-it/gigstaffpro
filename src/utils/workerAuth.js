// src/utils/workerAuth.js
// Frontend-safe mirror of api/_lib/workerAuth.js — same US phone
// normalization and synthetic email derivation rules, kept in lockstep so
// the browser can derive the identical Supabase Auth email the backend
// used when migrating a worker. No Node-only APIs, no secrets.

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
export function deriveSyntheticWorkerEmail(phoneE164) {
  const digitsOnly = phoneE164.replace(/^\+/, '');
  return `${digitsOnly}@${SYNTHETIC_EMAIL_DOMAIN}`;
}
