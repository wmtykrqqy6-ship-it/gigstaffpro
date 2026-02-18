import React, { useState } from 'react';
import { Users, Plus, Mail, Edit, Trash2, Star, Search, Lock, Phone } from 'lucide-react';
import { getPositionLabel } from '../../utils/positionHelpers';

export default function StaffView({
  loading,
  error,
  workers,
  onShowBulkInvite,
  onShowAddWorker,
  onSetPin,
  onEditWorker,
  onDeleteWorker,
  onRetryLoad
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [skillFilter, setSkillFilter] = useState('all');
  const [rankFilter, setRankFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name'); // name, rating, gigs

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading workers from Supabase...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-red-800 font-semibold mb-2">Database Connection Error</h3>
        <p className="text-red-700 text-sm">{error}</p>
        <button 
          onClick={onRetryLoad}
          className="mt-4 bg-red-900 text-white px-4 py-2 rounded hover:bg-red-800"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  // Get all unique skills for filter dropdown
  const allSkills = [...new Set(workers.flatMap(w => w.skills || []))].sort();

  // Filter workers
  const filteredWorkers = workers.filter(worker => {
    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesName = worker.name?.toLowerCase().includes(searchLower);
      const matchesEmail = worker.email?.toLowerCase().includes(searchLower);
      const matchesPhone = worker.phone?.toLowerCase().includes(searchLower);
      if (!matchesName && !matchesEmail && !matchesPhone) return false;
    }

    // Skill filter
    if (skillFilter !== 'all') {
      if (!worker.skills || !worker.skills.includes(skillFilter)) return false;
    }

    // Rank filter
    if (rankFilter !== 'all') {
      if (rankFilter === '5-star' && worker.reliability !== 5) return false;
      if (rankFilter !== '5-star' && worker.rank !== parseInt(rankFilter)) return false;
    }

    return true;
  });

  // Sort workers
  const sortedWorkers = [...filteredWorkers].sort((a, b) => {
    if (sortBy === 'name') {
      return (a.name || '').localeCompare(b.name || '');
    } else if (sortBy === 'rating') {
      return (b.reliability || 0) - (a.reliability || 0);
    } else if (sortBy === 'gigs') {
      return (b.total_gigs || 0) - (a.total_gigs || 0);
    } else if (sortBy === 'rank') {
      return (a.rank || 999) - (b.rank || 999);
    }
    return 0;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Staff Management</h2>
          <p className="text-sm text-green-600 mt-1">
            Connected to Supabase • {sortedWorkers.length} of {workers.length} workers
          </p>
        </div>
        <div className="flex space-x-3">
          <button 
            onClick={onShowBulkInvite}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center space-x-2 transition-colors"
          >
            <Mail size={20} />
            <span>Bulk Invite</span>
          </button>
          <button 
            onClick={onShowAddWorker}
            className="bg-red-900 text-white px-6 py-3 rounded-lg hover:bg-red-800 flex items-center space-x-2 transition-colors"
          >
            <Plus size={20} />
            <span>Add Worker</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search */}
          <div className="lg:col-span-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search workers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Skill Filter */}
          <div>
            <select
              value={skillFilter}
              onChange={(e) => setSkillFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            >
              <option value="all">All Skills</option>
              {allSkills.map(skill => (
                <option key={skill} value={skill}>{getPositionLabel(skill)}</option>
              ))}
            </select>
          </div>

          {/* Rank Filter */}
          <div>
            <select
              value={rankFilter}
              onChange={(e) => setRankFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            >
              <option value="all">All Ranks</option>
              <option value="1">Rank 1</option>
              <option value="2">Rank 2</option>
              <option value="3">Rank 3</option>
              <option value="4">Rank 4</option>
              <option value="5">Rank 5</option>
              <option value="5-star">⭐ 5-Star Only</option>
            </select>
          </div>

          {/* Sort By */}
          <div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            >
              <option value="name">Sort: Name (A-Z)</option>
              <option value="rank">Sort: Rank (Low to High)</option>
              <option value="rating">Sort: Rating (High to Low)</option>
              <option value="gigs">Sort: Total Gigs (High to Low)</option>
            </select>
          </div>
        </div>

        {/* Active Filters Summary */}
        {(searchTerm || skillFilter !== 'all' || rankFilter !== 'all') && (
          <div className="flex items-center space-x-2 text-sm mt-3">
            <span className="text-gray-600">Active filters:</span>
            {searchTerm && (
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                Search: "{searchTerm}"
              </span>
            )}
            {skillFilter !== 'all' && (
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                Skill: {getPositionLabel(skillFilter)}
              </span>
            )}
            {rankFilter !== 'all' && (
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                {rankFilter === '5-star' ? '⭐ 5-Star Only' : `Rank ${rankFilter}`}
              </span>
            )}
            <button
              onClick={() => {
                setSearchTerm('');
                setSkillFilter('all');
                setRankFilter('all');
              }}
              className="text-red-600 hover:text-red-800 font-medium ml-2"
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      {/* Worker Cards Grid */}
      {sortedWorkers.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Users size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {workers.length === 0 ? 'No Workers Yet' : 'No Workers Found'}
          </h3>
          <p className="text-gray-600 mb-4">
            {workers.length === 0 
              ? 'Add your first casino party staff member to get started!'
              : 'Try adjusting your filters or search term.'}
          </p>
          {workers.length === 0 && (
            <button 
              onClick={onShowAddWorker}
              className="bg-red-900 text-white px-6 py-2 rounded-lg hover:bg-red-800"
            >
              Add Worker
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedWorkers.map(worker => (
            <div 
              key={worker.id} 
              className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6 border border-gray-200"
            >
              {/* Worker Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900">{worker.name}</h3>
                  <div className="flex items-center space-x-3 mt-2">
                    {/* Rank Badge */}
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                      Level {worker.rank || 1}
                    </span>
                    {/* Rating */}
                    <div className="flex items-center space-x-1">
                      <Star size={14} className="text-yellow-500 fill-yellow-500" />
                      <span className="text-sm font-medium text-gray-700">{worker.reliability || 0}</span>
                    </div>
                    {/* Total Gigs */}
                    <span className="text-xs text-gray-500">{worker.total_gigs || 0} gigs</span>
                  </div>
                </div>
              </div>

              {/* Contact Info */}
              <div className="space-y-2 mb-4 text-sm">
                {worker.phone && (
                  <div className="flex items-center space-x-2 text-gray-600">
                    <Phone size={14} className="text-gray-400" />
                    <span>{worker.phone}</span>
                  </div>
                )}
                {worker.email && (
                  <div className="flex items-center space-x-2 text-gray-600">
                    <Mail size={14} className="text-gray-400" />
                    <span className="truncate">{worker.email}</span>
                  </div>
                )}
              </div>

              {/* Skills */}
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-700 mb-2">Skills:</p>
                <div className="flex flex-wrap gap-1">
                  {(worker.skills || []).map((skill, idx) => (
                    <span 
                      key={idx}
                      className="px-2 py-1 bg-red-50 text-red-800 text-xs rounded border border-red-200"
                    >
                      {getPositionLabel(skill)}
                    </span>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center space-x-2 pt-4 border-t border-gray-200">
                <button
                  onClick={() => onSetPin(worker)}
                  className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 bg-green-50 text-green-700 rounded hover:bg-green-100 transition-colors"
                  title="Set PIN"
                >
                  <Lock size={14} />
                  <span className="text-xs font-medium">PIN</span>
                </button>
                <button
                  onClick={() => onEditWorker(worker)}
                  className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors"
                  title="Edit Worker"
                >
                  <Edit size={14} />
                  <span className="text-xs font-medium">Edit</span>
                </button>
                <button
                  onClick={() => onDeleteWorker(worker.id)}
                  className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 bg-red-50 text-red-700 rounded hover:bg-red-100 transition-colors"
                  title="Delete Worker"
                >
                  <Trash2 size={14} />
                  <span className="text-xs font-medium">Delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
