// Bottom tab bar: Today, Routine, Sleep and Progress. Everything else lives in the ☰ menu (drawer.js):
// Wake-up music, and the Settings page one group at a time. Announces 'tab:shown' so a view can draw itself.
import { emit } from '../core/events.js';
import { $$, vibrateTap } from '../core/util.js';

const ICON = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const TABS = [
  { id: 'alarm', label: 'Today', icon: ICON('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>') },
  { id: 'tasks', label: 'Routine', icon: ICON('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>') },
  { id: 'sleep', label: 'Sleep', icon: ICON('<path d="M3 18v-6.5A2.5 2.5 0 0 1 5.5 9h13a2.5 2.5 0 0 1 2.5 2.5V18M3 15h18M3 18v2M21 18v2"/><path d="M6 9V6.5A1.5 1.5 0 0 1 7.5 5h3A1.5 1.5 0 0 1 12 6.5V9M12 9V6.5A1.5 1.5 0 0 1 13.5 5h3A1.5 1.5 0 0 1 18 6.5V9"/>') },
  { id: 'progress', label: 'Progress', icon: ICON('<path d="M3 17l5-5 4 3 6-7"/><path d="M14 8h4v4"/><path d="M19 3l.6 1.4L21 5l-1.4.6L19 7l-.6-1.4L17 5l1.4-.6z" fill="currentColor" stroke="none"/>') }
];

let nav, current = null, lastMain = 'alarm', group = null;

export function mount(navEl) {
  nav = navEl;
  nav.setAttribute('role', 'tablist');
  nav.innerHTML = TABS.map((t) => `<button role="tab" data-go="${t.id}" aria-selected="false">${t.icon}<span>${t.label}</span></button>`).join('');
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (b && b.dataset.go !== current) { vibrateTap(); show(b.dataset.go); }
  });
}

export const currentTab = () => current;
export const currentGroup = () => group;
export const back = () => show(lastMain);

// show('settings', { group: 'look' }) opens one settings group. Without a group, all of them show.
// opts.focus asks the page to scroll to one part (e.g. show('sleep', { focus: 'plan' })).
export function show(id, opts = {}) {
  current = id;
  group = id === 'settings' ? opts.group || null : null;
  if (TABS.some((t) => t.id === id)) lastMain = id;
  $$('[data-tab]').forEach((s) => s.classList.toggle('hidden', s.dataset.tab !== id));
  $$('[data-go]', nav).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.go === id)));
  window.scrollTo(0, 0);
  emit('tab:shown', { tab: id, group, focus: opts.focus || null });
}
