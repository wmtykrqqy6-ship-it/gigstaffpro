import React from 'react';
import { Bell, LogOut } from 'lucide-react';

export default function Header({
  userRole,
  loggedInWorker,
  notifications,
  onShowNotifications,
  onLogout,
  onGoDashboard
}) {
  return (
    <div className="bg-gradient-to-r from-red-900 to-black text-white shadow-lg">
      <div className="px-4 py-3">
        <div className="flex justify-between items-center">
          {/* Logo + Title */}
          <div
            className="flex items-center space-x-2 cursor-pointer"
            onClick={onGoDashboard}
          >
            <div className="bg-white text-red-900 rounded-lg p-1.5">
              <div className="flex space-x-0.5">
                <div className="w-2.5 h-2.5 bg-red-600 rounded-sm transform rotate-45"></div>
                <div className="w-2.5 h-2.5 bg-black rounded-sm transform rotate-45"></div>
              </div>
            </div>

            <div>
              <h1 className="text-lg sm:text-xl font-bold">GigStaffPro</h1>
              <p className="text-xs text-red-200 hidden sm:block">
                {userRole === 'admin'
                  ? 'Admin Dashboard'
                  : `${loggedInWorker?.name || 'Worker'} Portal`}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            <button
              onClick={onShowNotifications}
              className="relative p-2 hover:bg-red-800 rounded-full transition-colors"
            >
              <Bell size={20} />
              {notifications.length > 0 && (
                <span className="absolute top-1 right-1 bg-red-500 text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {notifications.length > 9 ? '9+' : notifications.length}
                </span>
              )}
            </button>

            <button
              onClick={onLogout}
              className="text-xs bg-red-700 px-2 sm:px-3 py-1.5 sm:py-2 rounded hover:bg-red-600 font-medium whitespace-nowrap flex items-center space-x-1"
            >
              <LogOut size={14} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
