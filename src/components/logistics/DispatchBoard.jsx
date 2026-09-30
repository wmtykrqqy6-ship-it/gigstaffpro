import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Trash2, ArrowUp, ArrowDown, X,
  AlertTriangle, XCircle, CheckCircle, Warehouse, Users, Minus, Printer
} from 'lucide-react';
import LoadSheet from './LoadSheet';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import { parseDateSafe, formatTime } from '../../utils/dateHelpers';
import { getPositionLabel, isAssignmentFilled } from '../../utils/positionHelpers';
import {
  ALLOCATABLE_CLASSES, CLASS_LABELS, requiredCounts, allocatedCounts, allocationStatus,
  formatCounts, checkLoad, computeDayConflicts, dealingShifts, orderRunStops,
  sequenceChanges, moveStop, planAddEventToLoad, crewRoles, isDriver, isSetUp, eligibleForSpot, SPOT_FOR_FIELD
} from '../../utils/logistics/dispatch';
import { STATUS_STYLES, TruckSwatch, ZoneBar } from './CapacityDisplay';
import {
  loadDispatchDay, loadEventEquipment, createRun, updateRun, deleteRun, addLoad, deleteLoad,
  setAllocation, insertAllocations, deleteAllocationsFor, insertStops, updateStop, deleteStops,
  resequenceStops, isMissingSchemaError, DISPATCH_MIGRATION
} from './logisticsData';

const dateOnly = (d) => (d ? String(d).split('T')[0] : '');
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shiftDate = (date, days) => { const d = parseDateSafe(date); d.setDate(d.getDate() + days); return ymd(d); };

const STOP_STYLES = {
  deliver: { label: 'Deliver', badge: 'bg-blue-100 text-blue-800' },
  work: { label: 'Work', badge: 'bg-purple-100 text-purple-800' },
  pickup: { label: 'Pickup', badge: 'bg-orange-100 text-orange-800' },
  warehouse: { label: 'Warehouse', badge: 'bg-gray-100 text-gray-700' }
};

const EMPTY_DAY = { runs: [], loads: [], allocations: [], stops: [] };

// Every truck runs out of the Milwaukee warehouse and serves every market,
// so the board always shows all markets' events (it deliberately ignores
// the app's market switcher -- a Madison event hidden by the switcher could
// otherwise go unplanned without a "no truck" warning).
export default function DispatchBoard({ events = [], trucks = [], workers = [], assignments = [], positions = [], timeFormat }) {
  const notify = useToast();
  const confirm = useConfirm();

  const schedulable = useMemo(
    () => events.filter(e => e.status !== 'cancelled'),
    [events]
  );

  // Default to the next day (today or later) that has events.
  const [date, setDate] = useState(() => {
    const today = ymd(new Date());
    const next = schedulable.map(e => dateOnly(e.date)).filter(d => d >= today).sort()[0];
    return next || today;
  });
  const [day, setDay] = useState(EMPTY_DAY);
  const [equipmentByEvent, setEquipmentByEvent] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [sheetLoadIds, setSheetLoadIds] = useState(null); // load ids shown in the load sheet overlay

  const dayEvents = useMemo(
    () => schedulable.filter(e => dateOnly(e.date) === date).sort((a, b) => (a.time || '').localeCompare(b.time || '')),
    [schedulable, date]
  );
  const dayEventIds = dayEvents.map(e => e.id).join(',');
  const eventsById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e])), [events]);
  const workersById = useMemo(() => Object.fromEntries(workers.map(w => [w.id, w])), [workers]);
  const trucksById = useMemo(() => Object.fromEntries(trucks.map(t => [t.id, t])), [trucks]);
  const activeTrucks = useMemo(
    () => trucks.filter(t => t.active !== false).sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99)),
    [trucks]
  );

  // Fetch the day; if any run's stop sequence numbers drifted from the
  // board's order (trips, then evening), persist the normalized order.
  const reload = useCallback(async () => {
    setLoadError(null);
    try {
      let data = await loadDispatchDay(date);
      const changes = data.runs.flatMap(run =>
        sequenceChanges(orderRunStops(
          data.loads.filter(l => l.run_id === run.id),
          data.stops.filter(s => s.run_id === run.id)
        ).ordered)
      );
      if (changes.length) {
        await resequenceStops(changes);
        data = await loadDispatchDay(date);
      }
      const ids = dayEventIds ? dayEventIds.split(',') : [];
      const rows = await loadEventEquipment(ids);
      const byEvent = {};
      for (const r of rows) (byEvent[r.event_id] ||= []).push(r);
      setDay(data);
      setEquipmentByEvent(byEvent);
      setSchemaMissing(false);
    } catch (err) {
      if (isMissingSchemaError(err)) setSchemaMissing(true);
      else setLoadError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [date, dayEventIds]);

  useEffect(() => { reload(); }, [reload]);

  // Run a mutation, then refresh the whole day from the database.
  const act = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      notify(isMissingSchemaError(err) ? `Run ${DISPATCH_MIGRATION} first.` : 'Could not save: ' + (err.message || err));
    } finally {
      await reload();
      setBusy(false);
    }
  };

  const conflicts = useMemo(() => computeDayConflicts({
    date,
    events: dayEvents,
    allEventsById: eventsById,
    equipmentByEvent,
    trucks,
    runs: day.runs,
    loads: day.loads,
    allocations: day.allocations,
    stops: day.stops,
    assignments,
    workersById,
    positions
  }), [date, dayEvents, eventsById, equipmentByEvent, trucks, day, assignments, workersById, positions]);

  // ---- actions ----
  const handleAddEventToLoad = (run, load, eventId) => act(async () => {
    const event = eventsById[eventId];
    const plan = planAddEventToLoad({
      event, load, run, date,
      equipmentRows: equipmentByEvent[eventId] || [],
      dayAllocations: day.allocations,
      runStops: day.stops.filter(s => s.run_id === run.id),
      assignments,
      eventsById
    });
    await insertAllocations(plan.allocations);
    await insertStops(plan.stops);
  });

  const handleRemoveEventFromLoad = async (run, load, eventId) => {
    const ev = eventsById[eventId];
    if (!(await confirm(`Take ${ev?.name || 'this event'} off ${trucksById[run.truck_id]?.name || 'this truck'} trip ${load.sequence}?`))) return;
    act(async () => {
      await deleteAllocationsFor(load.id, eventId);
      const runLoadIds = day.loads.filter(l => l.run_id === run.id && l.id !== load.id).map(l => l.id);
      const stillOnRun = day.allocations.some(a => a.event_id === eventId && runLoadIds.includes(a.load_id)) ||
        day.stops.some(s => s.run_id === run.id && s.event_id === eventId && s.stop_type === 'deliver' && s.load_id !== load.id);
      const toDelete = day.stops.filter(s =>
        s.run_id === run.id && s.event_id === eventId &&
        ((s.stop_type === 'deliver' && s.load_id === load.id) || (!stillOnRun && s.stop_type !== 'deliver'))
      );
      await deleteStops(toDelete.map(s => s.id));
    });
  };

  const handleMoveStop = (run, stopId, dir) => act(async () => {
    const ordered = moveStop(
      day.loads.filter(l => l.run_id === run.id),
      day.stops.filter(s => s.run_id === run.id),
      stopId, dir
    );
    await resequenceStops(sequenceChanges(ordered));
  });

  const handleAddEveningStop = (run, type, eventId) => act(async () => {
    const ev = eventsById[eventId];
    const maxSeq = day.stops.filter(s => s.run_id === run.id).reduce((m, s) => Math.max(m, s.sequence || 0), 0);
    await insertStops([{
      run_id: run.id, load_id: null, event_id: eventId, stop_type: type, sequence: maxSeq + 1,
      scheduled_start: type === 'work' ? ev.time || null : ev.end_time || null,
      scheduled_end: type === 'work' ? ev.end_time || null : null
    }]);
  });

  const handleDeleteRun = async (run) => {
    if (!(await confirm(`Clear the whole ${trucksById[run.truck_id]?.name || ''} plan for this day? Its trips, loaded tables and stops will be removed.`))) return;
    act(() => deleteRun(run.id));
  };

  const handleDeleteTrip = async (load) => {
    if (!(await confirm(`Remove trip ${load.sequence} and everything loaded on it?`))) return;
    act(() => deleteLoad(load.id));
  };

  // Trips in truck-priority then trip order, for "All load sheets".
  const sheetOrder = activeTrucks.flatMap(t => {
    const run = day.runs.find(r => r.truck_id === t.id);
    return run ? day.loads.filter(l => l.run_id === run.id).sort((a, b) => a.sequence - b.sequence) : [];
  });
  const sheets = (sheetLoadIds || []).map(id => {
    const load = day.loads.find(l => l.id === id);
    const run = load && day.runs.find(r => r.id === load.run_id);
    const truck = run && trucksById[run.truck_id];
    return load && run && truck ? { load, run, truck } : null;
  }).filter(Boolean);

  if (schemaMissing) {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-4 text-sm">
        <div className="font-semibold flex items-center gap-2"><AlertTriangle size={16} /> Dispatch tables not set up yet</div>
        <p className="mt-1">Run <span className="font-mono">supabase/migrations/{DISPATCH_MIGRATION}</span> in the Supabase SQL editor, then reload.</p>
      </div>
    );
  }

  const errors = conflicts.filter(c => c.level === 'error');
  const warnings = conflicts.filter(c => c.level === 'warning');

  return (
    <div className={`space-y-4 ${busy ? 'opacity-70 pointer-events-none' : ''}`}>
      {/* Date bar */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setDate(d => shiftDate(d, -1))} className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50" title="Previous day">
          <ChevronLeft size={16} />
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
        />
        <button onClick={() => setDate(d => shiftDate(d, 1))} className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50" title="Next day">
          <ChevronRight size={16} />
        </button>
        <span className="text-sm font-semibold text-gray-900 ml-1">
          {parseDateSafe(date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </span>
        <span className="text-xs text-gray-500">· {dayEvents.length} event{dayEvents.length === 1 ? '' : 's'}</span>
        {day.loads.length > 0 && (
          <button
            onClick={() => setSheetLoadIds(sheetOrder.map(l => l.id))}
            className="ml-auto text-sm px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 inline-flex items-center gap-1.5"
          >
            <Printer size={14} /> All load sheets
          </button>
        )}
      </div>

      {loadError && <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">Error loading the day: {loadError}</div>}

      {/* Day's events and whether they're on a truck */}
      {dayEvents.length > 0 && (
        <div className="bg-white rounded-lg shadow divide-y">
          {dayEvents.map(ev => {
            const rows = equipmentByEvent[ev.id] || [];
            const required = requiredCounts(rows);
            const status = allocationStatus(required, allocatedCounts(day.allocations, ev.id));
            const needs = ALLOCATABLE_CLASSES.some(c => required[c] > 0);
            const trucksOn = [...new Set(day.allocations
              .filter(a => a.event_id === ev.id && a.quantity > 0)
              .map(a => day.loads.find(l => l.id === a.load_id)?.run_id)
              .map(runId => trucksById[day.runs.find(r => r.id === runId)?.truck_id])
              .filter(Boolean))];
            let chip;
            if (!rows.length) chip = <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">No pull sheet</span>;
            else if (status.complete) chip = <span className="text-xs bg-green-100 text-green-800 rounded-full px-2 py-0.5 inline-flex items-center gap-1"><CheckCircle size={12} /> On trucks</span>;
            else if (!status.anyAllocated) chip = <span className="text-xs bg-red-100 text-red-800 rounded-full px-2 py-0.5">No truck</span>;
            else chip = (
              <span className="text-xs bg-yellow-100 text-yellow-800 rounded-full px-2 py-0.5">
                {Object.keys(status.remaining).length ? `${formatCounts(status.remaining)} not loaded` : `${formatCounts(status.over)} extra`}
              </span>
            );
            return (
              <div key={ev.id} className="px-4 py-2 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-medium text-gray-900">{ev.name}</span>
                  <span className="text-xs text-gray-500 ml-2">
                    {formatTime(ev.time, timeFormat)}{ev.end_time ? `–${formatTime(ev.end_time, timeFormat)}` : ''}
                    {needs ? ` · ${formatCounts(required)}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {trucksOn.map(t => (
                    <span key={t.id} className="text-xs text-gray-600 inline-flex items-center gap-1"><TruckSwatch color={t.color} size={10} />{t.name}</span>
                  ))}
                  {chip}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Conflicts */}
      {conflicts.length > 0 && (
        <div className="space-y-1">
          {errors.map((c, i) => (
            <div key={'e' + i} className="flex items-start gap-2 text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2">
              <XCircle size={15} className="mt-0.5 flex-shrink-0" /> {c.message}
            </div>
          ))}
          {warnings.map((c, i) => (
            <div key={'w' + i} className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2">
              <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" /> {c.message}
            </div>
          ))}
        </div>
      )}
      {!loading && dayEvents.length > 0 && conflicts.length === 0 && day.runs.length > 0 && (
        <div className="flex items-center gap-2 text-sm bg-green-50 border border-green-200 text-green-800 rounded-lg px-3 py-2">
          <CheckCircle size={15} /> Everything is on a truck with no conflicts.
        </div>
      )}

      {/* Truck columns */}
      {loading ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">Loading…</div>
      ) : activeTrucks.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">No active trucks — add them under the Trucks tab.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {activeTrucks.map(truck => {
            const run = day.runs.find(r => r.truck_id === truck.id);
            return (
              <TruckColumn
                key={truck.id}
                truck={truck}
                run={run}
                date={date}
                day={day}
                dayEvents={dayEvents}
                eventsById={eventsById}
                equipmentByEvent={equipmentByEvent}
                workers={workers}
                positions={positions}
                workersById={workersById}
                assignments={assignments}
                conflicts={conflicts}
                timeFormat={timeFormat}
                onCreateRun={() => act(() => createRun(date, truck.id))}
                onDeleteRun={() => handleDeleteRun(run)}
                onUpdateRun={(patch) => act(() => updateRun(run.id, patch))}
                onAddTrip={() => act(() => addLoad(run.id, Math.max(0, ...day.loads.filter(l => l.run_id === run.id).map(l => l.sequence)) + 1))}
                onDeleteTrip={handleDeleteTrip}
                onAddEvent={(load, eventId) => handleAddEventToLoad(run, load, eventId)}
                onRemoveEvent={(load, eventId) => handleRemoveEventFromLoad(run, load, eventId)}
                onSetAllocation={(load, eventId, cls, qty) => act(() => setAllocation(load.id, eventId, cls, qty))}
                onUpdateStop={(stop, patch) => act(() => updateStop(stop.id, patch))}
                onDeleteStop={(stop) => act(() => deleteStops([stop.id]))}
                onMoveStop={(stopId, dir) => handleMoveStop(run, stopId, dir)}
                onAddEveningStop={(type, eventId) => handleAddEveningStop(run, type, eventId)}
                onOpenLoadSheet={(load) => setSheetLoadIds([load.id])}
              />
            );
          })}
        </div>
      )}

      <LoadSheet
        open={!!sheetLoadIds}
        onClose={() => setSheetLoadIds(null)}
        date={date}
        sheets={sheets}
        ctx={{ loads: day.loads, allocations: day.allocations, equipmentByEvent }}
        stops={day.stops}
        eventsById={eventsById}
        workersById={workersById}
        timeFormat={timeFormat}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function TruckColumn({
  truck, run, date, day, dayEvents, eventsById, equipmentByEvent, workers, positions, workersById, assignments,
  conflicts, timeFormat, onCreateRun, onDeleteRun, onUpdateRun, onAddTrip, onDeleteTrip, onAddEvent,
  onRemoveEvent, onSetAllocation, onUpdateStop, onDeleteStop, onMoveStop, onAddEveningStop, onOpenLoadSheet
}) {
  const [notes, setNotes] = useState(run?.notes || '');
  useEffect(() => setNotes(run?.notes || ''), [run?.notes]);

  const header = (
    <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
      <div className="flex items-center gap-2 font-semibold text-gray-900">
        <TruckSwatch color={truck.color} size={16} />
        {truck.name}
      </div>
      {run && (
        <button onClick={onDeleteRun} className="text-gray-400 hover:text-red-700 p-1" title="Clear this truck's plan">
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );

  if (!run) {
    return (
      <div className="bg-white rounded-lg shadow">
        {header}
        <div className="p-6 text-center">
          <p className="text-sm text-gray-500 mb-3">Not planned for this day.</p>
          <button onClick={onCreateRun} className="bg-red-900 text-white px-4 py-2 rounded-lg hover:bg-red-800 text-sm inline-flex items-center gap-1.5">
            <Plus size={15} /> Plan {truck.name}
          </button>
        </div>
      </div>
    );
  }

  const runLoads = day.loads.filter(l => l.run_id === run.id);
  const runStops = day.stops.filter(s => s.run_id === run.id);
  const { trips, evening } = orderRunStops(runLoads, runStops);
  const conflictFor = (pred) => conflicts.filter(pred);

  // Workers dealing today, for the team pickers.
  const dealingToday = {};
  for (const s of dealingShifts(workers.map(w => w.id), assignments, eventsById, date)) {
    (dealingToday[s.workerId] ||= []).push(eventsById[s.eventId]?.name);
  }
  const otherRunWorkers = new Set(day.runs.filter(r => r.id !== run.id).flatMap(r => [r.worker1_id, r.worker2_id]).filter(Boolean));
  // Driver spot: Set Up Drivers only. Set Up spot: Set Up or Set Up Driver.
  // (Only once a driver position exists in Settings -> Positions.) Someone
  // already in a spot who doesn't qualify stays listed so they aren't
  // silently dropped -- the board warns about them instead.
  const roles = crewRoles(positions);
  const byName = (a, b) => (a.name || '').localeCompare(b.name || '');
  const qualifies = (w, spot) => (spot === 'driver' ? isDriver(w, roles) : isSetUp(w, roles));
  const driverCount = eligibleForSpot(workers, positions, 'driver').length;

  const workerSelect = (field, otherField) => {
    const spot = SPOT_FOR_FIELD[field];
    const current = workersById[run[field]];
    const options = eligibleForSpot(workers, positions, spot).filter(w => w.id !== run[otherField]).sort(byName);
    if (current && !options.some(w => w.id === current.id)) options.unshift(current);
    return (
      <select
        value={run[field] || ''}
        onChange={(e) => onUpdateRun({ [field]: e.target.value || null })}
        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
      >
        <option value="">— Select —</option>
        {options.map(w => (
          <option key={w.id} value={w.id}>
            {w.name}
            {roles.active && !qualifies(w, spot) ? (spot === 'driver' ? ' (not a Set Up Driver)' : ' (not Set Up)') : ''}
            {otherRunWorkers.has(w.id) ? ' (on another truck)' : ''}
            {dealingToday[w.id] ? ` (dealing ${dealingToday[w.id].join(', ')})` : ''}
          </option>
        ))}
      </select>
    );
  };

  const stopRow = (stop, sectionStops) => {
    const ev = eventsById[stop.event_id];
    const idx = sectionStops.findIndex(s => s.id === stop.id);
    const stopConflicts = conflictFor(c => c.stopId === stop.id);
    const teamOnEvent = stop.stop_type === 'work'
      ? assignments.filter(a => a.event_id === stop.event_id && isAssignmentFilled(a.status) && [run.worker1_id, run.worker2_id].includes(a.worker_id))
      : [];
    return (
      <div key={stop.id} className={`px-3 py-2 ${stopConflicts.some(c => c.level === 'error') ? 'bg-red-50' : stopConflicts.length ? 'bg-amber-50' : ''}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className={`text-[11px] font-semibold uppercase rounded px-1.5 py-0.5 mr-1.5 ${STOP_STYLES[stop.stop_type].badge}`}>
              {STOP_STYLES[stop.stop_type].label}
            </span>
            <span className="text-sm font-medium text-gray-900">{ev?.name || 'Warehouse'}</span>
            {ev?.address && <div className="text-xs text-gray-500 truncate">{ev.address}</div>}
            {teamOnEvent.map(a => (
              <div key={a.id} className="text-xs text-purple-800 flex items-center gap-1">
                <Users size={11} /> {workersById[a.worker_id]?.name} — {getPositionLabel(a.position)}
              </div>
            ))}
          </div>
          <div className="flex items-center flex-shrink-0">
            <button disabled={idx <= 0} onClick={() => onMoveStop(stop.id, -1)} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" title="Move up"><ArrowUp size={14} /></button>
            <button disabled={idx >= sectionStops.length - 1} onClick={() => onMoveStop(stop.id, 1)} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" title="Move down"><ArrowDown size={14} /></button>
            {stop.stop_type !== 'deliver' && (
              <button onClick={() => onDeleteStop(stop)} className="p-1 text-gray-400 hover:text-red-700" title="Remove stop"><X size={14} /></button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <TimeInput value={stop.scheduled_start} onSave={(v) => onUpdateStop(stop, { scheduled_start: v })} />
          <span className="text-xs text-gray-400">to</span>
          <TimeInput value={stop.scheduled_end} onSave={(v) => onUpdateStop(stop, { scheduled_end: v })} />
          {ev?.time && (
            <span className="text-[11px] text-gray-400 ml-1 whitespace-nowrap">
              party {formatTime(ev.time, timeFormat)}{ev.end_time ? `–${formatTime(ev.end_time, timeFormat)}` : ''}
            </span>
          )}
        </div>
        {stopConflicts.map((c, i) => (
          <div key={i} className={`text-xs mt-1 ${c.level === 'error' ? 'text-red-700' : 'text-amber-800'}`}>• {c.message}</div>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow">
      {header}

      {/* Team */}
      <div className="px-4 py-3 border-b">
        <div className="text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1"><Users size={13} /> Setup team</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[11px] text-gray-500 mb-0.5">Driver</div>
            {workerSelect('worker1_id', 'worker2_id')}
          </div>
          <div>
            <div className="text-[11px] text-gray-500 mb-0.5">Set Up</div>
            {workerSelect('worker2_id', 'worker1_id')}
          </div>
        </div>
        {!roles.active && (
          <p className="text-[11px] text-gray-500 mt-1">
            Showing everyone. Add a <strong>Set Up Driver</strong> position in Settings → Positions and tick it on your drivers to limit these lists.
          </p>
        )}
        {roles.active && driverCount === 0 && (
          <p className="text-[11px] text-amber-700 mt-1">No Set Up Drivers yet — tick “Set Up Driver” on workers in Staff → Edit.</p>
        )}
      </div>

      {/* Trips */}
      {trips.map(({ load, stops }) => {
        const loadAllocs = day.allocations.filter(a => a.load_id === load.id);
        const result = checkLoad(truck, loadAllocs);
        const style = STATUS_STYLES[result.status];
        const eventIdsOnLoad = [...new Set([...loadAllocs.map(a => a.event_id), ...stops.map(s => s.event_id)])];
        const addable = dayEvents.filter(e => !eventIdsOnLoad.includes(e.id));
        return (
          <div key={load.id} className="border-b">
            <div className="px-4 pt-3 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <Warehouse size={14} className="text-gray-500" />
                Trip {load.sequence}{load.sequence > 1 ? ' (reload)' : ''}
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => onOpenLoadSheet(load)} className="p-1 text-gray-400 hover:text-gray-700" title="Load sheet"><Printer size={14} /></button>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${style.badge}`}>{style.label}</span>
                {load.sequence > 1 && (
                  <button onClick={() => onDeleteTrip(load)} className="p-1 text-gray-400 hover:text-red-700" title="Remove trip"><Trash2 size={13} /></button>
                )}
              </div>
            </div>

            <div className="px-4 py-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
              <ZoneBar label="Craps zone" used={result.zones.craps.used} capacity={result.zones.craps.capacity} stretch={result.zones.craps.stretch} />
              <ZoneBar label="Blackjack" used={result.zones.blackjack.used} capacity={result.zones.blackjack.capacity} />
              <ZoneBar label="Roulette" used={result.zones.roulette.used} capacity={result.zones.roulette.capacity} />
              <ZoneBar label="Poker" used={result.zones.poker.used} capacity={result.zones.poker.capacity} />
            </div>
            {result.reasons.map(r => (
              <div key={r} className={`px-4 text-xs ${result.status === 'red' ? 'text-red-700' : 'text-yellow-800'}`}>• {r}</div>
            ))}

            {/* What's loaded, per event */}
            <div className="px-4 py-2 space-y-2">
              {eventIdsOnLoad.map(eventId => (
                <LoadedEvent
                  key={eventId}
                  event={eventsById[eventId]}
                  allocations={loadAllocs.filter(a => a.event_id === eventId)}
                  required={requiredCounts(equipmentByEvent[eventId] || [])}
                  allocatedEverywhere={allocatedCounts(day.allocations, eventId)}
                  onSet={(cls, qty) => onSetAllocation(load, eventId, cls, qty)}
                  onRemove={() => onRemoveEvent(load, eventId)}
                />
              ))}
              {addable.length > 0 && (
                <select
                  value=""
                  onChange={(e) => e.target.value && onAddEvent(load, e.target.value)}
                  className="w-full px-2 py-1.5 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 focus:ring-2 focus:ring-red-500"
                >
                  <option value="">+ Load an event onto this trip…</option>
                  {addable.map(e => {
                    const st = allocationStatus(requiredCounts(equipmentByEvent[e.id] || []), allocatedCounts(day.allocations, e.id));
                    return (
                      <option key={e.id} value={e.id}>
                        {e.name}{st.complete ? ' (already on trucks — split)' : Object.keys(st.remaining).length && st.anyAllocated ? ` (${formatCounts(st.remaining)} left)` : ''}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>

            {stops.length > 0 && (
              <div className="divide-y border-t">
                {stops.map(s => stopRow(s, stops))}
              </div>
            )}
          </div>
        );
      })}

      <div className="px-4 py-2 border-b">
        <button onClick={onAddTrip} className="text-sm text-red-900 hover:text-red-800 inline-flex items-center gap-1">
          <Plus size={14} /> Add reload trip
        </button>
      </div>

      {/* Evening: work + pickups */}
      <div className="border-b">
        <div className="px-4 pt-3 pb-1 text-sm font-semibold text-gray-900">After deliveries — work &amp; pickups</div>
        {evening.length === 0 ? (
          <p className="px-4 pb-2 text-xs text-gray-500">Pickups are added automatically when you load an event.</p>
        ) : (
          <div className="divide-y">{evening.map(s => stopRow(s, evening))}</div>
        )}
        <AddEveningStop dayEvents={dayEvents} onAdd={onAddEveningStop} />
      </div>

      {/* Notes */}
      <div className="px-4 py-3">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== (run.notes || '') && onUpdateRun({ notes: notes || null })}
          rows={2}
          placeholder="Notes for this truck (e.g. parking, dock, keys)…"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent"
        />
      </div>
    </div>
  );
}

function LoadedEvent({ event, allocations, required, allocatedEverywhere, onSet, onRemove }) {
  const qty = (cls) => allocations.find(a => a.size_class === cls)?.quantity || 0;
  const classes = ALLOCATABLE_CLASSES.filter(c => required[c] > 0 || qty(c) > 0);
  return (
    <div className="border border-gray-200 rounded-lg p-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-sm font-medium text-gray-900 truncate">{event?.name || 'Event'}</span>
        <button onClick={onRemove} className="p-0.5 text-gray-400 hover:text-red-700" title="Take off this trip"><X size={14} /></button>
      </div>
      {classes.length === 0 ? (
        <p className="text-xs text-gray-500">No equipment imported for this event.</p>
      ) : (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {classes.map(cls => {
            const q = qty(cls);
            const total = required[cls] || 0;
            const elsewhere = (allocatedEverywhere[cls] || 0) - q;
            const off = elsewhere + q !== total;
            return (
              <div key={cls} className="flex items-center gap-1 text-xs">
                <span className="text-gray-600 w-16">{CLASS_LABELS[cls]}</span>
                <button onClick={() => onSet(cls, q - 1)} disabled={q <= 0} className="w-5 h-5 rounded border border-gray-300 flex items-center justify-center disabled:opacity-30"><Minus size={10} /></button>
                <span className={`w-6 text-center font-semibold ${off ? 'text-amber-700' : 'text-gray-900'}`}>{q}</span>
                <button onClick={() => onSet(cls, q + 1)} className="w-5 h-5 rounded border border-gray-300 flex items-center justify-center"><Plus size={10} /></button>
                <span className="text-gray-400">/{total}{elsewhere > 0 ? ` (${elsewhere} on other trips)` : ''}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddEveningStop({ dayEvents, onAdd }) {
  const [type, setType] = useState('pickup');
  return (
    <div className="px-4 py-2 flex items-center gap-2">
      <select value={type} onChange={(e) => setType(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm">
        <option value="pickup">+ Pickup</option>
        <option value="work">+ Work (deal)</option>
      </select>
      <select
        value=""
        onChange={(e) => e.target.value && onAdd(type, e.target.value)}
        className="flex-1 min-w-0 px-2 py-1.5 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600"
      >
        <option value="">at event…</option>
        {dayEvents.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
    </div>
  );
}

// Saves on blur/enter, not on every keystroke (each save reloads the day).
function TimeInput({ value, onSave }) {
  const [v, setV] = useState((value || '').slice(0, 5));
  useEffect(() => setV((value || '').slice(0, 5)), [value]);
  const commit = () => { if (v !== (value || '').slice(0, 5)) onSave(v || null); };
  return (
    <input
      type="time"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className="px-1.5 py-1 border border-gray-300 rounded text-xs w-[6.5rem] focus:ring-2 focus:ring-red-500"
    />
  );
}
