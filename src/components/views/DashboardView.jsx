import React from 'react';
import { 
  Calendar, Users, DollarSign, AlertCircle, Plus, Clock, 
  Settings, History, MapPin 
} from 'lucide-react';
import { getPositionLabel } from '../../utils/positionHelpers';
import { formatTime } from '../../utils/dateHelpers';

export default function DashboardView({
  events,
  workers,
  assignments,
  timeFormat,
  onNavigate,
  onShowAddEvent,
  onShowAddWorker,
  onOpenAssignModal
}) {
  const upcomingEvents = events.filter(e => e.status !== 'completed' && e.status !== 'cancelled').length;
  const needStaffing = events.filter(e => {
    const eventAssignments = assignments.filter(a => a.event_id === e.id);
    const totalNeeded = e.positions?.reduce((sum, p) => sum + p.count, 0) || 0;
    const filled = eventAssignments.length;
    return filled < totalNeeded && totalNeeded > 0;
  }).length;

  // Get recent activity
  const getRecentActivity = () => {
    const activities = [];
    
    // Recent events (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    events.forEach(event => {
      const eventDate = new Date(event.created_at);
      if (eventDate >= sevenDaysAgo) {
        activities.push({
          type: 'event_created',
          date: event.created_at,
          message: `Event created: ${event.name}`,
          icon: Calendar,
          color: 'blue'
        });
      }
    });

    // Recent assignments (last 7 days)
    assignments.forEach(assignment => {
      const assignmentDate = new Date(assignment.created_at);
      if (assignmentDate >= sevenDaysAgo) {
        const worker = workers.find(w => w.id === assignment.worker_id);
        const event = events.find(e => e.id === assignment.event_id);
        if (worker && event) {
          activities.push({
            type: 'assignment',
            date: assignment.created_at,
            message: `${worker.name} assigned to ${event.name} as ${getPositionLabel(assignment.position)}`,
            icon: Users,
            color: 'green'
          });
        }
      }
    });

    // Sort by date (newest first) and take top 10
    return activities
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);
  };

  const recentActivity = getRecentActivity();

  // Navigate to events filtered by status
  const viewEventsByFilter = (filter) => {
    onNavigate('events');
    // In a full implementation, you'd pass the filter to EventsView
    // For now, just navigate to events
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-gray-900">Dashboard</h2>
        <div className="flex space-x-2">
          <button
            onClick={onShowAddEvent}
            className="bg-red-900 text-white px-4 py-2 rounded-lg hover:bg-red-800 flex items-center space-x-2 text-sm"
          >
            <Plus size={18} />
            <span>New Event</span>
          </button>
          <button
            onClick={onShowAddWorker}
            className="bg-gray-700 text-white px-4 py-2 rounded-lg hover:bg-gray-600 flex items-center space-x-2 text-sm"
          >
            <Plus size={18} />
            <span>New Worker</span>
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <button
          onClick={() => onNavigate('events')}
          className="bg-white p-6 rounded-lg shadow border-l-4 border-red-600 hover:shadow-lg transition-shadow text-left"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Upcoming Events</p>
              <p className="text-3xl font-bold text-gray-900">{upcomingEvents}</p>
              <p className="text-xs text-red-600 mt-1">Click to view all →</p>
            </div>
            <Calendar className="text-red-600" size={40} />
          </div>
        </button>
        
        <button
          onClick={() => viewEventsByFilter('needs-staff')}
          className="bg-white p-6 rounded-lg shadow border-l-4 border-yellow-500 hover:shadow-lg transition-shadow text-left"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Need Staffing</p>
              <p className="text-3xl font-bold text-gray-900">{needStaffing}</p>
              <p className="text-xs text-yellow-600 mt-1">Click to view →</p>
            </div>
            <AlertCircle className="text-yellow-500" size={40} />
          </div>
        </button>

        <button
          onClick={() => onNavigate('staff')}
          className="bg-white p-6 rounded-lg shadow border-l-4 border-green-600 hover:shadow-lg transition-shadow text-left"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Active Workers</p>
              <p className="text-3xl font-bold text-gray-900">{workers.length}</p>
              <p className="text-xs text-green-600 mt-1">Click to manage →</p>
            </div>
            <Users className="text-green-600" size={40} />
          </div>
        </button>

        <button
          onClick={() => onNavigate('schedule')}
          className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-600 hover:shadow-lg transition-shadow text-left"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Total Events</p>
              <p className="text-3xl font-bold text-gray-900">{events.length}</p>
              <p className="text-xs text-blue-600 mt-1">View schedule →</p>
            </div>
            <DollarSign className="text-blue-600" size={40} />
          </div>
        </button>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            onClick={onShowAddEvent}
            className="flex items-center space-x-3 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-red-500 hover:bg-red-50 transition-all group"
          >
            <div className="bg-red-100 p-2 rounded group-hover:bg-red-200">
              <Calendar className="text-red-600" size={24} />
            </div>
            <div className="text-left">
              <p className="font-semibold text-gray-900">Create Event</p>
              <p className="text-xs text-gray-600">Add new casino party</p>
            </div>
          </button>

          <button
            onClick={onShowAddWorker}
            className="flex items-center space-x-3 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-green-500 hover:bg-green-50 transition-all group"
          >
            <div className="bg-green-100 p-2 rounded group-hover:bg-green-200">
              <Users className="text-green-600" size={24} />
            </div>
            <div className="text-left">
              <p className="font-semibold text-gray-900">Add Worker</p>
              <p className="text-xs text-gray-600">Onboard new staff</p>
            </div>
          </button>

          <button
            onClick={() => onNavigate('schedule')}
            className="flex items-center space-x-3 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all group"
          >
            <div className="bg-blue-100 p-2 rounded group-hover:bg-blue-200">
              <Clock className="text-blue-600" size={24} />
            </div>
            <div className="text-left">
              <p className="font-semibold text-gray-900">View Schedule</p>
              <p className="text-xs text-gray-600">Calendar overview</p>
            </div>
          </button>

          <button
            onClick={() => onNavigate('settings')}
            className="flex items-center space-x-3 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all group"
          >
            <div className="bg-purple-100 p-2 rounded group-hover:bg-purple-200">
              <Settings className="text-purple-600" size={24} />
            </div>
            <div className="text-left">
              <p className="font-semibold text-gray-900">Settings</p>
              <p className="text-xs text-gray-600">Manage positions</p>
            </div>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-gray-900">Recent Activity</h3>
            <span className="text-xs text-gray-500">Last 7 days</span>
          </div>
          
          {recentActivity.length === 0 ? (
            <div className="text-center py-8">
              <History size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-600">No recent activity</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {recentActivity.map((activity, index) => {
                const Icon = activity.icon;
                const colorClasses = {
                  blue: 'bg-blue-100 text-blue-600',
                  green: 'bg-green-100 text-green-600',
                  red: 'bg-red-100 text-red-600',
                  yellow: 'bg-yellow-100 text-yellow-600'
                };
                
                return (
                  <div key={index} className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded">
                    <div className={`p-2 rounded ${colorClasses[activity.color]}`}>
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">{activity.message}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(activity.date).toLocaleString('en-US', { 
                          month: 'short', 
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Upcoming Events Today/This Week */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">This Week's Events</h3>
          {(() => {
            const today = new Date();
            const endOfWeek = new Date();
            endOfWeek.setDate(today.getDate() + 7);
            
            const weekEvents = events
              .filter(event => {
                const eventDate = new Date(event.date);
                return eventDate >= today && eventDate <= endOfWeek;
              })
              .sort((a, b) => new Date(a.date) - new Date(b.date))
              .slice(0, 5);

            if (weekEvents.length === 0) {
              return (
                <div className="text-center py-8">
                  <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-600">No events this week</p>
                </div>
              );
            }

            return (
              <div className="space-y-3">
                {weekEvents.map(event => {
                  const eventAssignments = assignments.filter(a => a.event_id === event.id);
                  const totalNeeded = event.positions?.reduce((sum, p) => sum + p.count, 0) || 0;
                  const filled = eventAssignments.length;
                  const isFullyStaffed = filled >= totalNeeded && totalNeeded > 0;
                  
                  const eventDate = new Date(event.date);
                  const daysUntil = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
                  
                  return (
                    <div 
                      key={event.id} 
                      className="p-3 border rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => onOpenAssignModal(event)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <h4 className="font-semibold text-gray-900">{event.name}</h4>
                          {daysUntil === 0 && (
                            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded font-semibold">
                              TODAY
                            </span>
                          )}
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          isFullyStaffed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {filled}/{totalNeeded}
                        </span>
                      </div>
                      <div className="flex items-center space-x-4 text-xs text-gray-600">
                        <span className="flex items-center space-x-1">
                          <Calendar size={12} />
                          <span>{eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <Clock size={12} />
                          <span>{formatTime(event.time, timeFormat)}</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <MapPin size={12} />
                          <span>{event.venue}</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
