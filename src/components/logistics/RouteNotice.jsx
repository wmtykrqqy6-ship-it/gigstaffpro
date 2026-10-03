import React, { useState, useEffect } from 'react';
import { Truck, Car, ChevronRight } from 'lucide-react';
import { loadWorkerRoutes, loadTrucks } from './logisticsData';

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// One slim line on the worker Dashboard when they're on a vehicle today or
// tomorrow, linking to the Logistics tab. Keeps the Dashboard about staffing
// while making sure nobody misses a route -- including someone put on a
// truck without the crew tags. Renders nothing otherwise.
export default function RouteNotice({ worker, onOpen }) {
  const [runs, setRuns] = useState([]);
  const [trucksById, setTrucksById] = useState({});

  useEffect(() => {
    if (!worker?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const now = new Date();
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
        const [{ mine, day }, trucks] = await Promise.all([
          loadWorkerRoutes(worker.id, ymd(now), ymd(tomorrow)),
          loadTrucks()
        ]);
        if (cancelled) return;
        setRuns(mine.map(r => ({ ...r, stopCount: day.stops.filter(s => s.run_id === r.id).length })).filter(r => r.stopCount > 0));
        setTrucksById(Object.fromEntries(trucks.map(t => [t.id, t])));
      } catch {
        // Logistics not set up or unreachable: just don't show the line.
      }
    })();
    return () => { cancelled = true; };
  }, [worker?.id]);

  if (!runs.length) return null;
  const today = ymd(new Date());

  return (
    <div className="space-y-2">
      {runs.map(run => {
        const when = run.run_date === today ? 'today' : 'tomorrow';
        const vehicle = run.is_personal ? 'doing a delivery in your own vehicle' : `on the ${trucksById[run.truck_id]?.name || ''} truck`.replace('  ', ' ');
        return (
          <button
            key={run.id}
            onClick={onOpen}
            className="w-full flex items-center gap-3 bg-white rounded-lg shadow px-4 py-3 text-left hover:bg-gray-50"
          >
            {run.is_personal ? <Car size={18} className="text-red-900 flex-shrink-0" /> : <Truck size={18} className="text-red-900 flex-shrink-0" />}
            <span className="flex-1 text-sm text-gray-800">
              You're {vehicle} <strong>{when}</strong> · {run.stopCount} stop{run.stopCount === 1 ? '' : 's'}
            </span>
            <span className="text-sm font-medium text-red-900 inline-flex items-center gap-0.5 flex-shrink-0">View route <ChevronRight size={16} /></span>
          </button>
        );
      })}
    </div>
  );
}
