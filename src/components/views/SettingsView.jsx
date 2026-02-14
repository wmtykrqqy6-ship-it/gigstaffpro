import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, CheckCircle, XCircle, MapPin } from 'lucide-react';
import { supabase } from '../../supabaseClient';

export default function SettingsView({
  positions,
  onUpdatePositions
}) {
  const [newPosition, setNewPosition] = useState('');
  const [editingPosition, setEditingPosition] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [warehouseAddress, setWarehouseAddress] = useState('');
  const [loadingWarehouse, setLoadingWarehouse] = useState(true);
  const [paymentTrackingEnabled, setPaymentTrackingEnabled] = useState(true);
  const [loadingPaymentSetting, setLoadingPaymentSetting] = useState(true);
  const [rankAccessDays, setRankAccessDays] = useState({
    1: 0,   // Rank 1 sees immediately
    2: 7,   // Rank 2 sees 7 days before
    3: 10,  // Rank 3 sees 10 days before
    4: 12,  // Rank 4 sees 12 days before
    5: 14   // Rank 5 sees 14 days before
  });
  const [loadingRankAccess, setLoadingRankAccess] = useState(true);
  const [timezone, setTimezone] = useState('America/Chicago');
  const [timeFormat, setTimeFormat] = useState('12'); // '12' or '24'
  const [loadingTimeSettings, setLoadingTimeSettings] = useState(true);

  useEffect(() => {
    loadWarehouseAddress();
    loadPaymentTrackingSetting();
    loadRankAccessSettings();
    loadTimeSettings();
  }, []);

  const loadWarehouseAddress = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'warehouse_address')
        .single();
      
      if (!error && data) {
        setWarehouseAddress(data.setting_value || '');
      } else {
        // Set default for Vegas on Wheels
        setWarehouseAddress('535 S 93rd St, Milwaukee, WI 53214');
      }
    } catch (error) {
      setWarehouseAddress('535 S 93rd St, Milwaukee, WI 53214');
    } finally {
      setLoadingWarehouse(false);
    }
  };


  const loadPaymentTrackingSetting = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'payment_tracking_enabled')
        .single();
      
      if (!error && data) {
        setPaymentTrackingEnabled(data.setting_value === 'true' || data.setting_value === true);
      } else {
        // Default to enabled
        setPaymentTrackingEnabled(true);
      }
    } catch (error) {
      setPaymentTrackingEnabled(true);
    } finally {
      setLoadingPaymentSetting(false);
    }
  };

  const togglePaymentTracking = async (enabled) => {
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'payment_tracking_enabled')
        .single();

      if (existing) {
        const { error } = await supabase
          .from('settings')
          .update({ 
            setting_value: enabled.toString(),
            updated_at: new Date().toISOString()
          })
          .eq('setting_key', 'payment_tracking_enabled');
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('settings')
          .insert([{
            setting_key: 'payment_tracking_enabled',
            setting_value: enabled.toString()
          }]);
        
        if (error) throw error;
      }

      setPaymentTrackingEnabled(enabled);
      alert(enabled ? 'Payment tracking enabled!' : 'Payment tracking disabled!');
    } catch (error) {
      alert('Error saving setting: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const loadRankAccessSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'rank_access_days')
        .single();
      
      if (!error && data && data.setting_value) {
        setRankAccessDays(JSON.parse(data.setting_value));
      }
    } catch (error) {
    } finally {
      setLoadingRankAccess(false);
    }
  };

  const saveRankAccessSettings = async () => {
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'rank_access_days')
        .single();

      if (existing) {
        const { error } = await supabase
          .from('settings')
          .update({ 
            setting_value: JSON.stringify(rankAccessDays),
            updated_at: new Date().toISOString()
          })
          .eq('setting_key', 'rank_access_days');
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('settings')
          .insert([{
            setting_key: 'rank_access_days',
            setting_value: JSON.stringify(rankAccessDays)
          }]);
        
        if (error) throw error;
      }

      alert('Rank access settings saved successfully!');
    } catch (error) {
      alert('Error saving settings: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const saveWarehouseAddress = async () => {
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'warehouse_address')
        .single();

      if (existing) {
        const { error } = await supabase
          .from('settings')
          .update({ 
            setting_value: warehouseAddress,
            updated_at: new Date().toISOString()
          })
          .eq('setting_key', 'warehouse_address');
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('settings')
          .insert([{
            setting_key: 'warehouse_address',
            setting_value: warehouseAddress
          }]);
        
        if (error) throw error;
      }

      alert('Warehouse address saved successfully!');
    } catch (error) {
      alert('Error saving warehouse address: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const loadTimeSettings = async () => {
    try {
      // Load timezone
      const { data: tzData } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'timezone')
        .single();
      
      if (tzData) {
        setTimezone(tzData.setting_value || 'America/Chicago');
      }

      // Load time format
      const { data: formatData } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'time_format')
        .single();
      
      if (formatData) {
        setTimeFormat(formatData.setting_value || '12');
      }
    } catch (error) {
    } finally {
      setLoadingTimeSettings(false);
    }
  };

  const saveTimeSettings = async () => {
    setSaving(true);
    try {
      // Save timezone
      const { data: existingTz } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'timezone')
        .single();

      if (existingTz) {
        await supabase
          .from('settings')
          .update({ 
            setting_value: timezone,
            updated_at: new Date().toISOString()
          })
          .eq('setting_key', 'timezone');
      } else {
        await supabase
          .from('settings')
          .insert([{
            setting_key: 'timezone',
            setting_value: timezone
          }]);
      }

      // Save time format
      const { data: existingFormat } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'time_format')
        .single();

      if (existingFormat) {
        await supabase
          .from('settings')
          .update({ 
            setting_value: timeFormat,
            updated_at: new Date().toISOString()
          })
          .eq('setting_key', 'time_format');
      } else {
        await supabase
          .from('settings')
          .insert([{
            setting_key: 'time_format',
            setting_value: timeFormat
          }]);
      }

      alert('Time settings saved successfully!');
    } catch (error) {
      alert('Error saving time settings: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const savePositions = async (updatedPositions) => {
    setSaving(true);
    try {
      // Sort alphabetically by label
      const sortedPositions = [...updatedPositions].sort((a, b) => {
        const labelA = a.label || a;
        const labelB = b.label || b;
        return labelA.localeCompare(labelB);
      });
      
      // Check if settings exist
      const { data: existingSettings } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'positions')
        .single();

      if (existingSettings) {
        // Update existing
        const { error } = await supabase
          .from('settings')
          .update({ 
            setting_value: sortedPositions,
            updated_at: new Date().toISOString()
          })
          .eq('setting_key', 'positions');
        
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('settings')
          .insert([{
            setting_key: 'positions',
            setting_value: sortedPositions
          }]);
        
        if (error) throw error;
      }

      onUpdatePositions(sortedPositions);
      alert('Positions updated successfully!');
    } catch (error) {
      alert('Error saving positions: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddPosition = async () => {
    if (!newPosition.trim()) {
      alert('Please enter a position name');
      return;
    }
    
    const newKey = newPosition.trim().toLowerCase().replace(/\s+/g, '_');
    const newLabel = newPosition.trim();
    
    if (positions.some(p => p.key === newKey)) {
      alert('This position already exists');
      return;
    }
    
    const updatedPositions = [...positions, { key: newKey, label: newLabel }];
    await savePositions(updatedPositions);
    setNewPosition('');
  };

  const handleDeletePosition = async (position) => {
    const label = position.label || position;
    if (!confirm(`Are you sure you want to delete "${label}"?`)) return;
    
    const posKey = position.key || position;
    const updatedPositions = positions.filter(p => p.key !== posKey);
    await savePositions(updatedPositions);
  };

  const handleEditPosition = (position) => {
    setEditingPosition(position.key || position);
    setEditValue(position.label || position);
  };

  const handleSaveEdit = async () => {
    if (!editValue.trim()) {
      alert('Position name cannot be empty');
      return;
    }
    
    const newLabel = editValue.trim();
    
    const updatedPositions = positions.map(p => {
      if (p.key === editingPosition) {
        return { ...p, label: newLabel };
      }
      return p;
    });
    
    await savePositions(updatedPositions);
    setEditingPosition(null);
    setEditValue('');
  };

  const handleCancelEdit = () => {
    setEditingPosition(null);
    setEditValue('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-600 mt-1">Manage your position types and system settings</p>
      </div>

      {/* Positions Management */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Position Types</h3>
        <p className="text-sm text-gray-600 mb-4">
          Customize the positions available in your system. These positions will be used for:
        </p>
        <ul className="text-sm text-gray-600 mb-4 list-disc list-inside space-y-1">
          <li><strong>Event Staffing:</strong> When creating events, you'll select how many of each position you need</li>
          <li><strong>Worker Skills:</strong> When adding/editing workers, these become the available skills they can have</li>
          <li><strong>Assignment Matching:</strong> Workers are automatically matched to positions based on their skills</li>
        </ul>
        <p className="text-sm text-blue-600 bg-blue-50 p-3 rounded mb-4">
          💡 Tip: When you add a new position like "Baccarat Dealer", it immediately becomes available both as an event position AND a worker skill.
        </p>

        {/* Add New Position */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Add New Position</label>
          <div className="flex space-x-2">
            <input
              type="text"
              value={newPosition}
              onChange={(e) => setNewPosition(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddPosition()}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              placeholder="e.g., Baccarat Dealer"
              disabled={saving}
            />
            <button
              onClick={handleAddPosition}
              disabled={saving}
              className="bg-red-900 text-white px-6 py-2 rounded-lg hover:bg-red-800 disabled:bg-gray-400 flex items-center space-x-2"
            >
              <Plus size={18} />
              <span>Add</span>
            </button>
          </div>
        </div>

        {/* Existing Positions */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Current Positions ({positions.length})</label>
          <div className="space-y-2">
            {positions.length === 0 ? (
              <p className="text-gray-500 text-sm py-4">No positions configured yet. Add your first position above.</p>
            ) : (
              positions.map((position, idx) => {
                const posLabel = position.label || position;
                const posKey = position.key || position.toLowerCase().replace(/\s+/g, '_');
                const isEditing = editingPosition === posKey;
                
                return (
                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                  {isEditing ? (
                    <>
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSaveEdit()}
                        className="flex-1 px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        autoFocus
                      />
                      <div className="flex space-x-2 ml-3">
                        <button
                          onClick={handleSaveEdit}
                          className="text-green-600 hover:text-green-800 p-1 hover:bg-green-50 rounded"
                          title="Save"
                        >
                          <CheckCircle size={20} />
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="text-gray-600 hover:text-gray-800 p-1 hover:bg-gray-200 rounded"
                          title="Cancel"
                        >
                          <XCircle size={20} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="font-medium text-gray-900">{posLabel}</span>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEditPosition(position)}
                          className="text-blue-600 hover:text-blue-800 p-1 hover:bg-blue-50 rounded transition-colors"
                          title="Edit"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={() => handleDeletePosition(position)}
                          className="text-red-600 hover:text-red-800 p-1 hover:bg-red-50 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Warehouse Address */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
          <MapPin size={20} />
          <span>Warehouse Address</span>
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          This address is used for calculating miles traveled to events.
        </p>
        
        {loadingWarehouse ? (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-900"></div>
          </div>
        ) : (
          <div className="space-y-4">
            <input
              type="text"
              value={warehouseAddress}
              onChange={(e) => setWarehouseAddress(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              placeholder="Enter warehouse address"
              disabled={saving}
            />
            <button
              onClick={saveWarehouseAddress}
              disabled={saving}
              className="bg-red-900 text-white px-6 py-2 rounded-lg hover:bg-red-800 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Address'}
            </button>
          </div>
        )}
      </div>

      {/* Payment Tracking Toggle */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Payment Tracking</h3>
        <p className="text-sm text-gray-600 mb-4">
          Control whether workers see payment information for their assignments.
        </p>
        
        {loadingPaymentSetting ? (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-900"></div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900 mb-1">
                {paymentTrackingEnabled ? 'Payment Tracking Enabled' : 'Payment Tracking Disabled'}
              </p>
              <p className="text-sm text-gray-600">
                {paymentTrackingEnabled 
                  ? 'Payment tracking is currently enabled. Workers will see pay info on assignments.' 
                  : 'Payment tracking is currently disabled. Payment features are hidden.'}
              </p>
            </div>
            <button
              onClick={() => togglePaymentTracking(!paymentTrackingEnabled)}
              disabled={saving}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                paymentTrackingEnabled ? 'bg-green-600' : 'bg-gray-300'
              } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  paymentTrackingEnabled ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        )}
      </div>

      {/* Rank-Based Event Access */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Worker Event Access (Rank-Based)</h3>
        <p className="text-sm text-gray-600 mb-4">
          Control when workers can see and sign up for events based on their rank. Lower rank numbers (better workers) get earlier access.
        </p>
        
        {loadingRankAccess ? (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-900"></div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4, 5].map(rank => (
                <div key={rank} className="border border-gray-200 rounded-lg p-4">
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Rank {rank} {rank === 1 && '(Best)'}  {rank === 5 && '(New)'}
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      min="0"
                      value={rankAccessDays[rank]}
                      onChange={(e) => setRankAccessDays({
                        ...rankAccessDays,
                        [rank]: parseInt(e.target.value, 10) || 0
                      })}
                      className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      disabled={saving}
                    />
                    <span className="text-sm text-gray-600">
                      days before event
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {rankAccessDays[rank] === 0 
                      ? 'Can see events immediately' 
                      : `Can see events ${rankAccessDays[rank]} days before`}
                  </p>
                </div>
              ))}
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
              <p className="text-blue-900 font-semibold mb-2">Example Timeline:</p>
              <ul className="text-blue-800 space-y-1">
                <li>• Event created: Rank 1 workers see it immediately</li>
                <li>• {rankAccessDays[2]} days before: Rank 2 workers can sign up</li>
                <li>• {rankAccessDays[3]} days before: Rank 3 workers can sign up</li>
                <li>• {rankAccessDays[4]} days before: Rank 4 workers can sign up</li>
                <li>• {rankAccessDays[5]} days before: Rank 5 workers can sign up</li>
              </ul>
            </div>

            <button
              onClick={saveRankAccessSettings}
              disabled={saving}
              className="bg-red-900 text-white px-6 py-2 rounded-lg hover:bg-red-800 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Access Settings'}
            </button>
          </div>
        )}
      </div>

      {/* Time & Date Settings */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Time & Date Settings</h3>
        <p className="text-sm text-gray-600 mb-4">
          Configure timezone and time display format for your organization.
        </p>
        
        {loadingTimeSettings ? (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-900"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Timezone Setting */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Timezone
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full md:w-96 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                disabled={saving}
              >
                <option value="America/New_York">Eastern Time (ET)</option>
                <option value="America/Chicago">Central Time (CT)</option>
                <option value="America/Denver">Mountain Time (MT)</option>
                <option value="America/Phoenix">Arizona (MST - No DST)</option>
                <option value="America/Los_Angeles">Pacific Time (PT)</option>
                <option value="America/Anchorage">Alaska Time (AKT)</option>
                <option value="Pacific/Honolulu">Hawaii Time (HST)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                All event times and dates will be displayed in this timezone
              </p>
            </div>

            {/* Time Format Setting */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Time Format
              </label>
              <div className="flex space-x-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    value="12"
                    checked={timeFormat === '12'}
                    onChange={(e) => setTimeFormat(e.target.value)}
                    disabled={saving}
                    className="w-4 h-4 text-red-900 focus:ring-red-500"
                  />
                  <span className="text-sm">12-hour (2:30 PM)</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    value="24"
                    checked={timeFormat === '24'}
                    onChange={(e) => setTimeFormat(e.target.value)}
                    disabled={saving}
                    className="w-4 h-4 text-red-900 focus:ring-red-500"
                  />
                  <span className="text-sm">24-hour (14:30)</span>
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Choose how times are displayed throughout the app
              </p>
            </div>

            <button
              onClick={saveTimeSettings}
              disabled={saving}
              className="bg-red-900 text-white px-6 py-2 rounded-lg hover:bg-red-800 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Time Settings'}
            </button>
          </div>
        )}
      </div>

      {/* Future Settings Sections */}
      <div className="bg-gray-50 rounded-lg p-6 border-2 border-dashed border-gray-300">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">More Settings Coming Soon</h3>
        <p className="text-sm text-gray-600">
          Additional settings like worker skills, pay rates, and notification preferences will be added here.
        </p>
      </div>
    </div>
  );
}
