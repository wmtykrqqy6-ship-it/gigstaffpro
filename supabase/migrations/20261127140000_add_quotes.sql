-- CRM Phase 2, step 2: quotes. See docs/QUOTES.md.
--
-- Run AFTER 20261127130000_add_price_items.sql.
--
-- ---------------------------------------------------------------------------
-- What this does
-- ---------------------------------------------------------------------------
-- public.quotes: one row per quote, built on a lead in the Leads tab.
--   * lines (jsonb): the quote's lines as priced when saved: a copy of each
--     price item's name, price, tax setting and description, so later price
--     list edits never change a saved or sent quote. Lines the pricing rules
--     add (delivery, travel, extra hours, fundraiser discount) carry "auto".
--   * subtotal / tax / total / deposit: worked out by the app
--     (src/utils/quotePricing.js) and saved with the lines.
--   * status: draft, sent, accepted, declined, cancelled. Sending and the
--     client's page come in step 5; for now quotes are drafts.
--   * auto_off: pricing rules the rep turned off on this quote.
-- Deleting a lead or client keeps its quotes (the link is cleared).
--
-- Access: admins and sales managers only (RLS public.is_admin()), like
-- leads. Every change is written to the client access log, like leads.
--
-- ---------------------------------------------------------------------------
-- Undo (only if needed)
-- ---------------------------------------------------------------------------
--   DROP TABLE IF EXISTS public.quotes;

BEGIN;

DO $$
DECLARE
  id_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO id_type
  FROM pg_attribute a
  WHERE a.attrelid = 'public.clients'::regclass
    AND a.attname = 'id'
    AND NOT a.attisdropped;

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.quotes (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id         uuid REFERENCES public.leads(id) ON DELETE SET NULL,
      client_id       %s REFERENCES public.clients(id) ON DELETE SET NULL,
      status          text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'cancelled')),
      name            text CHECK (name IS NULL OR length(name) <= 200),
      event_date      date,
      start_time      text CHECK (start_time IS NULL OR start_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
      end_time        text CHECK (end_time IS NULL OR end_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
      guest_count     integer CHECK (guest_count IS NULL OR guest_count BETWEEN 0 AND 100000),
      venue           text CHECK (venue IS NULL OR length(venue) <= 200),
      address         text CHECK (address IS NULL OR length(address) <= 300),
      miles           numeric(7, 1) CHECK (miles IS NULL OR miles >= 0),
      fundraiser      boolean NOT NULL DEFAULT false,
      extra_hour_mode text NOT NULL DEFAULT 'ahead' CHECK (extra_hour_mode IN ('ahead', 'event')),
      tax_rate        numeric(6, 4) NOT NULL DEFAULT 0 CHECK (tax_rate BETWEEN 0 AND 0.2),
      tax_county      text CHECK (tax_county IS NULL OR length(tax_county) <= 80),
      auto_off        text[] NOT NULL DEFAULT '{}',
      lines           jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(lines) = 'array'),
      subtotal        numeric(10, 2) NOT NULL DEFAULT 0,
      tax             numeric(10, 2) NOT NULL DEFAULT 0,
      total           numeric(10, 2) NOT NULL DEFAULT 0,
      deposit         numeric(10, 2) NOT NULL DEFAULT 0,
      client_notes    text CHECK (client_notes IS NULL OR length(client_notes) <= 4000),
      internal_notes  text CHECK (internal_notes IS NULL OR length(internal_notes) <= 4000),
      created_by      uuid DEFAULT auth.uid(),
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now(),
      sent_at         timestamptz,
      accepted_at     timestamptz
    )$sql$, id_type);
END $$;

CREATE INDEX IF NOT EXISTS quotes_lead_idx ON public.quotes (lead_id);
CREATE INDEX IF NOT EXISTS quotes_client_idx ON public.quotes (client_id);
CREATE INDEX IF NOT EXISTS quotes_event_date_idx ON public.quotes (event_date);

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quotes_admin_all" ON public.quotes;
CREATE POLICY "quotes_admin_all" ON public.quotes
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.quotes FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.quotes TO authenticated;
GRANT ALL ON TABLE public.quotes TO service_role;

DROP TRIGGER IF EXISTS quotes_access_log ON public.quotes;
CREATE TRIGGER quotes_access_log
  AFTER INSERT OR UPDATE OR DELETE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.log_client_change();

COMMIT;
