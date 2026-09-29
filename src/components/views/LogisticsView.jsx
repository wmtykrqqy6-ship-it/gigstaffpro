import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Upload, Truck, Package, ChevronDown, ChevronRight, MapPin, Clock, AlertTriangle, Search } from 'lucide-react';
import { parseDateSafe, formatTime } from '../../utils/dateHelpers';
import { checkAllTrucks, summarizeEquipment } from '../../utils/logistics/capacity';
import { groupEquipment } from '../../utils/logistics/importMatch';
import { FitsOnBadges, CapacityBreakdown, equipmentSummaryText } from '../logistics/CapacityDisplay';
import ImportPullSheetModal from '../logistics/ImportPullSheetModal';
import DispatchBoard from '../logistics/DispatchBoard';
import ReturnsPanel from '../logistics/ReturnsPanel';
import TruckSettings from '../logistics/TruckSettings';
import CatalogSettings from '../logistics/CatalogSettings';
import {
  loadTrucks, loadCatalog, loadEventEquipment, isMissingSchemaError, LOGISTICS_MIGRATION
} from '../logistics/logisticsData';

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatDayHeader = (date) =>
  parseDateSafe(date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

export default function LogisticsView({
  events = [],
  positions,
  workers,
  assignments = [],
  timeFormat,
  activeLocation = 'all',
  onEventsChanged
}) {
  const [tab, setTab] = useState('dispatch');
  const [trucks, setTrucks] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [search, setSearch] = useState('');

  const upcoming = useMemo(() => {
    const today = todayStr();
    return events
      .filter(e => (activeLocation === 'all' || e.location_id === activeLocation))
      .filter(e => e.status !== 'archived' && e.status !== 'cancelled')
      .filter(e => (e.date || '').split('T')[0] >= today)
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''));
  }, [events, activeLocation]);

  const upcomingIds = useMemo(() => upcoming.map(e => e.id).join(','), [upcoming]);

  const reload = useCallback(async () => {
    setLoadError(null);
    try {
      const [t, c, eq] = await Promise.all([
        loadTrucks(),
        loadCatalog(),
        loadEventEquipment(upcomingIds ? upcomingIds.split(',') : [])
      ]);
      setTrucks(t);
      setCatalog(c);
      setEquipment(eq);
      setSchemaMissing(false);
    } catch (err) {
      if (isMissingSchemaError(err)) setSchemaMissing(true);
      else setLoadError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [upcomingIds]);

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

  const filtered = search.trim()
    ? upcoming.filter(e => `${e.name} ${e.client} ${e.venue} ${e.goodshuffle_invoice || ''}`.toLowerCase().includes(search.trim().toLowerCase()))
    : upcoming;

  const byDate = useMemo(() => {
    const groups = [];
    for (const ev of filtered) {
      const d = (ev.date || '').split('T')[0];
      const last = groups[groups.length - 1];
      if (last && last.date === d) last.events.push(ev);
      else groups.push({ date: d, events: [ev] });
    }
    return groups;
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Logistics</h2>
          <p className="text-sm text-gray-600 mt-1">Pull sheets, equipment, and which truck each event fits on</p>
        </div>
        <button
          onClick={() => setShowImport(true)}
          disabled={schemaMissing}
          className="bg-red-900 text-white px-4 py-2 rounded-lg hover:bg-red-800 flex items-center space-x-2 text-sm disabled:opacity-50"
        >
          <Upload size={16} />
          <span>Import Pull Sheet</span>
        </button>
      </div>

      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-full overflow-x-auto">
        {[
          { id: 'dispatch', label: '🗓️ Dispatch' },
          { id: 'events', label: '📦 Event Equipment' },
          { id: 'returns', label: '↩️ Returns' },
          { id: 'trucks', label: '🚚 Trucks' },
          { id: 'catalog', label: '🏷️ Catalog' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t.id ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
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

      {!schemaMissing && tab === 'events' && (
        <div className="space-y-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search events, clients, invoice #…"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
            />
          </div>

          {loading ? (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">Loading…</div>
          ) : byDate.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <Package size={48} className="mx-auto text-gray-300 mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No upcoming events</h3>
              <p className="text-gray-600">Import a Goodshuffle pull sheet to create one.</p>
            </div>
          ) : (
            byDate.map(group => (
              <div key={group.date}>
                <div className="flex items-baseline gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">{formatDayHeader(group.date)}</h3>
                  <span className="text-xs text-gray-500">{group.events.length} event{group.events.length === 1 ? '' : 's'}</span>
                </div>
                <div className="bg-white rounded-lg shadow divide-y">
                  {group.events.map(ev => (
                    <EventEquipmentRow
                      key={ev.id}
                      event={ev}
                      rows={equipmentByEvent[ev.id] || []}
                      trucks={trucks}
                      timeFormat={timeFormat}
                      expanded={!!expanded[ev.id]}
                      onToggle={() => setExpanded(x => ({ ...x, [ev.id]: !x[ev.id] }))}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {!schemaMissing && tab === 'dispatch' && (
        <DispatchBoard
          events={events}
          trucks={trucks}
          workers={workers}
          assignments={assignments}
          timeFormat={timeFormat}
          activeLocation={activeLocation}
        />
      )}
      {!schemaMissing && tab === 'returns' && <ReturnsPanel events={events} trucks={trucks} workers={workers} />}
      {!schemaMissing && tab === 'trucks' && <TruckSettings trucks={trucks} onChanged={reload} />}
      {!schemaMissing && tab === 'catalog' && <CatalogSettings catalog={catalog} onChanged={reload} />}

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
        timeFormat={timeFormat}
      />
    </div>
  );
}

function EventEquipmentRow({ event, rows, trucks, timeFormat, expanded, onToggle }) {
  const counts = useMemo(() => summarizeEquipment(rows), [rows]);
  const fit = useMemo(() => checkAllTrucks(trucks, counts), [trucks, counts]);
  const grouped = useMemo(() => groupEquipment(rows), [rows]);
  const hasEquipment = rows.length > 0;
  const decor = grouped.filter(g => g.size_class === 'decor' || g.size_class === 'archway');

  return (
    <div className="p-4">
      <button onClick={onToggle} className="w-full text-left" disabled={!hasEquipment}>
        <div className="flex items-start gap-2">
          <span className="mt-1 text-gray-400 flex-shrink-0">
            {hasEquipment ? (expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : <span className="inline-block w-4" />}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-gray-900">{event.name}</span>
              {event.goodshuffle_invoice ? (
                <span className="text-xs font-mono bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">#{event.goodshuffle_invoice}</span>
              ) : (
                <span className="text-xs bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">No pull sheet</span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 mt-0.5">
              <span className="flex items-center gap-1"><Clock size={12} />{formatTime(event.time, timeFormat)}{event.end_time ? ` – ${formatTime(event.end_time, timeFormat)}` : ''}</span>
              {(event.address || event.venue) && (
                <span className="flex items-center gap-1 min-w-0"><MapPin size={12} className="flex-shrink-0" /><span className="truncate">{event.address || event.venue}</span></span>
              )}
              {event.delivery_type && <span>{event.delivery_type}</span>}
            </div>
            {hasEquipment && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-2">
                <span className="text-sm text-gray-700">{equipmentSummaryText(counts)}</span>
                <div className="flex flex-wrap items-center gap-2">
                  {trucks.length > 0 && <FitsOnBadges results={fit.results} suggestion={fit.suggestion} />}
                  {trucks.length > 0 && (
                    fit.suggestion ? (
                      <span className="text-xs text-gray-600 flex items-center gap-1">
                        <Truck size={12} /> Suggested: <strong>{fit.suggestion.truck.name}</strong>
                        {fit.suggestion.status === 'yellow' && <span className="text-yellow-700">(with warnings)</span>}
                      </span>
                    ) : (
                      <span className="text-xs text-red-700 font-medium">Needs more than one truck</span>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </button>

      {expanded && hasEquipment && (
        <div className="mt-3 ml-6 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {fit.results.map(r => <CapacityBreakdown key={r.truck.id} result={r} />)}
          </div>
          <div className="border border-gray-200 rounded-lg divide-y text-sm">
            {grouped.map(item => (
              <div key={item.id || item.line_no} className="px-3 py-1.5">
                <div className="flex justify-between">
                  <span><span className="font-medium mr-2">{item.quantity}×</span>{item.item_name}</span>
                  <span className="text-xs text-gray-400">{item.size_class}</span>
                </div>
                {item.accessories.length > 0 && (
                  <div className="text-xs text-gray-500 pl-6 mt-0.5">
                    {item.accessories.map(a => `${a.quantity}× ${a.item_name}`).join(' · ')}
                  </div>
                )}
              </div>
            ))}
          </div>
          {decor.length > 0 && (
            <p className="text-xs text-gray-500">
              Decor has no capacity cost; the archway only fits on trucks marked "can carry archway".
            </p>
          )}
        </div>
      )}
    </div>
  );
}
