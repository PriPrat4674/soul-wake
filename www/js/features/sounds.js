// Which sound plays for the alarm (when no song is set), check-ins, and messages.
import { load, save } from '../core/storage.js';
import { on, emit } from '../core/events.js';
import * as native from '../services/native.js';
import * as profile from './profile.js';

export const ALARM_SOUNDS = [{ id: 'dawn', label: 'Dawn', emoji: '🌅' }, { id: 'bells', label: 'Bells', emoji: '🔔' }, { id: 'classic', label: 'Classic', emoji: '⏰' }];
export const SHORT_SOUNDS = [
  { id: 'chime', label: 'Chime', emoji: '✨' }, { id: 'bell', label: 'Bell', emoji: '🛎️' },
  { id: 'marimba', label: 'Marimba', emoji: '🎶' }, { id: 'pluck', label: 'Pluck', emoji: '🎸' }, { id: 'harp', label: 'Harp', emoji: '🪕' }
];
const ok = (list, id) => list.some((x) => x.id === id);

let s = load('sounds', { alarm: 'dawn', checkin: 'bell', message: 'chime' });

export const get = () => ({ ...s });

export function set(purpose, id) {
  const list = purpose === 'alarm' ? ALARM_SOUNDS : SHORT_SOUNDS;
  if (!['alarm', 'checkin', 'message'].includes(purpose) || !ok(list, id)) return null;
  s[purpose] = id;
  save('sounds', s);
  sync();
  emit('sounds:changed', get());
  return id;
}

const fileFor = (id) => `sounds/${ALARM_SOUNDS.some((x) => x.id === id) ? 'alarm' : 'note'}_${id}.mp3`;
let previewEl = null;

export function preview(id) {
  if (native.isNative()) return native.previewSound(id);
  try {
    previewEl?.pause();
    previewEl = new Audio(fileFor(id));
    return previewEl.play().catch(() => {});
  } catch { return null; }
}

// In the browser version, check-ins use the chosen sound on a loop instead of beeps.
let loopEl = null;
export function startLoop(purpose = 'checkin') {
  stopLoop();
  try {
    loopEl = new Audio(fileFor(s[purpose]));
    loopEl.loop = true;
    return loopEl.play().then(() => true).catch(() => false);
  } catch { return Promise.resolve(false); }
}
export function stopLoop() { try { loopEl?.pause(); } catch {} loopEl = null; }

export function sync() { native.setSounds({ ...s, userName: profile.get().name }); }
on('profile:changed', sync);
