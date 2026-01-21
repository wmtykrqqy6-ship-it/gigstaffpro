import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Calendar, Users, Clock, MapPin, DollarSign, Mail, Phone, CheckCircle, XCircle, Menu, Plus, Search, Filter, Star, Bell, Settings, LogOut, ChevronDown, TrendingUp, Send, Trash2, Edit, Download, BarChart3, AlertCircle, X, MessageSquare, Award, Target, FileText, History, Navigation2, Copy, Home, Briefcase, User } from 'lucide-react';

const GigStaffPro = () => {
  const [userRole, setUserRole] = useState('admin');
  const [currentView, setCurrentView] = useState('dashboard');
  const [workers, setWorkers] = useState([]);
  const [events, setEvents] = useState([]);
  const [positions, setPositions] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddWorker, setShowAddWorker] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);

  // Load workers from Supabase
  useEffect(() => {
    loadWorkers();
    loadEvents();
    loadSettings();
    loadAssignments();
  }, []);

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
    
    return (
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8 overflow-x-auto">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: Home },
              { id: 'staff', label: 'Staff', icon: Users },
              { id: 'events', label: 'Events', icon: Calendar },
              { id: 'schedule', label: 'Schedule', icon: Clock },
              { id: 'settings', label: 'Settings', icon: Settings }
            ].map(({ id, label, icon: Icon }) => (
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

  const AssignWorkersModal = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [showOnlyAvailable, setShowOnlyAvailable] = useState(false);
    
    if (!showAssignModal || !selectedEvent) return null;

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
        
        // If worker is already assigned to a different position, confirm reassignment
        if (existingAssignment) {
          if (!confirm(`${worker.name} is currently assigned to ${existingAssignment.position}. Move them to ${position} instead?`)) {
            return;
          }
          
          // Delete the old assignment
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

        const { error } = await supabase
          .from('assignments')
          .insert([{
            event_id: selectedEvent.id,
            worker_id: workerId,
            position: position,
            status: 'assigned'
          }]);
        
        if (error) throw error;
        
        loadAssignments();
        
        if (existingAssignment) {
          alert(`${worker.name} moved from ${existingAssignment.position} to ${position}`);
        } else {
          alert(`${worker.name} assigned to ${position}`);
        }
      } catch (error) {
        console.error('Error assigning worker:', error);
        alert('Error assigning worker: ' + error.message);
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
                                
                                return (
                                  <div key={worker.id} className={`flex items-center justify-between p-3 rounded ${
                                    isAvailable ? 'bg-gray-50 hover:bg-gray-100' : 'bg-orange-50 border border-orange-200'
                                  }`}>
                                    <div className="flex-1">
                                      <p className={`font-medium ${isAvailable ? 'text-gray-900' : 'text-orange-900'}`}>
                                        {worker.name}
                                        {otherAssignment && (
                                          <span className="ml-2 text-xs bg-orange-200 text-orange-800 px-2 py-0.5 rounded">
                                            Currently: {otherAssignment.position}
                                          </span>
                                        )}
                                      </p>
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
                                      className={`ml-3 px-3 py-1 rounded text-sm ${
                                        isAvailable 
                                          ? 'bg-red-900 text-white hover:bg-red-800' 
                                          : 'bg-orange-600 text-white hover:bg-orange-700'
                                      }`}
                                    >
                                      {isAvailable ? 'Assign' : 'Reassign'}
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

    const skillOptions = ['Dealer', 'Poker', 'Blackjack', 'Roulette', 'Craps', 'Texas Holdem', 'Host', 'Bartender', 'Mixology', 'Customer Service'];

    const handleSubmit = async (e) => {
      e.preventDefault();
      
      if (formData.skills.length === 0) {
        alert('Please select at least one skill');
        return;
      }
      
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
                  className="flex-1 bg-red-900 text-white px-6 py-3 rounded-lg hover:bg-red-800 font-medium"
                >
                  Add Worker
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddWorker(false)}
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

  const DashboardView = () => {
    const upcomingEvents = events.filter(e => e.status !== 'completed' && e.status !== 'cancelled').length;
    const needStaffing = events.filter(e => e.status === 'needs-staff').length;

    return (
      <div className="space-y-6">
        <h2 className="text-3xl font-bold text-gray-900">Dashboard</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-red-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Upcoming Events</p>
                <p className="text-3xl font-bold text-gray-900">{upcomingEvents}</p>
              </div>
              <Calendar className="text-red-600" size={40} />
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-yellow-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Need Staffing</p>
                <p className="text-3xl font-bold text-gray-900">{needStaffing}</p>
              </div>
              <AlertCircle className="text-yellow-500" size={40} />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Active Workers</p>
                <p className="text-3xl font-bold text-gray-900">{workers.length}</p>
              </div>
              <Users className="text-green-600" size={40} />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total Events</p>
                <p className="text-3xl font-bold text-gray-900">{events.length}</p>
              </div>
              <DollarSign className="text-blue-600" size={40} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Recent Activity</h3>
          <div className="space-y-2">
            <p className="text-gray-700">Your casino party staffing platform is ready to use!</p>
            <div className="mt-4 pt-4 border-t">
              <p className="text-green-600 font-semibold">Database connected - {workers.length} workers loaded</p>
              <p className="text-blue-600 text-sm mt-2">Click "Events" tab to create and manage casino party events!</p>
            </div>
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
                        onClick={() => alert('Edit feature coming soon!')}
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
                            onClick={() => alert('Edit feature coming soon!')}
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
            Customize the staff positions available when creating events. These will appear in the staffing requirements section.
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

  const renderView = () => {
    if (currentView === 'dashboard') return <DashboardView />;
    if (currentView === 'staff') return <StaffView />;
    if (currentView === 'events') return <EventsView />;
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
      <AddEventModal />
      <AssignWorkersModal />
    </div>
  );
};

export default GigStaffPro;
