import { supabase } from '../supabaseClient';

// Calls api/worker-actions.js. When the worker is logged in with the newer
// 6-digit-PIN login (Supabase Auth), their session token goes along so the
// server can confirm who is acting (docs/WORKER_AUTH.md). Legacy 4-digit-PIN
// workers have no session, so the request goes out exactly as before.
export async function workerFetch(init = {}) {
  const headers = { ...(init.headers || {}) };
  try {
    const { data } = await supabase.auth.getSession(); // refreshes an expiring token
    const token = data?.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // No session available: send without a token (legacy behavior).
  }
  return fetch('/api/worker-actions', { ...init, headers });
}
