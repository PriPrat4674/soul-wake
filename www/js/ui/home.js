// Today tab: greeting and live clock, the sky with Pip in it, your wake-up time, slide to arm.
// Follows the SoulWake design: everything else (sleep, tasks, music) has its own place.
import { on, emit } from '../core/events.js';
import { refs, esc, fmtTime, fmtDur, toast, vibrateTap } from '../core/util.js';
import * as alarm from '../features/alarm.js';
import * as tasks from '../features/tasks.js';
import * as guardBattery from '../features/battery-guard.js';
import * as guard from '../features/guard.js';
import * as music from '../features/music.js';
import * as spotify from '../features/sources/spotify.js';
import * as battery from '../services/battery.js';
import * as audio from '../services/audio.js';
import { requestPermission } from '../services/notify.js';
import { sheet, ICONS } from './components.js';
import { scene, DEFAULT_SUN, skyState } from './scene.js';
import * as places from '../features/places.js';
import * as tabs from './tabs.js';
import * as native from '../services/native.js';
import * as profile from '../features/profile.js';
import * as stats from '../features/stats.js';
import * as sleep from '../features/sleep.js';
import * as recovery from '../features/recovery.js';
import { alarmMessage, greeting } from '../features/messages.js';
import * as petView from './pet-view.js';
import * as guardView from './guard-view.js';

const inApp = native.isNative();
const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>';
const ALARM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.4 1.6M4.5 4.5 2.5 6.5M19.5 4.5l2 2"/></svg>';
const CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
const SHIELD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z"/></svg>';

const split = (d) => {
  const s = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const mm = s.match(/^(.*?)(\s?[AaPp]\.?[Mm]\.?)$/);
  return mm ? { main: mm[1], suffix: mm[2].trim() } : { main: s, suffix: '' };
};
const timeParts = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return split(d); };
const minsOf = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

export function mount(root) {
  root.innerHTML = `
    <section class="home-hero">
      <p class="status-chip hidden" data-ref="chip"></p>
      <p class="hello" data-ref="hello"></p>
      <div class="clock" data-ref="clock" aria-live="off">--:--</div>
      <p class="date" data-ref="date"></p>
      <button class="city-line hidden" data-ref="city" aria-haspopup="dialog"></button>
    </section>

    <div class="sky-card" data-ref="sky">
      <div class="burst-wrap" data-ref="burst"></div>
      <div data-ref="pet"></div>
    </div>

    <div class="card wake-card alarm-card">
      <label class="time-pick">
        <span class="wake-ico" aria-hidden="true">${ALARM}</span>
        <span class="wake-main"><span class="label">Wake at</span><span class="value" data-ref="timeShow"></span></span>
        <span class="wake-when" data-ref="when"></span>
        <input type="time" data-ref="time" aria-label="Wake-up time" required>
      </label>
      <button class="first-task" data-ref="first"></button>
      <p class="alarm-msg" data-ref="msg"></p>
    </div>

    <div class="slide" data-ref="slide">
      <div class="fill" data-ref="fill"></div>
      <div class="text">Slide to arm <span aria-hidden="true">›››</span></div>
      <button class="thumb" data-ref="thumb" aria-label="Arm alarm. Press Enter, or slide right.">${MOON}</button>
    </div>
    <div class="armed-box hidden" data-ref="armedBox">
      ${inApp ? '' : '<button class="btn gold" data-ref="night">Night screen</button>'}
      <button class="btn line" data-ref="disarm">Disarm</button>
    </div>
    <p class="arm-status" data-ref="status" aria-live="polite"></p>

    <div class="row between wrap home-tools">
      <button class="btn quiet" data-ref="test">Try a test alarm</button>
      <span class="battery-pill hidden" data-ref="batt"></span>
    </div>

    <div class="card notice warn hidden" data-ref="permWarn"></div>
    <button class="card link-card hidden" data-ref="plan"></button>`;
  const r = refs(root);

  /* ----- status ----- */
  function statusText(now) {
    const a = alarm.status();
    if (a.testAt) return `Test alarm in ${fmtDur(a.testAt - now)} ⏳`;
    if (a.armedAt) return `Armed · rings in ${fmtDur(a.armedAt - now)}`;
    return inApp ? 'Not armed yet. Slide before bed.' : 'Not armed yet. Slide, then leave me open.';
  }

  // The little chip above the greeting: night guard, wind-down or sleep hours.
  function chipText(now) {
    if (guard.isGuarded(now)) return { text: 'Night guard on', icon: SHIELD, tone: 'guard' };
    const bed = minsOf(sleep.get().schedule.bed);
    const d = new Date(now), mins = d.getHours() * 60 + d.getMinutes();
    const until = (bed - mins + 1440) % 1440;
    if (until > 0 && until <= 120) return { text: 'Wind-down time', tone: '' };
    if (sleep.isSleepTime(now)) return { text: 'Sleep hours', tone: '' };
    return null;
  }
  function dateText(now) {
    const d = new Date(now);
    const day = d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
    const bed = minsOf(sleep.get().schedule.bed), mins = d.getHours() * 60 + d.getMinutes();
    const until = (bed - mins + 1440) % 1440;
    return until > 0 && until <= 180 ? `${day} · Bedtime in ${until >= 60 ? `${Math.floor(until / 60)}h ${until % 60}m` : `${until} min`}` : day;
  }

  /* ----- sky + city ----- */
  let skyKey = '', lastMinute = -1;
  function paintSky(now = Date.now(), force = false) {
    const city = places.info(now);
    let mins, rise = DEFAULT_SUN.rise, set = DEFAULT_SUN.set;
    if (city) {
      mins = places.minutesIn(city.tz, now);
      if (city.weather?.sunrise && city.weather?.sunset) { rise = places.minutesIn(city.tz, city.weather.sunrise); set = places.minutesIn(city.tz, city.weather.sunset); }
    } else {
      const d = new Date(now); mins = d.getHours() * 60 + d.getMinutes();
    }
    const st = skyState(mins, rise, set);
    const fx = city?.weather?.fx || null;
    const key = `${st.phase}|${Math.round(st.lit * 12)}|${Math.round(st.alt * 12)}|${city?.id || ''}|${fx}`;
    if (!force && key === skyKey) return;
    skyKey = key;
    r.sky.dataset.phase = st.phase;
    r.burst.innerHTML = scene({ mins, rise, set, city: city?.id || null, fx, seed: 7, label: `${st.label}${city ? ` in ${city.name}` : ''}` });
  }

  // A small city line under the clock: name, local time and weather. Tap for the local headline or a fact.
  function paintCity() {
    const c = places.info();
    r.city.classList.toggle('hidden', !c);
    if (!c) return;
    r.city.innerHTML = `<span aria-hidden="true">📍</span><strong>${esc(c.name)}</strong><span class="muted">${esc(c.time)}</span>${c.weather ? `<span class="wx">${c.weather.emoji} ${c.weather.temp}° ${esc(c.weather.label)}</span>` : ''}<span class="chev" aria-hidden="true">${CHEV}</span>`;
    r.city.setAttribute('aria-label', `${c.name}: ${c.time}${c.weather ? `, ${c.weather.temp} degrees, ${c.weather.label}` : ''}. Show the local headline and facts.`);
  }
  r.city.onclick = () => citySheet();

  function render() {
    const a = alarm.status();
    const t = timeParts(a.time);
    r.time.value = a.time;
    r.timeShow.innerHTML = `${esc(t.main)}<small>${esc(t.suffix)}</small>`;
    const next = a.armedAt || (() => { const [h, m] = a.time.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1); return d.getTime(); })();
    const isToday = new Date(next).toDateString() === new Date().toDateString();
    r.when.innerHTML = `<i class="dot ${a.armed ? 'on' : ''}"></i>${isToday ? 'Today' : 'Tomorrow'}`;
    r.slide.classList.toggle('hidden', a.armed);
    r.armedBox.classList.toggle('hidden', !a.armed);
    r.status.textContent = statusText(Date.now());
    r.msg.textContent = alarmMessage(a.time, { date: new Date(a.armedAt || Date.now() + 12 * 3600_000), streak: stats.currentStreak(), name: profile.get().name });
    renderFirst();
    renderPlan();
  }

  // The first task of tomorrow's ritual, as a chip (tap to see them all on Routine).
  function renderFirst() {
    const list = tasks.all();
    const chaos = tasks.options().chaos;
    const n = list.length + (chaos ? 1 : 0);
    r.first.innerHTML = list.length
      ? `<span class="ft-label">First up</span><strong>${esc(list[0].name)}</strong><span class="muted">${n} task${n === 1 ? '' : 's'}</span>`
      : '<span class="ft-label">Ritual</span><strong>No tasks yet</strong><span class="muted">Typing the phrase ends it</span>';
    r.first.setAttribute('aria-label', list.length ? `Tomorrow’s ritual: ${n} tasks, starting with ${list[0].name}. Edit on Routine.` : 'No tasks yet. Add some on Routine.');
  }

  // "Short night? See your plan" when last night was short (the plan itself lives on Sleep).
  function renderPlan() {
    const p = recovery.active();
    r.plan.classList.toggle('hidden', !p);
    if (!p) return;
    const done = recovery.done().length;
    r.plan.innerHTML = `<span class="lc-ico" aria-hidden="true">🌙</span><span class="grow"><strong>Short night? See your plan 🧃</strong><span class="small soft">About ${p.hours} h · ${done}/${recovery.TIPS.length} done</span></span><span class="chev" aria-hidden="true">${CHEV}</span>`;
  }
  r.plan.onclick = () => tabs.show('sleep', { focus: 'plan' });

  async function renderPerms() {
    if (!inApp) return;
    const st = await native.status();
    const missing = [!st.notifications && 'notifications', !st.exactAlarms && 'exactAlarm', !st.fullScreen && 'fullScreen'].filter(Boolean);
    r.permWarn.classList.toggle('hidden', !missing.length);
    if (!missing.length) return;
    const names = { notifications: 'notifications', exactAlarm: 'exact alarms', fullScreen: 'full-screen alarms' };
    r.permWarn.innerHTML = `<h3>Let me ring when I’m closed 🔔</h3><p class="small soft" style="margin-top:4px">Allow ${missing.map((m) => names[m]).join(', ')}.</p><button class="btn gold" data-fix="${missing[0]}" style="margin-top:10px">Fix now</button>`;
    r.permWarn.querySelector('[data-fix]').onclick = async (e) => {
      const which = e.target.dataset.fix;
      if (which === 'notifications') { const res = await native.requestNotifications(); if (!res.granted) native.openSettings('notifications'); }
      else native.openSettings(which);
    };
  }

  function renderBattery(b = battery.get()) {
    if (!b.supported || inApp) { r.batt.classList.add('hidden'); return; }
    const low = !b.charging && b.level <= guardBattery.settings().armBelow;
    r.batt.classList.remove('hidden');
    r.batt.classList.toggle('low', low);
    r.batt.innerHTML = `${ICONS.battery(b.level, b.charging)}${b.level}%${b.charging ? ' charging' : ''}`;
  }

  /* ----- arming ----- */
  async function armFlow() {
    audio.unlock();
    if (music.status().source === 'spotify') spotify.prepare();
    const check = guardBattery.armCheck();
    if (!check.ok) {
      const choice = await sheet({
        title: `Battery at ${check.level}% 🔋`,
        body: `Not charging. If it drops to ${check.floor}%, I’ll switch the alarm off to save your phone.`,
        actions: [{ label: 'I’ll plug in first', value: 'cancel', style: 'gold' }, { label: 'Arm anyway', value: 'arm' }]
      });
      if (choice !== 'arm') { resetSlide(); return; }
    }
    alarm.arm();
    vibrateTap(30);
    if (inApp) { toast(`Armed for ${fmtTime(new Date(alarm.status().armedAt))} ⏰ Sleep well!`); renderPerms(); return; }
    requestPermission();
    if (check.unknown) toast('This browser can’t read your battery. Plug in to be safe.', 4000);
    else toast(`Armed for ${fmtTime(new Date(alarm.status().armedAt))}.`);
  }

  /* ----- slide to arm ----- */
  let drag = null;
  const maxX = () => r.slide.clientWidth - r.thumb.offsetWidth - 10;
  const setX = (x) => { r.thumb.style.transform = `translateX(${x}px)`; r.fill.style.width = `${x + 60}px`; };
  function resetSlide() { r.slide.classList.add('snap'); setX(0); setTimeout(() => r.slide.classList.remove('snap'), 260); }
  r.thumb.addEventListener('pointerdown', (e) => {
    drag = { start: e.clientX, x: 0 };
    r.thumb.setPointerCapture(e.pointerId);
    r.slide.classList.remove('snap');
  });
  r.thumb.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.x = Math.max(0, Math.min(maxX(), e.clientX - drag.start));
    setX(drag.x);
  });
  const endDrag = () => {
    if (!drag) return;
    const done = drag.x >= maxX() * 0.85;
    drag = null;
    if (done) { setX(maxX()); armFlow().then(() => setTimeout(() => setX(0), 300)); } else resetSlide();
  };
  r.thumb.addEventListener('pointerup', endDrag);
  r.thumb.addEventListener('pointercancel', endDrag);
  r.thumb.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); armFlow(); } });

  /* ----- other controls ----- */
  // In your guarded hours, disarming and moving the alarm take the night-guard check first.
  r.disarm.onclick = () => guardView.guarded('disarm', () => { alarm.disarm(); toast('Alarm disarmed.'); });
  if (r.night) r.night.onclick = () => emit('night:open');
  r.test.onclick = () => { audio.unlock(); if (music.status().source === 'spotify') spotify.prepare(); alarm.test(); toast('Test alarm in 10 seconds ⏳'); };
  r.time.addEventListener('change', async (e) => {
    const v = e.target.value;
    if (!v) { render(); return; }
    if (v === alarm.status().time) return;
    render(); // show the old time until the change is allowed
    const ok = await guardView.guarded('time', () => { if (!alarm.setTime(v)) render(); });
    if (!ok) toast('Alarm time kept. Night guard is on 🛡️');
  });
  r.first.onclick = () => tabs.show('tasks');

  on('alarm:changed', render);
  on('tasks:changed', renderFirst);
  on('battery:changed', renderBattery);
  on('recovery:changed', renderPlan);
  on('sleep:changed', () => { renderPlan(); paintTop(Date.now()); });
  on('guard:changed', () => paintTop(Date.now()));
  on('tab:shown', ({ tab }) => { if (tab === root.dataset.tab) { render(); renderPerms(); paintTop(Date.now()); } });
  on('profile:changed', render);
  on('streak:changed', render);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') renderPerms(); });
  on('place:changed', () => { paintCity(); paintSky(Date.now(), true); });
  on('profile:changed', () => { paintCity(); paintSky(Date.now(), true); paintTop(Date.now()); });

  function paintTop(now) {
    const c = chipText(now);
    r.chip.classList.toggle('hidden', !c);
    if (c) { r.chip.className = `status-chip ${c.tone}`; r.chip.innerHTML = `${c.icon || '<i class="dot"></i>'}<span>${esc(c.text)}</span>`; }
    r.hello.textContent = greeting(profile.get().name, new Date(now).getHours()).replace(/[\s\p{Extended_Pictographic}\uFE0F\u200D]+$/u, '');
    r.date.textContent = dateText(now);
  }
  on('tick', ({ now }) => {
    const d = new Date(now);
    const minute = Math.floor(now / 60000);
    if (minute !== lastMinute) { lastMinute = minute; paintSky(now); paintTop(now); if (places.current()) paintCity(); }
    const t = split(d);
    r.clock.innerHTML = `${esc(t.main)}${t.suffix ? `<small>${esc(t.suffix)}</small>` : ''}`;
    r.status.textContent = statusText(now);
  });
  petView.mountCard(r.pet);
  render();
  renderBattery();
  renderPerms();
  paintSky(Date.now(), true);
  paintCity();
  paintTop(Date.now());
  places.refresh();
}

// The city's headline or a "did you know" fact, with ↻ to switch. Links open outside the app.
let showFact = null;
function citySheet() {
  const c = places.info();
  if (!c) return;
  const back = document.createElement('div');
  back.className = 'sheet-backdrop';
  const paint = () => {
    const first = showFact === null ? (c.headlineFirst && c.news ? 'news' : 'fact') : showFact ? 'fact' : 'news';
    const useNews = first === 'news' && c.news;
    const line = useNews
      ? `<span aria-hidden="true">📰</span><button class="link-btn" data-open="${esc(c.news.url)}">${esc(c.news.title)}</button>`
      : `<span aria-hidden="true">💡</span><span>${esc(c.fact.text)}${c.fact.url ? ` <button class="link-btn small" data-open="${esc(c.fact.url)}">Wikipedia</button>` : ''}</span>`;
    back.innerHTML = `<div class="sheet city-card" role="dialog" aria-modal="true" aria-labelledby="city-title">
      <div class="city-top"><h2 id="city-title">${esc(c.name)}</h2><span class="muted">${esc(c.time)}</span>${c.weather ? `<span class="wx">${c.weather.emoji} ${c.weather.temp}° ${esc(c.weather.label)}</span>` : ''}</div>
      <p class="city-news">${line}${c.news ? `<button class="icon-btn swap" data-swap aria-label="${useNews ? 'Show a fun fact' : 'Show the headline'}">↻</button>` : ''}</p>
      <div class="actions"><button class="btn line block" data-close>Close</button></div></div>`;
    back.querySelector('[data-swap]')?.addEventListener('click', () => { showFact = !!useNews; paint(); });
  };
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  back.addEventListener('click', (e) => {
    if (e.target === back || e.target.closest('[data-close]')) return close();
    const b = e.target.closest('[data-open]');
    if (b) native.openUrl(b.dataset.open);
  });
  document.addEventListener('keydown', onKey);
  paint();
  document.body.appendChild(back);
  back.querySelector('.btn')?.focus();
}
