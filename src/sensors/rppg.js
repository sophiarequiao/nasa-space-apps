// src/sensors/rppg.js — OPTIONAL: heart rate from the camera (rPPG). Not a medical device.
// API: startPulse(videoEl, onResult, options?) / stopPulse() / setPulseRoi(roi)      (fixed zone, person still)
//      startPulseTracked(videoEl, onResult, options?) / pushFaceFrame(f) / pulseSummary() / stopPulse()   (zones that follow the face)
//   onResult({ state, bpm, bpm_raw, quality, reason, observation, progress, fps, light, waveform })
//     state: 'measuring' (not enough data yet) | 'ok' | 'low_quality'
//     bpm: heart rate ONLY if the quality is good enough; otherwise null (the value is not shown)
//     bpm_raw: the estimate even when the quality is low (only for validation against a pulse oximeter)
//     reason: null | 'gathering_data' | 'low_light' | 'saturated' | 'low_frame_rate' | 'motion' | 'weak_signal' | 'unstable'
//     observation: object in the app format when state === 'ok'; otherwise null
//   options: { crew, method: 'pos'|'green', roi: {x,y,w,h} (fractions of the frame), window_s, min_quality, onSample }
// Method: a zone of the image (fixed by default; face.js can move it with setPulseRoi) -> mean R, G, B per frame
//   -> resample to 30 Hz -> detrend -> band-pass 0.7-3 Hz -> spectrum over a 12 s window -> peak = heart rate.
//   'pos' (default): combination of the three channels, more robust to motion (Wang et al. 2017; simplified
//   here to a single window). 'green': green channel only (Verkruysse et al. 2008).
//   On a real 2-minute recording (still / moving / still) 'pos' showed no false value and 'green' showed
//   three (48, 51 and 65 bpm); that is why 'pos' is the default.
// Quality = share of the spectrum power that sits at the peak (0-1); a value is shown only after 5 stable seconds.
// The person must stay still: slow motion or light changes are detected and the value is hidden.
// TRACKED MODE (startPulseTracked + pushFaceFrame, with face.js): the mode to use when the person talks or moves a little.
//   Two skin zones (face and forehead) follow the face on every frame; POS is computed over short overlapping windows
//   (Wang et al. 2017); the zones are added; a value is shown only when it persists (see createPulseGate).
//   Real test, one person, laptop camera at 20 fps, 3 minutes without a reference device: the old method showed a value
//   in 18 % of the seconds while talking and 22 % with small movements; the tracked mode in 70 % and 44 %, always
//   82-89 bpm, consistent with the still minute (82-85 bpm). The thresholds were tuned on that same recording.
//   pulseSummary() gives one value for a whole session (e.g. a 30 s check-in): the median of the shown seconds.
// Thresholds marked ASSUMPTION are the team's, to be tuned with the validation against a pulse oximeter.
// Privacy: the image never leaves the browser and is not stored; only the mean colour of the zone is computed.
// Drafted with AI assistance (Claude, Anthropic). MIT licence.

const FS = 30;                         // Hz after resampling
const F_MIN = 0.7, F_MAX = 3.0;        // 42-180 bpm
const F_GUARD = 0.45;                  // the spectrum is inspected from here to detect slow motion (ASSUMPTION)
const WINDOW_S = 12, MIN_S = 8;        // analysis window and minimum before the first value
const STEP_MS = 1000;                  // one estimate per second
const MIN_QUALITY = 0.5;               // below this the value is not shown (ASSUMPTION)
const LIGHT_MIN = 50, LIGHT_MAX = 235; // mean green level 0-255: too dark / saturated (ASSUMPTION)
const ROI = { x: 0.32, y: 0.18, w: 0.36, h: 0.50 };   // central zone: forehead and cheeks with the face centred

let S = null;   // current session

export async function startPulse(videoEl, onResult, options = {}) {
  stopPulse();
  const s = S = {
    video: videoEl, cb: onResult, op: { method: 'pos', crew: 'CM-1', ...options },
    t: [], r: [], g: [], b: [], active: true, ownStream: false, recent: [], frameId: null, timer: null,
    canvas: document.createElement('canvas'),
  };
  s.canvas.width = 36; s.canvas.height = 50;
  s.ctx = s.canvas.getContext('2d', { willReadFrequently: true });

  if (!videoEl.srcObject) {             // if the video has no camera attached, request it
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }, audio: false,
    });
    if (S !== s) { stream.getTracks().forEach(t => t.stop()); return; }
    videoEl.srcObject = stream; s.ownStream = true;
    videoEl.playsInline = true; videoEl.muted = true;
    await videoEl.play();
  }

  s.roi = s.op.roi || ROI;
  const sample = () => {
    if (!s.active) return;
    const v = s.video, W = v.videoWidth, H = v.videoHeight, roi = s.roi;
    if (W && H) {
      s.ctx.drawImage(v, roi.x * W, roi.y * H, roi.w * W, roi.h * H, 0, 0, s.canvas.width, s.canvas.height);
      const d = s.ctx.getImageData(0, 0, s.canvas.width, s.canvas.height).data;
      let r = 0, g = 0, b = 0; const n = d.length / 4;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      s.t.push(performance.now()); s.r.push(r / n); s.g.push(g / n); s.b.push(b / n);
      if (s.op.onSample) s.op.onSample(s.t[s.t.length - 1], r / n, g / n, b / n);    // raw signal (tuning only)
      const limit = performance.now() - (s.op.window_s || WINDOW_S) * 1000 - 500;    // keep only the window
      while (s.t.length && s.t[0] < limit) { s.t.shift(); s.r.shift(); s.g.shift(); s.b.shift(); }
    }
    schedule();
  };
  const schedule = () => {
    s.frameId = s.video.requestVideoFrameCallback
      ? s.video.requestVideoFrameCallback(sample)        // one callback per real camera frame
      : requestAnimationFrame(sample);
  };
  schedule();

  s.timer = setInterval(() => {
    if (!s.active) return;
    const res = estimatePulse(s.t, s.r, s.g, s.b, { method: s.op.method, window_s: s.op.window_s });
    // Stability: the last 5 estimates must agree (within a 10 bpm span); otherwise nothing is shown (ASSUMPTION)
    s.recent.push(res.bpm_raw); if (s.recent.length > 5) s.recent.shift();
    const valid = s.recent.filter(v => v != null);
    const stable = valid.length === 5 && Math.max(...valid) - Math.min(...valid) <= 10;
    let quality = res.quality;
    if (res.bpm_raw != null && !stable) quality = Math.min(quality, 0.4);
    quality = Math.round(quality * 100) / 100;
    const ok = res.bpm_raw != null && quality >= (s.op.min_quality ?? MIN_QUALITY);
    const state = res.bpm_raw == null && !res.reason ? 'measuring' : (ok ? 'ok' : 'low_quality');
    const bpm = ok ? Math.round(res.bpm_raw) : null;
    s.cb({
      state, bpm, bpm_raw: res.bpm_raw == null ? null : Math.round(res.bpm_raw * 10) / 10, quality,
      reason: ok ? null : (res.reason || (res.bpm_raw == null ? 'gathering_data' : (stable ? 'weak_signal' : 'unstable'))),
      observation: ok ? {
        crew: s.op.crew, signal: 'heart_rate', value: bpm, unit: 'bpm',
        time: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), source: 'camera_rppg', method: 'estimated',
        quality, region: 'heart',
      } : null,
      progress: res.progress, fps: res.fps, light: res.light, waveform: res.waveform,
      amplitude_pct: res.amplitude_pct ?? null, rg: res.rg ?? null, bg: res.bg ?? null,   // diagnostics
    });
  }, STEP_MS);
}

/** Moves the measurement zone while running, e.g. to follow the face found by face.js. roi = {x,y,w,h} as fractions of the frame. */
export function setPulseRoi(roi) {
  if (!S || !roi || !(roi.w > 0.05) || !(roi.h > 0.05)) return;
  const x = Math.max(0, Math.min(0.95, roi.x)), y = Math.max(0, Math.min(0.95, roi.y));
  S.roi = { x, y, w: Math.min(roi.w, 1 - x), h: Math.min(roi.h, 1 - y) };
}

export function stopPulse() {
  if (TS) { TS.active = false; clearInterval(TS.timer); TS = null; }
  const s = S; if (!s) return;
  s.active = false; clearInterval(s.timer);
  if (s.video.cancelVideoFrameCallback && s.frameId != null) { try { s.video.cancelVideoFrameCallback(s.frameId); } catch {} }
  if (s.ownStream && s.video.srcObject) { s.video.srcObject.getTracks().forEach(t => t.stop()); s.video.srcObject = null; }
  S = null;
}

// ---------------------------------------------------------------------------
// Pure core (no browser APIs): can be tested in Node.
// t_ms: timestamp of each frame (ms); r, g, b: mean colour of the zone (0-255)
export function estimatePulse(t_ms, r, g, b, { method = 'pos', window_s = WINDOW_S } = {}) {
  const none = (extra) => ({ bpm_raw: null, quality: 0, reason: null, progress: 0, fps: 0, light: null, waveform: [], ...extra });
  const n0 = t_ms.length;
  if (n0 < 10) return none({});
  const tEnd = t_ms[n0 - 1];
  let i0 = 0; while (t_ms[i0] < tEnd - window_s * 1000) i0++;
  const dur = (tEnd - t_ms[i0]) / 1000;
  const fps = (n0 - 1 - i0) / Math.max(dur, 1e-3);
  let light = 0; for (let i = i0; i < n0; i++) light += g[i]; light /= (n0 - i0);
  const base = { progress: Math.min(1, dur / MIN_S), fps: Math.round(fps * 10) / 10, light: Math.round(light) };
  if (light < LIGHT_MIN) return none({ ...base, reason: 'low_light' });
  if (light > LIGHT_MAX) return none({ ...base, reason: 'saturated' });
  if (dur < MIN_S) return none(base);
  if (fps < 12) return none({ ...base, reason: 'low_frame_rate' });

  // 1) Uniform resampling to 30 Hz (a webcam does not deliver frames at exact intervals)
  const N = Math.floor(dur * FS);
  const R = new Float64Array(N), G = new Float64Array(N), B = new Float64Array(N);
  let j = i0;
  for (let k = 0; k < N; k++) {
    const tk = t_ms[i0] + k * 1000 / FS;
    while (j < n0 - 2 && t_ms[j + 1] < tk) j++;
    const a = Math.min(1, Math.max(0, (tk - t_ms[j]) / Math.max(t_ms[j + 1] - t_ms[j], 1e-6)));
    R[k] = r[j] + (r[j + 1] - r[j]) * a; G[k] = g[j] + (g[j + 1] - g[j]) * a; B[k] = b[j] + (b[j + 1] - b[j]) * a;
  }

  // 2) Pulse signal: POS combination of the three channels, or the normalised green channel
  const mR = mean(R), mG = mean(G), mB = mean(B);
  const x = new Float64Array(N);
  if (method === 'pos') {
    const s1 = new Float64Array(N), s2 = new Float64Array(N);
    for (let k = 0; k < N; k++) {
      const rn = R[k] / mR, gn = G[k] / mG, bn = B[k] / mB;
      s1[k] = gn - bn; s2[k] = gn + bn - 2 * rn;
    }
    const alpha = sd(s1) / (sd(s2) || 1);
    for (let k = 0; k < N; k++) x[k] = s1[k] + alpha * s2[k];
  } else {
    for (let k = 0; k < N; k++) x[k] = G[k] / mG - 1;
  }

  // 3) Detrend (2 s moving average) and filter 0.7-3 Hz (4th-order high-pass, 2nd-order low-pass)
  const h = FS;                                    // ±1 s
  const y = new Float64Array(N);
  let acc = 0; const pre = new Float64Array(N + 1);
  for (let k = 0; k < N; k++) { acc += x[k]; pre[k + 1] = acc; }
  for (let k = 0; k < N; k++) { const a = Math.max(0, k - h), c = Math.min(N, k + h + 1); y[k] = x[k] - (pre[c] - pre[a]) / (c - a); }
  let f = biquad(biquad(biquad(y, FS, 'highpass', F_MIN), FS, 'highpass', F_MIN), FS, 'lowpass', F_MAX);
  f = f.subarray(FS);                              // drop 1 s of filter transient
  const M = f.length;

  // 4) Spectrum (Hann window) in 0.5 bpm steps. It is computed from 0.45 Hz: if the strongest component is
  //    below the heart-rate band, it is motion or a slow light change, not a pulse.
  const df = 1 / 120; const nf = Math.round((F_MAX - F_GUARD) / df) + 1;
  const q0 = Math.round((F_MIN - F_GUARD) / df);           // first index inside the heart-rate band
  const P = new Float64Array(nf); let total = 0, kMax = q0, kGlobal = 0;
  for (let q = 0; q < nf; q++) {
    const w = 2 * Math.PI * (F_GUARD + q * df) / FS; let re = 0, im = 0;
    for (let k = 0; k < M; k++) { const v = f[k] * (0.5 - 0.5 * Math.cos(2 * Math.PI * k / (M - 1))); re += v * Math.cos(w * k); im -= v * Math.sin(w * k); }
    P[q] = re * re + im * im; total += P[q];
    if (P[q] > P[kGlobal]) kGlobal = q;
    if (q >= q0 && P[q] > P[kMax]) kMax = q;
  }
  const fPeak = F_GUARD + kMax * df;

  // 5) Quality: power within ±0.2 Hz of the peak over the whole computed spectrum. Noise ≈ 0.15; clean sine ≈ 0.95
  const half = Math.round(0.2 / df); let peak = 0;
  for (let q = Math.max(0, kMax - half); q <= Math.min(nf - 1, kMax + half); q++) peak += P[q];
  const fraction = total > 0 ? peak / total : 0;
  let quality = Math.max(0, Math.min(1, (fraction - 0.30) / (0.75 - 0.30)));    // ASSUMPTION
  let reason = null;
  // The peak must be a true maximum inside the band: not at the edge, not the tail of something slower
  const isLocalMax = kMax > q0 && kMax < nf - 1 && P[kMax] >= P[kMax - 1] && P[kMax] >= P[kMax + 1];
  if (kGlobal < q0 || !isLocalMax || P[q0] > 0.5 * P[kMax]) { quality = 0; reason = 'motion'; }

  // Diagnostics: amplitude of the filtered signal (% of the mean level) and colour ratios of the zone
  const amplitude_pct = Math.round(sd(f) * 10000) / 100;
  const rg = Math.round(mR / mG * 100) / 100, bg = Math.round(mB / mG * 100) / 100;

  const stride = Math.max(1, Math.floor(M / 150));
  const waveform = []; for (let k = 0; k < M; k += stride) waveform.push(f[k]);   // for drawing the wave
  return { bpm_raw: fPeak * 60, quality, peak_fraction: Math.round(fraction * 100) / 100, reason, ...base, progress: 1, waveform, amplitude_pct, rg, bg };
}

// ---------------------------------------------------------------------------
// TRACKED MODE: several skin zones that follow the face frame by frame (face.js gives the face box with onFrame).
// Built and tuned on a real 3-minute recording (still, talking, small movements); see the header for the numbers.
// Zones as [x0, x1, y0, y1], fractions of the face box (left to right, top of the forehead to the chin)
export const PULSE_ZONES = { face: [0.20, 0.80, 0.08, 0.68], forehead: [0.28, 0.72, 0.06, 0.22] };
const T_WINDOW_S = 10;                 // analysis window
const POS_S = 1.6;                     // length of the short POS windows that are overlap-added (Wang et al. 2017)
const MAX_GAP_MS = 400;                // a longer hole between frames means the face was lost: no estimate
const BAND_LO = 0.6, BAND_HI = 4.0;    // band used to scale each zone before adding them
const SHARE_CLEAR = 0.38;              // share of the heart-band power within ±5 bpm of the peak that counts as a clear peak (ASSUMPTION: tuned on one
                                       // person; pure noise reaches it in about 1.5 % of the windows)
const SHARE_ANCHORED = 0.22;           // lower bar for a value that agrees with the recent clear values
const ANCHOR_TOL = 6, ANCHOR_HOLD_S = 20;

/** Pure core of the tracked mode. t_ms: frame times; zones: [{ r, g, b }, ...] mean colour of each zone per frame. */
export function estimatePulseZones(t_ms, zones, { window_s = T_WINDOW_S } = {}) {
  const none = (extra) => ({ bpm_raw: null, share: 0, quality: 0, reason: null, progress: 0, fps: 0, light: null, ...extra });
  const n0 = t_ms.length;
  if (n0 < 10 || !zones.length) return none({});
  const tEnd = t_ms[n0 - 1];
  let i0 = n0 - 1; while (i0 > 0 && t_ms[i0 - 1] >= tEnd - window_s * 1000) i0--;
  const dur = (tEnd - t_ms[i0]) / 1000, fps = (n0 - 1 - i0) / Math.max(dur, 1e-3);
  let light = 0; for (let i = i0; i < n0; i++) light += zones[0].g[i]; light /= (n0 - i0);
  const base = { progress: Math.min(1, dur / window_s), fps: Math.round(fps * 10) / 10, light: Math.round(light) };
  if (light < LIGHT_MIN) return none({ ...base, reason: 'low_light' });
  if (light > LIGHT_MAX) return none({ ...base, reason: 'saturated' });
  if (dur < window_s - 0.25) return none(base);                        // the full window is needed
  for (let i = i0 + 1; i < n0; i++) if (t_ms[i] - t_ms[i - 1] > MAX_GAP_MS) return none({ ...base, reason: 'face_lost' });
  if (fps < 12) return none({ ...base, reason: 'low_frame_rate' });

  // 1) Uniform resampling to 30 Hz
  const N = Math.floor(dur * FS);
  const idx = new Int32Array(N), frac = new Float64Array(N);
  for (let k = 0, j = i0; k < N; k++) {
    const tk = t_ms[i0] + k * 1000 / FS;
    while (j < n0 - 2 && t_ms[j + 1] < tk) j++;
    idx[k] = j; frac[k] = Math.min(1, Math.max(0, (tk - t_ms[j]) / Math.max(t_ms[j + 1] - t_ms[j], 1e-6)));
  }
  const at = (v) => { const o = new Float64Array(N); for (let k = 0; k < N; k++) { const j = idx[k]; o[k] = v[j] + (v[j + 1] - v[j]) * frac[k]; } return o; };

  // 2) Per zone: POS over short overlapping windows, then its spectrum (Hann window) from 0.6 to 4 Hz in 0.5 bpm steps.
  //    Each zone is scaled to the same power in that band and the zones are added as complex spectra (same as adding the signals).
  const df = 1 / 120, nq = Math.round((BAND_HI - BAND_LO) / df) + 1;
  const re = new Float64Array(nq), im = new Float64Array(nq);
  const hann = new Float64Array(N); for (let k = 0; k < N; k++) hann[k] = 0.5 - 0.5 * Math.cos(2 * Math.PI * k / (N - 1));
  for (const z of zones) {
    const h = posOverlapAdd(at(z.r), at(z.g), at(z.b), Math.round(POS_S * FS));
    const m = mean(h); for (let k = 0; k < N; k++) h[k] = (h[k] - m) * hann[k];
    const zr = new Float64Array(nq), zi = new Float64Array(nq); let pw = 0;
    for (let q = 0; q < nq; q++) {
      const w = 2 * Math.PI * (BAND_LO + q * df) / FS; let a = 0, b = 0;
      for (let k = 0; k < N; k++) { a += h[k] * Math.cos(w * k); b -= h[k] * Math.sin(w * k); }
      zr[q] = a; zi[q] = b; pw += a * a + b * b;
    }
    const sc = 1 / Math.sqrt(pw || 1);
    for (let q = 0; q < nq; q++) { re[q] += zr[q] * sc; im[q] += zi[q] * sc; }
  }
  const P = new Float64Array(nq); for (let q = 0; q < nq; q++) P[q] = re[q] * re[q] + im[q] * im[q];

  // 3) Peak inside the heart-rate band and how much of the band's power sits within ±5 bpm of it
  const q0 = Math.round((F_MIN - BAND_LO) / df), q1 = Math.round((F_MAX - BAND_LO) / df);
  let kMax = q0, total = 0;
  for (let q = q0; q <= q1; q++) { total += P[q]; if (P[q] > P[kMax]) kMax = q; }
  const isLocalMax = kMax > q0 && kMax < q1 && P[kMax] >= P[kMax - 1] && P[kMax] >= P[kMax + 1];
  if (!isLocalMax) return none({ ...base, progress: 1, reason: 'motion' });   // the strongest component is at the edge: slow motion or light change
  let peak = 0; for (let q = Math.max(q0, kMax - 10); q <= Math.min(q1, kMax + 10); q++) peak += P[q];
  const share = total > 0 ? peak / total : 0;
  return { bpm_raw: (BAND_LO + kMax * df) * 60, share: Math.round(share * 1000) / 1000,
    quality: Math.round(Math.max(0, Math.min(1, (share - 0.15) / (0.50 - 0.15))) * 100) / 100, reason: null, ...base, progress: 1 };
}

// POS ("plane orthogonal to skin", Wang et al. 2017) with overlap-add of short windows of l samples:
// each short window is normalised by its own mean, so a change of light or position inside the 10 s does not spoil it all.
function posOverlapAdd(R, G, B, l) {
  const n = R.length, H = new Float64Array(n), s1 = new Float64Array(l), s2 = new Float64Array(l);
  for (let s = 0; s + l <= n; s++) {
    let mr = 0, mg = 0, mb = 0;
    for (let j = 0; j < l; j++) { mr += R[s + j]; mg += G[s + j]; mb += B[s + j]; }
    mr /= l; mg /= l; mb /= l;
    let m1 = 0, m2 = 0;
    for (let j = 0; j < l; j++) { const r = R[s + j] / mr, g = G[s + j] / mg, b = B[s + j] / mb; s1[j] = g - b; s2[j] = g + b - 2 * r; m1 += s1[j]; m2 += s2[j]; }
    m1 /= l; m2 /= l;
    let v1 = 0, v2 = 0; for (let j = 0; j < l; j++) { v1 += (s1[j] - m1) ** 2; v2 += (s2[j] - m2) ** 2; }
    const alpha = Math.sqrt(v1 / (v2 || 1e-12)), mh = m1 + alpha * m2;
    for (let j = 0; j < l; j++) H[s + j] += s1[j] + alpha * s2[j] - mh;
  }
  return H;
}

/** Decides which estimates are shown. update(time_s, estimate) -> { bpm, basis, reason }.
 *  A pulse persists and noise does not, so nothing is shown until there is an ANCHOR: at least 3 clear estimates
 *  (peak share >= 0.38) that agree within ±6 bpm and are spread over 4 s or more, inside the last 20 s.
 *  Then an estimate is shown when it is within ±6 bpm of the anchor (the median of those clear values):
 *  'clear' if its own peak is clear, 'anchored' if the peak is weaker (share >= 0.22) but agrees with the anchor.
 *  The number shown is the median of the values accepted in the last 3.5 s.
 *  With these numbers, 150 simulated noise-only streams of 40 s showed a value in none or one of them. */
export function createPulseGate({ clear = SHARE_CLEAR, anchored = SHARE_ANCHORED, tol = ANCHOR_TOL, hold_s = ANCHOR_HOLD_S, tolAnchor = 6, minClear = 3, minSpan_s = 4 } = {}) {
  let hist = [], accepted = [], lastT = null;
  const med = (v) => { const o = v.slice().sort((a, b) => a - b); return o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2; };
  return {
    update(t_s, est) {
      if (lastT != null && t_s - lastT > 3) { hist = []; accepted = []; }      // estimates stopped for a while: start again
      lastT = t_s;
      hist = hist.filter(h => t_s - h.t <= hold_s); accepted = accepted.filter(a => t_s - a.t <= 3.5);
      if (est.bpm_raw == null) return { bpm: null, basis: null, reason: est.reason || 'gathering_data' };
      hist.push({ t: t_s, bpm: est.bpm_raw, share: est.share });
      const cl = hist.filter(h => h.share >= clear);
      if (cl.length < minClear) return { bpm: null, basis: null, reason: 'weak_signal' };
      const anchor = med(cl.map(h => h.bpm)), support = cl.filter(h => Math.abs(h.bpm - anchor) <= tolAnchor);
      if (support.length < minClear || support[support.length - 1].t - support[0].t < minSpan_s) return { bpm: null, basis: null, reason: 'unstable' };
      if (est.share < anchored || Math.abs(est.bpm_raw - anchor) > tol) return { bpm: null, basis: null, reason: est.share < anchored ? 'weak_signal' : 'unstable' };
      accepted.push({ t: t_s, bpm: est.bpm_raw });
      return { bpm: Math.round(med(accepted.map(a => a.bpm))), basis: est.share >= clear ? 'clear' : 'anchored', reason: null };
    },
    reset() { hist = []; accepted = []; lastT = null; },
  };
}

// Live tracked mode. The page starts face.js with onFrame: pushFaceFrame, so the zones are read on the very frame the
// face box belongs to. It does not open the camera: face.js (or the page) owns the video.
let TS = null;
export function startPulseTracked(videoEl, onResult, options = {}) {
  stopPulse();
  const s = TS = { video: videoEl, cb: onResult, op: { crew: 'CM-1', ...options }, active: true, t: [],
    z: { face: { r: [], g: [], b: [] }, forehead: { r: [], g: [], b: [] } }, gate: createPulseGate(), shown: [],
    canvas: document.createElement('canvas'), timer: null };
  s.canvas.width = 16; s.canvas.height = 12;
  s.ctx = s.canvas.getContext('2d', { willReadFrequently: true });
  s.timer = setInterval(() => {
    if (!s.active) return;
    const est = estimatePulseZones(s.t, [s.z.face, s.z.forehead]);
    const g = s.gate.update(performance.now() / 1000, est);
    if (g.bpm != null) s.shown.push(g.bpm);
    const quality = g.bpm == null ? est.quality : (g.basis === 'clear' ? Math.max(0.6, est.quality) : 0.5);
    s.cb({
      state: est.bpm_raw == null && !est.reason ? 'measuring' : (g.bpm != null ? 'ok' : 'low_quality'),
      bpm: g.bpm, bpm_raw: est.bpm_raw == null ? null : Math.round(est.bpm_raw * 10) / 10, quality, share: est.share, basis: g.basis,
      reason: g.bpm != null ? null : (g.reason || 'gathering_data'),
      observation: g.bpm != null ? pulseObservation(s.op.crew, g.bpm, quality) : null,
      progress: est.progress, fps: est.fps, light: est.light, summary: pulseSummary(),
    });
  }, STEP_MS);
}
const pulseObservation = (crew, bpm, quality) => ({ crew, signal: 'heart_rate', value: bpm, unit: 'bpm',
  time: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), source: 'camera_rppg', method: 'estimated', quality, region: 'heart' });

/** Call for every video frame with what face.js gives to onFrame ({ t, found, box }). */
export function pushFaceFrame(f) {
  const s = TS; if (!s || !s.active || !f || !f.found) return;      // a lost face leaves a hole in time, which the estimator detects
  const v = s.video, W = v.videoWidth, H = v.videoHeight; if (!W || !H) return;
  const bw = f.box.x1 - f.box.x0, bh = f.box.y1 - f.box.y0;
  for (const name of ['face', 'forehead']) {
    const zn = PULSE_ZONES[name];
    const x = Math.max(0, f.box.x0 + zn[0] * bw) * W, y = Math.max(0, f.box.y0 + zn[2] * bh) * H;
    const w = Math.max(2, (zn[1] - zn[0]) * bw * W), h = Math.max(2, (zn[3] - zn[2]) * bh * H);
    s.ctx.drawImage(v, x, y, Math.min(w, W - x), Math.min(h, H - y), 0, 0, s.canvas.width, s.canvas.height);
    const d = s.ctx.getImageData(0, 0, s.canvas.width, s.canvas.height).data; let r = 0, g = 0, b = 0; const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    s.z[name].r.push(r / n); s.z[name].g.push(g / n); s.z[name].b.push(b / n);
  }
  s.t.push(f.t);
  const limit = f.t - (T_WINDOW_S + 2) * 1000;
  while (s.t.length && s.t[0] < limit) { s.t.shift(); for (const name of ['face', 'forehead']) { s.z[name].r.shift(); s.z[name].g.shift(); s.z[name].b.shift(); } }
}

/** One value for the whole session so far (e.g. a 30 s check-in): the median of the shown values.
 *  It needs at least 5 shown seconds. -> { bpm, seconds, observation } or null. */
export function pulseSummary() {
  const s = TS; if (!s || s.shown.length < 5) return null;
  const o = s.shown.slice().sort((a, b) => a - b), bpm = o[Math.floor(o.length / 2)];
  return { bpm, seconds: o.length, observation: pulseObservation(s.op.crew, bpm, o.length >= 10 ? 0.8 : 0.6) };
}

// --- helpers ------------------------------------------------------------------
const mean = (v) => { let a = 0; for (let i = 0; i < v.length; i++) a += v[i]; return a / v.length; };
const sd = (v) => { const m = mean(v); let a = 0; for (let i = 0; i < v.length; i++) a += (v[i] - m) ** 2; return Math.sqrt(a / v.length); };
// 2nd-order biquad filter (Butterworth, Q = 0.707), formulas from the "Audio EQ Cookbook" (R. Bristow-Johnson)
function biquad(x, fs, type, fc) {
  const w = 2 * Math.PI * fc / fs, cw = Math.cos(w), al = Math.sin(w) / (2 * Math.SQRT1_2);
  let b0, b1, b2;
  if (type === 'highpass') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; }
  else { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; }
  const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
