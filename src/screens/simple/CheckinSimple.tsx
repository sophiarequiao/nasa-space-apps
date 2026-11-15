// "Check-in" for crew members who are not doctors: one big button, talk to Earth as usual,
// get one or two plain sentences back. Audio and video never leave the device.
import { useEffect, useRef, useState } from "react";
import { useApp } from "../../state/AppState";
import { analyzeVoice, compareVoice, loadVoiceHistory, meanFromHistory, saveVoiceHistory, type PersonalVoiceMean, type VoiceResult } from "../../sensors/voice";
import { formatDuration } from "../../engine/link";
import { sealForEarth } from "../../engine/seal";
import { labObservations, type LabObservation } from "../../sensors/lab";
import { startCamera, stopCamera } from "../../sensors/camera";
import { latestAt } from "../../engine/status";
import { signalLabel } from "../../engine/signals";
import type { Observation, RegionId } from "../../types";
import { ReactionTest } from "../../components/ReactionTest";

const MAX_S = 30;
/** Camera values shown after the message: [signal, label, unit] */
const CAM_SHOWN: [string, string, string][] = [
  ["heart_rate", "Pulse", "bpm"], ["blink_rate", "Blinks", "/min"], ["perclos", "Eyes closed", "%"],
  ["head_movement", "Head movement", "%/s"], ["head_tilt", "Head tilt", "°"], ["posture_shifts", "Posture shifts", "/min"],
];

export function CheckinSimple() {
  const { data, crewId, day, date, link, idx, addObservations, setScreen, statusFor } = useApp();
  const [phase, setPhase] = useState<"idle" | "rec" | "done">("idle");
  const [secs, setSecs] = useState(0);
  const [level, setLevel] = useState(0);
  const [result, setResult] = useState<VoiceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [camera, setCamera] = useState(true);
  const [camState, setCamState] = useState("");
  const [camObs, setCamObs] = useState<LabObservation[]>([]);
  const video = useRef<HTMLVideoElement>(null);
  const [showTest, setShowTest] = useState(false);
  const [reaction, setReaction] = useState<{ lapses: number; meanMs: number; n: number } | null>(null);
  const [extra, setExtra] = useState({ sleep: "", mood: 0, pain: 0 });
  const [saved, setSaved] = useState<Observation[] | null>(null);
  const [sent, setSent] = useState(false);
  const [sealed, setSealed] = useState(false);
  const [synthetic, setSynthetic] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef(0);
  const timer = useRef(0);

  // the camera runs while the message is being recorded (the video element exists only then)
  useEffect(() => {
    if (phase !== "rec" || !camera || !video.current) return;
    startCamera(video.current, crewId, setCamState).catch(() => setCamState("off"));
  }, [phase, camera, crewId]);
  const own = meanFromHistory(loadVoiceHistory());
  const b = data.baselines.baselines[crewId];
  const mean: PersonalVoiceMean | null = own ?? (b ? { speechRate: b.speech_rate.flight_mean, pauseFraction: b.pause_fraction.flight_mean, source: `${crewId} reference` } : null);
  useEffect(() => () => { stopCamera(); cancelAnimationFrame(raf.current); window.clearInterval(timer.current); stream.current?.getTracks().forEach((t) => t.stop()); }, []);

  async function start() {
    setError(null); setResult(null); setSaved(null); setSent(false); setSealed(false); setSynthetic(false); setCamObs([]); setCamState("");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } });
      stream.current = s;
      const ctx = new AudioContext();
      const an = ctx.createAnalyser(); an.fftSize = 1024;
      ctx.createMediaStreamSource(s).connect(an);
      const buf = new Float32Array(an.fftSize);
      const tick = () => { an.getFloatTimeDomainData(buf); let e = 0; for (const v of buf) e += v * v; setLevel(Math.min(1, Math.sqrt(e / buf.length) * 6)); raf.current = requestAnimationFrame(tick); };
      tick();
      const r = new MediaRecorder(s);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = async () => {
        cancelAnimationFrame(raf.current); window.clearInterval(timer.current);
        s.getTracks().forEach((t) => t.stop()); void ctx.close();
        setLevel(0); setPhase("done");
        setCamObs(stopCamera());
        try {
          const res = await analyzeVoice(new Blob(chunks, { type: r.mimeType }), mean);
          setResult(res);
          if (res.features.speechRate > 0) saveVoiceHistory([...loadVoiceHistory(), res.features]);
        } catch (e) { setError(`Could not listen to the recording (${String(e)}).`); }
      };
      rec.current = r; r.start(); setPhase("rec"); setSecs(0);
      const t0 = Date.now();
      timer.current = window.setInterval(() => { const x = (Date.now() - t0) / 1000; setSecs(x); if (x >= MAX_S) stop(); }, 200);
    } catch {
      setError("The microphone is not available here. Use the example message below.");
    }
  }
  function stop() { window.clearInterval(timer.current); if (rec.current?.state === "recording") rec.current.stop(); }

  function example() {
    const sr = latestAt(idx.get(crewId)?.get("speech_rate"), day), pf = latestAt(idx.get(crewId)?.get("pause_fraction"), day);
    if (!sr || !pf) return;
    setResult(compareVoice({ durationS: 45, speakingTimeS: 35, speechRate: sr.value, pauseFraction: pf.value, f0MedianHz: null, f0VariabilitySt: null, snrDb: 30, quality: 0.9 }, mean));
    setPhase("done"); setSynthetic(true); setSaved(null); setSent(false); setSealed(false); setCamObs([]);
  }

  const slow = result?.comparisons.find((c) => c.signal === "speech_rate" && c.status === "amber");
  const pauses = result?.comparisons.find((c) => c.signal === "pause_fraction" && c.status === "amber");
  const voiceOk = result && result.features.speechRate > 0 && !slow && !pauses;

  // 1) Save: the values join this crew member's record, so Today and the body update.
  function save() {
    const out: Observation[] = [];
    if (!synthetic) {
      // stamped at the end of the mission day, so today's own check-in counts over the day's sample data
      const t = `${date}T23:59:59Z`;
      const o = (signal: string, value: number, unit: string, source: string, method: Observation["method"], region: RegionId): Observation =>
        ({ crew: crewId, phase: day < 0 ? "preflight" : "inflight", day, signal, value, unit, time: t, source, method, quality: 1, region, live: true });
      if (result?.features.speechRate) {
        out.push(o("speech_rate", +result.features.speechRate.toFixed(2), "syllables/s", "microphone", "estimated", "brain"));
        out.push(o("pause_fraction", +result.features.pauseFraction.toFixed(2), "fraction", "microphone", "estimated", "brain"));
      }
      if (reaction) out.push(o("reaction_lapses", reaction.lapses, "lapses", "reaction_test", "clinical", "brain"));
      if (extra.sleep) out.push(o("sleep", Number(extra.sleep), "h", "manual", "self_report", "brain"));
      if (extra.mood) out.push(o("mood", extra.mood, "1-5", "questionnaire", "self_report", "brain"));
      if (extra.pain) out.push(o("pain", extra.pain, "0-10", "questionnaire", "self_report", "kidneys"));
      if (camObs.length) out.push(...labObservations(camObs, out, crewId, day, t));
      addObservations(out);
    }
    setSaved(out);
  }

  // 2) Send to Earth: optional, offered first when something is outside your normal. Leaves encrypted (AES-256-GCM).
  function sendToEarth() {
    setSent(true);
    void sealForEarth({ crew: crewId, day, obs: (saved ?? []).map((p) => [p.signal, p.value, p.unit, p.method]) }).then((r) => setSealed(!!r?.opened));
  }

  // What the app's status engine says about today's check-in signals, against this person's own normal
  const CHECKED = ["speech_rate", "pause_fraction", "heart_rate", "reaction_lapses", "sleep", "mood", "pain"];
  // a live check-in is judged on what was measured in it; the example message on the day's sample data
  const judged = saved && saved.length ? saved.map((o) => o.signal) : CHECKED;
  const outside = saved
    ? Object.values(statusFor(crewId, day)).flatMap((r) => r.signals)
        .filter((x) => judged.includes(x.signal) && x.ageDays === 0 && (x.status === "amber" || x.status === "red"))
    : [];
  const anyRed = outside.some((x) => x.status === "red");

  return (
    <div className="simple narrow">
      <h2>Daily message to Earth</h2>
      <p className="muted">Talk to home as you always do, looking at the camera. The app reads your voice, eyes and posture. Nothing is recorded or kept.</p>

      {phase === "rec" && camera && (
        <div className="cam-big">
          <video ref={video} playsInline muted />
          <div className="cam-oval" />
          <span className="cam-chip">{camState === "ok" || camState === "measuring" ? "Face found" : camState === "no_face" ? "Look at the camera" : camState === "off" ? "Video only: face reading did not start" : "Starting camera…"}</span>
        </div>
      )}
      <div className="big-rec">
        <button className={`rec-btn xl ${phase === "rec" ? "on" : ""}`} onClick={phase === "rec" ? stop : start} aria-label={phase === "rec" ? "Stop" : "Record"}>
          <span className="rec-dot" />
        </button>
        <div>
          <b className="big-label">{phase === "rec" ? `Listening… ${Math.round(secs)} s` : phase === "done" ? "Record again" : "Tap and talk (30 s)"}</b>
          <div className="meter"><div style={{ width: `${level * 100}%` }} /></div>
          {phase === "rec" && <button className="btn" onClick={stop}>Finish</button>}
        </div>
      </div>
      <div className="row wrap gap">
        <button className="linkbtn small" onClick={example}>No microphone? Use {crewId}'s example message</button>
        <label className="check small"><input type="checkbox" checked={camera} disabled={phase === "rec"} onChange={(e) => setCamera(e.target.checked)} /> Camera on (eyes, posture, pulse)</label>
      </div>
      {error && <p className="banner warn small">{error}</p>}

      {result && (
        <section className={`panel answer ${voiceOk ? "ok" : "watch"}`}>
          {result.features.speechRate === 0 ? (
            <p>I could not hear enough. Try again somewhere quiet and talk for at least 10 seconds.</p>
          ) : voiceOk ? (
            <p className="answer-main">Your voice sounds like your usual self.</p>
          ) : (
            <>
              <p className="answer-main">Your voice sounds {slow ? "slower" : ""}{slow && pauses ? " and " : ""}{pauses ? "more hesitant" : ""} than usual.</p>
              <p>This often happens when you are tired.</p>
              {!showTest && <button className="btn primary" onClick={() => setShowTest(true)}>Do the quick reaction test</button>}
            </>
          )}
          <div className="stats">
            {result.features.speechRate > 0 && <div className="stat"><span className="tiny muted">Speech</span><b>{result.features.speechRate.toFixed(1)}</b> <span className="tiny">syll/s</span></div>}
            {result.features.speechRate > 0 && <div className="stat"><span className="tiny muted">Pauses</span><b>{Math.round(result.features.pauseFraction * 100)}</b> <span className="tiny">%</span></div>}
            {result.features.f0MedianHz && <div className="stat"><span className="tiny muted">Pitch</span><b>{Math.round(result.features.f0MedianHz)}</b> <span className="tiny">Hz</span></div>}
            {camObs.length > 0 && !camObs.some((c) => c.signal === "heart_rate") && <div className="stat"><span className="tiny muted">Pulse</span><b>—</b> <span className="tiny">keep still, face the light</span></div>}
            {CAM_SHOWN.map(([sig, label, unit]) => { const x = camObs.find((c) => c.signal === sig); return x ? <div className="stat" key={sig}><span className="tiny muted">{label}</span><b>{x.value}</b> <span className="tiny">{unit}</span></div> : null; })}
          </div>
          {synthetic && <p className="tiny muted">Example from the synthetic data set.</p>}
        </section>
      )}
      {showTest && (
        <section className="panel">
          <h3>Quick reaction test</h3>
          <ReactionTest onDone={setReaction} />
          {reaction && <p>{reaction.lapses <= 2 ? "Your reactions look fine." : "Your reactions were slower than usual. Protect your next sleep and tell the medical officer if it repeats."}</p>}
        </section>
      )}

      <section className="panel">
        <h3>How are you today?</h3>
        <div className="quick-q">
          <span>Mood</span>
          <div className="faces">{["Very low", "Low", "OK", "Good", "Great"].map((f, i) => <button key={f} className={extra.mood === i + 1 ? "on" : ""} onClick={() => setExtra({ ...extra, mood: i + 1 })}>{f}</button>)}</div>
        </div>
        <div className="quick-q">
          <span>Hours slept</span>
          <input type="number" min={0} max={14} step={0.5} value={extra.sleep} onChange={(e) => setExtra({ ...extra, sleep: e.target.value })} style={{ width: 90 }} />
        </div>
        <div className="quick-q">
          <span>Any pain? (0 = none, 10 = worst)</span>
          <input type="range" min={0} max={10} value={extra.pain} onChange={(e) => setExtra({ ...extra, pain: Number(e.target.value) })} />
          <b>{extra.pain}</b>
        </div>
        {extra.pain >= 7 && <p className="banner warn small">Strong pain: tell the medical officer and open <button className="linkbtn" onClick={() => setScreen("incident")}>Help</button>.</p>}
      </section>

      {!saved ? (
        <button className="btn big primary full" onClick={save} disabled={!result && !extra.sleep && !extra.mood && !extra.pain && camObs.length === 0}>
          Done
        </button>
      ) : outside.length === 0 ? (
        <section className="panel answer ok">
          <p className="answer-main">All normal for you today.</p>
          <p className="small muted">Saved. Nothing needs to go to Earth. {!sent && <button className="linkbtn" onClick={sendToEarth}>Send it anyway</button>}</p>
        </section>
      ) : (
        <section className={`panel answer ${anyRed ? "alert" : "watch"}`}>
          <p className="answer-main">{anyRed ? "Something needs attention now." : "Something is outside your normal."}</p>
          <ul className="small">{outside.map((x) => <li key={x.signal}><b>{signalLabel(x.signal)}</b>: {x.reason}</li>)}</ul>
          <p className="tiny muted">Compared with your own usual values. It is a warning, not a diagnosis.</p>
          <div className="row wrap gap">
            <button className={`btn ${anyRed ? "danger" : "primary"}`} onClick={() => setScreen("incident")}>What to do</button>
            {!sent && <button className="btn" onClick={sendToEarth}>Send to Earth</button>}
          </div>
        </section>
      )}
      {sent && (
        <p className="center small muted">
          {link.hasLink ? `Earth receives it in about ${formatDuration(link.owltS / 60)}.` : `No contact now: it goes out in ${formatDuration(link.waitMin)}.`}{sealed ? " It travels encrypted." : ""}
        </p>
      )}
    </div>
  );
}
