import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { parseDateSafe, formatTime } from '../utils/dateHelpers';
import { getPositionLabel, getPositionKey, positionMatches } from '../utils/positionHelpers';
import { Calendar, Clock, MapPin, Users, CheckCircle, Award, Navigation } from 'lucide-react';

const getPayRateKey = (position) => {
  const p = String(position || '').toLowerCase().trim();
  if (p.includes('blackjack')) return 'blackjack_dealer';
  if (p.includes('roulette')) return 'roulette_dealer';
  if (p.includes('poker')) return 'poker_dealer';
  if (p.includes('craps')) return 'craps_dealer';
  if (p.includes('baccarat')) return 'baccarat_dealer';
  if (p.includes('event lead')) return 'event_lead';
  if (p === 'dealer') return 'dealer';
  if (p.includes('host')) return 'host';
  if (p.includes('bartender')) return 'bartender';
  if (p.includes('server')) return 'server';
  if (p.includes('cashier')) return 'cashier';
  return p.replace(/\s+/g, '_');
};

const AvailableEventsSection = ({ currentWorker, events, assignments, rankAccessDays, timeFormat, paymentTrackingEnabled, eventPaymentSettings, payRates, travelTiers = [], bonuses = {}, locationPayRates = {}, locations = [], getEffectiveRate, onReloadAssignments }) => {
    const [applying, setApplying] = useState(false);
    const [eventDistances, setEventDistances] = useState({}); // { eventId: miles | 'loading' | 'error' }
    const fetchedRef = useRef(false); // prevent re-fetching same worker/events
    
    // Fetch distances from worker home to each available event
    useEffect(() => {
      const workerAddress = currentWorker?.address;
      if (!workerAddress || !events?.length) return;

      // Build a key to detect when worker or events change
      const key = workerAddress + '|' + events.map(e => e.id).join(',');
      if (fetchedRef.current === key) return;
      fetchedRef.current = key;

      const eventsWithAddress = events.filter(e => e.address);
      if (eventsWithAddress.length === 0) return;

      // Mark all as loading
      setEventDistances(prev => {
        const next = { ...prev };
        eventsWithAddress.forEach(e => { next[e.id] = 'loading'; });
        return next;
      });

      // Fetch distances in parallel (one call per event)
      eventsWithAddress.forEach(event => {
        fetch(`/api/get-distance?origin=${encodeURIComponent(workerAddress)}&destination=${encodeURIComponent(event.address)}`)
          .then(r => r.json())
          .then(data => {
            setEventDistances(prev => ({
              ...prev,
              [event.id]: data.miles != null ? data.miles : 'error'
            }));
          })
          .catch(() => {
            setEventDistances(prev => ({ ...prev, [event.id]: 'error' }));
          });
      });
    }, [currentWorker?.address, events]);

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
          
          // Hide invite-only events unless worker is already assigned
          if (event.invite_only) {
            const isAssigned = assignments.some(a =>
              a.event_id === event.id && a.worker_id === currentWorker.id
            );
            if (!isAssigned) {
              console.log('❌ Invite-only event, worker not assigned');
              return false;
            }
          }

          // Not already assigned, applied, or on standby - hide all of these from available events
          const alreadyAssigned = assignments.some(a => {
            if (a.event_id !== event.id) return false;
            if (a.worker_id !== currentWorker.id) return false;
            const status = a.status;
            return status === 'approved' || status === 'pending' || status === 'standby' || (!status);
          });
          console.log('Already Assigned:', alreadyAssigned);
          
          if (alreadyAssigned) {
            console.log('❌ Already assigned');
            return false;
          }
          
          // Check for time conflicts with APPROVED assignments
          const workerApprovedAssignments = assignments.filter(a => 
            a.worker_id === currentWorker.id && 
            (a.status === 'approved' || !a.status) // Approved or admin-assigned
          );
          
          if (workerApprovedAssignments.length > 0) {
            for (const assignment of workerApprovedAssignments) {
              const otherEvent = events.find(e => e.id === assignment.event_id);
              if (!otherEvent || otherEvent.date !== event.date) continue;
              
              // Check time overlap
              const parseTime = (timeStr) => {
                if (!timeStr) return null;
                const [hours, minutes] = timeStr.split(':').map(Number);
                return hours * 60 + minutes;
              };
              
              const thisStart = parseTime(event.time);
              const thisEnd = parseTime(event.end_time);
              const otherStart = parseTime(otherEvent.time);
              const otherEnd = parseTime(otherEvent.end_time);
              
              if (thisEnd && otherEnd) {
                const hasOverlap = (thisStart < otherEnd) && (thisEnd > otherStart);
                if (hasOverlap) {
                  console.log(`❌ Time conflict with ${otherEvent.name}`);
                  return false; // Hide this event
                }
              }
            }
          }
          
          console.log('✅ Event is available!');
          return true;
        })
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    };
    
    const availableEvents = getAvailableEvents();
    
    const applyToEvent = async (event, position) => {
      // ✅ Check if position is already full before allowing application
      // Use positionMatches() to handle both key and label formats
      if (event.positions && Array.isArray(event.positions)) {
        const positionDef = event.positions.find(p => {
          const pKey = p.key || getPositionKey(p.name || String(p));
          const pLabel = p.label || p.name || getPositionLabel(pKey);
          return pLabel === position || pKey === getPositionKey(position) ||
                 positionMatches(getPositionKey(position), pKey);
        });

        if (positionDef) {
          const maxCount = positionDef.count || 1;
          const pKey = positionDef.key || getPositionKey(positionDef.name || String(positionDef));

          // Count approved assignments - admin-assigned ones may have null/undefined status
          const currentApproved = assignments.filter(a => {
            if (a.event_id !== event.id) return false;
            // Admin-assigned directly = no status or 'approved'. Worker-applied = 'pending' until approved.
            // So count anything that is NOT pending/rejected/cancelled
            const s = a.status;
            if (s === 'pending' || s === 'rejected' || s === 'cancelled') return false;
            const aKey = getPositionKey(a.position);
            const aLabel = getPositionLabel(a.position);
            return positionMatches(aKey, pKey) ||
                   a.position === positionDef.name ||
                   a.position === positionDef.key ||
                   a.position === position ||
                   aLabel === position;
          }).length;

          console.log(`Position check: "${position}" | pKey: ${pKey} | approved: ${currentApproved} | max: ${maxCount}`);

          if (currentApproved >= maxCount) {
            const joinStandby = confirm(
              `⚠️ POSITION FULL!\n\n` +
              `Sorry, the ${position} position for "${event.name}" has already been filled.\n\n` +
              `${currentApproved}/${maxCount} spots taken.\n\n` +
              `Would you like to join the STANDBY list?\n\n` +
              `You'll be notified if a spot opens up.`
            );
            
            if (joinStandby) {
              // Check for time conflicts with APPROVED assignments
              const workerApprovedAssignments = assignments.filter(a => 
                a.worker_id === currentWorker.id && 
                (a.status === 'approved' || !a.status) // Approved or admin-assigned
              );
              
              let hasConflict = false;
              let conflictEventName = '';
              
              if (workerApprovedAssignments.length > 0) {
                for (const assignment of workerApprovedAssignments) {
                  const otherEvent = events.find(e => e.id === assignment.event_id);
                  if (!otherEvent || otherEvent.date !== event.date) continue;
                  
                  // Check time overlap
                  const parseTime = (timeStr) => {
                    if (!timeStr) return null;
                    const [hours, minutes] = timeStr.split(':').map(Number);
                    return hours * 60 + minutes;
                  };
                  
                  const thisStart = parseTime(event.time);
                  const thisEnd = parseTime(event.end_time);
                  const otherStart = parseTime(otherEvent.time);
                  const otherEnd = parseTime(otherEvent.end_time);
                  
                  if (thisEnd && otherEnd) {
                    const hasOverlap = (thisStart < otherEnd) && (thisEnd > otherStart);
                    if (hasOverlap) {
                      hasConflict = true;
                      conflictEventName = otherEvent.name;
                      break;
                    }
                  }
                }
              }
              
              if (hasConflict) {
                alert(
                  `⚠️ TIME CONFLICT!\n\n` +
                  `You're already confirmed for:\n"${conflictEventName}"\n\n` +
                  `You cannot join standby for an event that conflicts with your confirmed assignments.\n\n` +
                  `If you'd like to work this event instead, please cancel your other assignment first.`
                );
                return;
              }
              
              // Apply with status 'standby' instead of blocking
              setApplying(true);
              try {
                const positionKey = getPositionKey(position);
                
                const { error } = await supabase
                  .from('assignments')
                  .insert([{
                    event_id: event.id,
                    worker_id: currentWorker.id,
                    position: positionKey,
                    status: 'standby',
                    applied_at: new Date().toISOString()
                  }]);
                
                if (error) throw error;
                
                onReloadAssignments();
                alert(`✓ Added to standby list for ${event.name}!\n\nYou'll be notified if a spot opens up.`);
              } catch (error) {
                console.error('Error joining standby:', error);
                alert('Error joining standby: ' + error.message);
              } finally {
                setApplying(false);
              }
            }
            return;
          }
        } else {
          console.log(`Position check: Could not find position def for "${position}" in`, event.positions);
        }
      }

      // Check for time conflicts
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
      
      // Check if worker already assigned to a different position at THIS event
      // Exception: Host, Setup, and Cleanup can be combined with other positions
      const combinablePositions = ['host', 'setup', 'cleanup'];
      const positionKey = getPositionKey(position);
      const isCombinablePosition = combinablePositions.includes(positionKey);
      
      const sameEventAssignments = assignments.filter(a => 
        a.worker_id === currentWorker.id && 
        a.event_id === event.id &&
        ['approved', 'pending', 'standby'].includes(a.status)
      );
      
      if (sameEventAssignments.length > 0 && !isCombinablePosition) {
        // Check if any existing assignments are NOT combinable positions
        const nonCombinableExisting = sameEventAssignments.filter(a => {
          const existingKey = getPositionKey(a.position);
          return !combinablePositions.includes(existingKey);
        });
        
        if (nonCombinableExisting.length > 0) {
          const existingPosition = getPositionLabel(nonCombinableExisting[0].position);
          const statusText = nonCombinableExisting[0].status === 'approved' ? 'assigned to' : 
                            nonCombinableExisting[0].status === 'standby' ? 'on standby for' : 'applied for';
          alert(
            `⚠️ ALREADY ${statusText.toUpperCase()}!\n\n` +
            `You are already ${statusText} "${existingPosition}" at this event.\n\n` +
            `Workers can only work ONE position per event.`
          );
          return;
        }
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
        
        onReloadAssignments();
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
                      <div className="flex items-center justify-between">
                        <a 
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.address)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium inline-flex items-center space-x-1"
                        >
                          <MapPin size={12} />
                          <span>Open in Google Maps</span>
                        </a>
                        {/* Distance from worker home */}
                        {currentWorker?.address ? (
                          <span className="inline-flex items-center space-x-1 text-xs text-gray-500">
                            <Navigation size={11} className="text-gray-400" />
                            {eventDistances[event.id] === 'loading' ? (
                              <span className="text-gray-400">calculating...</span>
                            ) : eventDistances[event.id] === 'error' || eventDistances[event.id] == null ? null : (
                              <span>~{eventDistances[event.id]} mi from you</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-xs text-amber-600 font-medium inline-flex items-center space-x-1">
                            <Navigation size={11} />
                            <span>Add your address to see distance</span>
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {!event.address && !currentWorker?.address && (
                    <div className="mt-2 p-2 bg-amber-50 rounded border border-amber-200 flex items-center space-x-1">
                      <Navigation size={11} className="text-amber-500 flex-shrink-0" />
                      <span className="text-xs text-amber-700">Add your address in your profile to see distance</span>
                    </div>
                  )}
                  {paymentTrackingEnabled && eventPaymentSettings[event.id] && (() => {
                    const settings = eventPaymentSettings[event.id];
                    const { hours, miles, isLakeGeneva, isHoliday } = settings;
                    const numHours = Number(hours) || 0;
                    const numMiles = Number(miles) || 0;
                    if (!numHours) return null;

                    const payLines = matchingPositions.map(position => {
                      const rateKey = getPayRateKey(position);
                      const locationId = settings.locationId || event.location_id || null;
                      const hourlyRate = getEffectiveRate
                        ? getEffectiveRate(position, locationId)
                        : (payRates[rateKey] || payRates[position] || 0);
                      if (!hourlyRate) return null;

                      const basePay = numHours * hourlyRate;

                      let travelPay = 0;
                      for (const tier of travelTiers) {
                        const min = Number(tier.min_miles ?? tier.minMiles ?? 0);
                        const max = Number(tier.max_miles ?? tier.maxMiles ?? 0);
                        const amt = Number(tier.pay_amount ?? tier.payAmount ?? tier.amount ?? 0);
                        if (numMiles >= min && numMiles <= max) { travelPay = amt; break; }
                      }

                      const lakeBonus = isLakeGeneva ? (bonuses['Lake Geneva'] || 15) : 0;
                      const subtotal = basePay + travelPay + lakeBonus;
                      const holidayMult = isHoliday ? (bonuses['Holiday Multiplier'] || 1.5) : 1.0;
                      const total = subtotal * holidayMult;
                      return { position, hourlyRate, travelPay, total: total.toFixed(0) };
                    }).filter(Boolean);

                    if (payLines.length === 0) return null;
                    return (
                      <div className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                        <p className="text-xs font-semibold text-gray-700 mb-1">💰 Estimated Pay:</p>
                        {payLines.map(({ position, hourlyRate, travelPay, total }) => (
                          <div key={position} className="flex items-center justify-between">
                            <span className="text-xs text-gray-600">
                              {position} · {numHours}h × ${hourlyRate}/hr
                              {travelPay > 0 && ` + $${travelPay} travel`}
                            </span>
                            <span className="text-sm font-bold text-green-700">~${total}</span>
                          </div>
                        ))}
                        {(isLakeGeneva || isHoliday) && (
                          <p className="text-xs text-green-600 mt-1">
                            {[isLakeGeneva && '+$15 Lake Geneva', isHoliday && '1.5× holiday'].filter(Boolean).join(' • ')} included
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
                
                <div className="mb-3">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Available Positions:</p>
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    {matchingPositions.map(position => {
                      const positionKey = getPositionKey(position);
                      const onStandby = assignments.some(a =>
                        a.event_id === event.id &&
                        a.worker_id === currentWorker.id &&
                        a.status === 'standby' &&
                        (getPositionKey(a.position) === positionKey || a.position === position)
                      );

                      if (onStandby) {
                        const standbyList = assignments
                          .filter(a =>
                            a.event_id === event.id &&
                            a.status === 'standby' &&
                            (getPositionKey(a.position) === positionKey || a.position === position)
                          )
                          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                        
                        const standbyPosition = standbyList.findIndex(a => a.worker_id === currentWorker.id) + 1;
                        
                        return (
                          <div
                            key={position}
                            className="bg-orange-100 border-2 border-orange-400 text-orange-800 text-xs px-3 py-2.5 rounded-lg font-medium flex items-center justify-center space-x-1"
                          >
                            <Clock size={13} />
                            <span>Standby #{standbyPosition}: {position}</span>
                          </div>
                        );
                      }

                      return (
                        <button
                          key={position}
                          onClick={() => applyToEvent(event, position)}
                          disabled={applying}
                          className="bg-green-600 text-white text-sm px-3 py-2.5 rounded-lg hover:bg-green-700 active:bg-green-800 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold text-center"
                        >
                          {position}
                        </button>
                      );
                    })}
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
