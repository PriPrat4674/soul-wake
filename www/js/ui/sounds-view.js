// Wake-up music (☰ menu): what wakes you (your songs, Spotify, YouTube), the punishment song, and the wake-up boost.
import { on } from '../core/events.js';
import { esc, refs, toast, fmtTime } from '../core/util.js';
import * as music from '../features/music.js';
import * as songs from '../features/songs.js';
import * as boost from '../features/boost.js';
import * as audio from '../services/audio.js';
import { ICONS, info } from './components.js';
import * as spotifyPanel from './spotify-panel.js';
import * as youtubePanel from './youtube-panel.js';
import { spotifyIcon, youtubeIcon, instagramIcon } from './brands.js';
import * as tabs from './tabs.js';

const NOTE = '<svg class="brand-ico" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>';
const SOURCE_OPTIONS = [{ value: 'local', label: 'My songs', icon: NOTE }, { value: 'spotify', label: 'Spotify', icon: spotifyIcon(22) }, { value: 'youtube', label: 'YouTube', icon: youtubeIcon(20) }];
const mb = (b) => `${(b.size / 1048576).toFixed(1)} MB`;

export function mount(root) {
  root.innerHTML = `
    <header class="page-head"><button class="btn quiet back-link" data-ref="back">← Back</button></header>
    <div class="card">
      <h3>Wake me with ${info('Wake-up music', 'If Spotify or YouTube doesn’t start within 8 seconds, your own songs play instead, or a built-in alarm sound.')}</h3>
      <div class="source-tiles" data-seg="source" role="group" aria-label="Wake-up music" data-ref="seg"></div>
      <div class="notice card warn hidden" data-ref="fallback" style="margin-top:12px"></div>
      <div data-ref="local" style="margin-top:12px">
        <p class="small soft">A different song each morning 🎶 ${info('Your songs', 'Only the first 40 seconds loop while it rings. The rest plays as your reward once your morning is proven.')}</p>
        <ul class="list" data-ref="songList"></ul>
        <label class="btn line block" style="margin-top:10px">Add songs<input type="file" accept="audio/*" multiple data-ref="songInput" hidden></label>
      </div>
      <div data-ref="spotify" style="margin-top:12px"></div>
      <div data-ref="youtube" style="margin-top:12px"></div>
    </div>

    <div class="card">
      <h3>Punishment song 😈 ${info('Punishment song', 'Plays if you miss the check-in. Pick one you can’t stand.')}</h3>
      <ul class="list" data-ref="punish"></ul>
      <label class="btn line block" style="margin-top:10px">Choose a song<input type="file" accept="audio/*" data-ref="punishInput" hidden></label>
    </div>

    <div class="card">
      <h3>Wake-up boost 🚀 ${info('Wake-up boost', 'After you pass the check-in: your voice note from last night, then a clip.')}</h3>
      <div class="row between wrap" style="margin-top:10px"><strong>Note from past you</strong><span class="small muted" data-ref="voiceMeta"></span></div>
      <div class="row wrap" style="margin-top:10px">
        <button class="btn gold" data-ref="rec">Record</button>
        <button class="btn line hidden" data-ref="playVoice">${ICONS.play} Play</button>
        <button class="btn quiet hidden" data-ref="delVoice">Delete</button>
      </div>
      <hr class="rule">
      <strong>Motivation clips</strong>
      <p class="small soft">Share a ${youtubeIcon(14)} Short or ${instagramIcon(14)} reel to SoulWake, or:</p>
      <ul class="list" data-ref="clips"></ul>
      <div class="paste-row"><input type="url" data-ref="clipLink" placeholder="Paste a YouTube or Instagram link" autocomplete="off" spellcheck="false" aria-label="Clip link"><button class="btn line" data-ref="addLink">Add</button></div>
      <label class="btn quiet" style="margin-top:6px">Or add a video from your phone<input type="file" accept="video/*" multiple data-ref="clipInput" hidden></label>
    </div>`;
  const r = refs(root);
  r.back.onclick = () => tabs.back();
  spotifyPanel.mount(r.spotify);
  youtubePanel.mount(r.youtube);

  const removeBtn = (id, name) => `<button class="icon-btn" data-del="${id}" aria-label="Remove ${esc(name)}">${ICONS.x}</button>`;

  function renderSource() {
    const st = music.status();
    r.seg.innerHTML = SOURCE_OPTIONS.map((o) => `<button type="button" class="source-tile" data-value="${o.value}" aria-pressed="${o.value === st.source}">${o.icon}<span>${o.label}</span></button>`).join('');
    r.local.classList.toggle('hidden', st.source !== 'local');
    r.spotify.classList.toggle('hidden', st.source !== 'spotify');
    r.youtube.classList.toggle('hidden', st.source !== 'youtube');
    const fb = st.lastFallback;
    r.fallback.classList.toggle('hidden', !fb || st.source === 'local');
    if (fb) r.fallback.innerHTML = `<p class="small"><strong>${esc(fb.source === 'spotify' ? 'Spotify' : 'YouTube')} didn’t start</strong> at ${fmtTime(new Date(fb.at))}. ${esc(fb.reason)}</p>`;
  }

  async function renderSongs() {
    const list = await songs.list();
    r.songList.innerHTML = list.length
      ? list.map((m) => `<li><div class="grow"><strong>${esc(m.name)}</strong><span class="small muted">${mb(m.blob)}</span></div>${removeBtn(m.id, m.name)}</li>`).join('')
      : '<li class="empty">No songs yet. Add a few favourites.</li>';
  }

  async function renderPunish() {
    const p = await music.punishment();
    r.punish.innerHTML = p
      ? `<li><div class="grow"><strong>${esc(p.name)}</strong><span class="small muted">${mb(p.blob)}</span></div><button class="icon-btn" data-delpunish aria-label="Remove punishment song">${ICONS.x}</button></li>`
      : '<li class="empty">None yet. A missed check-in beeps.</li>';
  }

  async function renderBoost() {
    const [v, c] = await Promise.all([boost.voice(), boost.clips()]);
    const links = boost.linkClips();
    r.voiceMeta.textContent = v ? `Recorded ${new Date(v.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : 'Not recorded';
    r.playVoice.classList.toggle('hidden', !v);
    r.delVoice.classList.toggle('hidden', !v);
    r.rec.textContent = v ? 'Record again' : 'Record';
    r.clips.innerHTML = c.length || links.length
      ? c.map((m) => `<li><div class="grow"><strong>${esc(m.name)}</strong><span class="small muted">${mb(m.blob)}</span></div><button class="icon-btn" data-delclip="${m.id}" aria-label="Remove ${esc(m.name)}">${ICONS.x}</button></li>`).join('')
        + links.map((l) => `<li><span>${l.site === 'youtube' ? youtubeIcon(18) : instagramIcon(18)}</span><div class="grow"><strong>${esc(l.name)}</strong><span class="small muted">${esc(l.url.replace(/^https:\/\/(www\.)?/, ''))}</span></div><button class="icon-btn" data-dellink="${l.id}" aria-label="Remove ${esc(l.name)}">${ICONS.x}</button></li>`).join('')
      : '<li class="empty">No clips yet.</li>';
  }

  const report = ({ added, rejected }, noun) => {
    if (rejected.length) toast(`${added ? `Added ${added}. ` : ''}Skipped: ${rejected.join('; ')}.`, 5000);
    else if (added) toast(added > 1 ? `Added ${added} ${noun}s.` : `${noun[0].toUpperCase() + noun.slice(1)} added.`);
  };

  r.seg.addEventListener('click', (e) => { const b = e.target.closest('[data-value]'); if (b) music.setSource(b.dataset.value); });
  r.songInput.onchange = async (e) => { report(await songs.add([...e.target.files]), 'song'); e.target.value = ''; };
  r.songList.addEventListener('click', (e) => { const b = e.target.closest('[data-del]'); if (b) songs.remove(b.dataset.del); });
  r.punishInput.onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    const res = await music.setPunishment(f);
    toast(res.ok ? 'Punishment song set.' : res.reason);
  };
  r.punish.addEventListener('click', (e) => { if (e.target.closest('[data-delpunish]')) music.removePunishment(); });
  r.clipInput.onchange = async (e) => { report(await boost.addClips([...e.target.files]), 'clip'); e.target.value = ''; };
  r.clips.addEventListener('click', (e) => {
    const b = e.target.closest('[data-delclip]');
    if (b) boost.removeClip(b.dataset.delclip);
    const l = e.target.closest('[data-dellink]');
    if (l) boost.removeLink(l.dataset.dellink);
  });
  r.addLink.onclick = () => {
    const res = boost.addLink(r.clipLink.value);
    if (!res.ok) { toast(res.reason, 4000); return; }
    r.clipLink.value = '';
    toast('Clip saved 🚀');
  };

  /* Voice note recorder (max 30 s) */
  let rec = null, chunks = [], stopTimer = null;
  r.rec.onclick = async () => {
    if (rec?.state === 'recording') { rec.stop(); return; }
    if (!window.MediaRecorder) { toast('Recording isn’t supported in this browser.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      rec = new MediaRecorder(stream);
      rec.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
      rec.onstop = async () => {
        clearTimeout(stopTimer);
        stream.getTracks().forEach((t) => t.stop());
        const res = await boost.saveVoice(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
        toast(res.ok ? 'Voice note saved.' : res.reason);
        renderBoost();
      };
      rec.start();
      r.rec.textContent = 'Stop recording';
      r.voiceMeta.textContent = 'Recording… tell tomorrow-you why it matters 🎙️';
      stopTimer = setTimeout(() => rec?.state === 'recording' && rec.stop(), 30_000);
    } catch { toast('Microphone blocked. Allow it in your browser settings.'); }
  };
  r.playVoice.onclick = async () => { audio.unlock(); const v = await boost.voice(); if (v && !(await audio.playBlob(v.blob))) toast('Couldn’t play the voice note.'); };
  r.delVoice.onclick = () => { boost.deleteVoice(); toast('Voice note deleted.'); };

  on('music:changed', () => { renderSource(); renderPunish(); });
  on('songs:changed', renderSongs);
  on('boost:changed', renderBoost);
  on('tab:shown', ({ tab }) => { if (tab === root.dataset.tab) { renderSource(); renderSongs(); renderPunish(); renderBoost(); } });
  renderSource();
}
