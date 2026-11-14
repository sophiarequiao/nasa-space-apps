// src/sensors/voice.js — "The message is the measurement": analyses the daily voice message to Earth.
// API: analyzeVoice(audioBlob, baseline, options?) -> Promise<{ observations: [...], summary }>
//   baseline: personal pre-flight baseline per signal, e.g. { speech_rate: { mean, sd }, pause_fraction: { mean, sd } }.
//             Also accepted: { pre_mean, pre_sd } and the Spanish { media, desv } / { pre_media, pre_dt }.
//   options:  { crew: 'CM-2', time: '2026-11-14T08:12:00Z', phase?, day? }
// Measures (approximations, NOT transcription and NOT a diagnosis):
//   speech_rate           syllables/s of speech (voiced energy peaks; idea from De Jong & Wempe 2009, Praat)
//   pause_fraction        fraction of silence (stretches > 250 ms) inside the message
//   pause_count, mean_pause_duration, message_duration
//   f0_mean (Hz) and f0_variability (semitones) with YIN (de Cheveigné & Kawahara 2002), range 70-400 Hz
//   voice_harmonicity (dB): mean harmonics-to-noise ratio of the voiced frames, from YIN's aperiodicity.
//     Lower = hoarser or breathier voice. It also drops with room noise: compare only similar recording conditions.
// Privacy: the audio never leaves the browser; only the measures are returned.
// Known limit (validated with 10 real recordings): detects speech slower than the personal baseline,
//   but under-counts syllables in fast speech. Thresholds marked ASSUMPTION were tuned on one speaker.
// Drafted with AI assistance (Claude, Anthropic). MIT licence.

const FS = 16000;               // everything is resampled to 16 kHz mono
const HOP_S = 0.010;            // 10 ms between energy frames
const WINDOW_S = 0.025;         // 25 ms energy window
const MIN_PAUSE_S = 0.25;       // pause = silence > 250 ms (team guideline)
const MIN_SYLLABLE_S = 0.10;    // at most ~10 syllables/s (ASSUMPTION)
const PROMINENCE_DB = 2.0;      // a syllable peak rises >= 2 dB above the previous valley (ASSUMPTION)
const F0_MIN = 70, F0_MAX = 400;
const YIN_THRESHOLD = 0.30;     // 0.15 missed ~3/4 of the voiced frames in a noisy room (tuned on a real recording, ASSUMPTION)
const YIN_THRESHOLD_F0 = 0.15;  // only reliable frames are used for the mean pitch (keeps background voices out)
const VOICE_NEAR_FRAMES = 4;    // a frame is speech if there is pitch within ±40 ms (ASSUMPTION)
const MAX_GAP_S = 0.20;         // gaps < 200 ms (unvoiced consonants) count as speech (ASSUMPTION)
export const VOICE_SIGNALS = ['speech_rate', 'pause_fraction', 'pause_count', 'mean_pause_duration', 'f0_mean', 'f0_variability', 'voice_harmonicity', 'message_duration'];

// ---------------------------------------------------------------------------
// Browser entry point: Blob (MediaRecorder or file) -> mono 16 kHz samples
export async function analyzeVoice(audioBlob, baseline = {}, options = {}) {
  const buf = await audioBlob.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  let audio;
  try { audio = await ctx.decodeAudioData(buf); } finally { ctx.close && ctx.close(); }
  const n = Math.max(1, Math.ceil(audio.duration * FS));
  const off = new OfflineAudioContext(1, n, FS);           // downmix to mono and resample
  const src = off.createBufferSource();
  src.buffer = audio; src.connect(off.destination); src.start();
  const mono = (await off.startRendering()).getChannelData(0);
  return analyzeSamples(mono, FS, baseline, options);
}

// ---------------------------------------------------------------------------
// Pure core (no browser APIs): can be tested in Node
export function analyzeSamples(x, fs, baseline = {}, options = {}) {
  const crew = options.crew || 'CM-1';
  const time = options.time || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const dur = x.length / fs;

  // 1) Band-pass 100 Hz - 4 kHz (removes hum and fans; keeps the voice)
  const s = biquad(biquad(Float32Array.from(x), fs, 'highpass', 100), fs, 'lowpass', 4000);

  // 2) Frame energy (dB), smoothed over 50 ms
  const hop = Math.round(HOP_S * fs), win = Math.round(WINDOW_S * fs);
  const nF = Math.max(0, Math.floor((s.length - win) / hop) + 1);
  const db = new Float32Array(nF);
  for (let t = 0; t < nF; t++) {
    let e = 0; const o = t * hop;
    for (let j = 0; j < win; j++) e += s[o + j] * s[o + j];
    db[t] = 10 * Math.log10(e / win + 1e-12);
  }
  const dbs = movingAverage(db, 5);

  // 3) Voice detection: energy > noise + 3 dB AND pitch detected nearby (YIN); gaps < 200 ms are filled
  const p10 = percentile(dbs, 0.10), p95 = percentile(dbs, 0.95);
  const range = p95 - p10;
  const threshold = p10 + Math.max(3, 0.2 * range);           // ASSUMPTION
  const candidate = Array.from(dbs, v => v > threshold);
  const tauMin = Math.floor(fs / F0_MAX), tauMax = Math.ceil(fs / F0_MIN);
  const wYin = Math.round(0.025 * fs);
  const f0Frame = new Float32Array(nF).fill(NaN);     // pitch used to detect speech (permissive threshold)
  const f0Reliable = new Float32Array(nF).fill(NaN);  // pitch used to measure (strict threshold)
  const hnrFrame = [];                                // harmonics-to-noise ratio of each voiced frame (dB)
  for (let t = 0; t < nF; t += 2) {                            // YIN every 20 ms
    if (!candidate[t]) continue;
    const o = t * hop;
    if (o + wYin + tauMax + 2 >= s.length) break;
    const r = yin(s, o, wYin, fs, tauMin, tauMax);
    if (r) {
      f0Frame[t] = r.f; if (t + 1 < nF) f0Frame[t + 1] = r.f;
      if (r.d < YIN_THRESHOLD_F0) f0Reliable[t] = r.f;
      // YIN's d' is the aperiodic share of the frame power: HNR = 10·log10((1 − d') / d'), capped at 30 dB
      hnrFrame.push(Math.min(30, 10 * Math.log10((1 - r.d) / Math.max(r.d, 1e-3))));
    }
  }
  const voiced = (t) => !Number.isNaN(f0Frame[t]);
  let voice = candidate.map((c, t) => {
    if (!c) return false;
    for (let k = Math.max(0, t - VOICE_NEAR_FRAMES); k <= Math.min(nF - 1, t + VOICE_NEAR_FRAMES); k++) if (voiced(k)) return true;
    return false;
  });
  voice = closeGaps(voice, Math.round(MAX_GAP_S / HOP_S));     // short unvoiced consonants
  const first = voice.indexOf(true), last = voice.lastIndexOf(true);
  if (first < 0 || nF === 0) return empty(dur, 'No voice detected in the recording.');

  // 4) Pauses: stretches without voice > 250 ms inside the message
  const pauses = [];
  let start = -1;
  for (let t = first; t <= last; t++) {
    if (!voice[t] && start < 0) start = t;
    if (voice[t] && start >= 0) { const d = (t - start) * HOP_S; if (d >= MIN_PAUSE_S) pauses.push(d); start = -1; }
  }
  const messageDur = (last - first + 1) * HOP_S;
  const pauseTime = pauses.reduce((a, b) => a + b, 0);
  const speechTime = Math.max(messageDur - pauseTime, 1e-3);

  // 5) Pitch: drop octave jumps, i.e. values outside [median/1.8, median×1.8]
  const f0Raw = Array.from(f0Reliable).filter(v => !Number.isNaN(v));
  const med = median(f0Raw);
  const f0 = f0Raw.filter(v => v > med / 1.8 && v < med * 1.8);
  const voiceFrames = voice.slice(first, last + 1).filter(Boolean).length;
  const voicedFraction = voiceFrames ? (2 * f0.length) / voiceFrames : 0;   // f0Reliable is computed every 2 frames

  // 6) Syllables: voiced energy peaks, prominent and >= 100 ms apart
  let syllables = 0, lastPeak = -1e9, lastValue = -Infinity, minSince = threshold;
  const sep = Math.round(MIN_SYLLABLE_S / HOP_S);
  for (let t = Math.max(1, first); t < Math.min(last, nF - 1); t++) {
    minSince = Math.min(minSince, dbs[t]);
    const isMax = dbs[t] > dbs[t - 1] && dbs[t] >= dbs[t + 1] && voice[t];
    const nearPitch = !Number.isNaN(f0Frame[t]) || !Number.isNaN(f0Frame[t - 1]) || !Number.isNaN(f0Frame[t + 1]);
    if (!isMax || !nearPitch || dbs[t] - minSince < PROMINENCE_DB) continue;
    if (t - lastPeak < sep) {                   // too close: keep the higher one
      if (dbs[t] > lastValue) { lastPeak = t; lastValue = dbs[t]; }
      continue;
    }
    syllables++; lastPeak = t; lastValue = dbs[t]; minSince = dbs[t];
  }

  // 7) Quality (0-1): signal-to-noise ratio, duration and voiced fraction — ASSUMPTION
  const qSnr = clamp((range - 6) / 14);         // 6 dB -> 0 ; 20 dB -> 1
  const qDur = clamp(messageDur / 10);          // >= 10 s of message -> 1
  const quality = r2(qSnr * qDur);
  const qualityF0 = r2(quality * clamp(voicedFraction / 0.3));

  // 8) Measures, as observations in the app format
  const f0Mean = f0.length ? f0.reduce((a, b) => a + b, 0) / f0.length : null;
  const st = f0.map(v => 12 * Math.log2(v / med));
  const f0Var = st.length > 1 ? stdev(st) : null;
  const hnr = hnrFrame.length >= 20 ? hnrFrame.reduce((a, b) => a + b, 0) / hnrFrame.length : null;
  const measures = [
    ['speech_rate', r2(syllables / speechTime), 'syllables/s', 'estimated', quality],
    ['pause_fraction', r2(pauseTime / messageDur), 'fraction', 'estimated', quality],
    ['pause_count', pauses.length, 'count', 'estimated', quality],
    ['mean_pause_duration', pauses.length ? r2(pauseTime / pauses.length) : 0, 's', 'estimated', quality],
    ['f0_mean', f0Mean == null ? null : Math.round(f0Mean * 10) / 10, 'Hz', 'estimated', qualityF0],
    ['f0_variability', f0Var == null ? null : r2(f0Var), 'st', 'estimated', qualityF0],
    ['voice_harmonicity', hnr == null ? null : Math.round(hnr * 10) / 10, 'dB', 'estimated', qualityF0],
    ['message_duration', Math.round(messageDur), 's', 'clinical', 1],
  ];
  const extra = {};
  if (options.phase != null) extra.phase = options.phase;
  if (options.day != null) extra.day = options.day;
  const observations = measures
    .filter(([, v]) => v != null)
    .map(([signal, value, unit, method, q]) => ({
      crew, ...extra, signal, value, unit, time, source: 'microphone', method, quality: q, region: 'brain',
    }));

  const summary = summarize(observations, baseline, { dur, messageDur, quality, range });
  if (options.debug) summary._debug = { dbs, threshold, p10, p95, candidate, f0Frame, f0Reliable, voice, pauses };   // tuning only
  return { observations, summary };
}

// ---------------------------------------------------------------------------
// SUSTAINED VOWEL TEST — "take a breath and say 'aaaa' for as long as you comfortably can".
// The classic voice-clinic task: a steady vowel isolates the voice source, so small irregularities can be measured.
// API: analyzeVowel(audioBlob, baseline, options?) -> Promise<{ observations, summary }>
//   max_phonation_time (s)  how long the vowel is held: drops with breathlessness or poor breath support
//   jitter (%)              cycle-to-cycle variation of the pitch period (rough or hoarse voice raises it)
//   shimmer (%)             cycle-to-cycle variation of the amplitude (breathy or hoarse voice raises it)
//   vowel_harmonicity (dB)  harmonics-to-noise ratio of the vowel (breathy or hoarse voice lowers it)
//   vowel_f0 (Hz), voice_breaks (count of interruptions or pitch jumps; max_phonation_time is the longest unbroken stretch)
// Checked on synthetic vowels: all measures move in the right direction, but large jitter and shimmer are
// under-read (about 0.6-0.75 of the true value) because the fundamental is band-pass filtered before timing.
// These are screening measures compared with the person's own baseline. They are NOT a diagnosis, and the values
// are not interchangeable with clinical software (different filters and definitions). Thresholds are ASSUMPTIONS.
export const VOWEL_SIGNALS = ['max_phonation_time', 'jitter', 'shimmer', 'vowel_harmonicity', 'vowel_f0', 'voice_breaks'];
const FS_VOWEL = 48000;         // cycle timing needs a finer time grid than 16 kHz

export async function analyzeVowel(audioBlob, baseline = {}, options = {}) {
  const buf = await audioBlob.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  let audio;
  try { audio = await ctx.decodeAudioData(buf); } finally { ctx.close && ctx.close(); }
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(audio.duration * FS_VOWEL)), FS_VOWEL);
  const src = off.createBufferSource();
  src.buffer = audio; src.connect(off.destination); src.start();
  return analyzeVowelSamples((await off.startRendering()).getChannelData(0), FS_VOWEL, baseline, options);
}

// Pure core. x: mono samples at fs (48 kHz expected; any multiple of 16 kHz works)
export function analyzeVowelSamples(x, fs, baseline = {}, options = {}) {
  const crew = options.crew || 'CM-1';
  const time = options.time || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const dur = x.length / fs;
  const hi = biquad(Float32Array.from(x), fs, 'highpass', 70);            // full-rate signal for cycle timing

  // 1) 16 kHz copy for voicing and pitch (same detector as the message analysis)
  const dec = Math.max(1, Math.round(fs / FS));
  const lp = dec > 1 ? biquad(biquad(hi, fs, 'lowpass', 6500), fs, 'lowpass', 6500) : hi;
  const s = new Float32Array(Math.floor(lp.length / dec));
  for (let i = 0; i < s.length; i++) s[i] = lp[i * dec];
  const hop = Math.round(HOP_S * FS), win = Math.round(WINDOW_S * FS);
  const nF = Math.max(0, Math.floor((s.length - win) / hop) + 1);
  const db = new Float32Array(nF);
  for (let t = 0; t < nF; t++) { let e = 0; const o = t * hop; for (let j = 0; j < win; j++) e += s[o + j] * s[o + j]; db[t] = 10 * Math.log10(e / win + 1e-12); }
  const dbs = movingAverage(db, 5);
  const p10 = percentile(dbs, 0.10), p95 = percentile(dbs, 0.95), range = p95 - p10;
  const threshold = Math.max(p10 + Math.max(3, 0.2 * range), p95 - 25);   // a held vowel is loud: nothing 25 dB below it counts
  const tauMin = Math.floor(FS / F0_MAX), tauMax = Math.ceil(FS / F0_MIN), wYin = Math.round(0.025 * FS);
  const f0Frame = new Float32Array(nF).fill(NaN), dFrame = new Float32Array(nF).fill(NaN);
  for (let t = 0; t < nF; t++) {
    if (dbs[t] <= threshold) continue;
    const o = t * hop; if (o + wYin + tauMax + 2 >= s.length) break;
    const r = yin(s, o, wYin, FS, tauMin, tauMax);
    if (r) { f0Frame[t] = r.f; dFrame[t] = r.d; }
  }
  let voice = closeGaps(Array.from(f0Frame, v => !Number.isNaN(v)), Math.round(0.10 / HOP_S));   // gaps < 100 ms do not end the vowel
  // 2) The vowel = longest continuous voiced run
  let best = [0, -1], start = -1, runs = 0;
  for (let t = 0; t <= nF; t++) {
    if (t < nF && voice[t]) { if (start < 0) start = t; }
    else if (start >= 0) {
      if (t - start >= 20) runs++;                                  // voiced stretches of at least 200 ms
      if (t - start > best[1] - best[0] + 1) best = [start, t - 1];
      start = -1;
    }
  }
  const mpt = (best[1] - best[0] + 1) * HOP_S;
  if (best[1] < 0 || mpt < 1) return empty(dur, 'No sustained vowel detected: say "aaaa" for at least 2 seconds, close to the microphone.');

  // 3) Pitch and harmonicity over the vowel, skipping 100 ms at each end (onset and release are not steady)
  const a = best[0] + 10, b = best[1] - 10;
  const f0s = [], hnrs = [];
  for (let t = a; t <= b; t++) if (!Number.isNaN(f0Frame[t])) { f0s.push(f0Frame[t]); hnrs.push(Math.min(30, 10 * Math.log10((1 - dFrame[t]) / Math.max(dFrame[t], 1e-3)))); }
  const f0m = median(f0s);
  const hnr = hnrs.reduce((p, c) => p + c, 0) / hnrs.length;

  // 4) Cycle marks at full rate: isolate the fundamental (0.6-1.5 × f0) and take its upward zero crossings,
  //    interpolated between samples. Period Ti = distance between crossings; amplitude Ai = peak-to-peak of the cycle.
  const i0 = Math.round(a * HOP_S * fs), i1 = Math.min(hi.length, Math.round((b + 1) * HOP_S * fs));
  const seg = hi.subarray(i0, i1);
  let fund = biquad(biquad(seg, fs, 'highpass', 0.6 * f0m), fs, 'highpass', 0.6 * f0m);
  fund = biquad(biquad(fund, fs, 'lowpass', 1.5 * f0m), fs, 'lowpass', 1.5 * f0m);
  const zc = [];
  for (let i = Math.round(0.05 * fs); i < fund.length - 1; i++) if (fund[i] <= 0 && fund[i + 1] > 0) zc.push(i + (-fund[i]) / (fund[i + 1] - fund[i]));
  const T = [], A = [];
  for (let k = 0; k + 1 < zc.length; k++) {
    T.push((zc[k + 1] - zc[k]) / fs);
    let mx = -Infinity, mn = Infinity;
    for (let i = Math.floor(zc[k]); i < Math.ceil(zc[k + 1]); i++) { if (seg[i] > mx) mx = seg[i]; if (seg[i] < mn) mn = seg[i]; }
    A.push(mx - mn);
  }
  const medT = median(T);
  const ok = T.map(v => v > 0.8 * medT && v < 1.25 * medT);          // cycles far from the median period are breaks or pitch jumps
  let dT = 0, dA = 0, sT = 0, sA = 0, pairs = 0, kept = 0, breaks = Math.max(0, runs - 1);   // interruptions of the vowel + pitch jumps inside it
  for (let k = 0; k < T.length; k++) {
    if (!ok[k]) { if (k === 0 || ok[k - 1]) breaks++; continue; }
    sT += T[k]; sA += A[k]; kept++;
    if (k + 1 < T.length && ok[k + 1]) { dT += Math.abs(T[k + 1] - T[k]); dA += Math.abs(A[k + 1] - A[k]); pairs++; }
  }
  if (pairs < 20) return empty(dur, 'The vowel is too short or too unsteady to measure: try again, holding one steady note.');
  // Many irregular cycles on a held vowel almost always mean background noise, not the voice (seen in a real noisy room)
  if (breaks > 0.15 * T.length) return empty(dur, 'Too much background noise to measure the vowel: move somewhere quieter or use a headset microphone.');
  const jitter = 100 * (dT / pairs) / (sT / kept), shimmer = 100 * (dA / pairs) / (sA / kept);

  const quality = r2(clamp((range - 15) / 15) * clamp(mpt / 2));      // jitter and shimmer need a clean signal: 15 dB -> 0, 30 dB -> 1 (ASSUMPTION)
  const measures = [
    ['max_phonation_time', Math.round(mpt * 10) / 10, 's', 'estimated', quality],
    ['jitter', r2(jitter), '%', 'estimated', quality],
    ['shimmer', r2(shimmer), '%', 'estimated', quality],
    ['vowel_harmonicity', Math.round(hnr * 10) / 10, 'dB', 'estimated', quality],
    ['vowel_f0', Math.round(f0m * 10) / 10, 'Hz', 'estimated', quality],
    ['voice_breaks', breaks, 'count', 'estimated', quality],
  ];
  const observations = measures.map(([signal, value, unit, method, q]) => ({ crew, signal, value, unit, time, source: 'microphone', method, quality: q, region: 'lungs' }));
  return { observations, summary: summarize(observations, baseline, { dur, messageDur: mpt, quality, range }) };
}

// ---------------------------------------------------------------------------
// Personal baseline from observations in the app format (e.g. observations.json, pre-flight phase)
export function computeBaseline(observations, crew, phase = 'preflight') {
  const bySignal = {};
  for (const o of observations) {
    if (o.crew !== crew || (phase && o.phase && o.phase !== phase)) continue;
    if (!VOICE_SIGNALS.includes(o.signal) || typeof o.value !== 'number') continue;
    (bySignal[o.signal] ||= []).push(o.value);
  }
  const out = {};
  for (const [k, v] of Object.entries(bySignal)) {
    const mu = v.reduce((a, b) => a + b, 0) / v.length;
    out[k] = { mean: r2(mu), sd: v.length > 1 ? r2(stdev(v)) : null, n: v.length };
  }
  return out;
}

// Accepts { mean, sd }, { pre_mean, pre_sd } and the Spanish { media, desv } / { pre_media, pre_dt } (Miguel's file)
function normalizeBaseline(b) {
  if (!b) return null;
  return { mean: b.mean ?? b.pre_mean ?? b.media ?? b.pre_media, sd: b.sd ?? b.pre_sd ?? b.desv ?? b.pre_dt };
}

// z = (value − personal mean) / sd. |z| >= 2 -> change from your personal baseline
function summarize(obs, baseline, info) {
  const z = {}, changes = [];
  const NAMES = { speech_rate: 'Speech rate', pause_fraction: 'Silence in the message', pause_count: 'Number of pauses',
    mean_pause_duration: 'Mean pause duration', f0_mean: 'Mean pitch', f0_variability: 'Pitch variation', voice_harmonicity: 'Voice harmonicity', message_duration: 'Message duration',
    max_phonation_time: 'Phonation time', jitter: 'Jitter', shimmer: 'Shimmer', vowel_harmonicity: 'Vowel harmonicity', vowel_f0: 'Vowel pitch', voice_breaks: 'Voice breaks' };
  for (const o of obs) {
    const b = normalizeBaseline(baseline && baseline[o.signal]);
    if (!b || !b.sd) { z[o.signal] = null; continue; }
    z[o.signal] = r2((o.value - b.mean) / b.sd);
    if (Math.abs(z[o.signal]) >= 2 && o.quality >= 0.4) {
      changes.push({ signal: o.signal, z: z[o.signal],
        text: `${NAMES[o.signal]}: ${o.value} ${o.unit}, ${z[o.signal] > 0 ? 'above' : 'below'} your personal baseline (${b.mean}; z = ${z[o.signal]}).` });
    }
  }
  let text;
  if (info.quality < 0.4) text = 'Low recording quality: repeat the message somewhere quieter and speak for at least 10 s.';
  else if (changes.length) text = 'Change from your personal baseline in: ' + changes.map(c => NAMES[c.signal].toLowerCase()).join(', ') + '.';
  else text = 'Within your personal baseline.';
  return { duration_s: r2(info.dur), message_duration_s: r2(info.messageDur), quality: info.quality, snr_db: r2(info.range), z, changes, text };
}

function empty(dur, reason) {
  return { observations: [], summary: { duration_s: r2(dur), quality: 0, z: {}, changes: [], text: reason } };
}

// ---------------------------------------------------------------------------
// YIN: cumulative mean normalised difference function + parabolic interpolation
function yin(x, o, W, fs, tauMin, tauMax) {
  const d = new Float32Array(tauMax + 2);
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    let acc = 0;
    for (let j = 0; j < W; j++) { const df = x[o + j] - x[o + j + tau]; acc += df * df; }
    d[tau] = acc;
  }
  const dn = new Float32Array(tauMax + 2); dn[0] = 1;
  let sum = 0;
  for (let tau = 1; tau <= tauMax + 1; tau++) { sum += d[tau]; dn[tau] = sum > 0 ? d[tau] * tau / sum : 1; }
  let tau = -1;
  for (let k = tauMin; k <= tauMax; k++) {
    if (dn[k] < YIN_THRESHOLD) { while (k + 1 <= tauMax && dn[k + 1] < dn[k]) k++; tau = k; break; }
  }
  if (tau < 0) return null;
  const a = dn[tau - 1], b = dn[tau], c = dn[tau + 1];
  const den = a - 2 * b + c;
  const t = den !== 0 ? tau + 0.5 * (a - c) / den : tau;
  const f = fs / t;
  return f >= F0_MIN && f <= F0_MAX ? { f, d: b } : null;
}

// --- helpers ------------------------------------------------------------------
// 2nd-order biquad filter (Butterworth, Q = 0.707), formulas from the "Audio EQ Cookbook" (R. Bristow-Johnson)
function biquad(x, fs, type, fc) {
  const w = 2 * Math.PI * fc / fs, cw = Math.cos(w), al = Math.sin(w) / (2 * Math.SQRT1_2);
  let b0, b1, b2;
  if (type === 'highpass') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; }
  else { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; }
  const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
// Marks as "voice" the silent gaps shorter than n frames between two voice frames
function closeGaps(v, n) {
  const out = v.slice(); let start = -1;
  for (let t = 0; t < v.length; t++) {
    if (!v[t] && start < 0) start = t;
    if (v[t] && start >= 0) { if (start > 0 && t - start < n) for (let k = start; k < t; k++) out[k] = true; start = -1; }
  }
  return out;
}
function movingAverage(v, k) {
  const out = new Float32Array(v.length), h = Math.floor(k / 2);
  for (let i = 0; i < v.length; i++) {
    let a = 0, n = 0;
    for (let j = Math.max(0, i - h); j <= Math.min(v.length - 1, i + h); j++) { a += v[j]; n++; }
    out[i] = a / n;
  }
  return out;
}
function percentile(v, p) { if (!v.length) return 0; const o = Array.from(v).sort((a, b) => a - b); return o[Math.min(o.length - 1, Math.floor(p * (o.length - 1)))]; }
function median(v) { return v.length ? percentile(v, 0.5) : NaN; }
function stdev(v) { const mu = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / (v.length - 1)); }
function clamp(v) { return Math.max(0, Math.min(1, v)); }
function r2(v) { return Math.round(v * 100) / 100; }
