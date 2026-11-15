// Learn: each risk and each measurement explained in plain language, with sources.
import { useApp } from "../state/AppState";
import { Card, ExtLink, Tag } from "../components/ui";
import { SIGNALS } from "../engine/signals";

export function LearnScreen() {
  const { data } = useApp();
  return (
    <>
      <div className="grid learn-grid">
        {data.learn.map((t) => (
          <Card key={t.title} title={t.title}>
            <p>{t.text}</p>
            <p className="tiny muted">Source: <ExtLink href={t.url}>{t.source}</ExtLink> <Tag>to check</Tag></p>
          </Card>
        ))}
      </div>
      <Card title="What each measurement is and why it matters in space">
        <div className="table-scroll">
          <table className="tbl">
            <thead><tr><th>Measurement</th><th>How and how often</th><th>What changes in space</th></tr></thead>
            <tbody>
              {Object.entries(SIGNALS).map(([id, m]) => (
                <tr key={id}><td><b>{m.label}</b><div className="tiny muted">{data.regions.find((r) => r.id === m.region)?.name}</div></td><td className="small">{m.how}</td><td className="small">{m.expectedInFlight ?? "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="How SOSpesIA decides a colour">
        <ol className="small">
          <li>Every person has their own reference, built before launch with the same methods used in flight.</li>
          <li>In flight, each value is compared with the band expected for that person in space (mean ± 2 SD), not with Earth values. Example: blood pressure drops 8-10 mmHg in flight, so a lower value can be normal.</li>
          <li>A few provisional absolute rules apply (fever, SpO2, urine blood, pain). They are team assumptions pending validation.</li>
          <li>Estimated signals (camera, voice) never turn red on their own: confirm with a clinical device.</li>
          <li>Grey with stripes means no recent data. In space, the most serious problems may not hurt: if you do not measure, you do not know.</li>
          <li>Every alert says which data triggered it and why. No black box: with data from 8-25 astronauts per study, a reliable black-box model cannot be trained.</li>
        </ol>
      </Card>
    </>
  );
}
