// Prueba de enlace.js sin navegador:  node herramientas/probar_enlace.mjs
import { readFileSync } from 'node:fs';
import { getEnlace, setDatosEnlace, formatearDuracion as f } from '../src/motor/enlace.js';
setDatosEnlace(JSON.parse(readFileSync(new URL('../datos/enlace.json', import.meta.url))));
const casos = [
  ['2026-11-14T12:00Z', 'marte',          'esperado ~10 min 59 s'],
  ['2026-11-15T12:00Z', 'marte',          'esperado ~10 min 54 s'],
  ['2034-09-03T12:00Z', 'marte',          'esperado ~22 min 11 s'],
  ['2028-03-20T12:00Z', 'marte',          'conjunción 13-29 mar 2028: sin enlace'],
  ['2026-11-14T12:00Z', 'iss',            'casi en directo'],
  ['2026-11-14T12:00Z', 'luna',           '~1,28 s'],
  ['2026-11-05T12:00Z', 'luna_polo_sur',  'primera mitad del ciclo: con enlace'],
  ['2026-11-20T12:00Z', 'luna_polo_sur',  'segunda mitad: sin enlace'],
];
for (const [fecha, perfil, nota] of casos) {
  const e = getEnlace(fecha, perfil);
  console.log(`${fecha} ${perfil.padEnd(14)} ida ${f(e.owlt_s).padEnd(13)} enlace=${e.hayEnlace ? 'sí' : 'NO (' + e.motivoSinEnlace + ', vuelve en ' + f(e.esperaHastaEnlace_s) + ')'}  · ${nota}`);
}
