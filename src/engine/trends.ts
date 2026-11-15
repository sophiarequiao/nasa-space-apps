// Evolution over time: rate of change, acceleration and a labelled "if nothing changes" projection.
import type { Observation } from "../types";

export interface Fit { slope: number; intercept: number; residualSd: number; n: number }

export function linearFit(xs: number[], ys: number[]): Fit | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let ss = 0;
  for (let i = 0; i < n; i++) ss += (ys[i] - (intercept + slope * xs[i])) ** 2;
  return { slope, intercept, residualSd: Math.sqrt(ss / Math.max(1, n - 2)), n };
}

export interface TrendSummary {
  slopePerWeek: number | null;
  slopePctPerWeek: number | null;
  direction: "improving" | "worsening" | "stable" | "unknown";
  accelerating: boolean;
  projection: { day: number; value: number; low: number; high: number } | null;
  windowDays: number;
}

/**
 * Trend over the last `windowDays` of in-flight data up to `day`.
 * `badDirection` tells which way is worse ("high", "low" or "both").
 */
export function trendAt(
  series: Observation[], day: number, windowDays = 14, projectTo: number | null = null,
  badDirection: "high" | "low" | "both" | "none" = "both",
): TrendSummary {
  const pts = series.filter((o) => o.day <= day && o.day > day - windowDays && o.day >= 0);
  const fit = linearFit(pts.map((p) => p.day), pts.map((p) => p.value));
  if (!fit) return { slopePerWeek: null, slopePctPerWeek: null, direction: "unknown", accelerating: false, projection: null, windowDays };
  const mean = pts.reduce((a, p) => a + p.value, 0) / pts.length;
  const slopePerWeek = fit.slope * 7;
  const pct = mean !== 0 ? (slopePerWeek / Math.abs(mean)) * 100 : null;
  // "stable" if the change over the window is small compared with the scatter
  const changeOverWindow = Math.abs(fit.slope * windowDays);
  let direction: TrendSummary["direction"] = changeOverWindow < fit.residualSd ? "stable" : "worsening";
  if (direction !== "stable") {
    if (badDirection === "high") direction = fit.slope > 0 ? "worsening" : "improving";
    else if (badDirection === "low") direction = fit.slope < 0 ? "worsening" : "improving";
    else direction = "worsening";
  }
  // acceleration: compare the slope of the second half of the window with the first half
  const half = Math.floor(windowDays / 2);
  const a = linearFit(pts.filter((p) => p.day <= day - half).map((p) => p.day), pts.filter((p) => p.day <= day - half).map((p) => p.value));
  const b = linearFit(pts.filter((p) => p.day > day - half).map((p) => p.day), pts.filter((p) => p.day > day - half).map((p) => p.value));
  const accelerating = !!(a && b && Math.abs(b.slope) > 1.5 * Math.abs(a.slope) && Math.sign(a.slope) === Math.sign(b.slope));

  let projection: TrendSummary["projection"] = null;
  if (projectTo !== null && projectTo > day) {
    const value = fit.intercept + fit.slope * projectTo;
    // simple uncertainty band: residual scatter widened with distance from the data
    const spread = 2 * fit.residualSd * Math.sqrt(1 + ((projectTo - day) / windowDays) ** 2);
    projection = { day: projectTo, value, low: value - spread, high: value + spread };
  }
  return { slopePerWeek, slopePctPerWeek: pct, direction, accelerating, projection, windowDays };
}

export function meanOf(series: Observation[], fromDay: number, toDay: number): { mean: number; n: number } | null {
  const pts = series.filter((o) => o.day >= fromDay && o.day <= toDay);
  if (!pts.length) return null;
  return { mean: pts.reduce((a, p) => a + p.value, 0) / pts.length, n: pts.length };
}
