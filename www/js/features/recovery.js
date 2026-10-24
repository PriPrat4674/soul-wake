// "Running on little sleep" plan: shows up only after a short night.
// Every tip is cheap or free, and backed by a study (sources listed with each tip).
import { load, save } from '../core/storage.js';
import { emit } from '../core/events.js';
import { dayKey } from '../core/util.js';
import * as sleep from './sleep.js';

export const TIPS = [
  {
    id: 'light', emoji: '☀️', title: 'Get daylight early',
    body: 'Step outside or sit by a window for 15–30 minutes this morning. Free, and it lifts your mood.',
    why: 'In sleep-deprived young people, 30 minutes of bright light lowered negative mood.',
    source: 'Kopřivová et al., Frontiers in Behavioral Neuroscience, 2025',
    url: 'https://www.frontiersin.org/journals/behavioral-neuroscience/articles/10.3389/fnbeh.2025.1673093/full'
  },
  {
    id: 'stairs', emoji: '🚶', title: '10 minutes of stairs when you crash',
    body: 'Walk up and down stairs at an easy pace. No gym, no money needed.',
    why: 'Sleep-deprived college students felt more energetic after 10 minutes of stair walking than after a can of soda’s worth of caffeine.',
    source: 'Randolph & O’Connor, Physiology & Behavior, 2017',
    url: 'https://www.sciencedaily.com/releases/2017/04/170420094222.htm'
  },
  {
    id: 'coffee', emoji: '☕', title: 'One coffee, early',
    body: 'Have your coffee or chai in the morning. Skip caffeine after about 5 pm so tonight isn’t short too.',
    why: 'Caffeine even 6 hours before bed cut sleep by over an hour, and people didn’t notice.',
    source: 'Drake et al., Journal of Clinical Sleep Medicine, 2013',
    url: 'https://aasm.org/late-afternoon-and-early-evening-caffeine-can-disrupt-sleep-at-night/'
  },
  {
    id: 'nap', emoji: '😴', title: 'A 10-minute nap, before 3 pm',
    body: 'Set a timer for 10–15 minutes. Longer naps tend to leave you groggier.',
    why: 'After restricted sleep, a 10-minute afternoon nap was the most refreshing of the lengths tested.',
    source: 'Brooks & Lack, SLEEP, 2006',
    url: 'https://doi.org/10.1093/sleep/29.6.831'
  },
  {
    id: 'music', emoji: '🎧', title: 'Play something upbeat',
    body: 'Fast, happy, major-key songs while you study or commute.',
    why: 'Ten minutes of happy, fast music boosted alertness; melodic wake-up sounds are linked to less morning grogginess.',
    source: 'Dovorany et al., Frontiers in Psychology, 2023; McFarlane et al., PLOS ONE, 2020',
    url: 'https://www.frontiersin.org/articles/10.3389/fpsyg.2023.1029773/full'
  },
  {
    id: 'scroll', emoji: '📵', title: 'Keep Instagram to about 10 minutes',
    body: 'Tired brains doom-scroll. Set a limit, or lock it in SoulWake until your tasks are done.',
    why: 'Students who limited social media to about 10 minutes per app a day for three weeks felt less lonely and less depressed.',
    source: 'Hunt et al., Journal of Social and Clinical Psychology, 2018',
    url: 'https://www.sciencedaily.com/releases/2018/11/181108164316.htm'
  },
  {
    id: 'tonight', emoji: '🌙', title: 'Protect tonight',
    body: 'Go to bed 30–60 minutes earlier than usual. Aim for 7–9 hours.',
    why: '7–9 hours is the recommended range for adults 18–25.',
    source: 'Hirshkowitz et al., Sleep Health, 2015 (National Sleep Foundation)',
    url: 'https://doi.org/10.1016/j.sleh.2014.12.010'
  }
];

let s = load('recovery', { date: null, done: [] });
if (!Array.isArray(s.done)) s.done = [];

// Shows after a short night, for the rest of that day.
export function active(now = new Date()) {
  const n = sleep.lastNight(now);
  if (!n) return null;
  const c = sleep.classify(n.hours);
  return c?.key === 'short' ? { hours: n.hours, goal: sleep.get().schedule.goal } : null;
}

export function done(now = new Date()) {
  return s.date === dayKey(now) ? s.done.slice() : [];
}

export function toggle(id, now = new Date()) {
  if (!TIPS.some((t) => t.id === id)) return null;
  if (s.date !== dayKey(now)) s = { date: dayKey(now), done: [] };
  s.done = s.done.includes(id) ? s.done.filter((x) => x !== id) : [...s.done, id];
  save('recovery', s);
  emit('recovery:changed', done(now));
  return s.done.includes(id);
}
