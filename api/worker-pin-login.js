// api/worker-pin-login.js
// Legacy PIN-based worker login, done server-side.
//
// Previously LoginScreen.jsx fetched the full worker row (including
// pin_hash) to the browser and compared hashes client-side. Combined with
// workers.pin_hash being readable by anyone holding the public anon key
// (see the security lockdown work in this repo's migrations), that meant
// every legacy worker's PIN hash — an unsalted single SHA-256 round over a
// short numeric PIN, i.e. trivially crackable offline — was exposed to
// anyone on the internet. This endpoint moves the hash comparison here so
// pin_hash never reaches the browser at all; a companion migration then
// revokes anon/authenticated SELECT on that one column.

import { createHash } from 'crypto';

const SUPABASE_URL = 'https://ycsauzvkrbcynifkawuw.supabase.co';

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

// Mirrors src/utils/authHelpers.js's hashPin() exactly (SHA-256 hex of the
// raw PIN, no salt) — kept as an independent copy since api/ functions
// aren't bundled through Vite, matching the existing api/_lib convention.
function hashPin(pin) {
  return createHash('sha256').update(pin, 'utf8').digest('hex');
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

    if (hashPin(pin) !== worker.pin_hash) {
      return res.status(200).json({ ok: false, error: 'Incorrect PIN. Please try again.' });
    }

    // Never send pin_hash back to the client.
    const { pin_hash, ...safeWorker } = worker;
    return res.status(200).json({ ok: true, worker: safeWorker });
  } catch (error) {
    console.error('worker-pin-login error:', error);
    return res.status(500).json({ ok: false, error: 'Login failed. Please try again.' });
  }
}
