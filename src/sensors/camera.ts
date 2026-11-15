// Camera during the daily message: eyelids, face and head posture (MediaPipe Face Landmarker, Apache-2.0) and the
// pulse with face tracking, measured while the crew member talks. Uses the team's technical modules shipped in
// public/lab/ (plain ES modules), loaded at run time. The video never leaves the device; only numbers are kept.
// License: MIT. Written with AI assistance (Claude, Anthropic).
import type { LabObservation } from "./lab";

// relative to the page, not to this bundle (BASE_URL is "./")
const at = (file: string) => new URL(`${import.meta.env.BASE_URL}lab/src/sensors/${file}`, document.baseURI).href;
type FaceResult = { state: string; observations?: LabObservation[] };
type Face = { startFace: (v: HTMLVideoElement, cb: (r: FaceResult) => void, o: object) => Promise<void>; stopFace: () => void };
type Pulse = { startPulseTracked: (v: HTMLVideoElement, cb: (p: unknown) => void, o: object) => void; pushFaceFrame: (f: unknown) => void;
  pulseSummary: () => { bpm: number; observation: LabObservation } | null; stopPulse: () => void };

let face: Face | null = null, pulse: Pulse | null = null, stream: MediaStream | null = null, last: LabObservation[] = [];

/** Opens the camera in `video` and starts measuring. `onState`: 'loading' | 'no_face' | 'measuring' | 'ok'. */
export async function startCamera(video: HTMLVideoElement, crew: string, onState: (s: string) => void): Promise<void> {
  last = [];
  stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }, audio: false });
  video.srcObject = stream; video.muted = true; await video.play();
  onState("loading");
  [face, pulse] = await Promise.all([import(/* @vite-ignore */ at("face.js")), import(/* @vite-ignore */ at("rppg.js"))]) as [Face, Pulse];
  pulse.startPulseTracked(video, () => {}, { crew });
  await face.startFace(video, (r) => { onState(r.state); if (r.observations?.length) last = r.observations; }, { crew, window_s: 30, onFrame: pulse.pushFaceFrame });
}

/** Stops the camera and returns what was measured: face and posture values, and the pulse when it was trusted. */
export function stopCamera(): LabObservation[] {
  const p = pulse?.pulseSummary() ?? null;
  try { face?.stopFace(); } catch { /* already stopped */ }
  try { pulse?.stopPulse(); } catch { /* already stopped */ }
  stream?.getTracks().forEach((t) => t.stop()); stream = null;
  const out = [...last];
  if (p?.observation) out.push(p.observation);
  last = [];
  return out;
}
