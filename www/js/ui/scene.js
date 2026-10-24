// The sky on the Alarm tab. It follows the time of day: first rays at dawn, a full sun at noon,
// a low orange glow at golden hour, and moon and stars at night. City themes add an original
// skyline drawing and the city's live weather (rain, fog, clouds, snow).
// Pure functions: skyState() works out the moment, scene() draws it as SVG.
import { esc } from '../core/util.js';

const W = 400, H = 230, HORIZON = 196;
export const DEFAULT_SUN = { rise: 6 * 60 + 15, set: 18 * 60 + 30 }; // typical for India

const clamp01 = (x) => Math.max(0, Math.min(1, x));

/**
 * mins: minutes since midnight. rise/set: sunrise and sunset, in minutes.
 * Returns { phase, alt (−1…1, sun height), lit (0…1 share of rays lit), label }.
 */
export function skyState(mins, rise = DEFAULT_SUN.rise, set = DEFAULT_SUN.set) {
  if (!(set > rise)) { rise = DEFAULT_SUN.rise; set = DEFAULT_SUN.set; }
  const day = set - rise, noon = rise + day / 2;
  const alt = Math.sin(Math.PI * ((mins - rise) / day));
  let phase;
  if (mins < rise - 45 || mins > set + 45) phase = 'night';
  else if (mins < rise + 35) phase = 'dawn';
  else if (mins < noon - 75) phase = 'morning';
  else if (mins <= noon + 75) phase = 'noon';
  else if (mins < set - 60) phase = 'afternoon';
  else if (mins <= set) phase = 'golden';
  else phase = 'dusk';
  const lit = phase === 'night' ? 0
    : phase === 'dawn' ? clamp01(0.06 + (mins - (rise - 45)) / 80 * 0.22)
    : phase === 'dusk' ? clamp01(0.2 - (mins - set) / 45 * 0.2)
    : clamp01(0.25 + Math.max(0, alt) * 0.8);
  const LABELS = { night: 'Night sky with stars', dawn: 'Dawn: the first rays', morning: 'Morning sun rising', noon: 'Full midday sun', afternoon: 'Afternoon sun', golden: 'Golden hour', dusk: 'Dusk' };
  return { phase, alt: phase === 'night' ? -1 : alt, lit, label: LABELS[phase] };
}

// Small seeded random so stars stay in the same place between redraws.
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

const GLOW = { dawn: 'var(--sky-dawn)', morning: 'var(--accent)', noon: 'var(--accent)', afternoon: 'var(--accent)', golden: 'var(--warm)', dusk: 'var(--sky-dusk)', night: 'transparent' };

function sun(st) {
  if (st.phase === 'night') return '';
  // The sun climbs from the horizon to its highest point at noon.
  const cy = HORIZON - Math.max(-0.12, st.alt) * 128;
  const cx = W / 2 + (st.phase === 'golden' || st.phase === 'afternoon' || st.phase === 'dusk' ? 40 : st.phase === 'noon' ? 0 : -40) * (1 - Math.max(0, st.alt));
  const rays = 36, litCount = Math.round(rays * st.lit);
  const warm = st.phase === 'golden' || st.phase === 'dusk' || st.phase === 'dawn';
  let lines = '';
  for (let i = 0; i < rays; i++) {
    const a = Math.PI + (2 * Math.PI * (i + 0.5)) / rays; // starts on the left horizon, sweeps over the top
    const long = i % 2 === 0;
    const r0 = 40, r1 = long ? 150 : 118;
    lines += `<line class="ray${i < litCount ? ' lit' : ''}${warm && i < litCount ? ' warm' : ''}" x1="${(cx + r0 * Math.cos(a)).toFixed(1)}" y1="${(cy + r0 * Math.sin(a)).toFixed(1)}" x2="${(cx + r1 * Math.cos(a)).toFixed(1)}" y2="${(cy + r1 * Math.sin(a)).toFixed(1)}"/>`;
  }
  return `<g class="sun-g">${lines}<circle class="disc${warm ? ' warm' : ''}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="30"/></g>`;
}

function nightSky(seed) {
  const r = rng(seed);
  let stars = '';
  for (let i = 0; i < 34; i++) {
    const x = r() * W, y = 8 + r() * (HORIZON - 40), s = 0.6 + r() * 1.5;
    stars += `<circle class="star" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s.toFixed(1)}" style="animation-delay:${(r() * 4).toFixed(2)}s"/>`;
  }
  const moon = `<g class="moon"><circle cx="300" cy="58" r="22"/><circle cx="311" cy="51" r="19" class="moon-cut"/></g>`;
  return `<g class="night">${stars}${moon}</g>`;
}

/* ---------- original skyline drawings (simple geometric shapes, no copied artwork) ---------- */
const B = HORIZON;
function windows(rects, seed) {
  const r = rng(seed);
  let out = '';
  for (const [x, y, w, h] of rects) {
    for (let wy = y + 6; wy < B - 6; wy += 9) for (let wx = x + 4; wx < x + w - 4; wx += 7) if (r() < 0.32) out += `<rect class="win" x="${wx}" y="${wy}" width="2.6" height="3.6"/>`;
  }
  return out;
}
export const SKYLINES = {
  newyork() {
    const towers = [[56, 128, 22, 0], [80, 112, 18, 0], [100, 140, 26, 0], [128, 92, 20, 0], [150, 120, 24, 0], [176, 70, 22, 0], [200, 104, 18, 0], [220, 132, 30, 0], [252, 98, 20, 0], [274, 124, 26, 0], [302, 110, 18, 0], [322, 138, 30, 0], [354, 118, 22, 0], [378, 146, 22, 0]];
    const rects = towers.map(([x, y, w]) => [x, y, w, B - y]);
    // A stepped Art Deco spire on the tallest tower.
    const spire = '<path class="sky-fill" d="M180 70h14v-10h-3v-12h-2v-16h-1v16h-2v12h-3v10z"/>';
    // Lady Liberty on her pedestal, far left.
    const liberty = '<path class="sky-fill" d="M14 196v-16h22v16zM18 180l3-10h8l3 10zM22 170l1-18 3-6 3 6 1 18zM28 148l5-14 2 1-4 13zM33 132a2.4 2.4 0 1 0 0.1 0z"/>';
    return `<g>${rects.map(([x, y, w, h]) => `<rect class="sky-fill" x="${x}" y="${y}" width="${w}" height="${h}"/>`).join('')}${spire}${liberty}${windows(rects, 7)}</g>`;
  },
  sanfrancisco() {
    const deck = 168;
    const tower = (x) => `<path class="sky-fill bridge" d="M${x} ${B}V92h5v${B - 92}zM${x + 13} ${B}V92h5v${B - 92}z"/><path class="sky-fill bridge" d="M${x} 104h18v4h-${18}zM${x} 128h18v4h-18zM${x} 150h18v4h-18z"/>`;
    const cables = `<path class="cable" d="M0 150Q60 ${deck + 4} 104 94M122 94Q200 ${deck + 6} 278 94M296 94Q340 ${deck + 4} 400 150"/>`;
    let hangers = '';
    for (let x = 12; x < 400; x += 12) hangers += `<line class="hanger" x1="${x}" y1="${deck}" x2="${x}" y2="${hangerTop(x)}"/>`;
    function hangerTop(x) {
      const q = (x0, y0, cx, cy, x1, y1, X) => { const t = (X - x0) / (x1 - x0); return (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1; };
      if (x < 104) return q(0, 150, 60, deck + 4, 104, 94, x);
      if (x > 296) return q(296, 94, 340, deck + 4, 400, 150, x);
      if (x >= 122 && x <= 278) return q(122, 94, 200, deck + 6, 278, 94, x);
      return deck;
    }
    const hills = `<path class="sky-fill far" d="M300 ${B}q30-30 60-26t40 14v12z"/><path class="sky-fill far" d="M346 ${B - 12}l6-40 6 40z"/>`;
    return `<g>${hills}${cables}${hangers}<rect class="sky-fill bridge" x="0" y="${deck}" width="400" height="5"/>${tower(104)}${tower(278)}</g>`;
  },
  kerala() {
    const palm = (x, h, lean) => {
      const top = [x + lean, B - h];
      const trunk = `<path class="trunk" d="M${x} ${B}Q${x + lean * 0.2} ${B - h * 0.5} ${top[0]} ${top[1]}"/>`;
      const fronds = [[-34, 10], [-24, -4], [-8, -12], [12, -12], [28, -2], [36, 12]].map(([dx, dy]) => `<path class="frond" d="M${top[0]} ${top[1]}q${dx * 0.5} ${dy - 10} ${dx} ${dy + 6}"/>`).join('');
      return trunk + fronds;
    };
    const boat = '<path class="sky-fill" d="M150 186q50 10 110 0l-8 8h-94z"/><path class="sky-fill thatch" d="M168 186q36-26 76 0z"/><path class="frond" d="M176 182q30-18 60 0"/>';
    const water = '<path class="ripple" d="M20 204h50M110 210h70M230 206h60M320 212h50"/>';
    return `<g>${palm(36, 92, 18)}${palm(70, 70, -14)}${palm(338, 100, -20)}${palm(370, 76, 12)}${boat}${water}</g>`;
  },
  tokyo() {
    const fuji = '<path class="sky-fill far" d="M230 196l64-74q8-6 16 0l64 74z"/><path class="snow" d="M286 131q8-8 16 0l10 12q-6-3-9 2-4-5-8 0-4-5-9 1z"/>';
    // Tokyo Tower: a tall lattice tower with two observation decks.
    const tower = '<path class="tower" d="M120 196l20-70 4-46 2-20 2 20 4 46 20 70"/><path class="tower" d="M126 172h40M132 146h28M139 112h14M136 126l20 0"/><rect class="sky-fill" x="133" y="124" width="26" height="6"/><rect class="sky-fill" x="140" y="96" width="12" height="5"/><line class="tower" x1="146" y1="60" x2="146" y2="40"/>';
    const blocks = [[10, 150, 26], [40, 166, 22], [66, 142, 24], [92, 170, 22], [180, 160, 24], [206, 176, 20], [360, 168, 30]].map(([x, y, w]) => [x, y, w, B - y]);
    return `<g>${fuji}${blocks.map(([x, y, w, h]) => `<rect class="sky-fill" x="${x}" y="${y}" width="${w}" height="${h}"/>`).join('')}${windows(blocks, 11)}${tower}</g>`;
  },
  seoul() {
    const hills = '<path class="sky-fill far" d="M0 196q40-50 90-40t70-30q40-10 70 22t60-6q40-22 110 20v34z"/>';
    // N Seoul Tower on Namsan.
    const tower = '<path class="sky-fill" d="M196 196q34-30 72 0z"/><path class="sky-fill" d="M229 172V118h6v54z"/><path class="sky-fill" d="M222 118h20l-3-10h-14z"/><line class="tower" x1="232" y1="108" x2="232" y2="84"/>';
    // A hanok roof in front: a long curved roof with upturned eaves.
    const roof = (x, w, y) => `<path class="sky-fill" d="M${x} ${y} Q${x + w * 0.1} ${y + 9} ${x + w * 0.22} ${y + 3} L${x + w * 0.32} ${y - 7} H${x + w * 0.68} L${x + w * 0.78} ${y + 3} Q${x + w * 0.9} ${y + 9} ${x + w} ${y} L${x + w - 5} ${y + 9} H${x + 5} Z"/><rect class="sky-fill" x="${x + w * 0.16}" y="${y + 9}" width="${w * 0.68}" height="${196 - y - 9}"/>`;
    const hanok = roof(12, 156, 168) + roof(296, 92, 178);
    return `<g>${hills}${tower}${hanok}</g>`;
  }
};

function weatherFx(fx, seed) {
  if (!fx) return '';
  const r = rng(seed + 3);
  if (fx === 'rain' || fx === 'storm') {
    let d = '';
    for (let i = 0; i < 46; i++) { const x = r() * (W + 40) - 20, y = r() * HORIZON; d += `M${x.toFixed(0)} ${y.toFixed(0)}l-5 12`; }
    return `<g class="fx-rain"><path d="${d}"/></g>${fx === 'storm' ? '<rect class="fx-flash" width="400" height="196"/>' : ''}`;
  }
  if (fx === 'snow') {
    let c = '';
    for (let i = 0; i < 40; i++) c += `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * HORIZON).toFixed(0)}" r="${(1 + r() * 1.6).toFixed(1)}"/>`;
    return `<g class="fx-snow">${c}</g>`;
  }
  if (fx === 'fog') return '<g class="fx-fog"><rect x="-60" y="120" width="300" height="26" rx="13"/><rect x="160" y="150" width="320" height="30" rx="15"/><rect x="-20" y="168" width="260" height="22" rx="11"/></g>';
  if (fx === 'cloud') return '<g class="fx-cloud"><path d="M40 70a14 14 0 0 1 26-8 18 18 0 0 1 34 6 12 12 0 0 1 2 24H44a11 11 0 0 1-4-22z"/><path d="M250 44a12 12 0 0 1 22-6 15 15 0 0 1 29 5 10 10 0 0 1 1 20h-49a9 9 0 0 1-3-19z"/></g>';
  return '';
}

/**
 * Draws the whole scene. opts: { mins, rise, set, city (theme id or null), fx (weather), seed }
 */
export function scene({ mins, rise, set, city = null, fx = null, seed = 1, label = '' } = {}) {
  const st = skyState(mins, rise, set);
  const glow = GLOW[st.phase];
  const cityArt = city && SKYLINES[city] ? SKYLINES[city]() : '';
  const id = 'sc' + Math.random().toString(36).slice(2, 8); // unique per drawing
  return `<svg class="scene phase-${st.phase}${city ? ' has-city city-' + city : ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label || st.label)}" data-phase="${st.phase}">
    <defs>
      <clipPath id="${id}a"><rect x="0" y="0" width="${W}" height="${HORIZON}"/></clipPath>
      <radialGradient id="${id}g" cx="50%" cy="100%" r="75%"><stop offset="0" style="stop-color:${glow};stop-opacity:.34"/><stop offset="1" style="stop-color:${glow};stop-opacity:0"/></radialGradient>
    </defs>
    <rect class="glow" x="0" y="0" width="${W}" height="${HORIZON}" fill="url(#${id}g)"/>
    ${st.phase === 'night' || st.phase === 'dusk' ? nightSky(seed) : ''}
    <g clip-path="url(#${id}a)">${sun(st)}</g>
    ${weatherFx(fx, seed)}
    ${cityArt ? `<g class="skyline">${cityArt}</g>` : ''}
    <line class="horizon" x1="0" y1="${HORIZON}" x2="${W}" y2="${HORIZON}"/>
  </svg>`;
}
