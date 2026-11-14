// Test the core of rppg.js with SYNTHETIC signals of known heart rate:  node tools/test_rppg.mjs
// Skin at level 120/255, 0.5 % pulse wave (typical), slow light drift, noise and irregular frame timing.
// Drafted with AI assistance (Claude, Anthropic). MIT licence.
import { estimatePulse, estimatePulseZones, createPulseGate } from '../src/sensors/rppg.js';
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());

function synthetic({ bpm, amp = 0.005, noise = 0.25, dur = 14, fps = 30, level = 120, light = 0, sway = 0, fSway = 0.6 }) {
  const t = [], r = [], g = [], b = []; let tt = 0;
  while (tt < dur * 1000) {
    const s = tt / 1000, f = bpm / 60;
    const pulse = bpm ? Math.sin(2 * Math.PI * f * s) + 0.3 * Math.sin(4 * Math.PI * f * s) : 0;
    const drift = 1 + 0.02 * Math.sin(2 * Math.PI * 0.08 * s) + light * 0.03 * Math.sin(2 * Math.PI * 0.45 * s + 1) + sway * Math.sin(2 * Math.PI * fSway * s + 2);
    t.push(tt);
    r.push(level * 1.25 * drift * (1 + 0.4 * amp * pulse) + noise * gauss());
    g.push(level * drift * (1 + amp * pulse) + noise * gauss());
    b.push(level * 0.85 * drift * (1 + 0.6 * amp * pulse) + noise * gauss());
    tt += 1000 / fps * (0.7 + 0.6 * rnd());            // irregular intervals, like a real webcam
  }
  return [t, r, g, b];
}

const cases = [
  ['72 bpm, good signal', { bpm: 72 }, 72],
  ['55 bpm', { bpm: 55 }, 55],
  ['110 bpm (after exercise)', { bpm: 110 }, 110],
  ['72 bpm, camera at 15 fps', { bpm: 72, fps: 15 }, 72],
  ['72 bpm, weak signal (0.2 %) and more noise', { bpm: 72, amp: 0.002, noise: 0.5 }, 72],
  ['72 bpm with a slow light change', { bpm: 72, light: 1 }, 72],
  ['No pulse (noise only): must not show a value', { bpm: 0 }, null],
  ['No pulse, slow sway at 0.6 Hz (3 %): must not show a value', { bpm: 0, sway: 0.03 }, null],
  ['No pulse, sway at 0.66 Hz (3 %): must not show a value', { bpm: 0, sway: 0.03, fSway: 0.66 }, null],
  ['72 bpm with slow sway at 0.6 Hz (1 %): 72 or nothing, never 42-46', { bpm: 72, sway: 0.01 }, 72],
  ['Low light (level 30): must not show a value', { bpm: 72, level: 30 }, null],
];
let falseValues = 0;
for (const [name, p, expected] of cases) {
  const lines = [];
  for (const method of ['pos', 'green']) {
    const e = estimatePulse(...synthetic(p), { method });
    const shown = e.bpm_raw != null && e.quality >= 0.5;
    const ok = expected == null ? !shown : (shown && Math.abs(e.bpm_raw - expected) <= 2);
    if (shown && !ok) falseValues++;        // hiding a real value is acceptable; showing a wrong one is not
    lines.push(`${method.padEnd(5)}: ${e.bpm_raw == null ? '—' : e.bpm_raw.toFixed(1)} bpm, quality ${e.quality.toFixed(2)}${e.reason ? ' (' + e.reason + ')' : ''} ${shown ? 'SHOWN' : 'hidden'} ${ok ? 'OK' : (shown ? 'WRONG' : 'hidden although correct')}`);
  }
  console.log(`${name}\n   ${lines.join('\n   ')}`);
}

// ---------------------------------------------------------------------------
// TRACKED MODE (two zones that follow the face + the gate that decides what is shown). 25 s at ~20 fps, one estimate per second.
console.log('\nTracked mode: face + forehead zones, POS overlap-add, motion check, gate that follows a track');
function stream({ bpm, amp = 0.005, noise = 0.25, dur = 25, fps = 20, sway = 0, fSway = 0.9, gapAt = null, bpmEnd = null, tint = 0 }) {
  const t = [], zones = [{ r: [], g: [], b: [] }, { r: [], g: [], b: [] }], motion = { cx: [], cy: [], bw: [], bh: [] }; let tt = 0, phase = 0, prev = 0;
  while (tt < dur * 1000) {
    const s = tt / 1000, rate = bpmEnd != null ? bpm + (bpmEnd - bpm) * s / dur : bpm;     // bpmEnd: the pulse falls or rises steadily
    phase += 2 * Math.PI * rate / 60 * (s - prev); prev = s;
    const pulse = rate ? Math.sin(phase) + 0.3 * Math.sin(2 * phase) : 0;
    const move = Math.sin(2 * Math.PI * fSway * s + 2);                                    // the head moving at fSway
    motion.cx.push(0.5 + (sway || tint ? 0.02 * move : 0) + 0.0005 * gauss()); motion.cy.push(0.5 + 0.0005 * gauss()); motion.bw.push(0.28 + 0.0005 * gauss()); motion.bh.push(0.43 + 0.0005 * gauss());
    const drift = 1 + 0.02 * Math.sin(2 * Math.PI * 0.08 * s) + sway * Math.sin(2 * Math.PI * fSway * s + 2);   // light and motion change all channels alike
    t.push(tt);
    zones.forEach((z, k) => { const lv = k ? 135 : 120, nz = k ? noise * 1.6 : noise;      // the forehead is smaller: more noise
      // tint: the movement also changes the COLOUR of the zone (hair or background entering it), which POS cannot cancel
      z.r.push(lv * 1.25 * drift * (1 + 0.4 * amp * pulse) + nz * gauss()); z.g.push(lv * drift * (1 + amp * pulse + tint * move) + nz * gauss()); z.b.push(lv * 0.85 * drift * (1 + 0.6 * amp * pulse) + nz * gauss()); });
    tt += 1000 / fps * (0.7 + 0.6 * rnd());
    if (gapAt != null && s < gapAt && tt / 1000 >= gapAt) tt += 1500;      // the face is lost for 1.5 s
  }
  return [t, zones, motion];
}
const tracked = [
  ['72 bpm', { bpm: 72 }, 72],
  ['55 bpm', { bpm: 55 }, 55],
  ['110 bpm (after exercise)', { bpm: 110 }, 110],
  ['72 bpm, weak signal (0.2 %) and more noise: 72 or nothing', { bpm: 72, amp: 0.002, noise: 0.4, mayHide: true }, 72],
  ['72 bpm with head motion at 54 /min (3 % brightness swing): 72 or nothing, never 54', { bpm: 72, sway: 0.03 }, 72],
  ['No pulse, noise only: must not show a value', { bpm: 0 }, null],
  ['No pulse, head motion at 54 /min: must not show a value', { bpm: 0, sway: 0.03 }, null],
  ['No pulse, head motion at 78 /min: must not show a value', { bpm: 0, sway: 0.03, fSway: 1.3 }, null],
  ['72 bpm, face lost for 1.5 s in the middle: nothing while the hole is in the window', { bpm: 72, gapAt: 14 }, 72],
  ['No pulse, head motion at 54 /min that also tints the zone (1 %): must not show a value', { bpm: 0, tint: 0.01, mayHide: true }, null],
  ['72 bpm with the same tinting motion at 54 /min: 72 or nothing, never 54', { bpm: 72, tint: 0.01, mayHide: true }, 72],
  ['Pulse falling from 135 to 105 bpm in 30 s (after exercise): must follow it', { bpm: 135, bpmEnd: 105, dur: 30, falling: true }, 'falling'],
];
for (const [name, p, expected] of tracked) {
  const [t, zones, motion] = stream(p), gate = createPulseGate(), shown = [];
  let next = 1000, seconds = 0, wrongFalling = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] < next) continue; next = t[i] + 1000; seconds++;
    const lo = Math.max(0, i - 400), sl = (v) => v.slice(lo, i + 1);
    const g = gate.update(t[i] / 1000, estimatePulseZones(sl(t), zones.map(z => ({ r: sl(z.r), g: sl(z.g), b: sl(z.b) })),
      { motion: { cx: sl(motion.cx), cy: sl(motion.cy), bw: sl(motion.bw), bh: sl(motion.bh) } }));
    if (g.bpm != null) { shown.push(g.bpm);
      if (p.falling) { const mid = p.bpm + (p.bpmEnd - p.bpm) * (t[i] / 1000 - 5) / p.dur; if (Math.abs(g.bpm - mid) > 5) wrongFalling++; } }   // true rate at the middle of the 10 s window
  }
  const wrong = p.falling ? wrongFalling : shown.filter(v => expected == null || Math.abs(v - expected) > 3).length;
  if (wrong) falseValues++;
  const need = expected != null && !p.gapAt && !p.sway && !p.mayHide;          // these cases must show values
  const ok = !wrong && (!need || shown.length >= 8);
  if (!ok && !wrong) falseValues++;
  console.log(`${name}\n   shown in ${shown.length} of ${seconds} s${shown.length ? `, ${Math.min(...shown)}-${Math.max(...shown)} bpm` : ''} ${ok ? 'OK' : 'WRONG'}`);
}
console.log(falseValues ? `\n${falseValues} cases fail` : '\nNo case shows a wrong value');
process.exit(falseValues ? 1 : 0);
