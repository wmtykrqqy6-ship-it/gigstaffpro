import React, { useState } from 'react';
import { Calendar, ChevronDown, Clock, MapPin, DollarSign, Star, XCircle, RefreshCw, Briefcase, CheckCircle, Mail, Phone, MessageSquare, X, Award, User, ClipboardList, Send } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { parseDateSafe, formatTime } from '../../utils/dateHelpers';
import { getPositionLabel, getPositionKey, positionMatches } from '../../utils/positionHelpers';
import { getHostLabel } from '../../utils/hostLabelHelper';
import AvailableEventsSection from '../AvailableEventsSection';
import ProfileView from './ProfileView';
import HistoryView from './HistoryView';
import PostEventReportModal from '../modals/PostEventReportModal';

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

export default function WorkerPortalView({  loggedInWorker,
  workers = [],
  assignments,
  events,
  positions,
  timeFormat,
  paymentTrackingEnabled,
  rankAccessDays,
  eventPaymentSettings,
  payRates,
  travelTiers = [],
  bonuses = {},
  locationPayRates = {},
  locations = [],
  getEffectiveRate,
  onReloadAssignments,
  onReloadWorker,
  currentTab = 'dashboard'
}) {
    const currentWorker = loggedInWorker;

    const [viewMode, setViewMode] = useState('calendar'); // 'calendar' or 'list'
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [selectedEventModal, setSelectedEventModal] = useState(null);
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportEvent, setReportEvent] = useState(null);
    const [submittedReportEventIds, setSubmittedReportEventIds] = useState(new Set());

    // Load already-submitted report event IDs for this host
    React.useEffect(() => {
      if (!currentWorker?.is_host) return;
      const loadSubmittedReports = async () => {
        try {
          const { data, error } = await supabase
            .from('post_event_reports')
            .select('event_id')
            .eq('submitted_by', currentWorker.id);
          if (!error && data) {
            setSubmittedReportEventIds(new Set(data.map(r => r.event_id)));
          }
        } catch (e) {
          console.error('Error loading submitted reports:', e);
        }
      };
      loadSubmittedReports();
    }, [currentWorker?.id]);

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

    const standbyAssignments = assignments
      .filter(a => a.worker_id === currentWorker.id && a.status === 'standby')
      .map(assignment => {
        const event = events.find(e => e.id === assignment.event_id);
        // Calculate standby position (how many people signed up before this worker)
        const standbyPosition = assignments
          .filter(a2 => 
            a2.event_id === assignment.event_id && 
            a2.position === assignment.position && 
            a2.status === 'standby' &&
            new Date(a2.created_at) <= new Date(assignment.created_at)
          ).length;
        return { ...assignment, event, standbyPosition };
      })
      .filter(a => a.event)
      .filter(a => {
        // Only show future standby events
        const eventDate = parseDateSafe(a.event.date);
        const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
        return eventDateOnly >= todayOnly;
      })
      .sort((a, b) => new Date(a.event.date) - new Date(b.event.date));

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
        
        onReloadAssignments();
        alert('✓ Assignment cancelled successfully.');
      } catch (error) {
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
        
        onReloadAssignments();
        alert(`✓ Position switched to ${newPositionLabel}!`);
      } catch (error) {
        alert('Error switching position: ' + error.message);
      }
    };

    const [pendingInvites, setPendingInvites] = useState([]);
    const [respondingInvite, setRespondingInvite] = useState(null);

    // Check-in state
    const [checkIns, setCheckIns] = useState({});
    const [checkingIn, setCheckingIn] = useState({});
    const [manualNotes, setManualNotes] = useState({});
    const [showManualCheckIn, setShowManualCheckIn] = useState({});

    // Load check-ins for this worker
    React.useEffect(() => {
      if (!currentWorker?.id) return;
      const loadCheckIns = async () => {
        const { data } = await supabase.from('check_ins').select('*').eq('worker_id', currentWorker.id);
        const map = {};
        (data || []).forEach(ci => { map[ci.assignment_id] = ci; });
        setCheckIns(map);
      };
      loadCheckIns();
    }, [currentWorker?.id]);

    const submitCheckIn = async ({ assignmentId, event, workerLat, workerLng, distanceMiles, method, flagged, notes }) => {
      try {
        const { data, error } = await supabase.from('check_ins').upsert({
          assignment_id: assignmentId,
          worker_id: currentWorker.id,
          event_id: event.id,
          checked_in_at: new Date().toISOString(),
          method,
          latitude: workerLat || null,
          longitude: workerLng || null,
          distance_from_venue: distanceMiles ? Math.round(distanceMiles * 100) / 100 : null,
          notes: notes || null,
          flagged,
          admin_override: false,
        }, { onConflict: 'assignment_id' }).select().single();
        if (error) throw error;
        setCheckIns(prev => ({ ...prev, [assignmentId]: data }));
        setShowManualCheckIn(prev => ({ ...prev, [assignmentId]: false }));
      } catch (err) { alert('Check-in failed: ' + err.message); }
      finally { setCheckingIn(prev => ({ ...prev, [assignmentId]: false })); }
    };

    const handleCheckIn = async (assignment) => {
      const assignmentId = assignment.id;
      const event = assignment.event;
      setCheckingIn(prev => ({ ...prev, [assignmentId]: true }));
      try {
        const geoLat = event.meeting_point_lat || null;
        const geoLng = event.meeting_point_lng || null;
        const position = await new Promise((resolve, reject) => {
          if (!navigator.geolocation) return reject(new Error('no-gps'));
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000, maximumAge: 0 });
        });
        const workerLat = position.coords.latitude;
        const workerLng = position.coords.longitude;
        let distanceMiles = null;
        let method = 'manual';
        let flagged = true;
        if (geoLat && geoLng) {
          const R = 3958.8;
          const dLat = (geoLat - workerLat) * Math.PI / 180;
          const dLng = (geoLng - workerLng) * Math.PI / 180;
          const a = Math.sin(dLat/2)**2 + Math.cos(workerLat*Math.PI/180)*Math.cos(geoLat*Math.PI/180)*Math.sin(dLng/2)**2;
          distanceMiles = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          if (distanceMiles <= 0.25) { method = 'geo'; flagged = false; }
        }
        if (method === 'geo') {
          await submitCheckIn({ assignmentId, event, workerLat, workerLng, distanceMiles, method, flagged, notes: null });
        } else {
          setShowManualCheckIn(prev => ({ ...prev, [assignmentId]: true }));
          setCheckingIn(prev => ({ ...prev, [assignmentId]: false }));
        }
      } catch (err) {
        // GPS denied or unavailable
        setShowManualCheckIn(prev => ({ ...prev, [assignmentId]: true }));
        setCheckingIn(prev => ({ ...prev, [assignmentId]: false }));
      }
    };

    const handleManualCheckIn = async (assignment) => {
      setCheckingIn(prev => ({ ...prev, [assignment.id]: true }));
      await submitCheckIn({
        assignmentId: assignment.id,
        event: assignment.event,
        workerLat: null, workerLng: null,
        distanceMiles: null,
        method: 'manual',
        flagged: true,
        notes: manualNotes[assignment.id] || '',
      });
    };


    React.useEffect(() => {
      if (!currentWorker?.id) return;
      const loadPendingInvites = async () => {
        const { data } = await supabase
          .from('invitations')
          .select('*')
          .eq('worker_id', currentWorker.id)
          .eq('status', 'pending')
          .order('invited_at', { ascending: false });
        setPendingInvites((data || []).filter(i => !i.expires_at || new Date(i.expires_at) > new Date()));
      };
      loadPendingInvites();

      // Check every 30 seconds and remove any that have since expired
      const timer = setInterval(() => {
        setPendingInvites(prev => prev.filter(i => !i.expires_at || new Date(i.expires_at) > new Date()));
      }, 30000);
      return () => clearInterval(timer);
    }, [currentWorker?.id]);

    const handleInviteResponse = async (invitation, response) => {
      setRespondingInvite(invitation.id);
      try {
        await supabase.from('invitations')
          .update({
            status: response,
            responded_at: new Date().toISOString()
          })
          .eq('id', invitation.id);
        setPendingInvites(prev => prev.filter(i => i.id !== invitation.id));
        if (onReloadAssignments) onReloadAssignments();
      } catch (err) {
        alert('Error responding to invite: ' + err.message);
      } finally {
        setRespondingInvite(null);
      }
    };

    return (
      <div className="space-y-6">
        {/* Header with worker info - Only show on dashboard */}
        {currentTab === 'dashboard' && (
          <div className="bg-gradient-to-r from-red-900 to-black text-white rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-3xl font-bold mb-2">Welcome, {currentWorker.name}!</h2>
                <p className="text-red-200">Your worker portal</p>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content */}
        {currentTab === 'profile' ? (
          <ProfileView worker={currentWorker} onProfileUpdate={onReloadWorker} assignments={assignments} events={events} />
        ) : currentTab === 'history' ? (
          <HistoryView 
            worker={currentWorker}
            assignments={assignments}
            events={events}
            timeFormat={timeFormat}
            paymentTrackingEnabled={paymentTrackingEnabled}
          />
        ) : (
          <>
        {/* Pending Invites Banner - highest priority */}
        {pendingInvites.length > 0 && (
          <div className="bg-white rounded-lg shadow border-l-4 border-red-900 p-6">
            <div className="flex items-center space-x-3 mb-4">
              <Send size={22} className="text-red-900 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {pendingInvites.length} Event Invite{pendingInvites.length !== 1 ? 's' : ''} Waiting
                </h3>
                <p className="text-sm text-gray-500">Respond before the window closes to secure your spot</p>
              </div>
            </div>
            <div className="space-y-3">
              {pendingInvites.map(inv => {
                const invEvent = events.find(e => e.id === inv.event_id);
                if (!invEvent) return null;
                const eventDate = parseDateSafe(invEvent.date);

                // How many spots remain for this position on this event
                const totalForPos = (invEvent.positions || []).find(p => p.position === inv.position_key || p.key === inv.position_key)?.count || 0;
                const confirmedForPos = (assignments || []).filter(a =>
                  a.event_id === inv.event_id && a.position === inv.position_key && a.status !== 'standby'
                ).length;
                const spotsLeft = Math.max(0, totalForPos - confirmedForPos);

                const isExpired = inv.expires_at && new Date(inv.expires_at) < new Date();
                const expiresIn = inv.expires_at ? (() => {
                  const mins = Math.round((new Date(inv.expires_at) - new Date()) / 60000);
                  if (mins <= 0) return 'Expired';
                  if (mins < 60) return `${mins}m left`;
                  return `${Math.round(mins / 60)}h left`;
                })() : null;

                return (
                  <div key={inv.id} className={`p-4 rounded-lg border ${isExpired ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-gray-900">{invEvent.name}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-gray-600">
                          <span className="flex items-center space-x-1">
                            <Calendar size={13} />
                            <span>{eventDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                          </span>
                          {invEvent.time && (
                            <span className="flex items-center space-x-1">
                              <Clock size={13} />
                              <span>{formatTime(invEvent.time, timeFormat)}</span>
                            </span>
                          )}
                          {invEvent.venue && (
                            <span className="flex items-center space-x-1">
                              <MapPin size={13} />
                              <span>{invEvent.venue}</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-3 mt-2">
                          <span className="text-xs font-semibold text-white bg-gray-700 px-2 py-0.5 rounded-full">
                            {getPositionLabel(inv.position_key)}
                          </span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            spotsLeft <= 1 ? 'bg-red-100 text-red-700' :
                            spotsLeft <= 2 ? 'bg-orange-100 text-orange-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left
                          </span>
                          {expiresIn && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              isExpired ? 'bg-gray-100 text-gray-500' : 'bg-yellow-100 text-yellow-700'
                            }`}>
                              ⏱ {expiresIn}
                            </span>
                          )}
                        </div>
                        {/* Pay estimate */}
                        {paymentTrackingEnabled && eventPaymentSettings[inv.event_id] && (() => {
                          const s = eventPaymentSettings[inv.event_id];
                          const rateKey = getPayRateKey(inv.position_key);
                          const hourlyRate = payRates[rateKey] || payRates[inv.position_key] || 0;
                          const numHours = Number(s.hours) || 0;
                          const numMiles = Number(s.miles) || 0;
                          if (!hourlyRate || !numHours) return null;
                          const basePay = numHours * hourlyRate;
                          let travelPay = 0;
                          for (const tier of travelTiers) {
                            const min = Number(tier.min_miles ?? tier.minMiles ?? 0);
                            const max = Number(tier.max_miles ?? tier.maxMiles ?? 0);
                            const amt = Number(tier.pay_amount ?? tier.payAmount ?? tier.amount ?? 0);
                            if (numMiles >= min && numMiles <= max) { travelPay = amt; break; }
                          }
                          const lakeBonus = s.isLakeGeneva ? (bonuses['Lake Geneva'] || 15) : 0;
                          const subtotal = basePay + travelPay + lakeBonus;
                          const total = (s.isHoliday ? subtotal * (bonuses['Holiday Multiplier'] || 1.5) : subtotal).toFixed(0);
                          return (
                            <div className="mt-2 px-2 py-1.5 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
                              <span className="text-xs text-gray-600">
                                {numHours}h × ${hourlyRate}/hr
                                {travelPay > 0 && ` + $${travelPay} travel`}
                                {lakeBonus > 0 && ` + $${lakeBonus} LG`}
                              </span>
                              <span className="text-sm font-bold text-green-700">💰 ~${total}</span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    {!isExpired && (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleInviteResponse(inv, 'accepted')}
                          disabled={respondingInvite === inv.id}
                          className="flex-1 flex items-center justify-center space-x-1.5 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold transition-colors"
                        >
                          <CheckCircle size={15} />
                          <span>{respondingInvite === inv.id ? 'Accepting...' : 'Accept'}</span>
                        </button>
                        <button
                          onClick={() => handleInviteResponse(inv, 'declined')}
                          disabled={respondingInvite === inv.id}
                          className="flex-1 flex items-center justify-center space-x-1.5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white border border-red-600 rounded-lg text-sm font-medium transition-colors"
                        >
                          <XCircle size={15} />
                          <span>Decline</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Host Report Due Alert - Priority Banner */}
        {currentWorker.is_host && (() => {
          const reportsDue = pastAssignments.filter(a => {
            const event = a.event;
            return event &&
              event.host_worker_id === currentWorker.id &&
              !submittedReportEventIds.has(event.id);
          }).map(a => a.event)
            .filter((e, i, arr) => arr.findIndex(x => x.id === e.id) === i);

          if (reportsDue.length === 0) return null;

          return (
            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-900">
              <div className="flex items-center space-x-3 mb-4">
                <ClipboardList size={24} className="text-red-900" />
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    {reportsDue.length} Event Report{reportsDue.length !== 1 ? 's' : ''} Due
                  </h3>
                  <p className="text-sm text-gray-500">As the designated {getHostLabel()}, please submit attendance reports</p>
                </div>
              </div>
              <div className="space-y-3">
                {reportsDue.map(event => {
                  const eventDate = parseDateSafe(event.date);
                  return (
                    <div key={event.id} className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg">
                      <div>
                        <p className="font-semibold text-gray-900">{event.name}</p>
                        <p className="text-sm text-gray-500">
                          {eventDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          {event.time && ` • ${formatTime(event.time, timeFormat)}`}
                          {event.venue && ` • ${event.venue}`}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setReportEvent(event);
                          setShowReportModal(true);
                        }}
                        className="bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 text-sm font-medium flex items-center space-x-2 flex-shrink-0 ml-3"
                      >
                        <ClipboardList size={14} />
                        <span>Submit Report</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
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
          travelTiers={travelTiers}
          bonuses={bonuses}
          locationPayRates={locationPayRates}
          locations={locations}
          getEffectiveRate={getEffectiveRate}
          onReloadAssignments={onReloadAssignments}
        />

        {/* Standby Events Section */}
        {standbyAssignments.length > 0 && (
          <div className="bg-white rounded-lg shadow p-4">
            <div className="mb-3">
              <div className="flex items-center space-x-2 mb-0.5">
                <h3 className="text-lg font-bold text-gray-900">Standby List</h3>
                <span className="bg-orange-100 text-orange-800 text-xs font-medium px-2 py-0.5 rounded-full">
                  {standbyAssignments.length} Event{standbyAssignments.length !== 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-xs text-gray-500">You'll be notified if a spot opens up</p>
            </div>

            <div className="space-y-2">
              {standbyAssignments.map(assignment => {
                const eventDate = parseDateSafe(assignment.event.date);
                return (
                  <div key={assignment.id} className="border border-orange-200 bg-orange-50 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <h4 className="font-bold text-gray-900 text-sm">{assignment.event.name}</h4>
                          <span className="bg-orange-200 text-orange-800 text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                            #{assignment.standbyPosition} in line
                          </span>
                        </div>
                        <div className="flex flex-col gap-1 text-sm text-gray-600">
                          <div className="flex items-center space-x-1">
                            <Calendar size={13} className="flex-shrink-0" />
                            <span>{eventDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Clock size={13} className="flex-shrink-0" />
                            <span>{formatTime(assignment.event.time, timeFormat)}{assignment.event.end_time ? ` - ${formatTime(assignment.event.end_time, timeFormat)}` : ''}</span>
                          </div>
                          {assignment.event.venue && (
                            <div className="flex items-center space-x-1">
                              <MapPin size={13} className="flex-shrink-0" />
                              <span className="truncate">{assignment.event.venue}</span>
                            </div>
                          )}
                        </div>
                        <div className="mt-2">
                          <span className="text-xs font-semibold text-orange-700 bg-orange-100 px-2 py-0.5 rounded">
                            {getPositionLabel(assignment.position)}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          if (!confirm('Remove yourself from the standby list for this event?')) return;
                          try {
                            await supabase.from('assignments').delete().eq('id', assignment.id);
                            onReloadAssignments();
                          } catch (e) {
                            alert('Error removing from standby: ' + e.message);
                          }
                        }}
                        className="flex-shrink-0 text-gray-300 hover:text-red-500 transition-colors p-1"
                        title="Leave standby list"
                      >
                        <XCircle size={20} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
                  onClick={() => { setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1)); setSelectedEventModal(null); }}
                  className="p-2 hover:bg-gray-100 rounded"
                >
                  <ChevronDown size={20} className="transform rotate-90" />
                </button>
                <h4 className="text-lg font-semibold">
                  {selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </h4>
                <button
                  onClick={() => { setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1)); setSelectedEventModal(null); }}
                  className="p-2 hover:bg-gray-100 rounded"
                >
                  <ChevronDown size={20} className="transform -rotate-90" />
                </button>
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1">
                {['S','M','T','W','T','F','S'].map((day, i) => (
                  <div key={i} className="text-center text-xs font-semibold text-gray-500 py-1">
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
                  
                  for (let i = 0; i < firstDay; i++) {
                    days.push(<div key={`empty-${i}`} className="aspect-square"></div>);
                  }
                  
                  for (let day = 1; day <= daysInMonth; day++) {
                    const currentDate = new Date(year, month, day);
                    currentDate.setHours(0, 0, 0, 0);
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    
                    const dayAssignments = workerAssignments
                      .filter(a => {
                        if (!a.event || !a.event.date) return false;
                        return a.event.date.split('T')[0] === dateStr;
                      })
                      .sort((a, b) => (a.event.time || '').localeCompare(b.event.time || ''));
                    
                    const isToday = currentDate.getTime() === today.getTime();
                    const isPast = currentDate < today;
                    const hasEvents = dayAssignments.length > 0;
                    const isSelected = selectedEventModal && selectedEventModal[0]?.event?.date?.split('T')[0] === dateStr;
                    
                    days.push(
                      <div
                        key={day}
                        onClick={() => {
                          if (hasEvents) {
                            setSelectedEventModal(isSelected ? null : dayAssignments);
                          }
                        }}
                        className={`aspect-square border rounded-lg p-1 ${
                          isToday ? 'border-red-500 border-2 bg-red-50' :
                          isSelected ? 'border-blue-400 border-2 bg-blue-50' :
                          isPast ? 'bg-gray-50 border-gray-100' :
                          'border-gray-200 hover:bg-gray-50'
                        } ${hasEvents ? 'cursor-pointer' : ''} overflow-hidden`}
                      >
                        <div className={`text-xs font-semibold mb-0.5 ${isToday ? 'text-red-600' : isPast ? 'text-gray-400' : 'text-gray-900'}`}>{day}</div>
                        {dayAssignments.length > 0 && (
                          <div className="space-y-0.5">
                            {dayAssignments.slice(0, 2).map((assignment, idx) => (
                              <React.Fragment key={idx}>
                                <div
                                  className="text-white bg-blue-500 rounded truncate block sm:hidden"
                                  style={{ fontSize: '9px', padding: '2px 3px', lineHeight: 1.2 }}
                                >
                                  {formatTime(assignment.event.time, timeFormat)}
                                </div>
                                <div
                                  className="text-white bg-blue-500 rounded truncate text-xs px-1 py-0.5 leading-snug hidden sm:block"
                                >
                                  {formatTime(assignment.event.time, timeFormat)} · {assignment.event.name}
                                </div>
                              </React.Fragment>
                            ))}
                            {dayAssignments.length > 2 && (
                              <div style={{ fontSize: '9px' }} className="text-gray-500 leading-none">
                                +{dayAssignments.length - 2}
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

              {/* Selected Day Detail Panel */}
              {selectedEventModal && selectedEventModal.length > 0 && (
                <div className="mt-3 border-t pt-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {parseDateSafe(selectedEventModal[0].event.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </p>
                  {selectedEventModal.map((assignment, idx) => (
                    <div key={idx} className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="font-bold text-gray-900 text-sm">{assignment.event.name}</p>
                      <div className="flex flex-wrap gap-x-3 mt-1 text-xs text-gray-600">
                        {assignment.event.time && (
                          <span className="flex items-center gap-1">
                            <Clock size={11} />
                            {formatTime(assignment.event.time, timeFormat)}{assignment.event.end_time ? ` – ${formatTime(assignment.event.end_time, timeFormat)}` : ''}
                          </span>
                        )}
                        {assignment.event.venue && (
                          <span className="flex items-center gap-1">
                            <MapPin size={11} />
                            {assignment.event.venue}
                          </span>
                        )}
                      </div>
                      <span className="inline-block mt-1.5 text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded font-medium">
                        {getPositionLabel(assignment.position)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Legend */}
              <div className="mt-4 flex items-center justify-center space-x-4 text-xs">
                <div className="flex items-center space-x-1.5">
                  <div className="w-3.5 h-3.5 border-2 border-red-500 rounded"></div>
                  <span className="text-gray-500">Today</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                  <span className="text-gray-500">Your Events</span>
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

                    {/* Meeting Point */}
                    {assignment.event.meeting_point_description && (
                      <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm font-semibold text-blue-900 mb-1">📍 Meeting Point</p>
                        <p className="text-sm text-blue-800">{assignment.event.meeting_point_description}</p>
                        {assignment.event.meeting_point_url && (
                          <a href={assignment.event.meeting_point_url} target="_blank" rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium mt-1 inline-flex items-center space-x-1">
                            <MapPin size={13} /><span>Open Meeting Point in Maps</span>
                          </a>
                        )}
                      </div>
                    )}

                    {/* Check-in Button */}
                    {(() => {
                      const now = new Date();
                      const [ey, em, ed] = (assignment.event.date || '').split('-').map(Number);
                      const [sh, sm] = (assignment.event.time || '00:00').split(':').map(Number);
                      const shiftStart = new Date(ey, em - 1, ed, sh, sm, 0);
                      const hoursUntil = (shiftStart - now) / (1000 * 60 * 60);
                      const canCheckIn = hoursUntil <= 1 && hoursUntil > -8; // within 1hr before, up to 8hrs after
                      const existingCheckIn = checkIns[assignment.id];
                      const isLoading = checkingIn[assignment.id];
                      const showManual = showManualCheckIn[assignment.id];

                      if (!canCheckIn && !existingCheckIn) return null;

                      return (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          {existingCheckIn ? (
                            <div className="flex items-center space-x-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                              <span className="text-green-600 text-lg">✓</span>
                              <div>
                                <p className="text-sm font-semibold text-green-800">Checked In</p>
                                <p className="text-xs text-green-600">
                                  {new Date(existingCheckIn.checked_in_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                  {' · '}{existingCheckIn.method === 'geo' ? '📍 GPS verified' : '✋ Manual'}
                                  {existingCheckIn.flagged && existingCheckIn.method !== 'geo' && ' · ⚠ Flagged for review'}
                                </p>
                              </div>
                            </div>
                          ) : showManual ? (
                            <div className="space-y-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                              <p className="text-sm font-semibold text-amber-800">Manual Check-in</p>
                              <p className="text-xs text-amber-600">You appear to be outside the check-in zone or GPS is unavailable. Your check-in will be flagged for admin review.</p>
                              <textarea
                                value={manualNotes[assignment.id] || ''}
                                onChange={e => setManualNotes(prev => ({ ...prev, [assignment.id]: e.target.value }))}
                                placeholder="Optional: explain your location (e.g. 'At the back entrance as instructed')"
                                rows={2}
                                className="w-full px-3 py-2 border border-amber-300 rounded text-sm focus:ring-2 focus:ring-amber-400 bg-white"
                              />
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => handleManualCheckIn(assignment)}
                                  disabled={isLoading}
                                  className="flex-1 bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
                                >
                                  {isLoading ? 'Checking in...' : 'Submit Manual Check-in'}
                                </button>
                                <button
                                  onClick={() => setShowManualCheckIn(prev => ({ ...prev, [assignment.id]: false }))}
                                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleCheckIn(assignment)}
                              disabled={isLoading}
                              className="w-full bg-green-600 text-white px-4 py-3 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center space-x-2"
                            >
                              {isLoading ? (
                                <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div><span>Locating...</span></>
                              ) : (
                                <><span>✓</span><span>Check In Now</span></>
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })()}

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
        </>
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

                        {/* Meeting Point */}
                    {assignment.event.meeting_point_description && (
                      <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm font-semibold text-blue-900 mb-1">📍 Meeting Point</p>
                        <p className="text-sm text-blue-800">{assignment.event.meeting_point_description}</p>
                        {assignment.event.meeting_point_url && (
                          <a href={assignment.event.meeting_point_url} target="_blank" rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium mt-1 inline-flex items-center space-x-1">
                            <MapPin size={13} /><span>Open Meeting Point in Maps</span>
                          </a>
                        )}
                      </div>
                    )}

                    {/* Check-in Button */}
                    {(() => {
                      const now = new Date();
                      const [ey, em, ed] = (assignment.event.date || '').split('-').map(Number);
                      const [sh, sm] = (assignment.event.time || '00:00').split(':').map(Number);
                      const shiftStart = new Date(ey, em - 1, ed, sh, sm, 0);
                      const hoursUntil = (shiftStart - now) / (1000 * 60 * 60);
                      const canCheckIn = hoursUntil <= 1 && hoursUntil > -8; // within 1hr before, up to 8hrs after
                      const existingCheckIn = checkIns[assignment.id];
                      const isLoading = checkingIn[assignment.id];
                      const showManual = showManualCheckIn[assignment.id];

                      if (!canCheckIn && !existingCheckIn) return null;

                      return (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          {existingCheckIn ? (
                            <div className="flex items-center space-x-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                              <span className="text-green-600 text-lg">✓</span>
                              <div>
                                <p className="text-sm font-semibold text-green-800">Checked In</p>
                                <p className="text-xs text-green-600">
                                  {new Date(existingCheckIn.checked_in_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                  {' · '}{existingCheckIn.method === 'geo' ? '📍 GPS verified' : '✋ Manual'}
                                  {existingCheckIn.flagged && existingCheckIn.method !== 'geo' && ' · ⚠ Flagged for review'}
                                </p>
                              </div>
                            </div>
                          ) : showManual ? (
                            <div className="space-y-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                              <p className="text-sm font-semibold text-amber-800">Manual Check-in</p>
                              <p className="text-xs text-amber-600">You appear to be outside the check-in zone or GPS is unavailable. Your check-in will be flagged for admin review.</p>
                              <textarea
                                value={manualNotes[assignment.id] || ''}
                                onChange={e => setManualNotes(prev => ({ ...prev, [assignment.id]: e.target.value }))}
                                placeholder="Optional: explain your location (e.g. 'At the back entrance as instructed')"
                                rows={2}
                                className="w-full px-3 py-2 border border-amber-300 rounded text-sm focus:ring-2 focus:ring-amber-400 bg-white"
                              />
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => handleManualCheckIn(assignment)}
                                  disabled={isLoading}
                                  className="flex-1 bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
                                >
                                  {isLoading ? 'Checking in...' : 'Submit Manual Check-in'}
                                </button>
                                <button
                                  onClick={() => setShowManualCheckIn(prev => ({ ...prev, [assignment.id]: false }))}
                                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleCheckIn(assignment)}
                              disabled={isLoading}
                              className="w-full bg-green-600 text-white px-4 py-3 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center space-x-2"
                            >
                              {isLoading ? (
                                <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div><span>Locating...</span></>
                              ) : (
                                <><span>✓</span><span>Check In Now</span></>
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })()}

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
      

      {/* Host: Post-Event Report Modal */}
      {showReportModal && reportEvent && (
        <PostEventReportModal
          open={showReportModal}
          event={reportEvent}
          assignments={assignments}
          workers={workers}
          submittedBy={currentWorker.id}
          timeFormat={timeFormat}
          onClose={() => {
            setShowReportModal(false);
            setReportEvent(null);
          }}
          onSuccess={() => {
            // Mark this event as submitted so it disappears from the list
            setSubmittedReportEventIds(prev => new Set([...prev, reportEvent.id]));
            setShowReportModal(false);
            setReportEvent(null);
          }}
        />
      )}
      </div>
    );
}
