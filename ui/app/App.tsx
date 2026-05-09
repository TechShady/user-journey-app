import { Page } from "@dynatrace/strato-components-preview/layouts";
import React, { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { UserJourney } from "./pages/UserJourney";
import { ObservabilityJourney } from "./pages/ObservabilityJourney";
import { SettingsProvider } from "./SettingsContext";

const CURRENT_VERSION = "4.47.20";
const REPO_API = "https://api.github.com/repos/TechShady/user-journey-app/contents/app.config.json";
const REPO_URL = "https://github.com/TechShady/user-journey-app";

function isNewer(latest: string, current: string): boolean {
  const l = latest.split(".").map(Number);
  const c = current.split(".").map(Number);
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    if ((l[i] ?? 0) > (c[i] ?? 0)) return true;
    if ((l[i] ?? 0) < (c[i] ?? 0)) return false;
  }
  return false;
}

export const App = () => {
  const [update, setUpdate] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(REPO_API, { headers: { Accept: "application/vnd.github.v3+json" } });
        if (!res.ok) return;
        const data = await res.json();
        const raw = atob((data.content ?? "").replace(/\n/g, ""));
        const cfg = JSON.parse(raw);
        const latest = cfg.app?.version ?? "";
        if (latest && isNewer(latest, CURRENT_VERSION)) setUpdate(latest);
      } catch { /* CSP or network block — silently skip */ }
    })();
  }, []);

  return (
    <SettingsProvider>
      <Page>
        <Page.Main>
          {update && (
            <div style={{ background: "#B8860B", color: "#fff", padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, fontWeight: 600, borderRadius: 0 }}>
              <span>🔔 Version {update} is available (running {CURRENT_VERSION})</span>
              <span style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => window.open(REPO_URL, "_blank", "noopener")}
                  style={{ background: "rgba(255,255,255,0.2)", color: "#fff", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 4, padding: "4px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                >
                  View &amp; Deploy
                </button>
                <button
                  onClick={() => setUpdate(null)}
                  style={{ background: "transparent", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 4, padding: "4px 12px", cursor: "pointer", fontSize: 12 }}
                >
                  Dismiss
                </button>
              </span>
            </div>
          )}
          <Routes>
            <Route path="/" element={<UserJourney />} />
            <Route path="/journey" element={<ObservabilityJourney />} />
          </Routes>
        </Page.Main>
      </Page>
    </SettingsProvider>
  );
};
