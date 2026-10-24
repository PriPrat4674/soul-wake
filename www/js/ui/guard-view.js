// Night guard screens: the disarm challenge (three sums, then your buddy's PIN), the 24-hour
// "forgot the PIN" countdown, the uninstall guard, and the PIN pad your friend types into.
import { on, emit } from '../core/events.js';
import { esc, refs, toast, vibrateTap, fmtTime, pad } from '../core/util.js';
import { GUARD, APP_NAME } from '../config.js';
import * as guard from '../features/guard.js';
import * as alarm from '../features/alarm.js';
import * as profile from '../features/profile.js';
import * as native from '../services/native.js';
import { petMarkup } from './pet-view.js';

const BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
const DEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M9 6h11v12H9l-6-6z"/><path d="M12 10l4 4M16 10l-4 4"/></svg>';
const SHIELD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z"/><path d="M9 12l2 2 4-4" stroke-linecap="round"/></svg>';

// A number pad. `left` is the bottom-left key: 'clear' (C) or nothing.
export function keypad({ left = 'clear' } = {}) {
  const k = (v, label = v, aria = v) => `<button type="button" class="key" data-key="${v}" aria-label="${aria}">${label}</button>`;
  return `<div class="keypad" role="group" aria-label="Number pad">
    ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => k(String(n))).join('')}
    ${left === 'clear' ? k('clear', 'C', 'Clear') : '<span></span>'}${k('0')}${k('del', DEL, 'Delete')}
  </div>`;
}

// Wires a keypad inside root. onKey(value) gets '0'–'9', 'del' or 'clear'. Also listens to the keyboard.
function wireKeys(root, onKey, onEnter = () => {}) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-key]');
    if (!b) return;
    vibrateTap();
    onKey(b.dataset.key);
  });
  const kb = (e) => {
    if (!document.body.contains(root)) { document.removeEventListener('keydown', kb); return; }
    if (/^\d$/.test(e.key)) onKey(e.key);
    else if (e.key === 'Backspace') onKey('del');
    else if (e.key === 'Enter') onEnter();
    else return;
    e.preventDefault();
  };
  document.addEventListener('keydown', kb);
  return () => document.removeEventListener('keydown', kb);
}

const shake = (el) => { el?.classList.remove('shake'); void el?.offsetWidth; el?.classList.add('shake'); };
const dots = (n, filled) => `<div class="pin-dots" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i class="${i < filled ? 'on' : ''}"></i>`).join('')}</div>`;
const hms = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };

const TITLES = {
  disarm: 'Night disarm',
  time: 'Move the alarm?',
  erase: 'Erase everything?',
  off: 'Turn off the night guard?',
  uninstall: 'Not tonight 🌙'
};

let open = null;
export const isOpen = () => !!open;

/**
 * Runs the challenge. Resolves true once you've solved the sums and the buddy PIN (or the
 * 24-hour wait is over), false if you back out. reason: disarm | time | erase | off | uninstall.
 */
export function challenge({ reason = 'disarm' } = {}) {
  if (open) return open.promise;
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  const el = document.createElement('div');
  el.id = 'guard';
  el.className = 'guard-screen';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', TITLES[reason] || 'Night guard');
  document.body.appendChild(el);
  open = { promise, el };

  const name = profile.get().name;
  const sums = guard.makeSums(Date.now() ^ 0x5eed, new Date().getHours());
  let step = reason === 'uninstall' ? 'intro' : 'sums';
  let solved = 0, typed = '', pin = '', stopKeys = null, timer = null;
  const steps = () => (guard.hasPin() ? 2 : 1);

  const finish = (ok) => {
    clearInterval(timer);
    stopKeys?.();
    el.remove();
    open = null;
    resolve(ok);
  };

  function head(sub = '') {
    return `<header class="g-head"><button class="icon-btn" data-act="cancel" aria-label="Back">${BACK}</button>
      <div class="g-title"><strong>${esc(TITLES[reason] || 'Night guard')}</strong>${sub ? `<span>${esc(sub)}</span>` : ''}</div><span class="g-shield" aria-hidden="true">${SHIELD}</span></header>`;
  }

  function render() {
    clearInterval(timer);
    stopKeys?.();
    stopKeys = null;
    if (step === 'intro') {
      el.innerHTML = `<div class="g-inner">
        <div class="g-badge">${SHIELD}<span>Night guard</span></div>
        <div class="g-pip">${petMarkup('sulking', 112)}</div>
        <h1>Not tonight 🌙<br>${esc(APP_NAME)} is guarding your sleep</h1>
        <p class="soft center-text">Uninstalling or force-stopping ${esc(APP_NAME)} in your guarded hours takes the full check.</p>
        <ol class="g-steps"><li><b>Step 1</b> ${GUARD.sums} quick sums</li><li><b>Step 2</b> ${guard.hasPin() ? 'Your buddy’s PIN' : 'No buddy PIN set, so sums only'}</li></ol>
        <div class="g-actions"><button class="btn gold block" data-act="keep">Never mind, keep guarding my sleep</button>
        <button class="btn line block" data-act="go">Continue</button></div></div>`;
    } else if (step === 'sums') {
      const q = sums[solved];
      el.innerHTML = `${head(`Step 1 of ${steps()}`)}<div class="g-inner">
        <div class="g-watch">${petMarkup('grumpy', 64)}<p><b>Pip is watching</b><span>“Prove your brain is awake, not half-asleep.”</span></p></div>
        <div class="g-q card"><div class="g-q-top"><span>Solve and enter</span><span class="g-count" data-ref="count">${solved + 1} of ${sums.length}</span></div>
          <div class="g-sum" data-ref="sum">${esc(q.text)} = ?</div>
          <output class="g-answer" data-ref="answer" aria-live="polite" aria-label="Your answer">${esc(typed) || '<span class="muted">?</span>'}</output></div>
        ${keypad()}
        <button class="btn gold block" data-act="check">Check</button>
        ${guard.hasPin() ? '<button class="btn quiet" data-act="forgot">Forgot the PIN? Disarm in 24 hours</button>' : '<p class="small muted center-text">No buddy PIN yet. Add one in ☰ → Night guard.</p>'}</div>`;
      stopKeys = wireKeys(el.querySelector('.keypad'), (k) => {
        if (k === 'del') typed = typed.slice(0, -1);
        else if (k === 'clear') typed = '';
        else if (typed.length < 5) typed += k;
        refs(el).answer.innerHTML = esc(typed) || '<span class="muted">?</span>';
      }, checkSum);
    } else if (step === 'pin') {
      const left = guard.forgotLeft();
      el.innerHTML = `${head(`Step 2 of 2`)}<div class="g-inner center">
        <div class="g-pip">${petMarkup('neutral', 88)}</div>
        <h2>Buddy PIN</h2>
        <p class="soft center-text">Hand your phone to your buddy.</p>
        <div data-ref="dots">${dots(GUARD.pinLength, pin.length)}</div>
        <p class="small g-msg" data-ref="msg" aria-live="assertive"></p>
        ${keypad({ left: 'none' })}
        <button class="btn quiet" data-act="forgot">${left ? `Waiting: ${hms(left)} left` : 'Forgot the PIN? Disarm in 24 hours'}</button></div>`;
      const paint = () => { refs(el).dots.innerHTML = dots(GUARD.pinLength, pin.length); };
      stopKeys = wireKeys(el.querySelector('.keypad'), async (k) => {
        if (k === 'del') pin = pin.slice(0, -1);
        else if (k !== 'clear' && pin.length < GUARD.pinLength) pin += k;
        paint();
        if (pin.length === GUARD.pinLength) await checkPin();
      });
      const p = guard.pausedFor();
      if (p) showPause();
    } else if (step === 'forgot') {
      const left = guard.forgotLeft();
      const next = alarm.status().armedAt;
      if (left === null) {
        el.innerHTML = `${head('Forgot the PIN?')}<div class="g-inner center">
          <div class="g-pip">${petMarkup('sleepy', 96)}</div>
          <h2>A 24-hour wait</h2>
          <p class="soft center-text">No PIN? Start a 24-hour wait. Your alarm still rings as normal. After the wait, you can disarm without the PIN, and your buddy can set a new one.</p>
          <div class="g-actions"><button class="btn gold block" data-act="startWait">Start the 24-hour wait</button><button class="btn line block" data-act="toPin">Back</button></div></div>`;
      } else {
        el.innerHTML = `${head('Cooling-off window')}<div class="g-inner center">
          <div class="g-ring" style="--p:${(1 - left / GUARD.forgotWaitMs).toFixed(3)}"><span class="g-ring-time num" data-ref="left">${hms(left)}</span><small>until you can disarm</small></div>
          <h2>24-hour wait running</h2>
          <p class="soft center-text">Your alarm still rings as normal. If you really need to cancel it without your buddy, come back when this runs out.</p>
          <dl class="g-rows">
            ${next ? `<div><dt>Next alarm</dt><dd>${esc(fmtTime(new Date(next)))}</dd></div>` : ''}
            <div><dt>Wait started</dt><dd>${esc(new Date(guard.state().forgotAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }))}</dd></div>
            <div><dt>Unlocks</dt><dd>${esc(new Date(guard.state().forgotAt + GUARD.forgotWaitMs).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }))}</dd></div>
          </dl>
          <div class="g-actions"><button class="btn gold block" data-act="keep">Keep my alarm set</button><button class="btn line block" data-act="cancelWait">Cancel the wait</button>
          ${guard.hasPin() ? '<button class="btn quiet" data-act="toPin">My buddy is here: enter the PIN</button>' : ''}</div></div>`;
        timer = setInterval(() => {
          const l = guard.forgotLeft();
          if (l === 0) { step = 'released'; render(); return; }
          const out = refs(el).left;
          if (out) out.textContent = hms(l);
        }, 1000);
      }
    } else if (step === 'released') {
      el.innerHTML = `${head('Wait over')}<div class="g-inner center">
        <div class="g-pip">${petMarkup('neutral', 96)}</div>
        <h2>Your 24-hour wait is over</h2>
        <p class="soft center-text">You can go ahead without the PIN. Ask your buddy to set a new one afterwards (☰ → Night guard).</p>
        <div class="g-actions"><button class="btn gold block" data-act="release">Continue without the PIN</button><button class="btn line block" data-act="keep">Keep my alarm set</button></div></div>`;
    } else if (step === 'pass') {
      el.innerHTML = `<div class="g-inner center">
        <div class="g-badge ok">${SHIELD}<span>Identity & buddy verified</span></div>
        <div class="g-pip">${petMarkup('neutral', 96)}</div>
        <h2>You have 5 minutes</h2>
        <p class="soft center-text">The uninstall and force-stop guard is paused until ${esc(fmtTime(new Date(Date.now() + guard.passLeft())))}. After that it switches back on by itself.</p>
        <div class="g-actions"><button class="btn gold block" data-act="settings">Open App info (5 min window)</button><button class="btn line block" data-act="keep">Never mind, keep guarding my sleep</button></div></div>`;
    }
    el.querySelector('[data-act="cancel"]')?.focus();
  }

  function checkSum() {
    if (!typed) { shake(el.querySelector('.g-answer')); return; }
    const q = sums[solved];
    if (Number(typed) === q.answer) {
      solved++;
      typed = '';
      vibrateTap(20);
      if (solved < sums.length) { render(); return; }
      afterSums();
    } else {
      typed = '';
      shake(el.querySelector('.g-q'));
      toast('Not quite. Try this one again.');
      refs(el).answer.innerHTML = '<span class="muted">?</span>';
    }
  }

  function afterSums() {
    if (!guard.hasPin()) return done();
    if (guard.forgotLeft() === 0) { step = 'released'; return render(); }
    step = 'pin';
    render();
  }

  function showPause() {
    const msg = refs(el).msg;
    const tick = () => {
      const p = guard.pausedFor();
      if (!document.body.contains(el) || step !== 'pin') { clearInterval(timer); return; }
      if (!p) { msg.textContent = ''; el.querySelector('.keypad')?.classList.remove('disabled'); clearInterval(timer); return; }
      msg.textContent = `Too many tries. Wait ${Math.ceil(p / 1000)} s.`;
      el.querySelector('.keypad')?.classList.add('disabled');
    };
    clearInterval(timer);
    timer = setInterval(tick, 500);
    tick();
  }

  async function checkPin() {
    const res = await guard.checkPin(pin);
    pin = '';
    if (res === 'ok' || res === 'none') return done();
    const box = refs(el);
    box.dots.innerHTML = dots(GUARD.pinLength, 0);
    shake(box.dots);
    if (res === 'paused') showPause();
    else box.msg.textContent = 'That’s not the PIN.';
  }

  function done() {
    if (reason === 'uninstall') {
      guard.grantPass();
      step = 'pass';
      render();
      return;
    }
    toast(name ? `Okay, ${name}. Unlocked.` : 'Okay. Unlocked.');
    finish(true);
  }

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    vibrateTap();
    const act = b.dataset.act;
    if (act === 'cancel' || act === 'keep') {
      if (step === 'pass') guard.grantPass(Date.now(), 0); // "never mind": guard right back on
      return finish(false);
    }
    if (act === 'go') { step = 'sums'; render(); }
    if (act === 'check') checkSum();
    if (act === 'forgot') { step = 'forgot'; render(); }
    if (act === 'toPin') { step = solved >= sums.length ? 'pin' : 'sums'; render(); }
    if (act === 'startWait') { guard.startForgot(); render(); }
    if (act === 'cancelWait') { guard.cancelForgot(); step = solved >= sums.length ? 'pin' : 'sums'; render(); }
    if (act === 'release') {
      if (!guard.useForgot()) { step = 'forgot'; return render(); }
      toast('PIN cleared. Ask your buddy to set a new one.', 4000);
      done();
    }
    if (act === 'settings') { native.openSettings('app'); finish(true); }
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') finish(false); });
  render();
  return promise;
}

/**
 * Runs `action` only if it's allowed: straight away outside the guarded hours,
 * otherwise after the challenge. Returns whether it ran.
 */
export async function guarded(reason, action) {
  if (!guard.isGuarded()) { await action(); return true; }
  const ok = await challenge({ reason });
  if (ok) await action();
  return ok;
}

/* ---------------- setting the PIN ---------------- */

/**
 * The PIN pad your buddy types into: once, then again to confirm. Renders into `box`.
 * Resolves 'set' when saved, or 'skip' if `canSkip` and they tap Skip.
 */
export function pinSetup(box, { canSkip = false, intro = true } = {}) {
  return new Promise((resolve) => {
    let first = '', entry = '', confirming = false;
    let stop = null;
    function render(msg = '') {
      stop?.();
      box.innerHTML = `<div class="pin-setup">
        ${intro ? `<div class="g-badge">${SHIELD}<span>Accountability lock</span></div>` : ''}
        <h2>${confirming ? 'Once more to confirm' : 'Hand your phone to a friend'}</h2>
        <p class="soft">${confirming ? 'Your buddy types the same 4 digits again.' : `They pick a ${GUARD.pinLength}-digit PIN. You’ll need them (or a 24-hour wait) to disarm at night.`}</p>
        <div data-ref="dots">${dots(GUARD.pinLength, entry.length)}</div>
        <p class="small g-msg" data-ref="msg" aria-live="assertive">${esc(msg)}</p>
        ${keypad({ left: 'none' })}
        <p class="small muted">It’s never shown, and only a scrambled version is saved.</p>
        ${canSkip ? '<button class="btn quiet" data-pin-skip>Skip for now</button>' : ''}
      </div>`;
      stop = wireKeys(box.querySelector('.keypad'), async (k) => {
        if (k === 'del') entry = entry.slice(0, -1);
        else if (k !== 'clear' && entry.length < GUARD.pinLength) entry += k;
        box.querySelector('[data-ref="dots"]').innerHTML = dots(GUARD.pinLength, entry.length);
        if (entry.length < GUARD.pinLength) return;
        if (!confirming) { first = entry; entry = ''; confirming = true; setTimeout(() => render(), 150); return; }
        if (entry !== first) { first = ''; entry = ''; confirming = false; render('Those didn’t match. Start again.'); shake(box.querySelector('.pin-dots')); return; }
        await guard.setPin(entry);
        stop?.();
        box.innerHTML = `<div class="pin-setup"><div class="g-badge ok">${SHIELD}<span>Buddy PIN set</span></div><h2>Locked in 🔒</h2><p class="soft">Hand the phone back. Thanks, buddy!</p></div>`;
        resolve('set');
      });
      box.querySelector('[data-pin-skip]')?.addEventListener('click', () => { stop?.(); resolve('skip'); });
    }
    render();
  });
}

/** Asks for the current PIN (for changing or removing it). Resolves 'ok', 'cancel' or 'forgot'. */
export function askPin({ title = 'Enter the buddy PIN' } = {}) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'sheet-backdrop';
    back.innerHTML = `<div class="sheet pin-sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <h2>${esc(title)}</h2><p class="soft">Your buddy types it in.</p>
      <div data-ref="dots">${dots(GUARD.pinLength, 0)}</div><p class="small g-msg" data-ref="msg" aria-live="assertive"></p>
      ${keypad({ left: 'none' })}
      <div class="actions"><button class="btn quiet" data-forgot>Forgot it?</button><button class="btn line block" data-cancel>Cancel</button></div></div>`;
    let entry = '';
    const close = (v) => { stop(); back.remove(); resolve(v); };
    const stop = wireKeys(back.querySelector('.keypad'), async (k) => {
      if (k === 'del') entry = entry.slice(0, -1);
      else if (k !== 'clear' && entry.length < GUARD.pinLength) entry += k;
      const d = back.querySelector('[data-ref="dots"]');
      d.innerHTML = dots(GUARD.pinLength, entry.length);
      if (entry.length < GUARD.pinLength) return;
      const res = await guard.checkPin(entry);
      entry = '';
      if (res === 'ok' || res === 'none') return close('ok');
      d.innerHTML = dots(GUARD.pinLength, 0);
      shake(d);
      back.querySelector('[data-ref="msg"]').textContent = res === 'paused' ? `Too many tries. Wait ${Math.ceil(guard.pausedFor() / 1000)} s.` : 'That’s not the PIN.';
    });
    back.addEventListener('click', (e) => {
      if (e.target === back || e.target.closest('[data-cancel]')) close('cancel');
      if (e.target.closest('[data-forgot]')) close('forgot');
    });
    document.body.appendChild(back);
  });
}

/** Full-screen PIN setup from the menu. Resolves true once a PIN is saved. */
export function setupScreen() {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'guard-screen';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Set a buddy PIN');
    el.innerHTML = `<header class="g-head"><button class="icon-btn" data-close aria-label="Back">${BACK}</button><div class="g-title"><strong>Buddy PIN</strong><span>Setup</span></div><span></span></header><div class="g-inner" data-box></div>`;
    document.body.appendChild(el);
    const close = (v) => { el.remove(); resolve(v); };
    el.querySelector('[data-close]').onclick = () => close(guard.hasPin());
    pinSetup(el.querySelector('[data-box]')).then(() => setTimeout(() => close(true), 1200));
  });
}

// Android: SoulWake was opened because someone tried to uninstall or force-stop it at night.
on('guard:uninstallAttempt', () => { if (!open) challenge({ reason: 'uninstall' }); });
on('guard:pinReleased', () => emit('guard:changed', guard.state()));
