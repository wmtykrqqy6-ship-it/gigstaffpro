import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Phone, Mail, Calendar, MapPin, Users, UserPlus, Save, Clock } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../ui/Toast';
import { logClientAccess } from '../../utils/clientAccessLog';
import { isMissingSchemaError, fetchAllRows, formatEventDate } from '../../utils/clientRecords';
import {
  LEAD_STAGES, LOST_REASONS, stageLabel, countByStage, sortLeads, stagePatch,
  clientFromLead, emptyLeadForm, leadFromForm, followupStatus, contactPatch
} from '../../utils/leads';

const FOLLOWUP_KEY = 'lead_followup_enabled';

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm';

// Leads tab (CRM Phase 1). Quote requests from the website form land here
// as "New". Admins and sales managers only (public.leads is admin-only).
export default function LeadsView() {
  const notify = useToast();
  const [leads, setLeads] = useState([]);
  const [clientNames, setClientNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [needsSql, setNeedsSql] = useState(false);
  const [stage, setStage] = useState('new');
  const [lostFor, setLostFor] = useState(null); // lead id picking a lost reason
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyLeadForm());
  const [saving, setSaving] = useState(false);
  const [followupOn, setFollowupOn] = useState(false);
  const [showFollowupInfo, setShowFollowupInfo] = useState(false);

  const load = async () => {
    const { data, error } = await fetchAllRows(() => supabase.from('leads').select('*').order('created_at', { ascending: false }).order('id'));
    if (error) {
      if (isMissingSchemaError(error)) setNeedsSql(true);
      else console.error('Error loading leads:', error.message);
      setLoading(false);
      return;
    }
    setLeads(data || []);
    setLoading(false);
    const ids = [...new Set((data || []).map(l => l.client_id).filter(v => v !== null && v !== undefined))];
    if (ids.length) {
      const { data: cs } = await supabase.from('clients').select('id, name').in('id', ids);
      setClientNames(Object.fromEntries((cs || []).map(c => [String(c.id), c.name])));
    }
    if (data?.length) {
      logClientAccess(supabase, { action: 'view', recordType: 'clients', recordIds: ids, where: 'leads_tab' });
    }
  };

  const loadFollowupSetting = async () => {
    const { data } = await supabase.from('settings').select('setting_value').eq('setting_key', FOLLOWUP_KEY).maybeSingle();
    setFollowupOn(String(data?.setting_value ?? '').replace(/"/g, '') === 'true');
  };

  useEffect(() => { load(); loadFollowupSetting(); }, []);

  const toggleFollowup = async () => {
    const next = !followupOn;
    try {
      const { data: existing } = await supabase.from('settings').select('setting_key').eq('setting_key', FOLLOWUP_KEY).maybeSingle();
      const { error } = existing
        ? await supabase.from('settings').update({ setting_value: String(next), updated_at: new Date().toISOString() }).eq('setting_key', FOLLOWUP_KEY)
        : await supabase.from('settings').insert([{ setting_key: FOLLOWUP_KEY, setting_value: String(next) }]);
      if (error) throw error;
      setFollowupOn(next);
      notify(next ? 'Automatic follow-up emails are on' : 'Automatic follow-up emails are off');
    } catch (err) {
      notify('Could not save: ' + err.message);
    }
  };

  const counts = useMemo(() => countByStage(leads), [leads]);
  const visible = useMemo(() => sortLeads(leads.filter(l => l.stage === stage)), [leads, stage]);

  const setLeadStage = async (lead, next, reason = null) => {
    const patch = stagePatch(next, reason);
    let { error } = await supabase.from('leads').update(patch).eq('id', lead.id);
    if (error && isMissingSchemaError(error)) {
      // Follow-up SQL (20261124150000) not run yet: save the stage without the clock.
      const { quoted_at, followup_sent_at, ...rest } = patch;
      ({ error } = await supabase.from('leads').update(rest).eq('id', lead.id));
    }
    if (error) { notify('Could not update the lead: ' + error.message); return; }
    setLostFor(null);
    await load();
  };

  // "We talked" restarts the 7-day clock; "Don't send" turns it off for this lead.
  const updateLead = async (lead, patch, done) => {
    const { error } = await supabase.from('leads').update(patch).eq('id', lead.id);
    if (error) {
      notify(isMissingSchemaError(error) ? 'Run the follow-up SQL file (20261124150000) first.' : 'Could not update the lead: ' + error.message);
      return;
    }
    if (done) notify(done);
    await load();
  };

  const addAsClient = async (lead) => {
    try {
      const { data, error } = await supabase.from('clients').insert([clientFromLead(lead)]).select('id').single();
      if (error) throw error;
      const { error: linkErr } = await supabase.from('leads').update({ client_id: data.id, updated_at: new Date().toISOString() }).eq('id', lead.id);
      if (linkErr) throw linkErr;
      notify(`${lead.name} added to Clients`);
      await load();
    } catch (err) {
      notify('Could not add the client: ' + err.message);
    }
  };

  const addLead = async () => {
    const row = leadFromForm(form);
    if (!row.name) { notify('Name is required.'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('leads').insert([row]);
      if (error) throw error;
      setShowAdd(false);
      setForm(emptyLeadForm());
      setStage('new');
      await load();
    } catch (err) {
      notify('Could not add the lead: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Leads</h2>
          <p className="text-sm text-gray-600 mt-1">Quote requests from the website and inquiries you add by hand.</p>
        </div>
        {!needsSql && (
          <button onClick={() => setShowAdd(s => !s)}
            className="bg-red-900 text-white px-4 py-2 rounded-lg hover:bg-red-800 flex items-center space-x-2 text-sm">
            <Plus size={16} /><span>Add lead</span>
          </button>
        )}
      </div>

      {needsSql && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-lg p-3">
          Leads turn on once the leads SQL file (20261124140000) has been run in Supabase.
        </div>
      )}

      {showAdd && (
        <div className="bg-white rounded-lg shadow p-5 border-l-4 border-red-900 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input className={inputClass} placeholder="Name *" value={form.name} onChange={set('name')} />
            <input className={inputClass} placeholder="Company / organization" value={form.company} onChange={set('company')} />
            <input className={inputClass} placeholder="Phone" value={form.phone} onChange={set('phone')} />
            <input className={inputClass} type="email" placeholder="Email" value={form.email} onChange={set('email')} />
            <input className={inputClass} type="date" value={form.event_date} onChange={set('event_date')} />
            <input className={inputClass} placeholder="Number of guests" inputMode="numeric" value={form.guest_count} onChange={set('guest_count')} />
            <input className={`${inputClass} md:col-span-2`} placeholder="Event location" value={form.event_location} onChange={set('event_location')} />
            <textarea className={`${inputClass} md:col-span-2`} rows={2} placeholder="Notes" value={form.message} onChange={set('message')} />
          </div>
          <div className="flex space-x-2">
            <button onClick={addLead} disabled={saving}
              className="bg-red-900 text-white px-4 py-2 rounded-lg hover:bg-red-800 disabled:bg-gray-400 flex items-center space-x-1 text-sm">
              <Save size={14} /><span>{saving ? 'Saving...' : 'Add lead'}</span>
            </button>
            <button onClick={() => { setShowAdd(false); setForm(emptyLeadForm()); }} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {!needsSql && (
        <div className="bg-white rounded-lg shadow p-4 text-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center space-x-2 text-gray-800">
              <Clock size={16} className="text-red-900" />
              <span><strong>Automatic follow-up:</strong> email a quoted lead if 7 days pass with no contact. Press "We talked" on a lead to restart the 7 days.</span>
            </div>
            <div className="flex items-center space-x-3">
              <button onClick={() => setShowFollowupInfo(s => !s)} className="text-red-900 hover:underline">{showFollowupInfo ? 'Hide email' : 'See the email'}</button>
              <button onClick={toggleFollowup}
                className={`px-3 py-1.5 rounded-full font-medium ${followupOn ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                {followupOn ? 'On' : 'Off'}
              </button>
            </div>
          </div>
          {showFollowupInfo && (
            <div className="mt-3 border-t pt-3 text-gray-700 space-y-2">
              <p className="text-xs text-gray-500">Subject: Still planning your casino party?</p>
              <p>Hi (first name),</p>
              <p>We wanted to check in on the quote we sent for your event on (date). Are you still planning your casino party?</p>
              <p>If you have questions, want to change anything, or are ready to book, just reply to this email or call us at (262) 549-3559. Dates fill up, so let us know soon and we'll hold yours.</p>
              <p>Thanks,<br />Vegas on Wheels</p>
              <p className="text-xs text-gray-500">Replies go to sales@vegasonwheels.com. Goes out between 9 AM and 6 PM, 7 days after the lead was quoted or after the last "We talked", whichever is later. Never for a lead set to "Don't send auto email", or once it's Booked or Lost.</p>
            </div>
          )}
        </div>
      )}

      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-full overflow-x-auto">
        {LEAD_STAGES.map(s => (
          <button key={s.id} onClick={() => setStage(s.id)}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap ${stage === s.id ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            {s.label} <span className="text-gray-400">({counts[s.id]})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-900" />
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-10 text-center text-sm text-gray-500">
          {needsSql ? 'Not available yet.' : `No ${stageLabel(stage).toLowerCase()} leads.`}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(lead => {
            const clientName = lead.client_id !== null && lead.client_id !== undefined ? clientNames[String(lead.client_id)] : null;
            return (
              <div key={lead.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900">
                      {lead.name}
                      {lead.company && <span className="font-normal text-gray-500"> · {lead.company}</span>}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {lead.source === 'website' ? 'Website form' : 'Added by hand'} · {new Date(lead.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      {clientName && <> · Client: <span className="text-gray-700">{clientName}</span></>}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-700">
                      {lead.phone && <a href={`tel:${lead.phone}`} className="flex items-center space-x-1 hover:text-red-900"><Phone size={13} /><span>{lead.phone}</span></a>}
                      {lead.email && <a href={`mailto:${lead.email}`} className="flex items-center space-x-1 hover:text-red-900"><Mail size={13} /><span>{lead.email}</span></a>}
                      {lead.event_date && <span className="flex items-center space-x-1"><Calendar size={13} /><span>{formatEventDate(lead.event_date)}{lead.start_time ? `, ${lead.start_time}` : ''}</span></span>}
                      {lead.event_location && <span className="flex items-center space-x-1"><MapPin size={13} /><span>{lead.event_location}</span></span>}
                      {lead.guest_count !== null && lead.guest_count !== undefined && <span className="flex items-center space-x-1"><Users size={13} /><span>{lead.guest_count} guests</span></span>}
                    </div>
                    {(lead.games?.length > 0 || lead.services?.length > 0) && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {[...(lead.games || []), ...(lead.services || [])].map(t => (
                          <span key={t} className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full border border-red-100">{t}</span>
                        ))}
                      </div>
                    )}
                    {lead.message && <p className="text-sm text-gray-600 mt-2 whitespace-pre-line">{lead.message}</p>}
                    {lead.stage === 'lost' && lead.lost_reason && <p className="text-xs text-gray-500 mt-2">Lost: {lead.lost_reason}</p>}
                    {followupStatus(lead, followupOn) && <p className="text-xs text-gray-500 mt-2 flex items-center space-x-1"><Clock size={12} /><span>{followupStatus(lead, followupOn)}</span></p>}
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <select value={lead.stage}
                      onChange={e => (e.target.value === 'lost' ? setLostFor(lead.id) : setLeadStage(lead, e.target.value))}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm">
                      {LEAD_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                    {lead.stage === 'quoted' && (
                      <>
                        <button onClick={() => updateLead(lead, contactPatch(), 'Got it. The 7 days start over today.')}
                          className="text-xs text-red-900 hover:underline">We talked</button>
                        <button onClick={() => updateLead(lead, { followup_paused: !lead.followup_paused, updated_at: new Date().toISOString() })}
                          className="text-xs text-gray-600 hover:underline">{lead.followup_paused ? 'Allow auto email' : "Don't send auto email"}</button>
                      </>
                    )}
                    {(lead.client_id === null || lead.client_id === undefined) && (
                      <button onClick={() => addAsClient(lead)} className="text-xs text-red-900 hover:underline flex items-center space-x-1">
                        <UserPlus size={13} /><span>Add as client</span>
                      </button>
                    )}
                  </div>
                </div>
                {lostFor === lead.id && (
                  <div className="mt-3 border-t pt-3 flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-gray-700">Why was it lost?</span>
                    {LOST_REASONS.map(r => (
                      <button key={r} onClick={() => setLeadStage(lead, 'lost', r)} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full">{r}</button>
                    ))}
                    <button onClick={() => setLostFor(null)} className="text-gray-500 hover:underline">Cancel</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
