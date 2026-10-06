import React from 'react';
import { X, Calendar, Clock, MapPin, Navigation } from 'lucide-react';
import { formatTime, parseDateSafe } from '../utils/dateHelpers';

const mapsUrl = (address) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;

// A Message Staff message opened from the worker's 🔔 list: the full text,
// when it was sent, and -- when it was about one event -- that event's
// current details, so "Time changed to 6-9" is never a mystery.
export default function MessageDetailModal({ message, event, timeFormat, onClose, onViewShifts }) {
  if (!message) return null;
  const sent = new Date(message.created_at);
  const eventDate = event?.date ? parseDateSafe(event.date) : null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 p-5 border-b">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-gray-900 leading-snug">{message.title}</h3>
            <p className="text-xs text-gray-500 mt-1">
              From the office · {sent.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 -m-1 rounded-lg"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">{message.body}</p>

          {event && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">About this event</p>
              <p className="font-semibold text-gray-900">{event.name}</p>
              {eventDate && (
                <p className="text-sm text-gray-700 flex items-center gap-1.5">
                  <Calendar size={14} className="text-blue-600" />
                  {eventDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
              )}
              {event.time && (
                <p className="text-sm text-gray-700 flex items-center gap-1.5">
                  <Clock size={14} className="text-blue-600" />
                  {formatTime(event.time, timeFormat)}{event.end_time ? ` – ${formatTime(event.end_time, timeFormat)}` : ''}
                  <span className="text-xs text-gray-500">(current time)</span>
                </p>
              )}
              {(event.venue || event.address) && (
                <p className="text-sm text-gray-700 flex items-start gap-1.5">
                  <MapPin size={14} className="text-blue-600 mt-0.5 flex-shrink-0" />
                  <span>{[event.venue, event.address].filter(Boolean).join(', ')}</span>
                </p>
              )}
              {event.address && (
                <a href={mapsUrl(event.address)} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline">
                  <Navigation size={13} /> Directions
                </a>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            {onViewShifts && (
              <button onClick={onViewShifts} className="flex-1 bg-red-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-red-800">
                View my shifts
              </button>
            )}
            <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-gray-50">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
