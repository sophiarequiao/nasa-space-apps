// Loads every data file from public/data (cached by the service worker for offline use).
import type {
  AppData, BaselinesFile, Capability, ConditionCard, InventoryFile, LearnTopic, LinkAssumptions,
  MarsLinkFile, MissionProfile, ObservationsFile, RadiationFile, Region, Scenario,
} from "../types";

const BASE = import.meta.env.BASE_URL;

async function getJSON<T>(name: string): Promise<T> {
  const res = await fetch(`${BASE}data/${name}`);
  if (!res.ok) throw new Error(`Could not load data/${name} (${res.status})`);
  return (await res.json()) as T;
}

export async function loadAppData(): Promise<AppData> {
  const [observations, baselines, marsLink, cardsFile, inventory, capsFile, regionsFile, learnFile, scenariosFile, profilesFile, radiation] =
    await Promise.all([
      getJSON<ObservationsFile>("observations.json"),
      getJSON<BaselinesFile>("baselines.json"),
      getJSON<MarsLinkFile>("mars_link.json"),
      getJSON<{ cards: ConditionCard[]; sources: Record<string, string> }>("condition_cards.json"),
      getJSON<InventoryFile>("inventory.json"),
      getJSON<{ capabilities: Record<string, Capability[]> }>("capabilities.json"),
      getJSON<{ regions: Region[] }>("regions.json"),
      getJSON<{ topics: LearnTopic[] }>("learn.json"),
      getJSON<{ scenarios: Scenario[] }>("scenarios.json"),
      getJSON<{ profiles: MissionProfile[]; assumptions: LinkAssumptions }>("profiles.json"),
      getJSON<RadiationFile>("radiation.json"),
    ]);
  return {
    observations,
    baselines,
    marsLink,
    cards: cardsFile.cards,
    cardSources: cardsFile.sources,
    inventory,
    capabilities: capsFile.capabilities,
    regions: regionsFile.regions,
    learn: learnFile.topics,
    scenarios: scenariosFile.scenarios,
    profiles: profilesFile.profiles,
    assumptions: profilesFile.assumptions,
    radiation,
  };
}
