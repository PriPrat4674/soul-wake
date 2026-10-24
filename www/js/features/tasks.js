// The user's morning task list, the waiting-time rule, and the optional chaos task.
import { load, save } from '../core/storage.js';
import { emit } from '../core/events.js';
import { uid, clamp, pick } from '../core/util.js';
import { DEFAULT_TASKS, NEW_TASK, MAX_TASKS, MAX_GAP_MIN, CHAOS_POOL } from '../config.js';

let list = load('tasks', DEFAULT_TASKS);
if (!Array.isArray(list)) list = structuredClone(DEFAULT_TASKS);
list = list.filter((t) => t && typeof t.name === 'string' && t.id);
let opts = load('tasks-options', { chaos: false });

function commit() { save('tasks', list); emit('tasks:changed', all()); }

export const all = () => list.map((t) => ({ ...t }));
export const options = () => ({ ...opts });
export const canAdd = () => list.length < MAX_TASKS;

export function setChaos(on) { opts.chaos = !!on; save('tasks-options', opts); emit('tasks:changed', all()); }

// Returns the new task's id, or null when the list is full.
export function add(template = NEW_TASK) {
  if (!canAdd()) return null;
  const t = { id: uid(), name: template.name, proof: template.proof, gapMin: clamp(template.gapMin || 0, 0, MAX_GAP_MIN) };
  list.push(t);
  commit();
  return t.id;
}

// Returns the saved task. Empty names are ignored, so a task always has a name.
export function update(id, patch) {
  const t = list.find((x) => x.id === id);
  if (!t) return null;
  if ('name' in patch) { const n = String(patch.name ?? '').trim().slice(0, 60); if (n) t.name = n; }
  if ('proof' in patch) { const p = String(patch.proof ?? '').trim().slice(0, 120); if (p) t.proof = p; }
  if ('gapMin' in patch) {
    const g = Number(patch.gapMin);
    t.gapMin = Number.isFinite(g) ? clamp(Math.round(g), 0, MAX_GAP_MIN) : t.gapMin;
  }
  commit();
  return { ...t };
}

export function remove(id) { list = list.filter((t) => t.id !== id); commit(); }

export function move(id, dir) {
  const i = list.findIndex((t) => t.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  commit();
}

// The list for this morning: your tasks, plus one random chaos task if it's on.
export function forToday() {
  const today = all();
  if (opts.chaos) { const c = pick(CHAOS_POOL); today.push({ id: 'chaos-' + uid(), name: c.name, proof: c.proof, gapMin: 0, chaos: true }); }
  return today;
}

// When a task becomes available, given when the previous one was finished.
export const unlocksAt = (task, prevDoneAt = 0) => prevDoneAt + (task?.gapMin || 0) * 60_000;
