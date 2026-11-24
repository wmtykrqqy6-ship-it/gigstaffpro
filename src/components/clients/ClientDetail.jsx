import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Edit, Trash2, Phone, Mail, MapPin, Calendar, Plus, Star, Save, MessageSquare, User
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useConfirm } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import ClientForm from './ClientForm';
import { logClientAccess } from '../../utils/clientAccessLog';
import { formatTime } from '../../utils/dateHelpers';
import {
  clientTypeLabel, clientFormFrom, saveClientRecord,
  ACTIVITY_KINDS, activityKindLabel, PREFERRED_CONTACT,
  emptyContactForm, contactFormFrom, validateContact, contactPayloadFromForm, sortContacts,
  splitClientEvents, eventStaffCount, sortActivity, isMissingSchemaError, formatEventDate
} from '../../utils/clientRecords';

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm';
const NEEDS_SQL = 'Contacts and history turn on once the new Clients SQL file has been run in Supabase.';

function Card({ title, icon: Icon, count, action, children }) {
  return (
    <div className="bg-white rounded-lg shadow p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-900 flex items-center space-x-2">
          {Icon && <Icon size={17} className="text-red-900" />}
          <span>{title}</span>
          {count > 0 && <span className="bg-red-900 text-white text-xs px-1.5 py-0.5 rounded-full">{count}</span>}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function EventRow({ ev, timeFormat }) {
  const staff = eventStaffCount(ev);
  return (
    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 flex items-start justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">{ev.name || 'Event'}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {formatEventDate(ev.date)}
          {ev.time && ` · ${formatTime(ev.time, timeFormat)}`}
          {ev.venue && ` · ${ev.venue}`}
        </p>
      </div>
      <div className="text-right flex-shrink-0 ml-3">
        {ev.status && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            ev.status === 'confirmed' ? 'bg-green-100 text-green-700' :
            ev.status === 'completed' ? 'bg-blue-100 text-blue-700' :
            ev.status === 'cancelled' ? 'bg-red-100 text-red-700' :
            'bg-gray-100 text-gray-600'
          }`}>{ev.status}</span>
        )}
        {staff > 0 && <p className="text-xs text-gray-400 mt-1">{staff} staff</p>}
      </div>
    </div>
  );
}

// One client's page: details, contacts, events and history.
export default function ClientDetail({ client, timeFormat, onBack, onChanged, onDeleted }) {
  const confirm = useConfirm();
  const notify = useToast();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(clientFormFrom(client));
  const [saving, setSaving] = useState(false);

  const [events, setEvents] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [activity, setActivity] = useState([]);
  const [needsSql, setNeedsSql] = useState(false);

  const [contactForm, setContactForm] = useState(null); // null = closed
  const [editingContactId, setEditingContactId] = useState(null);
  const [savingContact, setSavingContact] = useState(false);

  const [noteKind, setNoteKind] = useState('note');
  const [noteBody, setNoteBody] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const clientId = client.id;

  const loadEvents = async () => {
    const { data, error } = await supabase
      .from('events')
      .select('id, name, date, time, venue, status, positions')
      .eq('client_id', clientId);
    if (error) { console.error('Error loading client events:', error.message); return; }
    setEvents(data || []);
  };

  const loadContacts = async () => {
    const { data, error } = await supabase.from('client_contacts').select('*').eq('client_id', clientId);
    if (error) {
      if (isMissingSchemaError(error)) setNeedsSql(true);
      else console.error('Error loading contacts:', error.message);
      return;
    }
    setContacts(data || []);
  };

  const loadActivity = async () => {
    const { data, error } = await supabase
      .from('client_activity')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    if (error) {
      if (isMissingSchemaError(error)) setNeedsSql(true);
      else console.error('Error loading client history:', error.message);
      return;
    }
    setActivity(data || []);
  };

  useEffect(() => {
    setForm(clientFormFrom(client));
    setEditing(false);
    setNeedsSql(false);
    loadEvents();
    loadContacts();
    loadActivity();
    // One view entry per client opened (the key includes the id, so
    // opening different clients is logged separately).
    logClientAccess(supabase, {
      action: 'view',
      recordType: 'clients',
      recordIds: [clientId],
      where: `clients_tab:${clientId}`
    });
  }, [clientId]);

  // --- Client ---
  const saveClient = async () => {
    if (!form.name.trim()) { notify('Client name is required.'); return; }
    setSaving(true);
    try {
      const { crmFieldsSaved } = await saveClientRecord(supabase, form, clientId);
      if (!crmFieldsSaved) notify('Saved. Type and billing address need the new Clients SQL to be run first.');
      setEditing(false);
      await onChanged();
    } catch (err) {
      notify('Error saving client: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteClient = async () => {
    const extra = contacts.length || activity.length
      ? ` Their ${contacts.length} contact${contacts.length === 1 ? '' : 's'} and ${activity.length} history entr${activity.length === 1 ? 'y' : 'ies'} are deleted too.`
      : '';
    if (!(await confirm(`Delete "${client.name}"? Their events will not be deleted.${extra} This cannot be undone.`))) return;
    try {
      const { error } = await supabase.from('clients').delete().eq('id', clientId);
      if (error) throw error;
      await onDeleted();
    } catch (err) {
      notify('Error deleting client: ' + err.message);
    }
  };

  // --- Contacts ---
  const openAddContact = () => {
    setEditingContactId(null);
    setContactForm({ ...emptyContactForm(), is_primary: contacts.length === 0 });
  };
  const openEditContact = (c) => { setEditingContactId(c.id); setContactForm(contactFormFrom(c)); };
  const closeContact = () => { setEditingContactId(null); setContactForm(null); };

  const saveContact = async () => {
    const problem = validateContact(contactForm);
    if (problem) { notify(problem); return; }
    setSavingContact(true);
    try {
      const payload = contactPayloadFromForm(contactForm, clientId);
      // Only one primary contact per client.
      if (payload.is_primary) {
        const others = contacts.filter(c => c.is_primary && c.id !== editingContactId).map(c => c.id);
        if (others.length) {
          const { error } = await supabase.from('client_contacts').update({ is_primary: false }).in('id', others);
          if (error) throw error;
        }
      }
      const { error } = editingContactId
        ? await supabase.from('client_contacts').update(payload).eq('id', editingContactId)
        : await supabase.from('client_contacts').insert([payload]);
      if (error) throw error;
      closeContact();
      await loadContacts();
    } catch (err) {
      notify('Error saving contact: ' + err.message);
    } finally {
      setSavingContact(false);
    }
  };

  const deleteContact = async (c) => {
    if (!(await confirm(`Remove ${c.name} from ${client.name}'s contacts?`))) return;
    const { error } = await supabase.from('client_contacts').delete().eq('id', c.id);
    if (error) { notify('Error removing contact: ' + error.message); return; }
    await loadContacts();
  };

  // --- History ---
  const addNote = async () => {
    const body = noteBody.trim();
    if (!body) return;
    setSavingNote(true);
    try {
      const { error } = await supabase.from('client_activity').insert([{ client_id: clientId, kind: noteKind, body }]);
      if (error) throw error;
      setNoteBody('');
      setNoteKind('note');
      await loadActivity();
    } catch (err) {
      notify('Error saving note: ' + err.message);
    } finally {
      setSavingNote(false);
    }
  };

  const deleteNote = async (entry) => {
    if (!(await confirm('Delete this history entry?'))) return;
    const { error } = await supabase.from('client_activity').delete().eq('id', entry.id);
    if (error) { notify('Error deleting entry: ' + error.message); return; }
    await loadActivity();
  };

  const { upcoming, past } = splitClientEvents(events);
  const sortedContacts = sortContacts(contacts);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center space-x-1 text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft size={16} />
        <span>All clients</span>
      </button>

      {editing ? (
        <ClientForm
          title={`Edit: ${client.name}`}
          form={form}
          setForm={setForm}
          saving={saving}
          saveLabel="Save changes"
          onSave={saveClient}
          onCancel={() => { setEditing(false); setForm(clientFormFrom(client)); }}
        />
      ) : (
        <div className="bg-white rounded-lg shadow p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start space-x-3 min-w-0">
              <div className="bg-red-900 rounded-full h-12 w-12 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                {String(client.name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h2 className="text-2xl font-bold text-gray-900">{client.name}</h2>
                <div className="flex items-center flex-wrap gap-2 mt-1">
                  {client.company && <span className="text-sm text-gray-600">{client.company}</span>}
                  {client.client_type && (
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">{clientTypeLabel(client.client_type)}</span>
                  )}
                  {client.is_active === false && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactive</span>}
                  {(client.tags || []).map(tag => (
                    <span key={tag} className="bg-red-50 text-red-700 text-xs px-2 py-0.5 rounded-full border border-red-100">{tag}</span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-700">
                  {client.phone && <a href={`tel:${client.phone}`} className="flex items-center space-x-1 hover:text-red-900"><Phone size={14} /><span>{client.phone}</span></a>}
                  {client.email && <a href={`mailto:${client.email}`} className="flex items-center space-x-1 hover:text-red-900"><Mail size={14} /><span>{client.email}</span></a>}
                  {client.billing_address && <span className="flex items-start space-x-1 whitespace-pre-line"><MapPin size={14} className="mt-0.5" /><span>{client.billing_address}</span></span>}
                </div>
                {client.notes && <p className="text-sm text-gray-600 mt-3 whitespace-pre-line">{client.notes}</p>}
              </div>
            </div>
            <div className="flex items-center space-x-1 flex-shrink-0">
              <button onClick={() => setEditing(true)} className="p-2 text-blue-600 hover:bg-blue-50 rounded" title="Edit">
                <Edit size={16} />
              </button>
              <button onClick={deleteClient} className="p-2 text-red-600 hover:bg-red-50 rounded" title="Delete">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {needsSql && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-lg p-3">{NEEDS_SQL}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <Card
            title="Contacts"
            icon={User}
            count={contacts.length}
            action={!needsSql && !contactForm && (
              <button onClick={openAddContact} className="text-sm text-red-900 hover:underline flex items-center space-x-1">
                <Plus size={14} /><span>Add contact</span>
              </button>
            )}
          >
            {contactForm && (
              <div className="border border-gray-200 rounded-lg p-3 mb-3 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input className={inputClass} placeholder="Name *" value={contactForm.name}
                    onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} />
                  <input className={inputClass} placeholder="Role (e.g. HR manager, planner)" value={contactForm.role}
                    onChange={e => setContactForm(f => ({ ...f, role: e.target.value }))} />
                  <input className={inputClass} placeholder="Phone" value={contactForm.phone}
                    onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} />
                  <input className={inputClass} type="email" placeholder="Email" value={contactForm.email}
                    onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} />
                  <select className={inputClass} value={contactForm.preferred_contact}
                    onChange={e => setContactForm(f => ({ ...f, preferred_contact: e.target.value }))}>
                    <option value="">Best way to reach: not set</option>
                    {PREFERRED_CONTACT.map(p => <option key={p.id} value={p.id}>Best way to reach: {p.label}</option>)}
                  </select>
                  <label className="flex items-center space-x-2 text-sm text-gray-700">
                    <input type="checkbox" checked={contactForm.is_primary}
                      onChange={e => setContactForm(f => ({ ...f, is_primary: e.target.checked }))} />
                    <span>Primary contact</span>
                  </label>
                </div>
                <textarea className={inputClass} rows={2} placeholder="Notes about this person" value={contactForm.notes}
                  onChange={e => setContactForm(f => ({ ...f, notes: e.target.value }))} />
                <div className="flex space-x-2">
                  <button onClick={saveContact} disabled={savingContact}
                    className="bg-red-900 text-white px-4 py-1.5 rounded-lg hover:bg-red-800 disabled:bg-gray-400 flex items-center space-x-1 text-sm">
                    <Save size={14} /><span>{savingContact ? 'Saving...' : editingContactId ? 'Save' : 'Add'}</span>
                  </button>
                  <button onClick={closeContact} className="px-4 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">Cancel</button>
                </div>
              </div>
            )}
            {sortedContacts.length === 0 && !contactForm ? (
              <p className="text-sm text-gray-400">
                {needsSql ? 'Not available yet.' : 'No contacts yet. The client’s own phone and email are shown above.'}
              </p>
            ) : (
              <div className="space-y-2">
                {sortedContacts.map(c => (
                  <div key={c.id} className="border border-gray-100 rounded-lg p-3 flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 flex items-center space-x-1">
                        <span>{c.name}</span>
                        {c.is_primary && <Star size={13} className="text-yellow-500 fill-yellow-400" title="Primary contact" />}
                        {c.role && <span className="text-xs text-gray-500 font-normal">· {c.role}</span>}
                      </p>
                      <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-600">
                        {c.phone && <a href={`tel:${c.phone}`} className="flex items-center space-x-1 hover:text-red-900"><Phone size={11} /><span>{c.phone}</span></a>}
                        {c.email && <a href={`mailto:${c.email}`} className="flex items-center space-x-1 hover:text-red-900"><Mail size={11} /><span>{c.email}</span></a>}
                        {c.preferred_contact && <span>Prefers: {PREFERRED_CONTACT.find(p => p.id === c.preferred_contact)?.label}</span>}
                      </div>
                      {c.notes && <p className="text-xs text-gray-500 mt-1 whitespace-pre-line">{c.notes}</p>}
                    </div>
                    <div className="flex items-center flex-shrink-0">
                      <button onClick={() => openEditContact(c)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Edit"><Edit size={14} /></button>
                      <button onClick={() => deleteContact(c)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Remove"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Events" icon={Calendar} count={events.length}>
            {events.length === 0 ? (
              <p className="text-sm text-gray-400">No events linked to this client yet. Picking this client in the event form links the event.</p>
            ) : (
              <div className="space-y-4">
                {upcoming.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Upcoming</p>
                    <div className="space-y-2">{upcoming.map(ev => <EventRow key={ev.id} ev={ev} timeFormat={timeFormat} />)}</div>
                  </div>
                )}
                {past.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Past</p>
                    <div className="space-y-2">{past.map(ev => <EventRow key={ev.id} ev={ev} timeFormat={timeFormat} />)}</div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        <Card title="History" icon={MessageSquare} count={activity.length}>
          {!needsSql && (
            <div className="space-y-2 mb-4">
              <div className="flex gap-2">
                <select value={noteKind} onChange={e => setNoteKind(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  {ACTIVITY_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
                </select>
                <p className="text-xs text-gray-500 self-center">Log a note, call, email, text or meeting.</p>
              </div>
              <textarea className={inputClass} rows={3} value={noteBody} onChange={e => setNoteBody(e.target.value)}
                placeholder="e.g. Called about a March fundraiser, wants 6 tables. Follow up next week." />
              <button onClick={addNote} disabled={savingNote || !noteBody.trim()}
                className="bg-red-900 text-white px-4 py-1.5 rounded-lg hover:bg-red-800 disabled:bg-gray-300 flex items-center space-x-1 text-sm">
                <Plus size={14} /><span>{savingNote ? 'Saving...' : 'Add to history'}</span>
              </button>
            </div>
          )}
          {activity.length === 0 ? (
            <p className="text-sm text-gray-400">{needsSql ? 'Not available yet.' : 'Nothing logged yet.'}</p>
          ) : (
            <div className="space-y-3">
              {sortActivity(activity).map(entry => (
                <div key={entry.id} className="border-l-2 border-red-900 pl-3 group">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">
                      <span className="font-semibold text-gray-700">{activityKindLabel(entry.kind)}</span>
                      {' · '}
                      {entry.created_at ? new Date(entry.created_at).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
                        hour12: timeFormat !== '24'
                      }) : ''}
                      {entry.created_by_name && ` · ${entry.created_by_name}`}
                    </p>
                    <button onClick={() => deleteNote(entry)} className="p-1 text-gray-400 hover:text-red-600" title="Delete">
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <p className="text-sm text-gray-800 mt-0.5 whitespace-pre-line">{entry.body}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
