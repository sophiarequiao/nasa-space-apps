# SOSpesAI

**An intelligent health and medical-resource companion for space missions.**
*Know your crew. Know your resources. Know your options. Know your time.*

NASA Space Apps Challenge 2026 · Challenge: *Create Health Monitoring Software for Astronauts on Space Missions* · Local event: Seville.

> **Decision-support prototype. Not a medical device. It does not diagnose.**
> Crew data are synthetic, the inventory is fictional and the protocols are samples pending clinical validation.

## The idea

Knowing what is wrong with an astronaut is not enough. The crew also needs to know what they can do
with what is on board, and whether Earth will answer in time. SOSpesAI joins four questions that are
usually answered separately:

| Pillar | Question | In the app |
|---|---|---|
| Know your crew | How is each crew member? | Daily message to Earth analysed (voice; camera pulse as a plus), onboard devices, manual entries, 3D body with silent zones |
| Know your resources | What do we have? | Inventory with space-aware expiry state and devices as resources |
| Know your options | What can we do? | Condition card × real inventory: which capabilities are available or lost |
| Know your time | Wait for Earth or decide now? | Real Earth link delay and blackouts → authority dial: EARTH / SHARED / CREW |

The same app works for every mission profile: ISS, lunar orbit, lunar south pole (with or without relay),
Mars transit, Mars surface and Earth analogs.

## Two views

- **Crew view (default)**: for crew members who are not doctors. Four everyday screens with big buttons and plain words: **Today** (who am I, how am I, what do I do now), **Check-in** (talk to Earth, mood, sleep, pain), **Help** (what is happening → who decides → steps to do now → what we have) and **Kit** (ready / use with care / missing, and what we can no longer do).
- **Medical officer view** (switch at the top right): every screen below, with the numbers, bands, protocols and the simulator.

## Screens (medical officer view)

1. **Message** (home): record the daily message; speech rate, pauses and pitch compared with your own mean; optional camera pulse (rPPG); 30-second reaction test; manual entries (blood pressure, glucose, temperature, sleep, mood, pain); you choose what is sent, it leaves encrypted (AES-256-GCM) and you see when it reaches Earth. A card opens the **sensor lab** and can add its last check-in to the message.
2. **Crew**: the four crew members with status, monitoring level and alerts.
3. **Body**: the 3D body coloured green / amber / red / grey stripes (no recent data), region cards, Before/Now comparison and the time machine (90 days in 10 seconds).
4. **Evolution**: each indicator from preflight to today with the preflight mean, the expected in-flight band, events, rate of change, projection, period comparison and anonymous crew mean.
5. **Incident**: symptom → signals compatible with a condition card (never a diagnosis) → no-regret actions → resources → authority dial → countdown → SBAR summary under 2 kB.
6. **Resources**: inventory, "What do we lose if…?", devices and data sources.
7. **Plan**: adaptive monitoring, blackout planner and process-based gamification.
8. **Simulator**: mission profile + scenario (24) + date + device failures, with the radiation that mission adds (NASA measurements and estimates against the 600 mSv career limit).
9. **Learn**: each risk and measurement explained, with sources.

## Sensor lab (experimental)

`public/lab/` holds the team's technical modules on one page, opened from **Message → Sensor lab**: eyelids and blink rate, head posture and movement, shoulders and trunk (optional), a held vowel, the pulse with face tracking and an early warning against the person's own baseline. It is a copy of branch `modules-en` (refresh it with `sh scripts/update_lab.sh`), plain ES modules with no build step. When a check-in is sent in the lab, its numbers stay in this browser and the Message screen offers to add them to the message to Earth; a simulated lab check-in is never offered. Signals the app has no rule for travel in the message and do not colour the body: whether any of them should is a decision for the health lead.

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
  sensors/   voice.ts (speech rate, pauses, pitch) · rppg.ts (camera pulse, POS method)
  components/ body/HealthBody3D.tsx (3D body) · charts.tsx · RegionDetail.tsx · MiniBody.tsx · Header.tsx
  screens/   Message · Crew · Body · Evolution · Incident · Resources · Plan · Simulator · Learn
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
- Camera pulse accuracy depends on light and stillness; it has not been tested in microgravity (fluid shift changes the face).
- Effective drug expiry in space is **not determined**: we show stability alerts, we do not invent new dates.
- Encryption has no key management: the key is created in the browser for the demo, where a mission would load its own before launch. Not audited.
- The radiation card shows NASA's averages for the mission chosen (they change with shielding and the solar cycle and leave out a large solar storm). It does not add up anybody's dose.
- The sensor lab is experimental: checked with synthetic signals and a few recordings of one person, and compared only with the person's own baseline.

## Licenses

Code MIT (`LICENSE`) · texts CC BY 4.0 · synthetic data CC0. Third-party licenses and the 3D model note are in `NOTICE.md`.

## AI use

Research, writing, code and starter data were produced with AI assistance (Claude, Anthropic).

## Team

Caril (voice, link, authority, camera pulse) · Sophia S. (health lead) · Sophia D. (app) · Elvira (research and submission) · Miguel (data and video).
