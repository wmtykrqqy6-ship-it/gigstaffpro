import React, { useState, useEffect } from 'react';
import { Plus, Save } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../ui/Toast';
import { TruckSwatch } from './CapacityDisplay';

const NUMBER_FIELDS = [
  ['craps_capacity', 'Craps', 'Normal craps-zone units'],
  ['craps_stretch', 'Craps stretch', 'Max craps units incl. stretch (warning above normal)'],
  ['roulette_capacity', 'Roulette', null],
  ['poker_capacity', 'Poker', null],
  ['blackjack_capacity', 'Blackjack zone', null],
  ['priority', 'Priority', '1 = suggested first']
];

const BLANK = {
  name: '', color: '#9CA3AF', craps_capacity: 0, craps_stretch: 0, roulette_capacity: 0,
  poker_capacity: 0, blackjack_capacity: 0, can_carry_archway: false, priority: 99, active: true
};

function TruckCard({ truck, onSaved }) {
  const notify = useToast();
  const [form, setForm] = useState(truck);
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(truck), [truck]);

  const isNew = !truck.id;
  const dirty = JSON.stringify(form) !== JSON.stringify(truck);

  const save = async () => {
    if (!form.name.trim()) { notify('Truck name is required.'); return; }
    const payload = { ...form, name: form.name.trim(), updated_at: new Date().toISOString() };
    for (const [key] of NUMBER_FIELDS) payload[key] = Math.max(0, parseInt(payload[key], 10) || 0);
    if (payload.craps_stretch < payload.craps_capacity) payload.craps_stretch = payload.craps_capacity;
    delete payload.id;
    delete payload.created_at;
    setSaving(true);
    const { error } = isNew
      ? await supabase.from('trucks').insert([payload])
      : await supabase.from('trucks').update(payload).eq('id', truck.id);
    setSaving(false);
    if (error) { notify('Could not save truck: ' + error.message); return; }
    notify(`${payload.name} saved.`);
    onSaved();
  };

  return (
    <div className={`bg-white rounded-lg shadow p-4 ${form.active ? '' : 'opacity-60'}`}>
      <div className="flex items-center gap-2 mb-3">
        <label className="relative cursor-pointer" title="Truck color">
          <TruckSwatch color={form.color} size={22} />
          <input
            type="color"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Truck name"
          className="flex-1 min-w-0 px-2 py-1 border border-gray-300 rounded-lg font-semibold focus:ring-2 focus:ring-red-500 focus:border-transparent"
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {NUMBER_FIELDS.map(([key, label, hint]) => (
          <div key={key}>
            <label className="block text-xs font-semibold text-gray-700 mb-1" title={hint || undefined}>{label}</label>
            <input
              type="number"
              min="0"
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
        <div className="flex flex-wrap gap-4 text-sm text-gray-700">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!form.can_carry_archway} onChange={(e) => setForm({ ...form, can_carry_archway: e.target.checked })} />
            Can carry archway
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Active
          </label>
        </div>
        <button
          onClick={save}
          disabled={saving || (!dirty && !isNew)}
          className="bg-red-900 text-white px-3 py-1.5 rounded-lg hover:bg-red-800 text-sm flex items-center gap-1.5 disabled:opacity-40"
        >
          <Save size={14} /> {saving ? 'Saving…' : isNew ? 'Add truck' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export default function TruckSettings({ trucks, onChanged }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Trucks</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Zone capacities per load. Chairs use craps units (1–50 chairs = 1 unit); blackjack overflow rides in craps units at 6 per unit.
          </p>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} className="text-sm text-red-900 hover:text-red-800 flex items-center gap-1">
            <Plus size={16} /> Add truck
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {trucks.filter(t => t.kind !== 'personal').map(t => <TruckCard key={t.id} truck={t} onSaved={onChanged} />)}
        {adding && <TruckCard truck={BLANK} onSaved={() => { setAdding(false); onChanged(); }} />}
      </div>
      {trucks.filter(t => t.kind === 'personal').map(t => (
        <div key={t.id} className="space-y-2">
          <h4 className="text-lg font-bold text-gray-900">Personal vehicle</h4>
          <p className="text-sm text-gray-500">
            What fits in a crew member's own car, for small events delivered by one person. Every personal-vehicle
            delivery on the Dispatch board is checked against these numbers.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <TruckCard truck={t} onSaved={onChanged} />
          </div>
        </div>
      ))}
    </div>
  );
}
