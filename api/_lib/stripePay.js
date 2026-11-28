// Online payments with Stripe (CRM Phase 3 step 2, docs/PAYMENTS.md).
//
// The client pays on Stripe's own hosted Checkout page, so card and bank
// details never touch this app. Flow:
//   1. On a signed quote's page (/q/<code>) the client presses "Pay deposit"
//      (or "Pay balance"). The server works out what is owed from
//      quote_payments (never from the browser), creates a Checkout Session
//      and redirects the client to Stripe.
//   2. Stripe sends them back to /q/<code>?paid=<session id>. The server
//      fetches that session from Stripe and records the payment.
//   3. Stripe also calls /api/stripe-webhook (rewritten to
//      api/send-email.js?route=stripe-webhook). The webhook body is not
//      trusted: only its event id is used, and the event is fetched back from
//      Stripe with our secret key (so no webhook signing secret is needed).
//      This catches bank (ACH) payments that clear days later, failures, and
//      clients who close the tab before coming back.
// A payment is recorded once per Checkout Session (quote_payments.provider_ref
// is unique), however many of these paths see it.
//
// Needs STRIPE_SECRET_KEY in the Vercel environment (sk_test_... while
// testing, sk_live_... when live). Without it, no Pay button is shown.

import { summarizePayments, centralToday } from './quotePayments.js';

const STRIPE_API = 'https://api.stripe.com/v1';
export const SESSION_ID_REGEX = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;
const EVENT_ID_REGEX = /^evt_[A-Za-z0-9]{10,200}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_PAYMENT = 1; // dollars; Stripe's minimum is $0.50

export const stripeEnabled = (env = process.env) => /^sk_(test|live)_/.test(String(env.STRIPE_SECRET_KEY || ''));
export const isTestKey = (env = process.env) => String(env.STRIPE_SECRET_KEY || '').startsWith('sk_test_');

// Stripe takes form-encoded bodies with bracketed keys: a[b][0][c]=1.
export function encodeForm(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item && typeof item === 'object') out.push(encodeForm(item, `${key}[${i}]`));
        else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof v === 'object') {
      out.push(encodeForm(v, key));
    } else {
      out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return out.filter(Boolean).join('&');
}

export async function stripeCall(env, fetchImpl, method, path, params, idempotencyKey) {
  const headers = { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` };
  let body;
  if (method === 'POST') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = encodeForm(params || {});
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  }
  const r = await fetchImpl(`${STRIPE_API}${path}`, { method, headers, body });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(`stripe ${path.split('?')[0]}: HTTP ${r.status} ${data?.error?.code || ''}`.trim());
    err.status = r.status;
    throw err;
  }
  return data;
}

// The next payment the client can make online: the deposit first, then the
// balance. null when nothing is owed (or the quote isn't signed).
export function nextOnlinePayment(quote, payments, today = centralToday()) {
  if (!quote || quote.status !== 'accepted') return null;
  const s = summarizePayments(quote, payments, today);
  if (s.status === 'deposit_due' && s.depositOwed >= MIN_PAYMENT) return { kind: 'deposit', amount: s.depositOwed, summary: s };
  if (s.status === 'deposit_paid' && s.owed >= MIN_PAYMENT) return { kind: 'balance', amount: s.owed, summary: s };
  return { kind: null, amount: 0, summary: s };
}

const toCents = (dollars) => Math.round(Number(dollars) * 100);

// Checkout Session parameters for one payment.
export function checkoutParams({ quote, snapshot, kind, amount, pageUrl }) {
  const label = kind === 'deposit' ? '50% deposit' : 'Balance';
  const eventName = String(snapshot?.name || 'Casino party').slice(0, 120);
  const date = snapshot?.event?.date ? ` (${snapshot.event.date})` : '';
  const email = String(snapshot?.contact?.email || '').trim();
  return {
    mode: 'payment',
    'payment_method_types': ['card', 'us_bank_account'],
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: toCents(amount),
        product_data: { name: `${label}: ${eventName}${date}`.slice(0, 250) }
      }
    }],
    customer_email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined,
    client_reference_id: quote.id,
    metadata: { quote_id: quote.id, kind },
    payment_intent_data: {
      description: `Vegas on Wheels ${label.toLowerCase()}: ${eventName}`.slice(0, 250),
      metadata: { quote_id: quote.id, kind }
    },
    success_url: `${pageUrl}?paid={CHECKOUT_SESSION_ID}`,
    cancel_url: pageUrl
  };
}

// Creates the session. The idempotency key is per quote + kind + amount +
// minute, so a double click doesn't make two sessions.
export async function createCheckout({ env, fetchImpl = fetch, quote, snapshot, kind, amount, pageUrl, now = new Date() }) {
  const minute = Math.floor(now.getTime() / 60000);
  const session = await stripeCall(env, fetchImpl, 'POST', '/checkout/sessions',
    checkoutParams({ quote, snapshot, kind, amount, pageUrl }),
    `quote-${quote.id}-${kind}-${toCents(amount)}-${minute}`);
  if (!session?.url || !/^https:\/\/checkout\.stripe\.com\//.test(session.url)) throw new Error('stripe: no checkout url');
  return session;
}

// quote_payments row for a Checkout Session, or null if it isn't ours / paid.
//   status: 'paid' once Stripe says paid; 'pending' when a bank payment is
//   still clearing; 'failed' for a failed bank payment.
export function paymentRowFromSession(session, { failed = false, async: asyncEvent = false } = {}) {
  if (!session || session.object !== 'checkout.session' || !SESSION_ID_REGEX.test(String(session.id || ''))) return null;
  const quoteId = session.metadata?.quote_id;
  const kind = session.metadata?.kind;
  if (!UUID_REGEX.test(String(quoteId || '')) || !['deposit', 'balance'].includes(kind)) return null;
  if (session.status !== 'complete' && !failed) return null; // not finished at Stripe
  const amount = Math.round(Number(session.amount_total || 0)) / 100;
  if (!(amount > 0)) return null;
  let status;
  if (failed) status = 'failed';
  else if (session.payment_status === 'paid') status = 'paid';
  else status = 'pending'; // bank payment still clearing
  // Cards are paid the moment Checkout completes; a bank (ACH) payment
  // completes unpaid and is settled later by an async_payment event.
  const method = asyncEvent || session.payment_status !== 'paid' ? 'ach' : 'card';
  const created = Number(session.created) ? new Date(Number(session.created) * 1000) : new Date();
  return {
    quote_id: quoteId,
    kind,
    amount,
    method,
    status,
    provider: 'stripe',
    provider_ref: session.id,
    paid_on: centralToday(created),
    note: session.livemode === false ? 'Stripe test mode' : null
  };
}

// Records (or updates) the payment for a session. Never downgrades a paid
// payment, and never changes the amount or method of an existing one.
export async function recordSession({ call, session, failed = false, async: asyncEvent = false }) {
  const row = paymentRowFromSession(session, { failed, async: asyncEvent });
  if (!row) return { recorded: false };
  const existing = (await call(`quote_payments?provider_ref=eq.${encodeURIComponent(row.provider_ref)}&select=id,status`)) || [];
  if (existing[0]) {
    const was = existing[0].status;
    const upgrade = (was === 'pending' && (row.status === 'paid' || row.status === 'failed'));
    if (!upgrade) return { recorded: false, status: was };
    await call(`quote_payments?id=eq.${existing[0].id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: row.status, updated_at: new Date().toISOString() })
    });
    return { recorded: true, status: row.status, updated: true };
  }
  await call('quote_payments?on_conflict=provider_ref', {
    method: 'POST',
    headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' },
    body: JSON.stringify(row)
  });
  return { recorded: true, status: row.status, row };
}

// Stripe webhook. Only the event id is read from the body; the event itself
// is fetched from Stripe so a forged call can't record a payment.
export async function handleStripeWebhook(req, res, { env = process.env, fetchImpl = fetch, call }) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!stripeEnabled(env)) return res.status(503).json({ ok: false });
  const id = String((req.body && typeof req.body === 'object' && req.body.id) || '');
  if (!EVENT_ID_REGEX.test(id)) return res.status(400).json({ ok: false });
  let event;
  try {
    event = await stripeCall(env, fetchImpl, 'GET', `/events/${id}`);
  } catch (err) {
    // 404: not an event of this account. Tell Stripe to stop retrying.
    if (err.status === 404) return res.status(200).json({ ok: true, ignored: true });
    console.error('stripe webhook fetch failed:', err.message);
    return res.status(500).json({ ok: false });
  }
  const types = {
    'checkout.session.completed': {},
    'checkout.session.async_payment_succeeded': { async: true },
    'checkout.session.async_payment_failed': { failed: true, async: true }
  };
  const how = types[event?.type];
  if (!how) return res.status(200).json({ ok: true, ignored: true });
  try {
    const result = await recordSession({ call, session: event.data?.object, ...how });
    return res.status(200).json({ ok: true, ...('status' in result ? { status: result.status } : {}) });
  } catch (err) {
    console.error('stripe webhook record failed:', err.message);
    return res.status(500).json({ ok: false }); // Stripe retries
  }
}
