// Small 2D silhouette for crew cards (drawn in code, no third-party assets).
import type { RegionId, Status } from "../types";
import { STATUS_COLOR } from "./body/HealthBody3D";

const DOTS: { region: RegionId; x: number; y: number }[] = [
  { region: "brain", x: 50, y: 14 },
  { region: "eyes", x: 50, y: 24 },
  { region: "neck", x: 50, y: 38 },
  { region: "heart", x: 56, y: 56 },
  { region: "lungs", x: 42, y: 56 },
  { region: "kidneys", x: 50, y: 82 },
  { region: "musculoskeletal", x: 38, y: 130 },
  { region: "blood", x: 26, y: 70 },
  { region: "skin", x: 74, y: 70 },
];

export function MiniBody({ status, size = 120 }: { status: Partial<Record<RegionId, Status>>; size?: number }) {
  return (
    <svg viewBox="0 0 100 170" width={size * 0.6} height={size} className="minibody" aria-hidden>
      <defs>
        <pattern id="mb-stripes" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="4" height="4" fill="#8a93a6" />
          <rect width="2" height="4" fill="#5d6577" />
        </pattern>
      </defs>
      <g className="mb-outline">
        <circle cx="50" cy="18" r="13" />
        <rect x="44" y="30" width="12" height="10" rx="3" />
        <path d="M28 44 Q50 38 72 44 L70 100 Q50 106 30 100 Z" />
        <path d="M28 46 L16 98 L22 100 L33 60 Z" />
        <path d="M72 46 L84 98 L78 100 L67 60 Z" />
        <path d="M32 100 L36 162 L46 162 L49 106 Z" />
        <path d="M68 100 L64 162 L54 162 L51 106 Z" />
      </g>
      {DOTS.map((d) => {
        const s = status[d.region] ?? "silent";
        return <circle key={d.region} cx={d.x} cy={d.y} r={5.2} fill={s === "silent" ? "url(#mb-stripes)" : STATUS_COLOR[s]} stroke="#0b1020" strokeWidth="1.2" />;
      })}
    </svg>
  );
}
