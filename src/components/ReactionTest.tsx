// Quick reaction test (30-second demo of the daily 3-minute test): tap as soon as the box turns green.
// Lapses = reactions slower than 500 ms.
import { useEffect, useRef, useState } from "react";

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
