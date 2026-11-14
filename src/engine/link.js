// src/engine/link.js — State of the communication link between Earth and the crew.
// API: getLink(dateISO, profile) -> { owlt_s, rtt_s, hasLink, noLinkReason, waitUntilLink_s, source }
//   owlt_s: one-way light time (s) · rtt_s: round trip (s)
//   noLinkReason: null | 'solar_conjunction' | 'earth_below_horizon' | 'outage' (custom profile)
//   getLink(dateISO, 'custom', { owlt_s }) covers any other mission: you set the one-way light time yourself.
//   waitUntilLink_s: 0 if there is a link; otherwise seconds until it comes back (used by authority.js)
// Data: call setLinkData(json) with data/mars_link.json, or await loadLinkData() in the browser.
// Runs entirely in the browser, no server. Drafted with AI assistance (Claude, Anthropic). MIT licence.

const DAY_MS = 86_400_000;
const C_KM_S = 299_792.458;              // speed of light (km/s)
export const SEP_MORATORIUM_DEG = 2.0;   // Mars within 2° of the Sun: command moratorium (solar conjunction)

// --- Constants per profile ---------------------------------------------------
// ISS: voice and data through the geostationary TDRS relays (~36,000 km up + ~36,000 km down).
//      Light time alone is ~0.24 s; with processing, "near real time". ASSUMPTION: 0.25 s (TO CHECK).
const OWLT_ISS_S = 0.25;
// Moon: mean Earth-Moon distance 384,400 km -> ~1.28 s (TO CHECK against the NASA Moon fact sheet).
const OWLT_MOON_S = 384_400 / C_KM_S;
// Lunar south pole without a relay satellite: Earth is below the horizon ~half of each sidereal month.
// SIMULATION with a fixed calendar (ASSUMPTION): visible during the first half of each cycle from the epoch.
const SIDEREAL_MONTH_D = 27.321661;
const SOUTH_POLE_EPOCH_MS = Date.parse('2026-11-01T00:00:00Z');

export const LINK_PROFILES = ['iss', 'moon', 'moon_relay', 'moon_south_pole', 'mars', 'mars_transit', 'mars_surface', 'custom'];

// --- Mars data (data/mars_link.json) ------------------------------------------
let DATA = null;
/** @param {{start:string,end:string,n:number,owlt_s:number[],sep_deg:number[]}} d */
export function setLinkData(d) { DATA = d; }
/** Fetches data/mars_link.json (browser). Pass another URL if the app keeps its data elsewhere. */
export async function loadLinkData(url = new URL('../../data/mars_link.json', import.meta.url)) {
  DATA = await (await fetch(url, { cache: 'no-cache' })).json();   // always revalidate: data files change during development
  return DATA;
}

// Daily value (reference 12:00 UTC) linearly interpolated at instant t
function marsSeries(t, key) {
  if (!DATA) throw new Error('[link] Mars link data not loaded: call setLinkData() or loadLinkData()');
  const t0 = Date.parse(DATA.start + 'T12:00:00Z');
  const x = (t - t0) / DAY_MS;
  const last = DATA.n - 1;
  if (x < -0.5 || x > last + 0.5) throw new RangeError(`[link] Date outside the table (${DATA.start} to ${DATA.end})`);
  const xc = Math.min(Math.max(x, 0), last);
  const i = Math.min(Math.floor(xc), last - 1);
  const v = DATA[key];
  return v[i] + (v[i + 1] - v[i]) * (xc - i);
}

// Seconds from t until the Sun-Earth-Mars separation is back to >= 2°
function waitForConjunctionEnd(t) {
  const STEP = DAY_MS / 4;                       // 6 h steps, enough for a countdown
  for (let k = 1; k <= 4 * 60; k++) {            // the moratorium lasts ~2-3 weeks; cap at 60 days
    const tk = t + k * STEP;
    if (marsSeries(tk, 'sep_deg') >= SEP_MORATORIUM_DEG) return (tk - t) / 1000;
  }
  return null;
}

const norm = (s) => String(s || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
// Rounding: 2 decimals below 10 s (ISS, Moon), 1 decimal above (Mars)
const round = (x) => (x < 10 ? Math.round(x * 100) / 100 : Math.round(x * 10) / 10);

function result(owlt, hasLink, reason, wait, source) {
  return {
    owlt_s: round(owlt),
    rtt_s: round(2 * owlt),
    hasLink,
    noLinkReason: hasLink ? null : reason,
    waitUntilLink_s: hasLink ? 0 : (wait == null ? null : Math.round(wait)),
    source,
  };
}

/**
 * @param {string} dateISO e.g. '2026-11-14T12:00:00Z'
 * @param {'iss'|'moon'|'moon_relay'|'moon_south_pole'|'mars'|'mars_transit'|'mars_surface'|'custom'} [profile]
 * @param {{owlt_s?:number, hasLink?:boolean, wait_s?:number}} [custom] only for profile 'custom': any mission, any distance
 */
export function getLink(dateISO, profile = 'mars', custom = {}) {
  const t = Date.parse(dateISO);
  if (Number.isNaN(t)) throw new Error(`[link] Invalid date: ${dateISO}`);

  switch (norm(profile)) {
    case 'iss':
      return result(OWLT_ISS_S, true, null, 0, 'ISS via TDRS: ~0.25 s delay (ASSUMPTION)');

    case 'moon':
    case 'moon_relay':
      return result(OWLT_MOON_S, true, null, 0, 'Mean Earth-Moon distance 384,400 km; with relay satellite');

    case 'moon_south_pole': {
      const cycleMs = SIDEREAL_MONTH_D * DAY_MS;
      const phase = (((t - SOUTH_POLE_EPOCH_MS) % cycleMs) + cycleMs) % cycleMs;   // ms into the cycle
      const hasLink = phase < cycleMs / 2;
      return result(OWLT_MOON_S, hasLink, 'earth_below_horizon', hasLink ? 0 : (cycleMs - phase) / 1000,
        'Lunar south pole without relay: Earth visible ~half an orbit (SIMULATION with a fixed calendar)');
    }

    case 'mars':
    case 'mars_transit':     // ASSUMPTION: in cruise the Earth-Mars distance is used (upper bound)
    case 'mars_surface': {
      const owlt = marsSeries(t, 'owlt_s');
      const sep = marsSeries(t, 'sep_deg');
      const hasLink = sep >= SEP_MORATORIUM_DEG;
      return result(owlt, hasLink, 'solar_conjunction', hasLink ? 0 : waitForConjunctionEnd(t),
        `JPL ephemerides (approx.) · Sun-Earth-Mars separation ${sep.toFixed(1)}°`);
    }

    case 'custom': {         // any mission: the caller sets the one-way light time (and, optionally, an outage)
      const owlt = Math.max(0, Number(custom.owlt_s) || 0);
      const hasLink = custom.hasLink !== false;
      return result(owlt, hasLink, 'outage', hasLink ? 0 : (custom.wait_s ?? null),
        `Custom mission: ${(owlt * C_KM_S / 1e6).toFixed(1)} million km from Earth`);
    }

    default:
      throw new Error(`[link] Unknown profile: "${profile}". Use: ${LINK_PROFILES.join(', ')}`);
  }
}

/** UI helper: 658.7 -> "10 min 59 s" */
export function formatDuration(s) {
  if (s == null) return '—';
  if (s < 60) return `${s.toFixed(s < 10 ? 2 : 0)} s`;
  const total = Math.round(s);
  const d = Math.floor(total / 86400), h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60), sec = total % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min ${sec} s`;
}
