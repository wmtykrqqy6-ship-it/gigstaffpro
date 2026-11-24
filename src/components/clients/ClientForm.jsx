import React, { useState } from 'react';
import { Save } from 'lucide-react';
import { CLIENT_TYPES } from '../../utils/clientRecords';

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm';

// Add / edit a client. `form` and `setForm` are owned by the parent.
export default function ClientForm({ title, form, setForm, saving, onSave, onCancel, saveLabel }) {
  const [tagInput, setTagInput] = useState('');

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) setForm(f => ({ ...f, tags: [...f.tags, tag] }));
    setTagInput('');
  };
  const removeTag = (tag) => setForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }));
  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  return (
    <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-900">
      <h4 className="text-lg font-bold text-gray-900 mb-4">{title}</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Client name *</label>
          <input type="text" value={form.name} onChange={set('name')}
            placeholder="e.g. John Smith / ABC Corp" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Company</label>
          <input type="text" value={form.company} onChange={set('company')}
            placeholder="e.g. ABC Corporation" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Type</label>
          <select value={form.client_type} onChange={set('client_type')} className={inputClass}>
            <option value="">Not set</option>
            {CLIENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center space-x-2 text-sm text-gray-700 pb-2">
            <input type="checkbox" checked={form.is_active}
              onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
            <span>Active (shows in the event form's client list)</span>
          </label>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Phone</label>
          <input type="text" value={form.phone} onChange={set('phone')}
            placeholder="(414) 555-0100" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Email</label>
          <input type="email" value={form.email} onChange={set('email')}
            placeholder="client@company.com" className={inputClass} />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-gray-700 mb-1">Billing address</label>
          <textarea value={form.billing_address} onChange={set('billing_address')} rows={2}
            placeholder="Street, city, state, ZIP" className={inputClass} />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-gray-700 mb-1">Tags</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {form.tags.map(tag => (
              <span key={tag} className="inline-flex items-center space-x-1 bg-red-50 text-red-800 text-xs px-2 py-1 rounded-full border border-red-200">
                <span>{tag}</span>
                <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-600 ml-1">×</button>
              </span>
            ))}
          </div>
          <div className="flex space-x-2">
            <input type="text" value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
              placeholder="e.g. Repeat, VIP, Holiday party"
              className={`flex-1 ${inputClass}`} />
            <button type="button" onClick={addTag} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm">
              + Add
            </button>
          </div>
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-gray-700 mb-1">About this client</label>
          <textarea value={form.notes} onChange={set('notes')} rows={2}
            placeholder="Preferences, special requirements, how you met them. Dated notes go in the client's history."
            className={inputClass} />
        </div>
      </div>
      <div className="flex space-x-3">
        <button onClick={onSave} disabled={saving}
          className="bg-red-900 text-white px-5 py-2 rounded-lg hover:bg-red-800 disabled:bg-gray-400 flex items-center space-x-2 text-sm">
          <Save size={15} />
          <span>{saving ? 'Saving...' : saveLabel}</span>
        </button>
        <button onClick={onCancel} className="px-5 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}
