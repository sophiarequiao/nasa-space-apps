// Adaptive monitoring (measure just enough, when it matters) and process-based
// gamification (reward doing the tests on time, never the results).
import type { RegionId, Status } from "../types";
import type { ObsIndex, RegionStatus } from "./status";
import { latestAt } from "./status";
import { SIGNALS } from "./signals";

export type MonitoringLevel = "routine" | "enhanced" | "intensive";

export interface MonitoringPlan {
  level: MonitoringLevel;
  reasons: string[];
  actions: string[];
}

const LEVEL_ACTIONS: Record<MonitoringLevel, string[]> = {
  routine: [
    "Passive and continuous: actigraph (sleep, activity), cabin CO2, dosimeter, device status",
    "Daily message to Earth (voice; camera pulse as a plus)",
    "Weekly blood pressure and body mass; lab every 2 weeks; scheduled OCT and ultrasound",
  ],
  enhanced: [
    "Everything in routine",
    "Add the daily 3-minute reaction test",
    "Repeat the amber signal within 24 h with a clinical device",
  ],
  intensive: [
    "Bio-Monitor on for 24-72 h",
    "Vital signs every 15 min while the incident lasts",
    "Extra lab test (HemoCue / Bio-Analyzer) if available",
  ],
};

export function monitoringPlan(regions: Record<RegionId, RegionStatus>, blackoutInDays: number | null): MonitoringPlan {
  const reasons: string[] = [];
  const list = Object.values(regions);
  const red = list.filter((r) => r.status === "red");
  const amber = list.filter((r) => r.status === "amber");
  let level: MonitoringLevel = "routine";
  if (red.length) {
    level = "intensive";
    reasons.push(`Act-now signal in: ${red.map((r) => r.region).join(", ")}`);
  } else if (amber.length || list.some((r) => r.discordance)) {
    level = "enhanced";
    reasons.push(`Watch signal in: ${amber.map((r) => r.region).join(", ")}`);
  }
  if (blackoutInDays !== null && blackoutInDays <= 7) {
    if (level === "routine") level = "enhanced";
    reasons.push(`Communications blackout in ${blackoutInDays} days: bring the silent tests forward`);
  }
  if (!reasons.length) reasons.push("Everything within expected: stay at the routine level so nobody gets tired of measuring");
  return { level, reasons, actions: LEVEL_ACTIONS[level] };
}

export interface Readiness {
  percent: number;
  done: number;
  expected: number;
  missing: string[];
  streakDays: number;
}

/** Share of scheduled measurements done on time over the last 7 days. */
export function readiness(idx: ObsIndex, crew: string, day: number, silentRegions: RegionId[]): Readiness {
  const bySignal = idx.get(crew);
  let done = 0, expected = 0;
  const missing: string[] = [];
  for (const [id, meta] of Object.entries(SIGNALS)) {
    if (meta.eventOnly || meta.region === "lungs" && id === "cabin_co2") continue;
    const list = bySignal?.get(id) ?? [];
    const due = Math.max(1, Math.ceil(7 / meta.intervalDays));
    const got = list.filter((o) => o.day <= day && o.day > day - Math.max(7, meta.intervalDays)).length;
    expected += due;
    done += Math.min(due, got);
    if (got < due) missing.push(meta.label);
  }
  // silent regions that need scheduled imaging (OCT, neck ultrasound) count as missing tasks
  for (const r of silentRegions) {
    if (r === "eyes" || r === "neck") { expected += 1; missing.push(r === "eyes" ? "OCT / vision test" : "Neck ultrasound"); }
  }
  // streak of daily messages to Earth
  let streak = 0;
  const msgs = bySignal?.get("message_duration") ?? [];
  const days = new Set(msgs.map((o) => o.day));
  for (let d = day; days.has(d); d--) streak++;
  return { percent: expected ? Math.round((done / expected) * 100) : 0, done, expected, missing, streakDays: streak };
}

export function lastMeasuredDay(idx: ObsIndex, crew: string, signal: string, day: number): number | null {
  return latestAt(idx.get(crew)?.get(signal), day)?.day ?? null;
}

export const LEVEL_LABEL: Record<MonitoringLevel, string> = { routine: "Routine", enhanced: "Enhanced", intensive: "Intensive" };
export const LEVEL_STATUS: Record<MonitoringLevel, Status> = { routine: "green", enhanced: "amber", intensive: "red" };
