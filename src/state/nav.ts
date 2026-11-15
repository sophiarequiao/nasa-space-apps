import type { Screen } from "./AppState";

/** The five crew screens. */
export const NAV: { id: Screen; label: string; hint: string }[] = [
  { id: "body", label: "Today", hint: "How am I today?" },
  { id: "message", label: "Check-in", hint: "Daily message to Earth" },
  { id: "incident", label: "Help", hint: "Something is wrong" },
  { id: "resources", label: "Kit", hint: "What we have on board" },
  { id: "learn", label: "Guide", hint: "How to measure, when to call" },
];
