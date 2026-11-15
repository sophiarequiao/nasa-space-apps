// Checks the posture numbers of face.js on a REAL recording made with tools/demo_rppg.html ("still", "talk", "move"):
//   node tools/eval_posture.mjs path/to/rppg_raw_xxxxxx.csv [frame height / frame width, default 0.75]
// The recording holds the face box of every video frame (no image). Recordings stay OUT of the repository.
// Expected: head movement grows from still to talking to moving. Posture shifts are printed for information: the
// recording cannot tell whether the person really settled in a new place.
// The recording has no eye corners, so head_tilt cannot be checked here. Drafted with AI assistance (Claude, Anthropic). MIT licence.
import fs from 'node:fs';
import { createPostureTracker } from '../src/sensors/face.js';

const file = process.argv[2], asp = Number(process.argv[3] || 0.75);
if (!file) { console.error('Usage: node tools/eval_posture.mjs recording.csv [aspect]'); process.exit(2); }
const rows = fs.readFileSync(file, 'utf8').split(/\r?\n/).map(l => l.split(','))
  .filter(c => ['still', 'talk', 'move'].includes(c[1]) && c[2] === '1').map(c => ({ t: +c[0], seg: c[1], cx: +c[3], cy: +c[4], bw: +c[5] }));
const out = {};
for (const seg of ['still', 'talk', 'move']) {
  const r = rows.filter(x => x.seg === seg); if (r.length < 100) continue;
  const tr = createPostureTracker(), t0 = r[0].t, t1 = r[r.length - 1].t, windows = [];
  // the same 60 s window the app uses, moved in steps of 10 s; shorter segments use what there is
  for (const x of r) tr.push(x.t, x.cx, x.cy * asp, x.bw);
  const span = Math.min(60, (t1 - t0) / 1000);
  for (let end = t0 + span * 1000; end <= t1 + 1; end += 10000) windows.push(tr.stats(end, span));
  const whole = tr.stats(t1, (t1 - t0) / 1000 + 1);
  out[seg] = whole;
  console.log(`${seg.padEnd(5)} ${((t1 - t0) / 1000).toFixed(0).padStart(3)} s, ${(r.length / ((t1 - t0) / 1000)).toFixed(0)} frames/s · head movement ${String(whole.head_movement).padStart(5)} % of face width per second` +
    ` · posture shifts ${whole.posture_shifts} per min` + (windows.length > 1 ? ` · movement in 60 s windows: ${windows.map(w => w.head_movement).join(', ')}` : ''));
}
const ok = out.still && out.talk && out.move && out.still.head_movement < out.talk.head_movement && out.talk.head_movement < out.move.head_movement;
console.log(ok ? '\nAs expected: head movement still < talking < moving.' : '\nNOT as expected: look at the numbers above.');
process.exit(ok ? 0 : 1);
