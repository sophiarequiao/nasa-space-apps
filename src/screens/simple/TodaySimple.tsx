// "Today" for crew members who are not doctors, laid out like a health monitor:
// what to do on the left, the body in the centre, a few vital trends on the right.
import { useMemo } from "react";
import { useApp } from "../../state/AppState";
import { HealthBody3D } from "../../components/body/HealthBody3D";
import { VitalCard } from "../../components/VitalCard";
import type { RegionId, Status } from "../../types";
import { REGION_SHORT, STATUS_WORDS, priority, regionActions, regionSentence } from "../../engine/plain";
import { latestAt } from "../../engine/status";

export function TodaySimple() {
  const { data, crewId, day, statusFor, selectedRegion, setSelectedRegion, setScreen, setIncidentCardId, idx } = useApp();
  const status = statusFor(crewId, day);
  const colours = useMemo(() => {
    const m: Partial<Record<RegionId, Status>> = {};
    for (const [k, v] of Object.entries(status)) m[k as RegionId] = v.status;
    return m;
  }, [status]);
  const regions = [...data.regions].sort((a, b) => priority(status[a.id].status) - priority(status[b.id].status));
  const red = regions.filter((r) => status[r.id].status === "red");
  const amber = regions.filter((r) => status[r.id].status === "amber");
  const grey = regions.filter((r) => status[r.id].status === "silent");
  const urgentCard = red.length ? data.cards.find((c) => c.region === red[0].id) : undefined;
  const sel = selectedRegion ? data.regions.find((r) => r.id === selectedRegion) : undefined;
  const messageToday = latestAt(idx.get(crewId)?.get("message_duration"), day)?.day === day;

  const headline = red.length ? "Needs action now" : amber.length ? "Keep an eye on it" : "All good today";
  const overall: Status = red.length ? "red" : amber.length ? "amber" : "green";
  const todo = [...red, ...amber].flatMap((r) => regionActions(r.id, status[r.id].status).map((a) => ({ region: r.id, text: a }))).slice(0, 4);

  return (
    <div className="monitor">
      <aside className="mon-col">
        {sel ? (
          <section className="glass">
            <div className="g-head">
              <span className="g-title">{REGION_SHORT[sel.id]}</span>
              <button className="g-close" onClick={() => setSelectedRegion(null)} aria-label="Close">Close</button>
            </div>
            <span className={`badge b-${status[sel.id].status}`}>{STATUS_WORDS[status[sel.id].status]}</span>
            <p className="g-text">{regionSentence(status[sel.id])}</p>
            {regionActions(sel.id, status[sel.id].status).length > 0 && (
              <>
                <p className="g-label">What to do</p>
                <ul className="g-list">{regionActions(sel.id, status[sel.id].status).map((a) => <li key={a}>{a}</li>)}</ul>
              </>
            )}
            <p className="g-label">Why it matters in space</p>
            <p className="g-small">{sel.space_effect}</p>
          </section>
        ) : (
          <section className={`glass g-status g-${overall}`}>
            <p className="g-label">{crewId} today</p>
            <h2>{headline}</h2>
            {red.concat(amber).slice(0, 3).map((r) => (
              <button key={r.id} className="g-row" onClick={() => setSelectedRegion(r.id)}>
                <span className={`dotc d-${status[r.id].status}`} />
                <span><b>{REGION_SHORT[r.id]}</b><span className="g-sub">{regionSentence(status[r.id])}</span></span>
              </button>
            ))}
            {urgentCard && (
              <button className="g-btn g-btn-red" onClick={() => { setIncidentCardId(urgentCard.id); setScreen("incident"); }}>Get help now</button>
            )}
          </section>
        )}

        {todo.length > 0 && (
          <section className="glass">
            <p className="g-title">To do today</p>
            <ol className="g-steps">{todo.map((t) => <li key={t.text} onClick={() => setSelectedRegion(t.region)}>{t.text}</li>)}</ol>
          </section>
        )}

        <section className="glass">
          <p className="g-title">Daily message</p>
          <p className="g-text">{messageToday ? "Done today." : "Not recorded yet today."}</p>
          {!messageToday && <button className="g-btn" onClick={() => setScreen("message")}>Record now</button>}
        </section>

        {grey.length > 0 && (
          <section className="glass">
            <p className="g-title">Not checked recently</p>
            {grey.map((r) => (
              <button key={r.id} className="g-row" onClick={() => setSelectedRegion(r.id)}>
                <span className="dotc d-silent" />
                <span><b>{REGION_SHORT[r.id]}</b><span className="g-sub">{regionActions(r.id, "silent")[0]}</span></span>
              </button>
            ))}
          </section>
        )}
      </aside>

      <section className="mon-stage">
        <div className="stage-grid" aria-hidden />
        <HealthBody3D
          modelUrl={`${import.meta.env.BASE_URL}geometries/human_body.glb`}
          regionStatus={colours}
          selected={selectedRegion}
          onSelect={(r) => setSelectedRegion(r === selectedRegion ? null : r)}
          neutral
          markers
          transparent
          height={640}
        />
        <div className="stage-ring" aria-hidden />
        <div className="stage-legend">
          <span><i className="dotc d-amber" /> Keep an eye on it</span>
          <span><i className="dotc d-red" /> Needs action</span>
          <span><i className="dotc d-silent" /> Not checked</span>
          <span className="muted">Drag to turn · tap a part</span>
        </div>
      </section>

      <aside className="mon-col">
        <VitalCard signal="heart_rate" title="Heart rate" />
        <VitalCard signal="bp_systolic" second="bp_diastolic" title="Blood pressure" />
        <VitalCard signal="temperature" title="Temperature" />
        <VitalCard signal="sleep" title="Sleep" />
      </aside>
    </div>
  );
}
