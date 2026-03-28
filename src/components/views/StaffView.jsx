import React, { useState, useEffect } from 'react';
import { Users, Plus, Mail, Edit, Trash2, Search, Lock, Phone, Shield, MapPin } from 'lucide-react';
import { getPositionLabel } from '../../utils/positionHelpers';
import { getHostLabel, getHostLabelPlural } from '../../utils/hostLabelHelper';
import { supabase } from '../../supabaseClient';


const formatPhone = (p) => {
  if (!p) return '';
  const d = p.replace(/[^0-9]/g, '');
  if (d.length === 10) return '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6);
  if (d.length === 11 && d[0] === '1') return '(' + d.slice(1,4) + ') ' + d.slice(4,7) + '-' + d.slice(7);
  return p;
};

export default function StaffView({
  loading,
  error,
  workers,
  assignments = [],
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
      if (rankFilter === 'new') {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        if (!worker.created_at || new Date(worker.created_at) < sevenDaysAgo) return false;
      } else if (rankFilter === '5-star' && worker.reliability !== 5) return false;
      else if (rankFilter !== '5-star' && rankFilter !== 'new' && worker.rank !== parseInt(rankFilter)) return false;
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

  // Compute live gig counts from assignments (approved/confirmed only)
  const getGigCount = (workerId) =>
    assignments.filter(a => a.worker_id === workerId && ['approved', 'confirmed', 'assigned'].includes(a.status)).length;

  // Sort workers
  const sortedWorkers = [...filteredWorkers].sort((a, b) => {
    if (sortBy === 'name') {
      return (a.name || '').localeCompare(b.name || '');
    } else if (sortBy === 'rating') {
      return (b.reliability || 0) - (a.reliability || 0);
    } else if (sortBy === 'gigs') {
      return getGigCount(b.id) - getGigCount(a.id);
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
            <span>Invite Worker</span>
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

        {/* Market filter - always visible when multiple locations exist */}
        {locations.length > 1 && (
          <div className="mt-3">
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm ${
                locationFilter !== 'all' ? 'border-purple-400 bg-purple-50 text-purple-900 font-medium' : 'border-gray-300'
              }`}
            >
              <option value="all">📍 All Markets</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>
                  📍 {loc.name}{loc.city ? ` — ${loc.city}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

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
                <option value="new">✦ New (last 7 days)</option>
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
              <label className="block text-xs font-medium text-gray-700 mb-1">{getHostLabel()} Status</label>
              <select
                value={hostFilter}
                onChange={(e) => setHostFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="all">All Workers</option>
                <option value="hosts">🎯 {getHostLabelPlural()} Only</option>
                <option value="non-hosts">Non-{getHostLabelPlural()} Only</option>
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
                style={{display:'flex',background:'white',border:'0.5px solid #e5e7eb',borderRadius:'12px',overflow:'hidden',transition:'border-color 0.15s'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor='#d1d5db'}
                onMouseLeave={e=>e.currentTarget.style.borderColor='#e5e7eb'}
              >
                {/* Rank accent bar */}
                <div style={{width:'3px',flexShrink:0,background:({1:'#EF9F27',2:'#378ADD',3:'#7F77DD',4:'#888780',5:'#B4B2A9'})[worker.rank||1]||'#B4B2A9'}} />

                <div style={{flex:1,minWidth:0}}>
                  {/* Compact header */}
                  <div style={{padding:'14px 14px 12px',cursor:'pointer'}} onClick={()=>toggleCard(worker.id)}>
                    <div style={{display:'flex',gap:'12px',alignItems:'flex-start'}}>

                      {/* Avatar: photo or rank-colored initials */}
                      {worker.photo_url ? (
                        <img src={worker.photo_url} alt={worker.name}
                          style={{width:'40px',height:'40px',borderRadius:'50%',objectFit:'cover',flexShrink:0,border:'0.5px solid #e5e7eb'}} />
                      ) : (()=>{
                        const rank = worker.rank||1;
                        const initials = (worker.name||'?').split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase();
                        const av = {1:{bg:'#FAEEDA',c:'#854F0B'},2:{bg:'#E6F1FB',c:'#185FA5'},3:{bg:'#EEEDFE',c:'#534AB7'},4:{bg:'#D3D1C7',c:'#444441'},5:{bg:'#F1EFE8',c:'#888780'}};
                        const a = av[rank]||av[5];
                        return <div style={{width:'40px',height:'40px',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'14px',fontWeight:'500',flexShrink:0,background:a.bg,color:a.c}}>{initials}</div>;
                      })()}

                      {/* Name + badges */}
                      <div style={{flex:1,minWidth:0}}>
                        <p style={{fontSize:'14px',fontWeight:'500',margin:'0 0 5px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',color:'#111827'}}>{worker.name}</p>
                        <div style={{display:'flex',alignItems:'center',gap:'5px',flexWrap:'wrap'}}>
                          {/* Rank badge */}
                          {(()=>{
                            const rank = worker.rank||1;
                            const rb = {1:{bg:'#FAEEDA',c:'#854F0B'},2:{bg:'#E6F1FB',c:'#185FA5'},3:{bg:'#EEEDFE',c:'#534AB7'},4:{bg:'#F1EFE8',c:'#5F5E5A'},5:{bg:'#F1EFE8',c:'#888780'}};
                            const r = rb[rank]||rb[5];
                            return <span style={{fontSize:'11px',fontWeight:'500',padding:'2px 7px',borderRadius:'20px',background:r.bg,color:r.c,whiteSpace:'nowrap'}}>Rank {rank}</span>;
                          })()}
                          {/* Host badge */}
                          {worker.is_host && <span style={{fontSize:'11px',fontWeight:'500',padding:'2px 7px',borderRadius:'20px',background:'#FAECE7',color:'#993C1D',display:'inline-flex',alignItems:'center',gap:'2px',whiteSpace:'nowrap'}}><Shield size={10}/>{getHostLabel()}</span>}
                          {/* New badge */}
                          {worker.created_at && (new Date()-new Date(worker.created_at))<7*24*60*60*1000 && <span style={{fontSize:'11px',fontWeight:'500',padding:'2px 7px',borderRadius:'20px',background:'#EAF3DE',color:'#3B6D11',whiteSpace:'nowrap'}}>✦ New</span>}
                          {/* Rating badge: ≥4.5 green, ≥4.0 amber, ≥3.0 orange, <3.0 red */}
                          {(()=>{
                            const rating = worker.reliability??5.0;
                            const s = rating>=4.5?{bg:'#EAF3DE',c:'#3B6D11'}:rating>=4.0?{bg:'#FAEEDA',c:'#854F0B'}:rating>=3.0?{bg:'#FAECE7',c:'#993C1D'}:{bg:'#FCEBEB',c:'#A32D2D'};
                            return <span style={{fontSize:'11px',fontWeight:'500',padding:'2px 7px',borderRadius:'20px',background:s.bg,color:s.c,whiteSpace:'nowrap'}}>★ {rating.toFixed(1)}</span>;
                          })()}
                        </div>
                      </div>

                      {/* Gig count */}
                      <div style={{fontSize:'11px',fontWeight:'500',color:'#9ca3af',flexShrink:0,paddingTop:'2px'}}>{getGigCount(worker.id)} gigs</div>
                    </div>

                    {/* Phone */}
                    {worker.phone && (
                      <div style={{display:'flex',alignItems:'center',gap:'6px',marginTop:'10px',borderTop:'0.5px solid #f3f4f6',paddingTop:'10px'}}>
                        <Phone size={12} style={{color:'#9ca3af',flexShrink:0}} />
                        <span style={{fontSize:'12px',color:'#9ca3af'}}>{formatPhone(worker.phone)}</span>
                      </div>
                    )}
                  </div>

                  {/* Expanded section */}
                  {isExpanded && (
                    <div style={{borderTop:'0.5px solid #f3f4f6',padding:'12px 14px 14px',display:'flex',flexDirection:'column',gap:'10px'}}>

                      {/* Contact info */}
                      <div style={{display:'flex',flexDirection:'column',gap:'5px'}}>
                        {worker.email && (
                          <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                            <Mail size={12} style={{color:'#9ca3af',flexShrink:0}} />
                            <span style={{fontSize:'12px',color:'#6b7280',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{worker.email}</span>
                          </div>
                        )}
                        {worker.address && (
                          <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                            <MapPin size={12} style={{color:'#9ca3af',flexShrink:0}} />
                            <span style={{fontSize:'12px',color:'#6b7280',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{worker.address}</span>
                          </div>
                        )}
                      </div>

                      {/* Skills */}
                      {worker.skills && worker.skills.length > 0 && (
                        <div>
                          <p style={{fontSize:'11px',fontWeight:'500',color:'#9ca3af',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 5px'}}>Skills</p>
                          <div style={{display:'flex',flexWrap:'wrap',gap:'4px'}}>
                            {worker.skills.map((skill,idx) => (
                              <span key={idx} style={{fontSize:'11px',padding:'2px 7px',borderRadius:'20px',background:'#FEF2F2',color:'#991B1B',border:'0.5px solid #FECACA'}}>
                                {getPositionLabel(skill)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Markets */}
                      {locations.length > 1 && (
                        <div>
                          <p style={{fontSize:'11px',fontWeight:'500',color:'#9ca3af',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 5px'}}>Markets</p>
                          <div style={{display:'flex',flexWrap:'wrap',gap:'4px'}}>
                            {locations.map(loc => {
                              const approved = (workerLocationMap[worker.id]||[]).includes(loc.id);
                              return (
                                <button
                                  key={loc.id}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (approved) {
                                      await supabase.from('worker_locations').delete().eq('worker_id',worker.id).eq('location_id',loc.id);
                                      setWorkerLocationMap(prev=>({...prev,[worker.id]:(prev[worker.id]||[]).filter(id=>id!==loc.id)}));
                                    } else {
                                      await supabase.from('worker_locations').insert({worker_id:worker.id,location_id:loc.id,approved:true});
                                      setWorkerLocationMap(prev=>({...prev,[worker.id]:[...(prev[worker.id]||[]),loc.id]}));
                                    }
                                  }}
                                  style={{fontSize:'11px',fontWeight:'500',padding:'2px 7px',borderRadius:'20px',border:'none',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:'3px',background:approved?'#DCFCE7':' #F3F4F6',color:approved?'#166534':'#6b7280'}}
                                >
                                  <MapPin size={9}/>{loc.name}{approved && ' ✓'}
                                </button>
                              );
                            })}
                          </div>
                          <p style={{fontSize:'11px',color:'#9ca3af',marginTop:'4px'}}>Tap a market to approve or remove</p>
                        </div>
                      )}

                      {/* Actions */}
                      <div style={{display:'flex',gap:'6px',paddingTop:'2px'}}>
                        <button onClick={(e)=>{e.stopPropagation();onSetPin(worker);}}
                          style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:'4px',padding:'6px',borderRadius:'8px',border:'0.5px solid #d1fae5',background:'#f0fdf4',color:'#065f46',fontSize:'11px',fontWeight:'500',cursor:'pointer'}}>
                          <Lock size={11}/>PIN
                        </button>
                        <button onClick={(e)=>{e.stopPropagation();onEditWorker(worker);}}
                          style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:'4px',padding:'6px',borderRadius:'8px',border:'0.5px solid #dbeafe',background:'#eff6ff',color:'#1e40af',fontSize:'11px',fontWeight:'500',cursor:'pointer'}}>
                          <Edit size={11}/>Edit
                        </button>
                        <button onClick={(e)=>{e.stopPropagation();onDeleteWorker(worker.id);}}
                          style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:'4px',padding:'6px',borderRadius:'8px',border:'0.5px solid #fee2e2',background:'#fff1f2',color:'#9f1239',fontSize:'11px',fontWeight:'500',cursor:'pointer'}}>
                          <Trash2 size={11}/>Delete
                        </button>
                      </div>

                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
