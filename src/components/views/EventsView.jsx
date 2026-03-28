import React, { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, Users, User, Phone, Plus, Edit, Trash2, Archive, Send, SlidersHorizontal, ChevronDown, AlertCircle } from 'lucide-react';
import { parseDateSafe, formatTime } from '../../utils/dateHelpers';
import { getPositionKey, getPositionLabel } from '../../utils/positionHelpers';
import { supabase } from '../../supabaseClient';


const formatPhone = (p) => {
  if (!p) return '';
  const d = p.replace(/[^0-9]/g, '');
  if (d.length === 10) return '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6);
  if (d.length === 11 && d[0] === '1') return '(' + d.slice(1,4) + ') ' + d.slice(4,7) + '-' + d.slice(7);
  return p;
};
export default function EventsView({
  events,
  assignments,
  timeFormat,
  onShowAddEvent,
  onOpenAssignModal,
  onOpenInviteModal,
  onOpenEditEvent,
  onDeleteEvent,
  onAutoArchive,
  activeLocation = 'all',
  onReloadAssignments
}) {
  const [statusFilter, setStatusFilter] = useState('active');
  const [dateRangeFilter, setDateRangeFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [locations, setLocations] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedTiles, setExpandedTiles] = useState({});
  const [processingApproval, setProcessingApproval] = useState(null);

  const toggleTile = (eventId, posKey) => {
    const key = `${eventId}:${posKey}`;
    setExpandedTiles(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleQuickApprove = async (assignmentId, action) => {
    setProcessingApproval(assignmentId);
    try {
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      await supabase.from('assignments').update({ status: newStatus }).eq('id', assignmentId);
      if (onReloadAssignments) onReloadAssignments();
    } catch(e) {
      alert('Error updating assignment');
    } finally {
      setProcessingApproval(null);
    }
  };

  // Scope events by global location context first
  const scopedEvents = activeLocation === 'all'
    ? events
    : events.filter(e => e.location_id === activeLocation);

  useEffect(() => {
    supabase
      .from('locations')
      .select('id, name, city, state')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setLocations(data || []));
  }, []);

  const getStatusColor = (status) => {
    switch(status) {
      case 'needs-staff': return 'bg-yellow-100 text-yellow-800';
      case 'confirmed': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'archived': return 'bg-gray-100 text-gray-600';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString) => {
    const date = parseDateSafe(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getEventStaffingStatus = (event) => {
    if (!event.positions || event.positions.length === 0) return { filled: 0, total: 0, percentage: 0 };
    
    // Count all assignments EXCEPT those with status='standby'
    const eventAssignments = assignments.filter(a => 
      a.event_id === event.id && 
      a.status !== 'standby'
    );
    const total = event.positions.reduce((sum, p) => sum + p.count, 0);
    const filled = eventAssignments.length;
    const percentage = total > 0 ? Math.round((filled / total) * 100) : 0;
    
    return { filled, total, percentage };
  };

  const openAssignModal = (event) => {
    onOpenAssignModal(event);
  };

  // Get date range for filtering
  const getDateRange = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (dateRangeFilter === 'this-week') {
      const weekEnd = new Date(today);
      weekEnd.setDate(today.getDate() + 7);
      return { start: today, end: weekEnd };
    } else if (dateRangeFilter === 'this-month') {
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { start: today, end: monthEnd };
    } else if (dateRangeFilter === 'next-30') {
      const thirtyDaysOut = new Date(today);
      thirtyDaysOut.setDate(today.getDate() + 30);
      return { start: today, end: thirtyDaysOut };
    }
    return null; // 'all'
  };

  // Comprehensive filtering
  const filteredEvents = scopedEvents.filter(event => {
    // Status filter
    if (statusFilter === 'active') {
      // "Active" means not archived
      if (event.status === 'archived') return false;
    } else if (statusFilter !== 'all') {
      if (statusFilter === 'needs-staff') {
        const staffing = getEventStaffingStatus(event);
        const isFullyStaffed = staffing.total > 0 && staffing.filled >= staffing.total;
        if (isFullyStaffed || event.status === 'archived') return false;
      } else if (event.status !== statusFilter) {
        return false;
      }
    }
    
    // Date range filter
    const dateRange = getDateRange();
    if (dateRange) {
      const eventDate = new Date(event.date);
      eventDate.setHours(0, 0, 0, 0);
      if (eventDate < dateRange.start || eventDate > dateRange.end) return false;
    }
    
    // Location filter
    if (locationFilter !== 'all') {
      if (event.location_id !== locationFilter) return false;
    }

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesName = event.name?.toLowerCase().includes(searchLower);
      const matchesVenue = event.venue?.toLowerCase().includes(searchLower);
      if (!matchesName && !matchesVenue) return false;
    }
    
    return true;
  });

  // Sorting
  const sortedEvents = [...filteredEvents].sort((a, b) => {
    if (sortBy === 'date') {
      return new Date(a.date) - new Date(b.date);
    } else if (sortBy === 'date-desc') {
      return new Date(b.date) - new Date(a.date);
    } else if (sortBy === 'name') {
      return (a.name || '').localeCompare(b.name || '');
    } else if (sortBy === 'staffing') {
      const aStaffing = getEventStaffingStatus(a).percentage;
      const bStaffing = getEventStaffingStatus(b).percentage;
      return aStaffing - bStaffing; // Low to high
    } else if (sortBy === 'staffing-desc') {
      const aStaffing = getEventStaffingStatus(a).percentage;
      const bStaffing = getEventStaffingStatus(b).percentage;
      return bStaffing - aStaffing; // High to low
    }
    return 0;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Events Management</h2>
          <p className="text-sm text-gray-600 mt-1">
            {sortedEvents.length} {sortedEvents.length === 1 ? 'event' : 'events'} found
          </p>
        </div>
        <button 
          onClick={onShowAddEvent}
          className="w-full sm:w-auto bg-red-900 text-white px-6 py-3 rounded-lg hover:bg-red-800 flex items-center justify-center space-x-2 transition-colors"
        >
          <Plus size={20} />
          <span>Create Event</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-lg shadow p-4 space-y-4">

        {/* Search + Filters toggle row (all screen sizes) */}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search events..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-3 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
            />
          </div>
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors flex-shrink-0 ${
              showFilters || statusFilter !== 'active' || dateRangeFilter !== 'all' || locationFilter !== 'all'
                ? 'bg-red-900 text-white border-red-900'
                : 'bg-white text-gray-700 border-gray-300'
            }`}
          >
            <SlidersHorizontal size={15} />
            Filters
            {(statusFilter !== 'active' || dateRangeFilter !== 'all' || locationFilter !== 'all') && (
              <span className="bg-white text-red-900 text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {[statusFilter !== 'active', dateRangeFilter !== 'all', locationFilter !== 'all'].filter(Boolean).length}
              </span>
            )}
          </button>
        </div>

        {/* Expanded filters (all screen sizes) */}
        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500">
                <option value="active">Active Events</option>
                <option value="all">All Events</option>
                <option value="needs-staff">Needs Staff</option>
                <option value="confirmed">Confirmed</option>
                <option value="cancelled">Cancelled</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Date Range</label>
              <select value={dateRangeFilter} onChange={(e) => setDateRangeFilter(e.target.value)}
                className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500">
                <option value="all">All Time</option>
                <option value="next-30">Next 30 Days</option>
                <option value="this-week">Next 7 Days</option>
                <option value="this-month">This Month</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Sort By</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500">
                <option value="date">Date (Earliest First)</option>
                <option value="date-desc">Date (Latest First)</option>
                <option value="name">Name (A-Z)</option>
                <option value="staffing">Staffing (Low to High)</option>
                <option value="staffing-desc">Staffing (High to Low)</option>
              </select>
            </div>
            {locations.length > 1 && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Market</label>
                <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}
                  className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500">
                  <option value="all">All Markets</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}{loc.city ? ` — ${loc.city}` : ''}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Active Filters Summary */}
        {(statusFilter !== 'active' || dateRangeFilter !== 'all' || searchTerm || locationFilter !== 'all') && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-gray-600">Active filters:</span>
            {statusFilter !== 'active' && (
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                Status: {statusFilter === 'all' ? 'All Events' : statusFilter}
              </span>
            )}
            {dateRangeFilter !== 'all' && (
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                {dateRangeFilter === 'this-week' ? 'Next 7 Days' :
                 dateRangeFilter === 'this-month' ? 'This Month' : 'All Time'}
              </span>
            )}
            {locationFilter !== 'all' && (
              <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">
                Market: {locations.find(l => l.id === locationFilter)?.name || locationFilter}
              </span>
            )}
            {searchTerm && (
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                Search: "{searchTerm}"
              </span>
            )}
            <button
              onClick={() => {
                setStatusFilter('active');
                setDateRangeFilter('next-30');
                setLocationFilter('all');
                setSearchTerm('');
              }}
              className="text-red-600 hover:text-red-800 text-xs underline"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {scopedEvents.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Events Yet</h3>
          <p className="text-gray-600 mb-4">Create your first casino party event to get started!</p>
          <button 
            onClick={onShowAddEvent}
            className="bg-red-900 text-white px-6 py-2 rounded-lg hover:bg-red-800"
          >
            Create Event
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {sortedEvents.map(event => {
            const staffingStatus = getEventStaffingStatus(event);
            const isFullyStaffed = staffingStatus.filled >= staffingStatus.total && staffingStatus.total > 0;
            const standbyCount = assignments.filter(a => a.event_id === event.id && a.status === 'standby').length;
            
            return (
            <div key={event.id} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow">
              <div className="p-4 md:p-6">

                {/* Mobile-friendly header */}
                <div className="mb-4">
                  {/* Row 1: Name + icon buttons */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-xl font-bold text-gray-900 leading-tight">{event.name}</h3>
                    <div className="flex items-center space-x-1 flex-shrink-0">
                      <button
                        onClick={() => onOpenInviteModal && onOpenInviteModal(event)}
                        className="text-purple-600 hover:text-purple-800 p-2 hover:bg-purple-50 rounded transition-colors"
                        title="Invite workers"
                      >
                        <Send size={18} />
                      </button>
                      <button 
                        onClick={() => onOpenEditEvent(event)}
                        className="text-blue-600 hover:text-blue-800 p-2 hover:bg-blue-50 rounded transition-colors"
                        title="Edit event"
                      >
                        <Edit size={18} />
                      </button>
                      <button 
                        onClick={() => onDeleteEvent(event.id)}
                        className="text-red-600 hover:text-red-800 p-2 hover:bg-red-50 rounded transition-colors"
                        title="Delete event"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  {/* Row 2: Status badges */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(event.status)}`}>
                      {event.status === 'needs-staff' ? 'Needs Staff' : event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                    </span>
                    {event.invite_only && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                        🔒 Invite Only
                      </span>
                    )}
                    {staffingStatus.total > 0 && (
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        isFullyStaffed
                          ? 'bg-green-100 text-green-800'
                          : staffingStatus.filled === 0
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {staffingStatus.filled}/{staffingStatus.total} staffed
                      </span>
                    )}
                    {standbyCount > 0 && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
                        {standbyCount} on standby
                      </span>
                    )}
                  </div>
                  {/* Row 3: Assign Staff - full width on mobile */}
                  <button 
                    onClick={() => openAssignModal(event)}
                    className="w-full sm:w-auto bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center justify-center space-x-2 text-sm font-medium"
                  >
                    <Users size={16} />
                    <span>Assign Staff</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="flex items-center space-x-2 text-gray-700">
                    <Calendar size={16} className="text-red-600" />
                    <span className="text-sm">{formatDate(event.date)}</span>
                  </div>
                  <div className="flex items-center space-x-2 text-gray-700">
                    <Clock size={16} className="text-red-600" />
                    <span className="text-sm">{formatTime(event.time, timeFormat)}{event.end_time ? ` - ${formatTime(event.end_time, timeFormat)}` : ''}</span>
                  </div>
                  <div className="flex items-center space-x-2 text-gray-700">
                    <MapPin size={16} className="text-red-600" />
                    <span className="text-sm">{event.venue}{event.room ? ` - ${event.room}` : ''}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-4">
                  {event.positions && event.positions.length > 0 && (
                    <div className="flex items-center space-x-1">
                      <Users size={16} />
                      <span>{event.positions.reduce((sum, p) => sum + p.count, 0)} workers needed</span>
                    </div>
                  )}
                  <div className="flex items-center space-x-1">
                    <User size={16} />
                    <span>{event.client}</span>
                  </div>
                  {event.client_contact && (
                    <div className="flex items-center space-x-1">
                      <Phone size={16} />
                      <span>{formatPhone(event.client_contact)}</span>
                    </div>
                  )}
                </div>

                {event.positions && event.positions.length > 0 && (
                  <div className="mb-4">
                    {/* Staffing alert badge */}
                    {(() => {
                      const now = new Date();
                      const [ey, em, ed] = (event.date || '').split('-').map(Number);
                      if (!ey) return null;
                      const eventDate = new Date(ey, em - 1, ed);
                      const daysUntil = Math.ceil((eventDate - new Date().setHours(0,0,0,0)) / (1000*60*60*24));
                      let hoursUntil = daysUntil * 24;
                      if (event.time) {
                        const [th, tm] = event.time.split(':').map(Number);
                        hoursUntil = (new Date(ey, em-1, ed, th, tm||0) - now) / (1000*60*60);
                      }
                      const is24h = hoursUntil >= 0 && hoursUntil <= 24;
                      const is7day = daysUntil <= 7 && daysUntil >= 0;
                      if (!is24h && !is7day) return null;

                      const unfilled = event.positions.filter(pos => {
                        const posKey = pos.key || pos.name;
                        const filled = assignments.filter(a =>
                          a.event_id === event.id &&
                          !['standby','rejected','cancelled','pending'].includes(a.status) &&
                          (a.position === posKey || a.position === pos.key || a.position === pos.name)
                        ).length;
                        return (pos.count || 1) - filled > 0;
                      });
                      if (unfilled.length === 0) return null;

                      return (
                        <div className={`flex items-start gap-2 px-3 py-2 rounded-lg mb-3 text-sm border ${
                          is24h
                            ? 'bg-red-50 border-red-200 text-red-800'
                            : 'bg-amber-50 border-amber-200 text-amber-800'
                        }`}>
                          <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                          <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:'6px'}}>
                            <strong>{is24h ? 'Under 24h' : `${daysUntil}d away`}</strong>
                            <span style={{color:'inherit',opacity:0.7}}>—</span>
                            {unfilled.map((p, i) => {
                              const posKey = p.key || p.name;
                              const filledC = assignments.filter(a =>
                                a.event_id === event.id &&
                                !['standby','rejected','cancelled','pending'].includes(a.status) &&
                                (a.position === posKey || a.position === p.key || a.position === p.name)
                              ).length;
                              const open = (p.count || 1) - filledC;
                              return (
                                <span key={i} style={{display:'inline-flex',alignItems:'center',gap:'3px',padding:'1px 7px',borderRadius:'6px',fontSize:'11px',fontWeight:'500',background: is24h ? 'rgba(185,28,28,0.12)' : 'rgba(146,64,14,0.12)'}}>
                                  {getPositionLabel(posKey)} <span style={{fontWeight:'700'}}>×{open}</span>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    <p className="text-xs text-gray-500 mb-2">Staff Needed:</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {event.positions.map((pos, idx) => {
                        const posKey = pos.key || getPositionKey(pos.name || pos);
                        const posLabel = getPositionLabel(posKey);
                        const count = pos.count || 1;
                        
                        // Count pending and standby for this position
                        const pendingCount = assignments.filter(a => 
                          a.event_id === event.id && 
                          a.status === 'pending' &&
                          (a.position === posKey || a.position === pos.name || a.position === pos.key)
                        ).length;
                        
                        const standbyCount = assignments.filter(a => 
                          a.event_id === event.id && 
                          a.status === 'standby' &&
                          (a.position === posKey || a.position === pos.name || a.position === pos.key)
                        ).length;
                        
                        // Count truly filled (approved/assigned) for this position
                        const filledCount = assignments.filter(a =>
                          a.event_id === event.id &&
                          ['approved','assigned'].includes(a.status) &&
                          (a.position === posKey || a.position === pos.name || a.position === pos.key)
                        ).length;
                        const openCount = Math.max(0, count - filledCount - pendingCount);
                        const isFull = filledCount >= count;
                        const tileKey = `${event.id}:${posKey}`;
                        const isTileExpanded = expandedTiles[tileKey];
                        const isActionable = pendingCount > 0 || openCount > 0;

                        // Get actual assignment records for expanded view
                        const pendingAssignments = assignments.filter(a =>
                          a.event_id === event.id && a.status === 'pending' &&
                          (a.position === posKey || a.position === pos.name || a.position === pos.key)
                        );
                        const filledAssignments = assignments.filter(a =>
                          a.event_id === event.id && ['approved','assigned'].includes(a.status) &&
                          (a.position === posKey || a.position === pos.name || a.position === pos.key)
                        );

                        return (
                        <div key={idx} style={{
                          background: isFull ? '#f0fdf4' : filledCount === 0 && pendingCount === 0 ? '#fff1f2' : '#fffbeb',
                          border: `0.5px solid ${isFull ? '#bbf7d0' : filledCount === 0 && pendingCount === 0 ? '#fecdd3' : '#fde68a'}`,
                          borderRadius: '8px',
                          overflow: 'hidden'
                        }}>
                          {/* Tile header — always visible, clickable if actionable */}
                          <div
                            style={{padding:'8px 10px', cursor: isActionable ? 'pointer' : 'default'}}
                            onClick={() => isActionable && toggleTile(event.id, posKey)}
                          >
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'4px'}}>
                              <div style={{display:'flex',alignItems:'center',gap:'5px'}}>
                                <span style={{fontSize:'13px',fontWeight:'500',color: isFull ? '#166534' : filledCount === 0 && pendingCount === 0 ? '#9f1239' : '#92400e'}}>{posLabel}</span>
                                {isActionable && <span style={{fontSize:'10px',color: isTileExpanded ? '#6b7280' : '#3b82f6'}}>{isTileExpanded ? '▲' : '▼'}</span>}
                              </div>
                              <span style={{fontSize:'11px',fontWeight:'700',padding:'1px 6px',borderRadius:'6px',background: isFull ? '#bbf7d0' : filledCount === 0 && pendingCount === 0 ? '#fecdd3' : '#fde68a',color: isFull ? '#14532d' : filledCount === 0 && pendingCount === 0 ? '#881337' : '#78350f'}}>{filledCount}/{count}</span>
                            </div>
                            <div style={{display:'flex',gap:'4px',flexWrap:'wrap'}}>
                              {filledCount > 0 && <span style={{fontSize:'10px',padding:'1px 5px',borderRadius:'6px',background:'#dcfce7',color:'#166534'}}>{filledCount} filled</span>}
                              {pendingCount > 0 && <span style={{fontSize:'10px',padding:'1px 5px',borderRadius:'6px',background:'#fef9c3',color:'#854d0e'}}>{pendingCount} pending</span>}
                              {standbyCount > 0 && <span style={{fontSize:'10px',padding:'1px 5px',borderRadius:'6px',background:'#ffedd5',color:'#9a3412'}}>{standbyCount} standby</span>}
                              {openCount > 0 && <span style={{fontSize:'10px',padding:'1px 5px',borderRadius:'6px',background:'#fee2e2',color:'#9f1239'}}>{openCount} open</span>}
                              {isFull && openCount === 0 && pendingCount === 0 && <span style={{fontSize:'10px',padding:'1px 5px',borderRadius:'6px',background:'#dcfce7',color:'#166534'}}>✓ Full</span>}
                            </div>
                          </div>

                          {/* Expanded panel */}
                          {isTileExpanded && (
                            <div style={{borderTop:`0.5px solid ${isFull ? '#bbf7d0' : filledCount === 0 && pendingCount === 0 ? '#fecdd3' : '#fde68a'}`,padding:'8px 10px',display:'flex',flexDirection:'column',gap:'6px',background:'rgba(255,255,255,0.6)'}}>

                              {/* Filled workers */}
                              {filledAssignments.map(a => (
                                <div key={a.id} style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'12px',color:'#166534'}}>
                                  <span style={{width:'6px',height:'6px',borderRadius:'50%',background:'#22c55e',flexShrink:0,display:'inline-block'}}/>
                                  {a.worker_name || a.worker_id}
                                </div>
                              ))}

                              {/* Pending — approve/reject inline */}
                              {pendingAssignments.map(a => (
                                <div key={a.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'6px',padding:'4px 6px',borderRadius:'6px',background:'#fefce8',border:'0.5px solid #fde68a'}}>
                                  <span style={{fontSize:'12px',color:'#854d0e',fontWeight:'500'}}>{a.worker_name || a.worker_id}</span>
                                  <div style={{display:'flex',gap:'4px',flexShrink:0}}>
                                    <button
                                      disabled={processingApproval === a.id}
                                      onClick={(e) => { e.stopPropagation(); handleQuickApprove(a.id, 'approve'); }}
                                      style={{fontSize:'11px',fontWeight:'500',padding:'2px 8px',borderRadius:'6px',border:'none',cursor:'pointer',background:'#dcfce7',color:'#166534'}}
                                    >✓ Approve</button>
                                    <button
                                      disabled={processingApproval === a.id}
                                      onClick={(e) => { e.stopPropagation(); handleQuickApprove(a.id, 'reject'); }}
                                      style={{fontSize:'11px',fontWeight:'500',padding:'2px 8px',borderRadius:'6px',border:'none',cursor:'pointer',background:'#fee2e2',color:'#9f1239'}}
                                    >✗ Reject</button>
                                  </div>
                                </div>
                              ))}

                              {/* Open slots — invite button */}
                              {openCount > 0 && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); onOpenInviteModal && onOpenInviteModal(event, posKey); }}
                                  style={{fontSize:'12px',fontWeight:'500',padding:'4px 10px',borderRadius:'6px',border:'0.5px solid #bfdbfe',background:'#eff6ff',color:'#1e40af',cursor:'pointer',textAlign:'center'}}
                                >
                                  + Invite workers to {posLabel} ({openCount} open)
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {(event.dress_code || event.parking || event.address || event.notes) && (
                  <div className="mt-4 pt-4 border-t space-y-2 text-sm">
                    {event.dress_code && (
                      <p className="text-gray-600"><span className="font-semibold">Dress Code:</span> {event.dress_code}</p>
                    )}
                    {event.parking && (
                      <p className="text-gray-600"><span className="font-semibold">Parking:</span> {event.parking}</p>
                    )}
                    {event.address && (
                      <p className="text-gray-600"><span className="font-semibold">Address:</span> {event.address}</p>
                    )}
                    {event.notes && (
                      <p className="text-gray-600"><span className="font-semibold">Notes:</span> {event.notes}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
          })}
        </div>
      )}
    </div>
  );
}
