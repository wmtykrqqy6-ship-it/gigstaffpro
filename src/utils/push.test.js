import { describe, it, expect } from 'vitest';
import { isIos, isInstalledApp, pushSupport, urlBase64ToUint8Array } from './push';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36';

const win = ({ ua, standalone = false, apis = true, permission = 'default' }) => {
  const navigator = { userAgent: ua, standalone, maxTouchPoints: 5 };
  if (apis) navigator.serviceWorker = {};
  const w = { navigator, matchMedia: () => ({ matches: standalone }) };
  if (apis) { w.PushManager = function () {}; w.Notification = { permission }; }
  return w;
};

describe('device detection', () => {
  it('spots iPhones (and iPads posing as Macs)', () => {
    expect(isIos({ userAgent: IPHONE })).toBe(true);
    expect(isIos({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ userAgent: ANDROID })).toBe(false);
  });
  it('knows when it runs as the installed app', () => {
    expect(isInstalledApp(win({ ua: IPHONE, standalone: true }))).toBe(true);
    expect(isInstalledApp(win({ ua: IPHONE }))).toBe(false);
  });
});

describe('pushSupport', () => {
  it('iPhone in Safari must install first', () => {
    expect(pushSupport(win({ ua: IPHONE, apis: false }))).toBe('install-first');
  });
  it('iPhone home-screen app and Android are ready', () => {
    expect(pushSupport(win({ ua: IPHONE, standalone: true }))).toBe('ready');
    expect(pushSupport(win({ ua: ANDROID }))).toBe('ready');
  });
  it('blocked when the person said no', () => {
    expect(pushSupport(win({ ua: ANDROID, permission: 'denied' }))).toBe('blocked');
  });
  it('unsupported desktop browser without the APIs', () => {
    expect(pushSupport(win({ ua: 'Mozilla/5.0 (Windows NT 10.0)', apis: false }))).toBe('unsupported');
  });
});

describe('urlBase64ToUint8Array', () => {
  it('decodes a base64url key to bytes', () => {
    // "hello" = aGVsbG8 (unpadded base64url)
    expect(Array.from(urlBase64ToUint8Array('aGVsbG8'))).toEqual([104, 101, 108, 108, 111]);
    // url-safe characters - and _ map to + and /
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([251, 255]);
  });
});
