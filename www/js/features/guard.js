// Night guard. From 2 hours before bedtime until 2 hours after the alarm, disarming the alarm,
// moving it, or erasing everything takes three sums and your buddy's 4-digit PIN.
// The Android app also guards uninstalling and force-stopping (LockService.java), using the
// same window, which it gets from here.
//
// The PIN is set by a friend, is never shown, and is stored only as a salted hash.
// Forgot it? Start a 24-hour wait; after that the alarm can be disarmed without it.
import { load, save } from '../core/storage.js';
import { on, emit } from '../core/events.js';
import { GUARD } from '../config.js';
import * as alarm from './alarm.js';
import * as sleep from './sleep.js';
import * as native from '../services/native.js';

const DEFAULTS = { enabled: true, uninstall: true, pin: null, salt: null, setAt: null, forgotAt: null, misses: 0, pauseUntil: 0, passUntil: 0 };
let g = load('guard', DEFAULTS);
if (typeof g.enabled !== 'boolean') g.enabled = true;
if (typeof g.uninstall !== 'boolean') g.uninstall = true;
if (g.pin && !/^[0-9a-f]{16,128}$/.test(String(g.pin))) { g.pin = null; g.salt = null; } // repair damaged data

const commit = () => { save('guard', g); emit('guard:changed', state()); syncNative(); };

export const state = (now = Date.now()) => ({
  enabled: g.enabled, uninstall: g.uninstall, hasPin: !!g.pin, setAt: g.setAt,
  forgotAt: g.forgotAt, forgotLeft: forgotLeft(now), guarded: isGuarded(now), window: windowNow(now)
});

/* ---------------- the guarded hours ---------------- */
const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return (h * 60 + m) % 1440; };

// The nightly window as minutes after midnight: { from, length } (length may wrap past midnight).
export function nightly(bed = sleep.get().schedule.bed, wake = alarm.status().time) {
  const from = (toMin(bed) - GUARD.beforeBedMin + 1440) % 1440;
  const length = ((toMin(wake) - toMin(bed) + 1440) % 1440) + GUARD.beforeBedMin + GUARD.afterAlarmMin;
  return { from, length: Math.min(1440, length) };
}

// The window you're in right now, as timestamps, or null. Only while a real alarm is armed.
export function windowNow(now = Date.now()) {
  if (!g.enabled || !alarm.status().armed) return null;
  const { from, length } = nightly();
  if (length >= 1440) return { from: now - 60_000, until: now + 86400_000 };
  const d = new Date(now);
  const mins = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  const since = (mins - from + 1440) % 1440;
  if (since >= length) return null;
  const start = now - since * 60_000;
  return { from: Math.round(start), until: Math.round(start + length * 60_000) };
}
export const isGuarded = (now = Date.now()) => !!windowNow(now);

/* ---------------- sums ---------------- */
// Pure and seeded, so tests can check them. Harder after midnight, when you're most tempted.
export function makeSums(seed = Date.now(), hour = new Date().getHours(), n = GUARD.sums) {
  let x = (seed >>> 0) || 1;
  const r = (lo, hi) => { x = (x * 1664525 + 1013904223) >>> 0; return lo + (x % (hi - lo + 1)); };
  const late = hour < 5;
  return Array.from({ length: n }, (_, i) => {
    const kind = late ? (i % 2 ? 'add' : 'mul') : ['add', 'sub', 'mul'][i % 3];
    if (kind === 'mul') { const a = r(late ? 13 : 6, late ? 49 : 12), b = r(late ? 6 : 3, 9); return { text: `${a} × ${b}`, answer: a * b }; }
    if (kind === 'sub') { const a = r(40, 99), b = r(11, a - 10); return { text: `${a} − ${b}`, answer: a - b }; }
    const a = r(late ? 120 : 23, late ? 499 : 89), b = r(late ? 60 : 14, late ? 399 : 79);
    return { text: `${a} + ${b}`, answer: a + b };
  });
}

/* ---------------- buddy PIN ---------------- */
const PIN_RE = new RegExp(`^\\d{${GUARD.pinLength}}$`);
export const validPin = (pin) => PIN_RE.test(String(pin ?? ''));

async function hash(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${pin}:soulwake`);
  if (crypto?.subtle?.digest) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback for very old WebViews: two FNV-1a passes (still never stores the PIN itself).
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (const b of data) { h1 = Math.imul(h1 ^ b, 16777619) >>> 0; h2 = Math.imul(h2 ^ b, 2166136261) >>> 0; }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
const newSalt = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');

export const hasPin = () => !!g.pin;

export async function setPin(pin, now = Date.now()) {
  if (!validPin(pin)) return false;
  g.salt = newSalt();
  g.pin = await hash(String(pin), g.salt);
  g.setAt = now; g.forgotAt = null; g.misses = 0; g.pauseUntil = 0;
  commit();
  return true;
}

export function clearPin() { g.pin = null; g.salt = null; g.setAt = null; g.forgotAt = null; g.misses = 0; g.pauseUntil = 0; commit(); }

// Resolves to 'ok', 'wrong', 'paused' (too many wrong tries: wait a minute) or 'none' (no PIN set).
export async function checkPin(pin, now = Date.now()) {
  if (!g.pin) return 'none';
  if (g.pauseUntil > now) return 'paused';
  const ok = validPin(pin) && (await hash(String(pin), g.salt)) === g.pin;
  if (ok) { g.misses = 0; g.pauseUntil = 0; save('guard', g); return 'ok'; }
  g.misses = (g.misses || 0) + 1;
  if (g.misses >= GUARD.pinTries) { g.misses = 0; g.pauseUntil = now + GUARD.pinPauseMs; }
  save('guard', g);
  return g.pauseUntil > now ? 'paused' : 'wrong';
}
export const pausedFor = (now = Date.now()) => Math.max(0, g.pauseUntil - now);

/* ---------------- forgot the PIN: the 24-hour way out ---------------- */
export function forgotLeft(now = Date.now()) { return g.forgotAt ? Math.max(0, g.forgotAt + GUARD.forgotWaitMs - now) : null; }
export function startForgot(now = Date.now()) { if (!g.pin) return false; if (!g.forgotAt) { g.forgotAt = now; commit(); } return true; }
export function cancelForgot() { if (g.forgotAt) { g.forgotAt = null; commit(); } }
// After the wait the PIN no longer protects anything, so it's cleared for your buddy to set a new one.
export function useForgot(now = Date.now()) {
  if (forgotLeft(now) !== 0) return false;
  clearPin();
  emit('guard:pinReleased');
  return true;
}

/* ---------------- settings ---------------- */
export function setEnabled(v) { g.enabled = !!v; commit(); }
export function setUninstall(v) { g.uninstall = !!v; commit(); }

// After the uninstall guard is solved: a few minutes in which Settings isn't intercepted.
export function grantPass(now = Date.now(), ms = GUARD.passMs) {
  g.passUntil = now + ms;
  save('guard', g);
  native.guardPass(g.passUntil);
  emit('guard:pass', { until: g.passUntil });
  return g.passUntil;
}
export const passLeft = (now = Date.now()) => Math.max(0, (g.passUntil || 0) - now);

/* ---------------- Android ---------------- */
// Android works the window out by itself every night (the app may stay closed for days).
export function syncNative() {
  if (!native.isNative()) return;
  const a = alarm.status();
  const s = sleep.get().schedule;
  native.setGuard({
    armed: !!a.armedAt && g.enabled, uninstall: g.enabled && g.uninstall && !!a.armedAt,
    bed: s.bed, wake: a.time, beforeMin: GUARD.beforeBedMin, afterMin: GUARD.afterAlarmMin
  });
}
['alarm:changed', 'sleep:changed'].forEach((e) => on(e, () => { syncNative(); emit('guard:changed', state()); }));
