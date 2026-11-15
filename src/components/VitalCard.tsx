// Small vital-sign card for the crew view: current value, status and a 3-week sparkline
// with the person's own expected band shaded.
import { useApp } from "../state/AppState";
import { evaluateSignal, latestAt } from "../engine/status";
import { formatValue } from "../engine/signals";
import { STATUS_WORDS } from "../engine/plain";
import { STATUS_COLOR } from "./body/HealthBody3D";

const DAYS = 21;

export function VitalCard({ signal, second, title }: { signal: string; second?: string; title: string }) {
  const { idx, data, crewId, day, failedSources } = useApp();
  const list = idx.get(crewId)?.get(signal) ?? [];
  const list2 = second ? idx.get(crewId)?.get(second) ?? [] : [];
  const pts = list.filter((o) => o.day <= day && o.day > day - DAYS);
  const pts2 = list2.filter((o) => o.day <= day && o.day > day - DAYS);
  const last = latestAt(list, day);
  const last2 = second ? latestAt(list2, day) : null;
  const st = evaluateSignal(idx, data.baselines, crewId, signal, day, { failedSources });
  const st2 = second ? evaluateSignal(idx, data.baselines, crewId, second, day, { failedSources }) : null;
  const status = st2 && (st2.status === "red" || (st2.status === "amber" && st.status === "green")) ? st2.status : st.status;
  const band = data.baselines.baselines[crewId]?.[signal];
  const band2 = second ? data.baselines.baselines[crewId]?.[second] : undefined;

  const W = 260, H = 84, P = 6;
  const vals = [...pts.map((p) => p.value), ...pts2.map((p) => p.value), ...(band ? [band.band_min, band.band_max] : []), ...(band2 ? [band2.band_min, band2.band_max] : [])];
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo || 1) * 0.15;
  const y = (v: number) => P + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * (H - 2 * P);
  const x = (d: number) => P + ((d - (day - DAYS + 1)) / (DAYS - 1)) * (W - 2 * P);
  const path = (arr: typeof pts) => arr.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const unit = last?.unit === "°C" ? "°C" : last?.unit ?? "";
  const value = last ? (second && last2 ? `${formatValue(signal, last.value)}/${formatValue(second, last2.value)}` : formatValue(signal, last.value)) : "—";

  return (
    // closed when all is fine; opens by itself when there is something to watch or act on
    <details key={`${crewId}-${status}`} className="glass vital v-fold" open={status === "amber" || status === "red"}>
      <summary className="v-head">
        <div>
          <div className="v-value">{value}<span className="v-unit"> {unit}</span></div>
          <div className="v-title">{title}</div>
        </div>
        <span className={`badge b-${status}`}>{STATUS_WORDS[status]}</span>
      </summary>
      {pts.length > 1 ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="v-chart" aria-hidden>
          {band && <rect x={P} width={W - 2 * P} y={y(band.band_max)} height={Math.max(1, y(band.band_min) - y(band.band_max))} className="v-band" />}
          {band2 && <rect x={P} width={W - 2 * P} y={y(band2.band_max)} height={Math.max(1, y(band2.band_min) - y(band2.band_max))} className="v-band" />}
          <path d={path(pts)} className="v-line" />
          {pts2.length > 1 && <path d={path(pts2)} className="v-line v-line2" />}
          {pts.map((p, i) => <circle key={i} cx={x(p.day)} cy={y(p.value)} r={i === pts.length - 1 ? 4 : 2} className="v-pt" />)}
          {last && last.day === day && <circle cx={x(last.day)} cy={y(last.value)} r={6} fill="none" stroke={STATUS_COLOR[status]} strokeWidth={2} />}
        </svg>
      ) : <p className="g-small">Not enough data yet.</p>}
    </details>
  );
}
