// Checks the Earth-Mars link against NASA/JPL Horizons:  node tools/check_horizons.mjs
// Reference: data/horizons_reference.json, 201 days taken from the Horizons API (its "meta" holds the exact query).
// It checks link.js the way the app uses it: getLink(date, 'mars') gives the one-way light time and says
// "no link" during a solar conjunction (Mars within 2 degrees of the Sun as seen from Earth).
// Passes when every light time is within 0.5 s of Horizons, every Sun-Earth-Mars angle within 0.05 degrees,
// and "link / no link" differs only on days where the angle is within that 0.05 degrees of the 2 degree limit.
// Drafted with AI assistance (Claude, Anthropic). MIT licence.
import { readFileSync } from 'node:fs';
import { getLink, setLinkData, SEP_MORATORIUM_DEG } from '../src/engine/link.js';

const load = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const table = load('../data/mars_link.json');
const ref = load('../data/horizons_reference.json');
setLinkData(table);

const LIMIT_S = 0.5, LIMIT_DEG = 0.05, DAY_MS = 86_400_000;
const rows = ref.samples;                       // [date, one-way light time (s), Sun-Earth-Mars angle (deg)]

// 1. The reference file is the one that was taken from Horizons (nothing edited by hand)
const sumOwlt = rows.reduce((a, r) => a + Math.round(r[1] * 100), 0);
const sumSep = rows.reduce((a, r) => a + Math.round(r[2] * 10000), 0);
const c = ref.meta.checksum;
const intact = rows.length === c.rows && sumOwlt === c.sum_owlt_x100 && sumSep === c.sum_sep_x10000;

// 2. Compare day by day
const t0 = Date.parse(table.start + 'T12:00:00Z');
let worstS = { diff: 0, date: null }, worstDeg = { diff: 0, date: null }, squares = 0;
const flagDiffers = [];
for (const [date, owlt, sep] of rows) {
  const i = Math.round((Date.parse(date + 'T12:00:00Z') - t0) / DAY_MS);
  const link = getLink(date + 'T12:00:00Z', 'mars');
  const dS = link.owlt_s - owlt, dDeg = table.sep_deg[i] - sep;
  squares += dS * dS;
  if (Math.abs(dS) > Math.abs(worstS.diff)) worstS = { diff: dS, date, ours: link.owlt_s, jpl: owlt };
  if (Math.abs(dDeg) > Math.abs(worstDeg.diff)) worstDeg = { diff: dDeg, date, ours: table.sep_deg[i], jpl: sep };
  if (link.hasLink !== (sep >= SEP_MORATORIUM_DEG)) flagDiffers.push({ date, ours: table.sep_deg[i], jpl: sep });
}
const rms = Math.sqrt(squares / rows.length);
const flagsExplained = flagDiffers.every((f) => Math.abs(f.jpl - SEP_MORATORIUM_DEG) < LIMIT_DEG);

// 3. Report
const okS = Math.abs(worstS.diff) <= LIMIT_S, okDeg = Math.abs(worstDeg.diff) <= LIMIT_DEG;
const mark = (ok) => (ok ? 'OK  ' : 'FAIL');
console.log(`Reference: ${ref.meta.source}`);
console.log(`           ${rows.length} days from ${rows[0][0]} to ${rows[rows.length - 1][0]}, retrieved ${ref.meta.retrieved_utc}\n`);
console.log(`${mark(intact)} reference file intact (${rows.length} rows, checksums match)`);
console.log(`${mark(okS)} one-way light time: largest difference ${Math.abs(worstS.diff).toFixed(2)} s on ${worstS.date} (ours ${worstS.ours} s, Horizons ${worstS.jpl} s), rms ${rms.toFixed(2)} s, limit ${LIMIT_S} s`);
console.log(`${mark(okDeg)} Sun-Earth-Mars angle: largest difference ${Math.abs(worstDeg.diff).toFixed(3)} deg on ${worstDeg.date} (ours ${worstDeg.ours}, Horizons ${worstDeg.jpl}), limit ${LIMIT_DEG} deg`);
console.log(`${mark(flagsExplained)} link / no link at solar conjunction: differs on ${flagDiffers.length} of ${rows.length} days` +
  (flagDiffers.length ? ' -> ' + flagDiffers.map((f) => `${f.date} (ours ${f.ours} deg, Horizons ${f.jpl} deg)`).join(', ') : ''));
const full = ref.meta.full_daily_comparison;
console.log(`\nFull comparison of all ${full.days} days (done once, recorded in the reference file): light time within ${full.owlt_max_abs_diff_s} s, angle within ${full.sep_max_abs_diff_deg} deg.`);

const failed = !(intact && okS && okDeg && flagsExplained);
console.log(failed ? '\nFAILED' : '\nThe link table agrees with JPL Horizons');
process.exit(failed ? 1 : 0);
