// Test the early-warning rules:  node tools/test_early_warning.mjs
// Drafted with AI assistance (Claude, Anthropic). MIT licence.
import { earlyWarning } from '../src/engine/earlyWarning.js';
const base = { speech_rate: { mean: 4.6, sd: 0.23 }, pause_fraction: { mean: 0.35, sd: 0.04 }, f0_mean: { mean: 165, sd: 8 }, voice_harmonicity: { mean: 8.2, sd: 0.8 },
  blink_rate: { mean: 15, sd: 4 }, perclos: { mean: 4, sd: 1.5 }, heart_rate: { pre_mean: 72, pre_sd: 5 }, head_tilt: { mean: 1, sd: 4 }, head_movement: { mean: 6, sd: 1.5 } };
const o = (signal, value, quality = 1, source = 'microphone') => ({ signal, value, quality, source });
const cases = [
  ['Rested', [o('speech_rate', 4.55), o('pause_fraction', 0.36), o('f0_mean', 166), o('blink_rate', 14, 1, 'camera_face'), o('perclos', 4.2, 1, 'camera_face')], 'green'],
  ['Slow speech only (z = -2.7)', [o('speech_rate', 3.97), o('pause_fraction', 0.34), o('f0_mean', 164)], 'green'],
  ['Slow speech + heavy eyelids', [o('speech_rate', 3.97), o('pause_fraction', 0.36), o('perclos', 13, 1, 'camera_face'), o('blink_rate', 12, 1, 'camera_face')], 'amber'],
  ['One strong change (pulse 95 vs 72 ± 5)', [o('heart_rate', 95, 0.9, 'camera_rppg'), o('speech_rate', 4.6), o('pause_fraction', 0.35)], 'amber'],
  ['Faster speech is not flagged', [o('speech_rate', 5.4), o('pause_fraction', 0.2), o('f0_mean', 168)], 'green'],
  ['Noisy room: low-quality signals are ignored', [o('speech_rate', 1.9, 0.17), o('pause_fraction', 0.6, 0.17), o('f0_mean', 140, 0.1)], 'silent'],
  // The pattern rule: several small changes together (each between 1.5 and 2 sd)
  ['Four small changes, voice and eyelids together (none reaches 2 sd)', [o('speech_rate', 4.21), o('pause_fraction', 0.414), o('voice_harmonicity', 6.84), o('perclos', 6.7, 1, 'camera_face'), o('blink_rate', 15, 1, 'camera_face')], 'amber', 'pattern'],
  ['Four small changes, all from the microphone: one sensor is not enough', [o('speech_rate', 4.21), o('pause_fraction', 0.414), o('voice_harmonicity', 6.84), o('f0_mean', 178.6), o('blink_rate', 15, 1, 'camera_face')], 'green', null],
  ['Three small changes from two sensors: not enough', [o('speech_rate', 4.21), o('pause_fraction', 0.414), o('perclos', 6.7, 1, 'camera_face'), o('blink_rate', 15, 1, 'camera_face')], 'green', null],
  // Head posture counts like any other signal
  ['Head tilted more than usual (z = +2.5) and slower speech (z = -2.2)', [o('head_tilt', 11, 1, 'camera_face'), o('speech_rate', 4.09), o('pause_fraction', 0.35)], 'amber', 'several'],
  ['Head tilted more than usual, nothing else', [o('head_tilt', 11, 1, 'camera_face'), o('head_movement', 6.2, 1, 'camera_face'), o('speech_rate', 4.6)], 'green', null],
  ['Much stiller than usual (z = -3.3): posture counts in both directions', [o('head_movement', 1, 1, 'camera_face'), o('speech_rate', 4.6), o('pause_fraction', 0.35)], 'amber', 'strong'],
];
let fail = 0;
for (const [name, obs, expected, rule] of cases) {
  const r = earlyWarning(obs, base), ok = r.level === expected && (rule === undefined || r.rule === rule);
  if (!ok) fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: ${r.level}${r.rule ? ` by rule "${r.rule}"` : ''} (expected ${expected}${rule ? `, "${rule}"` : ''}) · joint distance ${r.pattern.distance} sd\n     ${r.message}${r.suggestion ? '\n     ' + r.suggestion : ''}`);
}
console.log(fail ? `\n${fail} FAILURES` : '\nAll cases as expected');
process.exit(fail ? 1 : 0);
