#!/usr/bin/env python3
"""
csv_to_link_json.py — Converts the daily Earth-Mars table (CSV) into data/mars_link.json.

Input:  tools/earth_mars_link_2026_2040.csv (from generate_earth_mars_link.py; Spanish column names)
Output: data/mars_link.json (compact: two daily vectors, reference time 12:00 UTC)
Usage:  python tools/csv_to_link_json.py
No external dependencies. Drafted with AI assistance (Claude, Anthropic).
"""
import csv, json, datetime as dt, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "earth_mars_link_2026_2040.csv"
OUT = ROOT / "data" / "mars_link.json"

rows = list(csv.DictReader(open(SRC, encoding="utf-8")))
dates = [dt.date.fromisoformat(r["fecha"]) for r in rows]
for a, b in zip(dates, dates[1:]):          # the table must be daily, with no gaps
    assert (b - a).days == 1, f"Gap in the table between {a} and {b}"

data = {
    "meta": {
        "description": "Earth-Mars one-way light time and Sun-Earth-Mars angle, one value per day",
        "method": "JPL 'Approximate Positions of the Planets' mean Keplerian elements (Standish, table 1)",
        "source": "https://ssd.jpl.nasa.gov/planets/approx_pos.html",
        "validate_with": "https://ssd.jpl.nasa.gov/horizons/ (TO CHECK: 5 dates)",
        "reference_time_utc": "12:00",
        "sep_moratorium_deg": 2.0,
        "generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
    },
    "start": dates[0].isoformat(),
    "end": dates[-1].isoformat(),
    "n": len(rows),
    "owlt_s": [round(float(r["owlt_s"]), 1) for r in rows],
    "sep_deg": [round(float(r["sep_deg"]), 2) for r in rows],
}
OUT.parent.mkdir(exist_ok=True)
OUT.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
print(f"OK: {len(rows)} days ({data['start']} to {data['end']}) -> {OUT} ({OUT.stat().st_size // 1024} kB)")
