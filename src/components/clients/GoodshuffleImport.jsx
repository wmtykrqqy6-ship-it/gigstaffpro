import React, { useState } from 'react';
import { X, Upload, CheckCircle } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { normalizeClientName } from '../../utils/clientMatch';
import { isMissingSchemaError, fetchAllRows } from '../../utils/clientRecords';
import {
  readImportFile, planGoodshuffleImport, clientRowFromGroup, fillMissingClientFields,
  projectRow, chunk
} from '../../utils/goodshuffleImport';

const NEEDS_SQL = 'The Goodshuffle SQL file (20261124130000) needs to be run in Supabase before importing.';

// Clients tab -> "Import from Goodshuffle". Pick the import file, review
// what will be added and matched, then import. Safe to run again: clients
// already here are matched, and projects are updated by project number.
export default function GoodshuffleImport({ clients, onClose, onImported }) {
  const [projects, setProjects] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [includeQuoteOnly, setIncludeQuoteOnly] = useState(true);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState(null);

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const list = readImportFile(await file.text());
      const { data, error: ctErr } = await fetchAllRows(() => supabase.from('client_contacts').select('client_id, email').order('id'));
      if (ctErr && !isMissingSchemaError(ctErr)) throw ctErr;
      setContacts(data || []);
      setProjects(list);
    } catch (err) {
      setError(err.message);
    }
  };

  const plan = projects ? planGoodshuffleImport(projects, clients, contacts, { includeQuoteOnly }) : null;
  const quoteOnlyNew = plan ? plan.newClients.filter(g => !g.signed).length : 0;

  const runImport = async () => {
    if (!plan || running) return;
    setRunning(true);
    setError(null);
    try {
      // The projects table must exist before any client is added.
      const { error: tableErr } = await supabase.from('goodshuffle_projects').select('id').limit(1);
      if (tableErr) throw new Error(isMissingSchemaError(tableErr) ? NEEDS_SQL : tableErr.message);

      // 1. New clients
      const idByName = new Map();
      let added = 0;
      for (const part of chunk(plan.newClients, 100)) {
        setProgress(`Adding clients… ${added} of ${plan.newClients.length}`);
        const { data, error: insErr } = await supabase
          .from('clients')
          .insert(part.map(clientRowFromGroup))
          .select('id, name');
        if (insErr) throw new Error(isMissingSchemaError(insErr) ? NEEDS_SQL : insErr.message);
        for (const row of data || []) idByName.set(normalizeClientName(row.name), row.id);
        added += part.length;
      }

      // 2. Existing clients: fill in a missing email or phone only
      let filled = 0;
      for (const { client, group } of plan.matched) {
        const patch = fillMissingClientFields(client, group);
        if (!Object.keys(patch).length) continue;
        const { error: upErr } = await supabase.from('clients').update(patch).eq('id', client.id);
        if (upErr) throw upErr;
        filled++;
      }

      // 3. Projects, linked to their client
      const rows = [];
      const clientByInvoice = new Map();
      for (const g of plan.newClients) {
        const id = idByName.get(normalizeClientName(g.name));
        if (id === undefined) continue;
        for (const p of g.projects) { rows.push(projectRow(p, id)); clientByInvoice.set(String(p.project_id), id); }
      }
      for (const { client, group } of plan.matched) {
        for (const p of group.projects) { rows.push(projectRow(p, client.id)); clientByInvoice.set(String(p.project_id), client.id); }
      }
      let saved = 0;
      for (const part of chunk(rows, 200)) {
        setProgress(`Saving Goodshuffle projects… ${saved} of ${rows.length}`);
        const { error: pErr } = await supabase.from('goodshuffle_projects').upsert(part, { onConflict: 'project_id' });
        if (pErr) throw pErr;
        saved += part.length;
      }

      // 4. Link GigStaffPro events that came from the same Goodshuffle
      //    project (pull-sheet import) and have no client yet.
      setProgress('Linking events…');
      const { data: evs, error: evErr } = await fetchAllRows(() => supabase
        .from('events')
        .select('id, goodshuffle_invoice')
        .not('goodshuffle_invoice', 'is', null)
        .is('client_id', null)
        .order('id'));
      if (evErr) throw evErr;
      const eventsByClient = new Map();
      for (const ev of evs || []) {
        const id = clientByInvoice.get(String(ev.goodshuffle_invoice));
        if (id === undefined) continue;
        if (!eventsByClient.has(id)) eventsByClient.set(id, []);
        eventsByClient.get(id).push(ev.id);
      }
      let linked = 0;
      for (const [clientId, ids] of eventsByClient) {
        const { error: lErr } = await supabase.from('events').update({ client_id: clientId }).in('id', ids);
        if (lErr) throw lErr;
        linked += ids.length;
      }

      setResult({ added, filled, matched: plan.matched.length, saved, linked });
      setProgress('');
      await onImported();
    } catch (err) {
      setError(`${err.message} Nothing after this point was imported; running the import again is safe.`);
      setProgress('');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-bold text-gray-900">Import from Goodshuffle</h3>
          <button onClick={onClose} disabled={running} className="p-1 text-gray-500 hover:text-gray-800"><X size={20} /></button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4 text-sm">
          {result ? (
            <div className="space-y-2">
              <p className="flex items-center space-x-2 text-green-700 font-semibold"><CheckCircle size={18} /><span>Import finished</span></p>
              <ul className="list-disc ml-5 text-gray-700 space-y-1">
                <li>{result.added} new clients added</li>
                <li>{result.matched} matched to clients you already had{result.filled ? ` (${result.filled} got a missing email or phone)` : ''}</li>
                <li>{result.saved} Goodshuffle projects saved to their clients</li>
                <li>{result.linked} GigStaffPro events linked to their client</li>
              </ul>
            </div>
          ) : !projects ? (
            <div className="space-y-3">
              <p className="text-gray-700">Choose the Goodshuffle import file (<code>goodshuffle-import.json</code>). You'll see what will be added before anything changes.</p>
              <label className="inline-flex items-center space-x-2 bg-red-900 text-white px-4 py-2 rounded-lg hover:bg-red-800 cursor-pointer">
                <Upload size={16} /><span>Choose file</span>
                <input type="file" accept=".json,application/json" className="hidden" onChange={pickFile} />
              </label>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-gray-50 rounded p-3"><p className="text-2xl font-bold">{plan.newClients.length}</p><p className="text-xs text-gray-500">new clients</p></div>
                <div className="bg-gray-50 rounded p-3"><p className="text-2xl font-bold">{plan.matched.length}</p><p className="text-xs text-gray-500">already here</p></div>
                <div className="bg-gray-50 rounded p-3"><p className="text-2xl font-bold">{plan.projectCount}</p><p className="text-xs text-gray-500">projects</p></div>
                <div className="bg-gray-50 rounded p-3"><p className="text-2xl font-bold">{plan.skipped.length}</p><p className="text-xs text-gray-500">empty, skipped</p></div>
              </div>

              <label className="flex items-start space-x-2 text-gray-700">
                <input type="checkbox" className="mt-1" checked={includeQuoteOnly} onChange={e => setIncludeQuoteOnly(e.target.checked)} />
                <span>
                  Include clients who only got a quote and never signed
                  {includeQuoteOnly ? ` (${quoteOnlyNew} of the new ones; they get a "Quote only" tag)` : ` (${plan.leftOut} left out)`}
                </span>
              </label>

              {plan.matched.length > 0 && (
                <div>
                  <p className="font-semibold text-gray-800 mb-1">Matched to clients you already have</p>
                  <p className="text-xs text-gray-500 mb-2">Their Goodshuffle projects are added to the existing client. Only a missing email or phone is filled in; nothing else changes.</p>
                  <div className="border rounded max-h-48 overflow-y-auto divide-y">
                    {plan.matched.map(({ client, group }) => (
                      <div key={`${client.id}-${group.projects[0].project_id}`} className="px-3 py-1.5 flex justify-between">
                        <span>{client.name}{normalizeClientName(group.name) !== normalizeClientName(client.name) ? <span className="text-gray-500"> ← {group.name}</span> : null}</span>
                        <span className="text-gray-500">{group.projects.length} project{group.projects.length === 1 ? '' : 's'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="font-semibold text-gray-800 mb-1">New clients</p>
                <div className="border rounded max-h-48 overflow-y-auto divide-y">
                  {plan.newClients.map(g => (
                    <div key={g.projects[0].project_id} className="px-3 py-1.5 flex justify-between">
                      <span>{g.name}{!g.signed && <span className="ml-2 text-xs text-gray-400">quote only</span>}</span>
                      <span className="text-gray-500">{g.projects.length} project{g.projects.length === 1 ? '' : 's'}</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-xs text-gray-500">Events in GigStaffPro that came from the same Goodshuffle project (pull-sheet import) and have no client yet are linked too. Every change is recorded in the access log.</p>
            </div>
          )}

          {progress && <p className="text-gray-600">{progress}</p>}
          {error && <p className="text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</p>}
        </div>

        <div className="p-4 border-t flex justify-end space-x-2">
          {result ? (
            <button onClick={onClose} className="bg-red-900 text-white px-4 py-2 rounded-lg hover:bg-red-800">Done</button>
          ) : (
            <>
              <button onClick={onClose} disabled={running} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Cancel</button>
              {plan && (
                <button onClick={runImport} disabled={running || (!plan.newClients.length && !plan.matched.length)}
                  className="bg-red-900 text-white px-4 py-2 rounded-lg hover:bg-red-800 disabled:bg-gray-400">
                  {running ? 'Importing…' : `Import ${plan.newClients.length + plan.matched.length} clients`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
