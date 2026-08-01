import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { hashPin } from '../../utils/authHelpers';
import { normalizeUsPhoneToE164 } from '../../utils/workerAuth';
import { UI, SUCCESS_MESSAGES } from '../../constants';

export default function SetPinModal({
  open,
  worker,
  onClose,
  onSuccess
}) {
  const [newPin, setNewPin] = useState('');
  const [settingPin, setSettingPin] = useState(false);
  // 'loading' | 'migrated' | 'legacy' | 'error'
  const [migrationStatus, setMigrationStatus] = useState('loading');

  // Determine migration status whenever the modal opens (or the selected
  // worker changes). Resets to 'loading' first so a previous worker's
  // status can never be reused for a new one, and guards against a stale
  // response landing after the modal has moved on to a different worker.
  useEffect(() => {
    if (!open || !worker) return;

    let cancelled = false;
    setMigrationStatus('loading');
    setNewPin('');

    const checkStatus = async () => {
      const normalizedPhone = normalizeUsPhoneToE164(worker.phone);

      if (!normalizedPhone) {
        if (!cancelled) setMigrationStatus('error');
        return;
      }

      try {
        const res = await fetch('/api/worker-auth-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: worker.phone }),
        });

        if (!res.ok) {
          if (!cancelled) setMigrationStatus('error');
          return;
        }

        const result = await res.json();

        if (typeof result?.migrated !== 'boolean') {
          if (!cancelled) setMigrationStatus('error');
          return;
        }

        if (!cancelled) setMigrationStatus(result.migrated ? 'migrated' : 'legacy');
      } catch (statusError) {
        if (!cancelled) setMigrationStatus('error');
      }
    };

    checkStatus();

    return () => { cancelled = true; };
  }, [open, worker?.id, worker?.phone]);

  if (!open || !worker) return null;

  // Migrated workers use a permanent 6-digit PIN; legacy workers keep the
  // existing UI.PIN_LENGTH. While status is unknown, no length is assumed.
  const pinLength = migrationStatus === 'migrated' ? 6 : UI.PIN_LENGTH;
  const statusKnown = migrationStatus === 'migrated' || migrationStatus === 'legacy';
  const canSubmit = !settingPin && statusKnown && newPin.length === pinLength;

  const handleSetPin = async (e) => {
    e.preventDefault();

    // Fail closed — never proceed on an unresolved or errored status, even
    // if this somehow fires despite the disabled submit button (e.g. Enter
    // key). Never falls back to a legacy write in this case.
    if (!statusKnown) {
      alert('Unable to confirm this worker\'s login status. Please close and try again.');
      return;
    }

    if (newPin.length !== pinLength) {
      alert('Please enter a valid PIN.');
      return;
    }

    setSettingPin(true);
    try {
      if (migrationStatus === 'migrated') {
        // Migrated worker — reset the secure-login PIN via the admin
        // endpoint only. workers.pin_hash is never written for this path,
        // and no new worker is migrated by this step.
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;

        if (sessionError || !token) {
          throw new Error('Your admin session has expired. Please log in again.');
        }

        const res = await fetch('/api/admin-set-worker-pin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ workerId: worker.id, pin: newPin }),
        });

        const result = await res.json().catch(() => null);

        if (!res.ok || !result?.success) {
          // Never surface endpoint-provided text — status codes, phone-
          // mismatch details, or internal outcomes must not reach the UI.
          throw new Error('Unable to update this PIN right now. Please try again.');
        }
      } else {
        // Legacy worker — existing direct workers.pin_hash write, unchanged.
        const hashedPin = await hashPin(newPin);

        const { error } = await supabase
          .from('workers')
          .update({
            pin_hash: hashedPin,
            is_active: true
          })
          .eq('id', worker.id);

        if (error) throw error;
      }

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

        {migrationStatus === 'loading' && (
          <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
            Checking login status…
          </div>
        )}

        {migrationStatus === 'error' && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            Could not determine this worker's login status. PIN changes are unavailable until this can be confirmed — close and try again.
          </div>
        )}

        <form onSubmit={handleSetPin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              New PIN
            </label>
            <input
              type="text"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, pinLength))}
              placeholder="••••"
              required
              maxLength={pinLength}
              disabled={!statusKnown}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-center text-2xl tracking-widest disabled:bg-gray-100 disabled:cursor-not-allowed"
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
              disabled={!canSubmit}
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
