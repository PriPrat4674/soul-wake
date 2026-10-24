// The full-screen morning: ringing, snoozed, task chain, report card. Each screen is its own function.
import { on } from '../core/events.js';
import { esc, refs, fmtTime, fmtDur, plural, vibrateTap } from '../core/util.js';
import { APP_NAME } from '../config.js';
import * as morning from '../features/morning.js';
import * as checkin from '../features/checkin.js';
import * as snooze from '../features/snooze.js';
import * as stats from '../features/stats.js';
import { grade } from '../features/report.js';
import * as audio from '../services/audio.js';
import * as camera from './camera.js';
import { sunburst, setSunburst } from './components.js';
import { petMarkup } from './pet-view.js';
import { wordmark } from './art.js';
import { doneMessage, greeting } from '../features/messages.js';
import * as profile from '../features/profile.js';
import * as applock from '../features/applock.js';
import * as native from '../services/native.js';
import { notify } from '../services/notify.js';
import * as sounds from '../features/sounds.js';
import { toast } from '../core/util.js';
import { emit } from '../core/events.js';

let root, r;
// You can step away from the task list (or a snooze) and use the app; a pill in the top bar
// counts down and brings you back. The ringing alarm itself can't be left.
let minimized = false, lastGate = null, taskNotice = null;

export function mount(el) {
  root = el;
  root.className = 'hidden';
  root.innerHTML = `
    <div class="m-top"><button class="m-leave hidden" data-ref="leave">← Use the app</button><span data-ref="brand" aria-label="${APP_NAME}">${wordmark()}</span><span data-ref="clock"></span></div>
    <div class="m-body" data-ref="body"></div>
    <div class="m-burst" data-ref="burst">${sunburst({ lit: 0, label: 'Your sunrise' })}</div>`;
  r = refs(root);
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Morning');

  r.leave.onclick = () => { minimized = true; render(); toast('I’ll keep time up here ⏳'); };
  on('morning:changed', render);
  on('morning:ringing', () => { minimized = false; });
  on('checkin:scheduled', () => { if (morning.get()?.phase === 'tasks') render(); });
  on('checkin:passed', () => { if (morning.get()?.phase === 'tasks') render(); });
  on('tick', ({ now }) => {
    updatePill(now);
    if (root.classList.contains('hidden')) return;
    r.clock.textContent = fmtTime(new Date(now));
    const ring = r.body.querySelector('[data-ring-clock]');
    if (ring) ring.textContent = fmtTime(new Date(now));
    const left = r.body.querySelector('[data-snooze-left]');
    if (left) left.textContent = fmtDur((morning.get()?.snoozeUntil || now) - now);
    updateGate(false);
  });
}

function setSky(lit, risen = false) {
  root.style.setProperty('--dawn', lit);
  setSunburst(r.burst.querySelector('svg'), lit, risen);
}

function render() {
  const m = morning.get();
  scheduleTaskNotice(m);
  if (!m || m.phase === 'closed') { minimized = false; root.classList.add('hidden'); emit('pill:clear', { key: 'morning' }); return; }
  if (m.phase === 'ringing' || m.phase === 'done') minimized = false;
  const canLeave = m.phase === 'tasks' || m.phase === 'snoozed';
  r.leave.classList.toggle('hidden', !canLeave);
  r.brand.classList.toggle('hidden', canLeave);
  root.classList.toggle('hidden', minimized);
  updatePill(Date.now());
  if (minimized) return;
  r.clock.textContent = fmtTime(new Date());
  ({ ringing: ringingScreen, snoozed: snoozedScreen, tasks: tasksScreen, done: doneScreen })[m.phase]?.(m);
}

const reopen = () => { minimized = false; render(); };

function updatePill(now) {
  const m = morning.get();
  if (!minimized || !m) { emit('pill:clear', { key: 'morning' }); return; }
  if (m.phase === 'snoozed') { emit('pill:set', { key: 'morning', text: `😴 Rings in ${fmtDur((m.snoozeUntil || now) - now)}`, onClick: reopen }); return; }
  const task = morning.currentTask();
  if (m.phase !== 'tasks' || !task) { emit('pill:clear', { key: 'morning' }); return; }
  const wait = morning.currentUnlocksAt() - now;
  const ready = wait <= 0;
  emit('pill:set', { key: 'morning', text: ready ? `📸 ${task.name}` : `⏳ ${task.name} · ${fmtDur(wait)}`, tone: ready ? 'ready' : '', onClick: reopen });
  // The wait just ended while you were away: tell you (the app also gets an Android notification).
  const gate = `${task.id}:${ready}`;
  if (ready && lastGate && lastGate === `${task.id}:false`) {
    toast(`${task.name}: time to prove it 📸`, 5000);
    if (!native.isNative()) { sounds.preview(sounds.get().message); notify(`${task.name} ⏰`, 'Time to take your proof photo.'); }
  }
  lastGate = gate;
}

// Android: a notification for when a task's wait is over, so it reaches you even with the app closed.
function scheduleTaskNotice(m) {
  if (!native.isNative()) return;
  const task = m?.phase === 'tasks' ? morning.currentTask() : null;
  const at = task ? morning.currentUnlocksAt() : 0;
  const key = task && at > Date.now() + 5000 ? `${task.id}:${at}` : null;
  if (key === taskNotice) return;
  taskNotice = key;
  if (key) native.schedule('task', at, 'task', false, { title: `${task.name} ⏰`, text: 'Time to take your proof photo 📸' });
  else native.cancel('task');
}

/* ---------- Ringing ---------- */
function ringingScreen(m) {
  setSky(0);
  const target = morning.phrase();
  const sn = snooze.state();
  r.body.innerHTML = `
    ${audio.isUnlocked() ? '' : '<button class="btn ox block" data-ref="tap" style="margin-top:12px">Tap to start the alarm sound</button>'}
    <div class="ring-time shake" data-ring-clock>${fmtTime(new Date())}</div>
    <p class="ring-sub">${m.escalated ? 'Missed your check-in. Round two 😤' : m.rings > 1 ? 'Snooze is over. Up you get ☀️' : m.test ? 'Test alarm ⏰ Type it to stop me.' : `${esc(greeting(profile.get().name, new Date().getHours()))}`}</p>
    <div class="phrase-box">
      <p class="small soft italic">Type this to stop me</p>
      <p class="phrase" data-ref="phrase" aria-label="${esc(target)}">${[...target].map((c) => `<span class="ch">${esc(c)}</span>`).join('')}</p>
      <input class="phrase-input" type="text" data-ref="input" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Start typing…" aria-label="Type the phrase to stop the alarm">
      <button class="btn gold block" data-ref="stop" style="margin-top:12px">Stop alarm</button>
      ${morning.canSnooze() ? `<button class="btn quiet snooze-line" data-ref="snooze">Snooze ${snooze.settings().minutes} min · ${sn.left} left</button>` : ''}
    </div>`;
  const b = refs(r.body);
  const chars = [...b.phrase.querySelectorAll('.ch')];
  const paint = () => {
    const typed = b.input.value;
    chars.forEach((span, i) => {
      span.className = 'ch' + (i < typed.length ? (typed[i].toLowerCase() === target[i].toLowerCase() ? ' ok' : ' bad') : i === typed.length ? ' next' : '');
    });
  };
  const tryStop = () => {
    if (morning.dismiss(b.input.value)) { vibrateTap(40); return; }
    b.input.classList.remove('shake'); void b.input.offsetWidth; b.input.classList.add('shake');
    b.input.placeholder = b.input.value ? 'Not quite. Try again.' : 'Type the phrase first.';
    b.input.value = '';
    paint();
    audio.beep(220, 0.3);
  };
  paint();
  b.input.addEventListener('input', paint);
  b.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryStop(); });
  b.input.addEventListener('paste', (e) => e.preventDefault());
  b.input.addEventListener('drop', (e) => e.preventDefault());
  b.stop.onclick = tryStop;
  if (b.snooze) b.snooze.onclick = () => morning.snooze();
  if (b.tap) b.tap.onclick = () => { audio.unlock(); b.tap.remove(); morning.replaySound(); };
}

/* ---------- Snoozed ---------- */
function snoozedScreen(m) {
  setSky(0);
  r.body.innerHTML = `
    <div class="m-pip" aria-hidden="true">${petMarkup('grumpy', 84)}</div>
    <div class="big-head">Snoozed.</div>
    <p class="ring-sub">Ringing again in</p>
    <div class="countdown" data-snooze-left>${fmtDur((m.snoozeUntil || Date.now()) - Date.now())}</div>
    <p class="soft" style="margin-top:14px">Hall of Shame. Forever 😤</p>
    <button class="btn gold block" data-ref="up" style="margin-top:auto">I’m up. Ring now</button>`;
  refs(r.body).up.onclick = () => snooze.endNow();
}

/* ---------- Tasks ---------- */
function tasksScreen(m) {
  const done = m.completed.length, total = m.tasks.length;
  setSky(total ? 0.12 + 0.6 * (done / total) : 0.7);
  const c = checkin.state();
  r.body.innerHTML = `
    <div class="m-head"><h2 style="font-size:2.2rem">Prove you’re up</h2><span class="m-pip" aria-hidden="true">${petMarkup(m.snoozes || m.misses ? 'grumpy' : 'happy', 64)}</span></div>
    <p class="ring-sub">${done} of ${total} done ☀️${m.full ? ' · test, 10× speed' : ''}</p>
    ${!c.passed && c.dueAt ? `<p class="small muted italic" style="margin-top:6px">Check-in at ${fmtTime(new Date(c.dueAt))} 👀</p>` : ''}
    <ol class="chain">${m.tasks.map((t, i) => {
      const state = i < done ? 'done' : i === done ? 'current' : 'later';
      const meta = i === done
        ? `<div class="t-meta">📸 ${esc(t.proof)}</div><div data-gate></div>`
        : i > done && t.gapMin ? `<div class="t-meta">${t.gapMin} min wait</div>` : '';
      return `<li class="${state}"><span class="dot">${i < done ? '✓' : i + 1}</span><div style="flex:1"><div class="t-name">${esc(t.name)}${t.chaos ? '<span class="tag">chaos</span>' : ''}</div>${meta}</div></li>`;
    }).join('')}</ol>
    <div style="height:38vh"></div>`;
  updateGate(true);
}

// The current task's button: a countdown while it's locked, then "Take proof photo".
function updateGate(force) {
  const gate = r.body.querySelector('[data-gate]');
  const task = morning.currentTask();
  if (!gate || !task) return;
  const wait = morning.currentUnlocksAt() - Date.now();
  const state = wait > 0 ? 'wait' : 'open';
  if (!force && state === 'open' && gate.dataset.state === 'open') return;
  gate.dataset.state = state;
  if (state === 'wait') {
    gate.innerHTML = `<button class="btn line" disabled>Unlocks in ${fmtDur(wait)}</button>`;
    return;
  }
  gate.innerHTML = '<button class="btn gold">Take proof photo</button>';
  gate.firstChild.onclick = async () => {
    if (await camera.takeProof(task)) { vibrateTap(30); morning.completeTask(task.id); }
  };
}

/* ---------- Done ---------- */
function doneScreen(m) {
  setSky(1, true);
  if (m.test && !m.full) {
    r.body.innerHTML = `
      <div class="done-pet">${petMarkup('ecstatic', 110)}<span class="stamp" aria-hidden="true">✅</span></div>
      <div class="big-head" style="margin-top:2vh">It works!</div>
      <p class="ring-sub">See you in the morning ☀️</p>
      <div style="margin-top:auto">
        <button class="btn gold block" data-ref="close">Close</button>
        <button class="btn quiet block" data-ref="full" style="margin-top:6px">Try the full morning (10× speed)</button>
      </div>`;
    const b = refs(r.body);
    b.close.onclick = () => morning.close();
    b.full.onclick = () => { morning.close(); morning.startFullTest(); };
    return;
  }
  const g = grade(m);
  const streak = stats.currentStreak();
  r.body.innerHTML = `
    <div class="done-pet">${petMarkup(g.letter.startsWith('A') ? 'ecstatic' : g.letter.startsWith('B') ? 'happy' : 'grumpy', 110)}<span class="stamp" aria-hidden="true">${g.letter.startsWith('A') ? '⭐' : g.letter.startsWith('B') ? '👏' : '💪'}</span></div>
    <div class="big-head" style="margin-top:2vh">Morning proven.</div>
    <p class="ring-sub">${esc(doneMessage(g.letter, profile.get().name))}</p>
    <p class="small soft" style="margin-top:6px">${m.test ? 'A test run, so it doesn’t count toward your streak.' : `Streak: ${plural(streak, 'morning')} 🔥`}${!m.test && native.isNative() && applock.get().enabled ? ' · Your apps are unlocked 🔓' : ''}</p>
    <div class="cert" aria-label="Report card">
      <div class="cert-inner">
        <div class="grade">${esc(g.letter)}</div>
        <div class="line">${esc(g.line)}</div>
        <div class="facts">${plural(g.mins, 'minute')} · ${plural(g.snoozes, 'snooze')} · ${plural(g.misses, 'missed check-in')}</div>
      </div>
    </div>
    <button class="btn gold block" data-ref="close" style="margin-top:auto">Close</button>`;
  refs(r.body).close.onclick = () => morning.close();
}
