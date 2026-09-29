import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AlertTriangle, CheckCircle, Clock, PackageX, RefreshCw } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { parseDateSafe } from '../../utils/dateHelpers';
import { returnReport } from '../../utils/logistics/fieldViews';
import { TruckSwatch } from './CapacityDisplay';
import {
  loadDispatchRange, loadEventEquipment, loadChecks, saveReturnCheck,
  isMissingSchemaError, FIELD_MIGRATION
} from './logisticsData';

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const LOOKBACK_DAYS = 14;

const STATE_STYLES = {
  missing: { label: 'Missing items', badge: 'bg-red-100 text-red-800', icon: PackageX },
  unchecked: { label: 'Never checked in', badge: 'bg-amber-100 text-amber-800', icon: AlertTriangle },
  pending: { label: 'Pickup pending', badge: 'bg-gray-100 text-gray-700', icon: Clock },
  complete: { label: 'All back', badge: 'bg-green-100 text-green-800', icon: CheckCircle }
};

// Warehouse view of pickups over the last two weeks: anything that came back
// short, or was never checked in, is listed first so the warehouse manager
// can chase it. "Found it" records the item as returned.
export default function ReturnsPanel({ events = [], trucks = [], workers = [] }) {
  const notify = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const today = ymd(new Date());

  const load = useCallback(async () => {
    setError(null);
    try {
      const from = new Date();
      from.setDate(from.getDate() - LOOKBACK_DAYS);
      const day = await loadDispatchRange(ymd(from), today);
      const eventIds = [...new Set([...day.stops.map(s => s.event_id), ...day.allocations.map(a => a.event_id)].filter(Boolean))];
      const [rows, checks] = await Promise.all([loadEventEquipment(eventIds), loadChecks(day.stops.map(s => s.id))]);
      const equipmentByEvent = {};
      for (const r of rows) (equipmentByEvent[r.event_id] ||= []).push(r);
      setData({ day, checks, equipmentByEvent });
    } catch (err) {
      setError(isMissingSchemaError(err) ? `Run ${FIELD_MIGRATION} first.` : err.message || String(err));
    }
  }, [today]);

  useEffect(() => { load(); }, [load]);

  const eventsById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e])), [events]);
  const workersById = useMemo(() => Object.fromEntries(workers.map(w => [w.id, w])), [workers]);
  const trucksById = useMemo(() => Object.fromEntries(trucks.map(t => [t.id, t])), [trucks]);

  const reports = useMemo(() => {
    if (!data) return [];
    const { day, checks, equipmentByEvent } = data;
    const ctx = { loads: day.loads, allocations: day.allocations, equipmentByEvent };
    return day.stops
      .filter(s => s.stop_type === 'pickup')
      .map(stop => {
        const run = day.runs.find(r => r.id === stop.run_id);
        return { run, ...returnReport(stop, ctx, { stops: day.stops, checks, runDate: run?.run_date, today }) };
      })
      .sort((a, b) => (b.run?.run_date || '').localeCompare(a.run?.run_date || ''));
  }, [data, today]);

  const markFound = async (report, lines) => {
    setSaving(true);
    try {
      for (const l of lines) {
        await saveReturnCheck({
          stop_id: report.stopId, item_key: l.key, item_name: l.name, parent_name: l.parentName,
          quantity: l.expected, expected: l.expected
        });
      }
      notify(lines.length === 1 ? `${lines[0].name} marked as returned.` : `${lines.length} items marked as returned.`);
      await load();
    } catch (err) {
      notify('Could not save: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  if (error) return <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-4 text-sm">{error}</div>;
  if (!data) return <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">Loading…</div>;

  const byState = (st) => reports.filter(r => r.state === st);
  const attention = [...byState('missing'), ...byState('unchecked')];

  return (
    <div className={`space-y-4 ${saving ? 'opacity-70 pointer-events-none' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Returns</h3>
          <p className="text-sm text-gray-500 mt-0.5">Pickups from the last {LOOKBACK_DAYS} days, checked against what went out on each truck.</p>
        </div>
        <button onClick={load} className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 inline-flex items-center gap-1.5">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {['missing', 'unchecked', 'pending', 'complete'].map(st => {
          const S = STATE_STYLES[st];
          return <span key={st} className={`text-xs font-medium rounded-full px-2.5 py-1 ${S.badge}`}>{S.label}: {byState(st).length}</span>;
        })}
      </div>

      {reports.length === 0 && (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">No pickups planned in the last {LOOKBACK_DAYS} days.</div>
      )}

      {attention.length === 0 && reports.length > 0 && (
        <div className="flex items-center gap-2 text-sm bg-green-50 border border-green-200 text-green-800 rounded-lg px-3 py-2">
          <CheckCircle size={15} /> Nothing missing.
        </div>
      )}

      {attention.map(report => (
        <ReturnCard key={report.stopId} report={report} event={eventsById[report.eventId]} truck={trucksById[report.run?.truck_id]}
          team={[report.run?.worker1_id, report.run?.worker2_id].map(id => workersById[id]?.name).filter(Boolean)}
          onFound={(lines) => markFound(report, lines)} />
      ))}

      {byState('pending').length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Pickups still to come</h4>
          <div className="bg-white rounded-lg shadow divide-y">
            {byState('pending').map(r => (
              <SummaryRow key={r.stopId} report={r} event={eventsById[r.eventId]} truck={trucksById[r.run?.truck_id]} />
            ))}
          </div>
        </div>
      )}
      {byState('complete').length > 0 && (
        <details className="bg-white rounded-lg shadow">
          <summary className="px-4 py-2 text-sm font-semibold text-gray-700 cursor-pointer">All back ({byState('complete').length})</summary>
          <div className="divide-y border-t">
            {byState('complete').map(r => (
              <SummaryRow key={r.stopId} report={r} event={eventsById[r.eventId]} truck={trucksById[r.run?.truck_id]} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

const dateLabel = (d) => (d ? parseDateSafe(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '');

function SummaryRow({ report, event, truck }) {
  const S = STATE_STYLES[report.state];
  return (
    <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
      <span>
        <span className="font-medium text-gray-900">{event?.name || 'Event'}</span>
        <span className="text-gray-500"> · {dateLabel(report.run?.run_date)}</span>
      </span>
      <span className="flex items-center gap-2">
        {truck && <span className="text-xs text-gray-600 inline-flex items-center gap-1"><TruckSwatch color={truck.color} size={10} />{truck.name}</span>}
        <span className={`text-xs rounded-full px-2 py-0.5 ${S.badge}`}>{S.label}</span>
      </span>
    </div>
  );
}

function ReturnCard({ report, event, truck, team, onFound }) {
  const S = STATE_STYLES[report.state];
  const Icon = S.icon;
  return (
    <div className={`bg-white rounded-lg shadow border-l-4 ${report.state === 'missing' ? 'border-red-600' : 'border-amber-500'}`}>
      <div className="px-4 py-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Icon size={16} className={report.state === 'missing' ? 'text-red-700' : 'text-amber-700'} />
            <span className="font-semibold text-gray-900">{event?.name || 'Event'}</span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap items-center gap-x-2">
            <span>{dateLabel(report.run?.run_date)}</span>
            {truck && <span className="inline-flex items-center gap-1"><TruckSwatch color={truck.color} size={9} />{truck.name}</span>}
            {team.length > 0 && <span>· {team.join(' & ')}</span>}
          </div>
        </div>
        <button onClick={() => onFound(report.missing)} className="text-xs px-2.5 py-1 rounded-lg border border-gray-300 hover:bg-gray-50">
          Mark all found
        </button>
      </div>
      {report.state === 'unchecked' && (
        <p className="px-4 pb-2 text-xs text-amber-800">The crew didn't check anything in at this pickup. Count it at the warehouse.</p>
      )}
      <div className="border-t divide-y">
        {report.missing.map(line => (
          <div key={line.key} className="px-4 py-1.5 flex items-center justify-between gap-2 text-sm">
            <span>
              <span className="font-medium text-gray-900">{line.short}× {line.name}</span>
              {line.parentName && <span className="text-gray-500"> ({line.parentName})</span>}
              <span className="text-xs text-gray-500 ml-2">
                {line.returned == null ? 'not checked' : `${line.returned} of ${line.expected} back`}
              </span>
            </span>
            <button onClick={() => onFound([line])} className="text-xs text-red-900 hover:underline flex-shrink-0">Found it</button>
          </div>
        ))}
      </div>
    </div>
  );
}
