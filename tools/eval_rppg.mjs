// Replays a recording made with tools/record_rppg.html through the tracked pulse estimator:  node tools/eval_rppg.mjs file.csv
// Prints, for each part of the recording, how many seconds showed a pulse and which values. If the file carries a
// reference pulse (typed in the recorder), it is printed next to them. The recordings stay outside the repository.
import fs from 'fs';
import { estimatePulseZones, createPulseGate } from '../src/sensors/rppg.js';
const file = process.argv[2]; if (!file) { console.log('usage: node tools/eval_rppg.mjs recording.csv'); process.exit(1); }
const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
const meta = lines.find(l => l.startsWith('# ref_before')) || '';
const rows = lines.filter(l => !l.startsWith('#')).slice(1).map(l => l.split(',')).filter(r => r[2] === '1');
const t = rows.map(r => +r[0]), seg = rows.map(r => r[1]), col = (i) => rows.map(r => +r[i]);
const zones = [{ r: col(18), g: col(19), b: col(20) }, { r: col(9), g: col(10), b: col(11) }];   // face zone, forehead
const gate = createPulseGate(), stats = {}; let next = t[0] + 1000, trace = '';
for (let i = 0; i < t.length; i++) {
  if (t[i] < next) continue; next = t[i] + 1000;
  const lo = Math.max(0, i - 400), sl = (v) => v.slice(lo, i + 1);
  const e = estimatePulseZones(sl(t), zones.map(z => ({ r: sl(z.r), g: sl(z.g), b: sl(z.b) }))), g = gate.update(t[i] / 1000, e);
  const s = stats[seg[i]] ||= { seconds: 0, windows: 0, shown: [] }; s.seconds++; if (e.bpm_raw != null) s.windows++; if (g.bpm != null) s.shown.push(g.bpm);
  trace += g.bpm != null ? `${g.bpm} ` : (e.bpm_raw != null ? '· ' : '_ ');
}
console.log(meta || '(no reference pulse in the file)');
for (const [k, s] of Object.entries(stats)) {
  const o = s.shown.slice().sort((a, b) => a - b);
  console.log(`${k.padEnd(6)} ${String(s.seconds).padStart(3)} s, full windows ${String(s.windows).padStart(3)}, pulse shown in ${String(o.length).padStart(3)} s` + (o.length ? `: median ${o[o.length >> 1]} bpm, range ${o[0]}-${o[o.length - 1]}` : ''));
}
console.log('\nSecond by second (number = shown, · = estimate not trusted, _ = no estimate):\n' + trace);
