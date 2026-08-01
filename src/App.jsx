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
import ReportsView from './components/views/ReportsView';
import SettingsView from './components/views/SettingsView';
import EventsView from './components/views/EventsView';
import StaffView from './components/views/StaffView';
import PaymentsView from './components/views/PaymentsView';
import ScheduleView from './components/views/ScheduleView';
import WorkerPortalView from './components/views/WorkerPortalView';
import Header from './components/Header';
import Navigation from './components/Navigation';
import AddWorkerModal from './components/modals/AddWorkerModal';
import InviteWorkersModal from './components/modals/InviteWorkersModal';

const GigStaffPro = () => {
  const [userRole, setUserRole] = useState(null); // null = not logged in, 'admin' or 'worker'
  const [currentView, setCurrentView] = useState(() => sessionStorage.getItem('currentView') || 'dashboard');
  const [workers, setWorkers] = useState([]);
  const [events, setEvents] = useState([]);
  const [positions, setPositions] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [payRates, setPayRates] = useState({});
  const [travelTiers, setTravelTiers] = useState([]);
  const [bonuses, setBonuses] = useState({});
  const [locationPayRates, setLocationPayRates] = useState({}); // { location_id: { position_key: rate } }
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
  const [pendingReportsCount, setPendingReportsCount] = useState(0);
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
  const [workerTab, setWorkerTab] = useState('dashboard'); // 'dashboard' or 'profile'
  const [loggedInWorker, setLoggedInWorker] = useState(null); // Current logged in worker
  const [workerAuthMode, setWorkerAuthMode] = useState(null); // null | 'legacy' | 'migrated'
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showSetPinModal, setShowSetPinModal] = useState(false);
  const [selectedWorkerForPin, setSelectedWorkerForPin] = useState(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedEventForInvite, setSelectedEventForInvite] = useState(null);
  const [locations, setLocations] = useState([]);
  const [activeLocation, setActiveLocation] = useState(() => {
    return localStorage.getItem('gigstaffpro_active_location') || 'all';
  });

  // Load workers from Supabase
  useEffect(() => {
    if (!isAuthenticated) return;

    // A migrated worker must never receive the broad workers roster —
    // only admins (full CRUD) and legacy workers (temporary, unchanged
    // behavior) may load it. An unrecognized workerAuthMode fails closed
    // rather than being treated as legacy.
    const mayLoadWorkers =
      userRole === 'admin' ||
      (userRole === 'worker' && workerAuthMode === 'legacy');

    if (mayLoadWorkers) {
      loadWorkers();
    }
    loadEvents();
    loadSettings();
    loadAssignments();
    loadPaymentConfig();
    loadPaymentTrackingSetting();
    loadRankAccessDays();
    loadTimeFormat();
    loadPendingReportsCount();
    loadLocations();
  }, [isAuthenticated, userRole, workerAuthMode]);

  const loadLocations = async () => {
    const { data } = await supabase
      .from('locations')
      .select('id, name, city, state')
      .eq('is_active', true)
      .order('name');
    setLocations(data || []);
  };

  const handleSetActiveLocation = (locationId) => {
    setActiveLocation(locationId);
    localStorage.setItem('gigstaffpro_active_location', locationId);
  };

  // Browser back/forward button support
  const navigate = (view) => {
    window.history.pushState({ view }, '', window.location.pathname);
    sessionStorage.setItem('currentView', view);
    setCurrentView(view);
  };

  useEffect(() => {
    // Set initial history entry so back works from the first view
    window.history.replaceState({ view: 'dashboard' }, '', window.location.pathname);

    const handlePopState = (e) => {
      if (e.state?.view) {
        setCurrentView(e.state.view);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Generate notifications whenever assignments change
  useEffect(() => {
    generateNotifications();
  }, [assignments, events, workers, userRole, loggedInWorker]);

  // Auto-archive past events when viewing Events tab
  useEffect(() => {
    if (currentView === 'events' && events.length > 0) {
      autoArchivePastEvents();
    }
  }, [currentView, events.length]);
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

      // 1. Pending applications — only show if less than 3 days old
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const pendingApps = assignments.filter(a => {
        if (a.status !== 'pending') return false;
        const appliedAt = new Date(a.applied_at || a.created_at);
        return appliedAt >= threeDaysAgo;
      });
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

      // 2. New worker signups (last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      workers.forEach(worker => {
        if (!worker.created_at) return;
        if (new Date(worker.created_at) >= sevenDaysAgo) {
          newNotifications.push({
            id: `new-worker-${worker.id}`,
            type: 'new_worker',
            title: 'New Worker Signed Up',
            message: `${worker.name} created an account`,
            timestamp: worker.created_at,
            action: () => setCurrentView('staff')
          });
        }
      });

      // 3. Understaffed events — 7 days out and 24 hours out, with per-position detail
      events.forEach(event => {
        if (event.status === 'cancelled' || event.status === 'archived' || event.status === 'completed') return;
        if (!event.positions || event.positions.length === 0) return;
        const [ey, em, ed] = (event.date || '').split('-').map(Number);
        if (!ey) return;
        const eventDate = new Date(ey, em - 1, ed);
        let hoursUntil = (eventDate - now) / (1000 * 60 * 60);
        if (event.time) {
          const [th, tm] = event.time.split(':').map(Number);
          hoursUntil = (new Date(ey, em - 1, ed, th, tm || 0) - now) / (1000 * 60 * 60);
        }
        if (hoursUntil < 0) return;

        const is24h = hoursUntil <= 24;
        const is7day = hoursUntil <= 7 * 24;
        if (!is24h && !is7day) return;

        // Compute unfilled per position
        const unfilledPositions = event.positions.map(pos => {
          const posKey = pos.key || pos.name;
          const filled = assignments.filter(a =>
            a.event_id === event.id &&
            !['standby', 'rejected', 'cancelled', 'pending'].includes(a.status) &&
            (a.position === posKey || a.position === pos.key || a.position === pos.name)
          ).length;
          const open = (pos.count || 1) - filled;
          // getPositionLabel handles key lookup; pos.label is the stored label from event creation
          const label = getPositionLabel(posKey) !== posKey
            ? getPositionLabel(posKey)
            : (pos.label || posKey);
          return open > 0 ? `${label} ×${open}` : null;
        }).filter(Boolean);

        if (unfilledPositions.length === 0) return;

        const tier = is24h ? '24h' : '7day';
        const daysUntil = Math.ceil(hoursUntil / 24);
        const timeLabel = is24h
          ? (hoursUntil < 1 ? 'in under 1 hour' : `in ${Math.round(hoursUntil)}h`)
          : `in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`;

        newNotifications.push({
          id: `understaffed-${tier}-${event.id}`,
          type: 'warning',
          title: is24h ? 'Understaffed · Under 24h' : 'Understaffed · 7 Days',
          message: `${event.name} (${timeLabel}): ${unfilledPositions.join(', ')} open`,
          timestamp: new Date().toISOString(),
          action: () => {
            setSelectedEvent(event);
            setShowAssignModal(true);
          }
        });
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
            const eventDay = parseDateSafe(event.date).toISOString().split('T')[0];
            newNotifications.push({
              id: `reminder-${assignment.id}-${eventDay}`,
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
            // Use date-truncated ID so dismissal persists across reloads
            const approvalDay = updatedDate.toISOString().split('T')[0];
            newNotifications.push({
              id: `approved-${assignment.id}-${approvalDay}`,
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

const handleDismissNotification = (id) => {
  const existing = loadDismissedNotificationIds();
  saveDismissedNotificationIds(Array.from(new Set([...existing, id])));
  setNotifications(prev => prev.filter(n => n.id !== id));
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

  // Handler for assigning workers
  const handleAssignWorker = (workerId, position, existingAssignment, defaultHours, event) => {
    setAssignmentPaymentData({
      workerId,
      position,
      existingAssignment,
      defaultHours
    });
    // Set selectedEvent so PaymentCalculatorModal can access it
    if (event) {
      setSelectedEvent(event);
    }
    setShowPaymentModal(true);
  };

  // Handler for unassigning workers
  const handleUnassignWorker = async (assignmentId) => {
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
  };

  // Handler for saving event payment settings
  const handleSaveEventPaymentSettings = async (eventId, settings) => {
    // Update local state immediately
    setEventPaymentSettings(prev => ({ ...prev, [eventId]: settings }));

    // Persist to DB
    const { error: upsertError } = await supabase.from('event_payment_settings').upsert({
      event_id: eventId,
      hours: settings.hours || null,
      miles: settings.miles || null,
      is_lake_geneva: settings.isLakeGeneva || false,
      is_holiday: settings.isHoliday || false,
      updated_at: new Date().toISOString()
    }, { onConflict: 'event_id' });
    if (upsertError) console.error('Failed to persist payment settings:', upsertError);
  };

  const loadPendingReportsCount = async () => {
    try {
      const { count, error } = await supabase
        .from('post_event_reports')
        .select('*', { count: 'exact', head: true })
        .eq('reviewed_by_admin', false);
      if (!error) setPendingReportsCount(count || 0);
    } catch (error) {
      console.error('Error loading pending reports count:', error);
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

      // Load travel tiers
      const { data: tiersData, error: tiersError } = await supabase
        .from('travel_tiers')
        .select('*')
        .order('min_miles', { ascending: true });
      if (!tiersError && tiersData) setTravelTiers(tiersData);

      // Load locations
      const { data: locsData } = await supabase
        .from('locations')
        .select('*')
        .eq('is_active', true)
        .order('name');
      setLocations(locsData || []);

      // Load location pay rate overrides
      const { data: lprData } = await supabase.from('location_pay_rates').select('*');
      const lprMap = {};
      (lprData || []).forEach(r => {
        if (!lprMap[r.location_id]) lprMap[r.location_id] = {};
        const key = getPayRateKey(r.position);
        lprMap[r.location_id][key] = Number(r.hourly_rate) || 0;
        lprMap[r.location_id][r.position] = Number(r.hourly_rate) || 0;
      });
      setLocationPayRates(lprMap);

      // Load persisted event payment settings
      const { data: epsData, error: epsError } = await supabase
        .from('event_payment_settings')
        .select('*');

      if (epsError) { console.error('Failed to load payment settings:', epsError); }
      else if (epsData && epsData.length > 0) {
        // Load events to get location_id
        const { data: eventsForLoc } = await supabase.from('events').select('id, location_id');
        const eventLocMap = {};
        (eventsForLoc || []).forEach(e => { eventLocMap[e.id] = e.location_id; });

        const epsMap = {};
        epsData.forEach(row => {
          epsMap[row.event_id] = {
            hours: row.hours,
            miles: row.miles,
            isLakeGeneva: row.is_lake_geneva,
            isHoliday: row.is_holiday,
            locationId: eventLocMap[row.event_id] || null
          };
        });
        setEventPaymentSettings(epsMap);
      }
    } catch (error) {
      console.error('loadPaymentConfig error:', error);
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

  // Get effective hourly rate for a position, using location override if available
  const getEffectiveRate = (position, locationId) => {
    const rateKey = getPayRateKey(position);
    if (locationId && locationPayRates[locationId]) {
      const locRate = locationPayRates[locationId][rateKey] || locationPayRates[locationId][position];
      if (locRate) return locRate;
    }
    return payRates[rateKey] || payRates[position] || 0;
  };

  // Payment calculation — locationId drives hourly rate, miles drives travel pay
  const calculatePay = (position, hours, miles, isLakeGeneva, isHoliday, locationId = null) => {

    // Step 1: Calculate base pay using location rate if available
    const hourlyRate = getEffectiveRate(position, locationId);
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

  const reloadLoggedInWorker = async () => {
    if (!loggedInWorker?.id) return;

    if (userRole === 'worker' && workerAuthMode === 'migrated') {
      // Migrated worker — narrow RPC only, never the workers table.
      try {
        const { data, error } = await supabase
          .rpc('get_authenticated_worker_profile')
          .maybeSingle();

        if (error || !data) {
          // Do not fall back to a direct workers query, and do not expose
          // RPC error details — just fail silently, matching the existing
          // failure behavior of this function (no sign-out on reload
          // failure).
          console.error('Error reloading worker profile.');
          return;
        }

        setLoggedInWorker(data);
      } catch (rpcError) {
        console.error('Error reloading worker profile.');
      }
      return;
    }

    if (userRole === 'worker' && workerAuthMode === 'legacy') {
      // Legacy worker — existing direct query, unchanged.
      try {
        const { data, error } = await supabase
          .from('workers')
          .select('*')
          .eq('id', loggedInWorker.id)
          .single();

        if (error) throw error;

        if (data) {
          setLoggedInWorker(data);
        }
      } catch (error) {
        console.error('Error reloading worker:', error);
      }
      return;
    }

    if (userRole === 'worker') {
      // Worker role with a workerAuthMode that is neither 'legacy' nor
      // 'migrated' — fail closed. Never query workers, never assume legacy.
      console.error('Error reloading worker: unknown authentication mode.');
    }

    // Non-worker role (e.g. admin) — no worker lookup is introduced here;
    // loggedInWorker is only ever populated for role === 'worker', so this
    // path is unreachable in practice and intentionally does nothing.
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

      // Auto-create payment settings for events that don't have them yet
      autoCreatePaymentSettings(migratedEvents);
    } catch (error) {
    }
  };

  const autoCreatePaymentSettings = async (eventsToCheck) => {
    try {
      const { data: existing } = await supabase.from('event_payment_settings').select('event_id');
      const existingIds = new Set((existing || []).map(r => r.event_id));

      const needsSettings = (eventsToCheck || []).filter(e =>
        !existingIds.has(e.id) &&
        e.status !== 'archived' &&
        e.address
      );

      if (needsSettings.length === 0) return;

      const isLakeGenevaZip = (address) => address && address.includes('53147');

      const parseHours = (time, end_time) => {
        if (!time || !end_time) return 4;
        const [sh, sm] = time.split(':').map(Number);
        const [eh, em] = end_time.split(':').map(Number);
        let hours = (eh + em / 60) - (sh + sm / 60);
        if (hours < 0) hours += 24;
        return Math.round(hours * 10) / 10;
      };

      for (const event of needsSettings) {
        // Use the event's location address as travel origin; skip distance calc if unavailable
        const locationId = event.location_id || null;
        const eventLocation = locationId ? locations.find(l => l.id === locationId) : null;
        const travelOrigin = eventLocation?.address || null;

        let miles = 0;
        if (travelOrigin && event.address) {
          try {
            const res = await fetch(`/api/get-distance?origin=${encodeURIComponent(travelOrigin)}&destination=${encodeURIComponent(event.address)}`);
            const data = await res.json();
            if (data.miles != null) miles = data.miles;
          } catch (_) {}
        }

        const hours = parseHours(event.time, event.end_time);
        const isLakeGeneva = isLakeGenevaZip(event.address);

        const { error } = await supabase.from('event_payment_settings').upsert({
          event_id: event.id,
          hours,
          miles,
          is_lake_geneva: isLakeGeneva,
          is_holiday: false,
          updated_at: new Date().toISOString()
        }, { onConflict: 'event_id' });

        if (!error) {
          setEventPaymentSettings(prev => ({
            ...prev,
            [event.id]: { hours, miles, isLakeGeneva, isHoliday: false, locationId }
          }));
        }
      }
    } catch (err) {
      console.error('autoCreatePaymentSettings error:', err);
    }
  };

  const autoArchivePastEvents = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today
      
      // Find events that are in the past and not already archived
      const pastEvents = events.filter(event => {
        if (event.status === 'archived') return false;
        const eventDate = new Date(event.date);
        eventDate.setHours(0, 0, 0, 0);
        return eventDate < today;
      });
      
      if (pastEvents.length === 0) return;
      
      // Archive each past event
      for (const event of pastEvents) {
        await supabase
          .from('events')
          .update({ status: 'archived' })
          .eq('id', event.id);
      }
      
      // Reload events to show updated status
      await loadEvents();
      
      console.log(`Auto-archived ${pastEvents.length} past event(s)`);
    } catch (error) {
      console.error('Error auto-archiving events:', error);
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

  const renderView = () => {
    // Worker mode - show worker portal instead of admin views
    if (userRole === 'worker') {
      return (
        <WorkerPortalView
          loggedInWorker={loggedInWorker}
          workers={workers}
          assignments={assignments}
          events={events}
          positions={positions}
          timeFormat={timeFormat}
          paymentTrackingEnabled={paymentTrackingEnabled}
          rankAccessDays={rankAccessDays}
          eventPaymentSettings={eventPaymentSettings}
          payRates={payRates}
          travelTiers={travelTiers}
          bonuses={bonuses}
          locationPayRates={locationPayRates}
          locations={locations}
          getEffectiveRate={getEffectiveRate}
          onReloadAssignments={loadAssignments}
          onReloadWorker={reloadLoggedInWorker}
          currentTab={workerTab}
          workerAuthMode={workerAuthMode}
        />
      );
    }
    
    // Admin views
    if (currentView === 'dashboard') {
      return (
        <DashboardView
          events={events}
          workers={workers}
          assignments={assignments}
          timeFormat={timeFormat}
          onNavigate={navigate}
          onShowAddEvent={() => setShowAddEvent(true)}
          onShowAddWorker={() => setShowAddWorker(true)}
          activeLocation={activeLocation}
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
          assignments={assignments}
          activeLocation={activeLocation}
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
          activeLocation={activeLocation}
          onOpenAssignModal={(event) => {
            setSelectedEvent(event);
            setShowAssignModal(true);
          }}
          onOpenInviteModal={(event) => {
            setSelectedEventForInvite(event);
            setShowInviteModal(true);
          }}
          onOpenEditEvent={(event) => {
            setSelectedEvent(event);
            setShowEditEvent(true);
          }}
          onDeleteEvent={deleteEvent}
        />
      );
    }
    if (currentView === 'schedule') {
      return (
        <ScheduleView
          events={events}
          assignments={assignments}
          workers={workers}
          timeFormat={timeFormat}
          positions={positions}
          eventPaymentSettings={eventPaymentSettings}
          onAssign={handleAssignWorker}
          onUnassign={handleUnassignWorker}
          onSavePaymentSettings={handleSaveEventPaymentSettings}
          onReloadAssignments={loadAssignments}
        />
      );
    }
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
    if (currentView === 'reports') {
      return (
        <ReportsView
          events={events}
          assignments={assignments}
          workers={workers}
          timeFormat={timeFormat}
        />
      );
    }
    if (currentView === 'payments') {
      return (
        <PaymentsView
          assignments={assignments}
          workers={workers}
          events={events}
          timeFormat={timeFormat}
          paymentTrackingEnabled={paymentTrackingEnabled}
          onReloadAssignments={loadAssignments}
        />
      );
    }
    if (currentView === 'settings') {
      return (
        <SettingsView
          positions={positions}
          onUpdatePositions={setPositions}
          onPayRatesChanged={loadPaymentConfig}
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

  const handleLogin = (role, user, authMode = null) => {
    setUserRole(role);
    setIsAuthenticated(true);
    if (role === 'worker') {
      setLoggedInWorker(user);
      setWorkerAuthMode(authMode || 'legacy');
    }
    // Store in sessionStorage to persist across page refreshes
    sessionStorage.setItem('userRole', role);
    sessionStorage.setItem('userId', user.id);
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (signOutError) {
      // Local logout must still complete even if the remote sign-out call
      // fails — do not surface a technical error to the user.
    } finally {
      setUserRole(null);
      setIsAuthenticated(false);
      setLoggedInWorker(null);
      setWorkerAuthMode(null);
      setWorkers([]);
      setEvents([]);
      setAssignments([]);
      setPayRates({});
      setBonuses({});
      setTravelTiers([]);
      setLocationPayRates({});
      setEventPaymentSettings({});
      setPositions([]);
      setLocations([]);
      setPendingReportsCount(0);
      sessionStorage.removeItem('userRole');
      sessionStorage.removeItem('userId');
      sessionStorage.removeItem('currentView');
    }
  };

  // Check for existing session on load
  useEffect(() => {
    const checkSession = async () => {
      let session;
      try {
        const result = await supabase.auth.getSession();
        session = result.data.session;
      } catch (getSessionError) {
        // Real Supabase session state is unknown — fail closed. Do not
        // attempt legacy restore.
        sessionStorage.removeItem('userRole');
        sessionStorage.removeItem('userId');
        sessionStorage.removeItem('currentView');
        return;
      }

      if (session?.user) {
        // Try admin first — exactly as before.
        try {
          const { data: adminProfile, error: profileError } = await supabase
            .rpc('get_authenticated_admin_profile')
            .single();

          if (!profileError && adminProfile) {
            setUserRole('admin');
            setIsAuthenticated(true);
            return;
          }
        } catch (profileCatchError) {
          // Profile resolution threw (e.g. network failure) — not an
          // admin session. Fall through to the worker check below rather
          // than treating this as terminal.
        }

        // No admin profile found — not a terminal error. The session may
        // still belong to a migrated worker; check before giving up.
        try {
          const { data: workerProfile, error: workerProfileError } = await supabase
            .rpc('get_authenticated_worker_profile')
            .maybeSingle();

          if (!workerProfileError && workerProfile) {
            setUserRole('worker');
            setLoggedInWorker(workerProfile);
            setWorkerAuthMode('migrated');
            setIsAuthenticated(true);
            sessionStorage.setItem('userRole', 'worker');
            sessionStorage.setItem('userId', workerProfile.id);
            return;
          }
        } catch (workerProfileCatchError) {
          // Worker profile resolution threw — falls through to the
          // terminal sign-out below, same as an admin resolution failure.
        }

        // Supabase session exists but maps to neither an authorized admin
        // nor a migrated worker — terminal state. Never falls through to
        // legacy restore.
        try {
          await supabase.auth.signOut();
        } catch (signOutError) {
          // Ignore — state is cleared unconditionally below regardless.
        } finally {
          setUserRole(null);
          setIsAuthenticated(false);
          setLoggedInWorker(null);
          setWorkerAuthMode(null);
          sessionStorage.removeItem('userRole');
          sessionStorage.removeItem('userId');
          sessionStorage.removeItem('currentView');
        }
        return;
      }

      // No Supabase session — legacy sessionStorage restore may run
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
            setWorkerAuthMode('legacy');
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
  onGoDashboard={() => navigate('dashboard')}
  currentTab={workerTab}
  onTabChange={setWorkerTab}
  locations={locations}
  activeLocation={activeLocation}
  onSetActiveLocation={handleSetActiveLocation}
/>
  <Navigation
  userRole={userRole}
  assignments={assignments}
  paymentTrackingEnabled={paymentTrackingEnabled}
  currentView={currentView}
  onNavigate={(id) => navigate(id)}
  pendingReportsCount={pendingReportsCount}
/>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderView()}
      </div>
      <NotificationsModal
  open={showNotifications}
  notifications={notifications}
  onClose={() => setShowNotifications(false)}
  onClearAll={handleClearAllNotifications}
  onDismiss={handleDismissNotification}
/>
      <InviteWorkersModal
        open={showInviteModal}
        event={selectedEventForInvite}
        workers={workers}
        assignments={assignments}
        events={events}
        payRates={payRates}
        eventPaymentSettings={eventPaymentSettings}
        travelTiers={travelTiers}
        bonuses={bonuses}
        locations={locations}
        getEffectiveRate={getEffectiveRate}
        onClose={() => { setShowInviteModal(false); setSelectedEventForInvite(null); }}
        onReloadAssignments={loadAssignments}
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
        locations={locations}
        onClose={() => {
          setShowEditWorker(false);
          setSelectedWorkerForEdit(null);
        }}
        onSuccess={loadWorkers}
      />
      <AddEventModal
        open={showAddEvent}
        positions={positions}
        workers={workers}
        onClose={() => setShowAddEvent(false)}
        onSuccess={loadEvents}
      />
      <EditEventModal
        open={showEditEvent}
        event={selectedEvent}
        positions={positions}
        workers={workers}
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
        onAssign={(workerId, position, existingAssignment, defaultHours, event) => {
          setAssignmentPaymentData({
            workerId,
            position,
            existingAssignment,
            defaultHours
          });
          // Set selectedEvent so PaymentCalculatorModal can access it
          if (event) {
            setSelectedEvent(event);
          }
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
        onReloadAssignments={loadAssignments}
        onSavePaymentSettings={handleSaveEventPaymentSettings}
      />
      <PaymentCalculatorModal
        open={showPaymentModal}
        assignmentData={assignmentPaymentData}
        selectedEvent={selectedEvent}
        workers={workers}
        eventPaymentSettings={eventPaymentSettings}
        paymentTrackingEnabled={paymentTrackingEnabled}
        payRates={payRates}
        locations={locations}
        locationPayRates={locationPayRates}
        getEffectiveRate={getEffectiveRate}
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