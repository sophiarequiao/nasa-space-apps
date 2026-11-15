// Decision-authority engine. TypeScript port of the team's reference implementation
// (data_raw/motor_autoridad.py). Verified against data_raw/salida_motor_autoridad.txt
// by scripts/verify_authority.mjs.
//
//   T_earth = wait for next window + packet transmission + round-trip light time + ground response time
//   A = T_earth / T_crit
//   A > 1           -> CREW   (crew decides; Earth is informed afterwards)
//   0.25 < A <= 1   -> SHARED (no-regret actions now + packet + checkpoint at Earth's answer time)
//   A <= 0.25       -> EARTH  (Earth leads; crew executes)
//
// All thresholds are design parameters (team assumptions) to be set by flight surgeons.
import type { ConditionCard, LinkAssumptions } from "../types";
import type { LinkState } from "./link";

export type Decider = "EARTH" | "SHARED" | "CREW";

export interface AuthorityResult {
  A: number;
  decider: Decider;
  tEarthMin: number;
  breakdown: { waitMin: number; txMin: number; lightMin: number; groundMin: number };
  packetKB: number;
  mode: string;
  liveGuidancePossible: boolean;
  explanation: string;
}

export function packetSizeKB(card: ConditionCard): number {
  return card.packet.reduce((s, p) => s + p.size_kB_estimate, 0);
}

export function computeAuthority(card: ConditionCard, link: LinkState, a: LinkAssumptions): AuthorityResult {
  const kB = packetSizeKB(card);
  const txMin = (kB * 8) / link.rateKbps / 60;
  const lightMin = (2 * link.owltS) / 60;
  const tEarth = link.waitMin + txMin + lightMin + a.t_ground_min;
  const A = tEarth / card.t_crit_min;
  const live = link.rttS <= a.live_guidance_max_rtt_s && link.waitMin === 0;
  const decider: Decider = A > a.crew_threshold ? "CREW" : A > a.earth_threshold ? "SHARED" : "EARTH";
  let mode = card.earth_best_mode as string;
  if (mode === "live_video" && !live) mode = "async_images (no live guidance)";

  const fmt = (m: number) => (m < 600 ? `${Math.round(m)} min` : `${(m / 1440).toFixed(1)} days`);
  const explanation =
    decider === "CREW"
      ? `Earth would answer in ${fmt(tEarth)}, but you only have about ${fmt(card.t_crit_min)}. The crew leads now and informs Earth afterwards.`
      : decider === "SHARED"
        ? `Earth answers in ${fmt(tEarth)} out of ${fmt(card.t_crit_min)} available. Do the no-regret actions now, send the packet, and hold a checkpoint when Earth's answer arrives.`
        : `Earth answers in ${fmt(tEarth)}, well inside the ${fmt(card.t_crit_min)} available. Earth leads; the crew executes.`;

  return {
    A,
    decider,
    tEarthMin: tEarth,
    breakdown: { waitMin: link.waitMin, txMin, lightMin, groundMin: a.t_ground_min },
    packetKB: kB,
    mode,
    liveGuidancePossible: live,
    explanation,
  };
}
