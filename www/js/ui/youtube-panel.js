// YouTube / YouTube Music inside the Music tab: share a playlist to SoulWake, or paste its link.
import { on } from '../core/events.js';
import { esc, refs, toast } from '../core/util.js';
import * as youtube from '../features/sources/youtube.js';
import { youtubeIcon } from './brands.js';
import { info } from './components.js';

export function mount(el) {
  function render() {
    const st = youtube.status();
    el.innerHTML = st.url
      ? `<div class="linked"><span>${youtubeIcon(20)}</span><div class="grow"><strong>${st.listId ? 'YouTube playlist' : 'YouTube video'}</strong><span class="small muted">${esc(st.url)}</span></div><button class="icon-btn" data-ref="clear" aria-label="Remove YouTube link">✕</button></div>
         ${st.lastError ? `<p class="small" style="color:var(--danger);margin-top:10px">Last time: ${esc(st.lastError)}</p>` : ''}`
      : `<p class="small soft">In YouTube or YouTube Music, tap <strong>Share → SoulWake</strong> on a playlist. Or paste the link: ${info('YouTube', 'The video shows on the alarm screen while it plays (YouTube’s rules). Ads may play without YouTube Premium. The playlist must be public or unlisted.')}</p>
         <div class="paste-row"><input type="url" data-ref="url" placeholder="https://music.youtube.com/playlist?list=…" autocomplete="off" spellcheck="false" aria-label="YouTube link"><button class="btn line" data-ref="save">Add</button></div>
         <div class="error hidden small" data-ref="err"></div>`;
    const r = refs(el);
    if (r.save) r.save.onclick = () => {
      const res = youtube.setLink(r.url.value);
      if (!res.ok) { r.err.textContent = res.reason; r.err.classList.remove('hidden'); return; }
      toast(res.listId ? 'Playlist saved 🎵' : 'Video saved. It will loop 🎵');
    };
    if (r.clear) r.clear.onclick = () => { youtube.clear(); toast('Link removed.'); };
  }
  on('youtube:changed', render);
  render();
}
