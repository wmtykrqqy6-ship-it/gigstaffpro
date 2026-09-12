import React, { useState, useEffect } from 'react';
import { X, Send } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { renderEmailShell } from '../../utils/emailShell';
import { escapeHtml } from '../../utils/escapeHtml';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';

const RANK_LEVELS = [1, 2, 3, 4, 5];

// A free-text broadcast tool -- every other email this app sends (invites,
// reminders, availability notices) is tied to a specific shift or event.
// There was previously no way for an admin to just tell some or all of
// their staff something ("road closed near tonight's venue", "need one
// more bartender Friday") without it riding on one of those structured
// flows. Recipients are computed live from whatever's already loaded
// (workers/assignments/locations) rather than a saved audience concept --
// there was no request for reusable named groups, just ad hoc targeting.
export default function MessageStaffModal({
  open,
  workers,
  events,
  assignments,
  onClose,
  onSessionExpired,
}) {
  const notify = useToast();
  const confirm = useConfirm();

  const [audienceType, setAudienceType] = useState('all'); // 'all' | 'event'
  const [selectedEventId, setSelectedEventId] = useState('');
  const [eventInviteeIds, setEventInviteeIds] = useState(new Set());
  const [rankAll, setRankAll] = useState(true);
  const [selectedRanks, setSelectedRanks] = useState(new Set());
  const [locationId, setLocationId] = useState('all');
  const [locations, setLocations] = useState([]);
  const [workerLocationMap, setWorkerLocationMap] = useState({});
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null); // { sent, failed, total }

  // Reset per-open state so a previous send's targeting/content doesn't
  // linger into the next time this modal is opened, and load location data
  // fresh each time -- self-contained the same way StaffView.jsx loads its
  // own locations/worker_locations rather than threading them down as props.
  useEffect(() => {
    if (!open) return;
    setAudienceType('all');
    setSelectedEventId('');
    setEventInviteeIds(new Set());
    setRankAll(true);
    setSelectedRanks(new Set());
    setLocationId('all');
    setSubject('');
    setMessage('');
    setSendResult(null);

    supabase
      .from('locations')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setLocations(data || []));

    supabase
      .from('worker_locations')
      .select('worker_id, location_id')
      .eq('approved', true)
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(({ worker_id, location_id }) => {
          if (!map[worker_id]) map[worker_id] = [];
          map[worker_id].push(location_id);
        });
        setWorkerLocationMap(map);
      });
  }, [open]);

  // "Staff of Event" needs everyone with any claim on that event --
  // assigned/standby (already loaded as a prop) AND invited (not loaded
  // anywhere else in this view, so fetched on demand only once an event is
  // actually picked, mirroring this file's own pattern of fetching
  // locations/worker_locations itself rather than always going through
  // props).
  useEffect(() => {
    if (audienceType !== 'event' || !selectedEventId) {
      setEventInviteeIds(new Set());
      return;
    }
    let cancelled = false;
    supabase
      .from('invitations')
      .select('worker_id')
      .eq('event_id', selectedEventId)
      .then(({ data }) => {
        if (cancelled) return;
        setEventInviteeIds(new Set((data || []).map(i => i.worker_id)));
      });
    return () => { cancelled = true; };
  }, [audienceType, selectedEventId]);

  if (!open) return null;

  const toggleRank = (rank) => {
    setRankAll(false);
    setSelectedRanks(prev => {
      const next = new Set(prev);
      next.has(rank) ? next.delete(rank) : next.add(rank);
      return next;
    });
  };

  const getRecipients = () => {
    let pool = workers.filter(w => w.is_active !== false && w.email);

    if (audienceType === 'event') {
      if (!selectedEventId) return [];
      const assignedIds = new Set(
        assignments.filter(a => a.event_id === selectedEventId).map(a => a.worker_id)
      );
      pool = pool.filter(w => assignedIds.has(w.id) || eventInviteeIds.has(w.id));
    }

    if (!rankAll && selectedRanks.size > 0) {
      pool = pool.filter(w => selectedRanks.has(w.rank));
    }

    if (locationId !== 'all') {
      pool = pool.filter(w => (workerLocationMap[w.id] || []).includes(locationId));
    }

    return pool;
  };

  const recipients = getRecipients();

  const handleSend = async () => {
    if (!subject.trim() || !message.trim()) {
      notify('Subject and message are both required.');
      return;
    }
    if (recipients.length === 0) {
      notify('No workers match the current targeting -- nothing to send.');
      return;
    }
    if (!(await confirm(
      `Send this message to ${recipients.length} worker${recipients.length !== 1 ? 's' : ''}?\n\nSubject: ${subject}`
    ))) return;

    setSending(true);
    setSendResult(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      setSending(false);
      await onSessionExpired();
      return;
    }

    const bodyHtml = `<p style="white-space:pre-wrap;margin:0">${escapeHtml(message)}</p>`;
    const html = renderEmailShell({ subtitle: 'A message from your event admin', bodyHtml, headerEmoji: '📣' });

    let sent = 0;
    let failed = 0;
    for (const worker of recipients) {
      try {
        const res = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ to: worker.email, subject, html }),
        });

        if (res.status === 401) {
          setSending(false);
          setSendResult({ sent, failed, total: recipients.length });
          await onSessionExpired();
          return;
        }
        if (res.status === 429) {
          setSending(false);
          setSendResult({ sent, failed, total: recipients.length });
          notify(`Sending limit reached after ${sent} of ${recipients.length}. Wait a few minutes, then try again for the rest.`);
          return;
        }
        if (res.ok) sent++; else failed++;
      } catch (_) {
        failed++;
      }
    }

    setSending(false);
    setSendResult({ sent, failed, total: recipients.length });
    notify(failed === 0
      ? `✓ Sent to all ${sent} worker${sent !== 1 ? 's' : ''}.`
      : `Sent to ${sent} of ${recipients.length}. ${failed} failed -- check their email addresses and try again.`);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-2xl font-bold text-gray-900">Message Staff</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={24} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Send To</label>
              <div className="flex gap-4 mb-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={audienceType === 'all'} onChange={() => setAudienceType('all')} />
                  All Staff
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={audienceType === 'event'} onChange={() => setAudienceType('event')} />
                  Staff of Event
                </label>
              </div>
              {audienceType === 'event' && (
                <select
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                >
                  <option value="">Select an event...</option>
                  {events.map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.name} — {ev.date}</option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Rank Groups</label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { setRankAll(true); setSelectedRanks(new Set()); }}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    rankAll ? 'bg-red-900 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  All
                </button>
                {RANK_LEVELS.map(rank => (
                  <button
                    key={rank}
                    type="button"
                    onClick={() => toggleRank(rank)}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                      !rankAll && selectedRanks.has(rank) ? 'bg-red-900 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Level {rank}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location Group</label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="all">All Locations</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="e.g. Parking change for tonight's event"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message *</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="Type your message..."
              />
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-700">
              {audienceType === 'event' && !selectedEventId
                ? 'Select an event to see who this will reach.'
                : <>This will reach <strong>{recipients.length}</strong> worker{recipients.length !== 1 ? 's' : ''} by email.</>}
            </div>

            {sendResult && (
              <div className={`rounded-lg p-3 text-sm ${sendResult.failed > 0 ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' : 'bg-green-50 text-green-800 border border-green-200'}`}>
                Sent {sendResult.sent} of {sendResult.total}{sendResult.failed > 0 ? `, ${sendResult.failed} failed` : ''}.
              </div>
            )}

            <div className="flex space-x-3 pt-2">
              <button
                onClick={handleSend}
                disabled={sending || recipients.length === 0}
                className="flex-1 bg-red-900 text-white px-6 py-3 rounded-lg hover:bg-red-800 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {sending ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Send size={18} />
                    <span>Send to {recipients.length}</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={sending}
                className="flex-1 bg-gray-200 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-300 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
