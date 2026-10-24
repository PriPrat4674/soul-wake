// Artwork drawn in code: the four logos and Pip, the SoulWake pebble (an olive-outlined smiley).
// Pure functions returning SVG.

export const LOGOS = [
  { id: 'sunrise', label: 'Sunrise' },
  { id: 'crescent', label: 'Crescent' },
  { id: 'soulwake', label: 'SoulWake' },
  { id: 'bell', label: 'Bell' }
];

// Brand colours from the SoulWake logo.
export const BRAND = { olive: '#B1B864', navy: '#23214A', blue: '#5E7EC0', cream: '#FBF7F0' };

// The pebble outline: a soft gumdrop, wider at the bottom. Shared by the logo and Pip.
export const PEBBLE = 'M50 13C68 13 84.5 39 87.5 61C90.5 82 74 90.5 50 90.5C26 90.5 9.5 82 12.5 61C15.5 39 32 13 50 13Z';

// c = { bg, fg, accent } colours. `framed` draws the rounded-square app tile.
export function logoSVG(id, c = {}, { framed = true, size = 64, label = '' } = {}) {
  const bg = c.bg || '#000000', fg = c.fg || '#F2EADB', ac = c.accent || '#C8A55E';
  const tile = framed ? `<rect x="0" y="0" width="100" height="100" rx="24" fill="${bg}"/>` : '';
  const art = {
    sunrise: `
      <g stroke="${ac}" stroke-width="3.2" stroke-linecap="round">
        ${[...Array(9)].map((_, i) => { const a = Math.PI + Math.PI * (i + 0.5) / 9; return `<line x1="${50 + 22 * Math.cos(a)}" y1="${64 + 22 * Math.sin(a)}" x2="${50 + 36 * Math.cos(a)}" y2="${64 + 36 * Math.sin(a)}"/>`; }).join('')}
      </g>
      <path d="M33 64a17 17 0 0 1 34 0z" fill="${ac}"/>
      <line x1="18" y1="65.5" x2="82" y2="65.5" stroke="${fg}" stroke-width="3" stroke-linecap="round"/>
      <path d="M40 76h20" stroke="${fg}" stroke-width="3" stroke-linecap="round" opacity=".5"/>`,
    crescent: `
      <path d="M58 22a28 28 0 1 0 22 44a23 23 0 1 1-22-44z" fill="${fg}"/>
      <path d="M70 26l2.6 6.4 6.4 2.6-6.4 2.6L70 44l-2.6-6.4-6.4-2.6 6.4-2.6z" fill="${ac}"/>
      <circle cx="80" cy="50" r="2.2" fill="${ac}"/>`,
    // The SoulWake smiley, always in its own olive (it's the brand mark).
    soulwake: `<g transform="translate(9 9) scale(.82)">${smiley(BRAND.olive)}</g>`,
    bell: `
      <circle cx="50" cy="55" r="25" fill="none" stroke="${ac}" stroke-width="5"/>
      <path d="M24 34a10 10 0 0 1 14-12M76 34a10 10 0 0 0-14-12" fill="none" stroke="${ac}" stroke-width="5" stroke-linecap="round"/>
      <path d="M50 42v14l9 6" fill="none" stroke="${fg}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M33 80l-5 6M67 80l5 6" stroke="${ac}" stroke-width="5" stroke-linecap="round"/>`
  }[id] || '';
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${label || id + ' logo'}">${tile}${art}</svg>`;
}

// The logo's face: outlined pebble, two round eyes and a wide open smile with a tongue.
function smiley(col, fill = 'none') {
  return `<path d="${PEBBLE}" fill="${fill}" stroke="${col}" stroke-width="5.5" stroke-linejoin="round"/>
    <circle cx="42.5" cy="46" r="4.6" fill="${col}"/><circle cx="57.5" cy="46" r="4.6" fill="${col}"/>
    <path d="M37.5 54.5h25a1.6 1.6 0 0 1 1.6 1.8C63 64 57 70.5 50 70.5S37 64 35.9 56.3a1.6 1.6 0 0 1 1.6-1.8z" fill="${col}"/>
    <path d="M42.6 66.2q7.4-6.4 14.8 0q-7.4 4.4-14.8 0z" fill="${fill === 'none' ? '#FFFFFF' : fill}"/>`;
}

// The SoulWake wordmark: "Soul" in the text colour (navy on light screens), "Wake" in blue.
export function wordmark(cls = '') {
  return `<span class="wordmark ${cls}"><span class="wm-soul">Soul</span><span class="wm-wake">Wake</span></span>`;
}

/* ---------------- Pip, the SoulWake pebble ---------------- */
export const MOODS = ['ecstatic', 'happy', 'neutral', 'grumpy', 'sleepy', 'sulking'];
// Extra poses used for moments rather than moods.
export const POSES = [...MOODS, 'sleeping', 'yawning', 'wave', 'fly'];

const INK = BRAND.navy, LINE = BRAND.olive, SKIN = BRAND.cream, BLUSH = '#F0A2A0', TEAR = '#7FB7E8';
const star = (x, y, r) => `<path d="M${x} ${y - r}Q${x + r * .22} ${y - r * .22} ${x + r} ${y}Q${x + r * .22} ${y + r * .22} ${x} ${y + r}Q${x - r * .22} ${y + r * .22} ${x - r} ${y}Q${x - r * .22} ${y - r * .22} ${x} ${y - r}z" fill="${INK}"/>`;

// pose: a mood or one of POSES. c = { accent, mark }: accent for the party hat, mark for the
// little doodles around Pip (zz, grumpy puffs), which must show on the page behind him.
export function petSVG(pose = 'neutral', c = {}, { size = 120, label = '' } = {}) {
  const ac = c.accent || '#B58C4F', mark = c.mark || INK;
  const eyes = {
    ecstatic: star(42, 46, 6) + star(58, 46, 6),
    happy: `<circle cx="42.5" cy="46" r="4.4" fill="${INK}"/><circle cx="57.5" cy="46" r="4.4" fill="${INK}"/><circle cx="43.8" cy="44.6" r="1.3" fill="#fff"/><circle cx="58.8" cy="44.6" r="1.3" fill="#fff"/>`,
    neutral: `<ellipse cx="42.5" cy="46" rx="3.8" ry="4.6" fill="${INK}"/><ellipse cx="57.5" cy="46" rx="3.8" ry="4.6" fill="${INK}"/><circle cx="43.6" cy="44.4" r="1.2" fill="#fff"/><circle cx="58.6" cy="44.4" r="1.2" fill="#fff"/>`,
    grumpy: `<ellipse cx="42.5" cy="48" rx="3.6" ry="3.2" fill="${INK}"/><ellipse cx="57.5" cy="48" rx="3.6" ry="3.2" fill="${INK}"/>
             <path d="M36 40.5l10 3.6M64 40.5l-10 3.6" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
    sleepy: `<path d="M37.5 47q5 3.6 10 0M52.5 47q5 3.6 10 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
    sulking: `<ellipse cx="42.5" cy="49" rx="3.4" ry="3.8" fill="${INK}"/><ellipse cx="57.5" cy="49" rx="3.4" ry="3.8" fill="${INK}"/>
              <path d="M37 42.5q5-3 10 0M53 42.5q5-3 10 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
              <path d="M63.5 53q2.2 5-.9 7q-3.1-2-.9-7z" fill="${TEAR}"/>`,
    sleeping: `<path d="M37.5 48q5 3.6 10 0M52.5 48q5 3.6 10 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
    yawning: `<path d="M37.5 46q5-3.6 10 0M52.5 46q5-3.6 10 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`
  };
  eyes.wave = eyes.happy; eyes.fly = eyes.ecstatic;
  const mouth = {
    ecstatic: `<path d="M38 55h24a1.5 1.5 0 0 1 1.5 1.7C62.4 64.6 56.8 71 50 71S37.6 64.6 36.5 56.7A1.5 1.5 0 0 1 38 55z" fill="${INK}"/><path d="M43 66.4q7-6 14 0q-7 4.2-14 0z" fill="${BLUSH}"/>`,
    happy: `<path d="M40 56h20a1.4 1.4 0 0 1 1.4 1.6C60.4 63.8 55.8 68.5 50 68.5S39.6 63.8 38.6 57.6A1.4 1.4 0 0 1 40 56z" fill="${INK}"/><path d="M44.2 65.2q5.8-4.8 11.6 0q-5.8 3.4-11.6 0z" fill="${BLUSH}"/>`,
    neutral: `<path d="M44 58q6 4.6 12 0" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>`,
    grumpy: `<path d="M43.5 63q6.5-5 13 0" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>`,
    sleepy: `<ellipse cx="50" cy="60" rx="3" ry="3.4" fill="${INK}"/>`,
    sulking: `<path d="M44.5 63q5.5-3.8 11 0" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`,
    sleeping: `<path d="M46 60.5q4 2.4 8 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`,
    yawning: `<ellipse cx="50" cy="61" rx="6" ry="7.2" fill="${INK}"/><ellipse cx="50" cy="64.5" rx="3.6" ry="2.6" fill="${BLUSH}"/>`
  };
  mouth.wave = mouth.happy; mouth.fly = mouth.ecstatic;
  const blush = ['ecstatic', 'happy', 'wave', 'fly', 'sleeping'].includes(pose)
    ? `<ellipse cx="33.5" cy="56" rx="4.6" ry="3" fill="${BLUSH}" opacity=".6"/><ellipse cx="66.5" cy="56" rx="4.6" ry="3" fill="${BLUSH}" opacity=".6"/>` : '';
  const zz = `<g class="pet-sticker" fill="${mark}" font-family="Georgia,serif" font-weight="700"><text x="74" y="24" font-size="13">z</text><text x="84" y="13" font-size="9.5">z</text></g>`;
  const sticker = {
    ecstatic: `<g class="pet-sticker"><path d="M50 -1l10.5 17H39.5z" fill="${ac}"/><circle cx="50" cy="-1" r="3" fill="${SKIN}"/><circle cx="46" cy="11" r="1.5" fill="${SKIN}"/><circle cx="53.5" cy="7.5" r="1.5" fill="${SKIN}"/></g>`,
    sleepy: zz,
    sleeping: zz,
    grumpy: `<g class="pet-sticker" stroke="${mark}" stroke-width="2.4" stroke-linecap="round" fill="none" opacity=".75"><path d="M12 26q-4-5 0-10M18 21q-4-5 0-10"/><path d="M88 26q4-5 0-10M82 21q4-5 0-10"/></g>`,
    fly: `<g class="pet-sticker" stroke="${LINE}" stroke-width="2.6" stroke-linecap="round" opacity=".9"><path d="M4 44h10M2 56h12M6 68h9"/></g>`
  }[pose] || '';
  // Little stubby hands for waving and flying.
  const hands = pose === 'wave'
    ? `<g class="pet-hand pet-hand-l"><ellipse cx="13" cy="70" rx="6.5" ry="5" fill="${SKIN}" stroke="${LINE}" stroke-width="3"/></g>
       <g class="pet-hand pet-hand-r"><ellipse cx="89" cy="46" rx="6" ry="7" fill="${SKIN}" stroke="${LINE}" stroke-width="3"/></g>`
    : pose === 'fly'
      ? `<g class="pet-hand pet-hand-l"><ellipse cx="11" cy="52" rx="6" ry="6.5" fill="${SKIN}" stroke="${LINE}" stroke-width="3"/></g>
         <g class="pet-hand pet-hand-r"><ellipse cx="89" cy="52" rx="6" ry="6.5" fill="${SKIN}" stroke="${LINE}" stroke-width="3"/></g>` : '';
  const body = pose === 'sleeping' ? 'M50 22C69 22 85.5 44 88 63C90.5 83 74 90.5 50 90.5C26 90.5 9.5 83 12 63C14.5 44 31 22 50 22Z' : PEBBLE;
  const face = pose === 'sleeping' ? '<g transform="translate(0 5)">' : '<g>';
  return `<svg class="pet pet-${pose}" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${label || `Pip is ${pose}`}">
    <ellipse class="pet-shadow" cx="50" cy="94" rx="26" ry="3.6" fill="#000" opacity=".16"/>
    ${sticker}${hands}
    <g class="pet-body"><path d="${body}" fill="${SKIN}" stroke="${LINE}" stroke-width="5" stroke-linejoin="round"/>
      <path d="${pose === 'sleeping' ? 'M28 42q8-11 19-13' : 'M30 34q8-11 19-13'}" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" opacity=".8"/>
      ${face}${blush}${eyes[pose] || eyes.neutral}${mouth[pose] || mouth.neutral}</g></g>
  </svg>`;
}
