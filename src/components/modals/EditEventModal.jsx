import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { getPositionKey } from '../../utils/positionHelpers';
import { SUCCESS_MESSAGES, ERROR_MESSAGES, STATUS } from '../../constants';
import AddressAutocomplete from '../AddressAutocomplete';

export default function EditEventModal({
  open,
  event,
  positions,
  workers = [],
  warehouses = [],
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
    location_id: null,
    invite_only: false
  });
  const [saving, setSaving] = useState(false);
  const [locations, setLocations] = useState([]);
  const [venues, setVenues] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientSuggestions, setClientSuggestions] = useState([]);
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);
  const [showSaveVenuePrompt, setShowSaveVenuePrompt] = useState(false);
  const [saveVenueForm, setSaveVenueForm] = useState({ contact_name: '', phone: '', email: '', parking: '', notes: '' });
  const [savingVenue, setSavingVenue] = useState(false);
  const [venueSaved, setVenueSaved] = useState(false);
  const [showVenueSuggestions, setShowVenueSuggestions] = useState(false);

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
    supabase
      .from('clients')
      .select('id, name, company, phone, email')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setClients(data || []));
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
        location_id: event.location_id || null,
        client_id: event.client_id || null,
        invite_only: event.invite_only || false
      });
    }
  }, [event]);

  const handleClientInput = (val) => {
    setFormData(f => ({ ...f, client: val, client_id: null }));
    if (val.length >= 1) {
      const matches = clients.filter(c =>
        c.name.toLowerCase().includes(val.toLowerCase()) ||
        c.company?.toLowerCase().includes(val.toLowerCase())
      );
      setClientSuggestions(matches);
      setShowClientSuggestions(matches.length > 0);
    } else {
      setShowClientSuggestions(false);
    }
  };

  const selectClient = (client) => {
    setFormData(f => ({
      ...f,
      client: client.name,
      client_id: client.id,
      client_contact: client.phone || client.email || f.client_contact
    }));
    setShowClientSuggestions(false);
  };

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


  // Auto-assign nearest warehouse by distance
  const assignNearestWarehouse = async (address) => {
    if (!address || warehouses.length === 0) return null;
    if (warehouses.length === 1) return warehouses[0].id;
    try {
      const results = await Promise.all(
        warehouses.map(wh =>
          fetch(`/api/get-distance?origin=${encodeURIComponent(wh.address)}&destination=${encodeURIComponent(address)}`)
            .then(r => r.json())
            .then(d => ({ id: wh.id, miles: d.miles ?? Infinity }))
            .catch(() => ({ id: wh.id, miles: Infinity }))
        )
      );
      results.sort((a, b) => a.miles - b.miles);
      return results[0].id;
    } catch {
      return warehouses.find(w => w.is_primary)?.id || warehouses[0]?.id || null;
    }
  };


  const sendEventUpdatedEmails = async (oldEvent, newData) => {
    const changed = [];
    if (oldEvent.date !== newData.date) changed.push('Date');
    if (oldEvent.time !== newData.time || oldEvent.end_time !== newData.end_time) changed.push('Time');
    if (oldEvent.venue !== newData.venue) changed.push('Venue');
    if (oldEvent.address !== newData.address) changed.push('Address');
    if (!changed.length) return;
    try {
      const { data: asgData } = await supabase.from('assignments').select('worker_id, position').eq('event_id', oldEvent.id).in('status', ['approved', 'assigned']);
      if (!asgData?.length) return;
      const workerMap = Object.fromEntries((workers || []).map(w => [String(w.id), w]));
      const fmtTime = (t) => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM'); };
      const fmtDate = (d) => { if (!d) return ''; const [y, mo, day] = d.split('-').map(Number); return new Date(y, mo - 1, day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); };
      const posLabel = (key) => (key || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const timeStr = newData.time ? (newData.end_time ? fmtTime(newData.time) + ' - ' + fmtTime(newData.end_time) : fmtTime(newData.time)) : '';
      const changedLabel = changed.join(', ');
      for (const asg of asgData) {
        const worker = workerMap[String(asg.worker_id)];
        if (!worker?.email) continue;
        const rows = [['Date', fmtDate(newData.date)], timeStr ? ['Time', timeStr] : null, ['Position', posLabel(asg.position)], newData.venue ? ['Venue', newData.venue] : null, newData.address ? ['Address', newData.address] : null].filter(Boolean).map(([label, val]) => '<tr><td style="padding:5px 12px 5px 0;color:#6b7280;font-size:13px">' + label + '</td><td style="padding:5px 0;color:#111;font-size:13px">' + val + '</td></tr>').join('');
        const html = '<!DOCTYPE html><html><body style="background:#f3f4f6;font-family:Arial,sans-serif"><div style="max-width:520px;margin:24px auto"><div style="background:#7c0a02;padding:20px;border-radius:8px 8px 0 0;text-align:center"><div style="font-size:20px;font-weight:bold;color:#fff">Vegas on Wheels</div><div style="font-size:12px;color:#fca5a5">Event Update - ' + changedLabel + ' Changed</div></div><div style="background:#fff;padding:20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px"><p style="color:#111">Hi ' + worker.name + ',</p><p style="color:#374151;font-size:14px">The details for <strong>' + (newData.name || oldEvent.name) + '</strong> have been updated.</p><div style="background:#fffbeb;border:1px solid #f59e0b;border-radius:6px;padding:10px;margin-bottom:16px;font-weight:600;color:#92400e">What changed: ' + changedLabel + '</div><table style="border-collapse:collapse;width:100%;background:#f9fafb;border-radius:8px;padding:14px">' + rows + '</table><div style="text-align:center;margin-top:20px"><a href="https://gigstaffpro.vercel.app" style="background:#7c0a02;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold">View in Staff Portal</a></div></div></div></body></html>';
        await fetch('/api/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: worker.email, subject: 'Update: ' + (newData.name || oldEvent.name) + ' - ' + changedLabel + ' changed', html }) });
      }
    } catch (err) { console.error('Failed to send update emails:', err); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.positions.length === 0) {
      alert('Please specify at least one staff position needed');
      return;
    }
    
    setSaving(true);
    try {
      const warehouseId = await assignNearestWarehouse(formData.address);
      const saveData = { ...formData, warehouse_id: warehouseId };
      const { error } = await supabase
        .from('events')
        .update(saveData)
        .eq('id', event.id);
      
      if (error) throw error;

      await sendEventUpdatedEmails(event, formData);

      // Check if venue is already in the library
      const venueName = formData.venue?.trim();
      const alreadySaved = venues.some(v => v.name.toLowerCase() === venueName?.toLowerCase());
      if (venueName && !alreadySaved) {
        // Pre-fill parking if available
        setSaveVenueForm({ contact_name: '', phone: '', email: '', parking: formData.parking || '', notes: '' });
        setShowSaveVenuePrompt(true);
        setVenueSaved(false);
        setSaving(false);
        return; // Don't close yet — let user respond to prompt
      }

      alert(SUCCESS_MESSAGES.EVENT_SAVED);
      closeAndReset();
    } catch (error) {
      alert(ERROR_MESSAGES.DATA.UPDATE_FAILED + ': ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const closeAndReset = () => {
    setFormData({
      name: '', client: '', client_contact: '', date: '', time: '', end_time: '',
      venue: '', room: '', address: '', positions: [], dress_code: '', parking: '',
      notes: '', status: STATUS.EVENT.CONFIRMED
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
              <h3 className="text-2xl font-bold text-gray-900">Edit Event</h3>
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
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-blue-900 text-base">
                      💾 Save "{formData.venue}" to your venue library?
                    </p>
                    <p className="text-sm text-blue-700 mt-0.5">
                      Address already captured. Add contact details to save time next time.
                    </p>
                  </div>
                </div>
                {!venueSaved ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                      <input
                        type="text"
                        placeholder="Contact person name"
                        value={saveVenueForm.contact_name}
                        onChange={e => setSaveVenueForm(f => ({ ...f, contact_name: e.target.value }))}
                        className="px-3 py-2 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-white"
                      />
                      <input
                        type="text"
                        placeholder="Phone"
                        value={saveVenueForm.phone}
                        onChange={e => setSaveVenueForm(f => ({ ...f, phone: e.target.value }))}
                        className="px-3 py-2 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-white"
                      />
                      <input
                        type="email"
                        placeholder="Email"
                        value={saveVenueForm.email}
                        onChange={e => setSaveVenueForm(f => ({ ...f, email: e.target.value }))}
                        className="px-3 py-2 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-white"
                      />
                      <input
                        type="text"
                        placeholder="Parking info"
                        value={saveVenueForm.parking}
                        onChange={e => setSaveVenueForm(f => ({ ...f, parking: e.target.value }))}
                        className="px-3 py-2 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-white"
                      />
                      <input
                        type="text"
                        placeholder="Notes (optional)"
                        value={saveVenueForm.notes}
                        onChange={e => setSaveVenueForm(f => ({ ...f, notes: e.target.value }))}
                        className="md:col-span-2 px-3 py-2 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-white"
                      />
                    </div>
                    <div className="flex space-x-3">
                      <button
                        onClick={handleSaveVenueToLibrary}
                        disabled={savingVenue}
                        className="bg-blue-700 hover:bg-blue-800 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                      >
                        {savingVenue ? 'Saving...' : 'Save to Library'}
                      </button>
                      <button
                        onClick={() => { alert(SUCCESS_MESSAGES.EVENT_SAVED); closeAndReset(); }}
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
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Event Date *</label>
                    <div style={{position:'relative'}}>
                      <Calendar size={16} style={{position:'absolute',left:'10px',top:'50%',transform:'translateY(-50%)',color:'#9ca3af',pointerEvents:'none',zIndex:1}} />
                      <input
                        type="date"
                        required
                        value={formData.date}
                        onChange={(e) => setFormData({...formData, date: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        style={{WebkitAppearance:'none',color:formData.date?'#111827':'#9ca3af',backgroundColor:'white',padding:'8px 12px 8px 32px',minHeight:'44px',fontSize:'16px'}}
                        placeholder="Select date"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Start Time *</label>
                      <div style={{position:'relative'}}>
                        <Clock size={14} style={{position:'absolute',left:'10px',top:'50%',transform:'translateY(-50%)',color:'#9ca3af',pointerEvents:'none',zIndex:1}} />
                        <input
                          type="time"
                          required
                          value={formData.time}
                          onChange={(e) => setFormData({...formData, time: e.target.value})}
                          className="w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                          style={{WebkitAppearance:'none',color:formData.time?'#111827':'#9ca3af',backgroundColor:'white',padding:'8px 12px 8px 30px',minHeight:'44px',fontSize:'16px'}}
                          placeholder="Select time"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                      <div style={{position:'relative'}}>
                        <Clock size={14} style={{position:'absolute',left:'10px',top:'50%',transform:'translateY(-50%)',color:'#9ca3af',pointerEvents:'none',zIndex:1}} />
                        <input
                          type="time"
                          value={formData.end_time}
                          onChange={(e) => setFormData({...formData, end_time: e.target.value})}
                          className="w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                          style={{WebkitAppearance:'none',color:formData.end_time?'#111827':'#9ca3af',backgroundColor:'white',padding:'8px 12px 8px 30px',minHeight:'44px',fontSize:'16px'}}
                          placeholder="Select time"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Client Information */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-3">Client Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Client Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.client}
                      onChange={(e) => handleClientInput(e.target.value)}
                      onFocus={() => formData.client.length >= 1 && setShowClientSuggestions(clientSuggestions.length > 0)}
                      onBlur={() => setTimeout(() => setShowClientSuggestions(false), 150)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      placeholder="Type to search saved clients..."
                      autoComplete="off"
                    />
                    {formData.client_id && (
                      <span className="absolute right-3 top-9 text-xs text-green-600 font-medium">✓ Linked</span>
                    )}
                    {showClientSuggestions && (
                      <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                        {clientSuggestions.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={() => selectClient(c)}
                            className="w-full text-left px-3 py-2.5 hover:bg-red-50 border-b border-gray-100 last:border-0"
                          >
                            <p className="text-sm font-medium text-gray-900">{c.name}</p>
                            <p className="text-xs text-gray-500">{[c.company, c.phone || c.email].filter(Boolean).join(' · ')}</p>
                          </button>
                        ))}
                      </div>
                    )}
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
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Address</label>
                    <AddressAutocomplete
                      value={formData.address}
                      onChange={(val) => setFormData({...formData, address: val})}
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

              {/* Invite Only Toggle */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div>
                  <p className="text-sm font-medium text-gray-800">Invite Only</p>
                  <p className="text-xs text-gray-500">Workers can only join if directly assigned by admin</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData({...formData, invite_only: !formData.invite_only})}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.invite_only ? 'bg-red-900' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.invite_only ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
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
