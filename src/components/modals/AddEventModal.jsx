import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { SUCCESS_MESSAGES, ERROR_MESSAGES, STATUS } from '../../constants';
import AddressAutocomplete from '../AddressAutocomplete';

export default function AddEventModal({
  open,
  positions,
  workers = [],
  onClose,
  onSuccess
}) {
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
    status: STATUS.EVENT.CONFIRMED,
    host_worker_id: null,
    location_id: null
  });
  const [saving, setSaving] = useState(false);
  const [locations, setLocations] = useState([]);
  const [venues, setVenues] = useState([]);
  const [showSaveVenuePrompt, setShowSaveVenuePrompt] = useState(false);
  const [saveVenueForm, setSaveVenueForm] = useState({ contact_name: '', phone: '', email: '', parking: '', notes: '' });
  const [savingVenue, setSavingVenue] = useState(false);
  const [venueSaved, setVenueSaved] = useState(false);
  const [showVenueSuggestions, setShowVenueSuggestions] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase
      .from('locations')
      .select('id, name, city, state')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        setLocations(data || []);
        if (data && data.length === 1) {
          setFormData(f => ({ ...f, location_id: data[0].id }));
        }
      });
    supabase
      .from('venues')
      .select('*')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setVenues(data || []));
  }, [open]);

  if (!open) return null;

  const positionOptions = positions;

  const updatePositionCount = (positionKey, count) => {
    setFormData(prev => {
      const existing = prev.positions.find(p => p.key === positionKey);
      if (count === 0 || count === '') {
        return {
          ...prev,
          positions: prev.positions.filter(p => p.key !== positionKey)
        };
      }
      if (existing) {
        return {
          ...prev,
          positions: prev.positions.map(p => 
            p.key === positionKey ? { key: positionKey, count: parseInt(count, 10) } : p
          )
        };
      }
      return {
        ...prev,
        positions: [...prev.positions, { key: positionKey, count: parseInt(count, 10) }]
      };
    });
  };

  const getPositionCount = (positionKey) => {
    const found = formData.positions.find(p => p.key === positionKey);
    return found ? found.count : 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.positions.length === 0) {
      alert('Please specify at least one staff position needed');
      return;
    }
    
    setSaving(true);
    try {
      const { error } = await supabase.from('events').insert([formData]);
      if (error) throw error;

      // Check if venue is already in the library
      const venueName = formData.venue?.trim();
      const alreadySaved = venues.some(v => v.name.toLowerCase() === venueName?.toLowerCase());
      if (venueName && !alreadySaved) {
        setSaveVenueForm({ contact_name: '', phone: '', email: '', parking: formData.parking || '', notes: '' });
        setShowSaveVenuePrompt(true);
        setVenueSaved(false);
        setSaving(false);
        return;
      }

      alert(SUCCESS_MESSAGES.EVENT_SAVED);
      closeAndReset();
    } catch (error) {
      alert(ERROR_MESSAGES.DATA.SAVE_FAILED + ': ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const closeAndReset = () => {
    setFormData({
      name: '', client: '', client_contact: '', date: '', time: '', end_time: '',
      venue: '', room: '', address: '', positions: [], dress_code: '', parking: '',
      notes: '', status: STATUS.EVENT.CONFIRMED, host_worker_id: null, location_id: null
    });
    setShowSaveVenuePrompt(false);
    setSaveVenueForm({ contact_name: '', phone: '', email: '', parking: '', notes: '' });
    setVenueSaved(false);
    if (onSuccess) onSuccess();
    onClose();
  };

  const handleSaveVenueToLibrary = async () => {
    setSavingVenue(true);
    try {
      const { error } = await supabase.from('venues').insert([{
        name: formData.venue.trim(),
        address: formData.address?.trim() || null,
        contact_name: saveVenueForm.contact_name?.trim() || null,
        phone: saveVenueForm.phone?.trim() || null,
        email: saveVenueForm.email?.trim() || null,
        parking: saveVenueForm.parking?.trim() || null,
        notes: saveVenueForm.notes?.trim() || null,
        is_active: true
      }]);
      if (error) throw error;
      setVenueSaved(true);
      setTimeout(() => {
        alert(SUCCESS_MESSAGES.EVENT_SAVED);
        closeAndReset();
      }, 800);
    } catch (err) {
      alert('Venue save failed: ' + err.message);
    } finally {
      setSavingVenue(false);
    }
  };

  const handleClose = () => closeAndReset();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto">
      <div className="min-h-screen flex items-center justify-center p-4 py-8">
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full">
          <div className="p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-gray-900">Create New Event</h3>
              <button 
                onClick={handleClose} 
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            {/* ── Save Venue Prompt ── */}
            {showSaveVenuePrompt && (
              <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-5">
                <div className="mb-3">
                  <p className="font-semibold text-blue-900 text-base">
                    💾 Save "{formData.venue}" to your venue library?
                  </p>
                  <p className="text-sm text-blue-700 mt-0.5">
                    Address already captured. Add contact details to save time next time.
                  </p>
                </div>
                {!venueSaved ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                      <input type="text" placeholder="Contact person name"
                        value={saveVenueForm.contact_name}
                        onChange={e => setSaveVenueForm(f => ({ ...f, contact_name: e.target.value }))}
                        className="px-3 py-2 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-white"
                      />
                      <input type="text" placeholder="Phone"
                        value={saveVenueForm.phone}
                        onChange={e => setSaveVenueForm(f => ({ ...f, phone: e.target.value }))}
                        className="px-3 py-2 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-white"
                      />
                      <input type="email" placeholder="Email"
                        value={saveVenueForm.email}
                        onChange={e => setSaveVenueForm(f => ({ ...f, email: e.target.value }))}
                        className="px-3 py-2 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-white"
                      />
                      <input type="text" placeholder="Parking info"
                        value={saveVenueForm.parking}
                        onChange={e => setSaveVenueForm(f => ({ ...f, parking: e.target.value }))}
                        className="px-3 py-2 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-white"
                      />
                      <input type="text" placeholder="Notes (optional)"
                        value={saveVenueForm.notes}
                        onChange={e => setSaveVenueForm(f => ({ ...f, notes: e.target.value }))}
                        className="md:col-span-2 px-3 py-2 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-white"
                      />
                    </div>
                    <div className="flex space-x-3">
                      <button onClick={handleSaveVenueToLibrary} disabled={savingVenue}
                        className="bg-blue-700 hover:bg-blue-800 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                      >
                        {savingVenue ? 'Saving...' : 'Save to Library'}
                      </button>
                      <button onClick={() => { alert(SUCCESS_MESSAGES.EVENT_SAVED); closeAndReset(); }}
                        className="px-5 py-2 bg-white border border-blue-300 text-blue-700 rounded-lg text-sm hover:bg-blue-50"
                      >
                        Skip, don't save
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center space-x-2 text-green-700 font-medium">
                    <span>✓ Venue saved to library!</span>
                  </div>
                )}
              </div>
            )}

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

                  {/* Market / Region */}
                  {locations.length > 1 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Market / Region</label>
                      <select
                        value={formData.location_id || ''}
                        onChange={(e) => setFormData({...formData, location_id: e.target.value || null})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      >
                        <option value="">-- Select a market --</option>
                        {locations.map(loc => (
                          <option key={loc.id} value={loc.id}>
                            {loc.name}{loc.city ? ` — ${loc.city}` : ''}{loc.state ? `, ${loc.state}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Saved Venue Picker — inline typeahead on Venue Name field */}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="relative">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Venue Name *</label>
                      <input
                        type="text"
                        required
                        value={formData.venue}
                        onChange={(e) => {
                          setFormData({...formData, venue: e.target.value});
                          setShowVenueSuggestions(true);
                        }}
                        onFocus={() => setShowVenueSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowVenueSuggestions(false), 150)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        placeholder="Grand Hotel"
                        autoComplete="off"
                      />
                      {showVenueSuggestions && venues.length > 0 && (() => {
                        const q = formData.venue.toLowerCase();
                        const matches = venues.filter(v => v.name.toLowerCase().includes(q));
                        if (matches.length === 0) return null;
                        return (
                          <div className="absolute z-50 top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                            {matches.map(v => (
                              <button
                                key={v.id}
                                type="button"
                                onMouseDown={() => {
                                  setFormData(f => ({
                                    ...f,
                                    venue: v.name,
                                    address: v.address || f.address,
                                    parking: v.parking || f.parking,
                                  }));
                                  setShowVenueSuggestions(false);
                                }}
                                className="w-full text-left px-4 py-2.5 hover:bg-red-50 border-b border-gray-100 last:border-0"
                              >
                                <div className="font-medium text-gray-900 text-sm">{v.name}</div>
                                {v.address && <div className="text-xs text-gray-500 mt-0.5">{v.address}</div>}
                              </button>
                            ))}
                          </div>
                        );
                      })()}
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
                    <AddressAutocomplete
                      value={formData.address}
                      onChange={(val) => setFormData({...formData, address: val})}
                      placeholder="123 Main St, City, State 12345"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Staffing Requirements */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-3">Staffing Requirements *</h4>
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">Specify how many staff needed for each position:</p>
                  {positionOptions.map(position => {
                    const posKey = position.key || position;
                    const posLabel = position.label || position;
                    return (
                      <div key={posKey} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <label className="text-sm font-medium text-gray-700">{posLabel}</label>
                        <input
                          type="number"
                          min="0"
                          value={getPositionCount(posKey)}
                          onChange={(e) => updatePositionCount(posKey, e.target.value)}
                          className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                          placeholder="0"
                        />
                      </div>
                    );
                  })}
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
                  disabled={saving}
                  className="flex-1 bg-red-900 text-white px-6 py-3 rounded-lg hover:bg-red-800 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {saving ? 'Creating Event...' : 'Create Event'}
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={saving}
                  className="flex-1 bg-gray-200 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-300 font-medium disabled:opacity-50"
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
}
