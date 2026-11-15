// Live heart rate, as it would stream from the crew member's smart shirt (Bio-Monitor /
// Astroskin type garment) on board. In this prototype the stream is SIMULATED around the
// person's measured heart rate for the selected day: small breathing-linked swings plus
// slow drift, updated every second, with an ECG-style trace. The colour/status still comes
// from the day's data, so the live noise never triggers an alarm on its own.
import { useEffect, useRef, useState } from "react";
import { useApp } from "../state/AppState";
import { evaluateSignal, latestAt } from "../engine/status";
import { STATUS_WORDS } from "../engine/plain";
import { STATUS_COLOR } from "./body/HealthBody3D";

/** Simulated beat-to-beat heart rate around a base value. */
function useLiveHeartRate(base: number | null): number | null {
  const [bpm, setBpm] = useState(base);
  const walk = useRef(0);
  useEffect(() => {
    if (base === null) { setBpm(null); return; }
    walk.current = 0;
    setBpm(base);
    const t0 = performance.now();
    const id = window.setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      // mean-reverting drift + breathing-linked variation (about 12 breaths per minute)
      walk.current += (Math.random() - 0.5) * 1.6 - 0.15 * walk.current;
      const rsa = 2.2 * Math.sin((2 * Math.PI * t) / 5);
      setBpm(Math.round(base + walk.current + rsa));
    }, 1000);
    return () => window.clearInterval(id);
  }, [base]);
  return bpm;
}

/** One heartbeat (P, QRS, T) as a function of the phase within the beat (0..1). */
function ecg(phase: number): number {
  const g = (c: number, w: number, a: number) => a * Math.exp(-(((phase - c) / w) ** 2));
  return g(0.12, 0.03, 0.12) + g(0.24, 0.008, -0.15) + g(0.26, 0.012, 1) + g(0.285, 0.01, -0.28) + g(0.48, 0.05, 0.3);
}

function EcgTrace({ bpm, color }: { bpm: number; color: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const rate = useRef(bpm);
  rate.current = bpm;
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const W = (c.width = c.clientWidth * devicePixelRatio);
    const H = (c.height = c.clientHeight * devicePixelRatio);
    const N = 400; // samples kept on screen (about 4 s)
    const buf = new Float32Array(N);
    let phase = 0, last = performance.now(), raf = 0;
    const draw = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const steps = Math.max(1, Math.round(dt * 100));
      for (let s = 0; s < steps; s++) {
        phase = (phase + (rate.current / 60) * (dt / steps)) % 1;
        buf.copyWithin(0, 1);
        buf[N - 1] = ecg(phase);
      }
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 2 * devicePixelRatio;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6 * devicePixelRatio;
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * W;
        const y = H * 0.72 - buf[i] * H * 0.6;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [color]);
  return <canvas ref={canvas} className="ecg" aria-hidden />;
}

export function LiveHeartCard() {
  const { idx, data, crewId, day, failedSources } = useApp();
  const last = latestAt(idx.get(crewId)?.get("heart_rate"), day);
  const st = evaluateSignal(idx, data.baselines, crewId, "heart_rate", day, { failedSources });
  const status = st.status;
  const bpm = useLiveHeartRate(last ? last.value : null);
  const color = status === "green" || status === "silent" ? "#7fe3a8" : STATUS_COLOR[status];

  return (
    <details key={`${crewId}-${status}`} className="glass vital v-fold" open={status === "amber" || status === "red"}>
      <summary className="v-head">
        <div>
          <div className="v-value">
            {bpm ?? "—"}<span className="v-unit"> bpm</span>
            {bpm && <span className="beat" style={{ animationDuration: `${60 / bpm}s`, background: color }} />}
          </div>
          <div className="v-title">Heart rate <span className="live-tag">SIMULATED</span></div>
        </div>
        <span className={`badge b-${status}`}>{STATUS_WORDS[status]}</span>
      </summary>
      {bpm ? <EcgTrace bpm={bpm} color={color} /> : <p className="g-small">No signal from the shirt.</p>}
    </details>
  );
}
