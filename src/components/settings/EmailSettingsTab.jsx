import React, { useState, useEffect } from 'react';
import { Mail, Save } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../ui/Toast';
import { callSignatureApi } from '../../utils/emailSignatureApi';
import SignatureEditor from '../messages/SignatureEditor';
import AutoEmailsPanel from '../leads/AutoEmailsPanel';

const LEAD_EMAIL_KEY = 'lead_email'; // read by api/_lib/quoteRequest.js and the Messages reply-to
const DEFAULT_LEAD_EMAIL = 'sales@vegasonwheels.com';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Settings > Email: everything about client email in one place (docs/CRM.md).
export default function EmailSettingsTab() {
  const notify = useToast();
  const [sig, setSig] = useState({ loaded: false, mine: null, needsSql: false });
  const [leadEmail, setLeadEmail] = useState('');
  const [savedLeadEmail, setSavedLeadEmail] = useState('');
  const [savingLead, setSavingLead] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await callSignatureApi('signature-get');
      setSig({ loaded: true, mine: r.ok ? r.mine : null, needsSql: !!r.needsSql, error: r.ok ? null : r.error });
    })();
    (async () => {
      const { data } = await supabase.from('settings').select('setting_value').eq('setting_key', LEAD_EMAIL_KEY).maybeSingle();
      const v = String(data?.setting_value ?? '').replace(/"/g, '').trim();
      setLeadEmail(v);
      setSavedLeadEmail(v);
    })();
  }, []);

  const saveLeadEmail = async () => {
    const v = leadEmail.trim();
    if (v && !EMAIL_REGEX.test(v)) { notify('Enter a valid email address, or leave it empty for sales@.'); return; }
    setSavingLead(true);
    try {
      const { data: existing } = await supabase.from('settings').select('setting_key').eq('setting_key', LEAD_EMAIL_KEY).maybeSingle();
      const { error } = existing
        ? await supabase.from('settings').update({ setting_value: v, updated_at: new Date().toISOString() }).eq('setting_key', LEAD_EMAIL_KEY)
        : await supabase.from('settings').insert([{ setting_key: LEAD_EMAIL_KEY, setting_value: v }]);
      if (error) throw error;
      setSavedLeadEmail(v);
      notify('Saved');
    } catch (err) {
      notify('Could not save: ' + err.message);
    } finally {
      setSavingLead(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Your signature is yours only: each admin and sales manager sets their own. The automatic emails and the quote-request address are shared by everyone.</p>
      {!sig.loaded ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : sig.needsSql ? (
        <p className="text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-lg p-3">Signatures turn on once the signatures SQL file has been run.</p>
      ) : sig.error ? (
        <p className="text-sm text-red-700">Could not load your signature: {sig.error}</p>
      ) : (
        <SignatureEditor mine={sig.mine}
          onSaved={(mine) => setSig(s => ({ ...s, mine }))}
          onLogoChange={(logo_url) => setSig(s => ({ ...s, mine: { ...(s.mine || { display_name: '', signature: '' }), logo_url } }))} />
      )}

      <AutoEmailsPanel defaultOpen />

      <div className="bg-white rounded-lg shadow p-4 text-sm space-y-2">
        <h3 className="font-bold text-gray-900">New quote requests</h3>
        <label className="block text-gray-700">
          <span className="flex items-center space-x-1"><Mail size={14} className="text-red-900" /><span>Email new quote requests to</span></span>
          <input type="email" className="mt-1 w-full md:w-96 px-3 py-2 border border-gray-300 rounded-lg text-sm" value={leadEmail}
            onChange={e => setLeadEmail(e.target.value)} placeholder={DEFAULT_LEAD_EMAIL} />
        </label>
        <p className="text-xs text-gray-500">Leave empty to use {DEFAULT_LEAD_EMAIL}. Client replies to the automatic emails and to Messages go here too.</p>
        <button onClick={saveLeadEmail} disabled={savingLead || leadEmail.trim() === savedLeadEmail}
          className="bg-red-900 text-white px-4 py-2 rounded-lg hover:bg-red-800 disabled:bg-gray-300 flex items-center space-x-1">
          <Save size={14} /><span>{savingLead ? 'Saving...' : 'Save'}</span>
        </button>
      </div>
    </div>
  );
}
