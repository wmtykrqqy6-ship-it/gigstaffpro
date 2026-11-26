import React, { useState, useRef } from 'react';
import { X, Upload } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { callSignatureApi } from '../../utils/emailSignatureApi';

const MAX_LOGO_BYTES = 500 * 1024; // same as api/_lib/emailSignatures.js
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/gif'];

const readAsBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

// "My signature": the name shown on my replies and the signature added to
// the end of every reply I send from Messages (still sent from sales@).
export default function SignatureEditor({ mine, onClose, onSaved, onLogoChange }) {
  const notify = useToast();
  const [displayName, setDisplayName] = useState(mine?.display_name || '');
  const [signature, setSignature] = useState(mine?.signature || '');
  const [logoUrl, setLogoUrl] = useState(mine?.logo_url || '');
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);
  const [saving, setSaving] = useState(false);

  // Uploads right away (the server stores it and saves the link).
  const uploadLogo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) { notify('Use a PNG, JPG or GIF image.'); return; }
    if (file.size > MAX_LOGO_BYTES) { notify('The image must be smaller than 500 KB.'); return; }
    setUploading(true);
    try {
      const dataBase64 = await readAsBase64(file);
      const r = await callSignatureApi('signature-logo', { dataBase64, contentType: file.type });
      if (!r.ok) { notify('Could not upload: ' + r.error); return; }
      setLogoUrl(r.logo_url || '');
      onLogoChange?.(r.logo_url || '');
      notify('Logo uploaded');
    } catch {
      notify('Could not read that file.');
    } finally {
      setUploading(false);
    }
  };

  const removeLogo = async () => {
    setUploading(true);
    const r = await callSignatureApi('signature-logo', { remove: true });
    setUploading(false);
    if (!r.ok) { notify('Could not remove: ' + r.error); return; }
    setLogoUrl('');
    onLogoChange?.('');
  };

  const save = async () => {
    setSaving(true);
    const r = await callSignatureApi('signature-save', { displayName, signature });
    setSaving(false);
    if (!r.ok) { notify('Could not save: ' + r.error); return; }
    notify('Signature saved');
    onSaved?.({ ...r.mine, logo_url: logoUrl });
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
      <div className="text-sm space-y-1">
        <span className="text-gray-700">Logo under your signature (optional)</span>
        {logoUrl && <img src={logoUrl} alt="Your logo" className="h-auto border rounded bg-white p-1" style={{ width: 160 }} />}
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/gif" className="hidden" onChange={uploadLogo} />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading}
            className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 text-xs flex items-center space-x-1">
            <Upload size={12} /><span>{uploading ? 'Uploading...' : logoUrl ? 'Upload a different logo' : 'Upload logo'}</span>
          </button>
          {logoUrl && <button type="button" onClick={removeLogo} disabled={uploading} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 text-xs">Remove logo</button>}
        </div>
        <p className="text-xs text-gray-400">PNG, JPG or GIF, under 500 KB. Shown about 160 pixels wide.</p>
      </div>
      <div className="flex space-x-2">
        <button onClick={save} disabled={saving || uploading} className="bg-red-900 text-white px-4 py-2 rounded-lg hover:bg-red-800 disabled:bg-gray-300 text-sm">
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">Cancel</button>
      </div>
    </div>
  );
}
