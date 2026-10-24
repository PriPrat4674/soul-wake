// Applies the chosen theme, accent colour, font and style to the whole app.
// Accent shades are tuned per theme so text always meets WCAG AA contrast (4.5:1).
import { on } from '../core/events.js';
import * as profile from '../features/profile.js';
import * as native from '../services/native.js';

// Colours come from the SoulWake palette: burgundy, merlot, antique gold, walnut, champagne,
// ivory, bone, navy, indigo, olive, pine, graphite and tobacco. Each city gets the shades that suit it.
export const THEMES = {
  noir:     { label: 'Noir', note: 'True black. Kindest to your battery.', dark: true,  bg: '#000000', surface: '#140C08', surface2: '#1E140F', hair: '#2E211A', hair2: '#45332A', text: '#E6E0D6', text2: '#CBBFAF', muted: '#9C8D7C' },
  ivory:    { label: 'Ivory', note: 'Warm ivory and espresso ink.', dark: false, bg: '#F7F1EA', surface: '#FFFCF8', surface2: '#ECE4DA', hair: '#E2D6C8', hair2: '#CDBBA7', text: '#280B0F', text2: '#4B1E23', muted: '#6B5446' },
  midnight: { label: 'Midnight', note: 'Navy and champagne, calm at night.', dark: true,  bg: '#131936', surface: '#1C2244', surface2: '#2D2C4A', hair: '#2F3559', hair2: '#454A72', text: '#E9DDCB', text2: '#C9BBA8', muted: '#A497A0' },
  dusk:     { label: 'Dusk', note: 'Tamarind and merlot, soft and cosy.', dark: true,  bg: '#361319', surface: '#441B21', surface2: '#4F2228', hair: '#5E2E34', hair2: '#764148', text: '#F2E4D8', text2: '#E0C9B9', muted: '#C8AB9B' },
  // City themes: each also gets a skyline, live weather and a local headline (features/places.js).
  newyork:  { label: 'New York', note: 'Steel nights, gold windows', city: true, dark: true,  bg: '#1C2430', surface: '#232D3B', surface2: '#2C3747', hair: '#364254', hair2: '#4A586C', text: '#E6E0D6', text2: '#C9C2B6', muted: '#ADA69C' },
  sanfrancisco: { label: 'San Francisco', note: 'Pearl fog, bridge tobacco', city: true, dark: false, bg: '#E8D4C3', surface: '#F7F1EA', surface2: '#DDC6B2', hair: '#D3BCA7', hair2: '#B9A08A', text: '#13273F', text2: '#2A3E57', muted: '#4C5466' },
  kerala:   { label: 'Kerala', note: 'Pine backwaters and palms', city: true, dark: true,  bg: '#1A2B26', surface: '#223631', surface2: '#2B413B', hair: '#36504A', hair2: '#4A655D', text: '#E9DCC6', text2: '#CFC3AA', muted: '#A9A88F' },
  tokyo:    { label: 'Tokyo', note: 'Indigo nights, cherry blossom', city: true, dark: true,  bg: '#100E24', surface: '#1B1834', surface2: '#2D2C4A', hair: '#2E2A4C', hair2: '#433F66', text: '#F7F1EA', text2: '#D8CFD8', muted: '#ABA0B4' },
  seoul:    { label: 'Seoul', note: 'Bone hanji and walnut roofs', city: true, dark: false, bg: '#E6E0D6', surface: '#F7F1EA', surface2: '#DAD2C4', hair: '#D0C6B5', hair2: '#B7AA94', text: '#4B1E23', text2: '#5E2A2E', muted: '#5F5040' }
};

// Ids stay as they were (saved profiles use them); the colours and names are new.
// mode: 'light' = a light button with dark text, 'dark' = a deep button with light text.
// If a button would melt into the page (e.g. burgundy on a merlot theme), it flips to the other mode.
export const ACCENTS = {
  gold: { label: 'Antique Gold', hex: '#B58C4F', mode: 'light' },
  rose: { label: 'Burgundy', hex: '#710927', mode: 'dark' },
  sage: { label: 'Olive', hex: '#6B6F4E', mode: 'light' },
  sky:  { label: 'Navy', hex: '#13273F', mode: 'dark' }
};

export const FONTS = {
  classic:    { label: 'Classic', note: 'Bodoni & Garamond', family: "'Bodoni Moda', serif", weight: 600 },
  modern:     { label: 'Modern', note: 'DM Serif & DM Sans', family: "'DM Serif Display', serif", weight: 400 },
  friendly:   { label: 'Friendly', note: 'Rounded Nunito', family: "'Nunito', sans-serif", weight: 800 },
  typewriter: { label: 'Typewriter', note: 'Courier Prime', family: "'Courier Prime', monospace", weight: 700 },
  techy:      { label: 'Techy', note: 'Space Grotesk, mono clock', family: "'Space Grotesk', sans-serif", weight: 700 },
  kids:       { label: 'Kids’ favourite', note: 'Round, bubbly Fredoka', family: "'Fredoka', sans-serif", weight: 600 },
  formal:     { label: 'Formal', note: 'Engraved Cinzel', family: "'Cinzel', serif", weight: 600 },
  noir:       { label: 'Classic noir', note: '1930s film posters', family: "'Limelight', serif", weight: 400 }
};

export const STYLES = {
  elegant: { label: 'Elegant', note: 'Fine lines, quiet corners' },
  soft:    { label: 'Soft', note: 'Round and cushioned' },
  bold:    { label: 'Bold', note: 'Strong edges, thick lines' }
};

/* ---------- colour maths ---------- */
function hexToHsl(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: s * 100, l: l * 100 };
}
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
// Walks lightness from `start` in `dir` until the colour reaches `min` contrast against `against`.
// `against` may be one colour or a list (page, card, raised card): it must pass on all of them.
function solve(h, s, start, dir, against, min) {
  const list = Array.isArray(against) ? against : [against];
  for (let l = start; l >= 3 && l <= 97; l += dir) {
    const c = hslToHex(h, s, l);
    if (list.every((bg) => contrast(c, bg) >= min)) return c;
  }
  return dir > 0 ? '#FFFFFF' : '#000000';
}

const INK_DARK = '#1A0F0A', INK_LIGHT = '#F7F1EA';
const prefersDarkMode = (a) => a.mode === 'dark';
export function palette(themeId, accentId) {
  const t = THEMES[themeId] || THEMES.midnight;
  const a = ACCENTS[accentId] || ACCENTS.gold;
  const { h, s: sat, l: baseL } = hexToHsl(a.hex);
  const S = Math.max(sat, 22);
  // Button fill: walk lightness from the accent's own shade until its label reads at 7:1.
  const lightFill = solve(h, prefersDarkMode(a) ? Math.min(S, 50) : S, Math.max(baseL, 50), 1, INK_DARK, 7);
  const darkFill = solve(h, S, Math.min(baseL, 40), -1, INK_LIGHT, 7);
  const prefersDark = prefersDarkMode(a);
  let accent = prefersDark ? darkFill : lightFill;
  // A button needs to stand out from the page; if it doesn't, use the other mode.
  if (contrast(accent, t.bg) < 1.3) accent = prefersDark ? lightFill : darkFill;
  const darkButton = accent === darkFill;
  const onAccent = darkButton ? INK_LIGHT : INK_DARK;
  const accentHi = darkButton ? hslToHex(h, S, Math.min(60, accentL(accent) + 9)) : hslToHex(h, S, Math.min(90, accentL(accent) + 12));
  const grounds = [t.bg, t.surface, t.surface2];
  const accentText = t.dark ? solve(h, Math.min(100, S + 8), 62, 1, grounds, 4.6) : solve(h, Math.min(100, S + 10), 38, -1, grounds, 4.6);
  const accentLine = t.dark ? hslToHex(h, Math.max(10, S - 10), 38) : hslToHex(h, Math.max(10, S - 10), 62);
  const danger = t.dark ? solve(4, 60, 58, 1, grounds, 4.6) : solve(354, 70, 40, -1, grounds, 4.6);
  return {
    '--bg': t.bg, '--surface': t.surface, '--surface-2': t.surface2, '--hair': t.hair, '--hair-2': t.hair2,
    '--text': t.text, '--text-2': t.text2, '--muted': t.muted,
    '--accent': accent, '--accent-hi': accentHi, '--accent-text': accentText, '--accent-line': accentLine, '--on-accent': onAccent,
    '--warm': t.dark ? '#D9A36A' : '#8A5A2B', '--danger': danger, '--danger-line': t.dark ? '#6E1F21' : '#E4B2AC', '--ok': t.dark ? '#B7BC8C' : '#4F5A2E',
    '--olive': '#B1B864', '--wake-blue': t.dark ? '#8EA6DA' : '#5E7EC0'
  };
}
function accentL(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return ((Math.max(r, g, b) + Math.min(r, g, b)) / 2) * 100;
}

/* ---------- apply ---------- */
export function apply(p = profile.get()) {
  const root = document.documentElement;
  const vars = palette(p.theme, p.accent);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.theme = p.theme;
  root.dataset.accent = p.accent;
  root.dataset.font = p.font;
  root.dataset.style = p.style;
  root.style.colorScheme = THEMES[p.theme].dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', vars['--bg']);
  native.setStatusBar(THEMES[p.theme].dark);
  return vars;
}

// Colours for drawing the logo and Pip in the current theme.
export function artColours(p = profile.get()) {
  const v = palette(p.theme, p.accent);
  return { bg: v['--bg'], fg: v['--text'], accent: v['--accent'], mark: v['--text-2'], ink: '#23214A' };
}

let lastLogo = null;
export function init() {
  apply();
  lastLogo = profile.get().logo;
  on('profile:changed', (p) => {
    apply(p);
    if (p.logo !== lastLogo) { lastLogo = p.logo; native.setIcon(p.logo); }
  });
}
