import React, { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, Users, User, Phone, Plus, Edit, Trash2, Archive, Send, SlidersHorizontal, ChevronDown, AlertCircle, Shirt, FileText, ParkingCircle } from 'lucide-react';
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
  workers = [],
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
  const [expandedRows, setExpandedRows] = useState({});
  const [staffingFilter, setStaffingFilter] = useState('all'); // 'all' | 'understaffed' | 'full'

  const toggleRow = (eventId) => setExpandedRows(prev => ({ ...prev, [eventId]: !prev[eventId] }));

  const getWorkerName = (workerId) => {
    const w = workers.find(w => String(w.id) === String(workerId));
    return w ? w.name : 'Unknown';
  };
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


      {/* Quick filter bar */}
      <div style={{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center',marginBottom:'4px'}}>
        {['all','understaffed','full'].map(f => (
          <button key={f} onClick={() => setStaffingFilter(f)}
            style={{height:'32px',padding:'0 12px',borderRadius:'6px',border:'0.5px solid',fontSize:'12px',fontWeight:'500',cursor:'pointer',
              background: staffingFilter===f ? '#111827' : 'white',
              color: staffingFilter===f ? 'white' : '#6b7280',
              borderColor: staffingFilter===f ? '#111827' : '#d1d5db'
            }}>
            {f==='all' ? 'All' : f==='understaffed' ? 'Understaffed' : 'Fully staffed'}
          </button>
        ))}
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{height:'32px',padding:'0 8px',borderRadius:'6px',border:'0.5px solid #d1d5db',fontSize:'12px',color:'#6b7280',background:'white',cursor:'pointer',marginLeft:'auto'}}>
          <option value="date">Date ↑</option>
          <option value="date-desc">Date ↓</option>
          <option value="staffing">Staffing % ↑</option>
          <option value="staffing-desc">Staffing % ↓</option>
        </select>
      </div>

      {scopedEvents.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Events Yet</h3>
          <p className="text-gray-600 mb-4">Create your first casino party event to get started!</p>
          <button onClick={onShowAddEvent} className="bg-red-900 text-white px-6 py-2 rounded-lg hover:bg-red-800">
            Create Event
          </button>
        </div>
      ) : sortedEvents.filter(event => {
          if (staffingFilter === 'all') return true;
          const s = getEventStaffingStatus(event);
          if (staffingFilter === 'full') return s.total > 0 && s.filled >= s.total;
          if (staffingFilter === 'understaffed') return s.total === 0 || s.filled < s.total;
          return true;
        }).length === 0 ? (
        <div style={{background:'white',borderRadius:'10px',border:'0.5px solid #e5e7eb',padding:'40px',textAlign:'center',color:'#9ca3af',fontSize:'14px'}}>
          No events match this filter.
        </div>
      ) : (
        (() => {
          // Group by month
          const filtered = sortedEvents.filter(event => {
            if (staffingFilter === 'all') return true;
            const s = getEventStaffingStatus(event);
            if (staffingFilter === 'full') return s.total > 0 && s.filled >= s.total;
            if (staffingFilter === 'understaffed') return s.total === 0 || s.filled < s.total;
            return true;
          });

          const groups = {};
          filtered.forEach(event => {
            const [ey, em] = (event.date || '').split('-').map(Number);
            const key = ey && em ? `${ey}-${String(em).padStart(2,'0')}` : 'Unknown';
            const label = ey && em ? new Date(ey, em-1, 1).toLocaleDateString('en-US', {month:'long', year:'numeric'}) : 'Unknown';
            if (!groups[key]) groups[key] = { label, events: [] };
            groups[key].events.push(event);
          });

          return (
            <div style={{border:'0.5px solid #e5e7eb',borderRadius:'10px',overflow:'hidden',background:'white'}}>
              {Object.keys(groups).sort().map((groupKey, gi) => {
                const { label, events: groupEvents } = groups[groupKey];
                return (
                  <div key={groupKey}>
                    {/* Month header */}
                    <div style={{fontSize:'11px',fontWeight:'500',color:'#9ca3af',textTransform:'uppercase',letterSpacing:'0.06em',padding:'8px 14px',background:'#f9fafb',borderTop: gi > 0 ? '0.5px solid #e5e7eb' : 'none'}}>
                      {label}
                    </div>
                    {groupEvents.map((event, ei) => {
                      const staffingStatus = getEventStaffingStatus(event);
                      const isFullyStaffed = staffingStatus.total > 0 && staffingStatus.filled >= staffingStatus.total;
                      const isExpanded = expandedRows[event.id];
                      const standbyCount = assignments.filter(a => a.event_id === event.id && a.status === 'standby').length;

                      // Parse date locally
                      const [ey, em, ed] = (event.date || '').split('-').map(Number);
                      const eventDate = ey ? new Date(ey, em-1, ed) : null;
                      const dateLabel = eventDate ? eventDate.toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'}) : '';

                      const today = new Date(); today.setHours(0,0,0,0);
                      const daysUntil = eventDate ? Math.round((eventDate - today) / 86400000) : null;

                      // Accent bar color
                      const accentColor = isFullyStaffed ? '#639922'
                        : daysUntil !== null && daysUntil <= 1 ? '#E24B4A'
                        : daysUntil !== null && daysUntil <= 7 ? '#EF9F27'
                        : staffingStatus.filled === 0 && staffingStatus.total > 0 ? '#E24B4A'
                        : '#EF9F27';

                      // Staffing badge
                      const staffBadgeBg = isFullyStaffed ? '#EAF3DE' : staffingStatus.filled === 0 ? '#FCEBEB' : '#FAEEDA';
                      const staffBadgeColor = isFullyStaffed ? '#3B6D11' : staffingStatus.filled === 0 ? '#A32D2D' : '#854F0B';

                      // Status badge
                      const statusColors = {
                        confirmed: {bg:'#EAF3DE',c:'#3B6D11'},
                        'needs-staff': {bg:'#FAEEDA',c:'#854F0B'},
                        completed: {bg:'#E6F1FB',c:'#185FA5'},
                        cancelled: {bg:'#FCEBEB',c:'#A32D2D'},
                        archived: {bg:'#F1EFE8',c:'#5F5E5A'},
                      };
                      const sc = statusColors[event.status] || {bg:'#F1EFE8',c:'#5F5E5A'};

                      return (
                        <div key={event.id} style={{borderTop: ei > 0 ? '0.5px solid #f3f4f6' : 'none'}}>
                          {/* Compact row */}
                          <div
                            onClick={() => toggleRow(event.id)}
                            style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 14px',cursor:'pointer',transition:'background 0.1s'}}
                            onMouseEnter={e => e.currentTarget.style.background='#f9fafb'}
                            onMouseLeave={e => e.currentTarget.style.background='transparent'}
                          >
                            {/* Urgency bar */}
                            <div style={{width:'3px',height:'34px',borderRadius:'2px',flexShrink:0,background:accentColor}} />
                            {/* Date */}
                            <div style={{fontSize:'11px',fontWeight:'500',color:'#6b7280',minWidth:'68px',flexShrink:0}}>{dateLabel}</div>
                            {/* Name */}
                            <div style={{fontSize:'13px',fontWeight:'500',color:'#111827',flex:1,minWidth:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{event.name}</div>
                            {/* Venue */}
                            <div style={{fontSize:'12px',color:'#9ca3af',flex:1,minWidth:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{event.venue || ''}</div>
                            {/* Badges */}
                            <div style={{display:'flex',gap:'5px',alignItems:'center',flexShrink:0}}>
                              {staffingStatus.total > 0 && (
                                <span style={{fontSize:'11px',fontWeight:'500',padding:'2px 7px',borderRadius:'6px',background:staffBadgeBg,color:staffBadgeColor,whiteSpace:'nowrap'}}>
                                  {staffingStatus.filled}/{staffingStatus.total} staffed
                                </span>
                              )}
                              <span style={{fontSize:'11px',fontWeight:'500',padding:'2px 7px',borderRadius:'6px',background:sc.bg,color:sc.c,whiteSpace:'nowrap'}}>
                                {event.status === 'needs-staff' ? 'Needs Staff' : event.status ? event.status.charAt(0).toUpperCase() + event.status.slice(1) : ''}
                              </span>
                              {standbyCount > 0 && (
                                <span style={{fontSize:'11px',fontWeight:'500',padding:'2px 7px',borderRadius:'6px',background:'#FAEEDA',color:'#854F0B',whiteSpace:'nowrap'}}>
                                  {standbyCount} standby
                                </span>
                              )}
                            </div>
                            {/* Quick assign */}
                            {!isFullyStaffed && (
                              <button
                                onClick={e => { e.stopPropagation(); onOpenAssignModal(event); }}
                                style={{fontSize:'11px',fontWeight:'500',padding:'3px 8px',borderRadius:'6px',border:'0.5px solid #bfdbfe',background:'#eff6ff',color:'#1e40af',cursor:'pointer',flexShrink:0,whiteSpace:'nowrap'}}
                              >Assign</button>
                            )}
                            {/* Chevron */}
                            <div style={{fontSize:'10px',color:'#9ca3af',flexShrink:0,transform:isExpanded?'rotate(180deg)':'none',transition:'transform 0.15s'}}>▼</div>
                          </div>

                          {/* Expanded panel */}
                          {isExpanded && (
                            <div style={{borderTop:'0.5px solid #f3f4f6',padding:'12px 14px 14px 27px',background:'#f9fafb'}}>

                              {/* Meta row — proper lucide icons */}
                              <div style={{display:'flex',gap:'14px',flexWrap:'wrap',marginBottom:'10px'}}>
                                {event.time && (
                                  <span style={{fontSize:'12px',color:'#6b7280',display:'flex',alignItems:'center',gap:'4px'}}>
                                    <Clock size={12}/>{formatTime(event.time, timeFormat)}{event.end_time ? ` – ${formatTime(event.end_time, timeFormat)}` : ''}
                                  </span>
                                )}
                                {event.client && (
                                  <span style={{fontSize:'12px',color:'#6b7280',display:'flex',alignItems:'center',gap:'4px'}}>
                                    <User size={12}/>{event.client}
                                  </span>
                                )}
                                {event.client_contact && (
                                  <span style={{fontSize:'12px',color:'#6b7280',display:'flex',alignItems:'center',gap:'4px'}}>
                                    <Phone size={12}/>{formatPhone(event.client_contact)}
                                  </span>
                                )}
                                {event.address && (
                                  <span style={{fontSize:'12px',color:'#6b7280',display:'flex',alignItems:'center',gap:'4px'}}>
                                    <MapPin size={12}/>{event.address}
                                  </span>
                                )}
                                {event.dress_code && (
                                  <span style={{fontSize:'12px',color:'#6b7280',display:'flex',alignItems:'center',gap:'4px'}}>
                                    <Shirt size={12}/>{event.dress_code}
                                  </span>
                                )}
                                {event.parking && (
                                  <span style={{fontSize:'12px',color:'#6b7280',display:'flex',alignItems:'center',gap:'4px'}}>
                                    <ParkingCircle size={12}/>{event.parking}
                                  </span>
                                )}
                                {event.notes && (
                                  <span style={{fontSize:'12px',color:'#6b7280',display:'flex',alignItems:'center',gap:'4px'}}>
                                    <FileText size={12}/>{event.notes}
                                  </span>
                                )}
                              </div>

                              {/* Staffing progress bar */}
                              {staffingStatus.total > 0 && (
                                <div style={{marginBottom:'10px'}}>
                                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'4px'}}>
                                    <span style={{fontSize:'11px',fontWeight:'500',color:'#6b7280'}}>Staffing</span>
                                    <span style={{fontSize:'11px',fontWeight:'500',color: isFullyStaffed ? '#3B6D11' : '#854F0B'}}>
                                      {staffingStatus.filled}/{staffingStatus.total} filled
                                    </span>
                                  </div>
                                  <div style={{height:'4px',background:'#e5e7eb',borderRadius:'2px',overflow:'hidden'}}>
                                    <div style={{
                                      height:'100%',
                                      width:`${Math.min(100, (staffingStatus.filled/staffingStatus.total)*100)}%`,
                                      background: isFullyStaffed ? '#639922' : staffingStatus.filled === 0 ? '#E24B4A' : '#EF9F27',
                                      borderRadius:'2px',
                                      transition:'width 0.3s'
                                    }}/>
                                  </div>
                                </div>
                              )}

                              {/* Divider */}
                              <div style={{height:'0.5px',background:'#e5e7eb',margin:'10px 0'}}/>

                              {/* Position tiles — compact */}
                              {event.positions && event.positions.length > 0 && (
                                <div style={{display:'flex',gap:'5px',flexWrap:'wrap',marginBottom:'12px'}}>
                                  {event.positions.map((pos, idx) => {
                                    const posKey = pos.key || getPositionKey(pos.name || pos);
                                    const posLabel = getPositionLabel(posKey);
                                    const count = pos.count || 1;
                                    const filledCount = assignments.filter(a =>
                                      a.event_id === event.id && ['approved','assigned'].includes(a.status) &&
                                      (a.position === posKey || a.position === pos.name || a.position === pos.key)
                                    ).length;
                                    const pendingCount = assignments.filter(a =>
                                      a.event_id === event.id && a.status === 'pending' &&
                                      (a.position === posKey || a.position === pos.name || a.position === pos.key)
                                    ).length;
                                    const openCount = Math.max(0, count - filledCount - pendingCount);
                                    const isFull = filledCount >= count;
                                    const tileKey = `${event.id}:${posKey}`;
                                    const isTileExpanded = expandedTiles[tileKey];
                                    const isActionable = pendingCount > 0 || openCount > 0;
                                    const pendingAssignments = assignments.filter(a =>
                                      a.event_id === event.id && a.status === 'pending' &&
                                      (a.position === posKey || a.position === pos.name || a.position === pos.key)
                                    );
                                    const filledAssignments = assignments.filter(a =>
                                      a.event_id === event.id && ['approved','assigned'].includes(a.status) &&
                                      (a.position === posKey || a.position === pos.name || a.position === pos.key)
                                    );
                                    const tileBg = isFull ? '#f0fdf4' : filledCount===0&&pendingCount===0 ? '#fff1f2' : '#fffbeb';
                                    const tileBorder = isFull ? '#bbf7d0' : filledCount===0&&pendingCount===0 ? '#fecdd3' : '#fde68a';
                                    const tileColor = isFull ? '#166534' : filledCount===0&&pendingCount===0 ? '#9f1239' : '#92400e';

                                    return (
                                      <div key={idx} style={{background:tileBg,border:`0.5px solid ${tileBorder}`,borderRadius:'6px',overflow:'hidden'}}>
                                        {/* Compact tile header */}
                                        <div
                                          style={{display:'flex',alignItems:'center',gap:'6px',padding:'5px 8px',cursor:isActionable?'pointer':'default'}}
                                          onClick={() => isActionable && toggleTile(event.id, posKey)}
                                        >
                                          <span style={{fontSize:'12px',fontWeight:'500',color:tileColor}}>{posLabel}</span>
                                          <span style={{fontSize:'11px',fontWeight:'600',padding:'1px 5px',borderRadius:'4px',background:tileBorder,color:tileColor}}>{filledCount}/{count}</span>
                                          {pendingCount > 0 && <span style={{fontSize:'10px',padding:'1px 4px',borderRadius:'4px',background:'#fef9c3',color:'#854d0e'}}>{pendingCount} pending</span>}
                                          {openCount > 0 && <span style={{fontSize:'10px',padding:'1px 4px',borderRadius:'4px',background:'#fee2e2',color:'#9f1239'}}>{openCount} open</span>}
                                          {isFull && !isActionable && <span style={{fontSize:'10px',color:'#166534'}}>✓</span>}
                                          {isActionable && <span style={{fontSize:'9px',color:'#9ca3af'}}>{isTileExpanded?'▲':'▼'}</span>}
                                        </div>
                                        {/* Expanded tile detail */}
                                        {isTileExpanded && (
                                          <div style={{borderTop:`0.5px solid ${tileBorder}`,padding:'6px 8px',background:'rgba(255,255,255,0.7)',display:'flex',flexDirection:'column',gap:'4px'}}>
                                            {filledAssignments.map(a => (
                                              <div key={a.id} style={{display:'flex',alignItems:'center',gap:'5px',fontSize:'11px',color:'#166534'}}>
                                                <span style={{width:'5px',height:'5px',borderRadius:'50%',background:'#22c55e',flexShrink:0,display:'inline-block'}}/>
                                                {getWorkerName(a.worker_id)}
                                              </div>
                                            ))}
                                            {pendingAssignments.map(a => (
                                              <div key={a.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'4px',padding:'3px 5px',borderRadius:'4px',background:'#fefce8',border:'0.5px solid #fde68a'}}>
                                                <span style={{fontSize:'11px',color:'#854d0e',fontWeight:'500'}}>{getWorkerName(a.worker_id)}</span>
                                                <div style={{display:'flex',gap:'3px',flexShrink:0}}>
                                                  <button disabled={processingApproval===a.id} onClick={e=>{e.stopPropagation();handleQuickApprove(a.id,'approve');}} style={{fontSize:'10px',fontWeight:'500',padding:'1px 6px',borderRadius:'4px',border:'none',cursor:'pointer',background:'#dcfce7',color:'#166534'}}>✓ Approve</button>
                                                  <button disabled={processingApproval===a.id} onClick={e=>{e.stopPropagation();handleQuickApprove(a.id,'reject');}} style={{fontSize:'10px',fontWeight:'500',padding:'1px 6px',borderRadius:'4px',border:'none',cursor:'pointer',background:'#fee2e2',color:'#9f1239'}}>✗ Reject</button>
                                                </div>
                                              </div>
                                            ))}
                                            {openCount > 0 && (
                                              <button onClick={e=>{e.stopPropagation();onOpenInviteModal&&onOpenInviteModal(event,posKey);}} style={{fontSize:'11px',fontWeight:'500',padding:'3px 8px',borderRadius:'4px',border:'0.5px solid #bfdbfe',background:'#eff6ff',color:'#1e40af',cursor:'pointer',textAlign:'center'}}>
                                                + Invite for {posLabel}
                                              </button>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Action buttons — delete separated and less prominent */}
                              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                                <div style={{display:'flex',gap:'6px'}}>
                                  <button onClick={e=>{e.stopPropagation();onOpenAssignModal(event);}} style={{fontSize:'12px',fontWeight:'500',padding:'5px 12px',borderRadius:'6px',border:'none',background:'#7c1d1d',color:'white',cursor:'pointer'}}>Assign Staff</button>
                                  <button onClick={e=>{e.stopPropagation();onOpenInviteModal&&onOpenInviteModal(event);}} style={{fontSize:'12px',fontWeight:'500',padding:'5px 12px',borderRadius:'6px',border:'0.5px solid #bfdbfe',background:'#eff6ff',color:'#1e40af',cursor:'pointer'}}>Invite Workers</button>
                                  <button onClick={e=>{e.stopPropagation();onOpenEditEvent(event);}} style={{fontSize:'12px',fontWeight:'500',padding:'5px 12px',borderRadius:'6px',border:'0.5px solid #e5e7eb',background:'white',color:'#374151',cursor:'pointer'}}>Edit</button>
                                </div>
                                {/* Delete — isolated right, muted styling */}
                                <button onClick={e=>{e.stopPropagation();onDeleteEvent(event.id);}} style={{fontSize:'11px',fontWeight:'400',padding:'4px 10px',borderRadius:'6px',border:'0.5px solid #e5e7eb',background:'transparent',color:'#9ca3af',cursor:'pointer'}}>Delete</button>
                              </div>

                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })()
      )}
    </div>
  );
}
