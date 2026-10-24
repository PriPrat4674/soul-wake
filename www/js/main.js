// Entry point: loads every part, applies your look, mounts the screens, runs first-time setup
// or Pip's greeting, then starts the clock.
import './core/migrate.js';
import { on, emit } from './core/events.js';
import { $, toast } from './core/util.js';
import * as audio from './services/audio.js';
import * as battery from './services/battery.js';
import * as native from './services/native.js';

// Features (behaviour). They only talk through events.
import './features/alarm.js';
import './features/checkin.js';
import './features/snooze.js';
import './features/stats.js';
import './features/boost.js';
import './features/battery-guard.js';
import './features/ringer.js';
import './features/sleep.js';
import './features/recovery.js';
import './features/pet.js';
import './features/sounds.js';
import './features/applock.js';
import './features/guard.js';
import * as profile from './features/profile.js';
import * as morning from './features/morning.js';
import * as spotify from './features/sources/spotify.js';
import * as nativeSync from './features/native-sync.js';
import { sync as syncAwake } from './features/keep-awake.js';

// Screens.
import * as theme from './ui/theme.js';
import * as tabs from './ui/tabs.js';
import * as home from './ui/home.js';
import * as install from './ui/install.js';
import * as tasksEditor from './ui/tasks-editor.js';
import * as soundsView from './ui/sounds-view.js';
import * as progressView from './ui/progress-view.js';
import * as settingsView from './ui/settings-view.js';
import * as nightView from './ui/night-view.js';
import * as morningView from './ui/morning-view.js';
import * as checkinView from './ui/checkin-view.js';
import * as boostView from './ui/boost-view.js';
import * as camera from './ui/camera.js';
import * as sleepView from './ui/sleep-view.js';
import './ui/guard-view.js';
import * as applockView from './ui/applock-view.js';
import * as onboarding from './ui/onboarding.js';
import * as petView from './ui/pet-view.js';
import * as appbar from './ui/appbar.js';
import * as napView from './ui/nap-view.js';
import * as shareView from './ui/share-view.js';
import './features/places.js';

theme.init();
// After an update, put the home-screen icon in step with your logo (launcher entries were remapped in 3.2).
if (native.isNative()) { try { if (localStorage.getItem('fl:icon-synced') !== '3.2') { native.setIcon(profile.get().logo); localStorage.setItem('fl:icon-synced', '3.2'); } } catch {} }
document.documentElement.classList.toggle('in-app', native.isNative());

if (!native.isNative() && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
on('storage:error', () => toast('Couldn’t save. Your phone’s storage may be full.'));
on('music:fallback', ({ source }) => toast(`${source === 'spotify' ? 'Spotify' : 'YouTube'} didn’t start, so your backup is playing.`, 5000));

const section = (id) => $(`[data-tab="${id}"]`);
appbar.mount($('#appbar'));
home.mount(section('alarm'));
if (!native.isNative()) install.mount(section('alarm'));
tasksEditor.mount(section('tasks'));
sleepView.mountTab(section('sleep'));
soundsView.mount(section('sounds'));
progressView.mount(section('progress'));
settingsView.mount(section('settings'));
nightView.mount($('#night'));
morningView.mount($('#morning'));
checkinView.mount($('#checkin'));
boostView.mount($('#boost'));
camera.mount($('#camera'));
napView.mount($('#nap'));
shareView.mount();
sleepView.mountPrompts();
applockView.mountBlocker();
tabs.mount($('nav.tabs'));
tabs.show('alarm');

document.addEventListener('pointerdown', () => audio.unlock(), { once: true });

// Returning from Spotify sign-in.
spotify.handleRedirect().then((res) => {
  if (!res) return;
  tabs.show('sounds');
  toast(res.ok ? 'Spotify connected. Now choose a playlist.' : res.reason, 5000);
});

battery.start();
morning.resume();
syncAwake();

const tick = () => emit('tick', { now: Date.now() });
setInterval(tick, 1000);
tick();

(async () => {
  await nativeSync.init();
  if (!profile.get().onboarded) { await onboarding.run(); tabs.show('alarm'); petView.greet({ afterSetup: true }); }
  else if (!morning.isActive()) petView.greet();
  petView.watchReturns();
})();
