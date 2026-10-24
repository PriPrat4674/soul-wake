// "Running on little sleep" plan on the Sleep tab (Today links to it). Appears only after a short night.
import { on } from '../core/events.js';
import { esc } from '../core/util.js';
import * as recovery from '../features/recovery.js';
import * as tabs from './tabs.js';
import * as native from '../services/native.js';

export function mount(el) {
  let open = null;
  function render() {
    const a = recovery.active();
    el.classList.toggle('hidden', !a);
    if (!a) { el.innerHTML = ''; return; }
    const done = recovery.done();
    el.className = 'card recovery';
    el.innerHTML = `
      <div class="card-head"><h3>Short night? Your plan 🧃</h3><span class="small muted">${done.length}/${recovery.TIPS.length}</span></div>
      <p class="small soft">About ${a.hours} h. Tap a tip for the why.</p>
      <ul class="tips">${recovery.TIPS.map((t) => `
        <li class="${done.includes(t.id) ? 'done' : ''}">
          <button class="tip-check" data-tip="${t.id}" aria-pressed="${done.includes(t.id)}" aria-label="Mark “${esc(t.title)}” done">${done.includes(t.id) ? '✓' : ''}</button>
          <div class="grow">
            <button class="tip-title" data-open="${t.id}" aria-expanded="${open === t.id}"><span aria-hidden="true">${t.emoji}</span> ${esc(t.title)}</button>
            ${open === t.id ? `<p class="small soft">${esc(t.body)}</p><p class="small why"><strong>Why:</strong> ${esc(t.why)} <button class="link-btn" data-url="${esc(t.url)}">${esc(t.source)}</button></p>${t.id === 'scroll' ? '<button class="btn quiet" data-locklink>Set up app lock</button>' : ''}` : ''}
          </div>
        </li>`).join('')}</ul>`;
  }
  el.addEventListener('click', (e) => {
    const c = e.target.closest('[data-tip]');
    if (c) { recovery.toggle(c.dataset.tip); render(); return; }
    const o = e.target.closest('[data-open]');
    if (o) { open = open === o.dataset.open ? null : o.dataset.open; render(); return; }
    if (e.target.closest('[data-locklink]')) tabs.show('settings', { group: 'applock' });
    const u = e.target.closest('[data-url]');
    if (u) native.openUrl(u.dataset.url);
  });
  ['sleep:changed', 'recovery:changed'].forEach((ev) => on(ev, render));
  on('tab:shown', ({ tab }) => { if (tab === 'sleep') render(); });
  render();
}
