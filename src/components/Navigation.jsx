import React from 'react';
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
  pendingReportsCount = 0
}) {
  if (userRole !== 'admin') return null;

  // Count pending applications
  const pendingCount = (assignments || []).filter(a => a.status === 'pending').length;

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
      </div>
    </div>
  );
}
