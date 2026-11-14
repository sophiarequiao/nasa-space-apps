// Test authority.js against the reference output of motor_autoridad.py:  node tools/test_authority.mjs
import { readFileSync } from 'node:fs';
import { setLinkData } from '../src/engine/link.js';
import { computeAuthority, setAuthorityData } from '../src/engine/authority.js';
const read = (r) => JSON.parse(readFileSync(new URL(r, import.meta.url)));
setLinkData(read('../data/mars_link.json'));
setAuthorityData({ profiles: read('../data/mission_profiles.json'), cards: read('../data/condition_cards.json') });

// [profile, date, condition, reference A (Python), reference decider]
const REF = [
  ['iss', '2026-11-14T12:00:00Z', 'eye_chemical_burn', 3.00, 'CREW'],
  ['iss', '2026-11-14T12:00:00Z', 'suspected_sepsis', 0.25, 'SHARED'],
  ['iss', '2026-11-14T12:00:00Z', 'renal_colic', 0.06, 'EARTH'],
  ['moon_relay', '2026-11-14T12:00:00Z', 'renal_colic', 0.06, 'EARTH'],
  ['mars_surface', '2026-11-14T12:00:00Z', 'eye_chemical_burn', 7.46, 'CREW'],
  ['mars_surface', '2026-11-14T12:00:00Z', 'suspected_sepsis', 0.62, 'SHARED'],
  ['mars_surface', '2026-11-14T12:00:00Z', 'suspected_stroke', 0.65, 'SHARED'],
  ['mars_surface', '2026-11-14T12:00:00Z', 'renal_colic', 0.16, 'EARTH'],
  ['mars_surface', '2034-09-03T12:00:00Z', 'eye_chemical_burn', 12.14, 'CREW'],
  ['mars_surface', '2034-09-03T12:00:00Z', 'suspected_stroke', 1.14, 'CREW'],
  ['mars_surface', '2034-09-03T12:00:00Z', 'renal_colic', 0.25, 'SHARED'],
  ['mars_surface', '2034-09-03T12:00:00Z', 'suspected_sepsis', 0.99, 'SHARED'],
  ['mars_surface', '2028-03-13T12:00:00Z', 'renal_colic', 102.23, 'CREW'],
  ['mars_surface', '2028-03-13T12:00:00Z', 'sans', 1.22, 'CREW'],
];
let failures = 0;
for (const [profile, dateISO, condition, aRef, whoRef] of REF) {
  const r = computeAuthority({ profile, dateISO, condition });
  // 5 % tolerance: the wait without link is computed from the real end of the outage, Python counts whole days
  const ok = Math.abs(r.A - aRef) <= Math.max(0.011, 0.05 * aRef) && r.whoDecides === whoRef;
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${profile.padEnd(13)} ${dateISO.slice(0, 10)} ${condition.padEnd(18)} A=${String(r.A).padStart(7)} (ref ${aRef}) ${r.whoDecides.padEnd(6)} (ref ${whoRef})`);
}
console.log(failures ? `\n${failures} FAILURES` : '\nAll cases match motor_autoridad.py');

console.log('\n--- Demo sentences (renal colic, Sunday 15 Nov, 17:30 Seville time) ---');
for (const profile of ['iss', 'moon_south_pole', 'mars']) {
  const r = computeAuthority({ profile, dateISO: '2026-11-15T16:30:00Z', condition: 'renal_colic' });
  console.log(`[${r.profile.name}] ${r.whoDecides} (A=${r.A})\n   ${r.explanation}`);
}
const o = computeAuthority({ profile: 'marte', dateISO: '2026-11-15T16:30:00Z', condition: 'quemadura_ocular' });   // aliases
console.log(`[Mars, eye] ${o.whoDecides} (A=${o.A})\n   ${o.explanation}`);
process.exit(failures ? 1 : 0);
