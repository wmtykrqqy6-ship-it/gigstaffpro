import React, { useState, useEffect } from 'react';
import { X, Send, Clock, CheckCircle, XCircle, Users, Star, Shield, AlertCircle, UserCheck, RefreshCw } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { getPositionLabel, positionMatches } from '../../utils/positionHelpers';

export default function InviteWorkersModal({ open, event, workers, assignments, onClose, onReloadAssignments }) {
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [selectedRank, setSelectedRank] = useState(1);
  const [windowHours, setWindowHours] = useState(2);
  const [selectedWorkers, setSelectedWorkers] = useState(new Set());
  const [activeTab, setActiveTab] = useState('invite');
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [secondsSinceRefresh, setSecondsSinceRefresh] = useState(0);

  useEffect(() => {
    if (open && event) {
      loadInvitations();
      const positions = event.positions || [];
      for (const pos of positions) {
        const filled = (assignments || []).filter(a => a.event_id === event.id && a.position === pos.key).length;
        if (filled < pos.count) { setSelectedPosition(pos.key); break; }
      }
    }
  }, [open, event?.id]);

  useEffect(() => {
    if (!open || activeTab !== 'responses') return;
    const interval = setInterval(() => { loadInvitations(); }, 60000);
    return () => clearInterval(interval);
  }, [open, activeTab]);

  useEffect(() => {
    if (!lastRefreshed) return;
    const tick = setInterval(() => {
      setSecondsSinceRefresh(Math.floor((Date.now() - lastRefreshed) / 1000));
    }, 10000);
    return () => clearInterval(tick);
  }, [lastRefreshed]);

  const loadInvitations = async () => {
    setLoading(true);
    const { data } = await supabase.from('invitations').select('*').eq('event_id', event.id).order('invited_at', { ascending: false });
    setInvitations(data || []);
    setLastRefreshed(Date.now());
    setSecondsSinceRefresh(0);
    setLoading(false);
  };

  if (!open || !event) return null;

  const positions = event.positions || [];
  const assignedWorkerIds = new Set((assignments || []).filter(a => a.event_id === event.id).map(a => a.worker_id));
  const positionConfig = positions.find(p => p.key === selectedPosition);
  const totalSlots = positionConfig?.count || 0;
  const filledSlots = (assignments || []).filter(a => a.event_id === event.id && a.position === selectedPosition).length;
  const openSlots = Math.max(0, totalSlots - filledSlots);

  const positionInvites = invitations.filter(i => i.position === selectedPosition);
  const pendingInvites = positionInvites.filter(i => i.status === 'pending');
  const acceptedInvites = positionInvites.filter(i => i.status === 'accepted');
  const confirmedInvites = positionInvites.filter(i => i.status === 'confirmed');
  const declinedInvites = positionInvites.filter(i => i.status === 'declined');
  const standbyInvites = positionInvites.filter(i => i.status === 'standby');
  const invitedWorkerIds = new Set(positionInvites.filter(i => ['pending','accepted','confirmed','standby'].includes(i.status)).map(i => i.worker_id));

  const eligibleWorkers = (workers || [])
    .filter(w => {
      if (assignedWorkerIds.has(w.id)) return false;
      if (invitedWorkerIds.has(w.id)) return false;
      if (!w.skills || !Array.isArray(w.skills)) return false;
      if (!w.skills.some(skill => positionMatches(skill, selectedPosition))) return false;
      return true;
    })
    .sort((a, b) => (b.reliability ?? 5) - (a.reliability ?? 5));

  const workersByRank = {};
  for (let r = 1; r <= 5; r++) {
    workersByRank[r] = eligibleWorkers.filter(w => (w.rank || 1) === r);
  }

  const toggleWorker = (workerId) => {
    setSelectedWorkers(prev => {
      const next = new Set(prev);
      if (next.has(workerId)) next.delete(workerId); else next.add(workerId);
      return next;
    });
  };

  const selectAllRank = (rank) => {
    const rankWorkers = workersByRank[rank] || [];
    setSelectedWorkers(prev => {
      const next = new Set(prev);
      const allSelected = rankWorkers.every(w => next.has(w.id));
      if (allSelected) rankWorkers.forEach(w => next.delete(w.id));
      else rankWorkers.forEach(w => next.add(w.id));
      return next;
    });
  };

  const buildInviteRecords = (workerIds) => {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + windowHours);
    return workerIds.map(workerId => {
      const worker = workers.find(w => w.id === workerId);
      return { event_id: event.id, worker_id: workerId, position: selectedPosition, status: 'pending', rank_tier: worker?.rank || 1, window_hours: windowHours, expires_at: expiresAt.toISOString(), invited_at: new Date().toISOString() };
    });
  };

  const handleSendInvites = async () => {
    if (selectedWorkers.size === 0 || !selectedPosition) return;
    setSending(true);
    try {
      await supabase.from('invitations').insert(buildInviteRecords(Array.from(selectedWorkers)));
      setSelectedWorkers(new Set());
      await loadInvitations();
      setActiveTab('responses');
    } catch (err) { alert('Error sending invites: ' + err.message); }
    finally { setSending(false); }
  };

  const handleInviteAllRank = async (rank) => {
    const rankWorkers = workersByRank[rank] || [];
    if (rankWorkers.length === 0) return;
    setSending(true);
    try {
      await supabase.from('invitations').insert(buildInviteRecords(rankWorkers.map(w => w.id)));
      setSelectedWorkers(new Set());
      await loadInvitations();
      setActiveTab('responses');
    } catch (err) { alert('Error sending invites: ' + err.message); }
    finally { setSending(false); }
  };

  const handleConfirmWorker = async (invitation) => {
    setConfirming(invitation.id);
    try {
      await supabase.from('assignments').insert({ event_id: event.id, worker_id: invitation.worker_id, position: invitation.position, status: 'confirmed' });
      await supabase.from('invitations').update({ status: 'confirmed', responded_at: new Date().toISOString() }).eq('id', invitation.id);
      const otherAccepted = acceptedInvites.filter(i => i.id !== invitation.id);
      if (otherAccepted.length > 0) await supabase.from('invitations').update({ status: 'standby' }).in('id', otherAccepted.map(i => i.id));
      await loadInvitations();
      if (onReloadAssignments) onReloadAssignments();
    } catch (err) { alert('Error confirming worker: ' + err.message); }
    finally { setConfirming(null); }
  };

  const handleExpireAndCascade = async (rank) => {
    const toExpire = positionInvites.filter(i => i.status === 'pending' && i.rank_tier === rank);
    if (toExpire.length > 0) await supabase.from('invitations').update({ status: 'expired' }).in('id', toExpire.map(i => i.id));
    await loadInvitations();
    setSelectedRank(Math.min(5, rank + 1));
    setActiveTab('invite');
  };

  const getWorkerName = (id) => workers.find(w => w.id === id)?.name || 'Unknown';
  const getWorkerRank = (id) => workers.find(w => w.id === id)?.rank || 1;
  const getWorkerReliability = (id) => workers.find(w => w.id === id)?.reliability ?? 5.0;
  const isExpired = (inv) => inv.expires_at && new Date(inv.expires_at) < new Date();

  const formatExpiry = (inv) => {
    if (!inv.expires_at) return null;
    const exp = new Date(inv.expires_at);
    const now = new Date();
    if (exp < now) return 'Expired';
    const mins = Math.round((exp - now) / 60000);
    if (mins < 60) return `${mins}m left`;
    return `${Math.round(mins / 60)}h left`;
  };

  const formatLastRefreshed = () => {
    if (!lastRefreshed) return 'Loading...';
    if (secondsSinceRefresh < 10) return 'Updated just now · auto-refreshes every 60s';
    const m = Math.floor(secondsSinceRefresh / 60);
    const s = secondsSinceRefresh % 60;
    return `Updated ${m > 0 ? m + 'm ' : ''}${s}s ago · auto-refreshes every 60s`;
  };

  const totalAccepted = positionInvites.filter(i => i.status === 'accepted').length;
  const totalPending = positionInvites.filter(i => i.status === 'pending').length;
  const hasExpiredPending = pendingInvites.some(i => isExpired(i));
  const expiredRank = hasExpiredPending ? pendingInvites[0]?.rank_tier : null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Invite Workers</h2>
            <p className="text-sm text-gray-500">{event.name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X size={20} /></button>
        </div>

        <div className="px-6 py-3 border-b bg-gray-50 flex-shrink-0">
          <div className="flex items-center space-x-2 overflow-x-auto pb-1">
            {positions.map(pos => {
              const filled = (assignments || []).filter(a => a.event_id === event.id && a.position === pos.key).length;
              const open = pos.count - filled;
              const isFull = open <= 0;
              const hasAccepted = invitations.filter(i => i.position === pos.key && i.status === 'accepted').length > 0;
              return (
                <button key={pos.key} onClick={() => setSelectedPosition(pos.key)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center space-x-1.5 ${selectedPosition === pos.key ? 'bg-red-900 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                  <span>{getPositionLabel(pos.key)}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${selectedPosition === pos.key ? 'bg-red-700 text-white' : isFull ? 'bg-green-100 text-green-700' : hasAccepted ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                    {isFull ? '✓ Full' : `${open} open`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {!selectedPosition ? (
          <div className="flex-1 flex items-center justify-center p-10">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <Send size={22} className="text-gray-400" />
              </div>
              <p className="text-gray-500 font-medium">Select a position above to get started</p>
              <p className="text-xs text-gray-400 mt-1">Choose which role you want to invite workers for</p>
            </div>
          </div>
        ) : (
          <>
            <div className="px-6 py-2 border-b flex items-center justify-between flex-shrink-0">
              <div className="flex items-center space-x-4 text-sm">
                {openSlots <= 0 ? (
                  <span className="flex items-center space-x-1.5 text-green-700 font-medium">
                    <CheckCircle size={15} />
                    <span>This position is fully staffed ({filledSlots}/{totalSlots})</span>
                  </span>
                ) : (
                  <span className="text-gray-600">
                    <span className="font-bold text-gray-900">{openSlots}</span> open slot{openSlots !== 1 ? 's' : ''} · {filledSlots}/{totalSlots} filled for {getPositionLabel(selectedPosition)}
                  </span>
                )}
                {acceptedInvites.length > 0 && (
                  <span className="flex items-center space-x-1 text-green-700 font-medium"><CheckCircle size={14} /><span>{acceptedInvites.length} accepted</span></span>
                )}
                {pendingInvites.length > 0 && (
                  <span className="flex items-center space-x-1 text-yellow-700 font-medium"><Clock size={14} /><span>{pendingInvites.length} pending</span></span>
                )}
              </div>
              <button onClick={loadInvitations} className="p-1 hover:bg-gray-100 rounded text-gray-400">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="px-6 pt-3 flex space-x-1 flex-shrink-0">
              <button onClick={() => setActiveTab('invite')}
                className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${activeTab === 'invite' ? 'bg-white border border-b-white border-gray-200 text-red-900 -mb-px z-10' : 'text-gray-500 hover:text-gray-700'}`}>
                Send Invites
              </button>
              <button onClick={() => setActiveTab('responses')}
                className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors flex items-center space-x-1.5 ${activeTab === 'responses' ? 'bg-white border border-b-white border-gray-200 text-red-900 -mb-px z-10' : 'text-gray-500 hover:text-gray-700'}`}>
                <span>Responses</span>
                {(totalAccepted + totalPending) > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${totalAccepted > 0 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {totalAccepted > 0 ? `${totalAccepted} accepted` : `${totalPending} pending`}
                  </span>
                )}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto border-t border-gray-200">

              {activeTab === 'invite' && (
                <div className="p-6 space-y-4">
                  <div className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg">
                    <Clock size={16} className="text-gray-400 flex-shrink-0" />
                    <span className="text-sm text-gray-600">Response window:</span>
                    <select value={windowHours} onChange={e => setWindowHours(Number(e.target.value))}
                      className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-red-500">
                      <option value={0.5}>30 minutes</option>
                      <option value={1}>1 hour</option>
                      <option value={2}>2 hours</option>
                      <option value={4}>4 hours</option>
                      <option value={8}>8 hours</option>
                      <option value={24}>24 hours</option>
                    </select>
                    <span className="text-xs text-gray-400">Workers have this long to respond</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-gray-700">Invite Rank:</span>
                    {[1,2,3,4,5].map(r => (
                      <button key={r} onClick={() => setSelectedRank(r)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${selectedRank === r ? 'bg-red-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        R{r}{workersByRank[r]?.length > 0 && <span className="ml-1 text-xs opacity-75">({workersByRank[r].length})</span>}
                      </button>
                    ))}
                  </div>

                  {[1,2,3,4,5].filter(r => r === selectedRank).map(rank => {
                    const rankWorkers = workersByRank[rank] || [];
                    const allSelected = rankWorkers.length > 0 && rankWorkers.every(w => selectedWorkers.has(w.id));
                    return (
                      <div key={rank} className="border rounded-lg overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b">
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-gray-800">Rank {rank} Workers</span>
                            <span className="text-xs text-gray-500">({rankWorkers.length} eligible)</span>
                          </div>
                          {rankWorkers.length > 0 && (
                            <div className="flex items-center space-x-3">
                              <button onClick={() => selectAllRank(rank)} className="text-xs text-gray-500 hover:text-gray-700 font-medium">
                                {allSelected ? 'Deselect all' : 'Select all'}
                              </button>
                              <button onClick={() => handleInviteAllRank(rank)} disabled={sending}
                                className="text-xs bg-red-900 hover:bg-red-800 text-white px-2.5 py-1 rounded-lg font-medium disabled:opacity-50 transition-colors">
                                {sending ? 'Sending...' : `Invite All R${rank}`}
                              </button>
                            </div>
                          )}
                        </div>
                        {rankWorkers.length === 0 ? (
                          <div className="px-4 py-6 text-center text-gray-400 text-sm">No eligible Rank {rank} workers for this position</div>
                        ) : (
                          <div className="divide-y">
                            {rankWorkers.map(worker => {
                              const isSelected = selectedWorkers.has(worker.id);
                              const reliability = worker.reliability ?? 5.0;
                              const reliabilityColor = reliability >= 4.5 ? 'text-green-700' : reliability >= 3.5 ? 'text-yellow-600' : 'text-red-600';
                              return (
                                <div key={worker.id} onClick={() => toggleWorker(worker.id)}
                                  className={`flex items-center space-x-3 px-4 py-3 cursor-pointer transition-colors ${isSelected ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                                  <div className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${isSelected ? 'bg-red-900 border-red-900' : 'border-gray-300'}`}>
                                    {isSelected && <CheckCircle size={12} className="text-white" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center space-x-2">
                                      <span className="font-medium text-gray-900 text-sm">{worker.name}</span>
                                      {worker.is_host && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700">
                                          <Shield size={9} className="mr-0.5" />Host
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <span className={`flex items-center space-x-0.5 text-xs font-medium flex-shrink-0 ${reliabilityColor}`}>
                                    <Star size={11} className="fill-current" />
                                    <span>{reliability.toFixed(1)}</span>
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {invitedWorkerIds.size > 0 && (
                    <div className="text-xs text-gray-400 flex items-center space-x-1">
                      <AlertCircle size={12} />
                      <span>{invitedWorkerIds.size} worker{invitedWorkerIds.size !== 1 ? 's' : ''} already invited (hidden from list)</span>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'responses' && (
                <div className="p-6 space-y-5">
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span className="flex items-center space-x-1">
                      <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
                      <span>{loading ? 'Refreshing...' : formatLastRefreshed()}</span>
                    </span>
                    <button onClick={loadInvitations} className="hover:text-gray-600 underline">Refresh now</button>
                  </div>

                  {hasExpiredPending && expiredRank < 5 && (
                    <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-300 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <AlertCircle size={16} className="text-orange-500 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-bold text-orange-800">Rank {expiredRank} window has closed</p>
                          <p className="text-xs text-orange-600">{pendingInvites.filter(i => isExpired(i)).length} worker{pendingInvites.filter(i => isExpired(i)).length !== 1 ? 's' : ''} didn't respond — ready to notify Rank {expiredRank + 1}</p>
                        </div>
                      </div>
                      <button onClick={() => handleExpireAndCascade(expiredRank)}
                        className="flex-shrink-0 ml-3 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition-colors">
                        Notify Rank {expiredRank + 1} →
                      </button>
                    </div>
                  )}

                  {acceptedInvites.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-green-800 mb-2 flex items-center space-x-1.5">
                        <CheckCircle size={15} className="text-green-600" />
                        <span>Accepted — Confirm to Assign ({acceptedInvites.length})</span>
                      </h4>
                      <div className="space-y-2">
                        {acceptedInvites.map(inv => (
                          <div key={inv.id} className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                            <div>
                              <p className="font-semibold text-gray-900 text-sm">{getWorkerName(inv.worker_id)}</p>
                              <p className="text-xs text-gray-500">Rank {getWorkerRank(inv.worker_id)} · ⭐ {getWorkerReliability(inv.worker_id).toFixed(1)} · Accepted {inv.responded_at ? new Date(inv.responded_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</p>
                            </div>
                            <button onClick={() => handleConfirmWorker(inv)} disabled={confirming === inv.id}
                              className="flex items-center space-x-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                              <UserCheck size={14} />
                              <span>{confirming === inv.id ? 'Confirming...' : 'Confirm'}</span>
                            </button>
                          </div>
                        ))}
                      </div>
                      {openSlots <= 0 && (
                        <p className="text-xs text-orange-600 mt-1 flex items-center space-x-1">
                          <AlertCircle size={12} /><span>All slots filled — confirming will move others to standby</span>
                        </p>
                      )}
                    </div>
                  )}

                  {pendingInvites.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-yellow-800 mb-2 flex items-center space-x-1.5">
                        <Clock size={15} className="text-yellow-600" />
                        <span>Pending Response ({pendingInvites.length})</span>
                      </h4>
                      <div className="space-y-2">
                        {pendingInvites.map(inv => (
                          <div key={inv.id} className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <div>
                              <p className="font-semibold text-gray-900 text-sm">{getWorkerName(inv.worker_id)}</p>
                              <p className="text-xs text-gray-500">Rank {inv.rank_tier} · Invited {new Date(inv.invited_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                            </div>
                            <span className={`text-xs font-medium px-2 py-1 rounded-full ${isExpired(inv) ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {formatExpiry(inv)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {confirmedInvites.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-700 mb-2 flex items-center space-x-1.5">
                        <UserCheck size={15} className="text-gray-500" /><span>Confirmed ({confirmedInvites.length})</span>
                      </h4>
                      <div className="space-y-2">
                        {confirmedInvites.map(inv => (
                          <div key={inv.id} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
                            <p className="font-medium text-gray-700 text-sm">{getWorkerName(inv.worker_id)}</p>
                            <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">Assigned</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {standbyInvites.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-blue-700 mb-2 flex items-center space-x-1.5">
                        <Users size={15} className="text-blue-500" /><span>Standby ({standbyInvites.length})</span>
                      </h4>
                      <div className="space-y-2">
                        {standbyInvites.map(inv => (
                          <div key={inv.id} className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <div>
                              <p className="font-medium text-gray-800 text-sm">{getWorkerName(inv.worker_id)}</p>
                              <p className="text-xs text-gray-500">Accepted — moved to standby when slot filled</p>
                            </div>
                            <button onClick={() => handleConfirmWorker(inv)} disabled={confirming === inv.id} className="text-xs text-blue-700 hover:underline font-medium">Promote</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {declinedInvites.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-red-700 mb-2 flex items-center space-x-1.5">
                        <XCircle size={15} className="text-red-500" /><span>Declined ({declinedInvites.length})</span>
                      </h4>
                      <div className="space-y-1">
                        {declinedInvites.map(inv => (
                          <div key={inv.id} className="flex items-center justify-between px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
                            <p className="text-sm text-gray-600">{getWorkerName(inv.worker_id)}</p>
                            <span className="text-xs text-red-500">Rank {inv.rank_tier}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {positionInvites.length === 0 && (
                    <div className="text-center py-12">
                      <Send size={36} className="mx-auto text-gray-200 mb-3" />
                      <p className="text-gray-400 text-sm">No invites sent yet for this position</p>
                      <button onClick={() => setActiveTab('invite')} className="mt-2 text-xs text-red-600 hover:underline font-medium">Send invites →</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm font-medium">Close</button>
          {activeTab === 'invite' && selectedPosition && (
            openSlots <= 0 ? (
              <span className="flex items-center space-x-2 text-sm text-green-700 font-medium">
                <CheckCircle size={15} /><span>Position fully staffed — no invites needed</span>
              </span>
            ) : (
              <button onClick={handleSendInvites} disabled={selectedWorkers.size === 0 || sending}
                className="flex items-center space-x-2 px-5 py-2 bg-red-900 hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors">
                <Send size={15} />
                <span>{sending ? 'Sending...' : `Send ${selectedWorkers.size > 0 ? '(' + selectedWorkers.size + ')' : ''} Invite${selectedWorkers.size !== 1 ? 's' : ''}`}</span>
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
