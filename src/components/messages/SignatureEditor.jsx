import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { callSignatureApi } from '../../utils/emailSignatureApi';

// "My signature": the name shown on my replies and the signature added to
// the end of every reply I send from Messages (still sent from sales@).
export default function SignatureEditor({ mine, onClose, onSaved }) {
  const notify = useToast();
  const [displayName, setDisplayName] = useState(mine?.display_name || '');
  const [signature, setSignature] = useState(mine?.signature || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const r = await callSignatureApi('signature-save', { displayName, signature });
    setSaving(false);
    if (!r.ok) { notify('Could not save: ' + r.error); return; }
    notify('Signature saved');
    onSaved?.(r.mine);
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-gray-900">My email signature</h3>
          <p className="text-xs text-gray-500">Added to the end of every reply you send from Messages. Replies still come from sales@vegasonwheels.com.</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close"><X size={18} /></button>
      </div>
      <label className="block text-sm">
        <span className="text-gray-700">Your name (shown on your replies in Messages)</span>
        <input className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" maxLength={80}
          value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Sam Lee" />
      </label>
      <label className="block text-sm">
        <span className="text-gray-700">Signature</span>
        <textarea className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" rows={5} maxLength={1000}
          value={signature} onChange={e => setSignature(e.target.value)}
          placeholder={'Sam Lee\nEvent Sales, Vegas on Wheels\n(262) 549-3559\nvegasonwheels.com'} />
      </label>
      <div className="flex space-x-2">
        <button onClick={save} disabled={saving} className="bg-red-900 text-white px-4 py-2 rounded-lg hover:bg-red-800 disabled:bg-gray-300 text-sm">
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">Cancel</button>
      </div>
    </div>
  );
}
