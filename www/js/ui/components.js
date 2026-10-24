// Reusable interface pieces. Each returns markup or wires behaviour inside a given root only.
import { esc, vibrateTap } from '../core/util.js';

export const ICONS = {
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="13" r="4"/><path d="M12 4v2M5.6 6.6l1.4 1.4M18.4 6.6 17 8M3 13h2M19 13h2M4 19h16"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  bin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  battery: (lvl = 100, charging = false) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="2" y="7" width="18" height="10" rx="2"/><path d="M22 10v4"/><rect x="4" y="9" width="${Math.max(1, Math.round(14 * lvl / 100))}" height="6" fill="currentColor" stroke="none"/>${charging ? '<path d="M12 8l-3 5h3l-1 3" stroke="#000" stroke-width="1.6"/>' : ''}</svg>`
};

// The art-deco sunburst: rays fan out from a half-sun on the horizon. `lit` (0–1) lights rays left to right.
export function sunburst({ rays = 23, lit = 0, risen = false, label = '' } = {}) {
  const cx = 200, cy = 200, r0 = 58, r1 = 186;
  const litCount = Math.round(rays * Math.max(0, Math.min(1, lit)));
  let lines = '';
  for (let i = 0; i < rays; i++) {
    const a = Math.PI + (Math.PI * (i + 0.5)) / rays;
    const long = i % 2 === 0;
    const r = long ? r1 : r1 - 34;
    lines += `<line class="ray${i < litCount ? ' lit' : ''}" style="transition-delay:${i * 25}ms" x1="${(cx + r0 * Math.cos(a)).toFixed(1)}" y1="${(cy + r0 * Math.sin(a)).toFixed(1)}" x2="${(cx + r * Math.cos(a)).toFixed(1)}" y2="${(cy + r * Math.sin(a)).toFixed(1)}"/>`;
  }
  return `<svg class="sunburst${risen ? ' risen' : ''}" viewBox="0 0 400 210" role="img" aria-label="${esc(label || `${Math.round(lit * 100)} percent of the sun is up`)}">
    ${lines}<path class="disc" d="M${cx - 44} ${cy} A44 44 0 0 1 ${cx + 44} ${cy} Z"/><line class="horizon" x1="0" y1="${cy}" x2="400" y2="${cy}"/></svg>`;
}

// Lights rays on an existing sunburst without redrawing (so the transition plays).
export function setSunburst(svg, lit, risen = false) {
  if (!svg) return;
  const rays = svg.querySelectorAll('.ray');
  const n = Math.round(rays.length * Math.max(0, Math.min(1, lit)));
  rays.forEach((r, i) => r.classList.toggle('lit', i < n));
  svg.classList.toggle('risen', risen);
}

export function switchRow({ key, title, desc = '', checked = false }) {
  return `<label class="switch-row"><span class="label"><strong>${esc(title)}</strong>${desc ? `<span>${esc(desc)}</span>` : ''}</span><input type="checkbox" class="switch" data-switch="${key}" ${checked ? 'checked' : ''}></label>`;
}

export function stepperRow({ key, title, desc = '', value, min, max, step = 1, unit = '' }) {
  return `<div class="stepper-row" data-stepper="${key}" data-min="${min}" data-max="${max}" data-step="${step}" data-unit="${esc(unit)}">
    <span class="label"><strong>${esc(title)}</strong>${desc ? `<span>${esc(desc)}</span>` : ''}</span>
    <span class="stepper"><button type="button" data-d="-1" aria-label="Decrease ${esc(title)}">−</button><output aria-live="polite">${value}${unit}</output><button type="button" data-d="1" aria-label="Increase ${esc(title)}">+</button></span>
  </div>`;
}

// Wires every stepper inside root. onChange(key, proposed) returns the value actually saved.
export function wireSteppers(root, onChange) {
  root.querySelectorAll('[data-stepper]').forEach((row) => {
    const { stepper: key, min, max, step, unit } = row.dataset;
    const out = row.querySelector('output');
    const [dec, inc] = row.querySelectorAll('button');
    const read = () => parseFloat(out.textContent);
    const paint = (v) => { out.textContent = `${v}${unit}`; dec.disabled = v <= +min; inc.disabled = v >= +max; };
    paint(read());
    row.addEventListener('click', (e) => {
      const b = e.target.closest('[data-d]');
      if (!b) return;
      vibrateTap();
      const proposed = Math.round((read() + Number(b.dataset.d) * Number(step)) * 100) / 100;
      const saved = onChange(key, Math.min(+max, Math.max(+min, proposed)));
      paint(saved);
    });
  });
}

export function setStepper(root, key, value) {
  const row = root.querySelector(`[data-stepper="${key}"]`);
  if (!row) return;
  const out = row.querySelector('output');
  const [dec, inc] = row.querySelectorAll('button');
  out.textContent = `${value}${row.dataset.unit}`;
  dec.disabled = value <= +row.dataset.min;
  inc.disabled = value >= +row.dataset.max;
}

export function seg(name, options, value) {
  return `<div class="seg" role="group" data-seg="${name}">${options.map((o) => `<button type="button" data-value="${o.value}" aria-pressed="${o.value === value}">${esc(o.label)}</button>`).join('')}</div>`;
}

// A small ⓘ button. Tapping it explains something in a sheet, so screens can stay short.
export function info(title, text) {
  return `<button type="button" class="info-btn" data-info="${esc(text)}" data-info-title="${esc(title)}" aria-label="About ${esc(title)}">i</button>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('[data-info]');
  if (!b) return;
  e.preventDefault();
  e.stopPropagation();
  sheet({ title: b.dataset.infoTitle, body: esc(b.dataset.info), actions: [{ label: 'Got it', value: true, style: 'gold' }] });
}, true);

// Bottom sheet. Resolves with the chosen action's value, or null if dismissed.
export function sheet({ title, body = '', actions = [] }) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'sheet-backdrop';
    back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <h2 id="sheet-title">${esc(title)}</h2>${body ? `<p>${body}</p>` : ''}
      <div class="actions">${actions.map((a, i) => `<button class="btn ${a.style || 'line'} block" data-i="${i}">${esc(a.label)}</button>`).join('')}</div></div>`;
    const close = (v) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    back.addEventListener('click', (e) => {
      if (e.target === back) return close(null);
      const b = e.target.closest('[data-i]');
      if (b) close(actions[Number(b.dataset.i)].value);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(back);
    back.querySelector('.btn')?.focus();
  });
}
