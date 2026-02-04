// Helper function to format time based on 12/24 hour preference
export const formatTime = (timeStr, format = '12') => {
  if (!timeStr) return '';
  
  const [hours, minutes] = timeStr.split(':');
  const hour = parseInt(hours);
  
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
