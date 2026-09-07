// api/worker-pin-login.js
// Legacy PIN-based worker login, done server-side.
//
// Previously LoginScreen.jsx fetched the full worker row (including
// pin_hash) to the browser and compared hashes client-side. Combined with
// workers.pin_hash being readable by anyone holding the public anon key
// (see the security lockdown work in this repo's migrations), that meant
// every legacy worker's PIN hash — originally an unsalted single SHA-256
// round over a short numeric PIN, i.e. trivially crackable offline — was
// exposed to anyone on the internet. This endpoint moves the hash
// comparison here so pin_hash never reaches the browser at all; a
// companion migration then revokes anon/authenticated SELECT on that one
// column.
//
// pin_hash values are also being migrated from that original unsalted
// SHA-256 format to a salted PBKDF2 format (see hashPinSalted below) —
// this endpoint accepts either on read (a still-legacy row falls back to
// hashPinLegacy) and transparently upgrades a row to the new format the
// next time its worker logs in successfully.

import { createHash, randomBytes, pbkdf2Sync, timingSafeEqual } from 'crypto';

const SUPABASE_URL = 'https://ycsauzvkrbcynifkawuw.supabase.co';

// Legacy PINs can be as short as 4 digits (10,000 combinations) with no
// account lockout, so this endpoint needs its own throttle — mirrors
// api/worker-auth-status.js's rate-limit convention (in-memory,
// per-instance, best-effort; not a hard security control, but raises
// brute-forcing a known phone number's PIN from "trivial" to
// "impractical at pilot scale"). Limited by phone (the actual attack
// target) as well as IP, since an attacker can rotate IPs but not the
// phone number they're targeting.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const rateLimitBuckets = new Map();

function isRateLimited(key) {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(key, { count: 1, windowStart: now });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

// This endpoint must read pin_hash to verify a login, and the anon key can
// no longer read that column at all (see
// supabase/migrations/20260826120000_revoke_worker_pin_hash_select.sql) —
// deliberately, since anon is reachable from any browser. service_role
// bypasses that column-level restriction and is only ever used here,
// server-side, never sent to the client.
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

// Legacy format: unsalted SHA-256 hex of the raw PIN. Still checked below
// for any pin_hash not yet upgraded to the salted format, and mirrors
// src/utils/authHelpers.js's old behavior — kept as an independent copy
// since api/ functions aren't bundled through Vite, matching the existing
// api/_lib convention.
function hashPinLegacy(pin) {
  return createHash('sha256').update(pin, 'utf8').digest('hex');
}

// Current format: PBKDF2-SHA256 with a random per-PIN salt, stored as
// "pbkdf2$<iterations>$<saltHex>$<hashHex>". Mirrors
// src/utils/authHelpers.js's hashPin()/verifyPin() — see that file's header
// comment for why a salt alone isn't enough for a 4-digit keyspace and the
// iteration count is what actually matters.
const PBKDF2_ITERATIONS = 100000;

function hashPinSalted(pin, saltHex) {
  const salt = Buffer.from(saltHex, 'hex');
  const derived = pbkdf2Sync(String(pin), salt, PBKDF2_ITERATIONS, 32, 'sha256');
  return `pbkdf2$${PBKDF2_ITERATIONS}$${saltHex}$${derived.toString('hex')}`;
}

function verifyPinSalted(pin, storedHash) {
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const [, , saltHex] = parts;
  const recomputed = hashPinSalted(pin, saltHex);
  const a = Buffer.from(recomputed, 'utf8');
  const b = Buffer.from(storedHash, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!SERVICE_ROLE_KEY) {
    console.error('worker-pin-login: SUPABASE_SERVICE_ROLE_KEY not configured');
    return res.status(500).json({ ok: false, error: 'Login failed. Please try again.' });
  }

  const { phone, pin } = req.body || {};
  if (typeof phone !== 'string' || typeof pin !== 'string' || !phone.trim() || !pin.trim()) {
    return res.status(400).json({ ok: false, error: 'Phone and PIN are required.' });
  }

  const cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone) {
    return res.status(400).json({ ok: false, error: 'Invalid phone number.' });
  }

  const ip = getClientIp(req);
  if (isRateLimited(`ip:${ip}`) || isRateLimited(`phone:${cleanPhone}`)) {
    return res.status(429).json({ ok: false, error: 'Too many attempts. Please try again later.' });
  }

  try {
    const fetchByPhone = async (phoneValue) => {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/workers?phone=eq.${encodeURIComponent(phoneValue)}&is_active=eq.true&select=*`,
        { headers }
      );
      return r.json();
    };

    // Try the raw entered value first (in case a worker's phone is stored
    // with formatting), then digits-only — mirrors the previous client-side
    // lookup's two-pass behavior exactly.
    let workers = await fetchByPhone(phone);
    if (!workers || workers.length === 0) {
      workers = await fetchByPhone(cleanPhone);
    }

    if (!workers || workers.length === 0) {
      return res.status(200).json({ ok: false, error: 'Phone number not found. Contact your manager.' });
    }

    const worker = workers[0];

    if (!worker.pin_hash) {
      return res.status(200).json({ ok: false, error: 'No PIN set for this account. Contact your manager to set up your PIN.' });
    }

    const isSalted = worker.pin_hash.startsWith('pbkdf2$');
    const valid = isSalted ? verifyPinSalted(pin, worker.pin_hash) : hashPinLegacy(pin) === worker.pin_hash;

    if (!valid) {
      return res.status(200).json({ ok: false, error: 'Incorrect PIN. Please try again.' });
    }

    // Transparent upgrade: a correct legacy-format PIN is the one moment we
    // have the raw PIN in hand server-side, so re-hash it into the salted
    // format and migrate this row on the way through. Non-critical if it
    // fails — the login itself already succeeded either way.
    if (!isSalted) {
      const newHash = hashPinSalted(pin, randomBytes(16).toString('hex'));
      fetch(`${SUPABASE_URL}/rest/v1/workers?id=eq.${worker.id}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ pin_hash: newHash }),
      }).catch(() => {});
    }

    // Never send pin_hash back to the client.
    const { pin_hash, ...safeWorker } = worker;
    return res.status(200).json({ ok: true, worker: safeWorker });
  } catch (error) {
    console.error('worker-pin-login error:', error);
    return res.status(500).json({ ok: false, error: 'Login failed. Please try again.' });
  }
}
