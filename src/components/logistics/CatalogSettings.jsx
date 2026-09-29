import React, { useState } from 'react';
import { Trash2, Search } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import { SIZE_CLASSES, SIZE_CLASS_LABELS } from '../../utils/logistics/catalog';

export default function CatalogSettings({ catalog, positions = [], onChanged }) {
  const notify = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState(null);

  // Staffing columns exist once 20260930120000_add_catalog_staffing.sql is run.
  const staffingEnabled = catalog.some(row => 'staff_per_unit' in row);

  const updateRow = async (row, patch) => {
    setSavingId(row.id);
    const { error } = await supabase
      .from('equipment_catalog')
      .update({ ...patch, updated_at: new Date().toISOString() })
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
          How each Goodshuffle item name counts toward truck capacity{staffingEnabled ? ', and how many staff each one needs' : ''}. Changes apply to future imports; re-import a pull sheet to refresh an existing event.
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
            <div className="flex flex-wrap items-center gap-2">
              {staffingEnabled && (
                <StaffingInput row={row} positions={positions} disabled={savingId === row.id} onSave={(patch) => updateRow(row, patch)} />
              )}
              <select
                value={row.size_class}
                disabled={savingId === row.id}
                onChange={(e) => updateRow(row, { size_class: e.target.value })}
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

// "needs [2] × [Craps Dealer]" per catalog item. Count saves on blur.
function StaffingInput({ row, positions, disabled, onSave }) {
  const [count, setCount] = useState(String(row.staff_per_unit || 0));
  React.useEffect(() => setCount(String(row.staff_per_unit || 0)), [row.staff_per_unit]);
  const hasPosition = !!row.position_key;
  const known = positions.some(p => p.key === row.position_key);
  return (
    <div className="flex items-center gap-1 text-xs text-gray-600">
      <span>staff:</span>
      <input
        type="number"
        min="0"
        value={hasPosition ? count : 0}
        disabled={disabled || !hasPosition}
        onChange={(e) => setCount(e.target.value)}
        onBlur={() => {
          const n = Math.max(0, parseInt(count, 10) || 0);
          if (n !== (row.staff_per_unit || 0)) onSave({ staff_per_unit: n });
        }}
        className="w-12 px-1.5 py-1.5 border border-gray-300 rounded-lg text-sm disabled:bg-gray-50"
        title="Staff per unit (per table)"
      />
      <span>×</span>
      <select
        value={row.position_key || ''}
        disabled={disabled}
        onChange={(e) => {
          const key = e.target.value || null;
          onSave({ position_key: key, staff_per_unit: key ? Math.max(1, row.staff_per_unit || 0) : 0 });
        }}
        className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
      >
        <option value="">No staff</option>
        {!known && row.position_key && <option value={row.position_key}>{row.position_key}</option>}
        {positions.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>
    </div>
  );
}
