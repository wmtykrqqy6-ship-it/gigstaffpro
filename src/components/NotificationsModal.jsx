import React from 'react';
import { Bell, Mail, AlertCircle, Clock, CheckCircle, X } from 'lucide-react';

export default function NotificationsModal({
  open,
  notifications,
  onClose,
  onClearAll
}) {
  if (!open) return null;

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'application': return <Mail size={20} className="text-blue-600" />;
      case 'warning': return <AlertCircle size={20} className="text-yellow-600" />;
      case 'reminder': return <Clock size={20} className="text-orange-600" />;
      case 'success': return <CheckCircle size={20} className="text-green-600" />;
      default: return <Bell size={20} className="text-gray-600" />;
    }
  };

  const getTimeAgo = (timestamp) => {
    // ✅ Improvement: handle missing/invalid timestamps safely
    if (!timestamp) return '';

    const then = new Date(timestamp);
    if (Number.isNaN(then.getTime())) return '';

    const now = new Date();
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Bell size={24} className="text-gray-700" />
            <h3 className="text-2xl font-bold text-gray-900">Notifications</h3>
            {notifications.length > 0 && (
              <span className="bg-red-100 text-red-800 text-sm px-2 py-1 rounded-full font-medium">
                {notifications.length}
              </span>
            )}
          </div>

          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-4">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bell size={48} className="text-gray-300 mb-4" />
              <h4 className="text-lg font-semibold text-gray-900 mb-2">All Caught Up!</h4>
              <p className="text-gray-600">No new notifications</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map(notification => (
                <div
                  key={notification.id}
                  onClick={() => {
                    if (notification.action) {
                      notification.action();
                      onClose();
                    }
                  }}
                  className={`p-4 rounded-lg border transition-colors ${
                    notification.action
                      ? 'hover:bg-gray-50 cursor-pointer'
                      : 'bg-gray-50'
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 mt-1">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {notification.title}
                          </p>
                          <p className="text-sm text-gray-600 mt-1">
                            {notification.message}
                          </p>
                        </div>
                        <span className="text-xs text-gray-500 ml-2 whitespace-nowrap">
                          {getTimeAgo(notification.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex items-center justify-between bg-gray-50">
          {notifications.length > 0 && (
            <button
              onClick={onClearAll}
              className="text-sm text-gray-600 hover:text-gray-800 font-medium"
            >
              Clear All
            </button>
          )}
          <button
            onClick={onClose}
            className="ml-auto bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
