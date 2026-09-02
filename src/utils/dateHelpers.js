// Helper function to format time based on 12/24 hour preference
export const formatTime = (timeStr, format = '12') => {
  if (!timeStr) return '';
  
  const [hours, minutes] = timeStr.split(':');
  const hour = parseInt(hours, 10);
  
  if (format === '24') {
    return `${hours}:${minutes}`;
  }
  
  // 12-hour format
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${minutes} ${period}`;
};

// Helper function to parse dates without timezone conversion
// Prevents "2026-02-13" from becoming "2026-02-12" due to UTC offset
export const parseDateSafe = (dateStr) => {
  if (!dateStr) return new Date();
  
  // Extract just the date part (YYYY-MM-DD)
  const datePart = dateStr.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);
  
  // Create date in local timezone
  return new Date(year, month - 1, day);
};

// Parses "HH:MM" into minutes-since-midnight, or null if empty/missing.
// Note: a literal midnight ("00:00") parses to 0, which every existing
// caller of this and timeRangesOverlap below treats as falsy on purpose
// (an event with no recorded end time and one starting exactly at
// midnight are indistinguishable here) — preserved as-is since this was
// copy-pasted identically three times in AvailableEventsSection.jsx
// before being consolidated.
export const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return null;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

// True if two [start, end) time ranges (in minutes-since-midnight) overlap.
// Either range missing an end time is treated as "can't determine, no
// conflict".
export const timeRangesOverlap = (startA, endA, startB, endB) => {
  if (!endA || !endB) return false;
  return startA < endB && endA > startB;
};
