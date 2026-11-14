// Test the core of rppg.js with SYNTHETIC signals of known heart rate:  node tools/test_rppg.mjs
// Skin at level 120/255, 0.5 % pulse wave (typical), slow light drift, noise and irregular frame timing.
import { estimatePulse } from '../src/sensors/rppg.js';
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
console.log(falseValues ? `\n${falseValues} cases show a wrong value` : '\nNo case shows a wrong value');
process.exit(falseValues ? 1 : 0);
