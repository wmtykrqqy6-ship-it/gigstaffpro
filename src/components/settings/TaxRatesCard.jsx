import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../ui/Toast';
import { sortTaxAreas, formatRate } from '../../utils/salesTax';

// Settings > Prices: "Sales tax rates" (docs/QUOTES.md step 3). Total rate per
// county, plus City of Milwaukee. Quotes fill the rate from the event
// address; a change here applies to quotes made afterwards.
export default function TaxRatesCard() {
  const notify = useToast();
  const [rates, setRates] = useState(null); // null = loading or not set up
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [edits, setEdits] = useState({}); // area -> percent text

  useEffect(() => {
    supabase.from('tax_rates').select('*').then(({ data, error }) => setRates(error ? null : sortTaxAreas(data || [])));
  }, []);

  if (!rates) return null; // SQL 20261127150000 not run yet

  const save = async (r) => {
    const pct = Number(edits[r.area]);
    if (!Number.isFinite(pct) || pct < 0 || pct > 20) { notify('Enter a rate between 0 and 20%.'); return; }
    const rate = Math.round(pct * 100) / 10000;
    const { error } = await supabase.from('tax_rates').update({ rate, updated_at: new Date().toISOString() }).eq('area', r.area);
    if (error) { notify(`Could not save: ${error.message}`); return; }
    setRates(list => list.map(x => (x.area === r.area ? { ...x, rate } : x)));
    setEdits(e => { const n = { ...e }; delete n[r.area]; return n; });
    notify(`${r.area}: ${formatRate(rate)}`);
  };

  const shown = rates.filter(r => r.area.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <div className="bg-white rounded-lg shadow">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <div>
          <h4 className="font-semibold text-gray-900">Sales tax rates</h4>
          <p className="text-xs text-gray-500">Total rate (5% state + county, + city where it applies) for each area. Quotes fill this in from the event address.</p>
        </div>
        <span className="text-sm text-red-900">{open ? 'Hide' : `Show ${rates.length}`}</span>
      </button>
      {open && (
        <div className="border-t px-4 py-3 space-y-2">
          <input className="w-full sm:w-64 px-2 py-1.5 border border-gray-300 rounded-lg text-sm" placeholder="Find a county" value={filter} onChange={e => setFilter(e.target.value)} />
          <ul className="divide-y max-h-96 overflow-y-auto">
            {shown.map(r => (
              <li key={r.area} className="py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-gray-900">{r.area}</p>
                  {r.note && <p className="text-xs text-gray-500">{r.note}</p>}
                </div>
                <div className="flex items-center space-x-1 flex-shrink-0">
                  <input type="number" min="0" max="20" step="0.01" className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-sm text-right"
                    value={edits[r.area] ?? Math.round(Number(r.rate) * 10000) / 100}
                    onChange={e => setEdits(x => ({ ...x, [r.area]: e.target.value }))} />
                  <span className="text-sm text-gray-500">%</span>
                  {edits[r.area] !== undefined && <button onClick={() => save(r)} className="text-xs px-2 py-1 bg-red-900 text-white rounded-lg">Save</button>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
