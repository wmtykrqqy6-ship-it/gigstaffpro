import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { TEMPLATE_VARS, MAX_SUBJECT, MAX_MESSAGE, templateValues, fillSubject, renderMessageHtml, addDays } from '../../utils/clientEmailSettings';

const inputClass = 'px-2 py-1 border border-gray-300 rounded-md text-sm';
const SAMPLE_PHONE = '(262) 549-3559';

// A made-up client for the preview, with the event `daysAway` days out.
function sampleValues(settings, daysAway) {
  const today = new Date().toISOString().slice(0, 10);
  const eventDate = addDays(today, daysAway > 0 ? daysAway : 30);
  const dt = new Date(`${eventDate}T12:00:00Z`);
  return templateValues(
    { name: 'Pat Lee', event_date: eventDate, start_time: '7:00 PM', event_location: 'Elm Grove Community Center' },
    { settings, eventDateText: dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }), daysAway: daysAway > 0 ? daysAway : null, phone: SAMPLE_PHONE }
  );
}

// Subject + message boxes with the list of {blanks} and a preview.
// The message text is escaped by renderMessageHtml before it's shown.
export default function EmailWordingEditor({ subject, message, onChange, settings, daysAway = null, onReset }) {
  const [preview, setPreview] = useState(false);
  const values = sampleValues(settings, daysAway);
  return (
    <div className="mt-2 space-y-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
      <label className="block text-gray-700 text-xs">Subject
        <input className={`${inputClass} w-full mt-1`} maxLength={MAX_SUBJECT} value={subject}
          onChange={e => onChange({ subject: e.target.value })} />
      </label>
      <label className="block text-gray-700 text-xs">Message
        <textarea className={`${inputClass} w-full mt-1 font-mono`} rows={10} maxLength={MAX_MESSAGE} value={message}
          onChange={e => onChange({ message: e.target.value })} />
      </label>
      <p className="text-xs text-gray-500">
        Blanks filled in for each client: {TEMPLATE_VARS.map((v, i) => (
          <span key={v.key} title={v.about}><code className="bg-white border rounded px-1">{`{${v.key}}`}</code>{i < TEMPLATE_VARS.length - 1 ? ' ' : ''}</span>
        ))}. Leave a blank line between paragraphs, start a line with "- " for a bullet, and put **two stars** around bold words.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => setPreview(p => !p)} className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 text-xs flex items-center space-x-1">
          {preview ? <EyeOff size={12} /> : <Eye size={12} />}<span>{preview ? 'Hide preview' : 'Preview'}</span>
        </button>
        {onReset && <button type="button" onClick={onReset} className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 text-xs">Reset to the original wording</button>}
      </div>
      {preview && (
        <div className="bg-white border rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-2">Subject: <strong className="text-gray-900">{fillSubject(subject, values) || '(no subject)'}</strong> · sample client Pat Lee</p>
          <div className="text-sm text-gray-800" dangerouslySetInnerHTML={{ __html: renderMessageHtml(message, values) }} />
        </div>
      )}
    </div>
  );
}
