// Test the early-warning rules:  node tools/test_early_warning.mjs
import { earlyWarning } from '../src/engine/earlyWarning.js';
const base = { speech_rate: { mean: 4.6, sd: 0.23 }, pause_fraction: { mean: 0.35, sd: 0.04 }, f0_mean: { mean: 165, sd: 8 }, voice_harmonicity: { mean: 8.2, sd: 0.8 },
  blink_rate: { mean: 15, sd: 4 }, perclos: { mean: 4, sd: 1.5 }, heart_rate: { pre_mean: 72, pre_sd: 5 } };
const o = (signal, value, quality = 1, source = 'microphone') => ({ signal, value, quality, source });
const cases = [
  ['Rested', [o('speech_rate', 4.55), o('pause_fraction', 0.36), o('f0_mean', 166), o('blink_rate', 14, 1, 'camera_face'), o('perclos', 4.2, 1, 'camera_face')], 'green'],
  ['Slow speech only (z = -2.7)', [o('speech_rate', 3.97), o('pause_fraction', 0.34), o('f0_mean', 164)], 'green'],
  ['Slow speech + heavy eyelids', [o('speech_rate', 3.97), o('pause_fraction', 0.36), o('perclos', 13, 1, 'camera_face'), o('blink_rate', 12, 1, 'camera_face')], 'amber'],
  ['One strong change (pulse 95 vs 72 ± 5)', [o('heart_rate', 95, 0.9, 'camera_rppg'), o('speech_rate', 4.6), o('pause_fraction', 0.35)], 'amber'],
  ['Faster speech is not flagged', [o('speech_rate', 5.4), o('pause_fraction', 0.2), o('f0_mean', 168)], 'green'],
  ['Noisy room: low-quality signals are ignored', [o('speech_rate', 1.9, 0.17), o('pause_fraction', 0.6, 0.17), o('f0_mean', 140, 0.1)], 'silent'],
];
let fail = 0;
for (const [name, obs, expected] of cases) {
  const r = earlyWarning(obs, base);
  if (r.level !== expected) fail++;
  console.log(`${r.level === expected ? 'OK  ' : 'FAIL'} ${name}: ${r.level} (expected ${expected})\n     ${r.message}${r.suggestion ? '\n     ' + r.suggestion : ''}`);
}
console.log(fail ? `\n${fail} FAILURES` : '\nAll cases as expected');
process.exit(fail ? 1 : 0);
