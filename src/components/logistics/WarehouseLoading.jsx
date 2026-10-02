import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Package, Printer, ChevronDown, ChevronRight, Car, CheckCircle, Circle, RefreshCw } from 'lucide-react';
import { parseDateSafe, formatTime } from '../../utils/dateHelpers';
import { orderRunStops, runLabel, isWarehouseWorker, isPersonalTruck } from '../../utils/logistics/dispatch';
import { buildLoadSheet, groupItems } from '../../utils/logistics/fieldViews';
import { TruckSwatch } from './CapacityDisplay';
import LoadSheet from './LoadSheet';
import { loadDispatchRange, loadEventEquipment, loadTrucks, isMissingSchemaError } from './logisticsData';

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const DAYS_AHEAD = 7;

// Worker portal "Loading — next 7 days" for workers with the Warehouse skill
// (Dylan, 2026-10-01): the live load sheet for every truck and trip planned
// in the next week, read-only, with a printable version per day. Checkboxes
// are a scratchpad for whoever's loading -- kept on this device only, not
// saved. Renders nothing for anyone without the skill.
export default function WarehouseLoading({ worker, positions = [], events = [], workers = [], timeFormat }) {
  const allowed = isWarehouseWorker(worker, positions);
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(true);
  const [ticked, setTicked] = useState({});
  const [printDate, setPrintDate] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    try {
      const start = new Date();
      const end = new Date(); end.setDate(end.getDate() + DAYS_AHEAD - 1);
      const [plan, trucks] = await Promise.all([loadDispatchRange(ymd(start), ymd(end)), loadTrucks()]);
      const eventIds = [...new Set(plan.allocations.map(a => a.event_id))];
      const rows = await loadEventEquipment(eventIds);
      const equipmentByEvent = {};
      for (const r of rows) (equipmentByEvent[r.event_id] ||= []).push(r);
      setData({ plan, trucks, equipmentByEvent });
    } catch (err) {
      if (!isMissingSchemaError(err)) console.error('Warehouse loading view failed:', err);
      setData({ plan: { runs: [], loads: [], allocations: [], stops: [] }, trucks: [], equipmentByEvent: {} });
    } finally {
      setLoading(false);
    }
  }, [allowed]);

  useEffect(() => { load(); }, [load]);

  const eventsById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e])), [events]);
  const workersById = useMemo(() => Object.fromEntries(workers.map(w => [w.id, w])), [workers]);

  if (!allowed || !data) return null;

  const { plan, trucks, equipmentByEvent } = data;
  const trucksById = Object.fromEntries(trucks.map(t => [t.id, t]));
  const ctx = { loads: plan.loads, allocations: plan.allocations, equipmentByEvent };

  // Days -> vehicles (trucks in priority order, then personal vehicles) -> trips.
  const days = [...new Set(plan.runs.map(r => r.run_date))].sort().map(date => {
    const runs = plan.runs
      .filter(r => r.run_date === date)
      .sort((a, b) =>
        Number(!!a.is_personal) - Number(!!b.is_personal) ||
        (trucksById[a.truck_id]?.priority ?? 99) - (trucksById[b.truck_id]?.priority ?? 99));
    const sheets = runs.flatMap(run =>
      plan.loads
        .filter(l => l.run_id === run.id)
        .sort((a, b) => a.sequence - b.sequence)
        .filter(l => plan.allocations.some(a => a.load_id === l.id && a.quantity > 0))
        .map(load => ({ load, run, truck: trucksById[run.truck_id] }))
        .filter(s => s.truck)
    );
    return { date, sheets };
  }).filter(d => d.sheets.length);

  const tickKey = (loadId, eventId, itemKey) => `${loadId}|${eventId}|${itemKey}`;
  const toggle = (k) => setTicked(t => ({ ...t, [k]: !t[k] }));
  const printing = printDate ? days.find(d => d.date === printDate) : null;

  return (
    <div className="bg-white rounded-lg shadow border-l-4 border-gray-700">
      <button onClick={() => setOpen(o => !o)} className="w-full text-left p-4 flex items-start gap-3">
        <Package size={22} className="text-gray-700 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-gray-900">Loading — next {DAYS_AHEAD} days</h3>
          <p className="text-sm text-gray-600">
            {days.length
              ? `${days.length} day${days.length === 1 ? '' : 's'} · ${days.reduce((n, d) => n + d.sheets.length, 0)} truck load${days.reduce((n, d) => n + d.sheets.length, 0) === 1 ? '' : 's'} to prepare`
              : 'Nothing to load yet.'}
          </p>
        </div>
        {open ? <ChevronDown size={18} className="text-gray-400 mt-1" /> : <ChevronRight size={18} className="text-gray-400 mt-1" />}
      </button>

      {open && (
        <div className="border-t">
          <div className="px-4 py-2 flex items-center justify-between text-xs text-gray-500">
            <span>Live from the office's plan. Ticks are just for you on this device.</span>
            <button onClick={load} className="inline-flex items-center gap-1 hover:text-gray-800">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>

          {days.map(({ date, sheets }) => (
            <div key={date} className="border-t">
              <div className="px-4 py-2 bg-gray-50 flex items-center justify-between">
                <span className="text-sm font-bold text-gray-900">
                  {parseDateSafe(date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                </span>
                <button
                  onClick={() => setPrintDate(date)}
                  className="text-xs px-2.5 py-1 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 inline-flex items-center gap-1"
                >
                  <Printer size={13} /> Print this day
                </button>
              </div>

              {sheets.map(({ load, run, truck }) => {
                const blocks = buildLoadSheet(load, ctx, plan.stops);
                const tripCount = plan.loads.filter(l => l.run_id === run.id).length;
                const crew = [run.worker1_id, run.worker2_id].map(id => workersById[id]?.name).filter(Boolean).join(' & ');
                const tripStops = orderRunStops(plan.loads.filter(l => l.run_id === run.id), plan.stops.filter(s => s.run_id === run.id))
                  .trips.find(t => t.load.id === load.id)?.stops || [];
                return (
                  <div key={load.id} className="px-4 py-3 border-t">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1">
                      {run.is_personal || isPersonalTruck(truck)
                        ? <Car size={16} className="text-gray-500" />
                        : <TruckSwatch color={truck.color} size={14} />}
                      <span className="font-semibold text-gray-900">
                        {runLabel(run, trucksById, workersById)}{run.is_personal ? '' : ' truck'}
                        {tripCount > 1 ? ` — Trip ${load.sequence}${load.sequence > 1 ? ' (reload)' : ''}` : ''}
                      </span>
                      {crew && !run.is_personal && <span className="text-sm text-gray-500">· {crew}</span>}
                    </div>
                    {run.notes && <p className="text-xs text-gray-700 bg-yellow-50 rounded px-2 py-1 mb-1"><span className="font-semibold">Notes:</span> {run.notes}</p>}
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Load in this order — last stop goes in first</p>

                    {blocks.map(block => {
                      const ev = eventsById[block.eventId];
                      return (
                        <div key={block.eventId} className="mb-2">
                          <div className="text-sm bg-gray-100 rounded px-2 py-1 flex flex-wrap items-baseline gap-x-2">
                            <span className="font-bold">#{block.loadPosition}</span>
                            <span className="font-semibold text-gray-900">{ev?.name || 'Event'}</span>
                            <span className="text-xs text-gray-500 ml-auto">delivery stop {block.deliveryOrder}</span>
                          </div>
                          {groupItems(block.items).map(item => (
                            <div key={item.key}>
                              <ItemLine k={tickKey(load.id, block.eventId, item.key)} item={item} ticked={ticked} onToggle={toggle} />
                              {item.accessories.map(acc => (
                                <div key={acc.key} className="pl-6">
                                  <ItemLine k={tickKey(load.id, block.eventId, acc.key)} item={acc} ticked={ticked} onToggle={toggle} small />
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      );
                    })}

                    {tripStops.length > 0 && (
                      <p className="text-xs text-gray-500">
                        Delivery order: {tripStops.map((s, i) => `${i + 1}. ${eventsById[s.event_id]?.name || 'Stop'}${s.scheduled_start ? ` (${formatTime(s.scheduled_start.slice(0, 5), timeFormat)})` : ''}`).join(' · ')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <LoadSheet
        open={!!printing}
        onClose={() => setPrintDate(null)}
        date={printDate}
        sheets={printing?.sheets || []}
        ctx={ctx}
        stops={plan.stops}
        eventsById={eventsById}
        workersById={workersById}
        timeFormat={timeFormat}
      />
    </div>
  );
}

function ItemLine({ k, item, ticked, onToggle, small = false }) {
  const on = !!ticked[k];
  return (
    <button onClick={() => onToggle(k)} className="w-full flex items-center gap-2 py-1 text-left">
      {on ? <CheckCircle size={small ? 18 : 20} className="text-green-600 flex-shrink-0" /> : <Circle size={small ? 18 : 20} className="text-gray-300 flex-shrink-0" />}
      <span className={`${small ? 'text-sm text-gray-700' : 'text-sm font-medium text-gray-900'} ${on ? 'line-through opacity-60' : ''}`}>
        <span className="tabular-nums">{item.quantity}×</span> {item.name}
      </span>
    </button>
  );
}
