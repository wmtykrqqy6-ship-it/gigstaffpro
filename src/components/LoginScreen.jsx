import React, { useState } from 'react';
import { User, Settings, UserPlus } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { hashPin } from '../utils/authHelpers';
import { UI } from '../constants';

export default function LoginScreen({ onLogin }) {
  const [mode, setMode] = useState('select'); // 'select', 'worker', 'admin', 'signup'
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pin, setPin] = useState('');
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

  const handleWorkerLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      
      let { data: workers, error: fetchError } = await supabase
        .from('workers')
        .select('*')
        .eq('phone', phoneNumber)
        .eq('is_active', true);

      if (!workers || workers.length === 0) {
        const result = await supabase
          .from('workers')
          .select('*')
          .eq('phone', cleanPhone)
          .eq('is_active', true);
        workers = result.data;
        fetchError = result.error;
      }

      if (fetchError) throw fetchError;

      if (!workers || workers.length === 0) {
        setError('Phone number not found. Contact your manager.');
        setLoading(false);
        return;
      }

      const worker = workers[0];

      if (!worker.pin_hash) {
        setError('No PIN set for this account. Contact your manager to set up your PIN.');
        setLoading(false);
        return;
      }

      const hashedPin = await hashPin(pin);
      
      if (hashedPin !== worker.pin_hash) {
        setError('Incorrect PIN. Please try again.');
        setLoading(false);
        return;
      }

      onLogin('worker', worker);
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
      const { data: admins, error: fetchError } = await supabase
        .from('admin_users')
        .select('*')
        .eq('username', username);

      if (fetchError) throw fetchError;

      if (!admins || admins.length === 0) {
        setError('Invalid username or password.');
        setLoading(false);
        return;
      }

      const admin = admins[0];
      const hashedPassword = await hashPin(password);
      
      if (hashedPassword !== admin.password_hash) {
        setError('Invalid username or password.');
        setLoading(false);
        return;
      }

      onLogin('admin', admin);
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
            
            <button
              onClick={() => { setMode('worker'); setError(''); }}
              className="w-full bg-blue-600 text-white px-6 py-4 rounded-lg hover:bg-blue-700 font-semibold text-lg flex items-center justify-center space-x-2"
            >
              <User size={24} />
              <span>Worker Login</span>
            </button>

            <button
              onClick={() => { setMode('admin'); setError(''); }}
              className="w-full bg-red-900 text-white px-6 py-4 rounded-lg hover:bg-red-800 font-semibold text-lg flex items-center justify-center space-x-2"
            >
              <Settings size={24} />
              <span>Admin Login</span>
            </button>

            <div className="pt-2 border-t border-gray-100 text-center">
              <button
                onClick={() => { setMode('signup'); setError(''); }}
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
            <button onClick={() => setMode('select')} className="text-sm text-gray-600 hover:text-gray-900 mb-4">← Back</button>

            <h2 className="text-2xl font-bold text-gray-900 mb-6">Worker Login</h2>

            <form onSubmit={handleWorkerLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))}
                  placeholder="(555) 123-4567"
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  maxLength={UI.PHONE_MAX_LENGTH}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">PIN (4 digits)</label>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, UI.PIN_LENGTH))}
                  placeholder="••••"
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-2xl tracking-widest"
                  maxLength={UI.PIN_LENGTH}
                />
              </div>

              {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

              <button
                type="submit"
                disabled={loading || pin.length !== UI.PIN_LENGTH}
                className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
              >
                {loading ? 'Logging in...' : 'Login'}
              </button>
            </form>

            <div className="mt-4 text-center space-y-2">
              <p className="text-xs text-gray-500">Forgot your PIN? Contact your manager.</p>
              <button onClick={() => { setMode('signup'); setError(''); }} className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center justify-center space-x-1 mx-auto">
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
            <button onClick={() => { setMode('select'); setError(''); }} className="text-sm text-gray-600 hover:text-gray-900 mb-4">← Back</button>

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

            <p className="text-xs text-gray-400 mt-4 text-center">Already have an account? <button onClick={() => { setMode('worker'); setError(''); }} className="text-blue-600 hover:underline">Log in here</button></p>
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
            <button onClick={() => setMode('select')} className="text-sm text-gray-600 hover:text-gray-900 mb-4">← Back</button>

            <h2 className="text-2xl font-bold text-gray-900 mb-6">Admin Login</h2>

            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
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
import { supabase } from '../supabaseClient';
import { hashPin } from '../utils/authHelpers';
import { UI } from '../constants';

export default function LoginScreen({ onLogin }) {
  const [mode, setMode] = useState('select'); // 'select', 'worker', 'admin'
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pin, setPin] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleWorkerLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Strip all non-numeric characters from phone for comparison
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      
      // Search for worker by phone - try formatted version first
      let { data: workers, error: fetchError } = await supabase
        .from('workers')
        .select('*')
        .eq('phone', phoneNumber)
        .eq('is_active', true);

      // If not found, try unformatted
      if (!workers || workers.length === 0) {
        const result = await supabase
          .from('workers')
          .select('*')
          .eq('phone', cleanPhone)
          .eq('is_active', true);
        
        workers = result.data;
        fetchError = result.error;
      }

      if (fetchError) {
        throw fetchError;
      }

      if (!workers || workers.length === 0) {
        setError('Phone number not found. Contact your manager.');
        setLoading(false);
        return;
      }

      const worker = workers[0];

      // Check if PIN is set
      if (!worker.pin_hash) {
        setError('No PIN set for this account. Contact your manager to set up your PIN.');
        setLoading(false);
        return;
      }

      // Hash entered PIN and compare
      const hashedPin = await hashPin(pin);
      
      if (hashedPin !== worker.pin_hash) {
        setError('Incorrect PIN. Please try again.');
        setLoading(false);
        return;
      }

      // Success!
      onLogin('worker', worker);
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
      // Check admin credentials
      const { data: admins, error: fetchError } = await supabase
        .from('admin_users')
        .select('*')
        .eq('username', username);

      if (fetchError) {
        throw fetchError;
      }

      if (!admins || admins.length === 0) {
        setError('Invalid username or password.');
        setLoading(false);
        return;
      }

      const admin = admins[0];

      // Hash entered password
      const hashedPassword = await hashPin(password);
      
      if (hashedPassword !== admin.password_hash) {
        setError('Invalid username or password.');
        setLoading(false);
        return;
      }

      // Success!
      onLogin('admin', admin);
    } catch (error) {
      setError('Login failed. Please try again.');
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
            
            <button
              onClick={() => setMode('worker')}
              className="w-full bg-blue-600 text-white px-6 py-4 rounded-lg hover:bg-blue-700 font-semibold text-lg flex items-center justify-center space-x-2"
            >
              <User size={24} />
              <span>Worker Login</span>
            </button>

            <button
              onClick={() => setMode('admin')}
              className="w-full bg-red-900 text-white px-6 py-4 rounded-lg hover:bg-red-800 font-semibold text-lg flex items-center justify-center space-x-2"
            >
              <Settings size={24} />
              <span>Admin Login</span>
            </button>
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
            <button
              onClick={() => setMode('select')}
              className="text-sm text-gray-600 hover:text-gray-900 mb-4"
            >
              ← Back
            </button>

            <h2 className="text-2xl font-bold text-gray-900 mb-6">Worker Login</h2>

            <form onSubmit={handleWorkerLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))}
                  placeholder="(555) 123-4567"
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  maxLength={UI.PHONE_MAX_LENGTH}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  PIN (4 digits)
                </label>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, UI.PIN_LENGTH))}
                  placeholder="••••"
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-2xl tracking-widest"
                  maxLength={UI.PIN_LENGTH}
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || pin.length !== UI.PIN_LENGTH}
                className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
              >
                {loading ? 'Logging in...' : 'Login'}
              </button>
            </form>

            <p className="text-xs text-gray-500 mt-4 text-center">
              Forgot your PIN? Contact your manager.
            </p>
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
            <button
              onClick={() => setMode('select')}
              className="text-sm text-gray-600 hover:text-gray-900 mb-4"
            >
              ← Back
            </button>

            <h2 className="text-2xl font-bold text-gray-900 mb-6">Admin Login</h2>

            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

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
