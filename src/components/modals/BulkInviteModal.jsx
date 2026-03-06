import React, { useState, useEffect } from 'react';
import { X, UserPlus, Copy, Check, Clock } from 'lucide-react';
import { supabase } from '../../supabaseClient';

export default function BulkInviteModal({ open, onClose }) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [invites, setInvites] = useState([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const PORTAL_URL = 'https://gigstaffpro.vercel.app';

  useEffect(() => {
    if (open) { loadInvites(); setName(''); setContact(''); setNote(''); }
  }, [open]);

  const loadInvites = async () => {
    setLoadingInvites(true);
    try {
      const { data } = await supabase
        .from('worker_invites')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      setInvites(data || []);
    } catch { setInvites([]); }
    finally { setLoadingInvites(false); }
  };

  const handleSend = async () => {
    if (!name.trim()) { alert('Please enter a name.'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('worker_invites').insert([{
        name: name.trim(),
        contact: contact.trim() || null,
        note: note.trim() || null,
        status: 'pending',
      }]);
      if (error) throw error;
      setName(''); setContact(''); setNote('');
      await loadInvites();
    } catch (err) {
      if (err.message?.includes('relation') || err.message?.includes('does not exist')) {
        alert(`Run the invite migration SQL first to enable tracking.\n\nFor now, share this link manually:\n${PORTAL_URL}`);
      } else {
        alert('Error: ' + err.message);
      }
    } finally { setSaving(false); }
  };

  const copyLink = (id) => {
    navigator.clipboard.writeText(PORTAL_URL);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const markJoined = async (invite) => {
    try {
      await supabase.from('worker_invites').update({ status: 'joined' }).eq('id', invite.id);
      await loadInvites();
    } catch (err) { alert('Error: ' + err.message); }
  };

  const deleteInvite = async (id) => {
    if (!confirm('Remove this invite record?')) return;
    try {
      await supabase.from('worker_invites').delete().eq('id', id);
      await loadInvites();
    } catch (err) { alert('Error: ' + err.message); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto">
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
          <div className="p-6">
            <div className="flex justify-between items-center mb-5">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Invite Worker</h3>
                <p className="text-sm text-gray-500 mt-0.5">Track who you've invited and share the app link with them</p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
            </div>

            {/* Invite Link */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-5 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 mb-0.5">Worker signup link</p>
                <p className="text-sm font-mono text-gray-800 truncate">{PORTAL_URL}</p>
              </div>
              <button onClick={() => copyLink('header')} className="ml-3 flex items-center space-x-1 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex-shrink-0">
                {copiedId === 'header' ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                <span>{copiedId === 'header' ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>

            {/* Form */}
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Name *</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. Jane Smith"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Phone or Email <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="text" value={contact} onChange={e => setContact(e.target.value)}
                  placeholder="(414) 555-0100 or jane@email.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Note <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="text" value={note} onChange={e => setNote(e.target.value)}
                  placeholder="e.g. Referred by David Kim"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 text-sm" />
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4 text-xs text-blue-800">
              💡 <strong>How it works:</strong> Share the link above with the worker. They'll land on the login screen and enter their PIN to access their portal. Log the invite here so you can track who's been contacted.
            </div>

            <button onClick={handleSend} disabled={saving || !name.trim()}
              className="w-full bg-red-900 text-white py-2.5 rounded-lg hover:bg-red-800 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium flex items-center justify-center space-x-2 mb-6">
              <UserPlus size={18} />
              <span>{saving ? 'Saving...' : 'Log Invite'}</span>
            </button>

            {/* Invite History */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center space-x-1">
                <Clock size={14} /><span>Recent Invites</span>
              </p>
              {loadingInvites ? (
                <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-900" /></div>
              ) : invites.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No invites logged yet.</p>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {invites.map(invite => (
                    <div key={invite.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <p className="text-sm font-medium text-gray-900">{invite.name}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${invite.status === 'joined' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {invite.status === 'joined' ? '✓ Joined' : 'Pending'}
                          </span>
                        </div>
                        {invite.contact && <p className="text-xs text-gray-400 mt-0.5">{invite.contact}</p>}
                        {invite.note && <p className="text-xs text-gray-400 italic">{invite.note}</p>}
                      </div>
                      <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
                        <button onClick={() => copyLink(invite.id)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded" title="Copy link">
                          {copiedId === invite.id ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                        </button>
                        {invite.status !== 'joined' && (
                          <button onClick={() => markJoined(invite)} className="p-1.5 text-green-600 hover:text-green-800 rounded text-xs font-bold" title="Mark joined">✓</button>
                        )}
                        <button onClick={() => deleteInvite(invite.id)} className="p-1.5 text-red-400 hover:text-red-600 rounded" title="Remove">
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
