// Test link.js without a browser:  node tools/test_link.mjs
// Drafted with AI assistance (Claude, Anthropic). MIT licence.
import { readFileSync } from 'node:fs';
import { getLink, setLinkData, formatDuration as f } from '../src/engine/link.js';
setLinkData(JSON.parse(readFileSync(new URL('../data/mars_link.json', import.meta.url))));
const cases = [
  ['2026-11-14T12:00Z', 'mars',            'expected ~10 min 59 s'],
  ['2026-11-15T12:00Z', 'mars',            'expected ~10 min 54 s'],
  ['2034-09-03T12:00Z', 'mars',            'expected ~22 min 11 s'],
  ['2028-03-20T12:00Z', 'mars',            'conjunction 13-29 Mar 2028: no link'],
  ['2026-11-14T12:00Z', 'iss',             'near real time'],
  ['2026-11-14T12:00Z', 'moon',            '~1.28 s'],
  ['2026-11-05T12:00Z', 'moon_south_pole', 'first half of the cycle: link'],
  ['2026-11-20T12:00Z', 'moon_south_pole', 'second half: no link'],
];
for (const [date, profile, note] of cases) {
  const e = getLink(date, profile);
  console.log(`${date} ${profile.padEnd(15)} one way ${f(e.owlt_s).padEnd(13)} link=${e.hasLink ? 'yes' : 'NO (' + e.noLinkReason + ', back in ' + f(e.waitUntilLink_s) + ')'}  · ${note}`);
}
