// Camera check (sensor lab, public/lab/): eyelids, head posture, shoulders, held vowel, pulse with face tracking.
// The lab runs as its own page and, when a check-in is sent there, keeps its numbers in this browser only.
// The crew's Check-in can add them to the message to Earth; they never arrive on their own.
// License: MIT. Written with AI assistance (Claude, Anthropic).
import type { Observation, RegionId } from "../types";

const LAB_KEY = "sospesai.lab.lastCheckin";
const MAX_AGE_MS = 12 * 3600_000;
const REGIONS: RegionId[] = ["brain", "eyes", "neck", "heart", "lungs", "musculoskeletal", "kidneys", "blood", "skin"];

export interface LabObservation { signal: string; value: number; unit: string; source?: string; quality?: number; region?: string }
export interface LabCheckin { mode: string; saved_at: number; observations: LabObservation[] }

const LABELS: Record<string, string> = {
  blink_rate: "Blinks", perclos: "Eyes closed", blink_duration: "Blink length", long_eye_closures: "Long eye closures",
  yawns: "Yawns", facial_expressiveness: "Facial movement", head_movement: "Head movement", head_tilt: "Head tilt",
  posture_shifts: "Posture shifts", shoulder_tilt: "Shoulder tilt", trunk_movement: "Trunk movement", head_height: "Head height",
};
/** Plain name of a lab signal, or null when the app's own catalogue has one. */
export const labLabel = (signal: string): string | null => LABELS[signal] ?? null;

export const LAB_URL = `${import.meta.env.BASE_URL}lab/tools/demo.html`;

export function readLab(): LabCheckin | null {
  try {
    const d = JSON.parse(localStorage.getItem(LAB_KEY) ?? "null");
    return d && Array.isArray(d.observations) && typeof d.saved_at === "number" ? (d as LabCheckin) : null;
  } catch { return null; }
}

/** Values of the last lab check-in that may join a message: live (never simulated), recent and of good quality. */
export function usableLabValues(lab: LabCheckin | null, now = Date.now()): LabObservation[] {
  if (!lab || lab.mode !== "live" || now - lab.saved_at > MAX_AGE_MS) return [];
  return lab.observations.filter((x) => typeof x.value === "number" && isFinite(x.value) && (x.quality ?? 1) >= 0.4);
}

/** The lab values as observations of the app (estimated, live), skipping signals already in the message. */
export function labObservations(values: LabObservation[], already: Observation[], crew: string, day: number, time: string): Observation[] {
  const out: Observation[] = [];
  for (const x of values) {
    if (already.some((p) => p.signal === x.signal) || out.some((p) => p.signal === x.signal)) continue;
    const region = REGIONS.includes(x.region as RegionId) ? (x.region as RegionId) : "brain";
    out.push({ crew, phase: day < 0 ? "preflight" : "inflight", day, signal: x.signal, value: x.value, unit: x.unit, time,
      source: x.source ?? "camera", method: "estimated", quality: x.quality ?? 1, region, live: true });
  }
  return out;
}

/** Re-reads the lab when it changes in another tab or when this tab comes back. Returns the cleanup. */
export function watchLab(onChange: (lab: LabCheckin | null) => void): () => void {
  const refresh = () => onChange(readLab());
  window.addEventListener("storage", refresh); window.addEventListener("focus", refresh);
  return () => { window.removeEventListener("storage", refresh); window.removeEventListener("focus", refresh); };
}
