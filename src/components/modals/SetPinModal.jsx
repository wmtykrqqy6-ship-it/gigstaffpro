import React, { useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { hashPin } from '../../utils/authHelpers';
import { UI, SUCCESS_MESSAGES } from '../../constants';

export default function SetPinModal({
  open,
  worker,
  onClose,
  onSuccess
}) {
  const [newPin, setNewPin] = useState('');
  const [settingPin, setSettingPin] = useState(false);

  if (!open || !worker) return null;

  const handleSetPin = async (e) => {
    e.preventDefault();
    
    if (newPin.length !== UI.PIN_LENGTH) {
      alert(`PIN must be exactly ${UI.PIN_LENGTH} digits`);
      return;
    }

    setSettingPin(true);
    try {
      // Hash the PIN
      const hashedPin = await hashPin(newPin);
      
      // Update worker in database
      const { error } = await supabase
        .from('workers')
        .update({ 
          pin_hash: hashedPin,
          is_active: true 
        })
        .eq('id', worker.id);
      
      if (error) throw error;
      
      alert(
        `✅ PIN set successfully for ${worker.name}!\n\n` +
        `Their login info:\n` +
        `Phone: ${worker.phone}\n` +
        `PIN: ${newPin}\n\n` +
        `They can now log in at gigstaffpro.vercel.app`
      );
      
      // Reset form
      setNewPin('');
      
      // Call success callback (to refresh worker list)
      if (onSuccess) {
        await onSuccess();
      }
      
      // Close modal
      onClose();
    } catch (error) {
      alert('Error setting PIN: ' + error.message);
    } finally {
      setSettingPin(false);
    }
  };

  const handleClose = () => {
    setNewPin('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-gray-900">
            Set PIN for {worker.name}
          </h3>
          <button 
            onClick={handleClose} 
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={24} />
          </button>
        </div>

        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900">
            <strong>Phone:</strong> {worker.phone}<br/>
            <strong>Email:</strong> {worker.email}
          </p>
        </div>

        <form onSubmit={handleSetPin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Enter {UI.PIN_LENGTH}-Digit PIN
            </label>
            <input
              type="text"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, UI.PIN_LENGTH))}
              placeholder="••••"
              required
              maxLength={UI.PIN_LENGTH}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-center text-2xl tracking-widest"
              autoFocus
            />
            <p className="text-xs text-gray-500 mt-1">
              This PIN will be used by the worker to log in
            </p>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-sm text-yellow-900">
              ⚠️ <strong>Important:</strong> Make sure to give this worker their login info:
            </p>
            <ul className="text-xs text-yellow-800 mt-2 space-y-1">
              <li>• Phone: {worker.phone}</li>
              <li>• PIN: {newPin || '(enter above)'}</li>
              <li>• URL: gigstaffpro.vercel.app</li>
            </ul>
          </div>

          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={settingPin || newPin.length !== UI.PIN_LENGTH}
              className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
            >
              {settingPin ? 'Setting PIN...' : 'Set PIN & Activate'}
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={settingPin}
              className="flex-1 bg-gray-200 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-300 font-medium disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
