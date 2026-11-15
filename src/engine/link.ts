// Earth link engine: how long a message takes and whether there is a link at all.
// Contract (team): getLink(dateISO, profile) -> { owltS, rttS, hasLink, noLinkReason, ... }
import type { LinkAssumptions, MarsLinkFile, MissionProfile } from "../types";

export interface LinkState {
  /** one-way light time in seconds */
  owltS: number;
  /** round-trip light time in seconds */
  rttS: number;
  hasLink: boolean;
  noLinkReason: string | null;
  /** minutes until the next link window opens (0 if the link is up) */
  waitMin: number;
  /** data rate available for medical traffic, kbps */
  rateKbps: number;
  /** live, guided procedures (e.g. tele-guided ultrasound) are possible */
  liveGuidance: boolean;
  distAu?: number;
  sepDeg?: number;
  /** ISO date actually used (clamped to the table range for Mars) */
  date: string;
}

const DAY_MS = 86_400_000;

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const t = Date.parse(isoDate + "T00:00:00Z") + days * DAY_MS;
  return toISODate(new Date(t));
}

export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((Date.parse(toISO.slice(0, 10) + "T00:00:00Z") - Date.parse(fromISO.slice(0, 10) + "T00:00:00Z")) / DAY_MS);
}

/** Mars medical data rate: 1/d^2 model anchored to published MRO figures, 10% for medicine (placeholder). */
export function marsRateKbps(distAu: number, medicalShare = 0.1): number {
  return Math.max(600, Math.min(2600, 4280 / (distAu * distAu))) * medicalShare;
}

export interface LinkContext {
  marsLink: MarsLinkFile;
  assumptions: LinkAssumptions;
  /** visibility phase anchor for the lunar no-relay model */
  launchDate: string;
  /** one-way delay for the configurable Earth-analog profile */
  analogDelayS?: number;
}

let marsIndexCache: { file: MarsLinkFile; index: Map<string, number> } | null = null;
function marsIndex(file: MarsLinkFile): Map<string, number> {
  if (marsIndexCache?.file !== file) {
    marsIndexCache = { file, index: new Map(file.rows.map((r, i) => [r[0], i])) };
  }
  return marsIndexCache.index;
}

export function getLink(dateISO: string, profile: MissionProfile, ctx: LinkContext): LinkState {
  const date = dateISO.slice(0, 10);
  const maxRtt = ctx.assumptions.live_guidance_max_rtt_s;

  const build = (owltS: number, rateKbps: number, waitMin: number, reason: string | null, extra: Partial<LinkState> = {}): LinkState => ({
    owltS,
    rttS: 2 * owltS,
    hasLink: waitMin === 0,
    noLinkReason: waitMin === 0 ? null : reason,
    waitMin,
    rateKbps,
    liveGuidance: waitMin === 0 && 2 * owltS <= maxRtt,
    date,
    ...extra,
  });

  switch (profile.link_model) {
    case "constant":
      return build(profile.owlt_s ?? 0, profile.rate_kbps ?? 1000, 0, null);

    case "configurable": {
      const owlt = ctx.analogDelayS ?? profile.owlt_s ?? 0;
      return build(owlt, profile.rate_kbps ?? 1000, 0, null);
    }

    case "lunar_visibility": {
      // Team model: without relay satellites Earth is visible half of each sidereal month.
      const month = ctx.assumptions.lunar_sidereal_month_d;
      const d = daysBetween(ctx.launchDate, date);
      const phase = ((d % month) + month) % month;
      const visible = phase < month / 2;
      const waitDays = visible ? 0 : month - phase;
      return build(profile.owlt_s ?? 1.28, profile.rate_kbps ?? 5000, Math.round(waitDays * 1440),
        "Earth below the horizon (no relay satellite)");
    }

    case "mars_table": {
      const rows = ctx.marsLink.rows;
      const index = marsIndex(ctx.marsLink);
      let i = index.get(date);
      if (i === undefined) i = date < rows[0][0] ? 0 : rows.length - 1;
      const r = rows[i];
      let j = i;
      while (j < rows.length && rows[j][4] === 1) j++;
      const waitMin = (j - i) * 1440;
      return build(r[2], marsRateKbps(r[1], ctx.assumptions.medical_share), waitMin,
        "Solar conjunction: Mars is less than 2° from the Sun", { distAu: r[1], sepDeg: r[3], date: r[0] });
    }
  }
}

/** Find the next no-link window starting at or after a date (searches up to `horizonDays`). */
export function nextBlackout(dateISO: string, profile: MissionProfile, ctx: LinkContext, horizonDays = 800):
  { startsInDays: number; start: string; lengthDays: number; reason: string } | null {
  for (let d = 0; d <= horizonDays; d++) {
    const date = addDays(dateISO, d);
    const l = getLink(date, profile, ctx);
    if (!l.hasLink) {
      let len = 0;
      while (len < horizonDays && !getLink(addDays(date, len), profile, ctx).hasLink) len++;
      return { startsInDays: d, start: date, lengthDays: len, reason: l.noLinkReason ?? "No link" };
    }
    // the table ends: stop searching
    if (profile.link_model === "mars_table" && date >= ctx.marsLink.rows[ctx.marsLink.rows.length - 1][0]) break;
    if (profile.link_model === "constant" || profile.link_model === "configurable") break;
  }
  return null;
}

export function formatDuration(minutes: number): string {
  if (!isFinite(minutes)) return "—";
  if (minutes < 1) return `${Math.round(minutes * 60)} s`;
  if (minutes < 60) {
    const m = Math.floor(minutes);
    const s = Math.round((minutes - m) * 60);
    return s ? `${m} min ${s} s` : `${m} min`;
  }
  if (minutes < 48 * 60) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes - h * 60);
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  return `${(minutes / 1440).toFixed(1)} days`;
}
