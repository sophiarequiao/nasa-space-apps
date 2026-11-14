# SOSpesAI · technical modules (link, authority, voice, camera pulse)

Plain ES modules, no dependencies, no server. They run in the browser and in Node (for tests).
Code, identifiers and data keys are in English. Not a medical device: the modules estimate and compare, they do not diagnose.

| Module | Main export | Returns |
|---|---|---|
| `src/engine/link.js` | `getLink(dateISO, profile)` | `{ owlt_s, rtt_s, hasLink, noLinkReason, waitUntilLink_s, source }` |
| `src/engine/authority.js` | `computeAuthority({ profile, dateISO, condition })` | `{ A, whoDecides: 'EARTH'\|'SHARED'\|'CREW', explanation, earthResponse_min, tCrit_min, breakdown_min, mode, liveGuidance, link, profile, condition }` |
| `src/sensors/voice.js` | `analyzeVoice(audioBlob, baseline, { crew, time })` | `{ observations: [...], summary: { quality, snr_db, z, changes, text } }` |
| `src/sensors/rppg.js` (optional) | `startPulse(videoEl, onResult, { crew })` / `stopPulse()` | calls `onResult({ state, bpm, bpm_raw, quality, reason, observation, waveform })` once per second |

## Loading data

The modules do not fetch anything on import. Either inject the JSON you already have, or let them fetch the defaults in `data/`:

```js
import { setLinkData } from './src/engine/link.js';
import { setAuthorityData, computeAuthority } from './src/engine/authority.js';

setLinkData(marsLinkJson);                                   // data/mars_link.json
setAuthorityData({ profiles: profilesJson, cards: cardsJson }); // data/mission_profiles.json, data/condition_cards.json
// or, in the browser:  await loadAuthorityData();           // fetches the three files

computeAuthority({ profile: 'mars_surface', dateISO: '2026-11-15T16:30:00Z', condition: 'renal_colic' });
// -> { A: 0.15, whoDecides: 'EARTH', explanation: 'Kidney stone (renal colic): Earth answers in 37 min and there is a 4 h margin; ...' }
```

- Link profiles: `iss`, `moon`, `moon_relay`, `moon_south_pole`, `mars`, `mars_transit`, `mars_surface`.
- Mission profiles: `iss`, `lunar_orbit`, `moon_relay`, `moon_south_pole`, `mars_transit`, `mars_surface` (aliases `moon`, `mars`), and `custom`.
- Any other mission: `computeAuthority({ profile: 'custom', condition, custom: { owlt_s: 240 } })` — you set the one-way light time (and optionally `hasLink: false, wait_s`).
- `condition` is a card id (`renal_colic`, `suspected_sepsis`, `eye_chemical_burn`…) or an object `{ t_crit_min, name?, packet_kB? }`.

## Observation format (voice)

```json
{ "crew": "CM-2", "signal": "speech_rate", "value": 4.45, "unit": "syllables/s", "time": "2026-11-14T12:30:44Z",
  "source": "microphone", "method": "estimated", "quality": 1, "region": "brain" }
```

Signals: `speech_rate` (syllables/s), `pause_fraction` (fraction), `message_duration` (s), plus five new ones:
`pause_count` (count), `mean_pause_duration` (s), `f0_mean` (Hz), `f0_variability` (st), `voice_harmonicity` (dB).
`baseline[signal]` accepts `{ mean, sd }`, `{ pre_mean, pre_sd }`, `{ media, desv }` or `{ pre_media, pre_dt }`.

## Tests

```
node tools/test_link.mjs        # 14 Nov 2026 -> 10 min 59 s one way to Mars
node tools/test_authority.mjs   # 14 reference cases from motor_autoridad.py
node tools/test_voice.mjs       # synthetic speech with known rate, pauses and pitch
node tools/test_rppg.mjs        # synthetic pulse signals: 55, 72, 110 bpm, noise, slow motion, low light
```

**End-to-end demo:** `tools/demo.html` chains the modules: voice message → measures against the personal baseline → summary travelling to Earth with the real light time → authority dial per mission and situation.

Browser test pages (serve the repo root, e.g. `python -m http.server 8000`): `tools/test_link.html`, `tools/test_authority.html`, `tools/test_voice.html`, `tools/test_rppg.html`.

## Known limits and assumptions

- **Authority:** 15 min ground response and thresholds 0.25 / 1 are team assumptions (`data/mission_profiles.json`). All `t_crit_min` values are still `TO_VALIDATE`.
- **Link:** ISS 0.25 s (assumption), Moon 1.28 s (mean distance), lunar south pole outage calendar is simulated, Mars from JPL approximate ephemerides (to be checked against JPL Horizons).
- **Voice:** validated on 10 real recordings of one speaker. It detects speech slower than the personal baseline (−14 % in the test) but under-counts syllables in fast speech. In a noisy room it reports low quality instead of a value. `voice_harmonicity` (hoarse or breathy voice) has not been checked against a hoarse voice, and it also drops with room noise (6.7 dB in a noisy room vs 10 dB in a quiet one for the same speaker): compare only recordings made in similar conditions.
- **Camera pulse (optional):** no face tracking; the person places their face in a fixed zone and must stay still for 15-20 s. Checked against a manual count on one person (74 bpm both) and a post-exercise recovery curve; not yet validated against a pulse oximeter. With motion it hides the value (`reason: 'motion'`) instead of showing a wrong one. `heart_rate` observations use `source: 'camera_rppg'`, `method: 'estimated'`.
- `tools/generate_earth_mars_link.py` and its CSV keep their original Spanish comments and column names.

AI use: code drafted with AI assistance (Claude, Anthropic) and reviewed by the team. Licence: MIT.

## Sustained vowel test (`src/sensors/voice.js`)

```js
import { analyzeVowel, VOWEL_SIGNALS } from './src/sensors/voice.js';
const { observations, summary } = await analyzeVowel(blob, baseline, { crew: 'CM-2' });
```

- Task for the crew member: take a breath and say "aaaa" on one steady note for as long as comfortable.
- Signals (`region: 'lungs'`): `max_phonation_time` (s), `jitter` (%), `shimmer` (%), `vowel_harmonicity` (dB), `vowel_f0` (Hz), `voice_breaks` (count).
- Record with `getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })`. The browser noise filter damages a held vowel.
- `observations` is empty when nothing could be measured; `summary.text` says why, and `summary.snr_db` / `summary.irregular_cycles_pct` give the diagnostics.
- Real test (one speaker, laptop microphone, noisy room): 4 normal vowels were stable (jitter 0.14-0.18 %, harmonicity 15-17 dB, held 4.8-5.8 s); a deliberately hoarse one moved every measure (jitter 0.35 %, harmonicity 8.6 dB, held 1.3 s).
- Limits: values are comparable only with the same person's baseline on the same microphone, not with clinical software. A whispered vowel is reported as "no sustained vowel". Not a diagnosis.

## Camera pulse, tracked mode (`src/sensors/rppg.js` + `src/sensors/face.js`)

Use this mode when the person talks or moves a little (for example during the daily check-in).

```js
import { startFace, stopFace } from './src/sensors/face.js';
import { startPulseTracked, pushFaceFrame, pulseSummary, stopPulse } from './src/sensors/rppg.js';

video.srcObject = stream; await video.play();                         // the page owns the camera
startPulseTracked(video, (p) => { /* p.bpm is null unless the value is trusted */ }, { crew: 'CM-2' });
await startFace(video, onFace, { crew: 'CM-2', onFrame: pushFaceFrame });   // the pulse reads its zones on every tracked frame
// ... at the end of the check-in:
const summary = pulseSummary();          // { bpm, seconds, observation } or null if fewer than 5 trusted seconds
stopPulse(); stopFace();
```

- How it works: two skin zones (face and forehead) follow the face on every frame; POS over short overlapping windows; a candidate at the same rate as the face's own movement is discarded; a value is shown only when it persists and changes smoothly (three clear estimates in a row over 4 s or more start a track, and later values must continue it).
- Real tests (one person, laptop camera, 3 minutes each, no reference device):
  - At rest: a value in 82 % of the seconds while talking and 51 % with small movements, always 79-91 bpm and consistent with the still minute (82-85 bpm). The previous method showed 18 % and 22 %.
  - Right after exercise: it followed the recovery, 139 bpm falling to 104 in 45 s and to about 94 after three minutes (a value in 78 % of the still seconds, 40 % talking, 27 % moving).
  - No shown value was more than 12 bpm away from the trend of its recording.
- 150 simulated noise-only streams: no value shown. A simulated head movement that tints the skin zone shows a false 54 bpm without the motion check and nothing with it.
- Limits: tuned on one person and two recordings; not validated against a pulse oximeter; it stays silent rather than guess, so some check-ins have no pulse. Estimated, never a clinical measurement.
- `tools/record_rppg.html` records raw data (numbers only) and `node tools/eval_rppg.mjs file.csv` replays it.

## More from the face (`src/sensors/face.js`)

- Two more passive signals in `observations` once the window is long enough:
  - `blink_duration` (ms): mean length of the blinks. Longer than the person's usual goes with drowsiness. Coarse at 20-30 fps.
  - `facial_expressiveness` (0-100): how much the brows, cheeks and mouth corners move while the person talks. Less than usual is a behavioural signal, nothing more. The jaw and the lips are left out, so speech itself does not count.
- `onFrame` now also gives `shapes`: the 52 expression scores of MediaPipe for that frame.
- Guided check of the two sides of the face:

```js
import { symmetryIndex } from './src/sensors/face.js';
// collect f.shapes from onFrame while the person holds a wide smile for 4 s, then:
const r = symmetryIndex(frames, 'mouthSmileLeft', 'mouthSmileRight');   // { left, right, asymmetry (0-100 %), weaker } or null
```

  The demo stores it as `smile_asymmetry` and `brow_asymmetry` (%), compared with the person's own baseline. A new difference changes the early-warning suggestion to "call the crew medical officer and open the suspected-stroke checklist".
- Status: logic tested with synthetic scores only. Not yet tried on a real face, no clinical validation, and the wording of the suggestion must be confirmed by the health lead. "Left" and "right" are the person's own sides as MediaPipe names them (TO CHECK on a real face).
- Tried and dropped: breathing rate from the movement of the face box. On two real recordings the candidates did not agree with each other, so it is not offered.
