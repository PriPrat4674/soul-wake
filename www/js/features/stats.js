// Streak, totals and history. Test runs never count.
import { load, save } from '../core/storage.js';
import { on, emit } from '../core/events.js';
import { dayKey } from '../core/util.js';
import { grade } from './report.js';

const EMPTY = { streak: 0, best: 0, wins: 0, lastWin: null, history: [], totals: { snoozes: 0, misses: 0, paused: 0 } };
let s = load('streak', EMPTY);
// Repair anything odd (hand-edited or corrupted data): whole numbers ≥ 0, a real date, a list.
const whole = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : 0);
s.streak = whole(s.streak); s.best = Math.max(whole(s.best), s.streak); s.wins = Math.max(whole(s.wins), s.streak);
if (!/^\d{4}-\d{2}-\d{2}$/.test(s.lastWin || '')) { s.lastWin = null; s.streak = 0; }
s.totals = { ...EMPTY.totals, ...(s.totals && typeof s.totals === 'object' ? s.totals : {}) };
for (const k of Object.keys(EMPTY.totals)) s.totals[k] = whole(s.totals[k]);
if (!Array.isArray(s.history)) s.history = [];

const commit = () => { save('streak', s); emit('streak:changed', get()); };
export const get = () => structuredClone(s);

// The streak only counts if yesterday or today was proven.
export function currentStreak(now = new Date()) {
  if (!s.lastWin) return 0;
  const y = new Date(now); y.setDate(y.getDate() - 1);
  return s.lastWin === dayKey(now) || s.lastWin === dayKey(y) ? s.streak : 0;
}

// A morning counts for the day its alarm rang (so a 23:50 alarm finished after midnight still
// counts for that night), and it continues the streak if the day before it was proven.
export function dayBefore(key) {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}

on('morning:finished', (m) => {
  if (m.test) return;
  const today = /^\d{4}-\d{2}-\d{2}$/.test(m.date || '') ? m.date : dayKey();
  if (s.lastWin !== today) {
    s.streak = (s.lastWin === dayBefore(today) ? s.streak : 0) + 1;
    s.wins++;
    s.lastWin = today;
  }
  s.best = Math.max(s.best, s.streak);
  s.totals.snoozes += m.snoozes || 0;
  s.totals.misses += m.misses || 0;
  const g = grade(m);
  s.history = [{ date: today, outcome: 'proven', mins: g.mins, snoozes: g.snoozes, misses: g.misses, grade: g.letter }, ...s.history].slice(0, 60);
  commit();
});

on('guard:tripped', ({ level }) => {
  s.totals.paused++;
  s.history = [{ date: dayKey(), outcome: 'paused', level }, ...s.history].slice(0, 60);
  commit();
});
