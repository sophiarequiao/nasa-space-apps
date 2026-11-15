// "Guide" for crew members who are not doctors: only what is useful in the moment.
// How to take each measurement, what the colours mean, when to call the medical officer,
// and what to do without contact with Earth. Background science stays in the medical view.
// Wording is a team proposal pending review by the health lead.
import { useApp } from "../../state/AppState";
import { formatDuration } from "../../engine/link";

const HOW_TO: { title: string; steps: string[] }[] = [
  {
    title: "Blood pressure",
    steps: [
      "Anchor yourself (foot loops or a seat) and rest for 5 minutes.",
      "Put the cuff on your bare upper arm, at the level of your heart.",
      "Stay still and do not talk while it measures.",
      "Measure twice, 1 minute apart. Enter both in Check-in.",
    ],
  },
  {
    title: "Pulse and oxygen (pulse oximeter)",
    steps: [
      "Warm your hand first; cold fingers give low readings.",
      "Clip it on a finger without nail polish and keep your hand still.",
      "Wait about 30 seconds until the numbers stop changing.",
      "Oxygen below 94% or a very fast pulse at rest: measure again and open Help.",
    ],
  },
  {
    title: "Temperature",
    steps: [
      "Wait 30 minutes after eating, drinking or exercise.",
      "Measure, then write the number down straight away.",
      "38.0 °C or more: open Help.",
    ],
  },
  {
    title: "Urine dipstick",
    steps: [
      "Dip the strip for 1 second and tap off the extra liquid.",
      "Wait the time printed on the container.",
      "Compare the colours with the chart, in good light.",
      "Note the result and close the container right away.",
    ],
  },
  {
    title: "Reaction test",
    steps: [
      "Do it at about the same time every day.",
      "Find a quiet place and turn off notifications.",
      "Tap as soon as the box turns green; do not guess early.",
    ],
  },
  {
    title: "Daily message to Earth",
    steps: [
      "Find a quiet place and talk for at least 10 seconds.",
      "Speak as you normally would; nothing special is needed.",
      "Add mood, sleep and pain, then press Send to Earth.",
    ],
  },
];

const CALL_NOW = [
  "Chest pain or pressure",
  "Trouble breathing or oxygen below 90%",
  "Confusion, fainting, or a new very bad headache",
  "Face drooping, arm weakness or trouble speaking",
  "Fever of 38 °C or more with feeling very unwell",
  "Pain of 7 out of 10 or more",
  "Sudden change in vision, or a chemical in the eye",
];

export function GuideSimple() {
  const { link, blackout } = useApp();
  return (
    <div className="simple narrow">
      <h2>Guide</h2>

      <section className="glass call-now">
        <p className="g-title">Call the medical officer at once if</p>
        <ul className="g-list">{CALL_NOW.map((c) => <li key={c}>{c}</li>)}</ul>
        <p className="g-small">Then open Help: it tells you what to do while you wait.</p>
      </section>

      <section className="glass">
        <p className="g-title">What the colours mean</p>
        <div className="colour-key">
          <div><span className="dotc d-green" /><b>All good</b><span>Normal for you.</span></div>
          <div><span className="dotc d-amber" /><b>Keep an eye on it</b><span>Do the step shown and check again later.</span></div>
          <div><span className="dotc d-red" /><b>Needs action now</b><span>Open Help and tell the medical officer.</span></div>
          <div><span className="dotc d-silent" /><b>Not checked recently</b><span>Measure it: no alarm does not mean all is fine.</span></div>
        </div>
      </section>

      <section className="glass">
        <p className="g-title">How to measure</p>
        {HOW_TO.map((h) => (
          <details key={h.title} className="howto">
            <summary>{h.title}</summary>
            <ol className="g-steps">{h.steps.map((s) => <li key={s}>{s}</li>)}</ol>
          </details>
        ))}
      </section>

      <section className="glass">
        <p className="g-title">No contact with Earth</p>
        <ol className="g-steps">
          <li>Open Help: it tells you who decides and what to do now.</li>
          <li>Write down every step you take, with the time.</li>
          <li>Save the summary; it goes out when contact returns.</li>
        </ol>
        <p className="g-small">
          {link.hasLink
            ? blackout ? `Next time without contact: in ${blackout.startsInDays} days, for ${blackout.lengthDays} days.` : "No time without contact expected soon."
            : `No contact now. It returns in ${formatDuration(link.waitMin)}.`}
        </p>
      </section>

      <section className="glass">
        <p className="g-title">Before a time without contact</p>
        <ol className="g-steps">
          <li>Do your eye scan (OCT) and neck ultrasound.</li>
          <li>Check the medical kit: what is missing or broken.</li>
          <li>Record your daily message so Earth has your latest data.</li>
        </ol>
      </section>
    </div>
  );
}
