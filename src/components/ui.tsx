// Small shared UI pieces.
import type { ReactNode } from "react";
import type { Status } from "../types";
import { STATUS_LABEL } from "../engine/signals";
import type { Decider } from "../engine/authority";

export function StatusDot({ status, size = 12 }: { status: Status; size?: number }) {
  return <span className={`dot dot-${status}`} style={{ width: size, height: size }} aria-label={STATUS_LABEL[status]} />;
}

export function StatusPill({ status, children }: { status: Status; children?: ReactNode }) {
  return (
    <span className={`pill pill-${status}`}>
      <StatusDot status={status} size={9} />
      {children ?? STATUS_LABEL[status]}
    </span>
  );
}

export function DeciderPill({ decider }: { decider: Decider }) {
  return <span className={`decider decider-${decider.toLowerCase()}`}>{decider}</span>;
}

export function Card({ title, subtitle, children, actions, className = "" }:
  { title?: ReactNode; subtitle?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p className="muted small">{subtitle}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warn" | "info" }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

export function ProgressBar({ value, status = "green" }: { value: number; status?: Status }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={`progress-fill fill-${status}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }:
  { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  if (!href) return <>{children}</>;
  return <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>;
}
