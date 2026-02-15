import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Calendar, Users, Clock, MapPin, DollarSign, Mail, Phone, CheckCircle, XCircle, Menu, Plus, Search, Filter, Star, Bell, Settings, LogOut, ChevronDown, TrendingUp, Send, Trash2, Edit, Download, BarChart3, AlertCircle, X, MessageSquare, Award, Target, FileText, History, Copy, Home, Briefcase, User } from 'lucide-react';
import { hashPin } from './utils/authHelpers';
import { formatTime, parseDateSafe } from './utils/dateHelpers';
import {
  STANDARD_POSITIONS,
  setPositions as setAppPositions,
  getPositionLabel,
  getPositionKey,
  positionMatches
} from './utils/positionHelpers';
import {
  RANK_ACCESS_DAYS,
  PAYMENT,
  TIME,
  UI,
  WORKER_DEFAULTS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES
} from './constants';
import LoginScreen from './components/LoginScreen';
import NotificationsModal from './components/NotificationsModal';
import SetPinModal from './components/modals/SetPinModal';
import BulkInviteModal from './components/modals/BulkInviteModal';
import EditWorkerModal from './components/modals/EditWorkerModal';
import AddEventModal from './components/modals/AddEventModal';
import EditEventModal from './components/modals/EditEventModal';
import AssignWorkersModal from './components/modals/AssignWorkersModal';
import PaymentCalculatorModal from './components/modals/PaymentCalculatorModal';
import DashboardView from './components/views/DashboardView';
import ApplicationsView from './components/views/ApplicationsView';
import SettingsView from './components/views/SettingsView';
import EventsView from './components/views/EventsView';
import StaffView from './components/views/StaffView';
import Header from './components/Header';
import Navigation from './components/Navigation';
import AddWorkerModal from './components/modals/AddWorkerModal';

const GigStaffPro = () => {
  const [userRole, setUserRole] = useState(null); // null = not logged in, 'admin' or 'worker'
  const [currentView, setCurrentView] = useState('dashboard');
  const [workers, setWorkers] = useState([]);
  const [events, setEvents] = useState([]);
  const [positions, setPositions] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [payRates, setPayRates] = useState({});
  const [travelTiers, setTravelTiers] = useState([]);
  const [bonuses, setBonuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddWorker, setShowAddWorker] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showEditWorker, setShowEditWorker] = useState(false);
  const [showEditEvent, setShowEditEvent] = useState(false);
  const [showBulkInvite, setShowBulkInvite] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedWorkerForEdit, setSelectedWorkerForEdit] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [assignmentPaymentData, setAssignmentPaymentData] = useState(null);
  const [eventPaymentSettings, setEventPaymentSettings] = useState({});
  const [paymentTrackingEnabled, setPaymentTrackingEnabled] = useState(true);
  const [savingWorker, setSavingWorker] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [deletingAssignment, setDeletingAssignment] = useState(false);
  const [assigningWorker, setAssigningWorker] = useState(false);
  const [exportingCSV, setExportingCSV] = useState(false);
  const [rankAccessDays, setRankAccessDays] = useState(RANK_ACCESS_DAYS);
  const [timeFormat, setTimeFormat] = useState('12'); // '12' or '24' hour format
  const [loggedInWorker, setLoggedInWorker] = useState(null); // Current logged in worker
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showSetPinModal, setShowSetPinModal] = useState(false);
  const [selectedWorkerForPin, setSelectedWorkerForPin] = useState(null);

  // Load workers from Supabase
  useEffect(() => {
    loadWorkers();
    loadEvents();
    loadSettings();
    loadAssignments();
    loadPaymentConfig();
    loadPaymentTrackingSetting();
    loadRankAccessDays();
    loadTimeFormat();
  }, []);

  // Generate notifications whenever assignments change
  useEffect(() => {
    generateNotifications();
  }, [assignments, events, workers, userRole, loggedInWorker]);
const getDismissKey = () => {
  if (userRole === 'admin') return 'dismissed_notifications_admin';
  if (userRole === 'worker' && loggedInWorker?.id) return `dismissed_notifications_worker_${loggedInWorker.id}`;
  return 'dismissed_notifications_unknown';
};

const loadDismissedNotificationIds = () => {
  try {
    return JSON.parse(localStorage.getItem(getDismissKey()) || '[]');
  } catch {
    return [];
  }
};

const saveDismissedNotificationIds = (ids) => {
  localStorage.setItem(getDismissKey(), JSON.stringify(ids));
};

  const generateNotifications = () => {
    const newNotifications = [];
    const now = new Date();

    if (userRole === 'admin') {
      // Admin notifications
      
      // 1. Pending applications
      const pendingApps = assignments.filter(a => a.status === 'pending');
      if (pendingApps.length > 0) {
        pendingApps.forEach(app => {
          const worker = workers.find(w => w.id === app.worker_id);
          const event = events.find(e => e.id === app.event_id);
          if (worker && event) {
            newNotifications.push({
              id: `pending-${app.id}`,
              type: 'application',
              title: 'New Application',
              message: `${worker.name} applied for ${event.name}`,
              timestamp: app.applied_at || app.created_at,
              action: () => setCurrentView('applications')
            });
          }
        });
      }

      // 2. Events within 48 hours that aren't fully staffed
      const soonEvents = events.filter(e => {
        const eventDate = parseDateSafe(e.date);
        const hoursUntil = (eventDate - now) / (1000 * 60 * 60);
        return hoursUntil > 0 && hoursUntil <= 48;
      });

      soonEvents.forEach(event => {
        const eventAssignments = assignments.filter(a => a.event_id === event.id && a.status === 'approved');
        const totalNeeded = (event.positions || []).reduce((sum, pos) => sum + (pos.count || 0), 0);
        const totalAssigned = eventAssignments.length;
        
        if (totalAssigned < totalNeeded) {
          newNotifications.push({
            id: `understaffed-${event.id}`,
            type: 'warning',
            title: 'Understaffed Event',
            message: `${event.name} needs ${totalNeeded - totalAssigned} more worker(s)`,
            timestamp: new Date().toISOString(),
            action: () => {
              setSelectedEvent(event);
              setShowAssignModal(true);
            }
          });
        }
      });

    } else if (userRole === 'worker' && loggedInWorker) {
      // Worker notifications
      
      // 1. Upcoming events within 24 hours
      const workerAssignments = assignments.filter(a => 
        a.worker_id === loggedInWorker.id && 
        a.status === 'approved'
      );

      workerAssignments.forEach(assignment => {
        const event = events.find(e => e.id === assignment.event_id);
        if (event) {
          const eventDate = parseDateSafe(event.date);
          const hoursUntil = (eventDate - now) / (1000 * 60 * 60);
          
          if (hoursUntil > 0 && hoursUntil <= 24) {
            newNotifications.push({
              id: `reminder-${assignment.id}`,
              type: 'reminder',
              title: 'Event Tomorrow!',
              message: `${event.name} at ${formatTime(event.time, timeFormat)}`,
              timestamp: new Date().toISOString(),
              action: () => {} // Could open event details
            });
          }
        }
      });

      // 2. Recent approvals (last 7 days)
      const recentApprovals = assignments.filter(a => 
        a.worker_id === loggedInWorker.id && 
        a.status === 'approved' &&
        a.updated_at
      );

      recentApprovals.forEach(assignment => {
        const updatedDate = new Date(assignment.updated_at);
        const daysAgo = (now - updatedDate) / (1000 * 60 * 60 * 24);
        
        if (daysAgo <= 7) {
          const event = events.find(e => e.id === assignment.event_id);
          if (event) {
            newNotifications.push({
              id: `approved-${assignment.id}`,
              type: 'success',
              title: 'Application Approved!',
              message: `You're confirmed for ${event.name}`,
              timestamp: assignment.updated_at,
              action: () => {}
            });
          }
        }
      });
    }

// Sort by timestamp (newest first)
newNotifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));


// ✅ Filter out dismissed notifications (per user)
const dismissedIds = new Set(loadDismissedNotificationIds());
const visibleNotifications = newNotifications.filter(n => !dismissedIds.has(n.id));

// Limit to 20
setNotifications(visibleNotifications.slice(0, 20));

  };

const handleClearAllNotifications = () => {
  if (!confirm('Clear all notifications?')) return;

  const idsToDismiss = notifications.map(n => n.id).filter(Boolean);
  const existing = loadDismissedNotificationIds();

  saveDismissedNotificationIds(
    Array.from(new Set([...existing, ...idsToDismiss]))
  );

  setNotifications([]);
};

const handleSaveWorker = async (formData) => {
  setSavingWorker(true);
  try {
    const { error } = await supabase
      .from('workers')
      .insert([formData]);

    if (error) throw error;

    alert('Worker added successfully!');
    setShowAddWorker(false);
    await loadWorkers();
    return true;
  } catch (error) {
    alert('Error adding worker: ' + error.message);
    return false;
  } finally {
    setSavingWorker(false);
  }
};

  const loadTimeFormat = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'time_format')
        .single();
      
      if (!error && data && data.setting_value) {
        setTimeFormat(data.setting_value);
      }
    } catch (error) {
      // Default to 12-hour if error
      setTimeFormat('12');
    }
  };

  const loadPaymentTrackingSetting = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'payment_tracking_enabled')
        .single();
      
      if (!error && data) {
        setPaymentTrackingEnabled(data.setting_value === 'true' || data.setting_value === true);
      }
    } catch (error) {
    }
  };

  const loadRankAccessDays = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'rank_access_days')
        .single();
      
      if (!error && data && data.setting_value) {
        setRankAccessDays(JSON.parse(data.setting_value));
      }
    } catch (error) {
    }
  };

  const loadPaymentConfig = async () => {
    try {
      // Load pay rates
     const { data: ratesData, error: ratesError } = await supabase
  .from('pay_rates')
  .select('position, hourly_rate');

if (ratesError) throw ratesError;

const ratesMap = {};

(ratesData || []).forEach((rate) => {
  const key = getPayRateKey(rate.position); // normalize label → key
  ratesMap[key] = Number(rate.hourly_rate) || 0;

  // Optional safety: allow direct lookup too
  ratesMap[rate.position] = Number(rate.hourly_rate) || 0;
});

setPayRates(ratesMap);

      // Load bonuses
      const { data: bonusesData, error: bonusesError } = await supabase
        .from('bonuses')
        .select('*');
      
      if (!bonusesError && bonusesData) {
        const bonusesMap = {};
        bonusesData.forEach(bonus => {
          bonusesMap[bonus.bonus_name] = bonus.bonus_amount;
        });
        setBonuses(bonusesMap);
      }
    } catch (error) {
    }
  };
const getPayRateKey = (position) => {
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

  // Payment calculation function based on PRD
  const calculatePay = (position, hours, miles, isLakeGeneva, isHoliday) => {

  // 🔎 TEMP DEBUG — add this right here
  if (travelTiers?.[0]) {
  }
    // Step 1: Calculate base pay
   const rateKey = getPayRateKey(position);
const hourlyRate = payRates[rateKey] || 0;
    const basePay = hours * hourlyRate;

    // Step 2: Calculate travel pay
let travelPay = 0;

for (const tier of (travelTiers || [])) {
  const min = Number(tier.min_miles ?? tier.minMiles ?? tier.min ?? 0);
  const max = Number(tier.max_miles ?? tier.maxMiles ?? tier.max ?? 0);
  const amt = Number(tier.pay_amount ?? tier.payAmount ?? tier.amount ?? 0);

  if (Number.isFinite(min) && Number.isFinite(max) && miles >= min && miles <= max) {
    travelPay = amt;
    break;
  }
}
    // Step 3: Add Lake Geneva bonus
    const lakeGenevaBonus = isLakeGeneva ? (bonuses['Lake Geneva'] || PAYMENT.LAKE_GENEVA_BONUS) : 0;

    // Step 4: Calculate subtotal
    const subtotal = basePay + travelPay + lakeGenevaBonus;

    // Step 5: Apply holiday multiplier
    const holidayMultiplier = isHoliday ? (bonuses['Holiday Multiplier'] || PAYMENT.HOLIDAY_MULTIPLIER) : 1.0;
    const totalPay = subtotal * holidayMultiplier;

    return {
      basePay: parseFloat(basePay.toFixed(2)),
      travelPay: parseFloat(travelPay.toFixed(2)),
      lakeGenevaBonus: parseFloat(lakeGenevaBonus.toFixed(2)),
      subtotal: parseFloat(subtotal.toFixed(2)),
      holidayMultiplier: parseFloat(holidayMultiplier.toFixed(2)),
      totalPay: parseFloat(totalPay.toFixed(2))
    };
  };

  // Calculate distance between two addresses using Google Maps via serverless function
  const loadAssignments = async () => {
    try {
      const { data, error } = await supabase
        .from('assignments')
        .select('*');
      
      if (error) throw error;
      
      setAssignments(data || []);
    } catch (error) {
    }
  };

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'positions')
        .single();
      
      if (error) {
        // If settings don't exist, use standard positions
        setPositions(STANDARD_POSITIONS);
setAppPositions(STANDARD_POSITIONS);

      } else {
        // Check if data is old format (array of strings) or new format (array of objects)
        const storedPositions = data.setting_value || [];
        
        if (storedPositions.length > 0 && typeof storedPositions[0] === 'string') {
          // Old format - migrate to new format
          const migratedPositions = storedPositions.map(label => ({
            key: label.toLowerCase().replace(/\s+/g, '_'),
            label: label
          }));
          setPositions(migratedPositions);
setAppPositions(migratedPositions);

          // Save migrated format back to database
          await supabase
            .from('settings')
            .update({ setting_value: migratedPositions })
            .eq('setting_key', 'positions');
        } else {
          // New format - use as is
          setPositions(storedPositions);
setAppPositions(storedPositions);
        }
      }

      // Load warehouse address
      const { data: warehouseData, error: warehouseError } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'warehouse_address')
        .single();
      
      if (!warehouseError && warehouseData) {
        // Warehouse address loaded, stored in settings
      }
    } catch (error) {
      const defaultPositions = ['Dealer', 'Poker Dealer', 'Blackjack Dealer', 'Roulette Dealer', 'Craps Dealer', 'Host', 'Bartender'].sort();
      setPositions(defaultPositions);
    }
  };

  const loadWorkers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('workers')
        .select('*')
        .order('name', { ascending: true });
      
      if (error) throw error;
      
      // Migrate worker skills from old format (labels) to new format (keys)
      const workersNeedingMigration = [];
      const migratedWorkers = (data || []).map(worker => {
        if (!worker.skills || worker.skills.length === 0) return worker;
        
        // Check if skills need migration (if any skill is a label string, not a key)
        const needsMigration = worker.skills.some(skill => {
          // If skill contains spaces or capital letters, it's probably a label
          return /[A-Z\s]/.test(skill);
        });
        
        if (needsMigration) {
          const migratedSkills = worker.skills.map(skill => {
            // Try to find matching position by label
            const position = positions.find(p => p.label === skill || p.key === skill);
            if (position) return position.key;
            // Fallback: convert to key format
            return skill.toLowerCase().replace(/\s+/g, '_');
          });
          
          workersNeedingMigration.push({
            id: worker.id,
            skills: migratedSkills
          });
          
          return { ...worker, skills: migratedSkills };
        }
        
        return worker;
      });
      
      // Update database for workers that needed migration
      if (workersNeedingMigration.length > 0) {
        
        // Update each worker in database
        for (const workerUpdate of workersNeedingMigration) {
          await supabase
            .from('workers')
            .update({ skills: workerUpdate.skills })
            .eq('id', workerUpdate.id);
        }
        
      }
      
      setWorkers(migratedWorkers);
      setError(null);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('date', { ascending: true });
      
      if (error) throw error;
      
      // Migrate event positions from old format to new format
      const eventsNeedingMigration = [];
      const migratedEvents = (data || []).map(event => {
        if (!event.positions || event.positions.length === 0) return event;
        
        // Check if positions need migration
        const needsMigration = event.positions.some(pos => 
          (typeof pos === 'object' && pos.name && !pos.key) || typeof pos === 'string'
        );
        
        if (needsMigration) {
          const migratedPositions = event.positions.map(pos => {
            if (typeof pos === 'object' && pos.key) {
              // Already new format
              return pos;
            } else if (typeof pos === 'object' && pos.name) {
              // Old format with {name, count}
              return {
                key: getPositionKey(pos.name),
                count: pos.count
              };
            } else if (typeof pos === 'string') {
              // Very old format (just string)
              return {
                key: getPositionKey(pos),
                count: 1
              };
            }
            return pos;
          });
          
          eventsNeedingMigration.push({
            id: event.id,
            positions: migratedPositions
          });
          
          return { ...event, positions: migratedPositions };
        }
        
        return event;
      });
      
      // Update database for events that needed migration
      if (eventsNeedingMigration.length > 0) {
        
        for (const eventUpdate of eventsNeedingMigration) {
          await supabase
            .from('events')
            .update({ positions: eventUpdate.positions })
            .eq('id', eventUpdate.id);
        }
        
      }
      
      setEvents(migratedEvents);
    } catch (error) {
    }
  };

  const deleteWorker = async (workerId) => {
    if (!confirm('Are you sure you want to delete this worker?')) return;
    
    try {
      const { error } = await supabase
        .from('workers')
        .delete()
        .eq('id', workerId);
      
      if (error) throw error;
      
      loadWorkers();
    } catch (error) {
      alert('Error deleting worker: ' + error.message);
    }
  };

  const deleteEvent = async (eventId) => {
    if (!confirm('Are you sure you want to delete this event?')) return;
    
    try {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId);
      
      if (error) throw error;
      
      loadEvents();
    } catch (error) {
      alert('Error deleting event: ' + error.message);
    }
  };

  const PaymentsView = () => {
    const [filterStatus, setFilterStatus] = useState('all'); // all, pending, paid
    const [filterWorker, setFilterWorker] = useState('all');
    const [filterEvent, setFilterEvent] = useState('all');
    const [filterDateRange, setFilterDateRange] = useState('all'); // all, this_week, last_week, this_month, last_month, custom
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [groupBy, setGroupBy] = useState('none'); // none, event, worker
    const [selectedAssignments, setSelectedAssignments] = useState([]);
    const [bulkActionLoading, setBulkActionLoading] = useState(false);

    // Get all assignments with payment data
    const assignmentsWithDetails = assignments
      .map(assignment => {
        const worker = workers.find(w => w.id === assignment.worker_id);
        const event = events.find(e => e.id === assignment.event_id);
        return { ...assignment, worker, event };
      })
      .filter(a => a.worker && a.event); // Only show assignments with valid worker and event

    // Apply filters
    const filteredAssignments = assignmentsWithDetails.filter(assignment => {
      // Status filter
      if (filterStatus !== 'all' && assignment.payment_status !== filterStatus) return false;
      
      // Worker filter
      if (filterWorker !== 'all' && assignment.worker_id !== filterWorker) return false;
      
      // Event filter
      if (filterEvent !== 'all' && assignment.event_id !== filterEvent) return false;
      
      // Date range filter
      if (filterDateRange !== 'all' && assignment.event) {
        const eventDate = parseDateSafe(assignment.event.date);
        const now = new Date();
        
        if (filterDateRange === 'this_week') {
          const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekEnd.getDate() + 6);
          if (eventDate < weekStart || eventDate > weekEnd) return false;
        } else if (filterDateRange === 'last_week') {
          const lastWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() - 7);
          const lastWeekEnd = new Date(lastWeekStart);
          lastWeekEnd.setDate(lastWeekEnd.getDate() + 6);
          if (eventDate < lastWeekStart || eventDate > lastWeekEnd) return false;
        } else if (filterDateRange === 'this_month') {
          if (eventDate.getMonth() !== now.getMonth() || eventDate.getFullYear() !== now.getFullYear()) return false;
        } else if (filterDateRange === 'last_month') {
          const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          if (eventDate.getMonth() !== lastMonth.getMonth() || eventDate.getFullYear() !== lastMonth.getFullYear()) return false;
        } else if (filterDateRange === 'custom') {
          if (customStartDate) {
            const start = parseDateSafe(customStartDate);
            if (eventDate < start) return false;
          }
          if (customEndDate) {
            const end = parseDateSafe(customEndDate);
            if (eventDate > end) return false;
          }
        }
      }
      
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        return (
          assignment.worker.name.toLowerCase().includes(searchLower) ||
          assignment.event.name.toLowerCase().includes(searchLower) ||
          assignment.position.toLowerCase().includes(searchLower)
        );
      }
      
      return true;
    });

    // Calculate totals
    const totalOwed = filteredAssignments
      .filter(a => a.payment_status === 'pending')
      .reduce((sum, a) => sum + (a.total_pay || 0), 0);

    const totalPaid = filteredAssignments
      .filter(a => a.payment_status === 'paid')
      .reduce((sum, a) => sum + (a.total_pay || 0), 0);

    const markAsPaid = async (assignmentId) => {
      if (!confirm('Mark this payment as paid?')) return;
      
      try {
        const { error } = await supabase
          .from('assignments')
          .update({
            payment_status: 'paid',
            paid_at: new Date().toISOString()
          })
          .eq('id', assignmentId);
        
        if (error) throw error;
        
        loadAssignments();
        alert('Payment marked as paid!');
      } catch (error) {
        alert('Error updating payment status: ' + error.message);
      }
    };

    const markAsPending = async (assignmentId) => {
      if (!confirm('Mark this payment as pending (unpaid)?')) return;
      
      try {
        const { error } = await supabase
          .from('assignments')
          .update({
            payment_status: 'pending',
            paid_at: null
          })
          .eq('id', assignmentId);
        
        if (error) throw error;
        
        loadAssignments();
        alert('Payment marked as pending!');
      } catch (error) {
        alert('Error updating payment status: ' + error.message);
      }
    };

    const toggleSelectAssignment = (assignmentId) => {
      setSelectedAssignments(prev => 
        prev.includes(assignmentId)
          ? prev.filter(id => id !== assignmentId)
          : [...prev, assignmentId]
      );
    };

    const toggleSelectAll = () => {
      if (selectedAssignments.length === filteredAssignments.length) {
        setSelectedAssignments([]);
      } else {
        setSelectedAssignments(filteredAssignments.map(a => a.id));
      }
    };

    const selectAllPending = () => {
      const pendingIds = filteredAssignments
        .filter(a => a.payment_status === 'pending')
        .map(a => a.id);
      setSelectedAssignments(pendingIds);
    };

    const bulkMarkAsPaid = async () => {
      if (selectedAssignments.length === 0) {
        alert('Please select assignments to mark as paid');
        return;
      }

      if (!confirm(`Mark ${selectedAssignments.length} assignments as paid?`)) return;

      setBulkActionLoading(true);
      try {
        const { error } = await supabase
          .from('assignments')
          .update({
            payment_status: 'paid',
            paid_at: new Date().toISOString()
          })
          .in('id', selectedAssignments);
        
        if (error) throw error;
        
        setSelectedAssignments([]);
        loadAssignments();
        alert(`${selectedAssignments.length} payments marked as paid!`);
      } catch (error) {
        alert('Error updating payments: ' + error.message);
      } finally {
        setBulkActionLoading(false);
      }
    };

    const bulkMarkAsPending = async () => {
      if (selectedAssignments.length === 0) {
        alert('Please select assignments to mark as pending');
        return;
      }

      if (!confirm(`Mark ${selectedAssignments.length} assignments as pending?`)) return;

      setBulkActionLoading(true);
      try {
        const { error } = await supabase
          .from('assignments')
          .update({
            payment_status: 'pending',
            paid_at: null
          })
          .in('id', selectedAssignments);
        
        if (error) throw error;
        
        setSelectedAssignments([]);
        loadAssignments();
        alert(`${selectedAssignments.length} payments marked as pending!`);
      } catch (error) {
        alert('Error updating payments: ' + error.message);
      } finally {
        setBulkActionLoading(false);
      }
    };

    // Group assignments by event or worker
    const getGroupedAssignments = () => {
      if (groupBy === 'event') {
        const grouped = {};
        filteredAssignments.forEach(assignment => {
          const eventId = assignment.event_id;
          if (!grouped[eventId]) {
            grouped[eventId] = {
              event: assignment.event,
              assignments: [],
              totalPay: 0,
              pendingCount: 0,
              paidCount: 0
            };
          }
          grouped[eventId].assignments.push(assignment);
          grouped[eventId].totalPay += assignment.total_pay || 0;
          if (assignment.payment_status === 'pending') grouped[eventId].pendingCount++;
          if (assignment.payment_status === 'paid') grouped[eventId].paidCount++;
        });
        return Object.values(grouped);
      } else if (groupBy === 'worker') {
        const grouped = {};
        filteredAssignments.forEach(assignment => {
          const workerId = assignment.worker_id;
          if (!grouped[workerId]) {
            grouped[workerId] = {
              worker: assignment.worker,
              assignments: [],
              totalPay: 0,
              pendingCount: 0,
              paidCount: 0
            };
          }
          grouped[workerId].assignments.push(assignment);
          grouped[workerId].totalPay += assignment.total_pay || 0;
          if (assignment.payment_status === 'pending') grouped[workerId].pendingCount++;
          if (assignment.payment_status === 'paid') grouped[workerId].paidCount++;
        });
        return Object.values(grouped);
      }
      return null;
    };

    const groupedData = getGroupedAssignments();

    const exportToCSV = () => {
      setExportingCSV(true);
      
      try {
        // Prepare CSV data
        const csvData = filteredAssignments.map(assignment => ({
          'Worker Name': assignment.worker.name,
          'Worker Email': assignment.worker.email,
          'Worker Phone': assignment.worker.phone,
          'Event Name': assignment.event.name,
          'Event Date': new Date(assignment.event.date).toLocaleDateString('en-US'),
          'Venue': assignment.event.venue,
          'Position': assignment.position,
          'Hours': assignment.hours || 0,
          'Miles': assignment.miles || 0,
          'Base Pay': (assignment.base_pay || 0).toFixed(2),
          'Travel Pay': (assignment.travel_pay || 0).toFixed(2),
          'Lake Geneva Bonus': (assignment.lake_geneva_bonus || 0).toFixed(2),
          'Holiday Multiplier': assignment.holiday_multiplier || 1.0,
          'Total Pay': (assignment.total_pay || 0).toFixed(2),
          'Payment Status': assignment.payment_status || 'pending',
          'Paid Date': assignment.paid_at ? new Date(assignment.paid_at).toLocaleDateString('en-US') : ''
        }));

        // Convert to CSV string
        const headers = Object.keys(csvData[0] || {});
        const csvContent = [
          headers.join(','),
          ...csvData.map(row => 
            headers.map(header => {
              const value = row[header];
              // Escape commas and quotes in values
              if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                return `"${value.replace(/"/g, '""')}"`;
              }
              return value;
            }).join(',')
          )
        ].join('\n');

        // Create download link
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `payments_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } finally {
        setTimeout(() => setExportingCSV(false), 500); // Brief delay so user sees feedback
      }
    };

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-3xl font-bold text-gray-900">Payment Tracking</h2>
          <button
            onClick={exportToCSV}
            disabled={filteredAssignments.length === 0 || exportingCSV}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium flex items-center space-x-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {exportingCSV ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <Download size={18} />
                <span>Export to CSV</span>
              </>
            )}
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-yellow-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Pending Payments</p>
                <p className="text-3xl font-bold text-gray-900">${totalOwed.toFixed(2)}</p>
                <p className="text-sm text-gray-500 mt-1">
                  {filteredAssignments.filter(a => a.payment_status === 'pending').length} assignments
                </p>
              </div>
              <AlertCircle className="text-yellow-500" size={40} />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Paid Out</p>
                <p className="text-3xl font-bold text-gray-900">${totalPaid.toFixed(2)}</p>
                <p className="text-sm text-gray-500 mt-1">
                  {filteredAssignments.filter(a => a.payment_status === 'paid').length} assignments
                </p>
              </div>
              <CheckCircle className="text-green-600" size={40} />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total Assignments</p>
                <p className="text-3xl font-bold text-gray-900">{filteredAssignments.length}</p>
                <p className="text-sm text-gray-500 mt-1">
                  ${(totalOwed + totalPaid).toFixed(2)} total
                </p>
              </div>
              <DollarSign className="text-blue-600" size={40} />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-6 rounded-lg shadow space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
            
            {/* View Mode Toggle */}
            <div className="flex space-x-2">
              <button
                onClick={() => setGroupBy('none')}
                className={`px-3 py-1 rounded text-sm font-medium ${
                  groupBy === 'none'
                    ? 'bg-red-900 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                By Assignment
              </button>
              <button
                onClick={() => setGroupBy('event')}
                className={`px-3 py-1 rounded text-sm font-medium ${
                  groupBy === 'event'
                    ? 'bg-red-900 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                By Event
              </button>
              <button
                onClick={() => setGroupBy('worker')}
                className={`px-3 py-1 rounded text-sm font-medium ${
                  groupBy === 'worker'
                    ? 'bg-red-900 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                By Worker
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <input
                type="text"
                placeholder="Worker, event, position..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Worker</label>
              <select
                value={filterWorker}
                onChange={(e) => setFilterWorker(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="all">All Workers</option>
                {workers.map(worker => (
                  <option key={worker.id} value={worker.id}>{worker.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Event</label>
              <select
                value={filterEvent}
                onChange={(e) => setFilterEvent(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="all">All Events</option>
                {events.map(event => (
                  <option key={event.id} value={event.id}>{event.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pay Period</label>
              <select
                value={filterDateRange}
                onChange={(e) => setFilterDateRange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="all">All Time</option>
                <option value="this_week">This Week</option>
                <option value="last_week">Last Week</option>
                <option value="this_month">This Month</option>
                <option value="last_month">Last Month</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            {filterDateRange === 'custom' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
              </>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex space-x-2">
            <button
              onClick={selectAllPending}
              disabled={filteredAssignments.filter(a => a.payment_status === 'pending').length === 0}
              className="bg-yellow-500 text-white px-4 py-2 rounded-lg hover:bg-yellow-600 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium text-sm"
            >
              Select All Pending
            </button>
          </div>
        </div>

        {/* Bulk Actions */}
        {groupBy === 'none' && selectedAssignments.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle className="text-blue-600" size={20} />
              <span className="text-sm font-medium text-blue-900">
                {selectedAssignments.length} assignment{selectedAssignments.length !== 1 ? 's' : ''} selected
              </span>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={bulkMarkAsPaid}
                disabled={bulkActionLoading}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium text-sm disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {bulkActionLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>Mark All as Paid</span>
                )}
              </button>
              <button
                onClick={bulkMarkAsPending}
                disabled={bulkActionLoading}
                className="bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 font-medium text-sm disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {bulkActionLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>Mark All as Pending</span>
                )}
              </button>
              <button
                onClick={() => setSelectedAssignments([])}
                disabled={bulkActionLoading}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}

        {/* Payments Table or Grouped View */}
        {groupBy === 'none' ? (
          <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedAssignments.length === filteredAssignments.length && filteredAssignments.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-red-900 focus:ring-red-500"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Worker</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Event</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Position</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hours</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAssignments.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-6 py-12 text-center text-gray-500">
                      No payments found
                    </td>
                  </tr>
                ) : (
                  filteredAssignments.map(assignment => (
                    <tr key={assignment.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedAssignments.includes(assignment.id)}
                          onChange={() => toggleSelectAssignment(assignment.id)}
                          className="rounded border-gray-300 text-red-900 focus:ring-red-500"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{assignment.worker.name}</div>
                        <div className="text-sm text-gray-500">{assignment.worker.phone}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{assignment.event.name}</div>
                        <div className="text-sm text-gray-500">{assignment.event.venue}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">{getPositionLabel(assignment.position)}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(assignment.event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {assignment.hours || 0} hrs
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-bold text-gray-900">${(assignment.total_pay || 0).toFixed(2)}</div>
                        {assignment.total_pay > 0 && (
                          <div className="text-xs text-gray-500">
                            Base: ${(assignment.base_pay || 0).toFixed(2)} • Travel: ${(assignment.travel_pay || 0).toFixed(2)}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {assignment.payment_status === 'paid' ? (
                          <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded flex items-center space-x-1 w-fit">
                            <CheckCircle size={14} />
                            <span>Paid</span>
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded flex items-center space-x-1 w-fit">
                            <Clock size={14} />
                            <span>Pending</span>
                          </span>
                        )}
                        {assignment.paid_at && (
                          <div className="text-xs text-gray-500 mt-1">
                            {new Date(assignment.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {assignment.payment_status === 'pending' ? (
                          <button
                            onClick={() => markAsPaid(assignment.id)}
                            className="text-green-600 hover:text-green-800 font-medium"
                          >
                            Mark Paid
                          </button>
                        ) : (
                          <button
                            onClick={() => markAsPending(assignment.id)}
                            className="text-gray-600 hover:text-gray-800 font-medium"
                          >
                            Mark Pending
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        ) : (
          /* Grouped View */
          <div className="space-y-4">
            {groupedData && groupedData.map((group, index) => (
              <div key={index} className="bg-white rounded-lg shadow overflow-hidden">
                {/* Group Header */}
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">
                        {groupBy === 'event' ? group.event.name : group.worker.name}
                      </h3>
                      {groupBy === 'event' && (
                        <p className="text-sm text-gray-600">
                          {group.event.venue} • {new Date(group.event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      )}
                      {groupBy === 'worker' && (
                        <p className="text-sm text-gray-600">{group.worker.phone} • {group.worker.email}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-900">${group.totalPay.toFixed(2)}</p>
                      <div className="flex items-center space-x-2 text-sm mt-1">
                        {group.pendingCount > 0 && (
                          <span className="text-yellow-600">{group.pendingCount} pending</span>
                        )}
                        {group.paidCount > 0 && (
                          <span className="text-green-600">{group.paidCount} paid</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Group Items */}
                <div className="divide-y divide-gray-200">
                  {group.assignments.map(assignment => (
                    <div key={assignment.id} className="px-6 py-4 hover:bg-gray-50 flex justify-between items-center">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">{getPositionLabel(assignment.position)}</span>
                          {assignment.payment_status === 'paid' ? (
                            <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded flex items-center space-x-1">
                              <CheckCircle size={12} />
                              <span>Paid</span>
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded flex items-center space-x-1">
                              <Clock size={12} />
                              <span>Pending</span>
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-900 mt-1 font-medium">
                          {groupBy === 'event' ? assignment.worker.name : assignment.event.name}
                        </p>
                        {groupBy === 'worker' && (
                          <p className="text-sm text-gray-600">
                            {new Date(assignment.event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • {assignment.event.venue}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          {assignment.hours || 0} hrs • Base: ${(assignment.base_pay || 0).toFixed(2)} • Travel: ${(assignment.travel_pay || 0).toFixed(2)}
                        </p>
                      </div>
                      <div className="text-right flex items-center space-x-4">
                        <div>
                          <p className="text-lg font-bold text-gray-900">${(assignment.total_pay || 0).toFixed(2)}</p>
                          {assignment.paid_at && (
                            <p className="text-xs text-gray-500">
                              Paid {new Date(assignment.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </p>
                          )}
                        </div>
                        {assignment.payment_status === 'pending' ? (
                          <button
                            onClick={() => markAsPaid(assignment.id)}
                            className="text-green-600 hover:text-green-800 font-medium text-sm"
                          >
                            Mark Paid
                          </button>
                        ) : (
                          <button
                            onClick={() => markAsPending(assignment.id)}
                            className="text-gray-600 hover:text-gray-800 font-medium text-sm"
                          >
                            Mark Pending
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {groupedData && groupedData.length === 0 && (
              <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
                No payments found
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const ScheduleView = () => {
    const [viewMode, setViewMode] = useState('calendar'); // 'calendar' or 'list'
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [selectedWorker, setSelectedWorker] = useState(null);

    // Get events for a specific date
    const getEventsForDate = (date) => {
      // Format date as YYYY-MM-DD without timezone conversion
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      return events.filter(event => {
        // Extract just the date part from event.date (handles "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ss")
        const eventDateStr = event.date ? event.date.split('T')[0] : '';
        return eventDateStr === dateStr;
      });
    };

    // Get all assignments for a specific worker
    const getWorkerAssignments = (workerId) => {
      return assignments.filter(a => a.worker_id === workerId).map(assignment => {
        const event = events.find(e => e.id === assignment.event_id);
        return { ...assignment, event };
      }).filter(a => a.event); // Only include assignments with valid events
    };

    // Generate calendar days for current month
    const generateCalendarDays = () => {
      const year = selectedDate.getFullYear();
      const month = selectedDate.getMonth();
      
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const daysInMonth = lastDay.getDate();
      const startingDayOfWeek = firstDay.getDay();
      
      const days = [];
      
      // Add empty cells for days before month starts
      for (let i = 0; i < startingDayOfWeek; i++) {
        days.push(null);
      }
      
      // Add days of the month
      for (let day = 1; day <= daysInMonth; day++) {
        days.push(new Date(year, month, day));
      }
      
      return days;
    };

    const changeMonth = (direction) => {
      const newDate = new Date(selectedDate);
      newDate.setMonth(newDate.getMonth() + direction);
      setSelectedDate(newDate);
    };

    const formatMonthYear = (date) => {
      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    };

    const isToday = (date) => {
      if (!date) return false;
      const today = new Date();
      return date.toDateString() === today.toDateString();
    };

    const CalendarView = () => {
      const days = generateCalendarDays();
      const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      return (
        <div className="bg-white rounded-lg shadow p-6">
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold text-gray-900">{formatMonthYear(selectedDate)}</h3>
            <div className="flex space-x-2">
              <button
                onClick={() => changeMonth(-1)}
                className="p-2 hover:bg-gray-100 rounded"
              >
                <ChevronDown size={20} className="transform rotate-90" />
              </button>
              <button
                onClick={() => setSelectedDate(new Date())}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm font-medium"
              >
                Today
              </button>
              <button
                onClick={() => changeMonth(1)}
                className="p-2 hover:bg-gray-100 rounded"
              >
                <ChevronDown size={20} className="transform -rotate-90" />
              </button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-2">
            {/* Week day headers */}
            {weekDays.map(day => (
              <div key={day} className="text-center font-semibold text-gray-700 py-2">
                {day}
              </div>
            ))}
            
            {/* Calendar days */}
            {days.map((date, index) => {
              if (!date) {
                return <div key={`empty-${index}`} className="min-h-24 p-2 bg-gray-50 rounded"></div>;
              }
              
              const dayEvents = getEventsForDate(date);
              const hasEvents = dayEvents.length > 0;
              
              // Sort events by start time
              const sortedDayEvents = [...dayEvents].sort((a, b) => {
                const timeA = a.time || '00:00';
                const timeB = b.time || '00:00';
                return timeA.localeCompare(timeB);
              });
              
              return (
                <div
                  key={date.toISOString()}
                  className={`min-h-24 p-2 border rounded cursor-pointer transition-colors ${
                    isToday(date)
                      ? 'bg-red-50 border-red-300 ring-2 ring-red-200'
                      : hasEvents
                      ? 'bg-blue-50 border-blue-200 hover:bg-blue-100'
                      : 'bg-white hover:bg-gray-50'
                  }`}
                  onClick={() => {
                    setSelectedDate(date);
                    if (hasEvents) {
                      setViewMode('list');
                    }
                  }}
                >
                  <div className="text-sm font-semibold text-gray-900 mb-1">
                    {date.getDate()}
                  </div>
                  {sortedDayEvents.slice(0, 2).map(event => {
                    const eventAssignments = assignments.filter(a => a.event_id === event.id);
                    const totalNeeded = event.positions?.reduce((sum, p) => sum + p.count, 0) || 0;
                    const filled = eventAssignments.length;
                    const isFullyStaffed = filled >= totalNeeded && totalNeeded > 0;
                    
                    return (
                      <div
                        key={event.id}
                        className={`text-xs p-1 rounded mb-1 truncate ${
                          isFullyStaffed ? 'bg-green-600 text-white' : 'bg-yellow-500 text-white'
                        }`}
                        title={event.name}
                      >
                        {event.name}
                      </div>
                    );
                  })}
                  {dayEvents.length > 2 && (
                    <div className="text-xs text-gray-600 font-medium">
                      +{dayEvents.length - 2} more
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center space-x-4 mt-4 text-sm">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-green-600 rounded"></div>
              <span className="text-gray-700">Fully Staffed</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-yellow-500 rounded"></div>
              <span className="text-gray-700">Needs Staff</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-red-50 border-2 border-red-300 rounded"></div>
              <span className="text-gray-700">Today</span>
            </div>
          </div>
        </div>
      );
    };

    const ListView = () => {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const dayEvents = events
        .filter(event => event.date === dateStr)
        .sort((a, b) => {
          // Sort by start time (earliest first)
          const timeA = a.time || '00:00';
          const timeB = b.time || '00:00';
          return timeA.localeCompare(timeB);
        });

      return (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-bold text-gray-900">
                {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </h3>
              <button
                onClick={() => setViewMode('calendar')}
                className="text-red-900 hover:text-red-700 flex items-center space-x-1"
              >
                <Calendar size={18} />
                <span>Back to Calendar</span>
              </button>
            </div>

            {dayEvents.length === 0 ? (
              <div className="text-center py-12">
                <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
                <p className="text-gray-600">No events scheduled for this date</p>
              </div>
            ) : (
              <div className="space-y-4">
                {dayEvents.map(event => {
                  const eventAssignments = assignments.filter(a => a.event_id === event.id);
                  const totalNeeded = event.positions?.reduce((sum, p) => sum + p.count, 0) || 0;
                  const filled = eventAssignments.length;
                  
                  return (
                    <div key={event.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="text-lg font-bold text-gray-900">{event.name}</h4>
                          <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                            <span className="flex items-center space-x-1">
                              <Clock size={14} />
                              <span>{formatTime(event.time, timeFormat)}{event.end_time ? ` - ${formatTime(event.end_time, timeFormat)}` : ''}</span>
                            </span>
                            <span className="flex items-center space-x-1">
                              <MapPin size={14} />
                              <span>{event.venue}</span>
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                            filled >= totalNeeded && totalNeeded > 0
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {filled}/{totalNeeded} Staffed
                          </div>
                        </div>
                      </div>

                      {/* Assigned Workers */}
                      {eventAssignments.length > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-sm font-semibold text-gray-700 mb-2">Assigned Staff:</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {eventAssignments.map(assignment => {
                              const worker = workers.find(w => w.id === assignment.worker_id);
                              if (!worker) return null;
                              
                              return (
                                <div key={assignment.id} className="flex items-center space-x-2 text-sm bg-gray-50 p-2 rounded">
                                  <CheckCircle size={16} className="text-green-600" />
                                  <span className="font-medium text-gray-900">{worker.name}</span>
                                  <span className="text-gray-600">•</span>
                                  <span className="text-gray-600">{getPositionLabel(assignment.position)}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="mt-3 flex space-x-2">
                        <button
                          onClick={() => {
                            setSelectedEvent(event);
                            setShowAssignModal(true);
                          }}
                          className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                        >
                          Manage Staff
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      );
    };

    const WorkerScheduleView = () => {
      if (!selectedWorker) {
        return (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Worker Schedule</h3>
            <p className="text-gray-600 mb-4">Select a worker to see their schedule:</p>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {workers.map(worker => {
                const workerAssignments = getWorkerAssignments(worker.id);
                return (
                  <button
                    key={worker.id}
                    onClick={() => setSelectedWorker(worker)}
                    className="w-full text-left p-3 hover:bg-gray-50 rounded border flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{worker.name}</p>
                      <p className="text-sm text-gray-600">{workerAssignments.length} upcoming events</p>
                    </div>
                    <ChevronDown size={20} className="transform -rotate-90 text-gray-400" />
                  </button>
                );
              })}
            </div>
          </div>
        );
      }

      const workerAssignments = getWorkerAssignments(selectedWorker.id)
        .sort((a, b) => new Date(a.event.date) - new Date(b.event.date));

      return (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-2xl font-bold text-gray-900">{selectedWorker.name}'s Schedule</h3>
              <p className="text-sm text-gray-600 mt-1">{workerAssignments.length} upcoming events</p>
            </div>
            <button
              onClick={() => setSelectedWorker(null)}
              className="text-red-900 hover:text-red-700"
            >
              Back to Workers
            </button>
          </div>

          {workerAssignments.length === 0 ? (
            <div className="text-center py-12">
              <Users size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-600">No events assigned yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {workerAssignments.map(assignment => (
                <div key={assignment.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="font-bold text-gray-900">{assignment.event.name}</h4>
                      <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                        <span className="flex items-center space-x-1">
                          <Calendar size={14} />
                          <span>{new Date(assignment.event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <Clock size={14} />
                          <span>{formatTime(assignment.event.time, timeFormat)}</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <MapPin size={14} />
                          <span>{assignment.event.venue}</span>
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-medium">{getPositionLabel(assignment.position)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-3xl font-bold text-gray-900">Schedule</h2>
          <div className="flex space-x-2">
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${
                viewMode === 'calendar'
                  ? 'bg-red-900 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              <Calendar size={18} />
              <span>Calendar</span>
            </button>
            <button
              onClick={() => setViewMode('worker')}
              className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${
                viewMode === 'worker'
                  ? 'bg-red-900 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              <Users size={18} />
              <span>By Worker</span>
            </button>
          </div>
        </div>

        {viewMode === 'calendar' && <CalendarView />}
        {viewMode === 'list' && <ListView />}
        {viewMode === 'worker' && <WorkerScheduleView />}
      </div>
    );
  };

  const AvailableEventsSection = ({ currentWorker, events, assignments, rankAccessDays, timeFormat }) => {
    const [applying, setApplying] = useState(false);
    
    // Calculate which events the worker can see based on rank
    const getAvailableEvents = () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset to start of day
      const workerRank = currentWorker.rank || 5;
      const accessDays = rankAccessDays[workerRank] || 14;
      
      
      return events
        .filter(event => {
          
          // Must be future event
          const eventDate = new Date(event.date);
          eventDate.setHours(0, 0, 0, 0);
          if (eventDate < today) {
            return false;
          }
          
          // Calculate days until event
          const daysUntil = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
          
          // Check if within access window (Rank 1 with 0 days can see all future events)
          if (accessDays > 0 && daysUntil > accessDays) {
            return false;
          }
          
          // Must have positions that match worker skills (using position keys)
          const eventPositions = Array.isArray(event.positions) ? event.positions : [];
          
          // Extract position keys from position objects
          const positionKeys = eventPositions.map(pos => 
            pos.key || getPositionKey(pos.name || pos)
          );
          
          const workerSkillKeys = currentWorker.skills || [];
          const hasMatchingSkill = positionKeys.some(posKey => 
            workerSkillKeys.some(skillKey => positionMatches(skillKey, posKey))
          );
          
          // DEBUG: Show which positions/skills are being compared
          positionKeys.forEach(posKey => {
            const matches = workerSkillKeys.some(skillKey => positionMatches(skillKey, posKey));
          });
          
          if (!hasMatchingSkill) {
            return false;
          }
          
          // Not already assigned or applied
          const alreadyAssigned = assignments.some(a => 
            a.event_id === event.id && 
            a.worker_id === currentWorker.id &&
            ['approved', 'pending'].includes(a.status || 'approved')
          );
          
          if (alreadyAssigned) {
            return false;
          }
          
          return true;
        })
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    };
    
    const availableEvents = getAvailableEvents();
    
    const applyToEvent = async (event, position) => {
      // Check for time conflicts first
      const workerAssignments = assignments.filter(a => 
        a.worker_id === currentWorker.id && 
        a.event_id !== event.id &&
        ['approved', 'pending'].includes(a.status || 'approved')
      );
      
      let hasTimeConflict = false;
      let conflictEvent = null;
      
      if (workerAssignments.length > 0) {
        const conflicts = workerAssignments.filter(assignment => {
          const otherEvent = events.find(e => e.id === assignment.event_id);
          if (!otherEvent || otherEvent.date !== event.date) return false;
          
          const parseTime = (timeStr) => {
            if (!timeStr) return null;
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
          };
          
          const thisStart = parseTime(event.time);
          const thisEnd = parseTime(event.end_time);
          const otherStart = parseTime(otherEvent.time);
          const otherEnd = parseTime(otherEvent.end_time);
          
          if (!thisEnd || !otherEnd) return false;
          
          return (thisStart < otherEnd) && (thisEnd > otherStart);
        });
        
        if (conflicts.length > 0) {
          hasTimeConflict = true;
          conflictEvent = events.find(e => e.id === conflicts[0].event_id);
        }
      }
      
      if (hasTimeConflict && conflictEvent) {
        alert(`⚠️ TIME CONFLICT!\n\nYou're already assigned/applied to:\n${conflictEvent.name}\n${formatTime(conflictEvent.time, timeFormat)} - ${formatTime(conflictEvent.end_time, timeFormat)}\n\nThis conflicts with:\n${event.name}\n${formatTime(event.time, timeFormat)} - ${formatTime(event.end_time, timeFormat)}\n\nPlease contact admin if you need to change assignments.`);
        return;
      }
      
      if (!confirm(`Apply for ${position} position at ${event.name}?`)) return;
      
      setApplying(true);
      try {
        // Convert position label back to key for storage
        const positionKey = getPositionKey(position);
        
        const { error } = await supabase
          .from('assignments')
          .insert([{
            event_id: event.id,
            worker_id: currentWorker.id,
            position: positionKey,
            status: 'pending',
            applied_at: new Date().toISOString()
          }]);
        
        if (error) throw error;
        
        loadAssignments();
        alert(`✓ Application submitted for ${event.name}!\n\nYour application is pending admin approval. You'll be notified once it's reviewed.`);
      } catch (error) {
        alert('Error submitting application: ' + error.message);
      } finally {
        setApplying(false);
      }
    };
    
    if (availableEvents.length === 0) {
      return (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Available Events</h3>
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-600">No events available to apply for right now.</p>
            <p className="text-sm text-gray-500 mt-2">
              Check back later or contact admin for more opportunities.
            </p>
          </div>
        </div>
      );
    }
    
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-gray-900">Available Events</h3>
          <span className="bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full">
            {availableEvents.length} Available
          </span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {availableEvents.map(event => {
            // Get positions that match worker skills (using position keys)
            const eventPositions = Array.isArray(event.positions) ? event.positions : [];
            
            // Extract position keys
            const positionKeys = eventPositions.map(pos => 
              pos.key || getPositionKey(pos.name || pos)
            );
            
            // Find matching positions
            const workerSkillKeys = currentWorker.skills || [];
            const matchingPositionKeys = positionKeys.filter(posKey => 
              workerSkillKeys.some(skillKey => positionMatches(skillKey, posKey))
            );
            
            // Convert back to labels for display
            const matchingPositions = matchingPositionKeys.map(key => getPositionLabel(key));
            
            const daysUntil = Math.ceil((parseDateSafe(event.date) - new Date()) / (1000 * 60 * 60 * 24));
            
            return (
              <div key={event.id} className="border-2 border-blue-200 rounded-lg p-4 hover:shadow-md transition-shadow bg-blue-50">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-bold text-gray-900">{event.name}</h4>
                  {daysUntil <= 7 && (
                    <span className="bg-orange-500 text-white text-xs px-2 py-1 rounded font-semibold">
                      Soon!
                    </span>
                  )}
                </div>
                
                <div className="space-y-1 text-sm text-gray-700 mb-3">
                  <div className="flex items-center space-x-2">
                    <Calendar size={14} className="text-gray-500" />
                    <span>{parseDateSafe(event.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Clock size={14} className="text-gray-500" />
                    <span>{formatTime(event.time, timeFormat)}{event.end_time ? ` - ${formatTime(event.end_time, timeFormat)}` : ''}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <MapPin size={14} className="text-gray-500" />
                    <span>
                      {event.venue}
                      {event.room && <span className="text-gray-600"> - {event.room}</span>}
                    </span>
                  </div>
                  {event.address && (
                    <div className="mt-2 p-2 bg-white rounded border border-gray-200">
                      <p className="text-xs font-semibold text-gray-700 mb-1">Address:</p>
                      <p className="text-xs text-gray-900 mb-1">{event.address}</p>
                      <a 
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 text-xs font-medium inline-flex items-center space-x-1"
                      >
                        <MapPin size={12} />
                        <span>Open in Google Maps</span>
                      </a>
                    </div>
                  )}
                  {paymentTrackingEnabled && eventPaymentSettings[event.id] && (
                    <div className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-700">Estimated Pay:</span>
                        <span className="text-sm font-bold text-green-700">
                          ~${eventPaymentSettings[event.id].hours && payRates[matchingPositions[0]] 
                            ? (eventPaymentSettings[event.id].hours * payRates[matchingPositions[0]]).toFixed(0)
                            : '???'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">
                        {eventPaymentSettings[event.id].hours || '?'} hrs • Plus travel pay
                      </p>
                    </div>
                  )}
                </div>
                
                <div className="mb-3">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Available Positions:</p>
                  <div className="flex flex-wrap gap-2">
                    {matchingPositions.map(position => (
                      <button
                        key={position}
                        onClick={() => applyToEvent(event, position)}
                        disabled={applying}
                        className="bg-green-600 text-white text-xs px-3 py-1 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                      >
                        Apply: {position}
                      </button>
                    ))}
                  </div>
                </div>
                
                {event.notes && (
                  <p className="text-xs text-gray-600 bg-yellow-50 p-2 rounded border border-yellow-200">
                    📝 {event.notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const WorkerPortalView = () => {
    const [viewMode, setViewMode] = useState('calendar'); // 'calendar' or 'list'
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [selectedEventModal, setSelectedEventModal] = useState(null);

    const currentWorker = loggedInWorker;
    if (!currentWorker) {
      return (
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-red-600">Error: Not logged in as a worker.</p>
        </div>
      );
    }

    const workerAssignments = assignments
      .filter(a => a.worker_id === currentWorker.id && a.status === 'approved')
      .map(assignment => {
        const event = events.find(e => e.id === assignment.event_id);
        return { ...assignment, event };
      })
      .filter(a => a.event);

    const pendingApplications = assignments
      .filter(a => a.worker_id === currentWorker.id && a.status === 'pending')
      .map(assignment => {
        const event = events.find(e => e.id === assignment.event_id);
        return { ...assignment, event };
      })
      .filter(a => a.event);

    const today = new Date();
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const upcomingAssignments = workerAssignments
      .filter(a => {
        const eventDate = parseDateSafe(a.event.date);
        const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
        return eventDateOnly >= todayOnly;
      })
      .sort((a, b) => new Date(a.event.date) - new Date(b.event.date));

    const pastAssignments = workerAssignments
      .filter(a => {
        const eventDate = parseDateSafe(a.event.date);
        const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
        return eventDateOnly < todayOnly;
      })
      .sort((a, b) => new Date(b.event.date) - new Date(a.event.date));

    const totalEarnings = currentWorker.earnings || 0;

    const cancelAssignment = async (assignment) => {
      const eventDate = new Date(assignment.event.date);
      const today = new Date();
      const daysUntil = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
      
      // Check if within 7 days
      if (daysUntil < 7) {
        alert(
          `⚠️ Cannot Cancel\n\n` +
          `This event is ${daysUntil} day${daysUntil !== 1 ? 's' : ''} away.\n\n` +
          `Events within 7 days cannot be cancelled online.\n` +
          `Please contact your admin directly if you need to cancel.`
        );
        return;
      }
      
      if (!confirm(
        `Cancel your assignment to "${assignment.event.name}"?\n\n` +
        `Position: ${getPositionLabel(assignment.position)}\n` +
        `Date: ${parseDateSafe(assignment.event.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}\n\n` +
        `This will remove you from the event.`
      )) {
        return;
      }
      
      try {
        const { error } = await supabase
          .from('assignments')
          .delete()
          .eq('id', assignment.id);
        
        if (error) throw error;
        
        loadAssignments();
        alert('✓ Assignment cancelled successfully.');
      } catch (error) {
        alert('Error cancelling assignment: ' + error.message);
      }
    };

    const switchPosition = async (assignment, newPositionKey) => {
      const eventDate = new Date(assignment.event.date);
      const today = new Date();
      const daysUntil = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
      
      // Check if within 7 days
      if (daysUntil < 7) {
        alert(
          `⚠️ Cannot Switch Position\n\n` +
          `This event is ${daysUntil} day${daysUntil !== 1 ? 's' : ''} away.\n\n` +
          `Position changes within 7 days require admin approval.\n` +
          `Please contact your admin directly.`
        );
        return;
      }
      
      const newPositionLabel = getPositionLabel(newPositionKey);
      const currentPositionLabel = getPositionLabel(assignment.position);
      
      if (!confirm(
        `Switch position for "${assignment.event.name}"?\n\n` +
        `From: ${currentPositionLabel}\n` +
        `To: ${newPositionLabel}\n\n` +
        `This change will take effect immediately.`
      )) {
        return;
      }
      
      try {
        const { error } = await supabase
          .from('assignments')
          .update({ position: newPositionKey })
          .eq('id', assignment.id);
        
        if (error) throw error;
        
        loadAssignments();
        alert(`✓ Position switched to ${newPositionLabel}!`);
      } catch (error) {
        alert('Error switching position: ' + error.message);
      }
    };

    return (
      <div className="space-y-6">
        {/* Header with worker info */}
        <div className="bg-gradient-to-r from-red-900 to-black text-white rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-3xl font-bold mb-2">Welcome, {currentWorker.name}!</h2>
              <p className="text-red-200">Your worker portal</p>
            </div>
          </div>
        </div>

        {/* Pending Applications Alert */}
        {pendingApplications.length > 0 && (
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <Clock size={24} className="text-yellow-600" />
              <div>
                <p className="font-semibold text-yellow-900">
                  {pendingApplications.length} Application{pendingApplications.length !== 1 ? 's' : ''} Pending Approval
                </p>
                <p className="text-sm text-yellow-700">
                  {pendingApplications.map(a => a.event.name).join(', ')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Upcoming Events</p>
                <p className="text-3xl font-bold text-gray-900">{upcomingAssignments.length}</p>
              </div>
              <Calendar className="text-blue-600" size={40} />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total Gigs</p>
                <p className="text-3xl font-bold text-gray-900">{currentWorker.total_gigs}</p>
              </div>
              <Briefcase className="text-green-600" size={40} />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-yellow-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Reliability Rating</p>
                <div className="flex items-center space-x-1">
                  <p className="text-3xl font-bold text-gray-900">{currentWorker.reliability}</p>
                  <Star size={24} className="text-yellow-500 fill-yellow-500" />
                </div>
              </div>
              <Award className="text-yellow-600" size={40} />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-purple-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total Earnings</p>
                <p className="text-3xl font-bold text-gray-900">${totalEarnings.toLocaleString()}</p>
              </div>
              <DollarSign className="text-purple-600" size={40} />
            </div>
          </div>
        </div>

        {/* Contact Info */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Your Profile</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Contact Information</h4>
              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-gray-600">
                  <Mail size={16} />
                  <span>{currentWorker.email}</span>
                </div>
                <div className="flex items-center space-x-2 text-gray-600">
                  <Phone size={16} />
                  <span>{currentWorker.phone}</span>
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Your Skills</h4>
              <div className="flex flex-wrap gap-2">
                {Array.isArray(currentWorker.skills) && currentWorker.skills.map((skill, idx) => (
                  <span key={idx} className="bg-red-100 text-red-800 text-sm px-3 py-1 rounded-full font-medium">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Rank Level</p>
                <p className="font-semibold text-gray-900">Level {currentWorker.rank}</p>
              </div>
              <div>
                <p className="text-gray-600">No Shows</p>
                <p className="font-semibold text-gray-900">{currentWorker.no_shows || 0}</p>
              </div>
              <div>
                <p className="text-gray-600">Last Worked</p>
                <p className="font-semibold text-gray-900">
                  {currentWorker.last_worked 
                    ? new Date(currentWorker.last_worked).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-gray-600">Member Since</p>
                <p className="font-semibold text-gray-900">
                  {new Date(currentWorker.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Available Events - Events worker can apply to */}
        <AvailableEventsSection 
          currentWorker={currentWorker} 
          events={events}
          assignments={assignments}
          rankAccessDays={rankAccessDays}
          timeFormat={timeFormat}
        />

        {/* Upcoming Events */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-gray-900">Your Schedule</h3>
            <div className="flex space-x-2">
              <button
                onClick={() => setViewMode('calendar')}
                className={`px-4 py-2 rounded-lg font-medium text-sm ${
                  viewMode === 'calendar'
                    ? 'bg-red-900 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Calendar
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-4 py-2 rounded-lg font-medium text-sm ${
                  viewMode === 'list'
                    ? 'bg-red-900 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                List
              </button>
            </div>
          </div>

          {viewMode === 'calendar' ? (
            /* Calendar View */
            <div>
              {/* Month Navigation */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1))}
                  className="p-2 hover:bg-gray-100 rounded"
                >
                  <ChevronDown size={20} className="transform rotate-90" />
                </button>
                <h4 className="text-lg font-semibold">
                  {selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </h4>
                <button
                  onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1))}
                  className="p-2 hover:bg-gray-100 rounded"
                >
                  <ChevronDown size={20} className="transform -rotate-90" />
                </button>
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="text-center text-sm font-semibold text-gray-600 py-2">
                    {day}
                  </div>
                ))}
                
                {(() => {
                  const year = selectedDate.getFullYear();
                  const month = selectedDate.getMonth();
                  const firstDay = new Date(year, month, 1).getDay();
                  const daysInMonth = new Date(year, month + 1, 0).getDate();
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  
                  const days = [];
                  
                  // Empty cells before month starts
                  for (let i = 0; i < firstDay; i++) {
                    days.push(<div key={`empty-${i}`} className="aspect-square"></div>);
                  }
                  
                  // Days of the month
                  for (let day = 1; day <= daysInMonth; day++) {
                    const currentDate = new Date(year, month, day);
                    currentDate.setHours(0, 0, 0, 0);
                    // Format date as YYYY-MM-DD without timezone conversion
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    
                    const dayAssignments = workerAssignments
                      .filter(a => {
                        if (!a.event || !a.event.date) return false;
                        
                        // Normalize the event date to YYYY-MM-DD format
                        // Handle both "YYYY-MM-DD" and "YYYY-MM-DDTHH:mm:ss" formats
                        const eventDateStr = a.event.date.split('T')[0];
                        
                        return eventDateStr === dateStr;
                      })
                      .sort((a, b) => {
                        // Sort by event start time (earliest first)
                        const timeA = a.event.time || '00:00';
                        const timeB = b.event.time || '00:00';
                        return timeA.localeCompare(timeB);
                      });
                    
                    const isToday = currentDate.getTime() === today.getTime();
                    const isPast = currentDate < today;
                    
                    days.push(
                      <div
                        key={day}
                        onClick={() => {
                          if (dayAssignments.length > 0) {
                            setSelectedEventModal(dayAssignments);
                          }
                        }}
                        className={`aspect-square border rounded-lg p-1 ${
                          isToday ? 'border-red-500 border-2 bg-red-50' :
                          isPast ? 'bg-gray-50' :
                          'border-gray-200 hover:bg-gray-50'
                        } ${dayAssignments.length > 0 ? 'cursor-pointer hover:shadow-md transition-shadow' : ''} relative`}
                      >
                        <div className="text-sm font-semibold text-gray-900">{day}</div>
                        {dayAssignments.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {dayAssignments.slice(0, 2).map((assignment, idx) => (
                              <div
                                key={idx}
                                className="text-xs bg-blue-500 text-white px-1 py-0.5 rounded truncate"
                                title={`${assignment.event.name} - ${getPositionLabel(assignment.position)}`}
                              >
                                {formatTime(assignment.event.time, timeFormat)} {assignment.position}
                              </div>
                            ))}
                            {dayAssignments.length > 2 && (
                              <div className="text-xs text-gray-600">
                                +{dayAssignments.length - 2} more
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }
                  
                  return days;
                })()}
              </div>

              {/* Legend */}
              <div className="mt-4 flex items-center justify-center space-x-4 text-sm">
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-red-500 rounded"></div>
                  <span className="text-gray-600">Today</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 bg-blue-500 rounded"></div>
                  <span className="text-gray-600">Your Events</span>
                </div>
              </div>
            </div>
          ) : (
            /* List View */
            <>
          {upcomingAssignments.length === 0 ? (
            <div className="text-center py-8">
              <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-600">No upcoming events scheduled</p>
            </div>
          ) : (
            <div className="space-y-4">
              {upcomingAssignments.map(assignment => {
                const eventDate = parseDateSafe(assignment.event.date);
                const today = new Date();
                
                // Normalize both dates to midnight for accurate comparison
                const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
                const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                
                const daysUntil = Math.ceil((eventDateOnly - todayOnly) / (1000 * 60 * 60 * 24));
                const isToday = daysUntil === 0;
                const isTomorrow = daysUntil === 1;
                const canCancel = daysUntil >= 7;
                
                return (
                  <div 
                    key={assignment.id} 
                    className={`border-l-4 p-4 rounded-r-lg ${
                      isToday ? 'bg-red-50 border-red-500' : 
                      isTomorrow ? 'bg-yellow-50 border-yellow-500' : 
                      'bg-gray-50 border-blue-500'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <h4 className="font-bold text-gray-900">{assignment.event.name}</h4>
                          {isToday && (
                            <span className="bg-red-500 text-white text-xs px-2 py-1 rounded font-semibold">
                              TODAY
                            </span>
                          )}
                          {isTomorrow && (
                            <span className="bg-yellow-500 text-white text-xs px-2 py-1 rounded font-semibold">
                              TOMORROW
                            </span>
                          )}
                        </div>
                        <span className="bg-red-900 text-white text-xs px-2 py-1 rounded font-medium">{getPositionLabel(assignment.position)}</span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 text-sm text-gray-700">
                      <div className="flex items-center space-x-2">
                        <Calendar size={16} className="text-gray-500" />
                        <span>
                          {parseDateSafe(assignment.event.date).toLocaleDateString('en-US', { 
                            weekday: 'short',
                            month: 'short', 
                            day: 'numeric' 
                          })}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Clock size={16} className="text-gray-500" />
                        <span>{formatTime(assignment.event.time, timeFormat)}{assignment.event.end_time ? ` - ${formatTime(assignment.event.end_time, timeFormat)}` : ''}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <MapPin size={16} className="text-gray-500" />
                        <span>
                          {assignment.event.venue}
                          {assignment.event.room && <span className="text-gray-600"> - {assignment.event.room}</span>}
                        </span>
                      </div>
                    </div>

                    {assignment.event.address && (
                      <div className="mt-3 p-3 bg-white rounded border border-gray-200">
                        <p className="text-sm font-semibold text-gray-700 mb-1">Address:</p>
                        <p className="text-sm text-gray-900">{assignment.event.address}</p>
                        <a 
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(assignment.event.address)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium mt-2 inline-flex items-center space-x-1"
                        >
                          <MapPin size={14} />
                          <span>Open in Google Maps</span>
                        </a>
                      </div>
                    )}

                    {assignment.event.dress_code && (
                      <div className="mt-2 text-sm text-gray-600">
                        <span className="font-medium">Dress Code:</span> {assignment.event.dress_code}
                      </div>
                    )}

                    {assignment.event.parking && (
                      <div className="mt-2 text-sm text-gray-600">
                        <span className="font-medium">Parking:</span> {assignment.event.parking}
                      </div>
                    )}

                    {assignment.event.notes && (
                      <div className="mt-3 pt-3 border-t text-sm text-gray-600">
                        <span className="font-medium">Notes:</span> {assignment.event.notes}
                      </div>
                    )}

                    {/* Switch Position Section */}
                    {(() => {
                      // Get available positions for this event
                      const eventPositions = assignment.event.positions || [];
                      const eventAssignments = assignments.filter(a => a.event_id === assignment.event.id && a.status === 'approved');
                      
                      // Find positions worker is qualified for but not currently assigned to
                      const availablePositions = eventPositions
                        .filter(pos => {
                          const posKey = pos.key || pos.name || pos;
                          // Skip current position
                          if (posKey === assignment.position) return false;
                          
                          // Check if worker has the skill
                          const hasSkill = currentWorker.skills?.some(skill => positionMatches(skill, posKey));
                          if (!hasSkill) return false;
                          
                          // Check if position has space
                          const assignedCount = eventAssignments.filter(a => a.position === posKey).length;
                          const needed = pos.count || 0;
                          return assignedCount < needed;
                        });

                      if (availablePositions.length === 0) return null;

                      return (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-sm font-medium text-gray-700 mb-2 flex items-center space-x-1">
                            <MessageSquare size={14} />
                            <span>Switch to different position?</span>
                          </p>
                          <div className="space-y-2">
                            {availablePositions.map(pos => {
                              const posKey = pos.key || pos.name || pos;
                              const posLabel = getPositionLabel(posKey);
                              const assignedCount = eventAssignments.filter(a => a.position === posKey).length;
                              const needed = pos.count || 0;
                              
                              return (
                                <div key={posKey} className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
                                  <div>
                                    <p className="text-sm font-medium text-gray-900">{posLabel}</p>
                                    <p className="text-xs text-gray-500">{assignedCount} of {needed} spots filled</p>
                                  </div>
                                  {canCancel ? (
                                    <button
                                      onClick={() => switchPosition(assignment, posKey)}
                                      className="text-blue-600 hover:text-blue-800 text-xs font-medium px-3 py-1 bg-blue-50 rounded hover:bg-blue-100"
                                    >
                                      Switch
                                    </button>
                                  ) : (
                                    <span className="text-xs text-gray-400">Contact admin</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Cancel Button */}
                    <div className="mt-4 pt-4 border-t flex items-center justify-between">
                      {canCancel ? (
                        <button
                          onClick={() => cancelAssignment(assignment)}
                          className="text-red-600 hover:text-red-800 text-sm font-medium flex items-center space-x-1"
                        >
                          <XCircle size={16} />
                          <span>Cancel Assignment</span>
                        </button>
                      ) : (
                        <div className="text-xs text-gray-500">
                          ⚠️ Cannot cancel within 7 days - contact admin
                        </div>
                      )}
                      <div className="text-xs text-gray-500">
                        {daysUntil} day{daysUntil !== 1 ? 's' : ''} away
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </>
          )}
        </div>

        {/* Past Events */}
        {pastAssignments.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Past Events</h3>
            <div className="space-y-3">
              {pastAssignments.slice(0, 5).map(assignment => (
                <div key={assignment.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{assignment.event.name}</p>
                    <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                      <span>{parseDateSafe(assignment.event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      <span>•</span>
                      <span>{getPositionLabel(assignment.position)}</span>
                      <span>•</span>
                      <span>
                        {assignment.event.venue}
                        {assignment.event.room && ` - ${assignment.event.room}`}
                      </span>
                    </div>
                  </div>
                  <CheckCircle size={20} className="text-green-600" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Event Details Modal */}
        {selectedEventModal && selectedEventModal.length > 0 && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-2xl font-bold text-gray-900">
                    Events on {parseDateSafe(selectedEventModal[0].event.date).toLocaleDateString('en-US', { 
                      weekday: 'long',
                      month: 'long', 
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </h3>
                  <button 
                    onClick={() => setSelectedEventModal(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-4">
                  {selectedEventModal
                    .sort((a, b) => {
                      // Sort by start time (earliest first)
                      const timeA = a.event.time || '00:00';
                      const timeB = b.event.time || '00:00';
                      return timeA.localeCompare(timeB);
                    })
                    .map((assignment, idx) => {
                    const eventDate = parseDateSafe(assignment.event.date);
                    const today = new Date();
                    
                    // Normalize both dates to midnight for accurate comparison
                    const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
                    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                    
                    const daysUntil = Math.ceil((eventDateOnly - todayOnly) / (1000 * 60 * 60 * 24));
                    const isToday = daysUntil === 0;
                    const isTomorrow = daysUntil === 1;
                    const canCancel = daysUntil >= 7;

                    return (
                      <div 
                        key={idx}
                        className={`border-l-4 p-4 rounded-r-lg ${
                          isToday ? 'bg-red-50 border-red-500' : 
                          isTomorrow ? 'bg-yellow-50 border-yellow-500' : 
                          'bg-gray-50 border-blue-500'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <h4 className="font-bold text-gray-900 text-lg">{assignment.event.name}</h4>
                              {isToday && (
                                <span className="bg-red-500 text-white text-xs px-2 py-1 rounded font-semibold">
                                  TODAY
                                </span>
                              )}
                              {isTomorrow && (
                                <span className="bg-yellow-500 text-white text-xs px-2 py-1 rounded font-semibold">
                                  TOMORROW
                                </span>
                              )}
                            </div>
                            <span className="bg-red-900 text-white text-xs px-2 py-1 rounded font-medium">{getPositionLabel(assignment.position)}</span>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-sm text-gray-700">
                          <div className="flex items-center space-x-2">
                            <Clock size={16} className="text-gray-500" />
                            <span className="font-medium">
                              {formatTime(assignment.event.time, timeFormat)}{assignment.event.end_time ? ` - ${formatTime(assignment.event.end_time, timeFormat)}` : ''}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <MapPin size={16} className="text-gray-500" />
                            <span>
                              {assignment.event.venue}
                              {assignment.event.room && <span className="text-gray-600"> - {assignment.event.room}</span>}
                            </span>
                          </div>
                        </div>

                        {assignment.event.address && (
                          <div className="mt-3 p-3 bg-white rounded border border-gray-200">
                            <p className="text-sm font-semibold text-gray-700 mb-1">Address:</p>
                            <p className="text-sm text-gray-900">{assignment.event.address}</p>
                            <a 
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(assignment.event.address)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 text-sm font-medium mt-2 inline-flex items-center space-x-1"
                            >
                              <MapPin size={14} />
                              <span>Open in Google Maps</span>
                            </a>
                          </div>
                        )}

                        {assignment.event.dress_code && (
                          <div className="mt-2 text-sm">
                            <span className="font-medium text-gray-700">Dress Code:</span>
                            <span className="text-gray-900 ml-2">{assignment.event.dress_code}</span>
                          </div>
                        )}

                        {assignment.event.parking && (
                          <div className="mt-2 text-sm">
                            <span className="font-medium text-gray-700">Parking:</span>
                            <span className="text-gray-900 ml-2">{assignment.event.parking}</span>
                          </div>
                        )}

                        {assignment.event.notes && (
                          <div className="mt-3 pt-3 border-t text-sm">
                            <p className="font-medium text-gray-700 mb-1">Important Notes:</p>
                            <p className="text-gray-900">{assignment.event.notes}</p>
                          </div>
                        )}

                        {/* Switch Position Section */}
                        {(() => {
                          // Get available positions for this event
                          const eventPositions = assignment.event.positions || [];
                          const eventAssignments = assignments.filter(a => a.event_id === assignment.event.id && a.status === 'approved');
                          
                          // Find positions worker is qualified for but not currently assigned to
                          const availablePositions = eventPositions
                            .filter(pos => {
                              const posKey = pos.key || pos.name || pos;
                              // Skip current position
                              if (posKey === assignment.position) return false;
                              
                              // Check if worker has the skill
                              const hasSkill = currentWorker.skills?.some(skill => positionMatches(skill, posKey));
                              if (!hasSkill) return false;
                              
                              // Check if position has space
                              const assignedCount = eventAssignments.filter(a => a.position === posKey).length;
                              const needed = pos.count || 0;
                              return assignedCount < needed;
                            });

                          if (availablePositions.length === 0) return null;

                          return (
                            <div className="mt-3 pt-3 border-t">
                              <p className="text-sm font-medium text-gray-700 mb-2 flex items-center space-x-1">
                                <MessageSquare size={14} />
                                <span>Switch to different position?</span>
                              </p>
                              <div className="space-y-2">
                                {availablePositions.map(pos => {
                                  const posKey = pos.key || pos.name || pos;
                                  const posLabel = getPositionLabel(posKey);
                                  const assignedCount = eventAssignments.filter(a => a.position === posKey).length;
                                  const needed = pos.count || 0;
                                  
                                  return (
                                    <div key={posKey} className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
                                      <div>
                                        <p className="text-sm font-medium text-gray-900">{posLabel}</p>
                                        <p className="text-xs text-gray-500">{assignedCount} of {needed} spots filled</p>
                                      </div>
                                      {canCancel ? (
                                        <button
                                          onClick={() => {
                                            switchPosition(assignment, posKey);
                                            setSelectedEventModal(null); // Close modal after switch
                                          }}
                                          className="text-blue-600 hover:text-blue-800 text-xs font-medium px-3 py-1 bg-blue-50 rounded hover:bg-blue-100"
                                        >
                                          Switch
                                        </button>
                                      ) : (
                                        <span className="text-xs text-gray-400">Contact admin</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Cancel Button */}
                        <div className="mt-3 pt-3 border-t flex items-center justify-between">
                          {canCancel ? (
                            <button
                              onClick={() => {
                                cancelAssignment(assignment);
                                setSelectedEventModal(null); // Close modal after cancel
                              }}
                              className="text-red-600 hover:text-red-800 text-sm font-medium flex items-center space-x-1"
                            >
                              <XCircle size={16} />
                              <span>Cancel Assignment</span>
                            </button>
                          ) : (
                            <div className="text-xs text-gray-500">
                              ⚠️ Cannot cancel within 7 days - contact admin
                            </div>
                          )}
                          <div className="text-xs text-gray-500">
                            {daysUntil} day{daysUntil !== 1 ? 's' : ''} away
                          </div>
                        </div>

                        {paymentTrackingEnabled && assignment.total_pay > 0 && (
                          <div className="mt-3 pt-3 border-t">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-gray-700">Your Pay:</span>
                              <span className="text-lg font-bold text-green-600">${assignment.total_pay.toFixed(2)}</span>
                            </div>
                            <div className="text-xs text-gray-600 mt-1">
                              {assignment.hours} hrs • Base: ${(assignment.base_pay || 0).toFixed(2)} • Travel: ${(assignment.travel_pay || 0).toFixed(2)}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={() => setSelectedEventModal(null)}
                  className="w-full mt-6 bg-gray-200 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-300 font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderView = () => {
    // Worker mode - show worker portal instead of admin views
    if (userRole === 'worker') {
      return <WorkerPortalView />;
    }
    
    // Admin views
    if (currentView === 'dashboard') {
      return (
        <DashboardView
          events={events}
          workers={workers}
          assignments={assignments}
          timeFormat={timeFormat}
          onNavigate={setCurrentView}
          onShowAddEvent={() => setShowAddEvent(true)}
          onShowAddWorker={() => setShowAddWorker(true)}
          onOpenAssignModal={(event) => {
            setSelectedEvent(event);
            setShowAssignModal(true);
          }}
        />
      );
    }
    if (currentView === 'staff') {
      return (
        <StaffView
          loading={loading}
          error={error}
          workers={workers}
          onShowBulkInvite={() => setShowBulkInvite(true)}
          onShowAddWorker={() => setShowAddWorker(true)}
          onSetPin={(worker) => {
            setSelectedWorkerForPin(worker);
            setShowSetPinModal(true);
          }}
          onEditWorker={(worker) => {
            setSelectedWorkerForEdit(worker);
            setShowEditWorker(true);
          }}
          onDeleteWorker={deleteWorker}
          onRetryLoad={loadWorkers}
        />
      );
    }
    if (currentView === 'events') {
      return (
        <EventsView
          events={events}
          assignments={assignments}
          timeFormat={timeFormat}
          onShowAddEvent={() => setShowAddEvent(true)}
          onOpenAssignModal={(event) => {
            setSelectedEvent(event);
            setShowAssignModal(true);
          }}
          onOpenEditEvent={(event) => {
            setSelectedEvent(event);
            setShowEditEvent(true);
          }}
          onDeleteEvent={deleteEvent}
        />
      );
    }
    if (currentView === 'schedule') return <ScheduleView />;
    if (currentView === 'applications') {
      return (
        <ApplicationsView
          assignments={assignments}
          workers={workers}
          events={events}
          timeFormat={timeFormat}
          onReloadAssignments={loadAssignments}
        />
      );
    }
    if (currentView === 'payments') return <PaymentsView />;
    if (currentView === 'settings') {
      return (
        <SettingsView
          positions={positions}
          onUpdatePositions={setPositions}
        />
      );
    }
    
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Coming Soon</h3>
        <p className="text-gray-600">This feature will be available soon!</p>
      </div>
    );
  };

  const handleLogin = (role, user) => {
    setUserRole(role);
    setIsAuthenticated(true);
    if (role === 'worker') {
      setLoggedInWorker(user);
    }
    // Store in sessionStorage to persist across page refreshes
    sessionStorage.setItem('userRole', role);
    sessionStorage.setItem('userId', user.id);
  };

  const handleLogout = () => {
    setUserRole(null);
    setIsAuthenticated(false);
    setLoggedInWorker(null);
    sessionStorage.removeItem('userRole');
    sessionStorage.removeItem('userId');
  };

  // Check for existing session on load
  useEffect(() => {
    const checkSession = async () => {
      const storedRole = sessionStorage.getItem('userRole');
      const storedUserId = sessionStorage.getItem('userId');

      if (storedRole && storedUserId) {
        if (storedRole === 'worker') {
          const { data } = await supabase
            .from('workers')
            .select('*')
            .eq('id', storedUserId)
            .single();
          if (data) {
            setLoggedInWorker(data);
            setUserRole('worker');
            setIsAuthenticated(true);
          }
        } else if (storedRole === 'admin') {
          setUserRole('admin');
          setIsAuthenticated(true);
        }
      }
    };
    checkSession();
  }, []);

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Header
  userRole={userRole}
  loggedInWorker={loggedInWorker}
  notifications={notifications}
  onShowNotifications={() => setShowNotifications(true)}
  onLogout={handleLogout}
  onGoDashboard={() => setCurrentView('dashboard')}
/>
  <Navigation
  userRole={userRole}
  assignments={assignments}
  paymentTrackingEnabled={paymentTrackingEnabled}
  currentView={currentView}
  onNavigate={(id) => setCurrentView(id)}
/>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderView()}
      </div>
      <NotificationsModal
  open={showNotifications}
  notifications={notifications}
  onClose={() => setShowNotifications(false)}
  onClearAll={handleClearAllNotifications}
/>
     <AddWorkerModal
  open={showAddWorker}
  savingWorker={savingWorker}
  positions={positions}
  onClose={() => setShowAddWorker(false)}
  onSaveWorker={handleSaveWorker}
/>
      <BulkInviteModal
        open={showBulkInvite}
        workers={workers}
        positions={positions}
        onClose={() => setShowBulkInvite(false)}
        onSuccess={null}
      />
      <SetPinModal
        open={showSetPinModal}
        worker={selectedWorkerForPin}
        onClose={() => {
          setShowSetPinModal(false);
          setSelectedWorkerForPin(null);
        }}
        onSuccess={loadWorkers}
      />
      <EditWorkerModal
        open={showEditWorker}
        worker={selectedWorkerForEdit}
        positions={positions}
        onClose={() => {
          setShowEditWorker(false);
          setSelectedWorkerForEdit(null);
        }}
        onSuccess={loadWorkers}
      />
      <AddEventModal
        open={showAddEvent}
        positions={positions}
        onClose={() => setShowAddEvent(false)}
        onSuccess={loadEvents}
      />
      <EditEventModal
        open={showEditEvent}
        event={selectedEvent}
        positions={positions}
        onClose={() => {
          setShowEditEvent(false);
          setSelectedEvent(null);
        }}
        onSuccess={loadEvents}
      />
      <AssignWorkersModal
        open={showAssignModal}
        event={selectedEvent}
        workers={workers}
        events={events}
        assignments={assignments}
        positions={positions}
        eventPaymentSettings={eventPaymentSettings}
        onClose={() => {
          setShowAssignModal(false);
          setSelectedEvent(null);
        }}
        onAssign={(workerId, position, existingAssignment, defaultHours) => {
          setAssignmentPaymentData({
            workerId,
            position,
            existingAssignment,
            defaultHours
          });
          setShowPaymentModal(true);
        }}
        onUnassign={async (assignmentId) => {
          try {
            const { error } = await supabase
              .from('assignments')
              .delete()
              .eq('id', assignmentId);
            
            if (error) throw error;
            
            loadAssignments();
          } catch (error) {
            alert('Error removing assignment: ' + error.message);
          }
        }}
        onSavePaymentSettings={(eventId, settings) => {
          setEventPaymentSettings({
            ...eventPaymentSettings,
            [eventId]: settings
          });
        }}
      />
      <PaymentCalculatorModal
        open={showPaymentModal}
        assignmentData={assignmentPaymentData}
        selectedEvent={selectedEvent}
        workers={workers}
        eventPaymentSettings={eventPaymentSettings}
        paymentTrackingEnabled={paymentTrackingEnabled}
        payRates={payRates}
        calculatePay={calculatePay}
        getPayRateKey={getPayRateKey}
        onClose={() => {
          setShowPaymentModal(false);
          setAssignmentPaymentData(null);
        }}
        onSuccess={loadAssignments}
      />
    </div>
  );
}; // end GigStaffPro

export default GigStaffPro;