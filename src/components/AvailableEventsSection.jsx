import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { parseDateSafe, formatTime } from '../utils/dateHelpers';
import { getPositionLabel, positionMatches } from '../utils/positionHelpers';
import { Calendar, Clock, MapPin, Users, CheckCircle, Award } from 'lucide-react';

    const [applying, setApplying] = useState(false);
    
    // Calculate which events the worker can see based on rank
    const getAvailableEvents = () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset to start of day
      const workerRank = currentWorker.rank || 5;
      const accessDays = rankAccessDays[workerRank] || 14;
      
      console.log('Worker:', currentWorker.name, 'Rank:', workerRank, 'Access Days:', accessDays);
      console.log('Worker Skills:', currentWorker.skills);
      
      return events
        .filter(event => {
          console.log('--- Checking Event:', event.name);
          
          // Must be future event
          const eventDate = new Date(event.date);
          eventDate.setHours(0, 0, 0, 0);
          console.log('Event Date:', eventDate, 'Today:', today, 'Is Future:', eventDate >= today);
          if (eventDate < today) {
            console.log('❌ Event is in the past');
            return false;
          }
          
          // Calculate days until event
          const daysUntil = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
          console.log('Days Until Event:', daysUntil, 'Access Window:', accessDays);
          
          // Check if within access window (Rank 1 with 0 days can see all future events)
          if (accessDays > 0 && daysUntil > accessDays) {
            console.log('❌ Outside access window');
            return false;
          }
          
          // Must have positions that match worker skills (using position keys)
          const eventPositions = Array.isArray(event.positions) ? event.positions : [];
          console.log('Event Positions:', JSON.stringify(eventPositions));
          console.log('Worker Skills:', JSON.stringify(currentWorker.skills));
          
          // Extract position keys from position objects
          const positionKeys = eventPositions.map(pos => 
            pos.key || getPositionKey(pos.name || pos)
          );
          console.log('Position Keys:', JSON.stringify(positionKeys));
          
          const workerSkillKeys = currentWorker.skills || [];
          const hasMatchingSkill = positionKeys.some(posKey => 
            workerSkillKeys.some(skillKey => positionMatches(skillKey, posKey))
          );
          console.log('Has Matching Skill:', hasMatchingSkill);
          
          // DEBUG: Show which positions/skills are being compared
          console.log('Comparison breakdown:');
          positionKeys.forEach(posKey => {
            const matches = workerSkillKeys.some(skillKey => positionMatches(skillKey, posKey));
            console.log(`  "${posKey}" matches worker skills? ${matches}`);
          });
          
          if (!hasMatchingSkill) {
            console.log('❌ No matching skills');
            return false;
          }
          
          // Not already assigned or applied
          const alreadyAssigned = assignments.some(a => 
            a.event_id === event.id && 
            a.worker_id === currentWorker.id &&
            ['approved', 'pending'].includes(a.status || 'approved')
          );
          console.log('Already Assigned:', alreadyAssigned);
          
          if (alreadyAssigned) {
            console.log('❌ Already assigned');
            return false;
          }
          
          console.log('✅ Event is available!');
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

  const ApplicationsView = () => {
    const [filter, setFilter] = useState('all'); // 'all', 'pending', 'approved', 'rejected'
    const [searchTerm, setSearchTerm] = useState('');
    const [processingId, setProcessingId] = useState(null);

    // Get all applications with worker and event details
    const applications = assignments
      .map(assignment => {
        const worker = workers.find(w => w.id === assignment.worker_id);
        const event = events.find(e => e.id === assignment.event_id);
        return { ...assignment, worker, event };
      })
      .filter(app => app.worker && app.event) // Only include valid applications
      .sort((a, b) => new Date(b.applied_at || b.created_at) - new Date(a.applied_at || a.created_at)); // Newest first

    // Apply filters
    const filteredApplications = applications.filter(app => {
      // Status filter
      if (filter === 'pending' && app.status !== 'pending') return false;
      if (filter === 'approved' && app.status !== 'approved') return false;
      if (filter === 'rejected' && app.status !== 'rejected') return false;
      
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesWorker = app.worker.name.toLowerCase().includes(search);
        const matchesEvent = app.event.name.toLowerCase().includes(search);
        const matchesPosition = (app.position || '').toLowerCase().includes(search);
        if (!matchesWorker && !matchesEvent && !matchesPosition) return false;
      }
      
      return true;
    });

    const handleApprove = async (applicationId) => {
      if (!confirm('Approve this application?')) return;
      
      setProcessingId(applicationId);
      try {
        const { error } = await supabase
          .from('assignments')
          .update({ status: 'approved' })
          .eq('id', applicationId);
        
        if (error) throw error;
        
        loadAssignments();
        alert('Application approved!');
      } catch (error) {
        console.error('Error approving application:', error);
        alert('Error approving application: ' + error.message);
      } finally {
        setProcessingId(null);
      }
    };

    const handleBulkApprove = async () => {
      const pendingApps = filteredApplications.filter(app => app.status === 'pending');
      
      if (pendingApps.length === 0) {
        alert('No pending applications to approve.');
        return;
      }
      
      if (!confirm(`Approve ${pendingApps.length} pending application(s)?`)) return;
      
      setProcessingId('bulk');
      try {
        const ids = pendingApps.map(app => app.id);
        
        const { error } = await supabase
          .from('assignments')
          .update({ status: 'approved' })
          .in('id', ids);
        
        if (error) throw error;
        
        loadAssignments();
        alert(`✓ ${pendingApps.length} application(s) approved!`);
      } catch (error) {
        console.error('Error bulk approving:', error);
        alert('Error bulk approving: ' + error.message);
      } finally {
        setProcessingId(null);
      }
    };

    const handleReject = async (applicationId) => {
      if (!confirm('Reject this application? This will remove the assignment.')) return;
      
      setProcessingId(applicationId);
      try {
        const { error } = await supabase
          .from('assignments')
          .delete()
          .eq('id', applicationId);
        
        if (error) throw error;
        
        loadAssignments();
        alert('Application rejected and removed.');
      } catch (error) {
        console.error('Error rejecting application:', error);
        alert('Error rejecting application: ' + error.message);
      } finally {
        setProcessingId(null);
      }
    };

    const pendingCount = applications.filter(a => a.status === 'pending').length;
    const approvedCount = applications.filter(a => a.status === 'approved').length;

    return (
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Applications</h2>
          <p className="text-sm text-gray-600 mt-1">Review and manage worker applications</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-600 font-medium">Pending Review</p>
                <p className="text-3xl font-bold text-yellow-900 mt-1">{pendingCount}</p>
              </div>
              <Clock size={32} className="text-yellow-600" />
            </div>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 font-medium">Approved</p>
                <p className="text-3xl font-bold text-green-900 mt-1">{approvedCount}</p>
              </div>
              <CheckCircle size={32} className="text-green-600" />
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-medium">Total Applications</p>
                <p className="text-3xl font-bold text-blue-900 mt-1">{applications.length}</p>
              </div>
              <FileText size={32} className="text-blue-600" />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Status filter */}
            <div className="flex space-x-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === 'all'
                    ? 'bg-red-900 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('pending')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === 'pending'
                    ? 'bg-yellow-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Pending ({pendingCount})
              </button>
              <button
                onClick={() => setFilter('approved')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === 'approved'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Approved
              </button>
            </div>

            {/* Search */}
            <div className="flex-1">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by worker, event, or position..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
            
            {/* Bulk Actions */}
            {pendingCount > 0 && (
              <button
                onClick={handleBulkApprove}
                disabled={processingId === 'bulk'}
                className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium whitespace-nowrap flex items-center space-x-2"
              >
                <CheckCircle size={18} />
                <span>Approve All Pending ({pendingCount})</span>
              </button>
            )}
          </div>
        </div>

        {/* Applications List */}
        <div className="bg-white rounded-lg shadow">
          {filteredApplications.length === 0 ? (
            <div className="p-12 text-center">
              <FileText size={48} className="mx-auto text-gray-300 mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Applications Found</h3>
              <p className="text-gray-600">
                {filter === 'pending' 
                  ? 'No pending applications to review.' 
                  : 'Try adjusting your filters or search terms.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredApplications.map(app => (
                <div key={app.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    {/* Application Info */}
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-bold text-gray-900">{app.worker.name}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          app.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          app.status === 'approved' ? 'bg-green-100 text-green-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {app.status === 'pending' ? 'Pending Review' : 
                           app.status === 'approved' ? 'Approved' : 'Rejected'}
                        </span>
                        {app.worker.rank <= 2 && (
                          <span className={`px-2 py-1 rounded text-xs font-bold ${
                            app.worker.rank === 1 ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            Rank {app.worker.rank}
                          </span>
                        )}
                        {app.worker.reliability >= 4.5 && (
                          <span className="text-sm text-yellow-600">⭐ {app.worker.reliability.toFixed(1)}</span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500">Event</p>
                          <p className="font-medium text-gray-900">{app.event.name}</p>
                          <p className="text-xs text-gray-600">
                            {parseDateSafe(app.event.date).toLocaleDateString('en-US', { 
                              weekday: 'short', month: 'short', day: 'numeric' 
                            })} • {formatTime(app.event.time, timeFormat)}
                          </p>
                        </div>

                        <div>
                          <p className="text-gray-500">Position</p>
                          <p className="font-medium text-gray-900">{getPositionLabel(app.position)}</p>
                        </div>

                        <div>
                          <p className="text-gray-500">Applied</p>
                          <p className="font-medium text-gray-900">
                            {app.applied_at 
                              ? new Date(app.applied_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                              : 'N/A'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    {app.status === 'pending' && (
                      <div className="flex space-x-2 ml-4">
                        <button
                          onClick={() => handleApprove(app.id)}
                          disabled={processingId === app.id}
                          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2 transition-colors"
                        >
                          <CheckCircle size={18} />
                          <span>Approve</span>
                        </button>
                        <button
                          onClick={() => handleReject(app.id)}
                          disabled={processingId === app.id}
                          className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2 transition-colors"
                        >
                          <XCircle size={18} />
                          <span>Reject</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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
    if (currentView === 'applications') return <ApplicationsView />;
    if (currentView === 'payments') return <PaymentsView />;
    if (currentView === 'settings') return <SettingsView />;
    
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
      <BulkInviteModal />
      <SetPinModal />
      <EditWorkerModal />
      <AddEventModal />
      <EditEventModal />
      <AssignWorkersModal />
      <PaymentCalculatorModal />
    </div>
  );
};


export default AvailableEventsSection;
