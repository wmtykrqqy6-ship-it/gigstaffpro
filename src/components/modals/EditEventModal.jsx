import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { getPositionKey } from '../../utils/positionHelpers';
import { SUCCESS_MESSAGES, ERROR_MESSAGES, STATUS } from '../../constants';

export default function EditEventModal({
  open,
  event,
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

  // Load active locations
  useEffect(() => {
    supabase
      .from('locations')
      .select('id, name, city, state')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setLocations(data || []));
    supabase
      .from('venues')
      .select('*')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setVenues(data || []));
  }, []);

  // Populate form when event changes
  useEffect(() => {
    if (event) {
      // Extract just the date part (YYYY-MM-DD) for the date input
      const dateOnly = event.date ? event.date.split('T')[0] : '';
      
      // Migrate old position format to new if needed
      const migratedPositions = (event.positions || []).map(pos => {
        if (typeof pos === 'object' && pos.key) {
          // Already new format with key
          return pos;
        } else if (typeof pos === 'object' && pos.name) {
          // Old format with {name, count} - convert to {key, count}
          return {
            key: getPositionKey(pos.name),
            count: pos.count
          };
        } else if (typeof pos === 'string') {
          // Very old format (just string) - convert to {key, count}
          return {
            key: getPositionKey(pos),
            count: 1
          };
        }
        return pos;
      });
      
      setFormData({
        name: event.name || '',
        client: event.client || '',
        client_contact: event.client_contact || '',
        date: dateOnly,
        time: event.time || '',
        end_time: event.end_time || '',
        venue: event.venue || '',
        room: event.room || '',
        address: event.address || '',
        positions: migratedPositions,
        dress_code: event.dress_code || '',
        parking: event.parking || '',
        notes: event.notes || '',
        status: event.status || STATUS.EVENT.CONFIRMED,
        host_worker_id: event.host_worker_id || null,
        location_id: event.location_id || null
      });
    }
  }, [event]);

  if (!open || !event) return null;

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
      const { error } = await supabase
        .from('events')
        .update(formData)
        .eq('id', event.id);
      
      if (error) throw error;
      
      alert(SUCCESS_MESSAGES.EVENT_SAVED);
      
      // Reset form
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
        status: STATUS.EVENT.CONFIRMED
      });
      
      // Call success callback (to refresh event list)
      if (onSuccess) {
        await onSuccess();
      }
      
      // Close modal
      onClose();
    } catch (error) {
      alert(ERROR_MESSAGES.DATA.UPDATE_FAILED + ': ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
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
      status: STATUS.EVENT.CONFIRMED
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto">
      <div className="min-h-screen flex items-center justify-center p-4 py-8">
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full">
          <div className="p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-gray-900">Edit Event</h3>
              <button 
                onClick={handleClose} 
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

                  {/* Saved Venue Picker */}
                  {venues.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Saved Venue</label>
                      <select
                        value=""
                        onChange={(e) => {
                          const selected = venues.find(v => v.id === e.target.value);
                          if (selected) {
                            setFormData(f => ({
                              ...f,
                              venue: selected.name,
                              address: selected.address || f.address,
                              parking: selected.parking || f.parking,
                            }));
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent bg-blue-50 border-blue-300"
                      >
                        <option value="">⚡ Auto-fill from saved venue...</option>
                        {venues.map(v => (
                          <option key={v.id} value={v.id}>{v.name}{v.address ? ` — ${v.address}` : ''}</option>
                        ))}
                      </select>
                      <p className="text-xs text-blue-600 mt-1">Selecting a venue fills in the fields below. You can still edit them.</p>
                    </div>
                  )}

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
                  disabled={saving}
                  className="flex-1 bg-red-900 text-white px-6 py-3 rounded-lg hover:bg-red-800 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {saving ? 'Updating Event...' : 'Update Event'}
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
