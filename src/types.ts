// Shared data types for SOSpesAI. All data files live in public/data/ and are
// produced by scripts/build_data.py from the team's original files.

export type Status = "green" | "amber" | "red" | "silent";

export type RegionId =
  | "brain" | "eyes" | "neck" | "heart" | "lungs"
  | "musculoskeletal" | "kidneys" | "blood" | "skin";

export type CrewId = "CM-1" | "CM-2" | "CM-3" | "CM-4";

export interface Observation {
  crew: string;
  phase: "preflight" | "inflight";
  day: number;
  signal: string;
  value: number;
  unit: string;
  time: string;
  source: string;
  method: "estimated" | "clinical" | "self_report";
  quality: number;
  region: RegionId;
  /** true for values typed or measured live in the app (not synthetic) */
  live?: boolean;
  /** id of the simulator scenario that produced it (removed with "Remove scenario") */
  scenario?: string;
}

export interface DemoEvent { crew: string; days: [number, number]; label: string }

export interface ObservationsFile {
  about: string;
  launch_date: string;
  demo_events: DemoEvent[];
  observations: Observation[];
}

export interface Baseline {
  unit: string;
  pre_mean: number; pre_sd: number; pre_n: number;
  flight_mean: number; flight_sd: number; flight_n: number;
  band_min: number; band_max: number;
  change_flight_vs_pre: number;
  band_reliable: boolean;
}

export interface BaselinesFile {
  k_sd: number;
  excluded_events: Record<string, [number, number]>;
  baselines: Record<string, Record<string, Baseline>>;
}

export interface MarsLinkFile {
  columns: string[];
  /** [date, dist_au, owlt_s, sep_deg, conjunction] */
  rows: [string, number, number, number, number][];
}

export interface PacketItem { item: string; size_kB_estimate: number }

export interface Protocol {
  what_it_is: string; why_in_space: string; symptoms: string; app_signals: string;
  onboard_tests: string; actions_now: string; red_flags: string; t_crit_basis: string;
  drugs: string; supplies: string; when_earth: string; when_evacuate: string;
  sources: { label: string; url: string }[];
  status: string;
}

export type EarthMode = "text" | "async_images" | "live_video";

export interface ConditionCard {
  id: string;
  name: string;
  nasa_basis: string;
  silent: boolean;
  t_crit_min: number;
  t_crit_basis: string;
  earth_best_mode: EarthMode;
  packet: PacketItem[];
  onboard_tools: string[];
  no_regret: string[];
  red_flags: string[];
  status: string;
  region: RegionId;
  symptom: string;
  protocol?: Protocol;
}

export interface InventoryItem {
  id: string;
  type: "drug" | "device" | "supply";
  name: string;
  category: string;
  form: string;
  quantity: number;
  unit: string;
  location: string;
  label_expiry: string | null;
  conditions: string[];
  historical_evidence: string;
  source: string;
  note: string;
  stability_alert: boolean;
}

export interface ExpiryRule { id: string; rule: string; app: string; state: string }

export interface InventoryFile {
  about: string;
  expiry_rules: ExpiryRule[];
  stability_references: { label: string; url: string }[];
  items: InventoryItem[];
}

export interface Capability {
  name: string;
  kind: "test" | "treatment";
  any_of?: string[];
  all_of?: string[];
}

export interface Region {
  id: RegionId;
  name: string;
  spatial: boolean;
  risk: string;
  space_effect: string;
  how_measured: string;
  how_often: string;
  if_amber: string;
  if_red: string;
  resources: string[];
  resources_note: string;
  source: string;
  status: string;
  expected_interval_days: number;
}

export interface LearnTopic { title: string; text: string; source: string; url: string }

export interface Scenario {
  id: string; name: string; category: string; profiles: string; trigger: string;
  app_action: string; basis: string; card: string | null; crew: string | null; day: number | null;
}

export type LinkModel = "constant" | "lunar_visibility" | "mars_table" | "configurable";

export interface MissionProfile {
  id: string;
  name: string;
  short: string;
  link_model: LinkModel;
  owlt_s: number | null;
  rate_kbps: number | null;
  gravity_g: number;
  evacuation: string;
  resupply: string;
  usual_decider: string;
  notes: string;
  source: string;
  radiation_ref?: string;
}

export interface LinkAssumptions {
  t_ground_min: number;
  earth_threshold: number;
  crew_threshold: number;
  medical_share: number;
  live_guidance_max_rtt_s: number;
  lunar_sidereal_month_d: number;
}

// Radiation each mission adds: NASA measurements and estimates against NASA's career limit (public/data/radiation.json).
export interface RadiationSource { short: string; title: string; url: string; }
export interface RadiationEnvironment {
  kind: "measured" | "typical" | "projected";
  rate_mSv_day: [number, number] | null;
  where?: string;
  note?: string;
  short?: string;
  mission_note?: string;
  sources: RadiationSource[];
}
export interface RadiationFile {
  career_limit: { mSv: number; short: string; title: string; url: string };
  environments: Record<string, RadiationEnvironment>;
  by_profile: Record<string, string | null>;
}
export interface RadiationInfo {
  kind: RadiationEnvironment["kind"];
  rateMSvDay: [number, number] | null;
  daysToLimit: [number, number] | null;
  limitMSv: number;
  text: string;
  short?: string;
  sources: RadiationSource[];
}

export interface AppData {
  observations: ObservationsFile;
  baselines: BaselinesFile;
  marsLink: MarsLinkFile;
  cards: ConditionCard[];
  cardSources: Record<string, string>;
  inventory: InventoryFile;
  capabilities: Record<string, Capability[]>;
  regions: Region[];
  learn: LearnTopic[];
  scenarios: Scenario[];
  profiles: MissionProfile[];
  assumptions: LinkAssumptions;
  radiation: RadiationFile;
}
