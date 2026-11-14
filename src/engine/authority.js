// src/engine/authority.js — Authority engine: do we wait for Earth, or does the crew decide?
// Port of motor_autoridad.py (reference implementation; its output is in salida_motor_autoridad.txt).
//
//   earthResponse = wait until there is a link + packet uplink + light round trip + ground response time
//   A = earthResponse / tCrit
//     A <= 0.25        -> EARTH    (Earth leads; the crew executes)
//     0.25 < A <= 1    -> SHARED   (no-regret actions now + summary + checkpoint at Earth's answer)
//     A > 1            -> CREW     (the crew decides; Earth is informed afterwards)
//
// API: computeAuthority({ profile, dateISO, condition }) -> { A, whoDecides, explanation, ...detail }
//   profile:   id from data/mission_profiles.json ('iss', 'moon_south_pole', 'mars_surface'...) or alias ('moon', 'mars')
//   condition: id from data/condition_cards.json ('renal_colic'), a known alias, or an object with t_crit_min
// Data: setAuthorityData({ profiles, cards }) with the two JSON files, or await loadAuthorityData() in the browser.
// Team ASSUMPTIONS (in mission_profiles.json): 15 min ground response, thresholds 0.25 and 1,
// 10 % of the link for medical data, live guidance only with a round trip <= 3 s. Not a medical device.
// Drafted with AI assistance (Claude, Anthropic). MIT licence.

import { getLink, loadLinkData } from './link.js';

const C_KM_S = 299_792.458, AU_KM = 149_597_870.7;

let PROFILES = null, ASSUMPTIONS = null, CARDS = null;
export function setAuthorityData({ profiles, cards }) {
  if (profiles) { PROFILES = profiles.profiles; ASSUMPTIONS = profiles.assumptions; }
  if (cards) CARDS = cards.cards || cards;
}
/** Fetches the default data files (browser), including the Mars link table. */
export async function loadAuthorityData(base = new URL('../../data/', import.meta.url)) {
  const get = (f) => fetch(new URL(f, base)).then(r => r.json());
  const [profiles, cards] = await Promise.all([get('mission_profiles.json'), get('condition_cards.json'), loadLinkData(new URL('mars_link.json', base))]);
  setAuthorityData({ profiles, cards });
}

// Aliases: the three demo buttons, the app's scenario ids and the Spanish ids used in the team's sheets
const PROFILE_ALIAS = { moon: 'moon_relay', luna: 'moon_relay', mars: 'mars_surface', marte: 'mars_surface', leo: 'iss',
  luna_polo_sur: 'moon_south_pole', luna_rele: 'moon_relay', marte_superficie: 'mars_surface', marte_transito: 'mars_transit' };
const CARD_ALIAS = {
  sepsis: 'suspected_sepsis', stroke: 'suspected_stroke', smoke_fire: 'smoke_inhalation',
  colico_renal: 'renal_colic', sospecha_sepsis: 'suspected_sepsis', quemadura_ocular: 'eye_chemical_burn',
  quemadura_quimica_ojo: 'eye_chemical_burn', inhalacion_humo: 'smoke_inhalation', ictus: 'suspected_stroke',
  apendicitis: 'appendicitis', retencion_urinaria: 'urinary_retention_uti', infeccion_piel: 'skin_infection',
  trombosis_yugular: 'jugular_vte', sueno_fatiga: 'sleep_fatigue',
};
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/[\s-]+/g, '_');

export function listProfiles() { return (PROFILES || []).map(p => ({ id: p.id, name: p.name })); }
export function listConditions() { return (CARDS || []).map(c => ({ id: c.id, name: c.name, t_crit_min: c.t_crit_min })); }
export function getProfile(profile) {
  if (!PROFILES) throw new Error('[authority] mission profiles not loaded: call setAuthorityData() or loadAuthorityData()');
  const id = PROFILE_ALIAS[norm(profile)] || norm(profile);
  const p = PROFILES.find(x => x.id === id);
  if (!p) throw new Error(`[authority] Unknown profile: "${profile}". Use: ${PROFILES.map(x => x.id).join(', ')}`);
  return p;
}
function getCard(condition) {
  if (condition && typeof condition === 'object') {
    if (!(condition.t_crit_min > 0)) throw new Error('[authority] The condition needs t_crit_min > 0');
    return condition;
  }
  if (!CARDS) throw new Error('[authority] condition cards not loaded: call setAuthorityData() or loadAuthorityData()');
  const id = CARD_ALIAS[norm(condition)] || norm(condition);
  const c = CARDS.find(x => x.id === id);
  if (!c) throw new Error(`[authority] Unknown condition: "${condition}". Use: ${CARDS.map(x => x.id).join(', ')}`);
  return c;
}

// Medical data rate from Mars (kbps): 1/d² model anchored to published MRO figures (0.6-2.6 Mbps) × medical share.
// Placeholder (same as motor_autoridad.py): replace with a proper link budget.
function marsRateKbps(owlt_s, share) {
  const d_au = owlt_s * C_KM_S / AU_KM;
  return Math.max(600, Math.min(2600, 4280 / d_au ** 2)) * share;
}

/**
 * @param {{profile:string, dateISO?:string, condition:string|{t_crit_min:number,name?:string,packet_kB?:number}}} args
 * @returns {{A:number, whoDecides:'EARTH'|'SHARED'|'CREW', explanation:string}} plus detail fields
 */
export function computeAuthority({ profile, dateISO, condition }) {
  const p = getProfile(profile);
  const card = getCard(condition);
  const S = ASSUMPTIONS;
  const link = getLink(dateISO || new Date().toISOString(), p.link);

  // Breakdown of Earth's response time (minutes)
  const kB = card.packet_kB ?? (card.packet || []).reduce((a, x) => a + (x.size_kB_estimate || 0), 0);
  const rate = p.medical_rate_kbps ?? marsRateKbps(link.owlt_s, S.medical_share_of_link);
  const wait = (link.waitUntilLink_s ?? 0) / 60;
  const uplink = kB * 8 / rate / 60;
  const light = link.rtt_s / 60;
  const ground = S.ground_response_min;
  const earthResponse = wait + uplink + light + ground;

  const A = earthResponse / card.t_crit_min;
  const whoDecides = A > S.crew_threshold ? 'CREW' : (A > S.earth_threshold ? 'SHARED' : 'EARTH');

  // What help can Earth give? Live guidance (e.g. guided ultrasound) only with a round trip <= 3 s
  const liveGuidance = link.hasLink && link.rtt_s <= S.max_round_trip_for_live_guidance_s;
  let mode = card.earth_best_mode || 'text';
  if (mode === 'live_video' && !liveGuidance) mode = 'async_images';
  const lostLiveGuidance = card.earth_best_mode === 'live_video' && !liveGuidance;

  // One readable sentence: "Kidney stone: Earth answers in 37 min and there is a 4 h margin; Earth leads..."
  const name = card.name || card.id || 'This condition';
  const tE = fmtMin(earthResponse), tC = fmtMin(card.t_crit_min);
  const REASON = { solar_conjunction: 'solar conjunction', earth_below_horizon: 'Earth is below the horizon' };
  let explanation;
  if (!link.hasLink) {
    explanation = `${name}: no link to Earth for ${fmtMin(wait)} (${REASON[link.noLinkReason] || link.noLinkReason}) and action is needed within ${tC}; ` +
      (whoDecides === 'CREW' ? 'the crew decides and reports when the link is back.' : 'the crew starts the no-regret actions and reviews with Earth when the link is back.');
  } else if (whoDecides === 'CREW') {
    explanation = `${name}: Earth would answer in ${tE} and action is needed within ${tC}; the crew decides and reports afterwards.`;
  } else if (whoDecides === 'SHARED') {
    explanation = `${name}: Earth would answer in ${tE} and there are ${tC} to act; the crew starts the no-regret actions now, sends the summary and reviews with Earth when it answers.`;
  } else {
    explanation = `${name}: Earth answers in ${tE} and there is a ${tC} margin; Earth leads and the crew executes.`;
  }
  if (lostLiveGuidance) explanation += ' No live guidance: images and text only.';

  return {
    A: Math.round(A * 100) / 100,
    whoDecides,                        // 'EARTH' | 'SHARED' | 'CREW'
    explanation,
    earthResponse_min: r1(earthResponse),
    tCrit_min: card.t_crit_min,
    breakdown_min: { wait: r1(wait), uplink: r1(uplink), lightRoundTrip: r1(light), groundResponse: ground },
    mode, liveGuidance,
    packet_kB: kB, medicalRate_kbps: Math.round(rate),
    link,
    profile: { id: p.id, name: p.name, evacuation: p.evacuation, gravity_g: p.gravity_g, outages: p.outages },
    condition: { id: card.id ?? null, name, status: card.status || null },
    thresholds: { earth: S.earth_threshold, crew: S.crew_threshold },
  };
}

// --- helpers ------------------------------------------------------------------
const r1 = (x) => Math.round(x * 10) / 10;
// 0.4 -> "24 s" · 37.3 -> "37 min" · 240 -> "4 h" · 19670 -> "13.7 days"
function fmtMin(min) {
  if (min < 1) return `${Math.round(min * 60)} s`;
  if (min < 120) return `${Math.round(min)} min`;
  if (min < 48 * 60) { const h = min / 60; return `${Number.isInteger(h) ? h : Math.round(h * 10) / 10} h`; }
  const d = min / 1440; return `${Number.isInteger(d) ? d : Math.round(d * 10) / 10} days`;
}
