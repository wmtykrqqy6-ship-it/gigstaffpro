import React, { useState, useEffect } from 'react';
import ImportPullSheetModal from './ImportPullSheetModal';
import { useToast } from '../ui/Toast';
import { loadTrucks, loadCatalog, loadEventEquipment, isMissingSchemaError, LOGISTICS_MIGRATION } from './logisticsData';

// Opens the Goodshuffle pull sheet import from anywhere in the app (e.g. the
// Create Event form on the Dashboard / Events pages), loading what the
// Logistics tab normally provides: trucks, the equipment catalog, and the
// saved equipment of already-imported events (for the re-import diff).
export default function PullSheetImportLauncher({ open, onClose, onImported, events = [], positions, workers, assignments, timeFormat }) {
  const notify = useToast();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!open) { setData(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const importedIds = events.filter(e => e.goodshuffle_invoice).map(e => e.id);
        const [trucks, catalog, rows] = await Promise.all([loadTrucks(), loadCatalog(), loadEventEquipment(importedIds)]);
        const equipmentByEvent = {};
        for (const r of rows) (equipmentByEvent[r.event_id] ||= []).push(r);
        if (!cancelled) setData({ trucks, catalog, equipmentByEvent });
      } catch (err) {
        if (cancelled) return;
        notify(isMissingSchemaError(err)
          ? `Pull sheet import isn't set up yet — run ${LOGISTICS_MIGRATION}.`
          : 'Could not open the pull sheet import: ' + (err.message || err));
        onClose();
      }
    })();
    return () => { cancelled = true; };
    // Load once per opening; events changing underneath doesn't need a reload.
  }, [open]);

  if (!open || !data) return null;

  return (
    <ImportPullSheetModal
      open
      onClose={onClose}
      onImported={onImported}
      events={events}
      trucks={data.trucks}
      catalog={data.catalog}
      equipmentByEvent={data.equipmentByEvent}
      positions={positions}
      workers={workers}
      assignments={assignments}
      timeFormat={timeFormat}
    />
  );
}
