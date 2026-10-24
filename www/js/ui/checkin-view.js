// "Still up?" full-screen prompt with a draining ring.
import { on } from '../core/events.js';
import { refs } from '../core/util.js';
import * as checkin from '../features/checkin.js';

const C = 2 * Math.PI * 96;

export function mount(root) {
  root.className = 'modal hidden';
  root.setAttribute('role', 'alertdialog');
  root.setAttribute('aria-label', 'Check-in');
  root.innerHTML = `
    <div class="inner">
      <h1 style="font-size:2.8rem">Still up?</h1>
      <p class="soft" style="margin-top:6px">Tap before it runs out ⏳</p>
      <div class="ring-count">
        <svg viewBox="0 0 210 210" aria-hidden="true"><circle class="track" cx="105" cy="105" r="96" fill="none" stroke-width="6"/><circle class="bar" data-ref="bar" cx="105" cy="105" r="96" fill="none" stroke-width="6" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg>
        <div class="n" data-ref="count" aria-live="assertive"></div>
      </div>
      <button class="btn gold block" data-ref="yes" style="min-height:64px;font-size:1.25rem">I’m up</button>
    </div>`;
  const r = refs(root);
  let total = 60;

  const paint = (leftMs) => {
    const s = Math.max(0, Math.ceil(leftMs / 1000));
    r.count.textContent = s;
    r.bar.style.strokeDashoffset = String(C * (1 - Math.min(1, leftMs / (total * 1000))));
  };

  r.yes.onclick = () => checkin.confirmAwake();
  on('checkin:open', ({ deadline }) => {
    total = checkin.settings().windowSec;
    paint(deadline - Date.now());
    root.classList.remove('hidden');
    r.yes.focus();
  });
  on('checkin:countdown', ({ left }) => paint(left));
  on('checkin:closed', () => root.classList.add('hidden'));
}
