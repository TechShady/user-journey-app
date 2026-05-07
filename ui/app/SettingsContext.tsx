import React, { createContext, useContext, useState, useEffect } from "react";
import { useUserAppState, useSetUserAppState } from "@dynatrace-sdk/react-hooks";

// ---------------------------------------------------------------------------
// Types & defaults
// ---------------------------------------------------------------------------
export type StepDef = { label: string; identifier: string; type: "view" | "request" };

export const DEFAULT_FRONTEND = "www.angular.easytravel.com";
export const MIN_STEPS = 2;
export const MAX_STEPS = 10;

export const DEFAULT_FUNNEL_STEPS: StepDef[] = [
  { label: "Home", identifier: "/easytravel/home", type: "view" },
  { label: "Search", identifier: "/easytravel/search", type: "view" },
  { label: "Journey Detail", identifier: "/easytravel/journeys/:id:", type: "view" },
  { label: "Book", identifier: "/easytravel/journeys/:id:/book", type: "view" },
];

export const DEFAULT_AOV = 0;
const FRONTEND_STATE_KEY = "uj-frontend-app";
const STEPS_STATE_KEY = "uj-funnel-steps";
const AOV_STATE_KEY = "uj-average-order-value";

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------
interface SettingsContextValue {
  frontend: string;
  setFrontend: (v: string) => void;
  steps: StepDef[];
  setSteps: (v: StepDef[]) => void;
  aov: number;
  setAov: (v: number) => void;
  saveFrontend: (v: string) => void;
  saveSteps: (v: StepDef[]) => void;
  saveAov: (v: number) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [frontend, setFrontend] = useState<string>(DEFAULT_FRONTEND);
  const [steps, setSteps] = useState<StepDef[]>(DEFAULT_FUNNEL_STEPS);
  const [aov, setAov] = useState<number>(DEFAULT_AOV);

  const savedFrontend = useUserAppState({ key: FRONTEND_STATE_KEY });
  const savedSteps = useUserAppState({ key: STEPS_STATE_KEY });
  const savedAov = useUserAppState({ key: AOV_STATE_KEY });
  const { execute: saveState } = useSetUserAppState();

  useEffect(() => {
    if (savedFrontend.data?.value) {
      const val = savedFrontend.data.value as string;
      if (val.trim()) setFrontend(val.trim());
    }
  }, [savedFrontend.data]);

  useEffect(() => {
    if (savedSteps.data?.value) {
      try {
        const parsed = JSON.parse(savedSteps.data.value as string) as StepDef[];
        if (Array.isArray(parsed) && parsed.length >= MIN_STEPS && parsed.length <= MAX_STEPS) {
          setSteps(parsed);
        }
      } catch { /* ignore parse errors */ }
    }
  }, [savedSteps.data]);

  useEffect(() => {
    if (savedAov.data?.value) {
      const v = Number(savedAov.data.value);
      if (!isNaN(v) && v >= 0) setAov(v);
    }
  }, [savedAov.data]);

  const saveFrontend = (v: string) => {
    setFrontend(v);
    saveState({ key: FRONTEND_STATE_KEY, body: { value: v } });
  };

  const saveSteps = (v: StepDef[]) => {
    setSteps(v);
    saveState({ key: STEPS_STATE_KEY, body: { value: JSON.stringify(v) } });
  };

  const saveAov = (v: number) => {
    setAov(v);
    saveState({ key: AOV_STATE_KEY, body: { value: String(v) } });
  };

  return (
    <SettingsContext.Provider value={{ frontend, setFrontend, steps, setSteps, aov, setAov, saveFrontend, saveSteps, saveAov }}>
      {children}
    </SettingsContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export const useSettings = (): SettingsContextValue => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
};
