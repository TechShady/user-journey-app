/**
 * Script to add sparklines, arrows (prevRawValue), and forecast drill to all KPI cards.
 * Strategy:
 * 1. For each tab function, add onDrillToForecast prop
 * 2. Replace old-style <div className="uj-kpi-card"> with <KpiCard> component
 * 3. Generate synthetic sparklines where no real time-series data exists
 * 4. Update switch statement invocations to pass openForecast
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'ui', 'app', 'pages', 'UserJourney.tsx');
let src = fs.readFileSync(filePath, 'utf8');

// Helper: count replacements made
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
// 1. UPDATE SWITCH INVOCATIONS — pass openForecast to all tabs
// ============================================================================

// WebVitalsTab
replace(
  `case "Web Vitals": content = <WebVitalsTab cwv={cwv} cwvByPage={cwvByPage} cwvTrend={sloCwvTrendData} isLoading={cwvResult.isLoading || cwvByPage.isLoading} appEntityId={appEntityId} />`,
  `case "Web Vitals": content = <WebVitalsTab cwv={cwv} cwvByPage={cwvByPage} cwvTrend={sloCwvTrendData} isLoading={cwvResult.isLoading || cwvByPage.isLoading} appEntityId={appEntityId} onDrillToForecast={openForecast} />`,
  'WebVitalsTab invocation'
);

// StepDetailsTab
replace(
  `case "Step Details": content = <StepDetailsTab stepMap={stepMap} pageMap={pageMap} cwvByPage={cwvByPage} isLoading={stepMetrics.isLoading} appEntityId={appEntityId} steps={steps} aov={aov} funnelCounts={funnelCounts} />`,
  `case "Step Details": content = <StepDetailsTab stepMap={stepMap} pageMap={pageMap} cwvByPage={cwvByPage} isLoading={stepMetrics.isLoading} appEntityId={appEntityId} steps={steps} aov={aov} funnelCounts={funnelCounts} onDrillToForecast={openForecast} />`,
  'StepDetailsTab invocation'
);

// WorstSessionsTab
replace(
  `case "Worst Sessions": content = <WorstSessionsTab data={worstSessionsData} isLoading={worstSessionsData.isLoading} />`,
  `case "Worst Sessions": content = <WorstSessionsTab data={worstSessionsData} isLoading={worstSessionsData.isLoading} onDrillToForecast={openForecast} />`,
  'WorstSessionsTab invocation'
);

// JSErrorsTab (Exceptions)
replace(
  `case "Exceptions": content = <JSErrorsTab data={jsErrorsData} prevData={jsErrorsPrevData} isLoading={jsErrorsData.isLoading} frontend={frontend} />`,
  `case "Exceptions": content = <JSErrorsTab data={jsErrorsData} prevData={jsErrorsPrevData} isLoading={jsErrorsData.isLoading} frontend={frontend} onDrillToForecast={openForecast} />`,
  'JSErrorsTab invocation'
);

// ClickIssuesTab
replace(
  `case "Click Issues": content = <ClickIssuesTab data={clickIssuesData} replayData={clickReplayData} isLoading={clickIssuesData.isLoading} frontend={frontend} />`,
  `case "Click Issues": content = <ClickIssuesTab data={clickIssuesData} replayData={clickReplayData} isLoading={clickIssuesData.isLoading} frontend={frontend} onDrillToForecast={openForecast} />`,
  'ClickIssuesTab invocation'
);

// PerfBudgetsTab
replace(
  `case "Perf Budgets": content = <PerfBudgetsTab quality={quality} qualityPrev={qualityPrev} overallApdex={overallApdex} overallApdexPrev={overallApdexPrev} overallConv={overallConv} overallConvPrev={overallConvPrev} hourlyData={hourlyDistributionData} isLoading={qualityData.isLoading || hourlyDistributionData.isLoading || qualityDataPrev.isLoading} saveState={saveState} savedThresholds={savedBudgetThresholds} />`,
  `case "Perf Budgets": content = <PerfBudgetsTab quality={quality} qualityPrev={qualityPrev} overallApdex={overallApdex} overallApdexPrev={overallApdexPrev} overallConv={overallConv} overallConvPrev={overallConvPrev} hourlyData={hourlyDistributionData} isLoading={qualityData.isLoading || hourlyDistributionData.isLoading || qualityDataPrev.isLoading} saveState={saveState} savedThresholds={savedBudgetThresholds} onDrillToForecast={openForecast} />`,
  'PerfBudgetsTab invocation'
);

// GeoHeatmapTab
replace(
  `case "Geo Heatmap": content = <GeoHeatmapTab data={geoPerformanceData} isLoading={geoPerformanceData.isLoading} frontend={frontend} networkData={geoNetworkData} conversionData={geoConversionData} />`,
  `case "Geo Heatmap": content = <GeoHeatmapTab data={geoPerformanceData} isLoading={geoPerformanceData.isLoading} frontend={frontend} networkData={geoNetworkData} conversionData={geoConversionData} onDrillToForecast={openForecast} />`,
  'GeoHeatmapTab invocation'
);

// NavigationPathsTab
replace(
  `case "Navigation Paths": content = <NavigationPathsTab data={navigationPathsData} navPathConvData={navPathConvData} isLoading={navigationPathsData.isLoading} appEntityId={appEntityId} steps={steps} />`,
  `case "Navigation Paths": content = <NavigationPathsTab data={navigationPathsData} navPathConvData={navPathConvData} isLoading={navigationPathsData.isLoading} appEntityId={appEntityId} steps={steps} onDrillToForecast={openForecast} />`,
  'NavigationPathsTab invocation'
);

// SankeyTab
replace(
  `case "Sankey": content = <SankeyTab data={sankeyData} isLoading={sankeyData.isLoading} appEntityId={appEntityId} chartStyle={sankeyStyle} onStyleChange={(v: SankeyStyle) => { setSankeyStyle(v); saveState({ key: SANKEY_STYLE_STATE_KEY, body: { value: v } }); }} steps={steps} aov={aov} cwvData={sankeyCwvData} errorData={sankeyErrorData} pathsData={sankeyPathsData} frontend={frontend} durationData={sankeyDurationData} prevPathsData={sankeyPrevPaths} velocityData={funnelVelocityData} />`,
  `case "Sankey": content = <SankeyTab data={sankeyData} isLoading={sankeyData.isLoading} appEntityId={appEntityId} chartStyle={sankeyStyle} onStyleChange={(v: SankeyStyle) => { setSankeyStyle(v); saveState({ key: SANKEY_STYLE_STATE_KEY, body: { value: v } }); }} steps={steps} aov={aov} cwvData={sankeyCwvData} errorData={sankeyErrorData} pathsData={sankeyPathsData} frontend={frontend} durationData={sankeyDurationData} prevPathsData={sankeyPrevPaths} velocityData={funnelVelocityData} onDrillToForecast={openForecast} />`,
  'SankeyTab invocation'
);

// AnomalyDetectionTab
replace(
  `case "Anomaly Detection": content = <AnomalyDetectionTab quality={quality} qualityPrev={qualityPrev} overallApdex={overallApdex} overallApdexPrev={overallApdexPrev} funnelCounts={funnelCounts} funnelCountsPrev={funnelCountsPrev} stepMap={stepMap} durationDist={durationDistributionData} isLoading={qualityData.isLoading || qualityDataPrev.isLoading || durationDistributionData.isLoading} steps={steps} aov={aov}  davisProblemsData={davisProblemsData} />`,
  `case "Anomaly Detection": content = <AnomalyDetectionTab quality={quality} qualityPrev={qualityPrev} overallApdex={overallApdex} overallApdexPrev={overallApdexPrev} funnelCounts={funnelCounts} funnelCountsPrev={funnelCountsPrev} stepMap={stepMap} durationDist={durationDistributionData} isLoading={qualityData.isLoading || qualityDataPrev.isLoading || durationDistributionData.isLoading} steps={steps} aov={aov}  davisProblemsData={davisProblemsData} onDrillToForecast={openForecast} />`,
  'AnomalyDetectionTab invocation'
);

// WhatIfTab
replace(
  `case "What-If Analysis": content = <WhatIfTab hostMetricsData={hostMetricsData} funnelCounts={funnelCounts} stepMap={stepMap} overallApdex={overallApdex} isLoading={isLoading} steps={steps} aov={aov} />`,
  `case "What-If Analysis": content = <WhatIfTab hostMetricsData={hostMetricsData} funnelCounts={funnelCounts} stepMap={stepMap} overallApdex={overallApdex} isLoading={isLoading} steps={steps} aov={aov} onDrillToForecast={openForecast} />`,
  'WhatIfTab invocation'
);

// RootCauseCorrelationTab
replace(
  `case "Root Cause Correlation": content = <RootCauseCorrelationTab backendServicesData={backendServicesData} serviceToServiceData={serviceToServiceData} backendProblemsData={backendProblemsData} hourlyData={rootCauseCorrelationData} stepDropData={rootCauseStepDropData} quality={quality} qualityPrev={qualityPrev} overallApdex={overallApdex} overallApdexPrev={overallApdexPrev} overallConv={overallConv} overallConvPrev={overallConvPrev} isLoading={rootCauseCorrelationData.isLoading || rootCauseStepDropData.isLoading} steps={steps} aov={aov} funnelCounts={funnelCounts} frontend={frontend} />`,
  `case "Root Cause Correlation": content = <RootCauseCorrelationTab backendServicesData={backendServicesData} serviceToServiceData={serviceToServiceData} backendProblemsData={backendProblemsData} hourlyData={rootCauseCorrelationData} stepDropData={rootCauseStepDropData} quality={quality} qualityPrev={qualityPrev} overallApdex={overallApdex} overallApdexPrev={overallApdexPrev} overallConv={overallConv} overallConvPrev={overallConvPrev} isLoading={rootCauseCorrelationData.isLoading || rootCauseStepDropData.isLoading} steps={steps} aov={aov} funnelCounts={funnelCounts} frontend={frontend} onDrillToForecast={openForecast} />`,
  'RootCauseCorrelationTab invocation'
);

// PredictiveForecastingTab
replace(
  `case "Predictive Forecasting": content = <PredictiveForecastingTab trendData={forecastTrendData} apdexTrendData={forecastApdexTrendData} vitalsTrendData={forecastVitalsTrendData} quality={quality} overallApdex={overallApdex} overallConv={overallConv} isLoading={forecastTrendData.isLoading || forecastApdexTrendData.isLoading || forecastVitalsTrendData.isLoading} steps={steps} aov={aov} funnelCounts={funnelCounts} />`,
  `case "Predictive Forecasting": content = <PredictiveForecastingTab trendData={forecastTrendData} apdexTrendData={forecastApdexTrendData} vitalsTrendData={forecastVitalsTrendData} quality={quality} overallApdex={overallApdex} overallConv={overallConv} isLoading={forecastTrendData.isLoading || forecastApdexTrendData.isLoading || forecastVitalsTrendData.isLoading} steps={steps} aov={aov} funnelCounts={funnelCounts} onDrillToForecast={openForecast} />`,
  'PredictiveForecastingTab invocation'
);

// ResourceWaterfallTab
replace(
  `case "Resource Waterfall": content = <ResourceWaterfallTab waterfallData={resourceWaterfallData} byStepData={resourceByStepData} sessionDrillData={resourceSessionDrillData} isLoading={resourceWaterfallData.isLoading || resourceByStepData.isLoading || resourceSessionDrillData.isLoading} steps={steps} frontend={frontend} />`,
  `case "Resource Waterfall": content = <ResourceWaterfallTab waterfallData={resourceWaterfallData} byStepData={resourceByStepData} sessionDrillData={resourceSessionDrillData} isLoading={resourceWaterfallData.isLoading || resourceByStepData.isLoading || resourceSessionDrillData.isLoading} steps={steps} frontend={frontend} onDrillToForecast={openForecast} />`,
  'ResourceWaterfallTab invocation'
);

// ChangeIntelligenceTab
replace(
  `case "Change Intelligence": content = <ChangeIntelligenceTab featureFlagData={featureFlagData} deployData={deploymentEventsData} impactData={changeImpactData} quality={quality} qualityPrev={qualityPrev} overallApdex={overallApdex} overallApdexPrev={overallApdexPrev} isLoading={deploymentEventsData.isLoading || changeImpactData.isLoading} aov={aov} overallConv={overallConv} funnelCounts={funnelCounts} />`,
  `case "Change Intelligence": content = <ChangeIntelligenceTab featureFlagData={featureFlagData} deployData={deploymentEventsData} impactData={changeImpactData} quality={quality} qualityPrev={qualityPrev} overallApdex={overallApdex} overallApdexPrev={overallApdexPrev} isLoading={deploymentEventsData.isLoading || changeImpactData.isLoading} aov={aov} overallConv={overallConv} funnelCounts={funnelCounts} onDrillToForecast={openForecast} />`,
  'ChangeIntelligenceTab invocation'
);

// SessionReplaySpotlightTab
replace(
  `case "Session Replay Spotlight": content = <SessionReplaySpotlightTab data={sessionReplayData} isLoading={sessionReplayData.isLoading} />`,
  `case "Session Replay Spotlight": content = <SessionReplaySpotlightTab data={sessionReplayData} isLoading={sessionReplayData.isLoading} onDrillToForecast={openForecast} />`,
  'SessionReplaySpotlightTab invocation'
);

// CohortRetentionTab
replace(
  `case "Cohort Retention": content = <CohortRetentionTab retentionData={cohortRetentionData} sessionData={cohortSessionData} engagementData={sessionEngagementData} isLoading={cohortRetentionData.isLoading || cohortSessionData.isLoading} steps={steps} aov={aov} />`,
  `case "Cohort Retention": content = <CohortRetentionTab retentionData={cohortRetentionData} sessionData={cohortSessionData} engagementData={sessionEngagementData} isLoading={cohortRetentionData.isLoading || cohortSessionData.isLoading} steps={steps} aov={aov} onDrillToForecast={openForecast} />`,
  'CohortRetentionTab invocation'
);

// SessionEngagementTab
replace(
  `case "Session Engagement": content = <SessionEngagementTab data={sessionEngagementData} isLoading={sessionEngagementData.isLoading} steps={steps} aov={aov} overallConv={overallConv} />`,
  `case "Session Engagement": content = <SessionEngagementTab data={sessionEngagementData} isLoading={sessionEngagementData.isLoading} steps={steps} aov={aov} overallConv={overallConv} onDrillToForecast={openForecast} />`,
  'SessionEngagementTab invocation'
);

// ThirdPartyImpactTab
replace(
  `case "Third-Party Impact": content = <ThirdPartyImpactTab data={thirdPartyData} cwvData={thirdPartyCwvData} isLoading={thirdPartyData.isLoading || thirdPartyCwvData.isLoading} frontend={frontend} />`,
  `case "Third-Party Impact": content = <ThirdPartyImpactTab data={thirdPartyData} cwvData={thirdPartyCwvData} isLoading={thirdPartyData.isLoading || thirdPartyCwvData.isLoading} frontend={frontend} onDrillToForecast={openForecast} />`,
  'ThirdPartyImpactTab invocation'
);

// ErrorClusteringTab
replace(
  `case "Error Clustering": content = <ErrorClusteringTab deployData={deploymentEventsData} data={errorClusterData} trendData={errorTrendData} isLoading={errorClusterData.isLoading || errorTrendData.isLoading} frontend={frontend} />`,
  `case "Error Clustering": content = <ErrorClusteringTab deployData={deploymentEventsData} data={errorClusterData} trendData={errorTrendData} isLoading={errorClusterData.isLoading || errorTrendData.isLoading} frontend={frontend} onDrillToForecast={openForecast} />`,
  'ErrorClusteringTab invocation'
);

// RevenueIntelligenceTab
replace(
  `case "Revenue Intelligence": content = <RevenueIntelligenceTab funnelCounts={funnelCounts} funnelCountsPrev={funnelCountsPrev} stepMap={stepMap} overallConv={overallConv} overallConvPrev={overallConvPrev} overallApdex={overallApdex} quality={quality} qualityPrev={qualityPrev} isLoading={isLoading || qualityData.isLoading || qualityDataPrev.isLoading || funnelResultPrev.isLoading} steps={steps} aov={aov} />`,
  `case "Revenue Intelligence": content = <RevenueIntelligenceTab funnelCounts={funnelCounts} funnelCountsPrev={funnelCountsPrev} stepMap={stepMap} overallConv={overallConv} overallConvPrev={overallConvPrev} overallApdex={overallApdex} quality={quality} qualityPrev={qualityPrev} isLoading={isLoading || qualityData.isLoading || qualityDataPrev.isLoading || funnelResultPrev.isLoading} steps={steps} aov={aov} onDrillToForecast={openForecast} />`,
  'RevenueIntelligenceTab invocation'
);

// ============================================================================
// Write updated file
// ============================================================================
fs.writeFileSync(filePath, src, 'utf8');
console.log(`\n✔ Done. ${totalReplacements} replacements made.`);
