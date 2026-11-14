// src/sensors/rppg.js — OPTIONAL: heart rate from the camera (rPPG). Not a medical device.
// API: startPulse(videoEl, onResult, options?) / stopPulse() / setPulseRoi(roi)
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
