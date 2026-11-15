// "Check-in" for crew members who are not doctors: one big button, talk to Earth as usual,
// get one or two plain sentences back. Audio and video never leave the device.
import { useEffect, useRef, useState } from "react";
import { useApp } from "../../state/AppState";
import { analyzeVoice, compareVoice, loadVoiceHistory, meanFromHistory, saveVoiceHistory, type PersonalVoiceMean, type VoiceResult } from "../../sensors/voice";
import type { RppgEstimate } from "../../sensors/rppg";
import { formatDuration } from "../../engine/link";
import { latestAt } from "../../engine/status";
import type { Observation, RegionId } from "../../types";
import { CameraPulse, ReactionTest } from "../MessageScreen";

const MAX_S = 30;

export function CheckinSimple() {
  const { data, crewId, day, link, idx, addObservations, setScreen } = useApp();
  const [phase, setPhase] = useState<"idle" | "rec" | "done">("idle");
  const [secs, setSecs] = useState(0);
  const [level, setLevel] = useState(0);
  const [result, setResult] = useState<VoiceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [pulse, setPulse] = useState<RppgEstimate | null>(null);
  const [showTest, setShowTest] = useState(false);
  const [reaction, setReaction] = useState<{ lapses: number; meanMs: number; n: number } | null>(null);
  const [extra, setExtra] = useState({ sleep: "", mood: 0, pain: 0 });
  const [sent, setSent] = useState(false);
  const [synthetic, setSynthetic] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef(0);
  const timer = useRef(0);

  const own = meanFromHistory(loadVoiceHistory());
  const b = data.baselines.baselines[crewId];
  const mean: PersonalVoiceMean | null = own ?? (b ? { speechRate: b.speech_rate.flight_mean, pauseFraction: b.pause_fraction.flight_mean, source: `${crewId} reference` } : null);
  useEffect(() => () => { cancelAnimationFrame(raf.current); window.clearInterval(timer.current); stream.current?.getTracks().forEach((t) => t.stop()); }, []);

  async function start() {
    setError(null); setResult(null); setSent(false); setSynthetic(false);
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
    setPhase("done"); setSynthetic(true); setSent(false);
  }

  const slow = result?.comparisons.find((c) => c.signal === "speech_rate" && c.status === "amber");
  const pauses = result?.comparisons.find((c) => c.signal === "pause_fraction" && c.status === "amber");
  const voiceOk = result && result.features.speechRate > 0 && !slow && !pauses;

  function send() {
    if (!synthetic) {
      const t = new Date().toISOString();
      const o = (signal: string, value: number, unit: string, source: string, method: Observation["method"], region: RegionId): Observation =>
        ({ crew: crewId, phase: day < 0 ? "preflight" : "inflight", day, signal, value, unit, time: t, source, method, quality: 1, region, live: true });
      const out: Observation[] = [];
      if (result?.features.speechRate) {
        out.push(o("speech_rate", +result.features.speechRate.toFixed(2), "syllables/s", "microphone", "estimated", "brain"));
        out.push(o("pause_fraction", +result.features.pauseFraction.toFixed(2), "fraction", "microphone", "estimated", "brain"));
      }
      if (pulse?.bpm && pulse.quality > 0.3) out.push(o("heart_rate", pulse.bpm, "bpm", "camera_rppg", "estimated", "heart"));
      if (reaction) out.push(o("reaction_lapses", reaction.lapses, "lapses", "reaction_test", "clinical", "brain"));
      if (extra.sleep) out.push(o("sleep", Number(extra.sleep), "h", "manual", "self_report", "brain"));
      if (extra.mood) out.push(o("mood", extra.mood, "1-5", "questionnaire", "self_report", "brain"));
      if (extra.pain) out.push(o("pain", extra.pain, "0-10", "questionnaire", "self_report", "kidneys"));
      addObservations(out);
    }
    setSent(true);
  }

  return (
    <div className="simple narrow">
      <h2>Daily message to Earth</h2>
      <p className="muted">Talk to home as you always do. While you speak, the app listens to how your voice sounds. Nothing is recorded or kept.</p>

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
        <label className="check small"><input type="checkbox" checked={camera} onChange={(e) => setCamera(e.target.checked)} /> Also take my pulse with the camera (experimental)</label>
      </div>
      {error && <p className="banner warn small">{error}</p>}
      {camera && <CameraPulse onEstimate={setPulse} />}

      {result && (
        <section className={`panel answer ${voiceOk ? "ok" : "watch"}`}>
          {result.features.speechRate === 0 ? (
            <p>I could not hear enough. Try again somewhere quiet and talk for at least 10 seconds.</p>
          ) : voiceOk ? (
            <p className="answer-main">Your voice sounds like your usual self.</p>
          ) : (
            <>
              <p className="answer-main">Your voice sounds {slow ? "slower" : ""}{slow && pauses ? " and " : ""}{pauses ? "more hesitant" : ""} than usual.</p>
              <p>This often happens when you are tired. It is not a diagnosis.</p>
              {!showTest && <button className="btn primary" onClick={() => setShowTest(true)}>Do the quick reaction test</button>}
            </>
          )}
          {pulse?.bpm && pulse.quality > 0.3 && <p className="small">Pulse from the camera: about <b>{pulse.bpm}</b> beats per minute.</p>}
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

      <button className="btn big primary full" onClick={send} disabled={sent || (!result && !extra.sleep && !extra.mood && !extra.pain)}>
        {sent ? "Sent" : "Send to Earth"}
      </button>
      <p className="center small muted">
        {sent
          ? link.hasLink ? `Earth receives it in about ${formatDuration(link.owltS / 60)}.` : `No contact now: it goes out in ${formatDuration(link.waitMin)}.`
          : "Only numbers are sent, never your voice or face. You decide what goes."}
      </p>
    </div>
  );
}
