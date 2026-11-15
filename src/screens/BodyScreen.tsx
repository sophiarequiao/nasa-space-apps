// 3D body with the four colours, silent zones, region cards, Before/Now tab and the
// body time machine (the whole mission in 10 seconds).
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp, CREW } from "../state/AppState";
import { HealthBody3D } from "../components/body/HealthBody3D";
import { RegionDetail } from "../components/RegionDetail";
import { Card, Segmented, StatusDot, StatusPill } from "../components/ui";
import type { RegionId, Status } from "../types";
import { STATUS_LABEL } from "../engine/signals";

export function BodyScreen() {
  const { data, crewId, setCrewId, day, setDay, minDay, maxDay, statusFor, selectedRegion, setSelectedRegion } = useApp();
  const [compare, setCompare] = useState<"now" | "before">("now");
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | null>(null);
  const status = statusFor(crewId, day);
  const colours = useMemo(() => {
    const m: Partial<Record<RegionId, Status>> = {};
    for (const [k, v] of Object.entries(status)) m[k as RegionId] = v.status;
    return m;
  }, [status]);
  const region = data.regions.find((r) => r.id === (selectedRegion ?? worstRegion(status)));

  // time machine: 90 days in ~10 s
  useEffect(() => {
    if (!playing) return;
    let d = day >= maxDay ? minDay : day;
    timer.current = window.setInterval(() => {
      d += 1;
      if (d > maxDay) { setPlaying(false); return; }
      setDay(d);
    }, 10000 / (maxDay - minDay + 1));
    return () => { if (timer.current) window.clearInterval(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const event = data.observations.demo_events.find((e) => e.crew === crewId && day >= e.days[0] && day <= e.days[1]);

  return (
    <div className="grid body-grid">
      <Card className="body-card" title={`Body · ${crewId}`} subtitle={`${CREW.find((c) => c.id === crewId)?.role} · ${day < 0 ? `${-day} days before launch` : `mission day ${day}`}`}
        actions={
          <Segmented value={crewId} onChange={setCrewId} options={CREW.map((c) => ({ value: c.id, label: c.id }))} />
        }>
        <HealthBody3D
          modelUrl={`${import.meta.env.BASE_URL}geometries/human_body.glb`}
          regionStatus={colours}
          selected={selectedRegion}
          onSelect={(r) => setSelectedRegion(r === selectedRegion ? null : r)}
          height={480}
        />
        <div className="legend">
          {(["green", "amber", "red", "silent"] as Status[]).map((s) => (
            <span key={s}><StatusDot status={s} /> {STATUS_LABEL[s]}</span>
          ))}
        </div>
        <div className="region-chips">
          {data.regions.map((r) => (
            <button key={r.id} className={`chip ${selectedRegion === r.id ? "on" : ""}`} onClick={() => setSelectedRegion(r.id)}>
              <StatusDot status={status[r.id].status} size={10} /> {r.name}{!r.spatial && <span className="muted tiny"> (whole body)</span>}
            </button>
          ))}
        </div>
        <div className="time-machine">
          <button className="btn" onClick={() => setPlaying((p) => !p)}>{playing ? "❚❚ Pause" : "▶ Play the mission"}</button>
          <input type="range" min={minDay} max={maxDay} value={day} onChange={(e) => setDay(Number(e.target.value))} aria-label="Time machine" />
          <span className="day-num">{day < 0 ? `L${day}` : `D${day}`}</span>
        </div>
        {event && <p className="event-note">Demo event: {event.label} (synthetic)</p>}
        <p className="muted tiny">Drag to rotate. Click a region. Colour = worst of its signals compared with this person's own baseline.</p>
      </Card>

      <Card title="Region card" actions={<Segmented value={compare} onChange={setCompare} options={[{ value: "now", label: "Now" }, { value: "before", label: "Before / Now" }]} />}>
        {region ? <RegionDetail region={region} rs={status[region.id]} compare={compare} /> : <p>Select a region.</p>}
        <div className="mini-status">
          <span className="muted small">Overall:</span> <StatusPill status={worstStatus(status)} />
        </div>
      </Card>
    </div>
  );
}

function worstRegion(status: Record<RegionId, { status: Status }>): RegionId {
  const order: Status[] = ["red", "amber", "silent", "green"];
  for (const s of order) {
    const r = (Object.keys(status) as RegionId[]).find((k) => status[k].status === s);
    if (r) return r;
  }
  return "brain";
}

function worstStatus(status: Record<RegionId, { status: Status }>): Status {
  const vals = Object.values(status).map((r) => r.status);
  return vals.includes("red") ? "red" : vals.includes("amber") ? "amber" : vals.every((v) => v === "silent") ? "silent" : "green";
}
