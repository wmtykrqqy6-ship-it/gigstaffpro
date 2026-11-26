import React, { useState } from 'react';
import { Send, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../ui/Toast';
import { kindLabel, replySubject, senderName } from '../../utils/clientMessages';

const fmt = (d) => (d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

// Sends through the admin-only api/send-email.js (action 'client-reply'):
// from sales@vegasonwheels.com, saved to the inbox, counts as contact.
async function sendReply(payload) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return { success: false, error: 'Please log in again.' };
  const res = await fetch('/api/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'client-reply', ...payload })
  });
  const result = await res.json().catch(() => ({}));
  return res.ok ? result : { success: false, error: result.error || 'Could not send the email.' };
}

// One conversation: the emails (oldest first) and a reply box.
// team / myId / signature come from the Messages screen; elsewhere (lead and
// client email history) they're left out and the server still adds the
// sender's signature.
export default function MessageThread({ conversation, onSent, compact = false, team = {}, myId = null, signature, logoUrl = '', onEditSignature }) {
  const notify = useToast();
  const [subject, setSubject] = useState(() => replySubject(conversation));
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    const r = await sendReply({
      to: conversation.email, subject: subject.trim(), text,
      leadId: conversation.leadId || null, clientId: conversation.clientId ?? null
    });
    setSending(false);
    if (!r.success) { notify('Could not send: ' + r.error); return; }
    setText('');
    notify(`Sent to ${conversation.email}`);
    onSent?.();
  };

  return (
    <div className="space-y-3">
      <div className={`space-y-3 ${compact ? 'max-h-96' : 'max-h-[60vh]'} overflow-y-auto pr-1`}>
        {conversation.messages.map(m => (
          <div key={m.id} className={`rounded-lg border p-3 ${m.direction === 'in' ? 'bg-white border-gray-200' : 'bg-red-50 border-red-100 ml-6'}`}>
            <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
              <span className="flex items-center space-x-1 min-w-0">
                {m.direction === 'in' ? <ArrowDownLeft size={12} className="text-green-700" /> : <ArrowUpRight size={12} className="text-red-900" />}
                <span className="font-semibold text-gray-700 truncate">{senderName(m, team, myId)}</span>
                {m.direction === 'out' && m.kind !== 'reply' && <span className="bg-white border border-red-100 text-red-800 px-1.5 rounded-full">{kindLabel(m.kind)}</span>}
              </span>
              <span className="flex-shrink-0">{fmt(m.created_at)}</span>
            </div>
            {m.subject && <p className="text-sm font-medium text-gray-900 mt-1">{m.subject}</p>}
            {m.body_text && <p className="text-sm text-gray-800 mt-1 whitespace-pre-line break-words">{m.body_text}</p>}
          </div>
        ))}
      </div>
      <div className="border-t pt-3 space-y-2">
        <input className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" />
        <textarea className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" rows={compact ? 3 : 5} value={text} onChange={e => setText(e.target.value)}
          placeholder={`Reply to ${conversation.name || conversation.email}. Sent from sales@vegasonwheels.com.`} />
        {signature !== undefined && (
          signature ? (
            <div className="text-xs text-gray-500">
              <span>Your signature is added below your message{onEditSignature && <> · <button onClick={onEditSignature} className="text-red-900 hover:underline">Edit</button></>}</span>
              <div className="mt-1 pl-2 border-l-2 border-gray-200">
                <p className="whitespace-pre-line text-gray-600">{signature}</p>
                {logoUrl && <img src={logoUrl} alt="Logo" className="mt-1 h-auto" style={{ width: 120 }} />}
              </div>
            </div>
          ) : onEditSignature ? (
            <p className="text-xs text-gray-500">No signature yet. <button onClick={onEditSignature} className="text-red-900 hover:underline">Add your signature</button></p>
          ) : null
        )}
        <button onClick={send} disabled={sending || !text.trim() || !subject.trim()}
          className="bg-red-900 text-white px-4 py-2 rounded-lg hover:bg-red-800 disabled:bg-gray-300 flex items-center space-x-1 text-sm">
          <Send size={14} /><span>{sending ? 'Sending...' : 'Send'}</span>
        </button>
      </div>
    </div>
  );
}
