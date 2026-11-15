// Simulator: mission profile + scenario + date (+ optional device failures) and see how the
// app responds. For crew training on Earth, testing with the medical team, and the live demo.
import { useState } from "react";
import { useApp } from "../state/AppState";
import { Card, DeciderPill, Segmented, StatusPill, Tag } from "../components/ui";
import { computeAuthority } from "../engine/authority";
import { conditionCapabilities } from "../engine/resources";
import { formatDuration } from "../engine/link";
import { radiationFor } from "../engine/radiation";
import type { CrewId } from "../types";

const PRESET_DATES = [
  { label: "Today (14 Nov 2026)", date: "2026-11-14" },
  { label: "Mars far (3 Sep 2034)", date: "2034-09-03" },
  { label: "Mars solar conjunction (13 Mar 2028)", date: "2028-03-13" },
  { label: "Moon: Earth hidden (no relay)", date: "2026-11-20" },
];

export function SimulatorScreen() {
  const app = useApp();
  const { data, profile, setProfileId, date, setDateOverride, link, itemStates, toggleUnavailable, overrides, setIncidentCardId, setCrewId, setDay, setScreen } = app;
  const [scenarioId, setScenarioId] = useState("renal_colic");
  const [filter, setFilter] = useState<"all" | "live">("all");
  const sc = data.scenarios.find((s) => s.id === scenarioId)!;
  const card = sc.card ? data.cards.find((c) => c.id === sc.card) : undefined;
  const auth = card ? computeAuthority(card, link, data.assumptions) : null;
  const caps = card ? conditionCapabilities([card], data.capabilities, itemStates)[0] : null;
  const list = data.scenarios.filter((s) => filter === "all" || s.card);
  const rad = radiationFor(data.radiation, profile.id);

  return (
    <div className="grid sim-grid">
      <Card title="Simulator" subtitle="Choose a mission profile, a scenario and a date. Combinations matter.">
        <div className="sim-controls">
          <label className="field"><span>Mission profile</span>
            <select value={profile.id} onChange={(e) => setProfileId(e.target.value)}>
              {data.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Date</span>
            <input type="date" value={date} min="2026-11-01" max="2040-12-31" onChange={(e) => setDateOverride(e.target.value || null)} />
          </label>
          <div className="row wrap gap-s">
            {PRESET_DATES.map((p) => <button key={p.date} className="chip" onClick={() => setDateOverride(p.date)}>{p.label}</button>)}
          </div>
          <div className="row wrap gap-s">
            <span className="small muted">Device failures:</span>
            {["eq_020", "eq_024", "eq_025", "mat_027"].map((id) => (
              <button key={id} className={`chip ${overrides.unavailable.has(id) ? "on danger" : ""}`} onClick={() => toggleUnavailable(id)}>
                {overrides.unavailable.has(id) ? "✕ " : ""}{data.inventory.items.find((i) => i.id === id)?.name}
              </button>
            ))}
          </div>
        </div>
        <div className="row between">
          <h4>Scenario library ({data.scenarios.length})</h4>
          <Segmented value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "live", label: "Working in the app" }]} />
        </div>
        <div className="scenario-list">
          {list.map((s) => (
            <button key={s.id} className={`scenario ${s.id === scenarioId ? "on" : ""}`} onClick={() => setScenarioId(s.id)}>
              <b>{s.name}</b>
              <span className="tiny muted">{s.category} · {s.profiles}</span>
              {s.card ? <Tag tone="info">interactive</Tag> : <Tag>design</Tag>}
            </button>
          ))}
        </div>
      </Card>

      <div className="stack">
        <Card title={sc.name} subtitle={`${sc.category} · profiles: ${sc.profiles}`}>
          <p><b>Trigger:</b> {sc.trigger}</p>
          <p><b>What the app does:</b> {sc.app_action}</p>
          <p className="tiny muted">Basis: {sc.basis}</p>
        </Card>
        <Card title="Link on this date" subtitle={`${profile.name} · ${date}`}>
          {link.hasLink
            ? <p>One way <b>{formatDuration(link.owltS / 60)}</b> · round trip {formatDuration(link.rttS / 60)} · medical data rate {link.rateKbps.toFixed(0)} kbps {link.liveGuidance ? <Tag tone="info">live guidance possible</Tag> : <Tag>no live guidance</Tag>}</p>
            : <p className="banner warn">No link: {link.noLinkReason}. Back in {formatDuration(link.waitMin)}.</p>}
          {link.distAu && <p className="tiny muted">Earth-Mars distance {link.distAu.toFixed(2)} au · Sun-Earth-Mars angle {link.sepDeg?.toFixed(1)}°</p>}
        </Card>
        {rad && (
          <Card title="Radiation on this mission" subtitle={rad.kind === "measured" ? "Measured by a NASA instrument" : rad.kind === "typical" ? "NASA's range for crews" : "NASA estimate"}>
            <p>{rad.text}</p>
            <p className="tiny muted">
              Sources: {rad.sources.map((s, i) => <span key={s.url}>{i > 0 && "; "}<a href={s.url} target="_blank" rel="noopener" title={s.title}>{s.short}</a></span>)}.
              {" "}Averages that change with shielding and the solar cycle and leave out a large solar storm. Context for the mission: it does not add up anybody's dose.
            </p>
          </Card>
        )}
        {card && auth && caps ? (
          <Card title="Response" actions={<DeciderPill decider={auth.decider} />}>
            <p>{auth.explanation}</p>
            <p className="small">Capabilities: {caps.caps.map((c) => <StatusPill key={c.capability.name} status={c.available ? "green" : "red"}>{c.capability.name}</StatusPill>)}</p>
            <button className="btn primary" onClick={() => {
              setIncidentCardId(card.id);
              if (sc.crew) setCrewId(sc.crew as CrewId);
              if (sc.day !== null) { setDay(sc.day); }
              setScreen("incident");
            }}>Open in Incident</button>
            {sc.crew && <p className="tiny muted">Opens {sc.crew} on mission day {sc.day} from the synthetic data.</p>}
          </Card>
        ) : (
          <Card title="Response"><p className="muted">This scenario is part of the library as design for the pitch; it is not interactive in the weekend prototype.</p></Card>
        )}
        <Card title="Every condition card on this date">
          <table className="tbl compact">
            <thead><tr><th>Card</th><th>T_crit</th><th>Earth answers</th><th>Decides</th></tr></thead>
            <tbody>
              {data.cards.map((c) => {
                const a = computeAuthority(c, link, data.assumptions);
                return <tr key={c.id}><td>{c.name}</td><td>{formatDuration(c.t_crit_min)}</td><td>{formatDuration(a.tEarthMin)}</td><td><DeciderPill decider={a.decider} /></td></tr>;
              })}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
