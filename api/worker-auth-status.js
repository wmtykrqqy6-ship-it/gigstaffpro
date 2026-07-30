// api/worker-auth-status.js
// Pilot endpoint: given a phone number, reports whether that worker has
// been migrated to Supabase Auth. Contract is deliberately narrow — every
// response, success or failure, is exactly { migrated: boolean }. No
// identifiers are ever returned.

import { createClient } from '@supabase/supabase-js';
import { normalizeUsPhoneToE164 } from './_lib/workerAuth.js';

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

// In-memory, per-instance, best-effort only — not shared across concurrent
// serverless instances or cold starts. Acceptable for pilot-scale abuse
// mitigation, not a hard security control.
const rateLimitBuckets = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(ip);

  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(ip, { count: 1, windowStart: now });
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ migrated: false });
  }

  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return res.status(429).json({ migrated: false });
  }

  try {
    const phoneE164 = normalizeUsPhoneToE164(req.body?.phone);

    if (!phoneE164) {
      return res.status(200).json({ migrated: false });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({ migrated: false });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: link, error } = await supabaseAdmin
      .from('worker_auth_links')
      .select('auth_user_id')
      .eq('phone_e164', phoneE164)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ migrated: false });
    }

    return res.status(200).json({ migrated: !!link });
  } catch (unexpectedError) {
    return res.status(500).json({ migrated: false });
  }
}
