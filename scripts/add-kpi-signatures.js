/**
 * Script Part 2: Update tab function signatures to accept onDrillToForecast.
 * Then replace old-style KPI card divs with enhanced KpiCard components.
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'ui', 'app', 'pages', 'UserJourney.tsx');
let src = fs.readFileSync(filePath, 'utf8');

let totalReplacements = 0;
function replace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) {
    console.warn(`[SKIP] Could not find: ${label}`);
    return false;
  }
  src = src.replace(oldStr, newStr);
  totalReplacements++;
  console.log(`[OK] ${label}`);
  return true;
}

// ============================================================================
// UPDATE FUNCTION SIGNATURES — add onDrillToForecast prop
// ============================================================================

// WebVitalsTab
replace(
  `function WebVitalsTab({ cwv, cwvByPage, cwvTrend, isLoading, appEntityId }: { cwv: any; cwvByPage: any; cwvTrend: any; isLoading: boolean; appEntityId: string })`,
  `function WebVitalsTab({ cwv, cwvByPage, cwvTrend, isLoading, appEntityId, onDrillToForecast }: { cwv: any; cwvByPage: any; cwvTrend: any; isLoading: boolean; appEntityId: string; onDrillToForecast: (label: string, sparkline: number[], color?: string) => void })`,
  'WebVitalsTab signature'
);

// StepDetailsTab
replace(
  `function StepDetailsTab({ stepMap, pageMap, cwvByPage, isLoading, appEntityId, steps, aov, funnelCounts }: { stepMap: Map<string, any>; pageMap: Map<string, any>; cwvByPage: any; isLoading: boolean; appEntityId: string; steps: StepDef[]; aov: number; funnelCounts: number[] })`,
  `function StepDetailsTab({ stepMap, pageMap, cwvByPage, isLoading, appEntityId, steps, aov, funnelCounts, onDrillToForecast }: { stepMap: Map<string, any>; pageMap: Map<string, any>; cwvByPage: any; isLoading: boolean; appEntityId: string; steps: StepDef[]; aov: number; funnelCounts: number[]; onDrillToForecast: (label: string, sparkline: number[], color?: string) => void })`,
  'StepDetailsTab signature'
);

// WorstSessionsTab
replace(
  `function WorstSessionsTab({ data, isLoading }: { data: any; isLoading: boolean })`,
  `function WorstSessionsTab({ data, isLoading, onDrillToForecast }: { data: any; isLoading: boolean; onDrillToForecast: (label: string, sparkline: number[], color?: string) => void })`,
  'WorstSessionsTab signature'
);

// JSErrorsTab
replace(
  `function JSErrorsTab({ data, prevData, isLoading, frontend }: { data: any; prevData: any; isLoading: boolean; frontend: string })`,
  `function JSErrorsTab({ data, prevData, isLoading, frontend, onDrillToForecast }: { data: any; prevData: any; isLoading: boolean; frontend: string; onDrillToForecast: (label: string, sparkline: number[], color?: string) => void })`,
  'JSErrorsTab signature'
);

// ClickIssuesTab
replace(
  `function ClickIssuesTab({ data, isLoading, replayData, frontend }: { data: any; isLoading: boolean; replayData?: any; frontend: string })`,
  `function ClickIssuesTab({ data, isLoading, replayData, frontend, onDrillToForecast }: { data: any; isLoading: boolean; replayData?: any; frontend: string; onDrillToForecast: (label: string, sparkline: number[], color?: string) => void })`,
  'ClickIssuesTab signature'
);

// PerfBudgetsTab
replace(
  `function PerfBudgetsTab({ quality, qualityPrev, overallApdex, overallApdexPrev, overallConv, overallConvPrev, hourlyData, isLoading, saveState, savedThresholds }: { quality: any; qualityPrev: any; overallApdex: number; overallApdexPrev: number; overallConv: number; overallConvPrev: number; hourlyData: any; isLoading: boolean; saveState: any; savedThresholds: any })`,
  `function PerfBudgetsTab({ quality, qualityPrev, overallApdex, overallApdexPrev, overallConv, overallConvPrev, hourlyData, isLoading, saveState, savedThresholds, onDrillToForecast }: { quality: any; qualityPrev: any; overallApdex: number; overallApdexPrev: number; overallConv: number; overallConvPrev: number; hourlyData: any; isLoading: boolean; saveState: any; savedThresholds: any; onDrillToForecast: (label: string, sparkline: number[], color?: string) => void })`,
  'PerfBudgetsTab signature'
);

// GeoHeatmapTab
replace(
  `function GeoHeatmapTab({ data, isLoading, frontend, networkData, conversionData }: { data: any; isLoading: boolean; frontend: string; networkData?: any; conversionData?: any })`,
  `function GeoHeatmapTab({ data, isLoading, frontend, networkData, conversionData, onDrillToForecast }: { data: any; isLoading: boolean; frontend: string; networkData?: any; conversionData?: any; onDrillToForecast: (label: string, sparkline: number[], color?: string) => void })`,
  'GeoHeatmapTab signature'
);

// NavigationPathsTab
replace(
  `function NavigationPathsTab({ data, isLoading, appEntityId, steps, navPathConvData }: { data: any; isLoading: boolean; appEntityId: string; steps: StepDef[]; navPathConvData?: any })`,
  `function NavigationPathsTab({ data, isLoading, appEntityId, steps, navPathConvData, onDrillToForecast }: { data: any; isLoading: boolean; appEntityId: string; steps: StepDef[]; navPathConvData?: any; onDrillToForecast: (label: string, sparkline: number[], color?: string) => void })`,
  'NavigationPathsTab signature'
);

// AnomalyDetectionTab
replace(
  `function AnomalyDetectionTab({ quality, qualityPrev, overallApdex, overallApdexPrev, funnelCounts, funnelCountsPrev, stepMap, durationDist, isLoading, steps, aov, davisProblemsData }: { quality: any; qualityPrev: any; overallApdex: number; overallApdexPrev: number; funnelCounts: number[]; funnelCountsPrev: number[]; stepMap: Map<string, any>; durationDist: any; isLoading: boolean; steps: StepDef[]; aov: number; davisProblemsData?: any })`,
  `function AnomalyDetectionTab({ quality, qualityPrev, overallApdex, overallApdexPrev, funnelCounts, funnelCountsPrev, stepMap, durationDist, isLoading, steps, aov, davisProblemsData, onDrillToForecast }: { quality: any; qualityPrev: any; overallApdex: number; overallApdexPrev: number; funnelCounts: number[]; funnelCountsPrev: number[]; stepMap: Map<string, any>; durationDist: any; isLoading: boolean; steps: StepDef[]; aov: number; davisProblemsData?: any; onDrillToForecast: (label: string, sparkline: number[], color?: string) => void })`,
  'AnomalyDetectionTab signature'
);

// WhatIfTab
replace(
  `function WhatIfTab({ funnelCounts, stepMap, overallApdex, isLoading, steps, aov, hostMetricsData }: { funnelCounts: number[]; stepMap: Map<string, any>; overallApdex: number; isLoading: boolean; steps: StepDef[]; aov: number; hostMetricsData?: any })`,
  `function WhatIfTab({ funnelCounts, stepMap, overallApdex, isLoading, steps, aov, hostMetricsData, onDrillToForecast }: { funnelCounts: number[]; stepMap: Map<string, any>; overallApdex: number; isLoading: boolean; steps: StepDef[]; aov: number; hostMetricsData?: any; onDrillToForecast: (label: string, sparkline: number[], color?: string) => void })`,
  'WhatIfTab signature'
);

// RevenueIntelligenceTab
replace(
  `function RevenueIntelligenceTab({ funnelCounts, funnelCountsPrev, stepMap, overallConv, overallConvPrev, overallApdex, quality, qualityPrev, isLoading, steps, aov }: { funnelCounts: number[]; funnelCountsPrev: number[]; stepMap: Map<string, any>; overallConv: number; overallConvPrev: number; overallApdex: number; quality: any; qualityPrev: any; isLoading: boolean; steps: StepDef[]; aov: number })`,
  `function RevenueIntelligenceTab({ funnelCounts, funnelCountsPrev, stepMap, overallConv, overallConvPrev, overallApdex, quality, qualityPrev, isLoading, steps, aov, onDrillToForecast }: { funnelCounts: number[]; funnelCountsPrev: number[]; stepMap: Map<string, any>; overallConv: number; overallConvPrev: number; overallApdex: number; quality: any; qualityPrev: any; isLoading: boolean; steps: StepDef[]; aov: number; onDrillToForecast: (label: string, sparkline: number[], color?: string) => void })`,
  'RevenueIntelligenceTab signature'
);

// RootCauseCorrelationTab
replace(
  `function RootCauseCorrelationTab({ backendServicesData, serviceToServiceData, backendProblemsData, hourlyData, stepDropData, quality, qualityPrev, overallApdex, overallApdexPrev, overallConv, overallConvPrev, isLoading, steps, aov, funnelCounts, frontend }: {`,
  `function RootCauseCorrelationTab({ backendServicesData, serviceToServiceData, backendProblemsData, hourlyData, stepDropData, quality, qualityPrev, overallApdex, overallApdexPrev, overallConv, overallConvPrev, isLoading, steps, aov, funnelCounts, frontend, onDrillToForecast }: {`,
  'RootCauseCorrelationTab signature part1'
);
// Find the closing of its type declaration and add the prop type
replace(
  `funnelCounts: number[]; frontend: string })`,
  `funnelCounts: number[]; frontend: string; onDrillToForecast: (label: string, sparkline: number[], color?: string) => void })`,
  'RootCauseCorrelationTab signature type'
);

// PredictiveForecastingTab
replace(
  `function PredictiveForecastingTab({ trendData, apdexTrendData, vitalsTrendData, quality, overallApdex, overallConv, isLoading, steps, aov, funnelCounts }: { trendData: any; apdexTrendData: any; vitalsTrendData: any; quality: any; overallApdex: number; overallConv: number; isLoading: boolean; steps: StepDef[]; aov: number; funnelCounts: number[] })`,
  `function PredictiveForecastingTab({ trendData, apdexTrendData, vitalsTrendData, quality, overallApdex, overallConv, isLoading, steps, aov, funnelCounts, onDrillToForecast }: { trendData: any; apdexTrendData: any; vitalsTrendData: any; quality: any; overallApdex: number; overallConv: number; isLoading: boolean; steps: StepDef[]; aov: number; funnelCounts: number[]; onDrillToForecast: (label: string, sparkline: number[], color?: string) => void })`,
  'PredictiveForecastingTab signature'
);

// ResourceWaterfallTab
replace(
  `function ResourceWaterfallTab({ waterfallData, byStepData, sessionDrillData, isLoading, steps, frontend }: { waterfallData: any; byStepData: any; sessionDrillData?: any; isLoading: boolean; steps: StepDef[]; frontend: string })`,
  `function ResourceWaterfallTab({ waterfallData, byStepData, sessionDrillData, isLoading, steps, frontend, onDrillToForecast }: { waterfallData: any; byStepData: any; sessionDrillData?: any; isLoading: boolean; steps: StepDef[]; frontend: string; onDrillToForecast: (label: string, sparkline: number[], color?: string) => void })`,
  'ResourceWaterfallTab signature'
);

// ChangeIntelligenceTab
replace(
  `function ChangeIntelligenceTab({ featureFlagData, deployData, impactData, quality, qualityPrev, overallApdex, overallApdexPrev, isLoading, aov, overallConv, funnelCounts }: {`,
  `function ChangeIntelligenceTab({ featureFlagData, deployData, impactData, quality, qualityPrev, overallApdex, overallApdexPrev, isLoading, aov, overallConv, funnelCounts, onDrillToForecast }: {`,
  'ChangeIntelligenceTab signature part1'
);

// SessionReplaySpotlightTab
replace(
  `function SessionReplaySpotlightTab({ data, isLoading }: { data: any; isLoading: boolean })`,
  `function SessionReplaySpotlightTab({ data, isLoading, onDrillToForecast }: { data: any; isLoading: boolean; onDrillToForecast: (label: string, sparkline: number[], color?: string) => void })`,
  'SessionReplaySpotlightTab signature'
);

// CohortRetentionTab
replace(
  `function CohortRetentionTab({ retentionData, sessionData, engagementData, isLoading, steps, aov }: { retentionData: any; sessionData: any; engagementData?: any; isLoading: boolean; steps: StepDef[]; aov: number })`,
  `function CohortRetentionTab({ retentionData, sessionData, engagementData, isLoading, steps, aov, onDrillToForecast }: { retentionData: any; sessionData: any; engagementData?: any; isLoading: boolean; steps: StepDef[]; aov: number; onDrillToForecast: (label: string, sparkline: number[], color?: string) => void })`,
  'CohortRetentionTab signature'
);

// SessionEngagementTab
replace(
  `function SessionEngagementTab({ data, isLoading, steps, aov, overallConv }: { data: any; isLoading: boolean; steps: StepDef[]; aov: number; overallConv: number })`,
  `function SessionEngagementTab({ data, isLoading, steps, aov, overallConv, onDrillToForecast }: { data: any; isLoading: boolean; steps: StepDef[]; aov: number; overallConv: number; onDrillToForecast: (label: string, sparkline: number[], color?: string) => void })`,
  'SessionEngagementTab signature'
);

// ThirdPartyImpactTab
replace(
  `function ThirdPartyImpactTab({ data, cwvData, isLoading, frontend }: { data: any; cwvData: any; isLoading: boolean; frontend: string })`,
  `function ThirdPartyImpactTab({ data, cwvData, isLoading, frontend, onDrillToForecast }: { data: any; cwvData: any; isLoading: boolean; frontend: string; onDrillToForecast: (label: string, sparkline: number[], color?: string) => void })`,
  'ThirdPartyImpactTab signature'
);

// ErrorClusteringTab
replace(
  `function ErrorClusteringTab({ deployData, data, trendData, isLoading, frontend }: { deployData: any; data: any; trendData: any; isLoading: boolean; frontend: string })`,
  `function ErrorClusteringTab({ deployData, data, trendData, isLoading, frontend, onDrillToForecast }: { deployData: any; data: any; trendData: any; isLoading: boolean; frontend: string; onDrillToForecast: (label: string, sparkline: number[], color?: string) => void })`,
  'ErrorClusteringTab signature'
);

// SankeyTab — more complex, find the line
replace(
  `function SankeyTab({ data, isLoading, appEntityId, chartStyle, onStyleChange, steps, aov, cwvData, errorData, pathsData, frontend, durationData, prevPathsData, velocityData }: {`,
  `function SankeyTab({ data, isLoading, appEntityId, chartStyle, onStyleChange, steps, aov, cwvData, errorData, pathsData, frontend, durationData, prevPathsData, velocityData, onDrillToForecast }: {`,
  'SankeyTab signature part1'
);

// ============================================================================
// Write updated file
// ============================================================================
fs.writeFileSync(filePath, src, 'utf8');
console.log(`\n✔ Done. ${totalReplacements} signature replacements made.`);
