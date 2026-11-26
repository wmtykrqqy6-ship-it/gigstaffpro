import React, { useState, useEffect } from 'react';
import { Clock, ChevronDown, ChevronUp, Save, Plus, Trash2, PenLine } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import { CLIENT_EMAILS_KEY, CLIENT_EMAIL_DEFAULTS, normalizeClientEmailSettings, DEFAULT_WORDING, CUSTOM_TRIGGERS, MAX_CUSTOM_EMAILS, MAX_NAME, newCustomEmailId } from '../../utils/clientEmailSettings';
import EmailWordingEditor from '../settings/EmailWordingEditor';

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

// Wording that matches the original is not saved, so the email keeps using
// the built-in version (and picks up any later improvements to it).
function withoutDefaultWording(settings) {
  const out = { ...settings };
  for (const k of Object.keys(DEFAULT_WORDING)) {
    const s = { ...out[k] };
    if (!s.subject || s.subject.trim() === DEFAULT_WORDING[k].subject) delete s.subject;
    if (!s.message || s.message.trim() === DEFAULT_WORDING[k].message) delete s.message;
    out[k] = s;
  }
  return out;
}

export default function AutoEmailsPanel({ onChange, defaultOpen = false }) {
  const notify = useToast();
  const confirm = useConfirm();
  const [settings, setSettings] = useState(normalizeClientEmailSettings(null));
  const [open, setOpen] = useState(defaultOpen);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(null); // which email's wording is open

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

  const updateCustom = (id, patch) => { setSettings(s => ({ ...s, custom: s.custom.map(c => c.id === id ? { ...c, ...patch } : c) })); setDirty(true); };
  const addCustom = () => {
    const id = newCustomEmailId();
    setSettings(s => ({ ...s, custom: [...s.custom, { id, name: 'New email', on: false, trigger: 'before_event', days: 14, subject: '', message: 'Hi {first_name},\n\n\n\nThanks,\nVegas on Wheels' }] }));
    setEditing(`custom:${id}`);
    setDirty(true);
  };
  const removeCustom = async (id) => {
    if (!(await confirm('Delete this email? Clients who already got it are not affected. Press Save to finish.'))) return;
    setSettings(s => ({ ...s, custom: s.custom.filter(c => c.id !== id) }));
    setDirty(true);
  };

  const save = async () => {
    const missing = settings.custom.find(c => c.on && (!c.subject.trim() || !c.message.trim()));
    if (missing) { notify(`"${missing.name}" needs a subject and a message before it can be on.`); return; }
    const clean = normalizeClientEmailSettings(withoutDefaultWording(settings));
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

  const onCount = EMAILS.filter(e => settings[e.key].on).length + settings.custom.filter(c => c.on).length;
  const total = EMAILS.length + settings.custom.length;

  return (
    <div className="bg-white rounded-lg shadow text-sm">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-3 p-4 text-left">
        <span className="flex items-center space-x-2 text-gray-800">
          <Clock size={16} className="text-red-900" />
          <span><strong>Automatic emails</strong> <span className="text-gray-500">({onCount} of {total} on)</span></span>
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
                  <button type="button" onClick={() => setEditing(ed => ed === e.key ? null : e.key)} className="mt-2 text-xs text-red-900 hover:underline flex items-center space-x-1">
                    <PenLine size={12} /><span>{editing === e.key ? 'Close wording' : (s.subject || s.message ? 'Edit wording (changed)' : 'Edit wording')}</span>
                  </button>
                  {editing === e.key && (
                    <EmailWordingEditor settings={settings}
                      subject={s.subject ?? DEFAULT_WORDING[e.key].subject}
                      message={s.message ?? DEFAULT_WORDING[e.key].message}
                      daysAway={e.key === 'upsell' ? s.days : e.key === 'prep' ? s.days : null}
                      onChange={patch => update(e.key, patch)}
                      onReset={() => update(e.key, { subject: undefined, message: undefined })} />
                  )}
                </div>
                <button onClick={() => update(e.key, { on: !s.on })}
                  className={`px-3 py-1.5 rounded-full font-medium ${s.on ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                  {s.on ? 'On' : 'Off'}
                </button>
              </div>
            );
          })}
          <div className="pt-1">
            <p className="font-medium text-gray-900">Your own emails</p>
            <p className="text-xs text-gray-500">Add an email of your own and pick when it goes out. Up to {MAX_CUSTOM_EMAILS}.</p>
          </div>
          {settings.custom.map(c => {
            const t = CUSTOM_TRIGGERS[c.trigger];
            return (
              <div key={c.id} className="flex items-start justify-between gap-3 flex-wrap border-b pb-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <input className={`${inputClass} font-medium w-full md:w-80`} maxLength={MAX_NAME} value={c.name} aria-label="Email name"
                    onChange={ev => updateCustom(c.id, { name: ev.target.value })} />
                  <div className="flex items-center gap-2 flex-wrap text-gray-700">
                    <span>Send</span>
                    <input type="number" min={t.limits[0]} max={t.limits[1]} className={`${inputClass} w-20`} value={c.days}
                      onChange={ev => updateCustom(c.id, { days: ev.target.value === '' ? t.limits[0] : Number(ev.target.value) })} />
                    <select className={inputClass} value={c.trigger} onChange={ev => updateCustom(c.id, { trigger: ev.target.value })}>
                      {Object.entries(CUSTOM_TRIGGERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <span className="text-xs text-gray-500">· {t.who}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setEditing(ed => ed === `custom:${c.id}` ? null : `custom:${c.id}`)} className="text-xs text-red-900 hover:underline flex items-center space-x-1">
                      <PenLine size={12} /><span>{editing === `custom:${c.id}` ? 'Close wording' : 'Edit wording'}</span>
                    </button>
                    <button type="button" onClick={() => removeCustom(c.id)} className="text-xs text-gray-500 hover:text-red-700 flex items-center space-x-1">
                      <Trash2 size={12} /><span>Delete</span>
                    </button>
                  </div>
                  {editing === `custom:${c.id}` && (
                    <EmailWordingEditor settings={settings} subject={c.subject} message={c.message}
                      daysAway={c.trigger === 'before_event' ? c.days : null}
                      onChange={patch => updateCustom(c.id, patch)} />
                  )}
                </div>
                <button onClick={() => updateCustom(c.id, { on: !c.on })}
                  className={`px-3 py-1.5 rounded-full font-medium ${c.on ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                  {c.on ? 'On' : 'Off'}
                </button>
              </div>
            );
          })}
          {settings.custom.length < MAX_CUSTOM_EMAILS && (
            <button type="button" onClick={addCustom} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-1 text-sm">
              <Plus size={14} /><span>Add email</span>
            </button>
          )}
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
