#!/usr/bin/env python3
"""
Build the English data files used by the SOSpesIA web app.

Reads the team's original (Spanish-keyed) files from data_raw/ and writes
English-keyed JSON to public/data/. Long texts that came from the health
lead's spreadsheet (SOSpesIA_regiones_auditadas_14nov.xlsx) were translated
by hand and live in this script, so the output is fully reproducible.

Usage:  python3 scripts/build_data.py
No third-party dependencies (standard library only).

License: MIT (code). Generated data: CC0. Texts: CC BY 4.0.
Written with AI assistance (Claude, Anthropic).
"""
import csv
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data_raw"
OUT = ROOT / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)

# --------------------------------------------------------------------------
# Vocabulary (Spanish -> English)
# --------------------------------------------------------------------------
SIGNAL = {
    "animo": "mood",
    "biomarcador_inflamacion": "inflammation_marker",
    "co2_cabina": "cabin_co2",
    "dolor": "pain",
    "dosis_acumulada": "cumulative_dose",
    "dosis_diaria": "daily_dose",
    "duracion_mensaje": "message_duration",
    "frecuencia_cardiaca": "heart_rate",
    "frecuencia_respiratoria": "respiratory_rate",
    "glucosa": "glucose",
    "lapsos_test_reaccion": "reaction_lapses",
    "leucocitos": "wbc",
    "masa_corporal": "body_mass",
    "pausas": "pause_fraction",
    "presion_diastolica": "bp_diastolic",
    "presion_sistolica": "bp_systolic",
    "spo2": "spo2",
    "sueno": "sleep",
    "sueno_autoinforme": "sleep_self_report",
    "temperatura": "temperature",
    "tira_orina_sangre": "urine_blood",
    "velocidad_habla": "speech_rate",
}
REGION = {
    "cerebro": "brain",
    "corazon": "heart",
    "pulmones": "lungs",
    "sangre": "blood",
    "rinones": "kidneys",
    "musculos": "musculoskeletal",
}
SOURCE = {
    "camara_rppg": "camera_rppg",
    "camara": "camera",
    "microfono": "microphone",
    "actigrafo": "actigraph",
    "cuestionario": "questionnaire",
    "test_reaccion": "reaction_test",
    "soporte_vital": "life_support",
    "dosimetro": "dosimeter",
    "termometro": "thermometer",
    "tensiometro": "bp_cuff",
    "bio_monitor": "bio_monitor",
    "medidor_masa": "mass_device",
    "glucometro": "glucometer",
    "hemocue_wbc": "hemocue_wbc",
    "bio_analyzer": "bio_analyzer",
    "tira_orina": "urine_strip",
}
METHOD = {"estimado": "estimated", "clinico": "clinical", "autoinforme": "self_report"}
PHASE = {"pre_vuelo": "preflight", "en_vuelo": "inflight"}
UNIT = {
    "lpm": "bpm",
    "rpm": "breaths/min",
    "silabas/s": "syllables/s",
    "fraccion": "fraction",
    "lapsos": "lapses",
    "C": "°C",
    "mSv/dia": "mSv/day",
    "mg/L (ilustrativo)": "mg/L (illustrative)",
}


def write(name, obj):
    path = OUT / name
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size / 1024:.0f} kB)")


# --------------------------------------------------------------------------
# 1. Observations (synthetic, CC0)
# --------------------------------------------------------------------------
raw_obs = json.loads((RAW / "observaciones_sinteticas.json").read_text(encoding="utf-8"))
observations = [
    {
        "crew": o["tripulante"],
        "phase": PHASE[o["fase"]],
        "day": o["dia_mision"],
        "signal": SIGNAL[o["senal"]],
        "value": o["valor"],
        "unit": UNIT.get(o["unidad"], o["unidad"]),
        "time": o["fecha"],
        "source": SOURCE[o["fuente"]],
        "method": METHOD[o["metodo"]],
        "quality": o["calidad"],
        "region": REGION[o["region_cuerpo"]],
    }
    for o in raw_obs["observaciones"]
]
# Scheduled imaging (team assumption, synthetic): neck ultrasound (jugular flow) and eye OCT.
# They were missing from the original generator, which left neck and eyes always grey.
# Schedule chosen for the demo: neck every ~30 days (always up to date by day 52);
# OCT at L-25 and D15 only, so by day 46+ it is overdue and the eyes turn grey ("OCT due").
# CM-1 shows stagnant jugular flow on day 40, without symptoms (Marshall-Goebel 2019: 6 of 11 crew).
import datetime as _dt
_launch = _dt.datetime(2026, 11, 1, 7, 0)
def _imaging(crew, day, signal, value, unit, source, region, hour=5):
    t = _launch + _dt.timedelta(days=day, hours=hour)
    return {"crew": crew, "phase": "preflight" if day < 0 else "inflight", "day": day, "signal": signal,
            "value": value, "unit": unit, "time": t.isoformat() + "Z", "source": source, "method": "clinical",
            "quality": 1.0, "region": region}
for crew in ["CM-1", "CM-2", "CM-3", "CM-4"]:
    for d in (-25, 10, 40):
        observations.append(_imaging(crew, d, "jugular_flow", 1 if (crew == "CM-1" and d == 40) else 0, "grade (0-2)", "ultrasound", "neck"))
    for d in (-25, 15):
        observations.append(_imaging(crew, d, "optic_disc_edema", 0, "Frisen grade", "oct", "eyes", hour=6))

write(
    "observations.json",
    {
        "about": "SYNTHETIC observations for 4 crew members: 30 days before launch and 60 days in flight, "
        "all onboard sources. Not real data. Lab ranges and the inflammation marker unit are illustrative. "
        "License CC0. Generated with AI assistance (Claude, Anthropic).",
        "launch_date": "2026-11-01",
        "demo_events": [
            {"crew": "CM-2", "days": [30, 36], "label": "Short sleep with optimistic self-report (discordance)"},
            {"crew": "CM-3", "days": [44, 44], "label": "Fever and high white blood cell count"},
            {"crew": "CM-4", "days": [52, 52], "label": "Flank pain and blood in urine (renal colic)"},
        ],
        "observations": observations,
    },
)

# --------------------------------------------------------------------------
# 2. Personal baselines (computed by the data lead)
# --------------------------------------------------------------------------
raw_lb = json.loads((RAW / "lineas_base.json").read_text(encoding="utf-8"))
baselines = {}
for crew, signals in raw_lb["lineas_base"].items():
    baselines[crew] = {}
    for s, v in signals.items():
        baselines[crew][SIGNAL.get(s, s)] = {
            "unit": UNIT.get(v["unidad"], v["unidad"]),
            "pre_mean": v["pre_media"],
            "pre_sd": v["pre_dt"],
            "pre_n": v["pre_n"],
            "flight_mean": v["vuelo_media"],
            "flight_sd": v["vuelo_dt"],
            "flight_n": v["vuelo_n"],
            "band_min": v["banda_min"],
            "band_max": v["banda_max"],
            "change_flight_vs_pre": v["cambio_vuelo_vs_pre"],
            "band_reliable": v["banda_fiable"],
        }
write(
    "baselines.json",
    {
        "k_sd": raw_lb["k_desviaciones"],
        "excluded_events": raw_lb["eventos_excluidos"],
        "about": "Personal baselines: preflight mean, in-flight mean and expected in-flight band "
        "(mean +/- k SD), computed with demo events excluded. Synthetic data.",
        "baselines": baselines,
    },
)

# --------------------------------------------------------------------------
# 3. Earth-Mars link table (JPL approximate planetary positions)
# --------------------------------------------------------------------------
rows = list(csv.DictReader(open(RAW / "enlace_tierra_marte_2026_2040.csv", encoding="utf-8")))
write(
    "mars_link.json",
    {
        "about": "Daily Earth-Mars link table 2026-2040: distance (au), one-way light time (s), "
        "Sun-Earth-Mars angle (deg) and solar conjunction flag (Mars < 2 deg from the Sun). "
        "Method: JPL 'Approximate Positions of the Planets' (Standish). Validate against JPL Horizons.",
        "columns": ["date", "dist_au", "owlt_s", "sep_deg", "conjunction"],
        "rows": [
            [r["fecha"], float(r["distancia_au"]), float(r["owlt_s"]), float(r["sep_deg"]), int(r["conjuncion_solar"])]
            for r in rows
        ],
    },
)

# --------------------------------------------------------------------------
# 4. Condition cards + detailed sample protocols (health lead, translated)
# --------------------------------------------------------------------------
raw_cards = json.loads((RAW / "condition_cards.json").read_text(encoding="utf-8"))

PROTOCOLS = {
    "renal_colic": {
        "what_it_is": "Pain caused by a blocked ureter, often due to a kidney stone.",
        "why_in_space": "Microgravity and changes in bone metabolism may raise the risk of stones; "
        "specific evidence still to be checked.",
        "symptoms": "Severe flank pain spreading to the groin; nausea; possible blood in urine.",
        "app_signals": "Reported pain; temperature; vital signs; urine dipstick if available.",
        "onboard_tests": "Ultrasound as support if available; urine dipstick if available. On Earth, NICE NG118 "
        "recommends urgent low-dose CT for adults (not necessarily available on board).",
        "actions_now": "Record onset time, vital signs and signs of infection; pain relief as the authorised "
        "protocol says. NICE: NSAID first line if appropriate; hydration as assessed, without forcing fluids.",
        "red_flags": "Fever with suspected obstruction, no urine output, worsening condition, pain or vomiting "
        "that does not respond to treatment.",
        "t_crit_basis": "NICE NG118 gives pain-relief recommendations; it does not set a single universal "
        "time threshold in minutes for renal colic.",
        "drugs": "NSAID if appropriate; IV paracetamol if NSAID is contraindicated or not enough; opioid if "
        "earlier options are not suitable or effective, as the protocol says. No doses.",
        "supplies": "Ultrasound, gel, gloves, urine dipsticks.",
        "when_earth": "Teleconsultation and image review when latency allows.",
        "when_evacuate": "Suspected infected obstruction, no urine output or deterioration: urgent assessment "
        "for evacuation if feasible.",
        "sources": [
            {"label": "NICE NG118, Renal and ureteric stones: assessment and management",
             "url": "https://www.nice.org.uk/guidance/ng118/chapter/Recommendations"}
        ],
        "status": "DOCUMENT REVIEW DONE / SPACEFLIGHT VALIDATION PENDING",
    },
    "suspected_sepsis": {
        "what_it_is": "Life-threatening organ dysfunction caused by a dysregulated response to infection.",
        "why_in_space": "Isolation and delayed consultation make the response harder; no claim of higher "
        "incidence without data.",
        "symptoms": "Fever or low temperature, fast heart rate, fast breathing, confusion, possible low blood pressure.",
        "app_signals": "Trend of vital signs and mental state; suspected infection.",
        "onboard_tests": "Temperature, blood pressure, pulse, SpO2; lab tests only if really available.",
        "actions_now": "Start the emergency protocol, assess perfusion and organ dysfunction, monitor and ask "
        "for support. In septic shock or high likelihood of sepsis, antimicrobials immediately, ideally within "
        "1 h (SSC 2021). No doses.",
        "red_flags": "New confusion, low blood pressure, breathing difficulty, poor perfusion, rapid worsening.",
        "t_crit_basis": "Surviving Sepsis Campaign 2021: in septic shock or high likelihood of sepsis, "
        "antimicrobials immediately, ideally within 1 h. This is NOT a waiting time before assessment.",
        "drugs": "Antimicrobials and haemodynamic support as the mission medical protocol says. No doses.",
        "supplies": "Monitor, IV material if available.",
        "when_earth": "Remote clinical support; prioritise actions that cannot wait.",
        "when_evacuate": "Instability or organ failure: consider immediate evacuation when possible.",
        "sources": [
            {"label": "Surviving Sepsis Campaign 2021",
             "url": "https://www.sccm.org/clinical-resources/guidelines/guidelines/surviving-sepsis-campaign-guidelines-2021"}
        ],
        "status": "DOCUMENT REVIEW DONE / SPACEFLIGHT VALIDATION PENDING",
    },
    "eye_chemical_burn": {
        "what_it_is": "Eye injury after contact with a chemical substance.",
        "why_in_space": "Products and operations in a closed environment can cause accidental exposures.",
        "symptoms": "Pain, tearing, redness, blurred vision, light sensitivity.",
        "app_signals": "Declared exposure; symptoms; images only as support.",
        "onboard_tests": "Visual assessment; ocular pH if strips are available and the protocol includes it.",
        "actions_now": "Remove from exposure and start immediate, abundant eye irrigation as the protocol says; "
        "do not delay it to consult Earth. Precautions depend on the substance and the risk of a penetrating injury.",
        "red_flags": "Loss or reduction of vision, corneal opacity, persistent severe pain or major exposure.",
        "t_crit_basis": "Guidelines for chemical eye injury prioritise immediate irrigation. The 5 min value "
        "is provisional, NOT a validated safety deadline.",
        "drugs": "Eye treatments only as the protocol says. No doses.",
        "supplies": "Suitable irrigation solution, protection and pH strips if available; real onboard "
        "material to be confirmed.",
        "when_earth": "Teleconsultation after the initial irrigation.",
        "when_evacuate": "Severe injury or vision loss: urgent assessment and evacuation if feasible.",
        "sources": [
            {"label": "AAO EyeWiki, Chemical (Alkali and Acid) Injury of the Conjunctiva and Cornea",
             "url": "https://eyewiki.aao.org/Chemical_(Alkali_and_Acid)_Injury_of_the_Conjunctiva_and_Cornea"}
        ],
        "status": "DOCUMENT REVIEW DONE / SPACEFLIGHT VALIDATION PENDING",
    },
}

# Which signals make a card "compatible" (used to suggest a card from the data).
CARD_REGION = {
    "eye_chemical_burn": "eyes", "smoke_inhalation": "lungs", "suspected_sepsis": "blood",
    "suspected_stroke": "brain", "appendicitis": "kidneys", "renal_colic": "kidneys",
    "urinary_retention_uti": "kidneys", "skin_infection": "skin", "herpes_zoster": "skin",
    "jugular_vte": "neck", "sans": "eyes", "sleep_fatigue": "brain",
}
CARD_SYMPTOM = {
    "eye_chemical_burn": "Chemical splash in the eye", "smoke_inhalation": "Smoke, cough, breathing trouble",
    "suspected_sepsis": "Fever, fast pulse, feeling very unwell", "suspected_stroke": "Face droop, arm weakness, speech change",
    "appendicitis": "Growing belly pain, fever", "renal_colic": "Flank (side) pain",
    "urinary_retention_uti": "Cannot pass urine / burning", "skin_infection": "Red, hot, swollen skin",
    "herpes_zoster": "Painful rash on one side", "jugular_vte": "Abnormal flow on neck ultrasound",
    "sans": "Vision change / OCT due", "sleep_fatigue": "Tired, short nights",
}
cards = []
for c in raw_cards["cards"]:
    card = {k: v for k, v in c.items() if k != "name_es"}
    card["region"] = CARD_REGION[c["id"]]
    card["symptom"] = CARD_SYMPTOM[c["id"]]
    if c["id"] in PROTOCOLS:
        card["protocol"] = PROTOCOLS[c["id"]]
    cards.append(card)
write(
    "condition_cards.json",
    {
        "about": "Condition cards v0.1. Starting values only: every t_crit_min, action and red flag must be "
        "confirmed by the health lead against a clinical guideline. Packet sizes are engineering estimates. "
        "SAMPLE protocols written from public guidelines; NASA protocols are not public. Not medical advice. "
        "Drafted with AI assistance (Claude, Anthropic).",
        "sources": raw_cards["_sources"],
        "cards": cards,
    },
)

# --------------------------------------------------------------------------
# 5. Inventory (FICTIONAL, translated from the health lead's sheet)
# --------------------------------------------------------------------------
STUDIED = "https://pmc.ncbi.nlm.nih.gov/articles/PMC3085701/"
WOTRING15 = "https://pubmed.ncbi.nlm.nih.gov/26187345/"
JAXA = "https://humans-in-space.jaxa.jp/en/biz-lab/med-in-space/healthcare/medops/system/"
NOTE_CATEGORY = "Wotring describes categories of use; it does not prove this specific item is on board."
NOTE_STUDIED = "Does not prove current availability or clinical suitability; results depend on formulation and batch."
NOTE_NONE = "No specific confirmation in the sources reviewed."

def item(id_, type_, name, category, form, qty, conditions, evidence, source, note, stability_alert=False):
    return {
        "id": id_, "type": type_, "name": name, "category": category, "form": form,
        "quantity": qty, "unit": "units", "location": "Kit A-3 (DEMO)", "label_expiry": None,
        "conditions": conditions, "historical_evidence": evidence, "source": source, "note": note,
        "stability_alert": stability_alert,
    }

inventory = [
    item("med_001", "drug", "Paracetamol (acetaminophen)", "Analgesic", "tablet", 8, ["renal_colic"], "not_confirmed", WOTRING15, NOTE_CATEGORY),
    item("med_002", "drug", "Ibuprofen", "NSAID", "tablet", 8, ["renal_colic"], "studied_in_flight_kits", STUDIED, NOTE_STUDIED),
    item("med_003", "drug", "Generic opioid analgesic", "Strong analgesic", "injectable", 8, ["renal_colic"], "not_confirmed", WOTRING15, NOTE_CATEGORY),
    item("med_004", "drug", "Generic antiemetic", "Antiemetic", "tablet", 8, ["renal_colic"], "not_confirmed", WOTRING15, NOTE_CATEGORY),
    item("med_005", "drug", "Promethazine", "Antiemetic", "tablet", 8, ["motion_sickness"], "studied_in_flight_kits", STUDIED, NOTE_STUDIED),
    item("med_006", "drug", "Amoxicillin/clavulanate", "Antibiotic", "tablet", 8, ["skin_infection", "urinary_retention_uti", "appendicitis"], "studied_in_flight_kits", STUDIED, NOTE_STUDIED, True),
    item("med_007", "drug", "Levofloxacin", "Antibiotic", "tablet", 8, ["skin_infection", "urinary_retention_uti", "appendicitis"], "not_confirmed", WOTRING15, NOTE_CATEGORY, True),
    item("med_008", "drug", "Generic cephalosporin", "Antibiotic", "injectable", 8, ["suspected_sepsis", "appendicitis"], "not_confirmed", WOTRING15, NOTE_CATEGORY),
    item("med_009", "drug", "Epinephrine (adrenaline)", "Emergency", "injectable", 8, ["anaphylaxis"], "not_confirmed", WOTRING15, NOTE_CATEGORY),
    item("med_010", "drug", "Aciclovir", "Antiviral", "tablet", 8, ["herpes_zoster"], "studied_in_flight_kits", STUDIED, NOTE_STUDIED),
    item("med_011", "drug", "Enoxaparin", "Anticoagulant", "injectable", 8, ["jugular_vte"], "not_confirmed", WOTRING15, NOTE_CATEGORY),
    item("med_012", "drug", "Lidocaine", "Local anaesthetic", "solution", 8, ["trauma"], "not_confirmed", WOTRING15, NOTE_CATEGORY),
    item("med_013", "drug", "Generic anaesthetic eye drops", "Ophthalmology", "eye drops", 8, ["eye_chemical_burn"], "not_confirmed", WOTRING15, NOTE_CATEGORY),
    item("med_014", "drug", "Generic antibiotic eye drops", "Ophthalmology", "eye drops", 8, ["eye_chemical_burn"], "not_confirmed", WOTRING15, NOTE_CATEGORY),
    item("med_015", "drug", "Saline solution", "Fluids", "bag", 8, ["eye_chemical_burn", "renal_colic", "suspected_sepsis"], "not_confirmed", WOTRING15, NOTE_CATEGORY),
    item("med_016", "drug", "Zolpidem", "Hypnotic", "tablet", 8, ["sleep_fatigue"], "not_confirmed", WOTRING15, NOTE_CATEGORY),
    item("med_017", "drug", "Melatonin", "Sleep", "tablet", 8, ["sleep_fatigue"], "not_confirmed", WOTRING15, NOTE_CATEGORY),
    item("med_018", "drug", "Generic antihistamine", "Allergy", "tablet", 8, ["allergy"], "not_confirmed", WOTRING15, NOTE_CATEGORY),
    item("med_019", "drug", "Levothyroxine", "Hormone", "tablet", 8, ["thyroid"], "studied_in_flight_kits", STUDIED, NOTE_STUDIED, True),
    item("eq_020", "device", "Ultrasound", "Imaging", "device", 1, ["renal_colic", "appendicitis", "urinary_retention_uti", "jugular_vte", "sans"], "documented_on_iss",
         "https://www.nasa.gov/blogs/spacestation/2026/09/24/advanced-health-tech-research-continues-to-protect-astronaut-health/",
         "Ultrasound used in research on the ISS (EchoFinder-2); confirm emergency access and model."),
    item("eq_021", "device", "Pulse oximeter", "Vital signs", "device", 1, ["suspected_sepsis", "smoke_inhalation"], "not_confirmed", JAXA, NOTE_NONE),
    item("eq_022", "device", "Blood pressure cuff", "Vital signs", "device", 1, ["suspected_sepsis", "suspected_stroke"], "documented_on_iss", JAXA,
         "The source describes ISS equipment, not the inventory available on this mission."),
    item("eq_023", "device", "Thermometer", "Vital signs", "device", 1, ["suspected_sepsis", "skin_infection"], "not_confirmed", JAXA, NOTE_NONE),
    item("eq_024", "device", "HemoCue WBC DIFF", "Lab", "device", 1, ["suspected_sepsis"], "not_confirmed", JAXA, NOTE_NONE),
    item("eq_025", "device", "Bio-Analyzer", "Lab", "device", 1, ["suspected_sepsis", "appendicitis"], "not_confirmed", JAXA, NOTE_NONE),
    item("eq_026", "device", "OCT (optical coherence tomography)", "Ophthalmology", "device", 1, ["sans"], "not_confirmed", JAXA, NOTE_NONE),
    item("mat_027", "supply", "Urine dipsticks", "Diagnostic aid", "strip", 0, ["renal_colic", "urinary_retention_uti"], "urine_analysis_documented", JAXA,
         "Do not equate a urine analyser with urine dipsticks; quantity 0 for the DEMO only."),
    item("mat_028", "supply", "Ocular pH strips", "Ophthalmology", "strip", 8, ["eye_chemical_burn"], "not_confirmed", JAXA, NOTE_NONE),
    item("mat_029", "supply", "Fluorescein strips", "Ophthalmology", "strip", 8, ["eye_chemical_burn"], "not_confirmed", JAXA, NOTE_NONE),
    item("mat_030", "supply", "Gloves", "Protection", "pair", 8, ["all"], "not_confirmed", JAXA, NOTE_NONE),
    item("mat_031", "supply", "Sterile gauze", "Wound care", "pack", 8, ["trauma", "skin_infection"], "not_confirmed", JAXA, NOTE_NONE),
    item("mat_032", "supply", "Bandages", "Wound care", "roll", 8, ["trauma"], "not_confirmed", JAXA, NOTE_NONE),
    item("mat_033", "supply", "Splint", "Immobilisation", "unit", 8, ["trauma"], "not_confirmed", JAXA, NOTE_NONE),
    item("mat_034", "supply", "Ultrasound gel", "Imaging", "bottle", 8, ["renal_colic", "jugular_vte", "appendicitis"], "not_confirmed", JAXA, NOTE_NONE),
    item("mat_035", "supply", "Infusion set", "Fluids", "unit", 8, ["suspected_sepsis"], "not_confirmed", JAXA, NOTE_NONE),
    item("mat_036", "supply", "Eye irrigation system", "Ophthalmology", "unit", 8, ["eye_chemical_burn"], "not_confirmed", JAXA, NOTE_NONE),
    item("mat_037", "supply", "Suture kit", "Wound care", "kit", 8, ["trauma"], "not_confirmed", JAXA, NOTE_NONE),
    item("mat_038", "supply", "Oxygen mask", "Respiratory", "unit", 8, ["smoke_inhalation", "respiratory"], "not_confirmed", JAXA, NOTE_NONE),
]
write(
    "inventory.json",
    {
        "about": "FICTIONAL medical inventory for the demo (38 items). Quantities and locations are invented; "
        "label expiry dates are not defined. Historical evidence is kept separate from current stock. CC0.",
        "expiry_rules": [
            {"id": "C01", "rule": "The label date does not prove stability under all flight conditions.",
             "app": "Show the label date plus a space-uncertainty notice; never move the date automatically.", "state": "GENERAL EVIDENCE"},
            {"id": "C02", "rule": "Du et al. tested 35 formulations; at 28 months 9 flight and 17 ground samples met the USP content criterion.",
             "app": "Show an educational alert; do NOT extrapolate percentages to an individual drug.", "state": "GENERAL EVIDENCE"},
            {"id": "C03", "rule": "2023 re-analysis: degradation in space relatively small compared with controls; repackaging can matter a lot.",
             "app": "Do not claim that every drug expires earlier in space.", "state": "GENERAL EVIDENCE"},
            {"id": "C04", "rule": "Individual stability under mission conditions unknown.",
             "app": "State: NO SPACE DATA; label date is administrative only, not a guarantee of efficacy.", "state": "PROPOSED RULE"},
            {"id": "C05", "rule": "Label expiry date already passed.", "app": "Show EXPIRED (LABEL); do not recommend administration.", "state": "PROPOSED RULE"},
            {"id": "C06", "rule": "Quantity is zero.", "app": "Show DEPLETED; exclude from available resources.", "state": "PROPOSED RULE"},
            {"id": "C07", "rule": "Specific evidence of a stability failure exists.",
             "app": "Show STABILITY ALERT with the reference; do NOT compute a new date without batch, formulation, packaging and storage data.", "state": "PROPOSED RULE"},
            {"id": "C08", "rule": "Long-duration mission.",
             "app": "Show months until the label date and an uncertainty warning; do not infer an effective expiry date.", "state": "INTERFACE HYPOTHESIS"},
            {"id": "C09", "rule": "There is no universal shelf-life reduction applicable to the 38 items.",
             "app": "Keep effective_expiry = NOT DETERMINED.", "state": "TO CHECK"},
            {"id": "C10", "rule": "Suggested screen text.",
             "app": "The label date alone does not guarantee stability throughout a space mission. Check the available data and the protocol.", "state": "PROPOSED TEXT"},
        ],
        "stability_references": [
            {"label": "Du et al. 2011, AAPS J: 35 formulations flown on the ISS", "url": STUDIED},
            {"label": "Wotring 2016: 9 medications after long ISS storage", "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC4706284/"},
            {"label": "2023 re-analysis: repackaging and controls", "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC10163248/"},
            {"label": "NASA OCHMO technical brief: pharmaceuticals", "url": "https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-006-pharmaceuticals.pdf"},
        ],
        "items": inventory,
    },
)

# --------------------------------------------------------------------------
# 6. Capabilities: which resources each condition card depends on
#    (team assumption, to be validated by the health lead)
# --------------------------------------------------------------------------
CAPABILITIES = {
    "renal_colic": [
        {"name": "Pain relief", "kind": "treatment", "any_of": ["med_002", "med_001", "med_003"]},
        {"name": "Nausea control", "kind": "treatment", "any_of": ["med_004"]},
        {"name": "Kidney ultrasound", "kind": "test", "all_of": ["eq_020", "mat_034"]},
        {"name": "Rule out infection (urine test)", "kind": "test", "any_of": ["mat_027"]},
        {"name": "Fluids", "kind": "treatment", "any_of": ["med_015"]},
    ],
    "suspected_sepsis": [
        {"name": "IV antibiotic", "kind": "treatment", "all_of": ["med_008", "mat_035"]},
        {"name": "Vital signs every 15 min", "kind": "test", "all_of": ["eq_021", "eq_022", "eq_023"]},
        {"name": "White blood cell count", "kind": "test", "any_of": ["eq_024"]},
        {"name": "Blood panel", "kind": "test", "any_of": ["eq_025"]},
        {"name": "IV fluids", "kind": "treatment", "all_of": ["med_015", "mat_035"]},
    ],
    "eye_chemical_burn": [
        {"name": "Eye irrigation", "kind": "treatment", "any_of": ["mat_036", "med_015"]},
        {"name": "pH check", "kind": "test", "any_of": ["mat_028"]},
        {"name": "Fluorescein exam", "kind": "test", "any_of": ["mat_029"]},
        {"name": "Anaesthetic eye drops", "kind": "treatment", "any_of": ["med_013"]},
        {"name": "Antibiotic eye drops", "kind": "treatment", "any_of": ["med_014"]},
    ],
    "smoke_inhalation": [
        {"name": "Oxygen", "kind": "treatment", "any_of": ["mat_038"]},
        {"name": "SpO2 monitoring", "kind": "test", "any_of": ["eq_021"]},
    ],
    "suspected_stroke": [
        {"name": "Blood pressure", "kind": "test", "any_of": ["eq_022"]},
    ],
    "appendicitis": [
        {"name": "Antibiotics", "kind": "treatment", "any_of": ["med_008", "med_006", "med_007"]},
        {"name": "Abdominal ultrasound", "kind": "test", "all_of": ["eq_020", "mat_034"]},
        {"name": "Blood panel", "kind": "test", "any_of": ["eq_025"]},
    ],
    "urinary_retention_uti": [
        {"name": "Bladder ultrasound", "kind": "test", "any_of": ["eq_020"]},
        {"name": "Urine test", "kind": "test", "any_of": ["mat_027"]},
        {"name": "Oral antibiotic", "kind": "treatment", "any_of": ["med_006", "med_007"]},
    ],
    "skin_infection": [
        {"name": "Oral antibiotic", "kind": "treatment", "any_of": ["med_006", "med_007"]},
        {"name": "Wound care", "kind": "treatment", "any_of": ["mat_031"]},
        {"name": "Temperature", "kind": "test", "any_of": ["eq_023"]},
    ],
    "herpes_zoster": [
        {"name": "Antiviral within 72 h", "kind": "treatment", "any_of": ["med_010"]},
    ],
    "jugular_vte": [
        {"name": "Neck ultrasound", "kind": "test", "all_of": ["eq_020", "mat_034"]},
        {"name": "Anticoagulation", "kind": "treatment", "any_of": ["med_011"]},
    ],
    "sans": [
        {"name": "OCT scan", "kind": "test", "any_of": ["eq_026"]},
        {"name": "Optic nerve ultrasound", "kind": "test", "any_of": ["eq_020"]},
    ],
    "sleep_fatigue": [
        {"name": "Sleep aid (per protocol)", "kind": "treatment", "any_of": ["med_017", "med_016"]},
    ],
}
write("capabilities.json", {
    "about": "Capability = resources x link x person. This file lists which inventory items each condition "
             "depends on (any_of = one is enough; all_of = all are needed). Team assumption, to validate.",
    "capabilities": CAPABILITIES,
})

# --------------------------------------------------------------------------
# 7. Body regions (health lead's texts, translated)
# --------------------------------------------------------------------------
DEMO_AMBER = "DEMO: check the trend, data quality and resources; request an assessment as the protocol says."
DEMO_RED = "DEMO: start the emergency protocol and a medical consultation if there are serious signs; no automatic diagnosis."
EVERY = "As the mission protocol says; no validated universal schedule."
regions = [
    {"id": "brain", "name": "Brain & mood", "spatial": True, "risk": "Sleep, fatigue and behavioural health",
     "space_effect": "Isolation, schedules and the environment can affect sleep and performance.",
     "how_measured": "Sleep self-report, questionnaires, actigraphy if available; voice of the daily message; 3-minute reaction test.",
     "how_often": EVERY, "if_amber": DEMO_AMBER, "if_red": DEMO_RED,
     "resources": ["med_016", "med_017"], "resources_note": "No specific device in the inventory; actigraph NOT INVENTORIED.",
     "source": "https://humanresearchroadmap.nasa.gov/Tasks/task.aspx?i=1623", "status": "PARTIAL: ALERTS AND FREQUENCY NOT VALIDATED",
     "expected_interval_days": 1},
    {"id": "eyes", "name": "Eyes", "spatial": True, "risk": "SANS and vision changes",
     "space_effect": "Fluid shifts towards the head are linked to neuro-ocular changes during long flights. "
                     "Optic disc edema on OCT in 9 of 13 crew by day 150.",
     "how_measured": "Visual acuity, fundus photography and OCT, depending on equipment and protocol.",
     "how_often": EVERY, "if_amber": DEMO_AMBER, "if_red": DEMO_RED,
     "resources": ["eq_026", "eq_020"], "resources_note": "",
     "source": "https://www.nasa.gov/reference/risk-of-spaceflight-associated-neuro-ocular-syndrome-sans/",
     "status": "DESCRIPTION SUPPORTED; ALERTS AND FREQUENCY NOT VALIDATED", "expected_interval_days": 30},
    {"id": "neck", "name": "Neck", "spatial": True, "risk": "Altered flow and jugular vein thrombosis",
     "space_effect": "In microgravity the flow in the jugular veins can change, even without symptoms "
                     "(abnormal flow in 6 of 11 crew, one thrombus).",
     "how_measured": "Jugular Doppler ultrasound, performed according to training and protocol.",
     "how_often": EVERY, "if_amber": DEMO_AMBER, "if_red": DEMO_RED,
     "resources": ["eq_020", "mat_034"], "resources_note": "",
     "source": "https://www.nasa.gov/wp-content/uploads/2026/01/ochmo-mtb-007-venous-thrombosis-in-spaceflight.pdf",
     "status": "DESCRIPTION SUPPORTED; ALERTS AND FREQUENCY NOT VALIDATED", "expected_interval_days": 30},
    {"id": "heart", "name": "Heart", "spatial": True, "risk": "Cardiovascular adaptation",
     "space_effect": "Microgravity changes fluid distribution and can reduce tolerance to standing up after flight. "
                     "24-h blood pressure drops 8-10 mmHg in flight while heart rate does not change (Norsk 2015).",
     "how_measured": "Pulse (Bio-Monitor; camera as a plus), blood pressure and symptoms.",
     "how_often": EVERY, "if_amber": DEMO_AMBER, "if_red": DEMO_RED,
     "resources": ["eq_022", "eq_021", "eq_023"], "resources_note": "",
     "source": "https://humanresearchroadmap.nasa.gov/Tasks/task.aspx?i=1164", "status": "PARTIAL: ALERTS AND FREQUENCY NOT VALIDATED",
     "expected_interval_days": 1},
    {"id": "lungs", "name": "Lungs", "spatial": True, "risk": "CO2 and breathing",
     "space_effect": "The closed cabin requires CO2 control; build-up can cause discomfort and lower performance "
                     "(symptoms reported from 2.3 mmHg; ISS limit 3.0 mmHg).",
     "how_measured": "Cabin CO2 sensor and, for the crew member, breathing rate and SpO2 if needed.",
     "how_often": EVERY, "if_amber": DEMO_AMBER, "if_red": DEMO_RED,
     "resources": ["eq_021", "eq_023", "mat_038"], "resources_note": "Oxygen mask only if indicated.",
     "source": "https://www.nasa.gov/ochmo-tb-004-carbon-dioxide-2/", "status": "DESCRIPTION SUPPORTED; ALERTS AND FREQUENCY NOT VALIDATED",
     "expected_interval_days": 1},
    {"id": "musculoskeletal", "name": "Bones & muscles", "spatial": True, "risk": "Bone and muscle loss",
     "space_effect": "Long unloading favours loss of muscle mass and strength and bone loss (about 1-1.5% bone density per month).",
     "how_measured": "Exercise log, body mass, functional tests; DXA mainly before and after flight.",
     "how_often": EVERY, "if_amber": DEMO_AMBER, "if_red": DEMO_RED,
     "resources": [], "resources_note": "No densitometer or dynamometer in the inventory.",
     "source": "https://humanresearchroadmap.nasa.gov/explore/", "status": "PARTIAL: ALERTS AND FREQUENCY NOT VALIDATED",
     "expected_interval_days": 7},
    {"id": "kidneys", "name": "Kidneys & urinary tract", "spatial": True, "risk": "Kidney stones",
     "space_effect": "Changes in calcium metabolism and hydration can influence the risk of stones.",
     "how_measured": "Symptoms, fluid balance, ultrasound and urine tests if available.",
     "how_often": EVERY, "if_amber": DEMO_AMBER, "if_red": DEMO_RED,
     "resources": ["eq_020", "mat_034", "mat_027"], "resources_note": "Urine dipsticks: quantity 0 in the demo.",
     "source": "https://www.nasa.gov/wp-content/uploads/2025/01/ochmo-mtb-003-urinary-health.pdf",
     "status": "DESCRIPTION SUPPORTED; ALERTS AND FREQUENCY NOT VALIDATED", "expected_interval_days": 14},
    {"id": "blood", "name": "Blood, immunity & radiation", "spatial": False, "risk": "Immune changes and radiation",
     "space_effect": "Spaceflight can alter immune responses (herpesvirus reactivation in 61% of ISS crew); radiation is a mission risk "
                     "(about 1.8 mSv/day measured in transit to Mars; career limit 600 mSv, NASA-STD-3001).",
     "how_measured": "Mission dosimetry; temperature; lab tests (HemoCue, Bio-Analyzer) only if available.",
     "how_often": EVERY, "if_amber": DEMO_AMBER, "if_red": DEMO_RED,
     "resources": ["eq_024", "eq_025", "eq_023"], "resources_note": "HemoCue does not confirm immunity; no dosimeter inventoried.",
     "source": "https://humanresearchroadmap.nasa.gov/explore/", "status": "PARTIAL: ALERTS AND FREQUENCY NOT VALIDATED",
     "expected_interval_days": 1},
    {"id": "skin", "name": "Skin", "spatial": False, "risk": "Irritation and skin infections",
     "space_effect": "Humidity, friction and the closed environment can favour skin problems.",
     "how_measured": "Inspection and clinical photos with a scale, with consent, as the protocol says.",
     "how_often": EVERY, "if_amber": DEMO_AMBER, "if_red": DEMO_RED,
     "resources": ["eq_023", "mat_030", "mat_031"], "resources_note": "",
     "source": "https://humanresearchroadmap.nasa.gov/explore/", "status": "PARTIAL: ALERTS AND FREQUENCY NOT VALIDATED",
     "expected_interval_days": 14},
]
write("regions.json", {"about": "Body regions. Texts by the health lead (translated). CC BY 4.0. Alerts not clinically validated.",
                       "regions": regions})

# --------------------------------------------------------------------------
# 8. Learn screen (translated)
# --------------------------------------------------------------------------
learn = [
    {"title": "What is SANS?", "text": "SANS is a set of eye and neuro-ocular changes linked to long spaceflights. It can change the shape of the eyeball and the optic nerve. Not everyone has symptoms. Following vision and eye images over time helps detect changes that need an assessment.",
     "source": "NASA - Risk of Spaceflight-Associated Neuro-ocular Syndrome (SANS)", "url": "https://www.nasa.gov/reference/risk-of-spaceflight-associated-neuro-ocular-syndrome-sans/"},
    {"title": "Why do astronauts lose bone?", "text": "In microgravity bones carry less load and can lose mineral density. This raises the risk of fragility, especially on long missions. Resistance exercise and other countermeasures reduce the loss but do not remove every risk. The assessment depends on each astronaut's history.",
     "source": "NASA Human Research Program - musculoskeletal risks", "url": "https://www.nasa.gov/hrp/"},
    {"title": "What is silent jugular thrombosis?", "text": "In microgravity body fluids shift and the venous flow in the neck can change. Jugular vein thrombosis has been described in astronauts, even without clear symptoms. Ultrasound can provide information, but an app alert is not a diagnosis.",
     "source": "NASA OCHMO - Venous thrombosis in spaceflight", "url": "https://www.nasa.gov/wp-content/uploads/2026/01/ochmo-mtb-007-venous-thrombosis-in-spaceflight.pdf"},
    {"title": "Why does CO2 matter?", "text": "The cabin is a closed environment and carbon dioxide must be controlled all the time. High levels can be linked to headache and other effects on wellbeing or performance. With symptoms, check the environmental readings and follow mission procedures, without automatically blaming CO2.",
     "source": "NASA OCHMO - Carbon dioxide technical brief", "url": "https://www.nasa.gov/ochmo-tb-004-carbon-dioxide-2/"},
    {"title": "What is the radiation dose?", "text": "Space radiation includes particles from the Sun and from deep space. The cumulative dose is one of the variables used to assess risk, but it is not enough on its own: the type of exposure and its duration also matter. Protective measures depend on the mission and on agency protocols.",
     "source": "NASA - Five Hazards of Human Spaceflight", "url": "https://www.nasa.gov/hrp/"},
    {"title": "Do medicines expire earlier in space?", "text": "Some medicines studied after staying on the ISS showed stability problems. Those results do not let us set a new expiry date for every drug: formulation, packaging and storage all matter. SOSpesIA separates the label expiry date from a stability alert that has not been validated.",
     "source": "Du et al. (2011), Evaluation of Physical and Chemical Changes in Pharmaceuticals Flown on Space Missions", "url": "https://pubmed.ncbi.nlm.nih.gov/21479701/"},
    {"title": "Why does Earth take so long to answer?", "text": "Communication with a distant spacecraft is not instant: radio signals travel at the speed of light. On missions to Mars the wait can be several minutes each way, and weeks with no link during solar conjunction. That is why some urgent measures must be planned in onboard protocols and not depend on an immediate answer from Earth.",
     "source": "JPL approximate planetary positions (team link table)", "url": "https://ssd.jpl.nasa.gov/planets/approx_pos.html"},
    {"title": "What is adaptive monitoring?", "text": "It means reading a measurement against the person's usual pattern and the mission conditions, and measuring more only when something justifies it. A change from the baseline can trigger a check, but does not prove a disease on its own. It is an approach proposed by SOSpesIA, not a validated clinical function.",
     "source": "SOSpesIA team proposal (internal source, not clinical evidence)", "url": ""},
    {"title": "What is the IMM?", "text": "The Integrated Medical Model (IMM) is a NASA modelling tool used to study medical risks of space missions. It helps explore scenarios and resource needs, but its estimates are not individual diagnoses.",
     "source": "NASA - Integrated Medical Model", "url": "https://www.nasa.gov/hrp/"},
    {"title": "What is the authority dial?", "text": "It is a SOSpesIA visual that compares how long Earth needs to answer with how urgent an incident is (A = Earth response time / time available). It explains when a crew may need to apply a pre-approved protocol without waiting for Earth. It does not replace medical judgement or authorise any intervention by itself.",
     "source": "SOSpesIA team proposal (not clinically validated)", "url": ""},
]
write("learn.json", {"about": "Learn screen texts by the health lead (translated). Status: TO CHECK. CC BY 4.0.", "topics": learn})

# --------------------------------------------------------------------------
# 9. Scenario library (24), translated
# --------------------------------------------------------------------------
scenarios = [
    ("renal_colic", "Renal colic", "acute medical", "all", "Flank pain, blood on the urine dipstick", "Protocol + inventory (urine dipsticks missing) + dial; on Mars, ultrasound without live guidance", "IMM Mars: kidney stones among top drivers of evacuation", "renal_colic", "CM-4", 52),
    ("sepsis", "Suspected sepsis", "acute medical", "all", "Fever, fast pulse, low blood pressure, high WBC", "Intensive monitoring every 15 min; protocol antibiotic; dial (T_crit 1 h)", "IMM Mars: sepsis, top modelled cause of death", "suspected_sepsis", "CM-3", 44),
    ("appendicitis", "Suspected appendicitis", "acute medical", "all", "Growing abdominal pain, fever", "No surgery on board: antibiotics protocol, evacuation assessment by profile", "IMM Mars; most common patrol-threatening case on Vanguard submarines", "appendicitis", None, None),
    ("eye_burn", "Chemical eye burn", "trauma / accident", "all", "Chemical splash", "Immediate action (irrigation) without waiting: the dial always shows CREW", "IMM Mars: top driver of evacuation", "eye_chemical_burn", None, None),
    ("trauma", "Trauma (fall, blow, fracture)", "trauma / accident", "lunar surface, Mars surface, orbit", "Fall during EVA or in the habitat", "Immobilisation with what is in the inventory; capability lost if no splint", "IMPACT, long lunar mission: trauma among the largest risks", None, None, None),
    ("decompression", "Decompression sickness after a spacewalk", "operational", "lunar surface, orbit, Mars surface", "Joint pain or neurological symptoms after EVA", "Intensive monitoring after each EVA; recompression protocol if it exists", "IMPACT, long lunar mission: main contributor to risk", None, None, None),
    ("respiratory_failure", "Respiratory failure", "acute medical", "all", "Fast breathing, SpO2 falling", "Oxygen from the inventory; continuous monitoring", "IMPACT, long lunar mission", "smoke_inhalation", None, None),
    ("smoke_fire", "Smoke inhalation (fire on board)", "environment", "all", "Smoke alarm, cough", "Several affected at once; oxygen and triage", "IMM Mars: smoke inhalation among modelled causes of death", "smoke_inhalation", None, None),
    ("high_co2", "High cabin CO2", "environment", "all", "CO2 system failure; crew headaches", "Links symptoms across the crew to the environment; not an individual problem", "Symptoms from 2.3 mmHg; ISS limit 3.0 mmHg", None, None, None),
    ("solar_storm", "Solar storm (particle event)", "radiation", "lunar transit, lunar surface, Mars transit, Mars surface", "Space weather alert", "Shelter warning; event dose vs the 250 mSv per-event limit", "NASA-STD-3001", None, None, None),
    ("dose_budget", "Radiation dose budget", "radiation", "Mars transit, Mars surface", "Cumulative dose approaching the career limit", "Projection to mission end vs 600 mSv", "NASA-STD-3001; 1.8 mSv/day in transit to Mars", None, None, None),
    ("sans", "Eye changes (SANS) without symptoms", "silent", "orbit, Mars transit, Moon (long)", "OCT due and not done", "Grey zone on the 3D body; OCT brought forward if a blackout is coming", "Optic disc edema in 9 of 13 crew by day 150", "sans", None, None),
    ("jugular_thrombosis", "Jugular thrombosis without symptoms", "silent", "orbit, Mars transit", "Scheduled ultrasound shows abnormal flow", "Anticoagulation decision with inventory and dial", "Abnormal flow in 6 of 11 crew, 1 thrombus", "jugular_vte", None, None),
    ("bone_loss", "Progressive bone loss", "silent / slow", "long missions", "Weeks-long trend", "Evolution and projection; more exercise", "1-1.5% per month", None, None, None),
    ("sleep_fatigue", "Sleep loss and accumulated fatigue", "behavioural", "all", "Several short nights", "Intensive level; discordance if the self-report says 'fine'", "About 6 h of sleep on average on the ISS", "sleep_fatigue", "CM-2", 33),
    ("low_mood", "Low mood, disconnection from Earth", "behavioural", "long missions, isolation", "Voice and message volume drop for weeks", "Trend + discreet notice + private conference; never without permission", "Disconnection observed in Mars-500 and SIRIUS-19", None, None, None),
    ("herpes_zoster", "Virus reactivation (shingles)", "immune", "long missions", "Painful rash", "72 h window for antivirals; inventory", "Reactivation in 61% of ISS crew", "herpes_zoster", None, None),
    ("cmo_patient", "The medical officer is the patient", "operational", "all", "The CMO falls ill", "The app guides another crew member step by step in plain language", "CMO training of about 15 h", None, None, None),
    ("mass_casualty", "Several affected at once", "operational", "all", "Fire, poisoning, accident", "Crew triage and sharing limited resources", "Team assumption", None, None, None),
    ("device_failure", "A medical device fails", "resources", "all", "Ultrasound or HemoCue failure", "'What do we lose if...?': conditions that lose their test or treatment", "Team assumption", None, None, None),
    ("drug_depleted", "A drug runs out or degrades", "resources", "long missions without resupply", "Low stock or stability alert", "Protocol alternatives; capabilities at risk", "Drugs failed before expiry after 28 months on the ISS", None, None, None),
    ("no_link", "Incident during a communications blackout", "communications", "lunar surface without relay, Mars transit (conjunction)", "Any incident with no link", "Dial on CREW; log to send later", "17 days with no link in the 2028 conjunction (team table); half-month lunar visibility", "renal_colic", None, None),
    ("return", "Return to gravity", "post-flight", "all", "Landing or return", "Recovery tracking against the preflight reference", "Post-flight phase", None, None, None),
    ("evacuation", "Evacuation decision", "operational", "low Earth orbit, Moon", "Worsening despite treatment", "Compares the profile's evacuation time with the critical time", "Crew-11: first ISS medical evacuation, January 2026 [secondary source]", None, None, None),
]
write("scenarios.json", {
    "about": "SOSpesIA scenario library (24). Clinical values pending validation by the health lead. CC0. Generated with AI assistance (Claude, Anthropic).",
    "scenarios": [
        {"id": s[0], "name": s[1], "category": s[2], "profiles": s[3], "trigger": s[4], "app_action": s[5],
         "basis": s[6], "card": s[7], "crew": s[8], "day": s[9]}
        for s in scenarios
    ],
})

# --------------------------------------------------------------------------
# 10. Mission profiles
# --------------------------------------------------------------------------
profiles = [
    {"id": "leo", "name": "Low Earth orbit (ISS)", "short": "ISS", "link_model": "constant", "owlt_s": 0.0, "rate_kbps": 10000,
     "gravity_g": 0, "evacuation": "Under 24 h to definitive care", "resupply": "Yes, cargo vehicles", "usual_decider": "Earth",
     "notes": "Near real-time link.", "source": "NTRS 20240011063"},
    {"id": "lunar_orbit", "name": "Lunar orbit / transit (Artemis, Gateway)", "short": "Lunar orbit", "link_model": "constant", "owlt_s": 1.28, "rate_kbps": 5000,
     "gravity_g": 0, "evacuation": "Days", "resupply": "Limited", "usual_decider": "Earth, with onboard support",
     "notes": "Seconds of delay: enough to make live conversation harder.", "source": "NTRS 20240011063"},
    {"id": "lunar_relay", "name": "Lunar south pole (with relay)", "short": "Moon + relay", "link_model": "constant", "owlt_s": 1.28, "rate_kbps": 5000,
     "gravity_g": 0.16, "evacuation": "Up to ~14 days stabilising on board", "resupply": "Very limited", "usual_decider": "Shared",
     "notes": "Relay satellites give a continuous link.", "source": "NTRS 20240011063"},
    {"id": "lunar_no_relay", "name": "Lunar south pole (no relay)", "short": "Moon, no relay", "link_model": "lunar_visibility", "owlt_s": 1.28, "rate_kbps": 5000,
     "gravity_g": 0.16, "evacuation": "Up to ~14 days stabilising on board", "resupply": "Very limited", "usual_decider": "Crew during gaps",
     "notes": "Without relay satellites Earth is visible only half of each sidereal month (27.32 d). Team model: visibility phase anchored at launch.",
     "source": "NASA 2024; team model"},
    {"id": "mars_transit", "name": "Mars transit", "short": "Mars transit", "link_model": "mars_table", "owlt_s": None, "rate_kbps": None,
     "gravity_g": 0, "evacuation": "Not possible", "resupply": "No", "usual_decider": "Crew, increasingly",
     "notes": "0-22 min each way; weeks with no link during solar conjunction.", "source": "McBrayer 2022; team link table (JPL)",
     "radiation_ref": "About 1.8 mSv/day measured in transit to Mars (Zeitlin 2013)"},
    {"id": "mars_surface", "name": "Mars surface", "short": "Mars surface", "link_model": "mars_table", "owlt_s": None, "rate_kbps": None,
     "gravity_g": 0.38, "evacuation": "Not possible", "resupply": "No", "usual_decider": "Crew",
     "notes": "Same delay as transit. Partial-gravity references are not well known yet.", "source": "Team link table (JPL)"},
    {"id": "analog", "name": "Earth analog (Antarctica, HERA, submarine)", "short": "Analog", "link_model": "configurable", "owlt_s": 0.0, "rate_kbps": 2000,
     "gravity_g": 1, "evacuation": "Variable", "resupply": "Variable", "usual_decider": "Configurable",
     "notes": "Delay is configurable for training.", "source": "Team assumption"},
]
write("profiles.json", {
    "about": "Mission profiles. Link rates: Mars uses a 1/d^2 model anchored to published MRO figures with 10% reserved for medicine (placeholder). ISS/Moon rates are team placeholders.",
    "assumptions": {
        "t_ground_min": 15.0, "earth_threshold": 0.25, "crew_threshold": 1.0, "medical_share": 0.10,
        "live_guidance_max_rtt_s": 3.0, "lunar_sidereal_month_d": 27.32,
    },
    "profiles": profiles,
})
print("done")
