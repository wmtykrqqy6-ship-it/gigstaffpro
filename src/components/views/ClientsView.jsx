import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, User, Phone, Mail, Calendar, ChevronRight, Upload } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useConfirm } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import ClientForm from '../clients/ClientForm';
import ClientDetail from '../clients/ClientDetail';
import GoodshuffleImport from '../clients/GoodshuffleImport';
import { clientMatchesSearch, planMissingClients, newClientFromEvent } from '../../utils/clientMatch';
import { loadEventClientDetails, mergeClientDetails } from '../../utils/eventClientDetails';
import { logClientAccess } from '../../utils/clientAccessLog';
import { parseClientLine } from '../../utils/logistics/pullSheetParser';
import {
  CLIENT_TYPES, clientTypeLabel, emptyClientForm, saveClientRecord,
  summarizeClientEvents, formatEventDate, fetchAllRows
} from '../../utils/clientRecords';

// Clients tab (CRM Phase 1, step 1). Admins and sales managers only: the
// Navigation shows it only to admins, and the tables are admin-only in the
// database (docs/CLIENT_SECURITY.md). Replaces Settings -> Clients.
export default function ClientsView({ timeFormat }) {
  const confirm = useConfirm();
  const notify = useToast();

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [clientEvents, setClientEvents] = useState([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showInactive, setShowInactive] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [showImport, setShowImport] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyClientForm());
  const [saving, setSaving] = useState(false);

  const [missingClients, setMissingClients] = useState([]);
  const [addingMissing, setAddingMissing] = useState(false);

  const loadClients = async () => {
    try {
      const { data, error } = await fetchAllRows(() => supabase.from('clients').select('*').order('name').order('id'));
      if (error) throw error;
      setClients(data || []);
      setLoadError(null);
      if (data?.length) {
        logClientAccess(supabase, {
          action: 'view',
          recordType: 'clients',
          recordIds: data.map(c => c.id),
          where: 'clients_tab'
        });
      }
    } catch (err) {
      console.error('Error loading clients:', err.message);
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Event counts and dates for the list (event rows only carry client_id;
  // names and contacts stay in the admin-only tables).
  const loadClientEvents = async () => {
    const { data, error } = await fetchAllRows(() => supabase
      .from('events')
      .select('id, client_id, date')
      .not('client_id', 'is', null)
      .order('id'));
    if (error) {
      console.error('Error loading client events:', error.message);
      return;
    }
    setClientEvents(data || []);
  };

  useEffect(() => {
    loadClients();
    loadClientEvents();
  }, []);

  // "Add missing clients": events with a client name that isn't linked yet.
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('events')
        .select('id, client, client_contact, client_id')
        .is('client_id', null);
      if (cancelled || error) return;
      const details = await loadEventClientDetails(supabase, 'clients_tab_missing');
      if (cancelled) return;
      setMissingClients(planMissingClients(mergeClientDetails(data || [], details), clients, parseClientLine));
    })();
    return () => { cancelled = true; };
  }, [clients, loading]);

  const addMissingClients = async () => {
    if (!missingClients.length || addingMissing) return;
    const lines = missingClients.map(g =>
      `• ${g.name} — ${g.existing ? 'link to existing client' : 'new client'} (${g.eventIds.length} event${g.eventIds.length === 1 ? '' : 's'})`
    ).join('\n');
    if (!(await confirm(`Add these clients and link their events?\n\n${lines}`))) return;
    setAddingMissing(true);
    let added = 0, linked = 0, failed = 0;
    for (const g of missingClients) {
      try {
        let clientId = g.existing?.id;
        if (!clientId) {
          const { data, error } = await supabase
            .from('clients')
            .insert([newClientFromEvent({ client: g.name, client_contact: g.contact })])
            .select('id')
            .single();
          if (error) throw error;
          clientId = data.id;
          added++;
        }
        const { error: linkError } = await supabase
          .from('events')
          .update({ client_id: clientId, client: g.name })
          .in('id', g.eventIds);
        if (linkError) throw linkError;
        linked += g.eventIds.length;
      } catch (err) {
        console.error(`Could not add client ${g.name}:`, err.message);
        failed++;
      }
    }
    setAddingMissing(false);
    await Promise.all([loadClients(), loadClientEvents()]);
    notify(`Added ${added} client${added === 1 ? '' : 's'} and linked ${linked} event${linked === 1 ? '' : 's'}`
      + (failed ? ` — ${failed} couldn't be added, try again` : ''));
  };

  const createClient = async () => {
    if (!form.name.trim()) { notify('Client name is required.'); return; }
    setSaving(true);
    try {
      const { id, crmFieldsSaved } = await saveClientRecord(supabase, form);
      if (!crmFieldsSaved) notify('Saved. Type and billing address need the new Clients SQL to be run first.');
      await loadClients();
      setShowAdd(false);
      setForm(emptyClientForm());
      if (id) setSelectedId(id);
    } catch (err) {
      notify('Error saving client: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const stats = useMemo(() => summarizeClientEvents(clientEvents), [clientEvents]);

  const visible = useMemo(() => clients.filter(c =>
    (showInactive || c.is_active !== false) &&
    (typeFilter === 'all' || (typeFilter === 'none' ? !c.client_type : c.client_type === typeFilter)) &&
    clientMatchesSearch(c, search)
  ), [clients, showInactive, typeFilter, search]);

  const selected = selectedId !== null ? clients.find(c => String(c.id) === String(selectedId)) : null;

  if (selected) {
    return (
      <ClientDetail
        client={selected}
        timeFormat={timeFormat}
        onBack={() => setSelectedId(null)}
        onChanged={async () => { await Promise.all([loadClients(), loadClientEvents()]); }}
        onDeleted={async () => { setSelectedId(null); await Promise.all([loadClients(), loadClientEvents()]); }}
      />
    );
  }

  const inactiveCount = clients.filter(c => c.is_active === false).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Clients</h2>
          <p className="text-sm text-gray-600 mt-1">Everyone who books with you: contacts, past events and notes. Only admins and sales managers can see this.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {missingClients.length > 0 && (
            <button
              onClick={addMissingClients}
              disabled={addingMissing}
              className="bg-white text-red-900 border border-red-900 px-4 py-2 rounded-lg hover:bg-red-50 flex items-center space-x-2 text-sm disabled:opacity-50"
              title="Add the clients from your events that aren't in this list yet"
            >
              <Plus size={16} />
              <span>{addingMissing ? 'Adding…' : `Add missing clients (${missingClients.length})`}</span>
            </button>
          )}
          <button
            onClick={() => setShowImport(true)}
            className="bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 flex items-center space-x-2 text-sm"
          >
            <Upload size={16} />
            <span>Import from Goodshuffle</span>
          </button>
          <button
            onClick={() => { setForm(emptyClientForm()); setShowAdd(true); }}
            className="bg-red-900 text-white px-4 py-2 rounded-lg hover:bg-red-800 flex items-center space-x-2 text-sm"
          >
            <Plus size={16} />
            <span>Add client</span>
          </button>
        </div>
      </div>

      {showImport && (
        <GoodshuffleImport
          clients={clients}
          onClose={() => setShowImport(false)}
          onImported={async () => { await Promise.all([loadClients(), loadClientEvents()]); }}
        />
      )}

      {showAdd && (
        <ClientForm
          title="New client"
          form={form}
          setForm={setForm}
          saving={saving}
          saveLabel="Create client"
          onSave={createClient}
          onCancel={() => { setShowAdd(false); setForm(emptyClientForm()); }}
        />
      )}

      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, company, email or phone..."
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
          />
        </div>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="all">All types</option>
          {CLIENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          <option value="none">Type not set</option>
        </select>
        {inactiveCount > 0 && (
          <label className="flex items-center space-x-2 text-sm text-gray-600 px-2">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
            <span>Show inactive ({inactiveCount})</span>
          </label>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-900" />
        </div>
      ) : loadError ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-700 font-medium">Couldn't load clients.</p>
          <p className="text-gray-500 text-sm mt-1">{loadError}</p>
        </div>
      ) : clients.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <User size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 font-medium">No clients yet.</p>
          <p className="text-gray-400 text-sm mt-1">Add one, or create an event with a client name and it will appear here.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow divide-y divide-gray-100">
          <div className="px-4 py-2 text-xs text-gray-500">
            {visible.length} of {clients.length} client{clients.length === 1 ? '' : 's'}
          </div>
          {visible.length === 0 && (
            <p className="px-4 py-6 text-sm text-gray-500 text-center">No clients match.</p>
          )}
          {visible.map(client => {
            const s = stats.get(String(client.id));
            return (
              <button
                key={client.id}
                onClick={() => setSelectedId(client.id)}
                className="w-full text-left p-4 flex items-center justify-between hover:bg-gray-50"
              >
                <div className="flex items-start space-x-3 flex-1 min-w-0">
                  <div className="bg-red-900 rounded-full h-10 w-10 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {String(client.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="font-bold text-gray-900">{client.name}</span>
                      {client.company && <span className="text-sm text-gray-500">{client.company}</span>}
                      {client.client_type && (
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">{clientTypeLabel(client.client_type)}</span>
                      )}
                      {client.is_active === false && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactive</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-500">
                      {client.phone && <span className="flex items-center space-x-1"><Phone size={11} /><span>{client.phone}</span></span>}
                      {client.email && <span className="flex items-center space-x-1"><Mail size={11} /><span>{client.email}</span></span>}
                      {s?.total > 0 && (
                        <span className="flex items-center space-x-1">
                          <Calendar size={11} />
                          <span>
                            {s.total} event{s.total === 1 ? '' : 's'}
                            {s.nextDate ? ` · next ${formatEventDate(s.nextDate)}` : s.lastDate ? ` · last ${formatEventDate(s.lastDate)}` : ''}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} className="text-gray-400 flex-shrink-0 ml-2" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
