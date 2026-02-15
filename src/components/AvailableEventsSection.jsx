import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { parseDateSafe, formatTime } from '../utils/dateHelpers';
import { getPositionLabel, positionMatches } from '../utils/positionHelpers';
import { Calendar, Clock, MapPin, Users, CheckCircle, Award } from 'lucide-react';

const AvailableEventsSection = ({ currentWorker, events, assignments, rankAccessDays, timeFormat }) => {
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
}

export default AvailableEventsSection;
