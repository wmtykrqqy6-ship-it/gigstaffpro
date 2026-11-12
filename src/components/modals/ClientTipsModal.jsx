import React, { useState, useEffect, useMemo } from 'react';
import { X, Gift, AlertTriangle } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { getPositionLabel, isAssignmentFilled } from '../../utils/positionHelpers';
import { parseDateSafe } from '../../utils/dateHelpers';
import { splitEvenly, sumDollars, sameDollars, tipOf, parseShare } from '../../utils/tipHelpers';
import { useToast } from '../ui/Toast';

// Payments -> Client Tips. The admin picks an event, enters the total tip
// the client gave, and it is split evenly among the workers who worked it.
// Untick anyone who shouldn't share (no-shows from the post-event report
// start unticked). Any share can be typed over before saving, but the
// shares must add up to the total. See src/utils/tipHelpers.js.
export default function ClientTipsModal({ events, assignments, workers, initialEventId, onClose, onSaved }) {
  const notify = useToast();
  const [eventId, setEventId] = useState(initialEventId || '');
  const [total, setTotal] = useState('');
  const [included, setIncluded] = useState({}); // assignmentId -> bool
  const [shares, setShares] = useState({});     // assignmentId -> string as typed
  const [noShowWorkerIds, setNoShowWorkerIds] = useState(new Set());
  const [saving, setSaving] = useState(false);

  // Events that have someone on them, most recent first.
  const eventOptions = useMemo(() => {
    const withStaff = new Set(assignments.filter(a => isAssignmentFilled(a.status)).map(a => a.event_id));
    return events
      .filter(e => withStaff.has(e.id))
      .sort((a, b) => parseDateSafe(b.date) - parseDateSafe(a.date));
  }, [events, assignments]);

  const event = events.find(e => e.id === eventId);

  // Everyone who worked this event (not standby / pending / declined).
  const crew = useMemo(() => assignments
    .filter(a => a.event_id === eventId && isAssignmentFilled(a.status))
    .map(a => ({ ...a, worker: workers.find(w => w.id === a.worker_id) }))
    .filter(a => a.worker)
    .sort((a, b) => a.worker.name.localeCompare(b.worker.name)),
  [assignments, workers, eventId]);

  // Load no-shows from the post-event report so they start unticked.
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    supabase
      .from('attendance_records')
      .select('worker_id, status')
      .eq('event_id', eventId)
      .then(({ data }) => {
        if (cancelled) return;
        setNoShowWorkerIds(new Set((data || []).filter(r => r.status === 'no_show').map(r => r.worker_id)));
      });
    return () => { cancelled = true; };
  }, [eventId]);

  // When the event changes, start from what's saved: the client total and
  // each person's current tip. With nothing saved yet, everyone (except
  // no-shows) is ticked.
  useEffect(() => {
    if (!event) return;
    const anySaved = crew.some(a => tipOf(a) > 0);
    const savedTotal = event.client_tip_total != null ? Number(event.client_tip_total) : sumDollars(crew.map(tipOf));
    setTotal(savedTotal > 0 ? String(savedTotal) : '');
    const inc = {};
    const sh = {};
    crew.forEach(a => {
      inc[a.id] = anySaved ? tipOf(a) > 0 : !noShowWorkerIds.has(a.worker_id);
      sh[a.id] = tipOf(a) > 0 ? tipOf(a).toFixed(2) : '';
    });
    setIncluded(inc);
    setShares(sh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, crew.length, noShowWorkerIds]);

  const resplit = (nextTotal = total, nextIncluded = included) => {
    const ids = crew.filter(a => nextIncluded[a.id]).map(a => a.id);
    const amounts = splitEvenly(parseShare(nextTotal), ids.length);
    const sh = {};
    crew.forEach(a => { sh[a.id] = ''; });
    ids.forEach((id, i) => { sh[id] = amounts[i] > 0 ? amounts[i].toFixed(2) : ''; });
    setShares(sh);
  };

  const onTotalChange = (value) => {
    setTotal(value);
    resplit(value, included);
  };

  const toggle = (id) => {
    const next = { ...included, [id]: !included[id] };
    setIncluded(next);
    resplit(total, next);
  };

  const totalNum = parseShare(total);
  const sharesSum = sumDollars(crew.map(a => (included[a.id] ? parseShare(shares[a.id]) : 0)));
  const balanced = sameDollars(sharesSum, totalNum);
  const includedCount = crew.filter(a => included[a.id]).length;

  // People already marked paid whose tip would change: saving moves them
  // back to Pending so the tip isn't missed.
  const paidAndChanging = crew.filter(a => {
    const next = included[a.id] ? parseShare(shares[a.id]) : 0;
    return a.payment_status === 'paid' && !sameDollars(next, tipOf(a));
  });

  const handleSave = async () => {
    if (!event) return;
    if (!balanced) {
      notify(`The shares add up to $${sharesSum.toFixed(2)} but the tip is $${totalNum.toFixed(2)}.`);
      return;
    }
    setSaving(true);
    try {
      const changes = crew
        .map(a => ({ a, next: included[a.id] ? parseShare(shares[a.id]) : 0 }))
        .filter(({ a, next }) => !sameDollars(next, tipOf(a)));

      for (const { a, next } of changes) {
        const update = { tip_amount: next };
        if (a.payment_status === 'paid') {
          update.payment_status = 'pending';
          update.paid_at = null;
        }
        const { error } = await supabase.from('assignments').update(update).eq('id', a.id);
        if (error) throw error;
      }

      const { error: eventError } = await supabase
        .from('events')
        .update({ client_tip_total: totalNum > 0 ? totalNum : null })
        .eq('id', event.id);
      if (eventError) throw eventError;

      notify(totalNum > 0
        ? `Saved $${totalNum.toFixed(2)} in tips for ${event.name}.`
        : `Removed tips for ${event.name}.`);
      if (onSaved) await onSaved();
      onClose();
    } catch (error) {
      notify('Error saving tips: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-5">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Gift size={24} className="text-red-900" /> Client Tips
              </h3>
              <p className="text-sm text-gray-600 mt-1">Split evenly among the people who worked the event.</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
              <X size={24} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Event</span>
              <select
                value={eventId}
                onChange={e => setEventId(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Choose an event…</option>
                {eventOptions.map(e => (
                  <option key={e.id} value={e.id}>
                    {parseDateSafe(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {e.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Total tip from the client</span>
              <div className="mt-1 relative">
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={total}
                  onChange={e => onTotalChange(e.target.value)}
                  disabled={!event}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                />
              </div>
            </label>
          </div>

          {event && crew.length === 0 && (
            <p className="text-sm text-gray-500">Nobody is on this event yet.</p>
          )}

          {event && crew.length > 0 && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">
                  Sharing: {includedCount} of {crew.length}
                </span>
                <button
                  type="button"
                  onClick={() => resplit()}
                  className="text-sm text-red-900 hover:underline font-medium"
                >
                  Re-split evenly
                </button>
              </div>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-200">
                {crew.map(a => (
                  <div key={a.id} className="flex items-center gap-3 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={!!included[a.id]}
                      onChange={() => toggle(a.id)}
                      className="h-4 w-4"
                      aria-label={`Include ${a.worker.name}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {a.worker.name}
                        {noShowWorkerIds.has(a.worker_id) && <span className="ml-2 text-xs text-red-600">no-show</span>}
                        {a.worker.payment_type === 'employee' && <span className="ml-2 text-xs text-purple-700">W-2</span>}
                      </p>
                      <p className="text-xs text-gray-500">{getPositionLabel(a.position)}</p>
                    </div>
                    <div className="relative w-28">
                      <span className="absolute left-2 top-1.5 text-gray-400 text-sm">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={included[a.id] ? (shares[a.id] ?? '') : ''}
                        onChange={e => setShares({ ...shares, [a.id]: e.target.value })}
                        disabled={!included[a.id]}
                        className="w-full pl-5 pr-2 py-1 border border-gray-300 rounded text-sm text-right disabled:bg-gray-100"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className={`mt-2 text-sm text-right ${balanced ? 'text-gray-600' : 'text-red-700 font-medium'}`}>
                Shares add up to ${sharesSum.toFixed(2)}
                {!balanced && ` (tip is $${totalNum.toFixed(2)})`}
              </div>
            </div>
          )}

          {paidAndChanging.length > 0 && (
            <div className="flex gap-2 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-900">
              <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
              <span>
                Already marked paid: {paidAndChanging.map(a => a.worker.name).join(', ')}.
                Saving moves them back to Pending so the tip change isn't missed.
              </span>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-200 text-gray-800 hover:bg-gray-300 font-medium">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!event || saving || !balanced || crew.length === 0}
              className="px-4 py-2 rounded-lg bg-red-900 text-white hover:bg-red-800 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Save Tips'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
