#!/usr/bin/env python3
"""
csv_a_enlace_json.py — Convierte la tabla diaria Tierra-Marte (CSV) en datos/enlace.json.

Entrada: herramientas/enlace_tierra_marte_2026_2040.csv (de generar_enlace_tierra_marte.py)
Salida:  datos/enlace.json  (formato compacto: dos vectores diarios, referencia 12:00 UTC)
Uso:     python herramientas/csv_a_enlace_json.py
Sin dependencias externas. Codigo generado con ayuda de IA (Claude, Anthropic).
"""
import csv, json, datetime as dt, pathlib

RAIZ = pathlib.Path(__file__).resolve().parent.parent
ENTRADA = RAIZ / "herramientas" / "enlace_tierra_marte_2026_2040.csv"
SALIDA = RAIZ / "datos" / "enlace.json"

filas = list(csv.DictReader(open(ENTRADA, encoding="utf-8")))
fechas = [dt.date.fromisoformat(f["fecha"]) for f in filas]
# Comprobar que la tabla es diaria y sin huecos
for a, b in zip(fechas, fechas[1:]):
    assert (b - a).days == 1, f"Hueco en la tabla entre {a} y {b}"

datos = {
    "meta": {
        "descripcion": "Retardo de la luz Tierra-Marte (un sentido) y angulo Sol-Tierra-Marte, un valor por dia",
        "metodo": "Elementos keplerianos medios de JPL 'Approximate Positions of the Planets' (Standish, tabla 1)",
        "fuente": "https://ssd.jpl.nasa.gov/planets/approx_pos.html",
        "validar_con": "https://ssd.jpl.nasa.gov/horizons/ (COMPROBAR 5 fechas)",
        "hora_referencia_utc": "12:00",
        "moratoria_sep_deg": 2.0,
        "generado": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
    },
    "inicio": fechas[0].isoformat(),
    "fin": fechas[-1].isoformat(),
    "n": len(filas),
    "owlt_s": [round(float(f["owlt_s"]), 1) for f in filas],
    "sep_deg": [round(float(f["sep_deg"]), 2) for f in filas],
}
SALIDA.parent.mkdir(exist_ok=True)
SALIDA.write_text(json.dumps(datos, separators=(",", ":")), encoding="utf-8")
print(f"OK: {len(filas)} dias ({datos['inicio']} a {datos['fin']}) -> {SALIDA} ({SALIDA.stat().st_size // 1024} kB)")
