// ============================================
// GIGSTAFFPRO - APPLICATION CONSTANTS
// ============================================
// All magic numbers and hardcoded values in one place
// Makes it easy to adjust business rules without hunting through code

// ============================================
// PAYMENT CALCULATION CONSTANTS
// ============================================

export const PAYMENT = {
  // Lake Geneva bonus amount
  LAKE_GENEVA_BONUS: 15.00,
  
  // Holiday pay multiplier (1.5x = time and a half)
  HOLIDAY_MULTIPLIER: 1.5,
  
  // Default values for new assignments
  DEFAULT_HOURS: 4,
  DEFAULT_MILES: 0,
};

// ============================================
// WORKER RANK SYSTEM
// ============================================

export const RANK_ACCESS_DAYS = {
  1: 0,   // Rank 1: Immediate access to events
  2: 7,   // Rank 2: Can see events 7 days before
  3: 10,  // Rank 3: Can see events 10 days before
  4: 12,  // Rank 4: Can see events 12 days before
  5: 14   // Rank 5: Can see events 14 days before
};

// ============================================
// WORKER DEFAULTS
// ============================================

export const WORKER_DEFAULTS = {
  RANK: 1,
  RELIABILITY: 5.0,
  TOTAL_GIGS: 0,
  NO_SHOWS: 0,
  IS_ACTIVE: true
};

// ============================================
// TIME & DATE CONSTANTS
// ============================================

export const TIME = {
  // Milliseconds conversions
  MS_PER_SECOND: 1000,
  MS_PER_MINUTE: 60000,
  MS_PER_HOUR: 3600000,
  MS_PER_DAY: 86400000,
  
  // Default time format
  DEFAULT_FORMAT: '12', // '12' or '24' hour
  
  // Days before event worker can cancel/switch
  CANCEL_DAYS_NOTICE: 7,
  SWITCH_DAYS_NOTICE: 7
};

// ============================================
// UI CONSTANTS
// ============================================

export const UI = {
  // PIN requirements
  PIN_LENGTH: 4,
  
  // Phone number formatting
  PHONE_MAX_LENGTH: 14, // (555) 123-4567
  
  // Search/filter debounce (ms)
  SEARCH_DEBOUNCE_MS: 300,
  
  // Items per page for pagination
  DEFAULT_PAGE_SIZE: 20,
  
  // Modal animation duration (ms)
  MODAL_ANIMATION_MS: 200
};

// ============================================
// APPLICATION STATUS VALUES
// ============================================

export const STATUS = {
  // Assignment statuses
  ASSIGNMENT: {
    PENDING: 'pending',
    APPROVED: 'approved',
    STANDBY: 'standby',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled'
  },
  
  // Payment statuses
  PAYMENT: {
    PENDING: 'pending',
    PAID: 'paid',
    PROCESSING: 'processing'
  },
  
  // Event statuses
  EVENT: {
    CONFIRMED: 'confirmed',
    NEEDS_STAFF: 'needs-staff',
    FULLY_STAFFED: 'fully-staffed',
    CANCELLED: 'cancelled',
    COMPLETED: 'completed'
  }
};

// ============================================
// VALIDATION RULES
// ============================================

export const VALIDATION = {
  // Email regex (basic)
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  
  // Phone regex (US format)
  PHONE_REGEX: /^\(\d{3}\) \d{3}-\d{4}$/,
  
  // PIN regex (4 digits)
  PIN_REGEX: /^\d{4}$/,
  
  // Minimum password length
  MIN_PASSWORD_LENGTH: 8
};

// ============================================
// ERROR MESSAGES
// ============================================

export const ERROR_MESSAGES = {
  // Authentication
  AUTH: {
    INVALID_CREDENTIALS: 'Invalid username or password.',
    PHONE_NOT_FOUND: 'Phone number not found. Contact your manager.',
    INCORRECT_PIN: 'Incorrect PIN. Please try again.',
    NO_PIN_SET: 'No PIN set for this account. Contact your manager to set up your PIN.',
    SESSION_EXPIRED: 'Your session has expired. Please log in again.'
  },
  
  // Data operations
  DATA: {
    LOAD_FAILED: 'Failed to load data. Please refresh the page.',
    SAVE_FAILED: 'Failed to save. Please try again.',
    DELETE_FAILED: 'Failed to delete. Please try again.',
    UPDATE_FAILED: 'Failed to update. Please try again.'
  },
  
  // Validation
  VALIDATION: {
    REQUIRED_FIELD: 'This field is required.',
    INVALID_EMAIL: 'Please enter a valid email address.',
    INVALID_PHONE: 'Please enter a valid phone number.',
    INVALID_PIN: 'PIN must be 4 digits.',
    SKILLS_REQUIRED: 'Please select at least one skill.'
  },
  
  // Business rules
  BUSINESS: {
    CANNOT_CANCEL: 'Cannot cancel assignment less than 7 days before event.',
    CANNOT_SWITCH: 'Cannot switch position less than 7 days before event.',
    EVENT_FULL: 'This position is already filled.',
    ALREADY_APPLIED: 'You have already applied to this event.'
  }
};

// ============================================
// SUCCESS MESSAGES
// ============================================

export const SUCCESS_MESSAGES = {
  WORKER_SAVED: 'Worker saved successfully!',
  EVENT_SAVED: 'Event saved successfully!',
  ASSIGNMENT_SAVED: 'Assignment saved successfully!',
  SETTINGS_SAVED: 'Settings saved successfully!',
  PIN_SET: 'PIN set successfully!',
  APPLICATION_APPROVED: 'Application approved!',
  APPLICATION_REJECTED: 'Application rejected.',
  PAYMENT_UPDATED: 'Payment status updated!',
  INVITE_SENT: 'Invites sent successfully!'
};
