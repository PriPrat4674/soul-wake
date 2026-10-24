// "Install on your phone" panel. Hidden once the app runs from the home screen.
import { refs } from '../core/util.js';

export function mount(container) {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const panel = document.createElement('div');
  panel.className = 'card';
  panel.innerHTML = `
    <h3>Install on your phone</h3>
    <p class="small" style="margin-top:.3rem">${ios
      ? 'In Safari, tap the Share button, then "Add to Home Screen." Open it from your home screen after that.'
      : 'In Chrome, open the menu and tap "Add to Home screen" or "Install app."'}</p>
    <button class="btn block hidden" data-ref="install" style="margin-top:.8rem">Install app</button>`;
  container.appendChild(panel);
  const r = refs(panel);

  let prompt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); prompt = e; r.install.classList.remove('hidden'); });
  r.install.onclick = async () => {
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    prompt = null;
    r.install.classList.add('hidden');
  };
}
