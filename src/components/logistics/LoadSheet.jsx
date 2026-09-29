import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';
import { parseDateSafe, formatTime } from '../../utils/dateHelpers';
import { checkLoad, orderRunStops } from '../../utils/logistics/dispatch';
import { buildLoadSheet, groupItems } from '../../utils/logistics/fieldViews';
import { STATUS_STYLES, TruckSwatch } from './CapacityDisplay';

// Warehouse load sheet(s): one page per trip. Rendered in a portal on
// <body> so that, with body.printing-sheet set, print CSS in index.css hides
// the rest of the app and prints just these pages.
//
// sheets: [{ load, run, truck }]
// ctx:    { loads, allocations, equipmentByEvent } for the day
export default function LoadSheet({ open, onClose, date, sheets = [], ctx, stops = [], eventsById = {}, workersById = {}, timeFormat }) {
  useEffect(() => {
    if (!open) return undefined;
    document.body.classList.add('printing-sheet');
    return () => document.body.classList.remove('printing-sheet');
  }, [open]);

  if (!open) return null;

  const dateLabel = parseDateSafe(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return createPortal(
    <div id="print-root" className="fixed inset-0 z-50 bg-gray-100 overflow-y-auto">
      <div className="sticky top-0 z-10 bg-white border-b shadow-sm print:hidden">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <span className="font-semibold text-gray-900">Load sheet{sheets.length > 1 ? `s (${sheets.length})` : ''}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="bg-red-900 text-white px-3 py-1.5 rounded-lg hover:bg-red-800 text-sm inline-flex items-center gap-1.5">
              <Printer size={15} /> Print
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-gray-800" title="Close"><X size={20} /></button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 space-y-4 print:p-0 print:space-y-0">
        {sheets.length === 0 && <div className="bg-white rounded-lg p-8 text-center text-gray-500">Nothing loaded yet.</div>}
        {sheets.map(({ load, run, truck }, i) => {
          const blocks = buildLoadSheet(load, ctx, stops);
          const cap = checkLoad(truck, ctx.allocations.filter(a => a.load_id === load.id));
          const team = [run.worker1_id, run.worker2_id].map(id => workersById[id]?.name).filter(Boolean);
          const tripStops = orderRunStops(ctx.loads.filter(l => l.run_id === run.id), stops.filter(s => s.run_id === run.id))
            .trips.find(t => t.load.id === load.id)?.stops || [];
          return (
            <div key={load.id} className={`bg-white rounded-lg shadow p-5 print:shadow-none print:rounded-none ${i < sheets.length - 1 ? 'print-page-break' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-2 border-b pb-3 mb-3">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <TruckSwatch color={truck.color} size={16} />
                    {truck.name} truck — Trip {load.sequence}{load.sequence > 1 ? ' (reload)' : ''}
                  </h2>
                  <p className="text-sm text-gray-600">{dateLabel}</p>
                  {team.length > 0 && <p className="text-sm text-gray-600">Team: {team.join(' & ')}</p>}
                </div>
                <div className="text-right text-xs text-gray-600">
                  <span className={`inline-block px-2 py-0.5 rounded-full font-medium border ${STATUS_STYLES[cap.status].badge}`}>{STATUS_STYLES[cap.status].label}</span>
                  <div className="mt-1">
                    Craps {cap.zones.craps.used}/{cap.zones.craps.capacity} · BJ {cap.zones.blackjack.used}/{cap.zones.blackjack.capacity} ·
                    Roul {cap.zones.roulette.used}/{cap.zones.roulette.capacity} · Poker {cap.zones.poker.used}/{cap.zones.poker.capacity}
                  </div>
                </div>
              </div>

              {cap.reasons.length > 0 && (
                <ul className="mb-3 text-xs text-yellow-800">{cap.reasons.map(r => <li key={r}>⚠ {r}</li>)}</ul>
              )}

              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Load in this order — last stop goes in first</p>

              {blocks.map(block => {
                const ev = eventsById[block.eventId];
                return (
                  <div key={block.eventId} className="mb-4 break-inside-avoid">
                    <div className="flex items-baseline gap-2 bg-gray-100 rounded px-2 py-1">
                      <span className="text-sm font-bold text-gray-900">Load #{block.loadPosition}</span>
                      <span className="text-sm font-semibold text-gray-900">{ev?.name || 'Event'}</span>
                      <span className="text-xs text-gray-600 ml-auto whitespace-nowrap">Delivery stop {block.deliveryOrder}</span>
                    </div>
                    {ev?.address && <div className="text-xs text-gray-600 px-2 mt-0.5">{ev.address}{ev.time ? ` · party ${formatTime(ev.time, timeFormat)}` : ''}</div>}
                    <div className="mt-1">
                      {groupItems(block.items).map(item => (
                        <div key={item.key} className="px-2">
                          <CheckLine quantity={item.quantity} name={item.name} bold />
                          {item.accessories.map(acc => (
                            <div key={acc.key} className="pl-6"><CheckLine quantity={acc.quantity} name={acc.name} /></div>
                          ))}
                        </div>
                      ))}
                      {block.items.length === 0 && <p className="text-xs text-gray-500 px-2">No items (no pull sheet imported).</p>}
                    </div>
                  </div>
                );
              })}

              {tripStops.length > 0 && (
                <div className="border-t pt-2 mt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Delivery order</p>
                  <ol className="text-sm text-gray-800 list-decimal pl-5">
                    {tripStops.map(s => (
                      <li key={s.id}>
                        {eventsById[s.event_id]?.name}
                        {s.scheduled_start ? ` — ${formatTime(s.scheduled_start, timeFormat)}` : ''}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {run.notes && <p className="text-sm text-gray-700 border-t pt-2 mt-2"><span className="font-semibold">Notes:</span> {run.notes}</p>}
            </div>
          );
        })}
      </div>
    </div>,
    document.body
  );
}

function CheckLine({ quantity, name, bold = false }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="inline-block w-4 h-4 border-2 border-gray-500 rounded-sm flex-shrink-0" />
      <span className={`w-8 text-right tabular-nums ${bold ? 'font-bold' : ''}`}>{quantity}×</span>
      <span className={`text-sm ${bold ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{name}</span>
    </div>
  );
}
