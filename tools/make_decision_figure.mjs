// Draws "who decides" for a few situations and places, straight from the engine:  node tools/make_decision_figure.mjs
// Output: docs/who_decides.svg (no external fonts or images). Every cell is computed by src/engine/authority.js.
// Drafted with AI assistance (Claude, Anthropic). MIT licence.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { setLinkData } from '../src/engine/link.js';
import { setAuthorityData, computeAuthority } from '../src/engine/authority.js';

const J = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
setLinkData(J('../data/mars_link.json'));
setAuthorityData({ profiles: J('../data/mission_profiles.json'), cards: J('../data/condition_cards.json') });

const PLACES = [
  ['Space station', 'any day', 'iss', '2026-11-15T12:00:00Z'],
  ['Mars today', '15 Nov 2026', 'mars_surface', '2026-11-15T12:00:00Z'],
  ['Mars near its farthest', '3 Sep 2034', 'mars_surface', '2034-09-03T12:00:00Z'],
  ['Mars behind the Sun', '20 Mar 2028', 'mars_surface', '2028-03-20T12:00:00Z'],
];
const ROWS = [['eye_chemical_burn', 'Chemical eye burn'], ['suspected_stroke', 'Suspected stroke'], ['renal_colic', 'Kidney stone'], ['skin_infection', 'Skin infection']];
const span = (min) => min < 1 ? `${Math.round(min * 60)} s` : min < 120 ? `${Math.round(min)} min` : min < 2880 ? `${Math.round(min / 6) / 10} h` : `${Math.round(min / 144) / 10} days`;
const LOOK = { EARTH: ['Earth leads', '#DCE7FA', '#1857C4'], SHARED: ['Decide together', '#FBEBC8', '#8A5000'], CREW: ['The crew decides', '#F6DFD6', '#B4421F'] };

const W = 1200, H = 600, X0 = 300, CW = 215, Y0 = 196, RH = 78, GAP = 6;
const INK = '#10202E', MUT = '#566676', PAPER = '#EEF1F4';
const FONT = "Bahnschrift, 'DIN Alternate', 'Roboto Condensed', 'Segoe UI', Arial, sans-serif";
let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}" role="img" aria-label="Who decides for four situations in four places">\n<rect width="${W}" height="${H}" fill="${PAPER}"/>\n`;
s += `<text x="60" y="58" font-size="34" font-weight="600" fill="${INK}">The same problem, a different answer</text>\n`;
s += `<text x="60" y="90" font-size="18" fill="${MUT}">Who decides: the time Earth needs to answer on that day, against the time the crew can wait.</text>\n`;
const log = [];
PLACES.forEach(([name, day, profile, dateISO], c) => {
  const x = X0 + c * (CW + GAP), probe = computeAuthority({ profile, dateISO, condition: 'renal_colic' });
  const answer = probe.link.hasLink ? `Earth answers in ${span(probe.earthResponse_min)}` : `no link for ${span(probe.breakdown_min.wait)}`;
  s += `<text x="${x + CW / 2}" y="140" text-anchor="middle" font-size="19" font-weight="600" fill="${INK}">${name}</text>`;
  s += `<text x="${x + CW / 2}" y="162" text-anchor="middle" font-size="15" fill="${MUT}">${day}</text>`;
  s += `<text x="${x + CW / 2}" y="182" text-anchor="middle" font-size="15" fill="${MUT}">${answer}</text>\n`;
  ROWS.forEach(([id], r) => {
    const a = computeAuthority({ profile, dateISO, condition: id }), [label, bg, ink] = LOOK[a.whoDecides], y = Y0 + r * (RH + GAP);
    s += `<rect x="${x}" y="${y}" width="${CW}" height="${RH}" fill="${bg}"/><text x="${x + CW / 2}" y="${y + RH / 2 + 8}" text-anchor="middle" font-size="22" font-weight="600" fill="${ink}">${label}</text>\n`;
    log.push(`${name} | ${id} | ${a.whoDecides} | A=${a.A} | Earth ${a.earthResponse_min} min`);
  });
});
ROWS.forEach(([id, name], r) => {
  const y = Y0 + r * (RH + GAP), t = computeAuthority({ profile: 'iss', dateISO: '2026-11-15T12:00:00Z', condition: id }).tCrit_min;
  s += `<text x="60" y="${y + RH / 2 - 2}" font-size="21" font-weight="600" fill="${INK}">${name}</text><text x="60" y="${y + RH / 2 + 22}" font-size="15" fill="${MUT}">act within ${span(t)}</text>\n`;
});
s += `<text x="60" y="${H - 48}" font-size="15" fill="${INK}">Light time from NASA/JPL data (checked against JPL Horizons). Ground response of 15 min and times to act are team planning values, not clinical deadlines.</text>\n`;
s += `<text x="60" y="${H - 24}" font-size="14" fill="${MUT}">Computed by src/engine/authority.js. Redraw with: node tools/make_decision_figure.mjs</text>\n</svg>\n`;
mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
writeFileSync(new URL('../docs/who_decides.svg', import.meta.url), s);
console.log('docs/who_decides.svg written'); console.log(log.join('\n'));
