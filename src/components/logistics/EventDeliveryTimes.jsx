import React, { useState, useEffect, useCallback } from 'react';
import { Truck, Car, AlertTriangle } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../ui/Toast';
import { parseDateSafe } from '../../utils/dateHelpers';
import { updateStop, isMissingSchemaError } from './logisticsData';

// "Delivery & pickup" section of the Edit Event form: this event's stops from
// the Logistics dispatch plan, grouped by vehicle, with editable times. Saves
// straight to run_stops (the same rows the dispatch board edits), so both
// places always show the same times. Renders nothing before the logistics
// tables exist.
const ORDER = { deliver: 0, work: 1, pickup: 2 };
const LABEL = { deliver: 'Deliver', work: 'Dealing', pickup: 'Pick up' };

export default function EventDeliveryTimes({ event, eventDate, workers = [] }) {
  const notify = useToast();
  const [stops, setStops] = useState(null); // null = loading / unavailable

  const load = useCallback(async () => {
    if (!event?.id) return;
    const { data, error } = await supabase
      .from('run_stops')
      .select('id, stop_type, scheduled_start, scheduled_end, run_id, load_id, daily_runs(run_date, is_personal, worker1_id, worker2_id, trucks(name, color))')
      .eq('event_id', event.id);
    if (error) {
      if (!isMissingSchemaError(error)) console.error('Could not load delivery times:', error);
      setStops(undefined);
      return;
    }
    setStops(data || []);
  }, [event?.id]);

  useEffect(() => { load(); }, [load]);

  if (stops === undefined) return null; // logistics not set up
  if (stops === null) return null;      // still loading -- keep the form steady

  const nameOf = (id) => workers.find(w => w.id === id)?.name;
  const byRun = {};
  for (const s of stops.filter(s => s.stop_type in ORDER)) (byRun[s.run_id] ||= []).push(s);
  const runs = Object.values(byRun).map(list => list.sort((a, b) => ORDER[a.stop_type] - ORDER[b.stop_type]));
  const plannedDate = stops[0]?.daily_runs?.run_date;
  const dateMoved = plannedDate && eventDate && plannedDate !== String(eventDate).split('T')[0];

  const save = async (stop, field, value) => {
    try {
      await updateStop(stop.id, { [field]: value || null });
      setStops(prev => prev.map(s => (s.id === stop.id ? { ...s, [field]: value || null } : s)));
    } catch (err) {
      notify('Could not save the time: ' + (err.message || err));
    }
  };

  return (
    <div>
      <h4 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2"><Truck size={18} /> Delivery &amp; pickup</h4>
      {runs.length === 0 ? (
        <p className="text-sm text-gray-500">Not on a truck yet — plan it in Logistics → Dispatch.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">From the Logistics plan. Times save right away and show up there too.</p>
          {dateMoved && (
            <div className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-2">
              <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
              The truck plan is still on {parseDateSafe(plannedDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}.
              Re-plan it in Logistics for the new date.
            </div>
          )}
          {runs.map(list => {
            const run = list[0].daily_runs || {};
            const crew = [nameOf(run.worker1_id), nameOf(run.worker2_id)].filter(Boolean).join(' & ');
            return (
              <div key={list[0].run_id} className="border border-gray-200 rounded-lg p-3">
                <div className="text-sm font-medium text-gray-900 flex items-center gap-2 mb-2">
                  {run.is_personal
                    ? <><Car size={15} className="text-gray-500" /> Personal vehicle</>
                    : <><span className="inline-block w-3 h-3 rounded-full border border-gray-400" style={{ backgroundColor: run.trucks?.color || '#9CA3AF' }} /> {run.trucks?.name || 'Truck'}</>}
                  {crew && <span className="text-gray-500 font-normal">— {crew}</span>}
                </div>
                <div className="space-y-1.5">
                  {list.map(stop => (
                    <div key={stop.id} className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-gray-600 w-16">{LABEL[stop.stop_type]}</span>
                      <TimeField value={stop.scheduled_start} onSave={(v) => save(stop, 'scheduled_start', v)} />
                      <span className="text-xs text-gray-400">to</span>
                      <TimeField value={stop.scheduled_end} onSave={(v) => save(stop, 'scheduled_end', v)} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Saves on blur/enter.
function TimeField({ value, onSave }) {
  const [v, setV] = useState((value || '').slice(0, 5));
  useEffect(() => setV((value || '').slice(0, 5)), [value]);
  return (
    <input
      type="time"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== (value || '').slice(0, 5)) onSave(v); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
      className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
    />
  );
}
