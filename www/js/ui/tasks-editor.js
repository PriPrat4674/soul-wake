// Routine tab: build your morning ritual. Tap a task to edit it. Also: the on-device photo check
// and "same place" reference photos.
import { on } from '../core/events.js';
import { esc, toast, vibrateTap } from '../core/util.js';
import { TASK_TEMPLATES, MAX_TASKS, MAX_GAP_MIN } from '../config.js';
import * as tasks from '../features/tasks.js';
import { ICONS, switchRow, stepperRow, wireSteppers, info } from './components.js';
import { PHOTO_CHECK } from '../config.js';
import * as photoCheck from '../features/photo-check.js';
import * as camera from './camera.js';
import { petMarkup } from './pet-view.js';

export function mount(root) {
  let open = null; // id of the expanded task

  root.innerHTML = `
    <section class="card routine-hero" data-summary></section>
    <div class="section-title"><h3>Sequence of awakening</h3><span class="small muted">In order, each with a live photo ${info('Morning tasks', 'Each task needs a live photo. A wait (like 10 minutes for tea) stops you rushing through and crawling back to bed.')}</span></div>
    <div data-list></div>
    <div class="card">
      <h3>Add a task</h3>
      <div class="chips" data-chips>${TASK_TEMPLATES.map((t, i) => `<button class="chip" data-tpl="${i}">${esc(t.name)}</button>`).join('')}<button class="chip" data-tpl="custom">Something else…</button></div>
      <p class="small muted italic hidden" data-full style="margin-top:10px">That’s the maximum of ${MAX_TASKS} tasks.</p>
    </div>
    <div class="card" data-chaos></div>
    <div class="card" data-photo></div>`;
  const listEl = root.querySelector('[data-list]');
  const chaosEl = root.querySelector('[data-chaos]');
  const photoEl = root.querySelector('[data-photo]');
  const summaryEl = root.querySelector('[data-summary]');

  function card(t, i, n) {
    const expanded = open === t.id;
    return `
      <div class="task-card" data-id="${t.id}">
        <div class="task-head">
          <span class="n">${i + 1}</span>
          <button class="title" data-toggle aria-expanded="${expanded}"><strong>${esc(t.name)}</strong><span>${esc(t.proof)}${t.gapMin ? ` · ${t.gapMin} min after the last` : ''}</span></button>
          <span class="soft" aria-hidden="true">${expanded ? ICONS.up : ICONS.down}</span>
        </div>
        ${expanded ? `<div class="task-body">
          <label class="field"><span>Task</span><input type="text" data-f="name" value="${esc(t.name)}" maxlength="60" autocomplete="off"><div class="error hidden" data-err="name">A task needs a name.</div></label>
          <label class="field"><span>The photo must show</span><input type="text" data-f="proof" value="${esc(t.proof)}" maxlength="120" autocomplete="off"><div class="error hidden" data-err="proof">Describe what the photo should show.</div></label>
          ${stepperRow({ key: 'gapMin', title: 'Wait first', desc: i === 0 ? 'After the alarm stops' : 'After the last task', value: t.gapMin || 0, min: 0, max: MAX_GAP_MIN, step: 5, unit: ' min' })}
          <div class="ref-row"><span><strong>Same-place photo</strong><br><span class="small muted">${photoCheck.hasReference(t.id) ? 'Saved. Proof photos must be taken here.' : 'Optional. Proof must be taken in this spot.'}</span></span>
            <span class="row">${photoCheck.hasReference(t.id) ? '<button class="btn line" data-act="ref">Retake</button><button class="btn quiet" data-act="unref">Remove</button>' : '<button class="btn line" data-act="ref">Take one</button>'}</span></div>
          <div class="task-tools">
            <button class="btn line" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="Move up">${ICONS.up}</button>
            <button class="btn line" data-act="down" ${i === n - 1 ? 'disabled' : ''} aria-label="Move down">${ICONS.down}</button>
            <button class="btn line" data-act="del" aria-label="Delete task">${ICONS.bin} Delete</button>
          </div>
        </div>` : ''}
      </div>`;
  }

  function render() {
    const list = tasks.all();
    listEl.innerHTML = list.length
      ? list.map((t, i) => card(t, i, list.length)).join('')
      : '<div class="card"><p class="soft italic">No tasks yet. Add one below 👇</p></div>';
    const body = listEl.querySelector('.task-body');
    if (body) wireSteppers(body, (key, v) => tasks.update(open, { [key]: v })?.gapMin ?? v);
    const full = !tasks.canAdd();
    root.querySelectorAll('[data-tpl]').forEach((b) => { b.disabled = full; });
    root.querySelector('[data-full]').classList.toggle('hidden', !full);
    renderChaos();
    renderSummary();
    renderPhoto();
  }

  function renderSummary() {
    const list = tasks.all();
    const waits = list.reduce((a, t) => a + (t.gapMin || 0), 0);
    summaryEl.innerHTML = `<div><span class="eyebrow">Tomorrow’s ritual</span>
        <h2>${list.length ? `${list.length} task${list.length === 1 ? '' : 's'}` : 'No tasks yet'}${tasks.options().chaos ? ' + a surprise 🎲' : ''}</h2>
        <p class="small soft">${list.length ? `${waits ? `${waits} min of waits` : 'No waits'} · ends when every photo is proven` : 'Typing the phrase ends your morning.'}</p>
        ${list.length ? `<ol class="ritual">${list.map((t, i) => `<li><span class="n">${i + 1}</span><span>${esc(t.name)}</span>${t.gapMin ? `<span class="gap">${t.gapMin} min wait</span>` : ''}</li>`).join('')}${tasks.options().chaos ? `<li class="chaos"><span class="n">${list.length + 1}</span><span class="italic">A surprise chaos task</span></li>` : ''}</ol>` : ''}</div>
      <div class="rh-pip" aria-hidden="true">${petMarkup('happy', 64)}</div>`;
  }

  function renderPhoto(pct = null) {
    const st = photoCheck.state();
    photoEl.innerHTML = `<div class="card-head"><h3>Photo check 🔍 ${info('Photo check', `An on-device model compares each proof photo with the task’s words, and with your same-place photo if you took one. It downloads once (about ${PHOTO_CHECK.approxMb} MB, Wi-Fi is best), then works offline. Photos never leave your phone. After ${PHOTO_CHECK.triesBeforeTrust} failed tries, you can count a photo anyway.`)}</h3></div>
      ${switchRow({ key: 'photocheck', title: 'Check my photos', desc: st.enabled ? `On · runs on your phone${st.unverified ? ` · ${st.unverified} counted unverified` : ''}` : st.downloading || pct !== null ? `Downloading… ${pct ?? 0}%` : `Off · one-time ${PHOTO_CHECK.approxMb} MB download`, checked: st.enabled })}`;
  }

  function renderChaos() {
    chaosEl.innerHTML = switchRow({ key: 'chaos', title: 'Chaos task 🎲', desc: 'One surprise, like “something yellow”', checked: tasks.options().chaos });
  }

  listEl.addEventListener('click', (e) => {
    const t = e.target.closest('[data-toggle]');
    if (t) { const id = t.closest('.task-card').dataset.id; open = open === id ? null : id; vibrateTap(); render(); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = b.closest('.task-card').dataset.id;
    if (b.dataset.act === 'up') tasks.move(id, -1);
    if (b.dataset.act === 'down') tasks.move(id, 1);
    if (b.dataset.act === 'del') { tasks.remove(id); open = null; toast('Task deleted.'); photoCheck.removeReference(id); }
    if (b.dataset.act === 'ref') { const t = tasks.all().find((x) => x.id === id); camera.takeReference(t).then((ok) => { if (ok) toast('Reference saved 📍'); render(); }); return; }
    if (b.dataset.act === 'unref') { photoCheck.removeReference(id).then(render); return; }
    render();
  });

  // Field edits save on change, without redrawing, so typing isn't interrupted.
  listEl.addEventListener('change', (e) => {
    const f = e.target.dataset.f;
    if (!f) return;
    const id = e.target.closest('.task-card').dataset.id;
    const err = listEl.querySelector(`[data-err="${f}"]`);
    if (!e.target.value.trim()) {
      err.classList.remove('hidden');
      e.target.value = tasks.all().find((x) => x.id === id)?.[f] || '';
      return;
    }
    err.classList.add('hidden');
    const saved = tasks.update(id, { [f]: e.target.value });
    const head = e.target.closest('.task-card').querySelector('.title');
    head.querySelector('strong').textContent = saved.name;
    head.querySelector('span').textContent = saved.proof + (saved.gapMin ? ` · ${saved.gapMin} min after the last` : '');
  });

  root.querySelector('[data-chips]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tpl]');
    if (!b) return;
    const tpl = b.dataset.tpl === 'custom' ? undefined : TASK_TEMPLATES[Number(b.dataset.tpl)];
    const id = tasks.add(tpl);
    if (!id) { toast(`You can have up to ${MAX_TASKS} tasks.`); return; }
    vibrateTap();
    open = b.dataset.tpl === 'custom' ? id : null;
    render();
    if (open) listEl.querySelector('[data-f="name"]')?.select();
    else toast(`Added “${tpl.name}.”`);
  });

  chaosEl.addEventListener('change', (e) => { if (e.target.dataset.switch === 'chaos') { tasks.setChaos(e.target.checked); renderSummary(); } });
  photoEl.addEventListener('change', async (e) => {
    if (e.target.dataset.switch !== 'photocheck') return;
    if (!e.target.checked) { photoCheck.disable(); renderPhoto(); return; }
    renderPhoto(0);
    const res = await photoCheck.enable();
    if (res.ok) { toast('Photo check is on 🔍'); photoCheck.embedPendingReferences(); }
    else toast(res.reason, 5000);
    renderPhoto();
  });
  on('photocheck:progress', ({ pct }) => { if (!root.classList.contains('hidden')) { const d = photoEl.querySelector('.switch-row .label span'); if (d) d.textContent = `Downloading… ${pct}%`; } });
  on('tasks:changed', () => { if (!root.classList.contains('hidden')) renderSummary(); });

  on('tab:shown', ({ tab }) => { if (tab === root.dataset.tab) render(); });
}
