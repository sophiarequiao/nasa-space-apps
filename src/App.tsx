import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./styles.css";
import { useEffect, useState } from "react";
import type { AppData } from "./types";
import { loadAppData } from "./data/load";
import { AppStateProvider, useApp } from "./state/AppState";
import { Header } from "./components/Header";
import { TodaySimple } from "./screens/simple/TodaySimple";
import { CheckinSimple } from "./screens/simple/CheckinSimple";
import { HelpSimple } from "./screens/simple/HelpSimple";
import { KitSimple } from "./screens/simple/KitSimple";
import { GuideSimple } from "./screens/simple/GuideSimple";

function Shell() {
  const { screen } = useApp();
  useEffect(() => { document.documentElement.classList.add("glass-body"); }, []);
  return (
    <div className="app theme-glass">
      <Header />
      <main className="main">
        {screen === "body" && <TodaySimple />}
        {screen === "message" && <CheckinSimple />}
        {screen === "incident" && <HelpSimple />}
        {screen === "resources" && <KitSimple />}
        {screen === "learn" && <GuideSimple />}
      </main>
    </div>
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
