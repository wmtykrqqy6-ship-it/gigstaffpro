// Shared in-memory rate limiter for api/ endpoints.
// In-memory, per-instance, best-effort only — not shared across concurrent
// serverless instances or cold starts. Acceptable for pilot-scale abuse
// mitigation, not a hard security control.
//
// Each call site creates its own bucket Map via createRateLimiter(max,
// windowMs) rather than sharing one Map across endpoints, so limits stay
// independent per action. Stale buckets are swept opportunistically once
// the Map grows past a threshold, so a long-lived warm instance can't
// accumulate one entry per caller forever.

const SWEEP_THRESHOLD = 5000;

export function createRateLimiter(max, windowMs) {
  const buckets = new Map();

  return function isRateLimited(key) {
    const now = Date.now();

    if (buckets.size > SWEEP_THRESHOLD) {
      for (const [k, bucket] of buckets) {
        if (now - bucket.windowStart >= windowMs) buckets.delete(k);
      }
    }

    const bucket = buckets.get(key);
    if (!bucket || now - bucket.windowStart >= windowMs) {
      buckets.set(key, { count: 1, windowStart: now });
      return false;
    }

    bucket.count += 1;
    return bucket.count > max;
  };
}

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}
