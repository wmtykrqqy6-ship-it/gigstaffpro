# Payments (CRM Phase 3)

Deposits, balances and tips on booked quotes, replacing Goodshuffle's
payments. Phase 3 of the CRM plan (contracts + payments); quotes and
e-signing are in `docs/QUOTES.md`.

## Decisions (Dylan, 2026-11-27)

- Start now, in the payment provider's **test mode**; go live once Dylan
  has connected the real account.
- Provider: Square (Dylan already has an account) or Stripe (no account
  yet). Fees compared 2026-11-27: both ~2.9% + 30¢ per online card payment
  (Square's "Online API" rate; its own invoices cost 3.3% on the free plan);
  bank (ACH) payments 0.8% capped at $5 (Stripe) or 1% capped at $5 (Square
  payment links). Goodshuffle today: Stripe's 2.9% + 30¢ plus a 0.25%
  transfer fee on cards, and ACH 1% capped at $60. Decision pending.
- Card details never touch the app: clients pay on the provider's own
  hosted page. API keys live only in Vercel environment variables, set by
  Dylan.
- The standard quote terms keep the "Gratuity is not included ... all tips
  go to the dealers" line (Dylan). Tips are only asked for after the event.

## Build order

1. **Payment record on each booking** (this step): what's been paid and
   what's owed, recorded by hand for checks, cash and phone payments. Done
   (PR, SQL `20261128120000_add_quote_payments.sql`).
2. Pay online: a "Pay deposit" button on the client's quote page after
   signing, and "Pay balance" links, through the provider's hosted checkout.
   A webhook records each payment here automatically (`provider_ref` keeps
   it from being recorded twice).
3. Balance reminder email 7 days before the event (and a note to the team
   when a deposit or balance is late).
4. Tip link in the Monday-after email, feeding the crew tip split.
5. QuickBooks sync of payments.

## Payment record (step 1)

- Table `public.quote_payments`, admin-only (RLS `is_admin()`), changes
  written to the client access log. One row per payment: `kind` (deposit,
  balance, extra, tip, refund), `amount` (always positive; refunds are taken
  off), `method` (check, card, ach, cash, other), `status` (paid, pending,
  failed), `provider` (manual, square, stripe), `provider_ref`, `fee`,
  `paid_on`, `note`. A quote with payments can't be deleted.
- Screen: open a booked (accepted) quote from its chip on the lead card. The
  **Payments** box shows total, paid, still owed, and the deposit due now or
  the balance due date, plus each payment. "+ Record payment" fills in the
  next expected payment (the deposit, then the balance). Reps can delete a
  payment they typed in; online payments can't be deleted from here.
- Lead cards show the payment status on each booked quote's chip: deposit
  due, deposit paid, paid in full, or deposit late / balance late (red).
- Rules (`src/utils/quotePayments.js`, tested): paid = paid deposits,
  balances and extras minus refunds; tips are counted separately and never
  reduce what's owed; pending and failed payments don't count. The deposit
  is late 3 days after signing; the balance is late after its due date
  (7 days before the event).
