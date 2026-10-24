// Friendly words that change with the day. Pure functions: same inputs, same message,
// so a line doesn't flicker on every redraw but does change from day to day.
import { dayNumber } from '../core/util.js';

const pickBy = (list, seed) => list[Math.abs(seed) % list.length];
const fmt = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

// Buckets by minutes after midnight. {t} is replaced with the time.
const ALARM_LINES = [
  { upTo: 240, lines: ['Whoa, {t}? Even the stars are yawning 🌌', 'A {t} start. Legendary hours 🌌', '{t}! Bold. Very bold. We believe in you 💪'] },
  { upTo: 330, lines: ['Oho! We have an early riser tomorrow!! 🌅', 'Oho! An early riser at {t}! The sun will have to hurry 🌅', 'Up before the sun? Oho, main-character energy ✨'] },
  { upTo: 390, lines: ['Early bird mode: on 🐦', 'Sunrise club, party of one ☀️', '{t}. Quiet streets, fresh air, all yours 🌄'] },
  { upTo: 450, lines: ['A solid, sensible {t}. Classic you ✨', '{t}: the sweet spot. Let’s do this 🌤️', 'Right on time for a calm morning 🍵'] },
  { upTo: 510, lines: ['Easing in at {t}. Coffee’s on standby ☕', 'A relaxed {t} start. We’ll still make it count 🌼', '{t}. Plenty of sleep banked, nice 😌'] },
  { upTo: 600, lines: ['A gentle {t} start. Rest is productive too 🛌', 'Late-ish morning? Zero judgement here 🫶', '{t}. Sleep in, then shine 🌞'] },
  { upTo: 720, lines: ['A late morning, huh? Night owl spotted 🌙', '{t}? Brunch-time riser. Iconic 🥐', 'Taking it slow at {t}. Your body says thanks 😴'] },
  { upTo: 1440, lines: ['An afternoon alarm? Night shift hero 🦸', '{t}. Whatever your schedule, we’ve got you 💛', 'Different rhythm, same mission ⏰'] }
];
const WEEKEND = ['Weekend {t}, look at you go 🎉', 'A weekend alarm? Discipline unlocked 🔓', 'Saturday-ish vibes, still showing up 😎'];

export function alarmMessage(hhmm, { date = new Date(), streak = 0, name = '' } = {}) {
  const [h, m] = String(hhmm || '06:30').split(':').map(Number);
  const mins = (Number.isFinite(h) ? h : 6) * 60 + (Number.isFinite(m) ? m : 30);
  const seed = dayNumber(date) + mins;
  const bucket = ALARM_LINES.find((b) => mins < b.upTo) || ALARM_LINES[ALARM_LINES.length - 1];
  const weekend = [0, 6].includes(date.getDay()) && mins >= 330 && mins < 600;
  let text = pickBy(weekend && seed % 2 ? WEEKEND : bucket.lines, seed).replace('{t}', fmt(hhmm));
  if (streak >= 3) text += ` Streak: ${streak} 🔥`;
  if (name && seed % 3 === 0) text = `${name}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  return text;
}

export function greeting(name = '', hour = new Date().getHours()) {
  const who = name ? `, ${name}` : '';
  if (hour < 4) return `Up late${who}? 🌙`;
  if (hour < 12) return `Good morning${who} ☀️`;
  if (hour < 17) return `Good afternoon${who} 🌤️`;
  if (hour < 21) return `Good evening${who} 🌆`;
  return `Getting late${who} 🌙`;
}

const PET_LINES = {
  ecstatic: ['{streak} days in a row?! I’m throwing a party 🎉', 'You’re unstoppable. I’m wearing a hat for you 🥳', 'Streak legend. I’m telling every pebble on the beach ✨'],
  happy: ['Nice one. I’m proud of you 🫶', 'Morning proven. That’s my human 💛', 'Look at us, being consistent 😌'],
  neutral: ['Ready when you are ⏰', 'Let’s make tomorrow a good one 🌅', 'Set an alarm, I’ll keep watch 🌙'],
  grumpy: ['Snoozing? Really? Hmph 😤', 'I saw that snooze. I’m not mad, just… grumpy 😒', 'The pillow won this round. Not again, okay? 🙄'],
  sleepy: ['It’s late. Phone down, eyes closed 😴', 'Bedtime-ish. I’m already yawning 🥱', 'Sweet dreams soon? Tomorrow-you says thanks 🌙'],
  sulking: ['Our streak broke… I’ll get over it. Probably 🥺', 'I miss our streak. Start a new one tomorrow? 💧', 'Day one again. I believe in comebacks 🌱']
};

export function petLine(mood, { streak = 0, name = '', date = new Date() } = {}) {
  const list = PET_LINES[mood] || PET_LINES.neutral;
  return pickBy(list, dayNumber(date) + mood.length).replace('{streak}', streak).replace('{name}', name);
}

export function doneMessage(grade, name = '') {
  const who = name ? `, ${name}` : '';
  if (grade === 'A+' || grade === 'A') return `Flawless${who}! Have a gold star ⭐`;
  if (grade?.startsWith('B')) return `Solid morning${who} 👏`;
  if (grade === 'C') return `You got there${who}. That counts 💪`;
  return `Rough one${who}, but you’re up. Tomorrow’s a fresh start 🌱`;
}
