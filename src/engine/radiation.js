// src/engine/radiation.js — the radiation each mission adds, from NASA measurements, NASA estimates and NASA's limit.
// API:
//   await loadRadiationData()            in the browser: reads data/radiation.json
//   setRadiationData(object)             in Node, or when the app already has the JSON
//   radiationFor(profileId) -> null for a custom or unknown mission, otherwise
//     { profile, environment, kind, rate_mSv_day, days_to_limit, limit_mSv, text, sources }
//       kind: 'measured' (an instrument in that place) | 'typical' (NASA's range for crews) | 'projected' (a NASA estimate)
//       rate_mSv_day: [low, high] in millisieverts per day, or null when NASA gives a dose for the whole stay instead
//       days_to_limit: [fewest, most] days to reach NASA's career limit at that rate, or null
//       text: one to three sentences ready to show; sources: [{ short, title, url }] behind every number in the text
// The data: 1.8 mSv a day on the way to Mars and 0.67 on its surface, both measured by the RAD instrument of NASA's Mars
// Science Laboratory (Zeitlin et al. 2013; Hassler et al. 2014); 0.2 to 0.5 inside the space station, the estimates for
// the Moon and for a whole Mars mission (Simonsen, Zawaski and Weeks, NASA); career limit of 600 mSv (NASA-STD-3001).
// What it is: context for the crew. Averages that change with shielding and the solar cycle and leave out a large solar
// storm. It is not a dosimeter, it does not add up anybody's dose and it does not estimate anybody's risk.
// Drafted with AI assistance (Claude, Anthropic). MIT licence.

let DATA = null;
export function setRadiationData(data) { DATA = data; }
export async function loadRadiationData(base = new URL('../../data/', import.meta.url)) {
  setRadiationData(await fetch(new URL('radiation.json', base), { cache: 'no-cache' }).then(r => r.json()));
}

const num = (x) => x.toLocaleString('en-US', { maximumFractionDigits: 2 });

export function radiationFor(profileId) {
  if (!DATA) throw new Error('[radiation] data not loaded: call setRadiationData() or loadRadiationData()');
  const key = Object.hasOwn(DATA.by_profile, profileId) ? DATA.by_profile[profileId] : null;
  const env = key ? DATA.environments[key] : null;
  if (!env) return null;
  const limit = DATA.career_limit.mSv, rate = env.rate_mSv_day;
  const sources = [...env.sources, { short: DATA.career_limit.short, title: DATA.career_limit.title, url: DATA.career_limit.url }];
  const base = { profile: profileId, environment: key, kind: env.kind, limit_mSv: limit, sources };
  if (!rate) return { ...base, rate_mSv_day: null, days_to_limit: null, text: env.note };
  const same = rate[0] === rate[1];
  const days = [Math.round(limit / rate[1]), Math.round(limit / rate[0])];
  const text = `Radiation: about ${same ? num(rate[0]) : `${num(rate[0])} to ${num(rate[1])}`} millisieverts a day` +
    `${env.kind === 'measured' ? ', measured' : ''} ${env.where}. ` +
    `NASA's career limit is ${num(limit)} mSv, reached after ${same ? `about ${num(days[0])}` : `${num(days[0])} to ${num(days[1])}`} days at this rate.` +
    (env.mission_note ? ` ${env.mission_note}` : '');
  return { ...base, rate_mSv_day: rate, days_to_limit: days, text };
}
