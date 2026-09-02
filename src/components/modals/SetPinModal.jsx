import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { hashPin } from '../../utils/authHelpers';
import { normalizeUsPhoneToE164 } from '../../utils/workerAuth';
import { UI } from '../../constants';
import { useConfirm } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';

// Masks a normalized E.164 phone down to its last 4 digits for display in
// the migration confirmation dialog — the full number is never placed in
// that message.
function maskPhoneForDisplay(normalizedPhone) {
  if (!normalizedPhone) return '';
  const digits = normalizedPhone.replace(/\D/g, '');
  const lastFour = digits.slice(-4);
  return `(***) ***-${lastFour}`;
}

// Looks up migration status for a given (unnormalized) phone value. Module
// scope, not a hook — defined once, not recreated per render, and never
// runs on its own. Pure: never touches component state directly, so every
// caller applies its own stale-response guard before acting on the result,
// exactly as the two call sites below do. Never assumes legacy — any
// failure to normalize, fetch, parse, or validate returns { ok: false },
// which callers must treat as unresolved, not as "not migrated."
async function fetchWorkerMigrationStatus(phone) {
  const normalizedPhone = normalizeUsPhoneToE164(phone);

  if (!normalizedPhone) {
    return { ok: false };
  }

  try {
    const res = await fetch('/api/worker-auth-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });

    if (!res.ok) {
      return { ok: false };
    }

    const result = await res.json();

    if (typeof result?.migrated !== 'boolean') {
      return { ok: false };
    }

    return { ok: true, migrated: result.migrated };
  } catch (fetchError) {
    return { ok: false };
  }
}

export default function SetPinModal({
  open,
  worker,
  onClose,
  onSuccess,
  onSessionExpired
}) {
  const confirm = useConfirm();
  const notify = useToast();
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [settingPin, setSettingPin] = useState(false);
  // 'loading' | 'migrated' | 'legacy' | 'error'
  const [migrationStatus, setMigrationStatus] = useState('loading');
  // Admin-opted-in migrate action — only meaningful when migrationStatus is
  // 'legacy'. Never defaults on; always resets to false on open/worker
  // change so a prior worker's choice can never carry over.
  const [migrateToggle, setMigrateToggle] = useState(false);

  // Shared request-generation counter. Bumped whenever the modal opens for
  // a (possibly new) worker, and again on cleanup (worker/open change or
  // unmount). Any in-flight async work — the initial status lookup or a
  // handleSetPin submission — captures the value current at its start and
  // compares against this ref before touching state, showing an alert, or
  // calling onSuccess/onClose, so it can detect being superseded and bail
  // out instead of acting on a modal/worker that's no longer current.
  const requestIdRef = useRef(0);

  // Determine migration status whenever the modal opens (or the selected
  // worker changes). Resets to 'loading' first so a previous worker's
  // status can never be reused for a new one, and guards against a stale
  // response landing after the modal has moved on to a different worker.
  useEffect(() => {
    if (!open || !worker) return;

    const requestId = ++requestIdRef.current;
    setMigrationStatus('loading');
    setSettingPin(false);
    setNewPin('');
    setConfirmPin('');
    setMigrateToggle(false);

    const checkStatus = async () => {
      const status = await fetchWorkerMigrationStatus(worker.phone);
      if (requestIdRef.current !== requestId) return;
      setMigrationStatus(status.ok ? (status.migrated ? 'migrated' : 'legacy') : 'error');
    };

    checkStatus();

    return () => { requestIdRef.current += 1; };
  }, [open, worker?.id, worker?.phone]);

  if (!open || !worker) return null;

  // A legacy worker the admin has opted to migrate is treated like a
  // migrated worker for PIN-length purposes — the endpoint requires the
  // same permanent 6-digit PIN whether it's creating or resetting.
  const isMigrateAction = migrationStatus === 'legacy' && migrateToggle;

  // Migrated workers (and legacy workers being migrated now) use a
  // permanent 6-digit PIN; plain legacy workers keep the existing
  // UI.PIN_LENGTH. While status is unknown, no length is assumed.
  const pinLength = (migrationStatus === 'migrated' || isMigrateAction) ? 6 : UI.PIN_LENGTH;
  const statusKnown = migrationStatus === 'migrated' || migrationStatus === 'legacy';
  const canSubmit = !settingPin && statusKnown && (
    isMigrateAction
      ? newPin.length === 6 && confirmPin.length === 6 && newPin === confirmPin
      : newPin.length === pinLength
  );

  const handleSetPin = async (e) => {
    e.preventDefault();

    // Captured now so every async step below can detect whether the modal
    // has since closed, moved on to a different worker, or unmounted — see
    // requestIdRef above.
    const requestId = requestIdRef.current;

    // Fail closed — never proceed on an unresolved or errored status, even
    // if this somehow fires despite the disabled submit button (e.g. Enter
    // key). Never falls back to a legacy write in this case.
    if (!statusKnown) {
      notify('Unable to confirm this worker\'s login status. Please close and try again.');
      return;
    }

    // Validation differs for the migrate path (two PINs, must match) versus
    // the single-PIN reset paths. None of these checks enter the loading
    // state, retrieve a token, call the endpoint, or write to the database
    // on failure — the modal simply stays open with a generic message.
    if (isMigrateAction) {
      if (newPin.length !== 6 || confirmPin.length !== 6) {
        notify('Please enter a valid PIN.');
        return;
      }
      if (newPin !== confirmPin) {
        notify('PINs do not match.');
        return;
      }
    } else if (newPin.length !== pinLength) {
      notify('Please enter a valid PIN.');
      return;
    }

    // Migrating is a one-way action for this worker — require an explicit,
    // separate confirmation before ever contacting the endpoint, and before
    // entering the submitting state at all (so a cancel is a true no-op: no
    // network request, no database write, modal stays open). Shown only for
    // the initial migration path, never for an already-migrated reset.
    if (isMigrateAction) {
      const normalizedPhone = normalizeUsPhoneToE164(worker.phone);
      const maskedPhone = maskPhoneForDisplay(normalizedPhone);

      const confirmed = await confirm(
        `Migrate ${worker.name} to the new login?\n\n` +
        `Phone: ${maskedPhone}\n\n` +
        `After migration:\n` +
        `• They will sign in with their phone number and new 6-digit PIN.\n` +
        `• Their previous PIN will no longer be used for login.\n` +
        `• Phone-number changes must be handled by an administrator during the pilot.\n\n` +
        `Continue?`
      );
      if (!confirmed) return;
    }

    setSettingPin(true);
    try {
      if (migrationStatus === 'migrated') {
        // Path 1: already-migrated worker — reset the secure-login PIN via
        // the admin endpoint. workers.pin_hash is never written here. Fully
        // self-contained: handles its own completion and returns, never
        // falling through to another path's behavior.
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;

        if (sessionError || !token) {
          await onSessionExpired();
          return;
        }

        const res = await fetch('/api/admin-set-worker-pin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ workerId: worker.id, pin: newPin }),
        });

        if (res.status === 401) {
          await onSessionExpired();
          return;
        }

        const result = await res.json().catch(() => null);

        if (!res.ok || !result?.success) {
          // Never surface endpoint-provided text — status codes, phone-
          // mismatch details, or internal outcomes must not reach the UI.
          throw new Error('Unable to update this PIN right now. Please try again.');
        }

        if (requestIdRef.current !== requestId) return;

        // Do not echo the entered PIN back in this confirmation — unlike
        // the legacy path, this is a live secure-login credential.
        setNewPin('');
        setConfirmPin('');

        notify('Worker PIN updated successfully.');

        if (onSuccess) {
          await onSuccess();
        }

        if (requestIdRef.current !== requestId) return;

        onClose();
        return;
      }

      if (isMigrateAction) {
        // Path 2: legacy worker the admin just confirmed migrating now —
        // same admin endpoint, which creates the secure-login identity
        // since no worker_auth_links row exists yet. workers.pin_hash is
        // never written here either. Fully self-contained, including its
        // own post-migration status refresh, and returns on every exit —
        // it never falls through to Path 1 or Path 3's behavior.
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;

        if (sessionError || !token) {
          await onSessionExpired();
          return;
        }

        const res = await fetch('/api/admin-set-worker-pin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ workerId: worker.id, pin: newPin }),
        });

        if (res.status === 401) {
          await onSessionExpired();
          return;
        }

        const result = await res.json().catch(() => null);

        if (!res.ok || !result?.success) {
          throw new Error('Unable to update this PIN right now. Please try again.');
        }

        // The endpoint call has already succeeded at this point — clear the
        // sensitive PIN fields and the toggle immediately, before doing any
        // further (re-verification) work, rather than holding them in state
        // any longer than necessary.
        if (requestIdRef.current !== requestId) return;
        setNewPin('');
        setConfirmPin('');
        setMigrateToggle(false);
        setMigrationStatus('loading');

        // Re-confirm the migration actually took effect before declaring
        // success — reuses the same status-check logic as the initial
        // lookup.
        const confirmStatus = await fetchWorkerMigrationStatus(worker.phone);

        if (requestIdRef.current !== requestId) return;

        if (!confirmStatus.ok || !confirmStatus.migrated) {
          // The write already succeeded — this is a refresh failure, not a
          // PIN-set failure, so it gets its own status and message rather
          // than the generic endpoint-failure text. Submission is disabled
          // by the resulting 'error' status until the modal is reopened.
          setMigrationStatus('error');
          notify('The login was updated, but the status could not be refreshed. Close this window and check again.');
          return;
        }

        setMigrationStatus('migrated');
        notify('Worker login updated successfully.');

        if (onSuccess) {
          await onSuccess();
        }

        if (requestIdRef.current !== requestId) return;

        onClose();
        return;
      }

      // Path 3: legacy worker, no migration — existing direct
      // workers.pin_hash write, unchanged. Fully self-contained like the
      // other two paths.
      const hashedPin = await hashPin(newPin);

      const { error } = await supabase
        .from('workers')
        .update({
          pin_hash: hashedPin,
          is_active: true
        })
        .eq('id', worker.id);

      if (error) throw error;

      if (requestIdRef.current !== requestId) return;

      notify(
        `✅ PIN set successfully for ${worker.name}!\n\n` +
        `Their login info:\n` +
        `Phone: ${worker.phone}\n` +
        `PIN: ${newPin}\n\n` +
        `They can now log in at gigstaffpro.vercel.app`
      );

      setNewPin('');
      setConfirmPin('');

      if (onSuccess) {
        await onSuccess();
      }

      if (requestIdRef.current !== requestId) return;

      onClose();
      return;
    } catch (error) {
      // Blocker 8: never surface error.message (raw Supabase/database text,
      // hashing failures, or anything else) — every failure funneling
      // through this catch shows only the fixed generic message.
      if (requestIdRef.current === requestId) {
        notify('Unable to update this PIN right now. Please try again.');
      }
    } finally {
      // Guarded: a superseded request must not re-enable controls in a
      // newer modal session or interrupt a newer request that's still
      // genuinely in flight.
      if (requestIdRef.current === requestId) {
        setSettingPin(false);
      }
    }
  };

  const handleClose = () => {
    // Invalidate any pending async work (endpoint call, status refresh)
    // directly, rather than relying only on the parent eventually changing
    // `open` and triggering the effect's own cleanup — that still happens
    // too (see the effect above), but this makes invalidation immediate.
    requestIdRef.current += 1;
    setNewPin('');
    setConfirmPin('');
    setMigrateToggle(false);
    setSettingPin(false);
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

        {migrationStatus === 'legacy' && (
          <label className="mb-4 flex items-start space-x-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={migrateToggle}
              onChange={(e) => {
                setMigrateToggle(e.target.checked);
                setNewPin('');
                setConfirmPin('');
              }}
              disabled={settingPin}
              className="mt-0.5"
            />
            <span>Migrate this worker to secure login instead</span>
          </label>
        )}

        {isMigrateAction && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
            <p className="font-medium">This changes how the worker signs in.</p>
            <p className="mt-1 text-amber-800">
              They will use their phone number and new 6-digit PIN. Their previous PIN will no longer be used for login. Phone-number changes must be handled by an administrator during the pilot.
            </p>
            <button
              type="button"
              onClick={() => {
                setMigrateToggle(false);
                setNewPin('');
                setConfirmPin('');
              }}
              disabled={settingPin}
              className="mt-2 text-sm text-amber-900 underline hover:text-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel Migration
            </button>
          </div>
        )}

        <form onSubmit={handleSetPin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              New PIN
            </label>
            <input
              type={migrationStatus === 'migrated' || isMigrateAction ? 'password' : 'text'}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, pinLength))}
              placeholder={'•'.repeat(pinLength)}
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

          {isMigrateAction && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirm New PIN
              </label>
              <input
                type="password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••"
                required
                maxLength={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-center text-2xl tracking-widest"
              />
            </div>
          )}

          {migrationStatus === 'legacy' && !migrateToggle && (
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
          )}

          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
            >
              {isMigrateAction
                ? (settingPin ? 'Migrating...' : 'Confirm Migration')
                : (settingPin ? 'Setting PIN...' : 'Set PIN & Activate')}
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
