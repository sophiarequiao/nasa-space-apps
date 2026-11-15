# NOTICE

SOSpesAI · NASA Space Apps Challenge 2026 · Seville

## Licenses of this project

| Part | License |
|---|---|
| Source code (`src/`, `scripts/`, `public/sw.js`) | MIT (see `LICENSE`) |
| Texts, sample protocols, region and Learn texts, documentation | CC BY 4.0 |
| Synthetic crew data and fictional inventory (`public/data/`, `data_raw/`) | CC0 |

## Third-party software shipped in the app

Checked with `npm run licenses` (license-checker) on 14 Nov 2026.

| Package | License |
|---|---|
| react, react-dom | MIT |
| three | MIT |
| @react-three/fiber, @react-three/drei | MIT |
| @fontsource/inter (Inter typeface) | Font: SIL OFL 1.1 · package code: MIT |
| Small transitive dependencies of three / r3f / drei | MIT, Apache-2.0, plus `ieee754` (BSD-3-Clause), `potpack` (ISC), `isexe`/`which` (ISC) |

Build-only tools (not shipped): vite (MIT), typescript (Apache-2.0), lightningcss (MPL-2.0, used only at build time by vite).

No GPL or non-commercial dependency. The screens of the app download no camera/face model: the camera pulse uses
the team's own code (POS method, Wang et al. 2017) and a simple skin-colour filter, without MediaPipe.

## Sensor lab (`public/lab/`)

The sensor lab is a separate static page (a copy of branch `modules-en`), opened from the Message screen.

| Part | License |
|---|---|
| Its code and data (`public/lab/tools`, `src`, `data`) | MIT, the team's own |
| MediaPipe Tasks Vision 1.2.3 (`public/lab/vendor/mediapipe/`: `vision_bundle.mjs` and the two files in `wasm/`), unmodified | Apache-2.0 |
| Face Landmarker and Pose Landmarker lite models | Apache-2.0 according to their model cards (Face Mesh V2, Blendshape V2, BlazePose GHUM 3D). Not in the repository: the lab downloads them from Google the first time the camera is used |

Details and links are in `public/lab/vendor/mediapipe/README.md`. The lab does no face recognition and keeps only numbers.

## Encryption

The message to Earth is encrypted with the Web Crypto API of the browser (AES-256-GCM). No cryptography library is shipped.

## 3D model

`public/geometries/human_body.glb` was generated with Tripo AI (the file metadata says
`generator: https://tripo3d.ai`). **Action for the team:** confirm the license terms of the
Tripo account used to generate it (free-plan outputs may carry an attribution licence such as
CC BY 4.0; paid plans may grant full rights) and record the result here before submission.
If the terms are not clear, replace it with a model built in code from simple three.js shapes.

## Data and marks

- Uses NASA data and publications (Human Research Program, IMM, IMPACT, NASA-STD-3001, OCHMO
  technical briefs, JPL approximate planetary positions, JPL Horizons, the RAD instrument of the
  Mars Science Laboratory, NTRS 20250006168 on space radiation protection). Not endorsed by NASA. No NASA logo,
  insignia or mission emblem is used.
- Protocols are SAMPLE protocols written by the team's health lead from public guidelines
  (NICE NG118, Surviving Sepsis Campaign 2021, AAO EyeWiki). NASA protocols are not public.
- The medical inventory is fictional.

## AI use

Research, writing, code and the starter data were produced with AI assistance (Claude, Anthropic).
