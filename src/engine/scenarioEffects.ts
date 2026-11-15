// Scenario effects (by Miguel, data lead): turns a scenario into Observation[] that the app
// adds to the data; the status engine then colours the body as usual.
// Effects file: src/data/scenarioEffects.json. Clinical values are ILLUSTRATIVE, pending
// validation by the health lead. Each observation carries the scenario id so it can be removed.
import defaultEffects from "../data/scenarioEffects.json";
import type { Observation, RegionId } from "../types";

type Stats = { mean: number; sd: number };

interface Change { signal: string; set?: number; sd?: number; region?: string }
interface SignalMeta { unit: string; source: string; method: Observation["method"]; region: string; decimals: number }
export interface EffectsFile {
  start_date: string;
  hour_utc: number;
  all_crew: string[];
  signals: Record<string, SignalMeta>;
  effects: Record<string, { scope: "individual" | "crew"; changes: Change[] }>;
}

/**
 * The only place that depends on the shape of baselines.json. Accepts the app's English
 * file ({ baselines: { crew: { signal: { flight_mean, flight_sd } } } }) and Miguel's
 * original formats (inflight_mean / inflight_sd, or vuelo_media / vuelo_dt).
 */
function inflightStats(baselines: unknown, crew: string, signal: string): Stats | null {
  const root = baselines as Record<string, unknown> | null;
  const table = (root?.baselines ?? root?.lineas_base ?? root) as Record<string, Record<string, Record<string, number>>> | undefined;
  const b = table?.[crew]?.[signal];
  if (!b) return null;
  const mean = b.flight_mean ?? b.inflight_mean ?? b.vuelo_media;
  const sd = b.flight_sd ?? b.inflight_sd ?? b.vuelo_dt;
  return typeof mean === "number" && typeof sd === "number" ? { mean, sd } : null;
}

const round = (v: number, d: number) => Number(v.toFixed(d));

export const SCENARIO_EFFECTS = defaultEffects as unknown as EffectsFile;

export function hasEffects(scenarioId: string, effects: EffectsFile = SCENARIO_EFFECTS): boolean {
  return !!effects.effects[scenarioId];
}

export function applyScenario(
  scenarioId: string, crew: string, day: number, baselines: unknown, effects: EffectsFile = SCENARIO_EFFECTS,
): Observation[] {
  const ef = effects.effects[scenarioId];
  if (!ef) return []; // scenario without defined effects yet
  const crews = ef.scope === "crew" ? effects.all_crew : [crew];
  const t = new Date(effects.start_date + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + day);
  t.setUTCHours(effects.hour_utc, 0, 0, 0);
  const time = t.toISOString().replace(".000Z", "Z");
  const out: Observation[] = [];
  for (const c of crews) {
    for (const ch of ef.changes) {
      const meta = effects.signals[ch.signal];
      if (!meta) continue;
      let value: number;
      if (ch.set !== undefined) value = ch.set;
      else {
        const s = inflightStats(baselines, c, ch.signal);
        if (!s || ch.sd === undefined) continue; // no baseline: cannot compute
        value = s.mean + ch.sd * s.sd;
      }
      out.push({
        crew: c, phase: day < 0 ? "preflight" : "inflight", day, signal: ch.signal, value: round(value, meta.decimals),
        unit: meta.unit, time, source: meta.source, method: meta.method,
        quality: meta.method === "estimated" ? 0.8 : 1, region: (ch.region ?? meta.region) as RegionId, scenario: scenarioId,
      });
    }
  }
  return out;
}
