// Test voice.js without a browser, with a SYNTHETIC signal of known values:
//   node tools/test_voice.mjs
// Signal: 150 ms "syllables" (vowel with 5 harmonics) every 200 ms -> 5 syllables/s of speech,
// pitch 110-130 Hz, a 0.6 s pause every 2 s of speech, background noise at -45 dB.
import { analyzeSamples } from '../src/sensors/voice.js';

const FS = 16000;
function synthetic({ syllablesPerSec = 5, f0 = 120, pause = 0.6, blocks = 8, syllablesPerBlock = 10, seed = 1, noiseDb = -45 }) {
  let r = seed; const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const out = []; const T = 1 / syllablesPerSec, L = 0.15;
  const noise = () => (rnd() - 0.5) * 2 * 10 ** (noiseDb / 20);
  for (let i = 0; i < Math.round(0.5 * FS); i++) out.push(noise());          // leading silence
  for (let b = 0; b < blocks; b++) {
    for (let k = 0; k < syllablesPerBlock; k++) {
      const f = f0 * (1 + (rnd() - 0.5) * 0.16);                              // ±8 % pitch
      for (let i = 0; i < Math.round(T * FS); i++) {
        const t = i / FS;
        const env = t < L ? Math.sin(Math.PI * t / L) ** 2 : 0;
        let v = 0; for (let h = 1; h <= 5; h++) v += Math.sin(2 * Math.PI * f * h * t) / h;
        out.push(0.3 * env * v + noise());
      }
    }
    if (b < blocks - 1) for (let i = 0; i < Math.round(pause * FS); i++) out.push(noise());
  }
  for (let i = 0; i < Math.round(0.5 * FS); i++) out.push(noise());
  return Float32Array.from(out);
}

const baseline = { speech_rate: { mean: 4.4, sd: 0.2 }, pause_fraction: { mean: 0.22, sd: 0.03 } };  // like CM-x in the synthetic data
const cases = [
  ['Normal: 5 syl/s, 120 Hz, 7 pauses of 0.6 s', {}],
  ['Slow: 3.5 syl/s, 200 Hz', { syllablesPerSec: 3.5, f0: 200 }],
  ['Noisy (like the venue): 5 syl/s, 120 Hz, noise at -20 dB', { noiseDb: -20 }],
];
for (const [name, p] of cases) {
  const t0 = performance.now();
  const { observations, summary } = analyzeSamples(synthetic(p), FS, baseline, { crew: 'CM-2', time: '2026-11-14T08:12:00Z' });
  console.log(`\n== ${name}  (${Math.round(performance.now() - t0)} ms)`);
  for (const o of observations) console.log(`  ${o.signal.padEnd(22)} ${String(o.value).padStart(7)} ${o.unit.padEnd(12)} quality ${o.quality}  z ${summary.z[o.signal] ?? '—'}`);
  console.log('  ' + summary.text);
}
