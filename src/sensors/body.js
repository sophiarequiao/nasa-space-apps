// src/sensors/body.js — OPTIONAL: shoulders and trunk from the camera (MediaPipe Pose Landmarker, Apache-2.0).
// The second step of "body language". face.js says how the head moves; this adds the body under it.
// API: startBody(videoEl, onResult, options?) / stopBody()
//   onResult({ state, shoulder_tilt, trunk_movement, trunk_shifts, head_height, visible, quality, observations, window_s })
//     state: 'loading' | 'no_body' (shoulders not in view) | 'measuring' (less than 12 s of data) | 'ok'
//     shoulder_tilt (degrees)        median slope of the line between the two shoulders; positive: the person's left
//                                    shoulder is lower
//     trunk_movement (% of the shoulder width per second)   how far the trunk travels: slow movement, 0.5 s averages
//     head_height (% of the shoulder width)   how high the ears sit above the shoulder line. It drops when the person
//                                    slumps forward or raises the shoulders
//     observations: app-format objects for shoulder_tilt, trunk_movement and head_height once there is enough data
//   options: { crew, window_s (default 60), every_ms (default 150), modelUrl, wasmUrl }
// It does not open the camera: give it a <video> that is already playing (the one face.js uses). It looks about 7 times
// a second, to leave the processor to the face and the pulse.
// The model (5.8 MB) is read from vendor/mediapipe/pose_landmarker_lite.task if you put it there, otherwise from
// Google's public address. Either way the video stays in the browser.
// What it is: behaviour compared with the person's own usual. It cannot tell pain, mood or illness from a posture.
// In microgravity there is no single correct posture (NASA neutral body posture; the STS-57 study found it differs
// between people), so only the personal baseline makes sense. EXPERIMENTAL: checked with a still reference picture that
// is moved and turned by known amounts (tools/test_camera_models.html), never yet against a person's real change.
// All thresholds are ASSUMPTIONS. Drafted with AI assistance (Claude, Anthropic). MIT licence.
import { createPostureTracker } from './face.js';

const VISIBLE = 0.5;                   // MediaPipe visibility score below which a shoulder or an ear is not trusted (ASSUMPTION)
const MIN_WINDOW_S = 12, WINDOW_S = 60, MIN_HEIGHTS = 20;

// ---------------------------------------------------------------------------
// Pure core (no browser APIs): feed it one pose per look, ask for the statistics. Testable in Node.
export function createBodyTracker() {
  const trunk = createPostureTracker({ minFrames: 2 }), heights = [];   // heights: { t, h }
  let seen = 0, good = 0;
  return {
    /** One pose. ls, rs: left and right shoulder · le, re: left and right ear, each { x, y, v } with x and y in the
     *  same unit (fractions of the frame width) and v the visibility score (0..1, optional). */
    push(t, { ls, rs, le, re }) {
      seen++;
      if (!ls || !rs || (ls.v ?? 1) < VISIBLE || (rs.v ?? 1) < VISIBLE) return;
      const w = Math.hypot(ls.x - rs.x, ls.y - rs.y); if (!(w > 0)) return;
      good++;
      const mx = (ls.x + rs.x) / 2, my = (ls.y + rs.y) / 2;
      trunk.push(t, mx, my, w, Math.atan2(ls.y - rs.y, ls.x - rs.x) * 180 / Math.PI);
      if (le && re && (le.v ?? 1) >= VISIBLE && (re.v ?? 1) >= VISIBLE) {
        const ex = (le.x + re.x) / 2 - mx, ey = (le.y + re.y) / 2 - my, ux = (ls.x - rs.x) / w, uy = (ls.y - rs.y) / w;
        heights.push({ t, h: Math.abs(ex * uy - ey * ux) / w });   // distance from the ears to the shoulder line, in shoulder widths
        while (heights.length && t - heights[0].t > 120000) heights.shift();
      }
    },
    stats(now, window_s = WINDOW_S) {
      const p = trunk.stats(now, window_s), from = now - window_s * 1000;
      const h = heights.filter(x => x.t >= from && x.t <= now).map(x => x.h).sort((a, b) => a - b);
      return {
        window_s: p.window_s, shoulder_tilt: p.head_tilt, trunk_movement: p.head_movement, trunk_shifts: p.posture_shifts,
        head_height: h.length >= MIN_HEIGHTS ? Math.round(1000 * (h[(h.length - 1) >> 1] + h[h.length >> 1]) / 2) / 10 : null,
        visible: seen ? Math.round(100 * good / seen) / 100 : 0,     // share of the looks with both shoulders in view
      };
    },
  };
}

// ---------------------------------------------------------------------------
let B = null;

export async function startBody(videoEl, onResult, options = {}) {
  stopBody();
  const s = B = { video: videoEl, cb: onResult, op: { crew: 'CM-1', window_s: WINDOW_S, every_ms: 150, ...options }, active: true,
    tracker: createBodyTracker(), lastSeen: 0, lastVideoTime: -1, loop: null, timer: null, pl: null };
  s.cb({ state: 'loading' });

  const base = new URL('../../vendor/mediapipe/', import.meta.url);
  const { PoseLandmarker, FilesetResolver } = await import(new URL('vision_bundle.mjs', base).href);
  const fileset = await FilesetResolver.forVisionTasks(s.op.wasmUrl || new URL('wasm', base).href);
  // Model: local copy first (offline), otherwise Google's public URL
  let modelUrl = s.op.modelUrl;
  if (!modelUrl) {
    const local = new URL('pose_landmarker_lite.task', base).href;
    const ok = await fetch(local, { method: 'HEAD' }).then(r => r.ok).catch(() => false);
    modelUrl = ok ? local : 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
  }
  const make = (delegate) => PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: modelUrl, delegate }, runningMode: 'VIDEO', numPoses: 1 });
  try { s.pl = await make('GPU'); } catch { s.pl = await make('CPU'); }
  if (B !== s) { s.pl.close(); return; }

  s.loop = setInterval(() => {
    const v = s.video;
    if (!s.active || !v.videoWidth || v.currentTime === s.lastVideoTime) return;
    s.lastVideoTime = v.currentTime;
    const now = performance.now();
    let res = null; try { res = s.pl.detectForVideo(v, now); } catch { return; }
    const p = res && res.landmarks && res.landmarks[0];
    const asp = v.videoHeight / v.videoWidth, pt = (q) => q ? { x: q.x, y: q.y * asp, v: q.visibility ?? 1 } : null;
    // Landmarks of the pose model: 11 and 12 are the left and right shoulder, 7 and 8 the left and right ear
    s.tracker.push(now, p ? { ls: pt(p[11]), rs: pt(p[12]), le: pt(p[7]), re: pt(p[8]) } : {});
    if (p && (p[11].visibility ?? 1) >= VISIBLE && (p[12].visibility ?? 1) >= VISIBLE) s.lastSeen = now;
  }, s.op.every_ms);

  s.timer = setInterval(() => {
    if (!s.active) return;
    const now = performance.now();
    if (now - s.lastSeen > 2000) { s.cb({ state: 'no_body', observations: [] }); return; }
    const st = s.tracker.stats(now, s.op.window_s), ready = st.window_s >= MIN_WINDOW_S;
    const quality = Math.round(Math.min(1, st.visible) * Math.min(1, st.window_s / 20) * 100) / 100;   // shoulders in view, and 20 s of data
    const time = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const obs = (signal, value, unit) => ({ crew: s.op.crew, signal, value, unit, time, source: 'camera_body', method: 'estimated', quality, region: 'brain' });
    const list = [];
    if (ready && st.shoulder_tilt != null) list.push(obs('shoulder_tilt', st.shoulder_tilt, 'deg'));
    if (ready && st.trunk_movement != null) list.push(obs('trunk_movement', st.trunk_movement, '% of shoulder width/s'));
    if (ready && st.head_height != null) list.push(obs('head_height', st.head_height, '% of shoulder width'));
    s.cb({ state: ready ? 'ok' : 'measuring', ...st, quality, observations: list });
  }, 1000);
}

export function stopBody() {
  const s = B; if (!s) return;
  s.active = false; clearInterval(s.loop); clearInterval(s.timer);
  if (s.pl) { try { s.pl.close(); } catch {} }
  B = null;
}
