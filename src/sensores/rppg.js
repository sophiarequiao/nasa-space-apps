// src/sensores/rppg.js — PLUS: pulso por cámara (rPPG). No es un dispositivo médico.
// API: iniciarPulso(videoEl, onResultado, opciones?) / detenerPulso()
//   onResultado({ estado, bpm, bpm_bruto, calidad, motivo, observacion, progreso, fps, luz, senal })
//     estado: 'midiendo' (aún no hay ventana suficiente) | 'ok' | 'baja_calidad'
//     bpm: pulso en lpm SOLO si la calidad es suficiente; si no, null (no se muestra el valor)
//     bpm_bruto: la estimación aunque la calidad sea baja (solo para la validación con pulsioxímetro)
//     observacion: objeto en el formato común cuando estado === 'ok'; si no, null
//   opciones: { tripulante, metodo:'verde'|'pos', roi:{x,y,w,h} (fracciones del fotograma), ventana_s, calidad_min }
// Método (versión sin MediaPipe): zona fija donde la persona coloca la cara -> media de R, G y B por fotograma
//   -> remuestreo a 30 Hz -> quitar tendencia -> paso banda 0,7-3 Hz -> espectro en ventana de 12 s -> pico = pulso.
//   'verde': canal verde (Verkruysse et al. 2008). 'pos': combinación de los tres canales, más robusta al
//   movimiento (Wang et al. 2017; aquí simplificada a una sola ventana).
// Calidad = fracción de la potencia de la banda que está en el pico (0-1), penalizada si el valor no es estable.
// Umbrales marcados HIPÓTESIS: del equipo, a ajustar con la validación del domingo.
// Privacidad: la imagen no sale del navegador ni se guarda; solo se calcula la media de color de la zona.
// Código generado con ayuda de IA (Claude, Anthropic). Licencia MIT.

const FS = 30;                         // Hz tras remuestrear
const F_MIN = 0.7, F_MAX = 3.0;        // 42-180 lpm
const F_GUARDA = 0.45;                 // el espectro se mira desde aquí para detectar movimiento lento (HIPÓTESIS)
const VENTANA_S = 12, MIN_S = 8;       // ventana de análisis y mínimo para dar el primer valor
const PASO_MS = 1000;                  // una estimación por segundo
const CALIDAD_MIN = 0.5;               // por debajo no se muestra el valor (HIPÓTESIS)
const LUZ_MIN = 50, LUZ_MAX = 235;     // nivel medio de verde 0-255: muy oscuro / saturado (HIPÓTESIS)
const ROI = { x: 0.32, y: 0.18, w: 0.36, h: 0.50 };   // zona central: frente y mejillas con la cara centrada

let S = null;   // estado de la sesión en curso

export async function iniciarPulso(videoEl, onResultado, opciones = {}) {
  detenerPulso();
  const s = S = {
    video: videoEl, cb: onResultado, op: { metodo: 'verde', tripulante: 'CM-1', ...opciones },
    t: [], r: [], g: [], b: [], activo: true, propio: false, ultimos: [], idFrame: null, timer: null,
    canvas: document.createElement('canvas'),
  };
  s.canvas.width = 36; s.canvas.height = 50;
  s.ctx = s.canvas.getContext('2d', { willReadFrequently: true });

  if (!videoEl.srcObject) {             // si el vídeo no tiene cámara, la pedimos
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }, audio: false,
    });
    if (S !== s) { stream.getTracks().forEach(t => t.stop()); return; }
    videoEl.srcObject = stream; s.propio = true;
    videoEl.playsInline = true; videoEl.muted = true;
    await videoEl.play();
  }

  const roi = s.op.roi || ROI;
  const muestrear = () => {
    if (!s.activo) return;
    const v = s.video, W = v.videoWidth, H = v.videoHeight;
    if (W && H) {
      s.ctx.drawImage(v, roi.x * W, roi.y * H, roi.w * W, roi.h * H, 0, 0, s.canvas.width, s.canvas.height);
      const d = s.ctx.getImageData(0, 0, s.canvas.width, s.canvas.height).data;
      let r = 0, g = 0, b = 0; const n = d.length / 4;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      s.t.push(performance.now()); s.r.push(r / n); s.g.push(g / n); s.b.push(b / n);
      if (s.op.onMuestra) s.op.onMuestra(s.t[s.t.length - 1], r / n, g / n, b / n);   // señal en bruto (solo para ajustar)
      const limite = performance.now() - (s.op.ventana_s || VENTANA_S) * 1000 - 500;   // conservar solo la ventana
      while (s.t.length && s.t[0] < limite) { s.t.shift(); s.r.shift(); s.g.shift(); s.b.shift(); }
    }
    programar();
  };
  const programar = () => {
    s.idFrame = s.video.requestVideoFrameCallback
      ? s.video.requestVideoFrameCallback(muestrear)       // un aviso por fotograma real de la cámara
      : requestAnimationFrame(muestrear);
  };
  programar();

  s.timer = setInterval(() => {
    if (!s.activo) return;
    const res = estimarPulso(s.t, s.r, s.g, s.b, { metodo: s.op.metodo, ventana_s: s.op.ventana_s });
    // Estabilidad: las 5 últimas estimaciones deben parecerse (±5 lpm); si no, no se muestra (HIPÓTESIS)
    s.ultimos.push(res.bpm_bruto); if (s.ultimos.length > 5) s.ultimos.shift();
    const validos = s.ultimos.filter(v => v != null);
    const estable = validos.length === 5 && Math.max(...validos) - Math.min(...validos) <= 10;
    let calidad = res.calidad;
    if (res.bpm_bruto != null && !estable) calidad = Math.min(calidad, 0.4);
    calidad = Math.round(calidad * 100) / 100;
    const min = s.op.calidad_min ?? CALIDAD_MIN;
    const ok = res.bpm_bruto != null && calidad >= min;
    const estado = res.bpm_bruto == null && !res.motivo ? 'midiendo' : (ok ? 'ok' : 'baja_calidad');
    const bpm = ok ? Math.round(res.bpm_bruto) : null;
    s.cb({
      estado, bpm, bpm_bruto: res.bpm_bruto == null ? null : Math.round(res.bpm_bruto * 10) / 10, calidad,
      motivo: ok ? null : (res.motivo || (res.bpm_bruto == null ? 'reuniendo_datos' : (estable ? 'senal_debil' : 'inestable'))),
      observacion: ok ? {
        tripulante: s.op.tripulante, senal: 'frecuencia_cardiaca', valor: bpm, unidad: 'lpm',
        fecha: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), fuente: 'camara_rppg', metodo: 'estimado',
        calidad, region_cuerpo: 'corazon',
      } : null,
      progreso: res.progreso, fps: res.fps, luz: res.luz, senal: res.senal,
      amplitud_pct: res.amplitud_pct ?? null, rg: res.rg ?? null, bg: res.bg ?? null,   // diagnóstico
    });
  }, PASO_MS);
}

export function detenerPulso() {
  const s = S; if (!s) return;
  s.activo = false; clearInterval(s.timer);
  if (s.video.cancelVideoFrameCallback && s.idFrame != null) { try { s.video.cancelVideoFrameCallback(s.idFrame); } catch {} }
  if (s.propio && s.video.srcObject) { s.video.srcObject.getTracks().forEach(t => t.stop()); s.video.srcObject = null; }
  S = null;
}

// ---------------------------------------------------------------------------
// Núcleo puro (sin APIs del navegador): se puede probar en Node.
// t_ms: instantes de cada fotograma (ms); r, g, b: medias de color de la zona (0-255)
export function estimarPulso(t_ms, r, g, b, { metodo = 'verde', ventana_s = VENTANA_S } = {}) {
  const vacio = (extra) => ({ bpm_bruto: null, calidad: 0, motivo: null, progreso: 0, fps: 0, luz: null, senal: [], ...extra });
  const n0 = t_ms.length;
  if (n0 < 10) return vacio({});
  const tFin = t_ms[n0 - 1];
  let i0 = 0; while (t_ms[i0] < tFin - ventana_s * 1000) i0++;
  const dur = (tFin - t_ms[i0]) / 1000;
  const fps = (n0 - 1 - i0) / Math.max(dur, 1e-3);
  let luz = 0; for (let i = i0; i < n0; i++) luz += g[i]; luz /= (n0 - i0);
  const base = { progreso: Math.min(1, dur / MIN_S), fps: Math.round(fps * 10) / 10, luz: Math.round(luz) };
  if (luz < LUZ_MIN) return vacio({ ...base, motivo: 'poca_luz' });
  if (luz > LUZ_MAX) return vacio({ ...base, motivo: 'imagen_saturada' });
  if (dur < MIN_S) return vacio(base);
  if (fps < 12) return vacio({ ...base, motivo: 'pocos_fotogramas' });

  // 1) Remuestreo uniforme a 30 Hz (la cámara no entrega los fotogramas a intervalos exactos)
  const N = Math.floor(dur * FS);
  const R = new Float64Array(N), G = new Float64Array(N), B = new Float64Array(N);
  let j = i0;
  for (let k = 0; k < N; k++) {
    const tk = t_ms[i0] + k * 1000 / FS;
    while (j < n0 - 2 && t_ms[j + 1] < tk) j++;
    const a = Math.min(1, Math.max(0, (tk - t_ms[j]) / Math.max(t_ms[j + 1] - t_ms[j], 1e-6)));
    R[k] = r[j] + (r[j + 1] - r[j]) * a; G[k] = g[j] + (g[j + 1] - g[j]) * a; B[k] = b[j] + (b[j + 1] - b[j]) * a;
  }

  // 2) Señal de pulso: canal verde normalizado, o combinación POS de los tres canales
  const mR = media(R), mG = media(G), mB = media(B);
  let x = new Float64Array(N);
  if (metodo === 'pos') {
    const s1 = new Float64Array(N), s2 = new Float64Array(N);
    for (let k = 0; k < N; k++) {
      const rn = R[k] / mR, gn = G[k] / mG, bn = B[k] / mB;
      s1[k] = gn - bn; s2[k] = gn + bn - 2 * rn;
    }
    const alfa = desv(s1) / (desv(s2) || 1);
    for (let k = 0; k < N; k++) x[k] = s1[k] + alfa * s2[k];
  } else {
    for (let k = 0; k < N; k++) x[k] = G[k] / mG - 1;
  }

  // 3) Quitar la tendencia (media móvil de 2 s) y filtrar 0,7-3 Hz
  const h = FS;                                    // ±1 s
  const y = new Float64Array(N);
  let acc = 0; const pre = new Float64Array(N + 1);
  for (let k = 0; k < N; k++) { acc += x[k]; pre[k + 1] = acc; }
  for (let k = 0; k < N; k++) { const a = Math.max(0, k - h), c = Math.min(N, k + h + 1); y[k] = x[k] - (pre[c] - pre[a]) / (c - a); }
  let f = biquad(biquad(biquad(y, FS, 'pasoalto', F_MIN), FS, 'pasoalto', F_MIN), FS, 'pasobajo', F_MAX);   // paso alto de 4.º orden
  f = f.subarray(FS);                              // descartar 1 s de transitorio del filtro
  const M = f.length;

  // 4) Espectro (ventana de Hann) en pasos de 0,5 lpm. Se calcula desde 0,45 Hz: si lo más fuerte está por
  //    debajo de la banda del pulso, es movimiento o un cambio lento de luz, no pulso.
  const df = 1 / 120; const nf = Math.round((F_MAX - F_GUARDA) / df) + 1;
  const q0 = Math.round((F_MIN - F_GUARDA) / df);          // primer índice dentro de la banda del pulso
  const P = new Float64Array(nf); let total = 0, kMax = q0, kGlobal = 0;
  for (let q = 0; q < nf; q++) {
    const w = 2 * Math.PI * (F_GUARDA + q * df) / FS; let re = 0, im = 0;
    for (let k = 0; k < M; k++) { const v = f[k] * (0.5 - 0.5 * Math.cos(2 * Math.PI * k / (M - 1))); re += v * Math.cos(w * k); im -= v * Math.sin(w * k); }
    P[q] = re * re + im * im; total += P[q];
    if (P[q] > P[kGlobal]) kGlobal = q;
    if (q >= q0 && P[q] > P[kMax]) kMax = q;
  }
  const fPico = F_GUARDA + kMax * df;

  // 5) Calidad: potencia a ±0,2 Hz del pico frente a todo el espectro calculado. Ruido ≈ 0,15; senoide limpia ≈ 0,95
  const ancho = Math.round(0.2 / df); let pico = 0;
  for (let q = Math.max(0, kMax - ancho); q <= Math.min(nf - 1, kMax + ancho); q++) pico += P[q];
  const fraccion = total > 0 ? pico / total : 0;
  let calidad = Math.max(0, Math.min(1, (fraccion - 0.30) / (0.75 - 0.30)));    // HIPÓTESIS
  let motivo = null;
  // El pico debe ser un máximo de verdad dentro de la banda: ni en el borde, ni la cola de algo más lento
  const esMaximoLocal = kMax > q0 && kMax < nf - 1 && P[kMax] >= P[kMax - 1] && P[kMax] >= P[kMax + 1];
  if (kGlobal < q0 || !esMaximoLocal || P[q0] > 0.5 * P[kMax]) { calidad = 0; motivo = 'movimiento'; }

  // Diagnóstico: amplitud de la señal filtrada (% del nivel medio) y proporciones de color de la zona
  const amplitud_pct = Math.round(desv(f) * 10000) / 100;
  const rg = Math.round(mR / mG * 100) / 100, bg = Math.round(mB / mG * 100) / 100;

  const paso = Math.max(1, Math.floor(M / 150));
  const senal = []; for (let k = 0; k < M; k += paso) senal.push(f[k]);         // para dibujar la onda
  return { bpm_bruto: fPico * 60, calidad, fraccion_pico: Math.round(fraccion * 100) / 100, motivo, ...base, progreso: 1, senal, amplitud_pct, rg, bg };
}

// --- utilidades ---------------------------------------------------------------
const media = (v) => { let a = 0; for (let i = 0; i < v.length; i++) a += v[i]; return a / v.length; };
const desv = (v) => { const m = media(v); let a = 0; for (let i = 0; i < v.length; i++) a += (v[i] - m) ** 2; return Math.sqrt(a / v.length); };
// Filtro biquad de 2.º orden (Butterworth, Q = 0,707), fórmulas del «Audio EQ Cookbook» (R. Bristow-Johnson)
function biquad(x, fs, tipo, fc) {
  const w = 2 * Math.PI * fc / fs, cw = Math.cos(w), al = Math.sin(w) / (2 * Math.SQRT1_2);
  let b0, b1, b2;
  if (tipo === 'pasoalto') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; }
  else { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; }
  const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
