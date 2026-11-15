// Checks the Earth-Mars link table the app uses (public/data/mars_link.json) against NASA/JPL Horizons.
// Reference: data_raw/horizons_reference.json, 201 days taken from the Horizons API (its "meta" holds the exact query).
// It checks the link the way the app uses it: getLink(date, Mars profile) gives the one-way light time and says
// "no link" during a solar conjunction (Mars less than 2 degrees from the Sun as seen from Earth).
// Passes when every light time is within 0.5 s of Horizons, every Sun-Earth-Mars angle within 0.05 degrees, and
// "link / no link" differs only on days where the angle is within that 0.05 degrees of the 2 degree limit.
// Usage: node --experimental-strip-types scripts/verify_horizons.mjs
// License: MIT. Written with AI assistance (Claude, Anthropic).
import fs from "node:fs";
import { getLink } from "../src/engine/link.ts";

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const marsLink = read("../public/data/mars_link.json");
const { profiles, assumptions } = read("../public/data/profiles.json");
const ref = read("../data_raw/horizons_reference.json");
const ctx = { marsLink, assumptions, launchDate: "2026-11-01" };
const mars = profiles.find((p) => p.id === "mars_transit");

const LIMIT_S = 0.5, LIMIT_DEG = 0.05, CONJUNCTION_DEG = 2;
const rows = ref.samples; // [date, one-way light time (s), Sun-Earth-Mars angle (deg)]
let failed = 0, checked = 0;
const check = (name, ok, detail = "") => { checked++; if (!ok) failed++; console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? `\n     ${detail}` : ""}`); };

// 1. The reference file is the one taken from Horizons (nothing edited by hand)
const c = ref.meta.checksum;
check("The Horizons reference is intact (rows and checksums)",
  rows.length === c.rows && rows.reduce((a, r) => a + Math.round(r[1] * 100), 0) === c.sum_owlt_x100 && rows.reduce((a, r) => a + Math.round(r[2] * 10000), 0) === c.sum_sep_x10000,
  `${rows.length} days from ${rows[0][0]} to ${rows[rows.length - 1][0]}`);

// 2. Day by day, through the engine the screens use
let worstS = { diff: 0 }, worstDeg = { diff: 0 }, squares = 0, clamped = 0;
const flagDiffers = [];
for (const [date, owlt, sep] of rows) {
  const link = getLink(date, mars, ctx);
  if (link.date !== date) { clamped++; continue; }
  const dS = link.owltS - owlt, dDeg = link.sepDeg - sep;
  squares += dS * dS;
  if (Math.abs(dS) > Math.abs(worstS.diff)) worstS = { diff: dS, date, ours: link.owltS, jpl: owlt };
  if (Math.abs(dDeg) > Math.abs(worstDeg.diff)) worstDeg = { diff: dDeg, date, ours: link.sepDeg, jpl: sep };
  if (link.hasLink !== (sep >= CONJUNCTION_DEG)) flagDiffers.push({ date, ours: link.sepDeg, jpl: sep });
}
check("Every reference day is inside the table of the app", clamped === 0, `${rows.length - clamped} of ${rows.length} days`);
check(`One-way light time within ${LIMIT_S} s of Horizons on every day`, Math.abs(worstS.diff) <= LIMIT_S,
  `largest difference ${worstS.diff.toFixed(2)} s on ${worstS.date} (app ${worstS.ours} s, Horizons ${worstS.jpl} s) · RMS ${Math.sqrt(squares / (rows.length - clamped)).toFixed(3)} s`);
check(`Sun-Earth-Mars angle within ${LIMIT_DEG} degrees of Horizons on every day`, Math.abs(worstDeg.diff) <= LIMIT_DEG,
  `largest difference ${worstDeg.diff.toFixed(4)} degrees on ${worstDeg.date} (app ${worstDeg.ours}, Horizons ${worstDeg.jpl})`);
check("Link / no link (solar conjunction) agrees, except where the angle sits on the 2 degree limit",
  flagDiffers.every((f) => Math.abs(f.jpl - CONJUNCTION_DEG) < LIMIT_DEG),
  flagDiffers.length ? flagDiffers.map((f) => `${f.date}: app ${f.ours}, Horizons ${f.jpl}`).join("; ") : "same answer on every day");

console.log(`\n${checked - failed}/${checked} Horizons checks passed`);
process.exit(failed ? 1 : 0);
