#!/usr/bin/env python3
"""
Tabla diaria del enlace Tierra-Marte: distancia, tiempo-luz en un sentido,
angulo Sol-Tierra-Marte (SEP) y bandera de conjuncion solar.

Metodo: elementos keplerianos medios de JPL "Approximate Positions of the
Planets" (Standish, tabla 1, valida 1800-2050). Fuente:
https://ssd.jpl.nasa.gov/planets/approx_pos.html
Precision esperada del tiempo-luz: mejor que ~0,1 % (segundos). Suficiente
para una demo; para la entrega, validar 5 fechas contra JPL Horizons:
https://ssd.jpl.nasa.gov/horizons/

Uso: python generar_enlace_tierra_marte.py 2026-11-01 2040-12-31 > enlace.csv
Codigo generado con ayuda de IA (Claude, Anthropic). Sin dependencias externas.
"""
import sys, math, datetime as dt

AU_KM = 149_597_870.7          # km (definicion IAU 2012)
C_KM_S = 299_792.458           # km/s
SEP_MORATORIA_DEG = 2.0        # NASA: moratoria de comandos con Marte a <2 grados del Sol

# a [au], e, I [deg], L [deg], long.peri [deg], long.node [deg] y sus tasas por siglo
ELEM = {
    "EMB":  ((1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193,   0.0),
             (0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364,  0.0)),
    "MARS": ((1.52371034, 0.09339410, 1.84969142,  -4.55343205, -23.94362959, 49.55953891),
             (0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343)),
}

def julian_day(d: dt.date) -> float:
    return d.toordinal() + 1721424.5 + 0.5      # 12:00 TT aprox.

def helio_xyz(body: str, jd: float):
    T = (jd - 2451545.0) / 36525.0
    e0, rate = ELEM[body]
    a, e, I, L, wbar, Om = (e0[i] + rate[i] * T for i in range(6))
    w = wbar - Om
    M = math.radians(((L - wbar + 180) % 360) - 180)
    E = M
    for _ in range(50):                          # Kepler: Newton-Raphson
        dE = (M - (E - e * math.sin(E))) / (1 - e * math.cos(E))
        E += dE
        if abs(dE) < 1e-12:
            break
    xp, yp = a * (math.cos(E) - e), a * math.sqrt(1 - e * e) * math.sin(E)
    w, Om, I = map(math.radians, (w, Om, I))
    cw, sw, cO, sO, cI, sI = math.cos(w), math.sin(w), math.cos(Om), math.sin(Om), math.cos(I), math.sin(I)
    x = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp
    y = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp
    z = (sw * sI) * xp + (cw * sI) * yp
    return x, y, z

def link(d: dt.date):
    jd = julian_day(d)
    ex, ey, ez = helio_xyz("EMB", jd)
    mx, my, mz = helio_xyz("MARS", jd)
    dx, dy, dz = mx - ex, my - ey, mz - ez
    dist = math.sqrt(dx * dx + dy * dy + dz * dz)
    r_e = math.sqrt(ex * ex + ey * ey + ez * ez)
    # SEP: angulo en la Tierra entre el Sol (-E) y Marte (M-E)
    cos_sep = (-(ex * dx + ey * dy + ez * dz)) / (r_e * dist)
    sep = math.degrees(math.acos(max(-1.0, min(1.0, cos_sep))))
    owlt_s = dist * AU_KM / C_KM_S
    return dist, owlt_s, sep

if __name__ == "__main__":
    start = dt.date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else dt.date(2026, 11, 1)
    end = dt.date.fromisoformat(sys.argv[2]) if len(sys.argv) > 2 else dt.date(2040, 12, 31)
    print("fecha,distancia_au,distancia_mkm,owlt_s,owlt_min,ida_y_vuelta_min,sep_deg,conjuncion_solar")
    d = start
    while d <= end:
        dist, owlt, sep = link(d)
        print(f"{d.isoformat()},{dist:.5f},{dist*AU_KM/1e6:.2f},{owlt:.1f},{owlt/60:.2f},{2*owlt/60:.2f},{sep:.2f},{1 if sep < SEP_MORATORIA_DEG else 0}")
        d += dt.timedelta(days=1)
