import { supabase } from '../supabaseClient';

// Each rep's email signature, saved by the admin-only api/send-email.js
// (actions 'signature-get' and 'signature-save'; see
// api/_lib/emailSignatures.js). Returns the parsed JSON, or { ok: false, error }.
export async function callSignatureApi(action, payload = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return { ok: false, error: 'Please log in again.' };
  try {
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...payload })
    });
    const result = await res.json().catch(() => ({}));
    return res.ok ? result : { ok: false, error: result.error || 'Something went wrong.' };
  } catch {
    return { ok: false, error: 'Could not reach the server.' };
  }
}
