// Dependency-free SVG charts: evolution chart with preflight mean, expected in-flight band,
// events and projection; and the authority dial.
import { useState } from "react";
import type { Status } from "../types";
import { STATUS_COLOR } from "./body/HealthBody3D";
import type { Decider } from "../engine/authority";

export interface ChartPoint { day: number; value: number; status?: Status; estimated?: boolean }

export interface EvolutionChartProps {
  points: ChartPoint[];
  minDay: number;
  maxDay: number;
  preMean?: number | null;
  band?: [number, number] | null;
  events?: { from: number; to: number; label: string }[];
  cursorDay?: number;
  projection?: { fromDay: number; fromValue: number; day: number; value: number; low: number; high: number } | null;
  overlay?: { day: number; value: number }[];
  overlayLabel?: string;
  unit?: string;
  height?: number;
  onPick?: (day: number) => void;
  decimals?: number;
}

export function EvolutionChart({
  points, minDay, maxDay, preMean, band, events = [], cursorDay, projection, overlay, overlayLabel, unit = "", height = 280, onPick, decimals = 1,
}: EvolutionChartProps) {
  const [hover, setHover] = useState<ChartPoint | null>(null);
  const W = 760, H = height, L = 52, R = 16, T = 16, B = 30;
  const xMax = projection ? Math.max(maxDay, projection.day) : maxDay;
  const vals = [
    ...points.map((p) => p.value),
    ...(overlay ?? []).map((p) => p.value),
    ...(band ? band : []),
    ...(preMean != null ? [preMean] : []),
    ...(projection ? [projection.low, projection.high] : []),
  ];
  let yMin = Math.min(...vals), yMax = Math.max(...vals);
  if (!isFinite(yMin)) { yMin = 0; yMax = 1; }
  const pad = (yMax - yMin || 1) * 0.12;
  yMin -= pad; yMax += pad;
  const x = (d: number) => L + ((d - minDay) / (xMax - minDay || 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - yMin) / (yMax - yMin)) * (H - T - B);
  const ticks = 5;
  const yt = Array.from({ length: ticks }, (_, i) => yMin + ((yMax - yMin) * i) / (ticks - 1));
  const xt: number[] = [];
  for (let d = Math.ceil(minDay / 10) * 10; d <= xMax; d += xMax - minDay > 150 ? 30 : 10) xt.push(d);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const ov = overlay?.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)},${y(p.value).toFixed(1)}`).join("");

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Evolution chart"
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          if (!onPick) return;
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          onPick(Math.round(minDay + ((px - L) / (W - L - R)) * (xMax - minDay)));
        }}>
        {/* preflight / in-flight background */}
        {minDay < 0 && <rect x={x(minDay)} y={T} width={x(0) - x(minDay)} height={H - T - B} className="chart-preflight" />}
        {band && <rect x={x(Math.max(0, minDay))} y={y(band[1])} width={x(maxDay) - x(Math.max(0, minDay))} height={Math.max(1, y(band[0]) - y(band[1]))} className="chart-band" />}
        {events.map((ev, i) => (
          <g key={i}>
            <rect x={x(ev.from) - 3} y={T} width={Math.max(6, x(ev.to) - x(ev.from) + 6)} height={H - T - B} className="chart-event" />
            <text x={x(ev.from) + 2} y={T + 12} className="chart-event-label">{ev.label}</text>
          </g>
        ))}
        {yt.map((v, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="chart-grid" />
            <text x={L - 6} y={y(v) + 4} className="chart-axis" textAnchor="end">{v.toFixed(Math.abs(yMax - yMin) < 3 ? 2 : Math.abs(yMax - yMin) < 30 ? 1 : 0)}</text>
          </g>
        ))}
        {xt.map((d) => (
          <text key={d} x={x(d)} y={H - 10} className="chart-axis" textAnchor="middle">{d === 0 ? "launch" : d}</text>
        ))}
        {minDay < 0 && <line x1={x(0)} x2={x(0)} y1={T} y2={H - B} className="chart-launch" />}
        {preMean != null && <line x1={L} x2={W - R} y1={y(preMean)} y2={y(preMean)} className="chart-premean" />}
        {ov && <path d={ov} className="chart-overlay" />}
        <path d={line} className="chart-line" />
        {projection && (
          <g>
            <path d={`M${x(projection.fromDay)},${y(projection.fromValue)} L${x(projection.day)},${y(projection.high)} L${x(projection.day)},${y(projection.low)} Z`} className="chart-proj-band" />
            <line x1={x(projection.fromDay)} y1={y(projection.fromValue)} x2={x(projection.day)} y2={y(projection.value)} className="chart-proj" />
            <circle cx={x(projection.day)} cy={y(projection.value)} r={4} className="chart-proj-dot" />
          </g>
        )}
        {points.map((p, i) => (
          <circle key={i} cx={x(p.day)} cy={y(p.value)} r={p.status === "red" ? 4.5 : 3}
            fill={p.status ? STATUS_COLOR[p.status] : "#9fb3ff"} className={p.estimated ? "pt-est" : ""}
            onMouseEnter={() => setHover(p)} />
        ))}
        {cursorDay !== undefined && <line x1={x(cursorDay)} x2={x(cursorDay)} y1={T} y2={H - B} className="chart-cursor" />}
      </svg>
      <div className="chart-legend small">
        <span><i className="lg lg-line" /> value</span>
        {preMean != null && <span><i className="lg lg-pre" /> preflight mean</span>}
        {band && <span><i className="lg lg-band" /> expected in-flight band</span>}
        {overlay && <span><i className="lg lg-overlay" /> {overlayLabel}</span>}
        {projection && <span><i className="lg lg-proj" /> estimate if nothing changes</span>}
        {hover && <span className="chart-hover">Day {hover.day}: <b>{hover.value.toFixed(decimals)} {unit}</b></span>}
      </div>
    </div>
  );
}

/** Semicircular dial: A on a log scale, zones EARTH | SHARED | CREW. */
export function AuthorityDial({ A, decider, earth = 0.25, crew = 1 }: { A: number; decider: Decider; earth?: number; crew?: number }) {
  const lo = Math.log10(0.01), hi = Math.log10(100);
  const frac = (v: number) => (Math.log10(Math.max(0.01, Math.min(100, v))) - lo) / (hi - lo);
  const ang = (f: number) => Math.PI * (1 - f);
  const cx = 150, cy = 150, r = 110;
  const arc = (f0: number, f1: number) => {
    const a0 = ang(f0), a1 = ang(f1);
    return `M${cx + r * Math.cos(a0)},${cy - r * Math.sin(a0)} A${r},${r} 0 0 1 ${cx + r * Math.cos(a1)},${cy - r * Math.sin(a1)}`;
  };
  const fa = frac(A);
  const na = ang(fa);
  return (
    <svg viewBox="0 0 300 186" className="dial" role="img" aria-label={`Authority dial: ${decider}`}>
      <path d={arc(0, frac(earth))} className="dial-earth" />
      <path d={arc(frac(earth), frac(crew))} className="dial-shared" />
      <path d={arc(frac(crew), 1)} className="dial-crew" />
      <text x={40} y={172} className="dial-label" textAnchor="middle">EARTH</text>
      <text x={150} y={12} className="dial-label" textAnchor="middle">SHARED</text>
      <text x={260} y={172} className="dial-label" textAnchor="middle">CREW</text>
      <line x1={cx} y1={cy} x2={cx + (r - 18) * Math.cos(na)} y2={cy - (r - 18) * Math.sin(na)} className="dial-needle" />
      <circle cx={cx} cy={cy} r={7} className="dial-hub" />
      <text x={cx} y={cy + 28} className="dial-value" textAnchor="middle">A = {A < 10 ? A.toFixed(2) : A.toFixed(0)}</text>
    </svg>
  );
}
