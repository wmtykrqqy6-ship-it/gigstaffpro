import React, { useState } from 'react';
import { Bell, LogOut, Menu, X, User, Calendar, History, MapPin, ChevronDown } from 'lucide-react';

export default function Header({
  userRole,
  loggedInWorker,
  notifications,
  onShowNotifications,
  onLogout,
  onGoDashboard,
  currentTab,
  onTabChange,
  locations = [],
  activeLocation = 'all',
  onSetActiveLocation
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [showLocationMenu, setShowLocationMenu] = useState(false);

  const activeLocationName = activeLocation === 'all'
    ? 'All Markets'
    : locations.find(l => l.id === activeLocation)?.name || 'All Markets';

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

            {/* Location Switcher - admin only, 2+ locations */}
            {userRole === 'admin' && locations.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => setShowLocationMenu(!showLocationMenu)}
                  className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeLocation !== 'all'
                      ? 'bg-white/20 text-white border border-white/40 hover:bg-white/30'
                      : 'text-red-200 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <MapPin size={13} />
                  <span className="hidden sm:inline max-w-28 truncate">{activeLocationName}</span>
                  <ChevronDown size={11} className="opacity-70" />
                </button>

                {showLocationMenu && (
                  <div className="absolute right-0 mt-2 w-52 bg-white rounded-lg shadow-xl py-1 z-50 border border-gray-100">
                    <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b">
                      Switch Market
                    </div>
                    <button
                      onClick={() => { onSetActiveLocation('all'); setShowLocationMenu(false); }}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center space-x-2 transition-colors ${
                        activeLocation === 'all'
                          ? 'bg-red-50 text-red-900 font-medium'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <MapPin size={14} className="text-gray-400 flex-shrink-0" />
                      <span>All Markets</span>
                      {activeLocation === 'all' && <span className="ml-auto text-red-600 text-xs">✓</span>}
                    </button>
                    {locations.map(loc => (
                      <button
                        key={loc.id}
                        onClick={() => { onSetActiveLocation(loc.id); setShowLocationMenu(false); }}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center space-x-2 transition-colors ${
                          activeLocation === loc.id
                            ? 'bg-red-50 text-red-900 font-medium'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <MapPin size={14} className="text-gray-400 flex-shrink-0" />
                        <span className="truncate">{loc.name}{loc.city ? ` — ${loc.city}` : ''}</span>
                        {activeLocation === loc.id && <span className="ml-auto text-red-600 text-xs flex-shrink-0">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Worker Menu Button */}
            {userRole === 'worker' && onTabChange && (
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-2 hover:bg-red-800 rounded-full transition-colors"
                >
                  {showMenu ? <X size={20} /> : <Menu size={20} />}
                </button>
                {showMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-2 z-50">
                    <button
                      onClick={() => { onTabChange('dashboard'); setShowMenu(false); }}
                      className={`w-full text-left px-4 py-2 flex items-center space-x-2 transition-colors ${currentTab === 'dashboard' ? 'bg-red-50 text-red-900 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}
                    >
                      <Calendar size={18} />
                      <span>Dashboard</span>
                    </button>
                    <button
                      onClick={() => { onTabChange('profile'); setShowMenu(false); }}
                      className={`w-full text-left px-4 py-2 flex items-center space-x-2 transition-colors ${currentTab === 'profile' ? 'bg-red-50 text-red-900 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}
                    >
                      <User size={18} />
                      <span>Profile</span>
                    </button>
                    <button
                      onClick={() => { onTabChange('history'); setShowMenu(false); }}
                      className={`w-full text-left px-4 py-2 flex items-center space-x-2 transition-colors ${currentTab === 'history' ? 'bg-red-50 text-red-900 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}
                    >
                      <History size={18} />
                      <span>History</span>
                    </button>
                  </div>
                )}
              </div>
            )}

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

      {/* Active location banner - shows below header when a market is selected */}
      {userRole === 'admin' && activeLocation !== 'all' && (
        <div className="bg-red-800 px-4 py-1.5 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs text-red-100">
            <MapPin size={12} />
            <span>Viewing: <strong className="text-white">{activeLocationName}</strong> — events, staff, and dashboard are filtered to this market</span>
          </div>
          <button
            onClick={() => { onSetActiveLocation('all'); }}
            className="text-xs text-red-200 hover:text-white underline"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
