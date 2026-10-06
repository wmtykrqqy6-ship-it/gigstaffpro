import { supabase } from '../supabaseClient';

// Admin-triggered push notifications (invites, the Staff test button), sent
// through the admin-only api/send-email.js. Best-effort: never throws, so a
// push problem can't interrupt sending invites or emails.
export async function sendAdminPush(body, accessToken = null) {
  try {
    let token = accessToken;
    if (!token) {
      const { data } = await supabase.auth.getSession();
      token = data?.session?.access_token;
    }
    if (!token) return { ok: false, error: 'Please log in again.' };
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'push', ...body })
    });
    const result = await res.json().catch(() => ({}));
    return res.ok ? result : { ok: false, error: result.error || 'Could not send the notification.' };
  } catch {
    return { ok: false, error: 'Could not send the notification.' };
  }
}
