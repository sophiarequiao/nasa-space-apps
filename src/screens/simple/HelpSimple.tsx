// "Help" for crew members who are not doctors: who, what is happening, then one clear
// screen: who decides, what to do now, what we have, when to call the medical officer.
import { useEffect, useMemo, useState } from "react";
import { useApp, CREW } from "../../state/AppState";
import { computeAuthority } from "../../engine/authority";
import { conditionCapabilities } from "../../engine/resources";
import { formatDuration } from "../../engine/link";
import { DECIDER_PLAIN, REGION_SHORT, STATUS_WORDS, priority, regionActions, regionSentence } from "../../engine/plain";
import type { RegionId, Status } from "../../types";

/** Which condition card to open for a region that is not OK (most urgent regions first). */
const REGION_CARD: [RegionId, string][] = [
  ["blood", "suspected_sepsis"],
  ["lungs", "smoke_inhalation"],
  ["kidneys", "renal_colic"],
  ["brain", "sleep_fatigue"],
  ["neck", "jugular_vte"],
  ["eyes", "sans"],
  ["skin", "skin_infection"],
];

/** Amber only opens a card where it is a real finding (fatigue, jugular flow), not day-to-day noise. */
const AMBER_OPENS: RegionId[] = ["brain", "neck"];

/** The card that matches this crew member's data today: red regions first, then meaningful amber. */
export function cardFromStatus(status: Record<RegionId, { status: Status }>): { card: string; region: RegionId } | null {
  for (const [region, card] of REGION_CARD) if (status[region]?.status === "red") return { card, region };
  for (const [region, card] of REGION_CARD) if (AMBER_OPENS.includes(region) && status[region]?.status === "amber") return { card, region };
  return null;
}

export function HelpSimple() {
  const { data, crewId, setCrewId, day, statusFor, link, incidentCardId, setIncidentCardId, itemStates, setExpert, setScreen } = useApp();
  const [step, setStep] = useState<1 | 2 | 3>(2);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [sent, setSent] = useState(false);
  useEffect(() => { setDone({}); setSent(false); }, [incidentCardId, crewId]);

  const status = statusFor(crewId, day);
  // Open the help for the problem this crew member has today, as soon as the screen opens
  // (and again when the crew member, the day or the data change).
  const auto = cardFromStatus(status);
  // every area that Today shows as "keep an eye on it" or "needs action", most urgent first
  const problems = data.regions
    .filter((r) => status[r.id].status === "red" || status[r.id].status === "amber")
    .sort((a, b) => priority(status[a.id].status) - priority(status[b.id].status));
  const problemKey = `${crewId}|${day}|${auto?.card ?? "none"}|${problems.map((r) => r.id + status[r.id].status).join(",")}`;
  useEffect(() => {
    if (auto) { setIncidentCardId(auto.card); setStep(2); } else setStep(problems.length ? 3 : 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemKey]);
  const suggested = useMemo(() => new Set(data.cards.filter((c) => status[c.region]?.status === "red").map((c) => c.id)), [data.cards, status]);
  const card = data.cards.find((c) => c.id === incidentCardId) ?? data.cards[0];
  const auth = computeAuthority(card, link, data.assumptions);
  const caps = conditionCapabilities([card], data.capabilities, itemStates)[0];
  const plain = DECIDER_PLAIN[auth.decider];
  const steps = card.no_regret;
  const doneCount = steps.filter((s) => done[s]).length;

  if (step === 3) {
    const anyRed = problems.some((r) => status[r.id].status === "red");
    return (
      <div className="simple">
        <div className="row between wrap gap">
          <div>
            <p className="muted small">{crewId} · from today's data</p>
            <h2 className="help-title">{anyRed ? "Needs action today" : "Keep an eye on these today"}</h2>
          </div>
          <button className="btn" onClick={() => setStep(1)}>Something else is wrong</button>
        </div>
        <div className={`decide ${anyRed ? "decide-crew" : "decide-earth"}`}>
          <h2>{anyRed ? "Call the medical officer now" : "No emergency"}</h2>
          <p>{anyRed ? "Do the steps below and tell the medical officer straight away." : "Do the steps below. Tell the medical officer if it gets worse or does not go away."}</p>
        </div>
        <div className="help-grid">
          {problems.map((r) => {
            const st = status[r.id].status;
            const acts = regionActions(r.id, st);
            return (
              <section key={r.id} className="panel">
                <div className="row between">
                  <h3>{REGION_SHORT[r.id]}</h3>
                  <span className={`badge b-${st}`}>{STATUS_WORDS[st]}</span>
                </div>
                <p className="small">{regionSentence(status[r.id])}</p>
                {acts.map((a, i) => (
                  <label key={a} className={`step ${done[r.id + a] ? "done" : ""}`}>
                    <input type="checkbox" checked={!!done[r.id + a]} onChange={(e) => setDone({ ...done, [r.id + a]: e.target.checked })} />
                    <span className="step-n">{i + 1}</span>
                    <span>{a}</span>
                  </label>
                ))}
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="simple">
        <h2>What is happening?</h2>
        {!auto && !problems.length && <p className="small">Nothing in {crewId}'s data needs attention today. If something is wrong, choose it below.</p>}
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
          <p className="muted small">{crewId} · {auto && auto.card === card.id ? `From today's data: ${REGION_SHORT[auto.region].toLowerCase()}` : card.symptom}</p>
          <h2 className="help-title">{card.name}</h2>
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

      {problems.filter((r) => r.id !== card.region && r.id !== auto?.region).length > 0 && (
        <section className="panel">
          <h3>Also today</h3>
          {problems.filter((r) => r.id !== card.region && r.id !== auto?.region).map((r) => (
            <div key={r.id} className="also-row">
              <span className={`badge b-${status[r.id].status}`}>{STATUS_WORDS[status[r.id].status]}</span>
              <span><b>{REGION_SHORT[r.id]}</b> · {regionSentence(status[r.id])}<span className="g-sub">{regionActions(r.id, status[r.id].status)[0]}</span></span>
            </div>
          ))}
        </section>
      )}

      <button className="linkbtn small" onClick={() => { setExpert(true); setScreen("incident"); }}>Medical officer details (protocol, data, numbers) →</button>
    </div>
  );
}
