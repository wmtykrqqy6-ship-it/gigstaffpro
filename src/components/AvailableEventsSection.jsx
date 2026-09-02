import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { parseDateSafe, formatTime, parseTimeToMinutes, timeRangesOverlap } from '../utils/dateHelpers';
import { getPositionLabel, getPositionKey, getPayRateKey, positionMatches } from '../utils/positionHelpers';
import { Calendar, Clock, MapPin, Users, CheckCircle, Award, Navigation } from 'lucide-react';
import { useConfirm } from './ui/ConfirmDialog';
import { useToast } from './ui/Toast';

const AvailableEventsSection = ({ currentWorker, events, assignments, rankAccessDays, timeFormat, paymentTrackingEnabled, eventPaymentSettings, payRates, travelTiers = [], bonuses = {}, locationPayRates = {}, locations = [], getEffectiveRate, onReloadAssignments }) => {
    const confirm = useConfirm();
    const notify = useToast();
    const [applying, setApplying] = useState(false);
    const [eventDistances, setEventDistances] = useState({}); // { eventId: miles } from worker address (for display)
    const [travelPayDistances, setTravelPayDistances] = useState({}); // { eventId: miles } from worker home location (for pay calc)
    const fetchedRef = useRef(false);
    const travelFetchedRef = useRef(false);

    // Fetch distances from worker's personal address → each event (for "X mi from you" display)
    useEffect(() => {
      const workerAddress = currentWorker?.address;
      if (!workerAddress || !events?.length) return;

      const key = workerAddress + '|' + events.map(e => e.id).join(',');
      if (fetchedRef.current === key) return;
      fetchedRef.current = key;

      const eventsWithAddress = events.filter(e => e.address);
      if (eventsWithAddress.length === 0) return;

      setEventDistances(prev => {
        const next = { ...prev };
        eventsWithAddress.forEach(e => { next[e.id] = 'loading'; });
        return next;
      });

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

    // Fetch distances from worker's home location address → each event (for travel pay calculation)
    useEffect(() => {
      const workerHomeLocationId = currentWorker?.home_location_id;
      if (!workerHomeLocationId || !events?.length) return;

      const homeLocation = locations.find(l => l.id === workerHomeLocationId);
      const homeAddress = homeLocation?.address;
      if (!homeAddress) return;

      const key = homeAddress + '|' + events.map(e => e.id).join(',');
      if (travelFetchedRef.current === key) return;
      travelFetchedRef.current = key;

      const eventsWithAddress = events.filter(e => e.address);
      if (eventsWithAddress.length === 0) return;

      eventsWithAddress.forEach(event => {
        // Same location = 0 miles, no need to call API
        const eventLocationId = event.location_id || null;
        if (workerHomeLocationId === eventLocationId) {
          setTravelPayDistances(prev => ({ ...prev, [event.id]: 0 }));
          return;
        }
        fetch(`/api/get-distance?origin=${encodeURIComponent(homeAddress)}&destination=${encodeURIComponent(event.address)}`)
          .then(r => r.json())
          .then(data => {
            setTravelPayDistances(prev => ({
              ...prev,
              [event.id]: data.miles != null ? data.miles : null
            }));
          })
          .catch(() => {
            setTravelPayDistances(prev => ({ ...prev, [event.id]: null }));
          });
      });
    }, [currentWorker?.home_location_id, events, locations]);

    // Calculate which events the worker can see based on rank
    const getAvailableEvents = () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset to start of day
      const workerRank = currentWorker.rank || 5;
      const accessDays = rankAccessDays[workerRank] || 14;
      
      return events
        .filter(event => {
          
          // Must be future or today event — use local date parse to avoid UTC offset bug
          const [ey, em, ed] = (event.date || '').split('-').map(Number);
          const eventDate = new Date(ey, em - 1, ed);
          if (eventDate < today) return false;
          
          // Calculate days until event
          const daysUntil = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
          
          // Check if within access window (Rank 1 with 0 days can see all future events)
          if (accessDays > 0 && daysUntil > accessDays) {
              return false;
          }
          
          // Must have positions that match worker skills (using position keys)
          const eventPositions = Array.isArray(event.positions) ? event.positions : [];
          
          // Extract position keys from position objects
          const positionKeys = eventPositions.map(pos => 
            pos.key || getPositionKey(pos.name || pos)
          );
          
          const workerSkillKeys = currentWorker.skills || [];
          const hasMatchingSkill = positionKeys.some(posKey => 
            workerSkillKeys.some(skillKey => positionMatches(skillKey, posKey))
          );
          
          if (!hasMatchingSkill) {
              return false;
          }
          
          // Hide invite-only events unless worker is already assigned
          if (event.invite_only) {
            const isAssigned = assignments.some(a =>
              a.event_id === event.id && a.worker_id === currentWorker.id
            );
            if (!isAssigned) {
                  return false;
            }
          }

          // Hide the event once the worker has an active or pending claim on it.
          // Deliberately NOT hiding on 'standby': a standby assignment is a waiting
          // spot, not a commitment, and the event must stay visible so the worker
          // can see their "Standby #N" position (rendered per-position below) and
          // still apply/standby for any other position they're also qualified for
          // at the same event. Hiding on standby made the event vanish entirely
          // right after joining standby, with no confirmation ever shown.
          const alreadyAssigned = assignments.some(a => {
            if (a.event_id !== event.id) return false;
            if (a.worker_id !== currentWorker.id) return false;
            const status = a.status;
            return status === 'approved' || status === 'pending' || (!status);
          });
          
          if (alreadyAssigned) {
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
              const thisStart = parseTimeToMinutes(event.time);
              const thisEnd = parseTimeToMinutes(event.end_time);
              const otherStart = parseTimeToMinutes(otherEvent.time);
              const otherEnd = parseTimeToMinutes(otherEvent.end_time);

              if (timeRangesOverlap(thisStart, thisEnd, otherStart, otherEnd)) {
                return false; // Hide this event
              }
            }
          }
          
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


          if (currentApproved >= maxCount) {
            const joinStandby = await confirm(
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
                  const thisStart = parseTimeToMinutes(event.time);
                  const thisEnd = parseTimeToMinutes(event.end_time);
                  const otherStart = parseTimeToMinutes(otherEvent.time);
                  const otherEnd = parseTimeToMinutes(otherEvent.end_time);

                  if (timeRangesOverlap(thisStart, thisEnd, otherStart, otherEnd)) {
                    hasConflict = true;
                    conflictEventName = otherEvent.name;
                    break;
                  }
                }
              }
              
              if (hasConflict) {
                notify(
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
                const res = await fetch('/api/worker-actions', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'apply', eventId: event.id, workerId: currentWorker.id, position })
                });
                const result = await res.json();
                if (!result.ok) throw new Error(result.error || 'Failed to join standby');

                onReloadAssignments();
                if (result.result === 'approved') {
                  notify(`✓ A spot opened up — you're confirmed for ${event.name}!`);
                } else if (result.result === 'pending') {
                  notify(`✓ Application submitted for ${event.name}!\n\nYour application is pending admin approval.`);
                } else {
                  notify(result.message || `✓ Added to standby list for ${event.name}!\n\nYou'll be notified if a spot opens up.`);
                }
              } catch (error) {
                console.error('Error joining standby:', error);
                notify('Error joining standby: ' + error.message);
              } finally {
                setApplying(false);
              }
            }
            return;
          }
        } else {
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
          
          const thisStart = parseTimeToMinutes(event.time);
          const thisEnd = parseTimeToMinutes(event.end_time);
          const otherStart = parseTimeToMinutes(otherEvent.time);
          const otherEnd = parseTimeToMinutes(otherEvent.end_time);

          return timeRangesOverlap(thisStart, thisEnd, otherStart, otherEnd);
        });
        
        if (conflicts.length > 0) {
          hasTimeConflict = true;
          conflictEvent = events.find(e => e.id === conflicts[0].event_id);
        }
      }
      
      if (hasTimeConflict && conflictEvent) {
        notify(`⚠️ TIME CONFLICT!\n\nYou're already assigned/applied to:\n${conflictEvent.name}\n${formatTime(conflictEvent.time, timeFormat)} - ${formatTime(conflictEvent.end_time, timeFormat)}\n\nThis conflicts with:\n${event.name}\n${formatTime(event.time, timeFormat)} - ${formatTime(event.end_time, timeFormat)}\n\nPlease contact admin if you need to change assignments.`);
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
          notify(
            `⚠️ ALREADY ${statusText.toUpperCase()}!\n\n` +
            `You are already ${statusText} "${existingPosition}" at this event.\n\n` +
            `Workers can only work ONE position per event.`
          );
          return;
        }
      }

      const isFirstCome = event.staffing_mode === 'first-come';
      if (!(await confirm(
        isFirstCome
          ? `Apply for ${position} position at ${event.name}?\n\nThis event is first come, first served — you'll be instantly confirmed.`
          : `Apply for ${position} position at ${event.name}?`
      ))) return;

      setApplying(true);
      try {
        const res = await fetch('/api/worker-actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'apply', eventId: event.id, workerId: currentWorker.id, position })
        });
        const result = await res.json();
        if (!result.ok) throw new Error(result.error || 'Failed to apply');

        onReloadAssignments();
        if (result.result === 'approved') {
          notify(`✓ You're confirmed for ${event.name}!`);
        } else if (result.result === 'standby') {
          notify(result.message || `✓ Added to standby list for ${event.name}!\n\nYou'll be notified if a spot opens up.`);
        } else {
          notify(`✓ Application submitted for ${event.name}!\n\nYour application is pending admin approval. You'll be notified once it's reviewed.`);
        }
      } catch (error) {
        console.error('Error applying:', error);
        notify('Error submitting application: ' + error.message);
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
                    const { hours, isLakeGeneva, isHoliday } = settings;
                    const numHours = Number(hours) || 0;
                    if (!numHours) return null;

                    // Travel miles from worker's home location → event
                    // travelPayDistances is fetched async; fall back to settings.miles if not ready
                    const workerHomeLocationId = currentWorker?.home_location_id || null;
                    let numMiles;
                    if (workerHomeLocationId) {
                      // Use home-location-based distance if available, otherwise show pending
                      const travelDist = travelPayDistances[event.id];
                      numMiles = (travelDist != null && travelDist !== 'error') ? travelDist : (Number(settings.miles) || 0);
                    } else {
                      // No home location set — use stored hub→event distance
                      numMiles = Number(settings.miles) || 0;
                    }

                    const isFlatPay = event.flat_pay_amount > 0;
                    const payLines = matchingPositions.map(position => {
                      const rateKey = getPayRateKey(position);
                      // Worker's own home market sets their rate, not the
                      // event's — traveling to a different market doesn't
                      // change the base rate, only the travel pay below.
                      const hourlyRate = getEffectiveRate
                        ? getEffectiveRate(position, workerHomeLocationId)
                        : (payRates[rateKey] || payRates[position] || 0);
                      if (!isFlatPay && !hourlyRate) return null;

                      const basePay = isFlatPay ? event.flat_pay_amount : numHours * hourlyRate;

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
                              {isFlatPay
                                ? `${position} · $${event.flat_pay_amount.toFixed(0)} flat`
                                : `${position} · ${numHours}h × $${hourlyRate}/hr`}
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
