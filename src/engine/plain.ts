// Plain-language layer for crew members who are not doctors: short sentences, one action
// at a time, no statistics. Wording is a team proposal pending review by the health lead.
import type { RegionId, Status } from "../types";
import type { Decider } from "./authority";
import type { RegionStatus, SignalStatus } from "./status";
import { SIGNALS, withUnit } from "./signals";

export const STATUS_WORDS: Record<Status, string> = {
  green: "All good",
  amber: "Keep an eye on it",
  red: "Needs action now",
  silent: "Not checked recently",
};

export const REGION_SHORT: Record<RegionId, string> = {
  brain: "Sleep & mind", eyes: "Eyes", neck: "Neck", heart: "Heart", lungs: "Breathing & air",
  musculoskeletal: "Bones & muscles", kidneys: "Kidneys", blood: "Fever, infection & radiation", skin: "Skin",
};

/** What to do, in plain words, for each region and colour. */
const ACTIONS: Record<RegionId, Partial<Record<Status, string[]>>> = {
  brain: {
    amber: ["Do the 3-minute reaction test", "Protect your next sleep period"],
    red: ["Tell the medical officer today"],
    silent: ["Record today's message to Earth"],
  },
  eyes: {
    amber: ["Repeat the eye scan (OCT)", "Tell the medical officer"],
    red: ["Tell the medical officer now"],
    silent: ["Your eye scan (OCT) is due: book it, before any blackout"],
  },
  neck: {
    amber: ["Repeat the neck ultrasound on both sides", "Tell the medical officer"],
    red: ["Tell the medical officer now"],
    silent: ["Your neck ultrasound is due: book it"],
  },
  heart: {
    amber: ["Measure again in 1 hour with the cuff or pulse oximeter"],
    red: ["Rest and call the medical officer now"],
    silent: ["Measure your blood pressure"],
  },
  lungs: {
    amber: ["Check the cabin CO2 reading", "Measure your oxygen (SpO2)"],
    red: ["Move to clean air and call the medical officer now"],
    silent: ["Measure your oxygen (SpO2)"],
  },
  musculoskeletal: {
    amber: ["Do your full exercise session today"],
    red: ["Tell the medical officer"],
    silent: ["Measure your body mass this week"],
  },
  kidneys: {
    amber: ["Drink water as your plan says", "Tell the medical officer if it hurts"],
    red: ["Open Help: flank (side) pain"],
    silent: ["Do your urine test"],
  },
  blood: {
    amber: ["Take your temperature again in 1 hour"],
    red: ["Open Help: fever, fast pulse", "Call the medical officer now"],
    silent: ["Take your temperature"],
  },
  skin: {
    amber: ["Take a photo with a ruler next to it"],
    red: ["Tell the medical officer"],
    silent: ["If something on your skin looks wrong, take a photo with a ruler"],
  },
};

export function regionActions(region: RegionId, status: Status): string[] {
  return ACTIONS[region][status] ?? [];
}

/** One plain sentence about a signal, compared with the person's own normal. */
export function plainSignal(s: SignalStatus): string | null {
  const meta = SIGNALS[s.signal];
  if (!meta) return null;
  const name = meta.label.replace(/ \(.*\)$/, "");
  if (s.status === "silent") return s.ageDays ? `${name}: last checked ${s.ageDays} days ago` : `${name}: never checked`;
  if (s.value === null) return null;
  const v = withUnit(s.signal, s.value, s.unit);
  if (meta.absoluteOnly) {
    if (s.status === "green") return null;
    return `${name}: ${v}`;
  }
  if (s.z === null || s.status === "green") return null;
  return `${name}: ${v}, ${s.z > 0 ? "higher" : "lower"} than usual for you`;
}

/** The main sentence for a region. */
export function regionSentence(rs: RegionStatus): string {
  if (rs.discordance) return "Your sleep was short, but you said you slept well. Let's check how alert you are.";
  if (rs.status === "silent") {
    const stale = rs.signals.find((s) => s.status === "silent" && s.ageDays);
    return stale ? `Not checked for ${stale.ageDays} days. No alarm does not mean all is fine.` : "Not checked recently. No alarm does not mean all is fine.";
  }
  const lines = rs.signals.filter((s) => s.status === rs.status).map(plainSignal).filter(Boolean) as string[];
  if (rs.status === "green") return "Normal for you.";
  return lines.slice(0, 2).join(" · ") || STATUS_WORDS[rs.status];
}

export const DECIDER_PLAIN: Record<Decider, { title: string; text: string }> = {
  EARTH: { title: "Earth leads", text: "Earth will answer in time. Send the summary and follow their instructions." },
  SHARED: { title: "Start now, Earth confirms", text: "Do the safe steps below now. Earth's answer arrives in time to confirm the next step." },
  CREW: { title: "You decide now", text: "Earth cannot answer in time. Follow the steps below and tell Earth afterwards." },
};

export function priority(s: Status): number {
  return s === "red" ? 0 : s === "amber" ? 1 : s === "silent" ? 2 : 3;
}
