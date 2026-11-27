-- CRM Phase 3, step 1: payments on booked quotes. See docs/PAYMENTS.md.
--
-- Run AFTER 20261127180000_add_quote_signature.sql.
--
-- ---------------------------------------------------------------------------
-- What this does
-- ---------------------------------------------------------------------------
-- public.quote_payments: one row per payment received (or refunded) on a
-- quote: the deposit, the balance, anything extra, or a tip.
--   * kind: deposit, balance, extra, tip, refund (a refund's amount is
--     positive and is taken off what's been paid).
--   * method: card, ach, check, cash, other.
--   * status: paid, pending (e.g. a bank payment still clearing), failed.
--   * provider: manual (typed in by a rep), square or stripe (online, later
--     steps). provider_ref is the payment id at that provider; it is unique
--     so the same online payment is never recorded twice.
-- Reps record checks, cash and card payments taken by phone by hand now;
-- online payments will add rows here automatically in a later step.
-- A quote with payments can't be deleted (ON DELETE RESTRICT).
--
-- Access: admins and sales managers only (RLS public.is_admin()), like
-- quotes. Every change is written to the client access log.
-- Nothing here is readable by workers or the public.
--
-- ---------------------------------------------------------------------------
-- Undo (only if needed)
-- ---------------------------------------------------------------------------
--   DROP TABLE IF EXISTS public.quote_payments;

BEGIN;

CREATE TABLE IF NOT EXISTS public.quote_payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id      uuid NOT NULL REFERENCES public.quotes(id) ON DELETE RESTRICT,
  kind          text NOT NULL CHECK (kind IN ('deposit', 'balance', 'extra', 'tip', 'refund')),
  amount        numeric(10, 2) NOT NULL CHECK (amount > 0 AND amount <= 1000000),
  method        text NOT NULL DEFAULT 'check' CHECK (method IN ('card', 'ach', 'check', 'cash', 'other')),
  status        text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'pending', 'failed')),
  provider      text NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual', 'square', 'stripe')),
  provider_ref  text UNIQUE CHECK (provider_ref IS NULL OR length(provider_ref) <= 200),
  fee           numeric(10, 2) CHECK (fee IS NULL OR fee >= 0),
  paid_on       date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Chicago')::date,
  note          text CHECK (note IS NULL OR length(note) <= 500),
  created_by    uuid DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quote_payments_quote_idx ON public.quote_payments (quote_id);
CREATE INDEX IF NOT EXISTS quote_payments_paid_on_idx ON public.quote_payments (paid_on);

ALTER TABLE public.quote_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_payments_admin_all" ON public.quote_payments;
CREATE POLICY "quote_payments_admin_all" ON public.quote_payments
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.quote_payments FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.quote_payments TO authenticated;
GRANT ALL ON TABLE public.quote_payments TO service_role;

DROP TRIGGER IF EXISTS quote_payments_access_log ON public.quote_payments;
CREATE TRIGGER quote_payments_access_log
  AFTER INSERT OR UPDATE OR DELETE ON public.quote_payments
  FOR EACH ROW EXECUTE FUNCTION public.log_client_change();

COMMIT;
