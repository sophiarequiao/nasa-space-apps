// Test the eyelid, expression and posture logic of face.js with SYNTHETIC values:  node tools/test_face.mjs
// Drafted with AI assistance (Claude, Anthropic). MIT licence.
import { createEyeTracker, createExpressionTracker, createPostureTracker, symmetryIndex } from '../src/sensors/face.js';

// Builds 60 s at 30 fps: eyes open (score 0.05) with the given events {at (s), ms, kind}
function run(events, fps = 30, seconds = 60) {
  const tr = createEyeTracker();
  for (let i = 0; i <= seconds * fps; i++) {
    const t = i * 1000 / fps; let blink = 0.05, jaw = 0.05;
    for (const e of events) if (t >= e.at * 1000 && t < e.at * 1000 + e.ms) { if (e.kind === 'yawn') jaw = 0.8; else blink = 0.9; }
    if (events.some(e => e.lost && t > e.at * 1000 + 100 && t < e.at * 1000 + e.lost)) continue;   // no samples while the face is lost
    tr.push(t, blink, jaw);
  }
  return tr.stats(seconds * 1000, seconds);
}
const every = (n, ms, kind = 'blink') => Array.from({ length: n }, (_, k) => ({ at: 2 + k * (56 / n), ms, kind }));
const cases = [
  ['Rested: 15 blinks of 200 ms', every(15, 200), { blink_rate: 15, long_closures: 0, yawns: 0 }],
  ['Staring at a screen: 6 blinks', every(6, 200), { blink_rate: 6, long_closures: 0, yawns: 0 }],
  ['Drowsy: 12 blinks + 4 slow closures of 1.2 s + 2 yawns', [...every(12, 250), ...every(4, 1200).map(e => ({ ...e, at: e.at + 1 })), { at: 20.5, ms: 3000, kind: 'yawn' }, { at: 45.5, ms: 2500, kind: 'yawn' }], { blink_rate: 12, long_closures: 4, yawns: 2 }],
  ['Low frame rate (12 fps): 15 blinks of 200 ms', every(15, 200), { blink_rate: 15, long_closures: 0, yawns: 0 }, 12],
  ['Face lost for 3 s while the eyes read as closed: not a slow closure', [...every(10, 200), { at: 30.3, ms: 400, kind: 'blink', lost: 3000 }], { blink_rate: 10, long_closures: 0, yawns: 0 }],
];
let fail = 0;
for (const [name, ev, exp, fps] of cases) {
  const s = run(ev, fps || 30);
  const ok = Math.abs(s.blink_rate - exp.blink_rate) <= 1 && s.long_closures === exp.long_closures && s.yawns === exp.yawns;
  if (!ok) fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}\n     blink rate ${s.blink_rate}/min (expected ${exp.blink_rate}) · PERCLOS ${s.perclos} % · mean blink ${s.mean_blink_ms} ms · long closures ${s.long_closures} (expected ${exp.long_closures}) · yawns ${s.yawns} (expected ${exp.yawns}) · ${s.fps} fps`);
}

// Facial movement: an animated face (brows and smile come and go) must read clearly higher than a flat one
let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function expr(animated) {
  const tr = createExpressionTracker();
  for (let i = 0; i <= 30 * 30; i++) { const t = i * 1000 / 30, s = t / 1000;
    const brow = animated ? 0.25 + 0.25 * Math.sin(2 * Math.PI * 0.4 * s) : 0.05, smile = animated && s % 8 < 2.5 ? 0.6 : 0.05;
    tr.push(t, { browInnerUp: brow + 0.02 * rnd(), browOuterUpLeft: brow, browOuterUpRight: brow, mouthSmileLeft: smile, mouthSmileRight: smile, cheekSquintLeft: smile / 2, cheekSquintRight: smile / 2, jawOpen: 0.3 * rnd() });
  }
  return tr.stats(30000, 30).expressiveness;
}
const flat = expr(false), lively = expr(true);
const okE = lively > 3 * flat + 1; if (!okE) fail++;
console.log(`${okE ? 'OK  ' : 'FAIL'} Facial movement: flat face ${flat}, animated face ${lively} (0-100 scale)`);

// Symmetry of a held smile: even smile, one-sided smile, no smile at all
const hold = (L, R, n = 90) => Array.from({ length: n }, (_, i) => { const k = Math.min(1, i / 20); return { mouthSmileLeft: L * k + 0.02 * rnd(), mouthSmileRight: R * k + 0.02 * rnd() }; });
const sym = [['Even smile', hold(0.8, 0.76), (r) => r && r.asymmetry <= 10], ['One-sided smile (right side weaker)', hold(0.8, 0.35), (r) => r && r.asymmetry >= 45 && r.weaker === 'right'], ['No smile: nothing to compare', hold(0.05, 0.05), (r) => r === null]];
for (const [name, frames, check] of sym) {
  const r = symmetryIndex(frames, 'mouthSmileLeft', 'mouthSmileRight'), ok = check(r); if (!ok) fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: ${r ? `left ${r.left}, right ${r.right}, difference ${r.asymmetry} %` : 'movement not seen'}`);
}
// Posture and movement of the head (createPostureTracker): SYNTHETIC head positions, 60 s at 30 fps.
// The head is 0.25 of the frame wide; jitter of the landmarks: 0.3 % of the face width per frame.
function posture(pos, fps = 30, seconds = 60, lost = null) {
  const tr = createPostureTracker(), W = 0.25;
  for (let i = 0; i <= seconds * fps; i++) {
    const t = i * 1000 / fps, s = t / 1000; if (lost && s > lost[0] && s < lost[1]) continue;
    const p = pos(s); tr.push(t, 0.5 + (p.x || 0) * W + 0.003 * W * (rnd() - 0.5) * 2, 0.4 + (p.y || 0) * W + 0.003 * W * (rnd() - 0.5) * 2, W, (p.roll || 0) + 0.4 * (rnd() - 0.5));
  }
  return tr.stats(seconds * 1000, seconds);
}
const pCases = [
  ['Still head', () => ({}), (r) => r.head_movement < 1.5 && r.posture_shifts === 0 && Math.abs(r.head_tilt) < 0.5],
  ['Slow sway of 5 % of the face width, every 4 s (path of a sine: 5 % per second)', (s) => ({ x: 0.05 * Math.sin(2 * Math.PI * s / 4) }), (r) => r.head_movement > 4 && r.head_movement < 6 && r.posture_shifts === 0],
  ['Head held 10 degrees to one side', () => ({ roll: 10 }), (r) => Math.abs(r.head_tilt - 10) < 0.5 && r.posture_shifts === 0],
  ['Two posture shifts: moves 0.4 face widths at 20 s, tilts 12 degrees at 40 s, and stays', (s) => ({ x: s > 20 ? 0.4 : 0, roll: s > 40 ? 12 : 0 }), (r) => r.posture_shifts === 2],
  ['Nodding hard for 5 s and back to the same place: no posture shift (fast nods are mostly averaged out: this measures slow movement)', (s) => ({ y: s > 30 && s < 35 ? 0.3 * Math.sin(2 * Math.PI * 1.5 * (s - 30)) : 0 }), (r) => r.posture_shifts === 0 && r.head_movement > 0.5],
  ['Face lost for 5 s and back in the same place: the hole is not movement', () => ({}), (r) => r.head_movement < 1.5 && r.posture_shifts === 0, 30, 60, [25, 30]],
  ['Low frame rate (12 fps), still head', () => ({}), (r) => r.head_movement < 2 && r.posture_shifts === 0, 12],
  ['Only 8 s in view: not enough to answer', () => ({}), (r) => r.head_movement == null, 30, 8],
];
for (const [name, pos, check, fps, seconds, lost] of pCases) {
  const r = posture(pos, fps, seconds, lost), ok = check(r); if (!ok) fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} Posture · ${name}\n     head movement ${r.head_movement} % of face width per second · tilt ${r.head_tilt} deg · posture shifts ${r.posture_shifts} per min`);
}
console.log(fail ? `\n${fail} FAILURES` : '\nAll cases as expected');
process.exit(fail ? 1 : 0);
