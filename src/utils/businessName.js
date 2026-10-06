// businessName.js
// The customer's business name (Dylan, 2026-10-06: GigStaffPro may become a
// SaaS, so each business names its own app -- "Vegas On Wheels").
//
// Used as the installed app's name: "from <name>" on push notifications,
// the label under the home-screen icon, and the browser tab. "GigStaffPro"
// stays the product name elsewhere.
//
// Stored org-wide in `settings` (setting_key 'business_name'; public read,
// admin write -- same as host_label), cached in localStorage so it's
// available instantly at startup. Mirrors hostLabelHelper.js.

import { supabase } from '../supabaseClient';

export const PRODUCT_NAME = 'GigStaffPro';
const CACHE_KEY = 'gigstaffpro_business_name';
const SETTING_KEY = 'business_name';

export const cleanBusinessName = (name) => String(name ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);

export const getBusinessName = () => {
  try { return cleanBusinessName(localStorage.getItem(CACHE_KEY)) || PRODUCT_NAME; }
  catch { return PRODUCT_NAME; }
};

const cacheLocally = (name) => {
  try { localStorage.setItem(CACHE_KEY, cleanBusinessName(name)); } catch { /* private mode */ }
};

// The web app manifest for this business. URLs are absolute because the
// manifest is served from a blob: URL (see applyAppBranding).
export function buildManifest(name, origin) {
  const appName = cleanBusinessName(name) || PRODUCT_NAME;
  const abs = (p) => new URL(p, origin).href;
  return {
    name: appName,
    short_name: appName,
    description: `${appName} staff app: shifts, invites, routes and check-in.`,
    id: abs('/'),
    start_url: abs('/'),
    scope: abs('/'),
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#7f1d1d',
    theme_color: '#7f1d1d',
    icons: [
      { src: abs('/icons/icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: abs('/icons/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: abs('/icons/icon-maskable-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
}

let manifestBlobUrl = null;

// Name the app after the business: browser tab, iPhone home-screen title,
// and the install manifest (Android/desktop app name, "from <name>" on
// notifications). Takes effect for new installs; an already-installed app
// keeps the name it was installed with until it's removed and re-added.
export function applyAppBranding(name = getBusinessName()) {
  if (typeof document === 'undefined') return;
  const appName = cleanBusinessName(name) || PRODUCT_NAME;
  document.title = appName === PRODUCT_NAME ? `${PRODUCT_NAME} - Casino Party Staffing` : appName;
  const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (appleTitle) appleTitle.setAttribute('content', appName);
  const link = document.querySelector('link[rel="manifest"]');
  if (link && appName !== PRODUCT_NAME) {
    try {
      const blob = new Blob([JSON.stringify(buildManifest(appName, window.location.origin))], { type: 'application/manifest+json' });
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      if (manifestBlobUrl) URL.revokeObjectURL(manifestBlobUrl);
      manifestBlobUrl = url;
    } catch { /* keep the static manifest */ }
  }
}

// Startup (any role): fetch the org-wide name, cache it, re-brand.
export async function loadBusinessNameFromServer() {
  try {
    const { data, error } = await supabase
      .from('settings').select('setting_value').eq('setting_key', SETTING_KEY).maybeSingle();
    if (!error && data?.setting_value) {
      cacheLocally(data.setting_value);
      applyAppBranding(data.setting_value);
    }
  } catch { /* keep the cached name */ }
}

// Admin-only (settings RLS enforces it). Throws on failure.
export async function setBusinessName(name) {
  const clean = cleanBusinessName(name);
  const { data: existing } = await supabase
    .from('settings').select('setting_key').eq('setting_key', SETTING_KEY).maybeSingle();
  const { error } = existing
    ? await supabase.from('settings').update({ setting_value: clean, updated_at: new Date().toISOString() }).eq('setting_key', SETTING_KEY)
    : await supabase.from('settings').insert([{ setting_key: SETTING_KEY, setting_value: clean }]);
  if (error) throw error;
  cacheLocally(clean);
  applyAppBranding(clean);
}
