// Payment emails for booked quotes (CRM Phase 3 step 3, docs/PAYMENTS.md).
//
//   balance       to the client, N days (default 3) before the balance is due
//                 (the balance is due 7 days before the event), with a link
//                 to pay online when Stripe is set up. Only when the deposit
//                 is paid and a balance is still owed.
//   deposit_late  to the team (the quote-request address, sales@), when a
//   balance_late  deposit is more than 3 days late or the balance is past due.
//
// Both are off until turned on in Settings > Email (client_emails settings
// row: balance, late_alert). Runs on the hourly shift-reminder cron, 9 AM to
// 6 PM. Amounts come from quote_payments and the signed quote (sent_snapshot),
// the same numbers the client's quote page shows.
// Each email goes once per quote: quote_emails_sent holds a row per
// (quote, kind), inserted before sending and removed if the send fails.
// "Don't send auto emails" on the lead stops the client reminder (not the
// team note).

import { escapeHtml } from './escapeHtml.js';
import { renderEmailShell, htmlToPlainText } from './emailShell.js';
import { CLIENT_EMAILS_KEY, normalizeClientEmailSettings, addDays, DEFAULT_WORDING, templateValues, fillSubject, renderMessageHtml } from './clientEmailSettings.js';
import { fmtLeadDate, BUSINESS_PHONE, DEFAULT_LEAD_EMAIL, CLIENT_FROM } from './leadFollowups.js';
import { recordClientMessage } from './recordClientMessage.js';
import { summarizePayments, formatMoney } from './quotePayments.js';
import { stripeEnabled } from './stripePay.js';
import { QUOTE_SETTINGS_KEY, parseQuoteSettings, quoteUrl, TOKEN_REGEX } from './quotePage.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_OWED = 1; // dollars

// The signed amounts: the snapshot the client accepted, else the quote row.
const signedQuote = (q) => {
  const s = q?.sent_snapshot || {};
  return { ...q, total: s.total ?? q?.total, deposit: s.deposit ?? q?.deposit };
};

const clientEmail = (q, lead) => {
  const e = String(q?.sent_snapshot?.contact?.email || lead?.email || '').trim();
  return EMAIL_REGEX.test(e) ? e : null;
};

export const quoteName = (q) => String(q?.sent_snapshot?.name || q?.name || 'Casino party').slice(0, 120);

// What's due today. `sent` = Set of `${quoteId}:${kind}`; `leads` = Map id -> lead.
// Returns { reminders: [{ quote, lead, summary, email }], late: [{ quote, kind, summary }] }.
export function duePaymentEmails(quotes, paymentsByQuote, settings, { today, sent = new Set(), leads = new Map() }) {
  const reminders = [];
  const late = [];
  for (const q of quotes || []) {
    if (!q || q.status !== 'accepted' || !/^\d{4}-\d{2}-\d{2}$/.test(String(q.event_date || ''))) continue;
    if (q.event_date < today) continue;
    const s = summarizePayments(signedQuote(q), paymentsByQuote.get(q.id) || [], today);
    const lead = q.lead_id ? leads.get(q.lead_id) : null;

    if (settings.balance?.on && !sent.has(`${q.id}:balance`) && s.status === 'deposit_paid'
      && s.owed >= MIN_OWED && !(s.pending > 0) && s.balanceDue && today < q.event_date) {
      const due = addDays(s.balanceDue, -settings.balance.days);
      const email = clientEmail(q, lead);
      if (today >= due && today <= s.balanceDue && email && !lead?.followup_paused) {
        reminders.push({ quote: q, lead, summary: s, email });
      }
    }

    if (settings.late_alert?.on && s.overdue && !(s.pending > 0)) {
      const kind = s.overdue === 'deposit' ? 'deposit_late' : 'balance_late';
      if (!sent.has(`${q.id}:${kind}`)) late.push({ quote: q, kind, summary: s });
    }
  }
  return { reminders, late };
}

export function buildBalanceEmail({ quote, lead, summary, payUrl, settings }) {
  const w = settings.balance || {};
  const values = templateValues(
    { name: quote.sent_snapshot?.contact?.name || lead?.name || '', start_time: quote.start_time, event_location: quote.venue },
    {
      settings, eventDateText: fmtLeadDate(quote.event_date), phone: BUSINESS_PHONE,
      payment: { owed: formatMoney(summary.owed), dueDateText: fmtLeadDate(summary.balanceDue), payUrl }
    }
  );
  const subject = fillSubject(w.subject || DEFAULT_WORDING.balance.subject, values);
  const html = renderEmailShell({ subtitle: 'Balance reminder', bodyHtml: renderMessageHtml(w.message || DEFAULT_WORDING.balance.message, values) });
  return { subject, html, text: htmlToPlainText(html) };
}

const LATE_TEXT = { deposit_late: 'Deposit late', balance_late: 'Balance past due' };

export function buildLateEmail(items) {
  const rows = items.map(({ quote, kind, summary }) => {
    const who = quote.sent_snapshot?.contact?.name || quote.accepted_name || '';
    const owedNow = kind === 'deposit_late' ? summary.depositOwed : summary.owed;
    return {
      line: `${LATE_TEXT[kind]}: ${quoteName(quote)}${who ? ` (${who})` : ''}, event ${fmtLeadDate(quote.event_date) || quote.event_date}. Owed: ${formatMoney(owedNow)} of ${formatMoney(summary.total)}.`,
      html: `<li style="margin:0 0 6px"><strong>${escapeHtml(LATE_TEXT[kind])}:</strong> ${escapeHtml(quoteName(quote))}${who ? ` (${escapeHtml(who)})` : ''}, event ${escapeHtml(fmtLeadDate(quote.event_date) || quote.event_date)}. Owed: ${escapeHtml(formatMoney(owedNow))} of ${escapeHtml(formatMoney(summary.total))}.</li>`
    };
  });
  const subject = items.length === 1
    ? `${LATE_TEXT[items[0].kind]}: ${quoteName(items[0].quote)}`
    : `${items.length} late payments on booked events`;
  const bodyHtml = `<p style="margin:0 0 12px">${items.length === 1 ? 'This booked event has a late payment:' : 'These booked events have late payments:'}</p>`
    + `<ul style="margin:0 0 12px;padding-left:20px">${rows.map(r => r.html).join('')}</ul>`
    + '<p style="margin:0 0 12px">Open the lead in GigStaffPro (Leads, then the quote) to see the payments or record one that came in by check.</p>';
  const html = renderEmailShell({ subtitle: 'Late payment', bodyHtml });
  return { subject: subject.replace(/[\r\n]/g, ' ').slice(0, 200), html, text: htmlToPlainText(html) };
}

export async function sendPaymentReminders({ now = new Date(), today, env = process.env, fetchImpl = fetch } = {}) {
  const results = { reminders: 0, late: 0, sent: 0, errors: [] };
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = env.RESEND_API_KEY;
  if (!url || !key || !resendKey) return { ...results, message: 'Payment emails not configured' };
  if (!today) return { ...results, message: 'No business date' };

  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const call = async (path, opts = {}) => {
    const r = await fetchImpl(`${url}/rest/v1/${path}`, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
    if (!r.ok) { const e = new Error(`${path.split('?')[0]}: HTTP ${r.status}`); e.status = r.status; throw e; }
    return opts.method === 'DELETE' || r.status === 204 ? null : r.json();
  };

  const rows = await call(`settings?select=setting_key,setting_value&setting_key=in.(${CLIENT_EMAILS_KEY},lead_email,${QUOTE_SETTINGS_KEY})`);
  const byKey = Object.fromEntries((rows || []).map(s => [s.setting_key, s.setting_value]));
  const settings = normalizeClientEmailSettings(byKey[CLIENT_EMAILS_KEY]);
  if (!settings.balance.on && !settings.late_alert.on) return { ...results, message: 'Payment emails are off' };
  const leadEmail = String(byKey.lead_email ?? '').replace(/"/g, '').trim();
  const teamTo = EMAIL_REGEX.test(leadEmail) ? leadEmail : DEFAULT_LEAD_EMAIL;
  const quoteSettings = parseQuoteSettings(byKey[QUOTE_SETTINGS_KEY]);
  const online = stripeEnabled(env);

  const quotes = await call(`quotes?select=id,lead_id,client_id,status,name,event_date,start_time,venue,total,deposit,accepted_at,accepted_name,public_token,sent_snapshot&status=eq.accepted&event_date=gte.${today}&limit=1000`);
  if (!quotes?.length) return results;
  const ids = quotes.map(q => q.id).join(',');
  let sentRows;
  try {
    sentRows = await call(`quote_emails_sent?select=quote_id,kind&quote_id=in.(${ids})`);
  } catch (err) {
    if (err.status === 404 || err.status === 400) return { ...results, message: 'Run SQL 20261128130000 to turn on payment emails' };
    throw err;
  }
  const sent = new Set((sentRows || []).map(s => `${s.quote_id}:${s.kind}`));
  const payRows = await call(`quote_payments?select=quote_id,kind,amount,status&quote_id=in.(${ids})&limit=10000`);
  const paymentsByQuote = new Map();
  for (const p of payRows || []) {
    if (!paymentsByQuote.has(p.quote_id)) paymentsByQuote.set(p.quote_id, []);
    paymentsByQuote.get(p.quote_id).push(p);
  }
  const leadIds = [...new Set(quotes.map(q => q.lead_id).filter(Boolean))];
  const leadRows = leadIds.length ? await call(`leads?select=id,name,email,followup_paused&id=in.(${leadIds.join(',')})`) : [];
  const leads = new Map((leadRows || []).map(l => [l.id, l]));

  const { reminders, late } = duePaymentEmails(quotes, paymentsByQuote, settings, { today, sent, leads });
  results.reminders = reminders.length;
  results.late = late.length;

  const claim = async (quoteId, kind) => {
    const got = await call('quote_emails_sent?on_conflict=quote_id,kind', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify([{ quote_id: quoteId, kind }])
    });
    return Array.isArray(got) && got.length > 0;
  };
  const unclaim = (quoteId, kind) => call(`quote_emails_sent?quote_id=eq.${quoteId}&kind=eq.${kind}`, { method: 'DELETE' });
  const resend = (payload) => fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: CLIENT_FROM, ...payload })
  });

  for (const r of reminders) {
    const { quote, lead, email } = r;
    try {
      if (!(await claim(quote.id, 'balance'))) continue;
      const payUrl = online && TOKEN_REGEX.test(String(quote.public_token || '')) ? quoteUrl(quoteSettings.link_base, quote.public_token) : '';
      const { subject, html, text } = buildBalanceEmail({ ...r, payUrl, settings });
      const res = await resend({ to: [email], reply_to: teamTo, subject, html, text });
      if (!res.ok) {
        await unclaim(quote.id, 'balance');
        results.errors.push({ quoteId: quote.id, kind: 'balance', error: `Resend HTTP ${res.status}` });
        continue;
      }
      results.sent++;
      const sentId = (await res.json().catch(() => null))?.id;
      await recordClientMessage({ env, fetchImpl, row: {
        direction: 'out', kind: 'balance', lead_id: quote.lead_id ?? null, client_id: quote.client_id ?? null,
        contact_email: email.toLowerCase(), contact_name: lead?.name || quote.sent_snapshot?.contact?.name || null,
        subject, body_text: text, resend_id: sentId ? `out:${sentId}` : null, read_at: now.toISOString()
      } });
    } catch (err) {
      results.errors.push({ quoteId: quote.id, kind: 'balance', error: err.message });
    }
  }

  // One note to the team for everything that newly became late.
  const claimed = [];
  for (const item of late) {
    try { if (await claim(item.quote.id, item.kind)) claimed.push(item); } catch (err) {
      results.errors.push({ quoteId: item.quote.id, kind: item.kind, error: err.message });
    }
  }
  if (claimed.length) {
    try {
      const { subject, html, text } = buildLateEmail(claimed);
      const res = await resend({ to: [teamTo], subject, html, text });
      if (!res.ok) throw new Error(`Resend HTTP ${res.status}`);
      results.sent++;
    } catch (err) {
      for (const item of claimed) await unclaim(item.quote.id, item.kind).catch(() => {});
      results.errors.push({ kind: 'late', error: err.message });
    }
  }
  return results;
}
