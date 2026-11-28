# Payments (CRM Phase 3)

Deposits, balances and tips on booked quotes, replacing Goodshuffle's
payments. Phase 3 of the CRM plan (contracts + payments); quotes and
e-signing are in `docs/QUOTES.md`.

## Decisions (Dylan, 2026-11-27)

- Start now, in the payment provider's **test mode**; go live once Dylan
  has connected the real account.
- Provider: **Stripe** (Dylan opened an account 2026-11-27). Considered
  Square (he has one) too. Fees compared 2026-11-27: both ~2.9% + 30¢ per online card payment
  (Square's "Online API" rate; its own invoices cost 3.3% on the free plan);
  bank (ACH) payments 0.8% capped at $5 (Stripe) or 1% capped at $5 (Square
  payment links). Goodshuffle today: Stripe's 2.9% + 30¢ plus a 0.25%
  transfer fee on cards, and ACH 1% capped at $60.
- Card details never touch the app: clients pay on the provider's own
  hosted page. API keys live only in Vercel environment variables, set by
  Dylan.
- The standard quote terms keep the "Gratuity is not included ... all tips
  go to the dealers" line (Dylan). Tips are only asked for after the event.

## Build order

1. **Payment record on each booking**: what's been paid and
   what's owed, recorded by hand for checks, cash and phone payments. Done
   (PR #36, SQL `20261128120000_add_quote_payments.sql`).
2. **Pay online with Stripe**: "Pay deposit" / "Pay balance" on the
   client's quote page after signing. Done (see below).
3. **Balance reminder and late-payment note**: done (see below; SQL
   `20261128130000_add_quote_emails_sent.sql`).
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

## Pay online with Stripe (step 2)

- `api/_lib/stripePay.js`. Needs `STRIPE_SECRET_KEY` in Vercel (Secret,
  Production): `sk_test_...` while testing, `sk_live_...` when live. A
  restricted key (`rk_...`) with Checkout Sessions: Write and Events: Read
  also works and is safer. Without
  it the page shows no Pay button (and says "we'll be in touch about your
  deposit", as before). Test mode adds "no real money is charged".
- On a signed quote (`/q/<code>`), a **Payments** box shows paid / owed and
  one button: "Pay $X deposit to book" until the deposit is paid, then
  "Pay $X balance". The amount is worked out on the server from
  `quote_payments` (server copy `api/_lib/quotePayments.js`); the browser
  sends only `action=pay`. The server creates a Stripe Checkout Session
  and redirects to Stripe's page. The payment methods offered are the ones
  turned on in Stripe (Settings > Payment methods): turn on Cards and ACH
  Direct Debit (US bank account). No button while
  a bank payment is still clearing.
- Recording, once per session (`provider_ref` = the Checkout Session id):
  - back from Stripe (`/q/<code>?paid=<session>`): the server fetches the
    session from Stripe, checks it belongs to this quote, records it;
  - webhook `https://www.gigstaffpro.com/api/stripe-webhook` (rewritten to
    `api/send-email.js?route=stripe-webhook`; the Vercel plan is at its
    function limit). Only the event id in the body is used: the event is
    fetched back from Stripe with the secret key, so no signing secret is
    needed and a forged call can't record anything. Events used:
    `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
    `checkout.session.async_payment_failed`.
  - Cards are recorded paid right away; bank payments are "pending" until
    Stripe says they cleared (or "failed"). A paid payment is never changed
    back.
- Webhook setup (Dylan, in Stripe > Developers > Webhooks, test mode first):
  add endpoint `https://www.gigstaffpro.com/api/stripe-webhook` with the
  three events above. Repeat in live mode when going live.
- Stripe emails the client a receipt (turn on Settings > Customer emails >
  Successful payments in Stripe).

## Balance reminder and late-payment note (step 3)

- `api/_lib/paymentReminders.js`, run by the hourly shift-reminder cron
  between 9 AM and 6 PM. Both are **off** until turned on in Settings >
  Email (settings row `client_emails`: `balance`, `late_alert`).
- **Balance reminder** (to the client, from sales@): N days (default 3)
  before the balance is due, so 10 days before the event by default, and
  until the due date if a day is missed. Only for signed quotes whose deposit
  is paid, with at least $1 still owed and nothing still clearing. Not sent
  when the lead has "Don't send auto emails". Says the amount owed and the
  due date, and links to the quote page to pay online (the link line is left
  out when Stripe isn't set up). Wording can be changed in Settings > Email
  (blanks `{amount_owed}`, `{balance_due_date}`, `{pay_link}`). Saved in
  Messages as "Auto: balance reminder".
- **Late payment note** (to the team, at the quote-request address): when a
  deposit is more than 3 days late or the balance is past due, before the
  event. Everything that became late in the same run goes in one email.
- Amounts are the signed quote's (`sent_snapshot`) minus `quote_payments`,
  the same as the client's page. Each email goes once per quote
  (`quote_emails_sent`, unique per quote and kind, claimed before sending and
  given back if the send fails).
