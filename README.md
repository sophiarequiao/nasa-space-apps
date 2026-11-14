# SOSpesAI

A daily health check-in for crews far from Earth. It runs in a browser on one laptop, with no server.

It does two things:

1. **It measures with what a crew already has: a microphone and a camera.** Thirty seconds of speech, one held "aaaa" and the laptop camera give about twenty signals: speech rate, pauses, voice steadiness, breath support, blinks, eyelid closure, yawns and an experimental pulse. Each signal is compared with that person's own baseline, never with a population average.
2. **It works out who should decide: Earth, both, or the crew.** For a mission, a date and a medical situation, it compares how long Earth needs to answer (light time, link outages, ground response) with how long the crew can wait.

Built in Seville for the NASA Space Apps Challenge 2026, challenge *Create Health Monitoring Software for Astronauts on Space Missions*.

> **Not a medical device.** SOSpesAI estimates and compares. It does not diagnose and it never names a condition from the signals. Its strongest output is amber, which means "run the standard check". All crew data in this repository are synthetic.

## Why "who decides" changes with distance

On 15 November 2026 a message takes 654 seconds, just under 11 minutes, to travel from Mars to Earth. The fastest possible answer to a medical question therefore takes about 37 minutes: almost 22 minutes of light travel there and back, plus the time the ground team needs to read and reply (we assume 15 minutes). From 13 to 29 March 2028 Mars is within 2° of the Sun as seen from Earth and there is no reliable link at all.

| Situation (time to act) | Space station: Earth answers in 15 min | Mars surface, 15 Nov 2026: 37 min | Mars surface, 20 Mar 2028: no link for 9 more days |
|---|---|---|---|
| Chemical eye burn (5 min) | The crew decides | The crew decides | The crew decides |
| Suspected stroke (60 min) | Decide together | Decide together | The crew decides |
| Kidney stone, renal colic (4 h) | Earth leads | Earth leads | The crew decides |

The engine reduces each case to one number, `A = time for Earth's answer / time the crew can wait`. A kidney stone on Mars on 15 November 2026 gives 37 min / 240 min, about 0.15.

- `A ≤ 0.25`: Earth leads and the crew carries it out.
- `0.25 < A ≤ 1`: decide together. The crew starts the actions that cannot make things worse, sends a summary and re-checks when Earth's answer arrives.
- `A > 1`: the crew decides and reports afterwards.

The times to act, the 15 minute ground response and the two thresholds are team assumptions. A clinician has not validated them yet; they are marked `TO_VALIDATE` in `data/condition_cards.json`.

## Try it in two minutes

```
git clone -b modules-en https://github.com/sophiarequiao/nasa-space-apps.git
cd nasa-space-apps
python -m http.server 8000
```

Open `http://localhost:8000/tools/demo.html` in a recent Chrome or Edge. Any static file server works; Python is only used to serve the files.

1. At the top, choose a mission, a date and a situation. The page shows the light time, a to-scale line between the two worlds and the verdict.
2. In the daily check-in choose **Simulated, rested** or **Simulated, tired** to see it work without a camera. With **Live sensors**, allow the microphone and the camera and talk for 30 seconds.
3. The read-out places each signal against the personal baseline. The baseline exists after two saved check-ins and is kept only in this browser.
4. **Send this check-in to Earth** shows the summary travelling with the real light time of that date.

## NASA data and resources used

| Resource | What we use it for | Where |
|---|---|---|
| JPL Solar System Dynamics, [Approximate Positions of the Planets](https://ssd.jpl.nasa.gov/planets/approx_pos.html) | Earth to Mars light time and Sun-Earth-Mars angle for every day from 2026-11-01 to 2040-12-31 | `tools/generate_earth_mars_link.py`, `data/mars_link.json` |
| [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) (ephemeris DE441) | Independent check of that table | `data/horizons_reference.json`, `tools/check_horizons.mjs` |
| JPL news release on the [Mars solar conjunction](https://www.jpl.nasa.gov/news/mars-missions-to-pause-commanding-in-june-due-to-sun/) | Rule "no commands while Mars is within 2° of the Sun" | `src/engine/link.js` |
| NASA [Moon Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html) | Earth to Moon distance, 384,400 km, 1.28 s | `src/engine/link.js` |
| NASA Integrated Medical Model results for a Mars transit and NASA Human Research Program risk summaries | Which situations are on the cards and why | `data/condition_cards.json`, fields `nasa_basis` and `_sources` |
| NASA Technical Reports Server, document 20240011063 | Time to return to Earth for each mission profile | `data/mission_profiles.json` |

The last two rows are cited inside the data files and are still being re-read by the team against the original documents.

This project uses NASA data and is not endorsed by NASA. No NASA logos or insignia are used.

## How well does it work

| Part | How it was checked | Result | Still open |
|---|---|---|---|
| Earth to Mars link | Every day from 2026 to 2040 (5,175 days) against JPL Horizons | Light time within 0.29 s (0.05 %), angle within 0.04°, the solar conjunction windows match on all days but one | Relay orbiters and the local horizon on Mars are not modelled |
| Who decides | 14 reference cases from the team's first Python version | All match | Times to act and thresholds need clinical validation |
| Voice message | Synthetic speech with known rate, pauses and pitch; 10 real recordings of one speaker | Detects speech 14 % slower than the baseline | Under-counts syllables in fast speech; one speaker |
| Held vowel | Synthetic vowels with known jitter and shimmer; 10 real recordings of one speaker on a laptop microphone in a noisy room | A normal and a hoarse vowel are clearly apart (jitter 0.14-0.18 % against 0.35 %, harmonicity 15-17 dB against 8.6 dB) | Values read about half of what clinical software gives; only comparable with the person's own baseline |
| Eyelids | Synthetic blink scores; 3 minutes of one person | Blink rate 8 per minute at rest and 19 blinking on purpose; eyelid closure 1 % at rest and 36 % with slow closures | Looking down reads as eyes closing |
| Pulse from the camera (experimental) | Synthetic signals, 150 noise-only simulations, two 3-minute recordings of one person | Shows nothing on noise; follows the recovery after exercise from 139 to 104 beats per minute in 45 s | No reference device yet; it stays silent rather than guess, so some check-ins have no pulse |
| Face symmetry check (experimental) | Synthetic scores only | The logic behaves as designed | Not tried on a real case; wording to be approved by the health lead |
| Early warning | Synthetic cases | As designed | The rules (2 and 3 standard deviations) are team assumptions |

Run the checks yourself (Node 18 or later, nothing to install):

```
node tools/check_horizons.mjs      # Mars table against NASA/JPL Horizons
node tools/test_link.mjs
node tools/test_authority.mjs
node tools/test_voice.mjs
node tools/test_vowel.mjs
node tools/test_face.mjs
node tools/test_early_warning.mjs
node tools/test_rppg.mjs
```

## What is in the repository

| Path | Content |
|---|---|
| `src/engine/link.js` | Light time and link outages for each mission |
| `src/engine/authority.js` | Who decides: Earth, both or the crew |
| `src/engine/earlyWarning.js` | Change from the personal baseline: silent, green or amber |
| `src/sensors/voice.js` | The 30 second voice message and the held vowel |
| `src/sensors/face.js` | Eyelids, yawns, facial movement and the guided symmetry check |
| `src/sensors/rppg.js` | Experimental pulse from the camera |
| `data/` | Mars link table 2026-2040, Horizons reference, mission profiles, condition cards |
| `tools/demo.html` | The whole flow in one page |
| `tools/` | Tests for Node (`*.mjs`), test pages for the browser (`test_*.html`), the Python scripts that built the Mars table |
| `vendor/mediapipe/` | MediaPipe Tasks Vision 1.2.3, unmodified |
| `MODULES.md` | Integration guide: functions, data formats, limits |

The modules are plain ES modules with no dependencies, so an app can import them directly.

## Privacy

Audio and video are analysed inside the browser. They are never stored and never sent anywhere; only the resulting numbers are kept, in the browser's local storage. Test recordings are kept out of the repository.

The only network request the demo makes is the first download of the MediaPipe face model (about 3.7 MB) from Google's public model storage. Place the file in `vendor/mediapipe/` to run fully offline (see `vendor/mediapipe/README.md`).

## Licences

- Our code and data files: MIT (see `LICENSE`).
- MediaPipe Tasks Vision 1.2.3: Apache-2.0, vendored unmodified in `vendor/mediapipe/`. The face model file is downloaded from Google and is not redistributed here; its own licence is being confirmed (see `vendor/mediapipe/README.md`).
- Fonts: system fonts only. No images or icons from third parties.

## Use of AI

The code, the tests and this documentation were drafted with AI assistance (Claude, by Anthropic) and reviewed and tested by the team. Every source file says so in its header. There are no AI-generated images, audio or video in this repository.

## Team

Team SOSpesAI, NASA Space Apps Challenge 2026, Seville: technical lead, health lead and presenter, app developer, sources and licences, data and validation.
