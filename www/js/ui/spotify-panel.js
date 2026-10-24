// Spotify inside the Music tab. Two ways in:
//  • Connect Spotify (full songs, Premium): one tap, no Client ID to type.
//  • Share a playlist from the Spotify app to SoulWake, or paste its link (30-second previews).
import { on } from '../core/events.js';
import { esc, refs, toast } from '../core/util.js';
import * as spotify from '../features/sources/spotify.js';
import * as native from '../services/native.js';
import { spotifyIcon } from './brands.js';
import { info } from './components.js';

export function mount(el) {
  let lists = null, loading = false;

  function linkBlock(st) {
    return st.link
      ? `<div class="linked"><span>${spotifyIcon(22)}</span><div class="grow"><strong>${esc(st.link.name)}</strong><span class="small muted">Shared ${esc(st.link.type)} · 30-second previews</span></div><button class="icon-btn" data-ref="unlink" aria-label="Remove shared ${esc(st.link.type)}">✕</button></div>
         <button class="btn spotify-btn" data-ref="open">${spotifyIcon(20)} PLAY ON SPOTIFY</button>`
      : `<p class="small soft" style="margin-top:12px">No Premium? In Spotify, tap <strong>Share → SoulWake</strong> on any playlist. Or paste the link:</p>
         <div class="paste-row"><input type="url" data-ref="link" placeholder="https://open.spotify.com/playlist/…" autocomplete="off" spellcheck="false" aria-label="Spotify link"><button class="btn line" data-ref="saveLink">Add</button></div>
         <div class="error hidden small" data-ref="err"></div>`;
  }

  function render() {
    const st = spotify.status();
    if (st.connected) {
      el.innerHTML = `
        <div class="linked"><span>${spotifyIcon(22)}</span><div class="grow"><strong>${esc(st.user?.name || 'Spotify')}</strong><span class="small muted">${st.playlist ? esc(st.playlist.name) : 'Choose a playlist'}</span></div><button class="btn quiet" data-ref="load">${lists ? 'Refresh' : 'Playlists'}</button></div>
        <ul class="list ${lists ? '' : 'hidden'}" data-ref="lists"></ul>
        ${st.lastError ? `<p class="small" style="color:var(--danger);margin-top:10px">Last time: ${esc(st.lastError)}</p>` : ''}
        <button class="btn quiet" data-ref="out">Disconnect</button>`;
    } else {
      el.innerHTML = `
        ${st.canConnect ? `<button class="btn spotify-btn block" data-ref="connect">${spotifyIcon(22)} Connect Spotify</button>
          <p class="small muted center-text">Full songs · needs Premium ${info('Connect Spotify', 'Full songs need Spotify Premium, and your account must be on SoulWake’s Spotify list (Spotify allows 5 accounts for small apps). Without it, share a playlist: you get 30-second previews, which is all an alarm needs.')}</p>` : ''}
        ${st.lastError ? `<p class="small" style="color:var(--danger);margin-top:8px">${esc(st.lastError)}</p>` : ''}
        ${linkBlock(st)}`;
    }
    const r = refs(el);
    if (r.connect) r.connect.onclick = async () => { const res = await spotify.connect(); if (!res.ok) toast(res.reason); };
    if (r.saveLink) r.saveLink.onclick = () => {
      const res = spotify.setLink(r.link.value);
      if (!res.ok) { r.err.textContent = res.reason; r.err.classList.remove('hidden'); return; }
      toast(`${res.name} added 🎵`);
    };
    if (r.unlink) r.unlink.onclick = () => { spotify.clearLink(); toast('Removed.'); };
    if (r.open) r.open.onclick = () => native.openUrl(native.isNative() ? spotify.appUri() : spotify.webUrl());
    if (r.lists && lists) {
      r.lists.innerHTML = lists.length
        ? lists.map((p) => `<li><div class="grow"><strong>${esc(p.name)}</strong>${p.total != null ? `<span class="small muted">${p.total} songs</span>` : ''}</div><button class="btn line" data-pick="${esc(p.id)}" style="min-height:40px;padding:6px 14px">${st.playlist?.id === p.id ? 'Chosen' : 'Use'}</button></li>`).join('')
        : '<li class="empty">No playlists on this account.</li>';
    }
    if (r.load) r.load.onclick = async () => {
      if (loading) return;
      loading = true; r.load.textContent = 'Loading…';
      try { lists = await spotify.playlists(); } catch (e) { toast(e.message || 'Couldn’t load playlists.'); }
      loading = false; render();
    };
    if (r.lists) r.lists.onclick = (e) => {
      const b = e.target.closest('[data-pick]');
      if (!b) return;
      spotify.choosePlaylist(lists.find((p) => p.id === b.dataset.pick));
      toast('Playlist chosen 🎵');
    };
    if (r.out) r.out.onclick = () => { spotify.disconnect(); lists = null; toast('Spotify disconnected.'); };
  }

  on('spotify:changed', render);
  render();
  return { render };
}
