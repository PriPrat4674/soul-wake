// The Android bridge. In the APK this talks to FirstLightPlugin.java; in a browser every call
// is a harmless no-op, so the same code runs as a website and as an app.
const cap = window.Capacitor;
const native = !!cap?.isNativePlatform?.();
const FL = native ? cap.registerPlugin('FirstLight') : null;
const Bars = native ? (window.capacitorExports?.SystemBars || cap.registerPlugin('SystemBars')) : null;

export const isNative = () => native;

async function call(method, args = {}, fallback = null) {
  if (!FL) return fallback;
  try { return (await FL[method](args)) ?? fallback; } catch (e) { console.warn(`[native] ${method}`, e?.message || e); return fallback; }
}

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

export const status = () => call('status', {}, { exactAlarms: true, notifications: false, fullScreen: true, accessibility: false, batteryUnrestricted: false, ringing: false, lockedUntil: 0 });
export const requestNotifications = () => call('requestNotifications', {}, { granted: false });
export const openSettings = (which) => call('openSettings', { which });

// extra: { title, text } for a plain notification (kind 'task').
export const schedule = (id, at, kind, repeatDaily = false, extra = {}) => call('schedule', { id, at: Math.round(at), kind, repeatDaily, ...extra });
export const cancel = (id) => call('cancel', { id });
export const ring = (kind) => call('ring', { kind });
export const stopRinging = () => call('stopRinging');

export async function setSoundFile(which, blob) {
  if (!FL) return null;
  return call('setSoundFile', { which, base64: blob ? await blobToBase64(blob) : '' });
}
export const setSounds = (choices) => call('setSounds', choices);
export const previewSound = (name) => call('previewSound', { name });

export async function takeSleepEvents() { return (await call('takeSleepEvents', {}, { events: [] })).events || []; }

export async function listApps() { return (await call('listApps', {}, { apps: [] })).apps || []; }
export const configureLock = (cfg) => call('configureLock', cfg);
export const lockNow = () => call('lockNow');
export const unlock = () => call('unlock');

// Launcher entries keep their old names so updates keep your icon: the SoulWake smiley uses the
// entry that was once the owl (then the tiger).
export const ICON_ENTRY = { sunrise: 'sunrise', crescent: 'crescent', soulwake: 'owl', bell: 'bell' };
export const setIcon = (name) => call('setIcon', { name: ICON_ENTRY[name] || 'owl' });

// Night guard: the nightly window ({ armed, uninstall, bed, wake, beforeMin, afterMin }) and a
// short pass after the uninstall guard is solved. Android checks these itself, even with the app closed.
export const setGuard = (cfg) => call('setGuard', cfg);
export const guardPass = (until) => call('guardPass', { until: Math.round(until) });

// Opens a link outside the app: the Spotify/YouTube app if installed, otherwise the browser.
export async function openUrl(url) {
  if (FL) { const r = await call('openUrl', { url }, null); if (r?.ok) return true; }
  try { window.open(url, '_blank', 'noopener'); return true; } catch { return false; }
}
export const takeLaunch = () => call('takeLaunch', {}, {});

export function on(event, fn) {
  if (!FL) return () => {};
  const handle = FL.addListener(event, fn);
  return () => Promise.resolve(handle).then((h) => h?.remove?.());
}

export function setStatusBar(darkTheme) {
  if (!Bars) return;
  Bars.setStyle({ style: darkTheme ? 'DARK' : 'LIGHT' }).catch(() => {});
}
