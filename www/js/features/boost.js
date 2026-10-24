// Wake-up boost: a voice note from last-night you, and motivating clips.
// Clips are your own videos, or links to YouTube Shorts / Instagram reels shared to SoulWake
// (played in each site's official embedded player, never downloaded).
// Shown once you pass the check-in.
import { media, load, save } from '../core/storage.js';
import { on, emit } from '../core/events.js';
import { uid, pick } from '../core/util.js';

const MAX_CLIP_MB = 100;

export const voice = async () => (await media.ofKind('voice'))[0] || null;
export const clips = () => media.ofKind('clip');

/* ---------- Clip links ---------- */
let links = load('cliplinks', []);
if (!Array.isArray(links)) links = [];
export const linkClips = () => links.map((l) => ({ ...l }));

// YouTube (Shorts, watch, youtu.be) or Instagram (reel, p). Returns { ok, site, id, url } or { ok:false, reason }.
export function parseClipLink(input) {
  let u;
  try { u = new URL(String(input || '').trim().match(/https?:\/\/\S+/)?.[0] || ''); } catch { return { ok: false, reason: 'Paste a YouTube Short or an Instagram reel link.' }; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (host === 'instagram.com') {
    const m = /^\/(reel|reels|p|tv)\/([A-Za-z0-9_-]{5,40})/.exec(u.pathname);
    if (m) return { ok: true, site: 'instagram', id: m[2], kind: m[1] === 'p' ? 'p' : 'reel', url: `https://www.instagram.com/${m[1] === 'p' ? 'p' : 'reel'}/${m[2]}/` };
    return { ok: false, reason: 'Share a reel or a post from Instagram.' };
  }
  if (['youtube.com', 'youtu.be', 'music.youtube.com'].includes(host)) {
    const id = host === 'youtu.be' ? u.pathname.slice(1, 12) : /^\/shorts\/([A-Za-z0-9_-]{11})/.exec(u.pathname)?.[1] || u.searchParams.get('v');
    if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return { ok: true, site: 'youtube', id, url: `https://www.youtube.com/shorts/${id}` };
    return { ok: false, reason: 'That YouTube link has no video in it.' };
  }
  return { ok: false, reason: 'Only YouTube and Instagram links work here.' };
}

export function addLink(input) {
  const r = parseClipLink(input);
  if (!r.ok) return r;
  if (links.some((l) => l.site === r.site && l.vid === r.id)) return { ok: false, reason: 'That clip is already saved.' };
  if (links.length >= 50) return { ok: false, reason: 'You can save up to 50 clip links.' };
  const item = { id: uid(), site: r.site, vid: r.id, kind: r.kind || null, url: r.url, name: r.site === 'youtube' ? 'YouTube clip' : 'Instagram reel', at: Date.now() };
  links.push(item);
  save('cliplinks', links);
  emit('boost:changed');
  return { ok: true, ...item };
}
export function removeLink(id) { links = links.filter((l) => l.id !== id); save('cliplinks', links); emit('boost:changed'); }

export async function saveVoice(blob) {
  if (!blob || !blob.size) return { ok: false, reason: 'The recording was empty. Try again.' };
  for (const v of await media.ofKind('voice')) await media.del(v.id);
  await media.put({ id: uid(), kind: 'voice', name: 'Message from past you', blob, at: Date.now() });
  emit('boost:changed');
  return { ok: true };
}
export async function deleteVoice() {
  for (const v of await media.ofKind('voice')) await media.del(v.id);
  emit('boost:changed');
}

export async function addClips(files) {
  let added = 0;
  const rejected = [];
  for (const f of files) {
    if (!f.type?.startsWith('video/')) { rejected.push(`${f.name} isn’t a video`); continue; }
    if (f.size > MAX_CLIP_MB * 1048576) { rejected.push(`${f.name} is over ${MAX_CLIP_MB} MB`); continue; }
    await media.put({ id: uid(), kind: 'clip', name: f.name.replace(/\.[^.]+$/, ''), blob: f, at: Date.now() });
    added++;
  }
  if (added) emit('boost:changed');
  return { added, rejected };
}
export async function removeClip(id) { await media.del(id); emit('boost:changed'); }

on('checkin:passed', async () => {
  const [v, c] = await Promise.all([voice(), clips()]);
  const all = [...c, ...links.map((l) => ({ ...l, link: true }))];
  if (!v && !all.length) return;
  emit('boost:show', { voice: v, clip: all.length ? pick(all) : null });
});
