// Sleep tracking without a watch. You tell SoulWake when you go to bed (from the bedtime
// prompt), and it notes when you stop the alarm. That's time in bed, not measured sleep.
// Guidance: 7–9 h for adults 18–25 (National Sleep Foundation, Hirshkowitz et al. 2015).
import { load, save } from '../core/storage.js';
import { on, emit } from '../core/events.js';
import { dayKey, clamp } from '../core/util.js';
import { SLEEP_GOAL_LIMITS, NAP_LIMITS } from '../config.js';
import * as native from '../services/native.js';

const HALF_HOUR = 30 * 60_000;
const DEFAULTS = {
  schedule: { bed: '23:00', wake: '06:30', goal: 8 },
  prompts: true,
  asleepCheck: 'warm', // 'warm' | 'silent' | 'off'
  pending: { bedAt: null, laterUntil: null, asleepAt: null, promptedOn: null },
  nights: [],
  naps: [],
  nap: null // { startAt, endAt } while napping
};
let s = load('sleep', DEFAULTS);
s.schedule = { ...DEFAULTS.schedule, ...(s.schedule || {}) };
s.pending = { ...DEFAULTS.pending, ...(s.pending || {}) };
if (!Array.isArray(s.nights)) s.nights = [];
if (!Array.isArray(s.naps)) s.naps = [];
if (s.nap && !(s.nap.startAt > 0 && s.nap.endAt > s.nap.startAt)) s.nap = null;

const commit = () => { save('sleep', s); emit('sleep:changed', get()); };
export const get = () => structuredClone(s);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/* ---------- settings ---------- */
export function setSchedule({ bed, wake, goal } = {}) {
  if (bed !== undefined && TIME_RE.test(bed)) s.schedule.bed = bed;
  if (wake !== undefined && TIME_RE.test(wake)) s.schedule.wake = wake;
  if (goal !== undefined && goal !== null && goal !== '' && Number.isFinite(Number(goal))) s.schedule.goal = clamp(Math.round(Number(goal) * 2) / 2, SLEEP_GOAL_LIMITS[0], SLEEP_GOAL_LIMITS[1]);
  commit();
  syncNative();
  return { ...s.schedule };
}
export function setOption(key, value) {
  if (key === 'prompts') s.prompts = !!value;
  else if (key === 'asleepCheck' && ['warm', 'silent', 'off'].includes(value)) s.asleepCheck = value;
  else return null;
  commit();
  syncNative();
  return s[key];
}

/** Next time the clock reads HH:MM (today if still ahead, otherwise tomorrow). */
export function nextOccurrence(hhmm, from = Date.now()) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(from); d.setHours(h, m, 0, 0);
  if (d.getTime() <= from) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export function syncNative() {
  if (!native.isNative()) return;
  if (s.prompts) native.schedule('bedtime', nextOccurrence(s.schedule.bed), 'bedtime', true);
  else native.cancel('bedtime');
  native.setSounds({ asleep: s.asleepCheck });
}

/**
 * Is this a time you'd normally be going to bed? From 2 hours before bedtime until your wake-up time.
 * Outside it, "Going to sleep" is treated as a nap.
 */
export function isSleepTime(at = Date.now()) {
  const d = new Date(at);
  const now = d.getHours() * 60 + d.getMinutes();
  const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const from = (toMin(s.schedule.bed) - 120 + 1440) % 1440, to = toMin(s.schedule.wake);
  return from <= to ? now >= from && now < to : now >= from || now < to;
}

/* ---------- naps ---------- */
export const napState = () => (s.nap ? { ...s.nap } : null);

export function startNap(minutes, at = Date.now()) {
  const mins = Math.round(Number(minutes));
  if (!Number.isFinite(mins)) return null;
  const m = clamp(mins, NAP_LIMITS[0], NAP_LIMITS[1]);
  s.nap = { startAt: at, endAt: at + m * 60_000 };
  commit();
  if (native.isNative()) native.schedule('nap', s.nap.endAt, 'nap');
  emit('nap:started', { ...s.nap });
  return { ...s.nap };
}

// Ends the nap (timer rang, or you woke early) and logs it as sleep for today.
export function endNap(at = Date.now()) {
  if (!s.nap) return null;
  const { startAt } = s.nap;
  s.nap = null;
  if (native.isNative()) { native.cancel('nap'); native.stopRinging(); }
  const hours = Math.max(0, (at - startAt) / 3_600_000);
  let nap = null;
  if (hours >= 1 / 60) {
    nap = { date: dayKey(new Date(at)), startAt, wakeAt: at, hours: Math.round(hours * 100) / 100 };
    s.naps = [nap, ...s.naps].slice(0, 120);
  }
  commit();
  emit('nap:ended', nap);
  return nap;
}

export const napsOn = (date) => s.naps.filter((n) => n.date === date);
const napHours = (date) => Math.round(napsOn(date).reduce((a, n) => a + n.hours, 0) * 100) / 100;

// Time's up: announce it once (from the clock tick here, or from Android's alarm via native-sync).
export function napRang() {
  if (!s.nap || s.nap.rang) return false;
  s.nap.rang = true;
  commit();
  emit('nap:ring', { ...s.nap });
  return true;
}
on('tick', ({ now }) => { if (s.nap && !s.nap.rang && now >= s.nap.endAt) napRang(); });

/* ---------- bedtime answers ---------- */
export function goingToSleep(at = Date.now(), { fromNative = false } = {}) {
  s.pending.bedAt = at;
  s.pending.laterUntil = null;
  s.pending.asleepAt = s.asleepCheck === 'off' ? null : at + HALF_HOUR;
  s.pending.promptedOn = dayKey(new Date(at));
  commit();
  if (!fromNative && native.isNative() && s.asleepCheck !== 'off') native.schedule('asleep', at + HALF_HOUR, 'asleep');
}

export function later(minutes = 30, at = Date.now(), { fromNative = false } = {}) {
  s.pending.laterUntil = at + minutes * 60_000;
  s.pending.promptedOn = dayKey(new Date(at));
  commit();
  if (!fromNative && native.isNative()) native.schedule('later', s.pending.laterUntil, 'later');
  return s.pending.laterUntil;
}

export function notTonight(at = Date.now()) {
  s.pending = { ...s.pending, bedAt: null, laterUntil: null, asleepAt: null, promptedOn: dayKey(new Date(at)) };
  commit();
}

// "Still awake" pushes your bedtime to now, and checks once more later.
export function stillAwake(at = Date.now(), { fromNative = false } = {}) {
  if (!s.pending.bedAt) return;
  s.pending.bedAt = at;
  s.pending.asleepAt = at + HALF_HOUR;
  commit();
  if (!fromNative && native.isNative()) native.schedule('asleep', at + HALF_HOUR, 'asleep');
}

// Answers given on notifications while the app was closed.
export function applyNativeEvents(events = []) {
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    if (e.type === 'sleep') goingToSleep(e.at, { fromNative: true });
    else if (e.type === 'later') later(30, e.at, { fromNative: true });
    else if (e.type === 'skip') notTonight(e.at);
    else if (e.type === 'awake') stillAwake(e.at, { fromNative: true });
  }
}

/* ---------- waking up ---------- */
export function recordWake(at = Date.now()) {
  const bedAt = s.pending.bedAt;
  s.pending.bedAt = null;
  s.pending.asleepAt = null;
  s.pending.laterUntil = null;
  if (!bedAt) { commit(); return null; }
  const hours = (at - bedAt) / 3_600_000;
  if (hours < 1 || hours > 16) { commit(); return null; } // not a real night
  const night = { date: dayKey(new Date(at)), bedAt, wakeAt: at, hours: Math.round(hours * 10) / 10 };
  s.nights = [night, ...s.nights.filter((n) => n.date !== night.date)].slice(0, 90);
  commit();
  emit('sleep:night', night);
  return night;
}

/* ---------- reading the log ---------- */
export function lastNight(now = new Date()) {
  const n = s.nights[0];
  return n && n.date === dayKey(now) ? { ...n } : null;
}

export function classify(hours, goal = s.schedule.goal) {
  if (hours == null) return null;
  if (hours < Math.min(goal - 1, 6.5)) return { key: 'short', emoji: '🥱', label: 'Short night', text: `${hours} h is well under your ${goal} h goal.` };
  if (hours < goal - 0.25) return { key: 'bit-short', emoji: '😐', label: 'A little short', text: `${hours} h, a bit under your ${goal} h goal.` };
  if (hours > Math.max(goal + 1.5, 9.5)) return { key: 'long', emoji: '🛌', label: 'Long night', text: `${hours} h is more than usual. Fine now and then; if it’s often, notice how you feel.` };
  return { key: 'good', emoji: '😊', label: 'Well rested', text: `${hours} h. Right on your ${goal} h goal.` };
}

// Nights from the last 7 days.
// Days from the last 7 days. Each day counts its night plus any naps ("total").
export function week(now = Date.now()) {
  const since = now - 7 * 86_400_000;
  const byDate = new Map();
  for (const n of s.nights.filter((x) => x.wakeAt > since)) byDate.set(n.date, { ...n, nap: 0 });
  for (const n of s.naps.filter((x) => x.wakeAt > since)) {
    const d = byDate.get(n.date) || { date: n.date, hours: 0, nap: 0, wakeAt: n.wakeAt, napOnly: true };
    d.nap = Math.round((d.nap + n.hours) * 100) / 100;
    byDate.set(n.date, d);
  }
  const days = [...byDate.values()].map((d) => ({ ...d, nap: Math.round(d.nap * 10) / 10, total: Math.round((d.hours + d.nap) * 10) / 10 })).sort((a, b) => a.date.localeCompare(b.date));
  const goal = s.schedule.goal;
  const total = days.reduce((a, n) => a + n.total, 0);
  const debt = days.reduce((a, n) => a + Math.max(0, goal - n.total), 0);
  return {
    count: days.length,
    average: days.length ? Math.round((total / days.length) * 10) / 10 : null,
    debt: Math.round(debt * 10) / 10,
    nights: days,
    goal
  };
}
export const todayNapHours = (now = new Date()) => napHours(dayKey(now));

/**
 * Weekend sleep-in suggestion, shown Saturday afternoon to Sunday morning.
 * Capped at 2 hours: sleeping until noon shifts your body clock ("social jetlag") and doesn't
 * undo a week of short sleep (Depner et al., Current Biology 2019).
 */
export function sundayAdvice(now = new Date()) {
  const day = now.getDay(), hour = now.getHours();
  const inWindow = (day === 6 && hour >= 12) || (day === 0 && hour < 12);
  if (!inWindow) return null;
  const w = week(now.getTime());
  if (w.count < 3 || w.debt < 2) return null;
  const minutes = clamp(Math.round((w.debt * 60) / 3 / 15) * 15, 30, 120);
  return { minutes, debt: w.debt, average: w.average };
}

/* ---------- in-app prompts (browser version; the APK uses notifications) ---------- */
on('tick', ({ now }) => {
  if (native.isNative() || !s.prompts) return;
  const today = dayKey(new Date(now));
  const p = s.pending;
  if (p.laterUntil && now >= p.laterUntil) { p.laterUntil = null; commit(); emit('sleep:prompt', { kind: 'later' }); return; }
  if (p.asleepAt && now >= p.asleepAt) { p.asleepAt = null; commit(); emit('sleep:prompt', { kind: 'asleep' }); return; }
  const [h, m] = s.schedule.bed.split(':').map(Number);
  const b = new Date(now); b.setHours(h, m, 0, 0);
  const bedToday = b.getTime();
  if (!p.bedAt && p.promptedOn !== today && now >= bedToday && now < bedToday + 90 * 60_000) {
    p.promptedOn = today; commit(); emit('sleep:prompt', { kind: 'bedtime' });
  }
});

on('morning:dismissed', (m) => { if (!m.test && m.rings >= 1) recordWake(Date.now()); });
