// Photo check: an on-device CLIP-style model looks at each proof photo.
//  1. Does it match the task's own words? ("a freshly made cup of tea" against decoys like
//     "a blank wall", "a ceiling", "a phone screen").
//  2. If you took a reference photo of that spot, is it the same place?
// The model (MobileCLIP, ~75 MB) downloads once from Hugging Face when you switch this on, then
// works offline. Photos never leave your phone. Until it's downloaded (or if it can't run),
// photos are accepted on trust, exactly as before.
import { load, save, media } from '../core/storage.js';
import { emit } from '../core/events.js';
import { PHOTO_CHECK } from '../config.js';

let st = load('photocheck', { enabled: false, ready: false, model: null, unverified: 0 });
let refs = load('photo-refs', {}); // taskId -> embedding (rounded numbers)
if (!refs || typeof refs !== 'object' || Array.isArray(refs)) refs = {};

const commit = () => { save('photocheck', st); emit('photocheck:changed', state()); };
export const state = () => ({ ...st, refs: Object.keys(refs), downloading: !!loading });

/* ---------------- the model ---------------- */
let engine = null, loading = null;

// Tests (and future engines) can provide { embedImage(blob), embedTexts(texts) } on window.__photoEngine.
async function getEngine({ download = false } = {}) {
  if (window.__photoEngine) return window.__photoEngine;
  if (engine) return engine;
  if (!st.ready && !download) return null;
  if (!loading) loading = loadEngine().finally(() => { loading = null; });
  return loading;
}

async function loadEngine() {
  const T = await import('../../vendor/transformers/transformers.min.js');
  T.env.allowLocalModels = false;
  T.env.useBrowserCache = true; // the model is cached after the first download, so it works offline
  T.env.backends.onnx.wasm.wasmPaths = new URL('../../vendor/transformers/', import.meta.url).href;
  T.env.backends.onnx.wasm.numThreads = 1;
  const progress = (p) => { if (p?.status === 'progress' && p.total) emit('photocheck:progress', { file: p.file, pct: Math.round((p.loaded / p.total) * 100) }); };
  let lastErr = null;
  for (const id of PHOTO_CHECK.models) {
    try {
      const opts = { progress_callback: progress, dtype: 'q8' };
      const [tokenizer, processor, text, vision] = await Promise.all([
        T.AutoTokenizer.from_pretrained(id, { progress_callback: progress }),
        T.AutoProcessor.from_pretrained(id, { progress_callback: progress }),
        T.CLIPTextModelWithProjection.from_pretrained(id, opts),
        T.CLIPVisionModelWithProjection.from_pretrained(id, opts)
      ]);
      const unit = (t) => { const a = Array.from(t.data); const n = Math.hypot(...a) || 1; return a.map((x) => x / n); };
      engine = {
        id,
        async embedTexts(texts) {
          const inputs = tokenizer(texts, { padding: 'max_length', truncation: true });
          const { text_embeds: e } = await text(inputs);
          const [n, d] = e.dims;
          return Array.from({ length: n }, (_, i) => unit({ data: e.data.slice(i * d, (i + 1) * d) }));
        },
        async embedImage(blob) {
          const image = await T.RawImage.fromBlob(blob);
          const inputs = await processor(image);
          const { image_embeds: e } = await vision(inputs);
          return unit(e);
        }
      };
      st.model = id;
      return engine;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('No model could be loaded');
}

/** Switches the check on, downloading the model if needed. Resolves { ok, reason }. */
export async function enable() {
  try {
    await getEngine({ download: true });
    st.enabled = true; st.ready = true;
    commit();
    return { ok: true };
  } catch (e) {
    st.enabled = false;
    commit();
    return { ok: false, reason: navigator.onLine === false ? 'You’re offline. Connect to Wi-Fi and try again.' : 'Couldn’t download the photo checker. Try again on Wi-Fi.' };
  }
}
export function disable() { st.enabled = false; commit(); }

/* ---------------- matching ---------------- */
const DECOYS = ['a blank wall', 'a ceiling', 'an unmade bed with a pillow', 'a dark, blurry photo', 'the floor', 'a phone screen showing a photo', 'a computer screen', 'a closed door', 'a hand in front of the camera'];
const FACE_DECOY = 'a selfie of a person’s face';
const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const softmax = (xs) => { const m = Math.max(...xs); const e = xs.map((x) => Math.exp(x - m)); const t = e.reduce((a, b) => a + b, 0); return e.map((x) => x / t); };

// Pure: given similarities of the photo to [task, ...decoys], decide. Exported for tests.
export function decide(sims, { matchMin = PHOTO_CHECK.matchMin } = {}) {
  const probs = softmax(sims.map((s) => s * 100)); // CLIP's usual temperature
  const best = probs.indexOf(Math.max(...probs));
  return { ok: best === 0 && probs[0] >= Math.min(matchMin, 0.99), score: Math.round(probs[0] * 100) / 100, best };
}

const dataUrlToBlob = async (url) => (await fetch(url)).blob();

/**
 * Checks a proof photo. Resolves { checked, pass, reason, score?, place? }.
 * checked=false means the check isn't on (or couldn't run): the photo counts, as before.
 */
export async function verify(photo, task) {
  if (!st.enabled && !window.__photoEngine) return { checked: false, pass: true, reason: 'Photo saved as proof.' };
  let eng;
  try { eng = await getEngine(); } catch { eng = null; }
  if (!eng) return { checked: false, pass: true, reason: 'Photo saved as proof.' };
  try {
    const blob = typeof photo === 'string' ? await dataUrlToBlob(photo) : photo;
    const selfie = /selfie|face|eyes|you\b/i.test(`${task.name} ${task.proof}`);
    const prompts = [`a photo of ${task.proof}`, ...DECOYS.map((d) => `a photo of ${d}`), ...(selfie ? [] : [`a photo of ${FACE_DECOY}`])];
    const [img, texts] = await Promise.all([eng.embedImage(blob), eng.embedTexts(prompts)]);
    const verdict = decide(texts.map((t) => cos(img, t)));
    let place = null;
    const ref = refs[task.id];
    if (ref && ref.length === img.length) place = Math.round(cos(img, ref) * 100) / 100;
    const samePlace = place === null || place >= PHOTO_CHECK.placeMin;
    const pass = verdict.ok && samePlace;
    const reason = pass
      ? `Looks like ${task.proof}${place !== null ? ', in the same spot as your reference' : ''} ✓`
      : !verdict.ok ? `Hmm, that doesn’t look like ${task.proof}.` : 'That’s not the same spot as your reference photo.';
    return { checked: true, pass, reason, score: verdict.score, place };
  } catch {
    return { checked: false, pass: true, reason: 'Photo saved as proof (the checker couldn’t run this time).' };
  }
}

// After a few failed checks you can still count the photo, so a fussy model never traps you.
export function countUnverified() { st.unverified = (st.unverified || 0) + 1; commit(); }

/* ---------------- reference photos ("same place") ---------------- */
export const hasReference = (taskId) => taskId in refs;

export async function setReference(taskId, photo) {
  const eng = await getEngine().catch(() => null);
  const blob = typeof photo === 'string' ? await dataUrlToBlob(photo) : photo;
  await media.put({ id: `ref-${taskId}`, kind: 'ref', blob, at: Date.now() }).catch(() => {});
  if (eng) {
    const e = await eng.embedImage(blob);
    refs[taskId] = e.map((x) => Math.round(x * 1e4) / 1e4);
  } else refs[taskId] = refs[taskId] || null; // embedded once the checker is ready
  save('photo-refs', refs);
  emit('photocheck:changed', state());
  return true;
}

export async function removeReference(taskId) {
  delete refs[taskId];
  save('photo-refs', refs);
  await media.del(`ref-${taskId}`).catch(() => {});
  emit('photocheck:changed', state());
}

// Reference photos taken before the checker was downloaded get their embedding now.
export async function embedPendingReferences() {
  const eng = await getEngine().catch(() => null);
  if (!eng) return;
  for (const [id, e] of Object.entries(refs)) {
    if (e) continue;
    const rec = await media.get(`ref-${id}`).catch(() => null);
    if (rec?.blob) refs[id] = (await eng.embedImage(rec.blob)).map((x) => Math.round(x * 1e4) / 1e4);
  }
  save('photo-refs', refs);
}
