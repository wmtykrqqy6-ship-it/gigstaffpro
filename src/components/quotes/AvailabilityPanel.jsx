import React, { useState, useEffect, useMemo } from 'react';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { bookingWindow, needsFromLines, needsFromEquipment, checkAvailability } from '../../utils/availability';

const shiftDate = (date, days) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// Availability on the quote builder (CRM Phase 2 step 4, docs/QUOTES.md):
// for each kind of table the quote needs, how many are free during its
// delivery-to-pickup window. Warns but never blocks (you may rent extras).
export default function AvailabilityPanel({ quoteId, lines, items, date, start, end, setup, pickup }) {
  const [data, setData] = useState(null); // { pools, bookings } | { off: true }

  useEffect(() => {
    if (!date) { setData(null); return; }
    let cancelled = false;
    (async () => {
      const { data: pools, error } = await supabase.from('stock_pools').select('*');
      if (error) { if (!cancelled) setData({ off: true }); return; }
      const from = shiftDate(date, -1);
      const to = shiftDate(date, 1);
      const { data: events } = await supabase.from('events').select('id, name, date, time, end_time, status')
        .gte('date', from).lte('date', `${to}T23:59:59`);
      const live = (events || []).filter(e => !['cancelled', 'archived'].includes(e.status));
      const ids = live.map(e => e.id);
      const { data: equipment } = ids.length
        ? await supabase.from('event_equipment').select('event_id, item_name, size_class, quantity').in('event_id', ids)
        : { data: [] };
      const { data: quotes } = await supabase.from('quotes').select('id, name, status, event_date, start_time, end_time, lines, setup_minutes, pickup_minutes')
        .in('status', ['sent', 'accepted']).gte('event_date', from).lte('event_date', to);
      if (cancelled) return;
      const bookings = [
        ...live.map(e => ({
          label: e.name || 'Event',
          window: bookingWindow({ date: String(e.date).slice(0, 10), start: e.time, end: e.end_time }),
          needs: needsFromEquipment((equipment || []).filter(r => r.event_id === e.id), pools)
        })),
        ...(quotes || []).filter(q => q.id !== quoteId).map(q => ({
          label: q.name || 'Quote',
          pending: q.status === 'sent',
          window: bookingWindow({ date: q.event_date, start: q.start_time, end: q.end_time, setup: q.setup_minutes, pickup: q.pickup_minutes }),
          needs: needsFromLines(q.lines, items)
        }))
      ];
      setData({ pools: pools || [], bookings });
    })();
    return () => { cancelled = true; };
  }, [date, quoteId, items]);

  const win = bookingWindow({ date, start, end, setup, pickup });
  const needs = useMemo(() => needsFromLines(lines, items), [lines, items]);
  const rows = useMemo(() => (data?.pools && win ? checkAvailability({ window: win, needs, pools: data.pools, bookings: data.bookings }) : []),
    [data, needs, win?.start, win?.end]);

  if (data?.off) return null; // availability SQL (20261127160000) not run yet
  if (!date || !start) return <p className="text-xs text-gray-500">Set the date and start time to check table availability.</p>;
  if (!data) return <p className="text-xs text-gray-500">Checking availability…</p>;
  if (!rows.length) return null;

  return (
    <div className="border rounded-lg p-3">
      <p className="text-xs font-semibold text-gray-700 mb-2">Table availability (delivery to pickup)</p>
      <ul className="space-y-1">
        {rows.map(r => (
          <li key={r.key} className={`text-sm flex items-start space-x-2 ${r.short ? 'text-red-700' : 'text-gray-700'}`}>
            {r.short ? <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" /> : <CheckCircle size={14} className="mt-0.5 flex-shrink-0 text-green-600" />}
            <span>
              {r.name}: need {r.need}
              {r.owned === null ? ' (count not set in Settings > Prices)' : `, ${Math.max(r.free, 0)} of ${r.owned} free`}
              {r.pending > 0 && <span className="text-gray-500"> · {r.pending} on sent quotes</span>}
              {r.bookings.length > 0 && <span className="block text-xs text-gray-500">{r.bookings.map(b => `${b.label} (${b.qty}${b.pending ? ', pending' : ''})`).join(', ')}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-gray-400 mt-2">Counts events with an imported pull sheet and accepted quotes. Bookings only in Goodshuffle aren't counted yet.</p>
    </div>
  );
}
