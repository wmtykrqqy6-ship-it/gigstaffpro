import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import { isMissingSchemaError } from '../../utils/clientRecords';
import {
  PRICE_CATEGORIES, PRICE_UNITS, BONUS_KEY, formatPrice, unitLabel, packageSummary, validatePriceItem, groupPriceItems
} from '../../utils/priceList';

const input = 'w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm';

function ContentsEditor({ contents, tables, onChange }) {
  const rows = Array.isArray(contents) ? contents : [];
  const set = (i, patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-1">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center space-x-2">
          <input type="number" min="1" className={`${input} w-20`} value={r.qty} onChange={e => set(i, { qty: e.target.value })} />
          <select className={input} value={r.key} onChange={e => set(i, { key: e.target.value })}>
            <option value={BONUS_KEY}>Bonus game (client picks)</option>
            {tables.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
          </select>
          <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-700"><X size={16} /></button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...rows, { key: tables[0]?.key || BONUS_KEY, qty: 1 }])} className="text-xs text-red-900 hover:underline">+ Add a table</button>
    </div>
  );
}

function ItemEditor({ item, tables, onCancel, onSave, saving }) {
  const [form, setForm] = useState(() => ({ ...item, price: item.price ?? '', dealers: item.dealers ?? 0 }));
  const set = (patch) => setForm(f => ({ ...f, ...patch }));
  return (
    <div className="bg-gray-50 border rounded-lg p-3 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="text-xs text-gray-600">Name
          <input className={input} value={form.name || ''} onChange={e => set({ name: e.target.value })} />
        </label>
        <label className="text-xs text-gray-600">Category
          <select className={input} value={form.category} onChange={e => set({ category: e.target.value })}>
            {PRICE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-600">Price ($)
          <input type="number" step="0.01" className={input} value={form.unit === 'custom' ? '' : form.price} disabled={form.unit === 'custom'}
            placeholder={form.unit === 'custom' ? 'Set on each quote' : 'Leave blank to price on each quote'} onChange={e => set({ price: e.target.value })} />
        </label>
        <label className="text-xs text-gray-600">Charged
          <select className={input} value={form.unit} onChange={e => set({ unit: e.target.value })}>
            {PRICE_UNITS.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
        </label>
        {form.category === 'table' && (
          <>
            <label className="text-xs text-gray-600">Size / players
              <input className={input} value={form.size || ''} placeholder="7 players, 6 x 9 ft" onChange={e => set({ size: e.target.value })} />
            </label>
            <label className="text-xs text-gray-600">Dealers per table
              <input type="number" min="0" max="20" className={input} value={form.dealers} onChange={e => set({ dealers: e.target.value })} />
            </label>
          </>
        )}
      </div>
      {form.category === 'package' && (
        <div className="text-xs text-gray-600">What's included
          <ContentsEditor contents={form.contents} tables={tables} onChange={contents => set({ contents })} />
        </div>
      )}
      <label className="block text-xs text-gray-600">Description (shown to the client on the quote)
        <textarea rows={3} className={input} value={form.description || ''} onChange={e => set({ description: e.target.value })} />
      </label>
      <label className="block text-xs text-gray-600">Photo link (https://, optional)
        <input className={input} value={form.photo_url || ''} onChange={e => set({ photo_url: e.target.value })} />
      </label>
      <div className="flex flex-wrap gap-4 text-sm text-gray-700">
        <label className="flex items-center space-x-1"><input type="checkbox" checked={form.taxable !== false} onChange={e => set({ taxable: e.target.checked })} /><span>Add sales tax</span></label>
        {form.category === 'table' && (
          <label className="flex items-center space-x-1"><input type="checkbox" checked={!!form.bonus_game} onChange={e => set({ bonus_game: e.target.checked })} /><span>Counts as a bonus game</span></label>
        )}
        <label className="flex items-center space-x-1"><input type="checkbox" checked={form.active !== false} onChange={e => set({ active: e.target.checked })} /><span>Offer on quotes</span></label>
      </div>
      <div className="flex justify-end space-x-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">Cancel</button>
        <button type="button" disabled={saving} onClick={() => onSave(form)} className="px-3 py-1.5 bg-red-900 text-white rounded-lg text-sm hover:bg-red-800 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

// Settings > Prices (CRM Phase 2 step 1, docs/QUOTES.md): the price list
// quotes are built from. Admins and sales managers only (price_items RLS).
export default function PricesSettingsTab() {
  const notify = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [needsSql, setNeedsSql] = useState(false);
  const [editing, setEditing] = useState(null); // item id, or 'new:<category>'
  const [saving, setSaving] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.from('price_items').select('*').order('sort_order').order('name');
    setLoading(false);
    if (error) {
      if (isMissingSchemaError(error)) setNeedsSql(true);
      else notify(`Could not load prices: ${error.message}`);
      return;
    }
    setItems(data || []);
  };
  useEffect(() => { load(); }, []);

  const groups = useMemo(() => groupPriceItems(showHidden ? items : items.filter(i => i.active !== false)), [items, showHidden]);
  const tables = useMemo(() => items.filter(i => i.category === 'table'), [items]);
  const hiddenCount = items.filter(i => i.active === false).length;

  const save = async (form, existing) => {
    const { item, error } = validatePriceItem(form, { takenKeys: items.map(i => i.key) });
    if (error) { notify(error); return; }
    setSaving(true);
    const now = new Date().toISOString();
    const res = existing
      ? await supabase.from('price_items').update({ ...item, key: existing.key, updated_at: now }).eq('id', existing.id).select().single()
      : await supabase.from('price_items').insert([{ ...item, sort_order: (Math.max(0, ...items.map(i => i.sort_order || 0)) + 10) }]).select().single();
    setSaving(false);
    if (res.error) { notify(`Could not save: ${res.error.message}`); return; }
    setItems(list => (existing ? list.map(i => (i.id === existing.id ? res.data : i)) : [...list, res.data]));
    setEditing(null);
    notify('Saved');
  };

  const remove = async (item) => {
    const ok = await confirm(`Delete "${item.name}" from the price list? Quotes already sent keep their prices. To keep it but stop offering it, untick "Offer on quotes" instead.`);
    if (!ok) return;
    const { error } = await supabase.from('price_items').delete().eq('id', item.id);
    if (error) { notify(`Could not delete: ${error.message}`); return; }
    setItems(list => list.filter(i => i.id !== item.id));
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-900" /></div>;
  if (needsSql) {
    return <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-lg p-3">The price list turns on once the price list SQL file (20261127130000) has been run in Supabase.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-4 flex items-start justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Price list</h3>
          <p className="text-sm text-gray-600">What quotes charge for. Changes apply to new quotes; quotes already sent keep their prices.</p>
        </div>
        {hiddenCount > 0 && (
          <label className="text-sm text-gray-600 flex items-center space-x-1">
            <input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} /><span>Show {hiddenCount} not offered</span>
          </label>
        )}
      </div>

      {groups.map(g => (
        <div key={g.id} className="bg-white rounded-lg shadow">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h4 className="font-semibold text-gray-900">{g.label}</h4>
            <button onClick={() => setEditing(`new:${g.id}`)} className="text-sm text-red-900 hover:underline flex items-center space-x-1"><Plus size={14} /><span>Add</span></button>
          </div>
          <ul className="divide-y">
            {editing === `new:${g.id}` && (
              <li className="p-3">
                <ItemEditor item={{ category: g.id, unit: g.id === 'table' ? 'table' : 'each', dealers: g.id === 'table' ? 1 : 0, taxable: true, active: true }}
                  tables={tables} saving={saving} onCancel={() => setEditing(null)} onSave={form => save(form, null)} />
              </li>
            )}
            {g.items.length === 0 && editing !== `new:${g.id}` && <li className="px-4 py-3 text-sm text-gray-400">Nothing here yet.</li>}
            {g.items.map(item => (
              <li key={item.id} className="px-4 py-3">
                {editing === item.id ? (
                  <ItemEditor item={item} tables={tables} saving={saving} onCancel={() => setEditing(null)} onSave={form => save(form, item)} />
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`text-sm font-medium ${item.active === false ? 'text-gray-400' : 'text-gray-900'}`}>{item.name}</p>
                      <p className="text-xs text-gray-500">
                        {[item.size, item.category === 'table' && item.dealers ? `${item.dealers} dealer${item.dealers === 1 ? '' : 's'}` : null,
                          item.category === 'package' ? packageSummary(item.contents, items) : null].filter(Boolean).join(' · ')}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.taxable === false && <span className="text-xs bg-gray-100 text-gray-600 px-1.5 rounded-full">No tax added</span>}
                        {item.bonus_game && <span className="text-xs bg-gray-100 text-gray-600 px-1.5 rounded-full">Bonus game</span>}
                        {item.active === false && <span className="text-xs bg-gray-100 text-gray-600 px-1.5 rounded-full">Not offered</span>}
                        {!item.description && item.category === 'table' && <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-1.5 rounded-full">No description yet</span>}
                      </div>
                    </div>
                    <div className="flex items-center space-x-3 flex-shrink-0">
                      <span className="text-sm text-gray-900 text-right">{formatPrice(item.price)}{item.price !== null && item.price !== undefined && <span className="text-xs text-gray-500"> {unitLabel(item.unit)}</span>}</span>
                      <button onClick={() => setEditing(item.id)} className="text-gray-400 hover:text-gray-700" aria-label="Edit"><Pencil size={15} /></button>
                      <button onClick={() => remove(item)} className="text-gray-400 hover:text-red-700" aria-label="Delete"><Trash2 size={15} /></button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
