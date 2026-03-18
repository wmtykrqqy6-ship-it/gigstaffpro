import React from 'react';
import { Bell, Mail, AlertCircle, Clock, CheckCircle, X, UserPlus } from 'lucide-react';

export default function NotificationsModal({
  open,
  notifications,
  onClose,
  onClearAll,
  onDismiss
}) {
  if (!open) return null;

  const getNotificationStyle = (type) => {
    switch (type) {
      case 'application':  return { icon: <Mail size={18} className="text-blue-600" />,   bg: 'bg-blue-50',   border: 'border-blue-100'   };
      case 'warning':      return { icon: <AlertCircle size={18} className="text-amber-600" />, bg: 'bg-amber-50', border: 'border-amber-200' };
      case 'reminder':     return { icon: <Clock size={18} className="text-orange-600" />,  bg: 'bg-orange-50', border: 'border-orange-100' };
      case 'success':      return { icon: <CheckCircle size={18} className="text-green-600" />, bg: 'bg-green-50', border: 'border-green-100' };
      case 'new_worker':   return { icon: <UserPlus size={18} className="text-purple-600" />,  bg: 'bg-purple-50', border: 'border-purple-100' };
      default:             return { icon: <Bell size={18} className="text-gray-600" />,      bg: 'bg-gray-50',   border: 'border-gray-100'   };
    }
  };

  const getTimeAgo = (timestamp) => {
    if (!timestamp) return '';
    const then = new Date(timestamp);
    if (Number.isNaN(then.getTime())) return '';
    const diffMs = Date.now() - then;
    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMs / 3600000);
    const days = Math.floor(diffMs / 86400000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Group: warnings first, then rest
  const warnings = notifications.filter(n => n.type === 'warning');
  const others = notifications.filter(n => n.type !== 'warning');
  const sorted = [...warnings, ...others];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-start justify-end p-4 pt-16">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col border border-gray-100">

        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Bell size={20} className="text-gray-700" />
            <h3 className="text-lg font-bold text-gray-900">Notifications</h3>
            {notifications.length > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {notifications.length}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle size={40} className="text-green-300 mb-3" />
              <p className="font-semibold text-gray-700">All caught up!</p>
              <p className="text-sm text-gray-400 mt-1">No new notifications</p>
            </div>
          ) : (
            sorted.map(notification => {
              const { icon, bg, border } = getNotificationStyle(notification.type);
              return (
                <div
                  key={notification.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${bg} ${border} group relative`}
                >
                  {/* Icon */}
                  <div className="flex-shrink-0 mt-0.5">{icon}</div>

                  {/* Content */}
                  <div
                    className={`flex-1 min-w-0 ${notification.action ? 'cursor-pointer' : ''}`}
                    onClick={() => {
                      if (notification.action) {
                        notification.action();
                        onClose();
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900 leading-snug">
                        {notification.title}
                      </p>
                      <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0 mt-0.5">
                        {getTimeAgo(notification.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5 leading-snug">
                      {notification.message}
                    </p>
                    {notification.action && (
                      <p className="text-xs text-blue-500 mt-1 font-medium">Tap to view →</p>
                    )}
                  </div>

                  {/* Per-item dismiss */}
                  {onDismiss && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDismiss(notification.id); }}
                      className="flex-shrink-0 text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
                      title="Dismiss"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="px-5 py-3 border-t bg-gray-50 rounded-b-xl flex items-center justify-between">
            <button
              onClick={onClearAll}
              className="text-sm text-gray-500 hover:text-gray-700 font-medium"
            >
              Clear All
            </button>
            <button
              onClick={onClose}
              className="bg-gray-200 text-gray-700 px-4 py-1.5 rounded-lg hover:bg-gray-300 text-sm font-medium"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
