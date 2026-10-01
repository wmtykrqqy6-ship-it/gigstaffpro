import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Trash2, ArrowUp, ArrowDown, X,
  AlertTriangle, XCircle, CheckCircle, Minus, Printer, Car
} from 'lucide-react';
import LoadSheet from './LoadSheet';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import { parseDateSafe, formatTime } from '../../utils/dateHelpers';
import { getPositionLabel, isAssignmentFilled } from '../../utils/positionHelpers';
import {
  ALLOCATABLE_CLASSES, CLASS_LABELS, requiredCounts, allocatedCounts, allocationStatus,
  formatCounts, checkLoad, computeDayConflicts, dealingShifts, orderRunStops,
  sequenceChanges, moveStop, planAddEventToLoad, crewRoles, isDriver, isSetUp, eligibleForSpot,
  isPersonalTruck, spotFor, runLabel, teamIds
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
    () => trucks.filter(t => t.active !== false && !isPersonalTruck(t)).sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99)),
    [trucks]
  );
  // The "Personal vehicle" row (from the solo/personal-vehicle migration);
  // personal-vehicle deliveries are checked against its capacities.
  const personalTruck = useMemo(() => trucks.find(t => isPersonalTruck(t) && t.active !== false) || null, [trucks]);
  const label = (run) => runLabel(run, trucksById, workersById);

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
    if (!(await confirm(`Take ${ev?.name || 'this event'} off ${label(run)} trip ${load.sequence}?`))) return;
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
    if (!(await confirm(`Clear the whole ${label(run)} plan for this day? Its trips, loaded tables and stops will be removed.`))) return;
    act(() => deleteRun(run.id));
  };

  const handleDeleteTrip = async (load) => {
    if (!(await confirm(`Remove trip ${load.sequence} and everything loaded on it?`))) return;
    act(() => deleteLoad(load.id));
  };

  // Personal-vehicle deliveries for the day, oldest first.
  const personalRuns = day.runs
    .filter(r => r.is_personal)
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));

  // Trips in truck-priority order, then personal vehicles, for "All load sheets".
  const tripsOf = (run) => day.loads.filter(l => l.run_id === run.id).sort((a, b) => a.sequence - b.sequence);
  const sheetOrder = [
    ...activeTrucks.flatMap(t => {
      const run = day.runs.find(r => r.truck_id === t.id && !r.is_personal);
      return run ? tripsOf(run) : [];
    }),
    ...personalRuns.flatMap(tripsOf)
  ];
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
  const plannedTruckRuns = activeTrucks
    .map(truck => ({ truck, run: day.runs.find(r => r.truck_id === truck.id && !r.is_personal) }))
    .filter(x => x.run);
  const unplannedTrucks = activeTrucks.filter(t => !day.runs.some(r => r.truck_id === t.id && !r.is_personal));
  const runCards = [
    ...plannedTruckRuns,
    ...(personalTruck ? personalRuns.map(run => ({ truck: personalTruck, run })) : [])
  ];

  return (
    <div className={`space-y-4 ${busy ? 'opacity-70 pointer-events-none' : ''}`}>
      {/* Date bar */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setDate(d => shiftDate(d, -1))} className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50" title="Previous day">
          <ChevronLeft size={16} />
        </button>
        <span className="text-lg font-semibold text-gray-900 min-w-[11rem] text-center">
          {parseDateSafe(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <button onClick={() => setDate(d => shiftDate(d, 1))} className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50" title="Next day">
          <ChevronRight size={16} />
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 focus:ring-2 focus:ring-red-500"
          title="Jump to a date"
        />
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

      {/* Day summary: status line, the day's events, and any problems */}
      <div className="bg-white rounded-lg shadow">
        <div className={`px-4 py-3 flex items-center gap-2 text-sm font-medium rounded-t-lg ${
          !dayEvents.length ? 'text-gray-500'
            : errors.length ? 'bg-red-50 text-red-800'
            : warnings.length ? 'bg-amber-50 text-amber-900'
            : day.runs.length ? 'bg-green-50 text-green-800' : 'text-gray-600'
        }`}>
          {!dayEvents.length ? <>No events on this day.</>
            : errors.length ? <><XCircle size={16} /> {errors.length} problem{errors.length === 1 ? '' : 's'}{warnings.length ? ` · ${warnings.length} to check` : ''}</>
            : warnings.length ? <><AlertTriangle size={16} /> {warnings.length} thing{warnings.length === 1 ? '' : 's'} to check</>
            : day.runs.length ? <><CheckCircle size={16} /> {dayEvents.length} event{dayEvents.length === 1 ? '' : 's'} · all on trucks · no conflicts</>
            : <>{dayEvents.length} event{dayEvents.length === 1 ? '' : 's'}</>}
        </div>
        {dayEvents.length > 0 && (
          <div className="divide-y border-t">
            {dayEvents.map(ev => {
              const rows = equipmentByEvent[ev.id] || [];
              const required = requiredCounts(rows);
              const status = allocationStatus(required, allocatedCounts(day.allocations, ev.id));
              const tables = ALLOCATABLE_CLASSES.filter(c => c !== 'chairs' && c !== 'decor').reduce((n, c) => n + required[c], 0);
              const onRuns = day.runs.filter(r => day.allocations.some(a =>
                a.event_id === ev.id && a.quantity > 0 && day.loads.find(l => l.id === a.load_id)?.run_id === r.id));
              let chip;
              if (!rows.length) chip = <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">No pull sheet</span>;
              else if (status.complete) chip = <span className="text-xs bg-green-100 text-green-800 rounded-full px-2 py-0.5 inline-flex items-center gap-1"><CheckCircle size={12} /> On trucks</span>;
              else if (!status.anyAllocated) chip = <span className="text-xs bg-red-100 text-red-800 rounded-full px-2 py-0.5">No truck yet</span>;
              else chip = (
                <span className="text-xs bg-yellow-100 text-yellow-800 rounded-full px-2 py-0.5">
                  {Object.keys(status.remaining).length ? `${formatCounts(status.remaining)} not loaded` : `${formatCounts(status.over)} extra`}
                </span>
              );
              return (
                <div key={ev.id} className="px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-medium text-gray-900">{ev.name}</span>
                  <span className="text-sm text-gray-500">
                    {formatTime(ev.time, timeFormat)}{ev.end_time ? `–${formatTime(ev.end_time, timeFormat)}` : ''}
                  </span>
                  {tables > 0 && <span className="text-sm text-gray-500" title={formatCounts(required)}>{tables} table{tables === 1 ? '' : 's'}</span>}
                  <span className="ml-auto flex items-center gap-2">
                    {onRuns.map(r => (
                      <span key={r.id} className="text-xs text-gray-600 inline-flex items-center gap-1">
                        {r.is_personal ? <Car size={12} /> : <TruckSwatch color={trucksById[r.truck_id]?.color} size={10} />}
                        {label(r)}
                      </span>
                    ))}
                    {chip}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {conflicts.length > 0 && (
          <ul className="border-t px-4 py-2 space-y-1">
            {[...errors, ...warnings].map((c, i) => (
              <li key={i} className={`flex items-start gap-2 text-sm ${c.level === 'error' ? 'text-red-800' : 'text-amber-900'}`}>
                {c.level === 'error' ? <XCircle size={14} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />}
                {c.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add a vehicle */}
      {!loading && (unplannedTrucks.length > 0 || personalTruck) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-600 mr-1">Add a vehicle:</span>
          {unplannedTrucks.map(truck => (
            <button
              key={truck.id}
              onClick={() => act(() => createRun(date, truck.id))}
              className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm inline-flex items-center gap-1.5"
            >
              <Plus size={14} /><TruckSwatch color={truck.color} size={10} /> {truck.name}
            </button>
          ))}
          {personalTruck && (
            <button
              onClick={() => act(() => createRun(date, personalTruck.id, { is_personal: true }))}
              className="px-3 py-1.5 rounded-lg border border-dashed border-gray-300 bg-white hover:bg-gray-50 text-sm inline-flex items-center gap-1.5"
              title="Small event? One person delivers it in their own car."
            >
              <Plus size={14} /><Car size={14} /> Personal vehicle
            </button>
          )}
        </div>
      )}

      {/* Planned vehicles */}
      {loading ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">Loading…</div>
      ) : activeTrucks.length === 0 && !personalTruck ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">No active trucks — add them under Trucks &amp; Catalog.</div>
      ) : runCards.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          {dayEvents.length ? 'Nothing planned yet — add a vehicle above, then load events onto it.' : 'Nothing planned for this day.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4 items-start">
          {runCards.map(({ truck, run }) => (
            <RunCard
              key={run.id}
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
              label={label(run)}
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
          ))}
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
// One planned vehicle (truck or personal vehicle) for the day.

const STOP_LABELS = { deliver: 'Deliver', work: 'Dealing', pickup: 'Pick up', warehouse: 'Warehouse' };

function RunCard({
  truck, run, date, day, dayEvents, eventsById, equipmentByEvent, workers, positions, workersById, assignments,
  conflicts, timeFormat, label, onDeleteRun, onUpdateRun, onAddTrip, onDeleteTrip, onAddEvent,
  onRemoveEvent, onSetAllocation, onUpdateStop, onDeleteStop, onMoveStop, onAddEveningStop, onOpenLoadSheet
}) {
  const [notes, setNotes] = useState(run.notes || '');
  useEffect(() => setNotes(run.notes || ''), [run.notes]);

  const personal = !!run.is_personal;
  const runLoads = day.loads.filter(l => l.run_id === run.id);
  const runStops = day.stops.filter(s => s.run_id === run.id);
  const { trips, evening, ordered } = orderRunStops(runLoads, runStops);
  const fmt = (t) => (t ? formatTime(String(t).slice(0, 5), timeFormat) : '');

  // Team pickers -------------------------------------------------------------
  const dealingToday = {};
  for (const s of dealingShifts(workers.map(w => w.id), assignments, eventsById, date)) {
    (dealingToday[s.workerId] ||= []).push(eventsById[s.eventId]?.name);
  }
  const otherRunWorkers = new Set(day.runs.filter(r => r.id !== run.id).flatMap(r => [r.worker1_id, r.worker2_id]).filter(Boolean));
  // Driver spot: Set Up Drivers only. Set Up spot (and a personal vehicle's
  // one person): Set Up or Set Up Driver -- once a driver position exists in
  // Settings -> Positions. Someone already in a spot who doesn't qualify
  // stays listed so they aren't silently dropped; the board warns instead.
  const roles = crewRoles(positions);
  const byName = (a, b) => (a.name || '').localeCompare(b.name || '');
  const qualifies = (w, spot) => (spot === 'driver' ? isDriver(w, roles) : isSetUp(w, roles));
  const driverCount = eligibleForSpot(workers, positions, 'driver').length;
  const carCapacityMissing = personal &&
    ['craps_stretch', 'roulette_capacity', 'poker_capacity', 'blackjack_capacity'].every(k => !Number(truck[k]));

  const workerSelect = (field, otherField, title) => {
    const spot = spotFor(run, field);
    const current = workersById[run[field]];
    const options = eligibleForSpot(workers, positions, spot).filter(w => w.id !== run[otherField]).sort(byName);
    if (current && !options.some(w => w.id === current.id)) options.unshift(current);
    return (
      <label className="flex items-center gap-1.5 text-xs text-gray-500">
        {title}
        <select
          value={run[field] || ''}
          onChange={(e) => onUpdateRun({ [field]: e.target.value || null })}
          className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-red-500 max-w-[12rem]"
        >
          <option value="">— Select —</option>
          {options.map(w => (
            <option key={w.id} value={w.id}>
              {w.name}
              {roles.active && !qualifies(w, spot) ? (spot === 'driver' ? ' (not a Set Up Driver)' : ' (not Set Up)') : ''}
              {otherRunWorkers.has(w.id) ? ' (on another vehicle)' : ''}
              {dealingToday[w.id] ? ` (dealing ${dealingToday[w.id].join(', ')})` : ''}
            </option>
          ))}
        </select>
      </label>
    );
  };

  // Helpers per event ---------------------------------------------------------
  const team = teamIds(run);
  const teamDealing = (eventId) => dealingShifts(team, assignments, eventsById, date).some(s => s.eventId === eventId);
  const teamOnEvent = (eventId) => assignments.filter(a =>
    a.event_id === eventId && isAssignmentFilled(a.status) && team.includes(a.worker_id));
  const stopConflicts = (stopIds) => conflicts.filter(c => c.stopId && stopIds.includes(c.stopId));
  // An event's pickup / work stops belong to the run, so show them under the
  // first trip that carries the event.
  const firstTripFor = {};
  for (const { load, stops } of trips) {
    const ids = new Set([...day.allocations.filter(a => a.load_id === load.id).map(a => a.event_id), ...stops.map(s => s.event_id)]);
    for (const id of ids) if (!(id in firstTripFor)) firstTripFor[id] = load.id;
  }
  const eventsOnRun = Object.keys(firstTripFor);
  // Work/pickup stops for events no trip carries (rare: added by hand).
  const orphanEvening = evening.filter(s => !(s.event_id in firstTripFor));

  const timeRow = (stop, label, onRemove) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-semibold text-gray-600 w-16">{label}</span>
      <TimeInput value={stop.scheduled_start} onSave={(v) => onUpdateStop(stop, { scheduled_start: v })} />
      <span className="text-xs text-gray-400">to</span>
      <TimeInput value={stop.scheduled_end} onSave={(v) => onUpdateStop(stop, { scheduled_end: v })} />
      {onRemove && (
        <button onClick={onRemove} className="p-1 text-gray-400 hover:text-red-700" title={`Remove ${label.toLowerCase()} stop`}><X size={13} /></button>
      )}
    </div>
  );

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header: vehicle + team */}
      <div className="px-4 py-3 border-b flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 font-semibold text-gray-900 mr-auto">
          {personal ? <Car size={18} className="text-gray-500" /> : <TruckSwatch color={truck.color} size={16} />}
          {label}
        </div>
        {personal ? (
          workerSelect('worker1_id', 'worker2_id', 'Crew member')
        ) : (
          <>
            {workerSelect('worker1_id', 'worker2_id', 'Driver')}
            {!run.solo && workerSelect('worker2_id', 'worker1_id', 'Set Up')}
            {'solo' in run && (
              <label className="flex items-center gap-1.5 text-xs text-gray-600" title="One person runs this truck">
                <input
                  type="checkbox"
                  checked={!!run.solo}
                  onChange={(e) => onUpdateRun(e.target.checked ? { solo: true, worker2_id: null } : { solo: false })}
                />
                Solo
              </label>
            )}
          </>
        )}
        <button onClick={onDeleteRun} className="p-1 text-gray-400 hover:text-red-700" title={personal ? 'Remove this personal-vehicle delivery' : "Clear this truck's plan"}>
          <Trash2 size={15} />
        </button>
        {(!roles.active || (roles.active && !personal && driverCount === 0) || carCapacityMissing) && (
          <p className="w-full text-[11px] text-amber-700">
            {carCapacityMissing
              ? 'Enter what fits in a car under Trucks & Catalog (Personal vehicle) — until then everything shows as not fitting.'
              : !roles.active
                ? 'Showing everyone. Add a Set Up Driver position in Settings → Positions and tick it on your drivers to limit these lists.'
                : 'No Set Up Drivers yet — tick “Set Up Driver” on workers in Staff → Edit.'}
          </p>
        )}
      </div>

      {/* Trips */}
      {trips.map(({ load, stops }) => {
        const loadAllocs = day.allocations.filter(a => a.load_id === load.id);
        const cap = checkLoad(truck, loadAllocs);
        const style = STATUS_STYLES[cap.status];
        const eventIds = [...new Set([...loadAllocs.map(a => a.event_id), ...stops.map(s => s.event_id)])];
        const addable = dayEvents.filter(e => !eventIds.includes(e.id));
        const zones = [
          ['Craps', cap.zones.craps], ['Blackjack', cap.zones.blackjack],
          ['Roulette', cap.zones.roulette], ['Poker', cap.zones.poker]
        ].filter(([, z]) => z.capacity > 0 || z.used > 0);
        return (
          <div key={load.id} className="border-b">
            <div className="px-4 pt-3 pb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-sm font-semibold text-gray-900">
                Trip {load.sequence}{load.sequence > 1 ? ' — reload at the warehouse' : ''}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${style.badge}`}>{style.label}</span>
              <span className="text-xs text-gray-500">
                {zones.map(([name, z]) => `${name} ${z.used}/${z.capacity}`).join(' · ')}
              </span>
              <span className="ml-auto flex items-center gap-1">
                <button onClick={() => onOpenLoadSheet(load)} className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900 inline-flex items-center gap-1" title="Load sheet">
                  <Printer size={13} /> Load sheet
                </button>
                {load.sequence > 1 && (
                  <button onClick={() => onDeleteTrip(load)} className="p-1 text-gray-400 hover:text-red-700" title="Remove trip"><Trash2 size={13} /></button>
                )}
              </span>
            </div>

            {cap.status !== 'green' && (
              <div className="px-4 pb-2">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-1.5">
                  <ZoneBar label="Craps zone" used={cap.zones.craps.used} capacity={cap.zones.craps.capacity} stretch={cap.zones.craps.stretch} />
                  <ZoneBar label="Blackjack" used={cap.zones.blackjack.used} capacity={cap.zones.blackjack.capacity} />
                  <ZoneBar label="Roulette" used={cap.zones.roulette.used} capacity={cap.zones.roulette.capacity} />
                  <ZoneBar label="Poker" used={cap.zones.poker.used} capacity={cap.zones.poker.capacity} />
                </div>
                {cap.reasons.map(r => (
                  <div key={r} className={`text-xs mt-1 ${cap.status === 'red' ? 'text-red-700' : 'text-yellow-800'}`}>• {r}</div>
                ))}
              </div>
            )}

            <div className="px-4 pb-3 space-y-2">
              {eventIds.map(eventId => {
                const ev = eventsById[eventId];
                const deliver = stops.find(s => s.event_id === eventId && s.stop_type === 'deliver');
                const showEvening = firstTripFor[eventId] === load.id;
                const pickup = showEvening ? evening.find(s => s.event_id === eventId && s.stop_type === 'pickup') : null;
                const work = showEvening ? evening.find(s => s.event_id === eventId && s.stop_type === 'work') : null;
                const issues = stopConflicts([deliver, pickup, work].filter(Boolean).map(s => s.id));
                return (
                  <div key={eventId} className={`border rounded-lg p-3 ${issues.some(c => c.level === 'error') ? 'border-red-300 bg-red-50/40' : issues.length ? 'border-amber-300 bg-amber-50/40' : 'border-gray-200'}`}>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-gray-900">{ev?.name || 'Event'}</div>
                        <div className="text-xs text-gray-500">
                          {ev?.address || ev?.venue}
                          {ev?.time ? ` · party ${fmt(ev.time)}${ev.end_time ? `–${fmt(ev.end_time)}` : ''}` : ''}
                        </div>
                      </div>
                      <button onClick={() => onRemoveEvent(load, eventId)} className="p-1 text-gray-400 hover:text-red-700" title="Take off this trip"><X size={15} /></button>
                    </div>

                    <div className="mt-2 space-y-1.5">
                      {deliver
                        ? timeRow(deliver, 'Deliver')
                        : <p className="text-xs text-amber-800">No delivery stop for this trip.</p>}
                      {showEvening && (pickup
                        ? timeRow(pickup, 'Pick up', () => onDeleteStop(pickup))
                        : <button onClick={() => onAddEveningStop('pickup', eventId)} className="text-xs text-red-900 hover:underline">+ Add pickup</button>)}
                      {showEvening && work && (
                        <>
                          {timeRow(work, 'Dealing', () => onDeleteStop(work))}
                          <p className="text-[11px] text-purple-800 pl-[4.4rem]">
                            Truck stays parked here.{' '}
                            {teamOnEvent(eventId).map(a => `${workersById[a.worker_id]?.name} — ${getPositionLabel(a.position)}`).join(', ')}
                          </p>
                        </>
                      )}
                      {showEvening && !work && teamDealing(eventId) && (
                        <button onClick={() => onAddEveningStop('work', eventId)} className="text-xs text-purple-800 hover:underline">
                          + Team is dealing this party — add the dealing time
                        </button>
                      )}
                    </div>

                    <LoadSummary
                      allocations={loadAllocs.filter(a => a.event_id === eventId)}
                      required={requiredCounts(equipmentByEvent[eventId] || [])}
                      allocatedEverywhere={allocatedCounts(day.allocations, eventId)}
                      onSet={(cls, qty) => onSetAllocation(load, eventId, cls, qty)}
                    />

                    {issues.map((c, i) => (
                      <div key={i} className={`text-xs mt-1.5 ${c.level === 'error' ? 'text-red-700' : 'text-amber-800'}`}>• {c.message}</div>
                    ))}
                  </div>
                );
              })}

              {addable.length > 0 && (
                <select
                  value=""
                  onChange={(e) => e.target.value && onAddEvent(load, e.target.value)}
                  className="w-full px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 focus:ring-2 focus:ring-red-500"
                >
                  <option value="">{eventIds.length ? '+ Load another event onto this trip…' : '+ Load an event onto this trip…'}</option>
                  {addable.map(e => {
                    const st = allocationStatus(requiredCounts(equipmentByEvent[e.id] || []), allocatedCounts(day.allocations, e.id));
                    return (
                      <option key={e.id} value={e.id}>
                        {e.name}{st.complete ? ' (already on a truck — split it)' : Object.keys(st.remaining).length && st.anyAllocated ? ` (${formatCounts(st.remaining)} left)` : ''}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>
          </div>
        );
      })}

      {/* Stops not tied to a trip (rare) */}
      {orphanEvening.length > 0 && (
        <div className="px-4 py-2 border-b space-y-1.5">
          {orphanEvening.map(s => (
            <div key={s.id}>
              <div className="text-xs text-gray-700 font-medium">{eventsById[s.event_id]?.name}</div>
              {timeRow(s, STOP_LABELS[s.stop_type], () => onDeleteStop(s))}
            </div>
          ))}
        </div>
      )}

      {/* Route order (only matters with more than one event) */}
      {eventsOnRun.length > 1 && (
        <RouteOrder
          trips={trips}
          evening={evening}
          ordered={ordered}
          eventsById={eventsById}
          fmt={fmt}
          onMoveStop={onMoveStop}
        />
      )}

      <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-3">
        <button onClick={onAddTrip} className="text-sm text-red-900 hover:text-red-800 inline-flex items-center gap-1 flex-shrink-0 sm:mt-1.5">
          <Plus size={14} /> Add reload trip
        </button>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== (run.notes || '') && onUpdateRun({ notes: notes || null })}
          rows={1}
          placeholder="Notes for the crew (parking, dock, keys)…"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent"
        />
      </div>
    </div>
  );
}

// "Loaded: 2 Craps · 8 Blackjack" with the +/- split controls tucked away.
function LoadSummary({ allocations, required, allocatedEverywhere, onSet }) {
  const [editing, setEditing] = useState(false);
  const qty = (cls) => allocations.find(a => a.size_class === cls)?.quantity || 0;
  const classes = ALLOCATABLE_CLASSES.filter(c => required[c] > 0 || qty(c) > 0);
  if (!classes.length) return <p className="mt-2 text-xs text-gray-500">No equipment imported for this event.</p>;

  const here = classes.filter(c => qty(c) > 0).map(c => `${qty(c)} ${CLASS_LABELS[c]}`).join(' · ') || 'nothing yet';
  const off = classes.some(c => (allocatedEverywhere[c] || 0) !== (required[c] || 0));
  const elsewhere = classes.some(c => (allocatedEverywhere[c] || 0) - qty(c) > 0);

  return (
    <div className="mt-2 pt-2 border-t border-gray-100">
      <div className="flex flex-wrap items-center gap-x-2 text-xs">
        <span className="text-gray-500">Loaded:</span>
        <span className="text-gray-800">{here}</span>
        {elsewhere && <span className="text-gray-500">(rest on other trips)</span>}
        {off && <span className="text-amber-700">· doesn't match the pull sheet</span>}
        <button onClick={() => setEditing(e => !e)} className="ml-auto text-red-900 hover:underline">
          {editing ? 'Done' : 'Edit / split'}
        </button>
      </div>
      {editing && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
          {classes.map(cls => {
            const q = qty(cls);
            const total = required[cls] || 0;
            const other = (allocatedEverywhere[cls] || 0) - q;
            const mismatch = other + q !== total;
            return (
              <div key={cls} className="flex items-center gap-1 text-xs">
                <span className="text-gray-600 w-16">{CLASS_LABELS[cls]}</span>
                <button onClick={() => onSet(cls, q - 1)} disabled={q <= 0} className="w-6 h-6 rounded border border-gray-300 flex items-center justify-center disabled:opacity-30"><Minus size={11} /></button>
                <span className={`w-6 text-center font-semibold ${mismatch ? 'text-amber-700' : 'text-gray-900'}`}>{q}</span>
                <button onClick={() => onSet(cls, q + 1)} className="w-6 h-6 rounded border border-gray-300 flex items-center justify-center"><Plus size={11} /></button>
                <span className="text-gray-400">of {total}{other > 0 ? ` (${other} on other trips)` : ''}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Numbered stop order for the crew's route, with move up/down within each
// section (a trip's deliveries, then the after-deliveries dealing/pickups).
function RouteOrder({ trips, evening, ordered, eventsById, fmt, onMoveStop }) {
  const sections = [
    ...trips.map(t => ({ title: `Trip ${t.load.sequence}`, stops: t.stops })),
    { title: 'After deliveries', stops: evening }
  ].filter(s => s.stops.length);
  const number = (stop) => ordered.findIndex(s => s.id === stop.id) + 1;
  return (
    <div className="px-4 py-3 border-b">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Route order</div>
      {sections.map(section => (
        <div key={section.title} className="mb-1.5">
          <div className="text-[11px] text-gray-400">{section.title}</div>
          {section.stops.map((stop, i) => (
            <div key={stop.id} className="flex items-center gap-2 text-sm py-0.5">
              <span className="w-5 h-5 rounded-full bg-gray-900 text-white text-[11px] flex items-center justify-center flex-shrink-0">{number(stop)}</span>
              <span className="text-gray-500 w-16 text-xs">{STOP_LABELS[stop.stop_type]}</span>
              <span className="text-gray-900 truncate">{eventsById[stop.event_id]?.name}</span>
              <span className="text-xs text-gray-500">{fmt(stop.scheduled_start)}</span>
              <span className="ml-auto flex items-center">
                <button disabled={i === 0} onClick={() => onMoveStop(stop.id, -1)} className="px-1.5 py-0.5 text-xs text-gray-600 hover:text-gray-900 disabled:opacity-30 inline-flex items-center gap-0.5" title="Move earlier">
                  <ArrowUp size={13} /> Earlier
                </button>
                <button disabled={i === section.stops.length - 1} onClick={() => onMoveStop(stop.id, 1)} className="px-1.5 py-0.5 text-xs text-gray-600 hover:text-gray-900 disabled:opacity-30 inline-flex items-center gap-0.5" title="Move later">
                  <ArrowDown size={13} /> Later
                </button>
              </span>
            </div>
          ))}
        </div>
      ))}
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
