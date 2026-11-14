// Test the eyelid logic of face.js with SYNTHETIC blink scores:  node tools/test_face.mjs
import { createEyeTracker } from '../src/sensors/face.js';

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
console.log(fail ? `\n${fail} FAILURES` : '\nAll cases as expected');
process.exit(fail ? 1 : 0);
