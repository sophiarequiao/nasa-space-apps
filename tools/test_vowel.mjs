// Test the sustained-vowel analysis with SYNTHETIC vowels of known jitter, shimmer and noise:  node tools/test_vowel.mjs
// The vowel is built cycle by cycle: each cycle gets its own period (jitter) and amplitude (shimmer).
// For independent random perturbations of relative size σ, the expected "local" jitter/shimmer is 1.13·σ.
import { analyzeVowelSamples } from '../src/sensors/voice.js';
const FS = 48000;
let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());

function vowel({ f0 = 120, seconds = 6, jitter = 0.005, shimmer = 0.03, noiseDb = -40, breaks = 0 }) {
  const out = []; const pad = Math.round(0.4 * FS);
  for (let i = 0; i < pad; i++) out.push(1e-4 * gauss());
  let phase = 0, T = 1 / f0, A = 1, n = Math.round(seconds * FS), nextBreak = breaks ? Math.round(n / (breaks + 1)) : -1, mute = 0;
  for (let i = 0; i < n; i++) {
    if (i === nextBreak) { mute = Math.round(0.18 * FS); nextBreak += Math.round(n / (breaks + 1)); }
    phase += 2 * Math.PI / (T * FS);
    if (phase >= 2 * Math.PI) { phase -= 2 * Math.PI; T = (1 / f0) * (1 + jitter * gauss()); A = 1 + shimmer * gauss(); }   // new cycle
    let v = 0; for (let h = 1; h <= 8; h++) v += Math.sin(h * phase) / h;
    const env = Math.min(1, i / (0.05 * FS), (n - i) / (0.05 * FS));
    out.push((mute-- > 0 ? 0 : 0.25 * A * env * v) + 10 ** (noiseDb / 20) * gauss());
  }
  for (let i = 0; i < pad; i++) out.push(1e-4 * gauss());
  return Float32Array.from(out);
}

const cases = [
  ['Healthy-like: jitter σ 0.5 %, shimmer σ 3 %, low noise', {}, { jitter: 0.56, shimmer: 3.4 }],
  ['Rough: jitter σ 2 %', { jitter: 0.02 }, { jitter: 2.26, shimmer: 3.4 }],
  ['Unsteady loudness: shimmer σ 10 %', { shimmer: 0.10 }, { jitter: 0.56, shimmer: 11.3 }],
  ['Breathy: noise 25 dB higher', { noiseDb: -15 }, null],
  ['Short of breath: 2.5 s vowel', { seconds: 2.5 }, null],
  ['Voice breaks: 2 interruptions', { breaks: 2 }, null],
  ['Higher voice: 220 Hz', { f0: 220 }, { jitter: 0.56, shimmer: 3.4 }],
];
for (const [name, p, expected] of cases) {
  const t0 = performance.now();
  const r = analyzeVowelSamples(vowel(p), FS, {}, { crew: 'CM-2' });
  const o = Object.fromEntries(r.observations.map(o => [o.signal, o.value]));
  console.log(`${name}  (${Math.round(performance.now() - t0)} ms)`);
  console.log(r.observations.length
    ? `   held ${o.max_phonation_time} s · jitter ${o.jitter} %${expected ? ' (expected ~' + expected.jitter + ')' : ''} · shimmer ${o.shimmer} %${expected ? ' (expected ~' + expected.shimmer + ')' : ''} · HNR ${o.vowel_harmonicity} dB · f0 ${o.vowel_f0} Hz · breaks ${o.voice_breaks} · quality ${r.observations[0].quality}`
    : '   ' + r.summary.text);
}
