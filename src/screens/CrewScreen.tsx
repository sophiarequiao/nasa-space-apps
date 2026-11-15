// The four crew members at a glance: mini body, overall status, monitoring level and alerts.
import { useApp, CREW } from "../state/AppState";
import { Card, StatusPill, Tag } from "../components/ui";
import { MiniBody } from "../components/MiniBody";
import type { RegionId, Status } from "../types";
import { overallStatus } from "../engine/status";
import { LEVEL_LABEL, LEVEL_STATUS, monitoringPlan } from "../engine/monitoring";

export function CrewScreen() {
  const { data, day, statusFor, setCrewId, setScreen, setSelectedRegion, blackout } = useApp();
  const regionName = (id: string) => data.regions.find((r) => r.id === id)?.name ?? id;
  const all = CREW.map((c) => ({ ...c, status: statusFor(c.id, day) }));
  // crew-wide pattern: environment-driven signals affecting everyone
  const crewWide = (["brain", "lungs"] as RegionId[]).filter((r) => all.filter((c) => c.status[r].status === "amber" || c.status[r].status === "red").length >= 3);

  return (
    <>
      {crewWide.length > 0 && (
        <div className="banner warn">
          Most of the crew shows a watch signal in {crewWide.map(regionName).join(" and ")}. It is probably the mission (schedule, CO2, workload), not one person.
        </div>
      )}
      <div className="grid crew-grid">
        {all.map((c) => {
          const colours: Partial<Record<RegionId, Status>> = {};
          for (const [k, v] of Object.entries(c.status)) colours[k as RegionId] = v.status;
          const plan = monitoringPlan(c.status, blackout?.startsInDays ?? null);
          const alerts = Object.values(c.status).filter((r) => r.status === "red" || r.status === "amber");
          const silent = Object.values(c.status).filter((r) => r.status === "silent");
          return (
            <Card key={c.id} title={c.id} subtitle={c.role} actions={<StatusPill status={overallStatus(c.status)} />}>
              <div className="crew-card">
                <MiniBody status={colours} size={150} />
                <div className="crew-info">
                  <p className="small">Monitoring: <StatusPill status={LEVEL_STATUS[plan.level]}>{LEVEL_LABEL[plan.level]}</StatusPill></p>
                  {alerts.length === 0 && <p className="muted small">No watch signals today.</p>}
                  <ul className="alert-list">
                    {alerts.map((r) => (
                      <li key={r.region}>
                        <button className="linkbtn" onClick={() => { setCrewId(c.id); setSelectedRegion(r.region); setScreen("body"); }}>
                          <StatusPill status={r.status}>{regionName(r.region)}</StatusPill>
                        </button>
                        <span className="tiny muted"> {r.reasons[0]}</span>
                      </li>
                    ))}
                  </ul>
                  {silent.length > 0 && <p className="tiny muted">Silent zones: {silent.map((r) => regionName(r.region)).join(", ")}</p>}
                  {alerts.some((r) => r.discordance) && <Tag tone="warn">discordance</Tag>}
                  <div className="row gap">
                    <button className="btn sm" onClick={() => { setCrewId(c.id); setSelectedRegion(null); setScreen("body"); }}>Open body</button>
                    <button className="btn ghost sm" onClick={() => { setCrewId(c.id); setScreen("evolution"); }}>Evolution</button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <p className="muted small">Crew data are synthetic (CC0). Demo events: CM-2 days 30-36 short sleep with an optimistic self-report; CM-3 day 44 fever and high white cells; CM-4 day 52 renal colic.</p>
    </>
  );
}
