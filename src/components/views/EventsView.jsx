import React, { useState } from 'react';
import {
  Home,
  Users,
  Calendar,
  Clock,
  FileText,
  DollarSign,
  Settings,
  ClipboardList
} from 'lucide-react';

export default function Navigation({
  userRole,
  assignments,
  paymentTrackingEnabled,
  currentView,
  onNavigate,
  pendingReportsCount = 0,
  pendingApplicationsCount = 0,
  locations = [],
  activeLocation = 'all',
  onSetActiveLocation
}) {
  if (userRole !== 'admin') return null;

  // Count pending applications
  const [showLocationMenu, setShowLocationMenu] = useState(false);
  const activeLocationName = activeLocation === 'all'
    ? 'All Markets'
    : (locations.find(l => l.id === activeLocation)?.name || 'All Markets');

  const pendingCount = pendingApplicationsCount;

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'staff', label: 'Staff', icon: Users },
    { id: 'events', label: 'Events', icon: Calendar },
    { id: 'schedule', label: 'Schedule', icon: Clock },
    { id: 'applications', label: 'Applications', icon: FileText, badge: pendingCount },
    { id: 'reports', label: 'Reports', icon: ClipboardList, badge: pendingReportsCount },
    ...(paymentTrackingEnabled ? [{ id: 'payments', label: 'Payments', icon: DollarSign }] : []),
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  return (
    <div className="bg-white border-b shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex space-x-8 overflow-x-auto">
          {navItems.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`flex items-center space-x-2 py-4 px-2 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                currentView === id
                  ? 'border-red-900 text-red-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon size={18} />
              <span>{label}</span>
              {Number(badge) > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5 font-bold">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

          {/* Market Switcher - only when 2+ locations */}
          {locations.length > 1 && (
            <div className="relative ml-auto flex-shrink-0 flex items-center">
              <button
                onClick={() => setShowLocationMenu(!showLocationMenu)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  activeLocation !== 'all'
                    ? 'bg-red-50 text-red-900 border-red-200 hover:bg-red-100'
                    : 'text-gray-500 border-gray-200 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <MapPin size={13} />
                <span className="max-w-28 truncate">{activeLocationName}</span>
                <ChevronDown size={11} className="opacity-60" />
              </button>
              {showLocationMenu && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-lg shadow-xl py-1 z-50 border border-gray-100">
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b">
                    Switch Market
                  </div>
                  <button
                    onClick={() => { onSetActiveLocation('all'); setShowLocationMenu(false); }}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center space-x-2 transition-colors ${
                      activeLocation === 'all' ? 'bg-red-50 text-red-900 font-medium' : 'text-gray-700 hover:bg-gray-50'
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
                        activeLocation === loc.id ? 'bg-red-50 text-red-900 font-medium' : 'text-gray-700 hover:bg-gray-50'
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
      </div>
    </div>
  );
}
