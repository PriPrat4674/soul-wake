// City themes: live details for New York, San Francisco, Kerala, Tokyo and Seoul.
// Every source is free and needs no key or sign-up, so nobody has to configure anything:
//   Weather + sunrise: Open-Meteo (open-meteo.com, CC BY 4.0, free for non-commercial use)
//   Headline:          GDELT DOC 2.0 API (gdeltproject.org), filtered to upbeat stories
//   Did you know:      Wikipedia page summaries (CC BY-SA), with offline facts as a fallback
// Data is cached and refreshed at most hourly (weather), every 6 h (news) and daily (facts).
import { load, save } from '../core/storage.js';
import { on, emit } from '../core/events.js';
import { dayNumber, dayKey } from '../core/util.js';
import * as profile from './profile.js';
import * as native from '../services/native.js';

export const PLACES = {
  newyork: {
    name: 'New York', lat: 40.7128, lon: -74.006, tz: 'America/New_York', news: '"New York City"',
    wiki: ['Central_Park', 'Statue_of_Liberty', 'Brooklyn_Bridge', 'Empire_State_Building', 'New_York_City_Subway', 'Coney_Island', 'Broadway_theatre'],
    facts: ['Central Park is bigger than the whole country of Monaco.', 'The Statue of Liberty was a gift from the people of France, unveiled in 1886.', 'The subway runs all night, every night.']
  },
  sanfrancisco: {
    name: 'San Francisco', lat: 37.7749, lon: -122.4194, tz: 'America/Los_Angeles', news: '"San Francisco"',
    wiki: ['Golden_Gate_Bridge', 'San_Francisco_cable_car_system', 'Alcatraz_Island', 'Golden_Gate_Park', 'Painted_ladies', 'Lombard_Street_(San_Francisco)', 'Chinatown,_San_Francisco'],
    facts: ['The Golden Gate Bridge’s colour is called International Orange.', 'The cable cars are a moving National Historic Landmark.', 'Locals call the summer fog “Karl”.']
  },
  kerala: {
    name: 'Kerala', lat: 9.9312, lon: 76.2673, tz: 'Asia/Kolkata', news: 'Kerala',
    wiki: ['Kathakali', 'Onam', 'Vallam_kali', 'Munnar', 'Kerala_backwaters', 'Theyyam', 'Sadhya', 'Kalaripayattu'],
    facts: ['Snake boats in Kerala’s boat races are over 30 metres long.', 'Kerala has the highest literacy rate of any Indian state.', 'An Onam sadhya can have more than 20 dishes on one banana leaf.']
  },
  tokyo: {
    name: 'Tokyo', lat: 35.6762, lon: 139.6503, tz: 'Asia/Tokyo', news: 'Tokyo',
    wiki: ['Tokyo_Tower', 'Shibuya_Crossing', 'Asakusa', 'Mount_Fuji', 'Hanami', 'Shinkansen', 'Tsukiji_fish_market'],
    facts: ['Thousands of people cross Shibuya Crossing at every green light.', 'Tokyo Tower is painted white and orange to meet air-safety rules.', 'The first Shinkansen bullet train ran in 1964.']
  },
  seoul: {
    name: 'Seoul', lat: 37.5665, lon: 126.978, tz: 'Asia/Seoul', news: 'Seoul',
    wiki: ['N_Seoul_Tower', 'Gyeongbokgung', 'Bukchon_Hanok_Village', 'Cheonggyecheon', 'Hangul', 'Kimchi', 'Bukhansan'],
    facts: ['Hangul, the Korean alphabet, was created in the 1440s under King Sejong.', 'N Seoul Tower sits on Namsan, a mountain in the middle of the city.', 'The Cheonggyecheon stream was brought back to downtown Seoul in 2005.']
  }
};

export const CREDITS = 'Weather by Open-Meteo · Headlines via GDELT · Facts from Wikipedia';

const HOUR = 3_600_000;
const FRESH = { weather: HOUR, news: 6 * HOUR, newsEmpty: 2 * HOUR };
// Headlines with these words are skipped: nobody needs bad news first thing in the morning.
const GLOOM = /\b(kill|killed|dead|death|dies|died|murder|rape|assault|crash|war|attack|shooting|shot|stab|accident|suicide|arrest|police|fire|flood|blast|bomb|terror|victim|injur|abuse|lawsuit|sued|court|probe|scam|fraud|layoff|strike|protest|disaster|collapse|missing|body|bodies)\w*/i;

let cache = load('places', {});
if (!cache || typeof cache !== 'object' || Array.isArray(cache)) cache = {};
let inflight = null;

export const current = () => {
  const t = profile.get().theme;
  return PLACES[t] ? { id: t, ...PLACES[t] } : null;
};

/* ---------- helpers ---------- */
const WEATHER = [
  [[0], 'Clear', '☀️', null], [[1], 'Mostly clear', '🌤️', null], [[2], 'Partly cloudy', '⛅', 'cloud'], [[3], 'Cloudy', '☁️', 'cloud'],
  [[45, 48], 'Foggy', '🌫️', 'fog'], [[51, 53, 55, 56, 57], 'Drizzle', '🌦️', 'rain'], [[61, 63, 65, 66, 67, 80, 81, 82], 'Rain', '🌧️', 'rain'],
  [[71, 73, 75, 77, 85, 86], 'Snow', '❄️', 'snow'], [[95, 96, 99], 'Thunderstorm', '⛈️', 'storm']
];
export function describeWeather(code, isDay = true) {
  const w = WEATHER.find(([codes]) => codes.includes(Number(code)));
  if (!w) return { label: 'Weather', emoji: '🌡️', fx: null };
  const emoji = !isDay && (code === 0 || code === 1) ? '🌙' : w[2];
  return { label: w[1], emoji, fx: w[3] };
}

// "2026-10-10T05:58" in a place whose UTC offset is `offsetSec` → epoch ms.
export function localIsoToMs(iso, offsetSec) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - (Number(offsetSec) || 0) * 1000;
}

// Minutes since midnight in a time zone (falls back to the phone's own clock).
export function minutesIn(tz, at = Date.now()) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(at));
    const h = +parts.find((p) => p.type === 'hour').value, m = +parts.find((p) => p.type === 'minute').value;
    return h * 60 + m;
  } catch {
    const d = new Date(at);
    return d.getHours() * 60 + d.getMinutes();
  }
}
export function clockIn(tz, at = Date.now()) {
  try { return new Date(at).toLocaleTimeString([], { timeZone: tz, hour: 'numeric', minute: '2-digit' }); }
  catch { return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
}

// JSON over HTTP. In the Android app this goes through the native HTTP client, so sites
// that don't allow browser requests (CORS) still work.
async function getJSON(url, ms = 8000) {
  const http = native.isNative() ? window.Capacitor?.Plugins?.CapacitorHttp : null;
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
  const go = async () => {
    if (http?.get) {
      const r = await http.get({ url, responseType: 'json', headers: { Accept: 'application/json' } });
      if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`);
      return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    }
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };
  return Promise.race([go(), timeout]);
}

export function firstSentence(text, max = 170) {
  const t = String(text || '').replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  const m = /^(.{30,}?[.!?])\s+[A-Z]/.exec(t + ' X');
  let s = m ? m[1] : t;
  if (s.length > max) s = s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  return s;
}

export function cleanHeadline(title) {
  let t = String(title || '').replace(/\s+/g, ' ').trim();
  t = t.replace(/\s+[-|–—]\s+[^-|–—]{2,40}$/, ''); // drop " - Site Name"
  if (t === t.toUpperCase() && /[A-Z]/.test(t)) t = t.charAt(0) + t.slice(1).toLowerCase();
  return t.length > 120 ? t.slice(0, 119).replace(/\s+\S*$/, '') + '…' : t;
}
export const isUpbeat = (title) => !!title && !GLOOM.test(title);

/* ---------- fetchers ---------- */
async function fetchWeather(p) {
  const q = new URLSearchParams({ latitude: p.lat, longitude: p.lon, current: 'temperature_2m,weather_code,is_day', daily: 'sunrise,sunset', timezone: 'auto', forecast_days: '1' });
  const d = await getJSON(`https://api.open-meteo.com/v1/forecast?${q}`);
  const off = d.utc_offset_seconds;
  return {
    at: Date.now(),
    temp: Math.round(Number(d.current?.temperature_2m)),
    code: Number(d.current?.weather_code ?? -1),
    isDay: d.current?.is_day !== 0,
    sunrise: localIsoToMs(d.daily?.sunrise?.[0], off),
    sunset: localIsoToMs(d.daily?.sunset?.[0], off)
  };
}

async function fetchNews(p) {
  const q = new URLSearchParams({ query: `${p.news} sourcelang:english tone>3`, mode: 'artlist', maxrecords: '30', format: 'json', sort: 'datedesc', timespan: '3d' });
  const d = await getJSON(`https://api.gdeltproject.org/api/v2/doc/doc?${q}`, 10000);
  const pick = (d.articles || []).map((a) => ({ title: cleanHeadline(a.title), url: a.url, source: a.domain })).find((a) => a.title.length > 20 && isUpbeat(a.title) && /^https?:\/\//.test(a.url || ''));
  return { at: Date.now(), item: pick || null };
}

async function fetchFact(p, day) {
  const title = p.wiki[day % p.wiki.length];
  const d = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  const text = firstSentence(d.extract);
  if (!text || text.length < 25) throw new Error('empty');
  return { date: dayKey(), text, url: d.content_urls?.mobile?.page || `https://en.wikipedia.org/wiki/${title}`, source: 'Wikipedia' };
}

/* ---------- public ---------- */
// What to show right now for the current city (cached data, plus an offline fact).
export function info(now = Date.now()) {
  const p = current();
  if (!p) return null;
  const c = cache[p.id] || {};
  const w = c.weather && now - c.weather.at < 6 * HOUR ? { ...c.weather, ...describeWeather(c.weather.code, c.weather.isDay) } : null;
  const day = dayNumber(new Date(now));
  const fact = c.fact?.date === dayKey(new Date(now)) ? c.fact : { text: p.facts[day % p.facts.length], source: null, url: null };
  const news = c.news?.item || null;
  return { id: p.id, name: p.name, tz: p.tz, time: clockIn(p.tz, now), weather: w, news, fact, headlineFirst: day % 2 === 0 };
}

export async function refresh({ force = false } = {}) {
  const p = current();
  if (!p || inflight) return inflight;
  const c = (cache[p.id] ||= {});
  const now = Date.now();
  const jobs = [];
  if (force || !c.weather || now - c.weather.at > FRESH.weather) jobs.push(fetchWeather(p).then((w) => { c.weather = w; }).catch(() => {}));
  if (force || !c.news || now - c.news.at > (c.news.item ? FRESH.news : FRESH.newsEmpty)) jobs.push(fetchNews(p).then((n) => { c.news = n; }).catch(() => { c.news = { at: now, item: c.news?.item || null }; }));
  if (force || c.fact?.date !== dayKey()) jobs.push(fetchFact(p, dayNumber()).then((f) => { c.fact = f; }).catch(() => {}));
  if (!jobs.length) return null;
  inflight = Promise.all(jobs).then(() => {
    save('places', cache);
    emit('place:changed', info());
  }).finally(() => { inflight = null; });
  return inflight;
}

// Keep it fresh while the app is open with a city theme, never in the background.
on('profile:changed', () => { if (current()) refresh(); else emit('place:changed', null); });
setInterval(() => { if (current() && document.visibilityState === 'visible') refresh(); }, 15 * 60_000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && current()) refresh(); });
