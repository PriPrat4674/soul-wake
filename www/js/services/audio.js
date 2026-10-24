// Sound and vibration. Knows how to play things, not when.
import { media } from '../core/storage.js';

const player = document.createElement('audio');
player.setAttribute('playsinline', '');
player.preload = 'auto';

const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
let ctx = null, unlocked = false, url = null;
let beepTimer = null, rampTimer = null, vibTimer = null;

export const isUnlocked = () => unlocked;

// Browsers only allow sound after a tap. Call this from any tap handler.
export function unlock() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator(), g = ctx.createGain();
    g.gain.value = 0; o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.05);
    if (player.paused) {
      player.muted = true;
      player.src = SILENT_WAV;
      player.play()?.then(() => { player.pause(); player.muted = false; }).catch(() => { player.muted = false; });
    }
    unlocked = true;
  } catch (e) { console.warn('audio unlock', e); }
}

export function beep(freq = 880, dur = 0.18, vol = 0.6) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'square'; o.frequency.value = freq; g.gain.value = vol;
  o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + dur);
}

export function startBeeps() {
  stopBeeps();
  let n = 0;
  beepTimer = setInterval(() => { if (n++ % 4 < 3) beep(n % 2 ? 880 : 1046); }, 260);
}
export function stopBeeps() { clearInterval(beepTimer); beepTimer = null; }
export const isBeeping = () => !!beepTimer;

// cliff: loop only the first N seconds (the rest is saved for later).
let cliff = null;
player.addEventListener('timeupdate', () => { if (cliff && player.currentTime >= cliff) player.currentTime = 0; });

// Plays a blob (song, voice note). Resolves true once playback starts.
export async function playBlob(blob, { loop = false, onEnded = null, cliff: cliffAt = null, from = 0 } = {}) {
  stopAll();
  if (!blob) return false;
  if (url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(blob);
  player.loop = loop;
  player.volume = 1;
  player.onended = onEnded;
  cliff = cliffAt;
  player.src = url;
  if (from) {
    await new Promise((r) => { player.addEventListener('loadedmetadata', r, { once: true }); setTimeout(r, 1500); });
    try { player.currentTime = Math.min(from, Math.max(0, (player.duration || from) - 1)); } catch {}
  }
  try { await player.play(); return true; } catch { player.onended = null; return false; }
}

// Plays a saved media record by id. Resolves false if it's missing or blocked.
export async function playMedia(id, opts = {}) {
  const rec = id ? await media.get(id).catch(() => null) : null;
  return rec ? playBlob(rec.blob, opts) : false;
}

export function rampUp() {
  clearInterval(rampTimer);
  player.volume = 0.35;
  rampTimer = setInterval(() => {
    player.volume = Math.min(1, player.volume + 0.05);
    if (player.volume >= 1) clearInterval(rampTimer);
  }, 1500);
}

export const isPlaying = () => !player.paused && !player.ended;

export function stopAll() {
  clearInterval(rampTimer);
  cliff = null;
  player.onended = null;
  player.pause();
  stopBeeps();
}

export function vibrate(on) {
  clearInterval(vibTimer);
  if (!navigator.vibrate) return;
  if (!on) { navigator.vibrate(0); return; }
  navigator.vibrate([600, 300, 600]);
  vibTimer = setInterval(() => navigator.vibrate([600, 300, 600]), 2000);
}
