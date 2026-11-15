// "Kit" for crew members who are not doctors: what is ready, what is missing, what we
// could not treat right now, and a button to report something broken or used up.
import { useMemo, useState } from "react";
import { useApp } from "../../state/AppState";
import { conditionCapabilities } from "../../engine/resources";

export function KitSimple() {
  const { data, itemStates, toggleUnavailable, resetResources } = useApp();
  const [report, setReport] = useState("");
  const all = data.inventory.items.map((i) => itemStates.get(i.id)!);
  const missing = all.filter((s) => !s.available);
  const caution = all.filter((s) => s.available && s.state === "STABILITY_ALERT");
  const ready = all.filter((s) => s.available && s.state !== "STABILITY_ALERT");
  const caps = useMemo(() => conditionCapabilities(data.cards, data.capabilities, itemStates), [data, itemStates]);
  const cannotTreat = caps.filter((c) => c.lostTreatments > 0);
  const cannotTest = caps.filter((c) => c.lostTreatments === 0 && c.lostTests > 0);

  return (
    <div className="simple">
      <h2>Medical kit</h2>
      <div className="kit-summary">
        <div className="ks ks-green"><b>{ready.length}</b><span>ready</span></div>
        <div className="ks ks-amber"><b>{caution.length}</b><span>use with care</span></div>
        <div className="ks ks-red"><b>{missing.length}</b><span>missing or broken</span></div>
      </div>

      {(cannotTreat.length > 0 || cannotTest.length > 0) && (
        <section className="panel warn-panel">
          <h3>Because of what is missing</h3>
          {cannotTreat.map((c) => (
            <p key={c.card.id}><span className="mk mk-red" /> We <b>cannot treat</b> {c.card.name.toLowerCase()} fully: {c.caps.filter((k) => !k.available).map((k) => k.capability.name.toLowerCase()).join(", ")}.</p>
          ))}
          {cannotTest.map((c) => (
            <p key={c.card.id}><span className="mk mk-amber" /> For {c.card.name.toLowerCase()} we cannot: {c.caps.filter((k) => !k.available).map((k) => k.capability.name.toLowerCase()).join(", ")}.</p>
          ))}
        </section>
      )}

      <section className="panel">
        <h3>Something broke or ran out?</h3>
        <div className="row wrap gap">
          <select value={report} onChange={(e) => setReport(e.target.value)} aria-label="Item">
            <option value="">Choose the item…</option>
            {all.filter((s) => s.available).map((s) => <option key={s.item.id} value={s.item.id}>{s.item.name}</option>)}
          </select>
          <button className="btn primary" disabled={!report} onClick={() => { toggleUnavailable(report); setReport(""); }}>Report</button>
          {missing.some((m) => m.state === "UNAVAILABLE") && <button className="btn ghost" onClick={resetResources}>Undo reports</button>}
        </div>
        <p className="tiny muted">The app then shows what you can no longer do.</p>
      </section>

      <div className="kit-cols">
        <details className="glass g-fold">
          <summary><span className="g-title t-red"><span className="mk mk-red" /> Missing or broken</span><span className="g-count">{missing.length}</span></summary>
          {missing.length === 0 && <p className="muted">Nothing.</p>}
          <ul className="kit-list">{missing.map((s) => <li key={s.item.id}><b>{s.item.name}</b> <span className="tiny muted">{s.label.toLowerCase()}</span>
            {s.state === "UNAVAILABLE" && <button className="linkbtn tiny" onClick={() => toggleUnavailable(s.item.id)}> undo</button>}</li>)}</ul>
        </details>
        <details className="glass g-fold">
          <summary><span className="g-title t-amber"><span className="mk mk-amber" /> Use with care</span><span className="g-count">{caution.length}</span></summary>
          <p className="tiny muted">In space, some medicines lost strength before their date. Check with the medical officer before using these.</p>
          <ul className="kit-list">{caution.map((s) => <li key={s.item.id}><b>{s.item.name}</b> <span className="tiny muted">{s.item.category.toLowerCase()} · {s.quantity} left</span></li>)}</ul>
        </details>
        <details className="glass g-fold">
          <summary><span className="g-title t-green"><span className="mk mk-green" /> Ready</span><span className="g-count">{ready.length}</span></summary>
          <ul className="kit-list cols">{ready.map((s) => <li key={s.item.id}>{s.item.name} <span className="tiny muted">· {s.quantity}</span></li>)}</ul>
        </details>
      </div>
    </div>
  );
}
