// Test the shoulders-and-trunk logic of body.js with SYNTHETIC poses:  node tools/test_body.mjs
// A person 0.30 of the frame wide at the shoulders, looked at 7 times a second for 30 s; landmark noise 0.5 % of that width.
// Drafted with AI assistance (Claude, Anthropic). MIT licence.
import { createBodyTracker } from '../src/sensors/body.js';

let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647), n = () => 0.005 * 0.30 * (rnd() - 0.5) * 2;
function run(pose, seconds = 30, fps = 7) {
  const tr = createBodyTracker(), W = 0.30;
  for (let i = 0; i <= seconds * fps; i++) {
    const t = i * 1000 / fps, p = pose(t / 1000), a = (p.tilt || 0) * Math.PI / 180, cx = 0.5 + (p.x || 0) * W, cy = 0.55 + (p.y || 0) * W, hh = (p.height ?? 0.62) * W;
    const ls = { x: cx + W / 2 * Math.cos(a) + n(), y: cy + W / 2 * Math.sin(a) + n(), v: p.hidden ? 0.2 : 0.99 }, rs = { x: cx - W / 2 * Math.cos(a) + n(), y: cy - W / 2 * Math.sin(a) + n(), v: 0.99 };
    const ex = cx + hh * Math.sin(a), ey = cy - hh * Math.cos(a);     // the ears sit above the middle of the shoulder line
    tr.push(t, { ls, rs, le: { x: ex + 0.06 + n(), y: ey + n(), v: 0.99 }, re: { x: ex - 0.06 + n(), y: ey + n(), v: 0.99 } });
  }
  return tr.stats(seconds * 1000, seconds);
}
const cases = [
  ['Sitting still, shoulders level', () => ({}), (r) => Math.abs(r.shoulder_tilt) < 0.5 && r.trunk_movement < 1.5 && Math.abs(r.head_height - 62) < 1.5 && r.trunk_shifts === 0],
  ['Left shoulder 6 degrees lower', () => ({ tilt: 6 }), (r) => Math.abs(r.shoulder_tilt - 6) < 0.5 && Math.abs(r.head_height - 62) < 1.5],
  ['Slumped: the ears sit lower over the shoulders (50 % instead of 62 %)', () => ({ height: 0.50 }), (r) => Math.abs(r.head_height - 50) < 1.5 && Math.abs(r.shoulder_tilt) < 0.5],
  ['Slow rocking of 6 % of the shoulder width every 4 s (path of a sine: 6 % per second)', (s) => ({ x: 0.06 * Math.sin(2 * Math.PI * s / 4) }), (r) => r.trunk_movement > 4.5 && r.trunk_movement < 7.5],
  ['Leans to a new place at 15 s and stays', (s) => ({ x: s > 15 ? 0.4 : 0 }), (r) => r.trunk_shifts > 0],
  ['One shoulder out of view half of the time: counted as not visible', (s) => ({ hidden: s % 2 < 1 }), (r) => r.visible > 0.4 && r.visible < 0.6],
  ['Only 6 s in view: not enough to answer', () => ({}), (r) => r.trunk_movement == null && r.shoulder_tilt == null, 6],
];
let fail = 0;
for (const [name, pose, check, seconds] of cases) {
  const r = run(pose, seconds), ok = check(r); if (!ok) fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}\n     shoulder tilt ${r.shoulder_tilt} deg · trunk movement ${r.trunk_movement} % of shoulder width per second · head height ${r.head_height} % · shifts ${r.trunk_shifts} per min · shoulders in view ${Math.round(r.visible * 100)} %`);
}
console.log(fail ? `\n${fail} FAILURES` : '\nAll cases as expected');
process.exit(fail ? 1 : 0);
