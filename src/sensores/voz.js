// src/sensores/voz.js — «El mensaje es la medición»: analiza el mensaje de voz diario a la Tierra.
// API: analizarVoz(audioBlob, mediaPersonal, opciones?) -> Promise<{observaciones:[...], resumen}>
//   mediaPersonal: { velocidad_habla:{media,desv}, pausas:{media,desv}, f0_media:{...}, ... } (línea base antes del vuelo)
//   opciones: { tripulante:'CM-2', fecha:'2026-11-14T08:12:00Z' }
// Medidas (aproximaciones, NO transcripción ni diagnóstico):
//   velocidad_habla  sílabas/s de habla (picos de energía con voz; idea de De Jong y Wempe 2009, Praat)
//   pausas           fracción de silencio (tramos >250 ms) dentro del mensaje
//   numero_pausas, duracion_media_pausa, duracion_mensaje
//   f0_media (Hz) y f0_variabilidad (semitonos) con YIN (de Cheveigné y Kawahara 2002), rango 70-400 Hz
// Privacidad: el audio no sale del navegador; solo se devuelven las medidas.
// Umbrales marcados HIPÓTESIS: elegidos por el equipo, a ajustar con grabaciones reales.
// Código generado con ayuda de IA (Claude, Anthropic). Licencia MIT.

const FS = 16000;               // se remuestrea todo a 16 kHz mono
const PASO_S = 0.010;           // 10 ms entre tramas de energía
const VENTANA_S = 0.025;        // 25 ms de ventana de energía
const PAUSA_MIN_S = 0.25;       // pausa = silencio > 250 ms (guía del equipo)
const SILABA_MIN_S = 0.10;      // como mucho ~10 sílabas/s (HIPÓTESIS)
const PROMINENCIA_DB = 2.0;     // un pico de sílaba sobresale >= 2 dB del valle anterior (HIPÓTESIS)
const F0_MIN = 70, F0_MAX = 400;
const YIN_UMBRAL = 0.15;
export const SENALES_VOZ = ['velocidad_habla', 'pausas', 'numero_pausas', 'duracion_media_pausa', 'f0_media', 'f0_variabilidad', 'duracion_mensaje'];

// ---------------------------------------------------------------------------
// Entrada desde el navegador: Blob (MediaRecorder o archivo) -> muestras mono 16 kHz
export async function analizarVoz(audioBlob, mediaPersonal = {}, opciones = {}) {
  const buf = await audioBlob.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  let audio;
  try { audio = await ctx.decodeAudioData(buf); } finally { ctx.close && ctx.close(); }
  const n = Math.max(1, Math.ceil(audio.duration * FS));
  const off = new OfflineAudioContext(1, n, FS);           // mezcla a mono y remuestrea
  const src = off.createBufferSource();
  src.buffer = audio; src.connect(off.destination); src.start();
  const mono = (await off.startRendering()).getChannelData(0);
  return analizarMuestras(mono, FS, mediaPersonal, opciones);
}

// ---------------------------------------------------------------------------
// Núcleo puro (sin APIs del navegador): se puede probar en Node
export function analizarMuestras(x, fs, mediaPersonal = {}, opciones = {}) {
  const tripulante = opciones.tripulante || 'CM-1';
  const fecha = opciones.fecha || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const dur = x.length / fs;

  // 1) Quitar la componente continua
  let m = 0; for (let i = 0; i < x.length; i++) m += x[i]; m /= x.length || 1;
  const s = new Float32Array(x.length); for (let i = 0; i < x.length; i++) s[i] = x[i] - m;

  // 2) Energía por trama (dB) y suavizado de 50 ms
  const paso = Math.round(PASO_S * fs), win = Math.round(VENTANA_S * fs);
  const nT = Math.max(0, Math.floor((s.length - win) / paso) + 1);
  const db = new Float32Array(nT);
  for (let t = 0; t < nT; t++) {
    let e = 0; const o = t * paso;
    for (let j = 0; j < win; j++) e += s[o + j] * s[o + j];
    db[t] = 10 * Math.log10(e / win + 1e-12);
  }
  const dbs = mediaMovil(db, 5);

  // 3) Umbral de silencio adaptativo con percentiles (ruido = p10, voz = p95)
  const p10 = percentil(dbs, 0.10), p95 = percentil(dbs, 0.95);
  const rango = p95 - p10;
  const umbral = p10 + Math.max(6, 0.35 * rango);             // HIPÓTESIS
  const voz = Array.from(dbs, v => v > umbral);
  const primero = voz.indexOf(true), ultimo = voz.lastIndexOf(true);
  if (primero < 0 || nT === 0) return vacio(tripulante, fecha, dur, 'No se detecta voz en la grabación.');

  // 4) Pausas: tramos sin voz > 250 ms dentro del mensaje
  const pausas = [];
  let ini = -1;
  for (let t = primero; t <= ultimo; t++) {
    if (!voz[t] && ini < 0) ini = t;
    if (voz[t] && ini >= 0) { const d = (t - ini) * PASO_S; if (d >= PAUSA_MIN_S) pausas.push(d); ini = -1; }
  }
  const durMensaje = (ultimo - primero + 1) * PASO_S;
  const tPausas = pausas.reduce((a, b) => a + b, 0);
  const tHabla = Math.max(durMensaje - tPausas, 1e-3);

  // 5) F0 con YIN cada 20 ms en las tramas con voz
  const tauMin = Math.floor(fs / F0_MAX), tauMax = Math.ceil(fs / F0_MIN);
  const wYin = Math.round(0.025 * fs);
  const f0Trama = new Float32Array(nT).fill(NaN);
  for (let t = primero; t <= ultimo; t += 2) {
    if (!voz[t]) continue;
    const o = t * paso;
    if (o + wYin + tauMax >= s.length) break;
    const f = yin(s, o, wYin, fs, tauMin, tauMax);
    if (f) { f0Trama[t] = f; if (t + 1 < nT) f0Trama[t + 1] = f; }
  }
  // Quitar saltos de octava: fuera de [mediana/1,8, mediana×1,8]
  const f0Bruto = Array.from(f0Trama).filter(v => !Number.isNaN(v));
  const med = mediana(f0Bruto);
  const f0 = f0Bruto.filter(v => v > med / 1.8 && v < med * 1.8);
  const tramasVoz = voz.slice(primero, ultimo + 1).filter(Boolean).length;
  const fracSonora = tramasVoz ? f0.length / tramasVoz : 0;

  // 6) Sílabas: picos de energía con voz, prominentes y separados >= 100 ms
  let silabas = 0, ultimoPico = -1e9, valorUltimo = -Infinity, minDesde = umbral;
  const sep = Math.round(SILABA_MIN_S / PASO_S);
  for (let t = Math.max(1, primero); t < Math.min(ultimo, nT - 1); t++) {
    minDesde = Math.min(minDesde, dbs[t]);
    const esMax = dbs[t] > dbs[t - 1] && dbs[t] >= dbs[t + 1] && voz[t];
    const sonora = !Number.isNaN(f0Trama[t]) || !Number.isNaN(f0Trama[t - 1]) || !Number.isNaN(f0Trama[t + 1]);
    if (!esMax || !sonora || dbs[t] - minDesde < PROMINENCIA_DB) continue;
    if (t - ultimoPico < sep) {                 // demasiado cerca: nos quedamos con el más alto
      if (dbs[t] > valorUltimo) { ultimoPico = t; valorUltimo = dbs[t]; }
      continue;
    }
    silabas++; ultimoPico = t; valorUltimo = dbs[t]; minDesde = dbs[t];
  }

  // 7) Calidad (0-1): relación señal/ruido, duración y fracción sonora — HIPÓTESIS
  const qSnr = limitar((rango - 10) / 20);      // 10 dB -> 0 ; 30 dB -> 1
  const qDur = limitar(durMensaje / 10);        // >= 10 s de mensaje -> 1
  const calidad = r2(qSnr * qDur);
  const calidadF0 = r2(calidad * limitar(fracSonora / 0.3));

  // 8) Medidas
  const f0Media = f0.length ? f0.reduce((a, b) => a + b, 0) / f0.length : null;
  const st = f0.map(v => 12 * Math.log2(v / med));
  const f0Var = st.length > 1 ? desviacion(st) : null;
  const medidas = [
    ['velocidad_habla', r2(silabas / tHabla), 'silabas/s', 'estimado', calidad],
    ['pausas', r2(tPausas / durMensaje), 'fraccion', 'estimado', calidad],
    ['numero_pausas', pausas.length, 'n', 'estimado', calidad],
    ['duracion_media_pausa', pausas.length ? r2(tPausas / pausas.length) : 0, 's', 'estimado', calidad],
    ['f0_media', f0Media == null ? null : Math.round(f0Media * 10) / 10, 'Hz', 'estimado', calidadF0],
    ['f0_variabilidad', f0Var == null ? null : r2(f0Var), 'st', 'estimado', calidadF0],
    ['duracion_mensaje', Math.round(durMensaje), 's', 'clinico', 1],
  ];
  const observaciones = medidas
    .filter(([, v]) => v != null)
    .map(([senal, valor, unidad, metodo, q]) => ({
      tripulante, senal, valor, unidad, fecha, fuente: 'microfono', metodo, calidad: q, region_cuerpo: 'cerebro',
    }));

  return { observaciones, resumen: resumir(observaciones, mediaPersonal, { dur, durMensaje, calidad, rango }) };
}

// ---------------------------------------------------------------------------
// Línea base personal a partir de observaciones (por ejemplo, observaciones_sinteticas.json, fase pre_vuelo)
export function calcularMediaPersonal(observaciones, tripulante, fase = 'pre_vuelo') {
  const porSenal = {};
  for (const o of observaciones) {
    if (o.tripulante !== tripulante || (fase && o.fase && o.fase !== fase)) continue;
    if (!SENALES_VOZ.includes(o.senal) || typeof o.valor !== 'number') continue;
    (porSenal[o.senal] ||= []).push(o.valor);
  }
  const media = {};
  for (const [k, v] of Object.entries(porSenal)) {
    const mu = v.reduce((a, b) => a + b, 0) / v.length;
    media[k] = { media: r2(mu), desv: v.length > 1 ? r2(desviacion(v)) : null, n: v.length };
  }
  return media;
}

// z = (valor − media personal) / desviación. |z| >= 2 -> cambio respecto a tu media
function resumir(obs, mediaPersonal, info) {
  const z = {}, cambios = [];
  const nombres = { velocidad_habla: 'Velocidad del habla', pausas: 'Silencio en el mensaje', numero_pausas: 'Número de pausas',
    duracion_media_pausa: 'Duración media de las pausas', f0_media: 'Tono medio', f0_variabilidad: 'Variación del tono', duracion_mensaje: 'Duración del mensaje' };
  for (const o of obs) {
    const b = mediaPersonal && mediaPersonal[o.senal];
    if (!b || !b.desv) { z[o.senal] = null; continue; }
    z[o.senal] = r2((o.valor - b.media) / b.desv);
    if (Math.abs(z[o.senal]) >= 2 && o.calidad >= 0.4) {
      cambios.push(`${nombres[o.senal]}: ${fmt(o.valor)} ${o.unidad}, ${z[o.senal] > 0 ? 'por encima' : 'por debajo'} de tu media personal (${fmt(b.media)}; z = ${fmt(z[o.senal])}).`);
    }
  }
  let texto;
  if (info.calidad < 0.4) texto = 'Calidad baja de la grabación: repite el mensaje en un sitio más silencioso y habla al menos 10 s.';
  else if (cambios.length) texto = 'Cambio respecto a tu media personal en: ' + cambios.map(c => c.split(':')[0]).join(', ') + '.';
  else texto = 'Dentro de tu media personal.';
  return { duracion_s: r2(info.dur), duracion_mensaje_s: r2(info.durMensaje), calidad: info.calidad, snr_db: r2(info.rango), z, cambios, texto };
}

function vacio(tripulante, fecha, dur, motivo) {
  return { observaciones: [], resumen: { duracion_s: r2(dur), calidad: 0, z: {}, cambios: [], texto: motivo } };
}

// ---------------------------------------------------------------------------
// YIN: función de diferencia normalizada acumulada + interpolación parabólica
function yin(x, o, W, fs, tauMin, tauMax) {
  const d = new Float32Array(tauMax + 2);
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    let acc = 0;
    for (let j = 0; j < W; j++) { const df = x[o + j] - x[o + j + tau]; acc += df * df; }
    d[tau] = acc;
  }
  const dn = new Float32Array(tauMax + 2); dn[0] = 1;
  let suma = 0;
  for (let tau = 1; tau <= tauMax + 1; tau++) { suma += d[tau]; dn[tau] = suma > 0 ? d[tau] * tau / suma : 1; }
  let tau = -1;
  for (let k = tauMin; k <= tauMax; k++) {
    if (dn[k] < YIN_UMBRAL) { while (k + 1 <= tauMax && dn[k + 1] < dn[k]) k++; tau = k; break; }
  }
  if (tau < 0) return null;
  const a = dn[tau - 1], b = dn[tau], c = dn[tau + 1];
  const den = a - 2 * b + c;
  const t = den !== 0 ? tau + 0.5 * (a - c) / den : tau;
  const f = fs / t;
  return f >= F0_MIN && f <= F0_MAX ? f : null;
}

// --- utilidades ---------------------------------------------------------------
function mediaMovil(v, k) {
  const out = new Float32Array(v.length), h = Math.floor(k / 2);
  for (let i = 0; i < v.length; i++) {
    let a = 0, n = 0;
    for (let j = Math.max(0, i - h); j <= Math.min(v.length - 1, i + h); j++) { a += v[j]; n++; }
    out[i] = a / n;
  }
  return out;
}
function percentil(v, p) { if (!v.length) return 0; const o = Array.from(v).sort((a, b) => a - b); return o[Math.min(o.length - 1, Math.floor(p * (o.length - 1)))]; }
function mediana(v) { return v.length ? percentil(v, 0.5) : NaN; }
function desviacion(v) { const mu = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / (v.length - 1)); }
function limitar(v) { return Math.max(0, Math.min(1, v)); }
function r2(v) { return Math.round(v * 100) / 100; }
function fmt(v) { return String(v).replace('.', ','); }
