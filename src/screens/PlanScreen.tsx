// Mission plan: adaptive monitoring level, silent tests before a blackout and process-based
// gamification (rewards doing the tests on time, never "feeling well").
import { useState } from "react";
import { useApp, CREW } from "../state/AppState";
import { Card, ProgressBar, StatusPill, Tag } from "../components/ui";
import { LEVEL_LABEL, LEVEL_STATUS, monitoringPlan, readiness } from "../engine/monitoring";
import { formatDuration } from "../engine/link";
import type { RegionId } from "../types";

export function PlanScreen() {
  const { data, idx, day, statusFor, blackout, profile, crewId, setCrewId, link } = useApp();
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [honesty, setHonesty] = useState<Record<string, boolean>>({});
  const crew = CREW.map((c) => {
    const st = statusFor(c.id, day);
    const silent = (Object.keys(st) as RegionId[]).filter((r) => st[r].status === "silent");
    return { ...c, st, plan: monitoringPlan(st, blackout?.startsInDays ?? null), ready: readiness(idx, c.id, day, silent), silent };
  });
  const allUpToDate = crew.every((c) => c.ready.percent >= 80);
  const me = crew.find((c) => c.id === crewId)!;
  const missions = [
    { id: "silent3", title: "The 3 silent tests before the blackout", items: ["OCT / vision test", "Neck ultrasound", "Kidney ultrasound"] },
    { id: "audit", title: "Medical kit audit", items: ["Count analgesics", "Check urine dipsticks", "Check device batteries"] },
    { id: "msg7", title: "7 daily messages in a row", items: [] },
  ];

  return (
    <div className="grid plan-grid">
      <Card title="Adaptive monitoring" subtitle="Continuous where it is free, more intensive only when it is needed.">
        <table className="tbl">
          <thead><tr><th>Crew</th><th>Level</th><th>Why</th></tr></thead>
          <tbody>
            {crew.map((c) => (
              <tr key={c.id}>
                <td><b>{c.id}</b><div className="tiny muted">{c.role}</div></td>
                <td><StatusPill status={LEVEL_STATUS[c.plan.level]}>{LEVEL_LABEL[c.plan.level]}</StatusPill></td>
                <td className="small">{c.plan.reasons.join(" · ")}<ul className="tiny muted">{c.plan.actions.map((a) => <li key={a}>{a}</li>)}</ul></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="tiny muted">Wearing sensors all the time is a burden, and measuring everything always creates false alarms. When the danger passes, the level goes back to routine.</p>
      </Card>

      <div className="stack">
        <Card title="Communications blackouts" subtitle={profile.name}>
          {blackout ? (
            <>
              <p><b>{blackout.startsInDays === 0 ? "No link now" : `Next blackout in ${blackout.startsInDays} days`}</b> · {blackout.start} · {blackout.lengthDays} days · {blackout.reason}</p>
              {blackout.startsInDays <= 14 && <p className="banner warn small">Bring the silent tests forward: OCT, neck and kidney ultrasound while Earth can still review them.</p>}
            </>
          ) : <p className="muted">No blackout expected in the next months on this profile.</p>}
          <p className="tiny muted">Mars: solar conjunction from the team's JPL-based link table (e.g. 17 days from 13 March 2028). Moon without relay: half-month visibility model. Delay now: {formatDuration(link.owltS / 60)} one way.</p>
        </Card>

        <Card title="Mission readiness" subtitle="Rewards doing the tests on time, never the results."
          actions={<select value={crewId} onChange={(e) => setCrewId(e.target.value as typeof crewId)}>{CREW.map((c) => <option key={c.id}>{c.id}</option>)}</select>}>
          <div className="row between"><span>{me.id} readiness</span><b>{me.ready.percent}%</b></div>
          <ProgressBar value={me.ready.percent} status={me.ready.percent >= 80 ? "green" : me.ready.percent >= 50 ? "amber" : "red"} />
          <p className="small">Message streak: <b>{me.ready.streakDays} days</b></p>
          {me.ready.missing.length > 0 && <p className="tiny muted">Missing or late: {[...new Set(me.ready.missing)].join(", ")}</p>}
          <div className="row between small"><span>Crew goal: everyone at 80% or more</span>{allUpToDate ? <Tag tone="info">achieved</Tag> : <Tag>in progress</Tag>}</div>
          <div className="crew-bars">
            {crew.map((c) => <div key={c.id} className="tiny"><span>{c.id}</span><ProgressBar value={c.ready.percent} status={c.ready.percent >= 80 ? "green" : "amber"} /></div>)}
          </div>
          <p className="tiny muted">No individual rankings: rewarding "feeling well" would encourage hiding symptoms.</p>
        </Card>

        <Card title="Weekly missions">
          {missions.map((m) => (
            <div key={m.id} className="mission">
              <b>{m.title}</b>
              {m.items.length ? m.items.map((it) => {
                const k = `${m.id}:${it}`;
                return <label key={k} className="check"><input type="checkbox" checked={!!done[k]} onChange={(e) => setDone({ ...done, [k]: e.target.checked })} /> {it}</label>;
              }) : <ProgressBar value={Math.min(100, (me.ready.streakDays / 7) * 100)} />}
            </div>
          ))}
          <div className="mission">
            <b>Honesty badge</b>
            {crew.filter((c) => c.st.brain.discordance).map((c) => (
              <div key={c.id} className="small">
                {c.id}: {c.st.brain.discordance}
                <div><button className="btn sm" disabled={honesty[c.id]} onClick={() => setHonesty({ ...honesty, [c.id]: true })}>{honesty[c.id] ? "Badge earned: answer reviewed" : "Review my answer"}</button></div>
              </div>
            ))}
            {!crew.some((c) => c.st.brain.discordance) && <p className="tiny muted">Earned by reviewing your answer when the app detects a discordance (try mission day 33).</p>}
          </div>
          <p className="tiny muted">{data.regions.length} regions tracked; silent regions add tasks.</p>
        </Card>
      </div>
    </div>
  );
}
