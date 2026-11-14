// src/motor/autoridad.js — Motor de autoridad: ¿esperamos a la Tierra o decide la tripulación?
// Port de motor_autoridad.py (implementación de referencia, en Drive: 03_Datos). Su salida está en salida_motor_autoridad.txt.
//
//   T_tierra = espera hasta que haya enlace + envío del paquete + ida y vuelta de la luz + respuesta en Tierra
//   A = T_tierra / T_crit
//     A <= 0,25        -> TIERRA       (lidera la Tierra; la tripulación ejecuta)
//     0,25 < A <= 1    -> COMPARTIDA   (acciones seguras ya + resumen + punto de control a la hora de respuesta)
//     A > 1            -> TRIPULACION  (decide la tripulación; se informa a la Tierra después)
//
// API: calcularAutoridad({perfil, fechaISO, condicion}) -> {A, quienDecide, explicacion, ...detalle}
//   perfil:    id de datos/perfiles_mision.json ('iss', 'luna_polo_sur', 'marte_superficie'...) o alias ('luna', 'marte')
//   condicion: id de datos/condition_cards.json ('renal_colic' o 'colico_renal') o un objeto con t_crit_min
// SUPUESTOS del equipo (en perfiles_mision.json): 15 min de respuesta en Tierra, umbrales 0,25 y 1,
// 10 % del enlace para medicina, guía en directo solo con ida y vuelta <= 3 s. No es un dispositivo médico.
// Código generado con ayuda de IA (Claude, Anthropic). Licencia MIT.

import { getEnlace } from './enlace.js';

const C_KM_S = 299_792.458, AU_KM = 149_597_870.7;

let PERFILES = null, SUPUESTOS = null, FICHAS = null;
export function setDatosAutoridad({ perfiles, fichas }) {     // para pruebas fuera del navegador
  if (perfiles) { PERFILES = perfiles.perfiles; SUPUESTOS = perfiles.supuestos; }
  if (fichas) FICHAS = fichas.cards || fichas;
}
if (typeof window !== 'undefined') {
  try {
    const [p, f] = await Promise.all([
      fetch(new URL('../../datos/perfiles_mision.json', import.meta.url)).then(r => r.json()),
      fetch(new URL('../../datos/condition_cards.json', import.meta.url)).then(r => r.json()),
    ]);
    setDatosAutoridad({ perfiles: p, fichas: f });
  } catch (e) {
    console.error('[autoridad] No se pudieron cargar los datos', e);
  }
}

// Alias: los tres botones de la demo y los ids en español de las hojas de Sophia S.
const ALIAS_PERFIL = { luna: 'luna_rele', marte: 'marte_superficie', orbita_baja: 'iss', luna_sin_rele: 'luna_polo_sur' };
const ALIAS_FICHA = {
  colico_renal: 'renal_colic', sepsis: 'suspected_sepsis', sospecha_sepsis: 'suspected_sepsis',
  quemadura_ocular: 'eye_chemical_burn', quemadura_quimica_ojo: 'eye_chemical_burn', inhalacion_humo: 'smoke_inhalation',
  ictus: 'suspected_stroke', apendicitis: 'appendicitis', retencion_urinaria: 'urinary_retention_uti',
  infeccion_piel: 'skin_infection', herpes_zoster: 'herpes_zoster', trombosis_yugular: 'jugular_vte',
  sans: 'sans', sueno_fatiga: 'sleep_fatigue',
};
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/[\s-]+/g, '_');

export function listarPerfiles() { return (PERFILES || []).map(p => ({ id: p.id, nombre: p.nombre, name_en: p.name_en })); }
export function listarCondiciones() { return (FICHAS || []).map(f => ({ id: f.id, nombre: f.name_es || f.name, t_crit_min: f.t_crit_min })); }
export function getPerfil(perfil) {
  if (!PERFILES) throw new Error('[autoridad] datos/perfiles_mision.json no cargado');
  const id = ALIAS_PERFIL[norm(perfil)] || norm(perfil);
  const p = PERFILES.find(x => x.id === id);
  if (!p) throw new Error(`[autoridad] Perfil desconocido: «${perfil}». Usa: ${PERFILES.map(x => x.id).join(', ')}`);
  return p;
}
function getFicha(condicion) {
  if (condicion && typeof condicion === 'object') {
    if (!(condicion.t_crit_min > 0)) throw new Error('[autoridad] La condición necesita t_crit_min > 0');
    return condicion;
  }
  if (!FICHAS) throw new Error('[autoridad] datos/condition_cards.json no cargado');
  const id = ALIAS_FICHA[norm(condicion)] || norm(condicion);
  const f = FICHAS.find(x => x.id === id);
  if (!f) throw new Error(`[autoridad] Condición desconocida: «${condicion}». Usa: ${FICHAS.map(x => x.id).join(', ')}`);
  return f;
}

// Tasa de datos médica desde Marte (kbps): modelo 1/d² anclado a cifras publicadas de MRO (0,6-2,6 Mbps) × cuota médica.
// Es un marcador de posición (igual que en motor_autoridad.py): sustituir por un balance de enlace propio.
function tasaMarteKbps(owlt_s, cuota) {
  const d_au = owlt_s * C_KM_S / AU_KM;
  return Math.max(600, Math.min(2600, 4280 / d_au ** 2)) * cuota;
}

export function calcularAutoridad({ perfil, fechaISO, condicion }) {
  const p = getPerfil(perfil);
  const ficha = getFicha(condicion);
  const S = SUPUESTOS;
  const fecha = fechaISO || new Date().toISOString();
  const e = getEnlace(fecha, p.enlace);

  // Desglose de T_tierra (minutos)
  const kB = ficha.paquete_kB ?? (ficha.packet || []).reduce((a, x) => a + (x.size_kB_estimate || 0), 0);
  const tasa = p.tasa_medica_kbps ?? tasaMarteKbps(e.owlt_s, S.cuota_medica_del_enlace);
  const espera_min = (e.esperaHastaEnlace_s ?? 0) / 60;
  const envio_min = kB * 8 / tasa / 60;
  const luz_min = e.rtt_s / 60;
  const respuesta_min = S.t_respuesta_tierra_min;
  const t_tierra_min = espera_min + envio_min + luz_min + respuesta_min;

  const A = t_tierra_min / ficha.t_crit_min;
  const quienDecide = A > S.umbral_tripulacion ? 'TRIPULACION' : (A > S.umbral_tierra ? 'COMPARTIDA' : 'TIERRA');
  const EN = { TRIPULACION: 'CREW', COMPARTIDA: 'SHARED', TIERRA: 'EARTH' };

  // ¿Qué ayuda puede dar la Tierra? La guía en directo (p. ej. ecografía guiada) solo con ida y vuelta <= 3 s
  const guiaEnDirecto = e.hayEnlace && e.rtt_s <= S.ida_y_vuelta_max_guia_en_directo_s;
  let modo = ficha.earth_best_mode || 'text';
  if (modo === 'live_video' && !guiaEnDirecto) modo = 'async_images';
  const sinGuia = (ficha.earth_best_mode === 'live_video') && !guiaEnDirecto;

  const nombre = ficha.name_es || ficha.nombre || ficha.name || ficha.id || 'esta situación';
  const name_en = ficha.name || ficha.name_en || ficha.id || 'this condition';
  const tT = fmtMin(t_tierra_min), tC = fmtMin(ficha.t_crit_min);
  const MOTIVO = { conjuncion_solar: 'conjunción solar', tierra_bajo_horizonte: 'la Tierra está bajo el horizonte' };
  const MOTIVO_EN = { conjuncion_solar: 'solar conjunction', tierra_bajo_horizonte: 'Earth is below the horizon' };

  // Frase legible: «Cólico renal: la Tierra responde en 37 min y hay 4 h de margen; lidera la Tierra...»
  const tTen = fmtMin(t_tierra_min, 'en'), tCen = fmtMin(ficha.t_crit_min, 'en');
  let explicacion, explicacion_en;
  if (!e.hayEnlace) {
    const fin = quienDecide === 'TRIPULACION'
      ? ['decide la tripulación e informa al recuperar el enlace.', 'the crew decides and reports when the link is back.']
      : ['la tripulación empieza las acciones seguras y revisa con la Tierra cuando vuelva el enlace.', 'the crew starts the safe actions and reviews with Earth when the link is back.'];
    explicacion = `${nombre}: sin enlace con la Tierra durante ${fmtMin(espera_min)} (${MOTIVO[e.motivoSinEnlace] || e.motivoSinEnlace}) y hay que actuar en ${tC}; ${fin[0]}`;
    explicacion_en = `${name_en}: no link to Earth for ${fmtMin(espera_min, 'en')} (${MOTIVO_EN[e.motivoSinEnlace] || e.motivoSinEnlace}) and action is needed within ${tCen}; ${fin[1]}`;
  } else if (quienDecide === 'TRIPULACION') {
    explicacion = `${nombre}: la Tierra tardaría ${tT} en responder y hay que actuar en ${tC}; decide la tripulación e informa después.`;
    explicacion_en = `${name_en}: Earth would answer in ${tTen} and action is needed within ${tCen}; the crew decides and reports afterwards.`;
  } else if (quienDecide === 'COMPARTIDA') {
    explicacion = `${nombre}: la Tierra tardaría ${tT} y hay ${tC} para actuar; la tripulación empieza ya las acciones seguras, envía el resumen y revisa con la Tierra cuando responda.`;
    explicacion_en = `${name_en}: Earth would answer in ${tTen} and there are ${tCen} to act; the crew starts the safe actions now, sends the summary and reviews with Earth when it answers.`;
  } else {
    explicacion = `${nombre}: la Tierra responde en ${tT} y hay ${tC} de margen; lidera la Tierra y la tripulación ejecuta.`;
    explicacion_en = `${name_en}: Earth answers in ${tTen} and there is a ${tCen} margin; Earth leads and the crew executes.`;
  }
  if (sinGuia) { explicacion += ' Sin guía en directo: solo imágenes y texto.'; explicacion_en += ' No live guidance: images and text only.'; }

  return {
    A: Math.round(A * 100) / 100,
    quienDecide,                       // 'TIERRA' | 'COMPARTIDA' | 'TRIPULACION'
    quienDecide_en: EN[quienDecide],   // 'EARTH' | 'SHARED' | 'CREW' (para el vídeo en inglés)
    explicacion, explicacion_en,
    t_tierra_min: r1(t_tierra_min),
    t_crit_min: ficha.t_crit_min,
    desglose_min: { espera: r1(espera_min), envio: r1(envio_min), luz_ida_y_vuelta: r1(luz_min), respuesta_tierra: respuesta_min },
    modo, guiaEnDirecto,
    paquete_kB: kB, tasa_medica_kbps: Math.round(tasa),
    enlace: e,
    perfil: { id: p.id, nombre: p.nombre, evacuacion: p.evacuacion, gravedad_g: p.gravedad_g, cortes: p.cortes },
    condicion: { id: ficha.id ?? null, nombre, estado: ficha.status || ficha.estado || null },
    umbrales: { tierra: S.umbral_tierra, tripulacion: S.umbral_tripulacion },
  };
}

// --- utilidades ---------------------------------------------------------------
const r1 = (x) => Math.round(x * 10) / 10;
// 0,4 -> "24 s" · 37,3 -> "37 min" · 240 -> "4 h" · 19670 -> "13,7 d"
function fmtMin(min, idioma = 'es') {
  const dec = (x) => (idioma === 'es' ? String(x).replace('.', ',') : String(x));
  if (min < 1) return `${Math.round(min * 60)} s`;
  if (min < 120) return `${Math.round(min)} min`;
  if (min < 48 * 60) { const h = min / 60; return `${dec(Number.isInteger(h) ? h : Math.round(h * 10) / 10)} h`; }
  const d = min / 1440; return `${dec(Number.isInteger(d) ? d : Math.round(d * 10) / 10)} ${idioma === 'es' ? 'd' : 'days'}`;
}
