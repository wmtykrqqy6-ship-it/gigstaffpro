import React, { useState } from 'react';
import { Mail, Phone, User, Award, Calendar, Briefcase, MapPin, Shirt, Edit2, Save, X } from 'lucide-react';
import { supabase } from '../../supabaseClient';

export default function ProfileView({ worker, onProfileUpdate }) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState({
    email: worker?.email || '',
    phone: worker?.phone || '',
    address: worker?.address || '',
    shirt_size: worker?.shirt_size || ''
  });

  if (!worker) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-red-600">Error: Worker profile not found.</p>
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('workers')
        .update({
          email: editData.email,
          phone: editData.phone,
          address: editData.address,
          shirt_size: editData.shirt_size
        })
        .eq('id', worker.id);

      if (error) throw error;

      // Call parent callback to reload worker data
      if (onProfileUpdate) {
        await onProfileUpdate();
      }

      setIsEditing(false);
      alert('✅ Profile updated successfully!');
    } catch (error) {
      alert('Error updating profile: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditData({
      email: worker.email || '',
      phone: worker.phone || '',
      address: worker.address || '',
      shirt_size: worker.shirt_size || ''
    });
    setIsEditing(false);
  };

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <div className="bg-gradient-to-r from-red-900 to-red-800 rounded-lg shadow p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="bg-white bg-opacity-20 rounded-full p-4">
              <User size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-bold">{worker.name}</h2>
              <p className="text-red-100">Worker Portal Profile</p>
            </div>
          </div>
          
          {/* Edit/Save Buttons */}
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="bg-white bg-opacity-20 hover:bg-opacity-30 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
            >
              <Edit2 size={18} />
              <span>Edit Profile</span>
            </button>
          ) : (
            <div className="flex space-x-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors disabled:opacity-50"
              >
                <Save size={18} />
                <span>{saving ? 'Saving...' : 'Save'}</span>
              </button>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="bg-white bg-opacity-20 hover:bg-opacity-30 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
              >
                <X size={18} />
                <span>Cancel</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Contact Information */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Contact Information</h3>
        <div className="space-y-4">
          {/* Email */}
          <div>
            <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
              <Mail size={16} className="text-gray-400" />
              <span>Email</span>
            </label>
            {isEditing ? (
              <input
                type="email"
                value={editData.email}
                onChange={(e) => setEditData({...editData, email: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="your.email@example.com"
              />
            ) : (
              <p className="text-base text-gray-900 pl-6">{worker.email}</p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
              <Phone size={16} className="text-gray-400" />
              <span>Phone</span>
            </label>
            {isEditing ? (
              <input
                type="tel"
                value={editData.phone}
                onChange={(e) => setEditData({...editData, phone: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="(555) 123-4567"
              />
            ) : (
              <p className="text-base text-gray-900 pl-6">{worker.phone}</p>
            )}
          </div>

          {/* Address */}
          <div>
            <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
              <MapPin size={16} className="text-gray-400" />
              <span>Address</span>
            </label>
            {isEditing ? (
              <textarea
                value={editData.address}
                onChange={(e) => setEditData({...editData, address: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="123 Main St, City, State, ZIP"
                rows={2}
              />
            ) : (
              <p className="text-base text-gray-900 pl-6">{worker.address || 'Not provided'}</p>
            )}
          </div>

          {/* Shirt Size */}
          <div>
            <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
              <Shirt size={16} className="text-gray-400" />
              <span>Shirt Size</span>
            </label>
            {isEditing ? (
              <select
                value={editData.shirt_size}
                onChange={(e) => setEditData({...editData, shirt_size: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="">Select Size</option>
                <option value="XS">XS</option>
                <option value="S">Small</option>
                <option value="M">Medium</option>
                <option value="L">Large</option>
                <option value="XL">XL</option>
                <option value="2XL">2XL</option>
                <option value="3XL">3XL</option>
              </select>
            ) : (
              <p className="text-base text-gray-900 pl-6">{worker.shirt_size || 'Not provided'}</p>
            )}
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
