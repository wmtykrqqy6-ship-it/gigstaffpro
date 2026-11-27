import React, { useState } from 'react';
import { Mail, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { isMissingSchemaError } from '../../utils/clientRecords';
import { groupConversations } from '../../utils/clientMessages';
import MessageThread from './MessageThread';

// Emails with one lead or client, shown on their card / page. Loads only
// when opened. `emails` are the addresses to include besides the links.
export default function EmailHistory({ leadId = null, clientId = null, emails = [] }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [note, setNote] = useState('');

  const load = async () => {
    const ors = [];
    if (leadId) ors.push(`lead_id.eq.${leadId}`);
    if (clientId !== null && clientId !== undefined) ors.push(`client_id.eq.${clientId}`);
    for (const e of emails.filter(Boolean)) {
      const v = String(e).trim().toLowerCase();
      if (/^[a-z0-9._+'-]+@[a-z0-9.-]+$/.test(v)) ors.push(`contact_email.eq."${v}"`);
    }
    if (!ors.length) { setRows([]); return; }
    const { data, error } = await supabase.from('client_messages').select('*').or(ors.join(',')).order('created_at').limit(500);
    if (error) {
      setNote(isMissingSchemaError(error) ? 'Emails show here once the Messages SQL file has been run.' : 'Could not load emails.');
      setRows([]);
      return;
    }
    // Conversations deleted in the Messages screen stay hidden here too.
    setRows((data || []).filter(m => !m.deleted_at));
    const unread = (data || []).filter(m => m.direction === 'in' && !m.read_at && !m.deleted_at).map(m => m.id);
    if (unread.length) await supabase.from('client_messages').update({ read_at: new Date().toISOString() }).in('id', unread);
  };

  const toggle = () => { if (!open && rows === null) load(); setOpen(o => !o); };
  const conversations = groupConversations(rows || []);

  return (
    <div className="mt-3 border-t pt-2">
      <button onClick={toggle} className="text-xs text-red-900 hover:underline flex items-center space-x-1">
        <Mail size={13} /><span>Emails{rows ? ` (${rows.length})` : ''}</span>{open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {open && (
        <div className="mt-2 space-y-4">
          {note && <p className="text-xs text-gray-500">{note}</p>}
          {rows !== null && !note && conversations.length === 0 && <p className="text-xs text-gray-500">No emails yet.</p>}
          {conversations.map(c => (
            <div key={c.email}>
              {conversations.length > 1 && <p className="text-xs font-semibold text-gray-600 mb-1">{c.email}</p>}
              <MessageThread compact conversation={{ ...c, leadId: c.leadId || leadId, clientId: c.clientId ?? clientId }} onSent={load} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
