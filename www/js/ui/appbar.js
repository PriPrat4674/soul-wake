// The top bar: ☰ menu, the screen's name, and small live pills (e.g. "☕ Tea in 7:42").
// Other views put pills here with emit('pill:set', { key, text, onClick }) and emit('pill:clear', { key }).
import { on } from '../core/events.js';
import { esc, refs } from '../core/util.js';
import { APP_NAME } from '../config.js';
import * as drawer from './drawer.js';
import { wordmark } from './art.js';

const TITLES = { alarm: APP_NAME, tasks: 'Morning ritual', sleep: 'Sleep', sounds: 'Wake-up music', progress: 'Progress' };
const pills = new Map();

export function mount(el) {
  el.innerHTML = `
    <button class="icon-btn ab-menu" data-ref="menu" aria-label="Open menu" aria-haspopup="dialog">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/></svg>
    </button>
    <div class="ab-title" data-ref="title" aria-label="${APP_NAME}">${wordmark()}</div>
    <div class="ab-pills" data-ref="pills" aria-live="polite"></div>`;
  const r = refs(el);
  r.menu.onclick = () => drawer.open();

  function paintPills() {
    r.pills.innerHTML = [...pills.entries()].map(([key, p]) => `<button class="pill ${p.tone || ''}" data-pill="${esc(key)}">${esc(p.text)}</button>`).join('');
  }
  r.pills.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pill]');
    pills.get(b?.dataset.pill)?.onClick?.();
  });

  // Today shows the SoulWake wordmark; every other page shows its name.
  on('tab:shown', ({ tab, group }) => {
    const title = tab === 'settings' ? (drawer.titleFor(group) || 'Settings') : TITLES[tab] || APP_NAME;
    r.title.setAttribute('aria-label', title);
    if (tab === 'alarm') r.title.innerHTML = wordmark();
    else r.title.textContent = title;
  });
  on('pill:set', ({ key, text, onClick, tone }) => {
    const old = pills.get(key);
    pills.set(key, { text, onClick, tone });
    if (!old || old.text !== text || old.tone !== tone) paintPills();
  });
  on('pill:clear', ({ key }) => { if (pills.delete(key)) paintPills(); });
}
