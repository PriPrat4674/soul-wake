// Wake-up boost: plays your voice note, then a clip. Opens after a passed check-in.
import { on } from '../core/events.js';
import { refs } from '../core/util.js';
import * as audio from '../services/audio.js';

export function mount(root) {
  root.className = 'modal hidden';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Wake-up boost');
  root.innerHTML = `
    <div class="inner">
      <h1 data-ref="title" style="font-size:2.2rem"></h1>
      <div data-ref="body" style="margin-top:16px"></div>
      <button class="btn gold block" data-ref="close" style="margin-top:18px" disabled>Back to my tasks</button>
    </div>`;
  const r = refs(root);
  let url = null, unlockTimer = null;

  const allowClose = (ms) => { clearTimeout(unlockTimer); unlockTimer = setTimeout(() => { r.close.disabled = false; }, ms); };
  function close() {
    audio.stopAll();
    clearTimeout(unlockTimer);
    r.body.innerHTML = '';
    if (url) { URL.revokeObjectURL(url); url = null; }
    root.classList.add('hidden');
  }

  function showClip(clip) {
    if (!clip) { r.close.disabled = false; return; }
    r.title.textContent = 'Watch this, then go 🚀';
    if (clip.link) {
      // Played in the site's own embedded player (credit stays with the creator).
      const src = clip.site === 'youtube'
        ? `https://www.youtube.com/embed/${encodeURIComponent(clip.vid)}?autoplay=1&playsinline=1&rel=0`
        : `https://www.instagram.com/${clip.kind === 'p' ? 'p' : 'reel'}/${encodeURIComponent(clip.vid)}/embed`;
      r.body.innerHTML = `<div class="clip-embed ${clip.site}"><iframe src="${src}" title="Motivation clip" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="eager"></iframe></div>
        ${clip.site === 'instagram' ? '<p class="small muted" style="margin-top:6px">Tap the reel to play it.</p>' : ''}`;
      allowClose(8000);
      return;
    }
    url = URL.createObjectURL(clip.blob);
    r.body.innerHTML = `<video class="clip" playsinline controls autoplay src="${url}"></video>`;
    const v = r.body.querySelector('video');
    v.onended = () => { r.close.disabled = false; };
    v.play().catch(() => {});
    allowClose(8000);
  }

  r.close.onclick = close;
  on('morning:ringing', close);
  on('boost:show', async ({ voice, clip }) => {
    r.close.disabled = true;
    root.classList.remove('hidden');
    if (voice) {
      r.title.textContent = 'A message from past you';
      r.body.innerHTML = '<p class="soft italic" style="font-size:1.15rem">Playing the voice note you recorded last night…</p>';
      const ok = await audio.playBlob(voice.blob, { onEnded: () => showClip(clip) });
      if (ok) allowClose(8000); else showClip(clip);
    } else showClip(clip);
  });
}
