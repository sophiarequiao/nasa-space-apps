// Region card: function, what space does to it, status with reasons, how it is measured,
// what to do, and the inventory resources for this region.
import type { Region } from "../types";
import type { RegionStatus } from "../engine/status";
import { useApp } from "../state/AppState";
import { SIGNALS, SOURCE_LABEL, formatValue, signalLabel, withUnit } from "../engine/signals";
import { ExtLink, StatusDot, StatusPill, Tag } from "./ui";

export function RegionDetail({ region, rs, compare }: { region: Region; rs: RegionStatus; compare: "now" | "before" }) {
  const { itemStates, setScreen, setIncidentCardId, data } = useApp();
  const cards = data.cards.filter((c) => c.region === region.id);
  return (
    <div className="region-detail">
      <div className="rd-head">
        <h3>{region.name}</h3>
        <StatusPill status={rs.status} />
      </div>
      <p className="muted small">Main risk: <b>{region.risk}</b></p>

      {rs.reasons.length > 0 && (
        <ul className={`reasons reasons-${rs.status}`}>
          {rs.reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}
      {rs.status === "silent" && (
        <p className="silent-note">In space, no alarm does not mean you are fine: it may mean you have not been measured.</p>
      )}

      {rs.signals.length > 0 && (
        <table className="tbl compact">
          <thead>
            <tr><th>Signal</th><th>{compare === "before" ? "Before flight" : "Now"}</th><th>{compare === "before" ? "Now" : "Your band"}</th><th /></tr>
          </thead>
          <tbody>
            {rs.signals.filter((s) => !(SIGNALS[s.signal]?.eventOnly && s.value === null)).map((s) => {
              const b = s.baseline;
              return (
                <tr key={s.signal} title={s.reason}>
                  <td>
                    <StatusDot status={s.status} size={9} /> {signalLabel(s.signal)}
                    {s.method === "estimated" && <Tag tone="info">estimated</Tag>}
                    {s.source && <div className="muted tiny">{SOURCE_LABEL[s.source] ?? s.source}{s.ageDays ? ` · ${s.ageDays} d ago` : ""}</div>}
                  </td>
                  {compare === "before" ? (
                    <>
                      <td>{b ? withUnit(s.signal, b.pre_mean, s.unit) : "—"}</td>
                      <td>{s.value != null ? withUnit(s.signal, s.value, s.unit) : "—"}</td>
                      <td className="muted tiny">{SIGNALS[s.signal]?.expectedInFlight ?? ""}</td>
                    </>
                  ) : (
                    <>
                      <td><b>{s.value != null ? withUnit(s.signal, s.value, s.unit) : "—"}</b></td>
                      <td className="muted">{b && SIGNALS[s.signal]?.direction !== "none" && !SIGNALS[s.signal]?.absoluteOnly ? `${formatValue(s.signal, b.band_min)}–${formatValue(s.signal, b.band_max)}` : "rule"}</td>
                      <td className="muted tiny">{s.reason}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <details open>
        <summary>What space does to it</summary>
        <p>{region.space_effect}</p>
      </details>
      <details>
        <summary>How and how often it is measured on board</summary>
        <p>{region.how_measured}</p>
        <p className="muted small">{region.how_often}</p>
      </details>
      <details>
        <summary>What to do</summary>
        <p><StatusDot status="amber" size={9} /> {region.if_amber}</p>
        <p><StatusDot status="red" size={9} /> {region.if_red}</p>
      </details>
      <details open>
        <summary>Resources on board for this region</summary>
        {region.resources.length === 0 && <p className="muted">{region.resources_note || "None in the inventory."}</p>}
        <ul className="res-list">
          {region.resources.map((id) => {
            const st = itemStates.get(id);
            if (!st) return null;
            return <li key={id}><StatusDot status={st.status} size={9} /> {st.item.name} <span className="muted tiny">· {st.quantity} {st.item.unit} · {st.label}</span></li>;
          })}
        </ul>
        {region.resources_note && region.resources.length > 0 && <p className="muted tiny">{region.resources_note}</p>}
      </details>
      {cards.length > 0 && (
        <div className="rd-cards">
          <span className="muted small">Open an incident card:</span>
          {cards.map((c) => (
            <button key={c.id} className="btn ghost sm" onClick={() => { setIncidentCardId(c.id); setScreen("incident"); }}>{c.name}</button>
          ))}
        </div>
      )}
      <p className="muted tiny">Source: <ExtLink href={region.source}>{region.source}</ExtLink> · {region.status}</p>
    </div>
  );
}
