import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../ui/Toast';
import { DEFAULT_TERMS, QUOTE_SETTINGS_KEY } from '../../utils/quoteTerms';

const parse = (v) => {
  let x = v;
  if (typeof x === 'string') { try { x = JSON.parse(x); } catch { x = {}; } }
  return x && typeof x === 'object' ? x : {};
};

// Settings > Prices: "Quote terms" (docs/QUOTES.md step 5). The terms and
// conditions on the client's quote page, one per line. Stored in the
// settings row 'quote_settings' (JSON: terms, link_base).
export default function QuoteTermsCard() {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(null); // whole settings object
  const [terms, setTerms] = useState('');
  const [linkBase, setLinkBase] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('settings').select('setting_value').eq('setting_key', QUOTE_SETTINGS_KEY).maybeSingle()
      .then(({ data }) => {
        const v = parse(data?.setting_value);
        setValue(v);
        setTerms(typeof v.terms === 'string' && v.terms.trim() ? v.terms : DEFAULT_TERMS);
        setLinkBase(typeof v.link_base === 'string' ? v.link_base : '');
      });
  }, []);

  const save = async () => {
    const base = linkBase.trim().replace(/\/+$/, '');
    if (base && !/^https:\/\/[a-z0-9.-]+$/i.test(base)) { notify('The link address must look like https://quotes.vegasonwheels.com'); return; }
    const text = terms.split('\n').map(t => t.trim()).filter(Boolean).join('\n').slice(0, 8000);
    setSaving(true);
    const next = JSON.stringify({ ...(value || {}), terms: text === DEFAULT_TERMS ? '' : text, link_base: base });
    const { data: existing } = await supabase.from('settings').select('id').eq('setting_key', QUOTE_SETTINGS_KEY).maybeSingle();
    const { error } = existing
      ? await supabase.from('settings').update({ setting_value: next, updated_at: new Date().toISOString() }).eq('setting_key', QUOTE_SETTINGS_KEY)
      : await supabase.from('settings').insert([{ setting_key: QUOTE_SETTINGS_KEY, setting_value: next }]);
    setSaving(false);
    if (error) { notify(`Could not save: ${error.message}`); return; }
    setValue(parse(next));
    notify('Quote terms saved');
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <div>
          <h4 className="font-semibold text-gray-900">Quote terms</h4>
          <p className="text-xs text-gray-500">The terms and conditions clients see and accept on their quote (one per line), and the web address of quote links.</p>
        </div>
        <span className="text-sm text-red-900">{open ? 'Hide' : 'Edit'}</span>
      </button>
      {open && value && (
        <div className="border-t px-4 py-3 space-y-2">
          <label className="block text-xs text-gray-600">Client link address (blank = https://www.gigstaffpro.com)
            <input className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" value={linkBase} placeholder="https://quotes.vegasonwheels.com" onChange={e => setLinkBase(e.target.value)} />
          </label>
          <textarea rows={14} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" value={terms} onChange={e => setTerms(e.target.value)} />
          <div className="flex justify-between">
            <button onClick={() => setTerms(DEFAULT_TERMS)} className="text-xs text-gray-500 hover:underline">Reset to the standard terms</button>
            <button onClick={save} disabled={saving} className="px-3 py-1.5 bg-red-900 text-white rounded-lg text-sm disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
