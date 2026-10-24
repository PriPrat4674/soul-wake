// First-run setup: name → buddy PIN → logo → colour → theme → font → style → sleep → (app) permissions → done.
// Every choice applies instantly, so the setup screen restyles itself as you go.
import { esc, refs, toast, vibrateTap } from '../core/util.js';
import * as profile from '../features/profile.js';
import * as sleep from '../features/sleep.js';
import * as alarm from '../features/alarm.js';
import * as native from '../services/native.js';
import { picker, wirePickers } from './pickers.js';
import { stepperRow, wireSteppers } from './components.js';
import { petMarkup } from './pet-view.js';
import { logoSVG } from './art.js';
import { artColours } from './theme.js';
import { SLEEP_GOAL_LIMITS } from '../config.js';
import { goalNote } from './sleep-view.js';
import { pinSetup } from './guard-view.js';
import * as guard from '../features/guard.js';
import { wordmark } from './art.js';

const STEPS = ['name', 'pin', 'logo', 'accent', 'theme', 'font', 'style', 'sleep', ...(native.isNative() ? ['permissions'] : []), 'done'];

const TITLES = {
  logo: ['Pick your logo', 'You’ll tap it every night 🌙'],
  accent: ['Pick a colour', 'For buttons and the sunrise ☀️'],
  theme: ['Pick a theme', 'Cities come with live weather 🌦️'],
  font: ['Pick a font', 'How your clock looks ⏰'],
  style: ['Pick a style', 'Round, fine or bold?']
};

export function run() {
  return new Promise((resolve) => {
    let i = 0;
    const el = document.createElement('div');
    el.id = 'onboarding';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Set up SoulWake');
    document.body.appendChild(el);

    function nav(nextLabel = 'Next', { canSkip = false } = {}) {
      return `<div class="ob-nav">
        ${i > 0 ? '<button class="btn quiet" data-ob="back">Back</button>' : '<span></span>'}
        <div class="row">${canSkip ? '<button class="btn quiet" data-ob="skip">Skip</button>' : ''}<button class="btn gold" data-ob="next">${nextLabel}</button></div>
      </div>`;
    }
    const dots = () => `<div class="ob-dots" aria-label="Step ${i + 1} of ${STEPS.length}">${STEPS.map((_, k) => `<i class="${k === i ? 'on' : k < i ? 'past' : ''}"></i>`).join('')}</div>`;

    function render() {
      const step = STEPS[i];
      const p = profile.get();
      let body = '';
      if (step === 'name') {
        body = `
          <div class="ob-hero">${petMarkup('wave', 120)}</div>
          <p class="ob-brand">${wordmark()}</p>
          <h1>Hi! I’m ${esc(p.petName)} 🫧</h1>
          <p class="soft">I’ll get you up and keep you up. What’s your name?</p>
          <label class="field" style="margin-top:18px"><span>Your name</span><input type="text" data-ref="name" maxlength="24" autocomplete="given-name" value="${esc(p.name)}" placeholder="e.g. Priya"></label>
          ${nav('Next', { canSkip: true })}`;
      } else if (step === 'pin') {
        body = `<div data-ref="pinBox"></div>${nav(guard.hasPin() ? 'Next' : 'Skip for now', { canSkip: false })}`;
      } else if (TITLES[step]) {
        const [t, sub] = TITLES[step];
        body = `<h1>${t}</h1><p class="soft">${sub}</p><div class="ob-picker">${picker(step)}</div>

          ${nav()}`;
      } else if (step === 'sleep') {
        const sc = sleep.get().schedule;
        body = `<h1>Your sleep</h1><p class="soft">I’ll nudge you at bedtime 🌙</p>
          <div class="card" data-sleep>
            <label class="time-pick"><span class="label">I usually sleep at</span><span class="value small-time" data-ref="bedShow">${esc(sc.bed)}</span><input type="time" data-ref="bed" value="${sc.bed}"></label>
            <label class="time-pick" style="margin-top:8px"><span class="label">and wake at</span><span class="value small-time" data-ref="wakeShow">${esc(sc.wake)}</span><input type="time" data-ref="wake" value="${sc.wake}"></label>
            ${stepperRow({ key: 'goal', title: 'Sleep goal', value: sc.goal, min: SLEEP_GOAL_LIMITS[0], max: SLEEP_GOAL_LIMITS[1], step: 0.5, unit: ' h' })}
            <p class="small soft goal-note" data-ref="goalNote">${esc(goalNote(sc.goal))}</p>
          </div>
          ${nav()}`;
      } else if (step === 'permissions') {
        body = `<h1>Let me ring when I’m closed 🔔</h1><p class="soft">Tap each one. I’ll wait.</p>
          <div class="card" data-ref="perms"><p class="muted italic">Checking…</p></div>
          ${nav('Next', { canSkip: true })}`;
      } else if (step === 'done') {
        const c = artColours(p);
        body = `<div class="ob-hero">${petMarkup('ecstatic', 140)}</div>
          <h1>All set${p.name ? `, ${esc(p.name)}` : ''}! 🎉</h1>
          <p class="soft">Arm it tonight ☀️</p>
          <dl class="ob-summary"><div><dt>Wake-up</dt><dd>${esc(sleep.get().schedule.wake)}</dd></div><div><dt>Bedtime</dt><dd>${esc(sleep.get().schedule.bed)}</dd></div><div><dt>Buddy PIN</dt><dd>${guard.hasPin() ? 'Set 🔒' : 'Add later in ☰ → Night guard'}</dd></div></dl>
          <div class="ob-icon">${logoSVG(p.logo, c, { size: 76 })}<span class="small muted">Your icon</span></div>
          ${nav('Let’s go')}`;
      }
      el.innerHTML = `<div class="ob-inner">${dots()}<div class="ob-step" data-step="${step}">${body}</div></div>`;
      wire(step);
    }

    function wire(step) {
      const r = refs(el);
      if (r.name) { r.name.focus(); r.name.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(1); }); }
      if (TITLES[step]) wirePickers(el.querySelector('.ob-picker'), () => { if (step === 'theme' || step === 'accent') render(); });
      if (step === 'sleep') {
        const box = el.querySelector('[data-sleep]');
        r.bed.onchange = () => { const v = sleep.setSchedule({ bed: r.bed.value }); r.bedShow.textContent = v.bed; };
        r.wake.onchange = () => { const v = sleep.setSchedule({ wake: r.wake.value }); r.wakeShow.textContent = v.wake; };
        wireSteppers(box, (k, v) => { const g = sleep.setSchedule({ goal: v }).goal; r.goalNote.textContent = goalNote(g); return g; });
      }
      if (step === 'permissions') paintPerms(r.perms);
      if (step === 'pin') {
        if (guard.hasPin()) r.pinBox.innerHTML = '<div class="pin-setup"><h2>Buddy PIN set 🔒</h2><p class="soft">You can change it later in ☰ → Night guard.</p></div>';
        else pinSetup(r.pinBox, { canSkip: false }).then(() => {
          const next = el.querySelector('[data-ob="next"]');
          if (next) next.textContent = 'Next';
          setTimeout(() => { if (STEPS[i] === 'pin') go(1); }, 900);
        });
      }
      el.querySelector('[data-ob="back"]')?.addEventListener('click', () => go(-1));
      el.querySelector('[data-ob="skip"]')?.addEventListener('click', () => go(1, true));
      el.querySelector('[data-ob="next"]').addEventListener('click', () => go(1));
    }

    async function paintPerms(box) {
      const st = await native.status();
      const row = (ok, title, which) => `<div class="perm ${ok ? 'ok' : ''}"><span class="perm-dot">${ok ? '✓' : '!'}</span><span class="grow"><strong>${title}</strong></span>${ok ? '' : `<button class="btn line" data-perm="${which}">Allow</button>`}</div>`;
      box.innerHTML = [
        row(st.notifications, 'Nudge you', 'notifications'),
        row(st.exactAlarms, 'Ring on time', 'exactAlarm'),
        row(st.fullScreen, 'Wake your screen', 'fullScreen'),
        row(st.batteryUnrestricted, 'Stay awake overnight', 'battery')
      ].join('');
      box.onclick = async (e) => {
        const b = e.target.closest('[data-perm]');
        if (!b) return;
        if (b.dataset.perm === 'notifications') {
          const res = await native.requestNotifications();
          if (!res.granted) await native.openSettings('notifications');
        } else await native.openSettings(b.dataset.perm);
        setTimeout(() => paintPerms(box), 800);
      };
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && document.body.contains(box)) paintPerms(box); }, { once: true });
    }

    function go(dir, skipped = false) {
      const step = STEPS[i];
      if (step === 'name' && dir > 0) profile.set('name', skipped ? '' : refs(el).name.value);
      if (step === 'sleep' && dir > 0) alarm.setTime(sleep.get().schedule.wake);
      vibrateTap();
      if (step === 'done' && dir > 0) {
        profile.set('onboarded', true);
        el.classList.add('leaving');
        setTimeout(() => { el.remove(); resolve(); }, 300);
        return;
      }
      i = Math.max(0, Math.min(STEPS.length - 1, i + dir));
      render();
      el.scrollTo(0, 0);
    }

    render();
  });
}
