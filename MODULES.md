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
