// src/sensors/face.js — OPTIONAL: eyelids and face from the camera (MediaPipe Face Landmarker, Apache-2.0).
// API: startFace(videoEl, onResult, options?) / stopFace()
//   onResult({ state, eyeOpenness, blink_rate, perclos, mean_blink_ms, long_closures, yawns, observations, roi, fps, window_s })
//     state: 'loading' | 'no_face' | 'measuring' (less than 20 s of data) | 'ok'
//     blink_rate (blinks/min)   spontaneous blink rate over the window
//     perclos (%)               share of time with the eyes closed (the classic drowsiness measure, Wierwille 1994 / Dinges 1998)
//     long_closures (count)     eyelid closures longer than 500 ms: slow "droops", not blinks
//     yawns (count)             mouth wide open for more than 1 s
//     roi: face zone (forehead and cheeks) as fractions of the frame; pass it to rppg.js with setPulseRoi()
//     observations: app-format objects once the window is long enough
//   options: { crew, window_s (default 60), modelUrl, wasmUrl, onFrame }
//     onFrame({ t, found, box, blink, jaw, roi }): called for every video frame with the face box (fractions of the frame).
//     It lets rppg.js follow the face frame by frame and skip the eyes and the mouth.
// What it is: a screening signal of eyelid behaviour compared with the person's own baseline. It is NOT a diagnosis
// and cannot tell pain, illness or stress from a face. All thresholds are ASSUMPTIONS to be tuned with real data.
// Real test (one person, 3 min): blink rate 8/min at rest and 19/min blinking on purpose; PERCLOS 1 % at rest and
// 36 % with slow eye closures. Known limit: looking down (e.g. at the keyboard) reads as eyes closing.
// Privacy: the video never leaves the browser and is not stored; only the eyelid and mouth scores are kept.
// Drafted with AI assistance (Claude, Anthropic). MIT licence. MediaPipe is vendored in vendor/mediapipe (Apache-2.0).

const CLOSED = 0.5, OPEN = 0.3;        // blink score hysteresis: closing above 0.5, reopening below 0.3 (ASSUMPTION)
const PERCLOS_LEVEL = 0.6;             // eyes counted as closed for PERCLOS above this score (ASSUMPTION)
const LONG_CLOSURE_MS = 500;           // longer than a blink (blinks last ~100-400 ms)
const MAX_BLINK_MS = 500;
const YAWN_LEVEL = 0.5, YAWN_MS = 1000;// jawOpen above 0.5 for 1 s (ASSUMPTION; with 0.6 / 1.5 s a real test caught 1 of 2 yawns)
const GAP_MS = 300;                    // a longer hole between samples means the face was lost: open events are dropped
const MIN_WINDOW_S = 20, WINDOW_S = 60;

// ---------------------------------------------------------------------------
// Pure core (no browser APIs): feed it one sample per video frame, ask for the statistics. Testable in Node.
export function createEyeTracker() {
  const samples = [];                  // { t, blink, jaw } with t in ms
  const blinks = [], closures = [], yawns = [];   // events: { t, ms }
  let closedSince = null, yawnSince = null, yawnCounted = false, lastT = null;
  return {
    /** @param {number} t ms · @param {number} blink 0 (open) .. 1 (closed) · @param {number} jaw 0 .. 1 (mouth wide open) */
    push(t, blink, jaw = 0) {
      if (lastT != null && t - lastT > GAP_MS) { closedSince = null; yawnSince = null; }   // face lost (looking away): not an eyelid closure
      lastT = t;
      samples.push({ t, blink, jaw });
      if (closedSince == null && blink > CLOSED) closedSince = t;
      else if (closedSince != null && blink < OPEN) {
        const ms = t - closedSince;
        (ms <= MAX_BLINK_MS ? blinks : closures).push({ t, ms });
        closedSince = null;
      }
      if (jaw > YAWN_LEVEL) {
        if (yawnSince == null) { yawnSince = t; yawnCounted = false; }
        else if (!yawnCounted && t - yawnSince >= YAWN_MS) { yawns.push({ t, ms: YAWN_MS }); yawnCounted = true; }
      } else yawnSince = null;
      const old = t - 5 * 60 * 1000;   // keep 5 minutes at most
      while (samples.length && samples[0].t < old) samples.shift();
    },
    /** Statistics over the last `window_s` seconds ending at `now` (ms) */
    stats(now, window_s = WINDOW_S) {
      const from = now - window_s * 1000;
      const w = samples.filter(s => s.t >= from);
      if (w.length < 2) return { window_s: 0, fps: 0 };
      const span = (w[w.length - 1].t - w[0].t) / 1000;
      let closedTime = 0;
      for (let i = 1; i < w.length; i++) if (w[i].blink > PERCLOS_LEVEL) closedTime += Math.min(w[i].t - w[i - 1].t, 200);
      const b = blinks.filter(e => e.t >= from), c = closures.filter(e => e.t >= from), y = yawns.filter(e => e.t >= from);
      return {
        window_s: Math.round(span * 10) / 10,
        fps: Math.round((w.length - 1) / Math.max(span, 1e-3) * 10) / 10,
        blink_rate: span > 0 ? Math.round(b.length / span * 600) / 10 : 0,
        perclos: span > 0 ? Math.round(closedTime / (span * 1000) * 1000) / 10 : 0,
        mean_blink_ms: b.length ? Math.round(b.reduce((a, e) => a + e.ms, 0) / b.length) : null,
        long_closures: c.length,
        yawns: y.length,
        eyeOpenness: Math.round((1 - w[w.length - 1].blink) * 100) / 100,
      };
    },
  };
}

// ---------------------------------------------------------------------------
let S = null;

export async function startFace(videoEl, onResult, options = {}) {
  stopFace();
  const s = S = { video: videoEl, cb: onResult, op: { crew: 'CM-1', window_s: WINDOW_S, ...options }, active: true, ownStream: false,
    tracker: createEyeTracker(), lastSeen: 0, roi: null, timer: null, frameId: null, lm: null, lastVideoTime: -1 };
  s.cb({ state: 'loading' });

  const base = new URL('../../vendor/mediapipe/', import.meta.url);
  const { FaceLandmarker, FilesetResolver } = await import(new URL('vision_bundle.mjs', base).href);
  const fileset = await FilesetResolver.forVisionTasks(s.op.wasmUrl || new URL('wasm', base).href);
  // Model: local copy first (offline), otherwise Google's public URL
  let modelUrl = s.op.modelUrl;
  if (!modelUrl) {
    const local = new URL('face_landmarker.task', base).href;
    const ok = await fetch(local, { method: 'HEAD' }).then(r => r.ok).catch(() => false);
    modelUrl = ok ? local : 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
  }
  const make = (delegate) => FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: modelUrl, delegate }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true });
  try { s.lm = await make('GPU'); } catch { s.lm = await make('CPU'); }
  if (S !== s) { s.lm.close(); return; }

  if (!videoEl.srcObject) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }, audio: false });
    if (S !== s) { stream.getTracks().forEach(t => t.stop()); return; }
    videoEl.srcObject = stream; s.ownStream = true; videoEl.playsInline = true; videoEl.muted = true;
    await videoEl.play();
  }

  const score = (cats, name) => { const c = cats.find(x => x.categoryName === name); return c ? c.score : 0; };
  const frame = () => {
    if (!s.active) return;
    const v = s.video;
    if (v.videoWidth && v.currentTime !== s.lastVideoTime) {
      s.lastVideoTime = v.currentTime;
      const now = performance.now();
      let res = null; try { res = s.lm.detectForVideo(v, now); } catch { /* skip this frame */ }
      if (res && res.faceLandmarks && res.faceLandmarks.length && res.faceBlendshapes && res.faceBlendshapes.length) {
        const cats = res.faceBlendshapes[0].categories;
        const blink = (score(cats, 'eyeBlinkLeft') + score(cats, 'eyeBlinkRight')) / 2;
        s.tracker.push(now, blink, score(cats, 'jawOpen'));
        s.lastSeen = now;
        // Face box from the landmarks -> zone with forehead and cheeks (no mouth), smoothed so it does not jitter
        let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
        for (const p of res.faceLandmarks[0]) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
        const bw = x1 - x0, bh = y1 - y0;
        const r = { x: x0 + 0.2 * bw, y: y0 + 0.08 * bh, w: 0.6 * bw, h: 0.6 * bh };
        s.roi = s.roi ? { x: s.roi.x + 0.2 * (r.x - s.roi.x), y: s.roi.y + 0.2 * (r.y - s.roi.y), w: s.roi.w + 0.2 * (r.w - s.roi.w), h: s.roi.h + 0.2 * (r.h - s.roi.h) } : r;
        if (s.op.onFrame) s.op.onFrame({ t: now, found: true, box: { x0, y0, x1, y1 }, blink, jaw: score(cats, 'jawOpen'), roi: s.roi });
      } else if (s.op.onFrame) s.op.onFrame({ t: now, found: false });
    }
    s.frameId = s.video.requestVideoFrameCallback ? s.video.requestVideoFrameCallback(frame) : requestAnimationFrame(frame);
  };
  frame();

  s.timer = setInterval(() => {
    if (!s.active) return;
    const now = performance.now();
    if (now - s.lastSeen > 1500) { s.cb({ state: 'no_face', roi: null }); return; }
    const st = s.tracker.stats(now, s.op.window_s);
    const ready = st.window_s >= MIN_WINDOW_S;
    const quality = Math.round(Math.max(0, Math.min(1, (st.fps - 10) / 10)) * Math.min(1, st.window_s / s.op.window_s) * 100) / 100;   // needs >= 20 fps and a full window
    const time = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const obs = (signal, value, unit) => ({ crew: s.op.crew, signal, value, unit, time, source: 'camera_face', method: 'estimated', quality, region: 'brain' });
    s.cb({
      state: ready ? 'ok' : 'measuring', ...st, quality, roi: s.roi,
      observations: ready ? [obs('blink_rate', st.blink_rate, 'blinks/min'), obs('perclos', st.perclos, '%'), obs('long_eye_closures', st.long_closures, 'count'), obs('yawns', st.yawns, 'count')] : [],
    });
  }, 1000);
}

export function stopFace() {
  const s = S; if (!s) return;
  s.active = false; clearInterval(s.timer);
  if (s.video.cancelVideoFrameCallback && s.frameId != null) { try { s.video.cancelVideoFrameCallback(s.frameId); } catch {} }
  if (s.lm) { try { s.lm.close(); } catch {} }
  if (s.ownStream && s.video.srcObject) { s.video.srcObject.getTracks().forEach(t => t.stop()); s.video.srcObject = null; }
  S = null;
}
