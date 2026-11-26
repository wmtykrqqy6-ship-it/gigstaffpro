import React, { useState, useEffect } from 'react';
import { Clock, ChevronDown, ChevronUp, Save } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../ui/Toast';
import { CLIENT_EMAILS_KEY, CLIENT_EMAIL_DEFAULTS, normalizeClientEmailSettings } from '../../utils/clientEmailSettings';

// Automatic client emails (docs/CRM.md): on/off and timing for each, saved as
// one settings row. The server side is api/_lib/leadFollowups.js and
// api/_lib/bookedLeadEmails.js.
const EMAILS = [
  { key: 'followup', title: '"Still interested?" follow-up', who: 'Quoted leads', unit: 'days with no contact',
    about: 'Counts from when the lead was quoted or the last "We talked", whichever is later.' },
  { key: 'thankyou', title: 'Booking thank-you', who: 'Booked clients', unit: null,
    about: 'Goes out the day a lead is marked Booked.' },
  { key: 'upsell', title: 'Upsell ideas', who: 'Booked clients', unit: 'days before the event',
    about: 'More tables or dealers, DJ or live music, photobooth, decorations, magician.' },
  { key: 'prep', title: 'Get-ready checklist', who: 'Booked clients', unit: 'days before the event',
    about: 'Balance reminder, final guest count, space, access and parking, day-of contact, prizes.' },
  { key: 'review', title: 'Review and tip request', who: 'Booked clients', unit: 'days after the event',
    about: 'Leave the days empty to send it the Monday after the event.' }
];

const inputClass = 'px-2 py-1 border border-gray-300 rounded-md text-sm';

export default function AutoEmailsPanel({ onChange, defaultOpen = false }) {
  const notify = useToast();
  const [settings, setSettings] = useState(normalizeClientEmailSettings(null));
  const [open, setOpen] = useState(defaultOpen);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('settings').select('setting_value').eq('setting_key', CLIENT_EMAILS_KEY).maybeSingle();
      const s = normalizeClientEmailSettings(data?.setting_value);
      setSettings(s);
      onChange?.(s);
    })();
  }, []);

  const update = (key, patch) => { setSettings(s => ({ ...s, [key]: { ...s[key], ...patch } })); setDirty(true); };
  const setText = (key) => (e) => { const v = e.target.value; setSettings(s => ({ ...s, [key]: v })); setDirty(true); };

  const save = async () => {
    const clean = normalizeClientEmailSettings(settings);
    setSaving(true);
    try {
      const value = JSON.stringify(clean);
      const { data: existing } = await supabase.from('settings').select('setting_key').eq('setting_key', CLIENT_EMAILS_KEY).maybeSingle();
      const { error } = existing
        ? await supabase.from('settings').update({ setting_value: value, updated_at: new Date().toISOString() }).eq('setting_key', CLIENT_EMAILS_KEY)
        : await supabase.from('settings').insert([{ setting_key: CLIENT_EMAILS_KEY, setting_value: value }]);
      if (error) throw error;
      setSettings(clean);
      setDirty(false);
      onChange?.(clean);
      notify('Automatic email settings saved');
    } catch (err) {
      notify('Could not save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const onCount = EMAILS.filter(e => settings[e.key].on).length;

  return (
    <div className="bg-white rounded-lg shadow text-sm">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-3 p-4 text-left">
        <span className="flex items-center space-x-2 text-gray-800">
          <Clock size={16} className="text-red-900" />
          <span><strong>Automatic emails</strong> <span className="text-gray-500">({onCount} of {EMAILS.length} on)</span></span>
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div className="border-t px-4 pb-4 space-y-3">
          {EMAILS.map(e => {
            const s = settings[e.key];
            return (
              <div key={e.key} className="pt-3 flex items-start justify-between gap-3 flex-wrap border-b last:border-b-0 pb-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900">{e.title} <span className="font-normal text-gray-500">· {e.who}</span></p>
                  <p className="text-xs text-gray-500 mt-0.5">{e.about}</p>
                  {e.unit && (
                    <label className="flex items-center space-x-2 mt-2 text-gray-700">
                      <span>Send</span>
                      <input type="number" min="1" className={`${inputClass} w-20`}
                        value={s.days ?? ''} placeholder={e.key === 'review' ? 'Mon' : ''}
                        onChange={ev => update(e.key, { days: ev.target.value === '' ? (e.key === 'review' ? null : CLIENT_EMAIL_DEFAULTS[e.key].days) : ev.target.value })} />
                      <span>{e.unit}</span>
                    </label>
                  )}
                </div>
                <button onClick={() => update(e.key, { on: !s.on })}
                  className={`px-3 py-1.5 rounded-full font-medium ${s.on ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                  {s.on ? 'On' : 'Off'}
                </button>
              </div>
            );
          })}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block text-gray-700">Google review link
              <input className={`${inputClass} w-full mt-1`} placeholder="https://g.page/r/..." value={settings.google_review_url} onChange={setText('google_review_url')} />
            </label>
            <label className="block text-gray-700">Online tip link (optional)
              <input className={`${inputClass} w-full mt-1`} placeholder="https://..." value={settings.tip_url} onChange={setText('tip_url')} />
            </label>
          </div>
          <p className="text-xs text-gray-500">
            Emails go out between 9 AM and 6 PM, once per client, and replies go to sales@vegasonwheels.com.
            "Don't send auto emails" on a lead stops all of them for that client, and so does marking it Lost.
            The review email leaves out a link you haven't filled in.
          </p>
          <button onClick={save} disabled={!dirty || saving}
            className="bg-red-900 text-white px-4 py-2 rounded-lg hover:bg-red-800 disabled:bg-gray-300 flex items-center space-x-1">
            <Save size={14} /><span>{saving ? 'Saving...' : 'Save'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
