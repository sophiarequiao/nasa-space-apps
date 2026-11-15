import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./styles.css";
import { useEffect, useState } from "react";
import type { AppData } from "./types";
import { loadAppData } from "./data/load";
import { AppStateProvider, useApp } from "./state/AppState";
import { Header } from "./components/Header";
import { MessageScreen } from "./screens/MessageScreen";
import { CrewScreen } from "./screens/CrewScreen";
import { BodyScreen } from "./screens/BodyScreen";
import { EvolutionScreen } from "./screens/EvolutionScreen";
import { IncidentScreen } from "./screens/IncidentScreen";
import { ResourcesScreen } from "./screens/ResourcesScreen";
import { PlanScreen } from "./screens/PlanScreen";
import { LearnScreen } from "./screens/LearnScreen";
import { SimulatorScreen } from "./screens/SimulatorScreen";
import { TodaySimple } from "./screens/simple/TodaySimple";
import { CheckinSimple } from "./screens/simple/CheckinSimple";
import { HelpSimple } from "./screens/simple/HelpSimple";
import { KitSimple } from "./screens/simple/KitSimple";

function Shell() {
  const { screen, expert } = useApp();
  useEffect(() => { document.documentElement.classList.toggle("glass-body", !expert); }, [expert]);
  return (
    <div className={expert ? "app" : "app theme-glass"}>
      <Header />
      <main className="main">
        {!expert && !["message", "incident", "resources", "learn"].includes(screen) && <TodaySimple />}
        {!expert && screen === "message" && <CheckinSimple />}
        {!expert && screen === "incident" && <HelpSimple />}
        {!expert && screen === "resources" && <KitSimple />}
        {!expert && screen === "learn" && <LearnScreen />}
        {expert && <ExpertScreens screen={screen} />}
      </main>
      {(expert || ["message", "incident", "resources", "learn"].includes(screen)) && <footer className="footer">
        <p>
          <b>Decision-support prototype. Not a medical device. It does not diagnose.</b> Crew data are synthetic; inventory is fictional;
          protocols are samples pending validation. Uses NASA data; not endorsed by NASA.
        </p>
        <p className="muted">SOSpesAI · NASA Space Apps Challenge 2026 · Seville · Code MIT · Texts CC BY 4.0 · Synthetic data CC0 · Built with AI assistance (Claude, Anthropic).</p>
      </footer>}
    </div>
  );
}

function ExpertScreens({ screen }: { screen: string }) {
  return (
    <>
        {screen === "message" && <MessageScreen />}
        {screen === "crew" && <CrewScreen />}
        {screen === "body" && <BodyScreen />}
        {screen === "evolution" && <EvolutionScreen />}
        {screen === "incident" && <IncidentScreen />}
        {screen === "resources" && <ResourcesScreen />}
        {screen === "plan" && <PlanScreen />}
        {screen === "learn" && <LearnScreen />}
        {screen === "simulator" && <SimulatorScreen />}
    </>
  );
}

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { loadAppData().then(setData).catch((e: unknown) => setError(String(e))); }, []);
  if (error) return <div className="loading"><h2>Could not load the mission data</h2><p>{error}</p></div>;
  if (!data) return <div className="loading"><div className="spinner" /><p>Loading mission data…</p></div>;
  return (
    <AppStateProvider data={data}>
      <Shell />
    </AppStateProvider>
  );
}
