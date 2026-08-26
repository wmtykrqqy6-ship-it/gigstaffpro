import React, { useState, useRef } from 'react';
import { User, Settings, UserPlus } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { hashPin } from '../utils/authHelpers';
import { normalizeUsPhoneToE164, deriveSyntheticWorkerEmail } from '../utils/workerAuth';
import { UI } from '../constants';

export default function LoginScreen({ onLogin, authMessage }) {
  const [mode, setMode] = useState('select'); // 'select', 'worker', 'admin', 'signup'
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pin, setPin] = useState('');
  // Migration-status lookup for the phone currently entered above.
  // phase: 'unknown' | 'checking' | 'resolved' | 'error'
  const [workerLoginStatus, setWorkerLoginStatus] = useState({
    phase: 'unknown',
    normalizedPhone: null,
    migrated: null,
  });
  const workerLoginStatusRequestRef = useRef(0);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Signup form state
  const [signupName, setSignupName] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPin, setSignupPin] = useState('');
  const [signupPinConfirm, setSignupPinConfirm] = useState('');

  // Fully resets worker-login-specific state: phone, PIN, migration-status
  // cache, and any in-flight status check. Used on every login-mode switch
  // so a migration result (or PIN) from one visit to the worker form can
  // never leak into or affect a later one.
  const resetWorkerLoginState = () => {
    workerLoginStatusRequestRef.current += 1; // invalidate any in-flight status check
    setWorkerLoginStatus({ phase: 'unknown', normalizedPhone: null, migrated: null });
    setPhoneNumber('');
    setPin('');
  };

  const switchMode = (newMode) => {
    resetWorkerLoginState();
    setError('');
    setMode(newMode);
  };

  // Checks migration status for the phone currently entered, caching the
  // result against its normalized form. Triggered on phone-field blur only
  // — never on every keystroke. Safe against duplicate in-flight requests
  // and against a stale response arriving after the phone has changed
  // again (guarded by workerLoginStatusRequestRef).
  const checkWorkerMigrationStatus = async () => {
    const normalizedPhone = normalizeUsPhoneToE164(phoneNumber);

    if (!normalizedPhone) {
      setWorkerLoginStatus({ phase: 'unknown', normalizedPhone: null, migrated: null });
      return;
    }

    // Already resolved or already in flight for this exact phone — do not
    // issue a duplicate request.
    if (
      (workerLoginStatus.phase === 'resolved' || workerLoginStatus.phase === 'checking') &&
      workerLoginStatus.normalizedPhone === normalizedPhone
    ) {
      return;
    }

    const requestId = ++workerLoginStatusRequestRef.current;
    setError('');
    setWorkerLoginStatus({ phase: 'checking', normalizedPhone, migrated: null });

    try {
      const statusRes = await fetch('/api/worker-auth-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneNumber }),
      });

      // A newer check superseded this one (phone changed again) — discard.
      if (workerLoginStatusRequestRef.current !== requestId) return;

      if (!statusRes.ok) {
        setWorkerLoginStatus({ phase: 'error', normalizedPhone, migrated: null });
        setError('Login temporarily unavailable. Please try again.');
        return;
      }

      const statusResult = await statusRes.json();

      if (workerLoginStatusRequestRef.current !== requestId) return;

      if (typeof statusResult?.migrated !== 'boolean') {
        setWorkerLoginStatus({ phase: 'error', normalizedPhone, migrated: null });
        setError('Login temporarily unavailable. Please try again.');
        return;
      }

      setWorkerLoginStatus({ phase: 'resolved', normalizedPhone, migrated: statusResult.migrated });

      // Legacy resolves to a shorter maximum than the permissive default
      // used while status was unknown/checking (6). Trim any already-typed
      // overlength PIN so it isn't left invisibly too long to ever submit.
      // Migrated resolves to the same 6-digit cap already in effect, so no
      // equivalent trim is needed in that branch.
      if (statusResult.migrated === false) {
        setPin(prevPin => (prevPin.length > UI.PIN_LENGTH ? prevPin.slice(0, UI.PIN_LENGTH) : prevPin));
      }
    } catch (statusFetchError) {
      if (workerLoginStatusRequestRef.current !== requestId) return;
      setWorkerLoginStatus({ phase: 'error', normalizedPhone, migrated: null });
      setError('Login temporarily unavailable. Please try again.');
    }
  };

  // Phone field onChange — resets any resolved/in-flight migration status
  // the moment the phone no longer matches what that status was checked
  // against, so a stale result (or a stale PIN length) can never be reused
  // under a different phone number.
  const handlePhoneChange = (e) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhoneNumber(formatted);

    const newNormalized = normalizeUsPhoneToE164(formatted);
    if (workerLoginStatus.phase !== 'unknown' && newNormalized !== workerLoginStatus.normalizedPhone) {
      workerLoginStatusRequestRef.current += 1; // invalidate any in-flight/stale check
      setWorkerLoginStatus({ phase: 'unknown', normalizedPhone: null, migrated: null });
      setPin('');
      setError('');
    }
  };

  const handleWorkerLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Step 1: normalize the current phone.
      const normalizedPhone = normalizeUsPhoneToE164(phoneNumber);

      if (!normalizedPhone) {
        setError('Please enter a valid phone number.');
        setLoading(false);
        return;
      }

      // Step 2: require an already-resolved status for this exact phone.
      // The status endpoint is never called from here — only from the
      // phone-blur handler. A missing, stale, checking, or errored status
      // stops submission before any Supabase Auth or workers-table access.
      if (
        workerLoginStatus.phase !== 'resolved' ||
        workerLoginStatus.normalizedPhone !== normalizedPhone ||
        typeof workerLoginStatus.migrated !== 'boolean'
      ) {
        setError('Login temporarily unavailable. Please try again.');
        setLoading(false);
        return;
      }

      if (workerLoginStatus.migrated === true) {
        // Step 4: migrated-worker branch. Every failure path below
        // terminates here — never falls through to the legacy query.
        if (!/^\d{6}$/.test(pin)) {
          setError('Incorrect PIN. Please try again.');
          setLoading(false);
          return;
        }

        const syntheticEmail = deriveSyntheticWorkerEmail(normalizedPhone);

        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: syntheticEmail,
          password: pin,
        });

        if (authError || !authData?.user) {
          setError('Incorrect phone number or PIN. Please try again.');
          setLoading(false);
          return;
        }

        try {
          const { data: workerProfile, error: profileError } = await supabase
            .rpc('get_authenticated_worker_profile')
            .maybeSingle();

          if (profileError || !workerProfile) {
            await supabase.auth.signOut();
            setError('Login failed. Please try again.');
            setLoading(false);
            return;
          }

          if (workerProfile.is_active === false) {
            await supabase.auth.signOut();
            setError('This account has been deactivated. Contact your manager.');
            setLoading(false);
            return;
          }

          onLogin('worker', workerProfile, 'migrated');
          setLoading(false);
          return;
        } catch (profileCatchError) {
          await supabase.auth.signOut();
          setError('Login failed. Please try again.');
          setLoading(false);
          return;
        }
      }

      // Step 5: migrated === false — legacy worker login. The PIN check
      // happens server-side (api/worker-pin-login.js) so workers.pin_hash
      // never has to be readable from the browser.
      const loginRes = await fetch('/api/worker-pin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneNumber, pin }),
      });
      const loginResult = await loginRes.json();

      if (!loginResult.ok) {
        setError(loginResult.error || 'Login failed. Please try again.');
        setLoading(false);
        return;
      }

      onLogin('worker', loginResult.worker);
    } catch (error) {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const email = username.trim();

      if (!email.includes('@')) {
        setError('Please enter your admin email address.');
        setLoading(false);
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError || !authData?.user) {
        setError('Invalid email or password.');
        setLoading(false);
        return;
      }

      try {
        const { data: adminProfile, error: profileError } = await supabase
          .rpc('get_authenticated_admin_profile')
          .single();

        if (profileError || !adminProfile) {
          await supabase.auth.signOut();
          setError('Invalid email or password.');
          setLoading(false);
          return;
        }

        onLogin('admin', adminProfile);
        setLoading(false);
        return;
      } catch (profileCatchError) {
        // Sign-in succeeded but profile resolution threw (e.g. network
        // failure) — never leave an unauthorized session active.
        await supabase.auth.signOut();
        setError('Invalid email or password.');
        setLoading(false);
        return;
      }
    } catch (error) {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');

    if (signupPin !== signupPinConfirm) {
      setError('PINs do not match.');
      return;
    }
    if (signupPin.length !== 4) {
      setError('PIN must be exactly 4 digits.');
      return;
    }

    setLoading(true);
    try {
      const cleanPhone = signupPhone.replace(/\D/g, '');

      // Check if phone already exists
      const { data: existing } = await supabase
        .from('workers')
        .select('id')
        .eq('phone', cleanPhone);

      if (existing && existing.length > 0) {
        setError('An account with this phone number already exists. Try logging in instead.');
        setLoading(false);
        return;
      }

      const pin_hash = await hashPin(signupPin);

      const { data: newWorker, error: insertError } = await supabase
        .from('workers')
        .insert([{
          name: signupName.trim(),
          phone: cleanPhone,
          email: signupEmail.trim() || null,
          pin_hash,
          is_active: true,
          rank: 5, // Default to lowest rank, admin can promote
        }])
        .select()
        .single();

      if (insertError) throw insertError;

      // Mark any matching invite as joined
      if (signupPhone || signupEmail) {
        await supabase
          .from('worker_invites')
          .update({ status: 'joined' })
          .or(`contact.eq.${cleanPhone},contact.eq.${signupEmail.trim()}`);
      }

      onLogin('worker', newWorker);
    } catch (err) {
      setError('Sign up failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatPhoneNumber = (value) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 6) return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
  };

  // Migrated workers use a permanent 6-digit PIN; legacy workers keep the
  // existing UI.PIN_LENGTH. Before a status is resolved, the input stays
  // permissive (6) so typing isn't cut short — the submit button, not the
  // maxLength, is what actually gates submission in that case.
  const workerPinMaxLength = (workerLoginStatus.phase === 'resolved' && workerLoginStatus.migrated === false)
    ? UI.PIN_LENGTH
    : 6;

  const workerPinLengthValid = workerLoginStatus.phase === 'resolved'
    ? (workerLoginStatus.migrated ? pin.length === 6 : pin.length === UI.PIN_LENGTH)
    : false;

  const canSubmitWorkerLogin = !loading && workerPinLengthValid;

  // ============================================
  // SELECT LOGIN TYPE SCREEN
  // ============================================
  if (mode === 'select') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-black to-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">🎰 GigStaffPro</h1>
            <p className="text-red-200">Casino Staffing Management</p>
          </div>

          <div className="bg-white rounded-lg shadow-xl p-8 space-y-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Select Login Type</h2>

            {authMessage && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {authMessage}
              </div>
            )}

            <button
              onClick={() => switchMode('worker')}
              className="w-full bg-blue-600 text-white px-6 py-4 rounded-lg hover:bg-blue-700 font-semibold text-lg flex items-center justify-center space-x-2"
            >
              <User size={24} />
              <span>Worker Login</span>
            </button>

            <button
              onClick={() => switchMode('admin')}
              className="w-full bg-red-900 text-white px-6 py-4 rounded-lg hover:bg-red-800 font-semibold text-lg flex items-center justify-center space-x-2"
            >
              <Settings size={24} />
              <span>Admin Login</span>
            </button>

            <div className="pt-2 border-t border-gray-100 text-center">
              <button
                onClick={() => switchMode('signup')}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center justify-center space-x-1 mx-auto"
              >
                <UserPlus size={15} />
                <span>New worker? Sign up here</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // WORKER LOGIN SCREEN
  // ============================================
  if (mode === 'worker') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-black to-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">🎰 GigStaffPro</h1>
            <p className="text-red-200">Worker Portal</p>
          </div>

          <div className="bg-white rounded-lg shadow-xl p-8">
            <button onClick={() => switchMode('select')} className="text-sm text-gray-600 hover:text-gray-900 mb-4">← Back</button>

            <h2 className="text-2xl font-bold text-gray-900 mb-6">Worker Login</h2>

            <form onSubmit={handleWorkerLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={handlePhoneChange}
                  onBlur={checkWorkerMigrationStatus}
                  placeholder="(555) 123-4567"
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  maxLength={UI.PHONE_MAX_LENGTH}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">PIN</label>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, workerPinMaxLength))}
                  placeholder={'•'.repeat(workerPinMaxLength)}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-2xl tracking-widest"
                  maxLength={workerPinMaxLength}
                />
                {workerLoginStatus.phase === 'checking' && (
                  <p className="mt-1 text-xs text-gray-500">Checking login information…</p>
                )}
              </div>

              {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

              <button
                type="submit"
                disabled={!canSubmitWorkerLogin}
                className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
              >
                {loading ? 'Logging in...' : 'Login'}
              </button>
            </form>

            <div className="mt-4 text-center space-y-2">
              <p className="text-xs text-gray-500">Forgot your PIN? Contact your manager.</p>
              <button onClick={() => switchMode('signup')} className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center justify-center space-x-1 mx-auto">
                <UserPlus size={14} />
                <span>New worker? Sign up here</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // WORKER SIGNUP SCREEN
  // ============================================
  if (mode === 'signup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-black to-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">🎰 GigStaffPro</h1>
            <p className="text-red-200">Create Your Account</p>
          </div>

          <div className="bg-white rounded-lg shadow-xl p-8">
            <button onClick={() => switchMode('select')} className="text-sm text-gray-600 hover:text-gray-900 mb-4">← Back</button>

            <h2 className="text-2xl font-bold text-gray-900 mb-2">Worker Sign Up</h2>
            <p className="text-sm text-gray-500 mb-6">Create your account to view events and manage your schedule.</p>

            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Full Name *</label>
                <input
                  type="text"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  placeholder="Jane Smith"
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number *</label>
                <input
                  type="tel"
                  value={signupPhone}
                  onChange={(e) => setSignupPhone(formatPhoneNumber(e.target.value))}
                  placeholder="(555) 123-4567"
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  maxLength={UI.PHONE_MAX_LENGTH}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="email"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  placeholder="jane@email.com"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Create a 4-digit PIN *</label>
                <input
                  type="password"
                  value={signupPin}
                  onChange={(e) => setSignupPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-2xl tracking-widest"
                  maxLength={4}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Confirm PIN *</label>
                <input
                  type="password"
                  value={signupPinConfirm}
                  onChange={(e) => setSignupPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-2xl tracking-widest"
                  maxLength={4}
                />
              </div>

              {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

              <button
                type="submit"
                disabled={loading || !signupName || !signupPhone || signupPin.length !== 4 || signupPinConfirm.length !== 4}
                className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </form>

            <p className="text-xs text-gray-400 mt-4 text-center">Already have an account? <button onClick={() => switchMode('worker')} className="text-blue-600 hover:underline">Log in here</button></p>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // ADMIN LOGIN SCREEN
  // ============================================
  if (mode === 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-black to-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">🎰 GigStaffPro</h1>
            <p className="text-red-200">Admin Dashboard</p>
          </div>

          <div className="bg-white rounded-lg shadow-xl p-8">
            <button onClick={() => switchMode('select')} className="text-sm text-gray-600 hover:text-gray-900 mb-4">← Back</button>

            <h2 className="text-2xl font-bold text-gray-900 mb-6">Admin Login</h2>

            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin@example.com"
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>

              {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-red-900 text-white px-6 py-3 rounded-lg hover:bg-red-800 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
              >
                {loading ? 'Logging in...' : 'Login'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }
}
