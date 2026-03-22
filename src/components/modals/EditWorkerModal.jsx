import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { getHostLabel } from '../../utils/hostLabelHelper';

export default function EditWorkerModal({
  open,
  worker,
  positions,
  locations = [],
  onClose,
  onSuccess
}) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    skills: [],
    rank: 1,
    home_location_id: null,
    is_host: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (worker) {
      setFormData({
        name: worker.name || '',
        email: worker.email || '',
        phone: worker.phone || '',
        skills: Array.isArray(worker.skills) ? worker.skills : [],
        rank: worker.rank || 1,
        home_location_id: worker.home_location_id || null,
        is_host: worker.is_host === true,
      });
    }
  }, [worker]);

  const skillOptions = positions || [];
  const hostLabel = getHostLabel();

  const toggleSkill = (skillKey) => {
    setFormData(prev => ({
      ...prev,
      skills: prev.skills.includes(skillKey)
        ? prev.skills.filter(s => s !== skillKey)
        : [...prev.skills, skillKey]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.skills.length === 0) {
      alert('Please select at least one skill');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('workers')
      .update({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        skills: formData.skills,
        rank: formData.rank,
        home_location_id: formData.home_location_id || null,
        is_host: formData.is_host,
      })
      .eq('id', worker.id);

    setSaving(false);
    if (error) {
      alert('Error saving worker: ' + error.message);
    } else {
      if (onSuccess) onSuccess();
      onClose();
    }
  };

  if (!open || !worker) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-2xl font-bold text-gray-900">Edit Worker</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={24} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="john@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
              <input
                type="tel"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="(555) 123-4567"
              />
            </div>

            {/* Home Location */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Home Location</label>
              <select
                value={formData.home_location_id || ''}
                onChange={(e) => setFormData({ ...formData, home_location_id: e.target.value || null })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="">— No home location set —</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}{loc.city ? ` (${loc.city})` : ''}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Used to calculate travel pay from worker's base to the event.</p>
            </div>

            {/* Host / Team Leader toggle */}
            <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">{hostLabel} / Team Leader</p>
                <p className="text-xs text-gray-500 mt-0.5">Can submit event reports and lead the crew on-site.</p>
              </div>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, is_host: !prev.is_host }))}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors flex-shrink-0 ml-4 ${
                  formData.is_host ? 'bg-amber-500' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  formData.is_host ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Skills *</label>
              <div className="flex flex-wrap gap-2">
                {skillOptions.map(skill => {
                  const skillKey = skill.key || skill;
                  const skillLabel = skill.label || skill;
                  const isSelected = formData.skills.includes(skillKey);
                  return (
                    <button
                      key={skillKey}
                      type="button"
                      onClick={() => toggleSkill(skillKey)}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        isSelected
                          ? 'bg-red-900 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {skillLabel}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rank Level</label>
              <select
                value={formData.rank}
                onChange={(e) => setFormData({ ...formData, rank: parseInt(e.target.value, 10) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                {[1, 2, 3, 4, 5].map(level => (
                  <option key={level} value={level}>Level {level}</option>
                ))}
              </select>
            </div>

            <div className="flex space-x-3 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-red-900 text-white px-6 py-3 rounded-lg hover:bg-red-800 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Changes</span>
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="flex-1 bg-gray-200 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-300 font-medium disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
