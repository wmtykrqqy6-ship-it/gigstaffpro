import React from 'react';
import { splitTime, joinTime, QUARTER_MINUTES } from '../../utils/quarterHourTime';

// Time picker limited to 15-minute steps: Hour · Minute (00/15/30/45) · AM/PM
// drop-downs. Replaces <input type="time">, whose native picker in Chrome
// lists every minute and ignores step="900" (2026-10-01).
//
// value/onChange use "HH:MM" (24h), like events.time; '' means no time.
// timeFormat '12' shows Hour 1–12 + AM/PM, '24' shows Hour 00–23.
export default function QuarterHourInput({ value, onChange, timeFormat = '12', required = false, size = 'md', className = '' }) {
  const parts = splitTime(value, timeFormat);
  const set = (patch) => onChange(joinTime({ ...parts, ...patch }, timeFormat));
  const pad = size === 'sm' ? 'px-1.5 py-1 text-xs' : 'px-2 py-2 text-sm';
  const sel = `${pad} bg-transparent border-none outline-none focus:ring-0 cursor-pointer`;
  const hours = timeFormat === '24'
    ? Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))
    : ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];

  return (
    <div className={`inline-flex items-center rounded-lg border border-gray-300 bg-white focus-within:ring-2 focus-within:ring-red-500 ${className}`}>
      <select aria-label="Hour" value={parts.hour} required={required} onChange={(e) => set({ hour: e.target.value })} className={sel}>
        <option value="">--</option>
        {hours.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="text-gray-400 -mx-0.5">:</span>
      <select aria-label="Minute" value={parts.minute} onChange={(e) => set({ minute: e.target.value })} className={sel}>
        <option value="">--</option>
        {QUARTER_MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      {timeFormat !== '24' && (
        <select aria-label="AM or PM" value={parts.meridiem} onChange={(e) => set({ meridiem: e.target.value })} className={sel}>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      )}
    </div>
  );
}
