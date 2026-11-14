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
    mean_pause_duration: 'Mean pause duration', f0_mean: 'Mean pitch', f0_variability: 'Pitch variation', voice_harmonicity: 'Voice harmonicity', message_duration: 'Message duration' };
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
