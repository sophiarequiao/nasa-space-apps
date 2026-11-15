// Message to Earth (home): the daily message is the health check. Voice is analysed live
// in the browser; the camera pulse is an optional plus. Audio and video are never stored or
// sent: only numbers, and only what the astronaut chooses to share.
import { useEffect, useRef, useState } from "react";
import { useApp, CREW } from "../state/AppState";
import { Card, Segmented, Stat, StatusPill, Tag } from "../components/ui";
import { analyzeVoice, compareVoice, loadVoiceHistory, meanFromHistory, saveVoiceHistory, type PersonalVoiceMean, type VoiceResult } from "../sensors/voice";
import { RppgEstimator, sampleSkin, type RppgEstimate } from "../sensors/rppg";
import { formatDuration } from "../engine/link";
import { sealForEarth, type SealReport } from "../engine/seal";
import type { CrewId, Observation, RegionId } from "../types";
import { latestAt } from "../engine/status";
import { signalLabel } from "../engine/signals";

const MAX_S = 30;

// The sensor lab (public/lab/) keeps the last check-in it sent in this browser, as numbers only.
// The astronaut can add it to this message; it never arrives on its own.
const LAB_KEY = "sospesai.lab.lastCheckin";
const LAB_MAX_AGE_MS = 12 * 3600_000;
const REGION_IDS: RegionId[] = ["brain", "eyes", "neck", "heart", "lungs", "musculoskeletal", "kidneys", "blood", "skin"];
interface LabObservation { signal: string; value: number; unit: string; source?: string; quality?: number; region?: string }
interface LabCheckin { mode: string; saved_at: number; observations: LabObservation[] }
function readLab(): LabCheckin | null {
  try {
    const d = JSON.parse(localStorage.getItem(LAB_KEY) ?? "null");
    return d && Array.isArray(d.observations) && typeof d.saved_at === "number" ? (d as LabCheckin) : null;
  } catch { return null; }
}

export function MessageScreen() {
  const { data, crewId, setCrewId, day, date, link, addObservations, idx, setScreen } = useApp();
  const [baselineMode, setBaselineMode] = useState<"own" | "crew">("crew");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [result, setResult] = useState<VoiceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [pulse, setPulse] = useState<RppgEstimate | null>(null);
  const [share, setShare] = useState({ voice: true, pulse: true, manual: true, reaction: true });
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [sealed, setSealed] = useState<SealReport | null>(null);
  const [manual, setManual] = useState<Record<string, string>>({});
  const [reaction, setReaction] = useState<{ lapses: number; meanMs: number; n: number } | null>(null);
  const [isSynthetic, setIsSynthetic] = useState(false);
  const [lab, setLab] = useState<LabCheckin | null>(readLab);
  const [useLab, setUseLab] = useState(false);

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const crewBaseline = data.baselines.baselines[crewId];
  const ownMean = meanFromHistory(loadVoiceHistory());
  const mean: PersonalVoiceMean | null = baselineMode === "own"
    ? ownMean
    : crewBaseline ? { speechRate: crewBaseline.speech_rate.flight_mean, pauseFraction: crewBaseline.pause_fraction.flight_mean, source: `${crewId} synthetic baseline` } : null;

  useEffect(() => () => stopAll(), []);
  useEffect(() => {
    // the lab runs in another tab: read its last check-in again when it changes or when this tab comes back
    const refresh = () => setLab(readLab());
    window.addEventListener("storage", refresh); window.addEventListener("focus", refresh);
    return () => { window.removeEventListener("storage", refresh); window.removeEventListener("focus", refresh); };
  }, []);
  // only a live check-in of the last hours is offered; a simulated one is never added to real data
  const labValues = lab && lab.mode === "live" && Date.now() - lab.saved_at < LAB_MAX_AGE_MS
    ? lab.observations.filter((x) => typeof x.value === "number" && isFinite(x.value) && (x.quality ?? 1) >= 0.4)
    : [];

  function stopAll() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function start() {
    setError(null); setResult(null); setSentAt(null); setSealed(null); setIsSynthetic(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } });
      streamRef.current = stream;
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize);
      const tick = () => {
        an.getFloatTimeDomainData(buf);
        let s = 0; for (const v of buf) s += v * v;
        setLevel(Math.min(1, Math.sqrt(s / buf.length) * 6));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = async () => {
        stopAll(); void ctx.close();
        setRecording(false); setLevel(0);
        try {
          const blob = new Blob(chunks.current, { type: rec.mimeType });
          chunks.current = [];
          const r = await analyzeVoice(blob, mean);
          setResult(r);
          if (r.features.speechRate > 0) saveVoiceHistory([...loadVoiceHistory(), r.features]);
        } catch (e) { setError(`Could not analyse the audio: ${String(e)}`); }
      };
      recRef.current = rec;
      rec.start();
      setRecording(true); setSeconds(0);
      const t0 = Date.now();
      timerRef.current = window.setInterval(() => {
        const s = (Date.now() - t0) / 1000;
        setSeconds(s);
        if (s >= MAX_S) stop();
      }, 200);
    } catch (e) {
      setError(`Microphone not available (${String(e)}). The app needs HTTPS and permission. You can use the synthetic message instead.`);
    }
  }

  function stop() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
  }

  function synthetic() {
    // today's message for this crew member from the synthetic data set
    const get = (s: string) => latestAt(idx.get(crewId)?.get(s), day);
    const sr = get("speech_rate"), pf = get("pause_fraction"), md = get("message_duration"), hr = get("heart_rate");
    if (!sr || !pf) return;
    const r = compareVoice({ durationS: md?.value ?? 45, speakingTimeS: (md?.value ?? 45) * (1 - pf.value), speechRate: sr.value, pauseFraction: pf.value, f0MedianHz: null, f0VariabilitySt: null, snrDb: 30, quality: sr.quality }, mean);
    setResult(r); setIsSynthetic(true); setSentAt(null); setSealed(null);
    if (hr) setPulse({ bpm: hr.value, quality: hr.quality, seconds: 20, fps: 30 });
  }

  const pending: Observation[] = buildObservations();
  function buildObservations(): Observation[] {
    if (isSynthetic) return [];
    const t = new Date().toISOString();
    const o = (signal: string, value: number, unit: string, source: string, method: Observation["method"], region: RegionId, quality = 1): Observation =>
      ({ crew: crewId, phase: day < 0 ? "preflight" : "inflight", day, signal, value, unit, time: t, source, method, quality, region, live: true });
    const out: Observation[] = [];
    if (share.voice && result?.features.speechRate) {
      out.push(o("speech_rate", +result.features.speechRate.toFixed(2), "syllables/s", "microphone", "estimated", "brain", result.features.quality));
      out.push(o("pause_fraction", +result.features.pauseFraction.toFixed(2), "fraction", "microphone", "estimated", "brain", result.features.quality));
      out.push(o("message_duration", Math.round(result.features.durationS), "s", "microphone", "clinical", "brain"));
    }
    if (share.pulse && pulse?.bpm && pulse.quality > 0.3) out.push(o("heart_rate", pulse.bpm, "bpm", "camera_rppg", "estimated", "heart", pulse.quality));
    if (share.reaction && reaction) out.push(o("reaction_lapses", reaction.lapses, "lapses", "reaction_test", "clinical", "brain"));
    if (useLab) {
      for (const x of labValues) {
        if (out.some((p) => p.signal === x.signal)) continue; // already measured in this message
        const region = REGION_IDS.includes(x.region as RegionId) ? (x.region as RegionId) : "brain";
        out.push(o(x.signal, x.value, x.unit, x.source ?? "camera", "estimated", region, x.quality ?? 1));
      }
    }
    if (share.manual) {
      const num = (k: string) => (manual[k] !== undefined && manual[k] !== "" ? Number(manual[k]) : null);
      const m: [string, string, string, string, RegionId][] = [
        ["bp_systolic", "mmHg", "bp_cuff", "clinical", "heart"], ["bp_diastolic", "mmHg", "bp_cuff", "clinical", "heart"],
        ["glucose", "mg/dL", "glucometer", "clinical", "blood"], ["temperature", "°C", "thermometer", "clinical", "blood"],
        ["sleep", "h", "manual", "self_report", "brain"], ["mood", "1-5", "questionnaire", "self_report", "brain"],
        ["sleep_self_report", "1-5", "questionnaire", "self_report", "brain"], ["pain", "0-10", "questionnaire", "self_report", "kidneys"],
      ];
      for (const [s, u, src, meth, reg] of m) { const v = num(s); if (v !== null && isFinite(v)) out.push(o(s, v, u, src, meth as Observation["method"], reg)); }
    }
    return out;
  }

  const packet = JSON.stringify({ crew: crewId, day, date, summary: result?.summary, obs: pending.map((p) => [p.signal, p.value, p.unit, p.method]) });
  const bytes = new TextEncoder().encode(packet).length;
  const etaMin = link.waitMin + link.owltS / 60;

  // What is approved leaves encrypted (AES-256-GCM). "Earth" is this same page, holding the same demo key.
  async function send() {
    if (pending.length) addObservations(pending);
    setSentAt(Date.now());
    setSealed(await sealForEarth(JSON.parse(packet)));
  }

  return (
    <div className="grid message-grid">
      <div className="stack">
        <Card title="Message to Earth" subtitle="Record your daily message. The app listens to your voice while you talk to home.">
          <div className="row wrap gap">
            <label className="field"><span>I am</span>
              <select value={crewId} onChange={(e) => setCrewId(e.target.value as CrewId)}>{CREW.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.role}</option>)}</select>
            </label>
            <div className="field"><span>Compare with</span>
              <Segmented value={baselineMode} onChange={setBaselineMode} options={[{ value: "crew", label: `${crewId} baseline (synthetic)` }, { value: "own", label: "My own recordings" }]} />
            </div>
          </div>
          {baselineMode === "own" && !ownMean && <p className="small muted">No recordings of yours yet: your first message becomes your reference.</p>}

          <div className="recorder">
            <button className={`rec-btn ${recording ? "on" : ""}`} onClick={recording ? stop : start} aria-label={recording ? "Stop recording" : "Start recording"}>
              <span className="rec-dot" />
            </button>
            <div className="rec-info">
              <b>{recording ? `Recording… ${seconds.toFixed(0)} / ${MAX_S} s` : "Tap to record (up to 30 s)"}</b>
              <div className="meter"><div style={{ width: `${level * 100}%` }} /></div>
              <p className="tiny muted">Speak naturally for at least 10 seconds. Audio is processed on this device and never stored.</p>
            </div>
          </div>
          <div className="row wrap gap">
            <button className="btn ghost sm" onClick={synthetic}>Use {crewId}'s synthetic message for day {day}</button>
            <label className="check"><input type="checkbox" checked={cameraOn} onChange={(e) => setCameraOn(e.target.checked)} /> Plus: camera pulse (experimental)</label>
          </div>
          {error && <p className="banner warn small">{error}</p>}
          {cameraOn && <CameraPulse onEstimate={setPulse} />}
        </Card>

        {result && (
          <Card title="Your check-in" subtitle={isSynthetic ? "From the synthetic data set (labelled)" : "Measured live"} actions={isSynthetic ? <Tag>synthetic</Tag> : <Tag tone="info">live</Tag>}>
            <div className="stats">
              <Stat label="Speech rate" value={`${result.features.speechRate.toFixed(2)} syll/s`} />
              <Stat label="Pauses" value={`${(result.features.pauseFraction * 100).toFixed(0)}%`} />
              <Stat label="Pitch" value={result.features.f0MedianHz ? `${result.features.f0MedianHz.toFixed(0)} Hz` : "—"} hint={result.features.f0VariabilitySt ? `±${result.features.f0VariabilitySt.toFixed(1)} st` : undefined} />
              <Stat label="Length" value={`${result.features.durationS.toFixed(0)} s`} />
              {pulse?.bpm && <Stat label="Pulse (camera)" value={`${pulse.bpm} bpm`} hint={`quality ${(pulse.quality * 100).toFixed(0)}%`} />}
            </div>
            {mean ? (
              <ul className="cmp-list">
                {result.comparisons.map((c) => <li key={c.signal}><StatusPill status={c.status}>{c.label}</StatusPill> {c.text} <span className="muted tiny">(mean {c.mean.toFixed(2)})</span></li>)}
              </ul>
            ) : <p className="muted small">No reference yet.</p>}
            <p className="tiny muted">Compared with {mean?.source ?? "—"}.</p>
            {result.suggestion && (
              <div className="banner info">
                {result.suggestion}
              </div>
            )}
          </Card>
        )}
      </div>

      <div className="stack">
        <Card title="Quick reaction test" subtitle="30-second demo of the daily 3-minute test. Tap as soon as the box turns green.">
          <ReactionTest onDone={setReaction} />
          {reaction && <p className="small">Mean {reaction.meanMs.toFixed(0)} ms · <b>{reaction.lapses} lapses</b> (over 500 ms) in {reaction.n} trials</p>}
        </Card>

        <Card title="Manual entries" subtitle="Keyboard input for indicators from onboard devices (the challenge asks for these).">
          <div className="manual-grid">
            {[
              ["bp_systolic", "Systolic BP (mmHg)"], ["bp_diastolic", "Diastolic BP (mmHg)"], ["glucose", "Glucose (mg/dL)"], ["temperature", "Temperature (°C)"],
              ["sleep", "Sleep last night (h)"], ["sleep_self_report", "Sleep quality (1-5)"], ["mood", "Mood (1-5)"], ["pain", "Pain (0-10)"],
            ].map(([k, label]) => (
              <label key={k} className="field"><span>{label}</span>
                <input type="number" step="any" inputMode="decimal" value={manual[k] ?? ""} onChange={(e) => setManual({ ...manual, [k]: e.target.value })} />
              </label>
            ))}
          </div>
        </Card>

        <Card title="Sensor lab" subtitle="More from the camera and the microphone, on one page. Experimental.">
          <p className="small">Eyelids and blink rate, head posture and movement, shoulders and trunk (optional), a held vowel, pulse with face tracking and an early warning against your own baseline. Everything is measured on this device and only numbers are kept.</p>
          <a className="btn ghost sm" href={`${import.meta.env.BASE_URL}lab/tools/demo.html`} target="_blank" rel="noopener">Open the sensor lab</a>
          {lab && labValues.length > 0 && (
            <p><label className="check"><input type="checkbox" checked={useLab} onChange={(e) => setUseLab(e.target.checked)} /> Add the last lab check-in to this message ({labValues.length} values, sent at {new Date(lab.saved_at).toLocaleTimeString()})</label></p>
          )}
          {useLab && labValues.length > 0 && <p className="tiny muted">{labValues.map((x) => `${signalLabel(x.signal)} ${x.value} ${x.unit}`).join(" · ")}</p>}
          {lab && lab.mode !== "live" && <p className="tiny muted">The last lab check-in was simulated, so it is not offered here.</p>}
          <p className="tiny muted">The lab uses MediaPipe (Apache-2.0): its face model is downloaded from Google the first time the camera is used. Its signals are compared only with your own baseline and do not colour the body yet.</p>
        </Card>

        <Card title="Send to Earth" subtitle="You choose what is shared. Nothing leaves without your approval.">
          <div className="row wrap gap-s">
            {(Object.keys(share) as (keyof typeof share)[]).map((k) => (
              <label key={k} className="check"><input type="checkbox" checked={share[k]} onChange={(e) => setShare({ ...share, [k]: e.target.checked })} /> {k}</label>
            ))}
          </div>
          <p className="small">{pending.length} values · packet {bytes} bytes {bytes < 2048 && <Tag tone="info">under 2 kB</Tag>}</p>
          <p className="eta">
            {link.hasLink
              ? <>Arrives on Earth in <b>{formatDuration(etaMin)}</b></>
              : <>No link now ({link.noLinkReason}). Queued: arrives in <b>{formatDuration(etaMin)}</b></>}
          </p>
          <button className="btn primary" disabled={!pending.length && !isSynthetic} onClick={() => void send()}>
            {isSynthetic ? "Send (synthetic: already in the data)" : "Approve and send"}
          </button>
          {sentAt && (
            <p className="small">
              Sent at {new Date(sentAt).toLocaleTimeString()} · Earth receives it at {new Date(sentAt + etaMin * 60000).toLocaleTimeString()}.
              {pending.length > 0 && <> Your values are now in the body view. <button className="linkbtn" onClick={() => setScreen("body")}>Open body →</button></>}
            </p>
          )}
          {sentAt && sealed && (
            <div className="banner info small">
              <p><b>Encrypted on this device before it leaves</b> (AES-256-GCM): {sealed.clearBytes} bytes of numbers travel as {sealed.wireBytes} bytes, message number {sealed.counter}. {sealed.opened ? "Earth opens it with the mission key and reads the same values." : "Earth could not open it."}</p>
              <p className="tiny muted seal-hex">{sealed.hex}…</p>
              <p className="tiny muted">Demo key created in this browser; a mission loads its own key before launch. Not audited.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export function CameraPulse({ onEstimate }: { onEstimate: (e: RppgEstimate) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [est, setEst] = useState<RppgEstimate | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [skin, setSkin] = useState(0);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let lastEst = 0;
    const estimator = new RppgEstimator(10);
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user", frameRate: { ideal: 30 } }, audio: false });
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const c = canvas.current!;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        const loop = (t: number) => {
          if (v.videoWidth) {
            c.width = 160; c.height = 120;
            ctx.drawImage(v, 0, 0, 160, 120);
            // face guide: central oval, sample the forehead and cheeks area
            const s = sampleSkin(ctx, 56, 26, 48, 56);
            if (s) { estimator.push(s.r, s.g, s.b, t); setSkin(s.skinShare); }
            if (t - lastEst > 1000) { lastEst = t; const e = estimator.estimate(); setEst(e); onEstimate(e); }
          }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      } catch (e) { setErr(`Camera not available: ${String(e)}`); }
    })();
    return () => { cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [onEstimate]);

  return (
    <div className="camera">
      <div className="cam-view">
        <video ref={video} playsInline muted />
        <div className="cam-oval" />
      </div>
      <canvas ref={canvas} hidden />
      <div className="cam-info">
        {err ? <p className="banner warn small">{err}</p> : (
          <>
            <p className="big">{est?.bpm && est.quality > 0.3 ? `${est.bpm} bpm` : "…"}</p>
            <p className="small">Signal quality {(Math.round((est?.quality ?? 0) * 100))}% · {est?.seconds.toFixed(0) ?? 0}/10 s · {est?.fps.toFixed(0) ?? 0} fps · skin {Math.round(skin * 100)}%</p>
            {est && est.quality <= 0.3 && est.seconds > 8 && <p className="tiny">Low quality: keep still, face the light (500 lux or more works best).</p>}
            <p className="tiny muted">Estimated (rPPG, POS method). Never red on its own. Video stays on this device. No face recognition.</p>
          </>
        )}
      </div>
    </div>
  );
}

export function ReactionTest({ onDone }: { onDone: (r: { lapses: number; meanMs: number; n: number }) => void }) {
  const [state, setState] = useState<"idle" | "wait" | "go" | "done">("idle");
  const [rts, setRts] = useState<number[]>([]);
  const goAt = useRef(0);
  const endAt = useRef(0);
  const to = useRef<number | null>(null);

  const schedule = () => {
    setState("wait");
    to.current = window.setTimeout(() => { goAt.current = performance.now(); setState("go"); }, 1500 + Math.random() * 3000);
  };
  const startTest = () => { setRts([]); endAt.current = performance.now() + 30000; schedule(); };
  useEffect(() => () => { if (to.current) window.clearTimeout(to.current); }, []);

  const tap = () => {
    if (state === "idle" || state === "done") return startTest();
    if (state === "wait") return; // early tap: ignored
    const rt = performance.now() - goAt.current;
    const next = [...rts, rt];
    setRts(next);
    if (performance.now() > endAt.current) {
      setState("done");
      onDone({ lapses: next.filter((x) => x > 500).length, meanMs: next.reduce((a, b) => a + b, 0) / next.length, n: next.length });
    } else schedule();
  };
  return (
    <button className={`rt-box rt-${state}`} onClick={tap}>
      {state === "idle" && "Tap to start (30 s)"}
      {state === "wait" && "Wait for green…"}
      {state === "go" && "TAP!"}
      {state === "done" && "Done · tap to repeat"}
      {rts.length > 0 && state !== "done" && <span className="tiny"> {rts.length} trials · last {rts[rts.length - 1].toFixed(0)} ms</span>}
    </button>
  );
}

