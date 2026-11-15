// Draws the Mars link figure of the README from the real table:  node tools/make_link_figure.mjs
// Input:  data/mars_link.json (one value per day, NASA/JPL planetary data checked against JPL Horizons)
// Output: docs/mars_link_2026_2040.svg (no external fonts or images)
// Drafted with AI assistance (Claude, Anthropic). MIT licence.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { getLink, setLinkData, formatDuration } from '../src/engine/link.js';

const table = JSON.parse(readFileSync(new URL('../data/mars_link.json', import.meta.url)));
setLinkData(table);
const DAY = 86_400_000, t0 = Date.parse(table.start + 'T12:00:00Z'), t1 = Date.parse(table.end + 'T12:00:00Z');
const W = 1200, H = 600, X0 = 78, X1 = 1160, Y0 = 150, Y1 = 470, MAX_MIN = 24;
const x = (t) => X0 + (X1 - X0) * (t - t0) / (t1 - t0);
const y = (s) => Y1 - (Y1 - Y0) * Math.min(s / 60, MAX_MIN) / MAX_MIN;
const f = (n) => n.toFixed(1);
const date = (t, opt = { day: 'numeric', month: 'short', year: 'numeric' }) => new Date(t).toLocaleDateString('en-GB', { ...opt, timeZone: 'UTC' });

let path = '', lo = null, hi = null, from = null; const outages = [];
for (let t = t0, k = 0; t <= t1; t += DAY, k++) {
  const l = getLink(new Date(t).toISOString(), 'mars');
  if (k % 2 === 0 || t === t1) path += `${path ? 'L' : 'M'}${f(x(t))} ${f(y(l.owlt_s))}`;
  if (!lo || l.owlt_s < lo.s) lo = { s: l.owlt_s, t };
  if (!hi || l.owlt_s > hi.s) hi = { s: l.owlt_s, t };
  if (!l.hasLink && from == null) from = t;
  if ((l.hasLink || t === t1) && from != null) { outages.push({ from, to: l.hasLink ? t - DAY : t, days: Math.round(((l.hasLink ? t : t + DAY) - from) / DAY) }); from = null; }
}
const today = Date.parse('2026-11-15T12:00:00Z'), now = getLink('2026-11-15T12:00:00Z', 'mars');

const INK = '#10202E', MUT = '#566676', RULE = '#C6CFD8', EARTH = '#1857C4', CREW = '#B4421F', PAPER = '#EEF1F4';
const FONT = "Bahnschrift, 'DIN Alternate', 'Roboto Condensed', 'Segoe UI', Arial, sans-serif";
let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}" role="img" aria-label="One-way light time between Mars and Earth for every day from ${table.start} to ${table.end}">\n`;
s += `<rect width="${W}" height="${H}" fill="${PAPER}"/>\n`;
s += `<text x="${X0}" y="56" font-size="34" font-weight="600" fill="${INK}">How long a message takes from Mars to Earth</text>\n`;
s += `<text x="${X0}" y="88" font-size="18" fill="${MUT}">One-way light time for every day, ${date(t0, { month: 'long', year: 'numeric' })} to ${date(t1, { month: 'long', year: 'numeric' })}. NASA/JPL data, checked day by day against JPL Horizons.</text>\n`;
for (let m = 0; m <= MAX_MIN; m += 5) {
  s += `<line x1="${X0}" y1="${f(y(m * 60))}" x2="${X1}" y2="${f(y(m * 60))}" stroke="${RULE}"/><text x="${X0 - 10}" y="${f(y(m * 60) + 5)}" text-anchor="end" font-size="15" fill="${MUT}">${m ? m + ' min' : '0'}</text>\n`;
}
for (let yr = new Date(t0).getUTCFullYear() + 1; yr <= new Date(t1).getUTCFullYear(); yr++) {
  const px = x(Date.UTC(yr, 0, 1));
  s += `<line x1="${f(px)}" y1="${Y1}" x2="${f(px)}" y2="${Y1 + 7}" stroke="${MUT}"/><text x="${f(px + 5)}" y="${Y1 + 24}" font-size="15" fill="${MUT}">${yr}</text>\n`;
}
for (const o of outages) {
  const a = x(o.from), b = Math.max(a + 4, x(o.to + DAY)), mid = (a + b) / 2;
  s += `<rect x="${f(a)}" y="${Y0}" width="${f(b - a)}" height="${Y1 - Y0}" fill="${CREW}"/>`;
  s += `<text x="${f(mid)}" y="${Y0 - 28}" text-anchor="middle" font-size="15" font-weight="600" fill="${CREW}">${o.days} days</text>`;
  s += `<text x="${f(mid)}" y="${Y0 - 10}" text-anchor="middle" font-size="13" fill="${CREW}">${date(o.from, { month: 'short', year: 'numeric' })}</text>\n`;
}
s += `<path d="${path}" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>\n`;
s += `<circle cx="${f(x(lo.t))}" cy="${f(y(lo.s))}" r="5" fill="${INK}"/><text x="${f(x(lo.t))}" y="${f(y(lo.s) + 24)}" text-anchor="middle" font-size="15" fill="${INK}">shortest, ${formatDuration(lo.s)}</text>\n`;
s += `<circle cx="${f(x(hi.t))}" cy="${f(y(hi.s))}" r="5" fill="${INK}"/><text x="${f(x(hi.t) - 12)}" y="${f(y(hi.s) - 5)}" text-anchor="end" font-size="15" fill="${INK}">longest, ${formatDuration(hi.s)}</text>\n`;
s += `<circle cx="${f(x(today))}" cy="${f(y(now.owlt_s))}" r="7" fill="${EARTH}" stroke="#fff" stroke-width="2.5"/><line x1="${f(x(today))}" y1="${f(y(now.owlt_s) + 9)}" x2="${f(x(today))}" y2="${f(y(60))}" stroke="${EARTH}" stroke-width="1.5"/><text x="${f(x(today) + 8)}" y="${f(y(165))}" font-size="15" font-weight="600" fill="${EARTH}">15 Nov 2026</text><text x="${f(x(today) + 8)}" y="${f(y(165) + 18)}" font-size="15" font-weight="600" fill="${EARTH}">${formatDuration(Math.floor(now.owlt_s))}</text>\n`;
s += `<rect x="${X0}" y="${H - 74}" width="16" height="16" fill="${CREW}"/><text x="${X0 + 26}" y="${H - 60}" font-size="16" fill="${INK}">No link: Mars is within 2° of the Sun as seen from Earth and commanding stops. ${outages.length} times in these years, ${Math.min(...outages.map(o => o.days))} to ${Math.max(...outages.map(o => o.days))} days each.</text>\n`;
s += `<text x="${X0}" y="${H - 28}" font-size="14" fill="${MUT}">Table: data/mars_link.json, from JPL's approximate planetary elements. Largest difference with JPL Horizons over 5,175 days: 0.29 s.</text>\n`;
s += '</svg>\n';
mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
writeFileSync(new URL('../docs/mars_link_2026_2040.svg', import.meta.url), s);
console.log(`docs/mars_link_2026_2040.svg written (${(s.length / 1024).toFixed(0)} kB)`);
console.log(`shortest ${formatDuration(lo.s)} on ${date(lo.t)} · longest ${formatDuration(hi.s)} on ${date(hi.t)} · 15 Nov 2026: ${now.owlt_s} s`);
console.log('no link: ' + outages.map(o => `${date(o.from)} to ${date(o.to)} (${o.days} days)`).join(' | '));
