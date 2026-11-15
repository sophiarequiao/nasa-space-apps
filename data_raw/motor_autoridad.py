#!/usr/bin/env python3
"""
KAIROS - motor de autoridad de decision (implementacion de referencia).

Para una condicion y un estado del enlace calcula:
  T_tierra = espera hasta la proxima ventana + envio del paquete + ida y vuelta de la luz + tiempo de respuesta en tierra
  A = T_tierra / T_crit            (indice de autonomia)
y decide quien lidera:
  A > 1                      -> CREW    (decide la tripulacion; se informa a Tierra despues)
  0,25 < A <= 1              -> SHARED  (acciones sin arrepentimiento ya + paquete + punto de control a la hora de respuesta)
  A <= 0,25                  -> EARTH   (lidera Tierra; la tripulacion ejecuta)

SUPUESTOS (todos configurables; hay que declararlos en la entrega):
  - T_GROUND_MIN = 15: tiempo de un medico de vuelo para leer y responder. Supuesto del equipo.
  - Umbrales 0,25 y 1: parametros de diseno; en una mision real los fijarian los medicos de vuelo antes del vuelo.
  - Tasa de datos: modelo 1/d^2 anclado a cifras publicadas de MRO (unos 0,6 Mbps lejos, unos 2,6 Mbps cerca,
    antena de 34 m) y un 10 % reservado a medicina. Es un marcador de posicion: sustituir por un balance de enlace propio.
  - Guia en directo posible solo si la ida y vuelta de la luz es <= 3 s. Supuesto del equipo.
  - Conjuncion solar: se modela como apagon total mientras Marte esta a <2 grados del Sol (moratoria de comandos
    de la NASA); la espera es el numero de dias que faltan para salir. Es un supuesto conservador.
  - Luna, polo sur sin rele: la Tierra se ve la mitad de cada mes sideral (27,32 d). Peor caso: 13,66 d de espera.

Uso: python motor_autoridad.py
Codigo generado con ayuda de IA (Claude, Anthropic). Sin dependencias externas.
"""
import csv, json, pathlib

AQUI = pathlib.Path(__file__).resolve().parent
T_GROUND_MIN = 15.0
UMBRAL_TIERRA, UMBRAL_TRIPULACION = 0.25, 1.0
CUOTA_MEDICA = 0.10
RT_MAX_DIRECTO_S = 3.0


def tasa_kbps_marte(dist_au: float) -> float:
    return max(600.0, min(2600.0, 4280.0 / dist_au ** 2)) * CUOTA_MEDICA


def escenarios():
    filas = list(csv.DictReader(open(AQUI / "enlace_tierra_marte_2026_2040.csv", encoding="utf-8")))
    por_fecha = {r["fecha"]: i for i, r in enumerate(filas)}

    def marte(nombre, i):
        r = filas[i]
        j = i
        while j < len(filas) and filas[j]["conjuncion_solar"] == "1":   # dias que faltan para salir del apagon
            j += 1
        return dict(nombre=f"{nombre} ({r['fecha']})", owlt_s=float(r["owlt_s"]), espera_min=(j - i) * 1440.0,
                    tasa_kbps=tasa_kbps_marte(float(r["distancia_au"])))

    hoy = por_fecha["2026-11-14"]
    lejos = max((i for i, r in enumerate(filas) if float(r["sep_deg"]) > 5.0), key=lambda i: float(filas[i]["owlt_s"]))
    conj = next(i for i, r in enumerate(filas) if r["conjuncion_solar"] == "1")
    return [
        dict(nombre="ISS", owlt_s=0.0, espera_min=0.0, tasa_kbps=10000.0),
        dict(nombre="Luna polo sur, con rele", owlt_s=1.28, espera_min=0.0, tasa_kbps=5000.0),
        dict(nombre="Luna polo sur, sin rele, Tierra oculta (peor caso)", owlt_s=1.28, espera_min=13.66 * 1440, tasa_kbps=5000.0),
        marte("Marte hoy", hoy),
        marte("Marte lejos, con enlace", lejos),
        marte("Marte, primer dia de conjuncion solar", conj),
    ]


def decidir(card: dict, e: dict) -> dict:
    kB = sum(p["size_kB_estimate"] for p in card["packet"])
    tx_min = kB * 8.0 / e["tasa_kbps"] / 60.0
    t_tierra = e["espera_min"] + tx_min + 2 * e["owlt_s"] / 60.0 + T_GROUND_MIN
    a = t_tierra / card["t_crit_min"]
    directo = (2 * e["owlt_s"] <= RT_MAX_DIRECTO_S) and e["espera_min"] == 0
    quien = "CREW" if a > UMBRAL_TRIPULACION else ("SHARED" if a > UMBRAL_TIERRA else "EARTH")
    modo = card["earth_best_mode"]
    if modo == "live_video" and not directo:
        modo = "async_images (sin guia en directo)"
    return dict(quien=quien, a=a, t_tierra_min=t_tierra, tx_min=tx_min, modo=modo)


if __name__ == "__main__":
    cards = json.load(open(AQUI / "condition_cards.json", encoding="utf-8"))["cards"]
    for e in escenarios():
        print(f"\n== {e['nombre']} | luz ida: {e['owlt_s']/60:.2f} min | espera de ventana: {e['espera_min']/1440:.1f} d | tasa medica: {e['tasa_kbps']:.0f} kbps")
        for c in cards:
            d = decidir(c, e)
            t = d["t_tierra_min"]
            tt = f"{t:.0f} min" if t < 600 else f"{t/1440:.1f} d"
            print(f"  {c['id']:<22} T_crit {c['t_crit_min']:>6} min | respuesta de Tierra: {tt:>8} | A={d['a']:>7.2f} | {d['quien']:<6} | {d['modo']}")
