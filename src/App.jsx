import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Calendar, Users, Clock, MapPin, DollarSign, Mail, Phone, CheckCircle, XCircle, Menu, Plus, Search, Filter, Star, Bell, Settings, LogOut, ChevronDown, TrendingUp, Send, Trash2, Edit, Download, BarChart3, AlertCircle, X, MessageSquare, Award, Target, FileText, History, Copy, Home, Briefcase, User } from 'lucide-react';

const GigStaffPro = () => {
  const [userRole, setUserRole] = useState('admin');
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
  const [rankAccessDays, setRankAccessDays] = useState({
    1: 0, 2: 7, 3: 10, 4: 12, 5: 14
  });

  // Load workers from Supabase
  useEffect(() => {
    loadWorkers();
    loadEvents();
    loadSettings();
    loadAssignments();
    loadPaymentConfig();
    loadPaymentTrackingSetting();
    loadRankAccessDays();
  }, []);

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
      console.error('Error loading payment tracking setting:', error);
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
      console.error('Error loading rank access days:', error);
    }
  };

  const loadPaymentConfig = async () => {
    try {
      // Load pay rates
      const { data: ratesData, error: ratesError } = await supabase
        .from('pay_rates')
        .select('*');
      
      if (!ratesError && ratesData) {
        const ratesMap = {};
        ratesData.forEach(rate => {
          ratesMap[rate.position] = rate.hourly_rate;
        });
        setPayRates(ratesMap);
      }

      // Load travel tiers
      const { data: tiersData, error: tiersError } = await supabase
        .from('travel_tiers')
        .select('*')
        .order('min_miles', { ascending: true });
      
      if (!tiersError && tiersData) {
        setTravelTiers(tiersData);
      }

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
      console.error('Error loading payment config:', error);
    }
  };

  // Payment calculation function based on PRD
  const calculatePay = (position, hours, miles, isLakeGeneva, isHoliday) => {
    // Step 1: Calculate base pay
    const hourlyRate = payRates[position] || 0;
    const basePay = hours * hourlyRate;

    // Step 2: Calculate travel pay
    let travelPay = 0;
    for (const tier of travelTiers) {
      if (miles >= tier.min_miles && miles <= tier.max_miles) {
        travelPay = tier.pay_amount;
        break;
      }
    }

    // Step 3: Add Lake Geneva bonus
    const lakeGenevaBonus = isLakeGeneva ? (bonuses['Lake Geneva'] || 15) : 0;

    // Step 4: Calculate subtotal
    const subtotal = basePay + travelPay + lakeGenevaBonus;

    // Step 5: Apply holiday multiplier
    const holidayMultiplier = isHoliday ? (bonuses['Holiday Multiplier'] || 1.5) : 1.0;
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
      console.error('Error loading assignments:', error);
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
        // If settings don't exist, use defaults
        console.log('No settings found, using defaults');
        const defaultPositions = ['Dealer', 'Poker Dealer', 'Blackjack Dealer', 'Roulette Dealer', 'Craps Dealer', 'Host', 'Bartender'].sort();
        setPositions(defaultPositions);
      } else {
        const sortedPositions = (data.setting_value || []).sort();
        setPositions(sortedPositions);
      }

      // Load warehouse address
      const { data: warehouseData, error: warehouseError } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'warehouse_address')
        .single();
      
      if (!warehouseError && warehouseData) {
        // Warehouse address loaded, stored in settings
        console.log('Warehouse address loaded');
      }
    } catch (error) {
      console.error('Error loading settings:', error);
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
      
      setWorkers(data || []);
      setError(null);
    } catch (error) {
      console.error('Error loading workers:', error);
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
      
      setEvents(data || []);
    } catch (error) {
      console.error('Error loading events:', error);
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
      console.error('Error deleting worker:', error);
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
      console.error('Error deleting event:', error);
      alert('Error deleting event: ' + error.message);
    }
  };

  const Header = () => (
    <div className="bg-gradient-to-r from-red-900 to-black text-white shadow-lg">
      <div className="px-4 py-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2 cursor-pointer" onClick={() => setCurrentView('dashboard')}>
            <div className="bg-white text-red-900 rounded-lg p-1.5">
              <div className="flex space-x-0.5">
                <div className="w-2.5 h-2.5 bg-red-600 rounded-sm transform rotate-45"></div>
                <div className="w-2.5 h-2.5 bg-black rounded-sm transform rotate-45"></div>
              </div>
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold">GigStaffPro</h1>
              <p className="text-xs text-red-200 hidden sm:block">Casino Party Staffing</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2 sm:space-x-3">
            <button className="relative p-2 hover:bg-red-800 rounded-full">
              <Bell size={20} />
              <span className="absolute -top-1 -right-1 bg-red-500 text-xs rounded-full w-5 h-5 flex items-center justify-center">3</span>
            </button>
            <button 
              onClick={() => setUserRole(userRole === 'admin' ? 'worker' : 'admin')}
              className="text-xs bg-red-700 px-2 sm:px-3 py-1.5 sm:py-2 rounded hover:bg-red-600 font-medium whitespace-nowrap"
            >
              Mode: {userRole === 'admin' ? 'Admin' : 'Worker'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const Navigation = () => {
    if (userRole !== 'admin') return null;
    
    const navItems = [
      { id: 'dashboard', label: 'Dashboard', icon: Home },
      { id: 'staff', label: 'Staff', icon: Users },
      { id: 'events', label: 'Events', icon: Calendar },
      { id: 'schedule', label: 'Schedule', icon: Clock },
      ...(paymentTrackingEnabled ? [{ id: 'payments', label: 'Payments', icon: DollarSign }] : []),
      { id: 'settings', label: 'Settings', icon: Settings }
    ];
    
    return (
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8 overflow-x-auto">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setCurrentView(id)}
                className={`flex items-center space-x-2 py-4 px-2 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                  currentView === id
                    ? 'border-red-900 text-red-900'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const EditWorkerModal = () => {
    const [formData, setFormData] = useState({
      name: '',
      email: '',
      phone: '',
      skills: [],
      rank: 1,
      reliability: 5.0
    });

    useEffect(() => {
      if (selectedWorkerForEdit) {
        setFormData({
          name: selectedWorkerForEdit.name || '',
          email: selectedWorkerForEdit.email || '',
          phone: selectedWorkerForEdit.phone || '',
          skills: selectedWorkerForEdit.skills || [],
          rank: selectedWorkerForEdit.rank || 1,
          reliability: selectedWorkerForEdit.reliability || 5.0
        });
      }
    }, [selectedWorkerForEdit]);

    // Use positions from settings as available skills
    const skillOptions = positions;

    const handleSubmit = async (e) => {
      e.preventDefault();
      
      if (formData.skills.length === 0) {
        alert('Please select at least one skill');
        return;
      }
      
      try {
        const { error } = await supabase
          .from('workers')
          .update(formData)
          .eq('id', selectedWorkerForEdit.id);
        
        if (error) throw error;
        
        alert('Worker updated successfully!');
        setShowEditWorker(false);
        setSelectedWorkerForEdit(null);
        loadWorkers();
      } catch (error) {
        console.error('Error updating worker:', error);
        alert('Error updating worker: ' + error.message);
      }
    };

    const toggleSkill = (skill) => {
      setFormData(prev => ({
        ...prev,
        skills: prev.skills.includes(skill)
          ? prev.skills.filter(s => s !== skill)
          : [...prev.skills, skill]
      }));
    };

    if (!showEditWorker || !selectedWorkerForEdit) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-gray-900">Edit Worker</h3>
              <button 
                onClick={() => {
                  setShowEditWorker(false);
                  setSelectedWorkerForEdit(null);
                }} 
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="john@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="(555) 123-4567"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Skills *</label>
                <div className="flex flex-wrap gap-2">
                  {skillOptions.map(skill => (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkill(skill)}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        formData.skills.includes(skill)
                          ? 'bg-red-900 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {skill}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rank Level</label>
                <select
                  value={formData.rank}
                  onChange={(e) => setFormData({...formData, rank: parseInt(e.target.value)})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                >
                  {[1,2,3,4,5].map(level => (
                    <option key={level} value={level}>Level {level}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reliability Rating</label>
                <input
                  type="number"
                  min="0"
                  max="5"
                  step="0.1"
                  value={formData.reliability}
                  onChange={(e) => setFormData({...formData, reliability: parseFloat(e.target.value)})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-red-900 text-white px-6 py-3 rounded-lg hover:bg-red-800 font-medium"
                >
                  Update Worker
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditWorker(false);
                    setSelectedWorkerForEdit(null);
                  }}
                  className="flex-1 bg-gray-200 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-300 font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  };

  const AddEventModal = () => {
    const [formData, setFormData] = useState({
      name: '',
      client: '',
      client_contact: '',
      date: '',
      time: '',
      end_time: '',
      venue: '',
      room: '',
      address: '',
      positions: [],
      dress_code: '',
      parking: '',
      notes: '',
      status: 'confirmed'
    });

    const positionOptions = positions;

    const updatePositionCount = (position, count) => {
      setFormData(prev => {
        const existing = prev.positions.find(p => p.name === position);
        if (count === 0) {
          return {
            ...prev,
            positions: prev.positions.filter(p => p.name !== position)
          };
        }
        if (existing) {
          return {
            ...prev,
            positions: prev.positions.map(p => 
              p.name === position ? { name: position, count: parseInt(count) } : p
            )
          };
        }
        return {
          ...prev,
          positions: [...prev.positions, { name: position, count: parseInt(count) }]
        };
      });
    };

    const getPositionCount = (position) => {
      const found = formData.positions.find(p => p.name === position);
      return found ? found.count : 0;
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      
      if (formData.positions.length === 0) {
        alert('Please specify at least one staff position needed');
        return;
      }
      
      try {
        const { data, error } = await supabase
          .from('events')
          .insert([formData]);
        
        if (error) throw error;
        
        alert('Event created successfully!');
        setShowAddEvent(false);
        loadEvents();
        setFormData({
          name: '',
          client: '',
          client_contact: '',
          date: '',
          time: '',
          end_time: '',
          venue: '',
          room: '',
          address: '',
          positions: [],
          dress_code: '',
          parking: '',
          notes: '',
          status: 'confirmed'
        });
      } catch (error) {
        console.error('Error creating event:', error);
        alert('Error creating event: ' + error.message);
      }
    };

    if (!showAddEvent) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto">
        <div className="min-h-screen flex items-center justify-center p-4 py-8">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full">
            <div className="p-6 max-h-[85vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-gray-900">Create New Event</h3>
                <button onClick={() => setShowAddEvent(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Event Details */}
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-3">Event Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Event Name *</label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        placeholder="Annual Corporate Casino Night"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Event Date *</label>
                      <input
                        type="date"
                        required
                        value={formData.date}
                        onChange={(e) => setFormData({...formData, date: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Start Time *</label>
                        <input
                          type="time"
                          required
                          value={formData.time}
                          onChange={(e) => setFormData({...formData, time: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                        <input
                          type="time"
                          value={formData.end_time}
                          onChange={(e) => setFormData({...formData, end_time: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Client Information */}
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-3">Client Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Client Name *</label>
                      <input
                        type="text"
                        required
                        value={formData.client}
                        onChange={(e) => setFormData({...formData, client: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        placeholder="John Smith / ABC Company"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Client Contact</label>
                      <input
                        type="text"
                        value={formData.client_contact}
                        onChange={(e) => setFormData({...formData, client_contact: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        placeholder="john@company.com or (555) 123-4567"
                      />
                    </div>
                  </div>
                </div>

                {/* Location */}
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-3">Location</h4>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Venue Name *</label>
                        <input
                          type="text"
                          required
                          value={formData.venue}
                          onChange={(e) => setFormData({...formData, venue: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                          placeholder="Grand Hotel"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Room/Area</label>
                        <input
                          type="text"
                          value={formData.room}
                          onChange={(e) => setFormData({...formData, room: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                          placeholder="Ballroom A"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Full Address</label>
                      <input
                        type="text"
                        value={formData.address}
                        onChange={(e) => setFormData({...formData, address: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        placeholder="123 Main St, City, State 12345"
                      />
                    </div>
                  </div>
                </div>

                {/* Staffing Requirements */}
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-3">Staffing Requirements</h4>
                  <div className="space-y-3">
                    <p className="text-sm text-gray-600">Specify how many staff needed for each position:</p>
                    {positionOptions.map(position => (
                      <div key={position} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <label className="text-sm font-medium text-gray-700">{position}</label>
                        <input
                          type="number"
                          min="0"
                          value={getPositionCount(position)}
                          onChange={(e) => updatePositionCount(position, e.target.value)}
                          className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                          placeholder="0"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Additional Details */}
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-3">Additional Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Dress Code</label>
                      <input
                        type="text"
                        value={formData.dress_code}
                        onChange={(e) => setFormData({...formData, dress_code: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        placeholder="Black vest, bow tie, white shirt"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Parking Info</label>
                      <input
                        type="text"
                        value={formData.parking}
                        onChange={(e) => setFormData({...formData, parking: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        placeholder="Free parking in rear lot"
                      />
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    rows="3"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    placeholder="Any additional information about the event..."
                  />
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 bg-red-900 text-white px-6 py-3 rounded-lg hover:bg-red-800 font-medium"
                  >
                    Create Event
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddEvent(false)}
                    className="flex-1 bg-gray-200 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-300 font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const EditEventModal = () => {
    const [formData, setFormData] = useState({
      name: '',
      client: '',
      client_contact: '',
      date: '',
      time: '',
      end_time: '',
      venue: '',
      room: '',
      address: '',
      positions: [],
      dress_code: '',
      parking: '',
      notes: '',
      status: 'confirmed'
    });

    useEffect(() => {
      if (selectedEvent) {
        setFormData({
          name: selectedEvent.name || '',
          client: selectedEvent.client || '',
          client_contact: selectedEvent.client_contact || '',
          date: selectedEvent.date || '',
          time: selectedEvent.time || '',
          end_time: selectedEvent.end_time || '',
          venue: selectedEvent.venue || '',
          room: selectedEvent.room || '',
          address: selectedEvent.address || '',
          positions: selectedEvent.positions || [],
          dress_code: selectedEvent.dress_code || '',
          parking: selectedEvent.parking || '',
          notes: selectedEvent.notes || '',
          status: selectedEvent.status || 'confirmed'
        });
      }
    }, [selectedEvent]);

    const positionOptions = positions;

    const updatePositionCount = (position, count) => {
      setFormData(prev => {
        const existing = prev.positions.find(p => p.name === position);
        if (count === 0) {
          return {
            ...prev,
            positions: prev.positions.filter(p => p.name !== position)
          };
        }
        if (existing) {
          return {
            ...prev,
            positions: prev.positions.map(p => 
              p.name === position ? { name: position, count: parseInt(count) } : p
            )
          };
        }
        return {
          ...prev,
          positions: [...prev.positions, { name: position, count: parseInt(count) }]
        };
      });
    };

    const getPositionCount = (position) => {
      const found = formData.positions.find(p => p.name === position);
      return found ? found.count : 0;
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      
      if (formData.positions.length === 0) {
        alert('Please specify at least one staff position needed');
        return;
      }
      
      try {
        const { error } = await supabase
          .from('events')
          .update(formData)
          .eq('id', selectedEvent.id);
        
        if (error) throw error;
        
        alert('Event updated successfully!');
        setShowEditEvent(false);
        setSelectedEvent(null);
        loadEvents();
      } catch (error) {
        console.error('Error updating event:', error);
        alert('Error updating event: ' + error.message);
      }
    };

    if (!showEditEvent || !selectedEvent) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto">
        <div className="min-h-screen flex items-center justify-center p-4 py-8">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full">
            <div className="p-6 max-h-[85vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-gray-900">Edit Event</h3>
                <button 
                  onClick={() => {
                    setShowEditEvent(false);
                    setSelectedEvent(null);
                  }} 
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Event Details */}
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-3">Event Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Event Name *</label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Event Date *</label>
                      <input
                        type="date"
                        required
                        value={formData.date}
                        onChange={(e) => setFormData({...formData, date: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Start Time *</label>
                        <input
                          type="time"
                          required
                          value={formData.time}
                          onChange={(e) => setFormData({...formData, time: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                        <input
                          type="time"
                          value={formData.end_time}
                          onChange={(e) => setFormData({...formData, end_time: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Client Information */}
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-3">Client Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Client Name *</label>
                      <input
                        type="text"
                        required
                        value={formData.client}
                        onChange={(e) => setFormData({...formData, client: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Client Contact</label>
                      <input
                        type="text"
                        value={formData.client_contact}
                        onChange={(e) => setFormData({...formData, client_contact: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                {/* Location */}
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-3">Location</h4>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Venue Name *</label>
                        <input
                          type="text"
                          required
                          value={formData.venue}
                          onChange={(e) => setFormData({...formData, venue: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Room/Area</label>
                        <input
                          type="text"
                          value={formData.room}
                          onChange={(e) => setFormData({...formData, room: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Full Address</label>
                      <input
                        type="text"
                        value={formData.address}
                        onChange={(e) => setFormData({...formData, address: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                {/* Staffing Requirements */}
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-3">Staffing Requirements</h4>
                  <div className="space-y-3">
                    <p className="text-sm text-gray-600">Specify how many staff needed for each position:</p>
                    {positionOptions.map(position => (
                      <div key={position} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <label className="text-sm font-medium text-gray-700">{position}</label>
                        <input
                          type="number"
                          min="0"
                          value={getPositionCount(position)}
                          onChange={(e) => updatePositionCount(position, e.target.value)}
                          className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                          placeholder="0"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Additional Details */}
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-3">Additional Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Dress Code</label>
                      <input
                        type="text"
                        value={formData.dress_code}
                        onChange={(e) => setFormData({...formData, dress_code: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Parking Info</label>
                      <input
                        type="text"
                        value={formData.parking}
                        onChange={(e) => setFormData({...formData, parking: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    rows="3"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 bg-red-900 text-white px-6 py-3 rounded-lg hover:bg-red-800 font-medium"
                  >
                    Update Event
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditEvent(false);
                      setSelectedEvent(null);
                    }}
                    className="flex-1 bg-gray-200 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-300 font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const AssignWorkersModal = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [showOnlyAvailable, setShowOnlyAvailable] = useState(false);
    const [showEventPaymentSettings, setShowEventPaymentSettings] = useState(false);
    const [eventHours, setEventHours] = useState(0);
    const [eventMiles, setEventMiles] = useState(0);
    const [eventIsLakeGeneva, setEventIsLakeGeneva] = useState(false);
    const [eventIsHoliday, setEventIsHoliday] = useState(false);
    
    if (!showAssignModal || !selectedEvent) return null;

    // Initialize event payment settings from event or calculate defaults
    useEffect(() => {
      if (selectedEvent && !eventPaymentSettings[selectedEvent.id]) {
        // Calculate default hours
        let defaultHours = 4;
        if (selectedEvent.time && selectedEvent.end_time) {
          const parseTime = (timeStr) => {
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours + minutes / 60;
          };
          const startHours = parseTime(selectedEvent.time);
          const endHours = parseTime(selectedEvent.end_time);
          defaultHours = endHours - startHours;
          if (defaultHours < 0) defaultHours += 24;
        }
        
        setEventHours(defaultHours);
        setEventMiles(0);
        setEventIsLakeGeneva(false);
        setEventIsHoliday(false);
      } else if (eventPaymentSettings[selectedEvent.id]) {
        // Load saved settings
        const settings = eventPaymentSettings[selectedEvent.id];
        setEventHours(settings.hours);
        setEventMiles(settings.miles);
        setEventIsLakeGeneva(settings.isLakeGeneva);
        setEventIsHoliday(settings.isHoliday);
      }
    }, [selectedEvent]);

    const saveEventPaymentSettings = () => {
      if (eventHours <= 0) {
        alert('Hours must be greater than 0');
        return;
      }
      
      setEventPaymentSettings({
        ...eventPaymentSettings,
        [selectedEvent.id]: {
          hours: eventHours,
          miles: eventMiles,
          isLakeGeneva: eventIsLakeGeneva,
          isHoliday: eventIsHoliday
        }
      });
      
      setShowEventPaymentSettings(false);
      alert('Payment settings saved! All new assignments will use these settings.');
    };

    const eventAssignments = assignments.filter(a => a.event_id === selectedEvent.id);
    
    const getPositionAssignments = (position) => {
      return eventAssignments.filter(a => a.position === position);
    };

    const getPositionCount = (position) => {
      const pos = selectedEvent.positions?.find(p => p.name === position);
      return pos ? pos.count : 0;
    };

    const isPositionFilled = (position) => {
      const needed = getPositionCount(position);
      const assigned = getPositionAssignments(position).length;
      return assigned >= needed;
    };

    const assignWorker = async (workerId, position, existingAssignment = null) => {
      try {
        const worker = workers.find(w => w.id === workerId);
        
        // Check for time conflicts with other events
        const workerOtherAssignments = assignments.filter(a => 
          a.worker_id === workerId && 
          a.event_id !== selectedEvent.id
        );
        
        if (workerOtherAssignments.length > 0) {
          const conflicts = workerOtherAssignments.filter(assignment => {
            const otherEvent = events.find(e => e.id === assignment.event_id);
            if (!otherEvent) return false;
            if (otherEvent.date !== selectedEvent.date) return false;
            
            const parseTime = (timeStr) => {
              if (!timeStr) return null;
              const [hours, minutes] = timeStr.split(':').map(Number);
              return hours * 60 + minutes;
            };
            
            const thisStart = parseTime(selectedEvent.time);
            const thisEnd = parseTime(selectedEvent.end_time);
            const otherStart = parseTime(otherEvent.time);
            const otherEnd = parseTime(otherEvent.end_time);
            
            if (!thisEnd || !otherEnd) return false;
            
            const hasOverlap = (thisStart < otherEnd) && (thisEnd > otherStart);
            return hasOverlap;
          });
          
          if (conflicts.length > 0) {
            const conflictEvent = events.find(e => e.id === conflicts[0].event_id);
            const conflictPosition = conflicts[0].position;
            
            alert(
              `⚠️ Time Conflict!\n\n` +
              `${worker.name} is already assigned to:\n` +
              `"${conflictEvent.name}"\n` +
              `${conflictEvent.time}${conflictEvent.end_time ? ` - ${conflictEvent.end_time}` : ''}\n` +
              `Position: ${conflictPosition}\n\n` +
              `This overlaps with "${selectedEvent.name}" (${selectedEvent.time}${selectedEvent.end_time ? ` - ${selectedEvent.end_time}` : ''})`
            );
            return;
          }
        }
        
        // If worker is already assigned to a different position, confirm reassignment
        if (existingAssignment) {
          if (!confirm(`${worker.name} is currently assigned to ${existingAssignment.position}. Move them to ${position} instead?`)) {
            return;
          }
          
          const { error: deleteError } = await supabase
            .from('assignments')
            .delete()
            .eq('id', existingAssignment.id);
          
          if (deleteError) throw deleteError;
        }

        // Check if position is full
        if (isPositionFilled(position)) {
          alert(`${position} is already fully staffed`);
          return;
        }

        // Calculate default hours from event times
        let defaultHours = 4;
        if (selectedEvent.time && selectedEvent.end_time) {
          const parseTime = (timeStr) => {
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours + minutes / 60;
          };
          const startHours = parseTime(selectedEvent.time);
          const endHours = parseTime(selectedEvent.end_time);
          defaultHours = endHours - startHours;
          if (defaultHours < 0) defaultHours += 24; // Handle overnight events
        }

        // Prompt for payment details
        setAssignmentPaymentData({
          workerId,
          position,
          existingAssignment,
          defaultHours
        });
        setShowPaymentModal(true);

      } catch (error) {
        console.error('Error in assignment process:', error);
        alert('Error in assignment process: ' + error.message);
      }
    };

    const unassignWorker = async (assignmentId) => {
      if (!confirm('Remove this worker assignment?')) return;
      
      try {
        const { error } = await supabase
          .from('assignments')
          .delete()
          .eq('id', assignmentId);
        
        if (error) throw error;
        
        loadAssignments();
      } catch (error) {
        console.error('Error removing assignment:', error);
        alert('Error removing assignment: ' + error.message);
      }
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto">
        <div className="min-h-screen flex items-center justify-center p-4 py-8">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full">
            <div className="p-6 max-h-[85vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">Assign Workers</h3>
                  <p className="text-sm text-gray-600 mt-1">{selectedEvent.name}</p>
                </div>
                <button onClick={() => setShowAssignModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={24} />
                </button>
              </div>

              {/* Event Payment Settings */}
              <div className="mb-6 p-4 bg-green-50 border-2 border-green-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-gray-900">Event Payment Settings</h4>
                  <button
                    onClick={() => setShowEventPaymentSettings(!showEventPaymentSettings)}
                    className="text-sm text-green-700 hover:text-green-900 font-medium"
                  >
                    {showEventPaymentSettings ? 'Hide' : eventPaymentSettings[selectedEvent.id] ? 'Edit Settings' : 'Set Payment Details'}
                  </button>
                </div>
                
                {eventPaymentSettings[selectedEvent.id] && !showEventPaymentSettings && (
                  <div className="text-sm text-gray-700">
                    <p>✓ Payment configured: {eventPaymentSettings[selectedEvent.id].hours} hrs, {eventPaymentSettings[selectedEvent.id].miles} miles
                      {eventPaymentSettings[selectedEvent.id].isLakeGeneva && ', Lake Geneva'}
                      {eventPaymentSettings[selectedEvent.id].isHoliday && ', Holiday'}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">New assignments will automatically use these settings</p>
                  </div>
                )}

                {!eventPaymentSettings[selectedEvent.id] && !showEventPaymentSettings && (
                  <p className="text-sm text-gray-600">
                    Set payment details once for this event - all assignments will use the same settings
                  </p>
                )}

                {showEventPaymentSettings && (
                  <div className="mt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Hours *</label>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={eventHours}
                          onChange={(e) => setEventHours(parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Miles *</label>
                        <input
                          type="number"
                          min="0"
                          value={eventMiles}
                          onChange={(e) => setEventMiles(parseInt(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={eventIsLakeGeneva}
                          onChange={(e) => setEventIsLakeGeneva(e.target.checked)}
                          className="rounded border-gray-300 text-green-700 focus:ring-green-500"
                        />
                        <span className="text-sm font-medium text-gray-700">Lake Geneva (+$15)</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={eventIsHoliday}
                          onChange={(e) => setEventIsHoliday(e.target.checked)}
                          className="rounded border-gray-300 text-green-700 focus:ring-green-500"
                        />
                        <span className="text-sm font-medium text-gray-700">Holiday (1.5×)</span>
                      </label>
                    </div>
                    <button
                      onClick={saveEventPaymentSettings}
                      className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium"
                    >
                      Save Payment Settings
                    </button>
                  </div>
                )}
              </div>

              {/* Search and Filter Controls */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg space-y-3">
                <div className="flex items-center space-x-3">
                  <Search size={20} className="text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search workers by name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X size={20} />
                    </button>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="showOnlyAvailable"
                    checked={showOnlyAvailable}
                    onChange={(e) => setShowOnlyAvailable(e.target.checked)}
                    className="rounded border-gray-300 text-red-900 focus:ring-red-500"
                  />
                  <label htmlFor="showOnlyAvailable" className="text-sm text-gray-700 cursor-pointer">
                    Show only unassigned workers
                  </label>
                </div>
              </div>

              <div className="space-y-6">
                {selectedEvent.positions?.map((pos, idx) => {
                  const posAssignments = getPositionAssignments(pos.name);
                  const filled = posAssignments.length;
                  const needed = pos.count;
                  const isFull = filled >= needed;

                  return (
                    <div key={idx} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <h4 className="text-lg font-semibold text-gray-900">{pos.name}</h4>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                            isFull ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {filled} / {needed} filled
                          </span>
                        </div>
                      </div>

                      {/* Assigned Workers */}
                      {posAssignments.length > 0 && (
                        <div className="mb-4">
                          <p className="text-sm font-medium text-gray-700 mb-2">Assigned:</p>
                          <div className="space-y-2">
                            {posAssignments.map(assignment => {
                              const worker = workers.find(w => w.id === assignment.worker_id);
                              if (!worker) return null;
                              
                              return (
                                <div key={assignment.id} className="flex items-center justify-between bg-green-50 p-3 rounded">
                                  <div className="flex items-center space-x-3">
                                    <CheckCircle size={20} className="text-green-600" />
                                    <div>
                                      <p className="font-medium text-gray-900">{worker.name}</p>
                                      <p className="text-xs text-gray-600">{worker.phone}</p>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => unassignWorker(assignment.id)}
                                    className="text-red-600 hover:text-red-800 p-1 hover:bg-red-50 rounded"
                                    title="Remove assignment"
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Available Workers */}
                      {!isFull && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-medium text-gray-700">Available Workers:</p>
                            <span className="text-xs text-gray-500">
                              {workers.filter(worker => {
                                if (searchTerm && !worker.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
                                if (showOnlyAvailable && eventAssignments.some(a => a.worker_id === worker.id)) return false;
                                const workerSkills = Array.isArray(worker.skills) ? worker.skills : [];
                                const positionName = pos.name.toLowerCase();
                                if (positionName.includes('poker')) {
                                  return workerSkills.some(skill => skill.toLowerCase().includes('poker'));
                                } else if (positionName.includes('blackjack')) {
                                  return workerSkills.some(skill => skill.toLowerCase().includes('blackjack'));
                                } else if (positionName.includes('roulette')) {
                                  return workerSkills.some(skill => skill.toLowerCase().includes('roulette'));
                                } else if (positionName.includes('craps')) {
                                  return workerSkills.some(skill => skill.toLowerCase().includes('craps'));
                                } else if (positionName.includes('baccarat')) {
                                  return workerSkills.some(skill => skill.toLowerCase().includes('baccarat'));
                                } else if (positionName.includes('host')) {
                                  return workerSkills.some(skill => skill.toLowerCase().includes('host'));
                                } else if (positionName.includes('bartender')) {
                                  return workerSkills.some(skill => skill.toLowerCase().includes('bartender') || skill.toLowerCase().includes('mixology'));
                                } else if (positionName === 'dealer') {
                                  return workerSkills.some(skill => 
                                    skill.toLowerCase().includes('dealer') || 
                                    skill.toLowerCase().includes('poker') ||
                                    skill.toLowerCase().includes('blackjack') ||
                                    skill.toLowerCase().includes('roulette') ||
                                    skill.toLowerCase().includes('craps') ||
                                    skill.toLowerCase().includes('baccarat')
                                  );
                                }
                                return true;
                              }).length} qualified workers
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                            {workers
                              .filter(worker => {
                                // Apply search filter
                                if (searchTerm && !worker.name.toLowerCase().includes(searchTerm.toLowerCase())) {
                                  return false;
                                }
                                
                                // Apply availability filter
                                if (showOnlyAvailable) {
                                  const isAssigned = eventAssignments.some(a => a.worker_id === worker.id);
                                  if (isAssigned) return false;
                                }
                                
                                // Check if worker has required skills for this position
                                const workerSkills = Array.isArray(worker.skills) ? worker.skills : [];
                                const positionName = pos.name.toLowerCase();
                                
                                // Match logic for different position types
                                if (positionName.includes('poker')) {
                                  return workerSkills.some(skill => skill.toLowerCase().includes('poker'));
                                } else if (positionName.includes('blackjack')) {
                                  return workerSkills.some(skill => skill.toLowerCase().includes('blackjack'));
                                } else if (positionName.includes('roulette')) {
                                  return workerSkills.some(skill => skill.toLowerCase().includes('roulette'));
                                } else if (positionName.includes('craps')) {
                                  return workerSkills.some(skill => skill.toLowerCase().includes('craps'));
                                } else if (positionName.includes('baccarat')) {
                                  return workerSkills.some(skill => skill.toLowerCase().includes('baccarat'));
                                } else if (positionName.includes('host')) {
                                  return workerSkills.some(skill => skill.toLowerCase().includes('host'));
                                } else if (positionName.includes('bartender')) {
                                  return workerSkills.some(skill => skill.toLowerCase().includes('bartender') || skill.toLowerCase().includes('mixology'));
                                } else if (positionName === 'dealer') {
                                  // Generic "Dealer" - anyone with any dealer skill
                                  return workerSkills.some(skill => 
                                    skill.toLowerCase().includes('dealer') || 
                                    skill.toLowerCase().includes('poker') ||
                                    skill.toLowerCase().includes('blackjack') ||
                                    skill.toLowerCase().includes('roulette') ||
                                    skill.toLowerCase().includes('craps') ||
                                    skill.toLowerCase().includes('baccarat')
                                  );
                                }
                                
                                // For any other custom positions, show all workers
                                return true;
                              })
                              .map(worker => {
                                // Check if worker is assigned to a different position in this event
                                const otherAssignment = eventAssignments.find(a => a.worker_id === worker.id && a.position !== pos.name);
                                const isAvailable = !otherAssignment;
                                
                                // Check for time conflicts with other events on the same day
                                const workerOtherAssignments = assignments.filter(a => 
                                  a.worker_id === worker.id && 
                                  a.event_id !== selectedEvent.id
                                );
                                
                                let hasTimeConflict = false;
                                let conflictEvent = null;
                                
                                if (workerOtherAssignments.length > 0) {
                                  const conflicts = workerOtherAssignments.filter(assignment => {
                                    const otherEvent = events.find(e => e.id === assignment.event_id);
                                    if (!otherEvent || otherEvent.date !== selectedEvent.date) return false;
                                    
                                    const parseTime = (timeStr) => {
                                      if (!timeStr) return null;
                                      const [hours, minutes] = timeStr.split(':').map(Number);
                                      return hours * 60 + minutes;
                                    };
                                    
                                    const thisStart = parseTime(selectedEvent.time);
                                    const thisEnd = parseTime(selectedEvent.end_time);
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
                                
                                return (
                                  <div key={worker.id} className={`flex items-center justify-between p-3 rounded ${
                                    hasTimeConflict
                                      ? 'bg-red-50 border-2 border-red-300'
                                      : isAvailable 
                                      ? 'bg-gray-50 hover:bg-gray-100' 
                                      : 'bg-orange-50 border border-orange-200'
                                  }`}>
                                    <div className="flex-1">
                                      <div className="flex items-center space-x-2">
                                        <p className={`font-medium ${
                                          hasTimeConflict 
                                            ? 'text-red-900' 
                                            : isAvailable 
                                            ? 'text-gray-900' 
                                            : 'text-orange-900'
                                        }`}>
                                          {worker.name}
                                        </p>
                                        {hasTimeConflict && (
                                          <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded font-semibold">
                                            TIME CONFLICT
                                          </span>
                                        )}
                                        {otherAssignment && !hasTimeConflict && (
                                          <span className="text-xs bg-orange-200 text-orange-800 px-2 py-0.5 rounded">
                                            Currently: {otherAssignment.position}
                                          </span>
                                        )}
                                      </div>
                                      {hasTimeConflict && conflictEvent && (
                                        <p className="text-xs text-red-700 mt-1">
                                          Conflicts with: {conflictEvent.name} ({conflictEvent.time}-{conflictEvent.end_time})
                                        </p>
                                      )}
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {Array.isArray(worker.skills) && worker.skills.slice(0, 3).map((skill, idx) => (
                                          <span key={idx} className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded">
                                            {skill}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => assignWorker(worker.id, pos.name, otherAssignment)}
                                      disabled={hasTimeConflict}
                                      className={`ml-3 px-3 py-1 rounded text-sm ${
                                        hasTimeConflict
                                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                          : isAvailable 
                                          ? 'bg-red-900 text-white hover:bg-red-800' 
                                          : 'bg-orange-600 text-white hover:bg-orange-700'
                                      }`}
                                    >
                                      {hasTimeConflict ? 'Blocked' : isAvailable ? 'Assign' : 'Reassign'}
                                    </button>
                                  </div>
                                );
                              })}
                            {workers.filter(worker => {
                              const workerSkills = Array.isArray(worker.skills) ? worker.skills : [];
                              const positionName = pos.name.toLowerCase();
                              
                              if (positionName.includes('poker')) {
                                return workerSkills.some(skill => skill.toLowerCase().includes('poker'));
                              } else if (positionName.includes('blackjack')) {
                                return workerSkills.some(skill => skill.toLowerCase().includes('blackjack'));
                              } else if (positionName.includes('roulette')) {
                                return workerSkills.some(skill => skill.toLowerCase().includes('roulette'));
                              } else if (positionName.includes('craps')) {
                                return workerSkills.some(skill => skill.toLowerCase().includes('craps'));
                              } else if (positionName.includes('baccarat')) {
                                return workerSkills.some(skill => skill.toLowerCase().includes('baccarat'));
                              } else if (positionName.includes('host')) {
                                return workerSkills.some(skill => skill.toLowerCase().includes('host'));
                              } else if (positionName.includes('bartender')) {
                                return workerSkills.some(skill => skill.toLowerCase().includes('bartender') || skill.toLowerCase().includes('mixology'));
                              } else if (positionName === 'dealer') {
                                return workerSkills.some(skill => 
                                  skill.toLowerCase().includes('dealer') || 
                                  skill.toLowerCase().includes('poker') ||
                                  skill.toLowerCase().includes('blackjack') ||
                                  skill.toLowerCase().includes('roulette') ||
                                  skill.toLowerCase().includes('craps') ||
                                  skill.toLowerCase().includes('baccarat')
                                );
                              }
                              return true;
                            }).length === 0 && (
                              <p className="text-sm text-gray-500 col-span-2 text-center py-4">
                                No qualified workers available for this position
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowAssignModal(false)}
                  className="bg-gray-200 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-300 font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const AddWorkerModal = () => {
    const [formData, setFormData] = useState({
      name: '',
      email: '',
      phone: '',
      skills: [],
      rank: 1,
      reliability: 5.0,
      total_gigs: 0
    });

    // Use positions from settings as available skills
    const skillOptions = positions;

    const handleSubmit = async (e) => {
      e.preventDefault();
      
      if (formData.skills.length === 0) {
        alert('Please select at least one skill');
        return;
      }
      
      setSavingWorker(true);
      try {
        const { data, error } = await supabase
          .from('workers')
          .insert([formData]);
        
        if (error) throw error;
        
        alert('Worker added successfully!');
        setShowAddWorker(false);
        loadWorkers();
        setFormData({ name: '', email: '', phone: '', skills: [], rank: 1, reliability: 5.0, total_gigs: 0 });
      } catch (error) {
        console.error('Error adding worker:', error);
        alert('Error adding worker: ' + error.message);
      } finally {
        setSavingWorker(false);
      }
    };

    const toggleSkill = (skill) => {
      setFormData(prev => ({
        ...prev,
        skills: prev.skills.includes(skill)
          ? prev.skills.filter(s => s !== skill)
          : [...prev.skills, skill]
      }));
    };

    if (!showAddWorker) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-gray-900">Add New Worker</h3>
              <button onClick={() => setShowAddWorker(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="john@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="(555) 123-4567"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Skills *</label>
                <div className="flex flex-wrap gap-2">
                  {skillOptions.map(skill => (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkill(skill)}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        formData.skills.includes(skill)
                          ? 'bg-red-900 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {skill}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rank Level</label>
                <select
                  value={formData.rank}
                  onChange={(e) => setFormData({...formData, rank: parseInt(e.target.value)})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                >
                  {[1,2,3,4,5].map(level => (
                    <option key={level} value={level}>Level {level}</option>
                  ))}
                </select>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  disabled={savingWorker}
                  className="flex-1 bg-red-900 text-white px-6 py-3 rounded-lg hover:bg-red-800 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {savingWorker ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Add Worker</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddWorker(false)}
                  disabled={savingWorker}
                  className="flex-1 bg-gray-200 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-300 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  };

  const PaymentCalculatorModal = () => {
    const [hours, setHours] = useState(0);
    const [miles, setMiles] = useState(0);
    const [isLakeGeneva, setIsLakeGeneva] = useState(false);
    const [isHoliday, setIsHoliday] = useState(false);
    const [calculation, setCalculation] = useState(null);

    // Don't show payment modal if payment tracking is disabled
    if (!paymentTrackingEnabled) {
      if (showPaymentModal && assignmentPaymentData) {
        // Just assign without payment calculation
        const assignWithoutPayment = async () => {
          try {
            const { error } = await supabase
              .from('assignments')
              .insert([{
                event_id: selectedEvent.id,
                worker_id: assignmentPaymentData.workerId,
                position: assignmentPaymentData.position,
                status: 'assigned'
              }]);
            
            if (error) throw error;
            
            const worker = workers.find(w => w.id === assignmentPaymentData.workerId);
            loadAssignments();
            setShowPaymentModal(false);
            setAssignmentPaymentData(null);
            alert(`${worker.name} assigned to ${assignmentPaymentData.position}`);
          } catch (error) {
            console.error('Error creating assignment:', error);
            alert('Error creating assignment: ' + error.message);
          }
        };
        assignWithoutPayment();
      }
      return null;
    }

    useEffect(() => {
      if (assignmentPaymentData) {
        // Check if event has payment settings configured
        if (eventPaymentSettings[selectedEvent.id]) {
          const settings = eventPaymentSettings[selectedEvent.id];
          setHours(settings.hours);
          setMiles(settings.miles);
          setIsLakeGeneva(settings.isLakeGeneva);
          setIsHoliday(settings.isHoliday);
        } else {
          setHours(assignmentPaymentData.defaultHours || 0);
          setMiles(0);
          setIsLakeGeneva(false);
          setIsHoliday(false);
        }
      }
    }, [assignmentPaymentData]);

    useEffect(() => {
      if (assignmentPaymentData && hours > 0) {
        const calc = calculatePay(
          assignmentPaymentData.position,
          hours,
          miles,
          isLakeGeneva,
          isHoliday
        );
        setCalculation(calc);
      }
    }, [hours, miles, isLakeGeneva, isHoliday, assignmentPaymentData]);

    const handleConfirm = async () => {
      if (!assignmentPaymentData || !calculation) return;
      
      if (hours <= 0) {
        alert('Hours must be greater than 0');
        return;
      }

      try {
        const { error } = await supabase
          .from('assignments')
          .insert([{
            event_id: selectedEvent.id,
            worker_id: assignmentPaymentData.workerId,
            position: assignmentPaymentData.position,
            status: 'assigned',
            hours: hours,
            miles: miles,
            is_lake_geneva: isLakeGeneva,
            is_holiday: isHoliday,
            base_pay: calculation.basePay,
            travel_pay: calculation.travelPay,
            lake_geneva_bonus: calculation.lakeGenevaBonus,
            subtotal: calculation.subtotal,
            holiday_multiplier: calculation.holidayMultiplier,
            total_pay: calculation.totalPay,
            payment_status: 'pending'
          }]);
        
        if (error) throw error;
        
        const worker = workers.find(w => w.id === assignmentPaymentData.workerId);
        
        loadAssignments();
        setShowPaymentModal(false);
        setAssignmentPaymentData(null);
        
        alert(`✓ ${worker.name} assigned to ${assignmentPaymentData.position}\n\nTotal Pay: $${calculation.totalPay.toFixed(2)}`);
      } catch (error) {
        console.error('Error creating assignment:', error);
        alert('Error creating assignment: ' + error.message);
      }
    };

    if (!showPaymentModal || !assignmentPaymentData) return null;

    const worker = workers.find(w => w.id === assignmentPaymentData.workerId);

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">Calculate Payment</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {worker?.name} • {assignmentPaymentData.position}
                </p>
              </div>
              <button 
                onClick={() => {
                  setShowPaymentModal(false);
                  setAssignmentPaymentData(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-6">
              {/* Notice if using event settings */}
              {eventPaymentSettings[selectedEvent.id] && (
                <div className="bg-green-50 border border-green-200 p-3 rounded-lg">
                  <p className="text-sm text-green-800">
                    ✓ Using event payment settings. You can adjust these values if needed for this specific assignment.
                  </p>
                </div>
              )}

              {/* Input Section */}
              <div className="bg-gray-50 p-4 rounded-lg space-y-4">
                <h4 className="font-semibold text-gray-900">Event Details</h4>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Hours Worked *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={hours}
                    onChange={(e) => setHours(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Miles from Warehouse *
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={miles}
                    onChange={(e) => setMiles(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="lakeGeneva"
                    checked={isLakeGeneva}
                    onChange={(e) => setIsLakeGeneva(e.target.checked)}
                    className="rounded border-gray-300 text-red-900 focus:ring-red-500"
                  />
                  <label htmlFor="lakeGeneva" className="text-sm font-medium text-gray-700 cursor-pointer">
                    Lake Geneva Event (+$15)
                  </label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="holiday"
                    checked={isHoliday}
                    onChange={(e) => setIsHoliday(e.target.checked)}
                    className="rounded border-gray-300 text-red-900 focus:ring-red-500"
                  />
                  <label htmlFor="holiday" className="text-sm font-medium text-gray-700 cursor-pointer">
                    Holiday Pay (1.5× multiplier)
                  </label>
                </div>
              </div>

              {/* Calculation Breakdown */}
              {calculation && hours > 0 && (
                <div className="bg-blue-50 border-2 border-blue-200 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-3">Payment Breakdown</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-700">Base Pay ({hours} hrs × ${payRates[assignmentPaymentData.position] || 0}/hr):</span>
                      <span className="font-semibold text-gray-900">${calculation.basePay.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-700">Travel Pay ({miles} miles):</span>
                      <span className="font-semibold text-gray-900">${calculation.travelPay.toFixed(2)}</span>
                    </div>
                    {isLakeGeneva && (
                      <div className="flex justify-between">
                        <span className="text-gray-700">Lake Geneva Bonus:</span>
                        <span className="font-semibold text-gray-900">${calculation.lakeGenevaBonus.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t border-blue-300">
                      <span className="text-gray-700">Subtotal:</span>
                      <span className="font-semibold text-gray-900">${calculation.subtotal.toFixed(2)}</span>
                    </div>
                    {isHoliday && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-700">Holiday Multiplier:</span>
                          <span className="font-semibold text-gray-900">{calculation.holidayMultiplier}×</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t-2 border-blue-400">
                          <span className="text-gray-900 font-bold">Total Pay:</span>
                          <span className="font-bold text-blue-600 text-lg">${calculation.totalPay.toFixed(2)}</span>
                        </div>
                      </>
                    )}
                    {!isHoliday && (
                      <div className="flex justify-between pt-2 border-t-2 border-blue-400">
                        <span className="text-gray-900 font-bold">Total Pay:</span>
                        <span className="font-bold text-blue-600 text-lg">${calculation.totalPay.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-3 pt-4">
                <button
                  onClick={handleConfirm}
                  disabled={hours <= 0}
                  className="flex-1 bg-red-900 text-white px-6 py-3 rounded-lg hover:bg-red-800 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Confirm Assignment
                </button>
                <button
                  onClick={() => {
                    setShowPaymentModal(false);
                    setAssignmentPaymentData(null);
                  }}
                  className="flex-1 bg-gray-200 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-300 font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const DashboardView = () => {
    const upcomingEvents = events.filter(e => e.status !== 'completed' && e.status !== 'cancelled').length;
    const needStaffing = events.filter(e => {
      const eventAssignments = assignments.filter(a => a.event_id === e.id);
      const totalNeeded = e.positions?.reduce((sum, p) => sum + p.count, 0) || 0;
      const filled = eventAssignments.length;
      return filled < totalNeeded && totalNeeded > 0;
    }).length;

    // Get recent activity
    const getRecentActivity = () => {
      const activities = [];
      
      // Recent events (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      events.forEach(event => {
        const eventDate = new Date(event.created_at);
        if (eventDate >= sevenDaysAgo) {
          activities.push({
            type: 'event_created',
            date: event.created_at,
            message: `Event created: ${event.name}`,
            icon: Calendar,
            color: 'blue'
          });
        }
      });

      // Recent assignments (last 7 days)
      assignments.forEach(assignment => {
        const assignmentDate = new Date(assignment.created_at);
        if (assignmentDate >= sevenDaysAgo) {
          const worker = workers.find(w => w.id === assignment.worker_id);
          const event = events.find(e => e.id === assignment.event_id);
          if (worker && event) {
            activities.push({
              type: 'assignment',
              date: assignment.created_at,
              message: `${worker.name} assigned to ${event.name} as ${assignment.position}`,
              icon: Users,
              color: 'green'
            });
          }
        }
      });

      // Sort by date (newest first) and take top 10
      return activities
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 10);
    };

    const recentActivity = getRecentActivity();

    // Navigate to events filtered by status
    const viewEventsByFilter = (filter) => {
      setCurrentView('events');
      // In a full implementation, you'd pass the filter to EventsView
      // For now, just navigate to events
    };

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-3xl font-bold text-gray-900">Dashboard</h2>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowAddEvent(true)}
              className="bg-red-900 text-white px-4 py-2 rounded-lg hover:bg-red-800 flex items-center space-x-2 text-sm"
            >
              <Plus size={18} />
              <span>New Event</span>
            </button>
            <button
              onClick={() => setShowAddWorker(true)}
              className="bg-gray-700 text-white px-4 py-2 rounded-lg hover:bg-gray-600 flex items-center space-x-2 text-sm"
            >
              <Plus size={18} />
              <span>New Worker</span>
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <button
            onClick={() => setCurrentView('events')}
            className="bg-white p-6 rounded-lg shadow border-l-4 border-red-600 hover:shadow-lg transition-shadow text-left"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Upcoming Events</p>
                <p className="text-3xl font-bold text-gray-900">{upcomingEvents}</p>
                <p className="text-xs text-red-600 mt-1">Click to view all →</p>
              </div>
              <Calendar className="text-red-600" size={40} />
            </div>
          </button>
          
          <button
            onClick={() => viewEventsByFilter('needs-staff')}
            className="bg-white p-6 rounded-lg shadow border-l-4 border-yellow-500 hover:shadow-lg transition-shadow text-left"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Need Staffing</p>
                <p className="text-3xl font-bold text-gray-900">{needStaffing}</p>
                <p className="text-xs text-yellow-600 mt-1">Click to view →</p>
              </div>
              <AlertCircle className="text-yellow-500" size={40} />
            </div>
          </button>

          <button
            onClick={() => setCurrentView('staff')}
            className="bg-white p-6 rounded-lg shadow border-l-4 border-green-600 hover:shadow-lg transition-shadow text-left"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Active Workers</p>
                <p className="text-3xl font-bold text-gray-900">{workers.length}</p>
                <p className="text-xs text-green-600 mt-1">Click to manage →</p>
              </div>
              <Users className="text-green-600" size={40} />
            </div>
          </button>

          <button
            onClick={() => setCurrentView('schedule')}
            className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-600 hover:shadow-lg transition-shadow text-left"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total Events</p>
                <p className="text-3xl font-bold text-gray-900">{events.length}</p>
                <p className="text-xs text-blue-600 mt-1">View schedule →</p>
              </div>
              <DollarSign className="text-blue-600" size={40} />
            </div>
          </button>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              onClick={() => setShowAddEvent(true)}
              className="flex items-center space-x-3 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-red-500 hover:bg-red-50 transition-all group"
            >
              <div className="bg-red-100 p-2 rounded group-hover:bg-red-200">
                <Calendar className="text-red-600" size={24} />
              </div>
              <div className="text-left">
                <p className="font-semibold text-gray-900">Create Event</p>
                <p className="text-xs text-gray-600">Add new casino party</p>
              </div>
            </button>

            <button
              onClick={() => setShowAddWorker(true)}
              className="flex items-center space-x-3 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-green-500 hover:bg-green-50 transition-all group"
            >
              <div className="bg-green-100 p-2 rounded group-hover:bg-green-200">
                <Users className="text-green-600" size={24} />
              </div>
              <div className="text-left">
                <p className="font-semibold text-gray-900">Add Worker</p>
                <p className="text-xs text-gray-600">Onboard new staff</p>
              </div>
            </button>

            <button
              onClick={() => setCurrentView('schedule')}
              className="flex items-center space-x-3 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all group"
            >
              <div className="bg-blue-100 p-2 rounded group-hover:bg-blue-200">
                <Clock className="text-blue-600" size={24} />
              </div>
              <div className="text-left">
                <p className="font-semibold text-gray-900">View Schedule</p>
                <p className="text-xs text-gray-600">Calendar overview</p>
              </div>
            </button>

            <button
              onClick={() => setCurrentView('settings')}
              className="flex items-center space-x-3 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all group"
            >
              <div className="bg-purple-100 p-2 rounded group-hover:bg-purple-200">
                <Settings className="text-purple-600" size={24} />
              </div>
              <div className="text-left">
                <p className="font-semibold text-gray-900">Settings</p>
                <p className="text-xs text-gray-600">Manage positions</p>
              </div>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Activity */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Recent Activity</h3>
              <span className="text-xs text-gray-500">Last 7 days</span>
            </div>
            
            {recentActivity.length === 0 ? (
              <div className="text-center py-8">
                <History size={48} className="mx-auto text-gray-300 mb-4" />
                <p className="text-gray-600">No recent activity</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {recentActivity.map((activity, index) => {
                  const Icon = activity.icon;
                  const colorClasses = {
                    blue: 'bg-blue-100 text-blue-600',
                    green: 'bg-green-100 text-green-600',
                    red: 'bg-red-100 text-red-600',
                    yellow: 'bg-yellow-100 text-yellow-600'
                  };
                  
                  return (
                    <div key={index} className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded">
                      <div className={`p-2 rounded ${colorClasses[activity.color]}`}>
                        <Icon size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900">{activity.message}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(activity.date).toLocaleString('en-US', { 
                            month: 'short', 
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Upcoming Events Today/This Week */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">This Week's Events</h3>
            {(() => {
              const today = new Date();
              const endOfWeek = new Date();
              endOfWeek.setDate(today.getDate() + 7);
              
              const weekEvents = events
                .filter(event => {
                  const eventDate = new Date(event.date);
                  return eventDate >= today && eventDate <= endOfWeek;
                })
                .sort((a, b) => new Date(a.date) - new Date(b.date))
                .slice(0, 5);

              if (weekEvents.length === 0) {
                return (
                  <div className="text-center py-8">
                    <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-600">No events this week</p>
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  {weekEvents.map(event => {
                    const eventAssignments = assignments.filter(a => a.event_id === event.id);
                    const totalNeeded = event.positions?.reduce((sum, p) => sum + p.count, 0) || 0;
                    const filled = eventAssignments.length;
                    const isFullyStaffed = filled >= totalNeeded && totalNeeded > 0;
                    
                    const eventDate = new Date(event.date);
                    const daysUntil = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
                    
                    return (
                      <div 
                        key={event.id} 
                        className="p-3 border rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => {
                          setSelectedEvent(event);
                          setShowAssignModal(true);
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <h4 className="font-semibold text-gray-900">{event.name}</h4>
                            {daysUntil === 0 && (
                              <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded font-semibold">
                                TODAY
                              </span>
                            )}
                          </div>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            isFullyStaffed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {filled}/{totalNeeded}
                          </span>
                        </div>
                        <div className="flex items-center space-x-4 text-xs text-gray-600">
                          <span className="flex items-center space-x-1">
                            <Calendar size={12} />
                            <span>{eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                          </span>
                          <span className="flex items-center space-x-1">
                            <Clock size={12} />
                            <span>{event.time}</span>
                          </span>
                          <span className="flex items-center space-x-1">
                            <MapPin size={12} />
                            <span>{event.venue}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    );
  };

  const EventsView = () => {
    const getStatusColor = (status) => {
      switch(status) {
        case 'needs-staff': return 'bg-yellow-100 text-yellow-800';
        case 'confirmed': return 'bg-green-100 text-green-800';
        case 'completed': return 'bg-blue-100 text-blue-800';
        case 'cancelled': return 'bg-red-100 text-red-800';
        default: return 'bg-gray-100 text-gray-800';
      }
    };

    const formatDate = (dateString) => {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const getEventStaffingStatus = (event) => {
      if (!event.positions || event.positions.length === 0) return { filled: 0, total: 0, percentage: 0 };
      
      const eventAssignments = assignments.filter(a => a.event_id === event.id);
      const total = event.positions.reduce((sum, p) => sum + p.count, 0);
      const filled = eventAssignments.length;
      const percentage = total > 0 ? Math.round((filled / total) * 100) : 0;
      
      return { filled, total, percentage };
    };

    const openAssignModal = (event) => {
      setSelectedEvent(event);
      setShowAssignModal(true);
    };

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Events Management</h2>
            <p className="text-sm text-gray-600 mt-1">{events.length} total events</p>
          </div>
          <button 
            onClick={() => setShowAddEvent(true)}
            className="bg-red-900 text-white px-6 py-3 rounded-lg hover:bg-red-800 flex items-center space-x-2 transition-colors"
          >
            <Plus size={20} />
            <span>Create Event</span>
          </button>
        </div>

        {events.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Events Yet</h3>
            <p className="text-gray-600 mb-4">Create your first casino party event to get started!</p>
            <button 
              onClick={() => setShowAddEvent(true)}
              className="bg-red-900 text-white px-6 py-2 rounded-lg hover:bg-red-800"
            >
              Create Event
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {events.map(event => {
              const staffingStatus = getEventStaffingStatus(event);
              const isFullyStaffed = staffingStatus.filled >= staffingStatus.total && staffingStatus.total > 0;
              
              return (
              <div key={event.id} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow">
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-xl font-bold text-gray-900">{event.name}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(event.status)}`}>
                          {event.status === 'needs-staff' ? 'Needs Staff' : event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                        </span>
                        {staffingStatus.total > 0 && (
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            isFullyStaffed ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                          }`}>
                            {staffingStatus.filled}/{staffingStatus.total} staffed
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => openAssignModal(event)}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center space-x-1 text-sm"
                        title="Assign workers"
                      >
                        <Users size={16} />
                        <span>Assign Staff</span>
                      </button>
                      <button 
                        onClick={() => {
                          setSelectedEvent(event);
                          setShowEditEvent(true);
                        }}
                        className="text-blue-600 hover:text-blue-800 p-2 hover:bg-blue-50 rounded transition-colors"
                        title="Edit event"
                      >
                        <Edit size={18} />
                      </button>
                      <button 
                        onClick={() => deleteEvent(event.id)}
                        className="text-red-600 hover:text-red-800 p-2 hover:bg-red-50 rounded transition-colors"
                        title="Delete event"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="flex items-center space-x-2 text-gray-700">
                      <Calendar size={16} className="text-red-600" />
                      <span className="text-sm">{formatDate(event.date)}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-gray-700">
                      <Clock size={16} className="text-red-600" />
                      <span className="text-sm">{event.time}{event.end_time ? ` - ${event.end_time}` : ''}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-gray-700">
                      <MapPin size={16} className="text-red-600" />
                      <span className="text-sm">{event.venue}{event.room ? ` - ${event.room}` : ''}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-4">
                    {event.positions && event.positions.length > 0 && (
                      <div className="flex items-center space-x-1">
                        <Users size={16} />
                        <span>{event.positions.reduce((sum, p) => sum + p.count, 0)} workers needed</span>
                      </div>
                    )}
                    <div className="flex items-center space-x-1">
                      <User size={16} />
                      <span>{event.client}</span>
                    </div>
                    {event.client_contact && (
                      <div className="flex items-center space-x-1">
                        <Phone size={16} />
                        <span>{event.client_contact}</span>
                      </div>
                    )}
                  </div>

                  {event.positions && event.positions.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs text-gray-500 mb-2">Staff Needed:</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {event.positions.map((pos, idx) => (
                          <div key={idx} className="bg-red-50 text-red-900 text-sm px-3 py-2 rounded flex justify-between items-center">
                            <span className="font-medium">{pos.name}</span>
                            <span className="bg-red-200 px-2 py-0.5 rounded-full text-xs font-bold">{pos.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(event.dress_code || event.parking || event.address || event.notes) && (
                    <div className="mt-4 pt-4 border-t space-y-2 text-sm">
                      {event.dress_code && (
                        <p className="text-gray-600"><span className="font-semibold">Dress Code:</span> {event.dress_code}</p>
                      )}
                      {event.parking && (
                        <p className="text-gray-600"><span className="font-semibold">Parking:</span> {event.parking}</p>
                      )}
                      {event.address && (
                        <p className="text-gray-600"><span className="font-semibold">Address:</span> {event.address}</p>
                      )}
                      {event.notes && (
                        <p className="text-gray-600"><span className="font-semibold">Notes:</span> {event.notes}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
            })}
          </div>
        )}
      </div>
    );
  };

  const StaffView = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-900 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading workers from Supabase...</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h3 className="text-red-800 font-semibold mb-2">Database Connection Error</h3>
          <p className="text-red-700 text-sm">{error}</p>
          <button 
            onClick={loadWorkers}
            className="mt-4 bg-red-900 text-white px-4 py-2 rounded hover:bg-red-800"
          >
            Retry Connection
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Staff Management</h2>
            <p className="text-sm text-green-600 mt-1">Connected to Supabase • {workers.length} workers</p>
          </div>
          <button 
            onClick={() => setShowAddWorker(true)}
            className="bg-red-900 text-white px-6 py-3 rounded-lg hover:bg-red-800 flex items-center space-x-2 transition-colors"
          >
            <Plus size={20} />
            <span>Add Worker</span>
          </button>
        </div>

        {workers.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Users size={48} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Workers Yet</h3>
            <p className="text-gray-600 mb-4">Add your first worker to get started!</p>
            <button 
              onClick={() => setShowAddWorker(true)}
              className="bg-red-900 text-white px-6 py-2 rounded-lg hover:bg-red-800"
            >
              Add Worker
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Name</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Skills</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Rank</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Rating</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Total Gigs</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Contact</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {workers.map(worker => (
                    <tr key={worker.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-4 px-4">
                        <p className="font-semibold text-gray-900">{worker.name}</p>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex flex-wrap gap-1">
                          {Array.isArray(worker.skills) && worker.skills.map((skill, idx) => (
                            <span key={idx} className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded">
                              {skill}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className="bg-blue-100 text-blue-800 text-sm px-2 py-1 rounded font-medium">
                          Level {worker.rank}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center space-x-1">
                          <Star size={16} className="text-yellow-500 fill-yellow-500" />
                          <span className="font-semibold">{worker.reliability}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className="font-semibold text-gray-900">{worker.total_gigs}</span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="text-sm text-gray-600">
                          <p>{worker.phone}</p>
                          <p className="text-xs">{worker.email}</p>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex space-x-2">
                          <button 
                            onClick={() => {
                              setSelectedWorkerForEdit(worker);
                              setShowEditWorker(true);
                            }}
                            className="text-blue-600 hover:text-blue-800 p-1 hover:bg-blue-50 rounded transition-colors"
                            title="Edit worker"
                          >
                            <Edit size={18} />
                          </button>
                          <button 
                            onClick={() => deleteWorker(worker.id)}
                            className="text-red-600 hover:text-red-800 p-1 hover:bg-red-50 rounded transition-colors"
                            title="Delete worker"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const SettingsView = () => {
    const [newPosition, setNewPosition] = useState('');
    const [editingPosition, setEditingPosition] = useState(null);
    const [editValue, setEditValue] = useState('');
    const [saving, setSaving] = useState(false);
    const [warehouseAddress, setWarehouseAddress] = useState('');
    const [loadingWarehouse, setLoadingWarehouse] = useState(true);
    const [paymentTrackingEnabled, setPaymentTrackingEnabled] = useState(true);
    const [loadingPaymentSetting, setLoadingPaymentSetting] = useState(true);
    const [rankAccessDays, setRankAccessDays] = useState({
      1: 0,   // Rank 1 sees immediately
      2: 7,   // Rank 2 sees 7 days before
      3: 10,  // Rank 3 sees 10 days before
      4: 12,  // Rank 4 sees 12 days before
      5: 14   // Rank 5 sees 14 days before
    });
    const [loadingRankAccess, setLoadingRankAccess] = useState(true);

    useEffect(() => {
      loadWarehouseAddress();
      loadPaymentTrackingSetting();
      loadRankAccessSettings();
    }, []);

    const loadWarehouseAddress = async () => {
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('*')
          .eq('setting_key', 'warehouse_address')
          .single();
        
        if (!error && data) {
          setWarehouseAddress(data.setting_value || '');
        } else {
          // Set default for Vegas on Wheels
          setWarehouseAddress('535 S 93rd St, Milwaukee, WI 53214');
        }
      } catch (error) {
        console.error('Error loading warehouse address:', error);
        setWarehouseAddress('535 S 93rd St, Milwaukee, WI 53214');
      } finally {
        setLoadingWarehouse(false);
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
        } else {
          // Default to enabled
          setPaymentTrackingEnabled(true);
        }
      } catch (error) {
        console.error('Error loading payment tracking setting:', error);
        setPaymentTrackingEnabled(true);
      } finally {
        setLoadingPaymentSetting(false);
      }
    };

    const togglePaymentTracking = async (enabled) => {
      setSaving(true);
      try {
        const { data: existing } = await supabase
          .from('settings')
          .select('*')
          .eq('setting_key', 'payment_tracking_enabled')
          .single();

        if (existing) {
          const { error } = await supabase
            .from('settings')
            .update({ 
              setting_value: enabled.toString(),
              updated_at: new Date().toISOString()
            })
            .eq('setting_key', 'payment_tracking_enabled');
          
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('settings')
            .insert([{
              setting_key: 'payment_tracking_enabled',
              setting_value: enabled.toString()
            }]);
          
          if (error) throw error;
        }

        setPaymentTrackingEnabled(enabled);
        alert(enabled ? 'Payment tracking enabled!' : 'Payment tracking disabled!');
      } catch (error) {
        console.error('Error saving payment tracking setting:', error);
        alert('Error saving setting: ' + error.message);
      } finally {
        setSaving(false);
      }
    };

    const loadRankAccessSettings = async () => {
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
        console.error('Error loading rank access settings:', error);
      } finally {
        setLoadingRankAccess(false);
      }
    };

    const saveRankAccessSettings = async () => {
      setSaving(true);
      try {
        const { data: existing } = await supabase
          .from('settings')
          .select('*')
          .eq('setting_key', 'rank_access_days')
          .single();

        if (existing) {
          const { error } = await supabase
            .from('settings')
            .update({ 
              setting_value: JSON.stringify(rankAccessDays),
              updated_at: new Date().toISOString()
            })
            .eq('setting_key', 'rank_access_days');
          
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('settings')
            .insert([{
              setting_key: 'rank_access_days',
              setting_value: JSON.stringify(rankAccessDays)
            }]);
          
          if (error) throw error;
        }

        alert('Rank access settings saved successfully!');
      } catch (error) {
        console.error('Error saving rank access settings:', error);
        alert('Error saving settings: ' + error.message);
      } finally {
        setSaving(false);
      }
    };

    const saveWarehouseAddress = async () => {
      setSaving(true);
      try {
        const { data: existing } = await supabase
          .from('settings')
          .select('*')
          .eq('setting_key', 'warehouse_address')
          .single();

        if (existing) {
          const { error } = await supabase
            .from('settings')
            .update({ 
              setting_value: warehouseAddress,
              updated_at: new Date().toISOString()
            })
            .eq('setting_key', 'warehouse_address');
          
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('settings')
            .insert([{
              setting_key: 'warehouse_address',
              setting_value: warehouseAddress
            }]);
          
          if (error) throw error;
        }

        alert('Warehouse address saved successfully!');
      } catch (error) {
        console.error('Error saving warehouse address:', error);
        alert('Error saving warehouse address: ' + error.message);
      } finally {
        setSaving(false);
      }
    };

    const savePositions = async (updatedPositions) => {
      setSaving(true);
      try {
        // Sort alphabetically
        const sortedPositions = [...updatedPositions].sort();
        
        // Check if settings exist
        const { data: existingSettings } = await supabase
          .from('settings')
          .select('*')
          .eq('setting_key', 'positions')
          .single();

        if (existingSettings) {
          // Update existing
          const { error } = await supabase
            .from('settings')
            .update({ 
              setting_value: sortedPositions,
              updated_at: new Date().toISOString()
            })
            .eq('setting_key', 'positions');
          
          if (error) throw error;
        } else {
          // Insert new
          const { error } = await supabase
            .from('settings')
            .insert([{
              setting_key: 'positions',
              setting_value: sortedPositions
            }]);
          
          if (error) throw error;
        }

        setPositions(sortedPositions);
        alert('Positions updated successfully!');
      } catch (error) {
        console.error('Error saving positions:', error);
        alert('Error saving positions: ' + error.message);
      } finally {
        setSaving(false);
      }
    };

    const handleAddPosition = async () => {
      if (!newPosition.trim()) {
        alert('Please enter a position name');
        return;
      }
      if (positions.includes(newPosition.trim())) {
        alert('This position already exists');
        return;
      }
      
      const updatedPositions = [...positions, newPosition.trim()];
      await savePositions(updatedPositions);
      setNewPosition('');
    };

    const handleDeletePosition = async (position) => {
      if (!confirm(`Are you sure you want to delete "${position}"?`)) return;
      
      const updatedPositions = positions.filter(p => p !== position);
      await savePositions(updatedPositions);
    };

    const handleEditPosition = (position) => {
      setEditingPosition(position);
      setEditValue(position);
    };

    const handleSaveEdit = async () => {
      if (!editValue.trim()) {
        alert('Position name cannot be empty');
        return;
      }
      if (editValue !== editingPosition && positions.includes(editValue.trim())) {
        alert('This position already exists');
        return;
      }

      const updatedPositions = positions.map(p => 
        p === editingPosition ? editValue.trim() : p
      );
      await savePositions(updatedPositions);
      setEditingPosition(null);
      setEditValue('');
    };

    const handleCancelEdit = () => {
      setEditingPosition(null);
      setEditValue('');
    };

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Settings</h2>
          <p className="text-sm text-gray-600 mt-1">Manage your position types and system settings</p>
        </div>

        {/* Positions Management */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Position Types</h3>
          <p className="text-sm text-gray-600 mb-4">
            Customize the positions available in your system. These positions will be used for:
          </p>
          <ul className="text-sm text-gray-600 mb-4 list-disc list-inside space-y-1">
            <li><strong>Event Staffing:</strong> When creating events, you'll select how many of each position you need</li>
            <li><strong>Worker Skills:</strong> When adding/editing workers, these become the available skills they can have</li>
            <li><strong>Assignment Matching:</strong> Workers are automatically matched to positions based on their skills</li>
          </ul>
          <p className="text-sm text-blue-600 bg-blue-50 p-3 rounded mb-4">
            💡 Tip: When you add a new position like "Baccarat Dealer", it immediately becomes available both as an event position AND a worker skill.
          </p>

          {/* Add New Position */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Add New Position</label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={newPosition}
                onChange={(e) => setNewPosition(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddPosition()}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="e.g., Baccarat Dealer"
                disabled={saving}
              />
              <button
                onClick={handleAddPosition}
                disabled={saving}
                className="bg-red-900 text-white px-6 py-2 rounded-lg hover:bg-red-800 disabled:bg-gray-400 flex items-center space-x-2"
              >
                <Plus size={18} />
                <span>Add</span>
              </button>
            </div>
          </div>

          {/* Existing Positions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Current Positions ({positions.length})</label>
            <div className="space-y-2">
              {positions.length === 0 ? (
                <p className="text-gray-500 text-sm py-4">No positions configured yet. Add your first position above.</p>
              ) : (
                positions.map((position, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    {editingPosition === position ? (
                      <>
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleSaveEdit()}
                          className="flex-1 px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-red-500 focus:border-transparent"
                          autoFocus
                        />
                        <div className="flex space-x-2 ml-3">
                          <button
                            onClick={handleSaveEdit}
                            className="text-green-600 hover:text-green-800 p-1 hover:bg-green-50 rounded"
                            title="Save"
                          >
                            <CheckCircle size={20} />
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="text-gray-600 hover:text-gray-800 p-1 hover:bg-gray-200 rounded"
                            title="Cancel"
                          >
                            <XCircle size={20} />
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="font-medium text-gray-900">{position}</span>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleEditPosition(position)}
                            disabled={saving}
                            className="text-blue-600 hover:text-blue-800 p-1 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
                            title="Edit position"
                          >
                            <Edit size={18} />
                          </button>
                          <button
                            onClick={() => handleDeletePosition(position)}
                            disabled={saving}
                            className="text-red-600 hover:text-red-800 p-1 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                            title="Delete position"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {saving && (
            <div className="mt-4 flex items-center justify-center text-gray-600">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-900 mr-2"></div>
              <span>Saving...</span>
            </div>
          )}
        </div>

        {/* Warehouse Address */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Warehouse Address</h3>
          <p className="text-sm text-gray-600 mb-4">
            This address is used to automatically calculate travel distance for payment calculations.
          </p>
          
          {loadingWarehouse ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-900"></div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                <input
                  type="text"
                  value={warehouseAddress}
                  onChange={(e) => setWarehouseAddress(e.target.value)}
                  placeholder="123 Main St, City, State ZIP"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  disabled={saving}
                />
              </div>
              <button
                onClick={saveWarehouseAddress}
                disabled={saving || !warehouseAddress}
                className="bg-red-900 text-white px-6 py-2 rounded-lg hover:bg-red-800 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Address'}
              </button>
            </div>
          )}
        </div>

        {/* Payment Tracking Toggle */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Payment Tracking</h3>
          <p className="text-sm text-gray-600 mb-4">
            Enable or disable payment tracking features. When disabled, the Payments tab and payment calculations will be hidden.
          </p>
          
          {loadingPaymentSetting ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-900"></div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-semibold text-gray-900">Enable Payment Tracking</p>
                <p className="text-sm text-gray-600 mt-1">
                  {paymentTrackingEnabled 
                    ? 'Payment tracking is currently enabled. Workers will see pay info on assignments.' 
                    : 'Payment tracking is currently disabled. Payment features are hidden.'}
                </p>
              </div>
              <button
                onClick={() => togglePaymentTracking(!paymentTrackingEnabled)}
                disabled={saving}
                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                  paymentTrackingEnabled ? 'bg-green-600' : 'bg-gray-300'
                } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                    paymentTrackingEnabled ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          )}
        </div>

        {/* Rank-Based Event Access */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Worker Event Access (Rank-Based)</h3>
          <p className="text-sm text-gray-600 mb-4">
            Control when workers can see and sign up for events based on their rank. Lower rank numbers (better workers) get earlier access.
          </p>
          
          {loadingRankAccess ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-900"></div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4, 5].map(rank => (
                  <div key={rank} className="border border-gray-200 rounded-lg p-4">
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      Rank {rank} {rank === 1 && '(Best)'}  {rank === 5 && '(New)'}
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        min="0"
                        value={rankAccessDays[rank]}
                        onChange={(e) => setRankAccessDays({
                          ...rankAccessDays,
                          [rank]: parseInt(e.target.value) || 0
                        })}
                        className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        disabled={saving}
                      />
                      <span className="text-sm text-gray-600">
                        days before event
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      {rankAccessDays[rank] === 0 
                        ? 'Can see events immediately' 
                        : `Can see events ${rankAccessDays[rank]} days before`}
                    </p>
                  </div>
                ))}
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
                <p className="text-blue-900 font-semibold mb-2">Example Timeline:</p>
                <ul className="text-blue-800 space-y-1">
                  <li>• Event created: Rank 1 workers see it immediately</li>
                  <li>• {rankAccessDays[2]} days before: Rank 2 workers can sign up</li>
                  <li>• {rankAccessDays[3]} days before: Rank 3 workers can sign up</li>
                  <li>• {rankAccessDays[4]} days before: Rank 4 workers can sign up</li>
                  <li>• {rankAccessDays[5]} days before: Rank 5 workers can sign up</li>
                </ul>
              </div>

              <button
                onClick={saveRankAccessSettings}
                disabled={saving}
                className="bg-red-900 text-white px-6 py-2 rounded-lg hover:bg-red-800 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Access Settings'}
              </button>
            </div>
          )}
        </div>

        {/* Future Settings Sections */}
        <div className="bg-gray-50 rounded-lg p-6 border-2 border-dashed border-gray-300">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">More Settings Coming Soon</h3>
          <p className="text-sm text-gray-600">
            Additional settings like worker skills, pay rates, and notification preferences will be added here.
          </p>
        </div>
      </div>
    );
  };

  const PaymentsView = () => {
    const [filterStatus, setFilterStatus] = useState('all'); // all, pending, paid
    const [filterWorker, setFilterWorker] = useState('all');
    const [filterEvent, setFilterEvent] = useState('all');
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
        console.error('Error updating payment status:', error);
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
        console.error('Error updating payment status:', error);
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
        console.error('Error updating payments:', error);
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
        console.error('Error updating payments:', error);
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
                        <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">
                          {assignment.position}
                        </span>
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
                          <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">
                            {assignment.position}
                          </span>
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
      const dateStr = date.toISOString().split('T')[0];
      return events.filter(event => event.date === dateStr);
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
                  {dayEvents.slice(0, 2).map(event => {
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
      const dayEvents = events.filter(event => event.date === dateStr);

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
                              <span>{event.time}{event.end_time ? ` - ${event.end_time}` : ''}</span>
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
                                  <span className="text-gray-600">{assignment.position}</span>
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
                          <span>{assignment.event.time}</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <MapPin size={14} />
                          <span>{assignment.event.venue}</span>
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-medium">
                        {assignment.position}
                      </span>
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

  const AvailableEventsSection = ({ currentWorker, events, assignments, rankAccessDays }) => {
    const [applying, setApplying] = useState(false);
    
    // Calculate which events the worker can see based on rank
    const getAvailableEvents = () => {
      const today = new Date();
      const workerRank = currentWorker.rank || 5;
      const accessDays = rankAccessDays[workerRank] || 14;
      
      return events
        .filter(event => {
          // Must be future event
          const eventDate = new Date(event.date);
          if (eventDate < today) return false;
          
          // Calculate days until event
          const daysUntil = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
          
          // Check if within access window
          if (daysUntil > accessDays && accessDays > 0) return false;
          
          // Must have positions that match worker skills
          const eventPositions = event.positions || positions;
          const hasMatchingSkill = eventPositions.some(pos => 
            currentWorker.skills && currentWorker.skills.includes(pos)
          );
          if (!hasMatchingSkill) return false;
          
          // Not already assigned or applied
          const alreadyAssigned = assignments.some(a => 
            a.event_id === event.id && 
            a.worker_id === currentWorker.id &&
            ['approved', 'pending'].includes(a.status || 'approved')
          );
          if (alreadyAssigned) return false;
          
          return true;
        })
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    };
    
    const availableEvents = getAvailableEvents();
    
    const applyToEvent = async (event, position) => {
      if (!confirm(`Apply for ${position} position at ${event.name}?`)) return;
      
      setApplying(true);
      try {
        const { error } = await supabase
          .from('assignments')
          .insert([{
            event_id: event.id,
            worker_id: currentWorker.id,
            position: position,
            status: 'pending',
            applied_at: new Date().toISOString()
          }]);
        
        if (error) throw error;
        
        loadAssignments();
        alert(`✓ Application submitted for ${event.name}!\n\nYour application is pending admin approval. You'll be notified once it's reviewed.`);
      } catch (error) {
        console.error('Error applying:', error);
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
            // Get positions that match worker skills
            const eventPositions = event.positions || positions;
            const matchingPositions = eventPositions.filter(pos => 
              currentWorker.skills && currentWorker.skills.includes(pos)
            );
            
            const daysUntil = Math.ceil((new Date(event.date) - new Date()) / (1000 * 60 * 60 * 24));
            
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
                    <span>{new Date(event.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Clock size={14} className="text-gray-500" />
                    <span>{event.time}{event.end_time ? ` - ${event.end_time}` : ''}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <MapPin size={14} className="text-gray-500" />
                    <span>{event.venue}</span>
                  </div>
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
    // For demo purposes, use first worker. In production, this would be based on logged-in user
    const [selectedWorkerId, setSelectedWorkerId] = useState(null);
    const [workerSelectMode, setWorkerSelectMode] = useState(true);
    const [viewMode, setViewMode] = useState('calendar'); // 'calendar' or 'list'
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [selectedEventModal, setSelectedEventModal] = useState(null);

    // Select a worker for demo
    if (workerSelectMode) {
      return (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Select Your Profile</h2>
            <p className="text-gray-600 mb-6">
              In production, you would be automatically logged in. For demo purposes, select a worker profile:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workers.map(worker => (
                <button
                  key={worker.id}
                  onClick={() => {
                    setSelectedWorkerId(worker.id);
                    setWorkerSelectMode(false);
                  }}
                  className="text-left p-4 border-2 border-gray-200 rounded-lg hover:border-red-500 hover:shadow-md transition-all"
                >
                  <p className="font-bold text-gray-900">{worker.name}</p>
                  <p className="text-sm text-gray-600">{worker.email}</p>
                  <div className="flex items-center space-x-1 mt-2">
                    <Star size={14} className="text-yellow-500 fill-yellow-500" />
                    <span className="text-sm font-semibold">{worker.reliability}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }

    const currentWorker = workers.find(w => w.id === selectedWorkerId);
    if (!currentWorker) return null;

    const workerAssignments = assignments
      .filter(a => a.worker_id === currentWorker.id)
      .map(assignment => {
        const event = events.find(e => e.id === assignment.event_id);
        return { ...assignment, event };
      })
      .filter(a => a.event);

    const upcomingAssignments = workerAssignments
      .filter(a => new Date(a.event.date) >= new Date())
      .sort((a, b) => new Date(a.event.date) - new Date(b.event.date));

    const pastAssignments = workerAssignments
      .filter(a => new Date(a.event.date) < new Date())
      .sort((a, b) => new Date(b.event.date) - new Date(a.event.date));

    const totalEarnings = currentWorker.earnings || 0;

    return (
      <div className="space-y-6">
        {/* Header with worker info */}
        <div className="bg-gradient-to-r from-red-900 to-black text-white rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-3xl font-bold mb-2">Welcome, {currentWorker.name}!</h2>
              <p className="text-red-200">Your worker portal</p>
            </div>
            <button
              onClick={() => setWorkerSelectMode(true)}
              className="text-sm bg-red-700 px-3 py-2 rounded hover:bg-red-600"
            >
              Switch Profile
            </button>
          </div>
        </div>

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
                    const dateStr = currentDate.toISOString().split('T')[0];
                    
                    const dayAssignments = workerAssignments.filter(a => 
                      a.event && a.event.date === dateStr
                    );
                    
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
                                title={`${assignment.event.name} - ${assignment.position}`}
                              >
                                {assignment.event.time} {assignment.position}
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
                const daysUntil = Math.ceil((new Date(assignment.event.date) - new Date()) / (1000 * 60 * 60 * 24));
                const isToday = daysUntil === 0;
                const isTomorrow = daysUntil === 1;
                
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
                        <span className="bg-red-900 text-white text-xs px-2 py-1 rounded font-medium">
                          {assignment.position}
                        </span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 text-sm text-gray-700">
                      <div className="flex items-center space-x-2">
                        <Calendar size={16} className="text-gray-500" />
                        <span>
                          {new Date(assignment.event.date).toLocaleDateString('en-US', { 
                            weekday: 'short',
                            month: 'short', 
                            day: 'numeric' 
                          })}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Clock size={16} className="text-gray-500" />
                        <span>{assignment.event.time}{assignment.event.end_time ? ` - ${assignment.event.end_time}` : ''}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <MapPin size={16} className="text-gray-500" />
                        <span>{assignment.event.venue}</span>
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
                      <span>{new Date(assignment.event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      <span>•</span>
                      <span>{assignment.position}</span>
                      <span>•</span>
                      <span>{assignment.event.venue}</span>
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
                    Events on {new Date(selectedEventModal[0].event.date).toLocaleDateString('en-US', { 
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
                  {selectedEventModal.map((assignment, idx) => {
                    const daysUntil = Math.ceil((new Date(assignment.event.date) - new Date()) / (1000 * 60 * 60 * 24));
                    const isToday = daysUntil === 0;
                    const isTomorrow = daysUntil === 1;

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
                            <span className="bg-red-900 text-white text-xs px-2 py-1 rounded font-medium">
                              {assignment.position}
                            </span>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-sm text-gray-700">
                          <div className="flex items-center space-x-2">
                            <Clock size={16} className="text-gray-500" />
                            <span className="font-medium">
                              {assignment.event.time}{assignment.event.end_time ? ` - ${assignment.event.end_time}` : ''}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <MapPin size={16} className="text-gray-500" />
                            <span>{assignment.event.venue}</span>
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
    if (currentView === 'dashboard') return <DashboardView />;
    if (currentView === 'staff') return <StaffView />;
    if (currentView === 'events') return <EventsView />;
    if (currentView === 'schedule') return <ScheduleView />;
    if (currentView === 'payments') return <PaymentsView />;
    if (currentView === 'settings') return <SettingsView />;
    
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Coming Soon</h3>
        <p className="text-gray-600">This feature will be available soon!</p>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Header />
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderView()}
      </div>
      <AddWorkerModal />
      <EditWorkerModal />
      <AddEventModal />
      <EditEventModal />
      <AssignWorkersModal />
      <PaymentCalculatorModal />
    </div>
  );
};

export default GigStaffPro;
