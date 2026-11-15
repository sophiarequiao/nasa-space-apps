// Incident: symptom -> compatible condition card -> actions now -> resources (green/red)
// -> authority dial -> countdown -> summary to Earth (< 2 kB). Never a diagnosis.
import { useEffect, useMemo, useState } from "react";
import { useApp, CREW } from "../state/AppState";
import { Card, DeciderPill, ExtLink, Segmented, StatusDot, Tag } from "../components/ui";
import { AuthorityDial } from "../components/charts";
import { computeAuthority } from "../engine/authority";
import { conditionCapabilities } from "../engine/resources";
import { formatDuration, getLink } from "../engine/link";
import { signalLabel, withUnit } from "../engine/signals";
import type { ConditionCard } from "../types";

const VITALS = ["heart_rate", "bp_systolic", "temperature", "respiratory_rate", "spo2"];

export function IncidentScreen() {
  const app = useApp();
  const { data, crewId, setCrewId, day, statusFor, link, profile, incidentCardId, setIncidentCardId, itemStates, date, linkCtx } = app;
  const card = data.cards.find((c) => c.id === incidentCardId) ?? data.cards[0];
  const status = statusFor(crewId, day);
  const auth = computeAuthority(card, link, data.assumptions);
  const caps = conditionCapabilities([card], data.capabilities, itemStates)[0];
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [sent, setSent] = useState<{ at: number; arrive: number } | null>(null);
  const [showProtocol, setShowProtocol] = useState(false);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);
  useEffect(() => { setStartedAt(null); setSent(null); }, [incidentCardId, crewId]);

  const suggested = useMemo(() => {
    const red = Object.values(status).filter((r) => r.status === "red").map((r) => r.region);
    const amber = Object.values(status).filter((r) => r.status === "amber").map((r) => r.region);
    return new Set(data.cards.filter((c) => red.includes(c.region) || (amber.includes(c.region) && c.region === "brain")).map((c) => c.id));
  }, [status, data.cards]);

  const regionSignals = status[card.region]?.signals.filter((s) => s.value !== null && s.status !== "silent") ?? [];
  const vitalSignals = VITALS.map((v) => {
    const r = Object.values(status).flatMap((x) => x.signals).find((s) => s.signal === v);
    return r;
  }).filter((s): s is NonNullable<typeof s> => !!s && s.value !== null && !regionSignals.some((x) => x.signal === s.signal));

  // same decision on every mission profile, same date
  const byProfile = data.profiles.filter((p) => p.id !== "analog").map((p) => {
    const l = getLink(date, p, linkCtx);
    return { p, l, a: computeAuthority(card, l, data.assumptions) };
  });

  const elapsedMin = startedAt ? (now - startedAt) / 60000 : 0;
  const summary = buildSummary(card, crewId, day, date, profile.short, [...regionSignals, ...vitalSignals].map((s) => `${signalLabel(s.signal)} ${withUnit(s.signal, s.value as number, s.unit)}`),
    caps.caps.filter((c) => !c.available).map((c) => c.capability.name), auth.decider, startedAt);
  const bytes = new TextEncoder().encode(summary).length;
  const arriveMs = (link.waitMin + (bytes * 8) / 1000 / link.rateKbps / 60 + link.owltS / 60) * 60000;

  return (
    <div className="grid incident-grid">
      <div className="stack">
        <Card title="1 · What is happening?" subtitle="Pick the crew member and the symptom. Cards suggested from today's data are marked.">
          <Segmented value={crewId} onChange={setCrewId} options={CREW.map((c) => ({ value: c.id, label: c.id }))} />
          <div className="symptoms">
            {data.cards.map((c) => (
              <button key={c.id} className={`symptom ${c.id === card.id ? "on" : ""}`} onClick={() => setIncidentCardId(c.id)}>
                <span>{c.symptom}</span>
                {suggested.has(c.id) && <Tag tone="warn">suggested by data</Tag>}
                {c.silent && <Tag>silent</Tag>}
              </button>
            ))}
          </div>
        </Card>

        <Card title={`2 · Signals compatible with: ${card.name}`} subtitle="This is not a diagnosis. A person decides." actions={<Tag tone="warn">{card.status}</Tag>}>
          {regionSignals.length + vitalSignals.length === 0 && <p className="muted">No data today for this region. Measure first: {card.onboard_tools.join(", ")}.</p>}
          <ul className="sig-list">
            {[...regionSignals, ...vitalSignals].map((s) => (
              <li key={s.signal}><StatusDot status={s.status} size={10} /> <b>{signalLabel(s.signal)}</b>: {withUnit(s.signal, s.value as number, s.unit)} <span className="muted tiny">· {s.reason}</span></li>
            ))}
          </ul>
          <p className="tiny muted">Basis: {card.nasa_basis}</p>
        </Card>

        <Card title="3 · Actions now (no-regret)" subtitle="Safe to do before anyone answers.">
          <ol className="actions">
            {card.no_regret.map((a, i) => <li key={i}>{a}</li>)}
          </ol>
          <p className="small"><b>Red flags:</b> {card.red_flags.join(" · ")}</p>
          {card.protocol && (
            <>
              <button className="btn ghost sm" onClick={() => setShowProtocol((s) => !s)}>{showProtocol ? "Hide" : "Show"} sample protocol</button>
              {showProtocol && <ProtocolView card={card} />}
            </>
          )}
        </Card>

        <Card title="4 · Resources on board" subtitle="Protocol × real inventory. Capability = resources × link × person.">
          <ul className="cap-list">
            {caps.caps.map((c) => (
              <li key={c.capability.name} className={c.available ? "" : "lost"}>
                <StatusDot status={c.available ? "green" : c.capability.kind === "treatment" ? "red" : "red"} />
                <div>
                  <b>{c.capability.name}</b> <Tag>{c.capability.kind}</Tag>
                  <div className="tiny muted">
                    {(c.capability.all_of ?? c.capability.any_of ?? []).map((id) => {
                      const st = itemStates.get(id);
                      return st ? <span key={id} className={st.available ? "" : "strike"}>{st.item.name} ({st.quantity}){" "}</span> : null;
                    })}
                  </div>
                  {!c.available && <div className="lost-note">Capability lost{c.capability.name.toLowerCase().includes("urine") ? ": cannot rule out infection" : ""}</div>}
                </div>
              </li>
            ))}
            <li>
              <StatusDot status={auth.liveGuidancePossible ? "green" : "amber"} />
              <div>
                <b>Live guidance from Earth</b> <Tag>link</Tag>
                <div className="tiny muted">{auth.liveGuidancePossible ? "Possible: round trip ≤ 3 s" : `Not possible with ${formatDuration(link.rttS / 60)} round trip → onboard guide + delayed review`}</div>
              </div>
            </li>
          </ul>
        </Card>
      </div>

      <div className="stack">
        <Card title="5 · Who decides?" subtitle={`${profile.name} · ${date}`} actions={<DeciderPill decider={auth.decider} />}>
          <AuthorityDial A={auth.A} decider={auth.decider} earth={data.assumptions.earth_threshold} crew={data.assumptions.crew_threshold} />
          <p className="explain">{auth.explanation}</p>
          <table className="tbl compact">
            <tbody>
              <tr><td>Wait for link window</td><td>{formatDuration(auth.breakdown.waitMin)}</td></tr>
              <tr><td>Send packet ({auth.packetKB} kB at {link.rateKbps.toFixed(0)} kbps)</td><td>{formatDuration(auth.breakdown.txMin)}</td></tr>
              <tr><td>Light time, there and back</td><td>{formatDuration(auth.breakdown.lightMin)}</td></tr>
              <tr><td>Flight surgeon reads and answers (assumption)</td><td>{formatDuration(auth.breakdown.groundMin)}</td></tr>
              <tr className="total"><td>Earth's answer arrives in</td><td>{formatDuration(auth.tEarthMin)}</td></tr>
              <tr><td>Time available (T_crit, provisional)</td><td>{formatDuration(card.t_crit_min)}</td></tr>
            </tbody>
          </table>
          <p className="tiny muted">Best mode with Earth: {auth.mode}. T_crit basis: {card.t_crit_basis}</p>
        </Card>

        <Card title="6 · Countdown">
          {!startedAt ? (
            <button className="btn primary" onClick={() => setStartedAt(Date.now())}>Start incident clock</button>
          ) : (
            <div className="countdown">
              <Bar label="Time available" total={card.t_crit_min} used={elapsedMin} status="red" />
              <Bar label="Earth's answer" total={auth.tEarthMin} used={elapsedMin} status="green" />
              <p className="small">Started {new Date(startedAt).toLocaleTimeString()} · elapsed {formatDuration(elapsedMin)}</p>
              {auth.decider === "SHARED" && <p className="small"><b>Checkpoint</b> at {new Date(startedAt + auth.tEarthMin * 60000).toLocaleTimeString()}: act on Earth's answer, or earlier if a red flag appears.</p>}
              {auth.decider === "CREW" && <p className="small"><b>Crew leads.</b> Log every step; Earth reviews afterwards.</p>}
            </div>
          )}
        </Card>

        <Card title="7 · Summary to Earth" subtitle={`SBAR text · ${bytes} bytes ${bytes < 2048 ? "(under 2 kB)" : "(over 2 kB!)"}`}>
          <pre className="sbar">{summary}</pre>
          {!sent ? (
            <button className="btn primary" onClick={() => setSent({ at: Date.now(), arrive: Date.now() + arriveMs })}>
              {link.hasLink ? "Send summary to Earth" : "Queue for the next window"}
            </button>
          ) : (
            <p className="small">
              {link.hasLink ? "Sent" : "Queued until the link returns"} at {new Date(sent.at).toLocaleTimeString()} · arrives on Earth in <b>{formatDuration(Math.max(0, (sent.arrive - now) / 60000))}</b>. The crew member approves what is shared.
            </p>
          )}
        </Card>

        <Card title="Same incident, every mission" subtitle={`Same card on ${date}`}>
          <table className="tbl compact">
            <thead><tr><th>Mission</th><th>Earth answers in</th><th>A</th><th>Who decides</th></tr></thead>
            <tbody>
              {byProfile.map(({ p, l, a }) => (
                <tr key={p.id} className={p.id === profile.id ? "current" : ""}>
                  <td>{p.short}{!l.hasLink && <span className="tiny muted"> · no link</span>}</td>
                  <td>{formatDuration(a.tEarthMin)}</td>
                  <td>{a.A < 10 ? a.A.toFixed(2) : a.A.toFixed(0)}</td>
                  <td><DeciderPill decider={a.decider} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

function Bar({ label, total, used, status }: { label: string; total: number; used: number; status: "red" | "green" }) {
  const left = Math.max(0, total - used);
  return (
    <div className="cd-bar">
      <div className="row between small"><span>{label}</span><b>{left > 0 ? `${formatDuration(left)} left` : status === "green" ? "arrived" : "time is up"}</b></div>
      <div className="progress"><div className={`progress-fill fill-${status === "red" ? "red" : "green"}`} style={{ width: `${Math.min(100, (used / total) * 100)}%` }} /></div>
    </div>
  );
}

function ProtocolView({ card }: { card: ConditionCard }) {
  const p = card.protocol!;
  const rows: [string, string][] = [
    ["What it is", p.what_it_is], ["Why in space", p.why_in_space], ["Symptoms", p.symptoms], ["Signals in the app", p.app_signals],
    ["Tests on board", p.onboard_tests], ["Actions now", p.actions_now], ["Red flags", p.red_flags], ["Drugs (no doses)", p.drugs],
    ["Supplies", p.supplies], ["When to involve Earth", p.when_earth], ["When to evacuate", p.when_evacuate], ["Time basis", p.t_crit_basis],
  ];
  return (
    <div className="protocol">
      <p className="banner warn small">SAMPLE protocol written from public guidelines by the team's health lead. NASA protocols are not public; a real mission would load its own. {p.status}.</p>
      <dl>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <p className="tiny">Sources: {p.sources.map((s) => <ExtLink key={s.url} href={s.url}>{s.label}</ExtLink>)}</p>
    </div>
  );
}

function buildSummary(card: ConditionCard, crew: string, day: number, date: string, mission: string, signals: string[], lost: string[], decider: string, startedAt: number | null): string {
  const lines = [
    `SOSpesAI SBAR | ${mission} | ${date} (mission day ${day}) | ${crew}`,
    `S: Signals compatible with ${card.name.toLowerCase()}${startedAt ? `, onset logged ${new Date(startedAt).toISOString().slice(11, 16)} UTC` : ""}.`,
    `B: ${signals.slice(0, 8).join("; ") || "no data today"}.`,
    `A: Not a diagnosis. Capabilities lost: ${lost.length ? lost.join(", ") : "none"}. Authority: ${decider}.`,
    `R: No-regret actions started: ${card.no_regret.join("; ")}. Request review and protocol confirmation.`,
  ];
  return lines.join("\n");
}

