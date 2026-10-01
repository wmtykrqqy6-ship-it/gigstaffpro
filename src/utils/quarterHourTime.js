// Helpers for QuarterHourInput: convert between "HH:MM" (24h, as stored in
// events.time / run_stops.scheduled_start) and the picker's parts.
import { roundToQuarterHour } from './dateHelpers';

export const QUARTER_MINUTES = ['00', '15', '30', '45'];

// "19:30" -> { hour: '7', minute: '30', meridiem: 'PM' } (12h)
//         -> { hour: '19', minute: '30', meridiem: 'PM' } (24h)
// Off-quarter values are shown rounded ("19:38" -> 7:45 PM). '' -> empty parts.
export function splitTime(value, timeFormat = '12') {
  if (!value) return { hour: '', minute: '', meridiem: 'PM' };
  const rounded = roundToQuarterHour(String(value).slice(0, 5));
  const [h, m] = rounded.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return { hour: '', minute: '', meridiem: 'PM' };
  const meridiem = h >= 12 ? 'PM' : 'AM';
  const hour = timeFormat === '24' ? String(h).padStart(2, '0') : String(h % 12 === 0 ? 12 : h % 12);
  return { hour, minute: String(m).padStart(2, '0'), meridiem };
}

// Parts -> "HH:MM". No hour -> '' (time cleared). Picking just an hour
// fills in :00 (and keeps the AM/PM shown, PM by default -- events are
// mostly evenings).
export function joinTime({ hour, minute, meridiem }, timeFormat = '12') {
  if (hour === '' || hour == null) return '';
  let h = Number(hour);
  if (timeFormat !== '24') {
    h = h % 12;
    if (meridiem === 'PM') h += 12;
  }
  const m = QUARTER_MINUTES.includes(minute) ? minute : '00';
  return `${String(h).padStart(2, '0')}:${m}`;
}
