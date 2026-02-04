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
  appPositions = positions;
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
  return keyOrLabel.toLowerCase().replace(/\s+/g, '_');
};

// Check if worker skill matches position
export const positionMatches = (workerSkillKey, positionKey) => {
  // Direct key match
  if (workerSkillKey === positionKey) return true;
  
  // Special case: 'dealer' key matches all dealer positions
  if (workerSkillKey === 'dealer' && positionKey.includes('dealer')) return true;
  if (positionKey === 'dealer' && workerSkillKey.includes('dealer')) return true;
  
  return false;
};
