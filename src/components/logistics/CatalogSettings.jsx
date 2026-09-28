import React, { useState } from 'react';
import { Trash2, Search } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import { SIZE_CLASSES, SIZE_CLASS_LABELS } from '../../utils/logistics/catalog';

export default function CatalogSettings({ catalog, onChanged }) {
  const notify = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState(null);

  const updateClass = async (row, sizeClass) => {
    setSavingId(row.id);
    const { error } = await supabase
      .from('equipment_catalog')
      .update({ size_class: sizeClass, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    setSavingId(null);
    if (error) { notify('Could not update: ' + error.message); return; }
    onChanged();
  };

  const remove = async (row) => {
    if (!(await confirm(`Remove "${row.goodshuffle_name}" from the catalog? You'll be asked to classify it again on the next import that includes it.`))) return;
    const { error } = await supabase.from('equipment_catalog').delete().eq('id', row.id);
    if (error) { notify('Could not remove: ' + error.message); return; }
    onChanged();
  };

  const q = search.trim().toLowerCase();
  const rows = q ? catalog.filter(r => r.goodshuffle_name.toLowerCase().includes(q) || r.size_class.includes(q)) : catalog;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-bold text-gray-900">Equipment Catalog</h3>
        <p className="text-sm text-gray-500 mt-0.5">
          How each Goodshuffle item name counts toward truck capacity. Changes apply to future imports; re-import a pull sheet to refresh an existing event.
        </p>
      </div>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items…"
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
        />
      </div>
      <div className="bg-white rounded-lg shadow divide-y">
        {rows.length === 0 && <div className="p-6 text-center text-sm text-gray-500">No items.</div>}
        {rows.map(row => (
          <div key={row.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2">
            <span className="text-sm text-gray-900">{row.goodshuffle_name}</span>
            <div className="flex items-center gap-2">
              <select
                value={row.size_class}
                disabled={savingId === row.id}
                onChange={(e) => updateClass(row, e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
              >
                {SIZE_CLASSES.map(c => <option key={c} value={c}>{SIZE_CLASS_LABELS[c]}</option>)}
              </select>
              <button onClick={() => remove(row)} className="text-gray-400 hover:text-red-700 p-1" title="Remove">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
