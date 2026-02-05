import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
import { formatTime, parseDateSafe } from '../../utils/dateHelpers';
import { getPositionLabel, getPositionKey, positionMatches } from '../../utils/positionHelpers';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  DollarSign, 
  Mail, 
  Phone, 
  CheckCircle, 
  XCircle, 
  ChevronDown, 
  Star, 
  Award, 
  Briefcase, 
  MessageSquare,
  X
} from 'lucide-react';

// ===== SUB-COMPONENT: AvailableEventsSection =====
const AvailableEventsSection = ({ 
  currentWorker, 
  events, 
  assignments, 
  rankAccessDays, 
  timeFormat, 
  paymentTrackingEnabled, 
  eventPaymentSettings, 
  payRates, 
  loadAssignments 
}) => {
  const [applying, setApplying] = useState(false);
  
  // Calculate which events the worker can see based on rank
  const getAvailableEvents = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const workerRank = currentWorker.rank || 5;
    const accessDays = rankAccessDays[workerRank] || 14;
    
    return events
      .filter(event => {
        // Must be future event
        const eventDate = new Date(event.date);
        eventDate.setHours(0, 0, 0, 0);
        if (eventDate < today) return false;
        
        // Calculate days until event
        const daysUntil = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
        
        // Check if within access window
        if (accessDays > 0 && daysUntil > accessDays) return false;
        
        // Must have positions that match worker skills
        const eventPositions = Array.isArray(event.positions) ? event.positions : [];
        const positionKeys = eventPositions.map(pos => 
          pos.key || getPositionKey(pos.name || pos)
        );
        
        const workerSkillKeys = currentWorker.skills || [];
        const hasMatchingSkill = positionKeys.some(posKey => 
          workerSkillKeys.some(skillKey => positionMatches(skillKey, posKey))
        );
        
        if (!hasMatchingSkill) return false;
        
        // Not already assigned or applied (including standby)
        const alreadyAssigned = assignments.some(a => 
          a.event_id === event.id && 
          a.worker_id === currentWorker.id &&
          ['approved', 'pending', 'standby'].includes(a.status || 'approved')
        );
        
        if (alreadyAssigned) return false;
        
        return true;
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  };
  
  const availableEvents = getAvailableEvents();
  
  const applyToEvent = async (event, position, isStandby = false) => {
    // Check for time conflicts first
    const workerAssignments = assignments.filter(a => 
      a.worker_id === currentWorker.id && 
      a.event_id !== event.id &&
      ['approved', 'pending', 'standby'].includes(a.status || 'approved')
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
    
    const confirmMessage = isStandby 
      ? `Apply as STANDBY for ${position} position at ${event.name}?\n\nYou'll be added to the standby list and notified if a spot opens up.`
      : `Apply for ${position} position at ${event.name}?`;
    
    if (!confirm(confirmMessage)) return;
    
    setApplying(true);
    try {
      const positionKey = getPositionKey(position);
      
      const { error } = await supabase
        .from('assignments')
        .insert([{
          event_id: event.id,
          worker_id: currentWorker.id,
          position: positionKey,
          status: isStandby ? 'standby' : 'pending',
          applied_at: new Date().toISOString()
        }]);
      
      if (error) throw error;
      
      loadAssignments();
      
      const successMessage = isStandby
        ? `✓ Added to standby list for ${event.name}!\n\nYou'll be notified if a spot opens up for ${position}.`
        : `✓ Application submitted for ${event.name}!\n\nYour application is pending admin approval.`;
      
      alert(successMessage);
    } catch (error) {
      console.error('Error applying:', error);
      alert('Error submitting application: ' + error.message);
    } finally {
      setApplying(false);
    }
  };
  
  // Helper function to check if position is filled
  const isPositionFilled = (event, positionKey) => {
    const eventAssignments = assignments.filter(a => 
      a.event_id === event.id && 
      a.position === positionKey &&
      a.status === 'approved' // Only count approved assignments
    );
    
    const position = event.positions.find(p => 
      (p.key || getPositionKey(p.name || p)) === positionKey
    );
    
    const needed = position?.count || 0;
    const filled = eventAssignments.length;
    
    return filled >= needed;
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
          const eventPositions = Array.isArray(event.positions) ? event.positions : [];
          const positionKeys = eventPositions.map(pos => 
            pos.key || getPositionKey(pos.name || pos)
          );
          
          const workerSkillKeys = currentWorker.skills || [];
          const matchingPositionKeys = positionKeys.filter(posKey => 
            workerSkillKeys.some(skillKey => positionMatches(skillKey, posKey))
          );
          
          const matchingPositions = matchingPositionKeys.map(key => ({
            key: key,
            label: getPositionLabel(key),
            isFilled: isPositionFilled(event, key)
          }));
          
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
                        ~${eventPaymentSettings[event.id].hours && payRates[matchingPositions[0]?.key] 
                          ? (eventPaymentSettings[event.id].hours * payRates[matchingPositions[0].key]).toFixed(0)
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
                    <div key={position.key} className="flex items-center space-x-1">
                      {position.isFilled && (
                        <span className="bg-gray-300 text-gray-700 text-xs px-2 py-1 rounded font-semibold">
                          FILLED
                        </span>
                      )}
                      <button
                        onClick={() => applyToEvent(event, position.label, position.isFilled)}
                        disabled={applying}
                        className={`${
                          position.isFilled
                            ? 'bg-orange-500 hover:bg-orange-600'
                            : 'bg-green-600 hover:bg-green-700'
                        } text-white text-xs px-3 py-1 rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed font-medium`}
                      >
                        {position.isFilled ? `Standby: ${position.label}` : `Apply: ${position.label}`}
                      </button>
                    </div>
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

// ===== MAIN COMPONENT: WorkerPortalView =====
const WorkerPortalView = ({
  loggedInWorker,
  assignments,
  events,
  workers,
  rankAccessDays,
  timeFormat,
  paymentTrackingEnabled,
  eventPaymentSettings,
  payRates,
  positions,
  loadAssignments
}) => {
  const currentWorker = loggedInWorker;
if (!assignments || !events || !workers) {
  return <div>Loading...</div>;
}
  const [viewMode, setViewMode] = useState('list');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedEventModal, setSelectedEventModal] = useState(null);

  const workerAssignments = assignments
    .filter(a => a.worker_id === currentWorker.id)
    .map(assignment => {
      const event = events.find(e => e.id === assignment.event_id);
      return { ...assignment, event };
    })
    .filter(a => a.event);

  const upcomingAssignments = workerAssignments
    .filter(a => {
      const eventDate = parseDateSafe(a.event.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return eventDate >= today && a.status === 'approved';
    })
    .sort((a, b) => new Date(a.event.date) - new Date(b.event.date));

  const pastAssignments = workerAssignments
    .filter(a => {
      const eventDate = parseDateSafe(a.event.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return eventDate < today && a.status === 'approved';
    })
    .sort((a, b) => new Date(b.event.date) - new Date(a.event.date));

  const pendingApplications = workerAssignments.filter(a => a.status === 'pending');

  const totalEarnings = workerAssignments
    .filter(a => a.status === 'approved' && a.total_pay)
    .reduce((sum, a) => sum + (a.total_pay || 0), 0);

  const cancelAssignment = async (assignment) => {
    const eventDate = parseDateSafe(assignment.event.date);
    const today = new Date();
    const daysUntil = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
    
    if (daysUntil < 7) {
      alert(
        `⚠️ Cannot Cancel\n\n` +
        `This event is ${daysUntil} day${daysUntil !== 1 ? 's' : ''} away.\n\n` +
        `Cancellations within 7 days require admin approval.\n` +
        `Please contact your admin directly.`
      );
      return;
    }
    
    if (!confirm(
      `Cancel your assignment for "${assignment.event.name}"?\n\n` +
      `Position: ${getPositionLabel(assignment.position)}\n` +
      `Date: ${parseDateSafe(assignment.event.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}\n\n` +
      `This action cannot be undone.`
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
      console.error('Error cancelling assignment:', error);
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
      console.error('Error switching position:', error);
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
  paymentTrackingEnabled={paymentTrackingEnabled}
  eventPaymentSettings={eventPaymentSettings}
  payRates={payRates}
  loadAssignments={loadAssignments}
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

export default WorkerPortalView;
