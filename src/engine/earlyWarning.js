// src/engine/earlyWarning.js — "Heads-up, something changed": combines the passive signals from the microphone and the
// camera (voice message, sustained vowel, eyelids, camera pulse) into one early flag, BEFORE anyone measures vital signs.
// API: earlyWarning(observations, baseline, options?) -> { level, flagged, usable, message, suggestion }
//   observations: app-format objects ({ signal, value, quality, source, ... }) from voice.js, face.js and rppg.js
//   baseline:     per signal, the person's own { mean, sd } (also { pre_mean, pre_sd }, { media, desv }, { pre_media, pre_dt })
//   level: 'silent' (not enough usable signals) | 'green' (within the personal baseline) | 'amber' (heads-up)
// Rules (team ASSUMPTIONS, deliberately simple and readable):
//   - a signal counts only if its quality is >= 0.4 and the person has a baseline for it;
//   - it is flagged when it is 2 sd or more from the baseline in the direction that matters (e.g. slower speech, more
//     eyelid closure; pulse and pitch count in both directions);
//   - amber when 2 or more signals are flagged, or one is 3 sd or more away;
//   - the guided face-symmetry check (smile, eyebrows) counts like any other signal but changes the suggestion;
//   - never red: these are estimated signals. Amber means "run the standard check", not "something is wrong".
// It does not diagnose and does not name any condition. Drafted with AI assistance (Claude, Anthropic). MIT licence.

// +1: only an increase matters · -1: only a decrease matters · 0: both directions
export const DIRECTION = {
  speech_rate: -1, pause_fraction: +1, mean_pause_duration: +1, f0_variability: -1, f0_mean: 0, voice_harmonicity: -1,
  max_phonation_time: -1, jitter: +1, shimmer: +1, vowel_harmonicity: -1, voice_breaks: +1,
  blink_rate: 0, perclos: +1, long_eye_closures: +1, yawns: +1, blink_duration: +1, facial_expressiveness: -1,
  smile_asymmetry: +1, brow_asymmetry: +1,
  heart_rate: 0,
};
const NAME = {
  speech_rate: 'speech rate', pause_fraction: 'silence in the message', mean_pause_duration: 'pause length', f0_variability: 'pitch variation',
  f0_mean: 'voice pitch', voice_harmonicity: 'voice clarity', max_phonation_time: 'breath support', jitter: 'voice roughness', shimmer: 'voice steadiness',
  vowel_harmonicity: 'vowel clarity', voice_breaks: 'voice breaks', blink_rate: 'blink rate', perclos: 'eyelid closure', long_eye_closures: 'slow eyelid closures',
  yawns: 'yawning', heart_rate: 'heart rate', blink_duration: 'blink length', facial_expressiveness: 'facial movement',
  smile_asymmetry: 'smile symmetry', brow_asymmetry: 'eyebrow symmetry',
};
const MIN_QUALITY = 0.4, Z_FLAG = 2, Z_STRONG = 3, MIN_USABLE = 3;

export function earlyWarning(observations, baseline = {}, options = {}) {
  const flagged = []; let usable = 0;
  for (const o of observations || []) {
    if (!(o.signal in DIRECTION) || typeof o.value !== 'number' || (o.quality ?? 1) < MIN_QUALITY) continue;
    const b = baseline[o.signal]; if (!b) continue;
    const mean = b.mean ?? b.pre_mean ?? b.media ?? b.pre_media, sd = b.sd ?? b.pre_sd ?? b.desv ?? b.pre_dt;
    if (typeof mean !== 'number' || !(sd > 0)) continue;
    usable++;
    const z = (o.value - mean) / sd, dir = DIRECTION[o.signal];
    if ((dir === 0 ? Math.abs(z) : z * dir) >= Z_FLAG) {
      flagged.push({ signal: o.signal, name: NAME[o.signal], value: o.value, unit: o.unit, z: Math.round(z * 100) / 100, source: o.source, change: z > 0 ? 'higher' : 'lower' });
    }
  }
  flagged.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  const minUsable = options.minUsable ?? MIN_USABLE;
  const amber = flagged.length >= 2 || flagged.some(f => Math.abs(f.z) >= Z_STRONG);
  const level = usable < minUsable ? 'silent' : (amber ? 'amber' : 'green');
  const list = flagged.map(f => `${f.name} (${f.change})`).join(', ');
  const message = level === 'silent' ? `Not enough usable signals yet (${usable} of at least ${minUsable}).`
    : level === 'amber' ? `Heads-up: ${flagged.length} passive signal${flagged.length > 1 ? 's' : ''} changed from your baseline: ${list}.`
    : flagged.length ? `Within your baseline overall. One signal to watch: ${list}.` : 'Within your personal baseline.';
  return {
    level, flagged, usable, message,
    // A new difference between the two sides of the face is treated apart: it is the "F" of the public FAST stroke check.
    // The wording is a team ASSUMPTION to be confirmed by the health lead.
    suggestion: level !== 'amber' ? null
      : flagged.some(f => f.signal === 'smile_asymmetry' || f.signal === 'brow_asymmetry')
        ? 'Nothing is diagnosed. A new difference between the two sides of the face needs the crew medical officer now: repeat the check and open the suspected-stroke checklist.'
        : 'Nothing is diagnosed. Run the standard check now: temperature, blood pressure, SpO2 and the daily questionnaire.',
  };
}
