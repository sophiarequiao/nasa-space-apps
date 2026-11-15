// Voice analysis of the daily message to Earth. Runs fully in the browser:
// audio is analysed in memory and never stored or sent; only numbers are kept.
//
// Contract (team): analyzeVoice(audio, personalMean) -> { observations, summary }
//
// Method (transparent signal processing, no trained model):
//  - 25 ms frames, 10 ms hop, RMS energy in dB
//  - adaptive speech threshold from the noise floor (10th percentile) and the loud level (90th)
//  - pauses: silent gaps >= 150 ms inside the speech span
//  - speech rate: syllable nuclei = energy-envelope peaks with >= 2 dB prominence, per second of speaking time
//  - pitch: normalised autocorrelation (75-400 Hz) on voiced frames; median and variability in semitones

export interface VoiceFeatures {
  durationS: number;
  speakingTimeS: number;
  speechRate: number;       // syllables per second of speaking time
  pauseFraction: number;    // share of the speech span spent in pauses
  f0MedianHz: number | null;
  f0VariabilitySt: number | null;
  snrDb: number;
  quality: number;          // 0-1
}

export interface PersonalVoiceMean {
  speechRate: number;
  pauseFraction: number;
  f0MedianHz?: number | null;
  source: string;
}

export interface VoiceComparison {
  signal: "speech_rate" | "pause_fraction" | "pitch";
  label: string;
  value: number;
  mean: number;
  pctChange: number;
  status: "green" | "amber";
  text: string;
}

export interface VoiceResult {
  features: VoiceFeatures;
  comparisons: VoiceComparison[];
  summary: string;
  suggestion: string | null;
}

const FRAME_S = 0.025;
const HOP_S = 0.01;

export function extractVoiceFeatures(samples: Float32Array, sampleRate: number): VoiceFeatures {
  const frame = Math.round(FRAME_S * sampleRate);
  const hop = Math.round(HOP_S * sampleRate);
  const nFrames = Math.max(0, Math.floor((samples.length - frame) / hop));
  const db = new Float32Array(nFrames);
  for (let f = 0; f < nFrames; f++) {
    let s = 0;
    const o = f * hop;
    for (let i = 0; i < frame; i++) s += samples[o + i] * samples[o + i];
    db[f] = 10 * Math.log10(s / frame + 1e-12);
  }
  const sorted = Array.from(db).sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))] ?? -120;
  const floor = pct(0.1);
  const loud = pct(0.9);
  const snrDb = loud - floor;
  const thr = floor + Math.max(6, snrDb * 0.35);
  const voiced = Array.from(db, (v) => v > thr);

  const first = voiced.indexOf(true);
  const last = voiced.lastIndexOf(true);
  const durationS = samples.length / sampleRate;
  if (first < 0 || last <= first) {
    return { durationS, speakingTimeS: 0, speechRate: 0, pauseFraction: 0, f0MedianHz: null, f0VariabilitySt: null, snrDb, quality: 0 };
  }

  // pauses (>= 150 ms) inside the speech span
  const minPause = Math.round(0.15 / HOP_S);
  let pauseFrames = 0, run = 0;
  for (let f = first; f <= last; f++) {
    if (!voiced[f]) run++;
    else { if (run >= minPause) pauseFrames += run; run = 0; }
  }
  const spanFrames = last - first + 1;
  const pauseFraction = pauseFrames / spanFrames;
  const speakingTimeS = (spanFrames - pauseFrames) * HOP_S;

  // syllable nuclei on a smoothed envelope
  const smooth = new Float32Array(nFrames);
  const w = 3;
  for (let f = 0; f < nFrames; f++) {
    let s = 0, c = 0;
    for (let k = -w; k <= w; k++) { const j = f + k; if (j >= 0 && j < nFrames) { s += db[j]; c++; } }
    smooth[f] = s / c;
  }
  const peaks: number[] = [];
  const minDist = Math.round(0.1 / HOP_S);
  for (let f = first + 1; f < last; f++) {
    if (smooth[f] <= thr) continue;
    if (smooth[f] >= smooth[f - 1] && smooth[f] > smooth[f + 1]) {
      if (peaks.length && f - peaks[peaks.length - 1] < minDist) {
        if (smooth[f] > smooth[peaks[peaks.length - 1]]) peaks[peaks.length - 1] = f;
        continue;
      }
      if (peaks.length) {
        let dip = Infinity;
        for (let j = peaks[peaks.length - 1]; j <= f; j++) dip = Math.min(dip, smooth[j]);
        const prom = Math.min(smooth[f], smooth[peaks[peaks.length - 1]]) - dip;
        if (prom < 2) { if (smooth[f] > smooth[peaks[peaks.length - 1]]) peaks[peaks.length - 1] = f; continue; }
      }
      peaks.push(f);
    }
  }
  const speechRate = speakingTimeS > 0.5 ? peaks.length / speakingTimeS : 0;

  // pitch by autocorrelation on a subset of voiced frames
  const win = Math.round(0.04 * sampleRate);
  const minLag = Math.floor(sampleRate / 400);
  const maxLag = Math.ceil(sampleRate / 75);
  const f0s: number[] = [];
  for (let f = first; f <= last; f += 2) {
    if (!voiced[f] || db[f] < thr + 3) continue;
    const o = f * hop;
    if (o + win + maxLag >= samples.length) break;
    let e0 = 0;
    for (let i = 0; i < win; i++) e0 += samples[o + i] * samples[o + i];
    const rs = new Float32Array(maxLag + 2);
    let best = 0;
    for (let lag = minLag; lag <= maxLag + 1; lag++) {
      let s = 0, e1 = 0;
      for (let i = 0; i < win; i++) { s += samples[o + i] * samples[o + i + lag]; e1 += samples[o + i + lag] * samples[o + i + lag]; }
      rs[lag] = s / Math.sqrt(e0 * e1 + 1e-12);
      if (lag <= maxLag && rs[lag] > best) best = rs[lag];
    }
    // prefer the shortest lag that is a local peak close to the best one (avoids octave errors)
    let bestLag = 0;
    for (let lag = minLag + 1; lag <= maxLag; lag++) {
      if (rs[lag] >= 0.9 * best && rs[lag] >= rs[lag - 1] && rs[lag] >= rs[lag + 1]) { bestLag = lag; break; }
    }
    if (best > 0.55 && bestLag) f0s.push(sampleRate / bestLag);
  }
  let f0MedianHz: number | null = null, f0VariabilitySt: number | null = null;
  if (f0s.length >= 10) {
    const s = [...f0s].sort((a, b) => a - b);
    f0MedianHz = s[Math.floor(s.length / 2)];
    const st = f0s.map((v) => 12 * Math.log2(v / (f0MedianHz as number)));
    const m = st.reduce((a, b) => a + b, 0) / st.length;
    f0VariabilitySt = Math.sqrt(st.reduce((a, b) => a + (b - m) ** 2, 0) / st.length);
  }
  const quality = Math.max(0, Math.min(1, (snrDb - 10) / 25)) * Math.min(1, speakingTimeS / 8);
  return { durationS, speakingTimeS, speechRate, pauseFraction, f0MedianHz, f0VariabilitySt, snrDb, quality };
}

export function compareVoice(features: VoiceFeatures, mean: PersonalVoiceMean | null): VoiceResult {
  const comparisons: VoiceComparison[] = [];
  let suggestion: string | null = null;
  if (mean && features.speechRate > 0) {
    const add = (signal: VoiceComparison["signal"], label: string, value: number, m: number, badHigh: boolean, threshold: number, unitText: (p: number) => string) => {
      const pctChange = ((value - m) / m) * 100;
      const bad = badHigh ? pctChange > threshold : pctChange < -threshold;
      comparisons.push({ signal, label, value, mean: m, pctChange, status: bad ? "amber" : "green", text: unitText(pctChange) });
    };
    add("speech_rate", "Speech rate", features.speechRate, mean.speechRate, false, 12,
      (p) => `Your voice is ${Math.abs(p).toFixed(0)}% ${p < 0 ? "slower" : "faster"} than your mean`);
    add("pause_fraction", "Pauses", features.pauseFraction, Math.max(0.01, mean.pauseFraction), true, 25,
      (p) => `${Math.abs(p).toFixed(0)}% ${p > 0 ? "more" : "fewer"} pauses than your mean`);
    if (features.f0MedianHz && mean.f0MedianHz) {
      add("pitch", "Pitch", features.f0MedianHz, mean.f0MedianHz, false, 15,
        (p) => `Pitch ${Math.abs(p).toFixed(0)}% ${p < 0 ? "lower" : "higher"} than your mean`);
    }
    const slow = comparisons.find((c) => c.signal === "speech_rate" && c.status === "amber" && c.pctChange < 0);
    if (slow) suggestion = `${slow.text}. Shall we do the 3-minute reaction test?`;
  }
  const summary = features.speechRate
    ? `Speech rate ${features.speechRate.toFixed(2)} syll/s, pauses ${(features.pauseFraction * 100).toFixed(0)}%` +
      (features.f0MedianHz ? `, pitch ${features.f0MedianHz.toFixed(0)} Hz` : "") + `, signal quality ${(features.quality * 100).toFixed(0)}%.`
    : "Not enough speech detected. Speak for at least 10 seconds in a quiet place.";
  return { features, comparisons, summary, suggestion };
}

/** Decode a recorded Blob to mono PCM. */
export async function decodeToMono(blob: Blob): Promise<{ samples: Float32Array; sampleRate: number }> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const out = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < ch.length; i++) out[i] += ch[i] / buf.numberOfChannels;
    }
    return { samples: out, sampleRate: buf.sampleRate };
  } finally {
    void ctx.close();
  }
}

export async function analyzeVoice(audio: Blob, personalMean: PersonalVoiceMean | null): Promise<VoiceResult> {
  const { samples, sampleRate } = await decodeToMono(audio);
  return compareVoice(extractVoiceFeatures(samples, sampleRate), personalMean);
}

// Personal history of the user's own recordings (numbers only). Browser storage can be
// unavailable (private mode, embedded views): fall back to memory.
const KEY = "sospesai.voiceHistory.v1";
let memoryHistory: VoiceFeatures[] = [];

export function loadVoiceHistory(): VoiceFeatures[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as VoiceFeatures[];
  } catch { /* storage not available */ }
  return memoryHistory;
}

export function saveVoiceHistory(list: VoiceFeatures[]): void {
  memoryHistory = list.slice(-30);
  try { localStorage.setItem(KEY, JSON.stringify(memoryHistory)); } catch { /* storage not available */ }
}

export function meanFromHistory(list: VoiceFeatures[]): PersonalVoiceMean | null {
  const ok = list.filter((f) => f.speechRate > 0);
  if (!ok.length) return null;
  const avg = (fn: (f: VoiceFeatures) => number) => ok.reduce((a, f) => a + fn(f), 0) / ok.length;
  const withF0 = ok.filter((f) => f.f0MedianHz);
  return {
    speechRate: avg((f) => f.speechRate),
    pauseFraction: avg((f) => f.pauseFraction),
    f0MedianHz: withF0.length ? withF0.reduce((a, f) => a + (f.f0MedianHz as number), 0) / withF0.length : null,
    source: `your own mean (${ok.length} message${ok.length > 1 ? "s" : ""})`,
  };
}
