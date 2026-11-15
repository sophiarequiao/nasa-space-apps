// Inventory engine: space-aware expiry state (rules C01-C10 by the health lead) and the
// capability map: "what do we lose if...?". Capability = Resources x Link x Person.
import type { Capability, ConditionCard, InventoryItem, Status } from "../types";

export type ExpiryState = "DEPLETED" | "EXPIRED_LABEL" | "UNAVAILABLE" | "STABILITY_ALERT" | "NO_SPACE_DATA" | "STUDIED" | "OPERATIONAL";

export interface ItemState {
  item: InventoryItem;
  quantity: number;
  available: boolean;
  state: ExpiryState;
  status: Status;
  label: string;
  explanation: string;
  rule: string;
}

export interface ResourceOverrides {
  /** items marked as failed / unavailable by the user (device failure, lost, contaminated) */
  unavailable: Set<string>;
  /** quantity overrides */
  quantities: Record<string, number>;
}

export function itemState(item: InventoryItem, dateISO: string, ov: ResourceOverrides): ItemState {
  const quantity = ov.quantities[item.id] ?? item.quantity;
  const mk = (state: ExpiryState, status: Status, label: string, explanation: string, rule: string, available: boolean): ItemState =>
    ({ item, quantity, available, state, status, label, explanation, rule });

  if (ov.unavailable.has(item.id)) {
    return mk("UNAVAILABLE", "red", item.type === "device" ? "FAILED" : "UNAVAILABLE",
      "Marked as failed or unavailable in this session.", "—", false);
  }
  if (quantity <= 0) return mk("DEPLETED", "red", "DEPLETED", "Quantity is zero: excluded from available resources.", "C06", false);
  if (item.label_expiry && item.label_expiry < dateISO) {
    return mk("EXPIRED_LABEL", "red", "EXPIRED (LABEL)", "The label expiry date has passed: do not use without protocol guidance.", "C05", false);
  }
  if (item.type === "device") return mk("OPERATIONAL", "green", "OPERATIONAL", "Device available.", "—", true);
  if (item.type === "supply") return mk("OPERATIONAL", "green", "IN STOCK", "Supply available.", "—", true);
  if (item.stability_alert) {
    return mk("STABILITY_ALERT", "amber", "STABILITY ALERT",
      "Specific evidence of failures in space before the label date (Du 2011; Wotring 2016). No new date is computed without batch, formulation, packaging and storage data.",
      "C07", true);
  }
  if (item.historical_evidence === "studied_in_flight_kits") {
    return mk("STUDIED", "green", "STUDIED IN FLIGHT KITS",
      "This formulation was tested in flight kits. That does not prove the stability of this batch.", "C01/C02", true);
  }
  return mk("NO_SPACE_DATA", "silent", "NO SPACE DATA",
    "Stability under mission conditions is unknown: the label date is administrative only.", "C04", true);
}

export interface CapabilityState {
  capability: Capability;
  available: boolean;
  missing: string[];
  usingItems: string[];
}

export function capabilityState(cap: Capability, states: Map<string, ItemState>): CapabilityState {
  if (cap.all_of) {
    const missing = cap.all_of.filter((id) => !states.get(id)?.available);
    return { capability: cap, available: missing.length === 0, missing, usingItems: cap.all_of };
  }
  const ids = cap.any_of ?? [];
  const avail = ids.filter((id) => states.get(id)?.available);
  return { capability: cap, available: avail.length > 0, missing: avail.length ? [] : ids, usingItems: avail };
}

export interface ConditionCapability {
  card: ConditionCard;
  caps: CapabilityState[];
  lostTreatments: number;
  lostTests: number;
  status: Status;
}

export function conditionCapabilities(
  cards: ConditionCard[], capabilities: Record<string, Capability[]>, states: Map<string, ItemState>,
): ConditionCapability[] {
  return cards.map((card) => {
    const caps = (capabilities[card.id] ?? []).map((c) => capabilityState(c, states));
    const lostTreatments = caps.filter((c) => !c.available && c.capability.kind === "treatment").length;
    const lostTests = caps.filter((c) => !c.available && c.capability.kind === "test").length;
    const status: Status = lostTreatments ? "red" : lostTests ? "amber" : "green";
    return { card, caps, lostTreatments, lostTests, status };
  });
}

export function allItemStates(items: InventoryItem[], dateISO: string, ov: ResourceOverrides): Map<string, ItemState> {
  return new Map(items.map((i) => [i.id, itemState(i, dateISO, ov)]));
}
