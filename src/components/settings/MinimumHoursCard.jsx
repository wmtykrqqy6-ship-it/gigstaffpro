import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../ui/Toast';
import {
  MIN_HOURS_SETTING_KEY, parseMinHoursRule, serializeMinHoursRule, defaultMinHoursPositions, normalizePositionKey
} from '../../utils/payHelpers';
import { crewRoles, warehouseKeys } from '../../utils/logistics/dispatch';

// Settings -> Pay Rates: "Minimum paid hours per shift". Stored as one row in
// `settings` (see payHelpers.js). Off until saved; turning it off deletes
// nothing -- it saves hours 0, which means "no minimum".
export default function MinimumHoursCard({ positions = [], onSaved }) {
  const notify = useToast();
  const crewKeys = (() => {
    const roles = crewRoles(positions);
    return new Set([...roles.driverKeys, ...roles.setupKeys, ...warehouseKeys(positions)]);
  })();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [hours, setHours] = useState(3);
  const [selected, setSelected] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('settings')
        .select('setting_value')
        .eq('setting_key', MIN_HOURS_SETTING_KEY)
        .maybeSingle();
      if (cancelled) return;
      const rule = parseMinHoursRule(data?.setting_value);
      if (rule) {
        setEnabled(true);
        setHours(rule.hours);
        // A position is ticked if its key or its label form was saved
        const saved = new Set(rule.positions);
        setSelected(new Set(positions
          .filter(p => p?.key && (saved.has(normalizePositionKey(p.key)) || saved.has(normalizePositionKey(p.label))))
          .map(p => normalizePositionKey(p.key))));
      } else {
        // Suggested starting point: dealers + Host (everything but the crew roles)
        setSelected(new Set(defaultMinHoursPositions(positions, crewKeys)));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions.length]);

  const toggle = (key) => setSelected(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const save = async () => {
    const h = Number(hours);
    if (enabled && !(h > 0)) { notify('Enter the minimum number of hours'); return; }
    if (enabled && selected.size === 0) { notify('Pick at least one position'); return; }
    setSaving(true);
    try {
      // Save each ticked position's key AND label form: estimates pass labels
      // ("Set Up Driver"), assignments pass keys ("driver").
      const forms = positions
        .filter(p => p?.key && selected.has(normalizePositionKey(p.key)))
        .flatMap(p => [p.key, p.label].filter(Boolean));
      const value = serializeMinHoursRule({ hours: enabled ? h : 0, positions: [...new Set(forms.map(normalizePositionKey))] });
      const { data: existing } = await supabase
        .from('settings').select('id').eq('setting_key', MIN_HOURS_SETTING_KEY).maybeSingle();
      const { error } = existing
        ? await supabase.from('settings')
            .update({ setting_value: value, updated_at: new Date().toISOString() })
            .eq('setting_key', MIN_HOURS_SETTING_KEY)
        : await supabase.from('settings').insert([{ setting_key: MIN_HOURS_SETTING_KEY, setting_value: value }]);
      if (error) throw error;
      notify(enabled ? `Saved — ${h}-hour minimum is on` : 'Saved — minimum is off');
      onSaved?.();
    } catch (e) {
      notify('Could not save: ' + (e.message || 'unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center space-x-2 mb-1">
        <Clock size={20} className="text-red-900" />
        <h3 className="text-xl font-bold text-gray-900">Minimum Paid Hours</h3>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Pay at least this many hours per shift, even when the event is shorter (a 2-hour party pays 3 hours).
        Applies to contractors (1099) only — W-2 employees are paid their actual hours. Flat-pay events aren't affected.
      </p>
      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="h-4 w-4" />
            Pay a minimum of
            <input
              type="number" min="0.5" step="0.5" value={hours}
              onChange={e => setHours(e.target.value)}
              disabled={!enabled}
              className="w-20 px-2 py-1 border border-gray-300 rounded disabled:bg-gray-100"
            />
            hours per shift
          </label>

          <div className={enabled ? '' : 'opacity-50 pointer-events-none'}>
            <p className="text-xs font-semibold text-gray-600 mb-2">For these positions:</p>
            <div className="flex flex-wrap gap-2">
              {positions.filter(p => p?.key).map(p => {
                const key = normalizePositionKey(p.key);
                const on = selected.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggle(key)}
                    className={`px-3 py-1.5 rounded-full text-sm border ${on ? 'bg-red-900 text-white border-red-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                  >
                    {on ? '✓ ' : ''}{p.label || p.key}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 bg-red-900 text-white rounded-lg text-sm font-medium hover:bg-red-800 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}
