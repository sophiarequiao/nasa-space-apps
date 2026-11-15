// Resources: inventory with space-aware expiry state, "What do we lose if...?", and the
// onboard devices as both data sources and resources.
import { useMemo, useState } from "react";
import { useApp } from "../state/AppState";
import { Card, ExtLink, Segmented, StatusDot, StatusPill, Tag } from "../components/ui";
import { conditionCapabilities } from "../engine/resources";
import { SOURCE_DEVICE, SOURCE_LABEL, formatValue, signalLabel } from "../engine/signals";
import { latestAt } from "../engine/status";

type Tab = "inventory" | "lose" | "devices";

export function ResourcesScreen() {
  const [tab, setTab] = useState<Tab>("inventory");
  return (
    <>
      <div className="row between wrap">
        <Segmented value={tab} onChange={setTab} options={[
          { value: "inventory", label: "Inventory" },
          { value: "lose", label: "What do we lose if…?" },
          { value: "devices", label: "Devices & data sources" },
        ]} />
      </div>
      {tab === "inventory" && <Inventory />}
      {tab === "lose" && <WhatDoWeLose />}
      {tab === "devices" && <Devices />}
    </>
  );
}

function Inventory() {
  const { data, itemStates, toggleUnavailable, setQuantity, resetResources, profile } = useApp();
  const [type, setType] = useState<"all" | "drug" | "device" | "supply">("all");
  const items = data.inventory.items.filter((i) => type === "all" || i.type === type);
  const c10 = data.inventory.expiry_rules.find((r) => r.id === "C10");
  return (
    <div className="grid res-grid">
      <Card title="Medical inventory" subtitle={`${data.inventory.items.length} items · fictional demo inventory · ${profile.resupply === "No" ? "no resupply on this mission: stock and stability matter more" : `resupply: ${profile.resupply}`}`}
        actions={<button className="btn ghost sm" onClick={resetResources}>Reset</button>}>
        <Segmented value={type} onChange={setType} options={[{ value: "all", label: "All" }, { value: "drug", label: "Drugs" }, { value: "device", label: "Devices" }, { value: "supply", label: "Supplies" }]} />
        <div className="table-scroll">
          <table className="tbl">
            <thead><tr><th>Item</th><th>Qty</th><th>Location</th><th>Label expiry*</th><th>In space</th><th>For</th><th /></tr></thead>
            <tbody>
              {items.map((i) => {
                const st = itemStates.get(i.id)!;
                return (
                  <tr key={i.id} className={st.available ? "" : "row-lost"}>
                    <td><b>{i.name}</b><div className="tiny muted">{i.category} · {i.form}</div></td>
                    <td>
                      <div className="qty">
                        <button onClick={() => setQuantity(i.id, st.quantity - 1)} aria-label="Less">−</button>
                        <span>{st.quantity}</span>
                        <button onClick={() => setQuantity(i.id, st.quantity + 1)} aria-label="More">+</button>
                      </div>
                    </td>
                    <td className="tiny">{i.location}</td>
                    <td className="small" title="Effective expiry in space: not determined (rule C09)">{i.label_expiry ?? <span className="muted">not defined</span>}</td>
                    <td><StatusPill status={st.status}>{st.label}</StatusPill><div className="tiny muted" title={st.explanation}>{st.rule}</div></td>
                    <td className="tiny">{i.conditions.map((c) => data.cards.find((k) => k.id === c)?.name ?? c.replace(/_/g, " ")).join(", ")}</td>
                    <td><button className="btn ghost sm" onClick={() => toggleUnavailable(i.id)}>{st.state === "UNAVAILABLE" ? "Restore" : i.type === "device" ? "Mark failed" : "Remove"}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="tiny muted">* Effective expiry in space is NOT DETERMINED for every item (rule C09): there is no universal shelf-life reduction we could honestly apply.</p>
      </Card>
      <Card title="Expiry in space is not the label date">
        <p>{c10?.app}</p>
        <ul className="small">
          <li><StatusDot status="red" size={9} /> <b>Depleted / expired / failed</b>: not counted as available (C05, C06).</li>
          <li><StatusDot status="amber" size={9} /> <b>Stability alert</b>: documented failures in space before the label date (amoxicillin/clavulanate, levofloxacin, levothyroxine). No new date is invented (C07).</li>
          <li><StatusDot status="green" size={9} /> <b>Studied in flight kits</b>: formulation tested in space; this batch is not proven (C01, C02).</li>
          <li><StatusDot status="silent" size={9} /> <b>No space data</b>: label date is administrative only (C04).</li>
        </ul>
        <p className="small">After 28 months on the ISS, 9 flight samples met the USP content criterion versus 17 ground controls, and failures grew with time in space.</p>
        <ul className="tiny">
          {data.inventory.stability_references.map((r) => <li key={r.url}><ExtLink href={r.url}>{r.label}</ExtLink></li>)}
        </ul>
      </Card>
    </div>
  );
}

function WhatDoWeLose() {
  const { data, itemStates, toggleUnavailable, overrides, resetResources, setIncidentCardId, setScreen } = useApp();
  const caps = useMemo(() => conditionCapabilities(data.cards, data.capabilities, itemStates), [data, itemStates]);
  const off = data.inventory.items.filter((i) => !itemStates.get(i.id)?.available);
  const quick = ["eq_020", "eq_024", "mat_027", "med_008", "med_002", "eq_026"];
  return (
    <div className="grid res-grid">
      <Card title="What do we lose if…?" subtitle="Pick a resource that fails or runs out. Conditions that lose their treatment turn red; those that lose a test turn amber."
        actions={<button className="btn ghost sm" onClick={resetResources}>Reset</button>}>
        <div className="row wrap gap-s">
          {quick.map((id) => {
            const it = data.inventory.items.find((i) => i.id === id)!;
            const isOff = overrides.unavailable.has(id);
            return <button key={id} className={`chip ${isOff ? "on danger" : ""}`} onClick={() => toggleUnavailable(id)}>{isOff ? "✕ " : ""}{it.name}</button>;
          })}
          <select value="" onChange={(e) => e.target.value && toggleUnavailable(e.target.value)} aria-label="Another item">
            <option value="">Another item…</option>
            {data.inventory.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
        <p className="small">Unavailable now: {off.length ? off.map((i) => <Tag key={i.id} tone="warn">{i.name}</Tag>) : <span className="muted">nothing</span>}</p>
        <div className="lose-grid">
          {caps.map((c) => (
            <div key={c.card.id} className={`lose-card lose-${c.status}`}>
              <div className="row between">
                <b>{c.card.name}</b>
                <StatusPill status={c.status}>{c.status === "red" ? "treatment lost" : c.status === "amber" ? "test lost" : "covered"}</StatusPill>
              </div>
              <ul className="tiny">
                {c.caps.map((k) => (
                  <li key={k.capability.name} className={k.available ? "" : "lost"}>
                    <StatusDot status={k.available ? "green" : "red"} size={8} /> {k.capability.name} <span className="muted">({k.capability.kind})</span>
                  </li>
                ))}
              </ul>
              <button className="linkbtn tiny" onClick={() => { setIncidentCardId(c.card.id); setScreen("incident"); }}>Open incident →</button>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Why it matters">
        <p>NASA designs exploration medical systems by choosing which resources to carry according to the risk they cover (IMPACT, with 119 conditions). SOSpesIA makes the same link visible to the crew every day.</p>
        <p className="small">Example: HemoCue failed → no white-cell count on board → the sepsis card loses its lab test → waiting for Earth becomes more valuable, but on Mars the answer takes over half an hour.</p>
        <p className="tiny muted">Resource-to-condition links are a team assumption pending validation by the health lead.</p>
      </Card>
    </div>
  );
}

function Devices() {
  const { data, idx, crewId, day, itemStates, toggleUnavailable } = useApp();
  const bySignal = idx.get(crewId);
  const sources = new Map<string, { signal: string; value: number; unit: string; day: number }[]>();
  for (const [signal, list] of bySignal ?? []) {
    const o = latestAt(list, day);
    if (!o) continue;
    const arr = sources.get(o.source) ?? [];
    arr.push({ signal, value: o.value, unit: o.unit, day: o.day });
    sources.set(o.source, arr);
  }
  return (
    <Card title={`Devices and data sources · ${crewId} · day ${day}`} subtitle="Every device is both a data source and a resource: if it fails, the data stop and the capabilities that need it are lost.">
      <div className="table-scroll">
        <table className="tbl">
          <thead><tr><th>Source</th><th>Last measurement</th><th>Status</th><th /></tr></thead>
          <tbody>
            {[...sources.entries()].map(([src, list]) => {
              const itemId = SOURCE_DEVICE[src];
              const st = itemId ? itemStates.get(itemId) : undefined;
              return (
                <tr key={src}>
                  <td><b>{SOURCE_LABEL[src] ?? src}</b>{st && <div className="tiny muted">inventory: {st.item.name}</div>}</td>
                  <td className="small">{list.map((l) => `${signalLabel(l.signal)} ${formatValue(l.signal, l.value)} ${l.unit} (D${l.day})`).join(" · ")}</td>
                  <td>{st ? <StatusPill status={st.status}>{st.label}</StatusPill> : <StatusPill status="green">OK</StatusPill>}</td>
                  <td>{itemId && <button className="btn ghost sm" onClick={() => toggleUnavailable(itemId)}>{st?.available ? "Mark failed" : "Restore"}</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="tiny muted">Onboard equipment in this prototype is simulated and labelled; only the camera and microphone measure live. {data.inventory.about}</p>
    </Card>
  );
}
