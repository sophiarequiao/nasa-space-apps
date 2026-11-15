// Global app state: mission profile, mission day, selected crew member, resource
// overrides and live observations. Derived values (link, statuses) are memoised here
// so every screen reads the same numbers.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppData, CrewId, MissionProfile, Observation, RegionId } from "../types";
import { addDays, getLink, nextBlackout, type LinkContext, type LinkState } from "../engine/link";
import { evaluateCrew, indexObservations, type ObsIndex, type RegionStatus } from "../engine/status";
import { allItemStates, type ItemState, type ResourceOverrides } from "../engine/resources";
import { SOURCE_DEVICE } from "../engine/signals";
import { applyScenario } from "../engine/scenarioEffects";

export const CREW: { id: CrewId; role: string }[] = [
  { id: "CM-1", role: "Commander" },
  { id: "CM-2", role: "Flight engineer" },
  { id: "CM-3", role: "Mission specialist" },
  { id: "CM-4", role: "Crew medical officer" },
];

export type Screen = "message" | "crew" | "body" | "evolution" | "incident" | "resources" | "plan" | "learn" | "simulator";
const SCREENS: Screen[] = ["message", "crew", "body", "evolution", "incident", "resources", "plan", "learn", "simulator"];

interface AppState {
  data: AppData;
  /** false = simple crew view (default); true = full medical-officer view */
  expert: boolean;
  setExpert: (v: boolean) => void;
  screen: Screen;
  setScreen: (s: Screen) => void;

  profile: MissionProfile;
  setProfileId: (id: string) => void;
  analogDelayS: number;
  setAnalogDelayS: (s: number) => void;

  day: number;
  setDay: (d: number) => void;
  minDay: number;
  maxDay: number;
  /** date used for the link: launch + day, unless the simulator overrides it */
  date: string;
  dateOverride: string | null;
  setDateOverride: (d: string | null) => void;

  crewId: CrewId;
  setCrewId: (c: CrewId) => void;
  selectedRegion: RegionId | null;
  setSelectedRegion: (r: RegionId | null) => void;
  incidentCardId: string;
  setIncidentCardId: (id: string) => void;

  link: LinkState;
  linkCtx: LinkContext;
  blackout: ReturnType<typeof nextBlackout>;

  idx: ObsIndex;
  addObservations: (obs: Observation[]) => void;
  /** simulator scenarios currently applied (their observations are in idx) */
  activeScenarios: { key: string; scenarioId: string; crew: string; day: number; count: number }[];
  applyScenarioFor: (scenarioId: string, crew: string, day: number) => number;
  removeScenario: (key: string) => void;
  liveObservations: Observation[];
  statusFor: (crew: string, day?: number) => Record<RegionId, RegionStatus>;

  overrides: ResourceOverrides;
  toggleUnavailable: (id: string) => void;
  setQuantity: (id: string, q: number) => void;
  resetResources: () => void;
  itemStates: Map<string, ItemState>;
  failedSources: Set<string>;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
}

export function AppStateProvider({ data, children }: { data: AppData; children: ReactNode }) {
  const days = data.observations.observations.map((o) => o.day);
  const minDay = Math.min(...days);
  const maxDay = Math.max(...days);
  const launch = data.observations.launch_date;

  const [screen, setScreenRaw] = useState<Screen>(() => {
    const h = location.hash.replace("#", "") as Screen;
    return SCREENS.includes(h) ? h : "body";
  });
  const [expert, setExpertRaw] = useState(false);
  const setExpert = useCallback((v: boolean) => {
    setExpertRaw(v);
    if (!v) setScreenRaw((cur) => (["body", "message", "incident", "resources", "learn"].includes(cur) ? cur : "body"));
  }, []);
  const setScreen = useCallback((s: Screen) => {
    setScreenRaw(s);
    try { history.pushState(null, "", `#${s}`); } catch { /* sandboxed */ }
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const onHash = () => { const h = location.hash.replace("#", "") as Screen; if (SCREENS.includes(h)) setScreenRaw(h); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const [profileId, setProfileId] = useState("mars_transit");
  const [analogDelayS, setAnalogDelayS] = useState(0);
  const [day, setDayRaw] = useState(52); // demo default: CM-4 renal colic day
  const setDay = useCallback((d: number) => setDayRaw(Math.max(minDay, Math.min(maxDay, Math.round(d)))), [minDay, maxDay]);
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const [crewId, setCrewId] = useState<CrewId>("CM-4");
  const [selectedRegion, setSelectedRegion] = useState<RegionId | null>(null);
  const [incidentCardId, setIncidentCardId] = useState("renal_colic");
  const [liveObservations, setLive] = useState<Observation[]>([]);
  const [scenarioApps, setScenarioApps] = useState<{ key: string; scenarioId: string; crew: string; day: number; obs: Observation[] }[]>([]);
  const [unavailable, setUnavailable] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const profile = data.profiles.find((p) => p.id === profileId) ?? data.profiles[0];
  const date = dateOverride ?? addDays(launch, day);
  const linkCtx = useMemo<LinkContext>(() => ({ marsLink: data.marsLink, assumptions: data.assumptions, launchDate: launch, analogDelayS }),
    [data, launch, analogDelayS]);
  const link = useMemo(() => getLink(date, profile, linkCtx), [date, profile, linkCtx]);
  const blackout = useMemo(() => nextBlackout(date, profile, linkCtx, 800), [date, profile, linkCtx]);

  const scenarioObs = useMemo(() => scenarioApps.flatMap((a) => a.obs), [scenarioApps]);
  const idx = useMemo(() => indexObservations([...data.observations.observations, ...liveObservations, ...scenarioObs]), [data, liveObservations, scenarioObs]);
  const applyScenarioFor = useCallback((scenarioId: string, crew: string, d: number) => {
    const obs = applyScenario(scenarioId, crew, d, data.baselines);
    if (!obs.length) return 0;
    const key = `${scenarioId}|${crew}|${d}`;
    setScenarioApps((prev) => [...prev.filter((a) => a.key !== key), { key, scenarioId, crew, day: d, obs }]);
    return obs.length;
  }, [data]);
  const removeScenario = useCallback((key: string) => setScenarioApps((prev) => prev.filter((a) => a.key !== key)), []);
  const activeScenarios = useMemo(() => scenarioApps.map(({ key, scenarioId, crew, day: d, obs }) => ({ key, scenarioId, crew, day: d, count: obs.length })), [scenarioApps]);
  const addObservations = useCallback((obs: Observation[]) => setLive((prev) => [...prev, ...obs]), []);

  const overrides = useMemo<ResourceOverrides>(() => ({ unavailable, quantities }), [unavailable, quantities]);
  const itemStates = useMemo(() => allItemStates(data.inventory.items, date, overrides), [data, date, overrides]);
  const failedSources = useMemo(() => {
    const s = new Set<string>();
    // only devices the user marks as failed (or empties) in this session stop producing data;
    // the demo inventory's own zero stock does not erase measurements already taken
    for (const [src, item] of Object.entries(SOURCE_DEVICE)) {
      if (item && (unavailable.has(item) || quantities[item] === 0)) s.add(src);
    }
    return s;
  }, [unavailable, quantities]);

  const statusFor = useCallback(
    (crew: string, d: number = day) => evaluateCrew(idx, data.baselines, data.regions, crew, d, { failedSources }),
    [idx, data, day, failedSources],
  );

  const toggleUnavailable = useCallback((id: string) => setUnavailable((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  }), []);
  const setQuantity = useCallback((id: string, q: number) => setQuantities((prev) => ({ ...prev, [id]: Math.max(0, q) })), []);
  const resetResources = useCallback(() => { setUnavailable(new Set()); setQuantities({}); }, []);

  const value: AppState = {
    data, expert, setExpert, screen, setScreen, profile, setProfileId, analogDelayS, setAnalogDelayS,
    day, setDay, minDay, maxDay, date, dateOverride, setDateOverride,
    crewId, setCrewId, selectedRegion, setSelectedRegion, incidentCardId, setIncidentCardId,
    link, linkCtx, blackout, idx, addObservations, liveObservations, statusFor,
    activeScenarios, applyScenarioFor, removeScenario,
    overrides, toggleUnavailable, setQuantity, resetResources, itemStates, failedSources,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
