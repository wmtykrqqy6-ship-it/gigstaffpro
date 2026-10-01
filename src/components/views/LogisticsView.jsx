import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Upload, AlertTriangle, Settings as SettingsIcon, ArrowLeft } from 'lucide-react';
import ImportPullSheetModal from '../logistics/ImportPullSheetModal';
import DispatchBoard from '../logistics/DispatchBoard';
import ReturnsPanel from '../logistics/ReturnsPanel';
import TruckSettings from '../logistics/TruckSettings';
import CatalogSettings from '../logistics/CatalogSettings';
import {
  loadTrucks, loadCatalog, loadEventEquipment, isMissingSchemaError, LOGISTICS_MIGRATION
} from '../logistics/logisticsData';

// Logistics: two everyday tabs (Dispatch, Returns) plus a setup screen for
// trucks and the equipment catalog behind the gear button. (Simplified
// 2026-09-30 -- the old per-event "Event Equipment" tab is covered by the
// dispatch board's day summary.)
export default function LogisticsView({
  events = [],
  positions,
  workers,
  assignments = [],
  timeFormat,
  onEventsChanged
}) {
  const [tab, setTab] = useState('dispatch'); // 'dispatch' | 'returns' | 'setup'
  const [setupTab, setSetupTab] = useState('trucks'); // 'trucks' | 'catalog'
  const [trucks, setTrucks] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [showImport, setShowImport] = useState(false);

  // Saved equipment of already-imported events, for the import's re-import diff.
  const importedIds = useMemo(
    () => events.filter(e => e.goodshuffle_invoice).map(e => e.id).join(','),
    [events]
  );

  const reload = useCallback(async () => {
    setLoadError(null);
    try {
      const [t, c, eq] = await Promise.all([
        loadTrucks(),
        loadCatalog(),
        loadEventEquipment(importedIds ? importedIds.split(',') : [])
      ]);
      setTrucks(t);
      setCatalog(c);
      setEquipment(eq);
      setSchemaMissing(false);
    } catch (err) {
      if (isMissingSchemaError(err)) setSchemaMissing(true);
      else setLoadError(err.message || String(err));
    }
  }, [importedIds]);

  useEffect(() => { reload(); }, [reload]);

  const equipmentByEvent = useMemo(() => {
    const map = {};
    for (const row of equipment) (map[row.event_id] ||= []).push(row);
    return map;
  }, [equipment]);

  const handleImported = () => {
    onEventsChanged?.();
    reload();
  };

  const tabButton = (id, label) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
        tab === id ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <h2 className="text-3xl font-bold text-gray-900">Logistics</h2>
          {tab !== 'setup' && (
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              {tabButton('dispatch', 'Dispatch')}
              {tabButton('returns', 'Returns')}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {tab === 'setup' ? (
            <button
              onClick={() => setTab('dispatch')}
              className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm inline-flex items-center gap-1.5"
            >
              <ArrowLeft size={15} /> Back to Dispatch
            </button>
          ) : (
            <button
              onClick={() => setTab('setup')}
              className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm inline-flex items-center gap-1.5 text-gray-700"
              title="Truck capacities and the equipment catalog"
            >
              <SettingsIcon size={15} /> Trucks &amp; Catalog
            </button>
          )}
          <button
            onClick={() => setShowImport(true)}
            disabled={schemaMissing}
            className="bg-red-900 text-white px-4 py-2 rounded-lg hover:bg-red-800 flex items-center gap-2 text-sm disabled:opacity-50"
          >
            <Upload size={16} />
            <span>Import Pull Sheet</span>
          </button>
        </div>
      </div>

      {schemaMissing && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-4 text-sm">
          <div className="font-semibold flex items-center gap-2"><AlertTriangle size={16} /> Logistics database tables not set up yet</div>
          <p className="mt-1">Run <span className="font-mono">supabase/migrations/{LOGISTICS_MIGRATION}</span> in the Supabase SQL editor, then reload.</p>
        </div>
      )}
      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 text-sm">Error loading logistics data: {loadError}</div>
      )}

      {!schemaMissing && tab === 'dispatch' && (
        <DispatchBoard
          events={events}
          trucks={trucks}
          workers={workers}
          assignments={assignments}
          positions={positions}
          timeFormat={timeFormat}
        />
      )}
      {!schemaMissing && tab === 'returns' && <ReturnsPanel events={events} trucks={trucks} workers={workers} />}
      {!schemaMissing && tab === 'setup' && (
        <div className="space-y-4">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
            {[['trucks', 'Trucks'], ['catalog', 'Equipment Catalog']].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setSetupTab(id)}
                className={`px-4 py-2 rounded-md text-sm font-medium ${setupTab === id ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {setupTab === 'trucks'
            ? <TruckSettings trucks={trucks} onChanged={reload} />
            : <CatalogSettings catalog={catalog} positions={positions} onChanged={reload} />}
        </div>
      )}

      <ImportPullSheetModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={handleImported}
        events={events}
        trucks={trucks}
        catalog={catalog}
        equipmentByEvent={equipmentByEvent}
        positions={positions}
        workers={workers}
        assignments={assignments}
        timeFormat={timeFormat}
      />
    </div>
  );
}
