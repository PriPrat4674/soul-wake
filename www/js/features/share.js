// "Share → SoulWake": links shared from the Spotify, YouTube or Instagram apps (or pasted).
// Works out what a link is; the UI (share-view.js) decides what to do with it.
import { on, emit } from '../core/events.js';
import * as spotify from './sources/spotify.js';
import * as youtube from './sources/youtube.js';
import * as boost from './boost.js';
import * as music from './music.js';
import * as native from '../services/native.js';

export function classify(text) {
  const raw = String(text || '').match(/https?:\/\/[^\s<>"']+/i)?.[0];
  if (!raw) return { kind: 'none' };
  let u;
  try { u = new URL(raw); } catch { return { kind: 'none' }; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (host === 'open.spotify.com') return spotify.parseLink(raw).ok ? { kind: 'spotify', url: raw } : { kind: 'unknown', url: raw };
  if (host === 'spotify.link' || host === 'spotify.app.link') return { kind: 'spotify-short', url: raw };
  if (['youtube.com', 'music.youtube.com', 'youtu.be'].includes(host)) {
    if (/^\/shorts\//.test(u.pathname)) return { kind: 'clip', url: raw };
    if (u.searchParams.get('list') && youtube.parse(raw).ok) return { kind: 'youtube-playlist', url: raw };
    if (youtube.parse(raw).ok) return { kind: 'youtube-video', url: raw };
    return { kind: 'unknown', url: raw };
  }
  if (host === 'instagram.com') return boost.parseClipLink(raw).ok ? { kind: 'clip', url: raw } : { kind: 'unknown', url: raw };
  return { kind: 'unknown', url: raw };
}

// Short Spotify links (spotify.link/…) redirect to open.spotify.com. The app's native HTTP
// client can follow the redirect; a browser usually can't (CORS), so we ask for "Copy link" instead.
export async function resolveShort(url) {
  const http = native.isNative() ? window.Capacitor?.Plugins?.CapacitorHttp : null;
  if (!http?.get) return null;
  try {
    const r = await http.get({ url, responseType: 'text' });
    const final = r.url && /open\.spotify\.com/.test(r.url) ? r.url : String(r.data || '').match(/https:\/\/open\.spotify\.com\/[^"'\s<>]+/)?.[0];
    return final && spotify.parseLink(final).ok ? final : null;
  } catch { return null; }
}

// Applies a decision. use: 'alarm' (wake-up music) or 'clip' (motivation).
export function apply(kind, url, use) {
  if (kind === 'spotify') {
    const r = spotify.setLink(url);
    if (!r.ok) return r;
    music.setSource('spotify');
    return { ok: true, message: `${r.name} will wake you 🎵`, tab: 'sounds' };
  }
  if (use === 'clip' || kind === 'clip') {
    const r = boost.addLink(url);
    return r.ok ? { ok: true, message: 'Clip saved. It plays after your check-in 🚀', tab: 'sounds' } : r;
  }
  if (kind === 'youtube-playlist' || kind === 'youtube-video') {
    const r = youtube.setLink(url);
    if (!r.ok) return r;
    music.setSource('youtube');
    return { ok: true, message: r.listId ? 'YouTube playlist set as your alarm 🎵' : 'That video is your alarm now 🎵', tab: 'sounds' };
  }
  return { ok: false, reason: 'I can use Spotify, YouTube and Instagram links.' };
}

// Native: text shared to the app arrives here (see native-sync.js).
let last = { text: '', at: 0 };
export function receive(text) {
  if (!text || (text === last.text && Date.now() - last.at < 5000)) return; // the same share delivered twice
  last = { text, at: Date.now() };
  emit('share:received', { text });
}
on('share:text', ({ text }) => receive(text));
