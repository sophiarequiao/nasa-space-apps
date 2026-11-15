// Evolution: mission timeline from preflight to today, with the preflight mean, the expected
// in-flight band, events, rate of change, projection, period comparison and anonymous crew mean.
import { useMemo, useState } from "react";
import { useApp, CREW } from "../state/AppState";
import { Card, Segmented, Stat, StatusPill, Tag } from "../components/ui";
import { EvolutionChart, type ChartPoint } from "../components/charts";
import { SIGNALS, formatValue, signalLabel } from "../engine/signals";
import { evaluateSignal } from "../engine/status";
import { meanOf, trendAt } from "../engine/trends";

const GROUPS: { label: string; signals: string[] }[] = [
  { label: "Brain & mood", signals: ["sleep", "reaction_lapses", "speech_rate", "pause_fraction", "message_duration", "mood", "sleep_self_report"] },
  { label: "Eyes & neck", signals: ["optic_disc_edema", "jugular_flow"] },
  { label: "Heart", signals: ["heart_rate", "bp_systolic", "bp_diastolic"] },
  { label: "Lungs & cabin", signals: ["respiratory_rate", "spo2", "cabin_co2"] },
  { label: "Blood, immunity & radiation", signals: ["temperature", "wbc", "inflammation_marker", "glucose", "cumulative_dose"] },
  { label: "Bones & muscles", signals: ["body_mass"] },
  { label: "Kidneys", signals: ["urine_blood", "pain"] },
];

export function EvolutionScreen() {
  const { data, idx, crewId, setCrewId, day, setDay, minDay, maxDay, failedSources } = useApp();
  const [signal, setSignal] = useState("sleep");
  const [projectTo, setProjectTo] = useState(180);
  const [crewMean, setCrewMean] = useState(false);
  const [periodA, setPeriodA] = useState<[number, number]>([0, 6]);
  const [periodB, setPeriodB] = useState<[number, number]>([49, 55]);

  const series = idx.get(crewId)?.get(signal) ?? [];
  const meta = SIGNALS[signal];
  const baseline = data.baselines.baselines[crewId]?.[signal];
  const unit = series[0]?.unit ?? baseline?.unit ?? "";

  const points: ChartPoint[] = useMemo(() => series.map((o) => ({
    day: o.day, value: o.value, estimated: o.method === "estimated",
    status: evaluateSignal(idx, data.baselines, crewId, signal, o.day, { failedSources }).status,
  })), [series, idx, data, crewId, signal, failedSources]);

  const overlay = useMemo(() => {
    if (!crewMean) return undefined;
    const byDay = new Map<number, number[]>();
    for (const c of CREW) for (const o of idx.get(c.id)?.get(signal) ?? []) {
      const a = byDay.get(o.day) ?? []; a.push(o.value); byDay.set(o.day, a);
    }
    return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([d, v]) => ({ day: d, value: v.reduce((x, y) => x + y, 0) / v.length }));
  }, [crewMean, idx, signal]);

  const bad = meta?.direction === "high" ? "high" : meta?.direction === "low" ? "low" : meta?.direction === "none" ? "none" : "both";
  const trend = trendAt(series, day, signal === "cumulative_dose" ? 30 : 14, projectTo, bad);
  const latest = [...series].reverse().find((o) => o.day <= day);
  const events = data.observations.demo_events.filter((e) => e.crew === crewId).map((e) => ({ from: e.days[0], to: e.days[1], label: e.label.split("(")[0].trim() }));
  const a = meanOf(series, periodA[0], periodA[1]);
  const b = meanOf(series, periodB[0], periodB[1]);
  const dec = meta?.decimals ?? 1;

  // only project real trends (or accumulating quantities): projecting a stable series just extrapolates noise
  const showProjection = !!trend.projection && (trend.direction === "worsening" || trend.direction === "improving" || signal === "cumulative_dose");
  const projection = showProjection && latest && trend.projection ? { fromDay: latest.day, fromValue: latest.value, ...trend.projection } : null;

  return (
    <div className="grid evo-grid">
      <Card title="Evolution" subtitle="Before flight, in flight and the trend. Click the chart to move the mission day."
        actions={<Segmented value={crewId} onChange={setCrewId} options={CREW.map((c) => ({ value: c.id, label: c.id }))} />}>
        <div className="signal-picker">
          {GROUPS.map((g) => (
            <div key={g.label} className="sp-group">
              <span className="tiny muted">{g.label}</span>
              <div className="row wrap gap-s">
                {g.signals.map((s) => (
                  <button key={s} className={`chip ${s === signal ? "on" : ""}`} onClick={() => setSignal(s)}>{signalLabel(s)}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {series.length === 0 ? <p className="muted">No data for this signal.</p> : (
          <EvolutionChart
            points={points}
            minDay={minDay}
            maxDay={maxDay}
            preMean={baseline && meta?.direction !== "none" ? baseline.pre_mean : null}
            band={baseline && !meta?.absoluteOnly && meta?.direction !== "none" ? [baseline.band_min, baseline.band_max] : null}
            events={events}
            cursorDay={day}
            projection={projection}
            overlay={overlay}
            overlayLabel="crew mean (anonymous)"
            unit={unit}
            decimals={dec}
            onPick={(d) => setDay(d)}
          />
        )}
        <div className="row wrap gap">
          <label className="check"><input type="checkbox" checked={crewMean} onChange={(e) => setCrewMean(e.target.checked)} /> Compare with the crew mean (opt-in, anonymous)</label>
          <label className="field inline"><span>Project to day</span>
            <input type="number" value={projectTo} min={day + 1} max={1000} onChange={(e) => setProjectTo(Number(e.target.value) || day + 1)} style={{ width: 80 }} />
          </label>
        </div>
      </Card>

      <div className="stack">
        <Card title={signalLabel(signal)} subtitle={meta?.how}>
          <div className="stats">
            <Stat label="Before flight" value={baseline ? `${formatValue(signal, baseline.pre_mean)} ${unit}` : "—"} hint={baseline ? `n = ${baseline.pre_n}` : undefined} />
            <Stat label={`Now (day ${latest?.day ?? "—"})`} value={latest ? `${formatValue(signal, latest.value)} ${unit}` : "—"} />
            <Stat label="Expected in flight" value={baseline && !meta?.absoluteOnly ? `${formatValue(signal, baseline.band_min)}–${formatValue(signal, baseline.band_max)}` : "rule-based"}
              hint={baseline && !baseline.band_reliable ? "few data: wide band" : undefined} />
          </div>
          {meta?.expectedInFlight && <p className="small"><Tag tone="info">evidence</Tag> {meta.expectedInFlight}</p>}
          {latest && baseline && (
            <p className="small">
              Before flight {formatValue(signal, baseline.pre_mean)} · Now {formatValue(signal, latest.value)} → {
                evaluateSignal(idx, data.baselines, crewId, signal, day, { failedSources }).reason
              }
            </p>
          )}
        </Card>
        <Card title="Rate of change" subtitle={`Last ${trend.windowDays} days in flight`}>
          {trend.slopePerWeek === null ? <p className="muted">Not enough in-flight data yet.</p> : (
            <>
              <p>
                <b>{trend.slopePerWeek >= 0 ? "+" : ""}{trend.slopePerWeek.toFixed(dec + 1)} {unit}/week</b>
                {trend.slopePctPerWeek !== null && <span className="muted"> ({trend.slopePctPerWeek >= 0 ? "+" : ""}{trend.slopePctPerWeek.toFixed(1)}%/week)</span>}
              </p>
              <p>
                <StatusPill status={trend.direction === "worsening" ? "amber" : trend.direction === "stable" ? "green" : trend.direction === "improving" ? "green" : "silent"}>
                  {trend.direction}
                </StatusPill>
                {trend.accelerating && <Tag tone="warn">accelerating</Tag>}
              </p>
              {!showProjection && <p className="small muted">Stable: no projection (it would only extrapolate day-to-day noise).</p>}
              {showProjection && trend.projection && (
                <p className="small">
                  Estimate if nothing changes, day {trend.projection.day}: <b>{formatValue(signal, trend.projection.value)} {unit}</b>{" "}
                  <span className="muted">(range {formatValue(signal, trend.projection.low)}–{formatValue(signal, trend.projection.high)})</span>
                  {signal === "cumulative_dose" && <> · <b>{Math.round((trend.projection.value / 600) * 100)}%</b> of the 600 mSv career limit</>}
                </p>
              )}
              <p className="tiny muted">Projections are not medical predictions. With few weeks of data the uncertainty is large and shown as a band.</p>
            </>
          )}
        </Card>
        <Card title="Compare periods">
          <div className="row gap wrap">
            <PeriodInput label="A" value={periodA} onChange={setPeriodA} />
            <PeriodInput label="B" value={periodB} onChange={setPeriodB} />
          </div>
          <div className="stats">
            <Stat label={`A · days ${periodA[0]}–${periodA[1]}`} value={a ? `${a.mean.toFixed(dec)} ${unit}` : "—"} hint={a ? `n = ${a.n}` : undefined} />
            <Stat label={`B · days ${periodB[0]}–${periodB[1]}`} value={b ? `${b.mean.toFixed(dec)} ${unit}` : "—"} hint={b ? `n = ${b.n}` : undefined} />
            <Stat label="Change" value={a && b ? `${b.mean - a.mean >= 0 ? "+" : ""}${(b.mean - a.mean).toFixed(dec)} ${unit}` : "—"} />
          </div>
          <p className="tiny muted">Previous-mission comparison appears when a repeat flyer has data from an earlier mission (none in this synthetic set).</p>
        </Card>
      </div>
    </div>
  );
}

function PeriodInput({ label, value, onChange }: { label: string; value: [number, number]; onChange: (v: [number, number]) => void }) {
  return (
    <label className="field inline">
      <span>{label}</span>
      <input type="number" value={value[0]} onChange={(e) => onChange([Number(e.target.value), value[1]])} style={{ width: 64 }} />
      <span>to</span>
      <input type="number" value={value[1]} onChange={(e) => onChange([value[0], Number(e.target.value)])} style={{ width: 64 }} />
    </label>
  );
}
