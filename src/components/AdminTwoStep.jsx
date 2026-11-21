import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { loadTwoStepState, startEnrollment, verifyCode, cleanCode } from '../utils/adminTwoStep';

// 2-step sign-in screen for admins and sales managers, shown after the
// password (and on page load when a saved session hasn't passed 2-step).
// First time: shows a QR code to scan with an authenticator app. After
// that: asks for the 6-digit code. Calls onDone() once the session is
// upgraded; onCancel() signs out.
export default function AdminTwoStep({ onDone, onCancel }) {
  const [phase, setPhase] = useState('loading'); // loading | enroll | verify | error
  const [factorId, setFactorId] = useState(null);
  const [qrSrc, setQrSrc] = useState('');
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const state = await loadTwoStepState(supabase);
        if (cancelled) return;
        if (state.step === 'done') {
          onDone();
          return;
        }
        if (state.step === 'verify') {
          setFactorId(state.factorId);
          setPhase('verify');
          return;
        }
        const enrollment = await startEnrollment(supabase);
        if (cancelled) return;
        setFactorId(enrollment.factorId);
        setQrSrc(enrollment.qrSrc);
        setSecret(enrollment.secret);
        setPhase('enroll');
      } catch (err) {
        if (!cancelled) {
          setError('Could not start 2-step sign-in. Check your connection and try again.');
          setPhase('error');
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (cleanCode(code).length !== 6) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await verifyCode(supabase, factorId, code);
      onDone();
    } catch (err) {
      setError('That code didn\'t work. Codes change every 30 seconds, so try the current one.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-900 via-black to-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">🎰 GigStaffPro</h1>
          <p className="text-red-200">Admin Dashboard</p>
        </div>

        <div className="bg-white rounded-lg shadow-xl p-8">
          <button onClick={onCancel} className="text-sm text-gray-600 hover:text-gray-900 mb-4">← Sign out</button>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">2-step sign-in</h2>

          {phase === 'loading' && <p className="text-gray-600">Loading…</p>}

          {phase === 'error' && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
          )}

          {phase === 'enroll' && (
            <div className="space-y-3 mb-4 text-sm text-gray-700">
              <p>
                Admin accounts can see client details, so they need a code from your phone as well as the password.
                This is a one-time setup.
              </p>
              <ol className="list-decimal ml-5 space-y-1">
                <li>Install an authenticator app (Google Authenticator, Microsoft Authenticator or 1Password).</li>
                <li>In the app, add an account and scan this QR code.</li>
                <li>Type the 6-digit code it shows.</li>
              </ol>
              {qrSrc && (
                <div className="flex justify-center">
                  <img src={qrSrc} alt="QR code for your authenticator app" className="w-48 h-48 border rounded" />
                </div>
              )}
              {secret && (
                <div className="text-center">
                  {showSecret ? (
                    <code className="text-xs break-all bg-gray-100 px-2 py-1 rounded">{secret}</code>
                  ) : (
                    <button type="button" onClick={() => setShowSecret(true)} className="text-xs text-gray-600 underline">
                      Can't scan? Show the setup key
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {phase === 'verify' && (
            <p className="text-sm text-gray-700 mb-4">Enter the 6-digit code from your authenticator app.</p>
          )}

          {(phase === 'enroll' || phase === 'verify') && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                value={code}
                onChange={(e) => setCode(cleanCode(e.target.value))}
                placeholder="123456"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center text-2xl tracking-widest focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />

              {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

              <button
                type="submit"
                disabled={busy}
                className="w-full bg-red-900 text-white px-6 py-3 rounded-lg hover:bg-red-800 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
              >
                {busy ? 'Checking…' : 'Continue'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
