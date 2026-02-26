import React, { useState, useEffect } from 'react';
import { Users, Plus, Mail, Edit, Trash2, Star, Search, Lock, Phone, Shield } from 'lucide-react';
import { getPositionLabel } from '../../utils/positionHelpers';
import { supabase } from '../../supabaseClient';

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
  const [reliabilityFilter, setReliabilityFilter] = useState('all');
  const [hostFilter, setHostFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [expandedCards, setExpandedCards] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [locations, setLocations] = useState([]);
  const [workerLocationMap, setWorkerLocationMap] = useState({}); // { worker_id: [location_id, ...] }

  useEffect(() => {
    supabase
      .from('locations')
      .select('id, name, city, state')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setLocations(data || []));

    supabase
      .from('worker_locations')
      .select('worker_id, location_id')
      .eq('approved', true)
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(({ worker_id, location_id }) => {
          if (!map[worker_id]) map[worker_id] = [];
          map[worker_id].push(location_id);
        });
        setWorkerLocationMap(map);
      });
  }, []);

  const toggleCard = (workerId) => {
    setExpandedCards(prev => ({
      ...prev,
      [workerId]: !prev[workerId]
    }));
  };

  // Count active filters
  const activeFilterCount = 
    (skillFilter !== 'all' ? 1 : 0) + 
    (rankFilter !== 'all' ? 1 : 0) + 
    (reliabilityFilter !== 'all' ? 1 : 0) +
    (hostFilter !== 'all' ? 1 : 0) +
    (locationFilter !== 'all' ? 1 : 0) +
    (sortBy !== 'name' ? 1 : 0);

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

    // Reliability filter
    if (reliabilityFilter !== 'all') {
      const rating = worker.reliability ?? 5.0;
      if (reliabilityFilter === 'excellent' && rating < 4.5) return false;
      if (reliabilityFilter === 'good' && (rating < 3.5 || rating >= 4.5)) return false;
      if (reliabilityFilter === 'fair' && (rating < 2.0 || rating >= 3.5)) return false;
      if (reliabilityFilter === 'poor' && rating >= 2.0) return false;
      if (reliabilityFilter === 'below4' && rating >= 4.0) return false;
    }

    // Host filter
    if (hostFilter === 'hosts' && !worker.is_host) return false;
    if (hostFilter === 'non-hosts' && worker.is_host) return false;

    // Location filter
    if (locationFilter !== 'all') {
      const workerLocs = workerLocationMap[worker.id] || [];
      if (!workerLocs.includes(locationFilter)) return false;
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
      <div className="space-y-4">
        {/* Title - Centered on Mobile */}
        <div className="text-center md:text-left">
          <h2 className="text-3xl font-bold text-gray-900">Staff Management</h2>
          <p className="text-sm text-gray-600 mt-1">
            {sortedWorkers.length} {sortedWorkers.length === 1 ? 'worker' : 'workers'}
            {sortedWorkers.length !== workers.length && ` of ${workers.length} total`}
          </p>
        </div>
        
        {/* Buttons - Stacked on Mobile, Side-by-side on Desktop */}
        <div className="flex flex-col md:flex-row space-y-3 md:space-y-0 md:space-x-3">
          <button 
            onClick={onShowBulkInvite}
            className="w-full md:w-auto bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center justify-center space-x-2 transition-colors"
          >
            <Mail size={20} />
            <span>Bulk Invite</span>
          </button>
          <button 
            onClick={onShowAddWorker}
            className="w-full md:w-auto bg-red-900 text-white px-6 py-3 rounded-lg hover:bg-red-800 flex items-center justify-center space-x-2 transition-colors"
          >
            <Plus size={20} />
            <span>Add Worker</span>
          </button>
        </div>
      </div>

      {/* Compact Search Bar + Filter Button */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center space-x-3">
          {/* Search */}
          <div className="flex-1">
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

          {/* Filter Button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center space-x-2 transition-colors relative"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span className="hidden sm:inline">Filter</span>
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Collapsible Filter Panel */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
            {/* Skill Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Skill</label>
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
              <label className="block text-xs font-medium text-gray-700 mb-1">Rank</label>
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
                <option value="5-star">⭐ 5.0 Rating Only</option>
              </select>
            </div>

            {/* Reliability Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Reliability Rating</label>
              <select
                value={reliabilityFilter}
                onChange={(e) => setReliabilityFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="all">All Ratings</option>
                <option value="excellent">⭐ Excellent (4.5 - 5.0)</option>
                <option value="good">✅ Good (3.5 - 4.4)</option>
                <option value="fair">⚠️ Fair (2.0 - 3.4)</option>
                <option value="poor">🔴 Poor (below 2.0)</option>
                <option value="below4">Below 4.0</option>
              </select>
            </div>

            {/* Host Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Host Status</label>
              <select
                value={hostFilter}
                onChange={(e) => setHostFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="all">All Workers</option>
                <option value="hosts">🎯 Hosts Only</option>
                <option value="non-hosts">Non-Hosts Only</option>
              </select>
            </div>

            {/* Sort By */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="name">Name (A-Z)</option>
                <option value="rank">Rank (Low to High)</option>
                <option value="rating">Rating (High to Low)</option>
                <option value="gigs">Total Gigs (High to Low)</option>
              </select>
            </div>

            {/* Clear Filters Button */}
            {activeFilterCount > 0 && (
              <button
                onClick={() => {
                  setSkillFilter('all');
                  setRankFilter('all');
                  setReliabilityFilter('all');
                  setHostFilter('all');
                  setLocationFilter('all');
                  setSortBy('name');
                }}
                className="w-full px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg font-medium transition-colors"
              >
                Clear Filters
              </button>
            )}

            {/* Location Filter - only shows if multiple locations */}
            {locations.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Market</label>
                <select
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                >
                  <option value="all">All Markets</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}{loc.city ? ` — ${loc.city}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Active Search Badge (only if searching) */}
        {searchTerm && (
          <div className="flex items-center space-x-2 text-sm mt-3">
            <span className="text-gray-600">Searching:</span>
            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
              "{searchTerm}"
            </span>
            <button
              onClick={() => setSearchTerm('')}
              className="text-red-600 hover:text-red-800 font-medium"
            >
              Clear
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sortedWorkers.map(worker => {
            const isExpanded = expandedCards[worker.id];
            return (
              <div 
                key={worker.id} 
                className="bg-white rounded-lg shadow hover:shadow-md transition-shadow border border-gray-200 overflow-hidden"
              >
                {/* Compact Header - Always Visible */}
                <div 
                  className="p-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleCard(worker.id)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <h3 className="text-base font-bold text-gray-900 truncate">{worker.name}</h3>
                        {worker.is_host && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200 flex-shrink-0">
                            <Shield size={10} className="mr-0.5" />
                            Host
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          Rank {worker.rank || 1}
                        </span>
                        {/* Color-coded reliability badge */}
                        {(() => {
                          const rating = worker.reliability ?? 5.0;
                          const color = rating >= 4.5 ? 'bg-green-100 text-green-800 border-green-200' :
                                        rating >= 3.5 ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                                        rating >= 2.0 ? 'bg-orange-100 text-orange-800 border-orange-200' :
                                                        'bg-red-100 text-red-800 border-red-200';
                          return (
                            <span className={`inline-flex items-center space-x-0.5 px-2 py-0.5 rounded text-xs font-medium border ${color}`}>
                              <Star size={10} className="fill-current flex-shrink-0" />
                              <span>{rating.toFixed(1)}</span>
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 ml-2 flex-shrink-0">
                      {worker.total_gigs || 0} gigs
                    </div>
                  </div>
                  
                  {/* Phone Number - Always Visible */}
                  {worker.phone && (
                    <div className="flex items-center space-x-1.5 text-sm text-gray-600">
                      <Phone size={13} className="text-gray-400 flex-shrink-0" />
                      <span>{worker.phone}</span>
                    </div>
                  )}
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100 space-y-3">
                    {/* Email */}
                    {worker.email && (
                      <div className="pt-3">
                        <div className="flex items-center space-x-2 text-sm text-gray-600">
                          <Mail size={13} className="text-gray-400 flex-shrink-0" />
                          <span className="truncate">{worker.email}</span>
                        </div>
                      </div>
                    )}

                    {/* Skills */}
                    {worker.skills && worker.skills.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-700 mb-1.5">Skills:</p>
                        <div className="flex flex-wrap gap-1">
                          {worker.skills.map((skill, idx) => (
                            <span 
                              key={idx}
                              className="px-1.5 py-0.5 bg-red-50 text-red-700 text-xs rounded border border-red-200"
                            >
                              {getPositionLabel(skill)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center space-x-1.5 pt-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); onSetPin(worker); }}
                        className="flex-1 flex items-center justify-center space-x-1 px-2 py-1.5 bg-green-50 text-green-700 rounded hover:bg-green-100 transition-colors text-xs font-medium"
                        title="Set PIN"
                      >
                        <Lock size={12} />
                        <span>PIN</span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onEditWorker(worker); }}
                        className="flex-1 flex items-center justify-center space-x-1 px-2 py-1.5 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors text-xs font-medium"
                        title="Edit Worker"
                      >
                        <Edit size={12} />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteWorker(worker.id); }}
                        className="flex-1 flex items-center justify-center space-x-1 px-2 py-1.5 bg-red-50 text-red-700 rounded hover:bg-red-100 transition-colors text-xs font-medium"
                        title="Delete Worker"
                      >
                        <Trash2 size={12} />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
