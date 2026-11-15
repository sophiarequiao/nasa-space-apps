#!/usr/bin/env python3
"""
Genera observaciones SINTETICAS de todas las fuentes de a bordo para 4 tripulantes: 30 dias antes del lanzamiento (fase pre_vuelo) y 60 dias en vuelo,
en el formato comun de SOSpesAI. No son datos reales de ningun astronauta.

Efectos medios tomados de la literatura (ver PROPUESTA_SOSPESAI.md):
  - Presion sistolica unos 8 mmHg por debajo en vuelo, FC sin cambio (Norsk 2015).
  - Sueno medio de unas 6,1 h en la ISS (Barger 2014).
  - CO2 de cabina en torno a 2,5 mmHg; limite ISS 3,0 mmHg (Law y Alexander).
  - Dosis de radiacion en transito a Marte: 1,8 mSv/dia (Zeitlin 2013). Se usa el escenario de transito.
Supuestos del equipo: desviaciones, frecuencias de medida, rangos de laboratorio, eventos y los valores
previos al vuelo (sueno medio 6,8 h, CO2 ambiente 0,3 mmHg, presion sin la bajada de vuelo).
Eventos inyectados para la demo:
  - CM-2, dias 30-36: sueno corto con autoinforme optimista (discordancia).
  - CM-3, dia 44: fiebre, taquicardia, leucocitos altos (sospecha de infeccion).
  - CM-4, dia 52: sangre en la tira de orina + dolor de costado (colico renal).
Uso: python generar_observaciones_sinteticas.py > observaciones_sinteticas.json
Codigo y datos generados con ayuda de IA (Claude, Anthropic). Licencia de los datos: CC0.
"""
import json, random, datetime as dt

random.seed(14)
INICIO = dt.datetime(2026, 11, 1, 7, 0)
TRIP = {"CM-1": (64, 118), "CM-2": (58, 124), "CM-3": (70, 116), "CM-4": (61, 121)}  # FC y PAS previas al vuelo
obs = []

def add(cm, dia, hora, senal, valor, unidad, fuente, metodo, region, calidad=1.0):
    t = INICIO + dt.timedelta(days=dia, hours=hora)
    obs.append({"tripulante": cm, "fase": "pre_vuelo" if dia < 0 else "en_vuelo", "dia_mision": dia, "senal": senal, "valor": valor, "unidad": unidad,
                "fecha": t.isoformat() + "Z", "fuente": fuente, "metodo": metodo,
                "calidad": round(calidad, 2), "region_cuerpo": region, "sintetico": True})

for cm, (fc0, pas0) in TRIP.items():
    for d in range(-30, 60):
        pre = d < 0
        fiebre = cm == "CM-3" and d == 44
        corto = cm == "CM-2" and 30 <= d <= 36
        renal = cm == "CM-4" and d == 52
        fc = fc0 + random.gauss(0, 4) + (32 if fiebre else 0) + (14 if renal else 0)
        # Diario: mensaje a la Tierra (camara + voz)
        add(cm, d, 1, "frecuencia_cardiaca", round(fc + random.gauss(0, 2)), "lpm", "camara_rppg", "estimado", "corazon", random.uniform(0.6, 0.95))
        add(cm, d, 1, "frecuencia_respiratoria", round(14 + random.gauss(0, 1.5) + (6 if fiebre else 0)), "rpm", "camara", "estimado", "pulmones", random.uniform(0.5, 0.9))
        vel = 4.4 + random.gauss(0, 0.2) - (0.8 if corto else 0)
        add(cm, d, 1, "velocidad_habla", round(vel, 2), "silabas/s", "microfono", "estimado", "cerebro")
        add(cm, d, 1, "pausas", round(0.22 + random.gauss(0, 0.03) + (0.08 if corto else 0), 2), "fraccion", "microfono", "estimado", "cerebro")
        add(cm, d, 1, "duracion_mensaje", round(max(15, 60 - max(d, 0) * 0.35 + random.gauss(0, 6))), "s", "microfono", "clinico", "cerebro")
        # Actigrafo y autoinforme
        sueno = 4.7 + random.gauss(0, 0.3) if corto else max(4.0, (6.8 if pre else 6.1) + random.gauss(0, 0.7))
        add(cm, d, 0, "sueno", round(sueno, 1), "h", "actigrafo", "clinico", "cerebro")
        add(cm, d, 1, "sueno_autoinforme", 4 if corto else min(5, max(1, round(2.2 + 0.45 * sueno + random.gauss(0, 0.5)))), "1-5", "cuestionario", "autoinforme", "cerebro")
        add(cm, d, 1, "animo", min(5, max(1, round(3.8 + random.gauss(0, 0.6)))), "1-5", "cuestionario", "autoinforme", "cerebro")
        add(cm, d, 2, "lapsos_test_reaccion", max(0, round(2 + (6.1 - sueno) * 1.5 + random.gauss(0, 1))), "lapsos", "test_reaccion", "clinico", "cerebro")
        # Entorno
        add(cm, d, 3, "co2_cabina", round(0.3 + random.gauss(0, 0.03), 2) if pre else round(max(1.2, 2.5 + random.gauss(0, 0.35)), 2), "mmHg", "soporte_vital", "clinico", "pulmones")
        add(cm, d, 23, "dosis_acumulada", 0.0 if pre else round(1.8 * (d + 1) + random.gauss(0, 0.5), 1), "mSv", "dosimetro", "clinico", "sangre")
        # Temperatura diaria
        add(cm, d, 2, "temperatura", round((38.8 if fiebre else 36.7) + random.gauss(0, 0.15), 1), "C", "termometro", "clinico", "sangre")
        # Semanal: presion, masa, Bio-Monitor
        if d % 7 == 0 or fiebre or renal:
            pas = pas0 - (0 if pre else 8) + random.gauss(0, 5) - (20 if fiebre else 0)
            add(cm, d, 2, "presion_sistolica", round(pas), "mmHg", "tensiometro", "clinico", "corazon")
            add(cm, d, 2, "presion_diastolica", round(pas * 0.62 + random.gauss(0, 3)), "mmHg", "tensiometro", "clinico", "corazon")
            add(cm, d, 2, "spo2", round(min(100, 98 + random.gauss(0, 0.8)) - (2 if fiebre else 0)), "%", "bio_monitor", "clinico", "pulmones")
            add(cm, d, 2, "masa_corporal", round(72 - max(d, 0) * 0.02 + random.gauss(0, 0.3), 1), "kg", "medidor_masa", "clinico", "musculos")
            add(cm, d, 2, "glucosa", round(92 + random.gauss(0, 7)), "mg/dL", "glucometro", "clinico", "sangre")
        # Laboratorio: cada 14 dias o con fiebre
        if d % 14 == 0 or fiebre:
            add(cm, d, 4, "leucocitos", round((14.2 if fiebre else 6.5 + random.gauss(0, 1.0)), 1), "10^3/uL", "hemocue_wbc", "clinico", "sangre")
            add(cm, d, 6, "biomarcador_inflamacion", round((48 if fiebre else 2 + abs(random.gauss(0, 1.5))), 1), "mg/L (ilustrativo)", "bio_analyzer", "clinico", "sangre")
        if d % 14 == 0 or renal:
            add(cm, d, 3, "tira_orina_sangre", 3 if renal else 0, "0-3", "tira_orina", "clinico", "rinones")
        if renal:
            add(cm, d, 3, "dolor", 7, "0-10", "cuestionario", "autoinforme", "rinones")

doc = {"_about": "Observaciones SINTETICAS de SOSpesAI (4 tripulantes, 30 dias previos al vuelo + 60 en vuelo, todas las fuentes). No son datos reales. "
                 "Rangos de laboratorio y unidades del biomarcador son ilustrativos. Licencia CC0. Generado con ayuda de IA (Claude, Anthropic).",
       "eventos_demo": ["CM-2 dias 30-36: sueno corto + autoinforme optimista", "CM-3 dia 44: fiebre + leucocitos altos", "CM-4 dia 52: colico renal"],
       "observaciones": obs}
print(json.dumps(doc, ensure_ascii=False))
