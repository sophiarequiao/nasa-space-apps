// Checks the TypeScript authority engine against the team's Python reference output.
// Usage: node --experimental-strip-types scripts/verify_authority.mjs
// License: MIT. Written with AI assistance (Claude, Anthropic).
import fs from "node:fs";
import { computeAuthority } from "../src/engine/authority.ts";
import { getLink } from "../src/engine/link.ts";

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const cards = read("../public/data/condition_cards.json").cards;
const marsLink = read("../public/data/mars_link.json");
const { profiles, assumptions } = read("../public/data/profiles.json");
const ctx = { marsLink, assumptions, launchDate: "2026-11-01" };
const P = (id) => profiles.find((p) => p.id === id);
const fixed = (owlt, wait, rate) => ({ owltS: owlt, rttS: 2 * owlt, hasLink: wait === 0, noLinkReason: null, waitMin: wait, rateKbps: rate, liveGuidance: false, date: "" });

const scenarios = {
  "ISS": getLink("2026-11-14", P("leo"), ctx),
  "Luna polo sur, con rele": getLink("2026-11-14", P("lunar_relay"), ctx),
  "Luna polo sur, sin rele, Tierra oculta (peor caso)": fixed(1.28, 13.66 * 1440, 5000),
  "Marte hoy (2026-11-14)": getLink("2026-11-14", P("mars_transit"), ctx),
  "Marte lejos, con enlace (2034-09-03)": getLink("2034-09-03", P("mars_transit"), ctx),
  "Marte, primer dia de conjuncion solar (2028-03-13)": getLink("2028-03-13", P("mars_transit"), ctx),
};

const ref = fs.readFileSync(new URL("../data_raw/salida_motor_autoridad.txt", import.meta.url), "utf-8");
let current = null, checked = 0, failed = 0;
const map = { CREW: "CREW", SHARED: "SHARED", EARTH: "EARTH" };
for (const line of ref.split("\n")) {
  const h = line.match(/^== (.+?) \|/);
  if (h) { current = scenarios[h[1]]; continue; }
  const m = line.match(/^\s+(\w+)\s+T_crit\s+\d+ min .*A=\s*([\d.]+) \| (\w+)/);
  if (!m || !current) continue;
  const card = cards.find((c) => c.id === m[1]);
  const r = computeAuthority(card, current, assumptions);
  checked++;
  const ok = Math.abs(r.A - parseFloat(m[2])) <= 0.011 * Math.max(1, parseFloat(m[2])) && map[m[3]] === r.decider;
  if (!ok) { failed++; console.log("MISMATCH", m[1], "ref", m[2], m[3], "got", r.A.toFixed(2), r.decider); }
}
console.log(`checked ${checked} card x scenario pairs, ${failed} mismatches`);
process.exit(failed ? 1 : 0);
