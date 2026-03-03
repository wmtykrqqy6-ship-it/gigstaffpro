// hostLabelHelper.js
// Configurable label for the "Host / Team Leader" role.
// Default: "Host" — companies can set it to "Manager", "Team Lead", "Pit Boss", etc.
// Saved in localStorage so it persists across sessions.

const HOST_LABEL_KEY = 'gigstaffpro_host_label';

export const getHostLabel = () => {
  try { return localStorage.getItem(HOST_LABEL_KEY) || 'Host'; }
  catch { return 'Host'; }
};

export const setHostLabel = (label) => {
  try { localStorage.setItem(HOST_LABEL_KEY, (label || 'Host').trim()); }
  catch {}
};

// Plural form: "Hosts", "Managers", "Team Leads", "Pit Bosses"
export const getHostLabelPlural = () => {
  const label = getHostLabel();
  if (label.toLowerCase().endsWith('s')) return label;
  if (label.toLowerCase().endsWith('boss')) return label + 'es';
  return label + 's';
};
