// Always-visible mission selector: profile, mission day/date and the Earth link.
// Simple crew view shows only what a non-medical crew member needs.
import { useState } from "react";
import { useApp, CREW } from "../state/AppState";
import { overallStatus } from "../engine/status";
import { STATUS_COLOR } from "./body/HealthBody3D";
import { NAV, SIMPLE_NAV } from "../state/nav";
import { formatDuration } from "../engine/link";

export function Header() {
  const { data, expert, setExpert, profile, setProfileId, day, setDay, minDay, maxDay, date, dateOverride, setDateOverride, link, screen, setScreen, analogDelayS, setAnalogDelayS } = useApp();
  const owltMin = link.owltS / 60;
  const nav = expert ? NAV : SIMPLE_NAV;
  return (
    <header className={expert ? "header" : "header header-glass"}>
      {!expert && <SimpleBar />}
      {expert && <div className="header-top">
        <button className="brand" onClick={() => setScreen(expert ? "message" : "body")} aria-label="SOSpesAI home">
          <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden>
            <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2" opacity=".5" />
            <path d="M5 17h6l3-7 4 13 3-6h6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>SOSpes<b>AI</b></span>
        </button>
        {expert && <p className="tagline">Know your crew. Know your resources. Know your options. Know your time.</p>}
        <label className="mode-toggle">
          <input type="checkbox" checked={expert} onChange={(e) => setExpert(e.target.checked)} />
          <span>Medical officer view</span>
        </label>
      </div>}

      {expert ? (
        <div className="mission-bar">
          <label className="field">
            <span>Mission</span>
            <select value={profile.id} onChange={(e) => setProfileId(e.target.value)}>
              {data.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          {profile.link_model === "configurable" && (
            <label className="field">
              <span>Delay (s)</span>
              <input type="number" min={0} max={3600} value={analogDelayS} onChange={(e) => setAnalogDelayS(Number(e.target.value) || 0)} style={{ width: 80 }} />
            </label>
          )}
          <div className="field day-field">
            <span>Mission day</span>
            <div className="day-ctrl">
              <button onClick={() => setDay(day - 1)} aria-label="Previous day">−</button>
              <input type="range" min={minDay} max={maxDay} value={day} onChange={(e) => { setDateOverride(null); setDay(Number(e.target.value)); }} aria-label="Mission day" />
              <button onClick={() => setDay(day + 1)} aria-label="Next day">+</button>
              <b className="day-num">{day < 0 ? `L${day}` : `D${day}`}</b>
            </div>
          </div>
          <div className="field">
            <span>Date {dateOverride && <button className="linkbtn" onClick={() => setDateOverride(null)}>(simulated · reset)</button>}</span>
            <b>{date}</b>
          </div>
          <div className={`link-chip ${link.hasLink ? "up" : "down"}`} title={link.noLinkReason ?? "Link up"}>
            {link.hasLink ? (
              <>
                <span className="link-dot" /> Earth link · <b>{owltMin < 1 / 60 ? "real time" : formatDuration(owltMin)}</b> one way
                {!link.liveGuidance && <span className="muted"> · no live guidance</span>}
              </>
            ) : (
              <><span className="link-dot" /> <b>NO LINK</b> · back in {formatDuration(link.waitMin)}</>
            )}
          </div>
        </div>
      ) : null}

      <nav className={`nav ${expert ? "" : "nav-pill"}`} aria-label="Screens">
        {nav.map((n) => (
          <button key={n.id} className={screen === n.id ? "on" : ""} onClick={() => setScreen(n.id)} title={n.hint}>{n.label}</button>
        ))}
      </nav>
    </header>
  );
}

/** Crew view header: floating pills like a monitor app. */
function SimpleBar() {
  const { data, expert, setExpert, crewId, setCrewId, statusFor, day, setDay, setDateOverride, profile, setProfileId, link, setScreen } = useApp();
  const [open, setOpen] = useState(false);
  const owltMin = link.owltS / 60;
  const role = CREW.find((c) => c.id === crewId)?.role;
  return (
    <div className="pillbar">
      <button className="pill-box brand-pill" onClick={() => setScreen("body")}>
        <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden>
          <path d="M5 17h6l3-7 4 13 3-6h6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span><b>SOSpesAI</b><small>Health monitor</small></span>
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

      <label className="pill-box mode-pill">
        <input type="checkbox" checked={expert} onChange={(e) => setExpert(e.target.checked)} />
        <span>Medical officer view</span>
      </label>
    </div>
  );
}
