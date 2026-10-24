// The ☰ menu: Wake-up music and the occasional settings, one group per page.
// The everyday screens (Today, Routine, Sleep, Progress) stay in the bottom bar.
import { esc, vibrateTap } from '../core/util.js';
import { APP_NAME, VERSION } from '../config.js';
import * as native from '../services/native.js';
import * as profile from '../features/profile.js';
import * as stats from '../features/stats.js';
import * as applock from '../features/applock.js';
import * as guard from '../features/guard.js';
import * as tabs from './tabs.js';
import { petMarkup } from './pet-view.js';
import { wordmark } from './art.js';

const inApp = native.isNative();
const I = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  look: I('<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.3-1.7-.4-1.1.3-2.3 1.5-2.3H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>'),
  music: I('<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'),
  sleep: I('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  applock: I('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  guard: I('<path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z"/><path d="M9.5 12.5l1.8 1.8 3.2-3.6"/>'),
  rules: I('<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.4 1.6M4.5 4.5 2.5 6.5M19.5 4.5l2 2"/>'),
  sounds: I('<path d="M18 16v-5a6 6 0 0 0-12 0v5l-2 2h16z"/><path d="M10 21h4"/>'),
  perms: I('<path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z"/>'),
  battery: I('<rect x="2" y="7" width="18" height="10" rx="2"/><path d="M22 10v4M6 10v4M10 10v4"/>'),
  you: I('<path d="M12 4l1.4 4.2L18 9.6l-4.6 1.4L12 15l-1.4-4L6 9.6l4.6-1.4z"/><path d="M18.5 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>'),
  reset: I('<path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4h4"/>'),
  about: I('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>')
};

// Each item opens Settings showing only these cards (data-group values in settings-view.js),
// except Wake-up music, which is its own page.
export const GROUPS = [
  { id: 'look', title: 'Look & feel', cards: ['look'] },
  { id: 'music', title: 'Wake-up music', page: 'sounds' },
  { id: 'sleep', title: 'Sleep schedule', cards: ['sleep'] },
  { id: 'applock', title: 'App lock', cards: ['applock'] },
  { id: 'guard', title: 'Night guard', cards: ['guard'] },
  { id: 'rules', title: 'Snooze & check-in', cards: ['snooze', 'checkin'] },
  { id: 'sounds', title: 'Notification sounds', cards: ['sounds'] },
  ...(inApp ? [{ id: 'perms', title: 'Permissions', cards: ['perms'] }] : [{ id: 'battery', title: 'Battery & alerts', cards: ['battery', 'notif'] }]),
  { id: 'you', title: 'You & Pip', cards: ['you'] },
  { id: 'reset', title: 'Start over', cards: ['reset'] },
  { id: 'about', title: 'About', cards: ['about'] }
];
export const titleFor = (id) => GROUPS.find((g) => g.id === id)?.title || null;
export const cardsFor = (id) => GROUPS.find((g) => g.id === id)?.cards || null;

let el = null, lastFocus = null;

export function open() {
  close();
  lastFocus = document.activeElement;
  const p = profile.get();
  const streak = stats.currentStreak();
  const badge = {
    applock: inApp && applock.get().enabled ? '<span class="d-badge">Active</span>' : '',
    guard: guard.isGuarded() ? '<span class="d-badge">On now</span>' : guard.hasPin() ? '<span class="d-badge quiet">PIN set</span>' : '',
    perms: inApp ? '<span class="d-badge quiet" data-ref="permCount"></span>' : ''
  };
  el = document.createElement('div');
  el.className = 'drawer-backdrop';
  el.innerHTML = `<nav class="drawer" role="dialog" aria-modal="true" aria-label="Menu">
      <div class="drawer-head">
        <div class="dh-top">${petMarkup('happy', 58)}<button class="icon-btn" data-close aria-label="Close menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
        <strong>${p.name ? `Hi, ${esc(p.name)}` : 'Hi there'}</strong>
        <span class="small soft"><i class="dot on"></i>${streak ? `${streak}-day wake streak` : 'No streak yet. Tomorrow?'}</span>
      </div>
      <ul class="drawer-list">${GROUPS.map((g) => `<li><button data-group-go="${g.id}"><span class="d-ico">${ICON[g.id] || ''}</span><span class="d-label">${esc(g.title)}</span>${badge[g.id] || ''}<span class="d-chev" aria-hidden="true">›</span></button></li>`).join('')}</ul>
      <div class="drawer-foot">${wordmark()}<span class="small muted">${esc(APP_NAME)} ${esc(VERSION)} · made for kinder mornings</span></div>
    </nav>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el?.classList.add('open'));
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.closest('[data-close]')) return close();
    const b = e.target.closest('[data-group-go]');
    if (!b) return;
    vibrateTap();
    close();
    const g = GROUPS.find((x) => x.id === b.dataset.groupGo);
    if (g.page) tabs.show(g.page);
    else tabs.show('settings', { group: g.id });
  });
  document.addEventListener('keydown', onKey);
  el.querySelector('[data-group-go]')?.focus();
  if (inApp) native.status().then((st) => {
    const n = [st.notifications, st.exactAlarms, st.fullScreen, st.batteryUnrestricted].filter(Boolean).length;
    const out = el?.querySelector('[data-ref="permCount"]');
    if (out) out.textContent = `${n}/4 allowed`;
  });
}

function onKey(e) { if (e.key === 'Escape') close(); }

export function close() {
  if (!el) return;
  document.removeEventListener('keydown', onKey);
  el.remove();
  el = null;
  lastFocus?.focus?.();
}
export const isOpen = () => !!el;
