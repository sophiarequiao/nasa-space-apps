// Explainable status engine: compares each signal with the person's own baseline
// (preflight or expected in-flight band), applies provisional absolute rules, and
// rolls signals up into body regions. Every result carries a human-readable reason.
import type { Baseline, BaselinesFile, Observation, Region, RegionId, Status } from "../types";
import { SIGNALS, STATUS_RANK, worst } from "./signals";

export interface SignalStatus {
  signal: string;
  status: Status;
  value: number | null;
  unit: string;
  day: number | null;
  ageDays: number | null;
  z: number | null;
  baseline: Baseline | null;
  reference: "preflight" | "inflight";
  reason: string;
  method: string | null;
  source: string | null;
  quality: number | null;
}

export interface RegionStatus {
  region: RegionId;
  status: Status;
  signals: SignalStatus[];
  reasons: string[];
  discordance: string | null;
}

/** Observations indexed by crew -> signal -> sorted by day. */
export type ObsIndex = Map<string, Map<string, Observation[]>>;

export function indexObservations(obs: Observation[]): ObsIndex {
  const idx: ObsIndex = new Map();
  for (const o of obs) {
    let bySignal = idx.get(o.crew);
    if (!bySignal) idx.set(o.crew, (bySignal = new Map()));
    let list = bySignal.get(o.signal);
    if (!list) bySignal.set(o.signal, (list = []));
    list.push(o);
  }
  for (const bySignal of idx.values()) for (const list of bySignal.values()) list.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
  return idx;
}

/** Latest observation at or before `day` (binary search). */
export function latestAt(list: Observation[] | undefined, day: number): Observation | null {
  if (!list || list.length === 0) return null;
  let lo = 0, hi = list.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].day <= day) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans >= 0 ? list[ans] : null;
}

export interface StatusOptions {
  /** data sources whose device is marked as failed: their data stops arriving after `failedSince` */
  failedSources?: Set<string>;
}

export function evaluateSignal(
  idx: ObsIndex, baselines: BaselinesFile, crew: string, signal: string, day: number, opts: StatusOptions = {},
): SignalStatus {
  const meta = SIGNALS[signal];
  const list = idx.get(crew)?.get(signal);
  const o = latestAt(list, day);
  const baseline = baselines.baselines[crew]?.[signal] ?? null;
  const reference = day < 0 ? "preflight" : "inflight";
  const empty: SignalStatus = {
    signal, status: "silent", value: null, unit: baseline?.unit ?? "", day: null, ageDays: null, z: null,
    baseline, reference, reason: "Never measured", method: null, source: null, quality: null,
  };
  if (!o) return empty;
  if (opts.failedSources?.has(o.source) && o.day === day) {
    // a failed device cannot produce today's value: fall back to the previous one
    const prev = latestAt(list, day - 1);
    if (!prev) return { ...empty, reason: "Device marked as failed" };
    return evaluateObs(prev, day, meta, baseline, reference, "Device marked as failed: last value before the failure");
  }
  return evaluateObs(o, day, meta, baseline, reference);
}

function evaluateObs(
  o: Observation, day: number, meta: (typeof SIGNALS)[string] | undefined, baseline: Baseline | null,
  reference: "preflight" | "inflight", note?: string,
): SignalStatus {
  const ageDays = day - o.day;
  const base: SignalStatus = {
    signal: o.signal, status: "green", value: o.value, unit: o.unit, day: o.day, ageDays, z: null, baseline, reference,
    reason: "", method: o.method, source: o.source, quality: o.quality,
  };
  if (!meta) return { ...base, reason: "No rule for this signal" };

  const interval = meta.intervalDays;
  if (meta.eventOnly) {
    if (ageDays > 0) return { ...base, status: "green", value: null, reason: "Nothing reported today" };
  } else if (ageDays > interval) {
    return { ...base, status: "silent", reason: `Last measured ${ageDays} days ago (expected every ${interval} ${interval === 1 ? "day" : "days"})` };
  }

  let status: Status = "green";
  const reasons: string[] = [];

  if (!meta.absoluteOnly && baseline && meta.direction !== "none") {
    const mean = reference === "preflight" ? baseline.pre_mean : baseline.flight_mean;
    const sd = Math.max(reference === "preflight" ? baseline.pre_sd : baseline.flight_sd, 1e-6);
    const z = (o.value - mean) / sd;
    base.z = z;
    const dev = meta.direction === "high" ? z : meta.direction === "low" ? -z : Math.abs(z);
    const s: Status = dev > 3 ? "red" : dev > 2 ? "amber" : "green";
    status = s;
    const pct = mean !== 0 ? ((o.value - mean) / Math.abs(mean)) * 100 : 0;
    const dirWord = o.value >= mean ? "above" : "below";
    const ref = reference === "preflight" ? "your preflight mean" : "your expected in-flight mean";
    reasons.push(
      s === "green"
        ? `Inside your band (${Math.abs(pct).toFixed(0)}% ${dirWord} ${ref})`
        : `${Math.abs(pct).toFixed(0)}% ${dirWord} ${ref} (${Math.abs(z).toFixed(1)} SD)`,
    );
    if (!baseline.band_reliable) reasons.push("few data points: wide band");
  }

  if (meta.absolute) {
    const abs = meta.absolute(o.value);
    if (abs) {
      status = meta.absoluteOnly ? abs.status : worst(status, abs.status);
      reasons.push(abs.why);
    }
  }

  if (meta.maxStatus && STATUS_RANK[status] > STATUS_RANK[meta.maxStatus]) {
    status = meta.maxStatus;
    reasons.push("estimated signal: never red on its own");
  }
  if (o.method === "estimated" && status === "red") {
    status = "amber";
    reasons.push("estimated measurement: confirm with a clinical device");
  }
  if (note) reasons.unshift(note);
  return { ...base, status, reason: reasons.join("; ") || "Within expected" };
}

/** Signals that belong to each region (from the catalogue). */
export function signalsForRegion(region: RegionId): string[] {
  return Object.entries(SIGNALS).filter(([, m]) => m.region === region).map(([id]) => id);
}

export function evaluateRegion(
  idx: ObsIndex, baselines: BaselinesFile, region: Region, crew: string, day: number, opts: StatusOptions = {},
): RegionStatus {
  const signals = signalsForRegion(region.id).map((s) => evaluateSignal(idx, baselines, crew, s, day, opts));
  const measured = signals.filter((s) => s.status !== "silent");
  const relevant = signals.filter((s) => !(SIGNALS[s.signal]?.eventOnly && s.value === null));
  const reasons: string[] = [];
  let status: Status;

  if (signals.length === 0) {
    status = "silent";
    reasons.push(`Nothing measured here recently. ${region.how_measured}`);
  } else if (measured.length === 0 || relevant.every((s) => s.status === "silent")) {
    status = "silent";
    reasons.push("No recent data for this region");
  } else {
    status = measured.reduce<Status>((acc, s) => worst(acc, s.status), "green");
    for (const s of measured) if (s.status === "amber" || s.status === "red") reasons.push(`${SIGNALS[s.signal]?.label ?? s.signal}: ${s.reason}`);
    const stale = signals.filter((s) => s.status === "silent" && !SIGNALS[s.signal]?.eventOnly);
    if (stale.length) reasons.push(`Not measured recently: ${stale.map((s) => SIGNALS[s.signal]?.label ?? s.signal).join(", ")}`);
  }

  // Discordance rule (brain): objective sleep clearly short while self-report says "good".
  let discordance: string | null = null;
  if (region.id === "brain") {
    const sleep = signals.find((s) => s.signal === "sleep");
    const self = signals.find((s) => s.signal === "sleep_self_report");
    if (sleep?.z != null && sleep.z <= -2 && self?.value != null && self.value >= 4 && sleep.ageDays === 0) {
      discordance = `Discordance: the actigraph shows ${sleep.value} h of sleep, but the self-report says ${self.value}/5. Shall we do the 3-minute reaction test?`;
      status = worst(status, "amber");
      reasons.unshift(discordance);
    }
  }
  return { region: region.id, status, signals, reasons, discordance };
}

export function evaluateCrew(
  idx: ObsIndex, baselines: BaselinesFile, regions: Region[], crew: string, day: number, opts: StatusOptions = {},
): Record<RegionId, RegionStatus> {
  const out = {} as Record<RegionId, RegionStatus>;
  for (const r of regions) out[r.id] = evaluateRegion(idx, baselines, r, crew, day, opts);
  return out;
}

export function overallStatus(regions: Record<string, RegionStatus>): Status {
  const vals = Object.values(regions).map((r) => r.status).filter((s) => s !== "silent");
  return vals.length ? vals.reduce<Status>((a, b) => worst(a, b), "green") : "silent";
}
