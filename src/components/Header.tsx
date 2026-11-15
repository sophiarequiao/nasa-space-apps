// Header: floating pills (app, crew member, mission and day, Earth link) and the screen tabs.
import { useState } from "react";
import { useApp, CREW } from "../state/AppState";
import { overallStatus } from "../engine/status";
import { STATUS_COLOR } from "./body/HealthBody3D";
import { NAV } from "../state/nav";
import { formatDuration } from "../engine/link";

export function Header() {
  const { screen, setScreen } = useApp();
  return (
    <header className="header header-glass">
      <SimpleBar />
      <nav className="nav nav-pill" aria-label="Screens">
        {NAV.map((n) => (
          <button key={n.id} className={screen === n.id ? "on" : ""} onClick={() => setScreen(n.id)} title={n.hint}>{n.label}</button>
        ))}
      </nav>
    </header>
  );
}

/** Crew view header: floating pills like a monitor app. */
function SimpleBar() {
  const { data, crewId, setCrewId, statusFor, day, setDay, setDateOverride, profile, setProfileId, link, setScreen } = useApp();
  const [open, setOpen] = useState(false);
  const owltMin = link.owltS / 60;
  const role = CREW.find((c) => c.id === crewId)?.role;
  return (
    <div className="pillbar">
      <button className="pill-box brand-pill" onClick={() => setScreen("body")}>
        <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden>
          <path d="M5 17h6l3-7 4 13 3-6h6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span><b>SOSpesIA</b><small>Health monitor</small></span>
      </button>

      <div className="pill-box crew-pill">
        <button className="crew-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="avatar">{crewId.replace("CM-", "")}</span>
          <span><b>{crewId}</b><small>{role}</small></span>
          <span className="chev" aria-hidden>▾</span>
        </button>
        {open && (
          <div className="crew-menu" role="menu">
            {CREW.map((c) => {
              const st = overallStatus(statusFor(c.id, day));
              return (
                <button key={c.id} role="menuitem" className={c.id === crewId ? "on" : ""} onClick={() => { setCrewId(c.id); setOpen(false); }}>
                  <span className="dotc" style={{ background: STATUS_COLOR[st] }} />
                  <b>{c.id}</b><small>{c.role}</small>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="pill-box mission-pill">
        <select value={profile.id} onChange={(e) => setProfileId(e.target.value)} aria-label="Mission">
          {data.profiles.map((p) => <option key={p.id} value={p.id}>{p.short}</option>)}
        </select>
        <span className="sep" />
        <button onClick={() => { setDateOverride(null); setDay(day - 1); }} aria-label="Previous day">‹</button>
        <span className="day-big">{day < 0 ? `L${day}` : `Day ${day}`}</span>
        <button onClick={() => { setDateOverride(null); setDay(day + 1); }} aria-label="Next day">›</button>
      </div>

      <div className={`pill-box link-pill ${link.hasLink ? "" : "down"}`}>
        <span className="link-dot" />
        {link.hasLink
          ? <span><small>Message to Earth</small><b>{owltMin < 1 / 60 ? "real time" : formatDuration(owltMin)}</b></span>
          : <span><small>No contact with Earth</small><b>{formatDuration(link.waitMin)}</b></span>}
      </div>

    </div>
  );
}
