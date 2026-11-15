# Sensor lab

The team's technical modules on one page: eyelids and blink rate, head posture and movement, shoulders and trunk
(optional), the held vowel, the pulse with face tracking, the early warning against the person's own baseline, the
encrypted summary and the radiation of the mission chosen. The app opens it from **Message → Sensor lab**.

- It is a copy of branch `modules-en` of this repository (`tools/demo.html`, `src/`, `data/`, `vendor/`), unmodified.
  Do not edit it here: change `modules-en` and run `sh scripts/update_lab.sh`.
- Plain ES modules, no build step. Code MIT. `vendor/mediapipe/` is MediaPipe Tasks Vision 1.2.3 (Apache-2.0),
  unmodified; see `vendor/mediapipe/README.md`. The face and pose models are not in the repository: the page
  downloads them from Google the first time the camera is used.
- What it shares with the app: when a check-in is sent in the lab, its numbers are kept in this browser
  (`localStorage`, key `sospesai.lab.lastCheckin`). The Message screen offers to add them to the message to Earth.
  Signals the app has no rule for travel in the message and do not colour the body.
- The service worker of the app leaves `/lab/` alone: the lab is not cached for offline use.
- Not a medical device. Experimental: checked with synthetic signals and a few recordings of one person.
