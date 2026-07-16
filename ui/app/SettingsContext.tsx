import React, { createContext, useContext, useState, useEffect } from "react";
import { useAppState, useSetAppState, useUserAppState } from "@dynatrace-sdk/react-hooks";

// ---------------------------------------------------------------------------
// Types & defaults
// ---------------------------------------------------------------------------
export type StepDef = { label: string; identifiers: string[]; type: "view" | "request"; app?: string };
export type FunnelDef = {
  name: string;
  steps: StepDef[];
  aov?: number;
  monthlyInfraCost?: number;
  cdnMonthlyCost?: number;
  computeCostPerHour?: number;
  costPerGb?: number;
  engineerHourlyRate?: number;
  industry?: IndustryType;
};

export const DEFAULT_FRONTEND = "www.angular.easytravel.com";
export const MIN_STEPS = 2;
export const MAX_STEPS = 10;
export const MAX_FUNNELS = 10;

export const DEFAULT_FUNNEL_STEPS: StepDef[] = [
  { label: "Home", identifiers: ["/easytravel/home", "/"], type: "view", app: "www.angular.easytravel.com" },
  { label: "Search", identifiers: ["/easytravel/search"], type: "view", app: "www.angular.easytravel.com" },
  { label: "Journey Detail", identifiers: ["/easytravel/journeys/:id:"], type: "view", app: "www.angular.easytravel.com" },
  { label: "Book", identifiers: ["/easytravel/journeys/:id:/book"], type: "view", app: "www.angular.easytravel.com" },
];

export const DEFAULT_FUNNELS: FunnelDef[] = [
  { name: "EasyTravel Booking", steps: DEFAULT_FUNNEL_STEPS },
];

export const DEFAULT_AOV = 1200;
export const DEFAULT_MONTHLY_INFRA_COST = 100000;
export const DEFAULT_CDN_MONTHLY_COST = 100;
export const DEFAULT_COMPUTE_COST_PER_HOUR = 100;
export const DEFAULT_COST_PER_GB = 100;
export const DEFAULT_ENGINEER_HOURLY_RATE = 100;

export type IndustryType = "ecommerce" | "saas" | "media" | "financial" | "travel" | "healthcare" | "gaming" | "general";
export const DEFAULT_INDUSTRY: IndustryType = "ecommerce";
export const INDUSTRY_OPTIONS: { label: string; value: IndustryType }[] = [
  { label: "E-Commerce / Retail", value: "ecommerce" },
  { label: "SaaS / B2B", value: "saas" },
  { label: "Media / Publishing", value: "media" },
  { label: "Financial Services", value: "financial" },
  { label: "Travel / Hospitality", value: "travel" },
  { label: "Healthcare", value: "healthcare" },
  { label: "Gaming", value: "gaming" },
  { label: "General / Other", value: "general" },
];

export interface IndustryBenchmark {
  // FinOps
  costPerConvLow: number; costPerConvHigh: number; revCostRatioTarget: number;
  infraPctRevenueLow: number; infraPctRevenueHigh: number; errorRateTarget: number;
  cdnRoiTarget: number; latencyImpactPerSec: number; idleUtilTarget: number; breakEvenHoursTarget: number;
  // Performance & UX
  convRateTarget: number; apdexTarget: number; avgDurationTarget: number;
  bounceRateTarget: number; frustratedPctTarget: number;
  lcpTarget: number; clsTarget: number; inpTarget: number;
  // Engagement & Retention
  sessionDepthTarget: number; retentionD7Target: number;
  thirdPartyBudgetMs: number; mobileShareExpected: number;
  // Context
  label: string;
}

export const INDUSTRY_BENCHMARKS: Record<IndustryType, IndustryBenchmark> = {
  ecommerce: { costPerConvLow: 0.5, costPerConvHigh: 5, revCostRatioTarget: 7, infraPctRevenueLow: 2, infraPctRevenueHigh: 5, errorRateTarget: 1, cdnRoiTarget: 10, latencyImpactPerSec: 7, idleUtilTarget: 70, breakEvenHoursTarget: 160, convRateTarget: 3.5, apdexTarget: 0.85, avgDurationTarget: 2500, bounceRateTarget: 40, frustratedPctTarget: 8, lcpTarget: 2500, clsTarget: 0.1, inpTarget: 200, sessionDepthTarget: 4.5, retentionD7Target: 25, thirdPartyBudgetMs: 800, mobileShareExpected: 65, label: "E-Commerce / Retail" },
  saas: { costPerConvLow: 50, costPerConvHigh: 500, revCostRatioTarget: 4, infraPctRevenueLow: 10, infraPctRevenueHigh: 20, errorRateTarget: 0.5, cdnRoiTarget: 3, latencyImpactPerSec: 3, idleUtilTarget: 60, breakEvenHoursTarget: 320, convRateTarget: 7, apdexTarget: 0.9, avgDurationTarget: 1500, bounceRateTarget: 30, frustratedPctTarget: 5, lcpTarget: 2000, clsTarget: 0.05, inpTarget: 150, sessionDepthTarget: 8, retentionD7Target: 60, thirdPartyBudgetMs: 500, mobileShareExpected: 25, label: "SaaS / B2B" },
  media: { costPerConvLow: 0.01, costPerConvHigh: 0.1, revCostRatioTarget: 25, infraPctRevenueLow: 5, infraPctRevenueHigh: 15, errorRateTarget: 2, cdnRoiTarget: 20, latencyImpactPerSec: 5, idleUtilTarget: 50, breakEvenHoursTarget: 80, convRateTarget: 1.5, apdexTarget: 0.8, avgDurationTarget: 3000, bounceRateTarget: 55, frustratedPctTarget: 12, lcpTarget: 3000, clsTarget: 0.15, inpTarget: 250, sessionDepthTarget: 3, retentionD7Target: 35, thirdPartyBudgetMs: 1200, mobileShareExpected: 70, label: "Media / Publishing" },
  financial: { costPerConvLow: 10, costPerConvHigh: 100, revCostRatioTarget: 10, infraPctRevenueLow: 3, infraPctRevenueHigh: 8, errorRateTarget: 0.1, cdnRoiTarget: 5, latencyImpactPerSec: 10, idleUtilTarget: 80, breakEvenHoursTarget: 240, convRateTarget: 5, apdexTarget: 0.92, avgDurationTarget: 1200, bounceRateTarget: 25, frustratedPctTarget: 3, lcpTarget: 1800, clsTarget: 0.03, inpTarget: 100, sessionDepthTarget: 6, retentionD7Target: 70, thirdPartyBudgetMs: 300, mobileShareExpected: 45, label: "Financial Services" },
  travel: { costPerConvLow: 5, costPerConvHigh: 50, revCostRatioTarget: 6, infraPctRevenueLow: 3, infraPctRevenueHigh: 7, errorRateTarget: 1, cdnRoiTarget: 7, latencyImpactPerSec: 8, idleUtilTarget: 65, breakEvenHoursTarget: 200, convRateTarget: 4, apdexTarget: 0.82, avgDurationTarget: 3500, bounceRateTarget: 45, frustratedPctTarget: 10, lcpTarget: 2800, clsTarget: 0.12, inpTarget: 220, sessionDepthTarget: 5, retentionD7Target: 20, thirdPartyBudgetMs: 900, mobileShareExpected: 60, label: "Travel / Hospitality" },
  healthcare: { costPerConvLow: 20, costPerConvHigh: 200, revCostRatioTarget: 5, infraPctRevenueLow: 5, infraPctRevenueHigh: 12, errorRateTarget: 0.1, cdnRoiTarget: 4, latencyImpactPerSec: 4, idleUtilTarget: 75, breakEvenHoursTarget: 400, convRateTarget: 6, apdexTarget: 0.9, avgDurationTarget: 2000, bounceRateTarget: 35, frustratedPctTarget: 5, lcpTarget: 2200, clsTarget: 0.05, inpTarget: 150, sessionDepthTarget: 5, retentionD7Target: 50, thirdPartyBudgetMs: 400, mobileShareExpected: 50, label: "Healthcare" },
  gaming: { costPerConvLow: 1, costPerConvHigh: 15, revCostRatioTarget: 8, infraPctRevenueLow: 8, infraPctRevenueHigh: 20, errorRateTarget: 1, cdnRoiTarget: 15, latencyImpactPerSec: 6, idleUtilTarget: 55, breakEvenHoursTarget: 120, convRateTarget: 8, apdexTarget: 0.88, avgDurationTarget: 1800, bounceRateTarget: 30, frustratedPctTarget: 7, lcpTarget: 2000, clsTarget: 0.08, inpTarget: 100, sessionDepthTarget: 10, retentionD7Target: 40, thirdPartyBudgetMs: 600, mobileShareExpected: 55, label: "Gaming" },
  general: { costPerConvLow: 1, costPerConvHigh: 50, revCostRatioTarget: 5, infraPctRevenueLow: 5, infraPctRevenueHigh: 15, errorRateTarget: 1, cdnRoiTarget: 5, latencyImpactPerSec: 5, idleUtilTarget: 65, breakEvenHoursTarget: 200, convRateTarget: 3, apdexTarget: 0.85, avgDurationTarget: 3000, bounceRateTarget: 45, frustratedPctTarget: 10, lcpTarget: 2500, clsTarget: 0.1, inpTarget: 200, sessionDepthTarget: 4, retentionD7Target: 30, thirdPartyBudgetMs: 800, mobileShareExpected: 55, label: "General / Other" },
};

const FRONTEND_STATE_KEY = "uj-frontend-app";
const FUNNELS_STATE_KEY = "uj-funnels";
const ACTIVE_FUNNEL_STATE_KEY = "uj-active-funnel";
const STEPS_STATE_KEY = "uj-funnel-steps"; // legacy — used for migration only
const AOV_STATE_KEY = "uj-average-order-value";
const MONTHLY_INFRA_COST_STATE_KEY = "uj-monthly-infra-cost";
const CDN_MONTHLY_COST_STATE_KEY = "uj-cdn-monthly-cost";
const COMPUTE_COST_PER_HOUR_STATE_KEY = "uj-compute-cost-per-hour";
const COST_PER_GB_STATE_KEY = "uj-cost-per-gb";
const ENGINEER_HOURLY_RATE_STATE_KEY = "uj-engineer-hourly-rate";
const INDUSTRY_STATE_KEY = "uj-industry";

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------
interface SettingsContextValue {
  frontend: string;
  setFrontend: (v: string) => void;
  // Multi-funnel
  funnels: FunnelDef[];
  setFunnels: (v: FunnelDef[]) => void;
  activeFunnelIndex: number;
  setActiveFunnelIndex: (v: number) => void;
  saveFunnels: (v: FunnelDef[]) => void;
  saveActiveFunnelIndex: (v: number) => void;
  // Derived from active funnel — backward compat
  steps: StepDef[];
  setSteps: (v: StepDef[]) => void;
  saveSteps: (v: StepDef[]) => void;
  // Other settings
  aov: number;
  setAov: (v: number) => void;
  monthlyInfraCost: number;
  setMonthlyInfraCost: (v: number) => void;
  cdnMonthlyCost: number;
  setCdnMonthlyCost: (v: number) => void;
  computeCostPerHour: number;
  setComputeCostPerHour: (v: number) => void;
  costPerGb: number;
  setCostPerGb: (v: number) => void;
  engineerHourlyRate: number;
  setEngineerHourlyRate: (v: number) => void;
  industry: IndustryType;
  setIndustry: (v: IndustryType) => void;
  saveFrontend: (v: string) => void;
  saveAov: (v: number) => void;
  saveMonthlyInfraCost: (v: number) => void;
  saveCdnMonthlyCost: (v: number) => void;
  saveComputeCostPerHour: (v: number) => void;
  saveCostPerGb: (v: number) => void;
  saveEngineerHourlyRate: (v: number) => void;
  saveIndustry: (v: IndustryType) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [frontend, setFrontend] = useState<string>(DEFAULT_FRONTEND);
  const [funnels, setFunnels] = useState<FunnelDef[]>(DEFAULT_FUNNELS);
  const [activeFunnelIndex, setActiveFunnelIndex] = useState<number>(0);

  // Global (app-scoped) reads — shared across every user of this app in the Dynatrace environment.
  const savedFrontend = useAppState({ key: FRONTEND_STATE_KEY });
  const savedFunnels = useAppState({ key: FUNNELS_STATE_KEY });
  const savedActiveFunnel = useAppState({ key: ACTIVE_FUNNEL_STATE_KEY });
  const savedLegacySteps = useAppState({ key: STEPS_STATE_KEY });
  const savedAov = useAppState({ key: AOV_STATE_KEY });
  const savedMonthlyInfraCost = useAppState({ key: MONTHLY_INFRA_COST_STATE_KEY });
  const savedCdnMonthlyCost = useAppState({ key: CDN_MONTHLY_COST_STATE_KEY });
  const savedComputeCostPerHour = useAppState({ key: COMPUTE_COST_PER_HOUR_STATE_KEY });
  const savedCostPerGb = useAppState({ key: COST_PER_GB_STATE_KEY });
  const savedEngineerHourlyRate = useAppState({ key: ENGINEER_HOURLY_RATE_STATE_KEY });
  const savedIndustry = useAppState({ key: INDUSTRY_STATE_KEY });
  // Per-user fallbacks — pre-migration these keys were stored per-user. Fall back to those values
  // when the global bucket has not been written yet, so nothing is lost on first load after upgrade.
  const userLegacyFrontend = useUserAppState({ key: FRONTEND_STATE_KEY });
  const userLegacyFunnels = useUserAppState({ key: FUNNELS_STATE_KEY });
  const userLegacyActiveFunnel = useUserAppState({ key: ACTIVE_FUNNEL_STATE_KEY });
  const userLegacySteps = useUserAppState({ key: STEPS_STATE_KEY });
  const userLegacyAov = useUserAppState({ key: AOV_STATE_KEY });
  const userLegacyInfra = useUserAppState({ key: MONTHLY_INFRA_COST_STATE_KEY });
  const userLegacyCdn = useUserAppState({ key: CDN_MONTHLY_COST_STATE_KEY });
  const userLegacyCompute = useUserAppState({ key: COMPUTE_COST_PER_HOUR_STATE_KEY });
  const userLegacyGb = useUserAppState({ key: COST_PER_GB_STATE_KEY });
  const userLegacyEngineer = useUserAppState({ key: ENGINEER_HOURLY_RATE_STATE_KEY });
  const userLegacyIndustry = useUserAppState({ key: INDUSTRY_STATE_KEY });
  const { execute: saveState } = useSetAppState();

  useEffect(() => {
    const raw = (savedFrontend.data?.value ?? userLegacyFrontend.data?.value) as string | undefined;
    if (raw && raw.trim()) setFrontend(raw.trim());
  }, [savedFrontend.data?.value, userLegacyFrontend.data?.value]);

  // Load multi-funnel state (or migrate from legacy single-funnel).
  // Prefer the shared/global bucket; fall back to the per-user bucket for pre-migration data.
  useEffect(() => {
    const funnelsRaw = (savedFunnels.data?.value ?? userLegacyFunnels.data?.value) as string | undefined;
    if (funnelsRaw) {
      try {
        const parsed = JSON.parse(funnelsRaw) as any[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          const migrated: FunnelDef[] = parsed.map((f: any) => ({
            name: f.name ?? "Unnamed Funnel",
            steps: Array.isArray(f.steps) ? f.steps.map((s: any) => ({
              label: s.label ?? "",
              identifiers: Array.isArray(s.identifiers) ? s.identifiers : (s.identifier ? [s.identifier] : [""]),
              type: s.type ?? "view",
              app: s.app ?? undefined,
            })) : DEFAULT_FUNNEL_STEPS,
            aov: f.aov !== undefined ? Number(f.aov) : undefined,
            monthlyInfraCost: f.monthlyInfraCost !== undefined ? Number(f.monthlyInfraCost) : undefined,
            cdnMonthlyCost: f.cdnMonthlyCost !== undefined ? Number(f.cdnMonthlyCost) : undefined,
            computeCostPerHour: f.computeCostPerHour !== undefined ? Number(f.computeCostPerHour) : undefined,
            costPerGb: f.costPerGb !== undefined ? Number(f.costPerGb) : undefined,
            engineerHourlyRate: f.engineerHourlyRate !== undefined ? Number(f.engineerHourlyRate) : undefined,
            industry: f.industry ?? undefined,
          }));
          setFunnels(migrated);
          return; // Already have multi-funnel data
        }
      } catch { /* ignore */ }
    }
    // Migrate from legacy single-funnel format (global bucket first, then per-user).
    const legacyStepsRaw = (savedLegacySteps.data?.value ?? userLegacySteps.data?.value) as string | undefined;
    if (legacyStepsRaw) {
      try {
        const parsed = JSON.parse(legacyStepsRaw) as any[];
        if (Array.isArray(parsed) && parsed.length >= MIN_STEPS && parsed.length <= MAX_STEPS) {
          const migratedSteps: StepDef[] = parsed.map((s: any) => ({
            label: s.label ?? "",
            identifiers: Array.isArray(s.identifiers) ? s.identifiers : (s.identifier ? [s.identifier] : [""]),
            type: s.type ?? "view",
            app: s.app ?? undefined,
          }));
          setFunnels([{ name: "My Funnel", steps: migratedSteps }]);
        }
      } catch { /* ignore */ }
    }
  }, [savedFunnels.data?.value, userLegacyFunnels.data?.value, savedLegacySteps.data?.value, userLegacySteps.data?.value]);

  useEffect(() => {
    const raw = savedActiveFunnel.data?.value ?? userLegacyActiveFunnel.data?.value;
    if (raw !== undefined && raw !== null) {
      const v = Number(raw);
      if (!isNaN(v) && v >= 0) setActiveFunnelIndex(v);
    }
  }, [savedActiveFunnel.data?.value, userLegacyActiveFunnel.data?.value]);

  const saveFrontend = (v: string) => {
    setFrontend(v);
    saveState({ key: FRONTEND_STATE_KEY, body: { value: v } });
  };

  const saveFunnels = (v: FunnelDef[]) => {
    setFunnels(v);
    saveState({ key: FUNNELS_STATE_KEY, body: { value: JSON.stringify(v) } });
  };

  const saveActiveFunnelIndex = (v: number) => {
    setActiveFunnelIndex(v);
    saveState({ key: ACTIVE_FUNNEL_STATE_KEY, body: { value: String(v) } });
  };

  // ---------------------------------------------------------------------------
  // Derived values from active funnel (backward compat for all consumers)
  // ---------------------------------------------------------------------------
  const safeIndex = activeFunnelIndex < funnels.length ? activeFunnelIndex : 0;
  const activeFunnel = funnels[safeIndex];
  const steps = activeFunnel?.steps ?? DEFAULT_FUNNEL_STEPS;

  // Legacy fallbacks: use old top-level state keys if the funnel doesn't have these fields yet.
  // Read the shared bucket first, then fall back to any pre-migration per-user value.
  const legacyAovRaw = savedAov.data?.value ?? userLegacyAov.data?.value;
  const legacyAov = legacyAovRaw ? Number(legacyAovRaw) : NaN;
  const legacyInfraRaw = savedMonthlyInfraCost.data?.value ?? userLegacyInfra.data?.value;
  const legacyInfra = legacyInfraRaw ? Number(legacyInfraRaw) : NaN;
  const legacyCdnRaw = savedCdnMonthlyCost.data?.value ?? userLegacyCdn.data?.value;
  const legacyCdn = legacyCdnRaw ? Number(legacyCdnRaw) : NaN;
  const legacyComputeRaw = savedComputeCostPerHour.data?.value ?? userLegacyCompute.data?.value;
  const legacyCompute = legacyComputeRaw ? Number(legacyComputeRaw) : NaN;
  const legacyGbRaw = savedCostPerGb.data?.value ?? userLegacyGb.data?.value;
  const legacyGb = legacyGbRaw ? Number(legacyGbRaw) : NaN;
  const legacyEngineerRaw = savedEngineerHourlyRate.data?.value ?? userLegacyEngineer.data?.value;
  const legacyEngineer = legacyEngineerRaw ? Number(legacyEngineerRaw) : NaN;
  const legacyIndustry = (savedIndustry.data?.value ?? userLegacyIndustry.data?.value) as string | undefined;

  const aov = activeFunnel?.aov ?? (!isNaN(legacyAov) ? legacyAov : DEFAULT_AOV);
  const monthlyInfraCost = activeFunnel?.monthlyInfraCost ?? (!isNaN(legacyInfra) ? legacyInfra : DEFAULT_MONTHLY_INFRA_COST);
  const cdnMonthlyCost = activeFunnel?.cdnMonthlyCost ?? (!isNaN(legacyCdn) ? legacyCdn : DEFAULT_CDN_MONTHLY_COST);
  const computeCostPerHour = activeFunnel?.computeCostPerHour ?? (!isNaN(legacyCompute) ? legacyCompute : DEFAULT_COMPUTE_COST_PER_HOUR);
  const costPerGb = activeFunnel?.costPerGb ?? (!isNaN(legacyGb) ? legacyGb : DEFAULT_COST_PER_GB);
  const engineerHourlyRate = activeFunnel?.engineerHourlyRate ?? (!isNaN(legacyEngineer) ? legacyEngineer : DEFAULT_ENGINEER_HOURLY_RATE);
  const industry: IndustryType = activeFunnel?.industry ?? (legacyIndustry && INDUSTRY_OPTIONS.some(o => o.value === legacyIndustry) ? legacyIndustry as IndustryType : DEFAULT_INDUSTRY);

  // ---------------------------------------------------------------------------
  // Setters — update active funnel in local state (non-persisting)
  // ---------------------------------------------------------------------------
  const updateActiveFunnel = (patch: Partial<FunnelDef>) => {
    const next = [...funnels];
    if (next[safeIndex]) { next[safeIndex] = { ...next[safeIndex], ...patch }; setFunnels(next); }
  };

  const persistActiveFunnel = (patch: Partial<FunnelDef>) => {
    const next = [...funnels];
    if (next[safeIndex]) { next[safeIndex] = { ...next[safeIndex], ...patch }; saveFunnels(next); }
  };

  const setSteps = (v: StepDef[]) => updateActiveFunnel({ steps: v });
  const saveSteps = (v: StepDef[]) => persistActiveFunnel({ steps: v });

  const setAov = (v: number) => updateActiveFunnel({ aov: v });
  const saveAov = (v: number) => persistActiveFunnel({ aov: v });

  const setMonthlyInfraCost = (v: number) => updateActiveFunnel({ monthlyInfraCost: v });
  const saveMonthlyInfraCost = (v: number) => persistActiveFunnel({ monthlyInfraCost: v });

  const setCdnMonthlyCost = (v: number) => updateActiveFunnel({ cdnMonthlyCost: v });
  const saveCdnMonthlyCost = (v: number) => persistActiveFunnel({ cdnMonthlyCost: v });

  const setComputeCostPerHour = (v: number) => updateActiveFunnel({ computeCostPerHour: v });
  const saveComputeCostPerHour = (v: number) => persistActiveFunnel({ computeCostPerHour: v });

  const setCostPerGb = (v: number) => updateActiveFunnel({ costPerGb: v });
  const saveCostPerGb = (v: number) => persistActiveFunnel({ costPerGb: v });

  const setEngineerHourlyRate = (v: number) => updateActiveFunnel({ engineerHourlyRate: v });
  const saveEngineerHourlyRate = (v: number) => persistActiveFunnel({ engineerHourlyRate: v });

  const setIndustry = (v: IndustryType) => updateActiveFunnel({ industry: v });
  const saveIndustry = (v: IndustryType) => persistActiveFunnel({ industry: v });

  return (
    <SettingsContext.Provider value={{ frontend, setFrontend, funnels, setFunnels, activeFunnelIndex, setActiveFunnelIndex, saveFunnels, saveActiveFunnelIndex, steps, setSteps, saveSteps, aov, setAov, monthlyInfraCost, setMonthlyInfraCost, cdnMonthlyCost, setCdnMonthlyCost, computeCostPerHour, setComputeCostPerHour, costPerGb, setCostPerGb, engineerHourlyRate, setEngineerHourlyRate, industry, setIndustry, saveFrontend, saveAov, saveMonthlyInfraCost, saveCdnMonthlyCost, saveComputeCostPerHour, saveCostPerGb, saveEngineerHourlyRate, saveIndustry }}>
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
