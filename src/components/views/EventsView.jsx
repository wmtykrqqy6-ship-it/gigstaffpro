import React, { useState } from 'react';
import { Calendar, Clock, MapPin, Users, User, Phone, Plus, Edit, Trash2, Archive } from 'lucide-react';
import { parseDateSafe, formatTime } from '../../utils/dateHelpers';
import { getPositionKey, getPositionLabel } from '../../utils/positionHelpers';

export default function EventsView({
  events,
  assignments,
  timeFormat,
  onShowAddEvent,
  onOpenAssignModal,
  onOpenEditEvent,
  onDeleteEvent,
  onAutoArchive
}) {
  const [statusFilter, setStatusFilter] = useState('active'); // active filters out archived by default
  const [dateRangeFilter, setDateRangeFilter] = useState('next-30'); // Show next 30 days by default
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date'); // date, name, staffing

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
  const filteredEvents = events.filter(event => {
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
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Events Management</h2>
          <p className="text-sm text-gray-600 mt-1">
            {sortedEvents.length} {sortedEvents.length === 1 ? 'event' : 'events'} found
          </p>
        </div>
        <button 
          onClick={onShowAddEvent}
          className="bg-red-900 text-white px-6 py-3 rounded-lg hover:bg-red-800 flex items-center space-x-2 transition-colors"
        >
          <Plus size={20} />
          <span>Create Event</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Status Filter */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            >
              <option value="active">Active Events</option>
              <option value="all">All Events</option>
              <option value="needs-staff">Needs Staff</option>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {/* Date Range Filter */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Date Range</label>
            <select
              value={dateRangeFilter}
              onChange={(e) => setDateRangeFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            >
              <option value="next-30">Next 30 Days</option>
              <option value="this-week">Next 7 Days</option>
              <option value="this-month">This Month</option>
              <option value="all">All Time</option>
            </select>
          </div>

          {/* Sort By */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            >
              <option value="date">Date (Earliest First)</option>
              <option value="date-desc">Date (Latest First)</option>
              <option value="name">Name (A-Z)</option>
              <option value="staffing">Staffing (Low to High)</option>
              <option value="staffing-desc">Staffing (High to Low)</option>
            </select>
          </div>

          {/* Search */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              placeholder="Event name or venue..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Active Filters Summary */}
        {(statusFilter !== 'active' || dateRangeFilter !== 'next-30' || searchTerm) && (
          <div className="flex items-center space-x-2 text-sm">
            <span className="text-gray-600">Active filters:</span>
            {statusFilter !== 'active' && (
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                Status: {statusFilter === 'all' ? 'All Events' : statusFilter}
              </span>
            )}
            {dateRangeFilter !== 'next-30' && (
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                {dateRangeFilter === 'this-week' ? 'Next 7 Days' : 
                 dateRangeFilter === 'this-month' ? 'This Month' : 'All Time'}
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
                setSearchTerm('');
                setSortBy('date');
              }}
              className="text-red-600 hover:text-red-800 font-medium ml-2"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {events.length === 0 ? (
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
            
            return (
            <div key={event.id} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-xl font-bold text-gray-900">{event.name}</h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(event.status)}`}>
                        {event.status === 'needs-staff' ? 'Needs Staff' : event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                      </span>
                      {staffingStatus.total > 0 && (
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          isFullyStaffed ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                        }`}>
                          {staffingStatus.filled}/{staffingStatus.total} staffed
                        </span>
                      )}
                      {(() => {
                        // Count standby workers for this event
                        const standbyCount = assignments.filter(a => 
                          a.event_id === event.id && 
                          a.status === 'standby'
                        ).length;
                        
                        if (standbyCount > 0) {
                          return (
                            <span className="px-3 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                              {standbyCount} on standby
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button 
                      onClick={() => openAssignModal(event)}
                      className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center space-x-1 text-sm"
                      title="Assign workers"
                    >
                      <Users size={16} />
                      <span>Assign Staff</span>
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
                      <span>{event.client_contact}</span>
                    </div>
                  )}
                </div>

                {event.positions && event.positions.length > 0 && (
                  <div className="mb-4">
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
                        
                        return (
                        <div key={idx} className="bg-red-50 text-red-900 text-sm px-3 py-2 rounded">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-medium">{posLabel}</span>
                            <span className="bg-red-200 px-2 py-0.5 rounded-full text-xs font-bold">{count}</span>
                          </div>
                          {(pendingCount > 0 || standbyCount > 0) && (
                            <div className="text-xs text-gray-600 mt-1">
                              {pendingCount > 0 && <span>{pendingCount} pending</span>}
                              {pendingCount > 0 && standbyCount > 0 && <span>, </span>}
                              {standbyCount > 0 && <span className="text-orange-700">{standbyCount} standby</span>}
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
