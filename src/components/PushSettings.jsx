import React, { useEffect, useState } from 'react';
import { Bell, BellOff, X, Share, PlusSquare } from 'lucide-react';
import { useToast } from './ui/Toast';
import { pushSupport, currentSubscription, enablePush, disablePush } from '../utils/push';

const DISMISS_KEY = 'gsp-push-banner-dismissed';
const readDismissed = () => { try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; } };
const writeDismissed = () => { try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode */ } };

// "Turn on notifications" for workers (docs/PUSH_NOTIFICATIONS.md).
//   variant="banner"  -- worker Dashboard; dismissible, hidden once on
//   variant="setting" -- Profile; always shows the current state + on/off
export default function PushSettings({ worker, variant = 'banner' }) {
  const notify = useToast();
  const [support, setSupport] = useState(() => pushSupport());
  const [isOn, setIsOn] = useState(null); // null = checking
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    let cancelled = false;
    currentSubscription().then(sub => { if (!cancelled) setIsOn(!!sub); });
    return () => { cancelled = true; };
  }, []);

  const turnOn = async () => {
    setBusy(true);
    try {
      await enablePush(worker.id);
      setIsOn(true);
      notify('Notifications are on — check for a test notification.');
    } catch (err) {
      setSupport(pushSupport());
      notify(err.message);
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      await disablePush(worker.id);
      setIsOn(false);
      notify('Notifications turned off on this device.');
    } finally {
      setBusy(false);
    }
  };

  if (!worker?.id) return null;

  if (variant === 'banner') {
    if (dismissed || isOn !== false || support === 'unsupported') return null;
    const dismiss = () => { writeDismissed(); setDismissed(true); };
    return (
      <div className="bg-white rounded-lg shadow border-l-4 border-red-900 p-4 flex items-start gap-3">
        <Bell size={22} className="text-red-900 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          {support === 'install-first' ? (
            <>
              <p className="font-semibold text-gray-900">Get notified about invites and shifts</p>
              <p className="text-sm text-gray-600 mt-0.5">
                Add GigStaffPro to your Home Screen first: tap <Share size={14} className="inline -mt-0.5" /> <strong>Share</strong>, then{' '}
                <PlusSquare size={14} className="inline -mt-0.5" /> <strong>Add to Home Screen</strong>. Open it from the new icon and turn notifications on.
              </p>
            </>
          ) : support === 'blocked' ? (
            <>
              <p className="font-semibold text-gray-900">Notifications are blocked</p>
              <p className="text-sm text-gray-600 mt-0.5">Turn them on for GigStaffPro in your phone’s Settings → Notifications.</p>
            </>
          ) : (
            <>
              <p className="font-semibold text-gray-900">Get notified about invites and shifts</p>
              <p className="text-sm text-gray-600 mt-0.5">New invites, shift reminders and route updates, right on your phone.</p>
              <button
                onClick={turnOn}
                disabled={busy}
                className="mt-2 bg-red-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-red-800 disabled:opacity-50"
              >
                {busy ? 'Turning on…' : 'Turn on notifications'}
              </button>
            </>
          )}
        </div>
        <button onClick={dismiss} className="text-gray-400 hover:text-gray-600 p-1 -m-1 flex-shrink-0" title="Not now">
          <X size={18} />
        </button>
      </div>
    );
  }

  // Profile setting
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-start gap-3">
        {isOn ? <Bell size={22} className="text-red-900 mt-0.5" /> : <BellOff size={22} className="text-gray-400 mt-0.5" />}
        <div className="flex-1">
          <h3 className="text-lg font-bold text-gray-900">Notifications</h3>
          <p className="text-sm text-gray-600 mt-0.5">
            {isOn === null ? 'Checking…'
              : isOn ? 'On for this device. You’ll get invites, shift reminders and route updates.'
              : support === 'install-first' ? 'On iPhone, add GigStaffPro to your Home Screen (Share → Add to Home Screen) and open it from there to turn notifications on.'
              : support === 'blocked' ? 'Blocked. Turn them on for GigStaffPro in your phone’s Settings → Notifications.'
              : support === 'unsupported' ? 'This browser doesn’t support notifications. Try the installed app on your phone.'
              : 'Off for this device.'}
          </p>
          {isOn !== null && (isOn ? (
            <button onClick={turnOff} disabled={busy} className="mt-3 text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              {busy ? 'Turning off…' : 'Turn off on this device'}
            </button>
          ) : support === 'ready' && (
            <button onClick={turnOn} disabled={busy} className="mt-3 bg-red-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-red-800 disabled:opacity-50">
              {busy ? 'Turning on…' : 'Turn on notifications'}
            </button>
          ))}
          <p className="text-xs text-gray-400 mt-2">Emails still arrive as usual.</p>
        </div>
      </div>
    </div>
  );
}
