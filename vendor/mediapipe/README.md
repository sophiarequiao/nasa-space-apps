# MediaPipe Tasks Vision (vendored)

- Package: `@mediapipe/tasks-vision` 1.2.3, from the npm registry. Licence: **Apache-2.0** (as declared in its `package.json`).
- Files kept here: `vision_bundle.mjs`, `wasm/vision_wasm_internal.js`, `wasm/vision_wasm_internal.wasm` (unmodified).
- Why vendored: the app must work offline; nothing is fetched from a CDN at run time.
- Model: `face_landmarker.task` (Face Landmarker, float16) is **not** in the repository. `src/sensors/face.js` looks for
  `vendor/mediapipe/face_landmarker.task` first and falls back to Google's public URL:
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
  For offline use, download that file (3.8 MB) into this folder.
- Optional second model: `pose_landmarker_lite.task` (Pose Landmarker lite, float16, 5.8 MB), used by `src/sensors/body.js` only when
  the option for shoulders and trunk is on. Same rule: this folder first, otherwise
  https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
- Licence of the models: their model cards state "Licensed under Apache License, Version 2.0":
  Face Mesh V2 https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf ,
  Blendshape V2 https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf ,
  BlazePose GHUM 3D https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf
  The face model card also says the landmarks do not identify a person and the model is not intended for life-critical decisions.
- Privacy: MediaPipe runs locally in the browser; see https://goo.gle/mediapipe-privacy.
