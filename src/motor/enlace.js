// src/motor/enlace.js — Estado del enlace de comunicaciones Tierra <-> tripulación.
// API: getEnlace(fechaISO, perfil) -> {owlt_s, rtt_s, hayEnlace, motivoSinEnlace, esperaHastaEnlace_s, fuente}
//   owlt_s: retardo de la luz en un sentido (s) · rtt_s: ida y vuelta (s)
//   esperaHastaEnlace_s: 0 si hay enlace; si no, segundos hasta que vuelva (lo usa autoridad.js)
// Todo en el navegador, sin servidor. Código generado con ayuda de IA (Claude, Anthropic). Licencia MIT.

const DIA_MS = 86_400_000;
const C_KM_S = 299_792.458;              // velocidad de la luz (km/s)
export const SEP_MORATORIA_DEG = 2.0;    // Marte a <2° del Sol: moratoria de comandos (conjunción solar)

// --- Constantes por perfil ----------------------------------------------------
// ISS: voz y datos vía satélites TDRS geoestacionarios (~36 000 km de subida + ~36 000 de bajada).
//      Solo el tiempo-luz son ~0,24 s; con procesado, «casi en directo». HIPÓTESIS: 0,25 s (COMPROBAR).
const OWLT_ISS_S = 0.25;
// Luna: distancia media Tierra-Luna 384 400 km -> ~1,28 s (COMPROBAR con la ficha lunar de la NASA).
const OWLT_LUNA_S = 384_400 / C_KM_S;
// Polo sur lunar sin satélite repetidor: la Tierra queda bajo el horizonte ~la mitad de cada mes sideral.
// SIMULACIÓN con calendario fijo (HIPÓTESIS): visible la primera mitad de cada ciclo desde la época.
const MES_SIDERAL_D = 27.321661;
const EPOCA_POLO_SUR_MS = Date.parse('2026-11-01T00:00:00Z');

export const PERFILES_ENLACE = ['iss', 'luna', 'luna_rele', 'luna_polo_sur', 'marte', 'marte_transito', 'marte_superficie'];

// --- Datos de Marte (datos/enlace.json) -------------------------------------
let DATOS = null;
export function setDatosEnlace(d) { DATOS = d; }   // para pruebas fuera del navegador
if (typeof window !== 'undefined') {
  try {
    const r = await fetch(new URL('../../datos/enlace.json', import.meta.url));
    DATOS = await r.json();
  } catch (e) {
    console.error('[enlace] No se pudo cargar datos/enlace.json', e);
  }
}

// Valor del día i (referencia 12:00 UTC) interpolado linealmente en el instante t
function serieMarte(t, clave) {
  if (!DATOS) throw new Error('[enlace] datos/enlace.json no cargado');
  const t0 = Date.parse(DATOS.inicio + 'T12:00:00Z');
  const x = (t - t0) / DIA_MS;
  const ultimo = DATOS.n - 1;
  if (x < -0.5 || x > ultimo + 0.5) {
    throw new RangeError(`[enlace] Fecha fuera de la tabla (${DATOS.inicio} a ${DATOS.fin})`);
  }
  const xc = Math.min(Math.max(x, 0), ultimo);
  const i = Math.min(Math.floor(xc), ultimo - 1);
  const f = xc - i;
  const v = DATOS[clave];
  return v[i] + (v[i + 1] - v[i]) * f;
}

// Segundos desde t hasta que la separación Sol-Tierra-Marte vuelva a ser >= 2°
function esperaFinConjuncion(t) {
  const PASO = DIA_MS / 4;                      // paso de 6 h, suficiente para una cuenta atrás
  for (let k = 1; k <= 4 * 60; k++) {           // la moratoria dura ~2-3 semanas; tope 60 días
    const tk = t + k * PASO;
    if (serieMarte(tk, 'sep_deg') >= SEP_MORATORIA_DEG) return (tk - t) / 1000;
  }
  return null;
}

function normalizar(perfil) {
  return String(perfil || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/[\s-]+/g, '_');
}

// Redondeo: 2 decimales por debajo de 10 s (ISS, Luna), 1 decimal por encima (Marte)
const r1 = (x) => (x < 10 ? Math.round(x * 100) / 100 : Math.round(x * 10) / 10);

function salida(owlt, hay, motivo, espera, fuente) {
  return {
    owlt_s: r1(owlt),
    rtt_s: r1(2 * owlt),
    hayEnlace: hay,
    motivoSinEnlace: hay ? null : motivo,
    esperaHastaEnlace_s: hay ? 0 : (espera == null ? null : Math.round(espera)),
    fuente,
  };
}

export function getEnlace(fechaISO, perfil = 'marte') {
  const t = Date.parse(fechaISO);
  if (Number.isNaN(t)) throw new Error(`[enlace] Fecha no válida: ${fechaISO}`);
  const p = normalizar(perfil);

  switch (p) {
    case 'iss':
      return salida(OWLT_ISS_S, true, null, 0, 'ISS vía TDRS: retardo ~0,25 s (HIPÓTESIS)');

    case 'luna':
    case 'luna_rele':
      return salida(OWLT_LUNA_S, true, null, 0, 'Distancia media Tierra-Luna 384 400 km; con satélite repetidor');

    case 'luna_polo_sur': {
      const cicloMs = MES_SIDERAL_D * DIA_MS;
      const fase = (((t - EPOCA_POLO_SUR_MS) % cicloMs) + cicloMs) % cicloMs;   // ms dentro del ciclo
      const hay = fase < cicloMs / 2;
      const espera = hay ? 0 : (cicloMs - fase) / 1000;
      return salida(OWLT_LUNA_S, hay, 'tierra_bajo_horizonte', espera,
        'Polo sur lunar sin repetidor: Tierra visible ~media órbita (SIMULACIÓN con calendario fijo)');
    }

    case 'marte':
    case 'marte_transito':     // HIPÓTESIS: en crucero se usa la distancia Tierra-Marte (cota superior)
    case 'marte_superficie': {
      const owlt = serieMarte(t, 'owlt_s');
      const sep = serieMarte(t, 'sep_deg');
      const hay = sep >= SEP_MORATORIA_DEG;
      const espera = hay ? 0 : esperaFinConjuncion(t);
      return salida(owlt, hay, 'conjuncion_solar', espera,
        `Efemérides JPL (aprox.) · separación Sol-Tierra-Marte ${sep.toFixed(1)}°`);
    }

    default:
      throw new Error(`[enlace] Perfil desconocido: «${perfil}». Usa: ${PERFILES_ENLACE.join(', ')}`);
  }
}

// Utilidad para la interfaz: 658.7 -> "10 min 59 s"
export function formatearDuracion(s) {
  if (s == null) return '—';
  if (s < 60) return `${s.toFixed(s < 10 ? 2 : 0).replace('.', ',')} s`;
  const total = Math.round(s);
  const d = Math.floor(total / 86400), h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60), sec = total % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min ${sec} s`;
}
