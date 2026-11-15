# Para el responsable de datos: cómo conectar tu simulador con la app

SOSpesIA · NASA Space Apps 2026 · Sevilla · De la responsable de la app (app) a el responsable de datos (datos y vídeo)

## 1. Qué hay ya en la app (repositorio `spaceApps`)

- **Tecnología:** React + TypeScript + Vite. Todo el código y las claves de los datos están en inglés, porque es la regla del proyecto. Tu `simulador.js` y tu `efectos_escenarios.json` tendrán que pasar a inglés al integrarlos.
- **Dos vistas:**
  - **Vista de tripulación** (por defecto): Today, Check-in, Help, Kit y Learn.
  - **Vista de oficial médico** (interruptor arriba a la derecha): Message, Crew, Body, Evolution, Incident, Resources, Plan, Simulator y Learn.
- **Datos:** están en `public/data/` y se generan desde los archivos del equipo con `scripts/build_data.py`. Los originales en español están en `data_raw/`. Los archivos son:
  - `observations.json` (tus 4.678 medidas, ya en inglés);
  - `baselines.json` (tus líneas base);
  - `scenarios.json` (los 24 escenarios en inglés);
  - `condition_cards.json`, `inventory.json`, `capabilities.json`, `regions.json`, `profiles.json` y `mars_link.json`.
- **Motor de colores:** ya está hecho, en `src/engine/status.ts` y `src/engine/signals.ts`. Calcula cada señal y luego cada región, con la razón de cada color. Mejor reutilízalo en vez de duplicar la lógica (detalles en el punto 4).
- **Pantalla Simulator:** ya existe en la vista de oficial médico (`src/screens/SimulatorScreen.tsx`). Hoy cambia la misión, la fecha y los equipos averiados, y muestra quién decide. **Lo que falta es justo tu parte:** que al elegir un escenario cambien las señales y, con ellas, los colores del cuerpo.

## 2. IDs de las regiones (definitivos)

Son 9. Los colores dependen solo del ID, no de la forma del 3D. Voy a cambiar cómo se divide el cuerpo 3D porque la división actual no me convence, pero **los IDs no cambian**: usa siempre estos.

| Tu ID | ID en la app | ¿Se ve en el 3D? |
|---|---|---|
| cerebro | `brain` | sí |
| — | `eyes` | sí |
| — | `neck` | sí |
| corazon | `heart` | sí |
| pulmones | `lungs` | sí |
| rinones | `kidneys` | sí |
| musculos | `musculoskeletal` | sí |
| sangre | `blood` | no, es todo el cuerpo (botón aparte) |
| — | `skin` | no, es todo el cuerpo (botón aparte) |

## 3. Los 4 estados (no «amarillo»: en la app se llama `amber`)

| Estado | Color | Significado |
|---|---|---|
| `green` | `#2fb36b` | dentro de lo esperado |
| `amber` | `#f0a020` | vigilar |
| `red` | `#e5484d` | actuar ya |
| `silent` | `#8a93a6`, con rayas | sin datos recientes |

## 4. No hay `setRegionColor`: el cuerpo se pinta solo

El cuerpo 3D (`src/components/body/HealthBody3D.tsx`) recibe un objeto con el estado de cada región, por ejemplo `{ kidneys: "red", heart: "amber", ... }`, y se repinta solo. Tienes dos formas de conectarte. Prefiero la A.

### A (recomendada): que tu simulador genere observaciones

Tu función devuelve una lista de medidas en el mismo formato que `observations.json`. La app las añade y el motor calcula los colores. Así el escenario también aparece en Evolution, en Incident y en el resumen a la Tierra.

```js
applyScenario(scenarioId, crew, day, baselines) // -> Observation[]

// Observation = {
//   crew: "CM-4", phase: "inflight", day: 52,
//   signal: "pain", value: 7, unit: "0-10",
//   time: "2026-12-23T10:00:00Z",
//   source: "questionnaire",
//   method: "clinical" | "estimated" | "self_report",
//   quality: 1, region: "kidneys"
// }
```

### B: que devuelva directamente los colores

Tu función devuelve `{ [regionId]: "green" | "amber" | "red" | "silent" }` y yo se lo paso al cuerpo. Es más sencillo, pero el escenario no aparecería en las demás pantallas.

> Nota: en la opción A, la app todavía no tiene cómo quitar un escenario una vez aplicado. Lo añado yo al conectar tu función (botones «Aplicar» y «Quitar»).

## 5. Reglas de color que ya usa la app

Para que tu lógica no choque con la mía:

- **Banda:** la media en vuelo de cada persona ± 2 DE (`k_sd = 2` en `baselines.json`). Antes del vuelo se compara con la media previa al vuelo.
- **Desviación:** hasta 2 DE es verde, entre 2 y 3 DE es ámbar, y más de 3 DE es rojo. Se mira solo la dirección que importa: por ejemplo, el sueño solo cuenta si baja y los lapsos solo si suben.
- **Reglas fijas provisionales:**
  - temperatura de 38 °C o más: rojo;
  - SpO2 por debajo de 90 %: rojo; por debajo de 94 %: ámbar;
  - leucocitos por encima de 13: rojo;
  - tira de orina de 2 o más: rojo;
  - dolor de 7/10 o más: rojo;
  - CO2 por encima de 3,0 mmHg: ámbar.
- **Señales estimadas** (cámara y voz): nunca pasan de ámbar.
- **Gris:** si la última medida es más antigua que su intervalo (diaria 1 día, semanal 7 días, laboratorio 14, OCT y ecografía de cuello 30).
- **Región:** toma el peor color de sus señales.
- **Discordancia:** sueño bajo con autoinforme de 4 o más da ámbar en `brain`.
- **Comprobación:** con tus datos, en CM-4 el día 52 los riñones ya salen rojos y el corazón ámbar, igual que en tu simulador.

## 6. IDs de las señales (tu nombre → el de la app)

| Tu ID | ID en la app | Tu ID | ID en la app |
|---|---|---|---|
| frecuencia_cardiaca | `heart_rate` | temperatura | `temperature` |
| presion_sistolica | `bp_systolic` | glucosa | `glucose` |
| presion_diastolica | `bp_diastolic` | leucocitos | `wbc` |
| frecuencia_respiratoria | `respiratory_rate` | biomarcador_inflamacion | `inflammation_marker` |
| spo2 | `spo2` | dosis_acumulada | `cumulative_dose` |
| co2_cabina | `cabin_co2` | masa_corporal | `body_mass` |
| sueno | `sleep` | tira_orina_sangre | `urine_blood` |
| sueno_autoinforme | `sleep_self_report` | dolor | `pain` |
| animo | `mood` | velocidad_habla | `speech_rate` |
| lapsos_test_reaccion | `reaction_lapses` | pausas | `pause_fraction` |
| duracion_mensaje | `message_duration` | | |

He añadido dos señales nuevas: `optic_disc_edema` (OCT, ojos) y `jugular_flow` (ecografía, cuello).

**Unidades:** lpm → `bpm`, rpm → `breaths/min`, C → `°C`, silabas/s → `syllables/s`, fraccion → `fraction`, lapsos → `lapses`.

## 7. IDs de escenarios (tu nombre → `scenarios.json` de la app)

| Tu ID | ID en la app |
|---|---|
| colico_renal | `renal_colic` |
| sepsis | `sepsis` |
| fatiga_sueno | `sleep_fatigue` |
| salud_mental | `low_mood` |
| co2_alto | `high_co2` |
| insuficiencia_respiratoria | `respiratory_failure` |
| humo_incendio | `smoke_fire` |

Cada escenario de la app tiene además los campos `card`, `crew` y `day`, que enlazan con la ficha de Incident.

## 8. Reparto que propongo para la revisión de las 18:00

- **El responsable de datos:** `scenarioEffects.json` y `applyScenario()` en inglés (opción A), y los efectos de los escenarios que faltan cuando puedas. Los valores clínicos los valida la responsable médica
- **La responsable de la app:** conecto tu función a la pantalla Simulator, con botones para aplicar y quitar el escenario, y cierro la nueva división del cuerpo 3D sin tocar los IDs.
