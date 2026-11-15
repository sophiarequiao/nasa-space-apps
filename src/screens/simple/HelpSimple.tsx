// "Help" for crew members who are not doctors: who, what is happening, then one clear
// screen: who decides, what to do now, what we have, when to call the medical officer.
import { useEffect, useMemo, useState } from "react";
import { useApp, CREW } from "../../state/AppState";
import { computeAuthority } from "../../engine/authority";
import { conditionCapabilities } from "../../engine/resources";
import { formatDuration } from "../../engine/link";
import { DECIDER_PLAIN } from "../../engine/plain";

export function HelpSimple() {
  const { data, crewId, setCrewId, day, statusFor, link, incidentCardId, setIncidentCardId, itemStates, setExpert, setScreen } = useApp();
  const [step, setStep] = useState<1 | 2>(2);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [sent, setSent] = useState(false);
  useEffect(() => { setDone({}); setSent(false); }, [incidentCardId, crewId]);

  const status = statusFor(crewId, day);
  const suggested = useMemo(() => new Set(data.cards.filter((c) => status[c.region]?.status === "red").map((c) => c.id)), [data.cards, status]);
  const card = data.cards.find((c) => c.id === incidentCardId) ?? data.cards[0];
  const auth = computeAuthority(card, link, data.assumptions);
  const caps = conditionCapabilities([card], data.capabilities, itemStates)[0];
  const plain = DECIDER_PLAIN[auth.decider];
  const steps = card.no_regret;
  const doneCount = steps.filter((s) => done[s]).length;

  if (step === 1) {
    return (
      <div className="simple">
        <h2>What is happening?</h2>
        <p className="muted">Who is unwell?</p>
        <div className="who">
          {CREW.map((c) => (
            <button key={c.id} className={`who-btn ${c.id === crewId ? "on" : ""}`} onClick={() => setCrewId(c.id)}>
              <b>{c.id}</b><span className="tiny">{c.role}</span>
            </button>
          ))}
        </div>
        <p className="muted">What do you notice?</p>
        <div className="tiles">
          {data.cards.map((c) => (
            <button key={c.id} className={`tile ${suggested.has(c.id) ? "tile-hint" : ""}`} onClick={() => { setIncidentCardId(c.id); setStep(2); }}>
              <b>{c.symptom}</b>
              {suggested.has(c.id) && <span className="tiny">Your data points here</span>}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="simple">
      <div className="row between wrap gap">
        <div>
          <p className="muted small">{crewId} · {card.symptom}</p>
          <h2 className="help-title">{card.name}</h2>
          <p className="tiny muted">The app does not diagnose. It helps you act; a person decides.</p>
        </div>
        <button className="btn" onClick={() => setStep(1)}>Change</button>
      </div>

      <div className={`decide decide-${auth.decider.toLowerCase()}`}>
        <h2>{plain.title}</h2>
        <p>{plain.text}</p>
        <div className="decide-times">
          <div><span>Earth answers in about</span><b>{formatDuration(auth.tEarthMin)}</b></div>
          <div><span>You have about</span><b>{formatDuration(card.t_crit_min)}</b></div>
        </div>
        {!link.hasLink && <p className="small"><b>No contact with Earth</b> for {formatDuration(link.waitMin)}.</p>}
      </div>

      <div className="help-grid">
        <section className="panel">
          <h3>Do now <span className="muted small">({doneCount}/{steps.length})</span></h3>
          {steps.map((s, i) => (
            <label key={s} className={`step ${done[s] ? "done" : ""}`}>
              <input type="checkbox" checked={!!done[s]} onChange={(e) => setDone({ ...done, [s]: e.target.checked })} />
              <span className="step-n">{i + 1}</span>
              <span>{s}</span>
            </label>
          ))}
          <div className="callout">
            <b>Call the medical officer at once if:</b>
            <ul>{card.red_flags.map((f) => <li key={f}>{f}</li>)}</ul>
          </div>
        </section>

        <section className="panel">
          <h3>What we have on board</h3>
          <ul className="have">
            {caps.caps.map((c) => (
              <li key={c.capability.name} className={c.available ? "yes" : "no"}>
                <span className={`have-mark ${c.available ? "hm-yes" : "hm-no"}`} />
                <span>
                  {c.capability.name}
                  {!c.available && <span className="tiny"> — missing: {c.missing.map((id) => itemStates.get(id)?.item.name).join(", ")}</span>}
                </span>
              </li>
            ))}
            {!auth.liveGuidancePossible && (
              <li className="no"><span className="have-mark hm-no" /><span>Live video guidance from Earth <span className="tiny">— too far: use the onboard guide</span></span></li>
            )}
          </ul>
          {caps.caps.some((c) => !c.available) && <p className="small">Missing items mean you cannot do that step. Tell Earth in the summary.</p>}
          <button className="btn big primary" disabled={sent} onClick={() => setSent(true)}>
            {sent ? "Summary sent" : link.hasLink ? "Send summary to Earth" : "Save summary for when contact returns"}
          </button>
          {sent && <p className="small">{link.hasLink ? `Earth receives it in about ${formatDuration(link.owltS / 60)}.` : `It will go out when contact returns (${formatDuration(link.waitMin)}).`}</p>}
        </section>
      </div>

      <button className="linkbtn small" onClick={() => { setExpert(true); setScreen("incident"); }}>Medical officer details (protocol, data, numbers) →</button>
    </div>
  );
}
