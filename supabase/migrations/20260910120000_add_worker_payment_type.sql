-- Adds payment_type to workers: distinguishes 1099 contractors (paid by
-- check, printed the day before an event, summed across everything they
-- worked that event) from W-2 employees (paid through QuickBooks Payroll,
-- which calculates their actual check amount from hours -- this app should
-- never compute or display a "final pay" number for that group).
--
-- Nullable, no default on purpose: guessing a worker's tax/pay
-- classification is not something to do silently, even to a "likely"
-- default. Every existing worker starts unclassified and the Payments
-- export is built to visibly call out anyone still unset, rather than
-- quietly grouping them as one or the other.

BEGIN;

ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS payment_type text
  CONSTRAINT workers_payment_type_check CHECK (payment_type IN ('contractor', 'employee'));

COMMENT ON COLUMN public.workers.payment_type IS
  'How this worker is paid: contractor (1099, paid by check via the Payments view) or employee (W-2, paid through QuickBooks Payroll -- this app tracks their hours only, never a final pay amount). Null until an admin sets it.';

COMMIT;
