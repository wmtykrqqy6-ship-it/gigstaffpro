import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Truck, MapPin, Navigation, CheckCircle, Circle, ChevronDown, ChevronRight, Minus, Plus, Users } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { parseDateSafe, formatTime } from '../../utils/dateHelpers';
import { getPositionLabel, isAssignmentFilled } from '../../utils/positionHelpers';
import { orderRunStops } from '../../utils/logistics/dispatch';
import { stopItems, groupItems, checkTypeForStop } from '../../utils/logistics/fieldViews';
import { TruckSwatch } from './CapacityDisplay';
import { loadWorkerRoutes, loadEventEquipment, loadChecks, loadTrucks, isMissingSchemaError } from './logisticsData';

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
// Late-night pickups: yesterday's route stays open until 6 AM (matches the server).
const LATE_PICKUP_CUTOFF_HOUR = 6;

const STOP_STYLES = {
  deliver: { label: 'Deliver', badge: 'bg-blue-100 text-blue-800' },
  work: { label: 'Work', badge: 'bg-purple-100 text-purple-800' },
  pickup: { label: 'Pickup', badge: 'bg-orange-100 text-orange-800' },
  warehouse: { label: 'Warehouse', badge: 'bg-gray-100 text-gray-700' }
};

const mapsUrl = (address) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;

// Worker portal "My Route": the setup crew's stops for today (and the next
// week, collapsed), with delivered / returned check-offs. Renders nothing
// for workers who aren't on a truck team, or before the logistics tables
// exist.
export default function CrewRoute({ worker, events = [], workers = [], assignments = [], timeFormat }) {
  const notify = useToast();
  const [data, setData] = useState(null);
  const [equipmentByEvent, setEquipmentByEvent] = useState({});
  const [checks, setChecks] = useState([]);
  const [trucksById, setTrucksById] = useState({});
  const [expanded, setExpanded] = useState({});
  const [saving, setSaving] = useState({});

  const now = new Date();
  const today = ymd(now);
  const yesterday = ymd(addDays(now, -1));
  const canEdit = (runDate) => runDate === today || (runDate === yesterday && now.getHours() < LATE_PICKUP_CUTOFF_HOUR);

  const load = useCallback(async () => {
    if (!worker?.id) return;
    try {
      const n = new Date();
      const { mine, day } = await loadWorkerRoutes(worker.id, ymd(addDays(n, -1)), ymd(addDays(n, 7)));
      if (!mine.length) { setData({ mine, day }); return; }
      const eventIds = [...new Set([...day.stops.map(s => s.event_id), ...day.allocations.map(a => a.event_id)].filter(Boolean))];
      const myStopIds = day.stops.filter(s => mine.some(r => r.id === s.run_id)).map(s => s.id);
      const [rows, checkRows, trucks] = await Promise.all([loadEventEquipment(eventIds), loadChecks(myStopIds), loadTrucks()]);
      const byEvent = {};
      for (const r of rows) (byEvent[r.event_id] ||= []).push(r);
      setEquipmentByEvent(byEvent);
      setChecks(checkRows);
      setTrucksById(Object.fromEntries(trucks.map(t => [t.id, t])));
      setData({ mine, day });
    } catch (err) {
      if (!isMissingSchemaError(err)) console.error('CrewRoute load failed:', err);
      setData({ mine: [], day: null });
    }
  }, [worker?.id]);

  useEffect(() => { load(); }, [load]);

  const eventsById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e])), [events]);
  const workersById = useMemo(() => Object.fromEntries(workers.map(w => [w.id, w])), [workers]);

  if (!data || !data.mine.length) return null;

  const visibleRuns = data.mine
    .filter(r => r.run_date >= today || canEdit(r.run_date))
    .sort((a, b) => a.run_date.localeCompare(b.run_date));
  if (!visibleRuns.length) return null;

  const ctx = { loads: data.day.loads, allocations: data.day.allocations, equipmentByEvent };

  const post = async (body) => {
    const res = await fetch('/api/worker-actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, workerId: worker.id })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json.error || 'Could not save');
    return json;
  };

  const setCheck = async (stop, item, quantity, checked) => {
    const k = `${stop.id}|${item.key}`;
    setSaving(s => ({ ...s, [k]: true }));
    try {
      const json = await post({
        action: 'routeCheck', stopId: stop.id, itemKey: item.key, itemName: item.name,
        parentName: item.parentName, quantity, expected: item.quantity, checked
      });
      const type = checkTypeForStop(stop);
      setChecks(prev => {
        const rest = prev.filter(c => !(c.stop_id === stop.id && c.item_key === item.key && c.check_type === type));
        return checked === false ? rest : [...rest, json.check];
      });
    } catch (err) {
      notify(err.message);
    } finally {
      setSaving(s => ({ ...s, [k]: false }));
    }
  };

  const setStopStatus = async (stop, status) => {
    try {
      await post({ action: 'routeStopStatus', stopId: stop.id, status });
      setData(d => ({ ...d, day: { ...d.day, stops: d.day.stops.map(s => (s.id === stop.id ? { ...s, status } : s)) } }));
    } catch (err) {
      notify(err.message);
    }
  };

  return (
    <div className="space-y-4">
      {visibleRuns.map(run => {
        const truck = trucksById[run.truck_id];
        const teammateId = run.worker1_id === worker.id ? run.worker2_id : run.worker1_id;
        const teammate = workersById[teammateId]?.name;
        const editable = canEdit(run.run_date);
        const isOpen = expanded[run.id] ?? editable;
        const { ordered } = orderRunStops(
          data.day.loads.filter(l => l.run_id === run.id),
          data.day.stops.filter(s => s.run_id === run.id)
        );
        const done = ordered.filter(s => s.status === 'done').length;
        const tripsCount = data.day.loads.filter(l => l.run_id === run.id).length;

        return (
          <div key={run.id} className="bg-white rounded-lg shadow border-l-4 border-red-900">
            <button onClick={() => setExpanded(x => ({ ...x, [run.id]: !isOpen }))} className="w-full text-left p-4 flex items-start gap-3">
              <Truck size={22} className="text-red-900 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-gray-900">
                  {editable ? 'Your route today' : `Your route — ${parseDateSafe(run.run_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`}
                </h3>
                <p className="text-sm text-gray-600 flex flex-wrap items-center gap-x-2">
                  {truck && <span className="inline-flex items-center gap-1"><TruckSwatch color={truck.color} size={10} />{truck.name} truck</span>}
                  {teammate && <span>· with {teammate}</span>}
                  <span>· {ordered.length} stop{ordered.length === 1 ? '' : 's'}{tripsCount > 1 ? `, ${tripsCount} trips` : ''}</span>
                  {editable && ordered.length > 0 && <span>· {done}/{ordered.length} done</span>}
                </p>
              </div>
              {isOpen ? <ChevronDown size={18} className="text-gray-400 mt-1" /> : <ChevronRight size={18} className="text-gray-400 mt-1" />}
            </button>

            {isOpen && (
              <div className="border-t divide-y">
                {!editable && <p className="px-4 py-2 text-xs text-gray-500">Check-offs open on the day of the route.</p>}
                {run.notes && <p className="px-4 py-2 text-sm text-gray-700 bg-yellow-50"><span className="font-semibold">Notes:</span> {run.notes}</p>}
                {ordered.map((stop, idx) => (
                  <RouteStop
                    key={stop.id}
                    number={idx + 1}
                    stop={stop}
                    prevLoadId={idx > 0 ? ordered[idx - 1].load_id : undefined}
                    tripNumber={data.day.loads.find(l => l.id === stop.load_id)?.sequence}
                    event={eventsById[stop.event_id]}
                    items={stopItems(stop, ctx)}
                    checks={checks.filter(c => c.stop_id === stop.id)}
                    myAssignments={assignments.filter(a => a.event_id === stop.event_id && a.worker_id === worker.id && isAssignmentFilled(a.status))}
                    editable={editable}
                    saving={saving}
                    timeFormat={timeFormat}
                    onCheck={(item, qty, checked) => setCheck(stop, item, qty, checked)}
                    onStatus={(status) => setStopStatus(stop, status)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RouteStop({ number, stop, prevLoadId, tripNumber, event, items, checks, myAssignments, editable, saving, timeFormat, onCheck, onStatus }) {
  const type = checkTypeForStop(stop);
  const byKey = new Map(checks.filter(c => c.check_type === type).map(c => [c.item_key, c]));
  const allChecked = items.length > 0 && items.every(i => byKey.has(i.key));
  const isDone = stop.status === 'done';
  const style = STOP_STYLES[stop.stop_type];
  const startsTrip = stop.load_id && stop.load_id !== prevLoadId;

  const itemRow = (item, indent) => {
    const check = byKey.get(item.key);
    const busy = saving[`${stop.id}|${item.key}`];
    const short = check && check.quantity < item.quantity;
    return (
      <div key={item.key} className={`flex items-center gap-2 py-1.5 ${indent ? 'pl-7' : ''}`}>
        <button
          disabled={!editable || busy}
          onClick={() => onCheck(item, item.quantity, check ? false : true)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left disabled:cursor-default"
        >
          {check
            ? <CheckCircle size={22} className={short ? 'text-amber-500 flex-shrink-0' : 'text-green-600 flex-shrink-0'} />
            : <Circle size={22} className="text-gray-300 flex-shrink-0" />}
          <span className={`text-sm ${indent ? 'text-gray-700' : 'font-medium text-gray-900'} ${busy ? 'opacity-50' : ''}`}>
            <span className="tabular-nums">{item.quantity}×</span> {item.name}
          </span>
        </button>
        {check && type === 'returned' && editable && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button disabled={busy || check.quantity <= 0} onClick={() => onCheck(item, check.quantity - 1, true)} className="w-7 h-7 rounded border border-gray-300 flex items-center justify-center disabled:opacity-30"><Minus size={12} /></button>
            <span className={`text-xs w-10 text-center tabular-nums ${short ? 'text-amber-700 font-semibold' : 'text-gray-700'}`}>{check.quantity}/{item.quantity}</span>
            <button disabled={busy || check.quantity >= item.quantity} onClick={() => onCheck(item, check.quantity + 1, true)} className="w-7 h-7 rounded border border-gray-300 flex items-center justify-center disabled:opacity-30"><Plus size={12} /></button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`px-4 py-3 ${isDone ? 'bg-green-50' : ''}`}>
      {startsTrip && tripNumber > 1 && (
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">↺ Back to the warehouse — reload for trip {tripNumber}</div>
      )}
      <div className="flex items-start gap-3">
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${isDone ? 'bg-green-600 text-white' : 'bg-gray-900 text-white'}`}>
          {isDone ? '✓' : number}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[11px] font-semibold uppercase rounded px-1.5 py-0.5 ${style.badge}`}>{style.label}</span>
            <span className="font-semibold text-gray-900">{event?.name || 'Stop'}</span>
          </div>
          <div className="text-sm text-gray-600 mt-0.5">
            {stop.scheduled_start ? formatTime(stop.scheduled_start, timeFormat) : 'Time TBD'}
            {stop.scheduled_end ? ` – ${formatTime(stop.scheduled_end, timeFormat)}` : ''}
            {event?.time && <span className="text-gray-400"> · party {formatTime(event.time, timeFormat)}{event.end_time ? `–${formatTime(event.end_time, timeFormat)}` : ''}</span>}
          </div>
          {event?.address && (
            <a href={mapsUrl(event.address)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-start gap-1 text-sm text-blue-700 hover:underline">
              <MapPin size={14} className="mt-0.5 flex-shrink-0" />
              <span>{event.venue ? `${event.venue}, ` : ''}{event.address}</span>
              <Navigation size={12} className="mt-1 flex-shrink-0" />
            </a>
          )}

          {stop.stop_type === 'work' && (
            <div className="mt-2 text-sm text-purple-900 bg-purple-50 rounded p-2">
              <div className="flex items-center gap-1 font-medium"><Users size={14} /> Dealing this party — the truck stays parked here.</div>
              {myAssignments.map(a => <div key={a.id} className="text-xs mt-0.5">You: {getPositionLabel(a.position)}</div>)}
            </div>
          )}

          {type && items.length > 0 && (
            <div className="mt-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {type === 'delivered' ? 'Check off as you unload' : 'Check off as you load up'}
              </div>
              {groupItems(items).map(item => (
                <div key={item.key}>
                  {itemRow(item, false)}
                  {item.accessories.map(acc => itemRow(acc, true))}
                </div>
              ))}
            </div>
          )}
          {type && items.length === 0 && <p className="text-xs text-gray-500 mt-1">No gear list for this stop.</p>}

          {editable && (
            <div className="mt-2">
              {isDone ? (
                <button onClick={() => onStatus('planned')} className="text-xs text-gray-500 underline">Undo done</button>
              ) : (
                <button
                  onClick={() => onStatus('done')}
                  className={`text-sm px-3 py-1.5 rounded-lg ${allChecked || !type ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-white border border-gray-300 text-gray-700'}`}
                >
                  Mark stop done{type && !allChecked && items.length ? ' (items unchecked)' : ''}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
