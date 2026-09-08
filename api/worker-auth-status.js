// api/worker-auth-status.js
// Pilot endpoint: given a phone number, reports whether that worker has
// been migrated to Supabase Auth. Contract is deliberately narrow — every
// response, success or failure, is exactly { migrated: boolean }. No
// identifiers are ever returned.

import { createClient } from '@supabase/supabase-js';
import { normalizeUsPhoneToE164 } from './_lib/workerAuth.js';
import { createRateLimiter, getClientIp } from './_lib/rateLimit.js';

// In-memory, per-instance, best-effort only — not shared across concurrent
// serverless instances or cold starts. Acceptable for pilot-scale abuse
// mitigation, not a hard security control.
const isRateLimited = createRateLimiter(10, 60 * 1000);

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
