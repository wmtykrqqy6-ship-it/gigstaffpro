import React from 'react';
import { Mail, Phone, User, Award, Calendar, Briefcase } from 'lucide-react';

export default function ProfileView({ worker }) {
  if (!worker) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-red-600">Error: Worker profile not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <div className="bg-gradient-to-r from-red-900 to-red-800 rounded-lg shadow p-6 text-white">
        <div className="flex items-center space-x-4">
          <div className="bg-white bg-opacity-20 rounded-full p-4">
            <User size={32} />
          </div>
          <div>
            <h2 className="text-2xl font-bold">{worker.name}</h2>
            <p className="text-red-100">Worker Portal Profile</p>
          </div>
        </div>
      </div>

      {/* Contact Information */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Contact Information</h3>
        <div className="space-y-4">
          <div className="flex items-center space-x-3 text-gray-600">
            <Mail size={20} className="text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Email</p>
              <p className="text-base font-medium text-gray-900">{worker.email}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 text-gray-600">
            <Phone size={20} className="text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Phone</p>
              <p className="text-base font-medium text-gray-900">{worker.phone}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Skills */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Your Skills</h3>
        <div className="flex flex-wrap gap-2">
          {Array.isArray(worker.skills) && worker.skills.length > 0 ? (
            worker.skills.map((skill, idx) => (
              <span 
                key={idx} 
                className="bg-red-50 text-red-800 text-sm px-4 py-2 rounded-full font-medium border border-red-200"
              >
                {skill}
              </span>
            ))
          ) : (
            <p className="text-gray-500">No skills added yet</p>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Profile Stats</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <Award size={24} className="mx-auto mb-2 text-blue-600" />
            <p className="text-sm text-gray-600 mb-1">Rank Level</p>
            <p className="text-2xl font-bold text-gray-900">Level {worker.rank || 1}</p>
          </div>
          
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <Briefcase size={24} className="mx-auto mb-2 text-yellow-600" />
            <p className="text-sm text-gray-600 mb-1">Total Gigs</p>
            <p className="text-2xl font-bold text-gray-900">{worker.total_gigs || 0}</p>
          </div>
          
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <Calendar size={24} className="mx-auto mb-2 text-red-600" />
            <p className="text-sm text-gray-600 mb-1">No Shows</p>
            <p className="text-2xl font-bold text-gray-900">{worker.no_shows || 0}</p>
          </div>
          
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <Award size={24} className="mx-auto mb-2 text-purple-600" />
            <p className="text-sm text-gray-600 mb-1">Reliability</p>
            <p className="text-2xl font-bold text-gray-900">{worker.reliability || 0}</p>
          </div>
        </div>
      </div>

      {/* Additional Information */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Additional Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm text-gray-500 mb-1">Last Worked</p>
            <p className="text-lg font-medium text-gray-900">
              {worker.last_worked 
                ? new Date(worker.last_worked).toLocaleDateString('en-US', { 
                    month: 'long', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })
                : 'N/A'}
            </p>
          </div>
          
          <div>
            <p className="text-sm text-gray-500 mb-1">Member Since</p>
            <p className="text-lg font-medium text-gray-900">
              {worker.created_at 
                ? new Date(worker.created_at).toLocaleDateString('en-US', { 
                    month: 'long', 
                    year: 'numeric' 
                  })
                : 'N/A'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
