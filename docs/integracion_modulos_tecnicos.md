# Para la responsable de la app: lo que se ha integrado de los módulos técnicos

SOSpesIA · NASA Space Apps 2026 · Sevilla · De el responsable técnico (técnico) a la responsable de la app (app) · 15-nov-2026

Rama `integracion-app`, hecha sobre tu commit «Added app» (`fc37240`). No toca `main` y no lanza ningún despliegue hasta que se fusione.

## 1. Qué cambia en la app

| Qué | Dónde | Cómo se comprueba |
|---|---|---|
| Radiación de cada misión, con datos de la NASA, frente al límite de carrera de 600 mSv | `public/data/radiation.json`, `src/engine/radiation.ts`, tarjeta «Radiation on this mission» en `SimulatorScreen.tsx` | `scripts/verify_radiation.mjs`, 12 comprobaciones |
| El mensaje a la Tierra sale cifrado (AES-256-GCM, sin bibliotecas) | `src/engine/seal.ts`; se usa al enviar en `MessageScreen.tsx` y en `CheckinSimple.tsx` | `scripts/verify_seal.mjs`, 21 comprobaciones (vectores publicados de GCM, OpenSSL, mensaje alterado, mensaje repetido) |
| La tabla Tierra-Marte de la app, comprobada con NASA/JPL Horizons | `scripts/verify_horizons.mjs`, `data_raw/horizons_reference.json` | 5 comprobaciones: luz dentro de 0,29 s y ángulo dentro de 0,04° |
| Laboratorio de sensores: párpados, postura de la cabeza, hombros y tronco, vocal sostenida, pulso con seguimiento de la cara, aviso temprano | `public/lab/` (copia de la rama `modules-en`) y tarjeta «Sensor lab» en Message | Se refresca con `sh scripts/update_lab.sh` |
| El service worker deja en paz `/lab/` | `public/sw.js` (la caché pasa a `sospesia-v2`) | Sin este cambio, abrir el laboratorio sustituía la página guardada de la app por la del laboratorio |

`npm run verify` ejecuta ahora las cuatro comprobaciones (72 + 5 + 12 + 21). Como el despliegue ejecuta `npm run verify`, nada se publica si alguna falla. `npm run typecheck` y `npm run build` pasan.

## 2. Lo que no se ha tocado

- Tu motor de colores (`status.ts`, `signals.ts`), el cuerpo 3D, tus sensores (`voice.ts`, `rppg.ts`) y los datos que genera `build_data.py`.
- `public/data/radiation.json` está escrito a mano; `build_data.py` no lo genera ni lo borra.

## 3. Cómo llegan las medidas del laboratorio a la app (tu opción A: observaciones)

1. Al pulsar «Send this check-in to Earth» en el laboratorio, la página guarda solo números en este navegador: `localStorage["sospesia.lab.lastCheckin"] = { mode, saved_at, observations: [{ signal, value, unit, source, method, quality, region }] }`.
2. Message lo lee (evento `storage` y al volver a la pestaña). Si el check-in es en vivo y de las últimas 12 horas, ofrece una casilla: «Add the last lab check-in to this message». Uno simulado nunca se ofrece.
3. Con la casilla marcada, cada medida pasa a ser una `Observation` (`method: "estimated"`, `live: true`) y entra por `addObservations`, igual que las de tu grabación. Si una señal ya está medida en el mensaje, no se duplica.

| Señal del laboratorio | En la app |
|---|---|
| `speech_rate`, `pause_fraction`, `message_duration`, `heart_rate` | Mismos IDs y unidades que los tuyos: entran en tu motor |
| `blink_rate`, `perclos`, `blink_duration`, `long_eye_closures`, `yawns`, `facial_expressiveness`, `head_movement`, `head_tilt`, `posture_shifts`, `shoulder_tilt`, `trunk_movement`, `head_height`, las de la vocal sostenida y el resto de las de la voz | No tienen regla en `signals.ts`: viajan en el mensaje y no colorean ninguna región |

## 4. Decisiones que son tuyas, o de la responsable médica

1. **Laboratorio en página aparte.** Está en `public/lab/` porque usa MediaPipe (Apache-2.0, 15 MB) y tu `NOTICE.md` decía que la app no descarga ningún modelo de cara. Si prefieres las señales de cámara dentro de Message, se puede portar `face.js` a TypeScript después de la entrega.
2. **Señales nuevas en el cuerpo.** ¿Debe alguna entrar en `signals.ts` (por ejemplo `perclos` en `brain`, con tope en ámbar)? Lo decide la responsable médica: hoy una región sin datos sale gris y una señal nueva la pondría verde.
3. **Clave de cifrado.** Es de demostración y se crea en el navegador. Está dicho en la pantalla, en el README y en `NOTICE.md`.
4. **`.sospesia_update.tgz`** está en la raíz del repositorio (1,6 MB, una copia del código). Si se subió sin querer, conviene quitarlo.

## 5. Probar en dos minutos

```bash
npm install
npm run verify      # debe terminar en "21/21 encryption checks passed"
npm run dev
```

1. Vista de oficial médico → **Simulator** → Mission profile «Mars transit»: tarjeta «Radiation on this mission» con 1.8 millisieverts a day.
2. **Message** → «Use CM-4's synthetic message» → botón de enviar: aparece «Encrypted on this device before it leaves (AES-256-GCM)».
3. **Message** → «Open the sensor lab»: se abre en otra pestaña. Elige «Live sensors», haz un check-in y pulsa «Send this check-in to Earth». Al volver a la app, la tarjeta «Sensor lab» ofrece añadirlo al mensaje.
