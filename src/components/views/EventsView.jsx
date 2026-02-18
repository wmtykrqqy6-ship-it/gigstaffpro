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
  const [showArchived, setShowArchived] = useState(false);

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
    
    const eventAssignments = assignments.filter(a => a.event_id === event.id);
    const total = event.positions.reduce((sum, p) => sum + p.count, 0);
    const filled = eventAssignments.length;
    const percentage = total > 0 ? Math.round((filled / total) * 100) : 0;
    
    return { filled, total, percentage };
  };

  const openAssignModal = (event) => {
    onOpenAssignModal(event);
  };

  // Filter events based on archived status
  const filteredEvents = events.filter(event => {
    const isArchived = event.status === 'archived';
    return showArchived ? isArchived : !isArchived;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Events Management</h2>
          <p className="text-sm text-gray-600 mt-1">
            {showArchived 
              ? `${filteredEvents.length} archived events` 
              : `${filteredEvents.length} active events`}
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors ${
              showArchived 
                ? 'bg-gray-600 text-white hover:bg-gray-700' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            <Archive size={18} />
            <span>{showArchived ? 'Show Active Events' : 'Show Archived Events'}</span>
          </button>
          <button 
            onClick={onShowAddEvent}
            className="bg-red-900 text-white px-6 py-3 rounded-lg hover:bg-red-800 flex items-center space-x-2 transition-colors"
          >
            <Plus size={20} />
            <span>Create Event</span>
          </button>
        </div>
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
          {filteredEvents.map(event => {
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
                        
                        return (
                        <div key={idx} className="bg-red-50 text-red-900 text-sm px-3 py-2 rounded flex justify-between items-center">
                          <span className="font-medium">{posLabel}</span>
                          <span className="bg-red-200 px-2 py-0.5 rounded-full text-xs font-bold">{count}</span>
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
