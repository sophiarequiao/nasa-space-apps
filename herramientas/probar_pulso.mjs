// Prueba del núcleo de rppg.js con señales SINTÉTICAS de pulso conocido:  node herramientas/probar_pulso.mjs
// Piel a nivel 120/255, onda de pulso del 0,5 % (valor típico), deriva lenta de luz, ruido y fotogramas irregulares.
import { estimarPulso } from '../src/sensores/rppg.js';
let sem = 7; const rnd = () => ((sem = (sem * 16807) % 2147483647) / 2147483647);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());

function sintetica({ bpm, amp = 0.005, ruido = 0.25, dur = 14, fps = 30, nivel = 120, mov = 0, lento = 0, fLento = 0.6 }) {
  const t = [], r = [], g = [], b = []; let tt = 0;
  while (tt < dur * 1000) {
    const s = tt / 1000, f = bpm / 60;
    const pulso = bpm ? Math.sin(2 * Math.PI * f * s) + 0.3 * Math.sin(4 * Math.PI * f * s) : 0;
    const deriva = 1 + 0.02 * Math.sin(2 * Math.PI * 0.08 * s) + mov * 0.03 * Math.sin(2 * Math.PI * 0.45 * s + 1) + lento * Math.sin(2 * Math.PI * fLento * s + 2);
    t.push(tt);
    r.push(nivel * 1.25 * deriva * (1 + 0.4 * amp * pulso) + ruido * gauss());
    g.push(nivel * deriva * (1 + amp * pulso) + ruido * gauss());
    b.push(nivel * 0.85 * deriva * (1 + 0.6 * amp * pulso) + ruido * gauss());
    tt += 1000 / fps * (0.7 + 0.6 * rnd());            // intervalos irregulares, como una cámara web real
  }
  return [t, r, g, b];
}

const casos = [
  ['72 lpm, buena señal', { bpm: 72 }, 72],
  ['55 lpm', { bpm: 55 }, 55],
  ['110 lpm (tras un esfuerzo)', { bpm: 110 }, 110],
  ['72 lpm, cámara a 15 fps', { bpm: 72, fps: 15 }, 72],
  ['72 lpm, señal débil (0,2 %) y más ruido', { bpm: 72, amp: 0.002, ruido: 0.5 }, 72],
  ['72 lpm con movimiento de luz', { bpm: 72, mov: 1 }, 72],
  ['Sin pulso (solo ruido): no debe dar valor', { bpm: 0 }, null],
  ['Sin pulso y balanceo lento a 0,6 Hz (3 %): no debe dar valor', { bpm: 0, lento: 0.03 }, null],
  ['Sin pulso y balanceo a 0,66 Hz (3 %): no debe dar valor', { bpm: 0, lento: 0.03, fLento: 0.66 }, null],
  ['72 lpm con balanceo lento a 0,6 Hz (1 %): 72 o nada, nunca 42-46', { bpm: 72, lento: 0.01 }, 72],
  ['Poca luz (nivel 30): no debe dar valor', { bpm: 72, nivel: 30 }, null],
];
let fallos = 0;
for (const [nombre, p, esperado] of casos) {
  const fila = [];
  for (const metodo of ['verde', 'pos']) {
    const e = estimarPulso(...sintetica(p), { metodo });
    const mostrado = e.bpm_bruto != null && e.calidad >= 0.5;
    const ok = esperado == null ? !mostrado : (mostrado && Math.abs(e.bpm_bruto - esperado) <= 2);
    if (!ok && !(esperado != null && !mostrado)) fallos++;      // no mostrar un valor real no es un fallo grave; mostrar uno falso sí
    fila.push(`${metodo}: ${e.bpm_bruto == null ? '—' : e.bpm_bruto.toFixed(1)} lpm, calidad ${e.calidad.toFixed(2)}${e.motivo ? ' (' + e.motivo + ')' : ''} ${mostrado ? 'SE MUESTRA' : 'no se muestra'} ${ok ? 'OK' : 'REVISAR'}`);
  }
  console.log(`${nombre}\n   ${fila.join('\n   ')}`);
}
console.log(fallos ? `\n${fallos} casos muestran un valor que no deberían` : '\nNingún caso muestra un valor falso');
