// Persistence. Each feature saves under its own key ('alarm', 'tasks', ...),
// so features never share or overwrite each other's data.
import { emit } from './events.js';

const PREFIX = 'fl:';
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return clone(fallback);
    const val = JSON.parse(raw);
    // Saved data of the wrong shape (e.g. corrupted) falls back to the default.
    // New default fields appear automatically for older saved data.
    if (isObj(fallback)) return isObj(val) ? { ...clone(fallback), ...val } : clone(fallback);
    if (Array.isArray(fallback)) return Array.isArray(val) ? val : clone(fallback);
    return val ?? clone(fallback);
  } catch {
    return clone(fallback);
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    emit('storage:error');
    return false;
  }
}

export const hasKey = (key) => localStorage.getItem(PREFIX + key) != null;

/* Large files (songs) live in IndexedDB. */
const DB_NAME = 'first-light';
let dbp = null;

function openDb() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('media', { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction('media', mode);
    const req = fn(t.objectStore('media'));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

export const media = {
  put: (rec) => tx('readwrite', (s) => s.put(rec)),
  get: (id) => tx('readonly', (s) => s.get(id)),
  del: (id) => tx('readwrite', (s) => s.delete(id)),
  all: () => tx('readonly', (s) => s.getAll()),
  async ofKind(kind) {
    try { return (await media.all()).filter((m) => m.kind === kind); } catch { return []; }
  }
};

export async function eraseAll() {
  Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
  try { (await dbp)?.close(); } catch {}
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}
