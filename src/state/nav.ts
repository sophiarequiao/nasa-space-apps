import type { Screen } from "./AppState";

export const NAV: { id: Screen; label: string; hint: string }[] = [
  { id: "message", label: "Message", hint: "Know your crew: the daily check-in" },
  { id: "crew", label: "Crew", hint: "Everyone at a glance" },
  { id: "body", label: "Body", hint: "3D body with silent zones" },
  { id: "evolution", label: "Evolution", hint: "Before, during and after" },
  { id: "incident", label: "Incident", hint: "Know your options and your time" },
  { id: "resources", label: "Resources", hint: "Know your resources" },
  { id: "plan", label: "Plan", hint: "Adaptive monitoring and missions" },
  { id: "simulator", label: "Simulator", hint: "Profile + scenario + date" },
  { id: "learn", label: "Learn", hint: "Why each test matters" },
];

/** Simple crew view: four everyday screens plus Learn. */
export const SIMPLE_NAV: { id: Screen; label: string; hint: string }[] = [
  { id: "body", label: "Today", hint: "How am I today?" },
  { id: "message", label: "Check-in", hint: "Daily message to Earth" },
  { id: "incident", label: "Help", hint: "Something is wrong" },
  { id: "resources", label: "Kit", hint: "What we have on board" },
  { id: "learn", label: "Learn", hint: "Why each test matters" },
];
