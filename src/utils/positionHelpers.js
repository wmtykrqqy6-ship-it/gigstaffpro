// Standard position definitions with keys
export const STANDARD_POSITIONS = [
  { key: 'blackjack_dealer', label: 'Blackjack Dealer' },
  { key: 'poker_dealer', label: 'Poker Dealer' },
  { key: 'roulette_dealer', label: 'Roulette Dealer' },
  { key: 'craps_dealer', label: 'Craps Dealer' },
  { key: 'baccarat_dealer', label: 'Baccarat Dealer' },
  { key: 'dealer', label: 'Dealer' },
  { key: 'host', label: 'Host' },
  { key: 'bartender', label: 'Bartender' },
  { key: 'server', label: 'Server' },
  { key: 'cashier', label: 'Cashier' }
];

// These will be set by the app when positions are loaded
let appPositions = STANDARD_POSITIONS;

// Function to set positions from the app
export const setPositions = (positions) => {
  appPositions = Array.isArray(positions) && positions.length
    ? positions
    : STANDARD_POSITIONS;
};

// Get position label from key
export const getPositionLabel = (keyOrLabel) => {
  // If it's already an object, return its label
  if (typeof keyOrLabel === 'object' && keyOrLabel.label) return keyOrLabel.label;
  
  // Try to find by key first
  const position = appPositions.find(p => p.key === keyOrLabel);
  if (position) return position.label;
  
  // Fallback: try to find by label (for backward compatibility)
  const byLabel = appPositions.find(p => p.label === keyOrLabel);
  if (byLabel) return byLabel.label;
  
  // Last resort: return as-is
  return keyOrLabel;
};

// Get position key from label
export const getPositionKey = (keyOrLabel) => {
  // If it's already an object, return its key
  if (typeof keyOrLabel === 'object' && keyOrLabel.key) return keyOrLabel.key;
  
  // Try to find by key first
  const position = appPositions.find(p => p.key === keyOrLabel);
  if (position) return position.key;
  
  // Try to find by label (for backward compatibility during migration)
  const byLabel = appPositions.find(p => p.label === keyOrLabel);
  if (byLabel) return byLabel.key;
  
  // Last resort: convert label to key format
  return String(keyOrLabel).toLowerCase().replace(/\s+/g, '_');
};

// Maps a position's display value down to the key its pay rate is looked
// up under — several specific position labels (e.g. "Blackjack Dealer",
// "Roulette Wheel") share one rate bucket ("X_dealer"). Was previously
// copy-pasted identically across App.jsx, AvailableEventsSection.jsx,
// WorkerPortalView.jsx, InviteWorkersModal.jsx, and twice in
// SettingsView.jsx — consolidated here since a rule change had to be made
// in all six places to stay in sync.
export const getPayRateKey = (position) => {
  const p = String(position || '').toLowerCase().trim();

  if (p.includes('blackjack')) return 'blackjack_dealer';
  if (p.includes('roulette')) return 'roulette_dealer';
  if (p.includes('poker')) return 'poker_dealer';
  if (p.includes('craps')) return 'craps_dealer';
  if (p.includes('baccarat')) return 'baccarat_dealer';
  if (p.includes('event lead')) return 'event_lead';
  if (p === 'dealer') return 'dealer';
  if (p.includes('host')) return 'host';
  if (p.includes('bartender')) return 'bartender';
  if (p.includes('server')) return 'server';
  if (p.includes('cashier')) return 'cashier';

  return p.replace(/\s+/g, '_');
};

// Assignment statuses that do NOT count as filling a position slot.
// Everything else (approved, confirmed, legacy null/undefined admin-assigned, etc.)
// counts as filled — this is the single source of truth for "is this slot taken".
const UNFILLED_ASSIGNMENT_STATUSES = ['standby', 'pending', 'rejected', 'cancelled'];

export const isAssignmentFilled = (status) => !UNFILLED_ASSIGNMENT_STATUSES.includes(status);

// Check if worker skill matches position
export const positionMatches = (workerSkillKey, positionKey) => {
  // Direct key match
  if (workerSkillKey === positionKey) return true;
  
  // Special case: 'dealer' key matches all dealer positions
  if (workerSkillKey === 'dealer' && positionKey.includes('dealer')) return true;
  if (positionKey === 'dealer' && workerSkillKey.includes('dealer')) return true;
  
  return false;
};
