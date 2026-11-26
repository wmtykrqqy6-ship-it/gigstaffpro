import React, { useState, useEffect, useMemo } from 'react';
import { Search, Inbox, RefreshCw, PenLine } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { logClientAccess } from '../../utils/clientAccessLog';
import { isMissingSchemaError, fetchAllRows } from '../../utils/clientRecords';
import { groupConversations, matchesFilter, preview } from '../../utils/clientMessages';
import MessageThread from '../messages/MessageThread';
import SignatureEditor from '../messages/SignatureEditor';
import { callSignatureApi } from '../../utils/emailSignatureApi';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'mine', label: 'Mine' },
  { id: 'unmatched', label: 'Not linked' }
];

// Messages inbox (CRM Phase 1 step 5, docs/CRM.md): client emails
// redirected from sales@vegasonwheels.com, replies sent from here, and the
// automatic emails. Admins and sales managers only (client_messages is
// admin-only).
export default function MessagesView({ onUnreadChange }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [needsSql, setNeedsSql] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null); // contact email
  // Signatures: { myId, mine: { display_name, signature }, team: { id: name }, needsSql }
  const [sig, setSig] = useState({ myId: null, mine: null, team: {} });
  const [editingSig, setEditingSig] = useState(false);

  const load = async () => {
    const { data, error } = await fetchAllRows(() => supabase.from('client_messages').select('*').order('created_at', { ascending: false }).order('id'));
    setLoading(false);
    if (error) {
      if (isMissingSchemaError(error)) setNeedsSql(true);
      else console.error('Error loading messages:', error.message);
      return;
    }
    setRows(data || []);
    const ids = [...new Set((data || []).map(m => m.client_id).filter(v => v !== null && v !== undefined))];
    if (data?.length) logClientAccess(supabase, { action: 'view', recordType: 'clients', recordIds: ids, where: 'messages_tab' });
  };

  const loadSignatures = async () => {
    const r = await callSignatureApi('signature-get');
    if (r.ok) setSig({ myId: r.myId || null, mine: r.mine || null, team: r.team || {}, needsSql: !!r.needsSql });
  };

  useEffect(() => { load(); loadSignatures(); }, []);

  const conversations = useMemo(() => groupConversations(rows), [rows]);
  const visible = conversations.filter(c => matchesFilter(c, filter, search, sig.myId));
  const current = conversations.find(c => c.email === selected) || null;
  const totalUnread = conversations.reduce((n, c) => n + c.unread, 0);
  useEffect(() => { onUnreadChange?.(totalUnread); }, [totalUnread]);

  const open = async (c) => {
    setSelected(c.email);
    const unread = c.messages.filter(m => m.direction === 'in' && !m.read_at).map(m => m.id);
    if (!unread.length) return;
    const at = new Date().toISOString();
    const { error } = await supabase.from('client_messages').update({ read_at: at }).in('id', unread);
    if (!error) setRows(rs => rs.map(m => (unread.includes(m.id) ? { ...m, read_at: at } : m)));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Messages</h2>
          <p className="text-sm text-gray-600 mt-1">Client emails to sales@vegasonwheels.com, your replies, and the automatic emails.</p>
        </div>
        <div className="flex space-x-2">
          {!sig.needsSql && (
            <button onClick={() => setEditingSig(v => !v)} className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-1 text-sm">
              <PenLine size={14} /><span>My signature</span>
            </button>
          )}
          <button onClick={load} className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-1 text-sm">
            <RefreshCw size={14} /><span>Refresh</span>
          </button>
        </div>
      </div>

      {editingSig && (
        <SignatureEditor mine={sig.mine} onClose={() => setEditingSig(false)}
          onSaved={(mine) => { setEditingSig(false); setSig(s => ({ ...s, mine, team: { ...s.team, ...(s.myId && mine?.display_name ? { [s.myId]: mine.display_name } : {}) } })); }} />
      )}

      {needsSql && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-lg p-3">
          Messages turn on once the Messages SQL file (20261125120000) has been run in Supabase.
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-900" />
        </div>
      ) : !needsSql && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className={`bg-white rounded-lg shadow ${current ? 'hidden lg:block' : ''}`}>
            <div className="p-3 border-b space-y-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Search name, email or subject"
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
                {FILTERS.map(f => (
                  <button key={f.id} onClick={() => setFilter(f.id)}
                    className={`flex-1 px-2 py-1 rounded-md text-xs font-medium ${filter === f.id ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
                    {f.label}{f.id === 'unread' && totalUnread > 0 ? ` (${totalUnread})` : ''}
                  </button>
                ))}
              </div>
            </div>
            {visible.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">
                <Inbox size={28} className="mx-auto text-gray-300 mb-2" />
                {conversations.length === 0 ? 'No emails yet. Client emails show up here once the sales@ forwarding rule is on.' : 'Nothing matches.'}
              </div>
            ) : (
              <ul className="divide-y max-h-[70vh] overflow-y-auto">
                {visible.map(c => (
                  <li key={c.email}>
                    <button onClick={() => open(c)} className={`w-full text-left p-3 hover:bg-gray-50 ${selected === c.email ? 'bg-red-50' : ''}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm truncate ${c.unread ? 'font-bold text-gray-900' : 'text-gray-800'}`}>{c.name || c.email}</span>
                        <span className="text-xs text-gray-400 flex-shrink-0">{new Date(c.last.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{c.last.subject || '(no subject)'}</p>
                      <p className="text-xs text-gray-400 truncate">{c.last.direction === 'out' ? (c.last.kind === 'reply' && c.last.sent_by && c.last.sent_by !== sig.myId ? `${sig.team[c.last.sent_by] || 'Team'}: ` : 'You: ') : ''}{preview(c.last.body_text, 90)}</p>
                      <div className="flex gap-1 mt-1">
                        {c.unread > 0 && <span className="text-xs bg-red-900 text-white px-1.5 rounded-full">{c.unread} new</span>}
                        {!c.matched && <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-1.5 rounded-full">Not linked</span>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={`lg:col-span-2 bg-white rounded-lg shadow p-4 ${current ? '' : 'hidden lg:block'}`}>
            {current ? (
              <>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <button onClick={() => setSelected(null)} className="lg:hidden text-xs text-red-900 hover:underline mb-1">‹ All messages</button>
                    <p className="font-bold text-gray-900 truncate">{current.name || current.email}</p>
                    <p className="text-xs text-gray-500 truncate">{current.email}{!current.matched && ' · not linked to a lead or client (no one has this email)'}</p>
                  </div>
                </div>
                <MessageThread key={current.email} conversation={current} onSent={load} team={sig.team} myId={sig.myId}
                  signature={sig.mine?.signature || ''} logoUrl={sig.mine?.logo_url || ''} onEditSignature={sig.needsSql ? null : () => setEditingSig(true)} />
              </>
            ) : (
              <p className="text-sm text-gray-400 text-center py-16">Pick a conversation.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
