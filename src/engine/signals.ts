// Signal catalogue: labels, which way is "bad", expected measurement interval and
// provisional absolute rules. ALL thresholds here are team assumptions for the demo
// and must be validated by the health lead. They are not clinical rules.
import type { RegionId, Status } from "../types";

export type Direction = "both" | "high" | "low" | "none";

export interface SignalMeta {
  label: string;
  region: RegionId;
  direction: Direction;
  /** expected days between measurements (used for silent / grey zones) */
  intervalDays: number;
  /** only measured when something happens (pain, symptoms): absence is not "silent" */
  eventOnly?: boolean;
  decimals: number;
  /** cap the colour: e.g. behavioural voice features never go red on their own */
  maxStatus?: Status;
  /** absolute rule; returns a status or null to fall back to the personal band */
  absolute?: (v: number) => { status: Status; why: string } | null;
  /** absolute rule replaces the personal band completely */
  absoluteOnly?: boolean;
  /** what the evidence says about the expected in-flight change */
  expectedInFlight?: string;
  how: string;
}

const CAREER_LIMIT_MSV = 600; // NASA-STD-3001 career limit

export const SIGNALS: Record<string, SignalMeta> = {
  heart_rate: {
    label: "Heart rate", region: "heart", direction: "both", intervalDays: 1, decimals: 0,
    expectedInFlight: "No change expected in flight (Norsk 2015, n = 8).",
    how: "Daily, from the message to Earth (camera, estimated) or the Bio-Monitor.",
  },
  bp_systolic: {
    label: "Systolic blood pressure", region: "heart", direction: "both", intervalDays: 7, decimals: 0,
    expectedInFlight: "24-h pressure drops 8-10 mmHg in flight (Norsk 2015): a lower value can be normal.",
    how: "Weekly with the cuff, or on demand.",
  },
  bp_diastolic: {
    label: "Diastolic blood pressure", region: "heart", direction: "both", intervalDays: 7, decimals: 0,
    expectedInFlight: "Expected to drop slightly in flight (Norsk 2015).",
    how: "Weekly with the cuff, or on demand.",
  },
  respiratory_rate: {
    label: "Breathing rate", region: "lungs", direction: "both", intervalDays: 1, decimals: 0, maxStatus: "amber",
    how: "Daily, estimated from shoulder movement in the message video.",
  },
  spo2: {
    label: "Oxygen saturation (SpO2)", region: "lungs", direction: "low", intervalDays: 7, decimals: 0,
    absolute: (v) => (v < 90 ? { status: "red", why: "SpO2 below 90% (provisional rule)" } : v < 94 ? { status: "amber", why: "SpO2 below 94% (provisional rule)" } : null),
    how: "Bio-Monitor or pulse oximeter, weekly or on demand.",
  },
  cabin_co2: {
    label: "Cabin CO2", region: "lungs", direction: "high", intervalDays: 1, decimals: 2,
    absolute: (v) => (v > 3.0 ? { status: "amber", why: "Above the ISS limit of 3.0 mmHg" } : v >= 2.3 ? { status: "green", why: "Symptoms have been reported from 2.3 mmHg: watch together with headaches" } : null),
    expectedInFlight: "Around 2.5 mmHg on the ISS; symptoms reported from 2.3 mmHg; ISS limit 3.0 mmHg.",
    how: "Life-support sensors, continuous. It is an environment signal: it affects the whole crew.",
  },
  sleep: {
    label: "Sleep (actigraphy)", region: "brain", direction: "low", intervalDays: 1, decimals: 1,
    expectedInFlight: "About 6 h per night on average on the ISS (Barger 2014).",
    how: "Wrist actigraph, continuous and passive.",
  },
  sleep_self_report: {
    label: "Sleep quality (self-report)", region: "brain", direction: "none", intervalDays: 1, decimals: 0,
    how: "Daily questionnaire, 1-5. Compared with the actigraph to detect discordance.",
  },
  mood: {
    label: "Mood (self-report)", region: "brain", direction: "low", intervalDays: 1, decimals: 0, maxStatus: "amber",
    how: "Daily questionnaire, 1-5.",
  },
  reaction_lapses: {
    label: "Reaction test lapses", region: "brain", direction: "high", intervalDays: 1, decimals: 0,
    how: "3-minute reaction test, daily. NASA uses cognitive batteries on the ISS.",
  },
  speech_rate: {
    label: "Speech rate", region: "brain", direction: "low", intervalDays: 1, decimals: 2, maxStatus: "amber",
    how: "Daily, from the voice of the message to Earth. Compared with your own mean only.",
  },
  pause_fraction: {
    label: "Pauses in speech", region: "brain", direction: "high", intervalDays: 1, decimals: 2, maxStatus: "amber",
    how: "Daily, from the voice of the message to Earth.",
  },
  message_duration: {
    label: "Message length", region: "brain", direction: "low", intervalDays: 1, decimals: 0, maxStatus: "amber",
    expectedInFlight: "Message volume fell progressively in Mars-500 and SIRIUS-19 (disconnection from mission control).",
    how: "Daily: how long the message to Earth lasts.",
  },
  temperature: {
    label: "Body temperature", region: "blood", direction: "both", intervalDays: 1, decimals: 1,
    absolute: (v) => (v >= 38 ? { status: "red", why: "Fever: 38.0 °C or more (provisional rule)" } : v >= 37.5 ? { status: "amber", why: "37.5 °C or more (provisional rule)" } : null),
    how: "Thermometer, daily.",
  },
  glucose: {
    label: "Blood glucose", region: "blood", direction: "both", intervalDays: 7, decimals: 0,
    how: "Glucometer, weekly or on demand (mg/dL).",
  },
  wbc: {
    label: "White blood cells", region: "blood", direction: "both", intervalDays: 14, decimals: 1,
    absolute: (v) => (v > 13 ? { status: "red", why: "Above 13 x10^3/uL (illustrative lab range)" } : v > 11 ? { status: "amber", why: "Above 11 x10^3/uL (illustrative lab range)" } : null),
    how: "HemoCue WBC DIFF, every 2 weeks or with fever.",
  },
  inflammation_marker: {
    label: "Inflammation marker", region: "blood", direction: "high", intervalDays: 14, decimals: 1,
    absolute: (v) => (v > 20 ? { status: "red", why: "Far above the illustrative range" } : null),
    how: "Bio-Analyzer, every 2 weeks or with fever. Units illustrative.",
  },
  cumulative_dose: {
    label: "Cumulative radiation dose", region: "blood", direction: "none", intervalDays: 1, decimals: 1,
    absolute: (v) => {
      const p = v / CAREER_LIMIT_MSV;
      return p >= 0.8 ? { status: "red", why: `${Math.round(p * 100)}% of the 600 mSv career limit` }
        : p >= 0.5 ? { status: "amber", why: `${Math.round(p * 100)}% of the 600 mSv career limit` }
          : { status: "green", why: `${Math.round(p * 100)}% of the 600 mSv career limit (NASA-STD-3001)` };
    },
    absoluteOnly: true,
    expectedInFlight: "About 1.8 mSv/day measured in transit to Mars (Zeitlin 2013).",
    how: "Personal dosimeter, continuous.",
  },
  optic_disc_edema: {
    label: "Optic disc edema (OCT)", region: "eyes", direction: "high", intervalDays: 30, decimals: 0,
    absolute: (v) => (v >= 2 ? { status: "red", why: "Clear optic disc edema (provisional rule)" } : v >= 1 ? { status: "amber", why: "Mild optic disc edema: repeat OCT" } : { status: "green", why: "No edema on the last OCT" }),
    absoluteOnly: true,
    expectedInFlight: "Optic disc edema on OCT in 9 of 13 crew by day 150; most had no symptoms.",
    how: "OCT (Frisén grade 0-5), scheduled about every 30 days and before a blackout.",
  },
  jugular_flow: {
    label: "Jugular flow (ultrasound)", region: "neck", direction: "high", intervalDays: 30, decimals: 0,
    absolute: (v) => (v >= 2 ? { status: "red", why: "Reverse flow or thrombus (provisional rule)" } : v >= 1 ? { status: "amber", why: "Stagnant flow without symptoms: repeat the scan and check resources" } : { status: "green", why: "Normal flow on the last scan" }),
    absoluteOnly: true,
    expectedInFlight: "Stagnant or reverse jugular flow in 6 of 11 crew, one thrombus, no symptoms (Marshall-Goebel 2019).",
    how: "Neck Doppler ultrasound (0 normal, 1 stagnant, 2 reverse/thrombus), scheduled about every 30 days.",
  },
  body_mass: {
    label: "Body mass", region: "musculoskeletal", direction: "low", intervalDays: 7, decimals: 1,
    how: "Mass measurement device, weekly (scales do not work in microgravity).",
  },
  urine_blood: {
    label: "Blood on urine dipstick", region: "kidneys", direction: "high", intervalDays: 14, decimals: 0,
    absolute: (v) => (v >= 2 ? { status: "red", why: "Clear blood on the dipstick (provisional rule)" } : v >= 1 ? { status: "amber", why: "Trace of blood (provisional rule)" } : { status: "green", why: "Negative" }),
    absoluteOnly: true,
    how: "Urine dipstick, every 2 weeks or with symptoms (0-3).",
  },
  pain: {
    label: "Pain (self-report)", region: "kidneys", direction: "high", intervalDays: 1, eventOnly: true, decimals: 0,
    absolute: (v) => (v >= 7 ? { status: "red", why: "Severe pain (7/10 or more)" } : v >= 4 ? { status: "amber", why: "Moderate pain" } : { status: "green", why: "Mild or no pain" }),
    absoluteOnly: true,
    how: "Reported when it appears (0-10).",
  },
};

export const STATUS_RANK: Record<Status, number> = { silent: -1, green: 0, amber: 1, red: 2 };

export function worst(a: Status, b: Status): Status {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

export const STATUS_LABEL: Record<Status, string> = {
  green: "Within expected", amber: "Watch", red: "Act now", silent: "No recent data",
};

export function signalLabel(id: string): string {
  return SIGNALS[id]?.label ?? id.replace(/_/g, " ");
}

export function formatValue(signal: string, v: number): string {
  const d = SIGNALS[signal]?.decimals ?? 1;
  return v.toFixed(d);
}

/** Value with unit; ordinal scales ("0-10", "1-5") are shown as "7/10". */
export function withUnit(signal: string, v: number, unit: string): string {
  const m = unit.match(/^(\d+)-(\d+)$/);
  if (m) return `${formatValue(signal, v)}/${m[2]}`;
  return `${formatValue(signal, v)} ${unit}`;
}

export const SOURCE_LABEL: Record<string, string> = {
  camera_rppg: "Camera (rPPG, estimated)",
  camera: "Camera (estimated)",
  microphone: "Microphone (voice)",
  actigraph: "Wrist actigraph",
  questionnaire: "Questionnaire",
  reaction_test: "Reaction test",
  life_support: "Life-support sensors",
  dosimeter: "Personal dosimeter",
  thermometer: "Thermometer",
  bp_cuff: "Blood pressure cuff",
  bio_monitor: "Bio-Monitor",
  mass_device: "Body mass device",
  glucometer: "Glucometer",
  hemocue_wbc: "HemoCue WBC DIFF",
  bio_analyzer: "Bio-Analyzer",
  urine_strip: "Urine dipstick",
  ultrasound: "Ultrasound",
  oct: "OCT",
  manual: "Manual entry",
};

/** Data source -> inventory item that provides it (so a failed device also silences its data). */
export const SOURCE_DEVICE: Record<string, string | undefined> = {
  bp_cuff: "eq_022",
  thermometer: "eq_023",
  hemocue_wbc: "eq_024",
  bio_analyzer: "eq_025",
  urine_strip: "mat_027",
  bio_monitor: "eq_021",
  ultrasound: "eq_020",
  oct: "eq_026",
};
