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

1. **Message** (home): record the daily message; speech rate, pauses and pitch compared with your own mean; optional camera pulse (rPPG); 30-second reaction test; manual entries (blood pressure, glucose, temperature, sleep, mood, pain); you choose what is sent and see when it reaches Earth.
2. **Crew**: the four crew members with status, monitoring level and alerts.
3. **Body**: the 3D body coloured green / amber / red / grey stripes (no recent data), region cards, Before/Now comparison and the time machine (90 days in 10 seconds).
4. **Evolution**: each indicator from preflight to today with the preflight mean, the expected in-flight band, events, rate of change, projection, period comparison and anonymous crew mean.
5. **Incident**: symptom → signals compatible with a condition card (never a diagnosis) → no-regret actions → resources → authority dial → countdown → SBAR summary under 2 kB.
6. **Resources**: inventory, "What do we lose if…?", devices and data sources.
7. **Plan**: adaptive monitoring, blackout planner and process-based gamification.
8. **Simulator**: mission profile + scenario (24) + date + device failures.
9. **Learn**: each risk and measurement explained, with sources.

## How it decides (explainable, no black box)

- **Personal baselines**: every value is compared with that person's own preflight mean or expected in-flight band (mean ± 2 SD), not with Earth values. Example: blood pressure drops 8–10 mmHg in flight (Norsk 2015), so a lower value can be normal.
- **Provisional rules** (fever, SpO2, urine blood, pain, radiation share of the 600 mSv career limit) are team assumptions pending validation.
- **Estimated signals** (camera, voice) never turn red on their own.
- **Silent zones**: grey stripes mean "not measured recently". In space, no alarm does not mean you are fine.
- **Discordance**: short objective sleep with an optimistic self-report raises a watch signal.
- **Authority**: `A = T_earth / T_crit`, with `T_earth = wait for link + packet transmission + round-trip light time + 15 min ground response`. A ≤ 0.25 → EARTH, ≤ 1 → SHARED, > 1 → CREW. The TypeScript engine is verified against the team's Python reference on 72 cases (`npm run verify`).

## Run it

```bash
npm install
npm run dev        # development server
npm run build      # production build in dist/
npm run preview    # serve the build (offline mode works here)
npm run verify     # authority engine vs. the Python reference
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
  sensors/   voice.ts (speech rate, pauses, pitch) · rppg.ts (camera pulse, POS method)
  components/ body/HealthBody3D.tsx (3D body) · charts.tsx · RegionDetail.tsx · MiniBody.tsx · Header.tsx
  screens/   Message · Crew · Body · Evolution · Incident · Resources · Plan · Simulator · Learn
  lib/anatomy-viewer/   the team's original 3D viewer component
public/
  data/      English JSON built by scripts/build_data.py
  geometries/human_body.glb
data_raw/    the team's original files (synthetic observations, link table, baselines, cards, scenarios, spreadsheet)
scripts/     build_data.py · verify_authority.mjs
```

## Data and sources

- **Synthetic crew** (CC0): 4 crew members, 30 days before launch and 60 days in flight, all onboard sources, three demo events (CM-2 days 30–36 short sleep with an optimistic self-report; CM-3 day 44 fever and high white cells; CM-4 day 52 renal colic).
- **Earth–Mars link** 2026–2040 from JPL's approximate planetary positions (Standish), with solar conjunction blackouts (e.g. 17 days from 13 March 2028).
- **Evidence used**: NASA Human Research Program, Integrated Medical Model, IMPACT, NASA-STD-3001, OCHMO technical briefs, Norsk 2015 (blood pressure), Barger 2014 (sleep), Zeitlin 2013 (radiation), Du et al. 2011 and Wotring 2016 (drug stability), Marshall-Goebel 2019 (jugular flow), NICE NG118, Surviving Sepsis Campaign 2021, AAO EyeWiki.
- Uses NASA data; not endorsed by NASA. No NASA logos.

## Limits we state openly

- Not a diagnosis tool; alerts and thresholds are not clinically validated.
- Few-astronaut studies (8–25 people) do not allow training a reliable black-box model, so we use transparent statistics and rules.
- Camera pulse accuracy depends on light and stillness; it has not been tested in microgravity (fluid shift changes the face).
- Effective drug expiry in space is **not determined**: we show stability alerts, we do not invent new dates.

## Licenses

Code MIT (`LICENSE`) · texts CC BY 4.0 · synthetic data CC0. Third-party licenses and the 3D model note are in `NOTICE.md`.

## AI use

Research, writing, code and starter data were produced with AI assistance (Claude, Anthropic).

## Team

Caril (voice, link, authority, camera pulse) · Sophia S. (health lead) · Sophia D. (app) · Elvira (research and submission) · Miguel (data and video).
