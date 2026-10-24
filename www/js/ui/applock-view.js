// App lock: the settings panel (choose apps, permission) and the "locked" screen with emergency unlock.
import { on } from '../core/events.js';
import { esc, refs, toast, fmtTime } from '../core/util.js';
import * as applock from '../features/applock.js';
import * as native from '../services/native.js';
import { switchRow, stepperRow, wireSteppers, sheet, info } from './components.js';

export function mountPanel(el) {
  if (!native.isNative()) {
    el.innerHTML = '<p class="soft">Keeps Instagram closed till your tasks are done. In the Android app 📱</p>';
    return;
  }
  let apps = null, filter = '';
  async function render() {
    const c = applock.get();
    const st = await native.status();
    el.innerHTML = `
      ${switchRow({ key: 'lock', title: 'Lock apps till my tasks are done', checked: c.enabled })}
      ${stepperRow({ key: 'maxHours', title: 'Unlock anyway after', value: c.maxHours, min: 1, max: 6, unit: ' h' })}
      <p class="small muted">Phone, messages and settings never lock ${info('App lock', 'Chosen apps stay closed from when the alarm rings until your morning is proven. SoulWake only sees which app opens, never what’s on screen.')}</p>
      <div class="perm ${st.accessibility ? 'ok' : ''}" style="margin-top:8px"><span class="perm-dot">${st.accessibility ? '✓' : '!'}</span>
        <span class="grow"><strong>Accessibility</strong><small>${st.accessibility ? 'On ✓' : 'Greyed out? App info → ⋮ → Allow restricted settings'}</small></span>
        ${st.accessibility ? '' : '<button class="btn line" data-ref="perm">Turn on</button>'}</div>
      ${st.accessibility ? '' : '<button class="btn quiet" data-ref="appinfo">Open App info</button>'}
      <div class="row between" style="margin-top:14px"><strong>Apps to lock (${c.packages.length})</strong><button class="btn quiet" data-ref="load">${apps ? 'Refresh' : 'Choose apps'}</button></div>
      ${apps ? `<label class="field"><span class="sr-only">Search apps</span><input type="text" data-ref="q" placeholder="Search apps" value="${esc(filter)}"></label>
        <ul class="list app-list">${apps.filter((a) => a.label.toLowerCase().includes(filter.toLowerCase())).map((a) => `
          <li><div class="grow"><strong>${esc(a.label)}</strong><span class="small muted">${esc(a.pkg)}</span></div>
          <input type="checkbox" class="switch" data-app="${esc(a.pkg)}" data-label="${esc(a.label)}" ${c.packages.includes(a.pkg) ? 'checked' : ''} aria-label="Lock ${esc(a.label)}"></li>`).join('') || '<li class="empty">No apps match.</li>'}</ul>`
        : c.packages.length ? `<p class="small soft">${c.packages.map((p) => esc(c.labels[p] || p)).join(', ')}</p>` : ''}`;
    const r = refs(el);
    wireSteppers(el, (k, v) => applock.setMaxHours(v));
    if (r.perm) r.perm.onclick = () => native.openSettings('accessibility');
    if (r.appinfo) r.appinfo.onclick = () => native.openSettings('app');
    r.load.onclick = async () => { apps = await native.listApps(); render(); };
    if (r.q) r.q.oninput = (e) => { filter = e.target.value; const pos = e.target.selectionStart; render().then(() => { const q = refs(el).q; q?.focus(); q?.setSelectionRange(pos, pos); }); };
  }
  el.addEventListener('change', (e) => {
    if (e.target.dataset.switch === 'lock') { applock.setEnabled(e.target.checked); if (e.target.checked && !applock.get().packages.length) toast('Now choose which apps to lock.'); }
    if (e.target.dataset.app) applock.toggleApp(e.target.dataset.app, e.target.dataset.label);
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && el.isConnected) render(); });
  render();
  return { render };
}

// Shown when you open a locked app.
export function mountBlocker() {
  on('applock:blocked', async ({ label }) => {
    const st = await native.status();
    const until = st.lockedUntil ? ` It unlocks by itself at ${fmtTime(new Date(st.lockedUntil))}.` : '';
    const v = await sheet({
      title: `${label} is locked 🔒`,
      body: `Tasks first, then scrolling 😌${until}`,
      actions: [{ label: 'Back to my tasks', value: 'ok', style: 'gold' }, { label: 'Emergency unlock', value: 'emergency' }]
    });
    if (v === 'emergency') emergency();
  });
}

function emergency() {
  const back = document.createElement('div');
  back.className = 'sheet-backdrop';
  back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="em-title">
    <h2 id="em-title">Emergency unlock</h2>
    <p>Type <strong>${applock.EMERGENCY_PHRASE}</strong> to unlock everything. It’s noted in your Progress.</p>
    <input class="phrase-input" type="text" autocomplete="off" spellcheck="false" aria-label="Type the unlock phrase" style="margin-top:12px">
    <div class="actions"><button class="btn ox block" data-go>Unlock</button><button class="btn line block" data-cancel>Cancel</button></div></div>`;
  document.body.appendChild(back);
  const input = back.querySelector('input');
  input.addEventListener('paste', (e) => e.preventDefault());
  input.focus();
  const close = () => back.remove();
  back.querySelector('[data-cancel]').onclick = close;
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.querySelector('[data-go]').onclick = () => {
    if (applock.emergencyUnlock(input.value)) { close(); toast('Apps unlocked. Take care 💛'); }
    else { input.value = ''; input.placeholder = 'Not quite. Type it exactly.'; input.classList.add('shake'); }
  };
}
