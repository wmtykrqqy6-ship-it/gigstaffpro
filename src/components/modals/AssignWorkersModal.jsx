import React, { useState, useEffect } from 'react';
import { X, Search, CheckCircle, Trash2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { getPositionKey, getPositionLabel, positionMatches } from '../../utils/positionHelpers';
import { getHostLabel, getHostLabelPlural } from '../../utils/hostLabelHelper';

const isLakeGenevaZip = (address) => {
  if (!address) return false;
  return /\b53147\b/.test(address);
};

export default function AssignWorkersModal({
  open,
  event,
  workers,
  events,
  assignments,
  positions,
  eventPaymentSettings,
  warehouseAddress,
  onClose,
  onAssign,
  onUnassign,
  onSavePaymentSettings,
  onReloadAssignments
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(false);
  const [showEventPaymentSettings, setShowEventPaymentSettings] = useState(false);
  const [eventHours, setEventHours] = useState(0);
  const [eventMiles, setEventMiles] = useState(0);
  const [eventIsLakeGeneva, setEventIsLakeGeneva] = useState(false);
  const [eventIsHoliday, setEventIsHoliday] = useState(false);
  const [milesAutoFilled, setMilesAutoFilled] = useState(false);
  const [milesLoading, setMilesLoading] = useState(false);
  const [expandedPositions, setExpandedPositions] = useState({});
  const [selectedHostId, setSelectedHostId] = useState(event?.host_worker_id || '');
  const [savingHost, setSavingHost] = useState(false);

  const assignedWorkerIds = new Set(
    (assignments || [])
      .filter(a => a.event_id === event?.id && !['rejected','cancelled','standby'].includes(a.status))
      .map(a => a.worker_id)
  );
  const hostWorkers = (workers || []).filter(w => w.is_host && assignedWorkerIds.has(w.id));

  const handleSaveHost = async (newHostId) => {
    setSavingHost(true);
    try {
      await supabase
        .from('events')
        .update({ host_worker_id: newHostId || null })
        .eq('id', event.id);
      setSelectedHostId(newHostId);
    } catch (error) {
      alert('Error saving host: ' + error.message);
    } finally {
      setSavingHost(false);
    }
  };
  
  const togglePosition = (position) => {
    setExpandedPositions(prev => ({
      ...prev,
      [position]: !prev[position]
    }));
  };

  // Initialize event payment settings (hours, Lake Geneva, saved settings)
  // Does NOT handle miles — that's handled separately below
  useEffect(() => {
    if (!event) return;
    setSelectedHostId(event.host_worker_id || '');

    if (!eventPaymentSettings[event.id]) {
      // Calculate default hours
      let defaultHours = 4;
      if (event.time && event.end_time) {
        const parseTime = (timeStr) => {
          const [hours, minutes] = timeStr.split(':').map(Number);
          return hours + minutes / 60;
        };
        const startHours = parseTime(event.time);
        const endHours = parseTime(event.end_time);
        defaultHours = endHours - startHours;
        if (defaultHours < 0) defaultHours += 24;
      }
      setEventHours(defaultHours);
      setEventMiles(0);
      setMilesAutoFilled(false);
      setEventIsLakeGeneva(isLakeGenevaZip(event.address));
      setEventIsHoliday(false);
    } else {
      // Load saved settings
      const settings = eventPaymentSettings[event.id];
      setEventHours(settings.hours);
      setEventMiles(settings.miles);
      setEventIsLakeGeneva(settings.isLakeGeneva);
      setEventIsHoliday(settings.isHoliday);
      setMilesAutoFilled(false);
      setMilesLoading(false);
    }
  }, [event, eventPaymentSettings]);

  // Separate effect: auto-fetch miles when warehouse becomes available
  // Runs whenever warehouseAddress arrives (may be delayed by async load)
  useEffect(() => {
    if (!event?.address || !warehouseAddress) return;
    if (eventPaymentSettings[event.id]) return; // already saved — don't overwrite
    if (milesAutoFilled) return; // already fetched this session

    setMilesLoading(true);
    fetch(`/api/get-distance?origin=${encodeURIComponent(warehouseAddress)}&destination=${encodeURIComponent(event.address)}`)
      .then(res => res.json())
      .then(data => {
        if (data.miles != null) {
          setEventMiles(data.miles);
          setMilesAutoFilled(true);
        }
      })
      .catch(() => {})
      .finally(() => setMilesLoading(false));
  }, [warehouseAddress, event]);

  // Early return AFTER all hooks
  if (!open || !event) return null;

  const saveEventPaymentSettings = () => {
    if (eventHours <= 0) {
      alert('Hours must be greater than 0');
      return;
    }
    
    onSavePaymentSettings(event.id, {
      hours: eventHours,
      miles: eventMiles,
      isLakeGeneva: eventIsLakeGeneva,
      isHoliday: eventIsHoliday
    });
    
    setShowEventPaymentSettings(false);
    alert('Payment settings saved! All new assignments will use these settings.');
  };

  const eventAssignments = assignments.filter(a => a.event_id === event.id);
  
  const getPositionAssignments = (position) => {
    // Count approved/assigned (legacy) assignments only - exclude standby, pending, rejected, cancelled
    const filtered = eventAssignments.filter(a => 
      a.position === position && 
      (a.status === 'approved' || a.status === 'assigned' || a.status === null || a.status === undefined)
    );
    return filtered;
  };

  const getPositionCount = (positionKey) => {
    // Find position by key OR by name (for backward compatibility)
    const pos = event.positions?.find(p => {
      const pKey = p.key || p.name || p;
      return pKey === positionKey || p.name === positionKey;
    });
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
        a.event_id !== event.id
      );
      
      if (workerOtherAssignments.length > 0) {
        const conflicts = workerOtherAssignments.filter(assignment => {
          const otherEvent = events.find(e => e.id === assignment.event_id);
          if (!otherEvent) return false;
          if (otherEvent.date !== event.date) return false;
          
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
            `This overlaps with "${event.name}" (${event.time}${event.end_time ? ` - ${event.end_time}` : ''})`
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
      if (event.time && event.end_time) {
        const parseTime = (timeStr) => {
          const [hours, minutes] = timeStr.split(':').map(Number);
          return hours + minutes / 60;
        };
        const startHours = parseTime(event.time);
        const endHours = parseTime(event.end_time);
        defaultHours = endHours - startHours;
        if (defaultHours < 0) defaultHours += 24; // Handle overnight events
      }

      // Call parent's assign handler
      onAssign(workerId, position, existingAssignment, defaultHours);

    } catch (error) {
      alert('Error in assignment process: ' + error.message);
    }
  };

  const unassignWorker = async (assignmentId) => {
    if (!confirm('Remove this worker assignment?')) return;
    onUnassign(assignmentId);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto">
      <div className="min-h-screen flex items-center justify-center p-4 py-8">
        <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full">
          <div className="p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">Assign Workers</h3>
                <p className="text-sm text-gray-600 mt-1">{event.name}</p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>

            {/* Event Host */}
            <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="text-sm font-semibold text-gray-700 mb-2">{getHostLabel()} / Team Leader</p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <select
                  value={selectedHostId}
                  onChange={(e) => handleSaveHost(e.target.value)}
                  disabled={savingHost}
                  className="w-full sm:w-auto flex-1 text-sm px-3 py-2 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 bg-white disabled:opacity-50"
                >
                  <option value="">-- No host assigned --</option>
                  {hostWorkers.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
                {selectedHostId && (
                  <span className="text-xs text-orange-700 font-medium">
                    ✓ {savingHost ? 'Saving...' : 'Saved'}
                  </span>
                )}
              </div>
              {hostWorkers.length === 0 && (
                <p className="text-xs text-orange-600 mt-2">No {getHostLabelPlural()} assigned to this event yet. Assign a worker marked as {getHostLabel()} first.</p>
              )}
            </div>

            {/* Event Payment Settings */}
            <div className="mb-6 p-4 bg-green-50 border-2 border-green-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-gray-900">Event Payment Settings</h4>
                <button
                  onClick={() => setShowEventPaymentSettings(!showEventPaymentSettings)}
                  className="text-sm text-green-700 hover:text-green-900 font-medium"
                >
                  {showEventPaymentSettings ? 'Hide' : eventPaymentSettings[event.id] ? 'Edit Settings' : 'Set Payment Details'}
                </button>
              </div>
              
              {eventPaymentSettings[event.id] && !showEventPaymentSettings && (
                <div className="text-sm text-gray-700">
                  <p>✓ Payment configured: {eventPaymentSettings[event.id].hours} hrs, {eventPaymentSettings[event.id].miles} miles
                    {eventPaymentSettings[event.id].isLakeGeneva && ', Lake Geneva'}
                    {eventPaymentSettings[event.id].isHoliday && ', Holiday'}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">New assignments will automatically use these settings</p>
                </div>
              )}

              {!eventPaymentSettings[event.id] && !showEventPaymentSettings && (
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Miles *{' '}
                        {milesLoading && <span className="text-xs text-gray-400 font-normal">⟳ Calculating...</span>}
                        {!milesLoading && milesAutoFilled && <span className="text-xs text-green-600 font-normal">✓ Auto-filled</span>}
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={eventMiles}
                        onChange={(e) => { setEventMiles(parseInt(e.target.value, 10) || 0); setMilesAutoFilled(false); }}
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
                      <span className="text-sm font-medium text-gray-700">
                        Lake Geneva (+$15){' '}
                        {eventIsLakeGeneva && isLakeGenevaZip(event?.address) && (
                          <span className="text-xs text-green-600 font-normal">✓ Auto-detected (zip 53147)</span>
                        )}
                      </span>
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
              {event.positions?.map((pos, idx) => {
                // Use a consistent key for this position
                const positionKey = pos.key || pos.name || pos;
                
                const posAssignments = getPositionAssignments(positionKey);
                const filled = posAssignments.length;
                const needed = pos.count;
                const isFull = filled >= needed;
                const isExpanded = expandedPositions[positionKey];

                // Get and sort qualified workers
                const qualifiedWorkers = workers
                  .filter(worker => {
                    if (searchTerm && !worker.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
                    if (showOnlyAvailable && eventAssignments.some(a => a.worker_id === worker.id)) return false;
                    
                    // Use position key matching
                    const workerSkillKeys = Array.isArray(worker.skills) ? worker.skills : [];
                    const posKey = pos.key || getPositionKey(pos.name || pos);
                    
                    // Check if any worker skill matches this position
                    return workerSkillKeys.some(skillKey => positionMatches(skillKey, posKey));
                  })
                  .sort((a, b) => {
                    // Sort by rank first (lower is better)
                    if (a.rank !== b.rank) return a.rank - b.rank;
                    // Then by reliability (higher is better)
                    return b.reliability - a.reliability;
                  });

                return (
                  <div key={idx} className="border rounded-lg overflow-hidden">
                    {/* Collapsible Header */}
                    <div 
                      onClick={() => togglePosition(positionKey)}
                      className="flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <button className="text-gray-600">
                          {isExpanded ? '▼' : '▶'}
                        </button>
                        <h4 className="text-lg font-semibold text-gray-900">{getPositionLabel(pos.key || pos.name)}</h4>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                          isFull ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {filled} / {needed} filled
                        </span>
                        {!isFull && (
                          <span className="text-xs text-gray-500">
                            {qualifiedWorkers.length} available
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expandable Content */}
                    {isExpanded && (
                      <div className="p-4">
                        {/* Assigned Workers */}
                        {posAssignments.length > 0 && (
                          <div className="mb-4">
                            <p className="text-sm font-medium text-gray-700 mb-2">Assigned:</p>
                            <div className="space-y-2">
                              {posAssignments
                                .filter(assignment => assignment.status !== 'standby') // Only non-standby
                                .map(assignment => {
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

                        {/* Standby List */}
                        {(() => {
                          const standbyAssignments = eventAssignments
                            .filter(a => a.position === positionKey && a.status === 'standby')
                            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); // Oldest first
                          
                          if (standbyAssignments.length === 0) return null;
                          
                          return (
                            <div className="mb-4">
                              <p className="text-sm font-medium text-gray-700 mb-2">
                                Standby List ({standbyAssignments.length}):
                              </p>
                              <div className="space-y-2">
                                {standbyAssignments.map((assignment, index) => {
                                  const worker = workers.find(w => w.id === assignment.worker_id);
                                  if (!worker) return null;
                                  
                                  return (
                                    <div key={assignment.id} className="flex items-center justify-between bg-orange-50 border border-orange-200 p-3 rounded">
                                      <div className="flex items-center space-x-3">
                                        <div className="bg-orange-200 text-orange-800 font-bold text-sm w-7 h-7 rounded-full flex items-center justify-center">
                                          {index + 1}
                                        </div>
                                        <div>
                                          <p className="font-medium text-gray-900">{worker.name}</p>
                                          <p className="text-xs text-gray-600">{worker.phone}</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center space-x-2">
                                        <button
                                          onClick={async () => {
                                            // Check for time conflicts before promoting
                                            const workerOtherAssignments = assignments.filter(a => 
                                              a.worker_id === worker.id && 
                                              a.event_id !== event.id &&
                                              (a.status === 'approved' || !a.status) // Only approved
                                            );
                                            
                                            let hasConflict = false;
                                            let conflictEvent = null;
                                            
                                            if (workerOtherAssignments.length > 0) {
                                              for (const otherAssignment of workerOtherAssignments) {
                                                const otherEv = events.find(e => e.id === otherAssignment.event_id);
                                                if (!otherEv || otherEv.date !== event.date) continue;
                                                
                                                const parseTime = (timeStr) => {
                                                  if (!timeStr) return null;
                                                  const [hours, minutes] = timeStr.split(':').map(Number);
                                                  return hours * 60 + minutes;
                                                };
                                                
                                                const thisStart = parseTime(event.time);
                                                const thisEnd = parseTime(event.end_time);
                                                const otherStart = parseTime(otherEv.time);
                                                const otherEnd = parseTime(otherEv.end_time);
                                                
                                                if (thisEnd && otherEnd) {
                                                  const hasOverlap = (thisStart < otherEnd) && (thisEnd > otherStart);
                                                  if (hasOverlap) {
                                                    hasConflict = true;
                                                    conflictEvent = otherEv;
                                                    break;
                                                  }
                                                }
                                              }
                                            }
                                            
                                            if (hasConflict) {
                                              const shouldRemoveOther = confirm(
                                                `⚠️ TIME CONFLICT!\n\n` +
                                                `${worker.name} is already assigned to:\n` +
                                                `"${conflictEvent.name}"\n` +
                                                `${conflictEvent.time} - ${conflictEvent.end_time}\n\n` +
                                                `This conflicts with:\n` +
                                                `"${event.name}"\n` +
                                                `${event.time} - ${event.end_time}\n\n` +
                                                `Remove them from "${conflictEvent.name}" and promote to "${event.name}"?`
                                              );
                                              
                                              if (!shouldRemoveOther) return;
                                              
                                              // Remove from conflicting event first
                                              const conflictAssignment = workerOtherAssignments.find(a => a.event_id === conflictEvent.id);
                                              if (conflictAssignment) {
                                                await supabase
                                                  .from('assignments')
                                                  .delete()
                                                  .eq('id', conflictAssignment.id);
                                              }
                                            }
                                            
                                            if (confirm(`Promote ${worker.name} from standby to assigned?`)) {
                                              // Check if position is still full
                                              const currentFilled = posAssignments.filter(a => a.status !== 'standby').length;
                                              if (currentFilled >= needed) {
                                                alert(`⛔ Cannot promote — the ${getPositionLabel(pos.key || pos.name)} position is still full (${currentFilled}/${needed}).\n\nRemove an assigned worker first, then promote from standby.`);
                                                return;
                                              }
                                              // Update assignment to change status from 'standby' to 'approved'
                                              supabase
                                                .from('assignments')
                                                .update({ status: 'approved' })
                                                .eq('id', assignment.id)
                                                .then(({ error }) => {
                                                  if (error) {
                                                    alert('Error promoting worker: ' + error.message);
                                                  } else {
                                                    alert(`${worker.name} promoted from standby!`);
                                                    // Refresh assignments data instead of reloading page
                                                    if (onReloadAssignments) {
                                                      onReloadAssignments();
                                                    }
                                                  }
                                                })
                                                .catch(err => alert('Error: ' + err.message));
                                            }
                                          }}
                                          className={`px-3 py-1 rounded text-xs bg-green-600 text-white hover:bg-green-700 ${
                                            posAssignments.filter(a => a.status !== 'standby').length >= needed ? 'hidden' : ''
                                          }`}
                                          title="Promote to assigned"
                                        >
                                          Promote
                                        </button>
                                        <button
                                          onClick={() => unassignWorker(assignment.id)}
                                          className="text-red-600 hover:text-red-800 p-1 hover:bg-red-50 rounded"
                                          title="Remove from standby"
                                        >
                                          <Trash2 size={18} />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Available Workers */}
                        {!isFull && (
                          <div>
                            <p className="text-sm font-medium text-gray-700 mb-2">
                              Available Workers: ({qualifiedWorkers.length})
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                              {qualifiedWorkers.map(worker => {
                                // Check if worker is assigned to a different position in this event
                                const otherAssignment = eventAssignments.find(a => a.worker_id === worker.id && a.position !== pos.name);
                                const isAvailable = !otherAssignment;
                              
                              // Check for time conflicts with other events on the same day
                              const workerOtherAssignments = assignments.filter(a => 
                                a.worker_id === worker.id && 
                                a.event_id !== event.id
                              );
                              
                              let hasTimeConflict = false;
                              let conflictEvent = null;
                              
                              if (workerOtherAssignments.length > 0) {
                                const conflicts = workerOtherAssignments.filter(assignment => {
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
                                      <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                                        worker.rank === 1 ? 'bg-yellow-100 text-yellow-800' :
                                        worker.rank === 2 ? 'bg-blue-100 text-blue-800' :
                                        'bg-gray-100 text-gray-700'
                                      }`}>
                                        Rank {worker.rank}
                                      </span>
                                      <span className="text-xs text-gray-600 flex items-center">
                                        ⭐ {worker.reliability.toFixed(1)}
                                      </span>
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
                                  </div>
                                  <button
                                    onClick={() => assignWorker(worker.id, positionKey, otherAssignment)}
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
                            {qualifiedWorkers.length === 0 && (
                              <p className="text-sm text-gray-500 col-span-2 text-center py-4">
                                No qualified workers available for this position
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setSearchTerm('');
                  setShowOnlyAvailable(false);
                  setExpandedPositions({});
                  onClose();
                }}
                className="bg-red-900 text-white px-6 py-3 rounded-lg hover:bg-red-800 font-medium"
              >
                Done
              </button>

              <button
                onClick={onClose}
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
}
