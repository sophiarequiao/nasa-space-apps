# MediaPipe Tasks Vision (vendored)

- Package: `@mediapipe/tasks-vision` 1.2.3, from the npm registry. Licence: **Apache-2.0** (as declared in its `package.json`).
- Files kept here: `vision_bundle.mjs`, `wasm/vision_wasm_internal.js`, `wasm/vision_wasm_internal.wasm` (unmodified).
- Why vendored: the app must work offline; nothing is fetched from a CDN at run time.
- Model: `face_landmarker.task` (Face Landmarker, float16) is **not** in the repository. `src/sensors/face.js` looks for
  `vendor/mediapipe/face_landmarker.task` first and falls back to Google's public URL:
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
  For offline use, download that file (about 3.7 MB) into this folder. TO CHECK: the model's own licence and model card.
- Privacy: MediaPipe runs locally in the browser; see https://goo.gle/mediapipe-privacy.
