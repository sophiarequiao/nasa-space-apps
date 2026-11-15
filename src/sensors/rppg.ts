// Camera pulse (remote photoplethysmography, rPPG) - the "plus" of the project.
// Each heartbeat changes skin colour very slightly; the camera can see it.
// Everything runs in the browser; video frames are never stored or sent.
//
// Method: mean RGB of skin pixels inside the face guide -> POS projection (Wang et al. 2017)
// -> detrend -> Hann window -> spectrum 0.7-3.0 Hz (42-180 bpm) -> peak = pulse.
// Quality = share of spectral power in the peak; low quality is reported, never hidden.
// No face recognition: the guide only tells us where the skin is.

export interface RppgEstimate {
  bpm: number | null;
  quality: number;
  seconds: number;
  fps: number;
}

interface Sample { t: number; r: number; g: number; b: number }

export class RppgEstimator {
  private samples: Sample[] = [];
  constructor(private windowS = 10) {}

  reset(): void { this.samples = []; }

  push(r: number, g: number, b: number, tMs: number): void {
    this.samples.push({ t: tMs / 1000, r, g, b });
    const cutoff = tMs / 1000 - this.windowS - 1;
    while (this.samples.length && this.samples[0].t < cutoff) this.samples.shift();
  }

  estimate(): RppgEstimate {
    const s = this.samples;
    if (s.length < 32) return { bpm: null, quality: 0, seconds: 0, fps: 0 };
    const t0 = s[0].t, t1 = s[s.length - 1].t;
    const seconds = t1 - t0;
    const fps = (s.length - 1) / Math.max(seconds, 1e-3);
    if (seconds < 5) return { bpm: null, quality: 0, seconds, fps };

    // resample to 30 Hz
    const fsR = 30;
    const n = Math.floor(seconds * fsR);
    const R = new Float64Array(n), G = new Float64Array(n), B = new Float64Array(n);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const t = t0 + i / fsR;
      while (j < s.length - 2 && s[j + 1].t < t) j++;
      const a = s[j], b = s[j + 1];
      const u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
      R[i] = a.r + (b.r - a.r) * u; G[i] = a.g + (b.g - a.g) * u; B[i] = a.b + (b.b - a.b) * u;
    }
    const mean = (x: Float64Array) => x.reduce((p, v) => p + v, 0) / x.length;
    const mr = mean(R), mg = mean(G), mb = mean(B);
    if (mr < 1 || mg < 1 || mb < 1) return { bpm: null, quality: 0, seconds, fps };

    // POS projection
    const s1 = new Float64Array(n), s2 = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const r = R[i] / mr, g = G[i] / mg, b = B[i] / mb;
      s1[i] = g - b;
      s2[i] = g + b - 2 * r;
    }
    const sd = (x: Float64Array) => { const m = mean(x); return Math.sqrt(x.reduce((p, v) => p + (v - m) ** 2, 0) / x.length); };
    const alpha = sd(s1) / (sd(s2) || 1);
    const h = new Float64Array(n);
    for (let i = 0; i < n; i++) h[i] = s1[i] + alpha * s2[i];

    // detrend with a 1.5 s moving average, then Hann window
    const k = Math.round(1.5 * fsR);
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let acc = 0, c = 0;
      for (let q = Math.max(0, i - k); q <= Math.min(n - 1, i + k); q++) { acc += h[q]; c++; }
      x[i] = (h[i] - acc / c) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
    }

    // spectrum by direct DFT on a fine frequency grid inside the heart-rate band
    let bestF = 0, bestP = 0, total = 0;
    const powers: { f: number; p: number }[] = [];
    for (let f = 0.7; f <= 3.0; f += 0.01) {
      let re = 0, im = 0;
      const w = (2 * Math.PI * f) / fsR;
      for (let i = 0; i < n; i++) { re += x[i] * Math.cos(w * i); im -= x[i] * Math.sin(w * i); }
      const p = re * re + im * im;
      powers.push({ f, p });
      total += p;
      if (p > bestP) { bestP = p; bestF = f; }
    }
    // power within +-0.1 Hz of the peak and its first harmonic, as a share of the band
    const near = powers.filter((q) => Math.abs(q.f - bestF) <= 0.1 || Math.abs(q.f - 2 * bestF) <= 0.1).reduce((a, q) => a + q.p, 0);
    const quality = total > 0 ? Math.min(1, near / total / 0.5) : 0;
    return { bpm: Math.round(bestF * 60), quality, seconds, fps };
  }
}

/**
 * Mean RGB of likely-skin pixels in a rectangle of a video frame.
 * Skin filter: simple YCbCr box (Chai & Ngan 1999 style), no face recognition.
 */
export function sampleSkin(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): { r: number; g: number; b: number; skinShare: number } | null {
  const img = ctx.getImageData(x, y, w, h).data;
  let r = 0, g = 0, b = 0, c = 0;
  const total = img.length / 4;
  for (let i = 0; i < img.length; i += 8) { // every second pixel
    const R = img[i], G = img[i + 1], B = img[i + 2];
    const cb = 128 - 0.168736 * R - 0.331264 * G + 0.5 * B;
    const cr = 128 + 0.5 * R - 0.418688 * G - 0.081312 * B;
    if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) { r += R; g += G; b += B; c++; }
  }
  if (c < 50) return null;
  return { r: r / c, g: g / c, b: b / c, skinShare: (c * 2) / total };
}
