// Checks the radiation figures shown for each mission profile against the numbers of their NASA sources.
// Usage: node --experimental-strip-types scripts/verify_radiation.mjs
// License: MIT. Written with AI assistance (Claude, Anthropic).
import fs from "node:fs";
import { radiationFor } from "../src/engine/radiation.ts";

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const data = read("../public/data/radiation.json");
const { profiles } = read("../public/data/profiles.json");

let failed = 0, checked = 0;
const check = (name, ok, detail = "") => { checked++; if (!ok) failed++; console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? `\n     ${detail}` : ""}`); };

check("Every mission profile of the app has an entry", profiles.every((p) => p.id in data.by_profile), profiles.map((p) => p.id).join(", "));
check("NASA career limit: 600 mSv", data.career_limit.mSv === 600);
const t = radiationFor(data, "mars_transit");
check("Mars transit: 1.8 mSv a day, measured (RAD); 600 mSv after about 333 days", t.kind === "measured" && t.rateMSvDay[0] === 1.8 && t.daysToLimit[0] === 333 && /about 333 days/.test(t.text), t.text);
const s = radiationFor(data, "mars_surface");
check("Mars surface: 0.67 mSv a day, measured (RAD); 600 mSv after about 896 days", s.kind === "measured" && s.rateMSvDay[0] === 0.67 && s.daysToLimit[0] === 896 && /about 896 days/.test(s.text), s.text);
check("Both Mars texts carry NASA's projection for the whole mission", [t, s].every((r) => /1,000 to 1,200 mSv/.test(r.text)));
const i = radiationFor(data, "leo");
check("Space station: 0.2 to 0.5 mSv a day; 600 mSv after 1,200 to 3,000 days", i.kind === "typical" && i.daysToLimit[0] === 1200 && i.daysToLimit[1] === 3000, i.text);
check("Six months on the station at that rate: 36 to 90 mSv, in line with the 40 to 90 NASA gives", Math.round(0.2 * 180) === 36 && Math.round(0.5 * 180) === 90);
const o = radiationFor(data, "lunar_orbit");
check("Lunar mission of 10 to 30 days: a NASA estimate, no daily rate made up", o.kind === "projected" && o.rateMSvDay === null && o.daysToLimit === null && /under 20 to about 30 millisieverts/.test(o.text), o.text);
const m = radiationFor(data, "lunar_no_relay"), st = data.environments.moon_surface.stay;
const years = st.map((x) => data.career_limit.mSv / (x.mSv / x.years));
check("Moon surface: a NASA estimate, and the years to the limit follow from it (3 and 1.7)",
  m.kind === "projected" && m.rateMSvDay === null && years[0] === 3 && years[1].toFixed(1) === "1.7" && m.text.includes("about 1.7 years") && m.text.includes("more than 3 years"), m.text);
check("Both lunar surface profiles share that text", radiationFor(data, "lunar_relay").text === m.text);
check("Earth analog and unknown profiles: nothing is shown", radiationFor(data, "analog") === null && radiationFor(data, "no_such_profile") === null && radiationFor(data, "constructor") === null);
check("Every number has a source with a link", profiles.filter((p) => p.id !== "analog").every((p) => { const r = radiationFor(data, p.id);
  return r.sources.length >= 2 && r.sources.every((x) => x.short && x.title && /^https:\/\//.test(x.url)); }));

console.log(`\n${checked - failed}/${checked} radiation checks passed`);
process.exit(failed ? 1 : 0);
