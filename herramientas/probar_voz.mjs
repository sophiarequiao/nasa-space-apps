// Prueba de voz.js sin navegador con una señal SINTÉTICA de valores conocidos:
//   node herramientas/probar_voz.mjs
// Señal: «sílabas» de 150 ms (vocal con 5 armónicos) cada 200 ms -> 5 sílabas/s de habla,
// tono 110-130 Hz, una pausa de 0,6 s cada 2 s de habla, ruido de fondo a -45 dB.
import { analizarMuestras } from '../src/sensores/voz.js';

const FS = 16000;
function sintetica({ silabasPorSeg = 5, f0 = 120, pausa = 0.6, bloques = 8, silabasBloque = 10, semilla = 1 }) {
  let r = semilla; const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const out = []; const T = 1 / silabasPorSeg, L = 0.15;
  const ruido = () => (rnd() - 0.5) * 2 * 10 ** (-45 / 20);
  for (let i = 0; i < Math.round(0.5 * FS); i++) out.push(ruido());          // silencio inicial
  for (let b = 0; b < bloques; b++) {
    for (let k = 0; k < silabasBloque; k++) {
      const f = f0 * (1 + (rnd() - 0.5) * 0.16);                              // ±8 % de tono
      for (let i = 0; i < Math.round(T * FS); i++) {
        const t = i / FS;
        const env = t < L ? Math.sin(Math.PI * t / L) ** 2 : 0;
        let v = 0; for (let h = 1; h <= 5; h++) v += Math.sin(2 * Math.PI * f * h * t) / h;
        out.push(0.3 * env * v + ruido());
      }
    }
    if (b < bloques - 1) for (let i = 0; i < Math.round(pausa * FS); i++) out.push(ruido());
  }
  for (let i = 0; i < Math.round(0.5 * FS); i++) out.push(ruido());
  return Float32Array.from(out);
}

const media = { velocidad_habla: { media: 4.4, desv: 0.2 }, pausas: { media: 0.22, desv: 0.03 } };  // como CM-x en los datos sintéticos
const casos = [
  ['Normal: 5 síl/s, 120 Hz, 7 pausas de 0,6 s', {}],
  ['Lento: 3,5 síl/s, 200 Hz', { silabasPorSeg: 3.5, f0: 200 }],
];
for (const [nombre, p] of casos) {
  const t0 = performance.now();
  const { observaciones, resumen } = analizarMuestras(sintetica(p), FS, media, { tripulante: 'CM-2', fecha: '2026-11-14T08:12:00Z' });
  console.log(`\n== ${nombre}  (${Math.round(performance.now() - t0)} ms)`);
  for (const o of observaciones) console.log(`  ${o.senal.padEnd(22)} ${String(o.valor).padStart(7)} ${o.unidad.padEnd(10)} calidad ${o.calidad}  z ${resumen.z[o.senal] ?? '—'}`);
  console.log('  ' + resumen.texto);
}
