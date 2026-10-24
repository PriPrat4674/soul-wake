// "Nap's over" screen: shows when the nap timer rings. "I'm up" stops it and logs the nap as sleep.
import { on } from '../core/events.js';
import { refs, toast, fmtTime, vibrateTap } from '../core/util.js';
import * as sleep from '../features/sleep.js';
import * as sounds from '../features/sounds.js';
import * as audio from '../services/audio.js';
import * as native from '../services/native.js';
import { petMarkup } from './pet-view.js';

const fmtNap = (h) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${Math.round(h * 10) / 10} h`);

export function mount(root) {
  root.className = 'modal hidden';
  root.setAttribute('role', 'alertdialog');
  root.setAttribute('aria-label', 'Nap over');
  root.innerHTML = `
    <div class="inner center">
      <div data-ref="pet"></div>
      <h1 style="margin-top:12px">Nap’s over ☀️</h1>
      <p class="soft" data-ref="line" style="margin-top:6px"></p>
      <button class="btn gold block" data-ref="up" style="margin-top:22px;min-height:64px;font-size:1.25rem">I’m up</button>
    </div>`;
  const r = refs(root);

  function show(nap) {
    r.pet.innerHTML = petMarkup('sleepy', 120);
    r.line.textContent = `You slept from ${fmtTime(new Date(nap.startAt))}. Up you get 🌤️`;
    root.classList.remove('hidden');
    if (!native.isNative()) { sounds.startLoop('alarm').then((ok) => { if (!ok) audio.startBeeps(); }); audio.vibrate(true); }
    r.up.focus();
  }
  function hide() {
    root.classList.add('hidden');
    sounds.stopLoop(); audio.stopBeeps(); audio.vibrate(false);
  }
  r.up.onclick = () => {
    vibrateTap(30);
    const n = sleep.endNap();
    hide();
    toast(n ? `Nap logged: ${fmtNap(n.hours)} 😴` : 'Morning-ish! ☀️');
  };
  on('nap:ring', show);
  on('nap:ended', hide);
  const st = sleep.napState();
  if (st?.rang) show(st);
}
