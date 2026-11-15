// src/sensors/face.js — OPTIONAL: eyelids and face from the camera (MediaPipe Face Landmarker, Apache-2.0).
// API: startFace(videoEl, onResult, options?) / stopFace()
//   onResult({ state, eyeOpenness, blink_rate, perclos, mean_blink_ms, long_closures, yawns, observations, roi, fps, window_s })
//     state: 'loading' | 'no_face' | 'measuring' (less than 20 s of data) | 'ok'
//     blink_rate (blinks/min)   spontaneous blink rate over the window
//     perclos (%)               share of time with the eyes closed (the classic drowsiness measure, Wierwille 1994 / Dinges 1998)
//     long_closures (count)     eyelid closures longer than 500 ms: slow "droops", not blinks
//     yawns (count)             mouth wide open for more than 1 s
//     blink_duration (ms)       mean length of the blinks (longer blinks go with drowsiness); coarse at 20-30 fps
//     facial_expressiveness     how much the brows, cheeks and mouth corners move while the person talks (0-100 scale).
//                               Less movement than the person's usual is a behavioural signal, nothing more.
//     head_movement (% of the face width per second), head_tilt (degrees), posture_shifts (per minute): posture and
//                               movement of the head, the first step of "body language". EXPERIMENTAL: checked on two real
//                               recordings (still / talking / moving), not yet against any reference. See createPostureTracker.
//     roi: face zone (forehead and cheeks) as fractions of the frame; pass it to rppg.js with setPulseRoi()
//     observations: app-format objects once the window is long enough
//   options: { crew, window_s (default 60), modelUrl, wasmUrl, onFrame }
//     onFrame({ t, found, box, blink, jaw, roi, shapes, roll }): called for every video frame with the face box (fractions of the
//     frame), the 52 expression scores of MediaPipe (shapes.mouthSmileLeft, ...) and the sideways tilt of the head in degrees.
//     It lets rppg.js follow the face frame by frame and skip the eyes and the mouth.
// Also here: symmetryIndex(frames, left, right), for a GUIDED check ("smile", "raise your eyebrows") that compares the two
//   sides of the face. It is an aid for the crew medical officer, to be read against the person's own pre-flight check.
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

// Expression scores that are not driven by speech itself (the jaw and the lips are left out)
const EXPRESSIVE = ['browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight', 'cheekSquintLeft', 'cheekSquintRight',
  'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight', 'noseSneerLeft', 'noseSneerRight', 'eyeWideLeft', 'eyeWideRight'];

/** Pure: how much the face moves. push(t_ms, shapes) per frame; stats(now_ms, window_s) -> { expressiveness } (0-100).
 *  expressiveness = 100 × the mean, over the scores above, of how much each one varies in time (standard deviation). */
export function createExpressionTracker() {
  const rows = [];
  return {
    push(t, shapes) { rows.push({ t, v: EXPRESSIVE.map(k => shapes[k] || 0) }); const old = t - 5 * 60 * 1000; while (rows.length && rows[0].t < old) rows.shift(); },
    stats(now, window_s = WINDOW_S) {
      const w = rows.filter(r => r.t >= now - window_s * 1000);
      if (w.length < 60) return { expressiveness: null };          // a few seconds of frames at least
      let sum = 0;
      for (let k = 0; k < EXPRESSIVE.length; k++) {
        let m = 0; for (const r of w) m += r.v[k]; m /= w.length;
        let v = 0; for (const r of w) v += (r.v[k] - m) ** 2;
        sum += Math.sqrt(v / w.length);
      }
      return { expressiveness: Math.round(sum / EXPRESSIVE.length * 1000) / 10 };
    },
  };
}

// ---------------------------------------------------------------------------
// Posture and movement of the head: the first, measurable step of "body language". Pure, testable in Node.
// Feed it the face position of every video frame; it answers with three numbers for the window:
//   head_movement (% of the face width per second)  how far the head travels. Averages over 0.5 s take out the jitter
//                                                   of the landmarks (and most of a fast nod): it is the slow movement
//                                                   of posture, and a still head reads close to 0
//   head_tilt (degrees)                             median sideways tilt (line between the outer eye corners);
//                                                   positive: towards the person's left shoulder
//   posture_shifts (per minute)                     times the head settles in a new place (a quarter of a face width
//                                                   away, or 8 degrees of tilt) and stays there for 1.5 s
// What it is: behaviour compared with the person's own usual, nothing more. Less head movement than usual has been
// measured when depression was more severe (Girard et al. 2014) and head movement was one of the fatigue measures
// tested for drivers (FHWA/NHTSA 1998). Neither makes this a diagnosis. In microgravity there is no single correct
// posture (NASA neutral body posture; the STS-57 study found it differs between people), so only the personal
// baseline makes sense. All thresholds are ASSUMPTIONS to be tuned with real data.
const BIN_MS = 500, SHIFT_WIDTHS = 0.25, SHIFT_DEG = 8, SHIFT_BINS = 3, MIN_STEPS = 20;
export function createPostureTracker({ minFrames = 3 } = {}) {   // minFrames: looks needed inside each 0.5 s average
  const frames = [];                   // { t, x, y, w, roll }: x, y and w in the same unit (fractions of the frame width)
  return {
    /** @param {number} t ms · x, y: centre of the face · w: width of the face · roll: sideways tilt in degrees, or null */
    push(t, x, y, w, roll = null) {
      if (!(w > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return;
      frames.push({ t, x, y, w, roll: Number.isFinite(roll) ? roll : null });
      while (frames.length && t - frames[0].t > 120000) frames.shift();
    },
    stats(now, window_s = WINDOW_S) {
      const none = { window_s: 0, head_movement: null, head_tilt: null, posture_shifts: null };
      const from = now - window_s * 1000, bins = new Map();
      for (const f of frames) {
        if (f.t < from || f.t > now) continue;
        const k = Math.floor(f.t / BIN_MS); let b = bins.get(k);
        if (!b) bins.set(k, b = { k, n: 0, x: 0, y: 0, w: 0, r: 0, nr: 0 });
        b.n++; b.x += f.x; b.y += f.y; b.w += f.w; if (f.roll != null) { b.r += f.roll; b.nr++; }
      }
      const list = [...bins.values()].filter(b => b.n >= minFrames).sort((a, b) => a.k - b.k)
        .map(b => ({ k: b.k, x: b.x / b.n, y: b.y / b.n, w: b.w / b.n, roll: b.nr ? b.r / b.nr : null }));
      if (list.length < MIN_STEPS + 1) return none;
      // Movement: path of the 0.5 s averages, in face widths, per second of continuous view
      let path = 0, steps = 0;
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1], b = list[i]; if (b.k - a.k !== 1) continue;      // a hole (face lost) is not movement
        path += Math.hypot(b.x - a.x, b.y - a.y) / ((a.w + b.w) / 2); steps++;
      }
      // Tilt: median of the 0.5 s averages
      const rolls = list.map(b => b.roll).filter(r => r != null).sort((a, b) => a - b);
      const tilt = rolls.length >= MIN_STEPS ? (rolls[(rolls.length - 1) >> 1] + rolls[rolls.length >> 1]) / 2 : null;
      // Shifts: the head goes away from where it was resting AND settles there
      const far = (b, ref) => Math.hypot(b.x - ref.x, b.y - ref.y) / ref.w >= SHIFT_WIDTHS || (b.roll != null && ref.roll != null && Math.abs(b.roll - ref.roll) >= SHIFT_DEG);
      const mean = (c) => ({ x: c.reduce((s, b) => s + b.x, 0) / c.length, y: c.reduce((s, b) => s + b.y, 0) / c.length, w: c.reduce((s, b) => s + b.w, 0) / c.length,
        roll: c.every(b => b.roll != null) ? c.reduce((s, b) => s + b.roll, 0) / c.length : null });
      let ref = list[0], cand = [], shifts = 0;
      for (let i = 1; i < list.length; i++) {
        const b = list[i];
        if (b.k - list[i - 1].k !== 1 || !far(b, ref)) { cand = []; continue; }
        cand.push(b); if (cand.length > SHIFT_BINS) cand.shift();
        if (cand.length === SHIFT_BINS) {
          const m = mean(cand);
          const settled = cand.every(c => Math.hypot(c.x - m.x, c.y - m.y) / m.w < SHIFT_WIDTHS / 2 && (c.roll == null || m.roll == null || Math.abs(c.roll - m.roll) < SHIFT_DEG / 2));
          if (settled) { shifts++; ref = m; cand = []; }
        }
      }
      const seconds = list.length * BIN_MS / 1000;
      return {
        window_s: Math.round(seconds * 10) / 10,
        head_movement: steps >= MIN_STEPS ? Math.round(1000 * path / (steps * BIN_MS / 1000)) / 10 : null,
        head_tilt: tilt == null ? null : Math.round(tilt * 10) / 10,
        posture_shifts: Math.round(shifts / (seconds / 60) * 10) / 10,
      };
    },
  };
}

/** Pure: compares the two sides of the face during a held expression.
 *  frames: the `shapes` of each video frame while the person holds it; left/right: names of the two scores to compare
 *  (e.g. 'mouthSmileLeft', 'mouthSmileRight'). Uses the stronger half of the frames in which the movement is present.
 *  -> { left, right, asymmetry (0-100 %), weaker: 'left'|'right' } or null if the movement was not seen. */
export function symmetryIndex(frames, left, right, minEffort = 0.25) {
  const act = frames.filter(f => f && ((f[left] || 0) + (f[right] || 0)) / 2 >= minEffort);
  if (act.length < 5) return null;
  act.sort((a, b) => (b[left] + b[right]) - (a[left] + a[right]));
  const top = act.slice(0, Math.max(5, Math.ceil(act.length / 2)));
  const L = top.reduce((a, f) => a + f[left], 0) / top.length, R = top.reduce((a, f) => a + f[right], 0) / top.length;
  return { left: Math.round(L * 100) / 100, right: Math.round(R * 100) / 100, asymmetry: Math.round(100 * Math.abs(L - R) / Math.max(L, R)), weaker: L < R ? 'left' : 'right' };
}

// ---------------------------------------------------------------------------
let S = null;

export async function startFace(videoEl, onResult, options = {}) {
  stopFace();
  const s = S = { video: videoEl, cb: onResult, op: { crew: 'CM-1', window_s: WINDOW_S, ...options }, active: true, ownStream: false,
    tracker: createEyeTracker(), expr: createExpressionTracker(), posture: createPostureTracker(), lastSeen: 0, roi: null, timer: null, frameId: null, lm: null, lastVideoTime: -1 };
  s.cb({ state: 'loading' });

  const base = new URL('../../vendor/mediapipe/', import.meta.url);
  const { FaceLandmarker, FilesetResolver } = await import(new URL('vision_bundle.mjs', base).href);
  const fileset = await FilesetResolver.forVisionTasks(s.op.wasmUrl || new URL('wasm', base).href);
  // Model: local copy first (offline), otherwise Google's public URL
  let modelUrl = s.op.modelUrl;
  if (!modelUrl) {
    const local = new URL('face_landmarker.task', base).href;
    const ok = await fetch(local, { method: 'HEAD' }).then(r => r.ok && !/text\/html/.test(r.headers.get('content-type') || '')).catch(() => false);   // some servers answer a missing file with their home page
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
        const shapes = {}; for (const c of cats) shapes[c.categoryName] = c.score;
        const blink = (score(cats, 'eyeBlinkLeft') + score(cats, 'eyeBlinkRight')) / 2;
        s.tracker.push(now, blink, score(cats, 'jawOpen'));
        s.expr.push(now, shapes);
        s.lastSeen = now;
        // Face box from the landmarks -> zone with forehead and cheeks (no mouth), smoothed so it does not jitter
        let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
        for (const p of res.faceLandmarks[0]) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
        const bw = x1 - x0, bh = y1 - y0;
        // Head posture: sideways tilt from the outer corners of the two eyes (landmarks 33 and 263), position from the face box
        const lm = res.faceLandmarks[0], asp = v.videoHeight / v.videoWidth, e1 = lm[33], e2 = lm[263];
        const roll = e1 && e2 ? Math.round(Math.atan2((e2.y - e1.y) * asp, e2.x - e1.x) * 1800 / Math.PI) / 10 : null;
        s.posture.push(now, (x0 + x1) / 2, (y0 + y1) / 2 * asp, bw, roll);
        const r = { x: x0 + 0.2 * bw, y: y0 + 0.08 * bh, w: 0.6 * bw, h: 0.6 * bh };
        s.roi = s.roi ? { x: s.roi.x + 0.2 * (r.x - s.roi.x), y: s.roi.y + 0.2 * (r.y - s.roi.y), w: s.roi.w + 0.2 * (r.w - s.roi.w), h: s.roi.h + 0.2 * (r.h - s.roi.h) } : r;
        if (s.op.onFrame) s.op.onFrame({ t: now, found: true, box: { x0, y0, x1, y1 }, blink, jaw: score(cats, 'jawOpen'), roi: s.roi, shapes, roll });
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
    const ex = s.expr.stats(now, s.op.window_s);
    const list = ready ? [obs('blink_rate', st.blink_rate, 'blinks/min'), obs('perclos', st.perclos, '%'), obs('long_eye_closures', st.long_closures, 'count'), obs('yawns', st.yawns, 'count')] : [];
    if (ready && st.mean_blink_ms != null && st.blink_rate >= 3) list.push(obs('blink_duration', st.mean_blink_ms, 'ms'));
    if (ready && ex.expressiveness != null) list.push(obs('facial_expressiveness', ex.expressiveness, 'of 100'));
    const po = s.posture.stats(now, s.op.window_s);
    if (ready && po.head_movement != null) list.push(obs('head_movement', po.head_movement, '% of face width/s'));
    if (ready && po.head_tilt != null) list.push(obs('head_tilt', po.head_tilt, 'deg'));
    if (ready && po.posture_shifts != null) list.push(obs('posture_shifts', po.posture_shifts, 'per min'));
    s.cb({ state: ready ? 'ok' : 'measuring', ...st, expressiveness: ex.expressiveness, posture: po, quality, roi: s.roi, observations: list });
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
