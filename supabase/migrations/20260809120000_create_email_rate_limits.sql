-- DRAFT ONLY — NOT APPLIED.
-- Reviewed under GigStaffPro Email Security Step E3B (persistent rate-limit
-- architecture phase). Do not run `supabase db push` or apply this against
-- any live database until it has been explicitly approved.
--
-- Purpose: a small, service_role-only table + atomic RPC backing a two-tier
-- (burst + sustained) rate limit for api/send-email.js, keyed by verified
-- admin_user_id and Vercel environment, so Preview and Production never
-- share counters and concurrent requests cannot race past the threshold.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
-- admin_user_id matches public.admin_users.id (uuid), confirmed against the
-- actual schema in the 2026-08-09 verified backup rather than assumed.
-- One row per (admin, environment, tier) — two rows per admin per
-- environment in steady state (one 'burst' row, one 'sustained' row).

CREATE TABLE public.email_rate_limits (
    admin_user_id uuid NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
    environment text NOT NULL CHECK (environment IN ('production', 'preview', 'development', 'unknown')),
    tier text NOT NULL CHECK (tier IN ('burst', 'sustained')),
    window_start timestamptz NOT NULL,
    count integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (admin_user_id, environment, tier)
);

COMMENT ON TABLE public.email_rate_limits IS
  'Best-effort-turned-persistent rate limit state for api/send-email.js. '
  'service_role access only — never exposed to anon/authenticated clients. '
  'Rows are tiny and self-resetting; no dedicated cleanup job is required '
  'at GigStaffPro''s current scale (see migration review notes).';

-- The composite primary key above IS the unique index required for the
-- atomic `INSERT ... ON CONFLICT (admin_user_id, environment, tier)`
-- upsert used by the RPC below — no separate index needed.

-- ---------------------------------------------------------------------------
-- 2. Security: RLS + grants
-- ---------------------------------------------------------------------------
-- Enable RLS with ZERO policies. This is deliberate, not an oversight: with
-- RLS on and no policies at all, anon/authenticated connections (which
-- respect RLS) are denied by default with no row visible to them under any
-- circumstance. service_role connections bypass RLS entirely per Supabase's
-- own platform architecture (the service_role Postgres role is BYPASSRLS),
-- which is exactly the access api/send-email.js already uses today via
-- SUPABASE_SERVICE_ROLE_KEY. No policy is written for anon/authenticated
-- because none should ever be able to read or write this table.

ALTER TABLE public.email_rate_limits ENABLE ROW LEVEL SECURITY;

-- Explicit belt-and-suspenders revoke/grant, even though a newly created
-- table has no PUBLIC grants by Postgres default. This project's own
-- existing schema (see admin_users) shows a real, already-existing
-- `GRANT ALL ... TO anon` on a sensitive table — being explicit here is a
-- direct, deliberate reaction to that discovered pattern, not boilerplate.

REVOKE ALL ON TABLE public.email_rate_limits FROM PUBLIC, anon, authenticated;

-- Least privilege: the RPC below is SECURITY INVOKER and only ever performs
-- INSERT ... ON CONFLICT DO UPDATE ... RETURNING against this table — no
-- DELETE, TRUNCATE, REFERENCES, or TRIGGER usage exists anywhere. Grant
-- exactly SELECT/INSERT/UPDATE rather than ALL, matching the same
-- least-privilege standard applied to public.admin_users.
GRANT SELECT, INSERT, UPDATE ON TABLE public.email_rate_limits TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Atomic RPC
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER (the default — no SECURITY DEFINER keyword below) is
-- deliberate: this function is only ever meant to be called by the
-- service_role connection, which already has full access to the table
-- directly. SECURITY DEFINER exists to let a LOWER-privileged caller borrow
-- the function owner's privileges — the opposite of what's needed here,
-- since we specifically do not want anon/authenticated calling this at
-- all. Using INVOKER avoids the extra search_path-hijacking risk surface
-- that SECURITY DEFINER would otherwise require hardening against.
--
-- Each tier's check is a single atomic `INSERT ... ON CONFLICT DO UPDATE
-- ... RETURNING` statement — Postgres locks the conflicting row for the
-- duration of the upsert, so two concurrent calls for the same
-- (admin, environment, tier) cannot both read the pre-increment count and
-- both proceed as if they were first. This is the atomicity the in-memory
-- version could never provide.
--
-- clock_timestamp() is used instead of now() deliberately: now() is frozen
-- to the start of the enclosing transaction, which would make elapsed-time
-- comparisons subtly wrong; clock_timestamp() reflects real wall-clock time
-- at the moment each statement runs.
--
-- Design choice: a request blocked by the burst tier returns immediately
-- and does NOT also increment the sustained-tier counter — a rejected
-- request shouldn't be charged against a second budget it never got to use.

CREATE FUNCTION public.check_email_rate_limit(
    p_admin_user_id uuid,
    p_environment text
)
RETURNS TABLE(allowed boolean, blocked_tier text, retry_after_seconds integer)
LANGUAGE plpgsql
AS $$
DECLARE
    v_now              timestamptz := clock_timestamp();
    v_burst_window     interval    := interval '10 seconds';
    v_burst_max        integer     := 100;
    v_sustained_window interval    := interval '5 minutes';
    v_sustained_max    integer     := 250;
    v_count            integer;
    v_window_start     timestamptz;
BEGIN
    -- Normalize an unexpected/missing environment value defensively, even
    -- though the CHECK constraint on the table would reject anything else
    -- at insert time anyway — fail closed into the isolated 'unknown'
    -- bucket rather than erroring the whole email send.
    IF p_environment IS NULL OR p_environment NOT IN ('production', 'preview', 'development', 'unknown') THEN
        p_environment := 'unknown';
    END IF;

    -- Burst tier
    INSERT INTO public.email_rate_limits (admin_user_id, environment, tier, window_start, count, updated_at)
    VALUES (p_admin_user_id, p_environment, 'burst', v_now, 1, v_now)
    ON CONFLICT (admin_user_id, environment, tier) DO UPDATE
    SET
        count = CASE
            WHEN v_now - public.email_rate_limits.window_start >= v_burst_window THEN 1
            ELSE public.email_rate_limits.count + 1
        END,
        window_start = CASE
            WHEN v_now - public.email_rate_limits.window_start >= v_burst_window THEN v_now
            ELSE public.email_rate_limits.window_start
        END,
        updated_at = v_now
    RETURNING public.email_rate_limits.count, public.email_rate_limits.window_start
    INTO v_count, v_window_start;

    IF v_count > v_burst_max THEN
        RETURN QUERY SELECT
            false,
            'burst'::text,
            GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_window_start + v_burst_window - v_now))))::integer;
        RETURN;
    END IF;

    -- Sustained tier (only reached if burst tier allowed the request)
    INSERT INTO public.email_rate_limits (admin_user_id, environment, tier, window_start, count, updated_at)
    VALUES (p_admin_user_id, p_environment, 'sustained', v_now, 1, v_now)
    ON CONFLICT (admin_user_id, environment, tier) DO UPDATE
    SET
        count = CASE
            WHEN v_now - public.email_rate_limits.window_start >= v_sustained_window THEN 1
            ELSE public.email_rate_limits.count + 1
        END,
        window_start = CASE
            WHEN v_now - public.email_rate_limits.window_start >= v_sustained_window THEN v_now
            ELSE public.email_rate_limits.window_start
        END,
        updated_at = v_now
    RETURNING public.email_rate_limits.count, public.email_rate_limits.window_start
    INTO v_count, v_window_start;

    IF v_count > v_sustained_max THEN
        RETURN QUERY SELECT
            false,
            'sustained'::text,
            GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_window_start + v_sustained_window - v_now))))::integer;
        RETURN;
    END IF;

    RETURN QUERY SELECT true, NULL::text, NULL::integer;
END;
$$;

COMMENT ON FUNCTION public.check_email_rate_limit(uuid, text) IS
  'Atomic two-tier (burst + sustained) rate check for api/send-email.js. '
  'Call with the verified admin_user_id and Vercel environment. Returns '
  'allowed=false with blocked_tier and retry_after_seconds when over '
  'either threshold. service_role execution only.';

-- Postgres grants EXECUTE to PUBLIC by default for new functions — the
-- opposite of the table default — so this must be explicitly revoked.

REVOKE ALL ON FUNCTION public.check_email_rate_limit(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_email_rate_limit(uuid, text) TO service_role;
