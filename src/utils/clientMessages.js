// Messages inbox helpers (docs/CRM.md, CRM Phase 1 step 5). Rows come from
// public.client_messages (admin-only); the server saves them (incoming client
// emails, replies, automatic emails).

export const MESSAGE_KIND_LABELS = {
  email: 'Email',
  reply: 'Reply',
  followup: 'Auto: still interested?',
  thankyou: 'Auto: booking thank-you',
  upsell: 'Auto: upsell ideas',
  prep: 'Auto: get-ready checklist',
  review: 'Auto: review and tip'
};

export const kindLabel = (kind) => MESSAGE_KIND_LABELS[kind] || 'Email';

const time = (m) => new Date(m?.created_at || 0).getTime() || 0;

// One conversation per contact email, newest activity first.
export function groupConversations(messages) {
  const byEmail = new Map();
  for (const m of messages || []) {
    if (!m?.contact_email) continue;
    const key = String(m.contact_email).toLowerCase();
    if (!byEmail.has(key)) byEmail.set(key, []);
    byEmail.get(key).push(m);
  }
  const out = [];
  for (const [email, list] of byEmail) {
    list.sort((a, b) => time(a) - time(b));
    const last = list[list.length - 1];
    const named = [...list].reverse().find(m => m.contact_name);
    const linked = [...list].reverse().find(m => m.lead_id || (m.client_id !== null && m.client_id !== undefined));
    out.push({
      email,
      name: named?.contact_name || '',
      messages: list,
      last,
      unread: list.filter(m => m.direction === 'in' && !m.read_at).length,
      leadId: linked?.lead_id || null,
      clientId: linked && linked.client_id !== null && linked.client_id !== undefined ? linked.client_id : null,
      matched: !!linked
    });
  }
  return out.sort((a, b) => time(b.last) - time(a.last));
}

export function unreadCount(messages) {
  return (messages || []).filter(m => m?.direction === 'in' && !m.read_at).length;
}

// "Re: <last subject>" without stacking "Re: Re:".
export function replySubject(conversation) {
  const last = [...(conversation?.messages || [])].reverse().find(m => m.subject);
  const s = String(last?.subject || '').trim();
  if (!s) return 'Your casino party with Vegas on Wheels';
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

export function preview(text, n = 120) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function matchesFilter(conversation, filter, search = '') {
  if (filter === 'unread' && conversation.unread === 0) return false;
  if (filter === 'unmatched' && conversation.matched) return false;
  const q = String(search || '').trim().toLowerCase();
  if (!q) return true;
  return conversation.email.includes(q)
    || conversation.name.toLowerCase().includes(q)
    || conversation.messages.some(m => String(m.subject || '').toLowerCase().includes(q));
}
