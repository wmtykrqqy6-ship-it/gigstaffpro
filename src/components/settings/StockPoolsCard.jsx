import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../ui/Toast';

// Settings > Prices: "Tables you own" (docs/QUOTES.md step 4). How many of
// each kind of table you have; quotes check availability against these.
export default function StockPoolsCard({ pools, onChange }) {
  const notify = useToast();
  const [edits, setEdits] = useState({});

  const save = async (p) => {
    const owned = Math.floor(Number(edits[p.key]));
    if (!Number.isFinite(owned) || owned < 0 || owned > 10000) { notify('Enter a whole number.'); return; }
    const { error } = await supabase.from('stock_pools').update({ owned, updated_at: new Date().toISOString() }).eq('key', p.key);
    if (error) { notify(`Could not save: ${error.message}`); return; }
    onChange(pools.map(x => (x.key === p.key ? { ...x, owned } : x)));
    setEdits(e => { const n = { ...e }; delete n[p.key]; return n; });
    notify(`${p.name}: ${owned}`);
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-4 py-3 border-b">
        <h4 className="font-semibold text-gray-900">Tables you own</h4>
        <p className="text-xs text-gray-500">Quotes check these counts against other parties during the same delivery-to-pickup hours. Bonus games (Three Card, Let It Ride, Ultimate Hold'em, Casino War) share the bonus game tables.</p>
      </div>
      <ul className="divide-y">
        {pools.map(p => (
          <li key={p.key} className="px-4 py-2 flex items-center justify-between gap-2">
            <span className="text-sm text-gray-900">{p.name}</span>
            <div className="flex items-center space-x-1">
              <input type="number" min="0" className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-sm text-right"
                value={edits[p.key] ?? p.owned} onChange={e => setEdits(x => ({ ...x, [p.key]: e.target.value }))} />
              {edits[p.key] !== undefined && <button onClick={() => save(p)} className="text-xs px-2 py-1 bg-red-900 text-white rounded-lg">Save</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
