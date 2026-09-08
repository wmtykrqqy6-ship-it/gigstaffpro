// hostLabelHelper.js
// Configurable label for the "Host / Team Leader" role.
// Default: "Host" — companies can set it to "Manager", "Team Lead", "Pit Boss", etc.
//
// Shared org-wide via the settings table (same setting_key/setting_value
// shape SettingsView.jsx already uses for rank_access_days; that table's
// RLS already allows public SELECT / admin-only write, so no migration is
// needed here). localStorage is kept as a synchronous read-through cache --
// getHostLabel() is called inline during render in several admin and
// worker views, so it can't become async without threading a prop through
// all of them. loadHostLabelFromServer() (call once at app startup, any
// role) populates that cache with the real org-wide value; until that
// resolves, or if it's never called, this falls back to whatever was last
// cached locally, then to the default -- previously the *only* source of
// truth was that local cache, so an admin's relabel only ever showed up on
// their own browser.

import { supabase } from '../supabaseClient';

const HOST_LABEL_KEY = 'gigstaffpro_host_label';
const SETTING_KEY = 'host_label';

export const getHostLabel = () => {
  try { return localStorage.getItem(HOST_LABEL_KEY) || 'Host'; }
  catch { return 'Host'; }
};

const cacheLocally = (label) => {
  try { localStorage.setItem(HOST_LABEL_KEY, (label || 'Host').trim()); }
  catch {}
};

export const loadHostLabelFromServer = async () => {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('setting_value')
      .eq('setting_key', SETTING_KEY)
      .maybeSingle();
    if (!error && data?.setting_value) {
      cacheLocally(data.setting_value);
    }
  } catch {}
};

// Admin-only (settings_admin_write RLS policy enforces this server-side
// regardless). Persists org-wide, then updates this session's local cache
// so the current render picks it up without a reload. The cache write
// happens only after the server write succeeds -- caching optimistically
// beforehand would show the admin their own browser as "saved" even when
// the server write actually failed, with nothing to correct it. Throws on
// failure so the caller can warn the admin the change didn't save.
export const setHostLabel = async (label) => {
  const clean = (label || 'Host').trim();

  const { data: existing } = await supabase
    .from('settings')
    .select('setting_key')
    .eq('setting_key', SETTING_KEY)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('settings')
      .update({ setting_value: clean, updated_at: new Date().toISOString() })
      .eq('setting_key', SETTING_KEY);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('settings')
      .insert([{ setting_key: SETTING_KEY, setting_value: clean }]);
    if (error) throw error;
  }

  cacheLocally(clean);
};

// Plural form: "Hosts", "Managers", "Team Leads", "Pit Bosses"
export const getHostLabelPlural = () => {
  const label = getHostLabel();
  if (label.toLowerCase().endsWith('s')) return label;
  if (label.toLowerCase().endsWith('boss')) return label + 'es';
  return label + 's';
};
