// Progress tab: streak, a five-week proof calendar, totals, recent mornings, Hall of Shame.
// (This week's sleep chart lives on the Sleep tab.)
import { on } from '../core/events.js';
import { refs, esc, dayKey, plural } from '../core/util.js';
import * as stats from '../features/stats.js';
import * as snooze from '../features/snooze.js';
import { sunburst, info } from './components.js';
import * as applock from '../features/applock.js';
import * as native from '../services/native.js';
import { petMarkup } from './pet-view.js';
import * as pet from '../features/pet.js';

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function mount(root) {
  root.innerHTML = `
    <section class="card streak-hero">
      <div class="sh-row">
        <div><span class="eyebrow" data-ref="badge">Streak</span><div class="big num" data-ref="streak">0</div><div class="cap" data-ref="cap"></div><p class="small soft" data-ref="best"></p></div>
        <div class="progress-pet" data-ref="pet"></div>
      </div>
      <div class="hero-burst" data-ref="burst"></div>
    </section>
    <div class="card">
      <div class="card-head"><h3>Proof calendar</h3><span class="small muted">Last five weeks</span></div>
      <div class="cal" data-ref="cal"></div>
      <div class="legend"><span><i style="background:var(--accent)"></i>Proven</span>${native.isNative() ? '' : '<span><i style="border:1px solid var(--danger)"></i>Battery pause</span>'}</div>
    </div>
    <div class="stat-grid" data-ref="grid"></div>
    <div class="card">
      <div class="card-head"><h3>Recent mornings</h3><span class="small muted">Last 14</span></div>
      <ul class="list" data-ref="history"></ul>
    </div>
    <div class="card shame-card">
      <div class="card-head"><h3>Hall of Shame 😤</h3><span class="shame-pip" aria-hidden="true" data-ref="shamePip"></span></div>
      <p class="small soft">Every real snooze, forever.</p>
      <ul class="list" data-ref="shame"></ul>
    </div>`;
  const r = refs(root);

  function calendar(history) {
    const byDay = new Map();
    for (const h of history) if (!byDay.has(h.date) || h.outcome === 'proven') byDay.set(h.date, h.outcome);
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const mondayOffset = (today.getDay() + 6) % 7;
    const start = new Date(today); start.setDate(today.getDate() - mondayOffset - 28);
    let html = DOW.map((d) => `<div class="dow">${d}</div>`).join('');
    for (let i = 0; i < 35; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const key = dayKey(d);
      if (d > today) { html += '<div class="day blank"></div>'; continue; }
      const outcome = byDay.get(key);
      const label = `${d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}: ${outcome || 'no record'}`;
      html += `<div class="day ${outcome || ''} ${key === dayKey() ? 'today' : ''}" title="${esc(label)}" aria-label="${esc(label)}">${d.getDate()}</div>`;
    }
    return html;
  }

  function render() {
    const s = stats.get();
    const streak = stats.currentStreak();
    r.streak.textContent = streak;
    r.cap.textContent = streak === 1 ? 'morning proven in a row' : 'mornings proven in a row';
    r.pet.innerHTML = petMarkup(pet.current(), 96);
    r.burst.innerHTML = sunburst({ lit: Math.min(1, streak / 7), risen: streak >= 7, label: `${streak} of 7 days toward a full sunrise` });
    r.badge.textContent = streak ? 'Active streak' : 'Streak';
    r.best.textContent = s.best ? `Personal best: ${plural(s.best, 'day')}` : 'Prove a morning to start one.';
    r.shamePip.innerHTML = petMarkup('grumpy', 44);
    r.cal.innerHTML = calendar(s.history);
    const proven = s.history.filter((h) => h.outcome === 'proven');
    const avg = proven.length ? Math.round(proven.reduce((a, h) => a + h.mins, 0) / proven.length) : null;
    const cells = [
      ['🏆', s.best, 'Best streak'], ['☀️', s.wins, 'Mornings proven'],
      ['⏱️', avg == null ? '–' : `${avg}m`, 'Average time to proven'], ['😴', s.totals.snoozes, 'Snoozes'],
      ['⚠️', s.totals.misses, 'Missed check-ins'],
      native.isNative() ? ['🔓', applock.emergencies().length, 'Emergency unlocks'] : ['🔋', s.totals.paused, 'Nights paused for battery']
    ];
    r.grid.innerHTML = cells.map(([i, v, l]) => `<div class="stat"><span class="st-ico" aria-hidden="true">${i}</span><b>${v}</b><span>${l}</span></div>`).join('');
    const shame = snooze.hallOfShame().filter((x) => !x.test);
    r.shame.innerHTML = shame.length
      ? shame.slice(0, 20).map((x) => `<li><div class="grow"><strong>Snoozed</strong><span class="small muted">${new Date(x.at).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span></div></li>`).join('')
      : '<li class="empty">Spotless. Keep it that way.</li>';
    r.history.innerHTML = s.history.length
      ? s.history.slice(0, 14).map((h) => {
          const date = new Date(`${h.date}T12:00`).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });
          return h.outcome === 'paused'
            ? `<li><div class="grow"><strong>${date}</strong><span class="small muted">Alarm paused at ${h.level}% battery</span></div></li>`
            : `<li><div class="grow"><strong>${date}</strong><span class="small muted">Proven in ${plural(h.mins, 'minute')}${h.snoozes ? `, ${plural(h.snoozes, 'snooze')}` : ''}${h.misses ? `, ${plural(h.misses, 'missed check-in')}` : ''}</span></div><span class="grade-chip num">${esc(h.grade || '')}</span></li>`;
        }).join('')
      : '<li class="empty">Your first proven morning shows up here.</li>';
  }

  on('streak:changed', render);
  on('pet:changed', render);
  on('snooze:started', render);
  on('tab:shown', ({ tab }) => { if (tab === root.dataset.tab) render(); });
}
