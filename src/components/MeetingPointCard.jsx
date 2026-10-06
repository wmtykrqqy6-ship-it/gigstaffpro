import React, { useState } from 'react';
import { workerFetch } from '../utils/workerApi';
import { MapPin, Crosshair } from 'lucide-react';
import { useToast } from './ui/Toast';
import { meetingPointOf, meetingPointWindowOpen } from '../utils/meetingPoint';

const fmtSetAt = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
};

// Meeting point on a worker's shift card or crew route stop. Everyone sees
// the spot ("Open in Maps"); the Host and the setup crew (canSet) can also
// drop the pin where they're standing, from the day before through the event
// day. The server re-checks who and when (api/_lib/meetingPoint.js).
export default function MeetingPointCard({ event, worker, canSet = false, className = '' }) {
  const notify = useToast();
  const [override, setOverride] = useState(null); // pin just set from this phone
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const point = meetingPointOf(override ? { ...event, ...override } : event);
  const showSetter = canSet && worker?.id && meetingPointWindowOpen(event?.date);
  if (!point && !showSetter) return null;

  const startEditing = () => { setNote(point?.description || ''); setEditing(true); };

  const setHere = () => {
    if (!navigator.geolocation) { notify('This phone can’t share its location.'); return; }
    setSaving(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      try {
        const res = await workerFetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'setMeetingPoint', workerId: worker.id, eventId: event.id, lat, lng, description: note })
        });
        const result = await res.json();
        if (!result.ok) throw new Error(result.error || 'Could not save the meeting point');
        setOverride(result.meetingPoint);
        setEditing(false);
        notify(accuracy > 75
          ? `Meeting point saved. GPS was fuzzy (±${Math.round(accuracy)} m) — if it looks off in Maps, step outside and set it again.`
          : 'Meeting point saved — everyone on this event can see it now.');
      } catch (err) {
        notify(err.message);
      } finally {
        setSaving(false);
      }
    }, () => {
      setSaving(false);
      notify('Couldn’t get your location. Allow location access for this site and try again.');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };

  return (
    <div className={`p-3 bg-blue-50 border border-blue-200 rounded-lg ${className}`}>
      <p className="text-sm font-semibold text-blue-900 mb-1">📍 Meeting Point</p>
      {point ? (
        <>
          {point.description && <p className="text-sm text-blue-800">{point.description}</p>}
          {point.url && (
            <a href={point.url} target="_blank" rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 text-sm font-medium mt-1 inline-flex items-center space-x-1">
              <MapPin size={13} /><span>Open Meeting Point in Maps</span>
            </a>
          )}
          {point.setByName && (
            <p className="text-xs text-blue-600 mt-1">Set by {point.setByName}{point.setAt ? `, ${fmtSetAt(point.setAt)}` : ''}</p>
          )}
        </>
      ) : (
        <p className="text-sm text-blue-800">Not set yet.</p>
      )}

      {showSetter && !editing && (
        <button onClick={startEditing} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 px-3 py-1.5 rounded-lg">
          <Crosshair size={14} /> {point?.hasPin ? 'Move meeting point here' : 'Set meeting point here'}
        </button>
      )}
      {showSetter && editing && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-blue-800">Stand at the spot where everyone should meet, then tap the button.</p>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            maxLength={200}
            placeholder="Note (optional) — e.g. Ballroom B, north doors"
            className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-400"
          />
          <div className="flex gap-2">
            <button onClick={setHere} disabled={saving} className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 px-3 py-2 rounded-lg disabled:opacity-50">
              <Crosshair size={14} /> {saving ? 'Getting your location…' : 'Use where I’m standing'}
            </button>
            <button onClick={() => setEditing(false)} disabled={saving} className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg bg-white">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
