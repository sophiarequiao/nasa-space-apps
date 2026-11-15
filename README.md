# SOSpesIA

**An intelligent health and medical-resource companion for space missions.**
*Know your crew. Know your resources. Know your options. Know your time.*

NASA Space Apps Challenge 2026 · Challenge: *Create Health Monitoring Software for Astronauts on Space Missions* · Local event: Seville.

> **Decision-support prototype. Not a medical device. It does not diagnose.**
> Crew data are synthetic, the inventory is fictional and the protocols are samples pending clinical validation.

## The idea

Knowing what is wrong with an astronaut is not enough. The crew also needs to know what they can do
with what is on board, and whether Earth will answer in time. SOSpesIA joins four questions that are
usually answered separately:

| Pillar | Question | In the app |
|---|---|---|
| Know your crew | How is each crew member? | Daily message to Earth analysed (voice; camera pulse as a plus), onboard devices, manual entries, 3D body with silent zones |
| Know your resources | What do we have? | Inventory with space-aware expiry state and devices as resources |
| Know your options | What can we do? | Condition card × real inventory: which capabilities are available or lost |
| Know your time | Wait for Earth or decide now? | Real Earth link delay and blackouts → authority dial: EARTH / SHARED / CREW |

The same app works for every mission profile: ISS, lunar orbit, lunar south pole (with or without relay),
Mars transit, Mars surface and Earth analogs.

## Screens

The app is made for crew members who are not doctors: big buttons, plain words, no statistics on the main screens.
Five screens, always one tap away, with the crew member, the mission, the day and the delay to Earth at the top.

1. **Today**: how am I today. The 3D body is split into parts anyone recognises (head, neck, shoulders, chest, hip, arms, legs, feet) with the eyes, heart and kidneys drawn on top; only what needs attention is coloured, with a pulsing marker. On the left, "Needs action now" in plain words and a **Get help now** button, then folds for *To do today*, *Daily message*, *Radiation* (NASA figures for the chosen mission) and *Not checked recently*. On the right, heart rate from the smart shirt (simulated stream, ECG trace) and blood pressure, temperature and sleep cards that open by themselves when something is off.
2. **Check-in**: the daily message to Earth with camera and microphone at the same time. Voice (speech rate, pauses, pitch) and camera (blinking, eyes closed, posture, pulse) are compared with the person's own normal; if something is outside it, a warning with **What to do** opens Help. Mood, sleep and pain in three taps. Sending to Earth is optional and leaves encrypted (AES-256-GCM).
3. **Help**: opens directly on today's problem for that crew member (for example renal colic for CM-4 on day 52, suspected sepsis for CM-3 on day 44). It says who decides (*Earth leads* / *Start now, Earth confirms* / *You decide now*), when Earth answers and how much time there is, the steps to do now, when to call the medical officer and what is on board. With no condition card, it lists what to keep an eye on today.
4. **Kit**: ready / use with care (drugs with stability alerts in space) / missing or broken, what can no longer be done because of it, and **Something broke or ran out?**.
5. **Guide**: when to call the medical officer at once, what the colours mean, how to take each measurement (blood pressure, pulse oximeter, temperature, urine dipstick, reaction test, daily message) and what to do without contact with Earth.

The condition cards, scenarios and authority engine behind Help are kept in `src/engine/` and `public/data/`.

## Sensor lab (experimental)

`public/lab/` holds the team's technical modules; the Check-in loads the face and pulse reading from there, and the full lab page is at `lab/tools/demo.html`: eyelids and blink rate, head posture and movement, shoulders and trunk (optional), a held vowel, the pulse with face tracking and an early warning against the person's own baseline. It is a copy of branch `modules-en` (refresh it with `sh scripts/update_lab.sh`), plain ES modules with no build step. Signals the app has no rule for travel in the message and do not colour the body: whether any of them should is a decision for the health lead.

## How it decides (explainable, no black box)

- **Personal baselines**: every value is compared with that person's own preflight mean or expected in-flight band (mean ± 2 SD), not with Earth values. Example: blood pressure drops 8–10 mmHg in flight (Norsk 2015), so a lower value can be normal.
- **Provisional rules** (fever, SpO2, urine blood, pain, radiation share of the 600 mSv career limit) are team assumptions pending validation.
- **Estimated signals** (camera, voice) never turn red on their own.
- **Silent zones**: grey stripes mean "not measured recently". In space, no alarm does not mean you are fine.
- **Discordance**: short objective sleep with an optimistic self-report raises a watch signal.
- **Authority**: `A = T_earth / T_crit`, with `T_earth = wait for link + packet transmission + round-trip light time + 15 min ground response`. A ≤ 0.25 → EARTH, ≤ 1 → SHARED, > 1 → CREW. The TypeScript engine is verified against the team's Python reference on 72 cases (`npm run verify`).
- **Encryption**: what is approved leaves as one AES-256-GCM message (Web Crypto, no library): 12 bytes that number the message, the ciphertext and a 16-byte tag, 28 bytes more than the numbers. A changed bit, another key or a repeated message is refused. It uses the algorithm and key size that CCSDS 352.0-B-2 recommends for space links (AES, 256 bits, GCM) and answers the private medical communication of NASA-STD-3001 [V1 6003]; it does not implement the CCSDS link protocol.

## Run it

```bash
npm install
npm run dev        # development server
npm run build      # production build in dist/
npm run preview    # serve the build (offline mode works here)
npm run verify     # authority vs. the Python reference · Mars link vs. NASA/JPL Horizons · radiation figures · encryption
npm run typecheck
npm run data       # rebuild public/data/*.json from data_raw/ (Python 3, no dependencies)
npm run licenses   # license summary of shipped dependencies
```

The microphone and camera need HTTPS (or `localhost`). Everything runs in the browser: no server, works offline after the first visit (service worker), audio and video are processed on the device and never stored or sent.

### Publish on GitHub Pages

The workflow `.github/workflows/deploy.yml` builds and deploys on every push to `main`.
In the repository go to **Settings → Pages → Source: GitHub Actions**. The app uses relative paths,
so it works at `https://<user>.github.io/<repo>/`.

## Project structure

```
src/
  engine/    link.ts (Earth link, blackouts) · authority.ts (dial) · status.ts (baselines, colours)
             signals.ts (signal catalogue, provisional rules) · trends.ts · resources.ts · monitoring.ts
             radiation.ts (radiation of each mission, NASA figures) · seal.ts (AES-256-GCM for the message to Earth)
  sensors/   voice.ts (speech rate, pauses, pitch) · rppg.ts (camera pulse, POS method) · camera.ts · lab.ts
             plain.ts (plain-language sentences and actions) · scenarioEffects.ts (scenario effects)
  components/ body/HealthBody3D.tsx (3D body) · VitalCard.tsx · LiveHeartCard.tsx · ReactionTest.tsx · Header.tsx
  screens/simple/   TodaySimple · CheckinSimple · HelpSimple · KitSimple · GuideSimple
  lib/anatomy-viewer/   the team's original 3D viewer component
public/
  data/      English JSON built by scripts/build_data.py
  geometries/human_body.glb
  lab/       sensor lab: copy of branch modules-en (tools/demo.html, src/, data/, vendor/mediapipe)
data_raw/    the team's original files (synthetic observations, link table, baselines, cards, scenarios, spreadsheet)
             and horizons_reference.json (201 days from NASA/JPL Horizons)
scripts/     build_data.py · verify_authority.mjs · verify_horizons.mjs · verify_radiation.mjs · verify_seal.mjs · update_lab.sh
```

## Data and sources

- **Synthetic crew** (CC0): 4 crew members, 30 days before launch and 60 days in flight, all onboard sources, three demo events (CM-2 days 30–36 short sleep with an optimistic self-report; CM-3 day 44 fever and high white cells; CM-4 day 52 renal colic).
- **Earth–Mars link** 2026–2040 from JPL's approximate planetary positions (Standish), with solar conjunction blackouts (e.g. 17 days from 13 March 2028). Checked against NASA/JPL Horizons (ephemeris DE441): all 5,175 days compared once, light time within 0.29 s and angle within 0.04°; 201 of those days are kept in `data_raw/horizons_reference.json` and checked again by `npm run verify`.
- **Evidence used**: NASA Human Research Program, Integrated Medical Model, IMPACT, NASA-STD-3001, OCHMO technical briefs, Norsk 2015 (blood pressure), Barger 2014 (sleep), Zeitlin 2013 and Hassler 2014 (radiation measured by the RAD instrument of NASA's Mars Science Laboratory on the way to Mars and on its surface), Simonsen, Zawaski and Weeks (NASA, radiation estimates for the station, the Moon and a Mars mission, NTRS 20250006168), OCHMO-TB-020 (600 mSv career limit), Du et al. 2011 and Wotring 2016 (drug stability), Marshall-Goebel 2019 (jugular flow), NICE NG118, Surviving Sepsis Campaign 2021, AAO EyeWiki.
- Uses NASA data; not endorsed by NASA. No NASA logos.

## Limits we state openly

- Not a diagnosis tool; alerts and thresholds are not clinically validated.
- Few-astronaut studies (8–25 people) do not allow training a reliable black-box model, so we use transparent statistics and rules.
- The smart-shirt heart rate on Today is a simulated stream around the value measured that day; a real mission would read it from a Bio-Monitor / Astroskin type garment.
- Camera pulse accuracy depends on light and stillness; it has not been tested in microgravity (fluid shift changes the face).
- Effective drug expiry in space is **not determined**: we show stability alerts, we do not invent new dates.
- Encryption has no key management: the key is created in the browser for the demo, where a mission would load its own before launch. Not audited.
- The radiation card shows NASA's averages for the mission chosen (they change with shielding and the solar cycle and leave out a large solar storm). It does not add up anybody's dose.
- The sensor lab is experimental: checked with synthetic signals and a few recordings of one person, and compared only with the person's own baseline.

## Licenses

Code MIT (`LICENSE`) · texts CC BY 4.0 · synthetic data CC0. Third-party licenses and the 3D model note are in `NOTICE.md`.

## AI use

We used AI assistants during the hackathon and declare it here and in the submission form.

- **Claude (Anthropic)**: research, writing, code, tests and the starter (synthetic) data.
- **ChatGPT / Codex (OpenAI)**, **Gemini (Google)** and **NotebookLM (Google)**: searching and cross-checking sources, the desk review of the medical cards, drafting and translating the pitch, and images of the slide deck (watermarked).
- **Tripo AI**: the 3D body model `public/geometries/human_body.glb` is AI-generated (see `NOTICE.md`).
- No AI tool was used to create or modify NASA logos, flags or mission identifiers.
- At run time the app uses no generative AI: signal processing, readable rules, and pre-trained on-device models (MediaPipe Face Landmarker; Pose Landmarker as an option in the sensor lab). Nothing is trained on crew data.

## Team

Five members at the Seville local event: technical lead (voice, link, authority, camera), health lead, app lead, research and submission lead, and data and video lead.
