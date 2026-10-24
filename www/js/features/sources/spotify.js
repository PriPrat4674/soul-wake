// Sound source: Spotify, two ways.
// 1. Connect (full songs): sign in with Spotify Premium. Uses SoulWake's own Spotify app (registered as First Light)
//    (SPOTIFY_CLIENT_ID in config.js), so nobody types a Client ID. Sign-in uses PKCE: no server, no secret.
//    Playback tries the in-app Spotify player first, then any of your active Spotify devices.
// 2. Shared link (no sign-in): share a playlist from the Spotify app to SoulWake (or paste it).
//    It plays through Spotify's official embedded player, which gives 30-second previews.
import { load, save } from '../../core/storage.js';
import { emit } from '../../core/events.js';
import { sleep } from '../../core/util.js';
import { APP_NAME, SPOTIFY_SCOPES, SPOTIFY_CLIENT_ID } from '../../config.js';

export const id = 'spotify';
export const label = 'Spotify';

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';
const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';
const EMBED_URL = 'https://open.spotify.com/embed/iframe-api/v1';

let s = load('spotify', { clientId: '', token: null, playlist: null, user: null, lastError: null, link: null });
s.link ??= null;
let sdkPlayer = null, sdkDeviceId = null, activeDevice = null, embed = null;
const cid = () => s.clientId || SPOTIFY_CLIENT_ID;
let run = 0; // bumps on stop(), so a slow start can't begin playing after we've given up

const commit = () => { save('spotify', s); emit('spotify:changed', status()); };

export class SpotifyError extends Error {
  constructor(status, reason, message) { super(message); this.status = status; this.reason = reason; }
}

export const status = () => ({
  clientId: cid(), canConnect: CLIENT_ID_RE.test(cid()), connected: !!s.token, user: s.user, playlist: s.playlist, link: s.link, lastError: s.lastError
});
export const redirectUri = () => location.origin + location.pathname;
export const isReady = async () => !!((s.token && s.playlist) || s.link);
export const lastError = () => s.lastError;

const CLIENT_ID_RE = /^[0-9a-f]{32}$/i;
export function setClientId(value) {
  const v = String(value || '').trim();
  if (!CLIENT_ID_RE.test(v)) return { ok: false, reason: 'A Client ID is 32 letters and numbers. Copy it from your app in the Spotify developer dashboard.' };
  if (v !== s.clientId) { s.clientId = v; s.token = null; s.user = null; s.playlist = null; }
  commit();
  return { ok: true };
}

// Forget everything, including the Client ID.
export function forget() {
  try { sdkPlayer?.disconnect(); } catch {}
  sdkPlayer = null; sdkDeviceId = null;
  s = { clientId: '', token: null, playlist: null, user: null, lastError: null, link: null };
  commit();
}

/* ---------- Shared links (no sign-in) ---------- */
// Accepts open.spotify.com links to a playlist, album or track (with or without /intl-xx/).
export function parseLink(input) {
  let u;
  try { u = new URL(String(input || '').trim().match(/https?:\/\/\S+/)?.[0] || ''); } catch { return { ok: false, reason: 'That isn’t a Spotify link. In Spotify, tap Share → Copy link.' }; }
  if (u.hostname !== 'open.spotify.com') return { ok: false, reason: 'That isn’t a Spotify link. In Spotify, tap Share → Copy link.' };
  const m = /^\/(?:intl-[a-z-]+\/)?(playlist|album|track)\/([A-Za-z0-9]{10,40})/.exec(u.pathname);
  if (!m) return { ok: false, reason: 'Share a playlist, album or song from Spotify.' };
  return { ok: true, type: m[1], id: m[2], url: `https://open.spotify.com/${m[1]}/${m[2]}` };
}
export function setLink(input, name = '') {
  const r = parseLink(input);
  if (!r.ok) return r;
  s.link = { type: r.type, id: r.id, url: r.url, name: String(name || '').slice(0, 80) || { playlist: 'Shared playlist', album: 'Shared album', track: 'Shared song' }[r.type] };
  s.lastError = null;
  commit();
  lookupName(r);
  return { ok: true, ...s.link };
}
export function clearLink() { s.link = null; commit(); }
// Fills in the playlist's real name from Spotify's public oEmbed endpoint (best effort).
async function lookupName(r) {
  try {
    const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(r.url)}`);
    const d = await res.json();
    if (d?.title && s.link?.id === r.id) { s.link.name = String(d.title).slice(0, 80); commit(); }
  } catch {}
}
// Opens the playlist in the Spotify app (works on free accounts too).
export const appUri = () => (s.link ? `spotify:${s.link.type}:${s.link.id}` : s.playlist?.uri || null);
export const webUrl = () => (s.link ? s.link.url : s.playlist ? `https://open.spotify.com/playlist/${s.playlist.id}` : null);

/* ---------- Sign-in (PKCE) ---------- */
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function randomString(n = 64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (x) => chars[x % chars.length]).join('');
}

export async function connect() {
  if (!CLIENT_ID_RE.test(cid())) return { ok: false, reason: 'Full-song Spotify isn’t set up in this version. Share a playlist instead.' };
  const verifier = randomString(64);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = randomString(16);
  save('spotify-pkce', { verifier, state, at: Date.now() });
  const q = new URLSearchParams({
    client_id: cid(), response_type: 'code', redirect_uri: redirectUri(),
    code_challenge_method: 'S256', code_challenge: challenge, scope: SPOTIFY_SCOPES.join(' '), state
  });
  location.assign(`${AUTH_URL}?${q}`);
  return { ok: true };
}

// Call once on startup. Returns null if this page load isn't a Spotify sign-in return.
export async function handleRedirect() {
  const p = new URLSearchParams(location.search);
  if (!p.has('code') && !p.has('error')) return null;
  const pkce = load('spotify-pkce', null);
  save('spotify-pkce', null);
  history.replaceState(null, '', location.pathname);
  if (p.get('error')) {
    return { ok: false, reason: p.get('error') === 'access_denied' ? 'Spotify sign-in was cancelled.' : `Spotify sign-in failed (${p.get('error')}).` };
  }
  if (!pkce || p.get('state') !== pkce.state) return { ok: false, reason: 'Spotify sign-in could not be verified. Tap Connect again.' };
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: p.get('code'), redirect_uri: redirectUri(), client_id: cid(), code_verifier: pkce.verifier })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) return { ok: false, reason: data.error_description || 'Spotify did not accept the sign-in. Make sure your account is on SoulWake’s Spotify list.' };
    storeToken(data);
    try { const me = await api('/me'); s.user = { name: me?.display_name || me?.id || 'Spotify user' }; } catch { s.user = { name: 'Spotify user' }; }
    s.lastError = null;
    commit();
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Could not reach Spotify. Check your connection and try again.' };
  }
}

function storeToken(data) {
  s.token = {
    access: data.access_token,
    refresh: data.refresh_token || s.token?.refresh || null,
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000
  };
}

export function disconnect() {
  s.token = null; s.user = null; s.playlist = null;
  try { sdkPlayer?.disconnect(); } catch {}
  sdkPlayer = null; sdkDeviceId = null;
  commit();
}

async function accessToken(force = false) {
  if (!s.token) throw new SpotifyError(401, 'NOT_CONNECTED', 'Spotify is not connected.');
  if (!force && Date.now() < s.token.expiresAt - 60_000) return s.token.access;
  if (!s.token.refresh) { disconnect(); throw new SpotifyError(401, 'EXPIRED', 'Spotify sign-in expired. Connect again.'); }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: s.token.refresh, client_id: cid() })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    disconnect();
    throw new SpotifyError(401, 'EXPIRED', 'Spotify sign-in expired. Connect again.');
  }
  storeToken(data);
  save('spotify', s);
  return s.token.access;
}

async function api(path, { method = 'GET', body } = {}, retried = false) {
  const token = await accessToken();
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 401 && !retried) { await accessToken(true); return api(path, { method, body }, true); }
  if (res.status === 204 || res.status === 202) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const reason = data?.error?.reason || '';
    const msg = reason === 'PREMIUM_REQUIRED' ? 'Spotify playback needs a Premium account.'
      : reason === 'NO_ACTIVE_DEVICE' ? 'No Spotify device was available.'
      : res.status === 429 ? 'Spotify is rate-limiting requests. Try again later.'
      : data?.error?.message || `Spotify error ${res.status}.`;
    throw new SpotifyError(res.status, reason, msg);
  }
  return data;
}

/* ---------- Playlists ---------- */
export async function playlists() {
  const data = await api('/me/playlists?limit=50');
  return (data?.items || []).filter(Boolean).map((p) => ({
    id: p.id, name: p.name, uri: p.uri,
    total: (p.items || p.tracks)?.total ?? null
  }));
}

export function choosePlaylist(p) {
  if (!p?.uri?.startsWith('spotify:')) return false;
  s.playlist = { id: p.id, name: p.name, uri: p.uri, total: p.total ?? null };
  commit();
  return true;
}

/* ---------- In-app player (Web Playback SDK) ---------- */
function loadSdk() {
  if (window.Spotify?.Player) return Promise.resolve(true);
  return new Promise((resolve) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve(true);
    const tag = document.createElement('script');
    tag.src = SDK_URL;
    tag.onerror = () => resolve(false);
    document.head.appendChild(tag);
    setTimeout(() => resolve(!!window.Spotify?.Player), 6000);
  });
}

async function sdkDevice() {
  if (sdkDeviceId) return sdkDeviceId;
  if (!(await loadSdk())) return null;
  return new Promise((resolve) => {
    const done = (v) => { clearTimeout(t); resolve(v); };
    const t = setTimeout(() => done(null), 6000);
    sdkPlayer = new window.Spotify.Player({ name: APP_NAME, getOAuthToken: (cb) => accessToken().then(cb).catch(() => cb('')), volume: 0.8 });
    sdkPlayer.addListener('ready', ({ device_id }) => { sdkDeviceId = device_id; done(device_id); });
    sdkPlayer.addListener('not_ready', () => { sdkDeviceId = null; });
    for (const ev of ['initialization_error', 'authentication_error', 'account_error']) {
      sdkPlayer.addListener(ev, ({ message }) => { s.lastError = `Spotify player: ${message}`; done(null); });
    }
    sdkPlayer.connect().then((ok) => { if (!ok) done(null); });
  });
}

// Call from a tap (e.g. when arming) so the in-app player is allowed to make sound later.
export async function prepare() {
  if (!s.token) return;
  try { await sdkDevice(); sdkPlayer?.activateElement?.(); } catch {}
}

async function anyDevice() {
  const data = await api('/me/player/devices');
  const list = data?.devices || [];
  const pick = list.find((d) => d.is_active) || list.find((d) => d.type === 'Smartphone') || list[0];
  return pick?.id || null;
}

/* ---------- Embedded player (shared links) ---------- */
function loadEmbedApi() {
  if (window.__spotifyIframeApi) return Promise.resolve(window.__spotifyIframeApi);
  return new Promise((resolve) => {
    window.onSpotifyIframeApiReady = (api) => { window.__spotifyIframeApi = api; resolve(api); };
    const tag = document.createElement('script');
    tag.src = EMBED_URL;
    tag.async = true;
    tag.onerror = () => resolve(null);
    document.head.appendChild(tag);
    setTimeout(() => resolve(window.__spotifyIframeApi || null), 6000);
  });
}

async function playEmbed(mine) {
  const api = await loadEmbedApi();
  if (!api) throw new SpotifyError(0, 'EMBED', 'Couldn’t load Spotify’s player. Check your connection.');
  if (mine !== run) return false;
  const stage = document.getElementById('media-stage');
  if (!stage) return false;
  stage.innerHTML = '<div class="sp-frame"><div id="sp-embed"></div></div>';
  stage.classList.remove('hidden');
  document.body.classList.add('media-on');
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok) => { if (!settled) { settled = true; resolve(ok); } };
    api.createController(stage.querySelector('#sp-embed'), { uri: `spotify:${s.link.type}:${s.link.id}`, width: '100%', height: 152 }, (controller) => {
      if (mine !== run) { try { controller.destroy(); } catch {} return done(false); }
      embed = controller;
      controller.addListener('ready', () => controller.play());
      controller.addListener('playback_started', () => done(true));
      controller.addListener('playback_update', (e) => { if (e?.data && !e.data.isPaused && e.data.position > 0) done(true); });
    });
  });
}

function stopEmbed() {
  if (!embed) return;
  try { embed.pause(); embed.destroy(); } catch {}
  embed = null;
  const stage = document.getElementById('media-stage');
  if (stage) { stage.innerHTML = ''; stage.classList.add('hidden'); }
  document.body.classList.remove('media-on');
}

/* ---------- Source interface ---------- */
export async function play({ day = 0 } = {}) {
  if (!(s.token && s.playlist) && s.link) {
    const mine = ++run;
    try {
      const ok = await playEmbed(mine);
      if (ok) { s.lastError = null; save('spotify', s); }
      return ok;
    } catch (e) {
      s.lastError = e.message || 'Spotify could not play.';
      save('spotify', s);
      return false;
    }
  }
  if (!s.token || !s.playlist) { s.lastError = 'Spotify is not set up.'; save('spotify', s); return false; }
  const mine = ++run;
  const cancelled = () => mine !== run;
  try {
    activeDevice = (await sdkDevice()) || (await anyDevice());
    if (cancelled()) return false;
    if (!activeDevice) throw new SpotifyError(404, 'NO_ACTIVE_DEVICE', 'No Spotify device was available.');
    const total = s.playlist.total;
    const dev = `device_id=${encodeURIComponent(activeDevice)}`;
    await api(`/me/player/shuffle?state=${total ? 'false' : 'true'}&${dev}`, { method: 'PUT' }).catch(() => {});
    const body = { context_uri: s.playlist.uri };
    if (total) body.offset = { position: day % total };
    if (cancelled()) return false;
    await api(`/me/player/play?${dev}`, { method: 'PUT', body });
    for (let i = 0; i < 4; i++) {
      await sleep(900);
      if (cancelled()) return false;
      const st = await api('/me/player').catch(() => null);
      if (st?.is_playing) { s.lastError = null; save('spotify', s); return true; }
    }
    throw new SpotifyError(0, 'NOT_PLAYING', 'Spotify accepted the request but did not start playing.');
  } catch (e) {
    s.lastError = e.message || 'Spotify could not play.';
    save('spotify', s);
    emit('spotify:changed', status());
    return false;
  }
}

export function stop() {
  run++;
  stopEmbed();
  try { sdkPlayer?.pause(); } catch {}
  if (activeDevice && s.token) api(`/me/player/pause?device_id=${encodeURIComponent(activeDevice)}`, { method: 'PUT' }).catch(() => {});
  activeDevice = null;
}
