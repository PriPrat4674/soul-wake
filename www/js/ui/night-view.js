// Night screen: pure black while the alarm is armed. A dim clock drifts once a minute
// (so no pixel stays lit in one spot), and it only redraws once a minute to save power.
import { on, emit } from '../core/events.js';
import { refs, fmtTime } from '../core/util.js';
import * as alarm from '../features/alarm.js';
import * as morning from '../features/morning.js';
import * as battery from '../services/battery.js';
import { sheet } from './components.js';
import { guarded } from './guard-view.js';
import { APP_NAME } from '../config.js';
import * as native from '../services/native.js';

let root, r, dismissed = false, wasArmed = false, lastMinute = -1, awakeTimer = null;

export function mount(el) {
  root = el;
  root.innerHTML = `
    <div class="night-clock" data-ref="clock"></div>
    <div class="night-meta" data-ref="meta"></div>
    <div class="night-controls">
      <button class="btn line block" data-ref="back">Back to the app</button>
      <button class="btn quiet" data-ref="disarm" style="align-self:center">Disarm alarm</button>
      <p class="tip">Still armed 🌙</p>
    </div>`;
  r = refs(root);
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Night screen');

  root.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    wake();
  });
  r.back.onclick = () => { dismissed = true; sync(); };
  // In your guarded hours this takes the night-guard check (sums + buddy PIN) first.
  r.disarm.onclick = () => guarded('disarm', () => alarm.disarm());

  wasArmed = alarm.status().armed;
  on('alarm:changed', (a) => {
    if (a.armed && !wasArmed) dismissed = false;
    wasArmed = a.armed;
    sync();
  });
  on('morning:changed', sync);
  on('night:open', () => { dismissed = false; sync(); });
  on('battery:changed', () => { if (isShown()) paint(true); });
  on('guard:tripped', ({ level }) => {
    sync();
    sheet({
      title: 'Alarm switched off',
      body: `Your battery reached ${level}% without a charger, so ${APP_NAME} turned the alarm off and let the screen sleep. Set a backup alarm on your phone’s clock app.`,
      actions: [{ label: 'Understood', value: true, style: 'gold' }]
    });
  });
  on('tick', ({ now }) => { if (isShown()) { const m = Math.floor(now / 60000); if (m !== lastMinute) { lastMinute = m; paint(true); } } });
  sync();
}

const isShown = () => !root.classList.contains('hidden');

function sync() {
  const a = alarm.status();
  // The Android app rings with the screen off, so it never needs the night screen.
  const show = !native.isNative() && a.armed && !morning.isActive() && !dismissed;
  const was = isShown();
  root.classList.toggle('hidden', !show);
  if (show && !was) { lastMinute = -1; paint(true); wake(); }
  if (show !== was) emit('night:changed', { shown: show });
}

function wake() {
  root.classList.add('awake');
  clearTimeout(awakeTimer);
  awakeTimer = setTimeout(() => root.classList.remove('awake'), 8000);
}

function paint(move) {
  const a = alarm.status();
  const b = battery.get();
  r.clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: false });
  const rings = a.armedAt ? `Rings ${fmtTime(new Date(a.armedAt))}` : 'Armed';
  const batt = b.supported ? `${b.level}%${b.charging ? ', charging' : ''}` : 'plug in to be safe';
  r.meta.textContent = `${rings} · ${batt}`;
  if (move) {
    const top = 12 + Math.random() * 50;
    const left = 6 + Math.random() * 30;
    r.clock.style.top = `${top}%`;
    r.clock.style.left = `${left}%`;
    r.meta.style.top = `calc(${top}% + 5.4rem)`;
    r.meta.style.left = `calc(${left}% + 4px)`;
  }
}
