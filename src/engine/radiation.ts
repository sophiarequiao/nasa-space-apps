// Radiation each mission adds, from NASA measurements and estimates, read against NASA's career limit.
// Pure function: radiationFor(data, profileId) -> null when the profile has no figure (Earth analog), otherwise
//   { kind, rateMSvDay, daysToLimit, limitMSv, text, sources }
//   kind: "measured" (an instrument in that place) | "typical" (NASA's range for crews) | "projected" (a NASA estimate)
//   daysToLimit: days to reach the career limit at that daily rate; null where NASA gives a dose for the whole stay.
// Data: public/data/radiation.json. On the way to Mars 1.8 mSv a day and on its surface 0.67, both measured by the RAD
// instrument of NASA's Mars Science Laboratory (Zeitlin et al. 2013; Hassler et al. 2014); the space station, the Moon
// and a whole Mars mission from Simonsen, Zawaski and Weeks (NASA); career limit of 600 mSv (NASA-STD-3001).
// Context for the mission chosen: averages that leave out a large solar storm. Not a dosimeter.
// License: MIT. Written with AI assistance (Claude, Anthropic).
import type { RadiationFile, RadiationInfo } from "../types";

const num = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function radiationFor(data: RadiationFile, profileId: string): RadiationInfo | null {
  const key = Object.hasOwn(data.by_profile, profileId) ? data.by_profile[profileId] : null;
  const env = key ? data.environments[key] : undefined;
  if (!env) return null;
  const limit = data.career_limit.mSv;
  const sources = [...env.sources, { short: data.career_limit.short, title: data.career_limit.title, url: data.career_limit.url }];
  const rate = env.rate_mSv_day;
  if (!rate) return { kind: env.kind, rateMSvDay: null, daysToLimit: null, limitMSv: limit, text: env.note ?? "", sources };
  const same = rate[0] === rate[1];
  const days: [number, number] = [Math.round(limit / rate[1]), Math.round(limit / rate[0])];
  const text =
    `Radiation: about ${same ? num(rate[0]) : `${num(rate[0])} to ${num(rate[1])}`} millisieverts a day` +
    `${env.kind === "measured" ? ", measured" : ""} ${env.where ?? ""}. ` +
    `NASA's career limit is ${num(limit)} mSv, reached after ${same ? `about ${num(days[0])}` : `${num(days[0])} to ${num(days[1])}`} days at this rate.` +
    (env.mission_note ? ` ${env.mission_note}` : "");
  return { kind: env.kind, rateMSvDay: rate, daysToLimit: days, limitMSv: limit, text, sources };
}
