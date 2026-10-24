// What happens when you share a link to SoulWake: it's added where it fits, with one
// question only when it could be either (a single YouTube video: alarm song or motivation clip?).
import { on } from '../core/events.js';
import { toast } from '../core/util.js';
import * as share from '../features/share.js';
import * as tabs from './tabs.js';
import { sheet } from './components.js';

export async function handle(text) {
  let { kind, url } = share.classify(text);
  if (kind === 'spotify-short') {
    const full = await share.resolveShort(url);
    if (!full) { toast('In Spotify, tap Share → Copy link, then paste it in Music.', 5000); return { ok: false }; }
    kind = 'spotify'; url = full;
  }
  if (kind === 'none' || kind === 'unknown') { toast('Hmm, I can use Spotify, YouTube and Instagram links 🤔', 4000); return { ok: false }; }
  let use = null;
  if (kind === 'youtube-video') {
    use = await sheet({ title: 'Use this video for…', actions: [{ label: 'Waking me up 🎵', value: 'alarm', style: 'gold' }, { label: 'Motivation after I’m up 🚀', value: 'clip' }] });
    if (!use) return { ok: false };
  }
  const res = share.apply(kind, url, use);
  if (!res.ok) { toast(res.reason, 4000); return res; }
  if (res.tab) tabs.show(res.tab);
  toast(res.message, 4000);
  return res;
}

export function mount() {
  on('share:received', ({ text }) => handle(text));
}
