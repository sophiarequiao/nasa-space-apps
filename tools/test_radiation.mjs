// Test the radiation context (src/engine/radiation.js, data/radiation.json):  node tools/test_radiation.mjs
// Drafted with AI assistance (Claude, Anthropic). MIT licence.
import { readFileSync } from 'node:fs';
import { radiationFor, setRadiationData } from '../src/engine/radiation.js';
const read = (r) => JSON.parse(readFileSync(new URL(r, import.meta.url)));
const data = read('../data/radiation.json'), ids = read('../data/mission_profiles.json').profiles.map(p => p.id);

let fail = 0;
const check = (name, ok, detail = '') => { if (!ok) fail++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? `\n     ${detail}` : ''}`); };

let threw = false; try { radiationFor('iss'); } catch { threw = true; }
check('Without data it says so instead of guessing', threw);
setRadiationData(data);

check('Every mission profile has an entry (the custom mission has none on purpose)', ids.every(id => id in data.by_profile), ids.join(', '));
check('NASA career limit: 600 mSv', data.career_limit.mSv === 600);

const t = radiationFor('mars_transit');
check('On the way to Mars: 1.8 mSv a day, measured (RAD); 600 mSv after about 333 days',
  t.kind === 'measured' && t.rate_mSv_day[0] === 1.8 && t.days_to_limit[0] === 333 && t.days_to_limit[1] === 333 && /about 333 days/.test(t.text), t.text);
check('Six months of that cruise: 324 mSv, in line with the 330 published for a 180-day transit', Math.round(1.8 * 180) === 324);
const s = radiationFor('mars_surface');
check('On Mars: 0.67 mSv a day, measured (RAD); 600 mSv after about 896 days',
  s.kind === 'measured' && s.rate_mSv_day[0] === 0.67 && s.days_to_limit[0] === 896 && /about 896 days/.test(s.text), s.text);
check('Both Mars lines carry the NASA projection for the whole mission, above the career limit',
  [t, s].every(r => /1,000 to 1,200 mSv/.test(r.text)) && data.mars_mission_projection.low_mSv > data.career_limit.mSv);
const i = radiationFor('iss');
check('Space station: 0.2 to 0.5 mSv a day; 600 mSv after 1,200 to 3,000 days',
  i.kind === 'typical' && i.days_to_limit[0] === 1200 && i.days_to_limit[1] === 3000 && /1,200 to 3,000 days/.test(i.text), i.text);
check('Six months on the station at that rate: 36 to 90 mSv, in line with the 40 to 90 NASA gives', Math.round(0.2 * 180) === 36 && Math.round(0.5 * 180) === 90);

const o = radiationFor('lunar_orbit'), lm = data.environments.lunar_mission;
check('Lunar mission of 10 to 30 days: a NASA estimate (under 20 to about 30 mSv), no daily rate made up',
  o.kind === 'projected' && o.rate_mSv_day === null && o.days_to_limit === null &&
  o.text.includes(`under ${lm.mission_mSv[0]} to about ${lm.mission_mSv[1]} millisieverts`) && o.text.includes(`under ${lm.storm_design_mSv} mSv`), o.text);
const m = radiationFor('moon_south_pole'), st = data.environments.moon_surface.stay;
const years = st.map(x => data.career_limit.mSv / (x.mSv / x.years));   // years to the limit at each rate
check('Moon surface: a NASA estimate (under 100 mSv in six months, about 350 in a year), no daily rate made up',
  m.kind === 'projected' && m.rate_mSv_day === null && m.text.includes(`under ${st[0].mSv} millisieverts in six months`) && m.text.includes(`about ${st[1].mSv} in a year`), m.text);
check('Moon surface: the years to the limit in the text follow from those numbers (3 and 1.7)',
  years[0] === 3 && years[1].toFixed(1) === '1.7' && m.text.includes('about 1.7 years') && m.text.includes('more than 3 years'), years.map(y => y.toFixed(2)).join(', '));
check('Both lunar surface profiles share that text', radiationFor('moon_relay').text === m.text);
check('Every text states the career limit', ['iss', 'lunar_orbit', 'moon_relay', 'mars_transit', 'mars_surface'].every(id => radiationFor(id).text.includes('600 mSv')));
check('Custom mission: nothing is shown', radiationFor('custom') === null);
check('Unknown mission: nothing is shown', radiationFor('no_such_mission') === null && radiationFor('constructor') === null);
check('Every number has a source with a link, and the career limit is always among them',
  ['iss', 'lunar_orbit', 'moon_relay', 'moon_south_pole', 'mars_transit', 'mars_surface'].every(id => { const r = radiationFor(id);
    return r.sources.length >= 2 && r.sources.every(x => x.short && x.title && /^https:\/\//.test(x.url)) && r.sources.at(-1).url === data.career_limit.url; }));
check('No environment is left without a profile', Object.keys(data.environments).every(k => Object.values(data.by_profile).includes(k)));

console.log(fail ? `\n${fail} FAILURES` : '\nAll cases as expected');
process.exit(fail ? 1 : 0);
