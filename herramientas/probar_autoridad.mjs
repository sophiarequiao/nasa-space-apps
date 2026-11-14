// Prueba de autoridad.js contra la salida de referencia de motor_autoridad.py:
//   node herramientas/probar_autoridad.mjs
import { readFileSync } from 'node:fs';
import { setDatosEnlace } from '../src/motor/enlace.js';
import { calcularAutoridad, setDatosAutoridad } from '../src/motor/autoridad.js';
const leer = (r) => JSON.parse(readFileSync(new URL(r, import.meta.url)));
setDatosEnlace(leer('../datos/enlace.json'));
setDatosAutoridad({ perfiles: leer('../datos/perfiles_mision.json'), fichas: leer('../datos/condition_cards.json') });

// [perfil, fecha, condición, A de referencia (Python), quién de referencia]
const REF = [
  ['iss', '2026-11-14T12:00:00Z', 'eye_chemical_burn', 3.00, 'TRIPULACION'],
  ['iss', '2026-11-14T12:00:00Z', 'suspected_sepsis', 0.25, 'COMPARTIDA'],
  ['iss', '2026-11-14T12:00:00Z', 'renal_colic', 0.06, 'TIERRA'],
  ['luna_rele', '2026-11-14T12:00:00Z', 'renal_colic', 0.06, 'TIERRA'],
  ['marte_superficie', '2026-11-14T12:00:00Z', 'eye_chemical_burn', 7.46, 'TRIPULACION'],
  ['marte_superficie', '2026-11-14T12:00:00Z', 'suspected_sepsis', 0.62, 'COMPARTIDA'],
  ['marte_superficie', '2026-11-14T12:00:00Z', 'suspected_stroke', 0.65, 'COMPARTIDA'],
  ['marte_superficie', '2026-11-14T12:00:00Z', 'renal_colic', 0.16, 'TIERRA'],
  ['marte_superficie', '2034-09-03T12:00:00Z', 'eye_chemical_burn', 12.14, 'TRIPULACION'],
  ['marte_superficie', '2034-09-03T12:00:00Z', 'suspected_stroke', 1.14, 'TRIPULACION'],
  ['marte_superficie', '2034-09-03T12:00:00Z', 'renal_colic', 0.25, 'COMPARTIDA'],
  ['marte_superficie', '2034-09-03T12:00:00Z', 'suspected_sepsis', 0.99, 'COMPARTIDA'],
  ['marte_superficie', '2028-03-13T12:00:00Z', 'renal_colic', 102.23, 'TRIPULACION'],
  ['marte_superficie', '2028-03-13T12:00:00Z', 'sans', 1.22, 'TRIPULACION'],
];
let fallos = 0;
for (const [perfil, fechaISO, condicion, aRef, quienRef] of REF) {
  const r = calcularAutoridad({ perfil, fechaISO, condicion });
  const okA = Math.abs(r.A - aRef) <= Math.max(0.011, 0.05 * aRef);   // 5 %: la espera sin enlace se calcula distinto (ver nota)
  const ok = okA && r.quienDecide === quienRef;
  if (!ok) fallos++;
  console.log(`${ok ? 'OK  ' : 'FALLO'} ${perfil.padEnd(17)} ${fechaISO.slice(0, 10)} ${condicion.padEnd(18)} A=${String(r.A).padStart(7)} (ref ${aRef}) ${r.quienDecide.padEnd(11)} (ref ${quienRef})`);
}
console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo coincide con motor_autoridad.py');

console.log('\n--- Frases de la demo (cólico renal, domingo 15-nov 17:30 hora de Sevilla) ---');
for (const perfil of ['iss', 'luna_polo_sur', 'marte']) {
  const r = calcularAutoridad({ perfil, fechaISO: '2026-11-15T16:30:00Z', condicion: 'colico_renal' });
  console.log(`[${r.perfil.nombre}] ${r.quienDecide} (A=${r.A})\n   ${r.explicacion}\n   ${r.explicacion_en}`);
}
const o = calcularAutoridad({ perfil: 'marte', fechaISO: '2026-11-15T16:30:00Z', condicion: 'quemadura_ocular' });
console.log(`[Marte, ojo] ${o.quienDecide} (A=${o.A})\n   ${o.explicacion}`);
process.exit(fallos ? 1 : 0);
