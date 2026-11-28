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
  review: 'Auto: review and tip',
  custom: 'Auto: custom email',
  balance: 'Auto: balance reminder'
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

// A conversation is "mine" once I've replied in it.
export function isMine(conversation, myId) {
  if (!myId) return false;
  return (conversation?.messages || []).some(m => m.direction === 'out' && m.sent_by === myId);
}

// Who wrote an outgoing email: the rep's name for a reply, else the company.
export function senderName(message, team = {}, myId = null) {
  if (message?.direction !== 'out') return message?.contact_name || message?.contact_email || '';
  if (message.kind === 'reply' && message.sent_by) {
    if (message.sent_by === myId) return team[myId] ? `${team[myId]} (you)` : 'You';
    if (team[message.sent_by]) return team[message.sent_by];
  }
  return 'Vegas on Wheels';
}

// Folders in the Messages screen. Inbox and Unread hold conversations
// linked to a lead or client; email from anyone else (newsletters, vendors,
// a client writing from a new address) goes to Other, so the copy of every
// sales@ email doesn't bury client mail. Mine is every conversation you've
// replied in, linked or not. Deleted is its own list (splitDeleted).
export function matchesFilter(conversation, filter, search = '', myId = null) {
  const other = filter === 'other' || filter === 'unmatched';
  if (['inbox', 'unread', 'other', 'unmatched'].includes(filter) && conversation.matched === other) return false;
  if (filter === 'unread' && conversation.unread === 0) return false;
  if (filter === 'mine' && !isMine(conversation, myId)) return false;
  const q = String(search || '').trim().toLowerCase();
  if (!q) return true;
  return conversation.email.includes(q)
    || conversation.name.toLowerCase().includes(q)
    || conversation.messages.some(m => String(m.subject || '').toLowerCase().includes(q));
}

// { live, deleted }: messages deleted in the Messages screen (deleted_at set)
// are kept apart, so a new email from the same person still shows up.
export function splitDeleted(messages) {
  const live = [];
  const deleted = [];
  for (const m of messages || []) if (m) (m.deleted_at ? deleted : live).push(m);
  return { live, deleted };
}

// Unread count for a folder ('inbox' = linked, 'other' = not linked).
export function folderUnread(conversations, folder) {
  return (conversations || []).filter(c => (folder === 'other' ? !c.matched : c.matched)).reduce((n, c) => n + c.unread, 0);
}
