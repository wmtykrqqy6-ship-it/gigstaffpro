import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { getPositionKey } from '../../utils/positionHelpers';
import { WORKER_DEFAULTS, RELIABILITY, SUCCESS_MESSAGES, ERROR_MESSAGES } from '../../constants';

export default function EditWorkerModal({
  open,
  worker,
  positions,
  onClose,
  onSuccess
}) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    skills: [],
    rank: WORKER_DEFAULTS.RANK,
    reliability: WORKER_DEFAULTS.RELIABILITY
  });
  const [saving, setSaving] = useState(false);

  // Populate form when worker changes
  useEffect(() => {
    if (worker) {
      // Migrate old skill format (labels) to new format (keys)
      const migratedSkills = (worker.skills || []).map(skill => {
        if (typeof skill === 'string') {
          // Try to find matching position by label first, fallback to key
          const position = positions.find(p => p.label === skill || p.key === skill);
          if (position) return position.key;
          // If not found, convert to key format
          return getPositionKey(skill);
        }
        return skill;
      });
      
      setFormData({
        name: worker.name || '',
        email: worker.email || '',
        phone: worker.phone || '',
        skills: migratedSkills,
        rank: worker.rank || WORKER_DEFAULTS.RANK,
        reliability: worker.reliability || WORKER_DEFAULTS.RELIABILITY
      });
    }
  }, [worker, positions]);

  if (!open || !worker) return null;

  // Use positions from settings as available skills
  const skillOptions = positions;

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.skills.length === 0) {
      alert(ERROR_MESSAGES.VALIDATION.SKILLS_REQUIRED);
      return;
    }
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('workers')
        .update(formData)
        .eq('id', worker.id);
      
      if (error) throw error;
      
      alert(SUCCESS_MESSAGES.WORKER_SAVED);
      
      // Reset form
      setFormData({
        name: '',
        email: '',
        phone: '',
        skills: [],
        rank: WORKER_DEFAULTS.RANK,
        reliability: WORKER_DEFAULTS.RELIABILITY
      });
      
      // Call success callback (to refresh worker list)
      if (onSuccess) {
        await onSuccess();
      }
      
      // Close modal
      onClose();
    } catch (error) {
      alert(ERROR_MESSAGES.DATA.UPDATE_FAILED + ': ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleSkill = (skill) => {
    setFormData(prev => ({
      ...prev,
      skills: prev.skills.includes(skill)
        ? prev.skills.filter(s => s !== skill)
        : [...prev.skills, skill]
    }));
  };

  const handleClose = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      skills: [],
      rank: WORKER_DEFAULTS.RANK,
      reliability: WORKER_DEFAULTS.RELIABILITY
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-2xl font-bold text-gray-900">Edit Worker</h3>
            <button 
              onClick={handleClose} 
              className="text-gray-400 hover:text-gray-600"
            >
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
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
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
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="(555) 123-4567"
              />
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
                onChange={(e) => setFormData({...formData, rank: parseInt(e.target.value, 10)})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                {[1, 2, 3, 4, 5].map(level => (
                  <option key={level} value={level}>Level {level}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reliability Rating ({RELIABILITY.MIN} - {RELIABILITY.MAX})
              </label>
              <input
                type="number"
                min={RELIABILITY.MIN}
                max={RELIABILITY.MAX}
                step="0.1"
                value={formData.reliability}
                onChange={(e) => setFormData({...formData, reliability: parseFloat(e.target.value)})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>

            <div className="flex space-x-3 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-red-900 text-white px-6 py-3 rounded-lg hover:bg-red-800 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {saving ? 'Updating...' : 'Update Worker'}
              </button>
              <button
                type="button"
                onClick={handleClose}
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
