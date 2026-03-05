import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, CheckCircle, XCircle, MapPin, Save, ToggleLeft, ToggleRight, Building2, Phone, Mail, User, ParkingCircle } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { getHostLabel, setHostLabel } from '../../utils/hostLabelHelper';
import AddressAutocomplete from '../AddressAutocomplete';

export default function SettingsView({
  positions,
  onUpdatePositions
}) {
  const [activeTab, setActiveTab] = useState('venues');
  const [hostLabelValue, setHostLabelValue] = useState(getHostLabel());
  const [hostLabelSaved, setHostLabelSaved] = useState(false);

  const handleSaveHostLabel = () => {
    setHostLabel(hostLabelValue);
    setHostLabelSaved(true);
    setTimeout(() => setHostLabelSaved(false), 2000);
  };

  // --- Locations state ---
  const [locations, setLocations] = useState([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [locationForm, setLocationForm] = useState({
    name: '', city: '', state: '', timezone: 'America/Chicago',
    rules: { default_dress_code: '', notes: '' },
    is_active: true
  });
  const [savingLocation, setSavingLocation] = useState(false);
  // --- Venues state ---
  const [venues, setVenues] = useState([]);
  const [loadingVenues, setLoadingVenues] = useState(true);
  const [showAddVenue, setShowAddVenue] = useState(false);
  const [editingVenue, setEditingVenue] = useState(null);
  const [venueForm, setVenueForm] = useState({
    name: '', address: '', phone: '', email: '',
    contact_name: '', parking: '', notes: '', is_active: true
  });
  const [savingVenue, setSavingVenue] = useState(false);

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
  const [timezone, setTimezone] = useState('America/Chicago');
  const [timeFormat, setTimeFormat] = useState('12'); // '12' or '24'
  const [loadingTimeSettings, setLoadingTimeSettings] = useState(true);

  useEffect(() => {
    loadWarehouseAddress();
    loadPaymentTrackingSetting();
    loadRankAccessSettings();
    loadTimeSettings();
    loadLocations();
    loadVenues();
  }, []);

  const loadLocations = async () => {
    setLoadingLocations(true);
    try {
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .order('name');
      if (error) throw error;
      setLocations(data || []);
    } catch (err) {
      console.error('Error loading locations:', err.message);
    } finally {
      setLoadingLocations(false);
    }
  };

  const loadVenues = async () => {
    setLoadingVenues(true);
    try {
      const { data, error } = await supabase
        .from('venues')
        .select('*')
        .order('name');
      if (error) throw error;
      setVenues(data || []);
    } catch (err) {
      console.error('Error loading venues:', err.message);
    } finally {
      setLoadingVenues(false);
    }
  };

  const resetVenueForm = () => {
    setVenueForm({ name: '', address: '', phone: '', email: '', contact_name: '', parking: '', notes: '', is_active: true });
  };

  const openAddVenue = () => {
    resetVenueForm();
    setEditingVenue(null);
    setShowAddVenue(true);
  };

  const openEditVenue = (venue) => {
    setVenueForm({
      name: venue.name || '',
      address: venue.address || '',
      phone: venue.phone || '',
      email: venue.email || '',
      contact_name: venue.contact_name || '',
      parking: venue.parking || '',
      notes: venue.notes || '',
      is_active: venue.is_active !== false
    });
    setEditingVenue(venue);
    setShowAddVenue(true);
  };

  const saveVenue = async () => {
    if (!venueForm.name.trim()) {
      alert('Venue name is required.');
      return;
    }
    setSavingVenue(true);
    try {
      const payload = {
        name: venueForm.name.trim(),
        address: venueForm.address.trim() || null,
        phone: venueForm.phone.trim() || null,
        email: venueForm.email.trim() || null,
        contact_name: venueForm.contact_name.trim() || null,
        parking: venueForm.parking.trim() || null,
        notes: venueForm.notes.trim() || null,
        is_active: venueForm.is_active
      };
      if (editingVenue) {
        const { error } = await supabase.from('venues').update(payload).eq('id', editingVenue.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('venues').insert([payload]);
        if (error) throw error;
      }
      await loadVenues();
      setShowAddVenue(false);
      setEditingVenue(null);
      resetVenueForm();
    } catch (err) {
      alert('Error saving venue: ' + err.message);
    } finally {
      setSavingVenue(false);
    }
  };

  const toggleVenueActive = async (venue) => {
    try {
      const { error } = await supabase.from('venues').update({ is_active: !venue.is_active }).eq('id', venue.id);
      if (error) throw error;
      await loadVenues();
    } catch (err) {
      alert('Error updating venue: ' + err.message);
    }
  };

  const deleteVenue = async (venue) => {
    if (!confirm(`Delete "${venue.name}"? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from('venues').delete().eq('id', venue.id);
      if (error) throw error;
      await loadVenues();
    } catch (err) {
      alert('Error deleting venue: ' + err.message);
    }
  };

  const resetLocationForm = () => {
    setLocationForm({
      name: '', city: '', state: '', timezone: 'America/Chicago',
      rules: { default_dress_code: '', notes: '' },
      is_active: true
    });
  };

  const openAddLocation = () => {
    resetLocationForm();
    setEditingLocation(null);
    setShowAddLocation(true);
  };

  const openEditLocation = (loc) => {
    setLocationForm({
      name: loc.name || '',
      city: loc.city || '',
      state: loc.state || '',
      timezone: loc.timezone || 'America/Chicago',
      rules: {
        default_dress_code: loc.rules?.default_dress_code || '',
        notes: loc.rules?.notes || ''
      },
      is_active: loc.is_active !== false
    });
    setEditingLocation(loc);
    setShowAddLocation(true);
  };

  const saveLocation = async () => {
    if (!locationForm.name.trim()) {
      alert('Location name is required.');
      return;
    }
    setSavingLocation(true);
    try {
      const payload = {
        name: locationForm.name.trim(),
        city: locationForm.city.trim() || null,
        state: locationForm.state.trim() || null,
        timezone: locationForm.timezone,
        rules: locationForm.rules,
        is_active: locationForm.is_active
      };

      if (editingLocation) {
        const { error } = await supabase
          .from('locations')
          .update(payload)
          .eq('id', editingLocation.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('locations')
          .insert([payload]);
        if (error) throw error;
      }

      await loadLocations();
      setShowAddLocation(false);
      setEditingLocation(null);
      resetLocationForm();
    } catch (err) {
      alert('Error saving location: ' + err.message);
    } finally {
      setSavingLocation(false);
    }
  };

  const toggleLocationActive = async (loc) => {
    try {
      const { error } = await supabase
        .from('locations')
        .update({ is_active: !loc.is_active })
        .eq('id', loc.id);
      if (error) throw error;
      await loadLocations();
    } catch (err) {
      alert('Error updating location: ' + err.message);
    }
  };

  const deleteLocation = async (loc) => {
    if (loc.name === 'Main') {
      alert('The default "Main" location cannot be deleted.');
      return;
    }
    if (!confirm(`Delete "${loc.name}"? This cannot be undone. Events linked to this location will lose their location.`)) return;
    try {
      const { error } = await supabase
        .from('locations')
        .delete()
        .eq('id', loc.id);
      if (error) throw error;
      await loadLocations();
    } catch (err) {
      alert('Error deleting location: ' + err.message);
    }
  };

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

    } catch (error) {
      throw error;
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

    } catch (error) {
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const loadTimeSettings = async () => {
    try {
      // Load timezone
      const { data: tzData } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'timezone')
        .single();
      
      if (tzData) {
        setTimezone(tzData.setting_value || 'America/Chicago');
      }

      // Load time format
      const { data: formatData } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'time_format')
        .single();
      
      if (formatData) {
        setTimeFormat(formatData.setting_value || '12');
      }
    } catch (error) {
    } finally {
      setLoadingTimeSettings(false);
    }
  };

  const saveTimeSettings = async () => {
    setSaving(true);
    try {
      // Save timezone
      const { data: existingTz } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'timezone')
        .single();

      if (existingTz) {
        await supabase
          .from('settings')
          .update({ 
            setting_value: timezone,
            updated_at: new Date().toISOString()
          })
          .eq('setting_key', 'timezone');
      } else {
        await supabase
          .from('settings')
          .insert([{
            setting_key: 'timezone',
            setting_value: timezone
          }]);
      }

      // Save time format
      const { data: existingFormat } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'time_format')
        .single();

      if (existingFormat) {
        await supabase
          .from('settings')
          .update({ 
            setting_value: timeFormat,
            updated_at: new Date().toISOString()
          })
          .eq('setting_key', 'time_format');
      } else {
        await supabase
          .from('settings')
          .insert([{
            setting_key: 'time_format',
            setting_value: timeFormat
          }]);
      }

    } catch (error) {
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const savePositions = async (updatedPositions) => {
    setSaving(true);
    try {
      // Sort alphabetically by label
      const sortedPositions = [...updatedPositions].sort((a, b) => {
        const labelA = a.label || a;
        const labelB = b.label || b;
        return labelA.localeCompare(labelB);
      });
      
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

      onUpdatePositions(sortedPositions);
      alert('Positions updated successfully!');
    } catch (error) {
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
    
    const newKey = newPosition.trim().toLowerCase().replace(/\s+/g, '_');
    const newLabel = newPosition.trim();
    
    if (positions.some(p => p.key === newKey)) {
      alert('This position already exists');
      return;
    }
    
    const updatedPositions = [...positions, { key: newKey, label: newLabel }];
    await savePositions(updatedPositions);
    setNewPosition('');
  };

  const handleDeletePosition = async (position) => {
    const label = position.label || position;
    if (!confirm(`Are you sure you want to delete "${label}"?`)) return;
    
    const posKey = position.key || position;
    const updatedPositions = positions.filter(p => p.key !== posKey);
    await savePositions(updatedPositions);
  };

  const handleEditPosition = (position) => {
    setEditingPosition(position.key || position);
    setEditValue(position.label || position);
  };

  const handleSaveEdit = async () => {
    if (!editValue.trim()) {
      alert('Position name cannot be empty');
      return;
    }
    
    const newLabel = editValue.trim();
    
    const updatedPositions = positions.map(p => {
      if (p.key === editingPosition) {
        return { ...p, label: newLabel };
      }
      return p;
    });
    
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
        <p className="text-sm text-gray-600 mt-1">Manage locations, positions, and system settings</p>
      </div>

      {/* Tab Bar */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-full overflow-x-auto">
        {[
          { id: 'venues', label: '🏛️ Venues' },
          { id: 'locations', label: '📍 Locations' },
          { id: 'positions', label: '🎰 Positions' },
          { id: 'general', label: '⚙️ System' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white shadow text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── VENUES TAB ── */}
      {activeTab === 'venues' && (
        <div className="space-y-4">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Venues</h3>
              <p className="text-sm text-gray-500 mt-0.5">Save recurring venues so you can auto-fill event details</p>
            </div>
            <button
              onClick={openAddVenue}
              className="bg-red-900 text-white px-4 py-2 rounded-lg hover:bg-red-800 flex items-center space-x-2 text-sm"
            >
              <Plus size={16} />
              <span>Add Venue</span>
            </button>
          </div>

          {/* Add / Edit Form */}
          {showAddVenue && (
            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-900">
              <h4 className="text-lg font-bold text-gray-900 mb-4">
                {editingVenue ? `Edit: ${editingVenue.name}` : 'New Venue'}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Venue Name *</label>
                  <input
                    type="text"
                    value={venueForm.name}
                    onChange={e => setVenueForm({ ...venueForm, name: e.target.value })}
                    placeholder="e.g. Grand Milwaukee Hotel"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Address</label>
                  <AddressAutocomplete
                    value={venueForm.address}
                    onChange={val => setVenueForm({ ...venueForm, address: val })}
                    placeholder="123 Main St, Milwaukee, WI 53202"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={venueForm.contact_name}
                    onChange={e => setVenueForm({ ...venueForm, contact_name: e.target.value })}
                    placeholder="e.g. Jane Smith"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={venueForm.phone}
                    onChange={e => setVenueForm({ ...venueForm, phone: e.target.value })}
                    placeholder="(414) 555-0100"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={venueForm.email}
                    onChange={e => setVenueForm({ ...venueForm, email: e.target.value })}
                    placeholder="events@venue.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Parking Info</label>
                  <input
                    type="text"
                    value={venueForm.parking}
                    onChange={e => setVenueForm({ ...venueForm, parking: e.target.value })}
                    placeholder="e.g. Free parking in rear lot"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={venueForm.notes}
                    onChange={e => setVenueForm({ ...venueForm, notes: e.target.value })}
                    placeholder="Loading dock location, check-in procedure, AV contacts, etc."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={saveVenue}
                  disabled={savingVenue}
                  className="bg-red-900 text-white px-5 py-2 rounded-lg hover:bg-red-800 disabled:bg-gray-400 flex items-center space-x-2 text-sm"
                >
                  <Save size={15} />
                  <span>{savingVenue ? 'Saving...' : editingVenue ? 'Save Changes' : 'Create Venue'}</span>
                </button>
                <button
                  onClick={() => { setShowAddVenue(false); setEditingVenue(null); resetVenueForm(); }}
                  className="px-5 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Venue Cards */}
          {loadingVenues ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-900"></div>
            </div>
          ) : venues.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <Building2 size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 font-medium">No venues saved yet.</p>
              <p className="text-gray-400 text-sm mt-1">Add your first venue to start auto-filling event details.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {venues.map(venue => (
                <div
                  key={venue.id}
                  className={`bg-white rounded-lg shadow p-5 border-l-4 ${venue.is_active ? 'border-red-900' : 'border-gray-300'}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <Building2 size={16} className={venue.is_active ? 'text-red-900' : 'text-gray-400'} />
                      <h4 className="font-bold text-gray-900">{venue.name}</h4>
                      {!venue.is_active && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactive</span>
                      )}
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => openEditVenue(venue)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Edit"
                      >
                        <Edit size={15} />
                      </button>
                      <button
                        onClick={() => toggleVenueActive(venue)}
                        className={`p-2 rounded transition-colors ${venue.is_active ? 'text-yellow-600 hover:bg-yellow-50' : 'text-green-600 hover:bg-green-50'}`}
                        title={venue.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {venue.is_active ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                      </button>
                      <button
                        onClick={() => deleteVenue(venue)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-sm text-gray-600">
                    {venue.address && (
                      <div className="flex items-start space-x-2">
                        <MapPin size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
                        <span>{venue.address}</span>
                      </div>
                    )}
                    {venue.contact_name && (
                      <div className="flex items-center space-x-2">
                        <User size={13} className="text-gray-400 flex-shrink-0" />
                        <span>{venue.contact_name}</span>
                      </div>
                    )}
                    {venue.phone && (
                      <div className="flex items-center space-x-2">
                        <Phone size={13} className="text-gray-400 flex-shrink-0" />
                        <span>{venue.phone}</span>
                      </div>
                    )}
                    {venue.email && (
                      <div className="flex items-center space-x-2">
                        <Mail size={13} className="text-gray-400 flex-shrink-0" />
                        <span>{venue.email}</span>
                      </div>
                    )}
                    {venue.parking && (
                      <div className="flex items-center space-x-2">
                        <ParkingCircle size={13} className="text-gray-400 flex-shrink-0" />
                        <span>{venue.parking}</span>
                      </div>
                    )}
                    {venue.notes && (
                      <p className="text-gray-400 italic text-xs mt-1 pt-1 border-t border-gray-100">"{venue.notes}"</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── LOCATIONS TAB ── */}
      {activeTab === 'locations' && (
        <div className="space-y-4">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Locations</h3>
              <p className="text-sm text-gray-500 mt-0.5">Manage the markets your business operates in</p>
            </div>
            <button
              onClick={openAddLocation}
              className="bg-red-900 text-white px-4 py-2 rounded-lg hover:bg-red-800 flex items-center space-x-2 text-sm"
            >
              <Plus size={16} />
              <span>Add Location</span>
            </button>
          </div>

          {/* Add / Edit Form */}
          {showAddLocation && (
            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-900">
              <h4 className="text-lg font-bold text-gray-900 mb-4">
                {editingLocation ? `Edit: ${editingLocation.name}` : 'New Location'}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Location Name *</label>
                  <input
                    type="text"
                    value={locationForm.name}
                    onChange={e => setLocationForm({ ...locationForm, name: e.target.value })}
                    placeholder="e.g. Milwaukee, Chicago North"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Timezone</label>
                  <select
                    value={locationForm.timezone}
                    onChange={e => setLocationForm({ ...locationForm, timezone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  >
                    <option value="America/New_York">Eastern (ET)</option>
                    <option value="America/Chicago">Central (CT)</option>
                    <option value="America/Denver">Mountain (MT)</option>
                    <option value="America/Phoenix">Arizona (MST)</option>
                    <option value="America/Los_Angeles">Pacific (PT)</option>
                    <option value="America/Anchorage">Alaska (AKT)</option>
                    <option value="Pacific/Honolulu">Hawaii (HST)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">City</label>
                  <input
                    type="text"
                    value={locationForm.city}
                    onChange={e => setLocationForm({ ...locationForm, city: e.target.value })}
                    placeholder="e.g. Milwaukee"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">State</label>
                  <input
                    type="text"
                    value={locationForm.state}
                    onChange={e => setLocationForm({ ...locationForm, state: e.target.value })}
                    placeholder="e.g. WI"
                    maxLength={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Default Dress Code</label>
                  <input
                    type="text"
                    value={locationForm.rules.default_dress_code}
                    onChange={e => setLocationForm({ ...locationForm, rules: { ...locationForm.rules, default_dress_code: e.target.value } })}
                    placeholder="e.g. Vegas on Wheels attire"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Active</label>
                  <div className="flex items-center space-x-3 mt-2">
                    <button
                      onClick={() => setLocationForm({ ...locationForm, is_active: !locationForm.is_active })}
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${locationForm.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${locationForm.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                    <span className="text-sm text-gray-600">{locationForm.is_active ? 'Active' : 'Inactive'}</span>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={locationForm.rules.notes}
                    onChange={e => setLocationForm({ ...locationForm, rules: { ...locationForm.rules, notes: e.target.value } })}
                    placeholder="Any location-specific notes for admin reference..."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={saveLocation}
                  disabled={savingLocation}
                  className="bg-red-900 text-white px-5 py-2 rounded-lg hover:bg-red-800 disabled:bg-gray-400 flex items-center space-x-2 text-sm"
                >
                  <Save size={15} />
                  <span>{savingLocation ? 'Saving...' : editingLocation ? 'Save Changes' : 'Create Location'}</span>
                </button>
                <button
                  onClick={() => { setShowAddLocation(false); setEditingLocation(null); resetLocationForm(); }}
                  className="px-5 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Location Cards */}
          {loadingLocations ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-900"></div>
            </div>
          ) : locations.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <MapPin size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">No locations yet. Add your first location above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {locations.map(loc => (
                <div
                  key={loc.id}
                  className={`bg-white rounded-lg shadow p-5 border-l-4 ${loc.is_active ? 'border-green-500' : 'border-gray-300'}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center space-x-2">
                        <MapPin size={16} className={loc.is_active ? 'text-green-600' : 'text-gray-400'} />
                        <h4 className="font-bold text-gray-900 text-lg">{loc.name}</h4>
                        {!loc.is_active && (
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactive</span>
                        )}
                      </div>
                      {(loc.city || loc.state) && (
                        <p className="text-sm text-gray-500 mt-0.5 ml-6">
                          {[loc.city, loc.state].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => openEditLocation(loc)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Edit"
                      >
                        <Edit size={15} />
                      </button>
                      <button
                        onClick={() => toggleLocationActive(loc)}
                        className={`p-2 rounded transition-colors ${loc.is_active ? 'text-yellow-600 hover:bg-yellow-50' : 'text-green-600 hover:bg-green-50'}`}
                        title={loc.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {loc.is_active ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                      </button>
                      {loc.name !== 'Main' && (
                        <button
                          onClick={() => deleteLocation(loc)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="ml-6 space-y-1 text-xs text-gray-500">
                    <p>🕐 {loc.timezone}</p>
                    {loc.rules?.default_dress_code && (
                      <p>👔 {loc.rules.default_dress_code}</p>
                    )}
                    {loc.rules?.notes && (
                      <p className="text-gray-400 italic">"{loc.rules.notes}"</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}


      {/* ── SYSTEM TAB ── */}
      {activeTab === 'general' && (
        <div className="space-y-0 bg-white rounded-lg shadow overflow-hidden">

          {/* Header */}
          <div className="px-6 py-5 border-b border-gray-100">
            <h3 className="text-lg font-bold text-gray-900">System Settings</h3>
            <p className="text-sm text-gray-500 mt-0.5">Configure app-wide preferences. Click Save All at the bottom when done.</p>
          </div>

          {/* Team Leader Label */}
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="font-semibold text-gray-900 text-sm">Team Leader Label</p>
                <p className="text-xs text-gray-500 mt-0.5">What do you call your event hosts / team leaders? Appears on worker badges, filters, and reports.</p>
              </div>
              <input
                type="text"
                value={hostLabelValue}
                onChange={e => setHostLabelValue(e.target.value)}
                placeholder="e.g. Host, Pit Boss"
                className="w-48 flex-shrink-0 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                maxLength={30}
              />
            </div>
          </div>

          {/* Warehouse Address */}
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="font-semibold text-gray-900 text-sm">Warehouse / Home Base Address</p>
                <p className="text-xs text-gray-500 mt-0.5">Used for calculating miles traveled to events.</p>
              </div>
              {loadingWarehouse ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-900 flex-shrink-0" />
              ) : (
                <input
                  type="text"
                  value={warehouseAddress}
                  onChange={(e) => setWarehouseAddress(e.target.value)}
                  className="w-72 flex-shrink-0 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                  placeholder="Enter address"
                  disabled={saving}
                />
              )}
            </div>
          </div>

          {/* Payment Tracking */}
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900 text-sm">Payment Tracking</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {paymentTrackingEnabled ? 'Workers can see pay info on their assignments.' : 'Payment info is hidden from workers.'}
                </p>
              </div>
              {loadingPaymentSetting ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-900" />
              ) : (
                <button
                  onClick={() => setPaymentTrackingEnabled(!paymentTrackingEnabled)}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors flex-shrink-0 ${paymentTrackingEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${paymentTrackingEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              )}
            </div>
          </div>

          {/* Time & Date */}
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="font-semibold text-gray-900 text-sm mb-3">Time & Date</p>
            {loadingTimeSettings ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-900" />
            ) : (
              <div className="flex flex-wrap gap-6">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Timezone</label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                    disabled={saving}
                  >
                    <option value="America/New_York">Eastern (ET)</option>
                    <option value="America/Chicago">Central (CT)</option>
                    <option value="America/Denver">Mountain (MT)</option>
                    <option value="America/Phoenix">Arizona (MST)</option>
                    <option value="America/Los_Angeles">Pacific (PT)</option>
                    <option value="America/Anchorage">Alaska (AKT)</option>
                    <option value="Pacific/Honolulu">Hawaii (HST)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-2">Time Format</label>
                  <div className="flex space-x-4">
                    <label className="flex items-center space-x-2 cursor-pointer text-sm">
                      <input type="radio" value="12" checked={timeFormat === '12'} onChange={(e) => setTimeFormat(e.target.value)} disabled={saving} className="w-4 h-4 text-red-900" />
                      <span>12-hour (2:30 PM)</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer text-sm">
                      <input type="radio" value="24" checked={timeFormat === '24'} onChange={(e) => setTimeFormat(e.target.value)} disabled={saving} className="w-4 h-4 text-red-900" />
                      <span>24-hour (14:30)</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Rank-Based Event Access */}
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="font-semibold text-gray-900 text-sm mb-1">Worker Event Access (Rank-Based)</p>
            <p className="text-xs text-gray-500 mb-4">How many days before an event each rank can see and sign up. Rank 1 = most experienced, sees events first.</p>
            {loadingRankAccess ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-900" />
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-5 gap-3">
                  {[1,2,3,4,5].map(rank => {
                    const colors = ['border-red-900 bg-red-50','border-red-700 bg-red-50','border-orange-400 bg-orange-50','border-yellow-400 bg-yellow-50','border-gray-300 bg-gray-50'];
                    const dotColors = ['bg-red-900','bg-red-700','bg-orange-400','bg-yellow-400','bg-gray-400'];
                    return (
                      <div key={rank} className={`rounded-lg border-2 ${colors[rank-1]} p-3 text-center`}>
                        <div className={`${dotColors[rank-1]} rounded-full h-7 w-7 mx-auto flex items-center justify-center text-white text-xs font-bold mb-2`}>{rank}</div>
                        <input
                          type="number"
                          min="0"
                          value={rankAccessDays[rank]}
                          onChange={(e) => setRankAccessDays({ ...rankAccessDays, [rank]: parseInt(e.target.value, 10) || 0 })}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-center text-sm bg-white focus:ring-2 focus:ring-red-500"
                          disabled={saving}
                        />
                        <p className="text-xs text-gray-500 mt-1.5">
                          {rankAccessDays[rank] === 0 ? 'Immediately' : `${rankAccessDays[rank]}d prior`}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400">Set to 0 for immediate access when event is created.</p>
              </div>
            )}
          </div>

          {/* Save All Button */}
          <div className="px-6 py-5 bg-gray-50 flex items-center justify-between">
            <p className="text-xs text-gray-400">Changes won't apply until saved.</p>
            <button
              onClick={async () => {
                setSaving(true);
                try {
                  setHostLabel(hostLabelValue);
                  await saveWarehouseAddress();
                  await saveRankAccessSettings();
                  await saveTimeSettings();
                  const { data: existingPmt } = await supabase.from('settings').select('*').eq('setting_key', 'payment_tracking_enabled').single();
                  if (existingPmt) {
                    await supabase.from('settings').update({ setting_value: paymentTrackingEnabled.toString(), updated_at: new Date().toISOString() }).eq('setting_key', 'payment_tracking_enabled');
                  } else {
                    await supabase.from('settings').insert([{ setting_key: 'payment_tracking_enabled', setting_value: paymentTrackingEnabled.toString() }]);
                  }
                  alert('All settings saved!');
                } catch (err) {
                  alert('Error saving: ' + err.message);
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
              className="bg-red-900 text-white px-8 py-2.5 rounded-lg hover:bg-red-800 disabled:bg-gray-400 font-medium text-sm"
            >
              {saving ? 'Saving...' : '💾 Save All Settings'}
            </button>
          </div>

        </div>
      )}


      {/* ── POSITIONS TAB ── */}
      {activeTab === 'positions' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-2">Position Types</h3>
          <p className="text-sm text-gray-600 mb-4">
            Customize the positions available in your system. These are used for event staffing, worker skills, and assignment matching.
          </p>
          <p className="text-sm text-blue-600 bg-blue-50 p-3 rounded mb-6">
            💡 Adding a new position like "Baccarat Dealer" immediately makes it available as both an event position and a worker skill.
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
                <p className="text-gray-500 text-sm py-4">No positions configured yet.</p>
              ) : (
                positions.map((position, idx) => {
                  const posLabel = position.label || position;
                  const posKey = position.key || position.toLowerCase().replace(/\s+/g, '_');
                  const isEditing = editingPosition === posKey;
                  return (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                      {isEditing ? (
                        <>
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSaveEdit()}
                            className="flex-1 px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-red-500"
                            autoFocus
                          />
                          <div className="flex space-x-2 ml-3">
                            <button onClick={handleSaveEdit} className="text-green-600 hover:text-green-800 p-1 hover:bg-green-50 rounded"><CheckCircle size={20} /></button>
                            <button onClick={handleCancelEdit} className="text-gray-600 hover:text-gray-800 p-1 hover:bg-gray-200 rounded"><XCircle size={20} /></button>
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="font-medium text-gray-900">{posLabel}</span>
                          <div className="flex space-x-2">
                            <button onClick={() => handleEditPosition(position)} className="text-blue-600 hover:text-blue-800 p-1 hover:bg-blue-50 rounded"><Edit size={18} /></button>
                            <button onClick={() => handleDeletePosition(position)} className="text-red-600 hover:text-red-800 p-1 hover:bg-red-50 rounded"><Trash2 size={18} /></button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
