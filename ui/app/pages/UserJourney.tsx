import React, { useState, useMemo, useEffect } from "react";
import { useDql, useUserAppState, useSetUserAppState } from "@dynatrace-sdk/react-hooks";
import { getEnvironmentUrl } from "@dynatrace-sdk/app-environment";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text, Strong, Paragraph, Link } from "@dynatrace/strato-components/typography";
import { Tabs, Tab } from "@dynatrace/strato-components-preview/navigation";
import { Select, TextInput } from "@dynatrace/strato-components-preview/forms";
import { ProgressBar } from "@dynatrace/strato-components/content";
import { Button } from "@dynatrace/strato-components/buttons";
import { Sheet } from "@dynatrace/strato-components/overlays";
import { Switch } from "@dynatrace/strato-components/forms";
import { DataTable } from "@dynatrace/strato-components-preview/tables";
import "./UserJourney.css";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DEFAULT_FRONTEND = "www.angular.easytravel.com";
const FRONTEND_STATE_KEY = "uj-frontend-app";
const STEPS_STATE_KEY = "uj-funnel-steps";
const SANKEY_STYLE_STATE_KEY = "uj-sankey-style";
const MAP_VIEW_STATE_KEY = "uj-map-view";
type SankeyStyle = "classic" | "gradient" | "directed" | "alluvial" | "stateMachine";
const SANKEY_STYLE_OPTIONS: { value: SankeyStyle; label: string }[] = [
  { value: "classic", label: "Classic Sankey" },
  { value: "gradient", label: "Gradient Sankey" },
  { value: "directed", label: "Directed Flow Graph" },
  { value: "alluvial", label: "Alluvial / Columnar" },
  { value: "stateMachine", label: "State Machine" },
];
const DEFAULT_SANKEY_STYLE: SankeyStyle = "classic";
type MapViewSetting = "world" | "us";
const MAP_VIEW_OPTIONS: { value: MapViewSetting; label: string }[] = [
  { value: "world", label: "World" },
  { value: "us", label: "United States" },
];
const DEFAULT_MAP_VIEW: MapViewSetting = "world";
const MIN_STEPS = 2;
const MAX_STEPS = 10;
const GREEN = "#0D9C29";
const YELLOW = "#FCD53F";
const RED = "#C21930";
const BLUE = "#4589FF";
const PURPLE = "#A56EFF";
const CYAN = "#08BDBA";
const ORANGE = "#FF832B";

let ENV_URL = "";
try { ENV_URL = getEnvironmentUrl(); } catch { /* dev fallback */ }

type StepDef = { label: string; identifier: string; type: "view" | "request" };

const DEFAULT_FUNNEL_STEPS: StepDef[] = [
  { label: "Home Page", identifier: "home", type: "view" },
  { label: "Login", identifier: "login", type: "request" },
  { label: "Search", identifier: "search", type: "request" },
  { label: "Payment", identifier: "payment", type: "request" },
];

const TIMEFRAME_OPTIONS = [
  { label: "2 hours", value: 0.083 },
  { label: "6 hours", value: 0.25 },
  { label: "12 hours", value: 0.5 },
  { label: "1 day", value: 1 },
  { label: "2 days", value: 2 },
  { label: "3 days", value: 3 },
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
];

const DEFAULT_TIMEFRAME = 0.083;
const TRAFFIC_MULTIPLIERS = [1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const APDEX_T = 3000;
const APDEX_4T = 12000;

const TAB_KEYS = [
  "Funnel Overview", "Trends", "Web Vitals", "Step Details", "Worst Sessions",
  "Exceptions", "Click Issues", "Perf Budgets",
  "Geo Heatmap", "Map", "Navigation Paths", "Sankey", "Anomaly Detection",
  "Conversion Attribution", "Executive Summary", "Segmentation",
  "Errors & Drop-offs", "What-If Analysis", "Root Cause Correlation", "Predictive Forecasting",
  "Resource Waterfall", "Change Intelligence",
  "SLO Tracker", "Session Replay Spotlight", "A/B Comparison",
] as const;
type TabKey = typeof TAB_KEYS[number];
const DEFAULT_TAB_VISIBILITY: Record<TabKey, boolean> = Object.fromEntries(TAB_KEYS.map(k => [k, true])) as Record<TabKey, boolean>;
const TAB_STATE_KEY = "uj-tab-visibility";
const TAB_ORDER_STATE_KEY = "uj-tab-order";
const DEFAULT_TAB_ORDER: TabKey[] = [...TAB_KEYS];

const CWV = {
  lcp: { good: 2500, poor: 4000 },
  cls: { good: 0.1, poor: 0.25 },
  inp: { good: 200, poor: 500 },
  ttfb: { good: 800, poor: 1800 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function periodClause(days: number, prev = false): string {
  if (days < 1) {
    const h = Math.round(days * 24);
    return prev ? `from: now() - ${h * 2}h, to: now() - ${h}h` : `from: now() - ${h}h`;
  }
  return prev ? `from: now() - ${days * 2}d, to: now() - ${days}d` : `from: now() - ${days}d`;
}
function fmt(v: number | undefined): string { if (v == null || isNaN(v)) return "N/A"; return v >= 1000 ? (v / 1000).toFixed(2) + " s" : v.toFixed(0) + " ms"; }
function fmtCount(v: number | undefined): string { if (v == null) return "0"; if (v >= 1e6) return (v / 1e6).toFixed(1) + "M"; if (v >= 1e3) return (v / 1e3).toFixed(1) + "k"; return Math.round(v).toLocaleString(); }
function fmtPct(v: number | undefined): string { return (v == null || isNaN(v)) ? "0.0%" : v.toFixed(1) + "%"; }
function formatHourKey(d: Date): string { return d.toISOString().substring(0, 13).replace("T", " ") + ":00"; }
function statusClr(pct: number): string { return pct >= 80 ? GREEN : pct >= 50 ? YELLOW : RED; }
function apdexClr(a: number): string { return a >= 0.85 ? GREEN : a >= 0.7 ? YELLOW : a >= 0.5 ? ORANGE : RED; }
function apdexLabel(a: number): string { return a >= 0.85 ? "Excellent" : a >= 0.7 ? "Good" : a >= 0.5 ? "Fair" : "Poor"; }
function cwvClr(val: number, metric: keyof typeof CWV): string { return val <= CWV[metric].good ? GREEN : val <= CWV[metric].poor ? YELLOW : RED; }
function cwvLabel(val: number, metric: keyof typeof CWV): string { return val <= CWV[metric].good ? "Good" : val <= CWV[metric].poor ? "Needs Improvement" : "Poor"; }
function calcApdex(sat: number, tol: number, total: number): number { return total > 0 ? (sat + tol / 2) / total : 0; }

function stepFilter(s: StepDef): string {
  if (s.type === "view") {
    return s.identifier.endsWith("*")
      ? `startsWith(view.name, "${s.identifier.slice(0, -1)}")`
      : `view.name == "${s.identifier}"`;
  }
  return `url.path == "${s.identifier}"`;
}
function anyStepFilter(steps: StepDef[]): string { return steps.map(stepFilter).join(" or "); }
function stepTagExpr(steps: StepDef[], labels: string[]): string {
  return `coalesce(\n    ${steps.map((s, i) => `if(${stepFilter(s)}, "${labels[i]}")`).join(",\n    ")},\n    "other")`;
}

function sessionReplayUrl(sessionId: string, startTs?: string): string {
  return `${ENV_URL}/ui/apps/dynatrace.users.sessions/session-viewer/${sessionId}/${startTs ?? ''}?tf=now-2h%3Bnow&perspective=general`;
}

function appEntityQuery(frontend: string): string {
  return `fetch dt.entity.application
| filter entity.name == "${frontend}"
| fieldsKeep id
| limit 1`;
}

function vitalsUrl(appEntityId: string, pageName: string): string {
  const encoded = btoa(pageName);
  return `${ENV_URL}/ui/apps/dynatrace.experience.vitals/performance/web/${encodeURIComponent(appEntityId)}/pages/${encodeURIComponent(encoded)}`;
}

function errorInspectorUrl(errorId: string, frontend: string): string {
  const filter = encodeURIComponent(`"Frontend" = "${frontend}" "Error Type" = "Exception"`);
  return `${ENV_URL}/ui/apps/dynatrace.error.inspector/explorer?tf=now-2h%3Bnow&sort=affected_users%3Adescending&perspective=impact&detailsId=${encodeURIComponent(errorId)}&sidebarOpen=true#filtering=${filter}`;
}

function sessionsFilterUrl(frontend: string, locationName?: string): string {
  let filter = `Frontends = ${frontend}`;
  if (locationName) filter += ` Location = "${locationName}"`;
  return `${ENV_URL}/ui/apps/dynatrace.users.sessions/sessions/sessions?tf=now-2h%3Bnow&perspective=general#filtering=${encodeURIComponent(filter)}`;
}

function SectionHeader({ title }: { title: string }) {
  return <div className="uj-section-header"><Heading level={5}>{title}</Heading></div>;
}
function Loading() { return <ProgressBar style={{ width: "100%", marginTop: 12 }} />; }

// Delta indicator for trend comparison
function Delta({ current, previous, inverted = false, suffix = "" }: { current: number; previous: number; inverted?: boolean; suffix?: string }) {
  const delta = current - previous;
  const pct = previous > 0 ? (delta / previous) * 100 : (current > 0 ? 100 : 0);
  const improving = inverted ? delta < 0 : delta > 0;
  const color = Math.abs(pct) < 1 ? "rgba(255,255,255,0.4)" : improving ? GREEN : RED;
  const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "●";
  return <span style={{ fontSize: 11, color, fontWeight: 600 }}>{arrow} {Math.abs(pct).toFixed(1)}%{suffix}</span>;
}

// ---------------------------------------------------------------------------
// DQL Queries
// ---------------------------------------------------------------------------
function sessionFlowQuery(days: number, frontend: string, steps: StepDef[], prev = false): string {
  const period = periodClause(days, prev);
  const tagExpr = stepTagExpr(steps, steps.map((_, i) => `step${i + 1}`));
  const iAnyLines = steps.map((_, i) => `    reached_step${i + 1} = iAny(steps[] == "step${i + 1}")`).join(",\n");
  const countLines = steps.map((_, i) => {
    const conds = Array.from({ length: i + 1 }, (__, j) => `reached_step${j + 1} == true`).join(" and ");
    return `    at_step${i + 1} = countIf(${conds})`;
  }).join(",\n");
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter ${anyStepFilter(steps)}
| fieldsAdd step_tag = ${tagExpr}
| summarize steps = collectDistinct(step_tag), by: {dt.rum.session.id}
| fieldsAdd
${iAnyLines}
| summarize
    total_sessions = count(),
${countLines}`;
}

function stepMetricsQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  const tagExpr = stepTagExpr(steps, steps.map((s) => s.label));
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter ${anyStepFilter(steps)}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd step_tag = ${tagExpr}
| fieldsAdd satisfaction = coalesce(
    if(dur_ms <= ${APDEX_T}.0, "satisfied"),
    if(dur_ms <= ${APDEX_4T}.0, "tolerating"),
    "frustrated")
| summarize
    sessions = countDistinct(dt.rum.session.id),
    total_actions = count(),
    avg_duration_ms = avg(dur_ms),
    p50_duration_ms = percentile(dur_ms, 50),
    p90_duration_ms = percentile(dur_ms, 90),
    p99_duration_ms = percentile(dur_ms, 99),
    error_count = countIf(characteristics.has_error == true),
    satisfied = countIf(satisfaction == "satisfied"),
    tolerating = countIf(satisfaction == "tolerating"),
    frustrated = countIf(satisfaction == "frustrated"),
    by: {step_tag}`;
}

function cwvQuery(days: number, frontend: string): string {
  const period = periodClause(days);
  return `timeseries {
  lcp = avg(dt.frontend.web.page.largest_contentful_paint),
  cls = avg(dt.frontend.web.page.cumulative_layout_shift),
  inp = avg(dt.frontend.web.page.interaction_to_next_paint),
  ttfb = avg(dt.frontend.web.navigation.time_to_first_byte),
  load_end = avg(dt.frontend.web.navigation.load_event_end)
}, ${period}, filter: {frontend.name == "${frontend}"}
| fieldsAdd lcp_avg = arrayAvg(lcp), cls_avg = arrayAvg(cls), inp_avg = arrayAvg(inp), ttfb_avg = arrayAvg(ttfb), load_avg = arrayAvg(load_end)
| fields lcp_avg, cls_avg, inp_avg, ttfb_avg, load_avg`;
}

function cwvByPageQuery(days: number, frontend: string): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter characteristics.has_page_summary == true
| fieldsAdd pageName = coalesce(view.name, page.name, url.path, "unknown")
| fieldsAdd
    lcp_ms = toDouble(web_vitals.largest_contentful_paint) / 1000000.0,
    cls_val = toDouble(web_vitals.cumulative_layout_shift),
    ttfb_ms = toDouble(web_vitals.time_to_first_byte) / 1000000.0,
    fcp_ms = toDouble(web_vitals.first_contentful_paint) / 1000000.0
| summarize
    lcp_avg = avg(lcp_ms),
    cls_avg = avg(cls_val),
    ttfb_avg = avg(ttfb_ms),
    load_avg = avg(fcp_ms),
    by: {pageName}
| sort lcp_avg desc
| limit 20`;
}

function deviceQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter ${anyStepFilter(steps)}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd satisfaction = coalesce(if(dur_ms <= ${APDEX_T}.0, "satisfied"), if(dur_ms <= ${APDEX_4T}.0, "tolerating"), "frustrated")
| fieldsAdd deviceType = device.type
| summarize actions = count(), sessions = countDistinct(dt.rum.session.id), avg_duration_ms = avg(dur_ms), satisfied = countIf(satisfaction == "satisfied"), tolerating = countIf(satisfaction == "tolerating"), frustrated = countIf(satisfaction == "frustrated"), by: {deviceType}
| sort actions desc`;
}

function browserQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter ${anyStepFilter(steps)}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd satisfaction = coalesce(if(dur_ms <= ${APDEX_T}.0, "satisfied"), if(dur_ms <= ${APDEX_4T}.0, "tolerating"), "frustrated")
| fieldsAdd browserName = browser.name
| summarize actions = count(), sessions = countDistinct(dt.rum.session.id), avg_duration_ms = avg(dur_ms), errors = countIf(characteristics.has_error == true), satisfied = countIf(satisfaction == "satisfied"), tolerating = countIf(satisfaction == "tolerating"), frustrated = countIf(satisfaction == "frustrated"), by: {browserName}
| sort actions desc
| limit 15`;
}

function geoQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter ${anyStepFilter(steps)}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd satisfaction = coalesce(if(dur_ms <= ${APDEX_T}.0, "satisfied"), if(dur_ms <= ${APDEX_4T}.0, "tolerating"), "frustrated")
| fieldsAdd country = geo.country.iso_code
| summarize actions = count(), sessions = countDistinct(dt.rum.session.id), avg_duration_ms = avg(dur_ms), errors = countIf(characteristics.has_error == true), satisfied = countIf(satisfaction == "satisfied"), tolerating = countIf(satisfaction == "tolerating"), frustrated = countIf(satisfaction == "frustrated"), by: {country}
| sort actions desc
| limit 20`;
}

function errorQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  const tagExpr = stepTagExpr(steps, steps.map((s) => s.label));
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter ${anyStepFilter(steps)}
| filter characteristics.has_error == true
| fieldsAdd step_tag = ${tagExpr}
| summarize error_count = count(), affected_sessions = countDistinct(dt.rum.session.id), by: {step_tag}
| sort error_count desc`;
}

function sessionQualityQuery(days: number, frontend: string, steps: StepDef[], prev = false): string {
  const period = periodClause(days, prev);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter ${anyStepFilter(steps)}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| summarize
    total = count(),
    sessions = countDistinct(dt.rum.session.id),
    avg_dur = avg(dur_ms),
    p50_dur = percentile(dur_ms, 50),
    p90_dur = percentile(dur_ms, 90),
    errors = countIf(characteristics.has_error == true),
    satisfied = countIf(dur_ms <= ${APDEX_T}.0),
    tolerating = countIf(dur_ms > ${APDEX_T}.0 and dur_ms <= ${APDEX_4T}.0),
    frustrated = countIf(dur_ms > ${APDEX_4T}.0)`;
}

// NEW: Worst Sessions query
function worstSessionsQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter ${anyStepFilter(steps)}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd satisfaction = coalesce(if(dur_ms <= ${APDEX_T}.0, "satisfied"), if(dur_ms <= ${APDEX_4T}.0, "tolerating"), "frustrated")
| summarize
    actions = count(),
    avg_dur = avg(dur_ms),
    max_dur = max(dur_ms),
    errors = countIf(characteristics.has_error == true),
    frustrated = countIf(satisfaction == "frustrated"),
    satisfied = countIf(satisfaction == "satisfied"),
    tolerating = countIf(satisfaction == "tolerating"),
    start_ts = min(start_time),
    by: {dt.rum.session.id}
| sort frustrated desc, errors desc, max_dur desc
| limit 25`;
}

// Exceptions query
function jsErrorsQuery(days: number, frontend: string): string {
  const period = periodClause(days);
  return `fetch user.events, samplingRatio: 1, ${period}
| filter characteristics.has_error
| filter isNotNull(error.type)
| filter isNotNull(error.id)
| fieldsAdd frontend_name = coalesce(
    entityName(dt.rum.application.entity, type: "dt.entity.application"),
    entityName(dt.rum.application.entity, type: "dt.entity.mobile_application")
  )
| filter frontend_name == "${frontend}"
| filter error.type == "exception"
| fieldsAdd errorName = error.display_name
| fieldsAdd pageName = view.name
| summarize
    occurrences = count(),
    affected_users = countDistinct(dt.rum.instance.id),
    affected_sessions = countDistinct(dt.rum.session.id),
    first_seen = min(start_time),
    last_seen = max(start_time),
    pages = collectDistinct(pageName),
    by: {error.id, errorName}
| sort occurrences desc
| limit 30`;
}

// NEW: Rage/Dead Clicks query
function clickIssuesQuery(days: number, frontend: string): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter in(event.type, "rageClick", "deadClick")
| fieldsAdd eventType = event.type
| fieldsAdd pageName = view.name
| fieldsAdd target = event.name
| summarize
    occurrences = count(),
    affected_sessions = countDistinct(dt.rum.session.id),
    by: {eventType, pageName, target}
| sort occurrences desc
| limit 30`;
}

// NEW: Geographic performance deep-dive (country + city level)
function geoPerformanceQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter ${anyStepFilter(steps)}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd satisfaction = coalesce(if(dur_ms <= ${APDEX_T}.0, "satisfied"), if(dur_ms <= ${APDEX_4T}.0, "tolerating"), "frustrated")
| fieldsAdd country = geo.country.iso_code
| fieldsAdd country_name = geo.country.name
| fieldsAdd city = geo.city.name
| fieldsAdd lcp_ms = toDouble(web_vitals.largest_contentful_paint) / 1000000.0
| fieldsAdd cls_val = toDouble(web_vitals.cumulative_layout_shift)
| fieldsAdd inp_ms = toDouble(web_vitals.interaction_to_next_paint) / 1000000.0
| summarize
    actions = count(),
    sessions = countDistinct(dt.rum.session.id),
    avg_dur = avg(dur_ms),
    p90_dur = percentile(dur_ms, 90),
    errors = countIf(characteristics.has_error == true),
    satisfied = countIf(satisfaction == "satisfied"),
    tolerating = countIf(satisfaction == "tolerating"),
    frustrated = countIf(satisfaction == "frustrated"),
    lcp_avg = avg(lcp_ms),
    cls_avg = avg(cls_val),
    inp_avg = avg(inp_ms),
    country_name = takeFirst(country_name),
    by: {country, city}
| sort actions desc
| limit 50`;
}

// NEW: Navigation paths — actual user page flows
function navigationPathsQuery(days: number, frontend: string): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter characteristics.has_navigation == true OR characteristics.has_page_summary == true
| fieldsAdd pageName = coalesce(view.name, page.name, url.path, "unknown")
| sort timestamp asc
| summarize path = collectArray(pageName), by: {dt.rum.session.id}
| fieldsAdd pathLen = arraySize(path)
| filter pathLen >= 2
| fieldsAdd step1 = path[0], step2 = path[1], step3 = if(pathLen >= 3, path[2], else: "(exit)")
| fieldsAdd transition = concat(step1, " → ", step2)
| summarize
    occurrences = count(),
    avg_depth = avg(toDouble(pathLen)),
    by: {transition, step1, step2}
| sort occurrences desc
| limit 30`;
}

// NEW: Sankey — multi-step page flow for Sankey diagram
function sankeyQuery(days: number, frontend: string): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter characteristics.has_navigation == true OR characteristics.has_page_summary == true
| fieldsAdd pageName = coalesce(view.name, page.name, url.path, "unknown")
| sort timestamp asc
| summarize path = collectArray(pageName), by: {dt.rum.session.id}
| fieldsAdd pathLen = arraySize(path)
| filter pathLen >= 2
| fieldsAdd
    s0 = path[0], s1 = path[1],
    s2 = if(pathLen >= 3, path[2], else: "(exit)"),
    s3 = if(pathLen >= 4, path[3], else: "(exit)"),
    s4 = if(pathLen >= 5, path[4], else: "(exit)")
| summarize
    sessions = count(), by: {s0, s1, s2, s3, s4}
| sort sessions desc
| limit 200`;
}

// NEW: Hourly distribution for performance budgets
function hourlyDistributionQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter ${anyStepFilter(steps)}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd hour = getHour(start_time)
| summarize
    actions = count(),
    avg_dur = avg(dur_ms),
    p90_dur = percentile(dur_ms, 90),
    errors = countIf(characteristics.has_error == true),
    satisfied = countIf(dur_ms <= ${APDEX_T}.0),
    tolerating = countIf(dur_ms > ${APDEX_T}.0 and dur_ms <= ${APDEX_4T}.0),
    frustrated = countIf(dur_ms > ${APDEX_4T}.0),
    by: {hour}
| sort hour asc`;
}

// NEW: Conversion attribution — correlate conversion with perf factors
function conversionAttributionQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  const tagExpr = stepTagExpr(steps, steps.map((_, i) => `step${i + 1}`));
  const iAnyLines = steps.map((_, i) => `    reached_step${i + 1} = iAny(steps[] == "step${i + 1}")`).join(",\n");
  const convertedConds = steps.map((_, i) => `reached_step${i + 1} == true`).join(" and ");
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter ${anyStepFilter(steps)}
| fieldsAdd step_tag = ${tagExpr}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd deviceType = device.type
| fieldsAdd browserName = browser.name
| summarize
    steps = collectDistinct(step_tag),
    avg_dur = avg(dur_ms),
    max_dur = max(dur_ms),
    errors = countIf(characteristics.has_error == true),
    actions = count(),
    by: {dt.rum.session.id, deviceType, browserName}
| fieldsAdd
${iAnyLines}
| fieldsAdd converted = if(${convertedConds}, true, else: false)
| summarize
    total_sessions = count(),
    converted_sessions = countIf(converted == true),
    avg_duration = avg(avg_dur),
    avg_max_duration = avg(max_dur),
    avg_errors = avg(toDouble(errors)),
    by: {deviceType, browserName}
| fieldsAdd conv_rate = if(total_sessions > 0, toDouble(converted_sessions) / toDouble(total_sessions) * 100.0, else: 0.0)
| sort total_sessions desc
| limit 30`;
}

// NEW: Session duration distribution for anomaly detection
function sessionDurationDistributionQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter ${anyStepFilter(steps)}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd dur_bucket = coalesce(
    if(dur_ms <= 500.0, "0-500ms"),
    if(dur_ms <= 1000.0, "500ms-1s"),
    if(dur_ms <= 2000.0, "1-2s"),
    if(dur_ms <= 3000.0, "2-3s"),
    if(dur_ms <= 5000.0, "3-5s"),
    if(dur_ms <= 10000.0, "5-10s"),
    ">10s")
| summarize
    actions = count(),
    sessions = countDistinct(dt.rum.session.id),
    avg_dur = avg(dur_ms),
    errors = countIf(characteristics.has_error == true),
    by: {dur_bucket}
| sort avg_dur asc`;
}

// ---------------------------------------------------------------------------
// Root Cause Correlation — correlate conversion drops with technical signals
// ---------------------------------------------------------------------------
function rootCauseCorrelationQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  const tagExpr = stepTagExpr(steps, steps.map((_, i) => `step${i + 1}`));
  const iAnyLines = steps.map((_, i) => `    reached_step${i + 1} = iAny(steps[] == "step${i + 1}")`).join(",\n");
  const convertedConds = steps.map((_, i) => `reached_step${i + 1} == true`).join(" and ");
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter ${anyStepFilter(steps)}
| fieldsAdd step_tag = ${tagExpr}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd hour_bucket = getHour(start_time)
| summarize
    steps = collectDistinct(step_tag),
    avg_dur = avg(dur_ms),
    max_dur = max(dur_ms),
    p90_dur = percentile(dur_ms, 90),
    errors = countIf(characteristics.has_error == true),
    actions = count(),
    by: {dt.rum.session.id, hour_bucket}
| fieldsAdd
${iAnyLines}
| fieldsAdd converted = if(${convertedConds}, true, else: false)
| summarize
    total_sessions = count(),
    converted_sessions = countIf(converted == true),
    avg_duration = avg(avg_dur),
    p90_duration = avg(p90_dur),
    error_sessions = countIf(errors > 0),
    avg_errors = avg(toDouble(errors)),
    by: {hour_bucket}
| fieldsAdd conv_rate = if(total_sessions > 0, toDouble(converted_sessions) / toDouble(total_sessions) * 100.0, else: 0.0)
| fieldsAdd error_rate = if(total_sessions > 0, toDouble(error_sessions) / toDouble(total_sessions) * 100.0, else: 0.0)
| sort hour_bucket asc`;
}

function rootCauseStepDropQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  const tagExpr = stepTagExpr(steps, steps.map((s) => s.label));
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter ${anyStepFilter(steps)}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd step_tag = ${tagExpr}
| fieldsAdd satisfaction = coalesce(
    if(dur_ms <= ${APDEX_T}.0, "satisfied"),
    if(dur_ms <= ${APDEX_4T}.0, "tolerating"),
    "frustrated")
| fieldsAdd hour_bucket = getHour(start_time)
| summarize
    actions = count(),
    avg_dur = avg(dur_ms),
    p90_dur = percentile(dur_ms, 90),
    errors = countIf(characteristics.has_error == true),
    frustrated = countIf(satisfaction == "frustrated"),
    by: {step_tag, hour_bucket}
| sort hour_bucket asc, step_tag asc`;
}

// ---------------------------------------------------------------------------
// Predictive Forecasting — trend data to project forward
// ---------------------------------------------------------------------------
function forecastBucketFormat(days: number): string {
  if (days <= 1) return "yyyy-MM-dd HH:00";
  return "yyyy-MM-dd";
}

function forecastTrendQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  const tagExpr = stepTagExpr(steps, steps.map((_, i) => `step${i + 1}`));
  const iAnyLines = steps.map((_, i) => `    reached_step${i + 1} = iAny(steps[] == "step${i + 1}")`).join(",\n");
  const convertedConds = steps.map((_, i) => `reached_step${i + 1} == true`).join(" and ");
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter ${anyStepFilter(steps)}
| fieldsAdd step_tag = ${tagExpr}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd day_bucket = formatTimestamp(start_time, format: "${forecastBucketFormat(days)}")
| summarize
    steps = collectDistinct(step_tag),
    avg_dur = avg(dur_ms),
    errors = countIf(characteristics.has_error == true),
    actions = count(),
    by: {dt.rum.session.id, day_bucket}
| fieldsAdd
${iAnyLines}
| fieldsAdd converted = if(${convertedConds}, true, else: false)
| summarize
    total_sessions = count(),
    converted_sessions = countIf(converted == true),
    avg_duration = avg(avg_dur),
    total_errors = sum(errors),
    total_actions = sum(actions),
    by: {day_bucket}
| fieldsAdd conv_rate = if(total_sessions > 0, toDouble(converted_sessions) / toDouble(total_sessions) * 100.0, else: 0.0)
| fieldsAdd error_rate = if(total_actions > 0, toDouble(total_errors) / toDouble(total_actions) * 100.0, else: 0.0)
| sort day_bucket asc`;
}

function forecastApdexTrendQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter ${anyStepFilter(steps)}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd day_bucket = formatTimestamp(start_time, format: "${forecastBucketFormat(days)}")
| summarize
    total = count(),
    satisfied = countIf(dur_ms <= ${APDEX_T}.0),
    tolerating = countIf(dur_ms > ${APDEX_T}.0 and dur_ms <= ${APDEX_4T}.0),
    frustrated = countIf(dur_ms > ${APDEX_4T}.0),
    avg_dur = avg(dur_ms),
    p90_dur = percentile(dur_ms, 90),
    by: {day_bucket}
| sort day_bucket asc`;
}

function forecastVitalsTrendQuery(days: number, frontend: string): string {
  const period = periodClause(days);
  return `timeseries {
  lcp = avg(dt.frontend.web.page.largest_contentful_paint),
  cls = avg(dt.frontend.web.page.cumulative_layout_shift),
  inp = avg(dt.frontend.web.page.interaction_to_next_paint),
  ttfb = avg(dt.frontend.web.navigation.time_to_first_byte),
  load_end = avg(dt.frontend.web.navigation.load_event_end),
  ts = start()
}, ${period}, interval: ${days <= 1 ? "1h" : "1d"}, filter: {frontend.name == "${frontend}"}
| fieldsAdd d = record(lcp_val = lcp[], cls_val = cls[], inp_val = inp[], ttfb_val = ttfb[], load_val = load_end[], ts = ts[])
| expand d
| fieldsAdd lcp_val = d[lcp_val], cls_val = d[cls_val], inp_val = d[inp_val], ttfb_val = d[ttfb_val], load_val = d[load_val], bucket_ts = d[ts]
| filterOut isNull(lcp_val) and isNull(cls_val) and isNull(inp_val) and isNull(ttfb_val) and isNull(load_val)
| sort bucket_ts asc
| fields lcp_val, cls_val, inp_val, ttfb_val, load_val`;
}

// ---------------------------------------------------------------------------
// Resource Waterfall — aggregated resource timing per funnel step
// ---------------------------------------------------------------------------
function resourceStepTagExpr(steps: StepDef[]): string {
  // Match resources to funnel steps using both page URL and resource URL.
  // In SPAs, page.url.path may always be "/" so we also check url.path (the resource's own URL).
  const parts = steps.map((s) => {
    const seg = s.identifier.split("/").filter(Boolean).pop() || "";
    const segLower = seg.toLowerCase();
    if (s.type === "view") {
      return `if(page.url.path == "${s.identifier}" or contains(lower(coalesce(page.url.path, "")), "${segLower}") or contains(lower(coalesce(url.path, "")), "${segLower}"), "${s.label}")`;
    }
    return `if(contains(lower(coalesce(page.url.path, "")), "${segLower}") or contains(lower(coalesce(url.path, "")), "${segLower}"), "${s.label}")`;
  });
  return `coalesce(\n    ${parts.join(",\n    ")},\n    "other")`;
}

const RES_TYPE_EXPR = `if(endsWith(lp, ".js"), "script",
    else: if(endsWith(lp, ".css"), "css",
    else: if(endsWith(lp, ".png") or endsWith(lp, ".jpg") or endsWith(lp, ".jpeg") or endsWith(lp, ".gif") or endsWith(lp, ".svg") or endsWith(lp, ".webp") or endsWith(lp, ".ico"), "image",
    else: if(endsWith(lp, ".woff") or endsWith(lp, ".woff2") or endsWith(lp, ".ttf") or endsWith(lp, ".eot"), "font",
    else: "xhr"))))`;

function resourceWaterfallQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  const stepTag = resourceStepTagExpr(steps);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter characteristics.has_request == true
| fieldsAdd res_dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd step_tag = ${stepTag}
| fieldsAdd lp = lower(coalesce(url.path, ""))
| fieldsAdd res_type = ${RES_TYPE_EXPR}
| fieldsAdd res_name = coalesce(url.full, url.path, "unknown")
| summarize
    count = count(),
    avg_dur = avg(res_dur_ms),
    p50_dur = percentile(res_dur_ms, 50),
    p90_dur = percentile(res_dur_ms, 90),
    p99_dur = percentile(res_dur_ms, 99),
    max_dur = max(res_dur_ms),
    total_dur = sum(res_dur_ms),
    by: {step_tag, res_type, res_name}
| sort total_dur desc
| limit 100`;
}

function resourceByStepQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  const stepTag = resourceStepTagExpr(steps);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter characteristics.has_request == true
| fieldsAdd res_dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd step_tag = ${stepTag}
| fieldsAdd lp = lower(coalesce(url.path, ""))
| fieldsAdd res_type = ${RES_TYPE_EXPR}
| summarize
    resources = count(),
    avg_dur = avg(res_dur_ms),
    p90_dur = percentile(res_dur_ms, 90),
    total_dur = sum(res_dur_ms),
    slow_count = countIf(res_dur_ms > 1000.0),
    by: {step_tag, res_type}
| sort total_dur desc`;
}

// ---------------------------------------------------------------------------
// Change Intelligence — deployment events + before/after comparison
// ---------------------------------------------------------------------------
function deploymentEventsQuery(days: number): string {
  const period = periodClause(days);
  return `fetch events, ${period}
| filter event.type == "CUSTOM_DEPLOYMENT" or event.type == "task.deployment.finished"
| fieldsAdd deploy_name = coalesce(event.name, "Deployment")
| fieldsAdd deploy_source = coalesce(source, event.source, "unknown")
| fieldsAdd deploy_version = coalesce(deployment.version, component.version, "")
| fieldsAdd deploy_stage = coalesce(deployment.stage, "")
| fieldsAdd deploy_component = coalesce(component.name, "")
| fieldsAdd deploy_service = coalesce(dt.entity.service.name, "")
| fieldsAdd deploy_desc = coalesce(event.description, "")
| fieldsAdd deploy_project = coalesce(deployment.project, "")
| fieldsAdd deploy_repo = coalesce(github.repository, "")
| fieldsAdd hour_key = formatTimestamp(timestamp, format: "yyyy-MM-dd HH:00")
| summarize
    deploy_count = count(),
    first_time = min(timestamp),
    deploy_name = takeAny(deploy_name),
    deploy_source = takeAny(deploy_source),
    deploy_version = takeAny(deploy_version),
    deploy_stage = takeAny(deploy_stage),
    deploy_component = takeAny(deploy_component),
    deploy_service = takeAny(deploy_service),
    deploy_desc = takeAny(deploy_desc),
    deploy_project = takeAny(deploy_project),
    deploy_repo = takeAny(deploy_repo),
    by: {hour_key}
| sort hour_key desc`;
}

function changeImpactQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter ${anyStepFilter(steps)}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd hour_ts = formatTimestamp(start_time, format: "yyyy-MM-dd HH:00")
| summarize
    sessions = countDistinct(dt.rum.session.id),
    actions = count(),
    avg_dur = avg(dur_ms),
    p90_dur = percentile(dur_ms, 90),
    errors = countIf(characteristics.has_error == true),
    satisfied = countIf(dur_ms <= ${APDEX_T}.0),
    tolerating = countIf(dur_ms > ${APDEX_T}.0 and dur_ms <= ${APDEX_4T}.0),
    frustrated = countIf(dur_ms > ${APDEX_4T}.0),
    by: {hour_ts}
| sort hour_ts asc`;
}

// ---------------------------------------------------------------------------
// SLO Tracker — queries
// ---------------------------------------------------------------------------
function sloApdexTrendQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter ${anyStepFilter(steps)}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd hour_key = formatTimestamp(start_time, format: "yyyy-MM-dd HH:00")
| summarize
    total = count(),
    satisfied = countIf(dur_ms <= ${APDEX_T}.0),
    tolerating = countIf(dur_ms > ${APDEX_T}.0 and dur_ms <= ${APDEX_4T}.0),
    errors = countIf(characteristics.has_error == true),
    avg_dur = avg(dur_ms),
    by: {hour_key}
| sort hour_key asc`;
}

function sloCwvTrendQuery(days: number, frontend: string): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter characteristics.has_page_summary == true
| fieldsAdd
    lcp_ms = toDouble(web_vitals.largest_contentful_paint) / 1000000.0,
    cls_val = toDouble(web_vitals.cumulative_layout_shift),
    inp_ms = toDouble(web_vitals.interaction_to_next_paint) / 1000000.0,
    ttfb_ms = toDouble(web_vitals.time_to_first_byte) / 1000000.0
| fieldsAdd bucket_key = formatTimestamp(start_time, format: "yyyy-MM-dd ${days <= 1 ? "HH:00" : ""}")
| summarize
    lcp_val = avg(lcp_ms),
    cls_val = avg(cls_val),
    inp_val = avg(inp_ms),
    ttfb_val = avg(ttfb_ms),
    by: {bucket_key}
| sort bucket_key asc`;
}

// ---------------------------------------------------------------------------
// Session Replay Spotlight — query
// ---------------------------------------------------------------------------
function sessionReplayQuery(days: number, frontend: string): string {
  const period = periodClause(days);
  return `fetch user.sessions, ${period}
| filter in(frontend.name, "${frontend}")
| filter characteristics.has_replay == true
| filter dt.rum.user_type == "real_user"
| fieldsAdd dur_s = toDouble(duration) / 1000000000.0
| fieldsAdd err = toLong(coalesce(error.count, 0))
| fieldsAdd navs = toLong(coalesce(navigation_count, 0))
| fieldsAdd interactions = toLong(coalesce(user_interaction_count, 0))
| fieldsAdd is_bounce = characteristics.is_bounce == true
| fieldsAdd has_crash = coalesce(error.has_crash, false) == true
| fieldsAdd user_tag = coalesce(dt.rum.user_tag, "")
| fieldsAdd device = coalesce(device.type, "unknown")
| fieldsAdd browser_name = coalesce(browser.name, "unknown")
| fieldsAdd country = coalesce(geo.country.iso_code, "unknown")
| fieldsAdd session_id = dt.rum.session.id
| fieldsAdd impact_score = err * 10 + if(has_crash, 50, else: 0) + if(is_bounce, 20, else: 0) + if(interactions > 10, 5, else: 0)
| sort impact_score desc
| limit 50
| fields session_id, start_time, dur_s, err, navs, interactions, is_bounce, has_crash, user_tag, device, browser_name, country, impact_score`;
}

// ---------------------------------------------------------------------------
// A/B Comparison — queries
// ---------------------------------------------------------------------------
function abSegmentQuery(days: number, frontend: string, steps: StepDef[], segmentFilter: string): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter ${anyStepFilter(steps)}
| filter ${segmentFilter}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd day_bucket = formatTimestamp(start_time, format: "yyyy-MM-dd")
| summarize
    sessions = countDistinct(dt.rum.session.id),
    actions = count(),
    avg_dur = avg(dur_ms),
    p90_dur = percentile(dur_ms, 90),
    errors = countIf(characteristics.has_error == true),
    satisfied = countIf(dur_ms <= ${APDEX_T}.0),
    tolerating = countIf(dur_ms > ${APDEX_T}.0 and dur_ms <= ${APDEX_4T}.0),
    frustrated = countIf(dur_ms > ${APDEX_4T}.0),
    by: {day_bucket}
| sort day_bucket asc`;
}

function abSegmentCwvQuery(days: number, frontend: string, segmentFilter: string): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter characteristics.has_page_summary == true
| filter ${segmentFilter}
| fieldsAdd
    lcp_ms = toDouble(web_vitals.largest_contentful_paint) / 1000000.0,
    cls_val = toDouble(web_vitals.cumulative_layout_shift),
    inp_ms = toDouble(web_vitals.interaction_to_next_paint) / 1000000.0,
    ttfb_ms = toDouble(web_vitals.time_to_first_byte) / 1000000.0
| summarize
    lcp_avg = avg(lcp_ms),
    cls_avg = avg(cls_val),
    inp_avg = avg(inp_ms),
    ttfb_avg = avg(ttfb_ms),
    page_views = count()`;
}

// ---------------------------------------------------------------------------
// Shared Components
// ---------------------------------------------------------------------------
function ApdexGauge({ score, size = 80, label }: { score: number; size?: number; label?: string }) {
  const r = size / 2 - 6;
  const circumference = Math.PI * r;
  const offset = circumference * (1 - Math.min(score, 1));
  const color = apdexClr(score);
  return (
    <div style={{ textAlign: "center" }}>
      <svg width={size} height={size / 2 + 16} viewBox={`0 0 ${size} ${size / 2 + 16}`}>
        <path d={`M ${6} ${size / 2 + 4} A ${r} ${r} 0 0 1 ${size - 6} ${size / 2 + 4}`} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" strokeLinecap="round" />
        <path d={`M ${6} ${size / 2 + 4} A ${r} ${r} 0 0 1 ${size - 6} ${size / 2 + 4}`} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 0.6s ease" }} />
        <text x={size / 2} y={size / 2} textAnchor="middle" fill={color} fontSize={size * 0.22} fontWeight="700">{score.toFixed(2)}</text>
        <text x={size / 2} y={size / 2 + 14} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={size * 0.12}>{apdexLabel(score)}</text>
      </svg>
      {label && <Text style={{ fontSize: 10, opacity: 0.6 }}>{label}</Text>}
    </div>
  );
}

function CwvCard({ label, value, unit, metric }: { label: string; value: number; unit: string; metric: keyof typeof CWV }) {
  const color = cwvClr(value, metric);
  const status = cwvLabel(value, metric);
  return (
    <div className="uj-cwv-card">
      <Text style={{ fontSize: 11, opacity: 0.6 }}>{label}</Text>
      <Heading level={3} style={{ color, margin: "4px 0 2px" }}>{metric === "cls" ? value.toFixed(3) : fmt(value)}</Heading>
      <span className="uj-cwv-badge" style={{ background: `${color}22`, color, borderColor: `${color}44` }}>{status}</span>
      <div className="uj-cwv-thresholds">
        <span style={{ color: GREEN }}>≤{metric === "cls" ? CWV[metric].good : fmt(CWV[metric].good)}</span>
        <span style={{ color: YELLOW }}>≤{metric === "cls" ? `${CWV[metric].poor}` : fmt(CWV[metric].poor)}</span>
        <span style={{ color: RED }}>&gt;{metric === "cls" ? CWV[metric].poor : fmt(CWV[metric].poor)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Smooth Funnel SVG — per-step colorized + optional compare overlay
// ---------------------------------------------------------------------------
interface FunnelStep { label: string; count: number; convFromPrev: number; overallConv: number; apdex?: number }

function FunnelChart({ steps, prevSteps, appEntityId, stepDefs }: { steps: FunnelStep[]; prevSteps?: FunnelStep[]; appEntityId?: string; stepDefs: StepDef[] }) {
  const maxCount = Math.max(1, ...steps.map((s) => s.count), ...(prevSteps ?? []).map((s) => s.count));
  const W = 720;
  const stepH = 80;
  const gap = 6;
  const H = steps.length * (stepH + gap) + 20;
  const maxBarW = 380;
  const cx = W / 2 - 30;

  const widths = steps.map((s) => Math.max((s.count / maxCount) * maxBarW, 36));
  const prevWidths = prevSteps?.map((s) => Math.max((s.count / maxCount) * maxBarW, 36));

  const stepColors = steps.map((s, i) => {
    if (i === 0) return BLUE;
    const dropPct = 100 - s.convFromPrev;
    return dropPct > 50 ? RED : dropPct > 30 ? ORANGE : dropPct > 15 ? YELLOW : GREEN;
  });

  const segPath = (ws: number[], idx: number) => {
    const y = idx * (stepH + gap) + 10;
    const w = ws[idx];
    const nextW = idx < ws.length - 1 ? ws[idx + 1] : w * 0.8;
    const tl = { x: cx - w / 2, y }; const bl = { x: cx - nextW / 2, y: y + stepH };
    const tr = { x: cx + w / 2, y }; const br = { x: cx + nextW / 2, y: y + stepH };
    const cpY = (y + y + stepH) / 2;
    return `M ${tl.x} ${tl.y} C ${tl.x} ${cpY}, ${bl.x} ${cpY}, ${bl.x} ${bl.y} L ${br.x} ${br.y} C ${br.x} ${cpY}, ${tr.x} ${cpY}, ${tr.x} ${tr.y} Z`;
  };

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="uj-funnel-svg">
      <defs>
        {steps.map((_, i) => (
          <linearGradient key={i} id={`funnelStep${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stepColors[i]} stopOpacity="0.4" />
            <stop offset="100%" stopColor={stepColors[i]} stopOpacity="0.12" />
          </linearGradient>
        ))}
      </defs>
      {/* Previous period ghost */}
      {prevSteps && prevWidths && prevWidths.map((_, i) => (
        <path key={`prev-${i}`} d={segPath(prevWidths, i)} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeDasharray="6 4" />
      ))}
      {/* Current period segments */}
      {steps.map((_, i) => (
        <path key={i} d={segPath(widths, i)} fill={`url(#funnelStep${i})`} stroke={stepColors[i]} strokeWidth="1" strokeOpacity="0.5" />
      ))}
      {/* Labels */}
      {steps.map((step, i) => {
        const y = i * (stepH + gap) + 10;
        const midY = y + stepH / 2;
        const sClr = stepColors[i];
        const color = i === 0 ? BLUE : statusClr(step.convFromPrev);
        const abandonPct = i === 0 ? 0 : 100 - step.convFromPrev;
        const prevStep = prevSteps?.[i];
        const countDelta = prevStep ? step.count - prevStep.count : 0;
        const countDeltaPct = prevStep && prevStep.count > 0 ? (countDelta / prevStep.count) * 100 : 0;

        const stepUrl = appEntityId ? vitalsUrl(appEntityId, stepDefs[i]?.identifier ?? step.label) : undefined;

        return (
          <g key={i}>
            {i > 0 && <line x1={cx - widths[i] / 2} y1={y} x2={cx + widths[i] / 2} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />}
            {stepUrl ? (
              <a href={stepUrl} target="_blank" rel="noopener noreferrer" style={{ cursor: "pointer" }}>
                <circle cx={24} cy={midY} r={13} fill={`${sClr}1A`} stroke={sClr} strokeWidth="1.5" />
                <text x={24} y={midY + 4} textAnchor="middle" fill={sClr} fontSize="12" fontWeight="700">{i + 1}</text>
                <text x={cx} y={midY - 10} textAnchor="middle" fill="rgba(255,255,255,0.95)" fontSize="14" fontWeight="600" textDecoration="underline">{step.label}</text>
                <text x={cx} y={midY + 8} textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="12">{fmtCount(step.count)} sessions</text>
                <title>Open in Vitals: {stepDefs[i]?.identifier ?? step.label}</title>
              </a>
            ) : (
              <>
                <circle cx={24} cy={midY} r={13} fill={`${sClr}1A`} stroke={sClr} strokeWidth="1.5" />
                <text x={24} y={midY + 4} textAnchor="middle" fill={sClr} fontSize="12" fontWeight="700">{i + 1}</text>
                <text x={cx} y={midY - 10} textAnchor="middle" fill="rgba(255,255,255,0.95)" fontSize="14" fontWeight="600">{step.label}</text>
                <text x={cx} y={midY + 8} textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="12">{fmtCount(step.count)} sessions</text>
              </>
            )}
            {step.apdex != null && (
              <text x={cx} y={midY + 24} textAnchor="middle" fill={apdexClr(step.apdex)} fontSize="10" fontWeight="600">Apdex: {step.apdex.toFixed(2)}</text>
            )}
            {/* Compare delta */}
            {prevStep && Math.abs(countDeltaPct) >= 0.1 && (
              <text x={cx} y={midY + 36} textAnchor="middle" fill={countDelta >= 0 ? GREEN : RED} fontSize="10" fontWeight="600">
                {countDelta >= 0 ? "\u25B2" : "\u25BC"} {Math.abs(countDeltaPct).toFixed(1)}% vs prev
              </text>
            )}
            <text x={W - 10} y={midY - 8} textAnchor="end" fill={statusClr(step.overallConv)} fontSize="12" fontWeight="600">{fmtPct(step.overallConv)}</text>
            <text x={W - 10} y={midY + 6} textAnchor="end" fill="rgba(255,255,255,0.4)" fontSize="10">overall</text>
            {i > 0 && (
              <>
                <text x={W - 10} y={midY + 22} textAnchor="end" fill={color} fontSize="10">{fmtPct(step.convFromPrev)} conv</text>
                <text x={W - 10} y={midY + 36} textAnchor="end" fill={abandonPct > 30 ? RED : YELLOW} fontSize="10">{fmtPct(abandonPct)} drop</text>
              </>
            )}
            {i > 0 && step.count < steps[i - 1].count && (
              <text x={cx + widths[i] / 2 + 14} y={y + 6} fill={RED} fontSize="10" opacity="0.7">-{fmtCount(steps[i - 1].count - step.count)}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Slider
// ---------------------------------------------------------------------------
function MultiplierSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Flex flexDirection="column" gap={8} style={{ marginBottom: 16 }}>
      <Flex gap={12} alignItems="center">
        <Strong>Traffic Multiplier:</Strong>
        <Strong style={{ color: BLUE, fontSize: 18 }}>{value}x</Strong>
      </Flex>
      <input type="range" min={0} max={TRAFFIC_MULTIPLIERS.length - 1} value={TRAFFIC_MULTIPLIERS.indexOf(value)} onChange={(e) => onChange(TRAFFIC_MULTIPLIERS[Number(e.target.value)])} className="uj-slider" />
      <div style={{ position: "relative", width: "100%", height: 18 }}>
        {TRAFFIC_MULTIPLIERS.map((v, i) => (
          <span key={v} style={{ position: "absolute", left: `${(i / (TRAFFIC_MULTIPLIERS.length - 1)) * 100}%`, transform: "translateX(-50%)", fontSize: 10, color: v === value ? BLUE : "rgba(255,255,255,0.35)", fontWeight: v === value ? 700 : 400 }}>{v}x</span>
        ))}
      </div>
    </Flex>
  );
}

// ---------------------------------------------------------------------------
// Help Section
// ---------------------------------------------------------------------------
function HelpSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 20 }}><Heading level={5} style={{ marginBottom: 8 }}>{title}</Heading>{children}</div>;
}

function HelpContent({ frontend, steps }: { frontend: string; steps: StepDef[] }) {
  return (
    <div style={{ padding: "4px 0" }}>
      <HelpSection title="Overview">
        <Paragraph>The <Strong>User Journey</Strong> app provides comprehensive frontend observability for <Strong>{frontend}</Strong>. It tracks users through a {steps.length}-step conversion funnel using real-time DQL queries against Dynatrace Grail. The funnel is <Strong>strict sequential</Strong>: each step requires all previous steps.</Paragraph>
      </HelpSection>
      <HelpSection title="Funnel Steps">
        <div style={{ margin: "12px 0", padding: "12px 16px", background: "rgba(69,137,255,0.08)", borderRadius: 8 }}>
          {steps.map((step, i) => (
            <Paragraph key={i}><Strong>Step {i + 1} — {step.label}</Strong> ({step.type === "view" ? "view" : "XHR"}: {step.identifier}): {i === 0 ? "Entry point." : `Requires Step${i > 1 ? "s" : ""} 1${i > 1 ? `-${i}` : ""}.`}</Paragraph>
          ))}
        </div>
        <Paragraph style={{ fontSize: 11, opacity: 0.6, marginTop: 8 }}>Steps are configurable via Settings (⚙). Min {MIN_STEPS}, max {MAX_STEPS} steps.</Paragraph>
      </HelpSection>
      <HelpSection title="Tabs">
        <Paragraph><Strong>Funnel Overview</Strong>: KPIs, colorized funnel (color by drop-off severity), per-step Apdex, and step analysis table. Toggle <Strong>Compare</Strong> to overlay the previous period as dashed outlines and see ▲▼ deltas on each step.</Paragraph>
        <Paragraph><Strong>Trends</Strong>: Period-over-period comparison of all key metrics. Shows current vs. previous period with delta arrows — green for improvement, red for regression. Inverted logic for duration/errors (lower = better).</Paragraph>
        <Paragraph><Strong>Web Vitals</Strong>: Core Web Vitals gauges (LCP, CLS, INP, TTFB), page-level CWV breakdown, and performance health score.</Paragraph>
        <Paragraph><Strong>Step Details</Strong>: Per-step deep dive with Apdex gauges, satisfaction breakdown bars, and duration percentiles (P50/P90/P99).</Paragraph>
        <Paragraph><Strong>Worst Sessions</Strong>: Surfaces the worst-performing sessions ranked by frustrated actions, errors, and slowness. Each session links directly to <Strong>Dynatrace Session Replay</Strong> for instant root-cause analysis.</Paragraph>
        <Paragraph><Strong>Exceptions</Strong>: JavaScript exceptions grouped by error name. Shows occurrences, affected sessions, error velocity (new vs. recurring), and impacted pages. Helps prioritize which errors to fix first.</Paragraph>
        <Paragraph><Strong>Click Issues</Strong>: Detects rage clicks (rapid repeated clicks indicating frustration) and dead clicks (clicks on non-responsive elements). Shows the worst offending elements, pages, and session impact to guide UX fixes.</Paragraph>
        <Paragraph><Strong>Perf Budgets</Strong>: Tracks actual metrics against defined performance budgets (Apdex ≥0.85, Conversion ≥20%, Avg Duration ≤2s, P90 ≤4s, Error Rate ≤2%, Frustrated ≤10%). Shows pass/fail status, margin from target, and hourly Apdex distribution to identify peak-hour degradation.</Paragraph>
        <Paragraph><Strong>Geo Heatmap</Strong>: Country and city-level performance with Apdex color-coding and satisfaction bars. Identifies regions with poor user experience for targeted CDN placement or infrastructure optimization. Includes city-level drill-down for granular insights. Country cards are clickable and open <Strong>User Sessions</Strong> filtered to that location.</Paragraph>
        <Paragraph><Strong>Map</Strong>: Interactive choropleth map with World and US views, colorized by session count, average duration, Apdex, or error rate. Use the dropdown to switch between World (country-level) and US (state-level) views. Countries/states with data are clickable and link to <Strong>User Sessions</Strong>.</Paragraph>
        <Paragraph><Strong>Navigation Paths</Strong>: Shows actual user navigation flows (not just the expected funnel). Reveals unexpected paths, loops, and exit points. Flow visualization groups transitions by source page, highlighting funnel-aligned vs. off-path navigation. Page names are clickable and open the <Strong>Vitals</Strong> app for detailed analysis.</Paragraph>
        <Paragraph><Strong>Sankey</Strong>: Interactive Sankey flow diagram showing user navigation paths. Click any node to see inbound/outbound connections. Inbound and outbound user actions in the popup are clickable — they open the <Strong>Vitals</Strong> app filtered to that specific page for detailed performance analysis.</Paragraph>
        <Paragraph><Strong>Anomaly Detection</Strong>: Flags metrics with significant deviation from baseline (previous period). Shows stability score, per-metric severity (normal/medium/high/critical), per-step traffic anomalies, and a duration distribution histogram. Includes automated diagnosis with actionable recommendations.</Paragraph>
        <Paragraph><Strong>Conversion Attribution</Strong>: Correlates conversion rates with performance factors. Shows how session speed, device type, and browser affect conversion. Speed buckets (fast/medium/slow) quantify the revenue impact of performance, with full device Ã— browser cross-section.</Paragraph>
        <Paragraph><Strong>Executive Summary</Strong>: Report-card style overview for stakeholders. Weighted letter grade (A-F), key metric trends, funnel summary, bottleneck alert, CWV snapshot, and full performance table. Use <Strong>Export PDF</Strong> to open a print-ready report in a new tab (use browser Print → Save as PDF), or <Strong>Copy Text</Strong> to get a plain-text summary for Slack/Teams/email. Designed for quick status checks and executive presentations.</Paragraph>
        <Paragraph><Strong>Segmentation</Strong>: Device, browser, and geo breakdowns with Apdex per segment.</Paragraph>
        <Paragraph><Strong>Errors &amp; Drop-offs</Strong>: Drop-off analysis between funnel steps with optimization recommendations.</Paragraph>
        <Paragraph><Strong>What-If Analysis</Strong>: Traffic impact modeling with projected Apdex, latency, and conversion degradation.</Paragraph>
        <Paragraph><Strong>Root Cause Correlation</Strong>: Automatically correlates conversion drops with technical signals — latency spikes, error surges, and frustrated sessions — on an hourly timeline. Identifies which funnel steps degrade at the exact hours conversion dips. Surfaces ranked root cause signals with severity and confidence scores so you can pinpoint the technical driver behind every conversion drop without manual cross-referencing.</Paragraph>
        <Paragraph><Strong>Predictive Forecasting</Strong>: Uses trend data from the selected timeframe to project Apdex, conversion rate, error rate, and average duration forward 7 days via linear regression. Flags when a metric is on trajectory to breach a performance budget threshold before it actually happens. Includes trend direction, rate of change, and days-to-breach estimates for proactive incident prevention.</Paragraph>
        <Paragraph><Strong>Resource Waterfall</Strong>: Aggregated resource timing per funnel step — third-party scripts, XHR/Fetch calls, images, CSS, and fonts. Shows which specific resources drag down LCP and increase page weight. Includes per-step resource type breakdown, top slow resources ranked by total time, and a visual waterfall bar chart showing P50/P90/Max latency ranges. Helps identify CDN misses, unoptimized images, and slow third-party scripts.</Paragraph>
        <Paragraph><Strong>Change Intelligence</Strong>: Pulls deployment events from Dynatrace and overlays them on an hourly performance timeline. Automatically compares metrics in the window before and after each deployment to detect regressions. Shows before/after Apdex, duration, error rate, and frustrated % with severity classification. Use to validate whether a deploy caused a performance regression or improvement.</Paragraph>
        <Paragraph><Strong>SLO Tracker</Strong>: Define Service Level Objectives for Apdex, error rate, LCP, CLS, INP, and TTFB with configurable targets. Tracks error budget burn-down over the selected timeframe with hourly granularity. Shows remaining budget %, burn rate (budget consumed per hour), and projected time to exhaustion. Color-coded status indicators flag SLOs at risk before they breach — enabling proactive SRE practices.</Paragraph>
        <Paragraph><Strong>Session Replay Spotlight</Strong>: Surfaces the highest-impact session replays ranked by an impact score combining errors, crashes, bounces, and interaction density. Shows session duration, error count, device, browser, and country. Each session links directly to <Strong>Dynatrace Session Replay</Strong> for instant visual debugging. Quickly find the sessions that matter most without manually searching.</Paragraph>
        <Paragraph><Strong>A/B Comparison</Strong>: Compare two user segments side-by-side across all key metrics. Pre-built segments for Desktop vs. Mobile, Chrome vs. Firefox, and US vs. non-US — or enter custom DQL filter expressions. Shows Apdex, conversion, error rate, duration, and Core Web Vitals for each segment with delta indicators highlighting which segment performs better. Use to quantify platform-specific gaps and prioritize optimization efforts.</Paragraph>
      </HelpSection>
      <HelpSection title="Tab Settings">
        <Paragraph>Click the <Strong>gear icon</Strong> (⚙) next to the help button to open Tab Settings. Each of the 25 tabs can be toggled on or off individually. Drag to reorder. Settings are saved per user via Dynatrace App State — they persist across sessions and browser refreshes. All tabs default to visible. Hiding a tab does not affect data collection, only display.</Paragraph>
      </HelpSection>
      <HelpSection title="Apdex Score">
        <Paragraph>Apdex = (satisfied + tolerating/2) / total. Thresholds: <Strong>Satisfied ≤ {APDEX_T / 1000}s</Strong>, <Strong>Tolerating ≤ {APDEX_4T / 1000}s</Strong>, <Strong>Frustrated &gt; {APDEX_4T / 1000}s</Strong>. Ranges: ≥0.85 Excellent, ≥0.7 Good, ≥0.5 Fair, &lt;0.5 Poor.</Paragraph>
      </HelpSection>
      <HelpSection title="Core Web Vitals">
        <Paragraph><Strong>LCP</Strong> (good ≤2.5s), <Strong>CLS</Strong> (good ≤0.1), <Strong>INP</Strong> (good ≤200ms), <Strong>TTFB</Strong> (good ≤800ms).</Paragraph>
      </HelpSection>
      <HelpSection title="Tips">
        <Paragraph>• Use 2-hour timeframe for live monitoring, 7+ days for trends.</Paragraph>
        <Paragraph>• In Trends tab, period-over-period shows regression alerts early.</Paragraph>
        <Paragraph>• Click Replay links in Worst Sessions for visual session playback.</Paragraph>
        <Paragraph>• Exceptions with high "Affected Sessions" are top priority fixes.</Paragraph>
        <Paragraph>• Toggle Compare on the funnel to spot conversion changes instantly.</Paragraph>
        <Paragraph>• Check Perf Budgets daily to catch regressions before they impact users.</Paragraph>
        <Paragraph>• Use Geo Heatmap to justify CDN edge locations in underperforming regions.</Paragraph>
        <Paragraph>• Navigation Paths reveals where users actually go vs. the intended funnel.</Paragraph>
        <Paragraph>• Anomaly Detection flags metrics that deviate significantly from baseline — check after every release.</Paragraph>
        <Paragraph>• Conversion Attribution reveals the business impact of slow pages per device/browser.</Paragraph>
        <Paragraph>• Share Executive Summary with stakeholders for quick performance status updates.</Paragraph>
        <Paragraph>• Root Cause Correlation pinpoints the exact hour and technical signal behind conversion drops — check after every deployment.</Paragraph>
        <Paragraph>• Predictive Forecasting projects trends forward — longer timeframes provide more data points for reliable forecasts. Check daily to catch budget breaches before they happen.</Paragraph>
        <Paragraph>• Resource Waterfall identifies slow third-party scripts and resources per funnel step — prioritize optimizing the highest total-time resources.</Paragraph>
        <Paragraph>• Change Intelligence shows before/after metrics around every deployment — check it after every release to catch regressions early.</Paragraph>
        <Paragraph>• SLO Tracker provides SRE-grade error budget tracking — set realistic targets and monitor burn rate to avoid SLO breaches.</Paragraph>
        <Paragraph>• Session Replay Spotlight surfaces the highest-impact sessions — start debugging with the sessions that affect the most users.</Paragraph>
        <Paragraph>• A/B Comparison quantifies platform gaps — use it to justify mobile optimization investments with data.</Paragraph>
      </HelpSection>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 16, marginTop: 8 }}>
        <Paragraph><Link href="https://github.com/TechShady/user-journey-app" target="_blank" rel="noopener noreferrer">GitHub Repository</Link></Paragraph>
      </div>
    </div>
  );
}

// ===========================================================================
// MAIN COMPONENT
// ===========================================================================
export function UserJourney() {
  const [timeframeDays, setTimeframeDays] = useState<number>(DEFAULT_TIMEFRAME);
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [tabVisibility, setTabVisibility] = useState<Record<TabKey, boolean>>(DEFAULT_TAB_VISIBILITY);
  const [tabOrder, setTabOrder] = useState<TabKey[]>([...DEFAULT_TAB_ORDER]);
  const [draggedTabIdx, setDraggedTabIdx] = useState<number | null>(null);
  const [frontend, setFrontend] = useState<string>(DEFAULT_FRONTEND);
  const [steps, setSteps] = useState<StepDef[]>(DEFAULT_FUNNEL_STEPS);
  const [sankeyStyle, setSankeyStyle] = useState<SankeyStyle>(DEFAULT_SANKEY_STYLE);

  // Persist tab visibility per user
  const savedState = useUserAppState({ key: TAB_STATE_KEY });
  const savedTabOrder = useUserAppState({ key: TAB_ORDER_STATE_KEY });
  const savedFrontend = useUserAppState({ key: FRONTEND_STATE_KEY });
  const savedSteps = useUserAppState({ key: STEPS_STATE_KEY });
  const savedSankeyStyle = useUserAppState({ key: SANKEY_STYLE_STATE_KEY });
  const savedMapView = useUserAppState({ key: MAP_VIEW_STATE_KEY });
  const { execute: saveState } = useSetUserAppState();

  useEffect(() => {
    if (savedState.data?.value) {
      try {
        const parsed = JSON.parse(savedState.data.value as string);
        setTabVisibility(prev => ({ ...prev, ...parsed }));
      } catch { /* ignore parse errors */ }
    }
  }, [savedState.data]);

  useEffect(() => {
    if (savedTabOrder.data?.value) {
      try {
        const parsed = JSON.parse(savedTabOrder.data.value as string) as string[];
        if (Array.isArray(parsed) && parsed.length) {
          // Merge: use saved order but add any new tabs appended to TAB_KEYS
          const validKeys = new Set<string>(TAB_KEYS);
          const ordered = parsed.filter(k => validKeys.has(k)) as TabKey[];
          const missing = DEFAULT_TAB_ORDER.filter(k => !ordered.includes(k));
          setTabOrder([...ordered, ...missing]);
        }
      } catch { /* ignore */ }
    }
  }, [savedTabOrder.data]);

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
    if (savedSankeyStyle.data?.value) {
      const val = savedSankeyStyle.data.value as string;
      if (SANKEY_STYLE_OPTIONS.some(o => o.value === val)) setSankeyStyle(val as SankeyStyle);
    }
  }, [savedSankeyStyle.data]);

  const [mapViewDefault, setMapViewDefault] = useState<MapViewSetting>(DEFAULT_MAP_VIEW);
  useEffect(() => {
    if (savedMapView.data?.value) {
      const val = savedMapView.data.value as string;
      if (MAP_VIEW_OPTIONS.some(o => o.value === val)) setMapViewDefault(val as MapViewSetting);
    }
  }, [savedMapView.data]);

  const toggleTab = (tab: TabKey) => {
    setTabVisibility(prev => {
      const next = { ...prev, [tab]: !prev[tab] };
      saveState({ key: TAB_STATE_KEY, body: { value: JSON.stringify(next) } });
      return next;
    });
  };

  const isTabVisible = (tab: TabKey) => tabVisibility[tab] !== false;

  const handleTabDragOver = (idx: number) => {
    if (draggedTabIdx === null || draggedTabIdx === idx) return;
    const updated = [...tabOrder];
    const [moved] = updated.splice(draggedTabIdx, 1);
    updated.splice(idx, 0, moved);
    setTabOrder(updated);
    setDraggedTabIdx(idx);
  };

  const saveTabOrder = (order: TabKey[]) => {
    setTabOrder(order);
    saveState({ key: TAB_ORDER_STATE_KEY, body: { value: JSON.stringify(order) } });
  };

  // Current period queries
  const funnelResult = useDql({ query: sessionFlowQuery(timeframeDays, frontend, steps) });
  const stepMetrics = useDql({ query: stepMetricsQuery(timeframeDays, frontend, steps) });
  const cwvResult = useDql({ query: cwvQuery(timeframeDays, frontend) });
  const cwvByPage = useDql({ query: cwvByPageQuery(timeframeDays, frontend) });
  const deviceData = useDql({ query: deviceQuery(timeframeDays, frontend, steps) });
  const browserData = useDql({ query: browserQuery(timeframeDays, frontend, steps) });
  const geoData = useDql({ query: geoQuery(timeframeDays, frontend, steps) });
  const errorData = useDql({ query: errorQuery(timeframeDays, frontend, steps) });
  const qualityData = useDql({ query: sessionQualityQuery(timeframeDays, frontend, steps) });

  // Previous period queries (for Trends + Funnel Compare)
  const funnelResultPrev = useDql({ query: sessionFlowQuery(timeframeDays, frontend, steps, true) });
  const qualityDataPrev = useDql({ query: sessionQualityQuery(timeframeDays, frontend, steps, true) });

  // NEW: Worst Sessions + Exceptions
  const worstSessionsData = useDql({ query: worstSessionsQuery(timeframeDays, frontend, steps) });
  const jsErrorsData = useDql({ query: jsErrorsQuery(timeframeDays, frontend) });

  // NEW: Rage/Dead Clicks
  const clickIssuesData = useDql({ query: clickIssuesQuery(timeframeDays, frontend) });

  // NEW: Geo Performance, Navigation Paths, Hourly Distribution
  const geoPerformanceData = useDql({ query: geoPerformanceQuery(timeframeDays, frontend, steps) });
  const navigationPathsData = useDql({ query: navigationPathsQuery(timeframeDays, frontend) });
  const sankeyData = useDql({ query: sankeyQuery(timeframeDays, frontend) });
  const appEntityData = useDql({ query: appEntityQuery(frontend) });
  const appEntityId = (appEntityData.data?.records?.[0] as any)?.['id'] ?? '';
  const hourlyDistributionData = useDql({ query: hourlyDistributionQuery(timeframeDays, frontend, steps) });

  // NEW: Conversion Attribution, Duration Distribution
  const conversionAttributionData = useDql({ query: conversionAttributionQuery(timeframeDays, frontend, steps) });
  const durationDistributionData = useDql({ query: sessionDurationDistributionQuery(timeframeDays, frontend, steps) });

  // NEW: Root Cause Correlation
  const rootCauseCorrelationData = useDql({ query: rootCauseCorrelationQuery(timeframeDays, frontend, steps) });
  const rootCauseStepDropData = useDql({ query: rootCauseStepDropQuery(timeframeDays, frontend, steps) });

  // NEW: Predictive Forecasting
  const forecastTrendData = useDql({ query: forecastTrendQuery(timeframeDays, frontend, steps) });
  const forecastApdexTrendData = useDql({ query: forecastApdexTrendQuery(timeframeDays, frontend, steps) });
  const forecastVitalsTrendData = useDql({ query: forecastVitalsTrendQuery(timeframeDays, frontend) });

  // NEW: Resource Waterfall
  const resourceWaterfallData = useDql({ query: resourceWaterfallQuery(timeframeDays, frontend, steps) });
  const resourceByStepData = useDql({ query: resourceByStepQuery(timeframeDays, frontend, steps) });

  // NEW: Change Intelligence
  const deploymentEventsData = useDql({ query: deploymentEventsQuery(timeframeDays) });
  const changeImpactData = useDql({ query: changeImpactQuery(timeframeDays, frontend, steps) });

  // NEW: SLO Tracker
  const sloApdexTrendData = useDql({ query: sloApdexTrendQuery(timeframeDays, frontend, steps) });
  const sloCwvTrendData = useDql({ query: sloCwvTrendQuery(timeframeDays, frontend) });

  // NEW: Session Replay Spotlight
  const sessionReplayData = useDql({ query: sessionReplayQuery(timeframeDays, frontend) });

  // NEW: A/B Comparison (state-driven segments)
  const [abDimension, setAbDimension] = useState<"device" | "browser" | "country" | "custom">("device");
  const [abSegA, setAbSegA] = useState('device.type == "desktop"');
  const [abSegB, setAbSegB] = useState('device.type == "mobile"');
  const abSegAData = useDql({ query: abSegmentQuery(timeframeDays, frontend, steps, abSegA) });
  const abSegBData = useDql({ query: abSegmentQuery(timeframeDays, frontend, steps, abSegB) });
  const abSegACwv = useDql({ query: abSegmentCwvQuery(timeframeDays, frontend, abSegA) });
  const abSegBCwv = useDql({ query: abSegmentCwvQuery(timeframeDays, frontend, abSegB) });

  // Parse funnel
  const parseFunnel = (result: any) => {
    const r = result?.data?.records?.[0] as any;
    if (!r) return steps.map(() => 0);
    return steps.map((_, i) => Number(r[`at_step${i + 1}`] ?? 0));
  };
  const funnelCounts = useMemo(() => parseFunnel(funnelResult), [funnelResult.data, steps]);
  const funnelCountsPrev = useMemo(() => parseFunnel(funnelResultPrev), [funnelResultPrev.data, steps]);

  // Parse step metrics
  const stepMap = useMemo(() => {
    const m = new Map<string, any>();
    (stepMetrics.data?.records ?? []).forEach((r: any) => { if (r?.step_tag) m.set(r.step_tag, r); });
    return m;
  }, [stepMetrics.data]);

  // Parse CWV
  const cwv = useMemo(() => {
    const r = cwvResult.data?.records?.[0] as any;
    if (!r) return { lcp: 0, cls: 0, inp: 0, ttfb: 0, load: 0 };
    return { lcp: Number(r.lcp_avg ?? 0), cls: Number(r.cls_avg ?? 0), inp: Number(r.inp_avg ?? 0), ttfb: Number(r.ttfb_avg ?? 0), load: Number(r.load_avg ?? 0) };
  }, [cwvResult.data]);

  // Parse quality (current + prev)
  const parseQuality = (result: any) => {
    const r = result?.data?.records?.[0] as any;
    if (!r) return { total: 0, sessions: 0, avg: 0, p50: 0, p90: 0, errors: 0, satisfied: 0, tolerating: 0, frustrated: 0 };
    return { total: Number(r.total ?? 0), sessions: Number(r.sessions ?? 0), avg: Number(r.avg_dur ?? 0), p50: Number(r.p50_dur ?? 0), p90: Number(r.p90_dur ?? 0), errors: Number(r.errors ?? 0), satisfied: Number(r.satisfied ?? 0), tolerating: Number(r.tolerating ?? 0), frustrated: Number(r.frustrated ?? 0) };
  };
  const quality = useMemo(() => parseQuality(qualityData), [qualityData.data]);
  const qualityPrev = useMemo(() => parseQuality(qualityDataPrev), [qualityDataPrev.data]);

  const overallApdex = calcApdex(quality.satisfied, quality.tolerating, quality.total);
  const overallApdexPrev = calcApdex(qualityPrev.satisfied, qualityPrev.tolerating, qualityPrev.total);
  const lastIdx = steps.length - 1;
  const overallConv = funnelCounts[0] > 0 ? (funnelCounts[lastIdx] / funnelCounts[0]) * 100 : 0;
  const overallConvPrev = funnelCountsPrev[0] > 0 ? (funnelCountsPrev[lastIdx] / funnelCountsPrev[0]) * 100 : 0;
  const isLoading = funnelResult.isLoading || stepMetrics.isLoading;

  return (
    <div className="uj-container">
      {/* Header */}
      <div className="uj-header">
        <Flex alignItems="center" gap={16}>
          <div className="uj-logo">
            <svg width="32" height="32" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="14" fill="none" stroke={BLUE} strokeWidth="2" />
              <path d="M10 20 L16 10 L22 20" fill="none" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="16" cy="22" r="2" fill={BLUE} />
            </svg>
          </div>
          <div>
            <Heading level={3} style={{ margin: 0 }}>User Journey</Heading>
            <Text style={{ fontSize: 12, opacity: 0.6 }}>{frontend}</Text>
          </div>
        </Flex>
        <Flex alignItems="center" gap={12}>
          <Strong style={{ fontSize: 12 }}>Timeframe</Strong>
          <Select value={timeframeDays} onChange={(val) => { if (val != null) setTimeframeDays(val as number); }}>
            <Select.Content>
              {TIMEFRAME_OPTIONS.map((o) => <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>)}
            </Select.Content>
          </Select>
          <button onClick={() => setShowHelp(true)} className="uj-help-btn" title="Help"><svg width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="10" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" /><text x="11" y="15.5" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="14" fontWeight="700">?</text></svg></button>
          <button onClick={() => setShowSettings(true)} className="uj-help-btn" title="Settings" style={{ marginLeft: 4 }}><svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="10" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" /><path d="M11 7v1.5M11 13.5V15M7 11h1.5M13.5 11H15M8.5 8.5l1 1M12.5 12.5l1 1M13.5 8.5l-1 1M9.5 12.5l-1 1" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" /><circle cx="11" cy="11" r="2" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" /></svg></button>
        </Flex>
      </div>
      <Sheet title="User Journey — Help & Documentation" show={showHelp} onDismiss={() => setShowHelp(false)} actions={<Button variant="emphasized" onClick={() => setShowHelp(false)}>Close</Button>}><HelpContent frontend={frontend} steps={steps} /></Sheet>
      <Sheet title="Settings" show={showSettings} onDismiss={() => setShowSettings(false)} actions={<Button variant="emphasized" onClick={() => setShowSettings(false)}>Close</Button>}>
        <div style={{ padding: "4px 0" }}>
          {/* Frontend Application Name */}
          <Paragraph style={{ marginBottom: 4, fontWeight: 600 }}>Frontend Application</Paragraph>
          <Paragraph style={{ marginBottom: 8, opacity: 0.6, fontSize: 12 }}>The Dynatrace frontend application name to monitor. Changes take effect immediately.</Paragraph>
          <div style={{ marginBottom: 20 }}>
            <TextInput
              value={frontend}
              onChange={(val) => {
                const v = (val ?? "").trim();
                if (v) {
                  setFrontend(v);
                  saveState({ key: FRONTEND_STATE_KEY, body: { value: v } });
                }
              }}
              placeholder="e.g. www.angular.easytravel.com"
            />
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginBottom: 12 }} />
          {/* Funnel Steps */}
          <Paragraph style={{ marginBottom: 4, fontWeight: 600 }}>Funnel Steps</Paragraph>
          <Paragraph style={{ marginBottom: 12, opacity: 0.6, fontSize: 12 }}>Define the user journey steps (min {MIN_STEPS}, max {MAX_STEPS}). Each step needs a label, URL path/identifier, and type (view or request). Changes are saved per user.</Paragraph>
          {steps.map((step, i) => (
            <div key={i} style={{ marginBottom: 12, padding: "10px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
              <Flex alignItems="center" justifyContent="space-between" style={{ marginBottom: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: 700, color: BLUE }}>Step {i + 1}</Text>
                {steps.length > MIN_STEPS && (
                  <button onClick={() => { const next = steps.filter((_, j) => j !== i); setSteps(next); saveState({ key: STEPS_STATE_KEY, body: { value: JSON.stringify(next) } }); }} style={{ background: "none", border: "none", color: RED, cursor: "pointer", fontSize: 12, padding: "2px 6px" }}>✕ Remove</button>
                )}
              </Flex>
              <Flex gap={8} style={{ marginBottom: 6 }}>
                <div style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10, opacity: 0.5, display: "block", marginBottom: 2 }}>Label</Text>
                  <TextInput value={step.label} onChange={(val) => { const next = [...steps]; next[i] = { ...next[i], label: val ?? "" }; setSteps(next); saveState({ key: STEPS_STATE_KEY, body: { value: JSON.stringify(next) } }); }} placeholder="e.g. Home Page" />
                </div>
                <div style={{ flex: 2 }}>
                  <Text style={{ fontSize: 10, opacity: 0.5, display: "block", marginBottom: 2 }}>Path / Identifier</Text>
                  <TextInput value={step.identifier} onChange={(val) => { const next = [...steps]; next[i] = { ...next[i], identifier: val ?? "" }; setSteps(next); saveState({ key: STEPS_STATE_KEY, body: { value: JSON.stringify(next) } }); }} placeholder="e.g. /easytravel/home" />
                </div>
                <div style={{ minWidth: 100 }}>
                  <Text style={{ fontSize: 10, opacity: 0.5, display: "block", marginBottom: 2 }}>Type</Text>
                  <Select value={step.type} onChange={(val) => { const next = [...steps]; next[i] = { ...next[i], type: (val ?? "view") as "view" | "request" }; setSteps(next); saveState({ key: STEPS_STATE_KEY, body: { value: JSON.stringify(next) } }); }}>
                    <Select.Trigger style={{ minWidth: 90 }} />
                    <Select.Content>
                      <Select.Option value="view">View</Select.Option>
                      <Select.Option value="request">Request</Select.Option>
                    </Select.Content>
                  </Select>
                </div>
              </Flex>
            </div>
          ))}
          {steps.length < MAX_STEPS && (
            <button onClick={() => { const next = [...steps, { label: "", identifier: "", type: "view" as const }]; setSteps(next); saveState({ key: STEPS_STATE_KEY, body: { value: JSON.stringify(next) } }); }} style={{ width: "100%", padding: "8px", background: "rgba(69,137,255,0.1)", border: "1px dashed rgba(69,137,255,0.3)", borderRadius: 6, color: BLUE, cursor: "pointer", fontSize: 12, marginBottom: 16 }}>+ Add Step</button>
          )}
          <button onClick={() => { setSteps(DEFAULT_FUNNEL_STEPS); saveState({ key: STEPS_STATE_KEY, body: { value: JSON.stringify(DEFAULT_FUNNEL_STEPS) } }); }} style={{ width: "100%", padding: "6px", background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 11, marginBottom: 16 }}>Reset to Defaults</button>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginBottom: 12 }} />
          {/* Default Sankey Chart Style */}
          <Paragraph style={{ marginBottom: 4, fontWeight: 600 }}>Default Sankey Chart Style</Paragraph>
          <Paragraph style={{ marginBottom: 8, opacity: 0.6, fontSize: 12 }}>Choose the default visualization style for the Sankey tab. Can also be changed inline on the Sankey tab.</Paragraph>
          <div style={{ marginBottom: 20 }}>
            <Select value={sankeyStyle} onChange={(val) => { if (val) { setSankeyStyle(val as SankeyStyle); saveState({ key: SANKEY_STYLE_STATE_KEY, body: { value: val as string } }); } }}>
              <Select.Trigger style={{ minWidth: 200 }} />
              <Select.Content>
                {SANKEY_STYLE_OPTIONS.map(o => <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>)}
              </Select.Content>
            </Select>
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginBottom: 12 }} />
          {/* Default Map View */}
          <Paragraph style={{ marginBottom: 4, fontWeight: 600 }}>Default Map View</Paragraph>
          <Paragraph style={{ marginBottom: 8, opacity: 0.6, fontSize: 12 }}>Choose the default map view for the Map tab. Can also be changed inline.</Paragraph>
          <div style={{ marginBottom: 20 }}>
            <Select value={mapViewDefault} onChange={(val) => { if (val) { setMapViewDefault(val as MapViewSetting); saveState({ key: MAP_VIEW_STATE_KEY, body: { value: val as string } }); } }}>
              <Select.Trigger style={{ minWidth: 200 }} />
              <Select.Content>
                {MAP_VIEW_OPTIONS.map(o => <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>)}
              </Select.Content>
            </Select>
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginBottom: 12 }} />
          <Paragraph style={{ marginBottom: 4, fontWeight: 600 }}>Tab Order & Visibility</Paragraph>
          <Paragraph style={{ marginBottom: 12, opacity: 0.6, fontSize: 12 }}>Drag to reorder tabs and toggle visibility. Changes are saved per user and persist across sessions.</Paragraph>
          {tabOrder.map((tab, idx) => (
            <div
              key={tab}
              draggable
              onDragStart={() => setDraggedTabIdx(idx)}
              onDragOver={(e) => { e.preventDefault(); handleTabDragOver(idx); }}
              onDragEnd={() => { setDraggedTabIdx(null); saveTabOrder(tabOrder); }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.06)",
                background: draggedTabIdx === idx ? "rgba(69,137,255,0.12)" : "transparent",
                cursor: "grab", transition: "background 0.15s ease",
              }}
            >
              <Flex alignItems="center" gap={8}>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 14, userSelect: "none" }}>{"\u2630"}</span>
                <Text style={{ fontSize: 13 }}>{tab}</Text>
              </Flex>
              <Switch value={tabVisibility[tab] !== false} onChange={() => toggleTab(tab)} />
            </div>
          ))}
          <button onClick={() => { saveTabOrder([...DEFAULT_TAB_ORDER]); }} style={{ width: "100%", padding: "6px", background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 11, marginTop: 8 }}>Reset Tab Order</button>
        </div>
      </Sheet>

      {/* Tabs — rendered in user-defined tabOrder */}
      <Tabs defaultIndex={0}>
        {tabOrder.filter(t => isTabVisible(t)).map(tabId => {
          let content: React.ReactNode = null;
          switch (tabId) {
            case "Funnel Overview": content = <FunnelOverviewTab funnelCounts={funnelCounts} funnelCountsPrev={funnelCountsPrev} overallConv={overallConv} overallApdex={overallApdex} stepMap={stepMap} quality={quality} compareMode={compareMode} setCompareMode={setCompareMode} isLoading={isLoading || qualityData.isLoading} appEntityId={appEntityId} steps={steps} />; break;
            case "Trends": content = <TrendsTab quality={quality} qualityPrev={qualityPrev} overallApdex={overallApdex} overallApdexPrev={overallApdexPrev} overallConv={overallConv} overallConvPrev={overallConvPrev} funnelCounts={funnelCounts} funnelCountsPrev={funnelCountsPrev} isLoading={qualityData.isLoading || qualityDataPrev.isLoading || funnelResult.isLoading || funnelResultPrev.isLoading} steps={steps} />; break;
            case "Web Vitals": content = <WebVitalsTab cwv={cwv} cwvByPage={cwvByPage} isLoading={cwvResult.isLoading || cwvByPage.isLoading} appEntityId={appEntityId} />; break;
            case "Step Details": content = <StepDetailsTab stepMap={stepMap} isLoading={stepMetrics.isLoading} appEntityId={appEntityId} steps={steps} />; break;
            case "Worst Sessions": content = <WorstSessionsTab data={worstSessionsData} isLoading={worstSessionsData.isLoading} />; break;
            case "Exceptions": content = <JSErrorsTab data={jsErrorsData} isLoading={jsErrorsData.isLoading} frontend={frontend} />; break;
            case "Click Issues": content = <ClickIssuesTab data={clickIssuesData} isLoading={clickIssuesData.isLoading} />; break;
            case "Perf Budgets": content = <PerfBudgetsTab quality={quality} overallApdex={overallApdex} overallConv={overallConv} hourlyData={hourlyDistributionData} isLoading={qualityData.isLoading || hourlyDistributionData.isLoading} />; break;
            case "Geo Heatmap": content = <GeoHeatmapTab data={geoPerformanceData} isLoading={geoPerformanceData.isLoading} frontend={frontend} />; break;
            case "Map": content = <WorldMapTab data={geoPerformanceData} isLoading={geoPerformanceData.isLoading} frontend={frontend} defaultView={mapViewDefault} />; break;
            case "Navigation Paths": content = <NavigationPathsTab data={navigationPathsData} isLoading={navigationPathsData.isLoading} appEntityId={appEntityId} steps={steps} />; break;
            case "Sankey": content = <SankeyTab data={sankeyData} isLoading={sankeyData.isLoading} appEntityId={appEntityId} chartStyle={sankeyStyle} onStyleChange={(v: SankeyStyle) => { setSankeyStyle(v); saveState({ key: SANKEY_STYLE_STATE_KEY, body: { value: v } }); }} />; break;
            case "Anomaly Detection": content = <AnomalyDetectionTab quality={quality} qualityPrev={qualityPrev} overallApdex={overallApdex} overallApdexPrev={overallApdexPrev} funnelCounts={funnelCounts} funnelCountsPrev={funnelCountsPrev} stepMap={stepMap} durationDist={durationDistributionData} isLoading={qualityData.isLoading || qualityDataPrev.isLoading || durationDistributionData.isLoading} steps={steps} />; break;
            case "Conversion Attribution": content = <ConversionAttributionTab data={conversionAttributionData} overallConv={overallConv} isLoading={conversionAttributionData.isLoading} />; break;
            case "Executive Summary": content = <ExecutiveSummaryTab quality={quality} qualityPrev={qualityPrev} overallApdex={overallApdex} overallApdexPrev={overallApdexPrev} overallConv={overallConv} overallConvPrev={overallConvPrev} funnelCounts={funnelCounts} funnelCountsPrev={funnelCountsPrev} cwv={cwv} stepMap={stepMap} isLoading={isLoading || qualityData.isLoading || qualityDataPrev.isLoading || cwvResult.isLoading} frontend={frontend} steps={steps} />; break;
            case "Segmentation": content = <SegmentationTab devices={(deviceData.data?.records ?? []) as any[]} browsers={(browserData.data?.records ?? []) as any[]} geos={(geoData.data?.records ?? []) as any[]} isLoading={deviceData.isLoading || browserData.isLoading || geoData.isLoading} />; break;
            case "Errors & Drop-offs": content = <ErrorsTab errors={(errorData.data?.records ?? []) as any[]} funnelCounts={funnelCounts} isLoading={errorData.isLoading} steps={steps} />; break;
            case "What-If Analysis": content = <WhatIfTab funnelCounts={funnelCounts} stepMap={stepMap} overallApdex={overallApdex} isLoading={isLoading} steps={steps} />; break;
            case "Root Cause Correlation": content = <RootCauseCorrelationTab hourlyData={rootCauseCorrelationData} stepDropData={rootCauseStepDropData} quality={quality} qualityPrev={qualityPrev} overallApdex={overallApdex} overallApdexPrev={overallApdexPrev} overallConv={overallConv} overallConvPrev={overallConvPrev} isLoading={rootCauseCorrelationData.isLoading || rootCauseStepDropData.isLoading} steps={steps} />; break;
            case "Predictive Forecasting": content = <PredictiveForecastingTab trendData={forecastTrendData} apdexTrendData={forecastApdexTrendData} vitalsTrendData={forecastVitalsTrendData} quality={quality} overallApdex={overallApdex} overallConv={overallConv} isLoading={forecastTrendData.isLoading || forecastApdexTrendData.isLoading || forecastVitalsTrendData.isLoading} steps={steps} />; break;
            case "Resource Waterfall": content = <ResourceWaterfallTab waterfallData={resourceWaterfallData} byStepData={resourceByStepData} isLoading={resourceWaterfallData.isLoading || resourceByStepData.isLoading} steps={steps} />; break;
            case "Change Intelligence": content = <ChangeIntelligenceTab deployData={deploymentEventsData} impactData={changeImpactData} quality={quality} qualityPrev={qualityPrev} overallApdex={overallApdex} overallApdexPrev={overallApdexPrev} isLoading={deploymentEventsData.isLoading || changeImpactData.isLoading} />; break;
            case "SLO Tracker": content = <SLOTrackerTab apdexTrend={sloApdexTrendData} cwvTrend={sloCwvTrendData} quality={quality} overallApdex={overallApdex} overallConv={overallConv} cwv={cwv} isLoading={sloApdexTrendData.isLoading || sloCwvTrendData.isLoading} />; break;
            case "Session Replay Spotlight": content = <SessionReplaySpotlightTab data={sessionReplayData} isLoading={sessionReplayData.isLoading} />; break;
            case "A/B Comparison": content = <ABComparisonTab segAData={abSegAData} segBData={abSegBData} segACwv={abSegACwv} segBCwv={abSegBCwv} dimension={abDimension} setDimension={setAbDimension} segA={abSegA} segB={abSegB} setSegA={setAbSegA} setSegB={setAbSegB} isLoading={abSegAData.isLoading || abSegBData.isLoading || abSegACwv.isLoading || abSegBCwv.isLoading} />; break;
          }
          return <Tab key={tabId} title={tabId}>{content}</Tab>;
        })}
      </Tabs>
    </div>
  );
}

// ===========================================================================
// TAB: Funnel Overview (with Compare)
// ===========================================================================
function FunnelOverviewTab({ funnelCounts, funnelCountsPrev, overallConv, overallApdex, stepMap, quality, compareMode, setCompareMode, isLoading, appEntityId, steps }: { funnelCounts: number[]; funnelCountsPrev: number[]; overallConv: number; overallApdex: number; stepMap: Map<string, any>; quality: any; compareMode: boolean; setCompareMode: (v: boolean) => void; isLoading: boolean; appEntityId?: string; steps: StepDef[] }) {
  if (isLoading) return <Loading />;

  const makeFunnelSteps = (counts: number[]): FunnelStep[] => steps.map((step, i) => {
    const prev = i === 0 ? counts[0] : counts[i - 1];
    const m = stepMap.get(step.label);
    const apdex = m ? calcApdex(Number(m.satisfied ?? 0), Number(m.tolerating ?? 0), Number(m.total_actions ?? 0)) : undefined;
    return {
      label: step.label,
      count: counts[i],
      convFromPrev: i === 0 ? 100 : prev > 0 ? (counts[i] / prev) * 100 : 0,
      overallConv: counts[0] > 0 ? (counts[i] / counts[0]) * 100 : 0,
      apdex,
    };
  });

  const funnelSteps = makeFunnelSteps(funnelCounts);
  const prevFunnelSteps = compareMode ? makeFunnelSteps(funnelCountsPrev) : undefined;
  const errorRate = quality.total > 0 ? (quality.errors / quality.total) * 100 : 0;

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      {/* KPI row */}
      <Flex gap={16} flexWrap="wrap">
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Total Sessions</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: BLUE }}>{fmtCount(funnelCounts[0])}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Conversions</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: GREEN }}>{fmtCount(funnelCounts[funnelCounts.length - 1])}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Conversion Rate</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: statusClr(overallConv) }}>{fmtPct(overallConv)}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Overall Apdex</Text>
          <ApdexGauge score={overallApdex} size={72} />
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Error Rate</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: errorRate > 5 ? RED : errorRate > 1 ? YELLOW : GREEN }}>{fmtPct(errorRate)}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Avg Duration</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: quality.avg > 3000 ? RED : quality.avg > 1000 ? YELLOW : GREEN }}>{fmt(quality.avg)}</Heading>
        </div>
      </Flex>

      {/* Apdex satisfaction breakdown */}
      <div className="uj-table-tile" style={{ padding: 16 }}>
        <Flex gap={24} alignItems="center" flexWrap="wrap">
          <div style={{ textAlign: "center" }}>
            <Text style={{ fontSize: 11, opacity: 0.5 }}>Satisfied</Text>
            <Heading level={4} style={{ color: GREEN, margin: "4px 0" }}>{fmtCount(quality.satisfied)}</Heading>
            <Text style={{ fontSize: 10, opacity: 0.4 }}>≤ {APDEX_T / 1000}s</Text>
          </div>
          <div style={{ textAlign: "center" }}>
            <Text style={{ fontSize: 11, opacity: 0.5 }}>Tolerating</Text>
            <Heading level={4} style={{ color: YELLOW, margin: "4px 0" }}>{fmtCount(quality.tolerating)}</Heading>
            <Text style={{ fontSize: 10, opacity: 0.4 }}>≤ {APDEX_4T / 1000}s</Text>
          </div>
          <div style={{ textAlign: "center" }}>
            <Text style={{ fontSize: 11, opacity: 0.5 }}>Frustrated</Text>
            <Heading level={4} style={{ color: RED, margin: "4px 0" }}>{fmtCount(quality.frustrated)}</Heading>
            <Text style={{ fontSize: 10, opacity: 0.4 }}>&gt; {APDEX_4T / 1000}s</Text>
          </div>
          <div style={{ flex: 1, height: 10, borderRadius: 5, overflow: "hidden", display: "flex", minWidth: 200 }}>
            <div style={{ width: `${quality.total > 0 ? (quality.satisfied / quality.total) * 100 : 0}%`, background: GREEN, height: "100%" }} />
            <div style={{ width: `${quality.total > 0 ? (quality.tolerating / quality.total) * 100 : 0}%`, background: YELLOW, height: "100%" }} />
            <div style={{ width: `${quality.total > 0 ? (quality.frustrated / quality.total) * 100 : 0}%`, background: RED, height: "100%" }} />
          </div>
        </Flex>
      </div>

      {/* Funnel with compare toggle */}
      <Flex alignItems="center" justifyContent="space-between">
        <SectionHeader title="Conversion Funnel" />
        <button onClick={() => setCompareMode(!compareMode)} className={`uj-compare-toggle ${compareMode ? "active" : ""}`}>
          {compareMode ? "\u27F5 Hide Compare" : "Compare \u27F6"}
        </button>
      </Flex>
      <div className="uj-funnel-container">
        <FunnelChart steps={funnelSteps} prevSteps={prevFunnelSteps} appEntityId={appEntityId} stepDefs={steps} />
        {compareMode && (
          <Flex gap={12} justifyContent="center" style={{ marginTop: 8 }}>
            <Flex gap={6} alignItems="center"><div style={{ width: 20, height: 3, background: BLUE, borderRadius: 2 }} /><Text style={{ fontSize: 10, opacity: 0.5 }}>Current period</Text></Flex>
            <Flex gap={6} alignItems="center"><div style={{ width: 20, height: 3, borderTop: "2px dashed rgba(255,255,255,0.3)" }} /><Text style={{ fontSize: 10, opacity: 0.5 }}>Previous period</Text></Flex>
          </Flex>
        )}
      </div>

      {/* Step table */}
      <SectionHeader title="Step Analysis" />
      <div className="uj-table-tile">
        <DataTable
          sortable
          data={steps.map((step, i) => {
            const prev = i === 0 ? funnelCounts[0] : funnelCounts[i - 1];
            const conv = i === 0 ? 100 : prev > 0 ? (funnelCounts[i] / prev) * 100 : 0;
            const m = stepMap.get(step.label);
            const apdex = m ? calcApdex(Number(m.satisfied ?? 0), Number(m.tolerating ?? 0), Number(m.total_actions ?? 0)) : 0;
            return {
              Step: i + 1, Action: step.label, Sessions: funnelCounts[i],
              "Avg (ms)": m ? Number(m.avg_duration_ms ?? 0) : 0,
              "P90 (ms)": m ? Number(m.p90_duration_ms ?? 0) : 0,
              Apdex: apdex, "Conv %": conv,
              Abandons: i === 0 ? 0 : prev - funnelCounts[i],
              Errors: m ? Number(m.error_count ?? 0) : 0,
            };
          })}
          columns={[
            { id: "Step", header: "#", accessor: "Step", sortType: "number" as any },
            { id: "Action", header: "Step", accessor: "Action" },
            { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Strong>{fmtCount(value)}</Strong> },
            { id: "Avg (ms)", header: "Avg Duration", accessor: "Avg (ms)", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmt(value)}</Text> },
            { id: "P90 (ms)", header: "P90", accessor: "P90 (ms)", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 3000 ? RED : value > 1000 ? YELLOW : undefined }}>{fmt(value)}</Text> },
            { id: "Apdex", header: "Apdex", accessor: "Apdex", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: apdexClr(value) }}>{value.toFixed(2)}</Strong> },
            { id: "Conv %", header: "Conv %", accessor: "Conv %", sortType: "number" as any, cell: ({ value, rowData }: any) => rowData.Step === 1 ? <Text style={{ opacity: 0.5 }}>entry</Text> : <Strong style={{ color: statusClr(value) }}>{fmtPct(value)}</Strong> },
            { id: "Abandons", header: "Abandons", accessor: "Abandons", sortType: "number" as any, cell: ({ value, rowData }: any) => rowData.Step === 1 ? <Text style={{ opacity: 0.5 }}>—</Text> : <Strong style={{ color: value > 0 ? RED : GREEN }}>{fmtCount(value)}</Strong> },
            { id: "Errors", header: "Errors", accessor: "Errors", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 0 ? RED : undefined }}>{value}</Text> },
          ]}
        />
      </div>
    </Flex>
  );
}

// ===========================================================================
// TAB: Trends (Period-over-Period Comparison) — NEW
// ===========================================================================
function TrendsTab({ quality, qualityPrev, overallApdex, overallApdexPrev, overallConv, overallConvPrev, funnelCounts, funnelCountsPrev, isLoading, steps }: { quality: any; qualityPrev: any; overallApdex: number; overallApdexPrev: number; overallConv: number; overallConvPrev: number; funnelCounts: number[]; funnelCountsPrev: number[]; isLoading: boolean; steps: StepDef[] }) {
  if (isLoading) return <Loading />;

  const errorRate = quality.total > 0 ? (quality.errors / quality.total) * 100 : 0;
  const errorRatePrev = qualityPrev.total > 0 ? (qualityPrev.errors / qualityPrev.total) * 100 : 0;

  const trends = [
    { label: "Sessions", current: quality.sessions, prev: qualityPrev.sessions, inverted: false, format: fmtCount },
    { label: "Total Actions", current: quality.total, prev: qualityPrev.total, inverted: false, format: fmtCount },
    { label: "Conversion Rate", current: overallConv, prev: overallConvPrev, inverted: false, format: fmtPct },
    { label: "Apdex", current: overallApdex, prev: overallApdexPrev, inverted: false, format: (v: number) => v.toFixed(2) },
    { label: "Avg Duration", current: quality.avg, prev: qualityPrev.avg, inverted: true, format: fmt },
    { label: "P50 Duration", current: quality.p50, prev: qualityPrev.p50, inverted: true, format: fmt },
    { label: "P90 Duration", current: quality.p90, prev: qualityPrev.p90, inverted: true, format: fmt },
    { label: "Error Rate", current: errorRate, prev: errorRatePrev, inverted: true, format: fmtPct },
    { label: "Errors", current: quality.errors, prev: qualityPrev.errors, inverted: true, format: fmtCount },
    { label: "Frustrated", current: quality.frustrated, prev: qualityPrev.frustrated, inverted: true, format: fmtCount },
  ];

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      <SectionHeader title="Period-over-Period Comparison" />
      <Text style={{ fontSize: 12, opacity: 0.5 }}>Comparing current period with the equivalent previous period. Green ▲ = improving, Red ▼ = regressing.</Text>

      <Flex gap={16} flexWrap="wrap">
        {trends.map((t) => {
          const delta = t.current - t.prev;
          const pct = t.prev > 0 ? (delta / t.prev) * 100 : (t.current > 0 ? 100 : 0);
          const improving = t.inverted ? delta <= 0 : delta >= 0;
          const color = Math.abs(pct) < 1 ? "rgba(255,255,255,0.5)" : improving ? GREEN : RED;

          return (
            <div key={t.label} className="uj-trend-card">
              <Text style={{ fontSize: 10, opacity: 0.5, textTransform: "uppercase", letterSpacing: 0.5 }}>{t.label}</Text>
              <Heading level={3} style={{ margin: "6px 0 2px", color }}>{t.format(t.current)}</Heading>
              <Flex gap={8} alignItems="center">
                <Text style={{ fontSize: 11, opacity: 0.4 }}>was {t.format(t.prev)}</Text>
                <Delta current={t.current} previous={t.prev} inverted={t.inverted} />
              </Flex>
              {/* Mini bar showing direction */}
              <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(Math.abs(pct), 100)}%`, background: color, borderRadius: 2, transition: "width 0.4s ease" }} />
              </div>
            </div>
          );
        })}
      </Flex>

      {/* Per-step funnel comparison */}
      <SectionHeader title="Funnel Step Comparison" />
      <div className="uj-table-tile">
        <DataTable
          sortable
          data={steps.map((step, i) => {
            const curr = funnelCounts[i];
            const prev = funnelCountsPrev[i];
            const delta = prev > 0 ? ((curr - prev) / prev) * 100 : 0;
            return { Step: step.label, Current: curr, Previous: prev, "Change %": delta };
          })}
          columns={[
            { id: "Step", header: "Step", accessor: "Step" },
            { id: "Current", header: "Current", accessor: "Current", sortType: "number" as any, cell: ({ value }: any) => <Strong>{fmtCount(value)}</Strong> },
            { id: "Previous", header: "Previous", accessor: "Previous", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ opacity: 0.6 }}>{fmtCount(value)}</Text> },
            { id: "Change %", header: "Change", accessor: "Change %", sortType: "number" as any, cell: ({ value }: any) => {
              const color = Math.abs(value) < 1 ? "rgba(255,255,255,0.4)" : value >= 0 ? GREEN : RED;
              return <Strong style={{ color }}>{value >= 0 ? "▲" : "▼"} {Math.abs(value).toFixed(1)}%</Strong>;
            }},
          ]}
        />
      </div>
    </Flex>
  );
}

// ===========================================================================
// TAB: Web Vitals
// ===========================================================================
function WebVitalsTab({ cwv: v, cwvByPage, isLoading, appEntityId }: { cwv: { lcp: number; cls: number; inp: number; ttfb: number; load: number }; cwvByPage: any; isLoading: boolean; appEntityId?: string }) {
  if (isLoading) return <Loading />;

  const pages = (cwvByPage.data?.records ?? []) as any[];
  const lcpScore = v.lcp <= CWV.lcp.good ? 100 : v.lcp <= CWV.lcp.poor ? 50 : 0;
  const clsScore = v.cls <= CWV.cls.good ? 100 : v.cls <= CWV.cls.poor ? 50 : 0;
  const inpScore = v.inp <= CWV.inp.good ? 100 : v.inp <= CWV.inp.poor ? 50 : 0;
  const ttfbScore = v.ttfb <= CWV.ttfb.good ? 100 : v.ttfb <= CWV.ttfb.poor ? 50 : 0;
  const healthScore = Math.round((lcpScore * 0.35 + clsScore * 0.25 + inpScore * 0.25 + ttfbScore * 0.15));

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      <Flex gap={16} flexWrap="wrap" alignItems="center">
        <div className="uj-kpi-card" style={{ minWidth: 160 }}>
          <Text className="uj-kpi-label">Performance Health</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: healthScore >= 80 ? GREEN : healthScore >= 50 ? YELLOW : RED }}>{healthScore}/100</Heading>
          <Text style={{ fontSize: 10, opacity: 0.5 }}>Weighted: LCP 35%, CLS 25%, INP 25%, TTFB 15%</Text>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Load Event End</Text>
          <Heading level={3} className="uj-kpi-value" style={{ color: v.load > 3000 ? RED : v.load > 1500 ? YELLOW : GREEN }}>{fmt(v.load)}</Heading>
        </div>
      </Flex>

      <SectionHeader title="Core Web Vitals" />
      <Flex gap={16} flexWrap="wrap">
        <CwvCard label="Largest Contentful Paint" value={v.lcp} unit="ms" metric="lcp" />
        <CwvCard label="Cumulative Layout Shift" value={v.cls} unit="" metric="cls" />
        <CwvCard label="Interaction to Next Paint" value={v.inp} unit="ms" metric="inp" />
        <CwvCard label="Time to First Byte" value={v.ttfb} unit="ms" metric="ttfb" />
      </Flex>

      <SectionHeader title="Web Vitals by Page" />
      <div className="uj-table-tile">
        {pages.length === 0 ? <div style={{ padding: 20 }}><Text>No per-page data available</Text></div> : (
          <DataTable sortable data={pages.map((p: any) => ({ Page: p["pageName"] ?? "Unknown", "LCP (ms)": Number(p.lcp_avg ?? 0), CLS: Number(p.cls_avg ?? 0), "TTFB (ms)": Number(p.ttfb_avg ?? 0), "Load (ms)": Number(p.load_avg ?? 0) }))}
            columns={[
              { id: "Page", header: "Page", accessor: "Page", cell: ({ value }: any) => appEntityId ? <a href={vitalsUrl(appEntityId, value)} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, textDecoration: "none" }} onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")} onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}>{value}</a> : <Text>{value}</Text> },
              { id: "LCP (ms)", header: "LCP", accessor: "LCP (ms)", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: cwvClr(value, "lcp") }}>{fmt(value)}</Strong> },
              { id: "CLS", header: "CLS", accessor: "CLS", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: cwvClr(value, "cls") }}>{value.toFixed(3)}</Strong> },
              { id: "TTFB (ms)", header: "TTFB", accessor: "TTFB (ms)", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: cwvClr(value, "ttfb") }}>{fmt(value)}</Strong> },
              { id: "Load (ms)", header: "Load End", accessor: "Load (ms)", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmt(value)}</Text> },
            ]}
          />
        )}
      </div>

      <SectionHeader title="Thresholds Reference" />
      <div className="uj-table-tile" style={{ padding: 16 }}>
        <Flex gap={24} flexWrap="wrap">
          {([
            { label: "LCP", good: "≤ 2.5s", ni: "≤ 4.0s", poor: "> 4.0s", desc: "Loading performance — how fast the main content appears." },
            { label: "CLS", good: "≤ 0.1", ni: "≤ 0.25", poor: "> 0.25", desc: "Visual stability — measures unexpected layout shifts." },
            { label: "INP", good: "≤ 200ms", ni: "≤ 500ms", poor: "> 500ms", desc: "Responsiveness — delay between interaction and visual update." },
            { label: "TTFB", good: "≤ 800ms", ni: "≤ 1.8s", poor: "> 1.8s", desc: "Server speed — time until first byte received." },
          ] as const).map((t) => (
            <div key={t.label} style={{ flex: "1 1 200px", padding: "8px 0" }}>
              <Strong style={{ fontSize: 13 }}>{t.label}</Strong>
              <Text style={{ display: "block", fontSize: 11, opacity: 0.5, marginBottom: 4 }}>{t.desc}</Text>
              <Flex gap={8}>
                <span style={{ fontSize: 10, color: GREEN, background: `${GREEN}15`, padding: "2px 6px", borderRadius: 4 }}>{t.good}</span>
                <span style={{ fontSize: 10, color: YELLOW, background: `${YELLOW}15`, padding: "2px 6px", borderRadius: 4 }}>{t.ni}</span>
                <span style={{ fontSize: 10, color: RED, background: `${RED}15`, padding: "2px 6px", borderRadius: 4 }}>{t.poor}</span>
              </Flex>
            </div>
          ))}
        </Flex>
      </div>
    </Flex>
  );
}

// ===========================================================================
// TAB: Step Details
// ===========================================================================
function StepDetailsTab({ stepMap, isLoading, appEntityId, steps }: { stepMap: Map<string, any>; isLoading: boolean; appEntityId?: string; steps: StepDef[] }) {
  if (isLoading) return <Loading />;
  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      {steps.map((step, i) => {
        const m = stepMap.get(step.label);
        const avg = m ? Number(m.avg_duration_ms ?? 0) : 0;
        const p50 = m ? Number(m.p50_duration_ms ?? 0) : 0;
        const p90 = m ? Number(m.p90_duration_ms ?? 0) : 0;
        const p99 = m ? Number(m.p99_duration_ms ?? 0) : 0;
        const total = m ? Number(m.total_actions ?? 0) : 0;
        const errors = m ? Number(m.error_count ?? 0) : 0;
        const sat = m ? Number(m.satisfied ?? 0) : 0;
        const tol = m ? Number(m.tolerating ?? 0) : 0;
        const fru = m ? Number(m.frustrated ?? 0) : 0;
        const apdex = calcApdex(sat, tol, total);
        const errRate = total > 0 ? (errors / total) * 100 : 0;

        return (
          <div key={i} className="uj-step-detail-card">
            <Flex alignItems="center" gap={12} style={{ marginBottom: 12 }}>
              <span className="uj-step-badge">{i + 1}</span>
              {appEntityId ? (
                <a href={vitalsUrl(appEntityId, step.identifier)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }} onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")} onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}>
                  <Heading level={5} style={{ margin: 0, color: BLUE }}>{step.label}</Heading>
                </a>
              ) : (
                <Heading level={5} style={{ margin: 0 }}>{step.label}</Heading>
              )}
              <Text style={{ fontSize: 11, opacity: 0.5 }}>{step.identifier}</Text>
              <div style={{ marginLeft: "auto" }}><ApdexGauge score={apdex} size={64} label="Apdex" /></div>
            </Flex>
            <Flex gap={16} flexWrap="wrap">
              <div className="uj-metric-box"><Text className="uj-metric-label">Avg Duration</Text><Strong className="uj-metric-value" style={{ color: avg > 3000 ? RED : avg > 1000 ? YELLOW : GREEN }}>{fmt(avg)}</Strong></div>
              <div className="uj-metric-box"><Text className="uj-metric-label">P50</Text><Strong className="uj-metric-value">{fmt(p50)}</Strong></div>
              <div className="uj-metric-box"><Text className="uj-metric-label">P90</Text><Strong className="uj-metric-value" style={{ color: p90 > 3000 ? RED : p90 > 1500 ? YELLOW : GREEN }}>{fmt(p90)}</Strong></div>
              <div className="uj-metric-box"><Text className="uj-metric-label">P99</Text><Strong className="uj-metric-value" style={{ color: p99 > 5000 ? RED : undefined }}>{fmt(p99)}</Strong></div>
              <div className="uj-metric-box"><Text className="uj-metric-label">Events</Text><Strong className="uj-metric-value" style={{ color: BLUE }}>{fmtCount(total)}</Strong></div>
              <div className="uj-metric-box"><Text className="uj-metric-label">Errors</Text><Strong className="uj-metric-value" style={{ color: errors > 0 ? RED : GREEN }}>{errors}</Strong></div>
              <div className="uj-metric-box"><Text className="uj-metric-label">Error Rate</Text><Strong className="uj-metric-value" style={{ color: errRate > 5 ? RED : errRate > 1 ? YELLOW : GREEN }}>{fmtPct(errRate)}</Strong></div>
            </Flex>
            <Flex gap={12} alignItems="center" style={{ marginTop: 12 }}>
              <Text style={{ fontSize: 10, color: GREEN }}>Satisfied: {sat}</Text>
              <Text style={{ fontSize: 10, color: YELLOW }}>Tolerating: {tol}</Text>
              <Text style={{ fontSize: 10, color: RED }}>Frustrated: {fru}</Text>
              <div style={{ flex: 1, height: 6, borderRadius: 3, overflow: "hidden", display: "flex" }}>
                <div style={{ width: `${total > 0 ? (sat / total) * 100 : 0}%`, background: GREEN, height: "100%" }} />
                <div style={{ width: `${total > 0 ? (tol / total) * 100 : 0}%`, background: YELLOW, height: "100%" }} />
                <div style={{ width: `${total > 0 ? (fru / total) * 100 : 0}%`, background: RED, height: "100%" }} />
              </div>
            </Flex>
          </div>
        );
      })}
    </Flex>
  );
}

// ===========================================================================
// TAB: Worst Sessions (Session Replay Links) — NEW
// ===========================================================================
function WorstSessionsTab({ data, isLoading }: { data: any; isLoading: boolean }) {
  if (isLoading) return <Loading />;

  const sessions = (data.data?.records ?? []) as any[];

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      <SectionHeader title="Worst-Performing Sessions" />
      <Text style={{ fontSize: 12, opacity: 0.5 }}>Sessions ranked by frustrated actions, errors, and slowness. Click Replay to open in Dynatrace Session Replay.</Text>

      {sessions.length === 0 ? (
        <div className="uj-table-tile" style={{ padding: 24 }}><Text>No session data in selected timeframe</Text></div>
      ) : (
        <div className="uj-table-tile">
          <DataTable
            sortable
            data={sessions.map((s: any) => {
              const sid = String(s["dt.rum.session.id"] ?? "");
              const startTs = String(s.start_ts ?? "");
              const actions = Number(s.actions ?? 0);
              const sat = Number(s.satisfied ?? 0);
              const tol = Number(s.tolerating ?? 0);
              const frustrated = Number(s.frustrated ?? 0);
              const apdex = calcApdex(sat, tol, actions);
              return {
                Session: sid.length > 16 ? sid.substring(0, 16) + "..." : sid,
                SessionFull: sid,
                StartTs: startTs,
                Actions: actions,
                "Avg (ms)": Number(s.avg_dur ?? 0),
                "Max (ms)": Number(s.max_dur ?? 0),
                Errors: Number(s.errors ?? 0),
                Frustrated: frustrated,
                Apdex: apdex,
              };
            })}
            columns={[
              { id: "Session", header: "Session", accessor: "Session", cell: ({ value, rowData }: any) => {
                const url = sessionReplayUrl(rowData.SessionFull, rowData.StartTs);
                return ENV_URL ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" className="uj-session-link">{value} ↗</a>
                ) : <Text>{value}</Text>;
              }},
              { id: "Actions", header: "Actions", accessor: "Actions", sortType: "number" as any, cell: ({ value }: any) => <Text>{value}</Text> },
              { id: "Avg (ms)", header: "Avg Duration", accessor: "Avg (ms)", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 3000 ? RED : value > 1000 ? YELLOW : undefined }}>{fmt(value)}</Text> },
              { id: "Max (ms)", header: "Max Duration", accessor: "Max (ms)", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 10000 ? RED : value > 5000 ? ORANGE : undefined }}>{fmt(value)}</Strong> },
              { id: "Errors", header: "Errors", accessor: "Errors", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 0 ? RED : GREEN }}>{value}</Strong> },
              { id: "Frustrated", header: "Frustrated", accessor: "Frustrated", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 0 ? RED : GREEN }}>{value}</Strong> },
              { id: "Apdex", header: "Apdex", accessor: "Apdex", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: apdexClr(value) }}>{value.toFixed(2)}</Strong> },
            ]}
          />
        </div>
      )}

      {/* Summary cards */}
      {sessions.length > 0 && (
        <>
          <SectionHeader title="Session Quality Summary" />
          <Flex gap={16} flexWrap="wrap">
            {(() => {
              const totalFrustrated = sessions.reduce((a: number, s: any) => a + Number(s.frustrated ?? 0), 0);
              const totalErrors = sessions.reduce((a: number, s: any) => a + Number(s.errors ?? 0), 0);
              const avgMaxDur = sessions.reduce((a: number, s: any) => a + Number(s.max_dur ?? 0), 0) / sessions.length;
              const worstApdex = Math.min(...sessions.map((s: any) => calcApdex(Number(s.satisfied ?? 0), Number(s.tolerating ?? 0), Number(s.actions ?? 0))));
              return [
                { label: "Frustrated Actions (top 25)", value: fmtCount(totalFrustrated), color: RED },
                { label: "Total Errors (top 25)", value: fmtCount(totalErrors), color: RED },
                { label: "Avg Peak Duration", value: fmt(avgMaxDur), color: avgMaxDur > 10000 ? RED : ORANGE },
                { label: "Worst Session Apdex", value: worstApdex.toFixed(2), color: apdexClr(worstApdex) },
              ].map((c) => (
                <div key={c.label} className="uj-kpi-card">
                  <Text className="uj-kpi-label">{c.label}</Text>
                  <Heading level={3} className="uj-kpi-value" style={{ color: c.color }}>{c.value}</Heading>
                </div>
              ));
            })()}
          </Flex>
        </>
      )}
    </Flex>
  );
}

// ===========================================================================
// TAB: Exceptions (Error Drilldown)
// ===========================================================================
function JSErrorsTab({ data, isLoading, frontend }: { data: any; isLoading: boolean; frontend: string }) {
  if (isLoading) return <Loading />;

  const errors = (data.data?.records ?? []) as any[];
  const totalOccurrences = errors.reduce((a: number, e: any) => a + Number(e.occurrences ?? 0), 0);
  const totalAffected = errors.reduce((a: number, e: any) => a + Number(e.affected_sessions ?? 0), 0);

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      <SectionHeader title="Exception Drilldown" />
      <Text style={{ fontSize: 12, opacity: 0.5 }}>Exceptions grouped by error name. Ranked by occurrence count to help prioritize fixes.</Text>

      {/* Summary */}
      <Flex gap={16} flexWrap="wrap">
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Unique Exceptions</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: errors.length > 10 ? RED : errors.length > 3 ? YELLOW : GREEN }}>{errors.length}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Total Occurrences</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: RED }}>{fmtCount(totalOccurrences)}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Affected Sessions</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: ORANGE }}>{fmtCount(totalAffected)}</Heading>
        </div>
      </Flex>

      {errors.length === 0 ? (
        <div className="uj-table-tile" style={{ padding: 24 }}><Text style={{ color: GREEN }}>No exceptions detected in this timeframe</Text></div>
      ) : (
        <>
          {/* Error cards */}
          <Flex flexDirection="column" gap={12}>
            {errors.slice(0, 10).map((e: any, i: number) => {
              const name = String(e.errorName ?? "Unknown Error");
              const errId = String(e["error.id"] ?? "");
              const occurrences = Number(e.occurrences ?? 0);
              const affected = Number(e.affected_sessions ?? 0);
              const pages = (e.pages ?? []) as string[];
              const firstSeen = e.first_seen ? new Date(e.first_seen).toLocaleString() : "—";
              const lastSeen = e.last_seen ? new Date(e.last_seen).toLocaleString() : "—";
              const severity = occurrences > 100 ? RED : occurrences > 20 ? ORANGE : occurrences > 5 ? YELLOW : "rgba(255,255,255,0.5)";
              const pctOfTotal = totalOccurrences > 0 ? (occurrences / totalOccurrences) * 100 : 0;

              return (
                <div key={i} className="uj-error-card">
                  <Flex alignItems="flex-start" gap={12}>
                    <div className="uj-error-rank" style={{ background: `${severity}22`, color: severity, borderColor: `${severity}44` }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <Flex alignItems="center" gap={8} style={{ marginBottom: 6 }}>
                        {errId ? (
                          <a href={errorInspectorUrl(errId, frontend)} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, textDecoration: "none", fontSize: 13, fontWeight: 600, wordBreak: "break-word" }}>
                            {name.length > 120 ? name.substring(0, 120) + "..." : name} ↗
                          </a>
                        ) : (
                          <Strong style={{ fontSize: 13, wordBreak: "break-word" }}>{name.length > 120 ? name.substring(0, 120) + "..." : name}</Strong>
                        )}
                      </Flex>
                      <Flex gap={16} flexWrap="wrap" style={{ marginBottom: 8 }}>
                        <div><Text style={{ fontSize: 10, opacity: 0.5 }}>Occurrences</Text><Strong style={{ display: "block", color: severity }}>{fmtCount(occurrences)}</Strong></div>
                        <div><Text style={{ fontSize: 10, opacity: 0.5 }}>Affected Sessions</Text><Strong style={{ display: "block", color: ORANGE }}>{fmtCount(affected)}</Strong></div>
                        <div><Text style={{ fontSize: 10, opacity: 0.5 }}>% of All Errors</Text><Strong style={{ display: "block" }}>{fmtPct(pctOfTotal)}</Strong></div>
                        <div><Text style={{ fontSize: 10, opacity: 0.5 }}>First Seen</Text><Text style={{ display: "block", fontSize: 11 }}>{firstSeen}</Text></div>
                        <div><Text style={{ fontSize: 10, opacity: 0.5 }}>Last Seen</Text><Text style={{ display: "block", fontSize: 11 }}>{lastSeen}</Text></div>
                      </Flex>
                      {pages.length > 0 && (
                        <Flex gap={6} flexWrap="wrap">
                          {pages.slice(0, 5).map((p: string, pi: number) => (
                            <span key={pi} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "rgba(69,137,255,0.1)", color: BLUE }}>{p ?? "unknown"}</span>
                          ))}
                          {pages.length > 5 && <span style={{ fontSize: 10, opacity: 0.4 }}>+{pages.length - 5} more</span>}
                        </Flex>
                      )}
                      {/* Impact bar */}
                      <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pctOfTotal}%`, background: severity, borderRadius: 2 }} />
                      </div>
                    </div>
                  </Flex>
                </div>
              );
            })}
          </Flex>

          {/* Full table */}
          {errors.length > 10 && (
            <>
              <SectionHeader title="All Errors (Table)" />
              <div className="uj-table-tile">
                <DataTable
                  sortable
                  data={errors.map((e: any) => ({
                    Error: String(e.errorName ?? "Unknown").substring(0, 80),
                    errorId: String(e["error.id"] ?? ""),
                    Occurrences: Number(e.occurrences ?? 0),
                    "Affected Sessions": Number(e.affected_sessions ?? 0),
                    Pages: ((e.pages ?? []) as string[]).join(", "),
                  }))}
                  columns={[
                    { id: "Error", header: "Error", accessor: "Error", cell: ({ value, row }: any) => {
                      const eid = row?.original?.errorId;
                      return eid ? <a href={errorInspectorUrl(eid, frontend)} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, textDecoration: "none" }}>{value} ↗</a> : <Text>{value}</Text>;
                    }},
                    { id: "Occurrences", header: "Count", accessor: "Occurrences", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 50 ? RED : ORANGE }}>{fmtCount(value)}</Strong> },
                    { id: "Affected Sessions", header: "Sessions", accessor: "Affected Sessions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
                    { id: "Pages", header: "Pages", accessor: "Pages", cell: ({ value }: any) => <Text style={{ fontSize: 11, opacity: 0.6 }}>{value}</Text> },
                  ]}
                />
              </div>
            </>
          )}
        </>
      )}
    </Flex>
  );
}

// ===========================================================================
// TAB: Click Issues (Rage / Dead Clicks) — NEW
// ===========================================================================
function ClickIssuesTab({ data, isLoading }: { data: any; isLoading: boolean }) {
  if (isLoading) return <Loading />;

  const rows = (data.data?.records ?? []) as any[];
  const rageClicks = rows.filter((r: any) => r.eventType === "rageClick");
  const deadClicks = rows.filter((r: any) => r.eventType === "deadClick");
  const totalRage = rageClicks.reduce((a: number, r: any) => a + Number(r.occurrences ?? 0), 0);
  const totalDead = deadClicks.reduce((a: number, r: any) => a + Number(r.occurrences ?? 0), 0);
  const totalAffected = rows.reduce((a: number, r: any) => a + Number(r.affected_sessions ?? 0), 0);

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      <SectionHeader title="Rage & Dead Click Detection" />
      <Text style={{ fontSize: 12, opacity: 0.5 }}>Rage clicks signal user frustration (rapid repeated clicks). Dead clicks indicate non-responsive UI elements. Both hurt conversion.</Text>

      {/* KPI cards */}
      <Flex gap={16} flexWrap="wrap">
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Rage Clicks</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: totalRage > 0 ? RED : GREEN }}>{fmtCount(totalRage)}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Dead Clicks</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: totalDead > 0 ? ORANGE : GREEN }}>{fmtCount(totalDead)}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Affected Sessions</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: totalAffected > 0 ? YELLOW : GREEN }}>{fmtCount(totalAffected)}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Unique Elements</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: BLUE }}>{rows.length}</Heading>
        </div>
      </Flex>

      {rows.length === 0 ? (
        <div className="uj-table-tile" style={{ padding: 24 }}><Text style={{ color: GREEN }}>No rage or dead clicks detected — great UX!</Text></div>
      ) : (
        <>
          {/* Top offenders cards */}
          <SectionHeader title="Top Offending Elements" />
          <Flex flexDirection="column" gap={12}>
            {rows.slice(0, 8).map((r: any, i: number) => {
              const type = String(r.eventType ?? "unknown");
              const isRage = type === "rageClick";
              const color = isRage ? RED : ORANGE;
              const occ = Number(r.occurrences ?? 0);
              const affected = Number(r.affected_sessions ?? 0);
              const page = String(r.pageName ?? "Unknown page");
              const target = String(r.target ?? "Unknown element");
              const pctOfTotal = (totalRage + totalDead) > 0 ? (occ / (totalRage + totalDead)) * 100 : 0;

              return (
                <div key={i} className="uj-error-card">
                  <Flex alignItems="flex-start" gap={12}>
                    <div className="uj-error-rank" style={{ background: `${color}22`, color, borderColor: `${color}44` }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <Flex alignItems="center" gap={8} style={{ marginBottom: 6 }}>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: `${color}18`, color, fontWeight: 700, textTransform: "uppercase" }}>{isRage ? "Rage" : "Dead"}</span>
                        <Strong style={{ fontSize: 13, wordBreak: "break-word" }}>{target.length > 100 ? target.substring(0, 100) + "..." : target}</Strong>
                      </Flex>
                      <Flex gap={16} flexWrap="wrap">
                        <div><Text style={{ fontSize: 10, opacity: 0.5 }}>Occurrences</Text><Strong style={{ display: "block", color }}>{fmtCount(occ)}</Strong></div>
                        <div><Text style={{ fontSize: 10, opacity: 0.5 }}>Affected Sessions</Text><Strong style={{ display: "block", color: ORANGE }}>{fmtCount(affected)}</Strong></div>
                        <div><Text style={{ fontSize: 10, opacity: 0.5 }}>% of Total</Text><Strong style={{ display: "block" }}>{fmtPct(pctOfTotal)}</Strong></div>
                        <div><Text style={{ fontSize: 10, opacity: 0.5 }}>Page</Text><Text style={{ display: "block", fontSize: 11, color: BLUE }}>{page}</Text></div>
                      </Flex>
                      <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pctOfTotal}%`, background: color, borderRadius: 2 }} />
                      </div>
                    </div>
                  </Flex>
                </div>
              );
            })}
          </Flex>

          {/* Full table */}
          <SectionHeader title="All Click Issues" />
          <div className="uj-table-tile">
            <DataTable
              sortable
              data={rows.map((r: any) => ({
                Type: String(r.eventType ?? "unknown") === "rageClick" ? "Rage" : "Dead",
                Element: String(r.target ?? "Unknown").substring(0, 60),
                Page: String(r.pageName ?? "Unknown"),
                Occurrences: Number(r.occurrences ?? 0),
                "Affected Sessions": Number(r.affected_sessions ?? 0),
              }))}
              columns={[
                { id: "Type", header: "Type", accessor: "Type", cell: ({ value }: any) => <Strong style={{ color: value === "Rage" ? RED : ORANGE }}>{value}</Strong> },
                { id: "Element", header: "Element", accessor: "Element" },
                { id: "Page", header: "Page", accessor: "Page", cell: ({ value }: any) => <Text style={{ fontSize: 11, color: BLUE }}>{value}</Text> },
                { id: "Occurrences", header: "Count", accessor: "Occurrences", sortType: "number" as any, cell: ({ value }: any) => <Strong>{fmtCount(value)}</Strong> },
                { id: "Affected Sessions", header: "Sessions", accessor: "Affected Sessions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
              ]}
            />
          </div>
        </>
      )}
    </Flex>
  );
}

// ===========================================================================
// TAB: Performance Budgets / SLO Tracking — NEW
// ===========================================================================
const PERF_BUDGETS = [
  { metric: "Apdex", target: 0.85, unit: "", inverted: false, format: (v: number) => v.toFixed(2) },
  { metric: "Conversion Rate", target: 20, unit: "%", inverted: false, format: fmtPct },
  { metric: "Avg Duration", target: 2000, unit: "ms", inverted: true, format: fmt },
  { metric: "P90 Duration", target: 4000, unit: "ms", inverted: true, format: fmt },
  { metric: "Error Rate", target: 2, unit: "%", inverted: true, format: fmtPct },
  { metric: "Frustrated %", target: 10, unit: "%", inverted: true, format: fmtPct },
];

function PerfBudgetsTab({ quality, overallApdex, overallConv, hourlyData, isLoading }: { quality: any; overallApdex: number; overallConv: number; hourlyData: any; isLoading: boolean }) {
  if (isLoading) return <Loading />;

  const errorRate = quality.total > 0 ? (quality.errors / quality.total) * 100 : 0;
  const frustratedPct = quality.total > 0 ? (quality.frustrated / quality.total) * 100 : 0;

  const actuals: Record<string, number> = {
    "Apdex": overallApdex,
    "Conversion Rate": overallConv,
    "Avg Duration": quality.avg,
    "P90 Duration": quality.p90,
    "Error Rate": errorRate,
    "Frustrated %": frustratedPct,
  };

  const budgetStatus = PERF_BUDGETS.map((b) => {
    const actual = actuals[b.metric] ?? 0;
    const passing = b.inverted ? actual <= b.target : actual >= b.target;
    const margin = b.target > 0 ? ((actual - b.target) / b.target) * 100 : 0;
    return { ...b, actual, passing, margin };
  });

  const passingCount = budgetStatus.filter((b) => b.passing).length;
  const overallHealth = Math.round((passingCount / budgetStatus.length) * 100);

  // Parse hourly data
  const hours = (hourlyData.data?.records ?? []) as any[];

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      <SectionHeader title="Performance Budget Tracking" />
      <Text style={{ fontSize: 12, opacity: 0.5 }}>Track actual metrics against defined performance budgets. Green = within budget, Red = over budget.</Text>

      {/* Overall compliance */}
      <Flex gap={16} flexWrap="wrap">
        <div className="uj-kpi-card" style={{ minWidth: 180 }}>
          <Text className="uj-kpi-label">Budget Compliance</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: overallHealth >= 80 ? GREEN : overallHealth >= 50 ? YELLOW : RED }}>{overallHealth}%</Heading>
          <Text style={{ fontSize: 10, opacity: 0.5 }}>{passingCount} of {budgetStatus.length} passing</Text>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Passing</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: GREEN }}>{passingCount}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Failing</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: budgetStatus.length - passingCount > 0 ? RED : GREEN }}>{budgetStatus.length - passingCount}</Heading>
        </div>
      </Flex>

      {/* Budget cards */}
      <SectionHeader title="Budget Status" />
      <Flex gap={16} flexWrap="wrap">
        {budgetStatus.map((b) => {
          const pctOfTarget = b.inverted
            ? (b.target > 0 ? Math.min((b.actual / b.target) * 100, 150) : 0)
            : (b.target > 0 ? Math.min((b.actual / b.target) * 100, 150) : 0);
          const barColor = b.passing ? GREEN : RED;
          const targetLine = b.inverted ? 100 : 100;

          return (
            <div key={b.metric} className="uj-budget-card">
              <Flex alignItems="center" justifyContent="space-between" style={{ marginBottom: 8 }}>
                <Strong style={{ fontSize: 13 }}>{b.metric}</Strong>
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: b.passing ? `${GREEN}18` : `${RED}18`, color: b.passing ? GREEN : RED, fontWeight: 700 }}>
                  {b.passing ? "PASS" : "FAIL"}
                </span>
              </Flex>
              <Flex gap={16} style={{ marginBottom: 8 }}>
                <div>
                  <Text style={{ fontSize: 10, opacity: 0.5 }}>Actual</Text>
                  <Strong style={{ display: "block", color: b.passing ? GREEN : RED, fontSize: 16 }}>{b.format(b.actual)}</Strong>
                </div>
                <div>
                  <Text style={{ fontSize: 10, opacity: 0.5 }}>Target</Text>
                  <Text style={{ display: "block", fontSize: 14 }}>{b.inverted ? "≤ " : "≥ "}{b.format(b.target)}</Text>
                </div>
                <div>
                  <Text style={{ fontSize: 10, opacity: 0.5 }}>Margin</Text>
                  <Text style={{ display: "block", fontSize: 14, color: b.passing ? GREEN : RED }}>
                    {b.inverted ? (b.margin <= 0 ? `${Math.abs(b.margin).toFixed(1)}% under` : `${b.margin.toFixed(1)}% over`) : (b.margin >= 0 ? `${b.margin.toFixed(1)}% above` : `${Math.abs(b.margin).toFixed(1)}% below`)}
                  </Text>
                </div>
              </Flex>
              {/* Progress bar toward target */}
              <div style={{ position: "relative", height: 8, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(pctOfTarget, 100)}%`, background: barColor, borderRadius: 4, transition: "width 0.4s ease" }} />
                {/* Target marker */}
                <div style={{ position: "absolute", top: 0, left: `${targetLine}%`, width: 2, height: "100%", background: "rgba(255,255,255,0.4)" }} />
              </div>
            </div>
          );
        })}
      </Flex>

      {/* Full budget table */}
      <SectionHeader title="Budget Summary Table" />
      <div className="uj-table-tile">
        <DataTable
          sortable
          data={budgetStatus.map((b) => ({
            Metric: b.metric,
            Actual: b.actual,
            Target: b.target,
            Status: b.passing ? "PASS" : "FAIL",
            "Margin %": b.margin,
          }))}
          columns={[
            { id: "Metric", header: "Metric", accessor: "Metric", cell: ({ value }: any) => <Strong>{value}</Strong> },
            { id: "Status", header: "Status", accessor: "Status", cell: ({ value }: any) => <Strong style={{ color: value === "PASS" ? GREEN : RED }}>{value}</Strong> },
            { id: "Actual", header: "Actual", accessor: "Actual", sortType: "number" as any, cell: ({ value, rowData }: any) => {
              const b = budgetStatus.find((x) => x.metric === rowData.Metric);
              return <Text>{b ? b.format(value) : value}</Text>;
            }},
            { id: "Target", header: "Target", accessor: "Target", sortType: "number" as any, cell: ({ value, rowData }: any) => {
              const b = budgetStatus.find((x) => x.metric === rowData.Metric);
              return <Text style={{ opacity: 0.6 }}>{b ? (b.inverted ? "≤ " : "≥ ") + b.format(value) : value}</Text>;
            }},
            { id: "Margin %", header: "Margin", accessor: "Margin %", sortType: "number" as any, cell: ({ value, rowData }: any) => {
              const b = budgetStatus.find((x) => x.metric === rowData.Metric);
              const color = b?.passing ? GREEN : RED;
              return <Strong style={{ color }}>{value >= 0 ? "+" : ""}{value.toFixed(1)}%</Strong>;
            }},
          ]}
        />
      </div>

      {/* Hourly distribution */}
      {hours.length > 0 && (
        <>
          <SectionHeader title="Hourly Performance Distribution" />
          <Text style={{ fontSize: 12, opacity: 0.5 }}>Apdex and traffic by hour of day. Identifies peak hours with degraded performance.</Text>
          <div className="uj-table-tile" style={{ padding: 16 }}>
            <Flex flexDirection="column" gap={4}>
              {hours.map((h: any) => {
                const hour = Number(h.hour ?? 0);
                const actions = Number(h.actions ?? 0);
                const sat = Number(h.satisfied ?? 0);
                const tol = Number(h.tolerating ?? 0);
                const total = actions;
                const apdex = calcApdex(sat, tol, total);
                const maxActions = Math.max(...hours.map((x: any) => Number(x.actions ?? 0)), 1);
                const barWidth = (actions / maxActions) * 100;

                return (
                  <Flex key={hour} alignItems="center" gap={8}>
                    <Text style={{ fontSize: 10, width: 35, textAlign: "right", opacity: 0.5 }}>{String(hour).padStart(2, "0")}:00</Text>
                    <div style={{ flex: 1, height: 12, borderRadius: 3, background: "rgba(255,255,255,0.04)", overflow: "hidden", position: "relative" }}>
                      <div style={{ height: "100%", width: `${barWidth}%`, background: apdexClr(apdex), borderRadius: 3, opacity: 0.7, transition: "width 0.3s ease" }} />
                    </div>
                    <Text style={{ fontSize: 10, minWidth: 45, textAlign: "right", color: BLUE }}>{fmtCount(actions)}</Text>
                    <Text style={{ fontSize: 10, minWidth: 35, textAlign: "right", fontWeight: 700, color: apdexClr(apdex) }}>{apdex.toFixed(2)}</Text>
                  </Flex>
                );
              })}
            </Flex>
            <Flex gap={16} justifyContent="flex-end" style={{ marginTop: 8 }}>
              <Flex gap={4} alignItems="center"><div style={{ width: 10, height: 10, borderRadius: 2, background: GREEN }} /><Text style={{ fontSize: 9, opacity: 0.5 }}>≥0.85</Text></Flex>
              <Flex gap={4} alignItems="center"><div style={{ width: 10, height: 10, borderRadius: 2, background: YELLOW }} /><Text style={{ fontSize: 9, opacity: 0.5 }}>≥0.7</Text></Flex>
              <Flex gap={4} alignItems="center"><div style={{ width: 10, height: 10, borderRadius: 2, background: ORANGE }} /><Text style={{ fontSize: 9, opacity: 0.5 }}>≥0.5</Text></Flex>
              <Flex gap={4} alignItems="center"><div style={{ width: 10, height: 10, borderRadius: 2, background: RED }} /><Text style={{ fontSize: 9, opacity: 0.5 }}>&lt;0.5</Text></Flex>
            </Flex>
          </div>
        </>
      )}
    </Flex>
  );
}

// ===========================================================================
// TAB: Geo Heatmap — NEW
// ===========================================================================
function GeoHeatmapTab({ data, isLoading, frontend }: { data: any; isLoading: boolean; frontend: string }) {
  if (isLoading) return <Loading />;

  const rows = (data.data?.records ?? []) as any[];

  // Aggregate by country
  const countryMap = new Map<string, { sessions: number; actions: number; avgDur: number; p90: number; errors: number; sat: number; tol: number; fru: number; cities: string[]; countryName: string }>();
  rows.forEach((r: any) => {
    const country = String(r.country ?? "Unknown");
    const city = String(r.city ?? "");
    const cName = String(r.country_name ?? country);
    const d = countryMap.get(country) ?? { sessions: 0, actions: 0, avgDur: 0, p90: 0, errors: 0, sat: 0, tol: 0, fru: 0, cities: [], countryName: cName };
    const actions = Number(r.actions ?? 0);
    d.sessions += Number(r.sessions ?? 0);
    d.avgDur = d.actions > 0 ? (d.avgDur * d.actions + Number(r.avg_dur ?? 0) * actions) / (d.actions + actions) : Number(r.avg_dur ?? 0);
    d.p90 = Math.max(d.p90, Number(r.p90_dur ?? 0));
    d.actions += actions;
    d.errors += Number(r.errors ?? 0);
    d.sat += Number(r.satisfied ?? 0);
    d.tol += Number(r.tolerating ?? 0);
    d.fru += Number(r.frustrated ?? 0);
    if (city && !d.cities.includes(city)) d.cities.push(city);
    if (!d.countryName || d.countryName === country) d.countryName = cName;
    countryMap.set(country, d);
  });

  const countries = Array.from(countryMap.entries())
    .map(([name, d]) => ({
      name,
      ...d,
      apdex: calcApdex(d.sat, d.tol, d.actions),
      errRate: d.actions > 0 ? (d.errors / d.actions) * 100 : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions);

  const totalCountries = countries.length;
  const bestApdex = countries.length > 0 ? Math.max(...countries.map((c) => c.apdex)) : 0;
  const worstApdex = countries.length > 0 ? Math.min(...countries.map((c) => c.apdex)) : 0;
  const avgApdex = countries.length > 0 ? countries.reduce((a, c) => a + c.apdex, 0) / countries.length : 0;

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      <SectionHeader title="Geographic Performance Heatmap" />
      <Text style={{ fontSize: 12, opacity: 0.5 }}>Performance by country with Apdex color-coding. Identifies regions with poor user experience for targeted CDN or infrastructure optimization.</Text>

      {/* KPIs */}
      <Flex gap={16} flexWrap="wrap">
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Countries</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: BLUE }}>{totalCountries}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Best Apdex</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: apdexClr(bestApdex) }}>{bestApdex.toFixed(2)}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Worst Apdex</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: apdexClr(worstApdex) }}>{worstApdex.toFixed(2)}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Avg Apdex</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: apdexClr(avgApdex) }}>{avgApdex.toFixed(2)}</Heading>
        </div>
      </Flex>

      {countries.length === 0 ? (
        <div className="uj-table-tile" style={{ padding: 24 }}><Text>No geographic data available</Text></div>
      ) : (
        <>
          {/* Country heatmap cards */}
          <SectionHeader title="Country Performance Cards" />
          <Flex gap={12} flexWrap="wrap">
            {countries.slice(0, 20).map((c) => {
              const totalActions = c.sat + c.tol + c.fru;
              return (
                <a key={c.name} href={sessionsFilterUrl(frontend, c.countryName)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }}>
                <div className="uj-geo-card" style={{ borderLeftColor: apdexClr(c.apdex), cursor: "pointer" }}>
                  <Flex alignItems="center" justifyContent="space-between" style={{ marginBottom: 6 }}>
                    <Strong style={{ fontSize: 14 }}>{c.countryName !== c.name ? `${c.countryName} (${c.name})` : c.name} ↗</Strong>
                    <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: `${apdexClr(c.apdex)}18`, color: apdexClr(c.apdex), fontWeight: 700 }}>{c.apdex.toFixed(2)}</span>
                  </Flex>
                  <Flex gap={12} flexWrap="wrap" style={{ marginBottom: 6 }}>
                    <div><Text style={{ fontSize: 9, opacity: 0.5 }}>Sessions</Text><Text style={{ display: "block", fontSize: 11, fontWeight: 700, color: BLUE }}>{fmtCount(c.sessions)}</Text></div>
                    <div><Text style={{ fontSize: 9, opacity: 0.5 }}>Avg</Text><Text style={{ display: "block", fontSize: 11, fontWeight: 700, color: c.avgDur > 3000 ? RED : c.avgDur > 1000 ? YELLOW : GREEN }}>{fmt(c.avgDur)}</Text></div>
                    <div><Text style={{ fontSize: 9, opacity: 0.5 }}>Err%</Text><Text style={{ display: "block", fontSize: 11, fontWeight: 700, color: c.errRate > 5 ? RED : c.errRate > 1 ? YELLOW : GREEN }}>{fmtPct(c.errRate)}</Text></div>
                  </Flex>
                  {/* Mini satisfaction bar */}
                  <div style={{ height: 4, borderRadius: 2, overflow: "hidden", display: "flex" }}>
                    <div style={{ width: `${totalActions > 0 ? (c.sat / totalActions) * 100 : 0}%`, background: GREEN, height: "100%" }} />
                    <div style={{ width: `${totalActions > 0 ? (c.tol / totalActions) * 100 : 0}%`, background: YELLOW, height: "100%" }} />
                    <div style={{ width: `${totalActions > 0 ? (c.fru / totalActions) * 100 : 0}%`, background: RED, height: "100%" }} />
                  </div>
                  {c.cities.length > 0 && (
                    <Text style={{ fontSize: 9, opacity: 0.4, marginTop: 4 }}>{c.cities.slice(0, 3).join(", ")}{c.cities.length > 3 ? ` +${c.cities.length - 3}` : ""}</Text>
                  )}
                </div>
                </a>
              );
            })}
          </Flex>

          {/* Country table */}
          <SectionHeader title="Full Country Breakdown" />
          <div className="uj-table-tile">
            <DataTable
              sortable
              data={countries.map((c) => ({
                Country: c.countryName !== c.name ? `${c.countryName} (${c.name})` : c.name,
                countryName: c.countryName,
                Sessions: c.sessions,
                Actions: c.actions,
                "Avg (ms)": Math.round(c.avgDur),
                "P90 (ms)": Math.round(c.p90),
                Errors: c.errors,
                "Error %": c.errRate,
                Apdex: c.apdex,
                Cities: c.cities.length,
              }))}
              columns={[
                { id: "Country", header: "Country", accessor: "Country", cell: ({ value, row }: any) => {
                  const cName = row?.original?.countryName;
                  return <a href={sessionsFilterUrl(frontend, cName)} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, textDecoration: "none", fontWeight: 600 }}>{value} ↗</a>;
                }},
                { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
                { id: "Actions", header: "Actions", accessor: "Actions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
                { id: "Avg (ms)", header: "Avg Duration", accessor: "Avg (ms)", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 3000 ? RED : value > 1000 ? YELLOW : undefined }}>{fmt(value)}</Text> },
                { id: "P90 (ms)", header: "P90", accessor: "P90 (ms)", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 4000 ? RED : value > 2000 ? YELLOW : undefined }}>{fmt(value)}</Text> },
                { id: "Errors", header: "Errors", accessor: "Errors", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 0 ? RED : GREEN }}>{value}</Strong> },
                { id: "Error %", header: "Error %", accessor: "Error %", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 5 ? RED : value > 1 ? YELLOW : GREEN }}>{fmtPct(value)}</Text> },
                { id: "Apdex", header: "Apdex", accessor: "Apdex", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: apdexClr(value) }}>{value.toFixed(2)}</Strong> },
                { id: "Cities", header: "Cities", accessor: "Cities", sortType: "number" as any },
              ]}
            />
          </div>

          {/* City-level drill-down */}
          <SectionHeader title="City-Level Detail" />
          <div className="uj-table-tile">
            <DataTable
              sortable
              data={rows.map((r: any) => {
                const sat = Number(r.satisfied ?? 0);
                const tol = Number(r.tolerating ?? 0);
                const actions = Number(r.actions ?? 0);
                return {
                  Country: String(r.country ?? "Unknown"),
                  City: String(r.city ?? "Unknown"),
                  Sessions: Number(r.sessions ?? 0),
                  Actions: actions,
                  "Avg (ms)": Math.round(Number(r.avg_dur ?? 0)),
                  Errors: Number(r.errors ?? 0),
                  Apdex: calcApdex(sat, tol, actions),
                };
              })}
              columns={[
                { id: "Country", header: "Country", accessor: "Country" },
                { id: "City", header: "City", accessor: "City", cell: ({ value }: any) => <Strong>{value}</Strong> },
                { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
                { id: "Avg (ms)", header: "Avg Duration", accessor: "Avg (ms)", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 3000 ? RED : value > 1000 ? YELLOW : undefined }}>{fmt(value)}</Text> },
                { id: "Errors", header: "Errors", accessor: "Errors", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 0 ? RED : GREEN }}>{value}</Strong> },
                { id: "Apdex", header: "Apdex", accessor: "Apdex", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: apdexClr(value) }}>{value.toFixed(2)}</Strong> },
              ]}
            />
          </div>
        </>
      )}
    </Flex>
  );
}

// ===========================================================================
// TAB: Map — Real choropleth with d3-geo + world-atlas / us-atlas
// ===========================================================================
import { ISO_ALPHA2_TO_NUMERIC, ISO_NUMERIC_TO_ALPHA2 } from "../worldMapPaths";
import { geoNaturalEarth1, geoPath, geoAlbersUsa } from "d3-geo";
import { feature } from "topojson-client";
import worldAtlas from "world-atlas/countries-110m.json";
import usAtlas from "us-atlas/states-10m.json";

const worldGeo = feature(worldAtlas as any, (worldAtlas as any).objects.countries);
const projection = geoNaturalEarth1().fitSize([960, 500], worldGeo as any);
const pathGen = geoPath().projection(projection);

const usGeo = feature(usAtlas as any, (usAtlas as any).objects.states);
const usProjection = geoAlbersUsa().fitSize([960, 500], usGeo as any);
const usPathGen = geoPath().projection(usProjection);

// FIPS code to state abbreviation mapping
const FIPS_TO_STATE: Record<string, string> = {
  "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE",
  "11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA",
  "20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN",
  "28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM",
  "36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI",
  "45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA",
  "54":"WV","55":"WI","56":"WY","60":"AS","66":"GU","69":"MP","72":"PR","78":"VI",
};
const STATE_TO_NAME: Record<string, string> = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",
  CT:"Connecticut",DE:"Delaware",DC:"District of Columbia",FL:"Florida",GA:"Georgia",
  HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",
  LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",
  MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",
  NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",
  OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",
  SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",
  WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",PR:"Puerto Rico",
};

type MapMetric = "sessions" | "avgDur" | "apdex" | "errRate" | "lcp" | "cls" | "inp";
type MapView = "world" | "us";

function WorldMapTab({ data, isLoading, frontend, defaultView = "world" }: { data: any; isLoading: boolean; frontend: string; defaultView?: MapView }) {
  const [metric, setMetric] = useState<MapMetric>("sessions");
  const [mapView, setMapView] = useState<MapView>(defaultView);
  const [animKey, setAnimKey] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hasUserChanged, setHasUserChanged] = useState(false);
  // Sync with saved default if user hasn't manually changed yet
  useEffect(() => { if (!hasUserChanged) setMapView(defaultView); }, [defaultView, hasUserChanged]);
  if (isLoading) return <Loading />;

  const rows = (data.data?.records ?? []) as any[];

  // Aggregate by ISO alpha-2 country code
  const countryMap = new Map<string, { sessions: number; actions: number; avgDur: number; errors: number; sat: number; tol: number; fru: number; lcpSum: number; lcpCount: number; clsSum: number; clsCount: number; inpSum: number; inpCount: number; countryName: string }>();
  rows.forEach((r: any) => {
    const country = String(r.country ?? "").toUpperCase();
    if (!country) return;
    const cName = String(r.country_name ?? country);
    const d = countryMap.get(country) ?? { sessions: 0, actions: 0, avgDur: 0, errors: 0, sat: 0, tol: 0, fru: 0, lcpSum: 0, lcpCount: 0, clsSum: 0, clsCount: 0, inpSum: 0, inpCount: 0, countryName: cName };
    const actions = Number(r.actions ?? 0);
    d.sessions += Number(r.sessions ?? 0);
    d.avgDur = d.actions > 0 ? (d.avgDur * d.actions + Number(r.avg_dur ?? 0) * actions) / (d.actions + actions) : Number(r.avg_dur ?? 0);
    d.actions += actions;
    d.errors += Number(r.errors ?? 0);
    d.sat += Number(r.satisfied ?? 0);
    d.tol += Number(r.tolerating ?? 0);
    d.fru += Number(r.frustrated ?? 0);
    const lcpVal = r.lcp_avg != null ? Number(r.lcp_avg) : NaN;
    if (!isNaN(lcpVal)) { d.lcpSum += lcpVal * actions; d.lcpCount += actions; }
    const clsVal = r.cls_avg != null ? Number(r.cls_avg) : NaN;
    if (!isNaN(clsVal)) { d.clsSum += clsVal * actions; d.clsCount += actions; }
    const inpVal = r.inp_avg != null ? Number(r.inp_avg) : NaN;
    if (!isNaN(inpVal)) { d.inpSum += inpVal * actions; d.inpCount += actions; }
    if (!d.countryName || d.countryName === country) d.countryName = cName;
    countryMap.set(country, d);
  });

  const countries = Array.from(countryMap.entries()).map(([iso, d]) => ({
    iso,
    numericId: ISO_ALPHA2_TO_NUMERIC[iso] ?? "",
    ...d,
    apdex: calcApdex(d.sat, d.tol, d.actions),
    errRate: d.actions > 0 ? (d.errors / d.actions) * 100 : 0,
    lcp: d.lcpCount > 0 ? d.lcpSum / d.lcpCount : NaN,
    cls: d.clsCount > 0 ? d.clsSum / d.clsCount : NaN,
    inp: d.inpCount > 0 ? d.inpSum / d.inpCount : NaN,
  }));

  // Build lookup by numeric ID for the map features
  const dataByNumericId = new Map(countries.map((c) => [c.numericId, c]));

  const getValue = (c: typeof countries[0]): number => {
    switch (metric) {
      case "sessions": return c.sessions;
      case "avgDur": return c.avgDur;
      case "apdex": return c.apdex;
      case "errRate": return c.errRate;
      case "lcp": return isNaN(c.lcp) ? 0 : c.lcp;
      case "cls": return isNaN(c.cls) ? 0 : c.cls;
      case "inp": return isNaN(c.inp) ? 0 : c.inp;
    }
  };

  const values = countries.map(getValue);
  const maxVal = Math.max(...values, 1);

  const getColor = (c: typeof countries[0]): string => {
    const v = getValue(c);
    switch (metric) {
      case "sessions": {
        const intensity = maxVal > 0 ? v / maxVal : 0;
        const r = Math.round(20 + intensity * 35);
        const g = Math.round(80 + intensity * 57);
        const b = Math.round(120 + intensity * 135);
        return `rgb(${r}, ${g}, ${b})`;
      }
      case "avgDur": return v > 3000 ? RED : v > 1500 ? ORANGE : v > 800 ? YELLOW : GREEN;
      case "apdex": return apdexClr(v);
      case "errRate": return v > 5 ? RED : v > 2 ? ORANGE : v > 0.5 ? YELLOW : GREEN;
      case "lcp": return v > CWV.lcp.poor ? RED : v > CWV.lcp.good ? ORANGE : GREEN;
      case "cls": return v > CWV.cls.poor ? RED : v > CWV.cls.good ? ORANGE : GREEN;
      case "inp": return v > CWV.inp.poor ? RED : v > CWV.inp.good ? ORANGE : GREEN;
    }
  };

  const formatValue = (c: typeof countries[0]): string => {
    const v = getValue(c);
    switch (metric) {
      case "sessions": return fmtCount(v);
      case "avgDur": return fmt(v);
      case "apdex": return v.toFixed(2);
      case "errRate": return fmtPct(v);
      case "lcp": return fmt(v);
      case "cls": return v.toFixed(3);
      case "inp": return fmt(v);
    }
  };

  const metricLabel: Record<MapMetric, string> = {
    sessions: "Session Count",
    avgDur: "Avg Duration",
    apdex: "Apdex Score",
    errRate: "Error Rate %",
    lcp: "LCP (ms)",
    cls: "CLS",
    inp: "INP (ms)",
  };

  const handleMetricChange = (m: MapMetric) => {
    setMetric(m);
    setAnimKey((k) => k + 1);
  };

  const animCSS = `
    @keyframes uj-map-fadein { from { opacity: 0; } to { opacity: 1; } }
    @keyframes uj-country-reveal { 0% { opacity: 0; } 100% { opacity: 1; } }
    .uj-worldmap { animation: uj-map-fadein 0.5s ease-out both; }
    .uj-country-path { animation: uj-country-reveal 0.6s ease-out both; transition: fill 0.4s ease, stroke 0.15s ease, opacity 0.15s ease; }
    .uj-country-path:hover { stroke: rgba(255,255,255,0.8) !important; stroke-width: 1.5px !important; filter: brightness(1.3); }
    .uj-country-empty { fill: rgba(255,255,255,0.04); stroke: rgba(255,255,255,0.08); stroke-width: 0.3px; }
    .uj-country-empty:hover { fill: rgba(255,255,255,0.08); stroke: rgba(255,255,255,0.2); }
  `;

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      <style>{animCSS}</style>
      <Flex alignItems="center" justifyContent="space-between">
        <SectionHeader title="Map" />
        <Flex alignItems="center" gap={8}>
          <Text style={{ fontSize: 11, opacity: 0.5 }}>View</Text>
          <Select value={mapView} onChange={(val) => { if (val) { setMapView(val as MapView); setHasUserChanged(true); setAnimKey(k => k + 1); } }}>
            <Select.Trigger style={{ minWidth: 120 }} />
            <Select.Content>
              <Select.Option value="world">World</Select.Option>
              <Select.Option value="us">United States</Select.Option>
            </Select.Content>
          </Select>
        </Flex>
      </Flex>
      <Flex alignItems="center" gap={16}>
        <Text style={{ fontSize: 12, opacity: 0.7 }}>Colorize by:</Text>
        <Flex gap={8}>
          {(["sessions", "avgDur", "apdex", "errRate", "lcp", "cls", "inp"] as MapMetric[]).map((m) => (
            <button
              key={m}
              onClick={() => handleMetricChange(m)}
              style={{
                padding: "6px 14px", borderRadius: 6, border: "1px solid",
                borderColor: metric === m ? BLUE : "rgba(255,255,255,0.15)",
                background: metric === m ? `${BLUE}22` : "transparent",
                color: metric === m ? BLUE : "rgba(255,255,255,0.6)",
                fontSize: 12, fontWeight: metric === m ? 700 : 400, cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              {metricLabel[m]}
            </button>
          ))}
        </Flex>
      </Flex>

      {mapView === "world" && (countries.length === 0 ? (
        <div className="uj-table-tile" style={{ padding: 24 }}><Text>No geographic data available</Text></div>
      ) : (
        <>
          <div style={{ background: "rgba(6,10,20,0.95)", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="uj-worldmap" key={animKey}>
              <svg viewBox="0 0 960 500" style={{ width: "100%", display: "block" }}>
                <defs>
                  <radialGradient id="uj-ocean" cx="50%" cy="40%" r="70%">
                    <stop offset="0%" stopColor="rgba(12,18,35,1)" />
                    <stop offset="100%" stopColor="rgba(4,8,16,1)" />
                  </radialGradient>
                </defs>
                <rect width="960" height="500" fill="url(#uj-ocean)" rx="8" />

                {/* Render all country features from real geographic data */}
                {(worldGeo as any).features.map((feat: any, idx: number) => {
                  const numId = String(feat.id);
                  const alpha2 = ISO_NUMERIC_TO_ALPHA2[numId] ?? "";
                  const c = dataByNumericId.get(numId);
                  const d = pathGen(feat) ?? "";
                  const isHovered = hoveredId === numId;
                  const delay = Math.min(idx * 0.008, 0.8);

                  if (c) {
                    return (
                      <a key={numId} href={sessionsFilterUrl(frontend, c.countryName)} target="_blank" rel="noopener noreferrer">
                        <path
                          d={d}
                          fill={getColor(c)}
                          stroke={isHovered ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.2)"}
                          strokeWidth={isHovered ? 1.5 : 0.5}
                          className="uj-country-path"
                          style={{ animationDelay: `${delay}s`, cursor: "pointer" }}
                          onMouseEnter={() => setHoveredId(numId)}
                          onMouseLeave={() => setHoveredId(null)}
                        >
                          <title>{`${c.countryName} (${c.iso})\n${metricLabel[metric]}: ${formatValue(c)}\nSessions: ${fmtCount(c.sessions)}\nApdex: ${c.apdex.toFixed(2)}\nAvg Duration: ${fmt(c.avgDur)}\nError Rate: ${fmtPct(c.errRate)}`}</title>
                        </path>
                      </a>
                    );
                  }
                  return (
                    <path key={numId} d={d} className="uj-country-empty uj-country-path" style={{ animationDelay: `${delay}s` }}>
                      <title>{feat.properties?.name ?? alpha2 ?? numId} — No data</title>
                    </path>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Legend */}
          <Flex gap={12} flexWrap="wrap" alignItems="center" style={{ paddingLeft: 8 }}>
            <Text style={{ fontSize: 11, opacity: 0.5 }}>Legend ({metricLabel[metric]}):</Text>
            {metric === "sessions" && <>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: "rgb(30, 90, 140)" }} /><Text style={{ fontSize: 10 }}>Low</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: "rgb(38, 108, 188)" }} /><Text style={{ fontSize: 10 }}>Medium</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: "rgb(55, 137, 255)" }} /><Text style={{ fontSize: 10 }}>High</Text></Flex>
            </>}
            {metric === "avgDur" && <>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: GREEN }} /><Text style={{ fontSize: 10 }}>&lt;800ms</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: YELLOW }} /><Text style={{ fontSize: 10 }}>800-1500ms</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: ORANGE }} /><Text style={{ fontSize: 10 }}>1500-3000ms</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: RED }} /><Text style={{ fontSize: 10 }}>&gt;3000ms</Text></Flex>
            </>}
            {metric === "apdex" && <>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: RED }} /><Text style={{ fontSize: 10 }}>&lt;0.5</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: ORANGE }} /><Text style={{ fontSize: 10 }}>0.5-0.7</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: YELLOW }} /><Text style={{ fontSize: 10 }}>0.7-0.85</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: GREEN }} /><Text style={{ fontSize: 10 }}>&gt;0.85</Text></Flex>
            </>}
            {metric === "errRate" && <>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: GREEN }} /><Text style={{ fontSize: 10 }}>&lt;0.5%</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: YELLOW }} /><Text style={{ fontSize: 10 }}>0.5-2%</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: ORANGE }} /><Text style={{ fontSize: 10 }}>2-5%</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: RED }} /><Text style={{ fontSize: 10 }}>&gt;5%</Text></Flex>
            </>}
            {metric === "lcp" && <>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: GREEN }} /><Text style={{ fontSize: 10 }}>Good ≤{CWV.lcp.good}ms</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: ORANGE }} /><Text style={{ fontSize: 10 }}>Needs Improvement</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: RED }} /><Text style={{ fontSize: 10 }}>Poor &gt;{CWV.lcp.poor}ms</Text></Flex>
            </>}
            {metric === "cls" && <>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: GREEN }} /><Text style={{ fontSize: 10 }}>Good ≤{CWV.cls.good}</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: ORANGE }} /><Text style={{ fontSize: 10 }}>Needs Improvement</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: RED }} /><Text style={{ fontSize: 10 }}>Poor &gt;{CWV.cls.poor}</Text></Flex>
            </>}
            {metric === "inp" && <>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: GREEN }} /><Text style={{ fontSize: 10 }}>Good ≤{CWV.inp.good}ms</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: ORANGE }} /><Text style={{ fontSize: 10 }}>Needs Improvement</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: RED }} /><Text style={{ fontSize: 10 }}>Poor &gt;{CWV.inp.poor}ms</Text></Flex>
            </>}
            <Text style={{ fontSize: 10, opacity: 0.3, marginLeft: 8 }}>({countries.length} countries with data)</Text>
          </Flex>

          {/* Ranked table */}
          <SectionHeader title={`Countries Ranked by ${metricLabel[metric]}`} />
          <div className="uj-table-tile">
            <DataTable
              sortable
              data={[...countries].sort((a, b) => getValue(b) - getValue(a)).map((c) => ({
                Country: `${c.countryName} (${c.iso})`,
                countryName: c.countryName,
                Sessions: c.sessions,
                "Avg Duration": Math.round(c.avgDur),
                Apdex: c.apdex,
                "Error %": c.errRate,
                LCP: isNaN(c.lcp) ? null : Math.round(c.lcp),
                CLS: isNaN(c.cls) ? null : c.cls,
                INP: isNaN(c.inp) ? null : Math.round(c.inp),
              }))}
              columns={[
                { id: "Country", header: "Country", accessor: "Country", cell: ({ value, row }: any) => {
                  const cName = row?.original?.countryName;
                  return <a href={sessionsFilterUrl(frontend, cName)} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, textDecoration: "none", fontWeight: 600 }}>{value} ↗</a>;
                }},
                { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ fontWeight: metric === "sessions" ? 700 : 400, color: metric === "sessions" ? BLUE : undefined }}>{fmtCount(value)}</Text> },
                { id: "Avg Duration", header: "Avg Duration", accessor: "Avg Duration", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ fontWeight: metric === "avgDur" ? 700 : 400, color: value > 3000 ? RED : value > 1000 ? YELLOW : GREEN }}>{fmt(value)}</Text> },
                { id: "Apdex", header: "Apdex", accessor: "Apdex", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: apdexClr(value), fontWeight: metric === "apdex" ? 700 : 400 }}>{value.toFixed(2)}</Strong> },
                { id: "Error %", header: "Error %", accessor: "Error %", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ fontWeight: metric === "errRate" ? 700 : 400, color: value > 5 ? RED : value > 1 ? YELLOW : GREEN }}>{fmtPct(value)}</Text> },
                { id: "LCP", header: "LCP (ms)", accessor: "LCP", sortType: "number" as any, cell: ({ value }: any) => value == null ? <Text style={{ opacity: 0.3 }}>—</Text> : <Text style={{ fontWeight: metric === "lcp" ? 700 : 400, color: value > CWV.lcp.poor ? RED : value > CWV.lcp.good ? ORANGE : GREEN }}>{fmt(value)}</Text> },
                { id: "CLS", header: "CLS", accessor: "CLS", sortType: "number" as any, cell: ({ value }: any) => value == null ? <Text style={{ opacity: 0.3 }}>—</Text> : <Text style={{ fontWeight: metric === "cls" ? 700 : 400, color: value > CWV.cls.poor ? RED : value > CWV.cls.good ? ORANGE : GREEN }}>{value.toFixed(3)}</Text> },
                { id: "INP", header: "INP (ms)", accessor: "INP", sortType: "number" as any, cell: ({ value }: any) => value == null ? <Text style={{ opacity: 0.3 }}>—</Text> : <Text style={{ fontWeight: metric === "inp" ? 700 : 400, color: value > CWV.inp.poor ? RED : value > CWV.inp.good ? ORANGE : GREEN }}>{fmt(value)}</Text> },
              ]}
            />
          </div>
        </>
      ))}

      {mapView === "us" && (() => {
        // Build state-level data from rows with US country code
        const usRows = rows.filter((r: any) => String(r.country ?? "").toUpperCase() === "US");

        // Aggregate US-level totals
        const usTotals = { sessions: 0, actions: 0, errors: 0, sat: 0, tol: 0, fru: 0 };
        usRows.forEach((r: any) => {
          usTotals.sessions += Number(r.sessions ?? 0);
          usTotals.actions += Number(r.actions ?? 0);
          usTotals.errors += Number(r.errors ?? 0);
          usTotals.sat += Number(r.satisfied ?? 0);
          usTotals.tol += Number(r.tolerating ?? 0);
          usTotals.fru += Number(r.frustrated ?? 0);
        });

        // Try to build per-state data if geo.region.iso_code available
        const stateMap = new Map<string, { sessions: number; actions: number; avgDur: number; errors: number; sat: number; tol: number; fru: number; stateName: string }>();
        const hasRegionData = usRows.some((r: any) => r.region && String(r.region).startsWith("US-"));
        if (hasRegionData) {
          usRows.forEach((r: any) => {
            const region = String(r.region ?? "");
            const stateCode = region.replace("US-", "");
            if (!stateCode) return;
            const stateName = STATE_TO_NAME[stateCode] ?? stateCode;
            const actions = Number(r.actions ?? 0);
            const d = stateMap.get(stateCode) ?? { sessions: 0, actions: 0, avgDur: 0, errors: 0, sat: 0, tol: 0, fru: 0, stateName };
            d.sessions += Number(r.sessions ?? 0);
            d.avgDur = d.actions > 0 ? (d.avgDur * d.actions + Number(r.avg_dur ?? 0) * actions) / (d.actions + actions) : Number(r.avg_dur ?? 0);
            d.actions += actions;
            d.errors += Number(r.errors ?? 0);
            d.sat += Number(r.satisfied ?? 0);
            d.tol += Number(r.tolerating ?? 0);
            d.fru += Number(r.frustrated ?? 0);
            stateMap.set(stateCode, d);
          });
        }

        const states = Array.from(stateMap.entries()).map(([code, d]) => ({
          code,
          ...d,
          apdex: calcApdex(d.sat, d.tol, d.actions),
          errRate: d.actions > 0 ? (d.errors / d.actions) * 100 : 0,
        }));

        const stateDataByFips = new Map<string, typeof states[0]>();
        for (const s of states) {
          const fips = Object.entries(FIPS_TO_STATE).find(([, abbr]) => abbr === s.code)?.[0];
          if (fips) stateDataByFips.set(fips, s);
        }

        const getStateValue = (s: typeof states[0]): number => {
          switch (metric) {
            case "sessions": return s.sessions;
            case "avgDur": return s.avgDur;
            case "apdex": return s.apdex;
            case "errRate": return s.errRate;
            default: return s.sessions;
          }
        };

        const stateValues = states.map(getStateValue);
        const stateMaxVal = Math.max(...stateValues, 1);

        const getStateColor = (s: typeof states[0]): string => {
          const v = getStateValue(s);
          switch (metric) {
            case "sessions": {
              const intensity = stateMaxVal > 0 ? v / stateMaxVal : 0;
              return `rgb(${Math.round(20 + intensity * 35)}, ${Math.round(80 + intensity * 57)}, ${Math.round(120 + intensity * 135)})`;
            }
            case "avgDur": return v > 3000 ? RED : v > 1500 ? ORANGE : v > 800 ? YELLOW : GREEN;
            case "apdex": return apdexClr(v);
            case "errRate": return v > 5 ? RED : v > 2 ? ORANGE : v > 0.5 ? YELLOW : GREEN;
            default: return BLUE;
          }
        };

        const usApdex = calcApdex(usTotals.sat, usTotals.tol, usTotals.actions);

        return (
          <>
            <div style={{ padding: "16px 20px", background: "rgba(69,137,255,0.08)", borderRadius: 8, border: "1px solid rgba(69,137,255,0.2)", marginBottom: 8 }}>
              <Strong style={{ fontSize: 13 }}>Coming Soon</Strong>
              <Text style={{ opacity: 0.6, marginLeft: 8, fontSize: 12 }}>US state-level map visualization is under development. Currently showing aggregate US data from the world map query.</Text>
            </div>
            <Flex gap={16} flexWrap="wrap">
              <div className="uj-kpi-card">
                <Text className="uj-kpi-label">US Sessions</Text>
                <Heading level={2} className="uj-kpi-value" style={{ color: BLUE }}>{fmtCount(usTotals.sessions)}</Heading>
              </div>
              <div className="uj-kpi-card">
                <Text className="uj-kpi-label">US Apdex</Text>
                <Heading level={2} className="uj-kpi-value" style={{ color: apdexClr(usApdex) }}>{usApdex.toFixed(2)}</Heading>
              </div>
              <div className="uj-kpi-card">
                <Text className="uj-kpi-label">States with Data</Text>
                <Heading level={2} className="uj-kpi-value" style={{ color: PURPLE }}>{states.length}</Heading>
              </div>
            </Flex>

            <div style={{ background: "rgba(6,10,20,0.95)", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="uj-worldmap" key={`us-${animKey}`}>
                <svg viewBox="0 0 960 600" style={{ width: "100%", display: "block" }}>
                  <defs>
                    <radialGradient id="uj-us-ocean" cx="50%" cy="40%" r="70%">
                      <stop offset="0%" stopColor="rgba(12,18,35,1)" />
                      <stop offset="100%" stopColor="rgba(4,8,16,1)" />
                    </radialGradient>
                  </defs>
                  <rect width="960" height="600" fill="url(#uj-us-ocean)" rx="8" />
                  {(usGeo as any).features.map((feat: any, idx: number) => {
                    const fipsId = String(feat.id);
                    const stateAbbr = FIPS_TO_STATE[fipsId] ?? "";
                    const stateData = stateDataByFips.get(fipsId);
                    const d = usPathGen(feat) ?? "";
                    const isHovered = hoveredId === fipsId;
                    const delay = Math.min(idx * 0.02, 0.8);
                    const stateName = STATE_TO_NAME[stateAbbr] ?? feat.properties?.name ?? stateAbbr;

                    if (stateData) {
                      return (
                        <a key={fipsId} href={sessionsFilterUrl(frontend, stateName)} target="_blank" rel="noopener noreferrer">
                          <path
                            d={d}
                            fill={getStateColor(stateData)}
                            stroke={isHovered ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.25)"}
                            strokeWidth={isHovered ? 1.5 : 0.5}
                            className="uj-country-path"
                            style={{ animationDelay: `${delay}s`, cursor: "pointer" }}
                            onMouseEnter={() => setHoveredId(fipsId)}
                            onMouseLeave={() => setHoveredId(null)}
                          >
                            <title>{`${stateName} (${stateAbbr})\nSessions: ${fmtCount(stateData.sessions)}\nApdex: ${stateData.apdex.toFixed(2)}`}</title>
                          </path>
                        </a>
                      );
                    }
                    return (
                      <path key={fipsId} d={d} className="uj-country-empty uj-country-path" style={{ animationDelay: `${delay}s` }}>
                        <title>{`${stateName} (${stateAbbr}) — No data`}</title>
                      </path>
                    );
                  })}
                </svg>
              </div>
            </div>

            {states.length === 0 && (
              <div className="uj-table-tile" style={{ padding: 16 }}>
                <Text style={{ opacity: 0.6 }}>No state-level data available. The US map requires <code>geo.region.iso_code</code> data (e.g., "US-CA") in RUM events. Total US sessions: {fmtCount(usTotals.sessions)}.</Text>
              </div>
            )}

            {states.length > 0 && (
              <>
                <SectionHeader title={`States Ranked by ${metricLabel[metric]}`} />
                <div className="uj-table-tile">
                  <DataTable
                    sortable
                    data={[...states].sort((a, b) => getStateValue(b) - getStateValue(a)).map((s) => ({
                      State: `${s.stateName} (${s.code})`,
                      stateName: s.stateName,
                      Sessions: s.sessions,
                      "Avg Duration": Math.round(s.avgDur),
                      Apdex: s.apdex,
                      "Error %": s.errRate,
                    }))}
                    columns={[
                      { id: "State", header: "State", accessor: "State", cell: ({ value, row }: any) => {
                        const sName = row?.original?.stateName;
                        return <a href={sessionsFilterUrl(frontend, sName)} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, textDecoration: "none", fontWeight: 600 }}>{value} ↗</a>;
                      }},
                      { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ fontWeight: metric === "sessions" ? 700 : 400, color: metric === "sessions" ? BLUE : undefined }}>{fmtCount(value)}</Text> },
                      { id: "Avg Duration", header: "Avg Duration", accessor: "Avg Duration", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ fontWeight: metric === "avgDur" ? 700 : 400, color: value > 3000 ? RED : value > 1000 ? YELLOW : GREEN }}>{fmt(value)}</Text> },
                      { id: "Apdex", header: "Apdex", accessor: "Apdex", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: apdexClr(value), fontWeight: metric === "apdex" ? 700 : 400 }}>{value.toFixed(2)}</Strong> },
                      { id: "Error %", header: "Error %", accessor: "Error %", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ fontWeight: metric === "errRate" ? 700 : 400, color: value > 5 ? RED : value > 1 ? YELLOW : GREEN }}>{fmtPct(value)}</Text> },
                    ]}
                  />
                </div>
              </>
            )}
          </>
        );
      })()}
    </Flex>
  );
}

// ===========================================================================
// TAB: Navigation Paths — NEW
// ===========================================================================
function NavigationPathsTab({ data, isLoading, appEntityId, steps }: { data: any; isLoading: boolean; appEntityId: string; steps: StepDef[] }) {
  if (isLoading) return <Loading />;

  const paths = (data.data?.records ?? []) as any[];
  const totalTransitions = paths.reduce((a: number, p: any) => a + Number(p.occurrences ?? 0), 0);
  const uniquePaths = paths.length;
  const avgDepth = paths.length > 0 ? paths.reduce((a: number, p: any) => a + Number(p.avg_depth ?? 0), 0) / paths.length : 0;

  // Group by source page (step1) for a flow view
  const sourceMap = new Map<string, { targets: { name: string; count: number }[]; total: number }>();
  paths.forEach((p: any) => {
    const src = String(p.step1 ?? "unknown");
    const tgt = String(p.step2 ?? "unknown");
    const count = Number(p.occurrences ?? 0);
    const d = sourceMap.get(src) ?? { targets: [], total: 0 };
    d.targets.push({ name: tgt, count });
    d.total += count;
    sourceMap.set(src, d);
  });
  const sources = Array.from(sourceMap.entries())
    .map(([name, d]) => ({ name, ...d, targets: d.targets.sort((a, b) => b.count - a.count) }))
    .sort((a, b) => b.total - a.total);

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      <SectionHeader title="Navigation Paths Analysis" />
      <Text style={{ fontSize: 12, opacity: 0.5 }}>Actual user navigation flows. Reveals unexpected paths, loops, and exit points outside the intended funnel.</Text>

      {/* KPIs */}
      <Flex gap={16} flexWrap="wrap">
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Total Transitions</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: BLUE }}>{fmtCount(totalTransitions)}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Unique Paths</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: PURPLE }}>{uniquePaths}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Avg Session Depth</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: CYAN }}>{avgDepth.toFixed(1)} pages</Heading>
        </div>
      </Flex>

      {paths.length === 0 ? (
        <div className="uj-table-tile" style={{ padding: 24 }}><Text>No navigation path data available</Text></div>
      ) : (
        <>
          {/* Flow visualization */}
          <SectionHeader title="Top Navigation Flows" />
          <Flex flexDirection="column" gap={12}>
            {sources.slice(0, 8).map((src) => (
              <div key={src.name} className="uj-flow-card">
                <Flex alignItems="center" gap={8} style={{ marginBottom: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: BLUE }} />
                  {appEntityId ? (
                    <a href={vitalsUrl(appEntityId, src.name)} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
                      {src.name.length > 60 ? src.name.substring(0, 60) + "..." : src.name} ↗
                    </a>
                  ) : (
                    <Strong style={{ fontSize: 13 }}>{src.name.length > 60 ? src.name.substring(0, 60) + "..." : src.name}</Strong>
                  )}
                  <Text style={{ fontSize: 10, opacity: 0.4, marginLeft: "auto" }}>{fmtCount(src.total)} transitions</Text>
                </Flex>
                <Flex flexDirection="column" gap={4} style={{ paddingLeft: 20 }}>
                  {src.targets.slice(0, 5).map((t, ti) => {
                    const pct = src.total > 0 ? (t.count / src.total) * 100 : 0;
                    const isFunnel = steps.some((s) => t.name.includes(s.identifier));
                    const color = isFunnel ? GREEN : CYAN;
                    return (
                      <Flex key={ti} alignItems="center" gap={8}>
                        <span style={{ fontSize: 14, color: "rgba(255,255,255,0.3)" }}>→</span>
                        <div style={{ flex: 1 }}>
                          <Flex alignItems="center" gap={6}>
                            {appEntityId ? (
                              <a href={vitalsUrl(appEntityId, t.name)} target="_blank" rel="noopener noreferrer" style={{ color: isFunnel ? GREEN : CYAN, textDecoration: "none", fontSize: 11 }}>
                                {t.name.length > 50 ? t.name.substring(0, 50) + "..." : t.name} ↗
                              </a>
                            ) : (
                              <Text style={{ fontSize: 11 }}>{t.name.length > 50 ? t.name.substring(0, 50) + "..." : t.name}</Text>
                            )}
                            {isFunnel && <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: `${GREEN}18`, color: GREEN }}>funnel</span>}
                          </Flex>
                          <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden", marginTop: 2 }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, opacity: 0.7 }} />
                          </div>
                        </div>
                        <Text style={{ fontSize: 10, fontWeight: 700, color, minWidth: 40, textAlign: "right" }}>{fmtCount(t.count)}</Text>
                        <Text style={{ fontSize: 10, opacity: 0.4, minWidth: 35, textAlign: "right" }}>{fmtPct(pct)}</Text>
                      </Flex>
                    );
                  })}
                  {src.targets.length > 5 && (
                    <Text style={{ fontSize: 10, opacity: 0.4, paddingLeft: 22 }}>+{src.targets.length - 5} more destinations</Text>
                  )}
                </Flex>
              </div>
            ))}
          </Flex>

          {/* Full transition table */}
          <SectionHeader title="All Transitions" />
          <div className="uj-table-tile">
            <DataTable
              sortable
              data={paths.map((p: any) => ({
                From: String(p.step1 ?? "unknown").substring(0, 50),
                fromFull: String(p.step1 ?? "unknown"),
                To: String(p.step2 ?? "unknown").substring(0, 50),
                toFull: String(p.step2 ?? "unknown"),
                Transitions: Number(p.occurrences ?? 0),
                "% of Total": totalTransitions > 0 ? (Number(p.occurrences ?? 0) / totalTransitions) * 100 : 0,
                "Avg Depth": Number(p.avg_depth ?? 0),
              }))}
              columns={[
                { id: "From", header: "From", accessor: "From", cell: ({ value, row }: any) => {
                  const full = row?.original?.fromFull;
                  return appEntityId ? <a href={vitalsUrl(appEntityId, full)} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, textDecoration: "none", fontWeight: 600 }}>{value} ↗</a> : <Strong style={{ color: BLUE }}>{value}</Strong>;
                }},
                { id: "To", header: "To", accessor: "To", cell: ({ value, row }: any) => {
                  const full = row?.original?.toFull;
                  return appEntityId ? <a href={vitalsUrl(appEntityId, full)} target="_blank" rel="noopener noreferrer" style={{ color: CYAN, textDecoration: "none" }}>{value} ↗</a> : <Text>{value}</Text>;
                }},
                { id: "Transitions", header: "Count", accessor: "Transitions", sortType: "number" as any, cell: ({ value }: any) => <Strong>{fmtCount(value)}</Strong> },
                { id: "% of Total", header: "% of Total", accessor: "% of Total", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtPct(value)}</Text> },
                { id: "Avg Depth", header: "Avg Depth", accessor: "Avg Depth", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: CYAN }}>{value.toFixed(1)}</Text> },
              ]}
            />
          </div>
        </>
      )}
    </Flex>
  );
}

// ===========================================================================
// TAB: Anomaly Detection — NEW
// ===========================================================================
function AnomalyDetectionTab({ quality, qualityPrev, overallApdex, overallApdexPrev, funnelCounts, funnelCountsPrev, stepMap, durationDist, isLoading, steps }: { quality: any; qualityPrev: any; overallApdex: number; overallApdexPrev: number; funnelCounts: number[]; funnelCountsPrev: number[]; stepMap: Map<string, any>; durationDist: any; isLoading: boolean; steps: StepDef[] }) {
  if (isLoading) return <Loading />;

  const errorRate = quality.total > 0 ? (quality.errors / quality.total) * 100 : 0;
  const errorRatePrev = qualityPrev.total > 0 ? (qualityPrev.errors / qualityPrev.total) * 100 : 0;
  const lastIdx = steps.length - 1;
  const overallConv = funnelCounts[0] > 0 ? (funnelCounts[lastIdx] / funnelCounts[0]) * 100 : 0;
  const overallConvPrev = funnelCountsPrev[0] > 0 ? (funnelCountsPrev[lastIdx] / funnelCountsPrev[0]) * 100 : 0;
  const fruPct = quality.total > 0 ? (quality.frustrated / quality.total) * 100 : 0;
  const fruPctPrev = qualityPrev.total > 0 ? (qualityPrev.frustrated / qualityPrev.total) * 100 : 0;

  // Anomaly scoring: deviation from previous period
  const anomalies = [
    { metric: "Apdex", current: overallApdex, prev: overallApdexPrev, inverted: false, format: (v: number) => v.toFixed(2), threshold: 0.05 },
    { metric: "Avg Duration", current: quality.avg, prev: qualityPrev.avg, inverted: true, format: fmt, threshold: 0.15 },
    { metric: "P90 Duration", current: quality.p90, prev: qualityPrev.p90, inverted: true, format: fmt, threshold: 0.2 },
    { metric: "Error Rate", current: errorRate, prev: errorRatePrev, inverted: true, format: fmtPct, threshold: 0.3 },
    { metric: "Conversion", current: overallConv, prev: overallConvPrev, inverted: false, format: fmtPct, threshold: 0.1 },
    { metric: "Sessions", current: quality.sessions, prev: qualityPrev.sessions, inverted: false, format: fmtCount, threshold: 0.2 },
    { metric: "Frustrated %", current: fruPct, prev: fruPctPrev, inverted: true, format: fmtPct, threshold: 0.25 },
  ].map((a) => {
    const delta = a.prev > 0 ? (a.current - a.prev) / a.prev : 0;
    const deviation = Math.abs(delta);
    const isAnomaly = deviation > a.threshold;
    const severity = deviation > a.threshold * 3 ? "critical" : deviation > a.threshold * 2 ? "high" : deviation > a.threshold ? "medium" : "normal";
    const improving = a.inverted ? a.current < a.prev : a.current > a.prev;
    return { ...a, delta, deviation, isAnomaly, severity, improving };
  });

  const anomalyCount = anomalies.filter((a) => a.isAnomaly).length;
  const criticalCount = anomalies.filter((a) => a.severity === "critical").length;
  const healthScore = Math.round(((anomalies.length - anomalyCount) / anomalies.length) * 100);

  // Per-step anomalies
  const stepAnomalies = steps.map((step, i) => {
    const m = stepMap.get(step.label);
    const currAvg = m ? Number(m.avg_duration_ms ?? 0) : 0;
    const currErrors = m ? Number(m.error_count ?? 0) : 0;
    const currTotal = m ? Number(m.total_actions ?? 0) : 0;
    const sat = m ? Number(m.satisfied ?? 0) : 0;
    const tol = m ? Number(m.tolerating ?? 0) : 0;
    const apdex = calcApdex(sat, tol, currTotal);
    const prevCount = i === 0 ? funnelCountsPrev[0] : funnelCountsPrev[i];
    const currCount = funnelCounts[i];
    const countDelta = prevCount > 0 ? (currCount - prevCount) / prevCount : 0;
    return { step: step.label, avg: currAvg, errors: currErrors, total: currTotal, apdex, countDelta, isAnomaly: Math.abs(countDelta) > 0.2 };
  });

  // Duration distribution
  const durations = (durationDist.data?.records ?? []) as any[];
  const maxDurActions = Math.max(...durations.map((d: any) => Number(d.actions ?? 0)), 1);

  const severityColor = (s: string) => s === "critical" ? RED : s === "high" ? ORANGE : s === "medium" ? YELLOW : GREEN;
  const severityEmoji = (s: string) => s === "critical" ? "🔴" : s === "high" ? "🟠" : s === "medium" ? "🟡" : "🟢";

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      <SectionHeader title="Anomaly Detection" />
      <Text style={{ fontSize: 12, opacity: 0.5 }}>Flags metrics deviating significantly from baseline (previous period). Anomaly threshold varies per metric type.</Text>

      {/* KPIs */}
      <Flex gap={16} flexWrap="wrap">
        <div className="uj-kpi-card" style={{ minWidth: 160 }}>
          <Text className="uj-kpi-label">Stability Score</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: healthScore >= 80 ? GREEN : healthScore >= 50 ? YELLOW : RED }}>{healthScore}/100</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Anomalies Detected</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: anomalyCount > 3 ? RED : anomalyCount > 0 ? ORANGE : GREEN }}>{anomalyCount}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Critical</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: criticalCount > 0 ? RED : GREEN }}>{criticalCount}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Metrics Monitored</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: BLUE }}>{anomalies.length}</Heading>
        </div>
      </Flex>

      {/* Anomaly cards */}
      <SectionHeader title="Metric Anomaly Status" />
      <Flex gap={12} flexWrap="wrap">
        {anomalies.map((a) => (
          <div key={a.metric} className="uj-anomaly-card" style={{ borderLeftColor: severityColor(a.severity) }}>
            <Flex alignItems="center" justifyContent="space-between" style={{ marginBottom: 6 }}>
              <Strong style={{ fontSize: 13 }}>{a.metric}</Strong>
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: `${severityColor(a.severity)}18`, color: severityColor(a.severity), fontWeight: 700, textTransform: "uppercase" }}>{a.severity}</span>
            </Flex>
            <Flex gap={16} style={{ marginBottom: 6 }}>
              <div><Text style={{ fontSize: 10, opacity: 0.5 }}>Current</Text><Strong style={{ display: "block", fontSize: 15, color: a.isAnomaly ? severityColor(a.severity) : undefined }}>{a.format(a.current)}</Strong></div>
              <div><Text style={{ fontSize: 10, opacity: 0.5 }}>Baseline</Text><Text style={{ display: "block", fontSize: 13, opacity: 0.6 }}>{a.format(a.prev)}</Text></div>
              <div><Text style={{ fontSize: 10, opacity: 0.5 }}>Deviation</Text><Strong style={{ display: "block", color: a.isAnomaly ? severityColor(a.severity) : GREEN }}>{a.improving ? "▲" : "▼"} {(a.deviation * 100).toFixed(1)}%</Strong></div>
            </Flex>
            <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(a.deviation * 100, 100)}%`, background: severityColor(a.severity), borderRadius: 2 }} />
            </div>
          </div>
        ))}
      </Flex>

      {/* Per-step anomalies */}
      <SectionHeader title="Per-Step Traffic Anomalies" />
      <div className="uj-table-tile">
        <DataTable
          sortable
          data={stepAnomalies.map((s) => ({
            Step: s.step,
            Sessions: funnelCounts[steps.findIndex((f) => f.label === s.step)],
            "Avg (ms)": Math.round(s.avg),
            Errors: s.errors,
            Apdex: s.apdex,
            "Traffic Δ": s.countDelta * 100,
            Anomaly: s.isAnomaly ? "YES" : "—",
          }))}
          columns={[
            { id: "Step", header: "Step", accessor: "Step", cell: ({ value }: any) => <Strong>{value}</Strong> },
            { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
            { id: "Avg (ms)", header: "Avg Duration", accessor: "Avg (ms)", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 3000 ? RED : value > 1000 ? YELLOW : undefined }}>{fmt(value)}</Text> },
            { id: "Errors", header: "Errors", accessor: "Errors", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 0 ? RED : GREEN }}>{value}</Strong> },
            { id: "Apdex", header: "Apdex", accessor: "Apdex", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: apdexClr(value) }}>{value.toFixed(2)}</Strong> },
            { id: "Traffic Δ", header: "Traffic Δ", accessor: "Traffic Δ", sortType: "number" as any, cell: ({ value }: any) => {
              const color = Math.abs(value) < 5 ? "rgba(255,255,255,0.4)" : value > 0 ? GREEN : RED;
              return <Strong style={{ color }}>{value >= 0 ? "+" : ""}{value.toFixed(1)}%</Strong>;
            }},
            { id: "Anomaly", header: "Anomaly", accessor: "Anomaly", cell: ({ value }: any) => <Strong style={{ color: value === "YES" ? RED : GREEN }}>{value}</Strong> },
          ]}
        />
      </div>

      {/* Duration distribution histogram */}
      {durations.length > 0 && (
        <>
          <SectionHeader title="Duration Distribution" />
          <Text style={{ fontSize: 12, opacity: 0.5 }}>Action duration buckets. Heavy tails indicate potential performance anomalies.</Text>
          <div className="uj-table-tile" style={{ padding: 16 }}>
            <Flex flexDirection="column" gap={6}>
              {durations.map((d: any, i: number) => {
                const bucket = String(d.dur_bucket ?? "?");
                const actions = Number(d.actions ?? 0);
                const errors = Number(d.errors ?? 0);
                const pct = maxDurActions > 0 ? (actions / maxDurActions) * 100 : 0;
                const errRate = actions > 0 ? (errors / actions) * 100 : 0;
                const color = bucket.includes(">10") || bucket.includes("5-10") ? RED : bucket.includes("3-5") ? ORANGE : bucket.includes("2-3") ? YELLOW : GREEN;
                return (
                  <Flex key={i} alignItems="center" gap={8}>
                    <Text style={{ fontSize: 10, width: 65, textAlign: "right", opacity: 0.6 }}>{bucket}</Text>
                    <div style={{ flex: 1, height: 16, borderRadius: 4, background: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, opacity: 0.7 }} />
                    </div>
                    <Text style={{ fontSize: 10, minWidth: 50, textAlign: "right", color: BLUE }}>{fmtCount(actions)}</Text>
                    {errRate > 0 && <Text style={{ fontSize: 9, minWidth: 40, textAlign: "right", color: RED }}>{fmtPct(errRate)} err</Text>}
                  </Flex>
                );
              })}
            </Flex>
          </div>
        </>
      )}

      {/* Anomaly summary */}
      <SectionHeader title="Diagnosis" />
      <div className="uj-table-tile" style={{ padding: 20 }}>
        {anomalyCount === 0 ? (
          <Flex gap={8} alignItems="center"><span>🟢</span><Text style={{ color: GREEN }}>All metrics within normal range. No anomalies detected.</Text></Flex>
        ) : (
          <Flex flexDirection="column" gap={8}>
            {anomalies.filter((a) => a.isAnomaly).map((a) => (
              <Flex key={a.metric} gap={8} alignItems="flex-start">
                <span>{severityEmoji(a.severity)}</span>
                <div>
                  <Strong style={{ fontSize: 13, color: severityColor(a.severity) }}>{a.metric}: {(a.deviation * 100).toFixed(1)}% deviation ({a.severity})</Strong>
                  <Text style={{ display: "block", fontSize: 11, opacity: 0.6 }}>
                    {a.improving
                      ? `Improving: ${a.format(a.prev)} → ${a.format(a.current)}. Positive change but significant.`
                      : `Regressing: ${a.format(a.prev)} → ${a.format(a.current)}. ${a.severity === "critical" ? "Immediate investigation recommended." : "Monitor closely."}`}
                  </Text>
                </div>
              </Flex>
            ))}
          </Flex>
        )}
      </div>
    </Flex>
  );
}

// ===========================================================================
// TAB: Conversion Attribution — NEW
// ===========================================================================
function ConversionAttributionTab({ data, overallConv, isLoading }: { data: any; isLoading: boolean; overallConv: number }) {
  if (isLoading) return <Loading />;

  const rows = (data.data?.records ?? []) as any[];
  const parsed = rows.map((r: any) => ({
    device: String(r.deviceType ?? "Unknown"),
    browser: String(r.browserName ?? "Unknown"),
    sessions: Number(r.total_sessions ?? 0),
    converted: Number(r.converted_sessions ?? 0),
    convRate: Number(r.conv_rate ?? 0),
    avgDuration: Number(r.avg_duration ?? 0),
    avgMaxDuration: Number(r.avg_max_duration ?? 0),
    avgErrors: Number(r.avg_errors ?? 0),
  }));

  // Aggregate by device
  const deviceMap = new Map<string, { sessions: number; converted: number; avgDur: number; avgErr: number }>();
  parsed.forEach((r) => {
    const d = deviceMap.get(r.device) ?? { sessions: 0, converted: 0, avgDur: 0, avgErr: 0 };
    d.avgDur = d.sessions > 0 ? (d.avgDur * d.sessions + r.avgDuration * r.sessions) / (d.sessions + r.sessions) : r.avgDuration;
    d.avgErr = d.sessions > 0 ? (d.avgErr * d.sessions + r.avgErrors * r.sessions) / (d.sessions + r.sessions) : r.avgErrors;
    d.sessions += r.sessions;
    d.converted += r.converted;
    deviceMap.set(r.device, d);
  });
  const devices = Array.from(deviceMap.entries()).map(([name, d]) => ({
    name, ...d, convRate: d.sessions > 0 ? (d.converted / d.sessions) * 100 : 0,
  })).sort((a, b) => b.sessions - a.sessions);

  // Aggregate by browser
  const browserMap = new Map<string, { sessions: number; converted: number; avgDur: number; avgErr: number }>();
  parsed.forEach((r) => {
    const d = browserMap.get(r.browser) ?? { sessions: 0, converted: 0, avgDur: 0, avgErr: 0 };
    d.avgDur = d.sessions > 0 ? (d.avgDur * d.sessions + r.avgDuration * r.sessions) / (d.sessions + r.sessions) : r.avgDuration;
    d.avgErr = d.sessions > 0 ? (d.avgErr * d.sessions + r.avgErrors * r.sessions) / (d.sessions + r.sessions) : r.avgErrors;
    d.sessions += r.sessions;
    d.converted += r.converted;
    browserMap.set(r.browser, d);
  });
  const browsers = Array.from(browserMap.entries()).map(([name, d]) => ({
    name, ...d, convRate: d.sessions > 0 ? (d.converted / d.sessions) * 100 : 0,
  })).sort((a, b) => b.sessions - a.sessions);

  // Speed attribution buckets
  const fastSessions = parsed.filter((r) => r.avgDuration <= 1000);
  const medSessions = parsed.filter((r) => r.avgDuration > 1000 && r.avgDuration <= 3000);
  const slowSessions = parsed.filter((r) => r.avgDuration > 3000);
  const bucketConv = (arr: typeof parsed) => {
    const total = arr.reduce((a, r) => a + r.sessions, 0);
    const conv = arr.reduce((a, r) => a + r.converted, 0);
    return total > 0 ? (conv / total) * 100 : 0;
  };
  const speedBuckets = [
    { label: "Fast (≤1s)", sessions: fastSessions.reduce((a, r) => a + r.sessions, 0), convRate: bucketConv(fastSessions), color: GREEN },
    { label: "Medium (1-3s)", sessions: medSessions.reduce((a, r) => a + r.sessions, 0), convRate: bucketConv(medSessions), color: YELLOW },
    { label: "Slow (>3s)", sessions: slowSessions.reduce((a, r) => a + r.sessions, 0), convRate: bucketConv(slowSessions), color: RED },
  ];

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      <SectionHeader title="Conversion Attribution Analysis" />
      <Text style={{ fontSize: 12, opacity: 0.5 }}>Identifies which factors (speed, device, browser, errors) most influence conversion success. Overall conversion: <Strong style={{ color: statusClr(overallConv) }}>{fmtPct(overallConv)}</Strong></Text>

      {/* Speed impact */}
      <SectionHeader title="Speed → Conversion Impact" />
      <Text style={{ fontSize: 12, opacity: 0.5 }}>Faster sessions convert at higher rates. Quantifies the revenue impact of performance.</Text>
      <Flex gap={16} flexWrap="wrap">
        {speedBuckets.map((b) => (
          <div key={b.label} className="uj-attribution-card">
            <Flex alignItems="center" gap={8} style={{ marginBottom: 8 }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: b.color }} />
              <Strong style={{ fontSize: 14 }}>{b.label}</Strong>
            </Flex>
            <Flex gap={16}>
              <div><Text style={{ fontSize: 10, opacity: 0.5 }}>Sessions</Text><Strong style={{ display: "block", color: BLUE }}>{fmtCount(b.sessions)}</Strong></div>
              <div><Text style={{ fontSize: 10, opacity: 0.5 }}>Conv Rate</Text><Strong style={{ display: "block", fontSize: 18, color: statusClr(b.convRate) }}>{fmtPct(b.convRate)}</Strong></div>
            </Flex>
            <div style={{ marginTop: 8, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(b.convRate, 100)}%`, background: b.color, borderRadius: 3, opacity: 0.8 }} />
            </div>
          </div>
        ))}
      </Flex>

      {/* Device attribution */}
      <SectionHeader title="Device → Conversion" />
      <div className="uj-table-tile">
        {devices.length === 0 ? <Text style={{ padding: 16 }}>No device data</Text> : (
          <DataTable sortable data={devices.map((d) => ({ Device: d.name, Sessions: d.sessions, Converted: d.converted, "Conv %": d.convRate, "Avg Duration": Math.round(d.avgDur), "Avg Errors": d.avgErr }))}
            columns={[
              { id: "Device", header: "Device", accessor: "Device", cell: ({ value }: any) => <Strong>{value}</Strong> },
              { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
              { id: "Converted", header: "Converted", accessor: "Converted", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: GREEN }}>{fmtCount(value)}</Strong> },
              { id: "Conv %", header: "Conv %", accessor: "Conv %", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: statusClr(value) }}>{fmtPct(value)}</Strong> },
              { id: "Avg Duration", header: "Avg Duration", accessor: "Avg Duration", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 3000 ? RED : value > 1000 ? YELLOW : undefined }}>{fmt(value)}</Text> },
              { id: "Avg Errors", header: "Avg Errors/Session", accessor: "Avg Errors", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 1 ? RED : value > 0 ? ORANGE : GREEN }}>{value.toFixed(2)}</Text> },
            ]}
          />
        )}
      </div>

      {/* Browser attribution */}
      <SectionHeader title="Browser → Conversion" />
      <div className="uj-table-tile">
        {browsers.length === 0 ? <Text style={{ padding: 16 }}>No browser data</Text> : (
          <DataTable sortable data={browsers.map((b) => ({ Browser: b.name, Sessions: b.sessions, Converted: b.converted, "Conv %": b.convRate, "Avg Duration": Math.round(b.avgDur), "Avg Errors": b.avgErr }))}
            columns={[
              { id: "Browser", header: "Browser", accessor: "Browser", cell: ({ value }: any) => <Strong>{value}</Strong> },
              { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
              { id: "Converted", header: "Converted", accessor: "Converted", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: GREEN }}>{fmtCount(value)}</Strong> },
              { id: "Conv %", header: "Conv %", accessor: "Conv %", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: statusClr(value) }}>{fmtPct(value)}</Strong> },
              { id: "Avg Duration", header: "Avg Duration", accessor: "Avg Duration", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 3000 ? RED : value > 1000 ? YELLOW : undefined }}>{fmt(value)}</Text> },
              { id: "Avg Errors", header: "Avg Errors/Session", accessor: "Avg Errors", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 1 ? RED : value > 0 ? ORANGE : GREEN }}>{value.toFixed(2)}</Text> },
            ]}
          />
        )}
      </div>

      {/* Full cross-section */}
      <SectionHeader title="Full Device Ã— Browser Breakdown" />
      <div className="uj-table-tile">
        <DataTable
          sortable
          data={parsed.map((r) => ({
            Device: r.device,
            Browser: r.browser,
            Sessions: r.sessions,
            "Conv %": r.convRate,
            "Avg (ms)": Math.round(r.avgDuration),
            "Avg Errors": r.avgErrors,
          }))}
          columns={[
            { id: "Device", header: "Device", accessor: "Device" },
            { id: "Browser", header: "Browser", accessor: "Browser" },
            { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
            { id: "Conv %", header: "Conv %", accessor: "Conv %", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: statusClr(value) }}>{fmtPct(value)}</Strong> },
            { id: "Avg (ms)", header: "Avg Duration", accessor: "Avg (ms)", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 3000 ? RED : value > 1000 ? YELLOW : undefined }}>{fmt(value)}</Text> },
            { id: "Avg Errors", header: "Avg Errors", accessor: "Avg Errors", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 1 ? RED : value > 0 ? ORANGE : GREEN }}>{value.toFixed(2)}</Text> },
          ]}
        />
      </div>
    </Flex>
  );
}

// ===========================================================================
// TAB: Executive Summary — NEW
// ===========================================================================
function ExecutiveSummaryTab({ quality, qualityPrev, overallApdex, overallApdexPrev, overallConv, overallConvPrev, funnelCounts, funnelCountsPrev, cwv: cwvMetrics, stepMap, isLoading, frontend, steps }: { quality: any; qualityPrev: any; overallApdex: number; overallApdexPrev: number; overallConv: number; overallConvPrev: number; funnelCounts: number[]; funnelCountsPrev: number[]; cwv: { lcp: number; cls: number; inp: number; ttfb: number; load: number }; stepMap: Map<string, any>; isLoading: boolean; frontend: string; steps: StepDef[] }) {
  const [copied, setCopied] = useState(false);
  if (isLoading) return <Loading />;

  const errorRate = quality.total > 0 ? (quality.errors / quality.total) * 100 : 0;
  const errorRatePrev = qualityPrev.total > 0 ? (qualityPrev.errors / qualityPrev.total) * 100 : 0;
  const fruPct = quality.total > 0 ? (quality.frustrated / quality.total) * 100 : 0;

  // Grade calculation
  const gradeMetrics = [
    { label: "Apdex", score: overallApdex >= 0.85 ? 100 : overallApdex >= 0.7 ? 75 : overallApdex >= 0.5 ? 50 : 25, weight: 25 },
    { label: "Conversion", score: overallConv >= 25 ? 100 : overallConv >= 15 ? 75 : overallConv >= 5 ? 50 : 25, weight: 20 },
    { label: "Error Rate", score: errorRate <= 1 ? 100 : errorRate <= 3 ? 75 : errorRate <= 5 ? 50 : 25, weight: 20 },
    { label: "Avg Duration", score: quality.avg <= 1000 ? 100 : quality.avg <= 2000 ? 75 : quality.avg <= 3000 ? 50 : 25, weight: 15 },
    { label: "CWV LCP", score: cwvMetrics.lcp <= 2500 ? 100 : cwvMetrics.lcp <= 4000 ? 75 : 25, weight: 10 },
    { label: "CWV CLS", score: cwvMetrics.cls <= 0.1 ? 100 : cwvMetrics.cls <= 0.25 ? 75 : 25, weight: 10 },
  ];
  const overallGradeNum = gradeMetrics.reduce((a, m) => a + m.score * m.weight, 0) / gradeMetrics.reduce((a, m) => a + m.weight, 0);
  const letterGrade = overallGradeNum >= 90 ? "A" : overallGradeNum >= 80 ? "B" : overallGradeNum >= 65 ? "C" : overallGradeNum >= 50 ? "D" : "F";
  const gradeColor = overallGradeNum >= 80 ? GREEN : overallGradeNum >= 65 ? YELLOW : overallGradeNum >= 50 ? ORANGE : RED;

  // Key highlights
  const highlights: { label: string; value: string; trend: "up" | "down" | "flat"; good: boolean }[] = [
    { label: "Sessions", value: fmtCount(quality.sessions), trend: quality.sessions > qualityPrev.sessions ? "up" : quality.sessions < qualityPrev.sessions ? "down" : "flat", good: quality.sessions >= qualityPrev.sessions },
    { label: "Conversion", value: fmtPct(overallConv), trend: overallConv > overallConvPrev ? "up" : overallConv < overallConvPrev ? "down" : "flat", good: overallConv >= overallConvPrev },
    { label: "Apdex", value: overallApdex.toFixed(2), trend: overallApdex > overallApdexPrev ? "up" : overallApdex < overallApdexPrev ? "down" : "flat", good: overallApdex >= overallApdexPrev },
    { label: "Error Rate", value: fmtPct(errorRate), trend: errorRate < errorRatePrev ? "up" : errorRate > errorRatePrev ? "down" : "flat", good: errorRate <= errorRatePrev },
  ];

  // Bottleneck identification
  const worstStep = steps.slice(1).map((step, i) => {
    const prev = funnelCounts[i]; const curr = funnelCounts[i + 1];
    return { from: steps[i].label, to: step.label, dropOff: prev > 0 ? ((prev - curr) / prev) * 100 : 0 };
  }).sort((a, b) => b.dropOff - a.dropOff)[0];

  // --- Export Report ---
  const generateReportHtml = (): string => {
    const ts = new Date().toLocaleString();
    const gradeClr = overallGradeNum >= 80 ? "#0D9C29" : overallGradeNum >= 65 ? "#FCD53F" : overallGradeNum >= 50 ? "#FF832B" : "#C21930";
    const statusOf = (v: string) => v === "Excellent" || v === "Good" ? "#0D9C29" : v === "Fair" ? "#FCD53F" : v === "Poor" ? "#C21930" : "#888";

    const funnelHtml = steps.map((step, i) => {
      const conv = i > 0 && funnelCounts[i - 1] > 0 ? fmtPct((funnelCounts[i] / funnelCounts[i - 1]) * 100) : "";
      return `<td style="text-align:center;padding:12px 16px"><div style="font-size:11px;color:#888">${step.label}</div><div style="font-size:20px;font-weight:700;color:#4589FF">${fmtCount(funnelCounts[i])}</div>${conv ? `<div style="font-size:11px;color:#888">${conv} conv</div>` : ""}</td>${i < steps.length - 1 ? '<td style="text-align:center;font-size:18px;color:#ccc">→</td>' : ""}`;
    }).join("");

    const perfRows = [
      { m: "Total Sessions", v: fmtCount(quality.sessions), s: "—" },
      { m: "Total Actions", v: fmtCount(quality.total), s: "—" },
      { m: "Apdex", v: overallApdex.toFixed(2), s: apdexLabel(overallApdex) },
      { m: "Avg Duration", v: fmt(quality.avg), s: quality.avg <= 2000 ? "Good" : quality.avg <= 3000 ? "Fair" : "Poor" },
      { m: "P50 Duration", v: fmt(quality.p50), s: quality.p50 <= 1500 ? "Good" : quality.p50 <= 2500 ? "Fair" : "Poor" },
      { m: "P90 Duration", v: fmt(quality.p90), s: quality.p90 <= 4000 ? "Good" : quality.p90 <= 6000 ? "Fair" : "Poor" },
      { m: "Error Rate", v: fmtPct(errorRate), s: errorRate <= 2 ? "Good" : errorRate <= 5 ? "Fair" : "Poor" },
      { m: "Conversion Rate", v: fmtPct(overallConv), s: overallConv >= 20 ? "Good" : overallConv >= 10 ? "Fair" : "Poor" },
      { m: "Frustrated %", v: fmtPct(fruPct), s: fruPct <= 10 ? "Good" : fruPct <= 20 ? "Fair" : "Poor" },
    ].map(r => `<tr><td style="padding:6px 12px;font-weight:600">${r.m}</td><td style="padding:6px 12px">${r.v}</td><td style="padding:6px 12px;font-weight:600;color:${statusOf(r.s)}">${r.s}</td></tr>`).join("");

    const cwvRows = [
      { l: "LCP", v: fmt(cwvMetrics.lcp), s: cwvLabel(cwvMetrics.lcp, "lcp") },
      { l: "CLS", v: cwvMetrics.cls.toFixed(3), s: cwvLabel(cwvMetrics.cls, "cls") },
      { l: "INP", v: fmt(cwvMetrics.inp), s: cwvLabel(cwvMetrics.inp, "inp") },
      { l: "TTFB", v: fmt(cwvMetrics.ttfb), s: cwvLabel(cwvMetrics.ttfb, "ttfb") },
    ].map(r => `<td style="text-align:center;padding:12px 20px"><div style="font-size:11px;color:#888">${r.l}</div><div style="font-size:18px;font-weight:700">${r.v}</div><div style="font-size:11px;color:${statusOf(r.s)}">${r.s}</div></td>`).join("");

    const highlightCards = highlights.map(h => {
      const clr = h.good ? "#0D9C29" : "#C21930";
      const arrow = h.trend === "up" ? "▲" : h.trend === "down" ? "▼" : "●";
      return `<td style="padding:12px 20px;text-align:center"><div style="font-size:11px;color:#888">${h.label}</div><div style="font-size:22px;font-weight:700;color:${clr}">${h.value}</div><div style="font-size:11px;color:${clr}">${arrow} vs prev</div></td>`;
    }).join("");

    const bottleneckHtml = worstStep && worstStep.dropOff > 10 ? `
      <div style="margin:20px 0;padding:14px 18px;border-left:4px solid ${worstStep.dropOff > 40 ? "#C21930" : worstStep.dropOff > 20 ? "#FF832B" : "#FCD53F"};background:#f8f8fa;border-radius:6px">
        <strong>Biggest Bottleneck: ${worstStep.from} → ${worstStep.to}</strong>
        <div style="font-size:12px;color:#666;margin-top:4px">${fmtPct(worstStep.dropOff)} drop-off rate. ${worstStep.dropOff > 40 ? "Critical friction point — requires immediate attention." : "Significant abandonment — consider UX optimization."}</div>
      </div>` : "";

    const gradeRows = gradeMetrics.map(m => {
      const bc = m.score >= 75 ? "#0D9C29" : m.score >= 50 ? "#FCD53F" : "#C21930";
      return `<tr><td style="padding:4px 12px;font-size:12px;text-align:right;width:90px;color:#666">${m.label}</td><td style="padding:4px 8px"><div style="background:#eee;border-radius:5px;height:10px;width:200px;overflow:hidden"><div style="height:100%;width:${m.score}%;background:${bc};border-radius:5px"></div></div></td><td style="padding:4px 8px;font-size:12px;font-weight:700;color:${bc}">${m.score}</td><td style="padding:4px 8px;font-size:10px;color:#aaa">${m.weight}%</td></tr>`;
    }).join("");

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>User Journey Report — ${frontend}</title>
<style>
  @media print { body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } @page { margin: 0.6in; size: A4; } .no-print { display: none !important; } }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a2e; margin: 0; padding: 32px; max-width: 900px; margin: 0 auto; line-height: 1.5; }
  h1 { margin: 0 0 4px; font-size: 26px; } h2 { font-size: 16px; margin: 24px 0 10px; border-bottom: 2px solid #eee; padding-bottom: 6px; color: #333; }
  table { border-collapse: collapse; width: 100%; } td, th { border: 1px solid #e0e0e0; } th { background: #f5f5f7; padding: 8px 12px; font-size: 12px; text-align: left; }
  .grade { display: inline-block; font-size: 56px; font-weight: 800; color: ${gradeClr}; margin-right: 24px; vertical-align: middle; }
  .grade-sub { display: inline-block; vertical-align: middle; }
  .toolbar { text-align: right; margin-bottom: 16px; }
  .toolbar button { background: #4589FF; color: #fff; border: none; padding: 8px 20px; border-radius: 6px; font-size: 13px; cursor: pointer; margin-left: 8px; }
  .toolbar button:hover { background: #3070e0; }
</style></head><body>
<div class="toolbar no-print">
  <button onclick="window.print()">Print / Save PDF</button>
</div>
<h1>User Journey — Executive Report</h1>
<div style="font-size:12px;color:#888;margin-bottom:20px">${frontend} | Generated: ${ts}</div>

<h2>Overall Grade</h2>
<div><span class="grade">${letterGrade}</span><span class="grade-sub"><div style="font-size:14px;font-weight:600">${Math.round(overallGradeNum)}/100 weighted score</div><table style="border:none;width:auto;margin-top:8px">${gradeRows}</table></span></div>

<h2>Key Metrics</h2>
<table style="border:none"><tr>${highlightCards}</tr></table>

<h2>Funnel Summary</h2>
<table style="border:none"><tr>${funnelHtml}</tr></table>
${bottleneckHtml}

<h2>Core Web Vitals</h2>
<table style="border:none"><tr>${cwvRows}</tr></table>

<h2>Performance Snapshot</h2>
<table><tr><th>Metric</th><th>Value</th><th>Status</th></tr>${perfRows}</table>

<div style="text-align:center;margin-top:30px;padding-top:16px;border-top:1px solid #eee;font-size:10px;color:#aaa">
  User Journey App v4.0 | ${frontend} | ${ts}
</div>
</body></html>`;
  };

  const exportReport = () => {
    const html = generateReportHtml();
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
  };

  const copyReportText = () => {
    const lines: string[] = [
      `USER JOURNEY — EXECUTIVE REPORT`,
      `${frontend} | ${new Date().toLocaleString()}`,
      ``,
      `GRADE: ${letterGrade} (${Math.round(overallGradeNum)}/100)`,
      ``,
      `KEY METRICS`,
      ...highlights.map(h => `  ${h.label}: ${h.value} ${h.trend === "up" ? "▲" : h.trend === "down" ? "▼" : "●"} vs prev`),
      ``,
      `FUNNEL`,
      ...steps.map((step, i) => {
        const conv = i > 0 && funnelCounts[i - 1] > 0 ? ` (${fmtPct((funnelCounts[i] / funnelCounts[i - 1]) * 100)} conv)` : "";
        return `  Step ${i + 1}: ${step.label} — ${fmtCount(funnelCounts[i])} sessions${conv}`;
      }),
    ];
    if (worstStep && worstStep.dropOff > 10) {
      lines.push(``, `BOTTLENECK: ${worstStep.from} → ${worstStep.to} (${fmtPct(worstStep.dropOff)} drop-off)`);
    }
    lines.push(
      ``, `CORE WEB VITALS`,
      `  LCP: ${fmt(cwvMetrics.lcp)} (${cwvLabel(cwvMetrics.lcp, "lcp")})`,
      `  CLS: ${cwvMetrics.cls.toFixed(3)} (${cwvLabel(cwvMetrics.cls, "cls")})`,
      `  INP: ${fmt(cwvMetrics.inp)} (${cwvLabel(cwvMetrics.inp, "inp")})`,
      `  TTFB: ${fmt(cwvMetrics.ttfb)} (${cwvLabel(cwvMetrics.ttfb, "ttfb")})`,
      ``, `PERFORMANCE`,
      `  Apdex: ${overallApdex.toFixed(2)} (${apdexLabel(overallApdex)})`,
      `  Avg Duration: ${fmt(quality.avg)}`,
      `  P90 Duration: ${fmt(quality.p90)}`,
      `  Error Rate: ${fmtPct(errorRate)}`,
      `  Conversion: ${fmtPct(overallConv)}`,
      `  Frustrated: ${fmtPct(fruPct)}`,
    );
    navigator.clipboard.writeText(lines.join("\n")).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      {/* Export buttons */}
      <Flex justifyContent="flex-end" gap={8}>
        <button onClick={copyReportText} className="uj-export-btn" title="Copy plain-text report to clipboard">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ marginRight: 6, verticalAlign: "middle" }}><rect x="5" y="1" width="9" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><rect x="2" y="4" width="9" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="rgba(0,0,0,0.1)" /></svg>
          {copied ? "Copied!" : "Copy Text"}
        </button>
        <button onClick={exportReport} className="uj-export-btn" title="Open printable report for PDF export">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ marginRight: 6, verticalAlign: "middle" }}><path d="M4 1h5l4 4v9a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 013 14V2.5A1.5 1.5 0 014 1z" stroke="currentColor" strokeWidth="1.5" /><path d="M9 1v4h4" stroke="currentColor" strokeWidth="1.5" /></svg>
          Export PDF
        </button>
      </Flex>

      {/* Overall Grade */}
      <Flex gap={24} alignItems="center" flexWrap="wrap">
        <div className="uj-grade-card">
          <Text style={{ fontSize: 11, opacity: 0.5, textTransform: "uppercase", letterSpacing: 1 }}>Overall Grade</Text>
          <Heading level={1} style={{ fontSize: 64, margin: "8px 0", color: gradeColor, lineHeight: 1 }}>{letterGrade}</Heading>
          <Text style={{ fontSize: 12, opacity: 0.6 }}>{Math.round(overallGradeNum)}/100 weighted score</Text>
        </div>
        <Flex flexDirection="column" gap={6} style={{ flex: 1, minWidth: 300 }}>
          {gradeMetrics.map((m) => {
            const color = m.score >= 75 ? GREEN : m.score >= 50 ? YELLOW : RED;
            return (
              <Flex key={m.label} alignItems="center" gap={8}>
                <Text style={{ fontSize: 10, width: 80, textAlign: "right", opacity: 0.6 }}>{m.label}</Text>
                <div style={{ flex: 1, height: 10, borderRadius: 5, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${m.score}%`, background: color, borderRadius: 5, transition: "width 0.4s ease" }} />
                </div>
                <Text style={{ fontSize: 10, minWidth: 30, fontWeight: 700, color }}>{m.score}</Text>
                <Text style={{ fontSize: 9, opacity: 0.4, minWidth: 20 }}>{m.weight}%</Text>
              </Flex>
            );
          })}
        </Flex>
      </Flex>

      {/* Key metrics with trends */}
      <SectionHeader title="Key Metrics" />
      <Flex gap={16} flexWrap="wrap">
        {highlights.map((h) => (
          <div key={h.label} className="uj-kpi-card" style={{ minWidth: 140 }}>
            <Text className="uj-kpi-label">{h.label}</Text>
            <Heading level={3} className="uj-kpi-value" style={{ color: h.good ? GREEN : RED }}>{h.value}</Heading>
            <Text style={{ fontSize: 11, color: h.good ? GREEN : RED }}>{h.trend === "up" ? "▲" : h.trend === "down" ? "▼" : "●"} vs prev period</Text>
          </div>
        ))}
      </Flex>

      {/* Funnel summary */}
      <SectionHeader title="Funnel Summary" />
      <div className="uj-table-tile" style={{ padding: 16 }}>
        <Flex gap={12} flexWrap="wrap" alignItems="center">
          {steps.map((step, i) => (
            <React.Fragment key={i}>
              <div style={{ textAlign: "center" }}>
                <Text style={{ fontSize: 10, opacity: 0.5, display: "block" }}>{step.label}</Text>
                <Strong style={{ fontSize: 16, color: BLUE }}>{fmtCount(funnelCounts[i])}</Strong>
                {i > 0 && (
                  <Text style={{ fontSize: 10, display: "block", color: funnelCounts[i - 1] > 0 ? statusClr((funnelCounts[i] / funnelCounts[i - 1]) * 100) : undefined }}>
                    {funnelCounts[i - 1] > 0 ? fmtPct((funnelCounts[i] / funnelCounts[i - 1]) * 100) : "—"}
                  </Text>
                )}
              </div>
              {i < steps.length - 1 && <span style={{ fontSize: 16, opacity: 0.3 }}>→</span>}
            </React.Fragment>
          ))}
        </Flex>
      </div>

      {/* Bottleneck alert */}
      {worstStep && worstStep.dropOff > 10 && (
        <div className="uj-table-tile" style={{ padding: 16, borderLeft: `3px solid ${worstStep.dropOff > 40 ? RED : worstStep.dropOff > 20 ? ORANGE : YELLOW}` }}>
          <Flex gap={8} alignItems="center">
            <span style={{ fontSize: 18 }}>{worstStep.dropOff > 40 ? "🔴" : worstStep.dropOff > 20 ? "🟠" : "🟡"}</span>
            <div>
              <Strong style={{ fontSize: 13 }}>Biggest Bottleneck: {worstStep.from} → {worstStep.to}</Strong>
              <Text style={{ display: "block", fontSize: 11, opacity: 0.6 }}>{fmtPct(worstStep.dropOff)} drop-off rate. {worstStep.dropOff > 40 ? "Critical friction point — requires immediate attention." : "Significant abandonment — consider UX optimization."}</Text>
            </div>
          </Flex>
        </div>
      )}

      {/* Core Web Vitals summary */}
      <SectionHeader title="Core Web Vitals" />
      <Flex gap={16} flexWrap="wrap">
        {([
          { label: "LCP", value: cwvMetrics.lcp, metric: "lcp" as const, unit: "ms" },
          { label: "CLS", value: cwvMetrics.cls, metric: "cls" as const, unit: "" },
          { label: "INP", value: cwvMetrics.inp, metric: "inp" as const, unit: "ms" },
          { label: "TTFB", value: cwvMetrics.ttfb, metric: "ttfb" as const, unit: "ms" },
        ]).map((v) => (
          <div key={v.label} className="uj-kpi-card">
            <Text className="uj-kpi-label">{v.label}</Text>
            <Heading level={3} className="uj-kpi-value" style={{ color: cwvClr(v.value, v.metric) }}>
              {v.metric === "cls" ? v.value.toFixed(3) : fmt(v.value)}
            </Heading>
            <Text style={{ fontSize: 10, color: cwvClr(v.value, v.metric) }}>{cwvLabel(v.value, v.metric)}</Text>
          </div>
        ))}
      </Flex>

      {/* Performance summary table */}
      <SectionHeader title="Performance Snapshot" />
      <div className="uj-table-tile">
        <DataTable
          data={[
            { Metric: "Total Sessions", Value: fmtCount(quality.sessions), Status: "—" },
            { Metric: "Total Actions", Value: fmtCount(quality.total), Status: "—" },
            { Metric: "Apdex", Value: overallApdex.toFixed(2), Status: apdexLabel(overallApdex) },
            { Metric: "Avg Duration", Value: fmt(quality.avg), Status: quality.avg <= 2000 ? "Good" : quality.avg <= 3000 ? "Fair" : "Poor" },
            { Metric: "P50 Duration", Value: fmt(quality.p50), Status: quality.p50 <= 1500 ? "Good" : quality.p50 <= 2500 ? "Fair" : "Poor" },
            { Metric: "P90 Duration", Value: fmt(quality.p90), Status: quality.p90 <= 4000 ? "Good" : quality.p90 <= 6000 ? "Fair" : "Poor" },
            { Metric: "Error Rate", Value: fmtPct(errorRate), Status: errorRate <= 2 ? "Good" : errorRate <= 5 ? "Fair" : "Poor" },
            { Metric: "Conversion Rate", Value: fmtPct(overallConv), Status: overallConv >= 20 ? "Good" : overallConv >= 10 ? "Fair" : "Poor" },
            { Metric: "Frustrated %", Value: fmtPct(fruPct), Status: fruPct <= 10 ? "Good" : fruPct <= 20 ? "Fair" : "Poor" },
          ]}
          columns={[
            { id: "Metric", header: "Metric", accessor: "Metric", cell: ({ value }: any) => <Strong>{value}</Strong> },
            { id: "Value", header: "Value", accessor: "Value" },
            { id: "Status", header: "Status", accessor: "Status", cell: ({ value }: any) => {
              const color = value === "Excellent" || value === "Good" ? GREEN : value === "Fair" ? YELLOW : value === "Poor" ? RED : "rgba(255,255,255,0.4)";
              return <Strong style={{ color }}>{value}</Strong>;
            }},
          ]}
        />
      </div>

      {/* Timestamp */}
      <div style={{ textAlign: "center", padding: "8px 0" }}>
        <Text style={{ fontSize: 10, opacity: 0.3 }}>Report generated: {new Date().toLocaleString()} | Frontend: {frontend}</Text>
      </div>
    </Flex>
  );
}

// ===========================================================================
// TAB: Segmentation
// ===========================================================================
function SegmentationTab({ devices, browsers, geos, isLoading }: { devices: any[]; browsers: any[]; geos: any[]; isLoading: boolean }) {
  if (isLoading) return <Loading />;

  const segCols = (nameHeader: string, nameField: string) => [
    { id: nameField, header: nameHeader, accessor: nameField },
    { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Strong>{fmtCount(value)}</Strong> },
    { id: "Actions", header: "Actions", accessor: "Actions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
    { id: "Avg (ms)", header: "Avg Duration", accessor: "Avg (ms)", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 3000 ? RED : value > 1000 ? YELLOW : undefined }}>{fmt(value)}</Text> },
    { id: "Apdex", header: "Apdex", accessor: "Apdex", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: apdexClr(value) }}>{value.toFixed(2)}</Strong> },
  ];

  const mapSeg = (data: any[], nameKey: string) => data.map((d: any) => {
    const sat = Number(d.satisfied ?? 0); const tol = Number(d.tolerating ?? 0); const total = Number(d.actions ?? 0);
    return { [nameKey]: d[nameKey] ?? "Unknown", Sessions: Number(d.sessions ?? 0), Actions: total, "Avg (ms)": Number(d.avg_duration_ms ?? 0), Apdex: calcApdex(sat, tol, total), Errors: Number(d.errors ?? 0) };
  });

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      <SectionHeader title="By Device Type" />
      <div className="uj-table-tile"><DataTable sortable data={mapSeg(devices, "deviceType")} columns={segCols("Device", "deviceType")} /></div>
      <SectionHeader title="By Browser" />
      <div className="uj-table-tile"><DataTable sortable data={mapSeg(browsers, "browserName")} columns={[...segCols("Browser", "browserName"), { id: "Errors", header: "Errors", accessor: "Errors", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 0 ? RED : undefined }}>{value}</Text> }]} /></div>
      <SectionHeader title="By Geography" />
      <div className="uj-table-tile"><DataTable sortable data={mapSeg(geos, "country")} columns={[...segCols("Country", "country"), { id: "Errors", header: "Errors", accessor: "Errors", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 0 ? RED : undefined }}>{value}</Text> }]} /></div>
    </Flex>
  );
}

// ===========================================================================
// TAB: Errors & Drop-offs
// ===========================================================================
function ErrorsTab({ errors, funnelCounts, isLoading, steps }: { errors: any[]; funnelCounts: number[]; isLoading: boolean; steps: StepDef[] }) {
  if (isLoading) return <Loading />;

  const dropOffs = steps.slice(1).map((step, i) => {
    const prev = funnelCounts[i]; const curr = funnelCounts[i + 1];
    return { from: steps[i].label, to: step.label, lost: prev - curr, pctLost: prev > 0 ? ((prev - curr) / prev) * 100 : 0 };
  }).sort((a, b) => b.lost - a.lost);

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      <SectionHeader title="Biggest Drop-offs" />
      <Flex gap={16} flexWrap="wrap">
        {dropOffs.map((d, i) => (
          <div key={i} className="uj-dropoff-card">
            <Flex alignItems="center" gap={8}><Text style={{ fontSize: 12 }}>{d.from}</Text><span style={{ color: RED, fontSize: 16 }}>→</span><Text style={{ fontSize: 12 }}>{d.to}</Text></Flex>
            <Heading level={3} style={{ color: RED, margin: "8px 0 4px" }}>{fmtCount(d.lost)} lost</Heading>
            <Text style={{ fontSize: 12, opacity: 0.6 }}>{fmtPct(d.pctLost)} abandonment</Text>
            <div className="uj-dropoff-bar"><div className="uj-dropoff-bar-fill" style={{ width: `${100 - d.pctLost}%` }} /></div>
          </div>
        ))}
      </Flex>
      <SectionHeader title="Errors by Step" />
      <div className="uj-table-tile">
        {errors.length === 0 ? <div style={{ padding: 20 }}><Text>No errors in selected timeframe</Text></div> : (
          <DataTable sortable data={errors.map((e: any) => ({ Step: e.step_tag ?? "Unknown", Errors: Number(e.error_count ?? 0), "Affected Sessions": Number(e.affected_sessions ?? 0) }))} columns={[
            { id: "Step", header: "Step", accessor: "Step" },
            { id: "Errors", header: "Errors", accessor: "Errors", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: RED }}>{value}</Strong> },
            { id: "Affected Sessions", header: "Affected Sessions", accessor: "Affected Sessions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
          ]} />
        )}
      </div>
      <SectionHeader title="Optimization Recommendations" />
      <div className="uj-recommendations">
        {dropOffs.map((d, i) => (
          <div key={i} className="uj-recommendation-card">
            <Flex alignItems="center" gap={8}>
              <span className="uj-rec-icon">{d.pctLost > 40 ? "🔴" : d.pctLost > 20 ? "🟡" : "🟢"}</span>
              <div>
                <Strong style={{ fontSize: 13 }}>{d.from} → {d.to}: {fmtPct(d.pctLost)} drop-off</Strong>
                <Text style={{ fontSize: 11, opacity: 0.6, display: "block" }}>
                  {d.pctLost > 40 ? "Critical: Major friction. Review UX, reduce form fields, optimize load time." : d.pctLost > 20 ? "Warning: Significant abandonment. Consider A/B testing or simplifying." : "Acceptable: Healthy conversion. Monitor for regressions."}
                </Text>
              </div>
            </Flex>
          </div>
        ))}
      </div>
    </Flex>
  );
}

// ===========================================================================
// TAB: What-If Analysis
// ===========================================================================
function WhatIfTab({ funnelCounts, stepMap, overallApdex, isLoading, steps }: { funnelCounts: number[]; stepMap: Map<string, any>; overallApdex: number; isLoading: boolean; steps: StepDef[] }) {
  const [mult, setMult] = useState(2);
  if (isLoading) return <Loading />;

  const lastIdx = steps.length - 1;
  const latFactor = 1 + Math.log2(mult) * 0.5;
  const errFactor = 1 + Math.log2(mult) * 0.15;
  const convDegradation = Math.log2(mult) * 0.08;
  const projApdex = Math.max(0, overallApdex - Math.log2(mult) * 0.08);
  const projConv = funnelCounts[0] > 0 ? Math.max(0, (funnelCounts[lastIdx] / funnelCounts[0]) * 100 * (1 - convDegradation)) : 0;
  const projFunnel = funnelCounts.map((c, i) => i === 0 ? Math.round(c * mult) : Math.round(c * mult * Math.pow(1 - convDegradation, i)));

  const projSteps: FunnelStep[] = steps.map((step, i) => ({
    label: step.label,
    count: projFunnel[i],
    convFromPrev: i === 0 ? 100 : projFunnel[i - 1] > 0 ? (projFunnel[i] / projFunnel[i - 1]) * 100 : 0,
    overallConv: projFunnel[0] > 0 ? (projFunnel[i] / projFunnel[0]) * 100 : 0,
  }));

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      <MultiplierSlider value={mult} onChange={setMult} />

      <Flex gap={16} flexWrap="wrap">
        <div className="uj-whatif-card"><Text className="uj-metric-label">Projected Sessions</Text><Strong className="uj-metric-value" style={{ color: PURPLE }}>{fmtCount(projFunnel[0])}</Strong></div>
        <div className="uj-whatif-card"><Text className="uj-metric-label">Projected Apdex</Text><Strong className="uj-metric-value" style={{ color: apdexClr(projApdex) }}>{projApdex.toFixed(2)}</Strong></div>
        <div className="uj-whatif-card"><Text className="uj-metric-label">Projected Conv</Text><Strong className="uj-metric-value" style={{ color: statusClr(projConv) }}>{fmtPct(projConv)}</Strong></div>
        <div className="uj-whatif-card"><Text className="uj-metric-label">Latency Factor</Text><Strong className="uj-metric-value" style={{ color: latFactor > 2 ? RED : latFactor > 1.5 ? YELLOW : BLUE }}>{latFactor.toFixed(2)}x</Strong></div>
      </Flex>

      <Flex gap={16} flexWrap="wrap">
        <div className={`uj-impact-card ${projApdex < overallApdex ? "uj-impact-negative" : "uj-impact-positive"}`}>
          <Text className="uj-metric-label">Apdex Impact</Text>
          <Strong style={{ color: projApdex < overallApdex ? RED : GREEN, fontSize: 16 }}>{overallApdex.toFixed(2)} → {projApdex.toFixed(2)}</Strong>
        </div>
        <div className={`uj-impact-card ${projConv < (funnelCounts[funnelCounts.length - 1] / Math.max(1, funnelCounts[0])) * 100 ? "uj-impact-negative" : "uj-impact-positive"}`}>
          <Text className="uj-metric-label">Conversion Impact</Text>
          <Strong style={{ color: RED, fontSize: 16 }}>{fmtPct((funnelCounts[funnelCounts.length - 1] / Math.max(1, funnelCounts[0])) * 100)} → {fmtPct(projConv)}</Strong>
        </div>
      </Flex>

      <SectionHeader title="Projected Funnel" />
      <div className="uj-funnel-container"><FunnelChart steps={projSteps} stepDefs={steps} /></div>

      <SectionHeader title="Projected Metrics by Step" />
      <div className="uj-table-tile">
        <DataTable
          data={steps.map((step, i) => {
            const m = stepMap.get(step.label);
            const cAvg = m ? Number(m.avg_duration_ms ?? 0) : 0;
            const cP90 = m ? Number(m.p90_duration_ms ?? 0) : 0;
            const cErr = m ? Number(m.error_count ?? 0) : 0;
            return { Step: step.label, "Curr Sessions": funnelCounts[i], "Proj Sessions": projFunnel[i], "Curr Avg": cAvg, "Proj Avg": cAvg * latFactor, "Curr P90": cP90, "Proj P90": cP90 * latFactor, "Curr Errors": cErr, "Proj Errors": Math.round(cErr * errFactor) };
          })}
          columns={[
            { id: "Step", header: "Step", accessor: "Step" },
            { id: "Curr Sessions", header: "Curr", accessor: "Curr Sessions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
            { id: "Proj Sessions", header: `Proj (${mult}x)`, accessor: "Proj Sessions", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: PURPLE }}>{fmtCount(value)}</Strong> },
            { id: "Curr Avg", header: "Curr Avg", accessor: "Curr Avg", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmt(value)}</Text> },
            { id: "Proj Avg", header: "Proj Avg", accessor: "Proj Avg", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 3000 ? RED : value > 1000 ? YELLOW : BLUE }}>{fmt(value)}</Strong> },
            { id: "Curr P90", header: "Curr P90", accessor: "Curr P90", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmt(value)}</Text> },
            { id: "Proj P90", header: "Proj P90", accessor: "Proj P90", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 5000 ? RED : value > 2000 ? YELLOW : BLUE }}>{fmt(value)}</Strong> },
            { id: "Curr Errors", header: "Errors", accessor: "Curr Errors", sortType: "number" as any, cell: ({ value }: any) => <Text>{value}</Text> },
            { id: "Proj Errors", header: "Proj Errors", accessor: "Proj Errors", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 0 ? RED : GREEN }}>{value}</Strong> },
          ]}
        />
      </div>

      <div className="uj-table-tile" style={{ padding: 24 }}>
        <Text style={{ fontSize: 11, opacity: 0.5 }}>
          Projections: logarithmic contention model. At 2x: ~35% latency increase, ~8% conversion degradation per doubling. Apdex degrades ~0.08 per doubling.
        </Text>
      </div>
    </Flex>
  );
}

// ===========================================================================
// TAB: Sankey — SVG flow visualization
// ===========================================================================
const SANKEY_COLORS = [BLUE, PURPLE, CYAN, GREEN, ORANGE, YELLOW, "#FF6B8A", "#36D399", "#6E9FFF", "#C084FC"];

interface SankeyNode { id: string; label: string; depth: number; value: number; y: number; height: number; }
interface SankeyLink { source: string; target: string; value: number; sy: number; ty: number; thickness: number; }

function buildSankey(records: any[]): { nodes: SankeyNode[]; links: SankeyLink[]; maxDepth: number } {
  // Aggregate transitions at each depth from the raw path rows
  const linkMap = new Map<string, number>();
  for (const r of records) {
    const steps = [String(r.s0 ?? ""), String(r.s1 ?? ""), String(r.s2 ?? ""), String(r.s3 ?? ""), String(r.s4 ?? "")];
    const count = Number(r.sessions ?? r.d0 ?? 1);
    for (let i = 0; i < 4; i++) {
      const src = steps[i];
      const tgt = steps[i + 1];
      if (!src || !tgt || tgt === "(exit)") break;
      const key = `${i}|${src}|||${i + 1}|${tgt}`;
      linkMap.set(key, (linkMap.get(key) ?? 0) + count);
    }
  }

  // Build node totals per depth
  const nodeValueMap = new Map<string, number>(); // "depth|name" -> value
  const rawLinks: { srcDepth: number; src: string; tgtDepth: number; tgt: string; value: number }[] = [];
  for (const [key, value] of linkMap) {
    const [srcPart, tgtPart] = key.split("|||");
    const srcDepth = Number(srcPart.substring(0, srcPart.indexOf("|")));
    const src = srcPart.substring(srcPart.indexOf("|") + 1);
    const tgtDepth = Number(tgtPart.substring(0, tgtPart.indexOf("|")));
    const tgt = tgtPart.substring(tgtPart.indexOf("|") + 1);
    rawLinks.push({ srcDepth, src, tgtDepth, tgt, value });
    const srcKey = `${srcDepth}|${src}`;
    const tgtKey = `${tgtDepth}|${tgt}`;
    nodeValueMap.set(srcKey, (nodeValueMap.get(srcKey) ?? 0) + value);
    nodeValueMap.set(tgtKey, (nodeValueMap.get(tgtKey) ?? 0) + value);
  }

  if (rawLinks.length === 0) return { nodes: [], links: [], maxDepth: 0 };

  // Determine max depth
  let maxDepth = 0;
  for (const l of rawLinks) maxDepth = Math.max(maxDepth, l.tgtDepth);

  // Group nodes by depth, sort by value descending, take top N per column
  const MAX_PER_COL = 8;
  const depthNodes = new Map<number, { name: string; value: number }[]>();
  for (const [key, value] of nodeValueMap) {
    const [ds, ...nameParts] = key.split("|");
    const depth = Number(ds);
    const name = nameParts.join("|");
    const arr = depthNodes.get(depth) ?? [];
    arr.push({ name, value });
    depthNodes.set(depth, arr);
  }

  const keptNodes = new Set<string>(); // "depth|name"
  for (const [depth, arr] of depthNodes) {
    arr.sort((a, b) => b.value - a.value);
    const kept = arr.slice(0, MAX_PER_COL);
    for (const n of kept) keptNodes.add(`${depth}|${n.name}`);
  }

  // Filter links to only kept nodes
  const filteredLinks = rawLinks.filter(l => keptNodes.has(`${l.srcDepth}|${l.src}`) && keptNodes.has(`${l.tgtDepth}|${l.tgt}`));

  // Layout — compute Y positions
  const CHART_H = 500;
  const NODE_PAD = 6;
  const nodes: SankeyNode[] = [];
  const nodeMap = new Map<string, SankeyNode>();

  for (let d = 0; d <= maxDepth; d++) {
    const col = (depthNodes.get(d) ?? []).filter(n => keptNodes.has(`${d}|${n.name}`)).sort((a, b) => b.value - a.value);
    const totalVal = col.reduce((a, n) => a + n.value, 0);
    const usableH = CHART_H - (col.length - 1) * NODE_PAD;
    let yOff = 0;
    for (const n of col) {
      const h = Math.max(4, (n.value / totalVal) * usableH);
      const id = `${d}|${n.name}`;
      const node: SankeyNode = { id, label: n.name, depth: d, value: n.value, y: yOff, height: h };
      nodes.push(node);
      nodeMap.set(id, node);
      yOff += h + NODE_PAD;
    }
  }

  // Build positioned links
  const srcOffsets = new Map<string, number>();
  const tgtOffsets = new Map<string, number>();
  const links: SankeyLink[] = [];
  // Sort links by value desc for nicer stacking
  filteredLinks.sort((a, b) => b.value - a.value);
  for (const l of filteredLinks) {
    const srcNode = nodeMap.get(`${l.srcDepth}|${l.src}`);
    const tgtNode = nodeMap.get(`${l.tgtDepth}|${l.tgt}`);
    if (!srcNode || !tgtNode) continue;
    const thickness = Math.max(1, (l.value / srcNode.value) * srcNode.height);
    const sy = srcNode.y + (srcOffsets.get(srcNode.id) ?? 0);
    const ty = tgtNode.y + (tgtOffsets.get(tgtNode.id) ?? 0);
    srcOffsets.set(srcNode.id, (srcOffsets.get(srcNode.id) ?? 0) + thickness);
    tgtOffsets.set(tgtNode.id, (tgtOffsets.get(tgtNode.id) ?? 0) + thickness);
    links.push({ source: srcNode.id, target: tgtNode.id, value: l.value, sy, ty, thickness });
  }

  return { nodes, links, maxDepth };
}

function SankeyTab({ data, isLoading, appEntityId, chartStyle, onStyleChange }: { data: any; isLoading: boolean; appEntityId: string; chartStyle: SankeyStyle; onStyleChange: (v: SankeyStyle) => void }) {
  if (isLoading) return <Loading />;

  const records = (data.data?.records ?? []) as any[];
  const { nodes, links, maxDepth } = useMemo(() => buildSankey(records), [records]);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [focusLabel, setFocusLabel] = useState<string | null>(null);

  const totalSessions = records.reduce((a: number, r: any) => a + Number(r.sessions ?? r.d0 ?? 0), 0);
  const uniquePages = new Set(nodes.map(n => n.label)).size;

  // Build a set of connected node IDs and link indices for the focused node
  const { connectedNodes, connectedLinks } = useMemo(() => {
    if (!focusNodeId) return { connectedNodes: new Set<string>(), connectedLinks: new Set<number>() };
    const cn = new Set<string>([focusNodeId]);
    const cl = new Set<number>();
    links.forEach((l, i) => {
      if (l.source === focusNodeId || l.target === focusNodeId) {
        cl.add(i);
        cn.add(l.source);
        cn.add(l.target);
      }
    });
    return { connectedNodes: cn, connectedLinks: cl };
  }, [focusNodeId, links]);

  const hasFocus = focusNodeId !== null;

  // Focus info panel
  const focusNode = hasFocus ? nodes.find(n => n.id === focusNodeId) : null;
  const focusInbound = hasFocus ? links.filter(l => l.target === focusNodeId) : [];
  const focusOutbound = hasFocus ? links.filter(l => l.source === focusNodeId) : [];
  const focusSessions = focusNode?.value ?? 0;

  // Label-based focus for alternate charts (aggregates across all nodes with same label)
  const labelNodeIds = focusLabel ? nodes.filter(n => n.label === focusLabel).map(n => n.id) : [];
  const labelInbound = focusLabel ? links.filter(l => labelNodeIds.includes(l.target)).reduce((acc, l) => {
    const src = nodes.find(n => n.id === l.source)!;
    const existing = acc.find(a => a.label === src.label);
    if (existing) existing.value += l.value; else acc.push({ label: src.label, value: l.value });
    return acc;
  }, [] as { label: string; value: number }[]).sort((a, b) => b.value - a.value) : [];
  const labelOutbound = focusLabel ? links.filter(l => labelNodeIds.includes(l.source)).reduce((acc, l) => {
    const tgt = nodes.find(n => n.id === l.target)!;
    const existing = acc.find(a => a.label === tgt.label);
    if (existing) existing.value += l.value; else acc.push({ label: tgt.label, value: l.value });
    return acc;
  }, [] as { label: string; value: number }[]).sort((a, b) => b.value - a.value) : [];
  const labelSessions = focusLabel ? nodes.filter(n => n.label === focusLabel).reduce((a, n) => Math.max(a, n.value), 0) : 0;

  const handleLabelClick = (label: string) => {
    setFocusLabel(prev => prev === label ? null : label);
  };

  const renderLabelPopup = () => {
    if (!focusLabel) return null;
    return (
      <div style={{ marginTop: 12, padding: "12px 16px", background: "rgba(69,137,255,0.08)", borderRadius: 8, borderLeft: "3px solid " + BLUE }}>
        <Flex alignItems="center" gap={8} style={{ marginBottom: 8 }}>
          <Strong style={{ fontSize: 13 }}>{focusLabel}</Strong>
          <Text style={{ fontSize: 10, opacity: 0.5 }}>{fmtCount(labelSessions)} sessions</Text>
          <button onClick={() => setFocusLabel(null)} style={{ marginLeft: "auto", background: "none", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 4, color: "rgba(255,255,255,0.6)", cursor: "pointer", padding: "2px 8px", fontSize: 10 }}>Clear</button>
        </Flex>
        {labelInbound.length > 0 && (
          <div style={{ marginBottom: 6 }}>
            <Text style={{ fontSize: 10, opacity: 0.5 }}>Inbound ({labelInbound.length}):</Text>
            <Flex gap={6} flexWrap="wrap" style={{ marginTop: 2 }}>
              {labelInbound.slice(0, 8).map((l, i) => (
                <a key={i} href={appEntityId ? vitalsUrl(appEntityId, l.label) : '#'} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: "inherit", textDecoration: "none", cursor: appEntityId ? "pointer" : "default" }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(69,137,255,0.18)")} onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")} title={appEntityId ? `Open in Vitals: ${l.label}` : l.label}>{truncLabel(l.label, 30)} <Strong style={{ color: CYAN }}>{fmtCount(l.value)}</Strong></a>
              ))}
            </Flex>
          </div>
        )}
        {labelOutbound.length > 0 && (
          <div>
            <Text style={{ fontSize: 10, opacity: 0.5 }}>Outbound ({labelOutbound.length}):</Text>
            <Flex gap={6} flexWrap="wrap" style={{ marginTop: 2 }}>
              {labelOutbound.slice(0, 8).map((l, i) => (
                <a key={i} href={appEntityId ? vitalsUrl(appEntityId, l.label) : '#'} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: "inherit", textDecoration: "none", cursor: appEntityId ? "pointer" : "default" }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(69,137,255,0.18)")} onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")} title={appEntityId ? `Open in Vitals: ${l.label}` : l.label}>{truncLabel(l.label, 30)} <Strong style={{ color: GREEN }}>{fmtCount(l.value)}</Strong></a>
              ))}
            </Flex>
          </div>
        )}
      </div>
    );
  };

  if (nodes.length === 0) {
    return (
      <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
        <SectionHeader title="Sankey Flow Diagram" />
        <div className="uj-table-tile" style={{ padding: 24 }}><Text>No flow data available for this timeframe.</Text></div>
      </Flex>
    );
  }

  const W = 960;
  const H = 540;
  const PAD = { top: 20, right: 140, bottom: 20, left: 140 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const colW = maxDepth > 0 ? innerW / maxDepth : innerW;
  const NODE_W = 18;
  const DEPTH_LABELS = ["Page 1", "Page 2", "Page 3", "Page 4", "Page 5"];
  const scaleY = innerH / 500; // scale from layout space to SVG space

  const truncLabel = (s: string, max = 22) => s.length > max ? s.substring(0, max) + "\u2026" : s;

  // ---- Chart style selector + KPI header (shared across all styles) ----
  const chartHeader = (
    <>
      <Flex alignItems="center" justifyContent="space-between">
        <SectionHeader title="Sankey Flow Diagram" />
        <Flex alignItems="center" gap={8}>
          <Text style={{ fontSize: 11, opacity: 0.5 }}>Chart Style</Text>
          <Select value={chartStyle} onChange={(val) => { if (val) onStyleChange(val as SankeyStyle); }}>
            <Select.Trigger style={{ minWidth: 170 }} />
            <Select.Content>
              {SANKEY_STYLE_OPTIONS.map(o => <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>)}
            </Select.Content>
          </Select>
        </Flex>
      </Flex>
      <Text style={{ fontSize: 12, opacity: 0.5 }}>{SANKEY_STYLE_OPTIONS.find(o => o.value === chartStyle)?.label}: User navigation flows. Top {nodes.length} page nodes shown.</Text>
      <Flex gap={16} flexWrap="wrap">
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Total Sessions</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: BLUE }}>{fmtCount(totalSessions)}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Unique Pages</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: PURPLE }}>{uniquePages}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Flow Transitions</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: CYAN }}>{links.length}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Max Depth</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: GREEN }}>{maxDepth + 1} pages</Heading>
        </div>
      </Flex>
    </>
  );

  // ---- Classic Sankey (original) ----
  const renderClassicSankey = (useGradient: boolean) => (
    <div className="uj-table-tile" style={{ padding: 16, overflowX: "auto" }}>
      <svg width={W} height={H} style={{ display: "block", margin: "0 auto", cursor: hasFocus ? "pointer" : "default" }} onClick={() => setFocusNodeId(null)}>
        {useGradient && (
          <defs>
            {links.map((l, i) => {
              const srcNode = nodes.find(n => n.id === l.source)!;
              const tgtNode = nodes.find(n => n.id === l.target)!;
              return (
                <linearGradient key={`lg-${i}`} id={`sankey-grad-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={SANKEY_COLORS[srcNode.depth % SANKEY_COLORS.length]} />
                  <stop offset="100%" stopColor={SANKEY_COLORS[tgtNode.depth % SANKEY_COLORS.length]} />
                </linearGradient>
              );
            })}
          </defs>
        )}
        {Array.from({ length: maxDepth + 1 }, (_, d) => (
          <text key={`dl-${d}`} x={PAD.left + d * colW + NODE_W / 2} y={12} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={10} fontWeight={600}>{DEPTH_LABELS[d] ?? `Page ${d + 1}`}</text>
        ))}
        {links.map((l, i) => {
          const srcNode = nodes.find(n => n.id === l.source)!;
          const tgtNode = nodes.find(n => n.id === l.target)!;
          const x0 = PAD.left + srcNode.depth * colW + NODE_W;
          const x1 = PAD.left + tgtNode.depth * colW;
          const y0 = PAD.top + l.sy * scaleY + (l.thickness * scaleY) / 2;
          const y1 = PAD.top + l.ty * scaleY + (l.thickness * scaleY) / 2;
          const curvature = (x1 - x0) * 0.4;
          const color = useGradient ? `url(#sankey-grad-${i})` : SANKEY_COLORS[srcNode.depth % SANKEY_COLORS.length];
          const isConnected = !hasFocus || connectedLinks.has(i);
          const opacity = hasFocus ? (isConnected ? 0.7 : 0.06) : 0.35;
          return (
            <path
              key={`link-${i}`}
              d={`M${x0},${y0} C${x0 + curvature},${y0} ${x1 - curvature},${y1} ${x1},${y1}`}
              fill="none"
              stroke={color}
              strokeWidth={Math.max(1, l.thickness * scaleY)}
              strokeOpacity={useGradient ? (hasFocus ? (isConnected ? 0.8 : 0.08) : 0.5) : opacity}
              style={{ cursor: "pointer", transition: "stroke-opacity 0.2s" }}
              onClick={(e) => { e.stopPropagation(); setFocusNodeId(srcNode.id); }}
            >
              <title>{`${srcNode.label} → ${tgtNode.label}: ${fmtCount(l.value)} sessions`}</title>
            </path>
          );
        })}
        {nodes.map((n) => {
          const x = PAD.left + n.depth * colW;
          const y = PAD.top + n.y * scaleY;
          const h = Math.max(2, n.height * scaleY);
          const color = SANKEY_COLORS[n.depth % SANKEY_COLORS.length];
          const isLeft = n.depth === 0;
          const isRight = n.depth === maxDepth;
          const labelX = isLeft ? x - 4 : isRight ? x + NODE_W + 4 : x + NODE_W + 4;
          const anchor = isLeft ? "end" : "start";
          const isFocused = n.id === focusNodeId;
          const isConnected = !hasFocus || connectedNodes.has(n.id);
          const nodeOpacity = hasFocus ? (isFocused ? 1 : isConnected ? 0.85 : 0.15) : 0.85;
          const labelOpacity = hasFocus ? (isConnected ? 0.9 : 0.15) : 0.7;
          return (
            <g key={n.id} style={{ cursor: "pointer", transition: "opacity 0.2s" }} onClick={(e) => { e.stopPropagation(); setFocusNodeId(isFocused ? null : n.id); }}>
              <rect x={x} y={y} width={NODE_W} height={h} rx={3} fill={color} opacity={nodeOpacity} stroke={isFocused ? "#fff" : "none"} strokeWidth={isFocused ? 2 : 0}>
                <title>{`${n.label}: ${fmtCount(n.value)} sessions`}</title>
              </rect>
              {h > 8 && (
                <text x={labelX} y={y + h / 2 + 3.5} textAnchor={anchor} fill={`rgba(255,255,255,${labelOpacity})`} fontSize={10} fontWeight={isFocused ? 700 : 400}>
                  {truncLabel(n.label)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hasFocus && focusNode && (
        <div style={{ marginTop: 12, padding: "12px 16px", background: "rgba(69,137,255,0.08)", borderRadius: 8, borderLeft: `3px solid ${SANKEY_COLORS[focusNode.depth % SANKEY_COLORS.length]}` }}>
          <Flex alignItems="center" gap={8} style={{ marginBottom: 8 }}>
            <Strong style={{ fontSize: 13 }}>{focusNode.label}</Strong>
            <Text style={{ fontSize: 10, opacity: 0.5 }}>{fmtCount(focusSessions)} sessions</Text>
            <button onClick={() => setFocusNodeId(null)} style={{ marginLeft: "auto", background: "none", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 4, color: "rgba(255,255,255,0.6)", cursor: "pointer", padding: "2px 8px", fontSize: 10 }}>Clear</button>
          </Flex>
          {focusInbound.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <Text style={{ fontSize: 10, opacity: 0.5 }}>Inbound ({focusInbound.length}):</Text>
              <Flex gap={6} flexWrap="wrap" style={{ marginTop: 2 }}>
                {focusInbound.sort((a, b) => b.value - a.value).slice(0, 6).map((l, i) => {
                  const src = nodes.find(n => n.id === l.source)!;
                  return <a key={i} href={appEntityId ? vitalsUrl(appEntityId, src.label) : '#'} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: "inherit", textDecoration: "none", cursor: appEntityId ? "pointer" : "default" }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(69,137,255,0.18)")} onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")} title={appEntityId ? `Open in Vitals: ${src.label}` : src.label}>{truncLabel(src.label, 30)} <Strong style={{ color: CYAN }}>{fmtCount(l.value)}</Strong></a>;
                })}
              </Flex>
            </div>
          )}
          {focusOutbound.length > 0 && (
            <div>
              <Text style={{ fontSize: 10, opacity: 0.5 }}>Outbound ({focusOutbound.length}):</Text>
              <Flex gap={6} flexWrap="wrap" style={{ marginTop: 2 }}>
                {focusOutbound.sort((a, b) => b.value - a.value).slice(0, 6).map((l, i) => {
                  const tgt = nodes.find(n => n.id === l.target)!;
                  return <a key={i} href={appEntityId ? vitalsUrl(appEntityId, tgt.label) : '#'} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: "inherit", textDecoration: "none", cursor: appEntityId ? "pointer" : "default" }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(69,137,255,0.18)")} onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")} title={appEntityId ? `Open in Vitals: ${tgt.label}` : tgt.label}>{truncLabel(tgt.label, 30)} <Strong style={{ color: GREEN }}>{fmtCount(l.value)}</Strong></a>;
                })}
              </Flex>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ---- Directed Flow Graph ----
  const renderDirectedFlowGraph = () => {
    // Build unique nodes with positions in a force-directed-like layout
    const uniqueNodes = new Map<string, { label: string; totalValue: number; depth: number }>();
    for (const n of nodes) {
      const existing = uniqueNodes.get(n.label);
      if (!existing || n.value > existing.totalValue) {
        uniqueNodes.set(n.label, { label: n.label, totalValue: n.value, depth: n.depth });
      }
    }
    const uNodes = Array.from(uniqueNodes.values()).sort((a, b) => b.totalValue - a.totalValue).slice(0, 16);
    // Aggregate links between unique labels
    const edgeMap = new Map<string, number>();
    for (const l of links) {
      const src = nodes.find(n => n.id === l.source)!;
      const tgt = nodes.find(n => n.id === l.target)!;
      const key = `${src.label}|||${tgt.label}`;
      edgeMap.set(key, (edgeMap.get(key) ?? 0) + l.value);
    }
    const edges = Array.from(edgeMap.entries()).map(([k, v]) => {
      const [from, to] = k.split("|||");
      return { from, to, value: v };
    }).sort((a, b) => b.value - a.value).slice(0, 30);

    const gW = 960;
    const gH = 500;
    const nodeRadius = 28;
    // Position nodes in columns by depth
    const depthGroups = new Map<number, typeof uNodes>();
    for (const n of uNodes) {
      const arr = depthGroups.get(n.depth) ?? [];
      arr.push(n);
      depthGroups.set(n.depth, arr);
    }
    const maxD = Math.max(...Array.from(depthGroups.keys()));
    const nodePositions = new Map<string, { x: number; y: number }>();
    for (const [d, group] of depthGroups) {
      const colX = 80 + (d / Math.max(maxD, 1)) * (gW - 160);
      group.forEach((n, i) => {
        const rowY = 50 + (i / Math.max(group.length - 1, 1)) * (gH - 100);
        nodePositions.set(n.label, { x: colX, y: group.length === 1 ? gH / 2 : rowY });
      });
    }

    return (
      <div className="uj-table-tile" style={{ padding: 16, overflowX: "auto" }}>
        <svg width={gW} height={gH} style={{ display: "block", margin: "0 auto" }}>
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="rgba(255,255,255,0.5)" />
            </marker>
          </defs>
          {/* Edges */}
          {edges.map((e, i) => {
            const from = nodePositions.get(e.from);
            const to = nodePositions.get(e.to);
            if (!from || !to) return null;
            const maxEdgeVal = edges[0]?.value ?? 1;
            const thickness = Math.max(1, (e.value / maxEdgeVal) * 8);
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const offsetX = dist > 0 ? (dx / dist) * nodeRadius : 0;
            const offsetY = dist > 0 ? (dy / dist) * nodeRadius : 0;
            const x1 = from.x + offsetX;
            const y1 = from.y + offsetY;
            const x2 = to.x - offsetX;
            const y2 = to.y - offsetY;
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2 - 10;
            return (
              <g key={`edge-${i}`}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={SANKEY_COLORS[i % SANKEY_COLORS.length]} strokeWidth={thickness} strokeOpacity={0.4} markerEnd="url(#arrowhead)" />
                <text x={midX} y={midY} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize={9} fontWeight={600}>{fmtCount(e.value)}</text>
              </g>
            );
          })}
          {/* Nodes */}
          {uNodes.map((n, i) => {
            const pos = nodePositions.get(n.label);
            if (!pos) return null;
            const color = SANKEY_COLORS[n.depth % SANKEY_COLORS.length];
            const isFocused = focusLabel === n.label;
            return (
              <g key={`node-${i}`} style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); handleLabelClick(n.label); }}>
                <circle cx={pos.x} cy={pos.y} r={nodeRadius} fill={color} fillOpacity={isFocused ? 1 : 0.8} stroke={isFocused ? "#fff" : color} strokeWidth={isFocused ? 3 : 2} />
                <text x={pos.x} y={pos.y - 3} textAnchor="middle" fill="white" fontSize={8} fontWeight={600}>{truncLabel(n.label, 14)}</text>
                <text x={pos.x} y={pos.y + 10} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={8}>{fmtCount(n.totalValue)}</text>
              </g>
            );
          })}
        </svg>
        {renderLabelPopup()}
      </div>
    );
  };

  // ---- Alluvial / Columnar ----
  const renderAlluvial = () => {
    const aW = 960;
    const aH = 540;
    const aPAD = { top: 50, right: 40, bottom: 20, left: 40 };
    const aInnerW = aW - aPAD.left - aPAD.right;
    const aInnerH = aH - aPAD.top - aPAD.bottom;
    const numCols = maxDepth + 1;
    const aColW = numCols > 0 ? aInnerW / numCols : aInnerW;
    const nodeW = 140;
    const nodeH = 36;
    const nodeGap = 8;

    // Group nodes by depth
    const depthCols = new Map<number, SankeyNode[]>();
    for (const n of nodes) {
      const arr = depthCols.get(n.depth) ?? [];
      arr.push(n);
      depthCols.set(n.depth, arr);
    }

    // Compute positions: discrete boxes arranged vertically within each Step column
    const alluvialNodes = new Map<string, { x: number; y: number; w: number; h: number; label: string; value: number; depth: number; cx: number; cy: number }>();
    for (const [d, col] of depthCols) {
      const sorted = [...col].sort((a, b) => b.value - a.value).slice(0, 6); // limit per column
      const cx = aPAD.left + d * aColW + aColW / 2;
      const totalH = sorted.length * nodeH + (sorted.length - 1) * nodeGap;
      let yStart = aPAD.top + (aInnerH - totalH) / 2;
      if (yStart < aPAD.top) yStart = aPAD.top;
      for (const n of sorted) {
        const x = cx - nodeW / 2;
        alluvialNodes.set(n.id, { x, y: yStart, w: nodeW, h: nodeH, label: n.label, value: n.value, depth: d, cx, cy: yStart + nodeH / 2 });
        yStart += nodeH + nodeGap;
      }
    }

    return (
      <div className="uj-table-tile" style={{ padding: 16, overflowX: "auto" }}>
        <svg width={aW} height={aH} style={{ display: "block", margin: "0 auto" }}>
          {/* Column background panels */}
          {Array.from({ length: numCols }, (_, d) => {
            const cx = aPAD.left + d * aColW + aColW / 2;
            const colPadX = 8;
            return (
              <g key={`col-bg-${d}`}>
                <rect x={cx - aColW / 2 + colPadX} y={aPAD.top - 20} width={aColW - colPadX * 2} height={aInnerH + 30} rx={8} fill="rgba(60,60,80,0.35)" stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
                <text x={cx} y={aPAD.top - 6} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={12} fontWeight={700}>Step {d + 1}</text>
              </g>
            );
          })}
          {/* Connecting arrows between nodes */}
          {links.map((l, i) => {
            const src = alluvialNodes.get(l.source);
            const tgt = alluvialNodes.get(l.target);
            if (!src || !tgt) return null;
            const x0 = src.x + src.w;
            const y0 = src.cy;
            const x1 = tgt.x;
            const y1 = tgt.cy;
            const cp = (x1 - x0) * 0.45;
            const maxVal = links.length > 0 ? Math.max(...links.map(ll => ll.value)) : 1;
            const thickness = Math.max(1, Math.min(4, (l.value / maxVal) * 4));
            const color = "rgba(180,180,200,0.4)";
            return (
              <path key={`al-${i}`} d={`M${x0},${y0} C${x0 + cp},${y0} ${x1 - cp},${y1} ${x1},${y1}`} fill="none" stroke={color} strokeWidth={thickness} markerEnd="url(#alluvial-arrow)" />
            );
          })}
          {/* Arrow marker */}
          <defs>
            <marker id="alluvial-arrow" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
              <polygon points="0 0, 6 2, 0 4" fill="rgba(180,180,200,0.5)" />
            </marker>
          </defs>
          {/* Node rectangles */}
          {Array.from(alluvialNodes.entries()).map(([id, n]) => {
            const color = SANKEY_COLORS[n.depth % SANKEY_COLORS.length];
            const isFocused = focusLabel === n.label;
            return (
              <g key={id} style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); handleLabelClick(n.label); }}>
                <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={5} fill={color} fillOpacity={isFocused ? 1 : 0.9} stroke={isFocused ? "#fff" : "rgba(255,255,255,0.15)"} strokeWidth={isFocused ? 2.5 : 1} />
                <text x={n.cx} y={n.y + n.h / 2 + 4} textAnchor="middle" fill="white" fontSize={10} fontWeight={600}>
                  {truncLabel(n.label, 16)} — {fmtCount(n.value)}
                </text>
              </g>
            );
          })}
        </svg>
        {renderLabelPopup()}
      </div>
    );
  };

  // ---- State Machine ----
  const renderStateMachine = () => {
    // Build aggregated transitions with conversion percentages
    const stateNodes = new Map<string, { label: string; totalOutbound: number; totalInbound: number; value: number }>();
    const stateEdges: { from: string; to: string; value: number; pct: number }[] = [];

    // Get unique page labels with totals
    for (const n of nodes) {
      const existing = stateNodes.get(n.label);
      if (existing) {
        existing.value = Math.max(existing.value, n.value);
      } else {
        stateNodes.set(n.label, { label: n.label, totalOutbound: 0, totalInbound: 0, value: n.value });
      }
    }

    // Aggregate edges between unique labels
    const edgeMap = new Map<string, number>();
    for (const l of links) {
      const src = nodes.find(n => n.id === l.source)!;
      const tgt = nodes.find(n => n.id === l.target)!;
      const key = `${src.label}|||${tgt.label}`;
      edgeMap.set(key, (edgeMap.get(key) ?? 0) + l.value);
    }
    for (const [key, value] of edgeMap) {
      const [from, to] = key.split("|||");
      const srcNode = stateNodes.get(from);
      if (srcNode) srcNode.totalOutbound += value;
      const tgtNode = stateNodes.get(to);
      if (tgtNode) tgtNode.totalInbound += value;
    }
    for (const [key, value] of edgeMap) {
      const [from, to] = key.split("|||");
      const srcNode = stateNodes.get(from);
      const pct = srcNode && srcNode.value > 0 ? (value / srcNode.value) * 100 : 0;
      stateEdges.push({ from, to, value, pct });
    }
    stateEdges.sort((a, b) => b.value - a.value);
    const topEdges = stateEdges.slice(0, 25);
    const topLabels = new Set<string>();
    for (const e of topEdges) { topLabels.add(e.from); topLabels.add(e.to); }
    const smNodes = Array.from(stateNodes.values()).filter(n => topLabels.has(n.label)).sort((a, b) => b.value - a.value).slice(0, 12);

    // Identify exit nodes: nodes with significantly more inbound than outbound (drop-off points)
    const exitThreshold = 0.3; // if outbound < 30% of value, treat as exit-heavy
    const exitNodes = new Set<string>();
    for (const n of smNodes) {
      if (n.value > 0 && n.totalOutbound < n.value * exitThreshold) {
        exitNodes.add(n.label);
      }
    }

    const smW = 960;
    const smH = 540;
    const nodeRectW = 120;
    const nodeRectH = 46;
    // Layout nodes in a flowing left-to-right grid
    const cols = 4;
    const rowCount = Math.ceil(smNodes.length / cols);
    const cellW = smW / cols;
    const cellH = smH / rowCount;
    const smPositions = new Map<string, { x: number; y: number }>();
    smNodes.forEach((n, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      smPositions.set(n.label, { x: cellW * col + cellW / 2, y: cellH * row + cellH / 2 });
    });

    return (
      <div className="uj-table-tile" style={{ padding: 16, overflowX: "auto" }}>
        <svg width={smW} height={smH} style={{ display: "block", margin: "0 auto" }}>
          <defs>
            <marker id="sm-arrow" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
              <polygon points="0 0, 6 2, 0 4" fill="rgba(255,255,255,0.6)" />
            </marker>
          </defs>
          {/* Edges with absolute session counts */}
          {topEdges.map((e, i) => {
            const from = smPositions.get(e.from);
            const to = smPositions.get(e.to);
            if (!from || !to) return null;
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 1) return null;
            const r = 50;
            const ox = (dx / dist) * r;
            const oy = (dy / dist) * r;
            const x1 = from.x + ox;
            const y1 = from.y + oy;
            const x2 = to.x - ox;
            const y2 = to.y - oy;
            // Curve the edge slightly
            const midX = (x1 + x2) / 2 + (dy / dist) * 18;
            const midY = (y1 + y2) / 2 - (dx / dist) * 18;
            const maxVal = topEdges[0]?.value ?? 1;
            const thickness = Math.max(1.5, (e.value / maxVal) * 5);
            const color = "rgba(200,200,220,0.5)";
            return (
              <g key={`sme-${i}`}>
                <path d={`M${x1},${y1} Q${midX},${midY} ${x2},${y2}`} fill="none" stroke={color} strokeWidth={thickness} markerEnd="url(#sm-arrow)" />
                <text x={midX} y={midY - 2} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={9} fontWeight={700}>{fmtCount(e.value)}</text>
              </g>
            );
          })}
          {/* State nodes as filled colored rectangles */}
          {smNodes.map((n, i) => {
            const pos = smPositions.get(n.label);
            if (!pos) return null;
            const isExit = exitNodes.has(n.label);
            const color = isExit ? RED : SANKEY_COLORS[i % SANKEY_COLORS.length];
            const isFocused = focusLabel === n.label;
            return (
              <g key={`smn-${i}`} style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); handleLabelClick(n.label); }}>
                <rect x={pos.x - nodeRectW / 2} y={pos.y - nodeRectH / 2} width={nodeRectW} height={nodeRectH} rx={6} fill={color} fillOpacity={isFocused ? 1 : 0.9} stroke={isFocused ? "#fff" : "rgba(255,255,255,0.15)"} strokeWidth={isFocused ? 2.5 : 1} />
                <text x={pos.x} y={pos.y - 4} textAnchor="middle" fill="white" fontSize={10} fontWeight={700}>{isExit ? "Exit" : truncLabel(n.label, 14)}</text>
                <text x={pos.x} y={pos.y + 12} textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize={9}>{fmtCount(n.value)} sessions</text>
              </g>
            );
          })}
        </svg>
        {renderLabelPopup()}
      </div>
    );
  };

  // ---- Render selected chart ----
  const renderChart = () => {
    switch (chartStyle) {
      case "gradient": return renderClassicSankey(true);
      case "directed": return renderDirectedFlowGraph();
      case "alluvial": return renderAlluvial();
      case "stateMachine": return renderStateMachine();
      case "classic":
      default: return renderClassicSankey(false);
    }
  };

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      {chartHeader}
      {renderChart()}

      {/* Transition table */}
      <SectionHeader title="Top Transitions" />
      <div className="uj-table-tile">
        <DataTable
          sortable
          data={links.slice(0, 30).map((l) => {
            const srcNode = nodes.find(n => n.id === l.source)!;
            const tgtNode = nodes.find(n => n.id === l.target)!;
            return {
              From: srcNode.label.substring(0, 40),
              To: tgtNode.label.substring(0, 40),
              Sessions: l.value,
              "% of Total": totalSessions > 0 ? (l.value / totalSessions) * 100 : 0,
            };
          })}
          columns={[
            { id: "From", header: "From", accessor: "From", cell: ({ value }: any) => <Strong style={{ color: BLUE }}>{value}</Strong> },
            { id: "To", header: "To", accessor: "To", cell: ({ value }: any) => <Text>{value}</Text> },
            { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Strong>{fmtCount(value)}</Strong> },
            { id: "% of Total", header: "% of Total", accessor: "% of Total", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtPct(value)}</Text> },
          ]}
        />
      </div>
    </Flex>
  );
}

// ===========================================================================
// TAB: Root Cause Correlation
// ===========================================================================
function RootCauseCorrelationTab({ hourlyData, stepDropData, quality, qualityPrev, overallApdex, overallApdexPrev, overallConv, overallConvPrev, isLoading, steps }: { hourlyData: any; stepDropData: any; quality: any; qualityPrev: any; overallApdex: number; overallApdexPrev: number; overallConv: number; overallConvPrev: number; isLoading: boolean; steps: StepDef[] }) {
  if (isLoading) return <Loading />;

  const hourlyRecords = (hourlyData.data?.records ?? []) as any[];
  const stepDropRecords = (stepDropData.data?.records ?? []) as any[];

  // Build hourly timeline data
  const hourly = hourlyRecords.map((r: any) => ({
    hour: Number(r.hour_bucket ?? 0),
    sessions: Number(r.total_sessions ?? 0),
    converted: Number(r.converted_sessions ?? 0),
    convRate: Number(r.conv_rate ?? 0),
    avgDuration: Number(r.avg_duration ?? 0),
    p90Duration: Number(r.p90_duration ?? 0),
    errorSessions: Number(r.error_sessions ?? 0),
    errorRate: Number(r.error_rate ?? 0),
    avgErrors: Number(r.avg_errors ?? 0),
  }));

  // Calculate per-hour correlations — find hours where conversion dips intersect with technical signals
  const avgConvRate = hourly.length > 0 ? hourly.reduce((s, h) => s + h.convRate, 0) / hourly.length : 0;
  const avgDuration = hourly.length > 0 ? hourly.reduce((s, h) => s + h.avgDuration, 0) / hourly.length : 0;
  const avgErrorRate = hourly.length > 0 ? hourly.reduce((s, h) => s + h.errorRate, 0) / hourly.length : 0;

  const signals = hourly.map((h) => {
    const convDeviation = avgConvRate > 0 ? (h.convRate - avgConvRate) / avgConvRate : 0;
    const durationDeviation = avgDuration > 0 ? (h.avgDuration - avgDuration) / avgDuration : 0;
    const errorDeviation = avgErrorRate > 0 ? (h.errorRate - avgErrorRate) / Math.max(avgErrorRate, 1) : 0;
    const isConvDrop = convDeviation < -0.1;
    const isLatencySpike = durationDeviation > 0.15;
    const isErrorSurge = errorDeviation > 0.2;
    const causes: string[] = [];
    if (isLatencySpike) causes.push("Latency spike");
    if (isErrorSurge) causes.push("Error surge");
    if (h.p90Duration > avgDuration * 2) causes.push("P90 outlier");
    const severity = causes.length >= 2 ? "critical" : causes.length === 1 ? "high" : isConvDrop ? "medium" : "normal";
    const confidence = Math.min(100, Math.round((Math.abs(durationDeviation) + Math.abs(errorDeviation)) * 100));
    return { ...h, convDeviation, durationDeviation, errorDeviation, isConvDrop, isLatencySpike, isErrorSurge, causes, severity, confidence };
  });

  const impactHours = signals.filter((s) => s.isConvDrop && s.causes.length > 0);
  const criticalHours = signals.filter((s) => s.severity === "critical");

  // Top root cause signals ranked by confidence
  const rankedSignals = [...impactHours].sort((a, b) => b.confidence - a.confidence);

  // Per-step hourly degradation
  const stepHourly = new Map<string, Map<number, any>>();
  for (const r of stepDropRecords) {
    const step = String(r.step_tag ?? "");
    const hour = Number(r.hour_bucket ?? 0);
    if (!stepHourly.has(step)) stepHourly.set(step, new Map());
    stepHourly.get(step)!.set(hour, {
      actions: Number(r.actions ?? 0),
      avg_dur: Number(r.avg_dur ?? 0),
      p90_dur: Number(r.p90_dur ?? 0),
      errors: Number(r.errors ?? 0),
      frustrated: Number(r.frustrated ?? 0),
    });
  }

  // Calculate which step is the worst contributor
  const stepScores = steps.map((step) => {
    const hours = stepHourly.get(step.label);
    if (!hours) return { step: step.label, avgDur: 0, p90Dur: 0, avgErrors: 0, avgFrustrated: 0, degradationScore: 0 };
    const entries = Array.from(hours.values());
    const avgDur = entries.reduce((s, e) => s + e.avg_dur, 0) / Math.max(entries.length, 1);
    const p90Dur = Math.max(...entries.map(e => e.p90_dur));
    const avgErrors = entries.reduce((s, e) => s + e.errors, 0) / Math.max(entries.length, 1);
    const avgFrustrated = entries.reduce((s, e) => s + e.frustrated, 0) / Math.max(entries.length, 1);
    const degradationScore = p90Dur > 0 ? ((p90Dur - avgDur) / p90Dur) * 100 : 0;
    return { step: step.label, avgDur, p90Dur, avgErrors, avgFrustrated, degradationScore };
  }).sort((a, b) => b.degradationScore - a.degradationScore);

  // Overall correlation summary
  const convChange = overallConvPrev > 0 ? ((overallConv - overallConvPrev) / overallConvPrev) * 100 : 0;
  const apdexChange = overallApdexPrev > 0 ? ((overallApdex - overallApdexPrev) / overallApdexPrev) * 100 : 0;
  const errorRate = quality.total > 0 ? (quality.errors / quality.total) * 100 : 0;
  const errorRatePrev = qualityPrev.total > 0 ? (qualityPrev.errors / qualityPrev.total) * 100 : 0;
  const errorChange = errorRatePrev > 0 ? ((errorRate - errorRatePrev) / errorRatePrev) * 100 : 0;
  const durationChange = qualityPrev.avg > 0 ? ((quality.avg - qualityPrev.avg) / qualityPrev.avg) * 100 : 0;

  const severityColor = (s: string) => s === "critical" ? RED : s === "high" ? ORANGE : s === "medium" ? YELLOW : GREEN;

  // SVG timeline chart dimensions
  const chartW = 720;
  const chartH = 200;
  const padL = 40;
  const padR = 20;
  const padT = 20;
  const padB = 30;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  const maxConv = Math.max(...signals.map(s => s.convRate), 1);
  const maxDur = Math.max(...signals.map(s => s.avgDuration), 1);
  const maxErr = Math.max(...signals.map(s => s.errorRate), 1);

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      <SectionHeader title="Root Cause Correlation" />
      <Text style={{ fontSize: 12, opacity: 0.5 }}>Correlates conversion drops with latency spikes, error surges, and P90 outliers on an hourly timeline. Identifies the technical driver behind every drop.</Text>

      {/* Period-over-period change summary */}
      <Flex gap={16} flexWrap="wrap">
        <div className="uj-kpi-card" style={{ minWidth: 150 }}>
          <Text className="uj-kpi-label">Conversion Δ</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: convChange >= 0 ? GREEN : RED }}>{convChange >= 0 ? "▲" : "▼"} {Math.abs(convChange).toFixed(1)}%</Heading>
          <Text style={{ fontSize: 10, opacity: 0.5 }}>{fmtPct(overallConvPrev)} → {fmtPct(overallConv)}</Text>
        </div>
        <div className="uj-kpi-card" style={{ minWidth: 150 }}>
          <Text className="uj-kpi-label">Apdex Δ</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: apdexChange >= 0 ? GREEN : RED }}>{apdexChange >= 0 ? "▲" : "▼"} {Math.abs(apdexChange).toFixed(1)}%</Heading>
          <Text style={{ fontSize: 10, opacity: 0.5 }}>{overallApdexPrev.toFixed(2)} → {overallApdex.toFixed(2)}</Text>
        </div>
        <div className="uj-kpi-card" style={{ minWidth: 150 }}>
          <Text className="uj-kpi-label">Error Rate Δ</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: errorChange <= 0 ? GREEN : RED }}>{errorChange > 0 ? "▲" : "▼"} {Math.abs(errorChange).toFixed(1)}%</Heading>
          <Text style={{ fontSize: 10, opacity: 0.5 }}>{fmtPct(errorRatePrev)} → {fmtPct(errorRate)}</Text>
        </div>
        <div className="uj-kpi-card" style={{ minWidth: 150 }}>
          <Text className="uj-kpi-label">Duration Δ</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: durationChange <= 0 ? GREEN : RED }}>{durationChange > 0 ? "▲" : "▼"} {Math.abs(durationChange).toFixed(1)}%</Heading>
          <Text style={{ fontSize: 10, opacity: 0.5 }}>{fmt(qualityPrev.avg)} → {fmt(quality.avg)}</Text>
        </div>
        <div className="uj-kpi-card" style={{ minWidth: 130 }}>
          <Text className="uj-kpi-label">Impact Hours</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: impactHours.length > 3 ? RED : impactHours.length > 0 ? ORANGE : GREEN }}>{impactHours.length}</Heading>
        </div>
        <div className="uj-kpi-card" style={{ minWidth: 130 }}>
          <Text className="uj-kpi-label">Critical Hours</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: criticalHours.length > 0 ? RED : GREEN }}>{criticalHours.length}</Heading>
        </div>
      </Flex>

      {/* Hourly correlation timeline SVG */}
      <SectionHeader title="Hourly Correlation Timeline" />
      <Text style={{ fontSize: 11, opacity: 0.5, marginBottom: 4 }}>Conversion rate (green), avg duration (blue), error rate (red). Red-shaded hours = conversion dip + technical signal detected.</Text>
      <div className="uj-table-tile" style={{ padding: 16, overflowX: "auto" }}>
        <svg width="100%" viewBox={`0 0 ${chartW} ${chartH}`}>
          {/* Background for impact hours */}
          {signals.map((s, i) => {
            if (!s.isConvDrop || s.causes.length === 0) return null;
            const barW = plotW / 24;
            const x = padL + s.hour * barW;
            return <rect key={`bg-${i}`} x={x} y={padT} width={barW} height={plotH} fill={RED} opacity={0.08} />;
          })}
          {/* Y axis labels */}
          <text x={padL - 4} y={padT + 4} textAnchor="end" fill="rgba(255,255,255,0.4)" fontSize={9}>100%</text>
          <text x={padL - 4} y={padT + plotH / 2} textAnchor="end" fill="rgba(255,255,255,0.4)" fontSize={9}>50%</text>
          <text x={padL - 4} y={padT + plotH} textAnchor="end" fill="rgba(255,255,255,0.4)" fontSize={9}>0%</text>
          {/* Grid lines */}
          <line x1={padL} y1={padT} x2={padL + plotW} y2={padT} stroke="rgba(255,255,255,0.05)" />
          <line x1={padL} y1={padT + plotH / 2} x2={padL + plotW} y2={padT + plotH / 2} stroke="rgba(255,255,255,0.05)" />
          <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="rgba(255,255,255,0.08)" />
          {/* Conversion line */}
          {signals.length > 1 && (
            <polyline fill="none" stroke={GREEN} strokeWidth={2} points={signals.map((s) => {
              const x = padL + (s.hour / 23) * plotW;
              const y = padT + plotH - (s.convRate / Math.max(maxConv, 1)) * plotH;
              return `${x},${y}`;
            }).join(" ")} />
          )}
          {/* Duration line (normalized) */}
          {signals.length > 1 && (
            <polyline fill="none" stroke={BLUE} strokeWidth={1.5} strokeDasharray="4 3" points={signals.map((s) => {
              const x = padL + (s.hour / 23) * plotW;
              const y = padT + plotH - (s.avgDuration / Math.max(maxDur, 1)) * plotH;
              return `${x},${y}`;
            }).join(" ")} />
          )}
          {/* Error rate line (normalized) */}
          {signals.length > 1 && (
            <polyline fill="none" stroke={RED} strokeWidth={1.5} strokeDasharray="2 2" points={signals.map((s) => {
              const x = padL + (s.hour / 23) * plotW;
              const y = padT + plotH - (s.errorRate / Math.max(maxErr, 1)) * plotH;
              return `${x},${y}`;
            }).join(" ")} />
          )}
          {/* Data points */}
          {signals.map((s, i) => {
            const x = padL + (s.hour / 23) * plotW;
            const yConv = padT + plotH - (s.convRate / Math.max(maxConv, 1)) * plotH;
            return <circle key={`pt-${i}`} cx={x} cy={yConv} r={s.isConvDrop ? 4 : 2.5} fill={s.causes.length > 0 ? RED : GREEN} opacity={0.8}><title>{`${s.hour}:00 — Conv: ${s.convRate.toFixed(1)}% | Dur: ${fmt(s.avgDuration)} | Err: ${s.errorRate.toFixed(1)}%${s.causes.length > 0 ? ` | ${s.causes.join(", ")}` : ""}`}</title></circle>;
          })}
          {/* X axis */}
          {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
            <text key={`h-${h}`} x={padL + (h / 23) * plotW} y={chartH - 4} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={9}>{h}:00</text>
          ))}
        </svg>
      </div>

      {/* Ranked root cause signals */}
      <SectionHeader title="Root Cause Signals" />
      {rankedSignals.length === 0 ? (
        <div className="uj-table-tile" style={{ padding: 24, textAlign: "center" }}>
          <Text style={{ color: GREEN, fontSize: 14 }}>No conversion-impacting anomalies detected in the current period.</Text>
        </div>
      ) : (
        <Flex gap={12} flexWrap="wrap">
          {rankedSignals.slice(0, 8).map((s, i) => (
            <div key={i} className="uj-anomaly-card" style={{ borderLeftColor: severityColor(s.severity), minWidth: 280 }}>
              <Flex alignItems="center" justifyContent="space-between" style={{ marginBottom: 6 }}>
                <Strong style={{ fontSize: 13 }}>{s.hour}:00 — {s.hour + 1}:00</Strong>
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: `${severityColor(s.severity)}18`, color: severityColor(s.severity), fontWeight: 700, textTransform: "uppercase" as const }}>{s.severity}</span>
              </Flex>
              <Flex gap={16} style={{ marginBottom: 6 }}>
                <div><Text style={{ fontSize: 10, opacity: 0.5 }}>Conversion</Text><Strong style={{ display: "block", fontSize: 14, color: RED }}>{s.convRate.toFixed(1)}%</Strong></div>
                <div><Text style={{ fontSize: 10, opacity: 0.5 }}>Avg Duration</Text><Strong style={{ display: "block", fontSize: 14, color: s.isLatencySpike ? RED : BLUE }}>{fmt(s.avgDuration)}</Strong></div>
                <div><Text style={{ fontSize: 10, opacity: 0.5 }}>Error Rate</Text><Strong style={{ display: "block", fontSize: 14, color: s.isErrorSurge ? RED : GREEN }}>{s.errorRate.toFixed(1)}%</Strong></div>
                <div><Text style={{ fontSize: 10, opacity: 0.5 }}>Confidence</Text><Strong style={{ display: "block", fontSize: 14, color: s.confidence > 60 ? ORANGE : BLUE }}>{s.confidence}%</Strong></div>
              </Flex>
              <Flex gap={6} flexWrap="wrap">
                {s.causes.map((c, ci) => (
                  <span key={ci} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "rgba(194,25,48,0.12)", color: RED, fontWeight: 600 }}>{c}</span>
                ))}
              </Flex>
            </div>
          ))}
        </Flex>
      )}

      {/* Funnel step degradation ranking */}
      <SectionHeader title="Step Degradation Ranking" />
      <Text style={{ fontSize: 11, opacity: 0.5 }}>Steps ranked by P90 vs. Avg duration spread — higher degradation score = more tail latency, likely root cause contributor.</Text>
      <div className="uj-table-tile">
        <DataTable
          sortable
          data={stepScores.map((s) => ({
            Step: s.step,
            "Avg Duration": s.avgDur,
            "P90 Duration": s.p90Dur,
            "Avg Errors/hr": s.avgErrors,
            "Avg Frustrated/hr": s.avgFrustrated,
            "Degradation Score": s.degradationScore,
          }))}
          columns={[
            { id: "Step", header: "Step", accessor: "Step", cell: ({ value }: any) => <Strong style={{ color: BLUE }}>{value}</Strong> },
            { id: "Avg Duration", header: "Avg Dur", accessor: "Avg Duration", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmt(value)}</Text> },
            { id: "P90 Duration", header: "P90 Dur", accessor: "P90 Duration", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 3000 ? RED : value > 1500 ? YELLOW : GREEN }}>{fmt(value)}</Strong> },
            { id: "Avg Errors/hr", header: "Errors/hr", accessor: "Avg Errors/hr", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 5 ? RED : value > 1 ? YELLOW : GREEN }}>{value.toFixed(1)}</Text> },
            { id: "Avg Frustrated/hr", header: "Frustrated/hr", accessor: "Avg Frustrated/hr", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 5 ? RED : value > 1 ? YELLOW : GREEN }}>{value.toFixed(1)}</Text> },
            { id: "Degradation Score", header: "Degradation", accessor: "Degradation Score", sortType: "number" as any, cell: ({ value }: any) => (
              <Flex alignItems="center" gap={8}>
                <div style={{ width: 60, height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3 }}>
                  <div style={{ width: `${Math.min(value, 100)}%`, height: "100%", background: value > 50 ? RED : value > 25 ? ORANGE : GREEN, borderRadius: 3 }} />
                </div>
                <Strong style={{ color: value > 50 ? RED : value > 25 ? ORANGE : GREEN, fontSize: 12 }}>{value.toFixed(0)}%</Strong>
              </Flex>
            ) },
          ]}
        />
      </div>

      {/* Hourly detail table */}
      <SectionHeader title="Hourly Breakdown" />
      <div className="uj-table-tile">
        <DataTable
          sortable
          data={signals.map((s) => ({
            Hour: `${s.hour}:00`,
            Sessions: s.sessions,
            "Conv Rate": s.convRate,
            "Avg Duration": s.avgDuration,
            "P90 Duration": s.p90Duration,
            "Error Rate": s.errorRate,
            Severity: s.severity,
            Causes: s.causes.join(", ") || "—",
          }))}
          columns={[
            { id: "Hour", header: "Hour", accessor: "Hour" },
            { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
            { id: "Conv Rate", header: "Conv %", accessor: "Conv Rate", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: statusClr(value) }}>{fmtPct(value)}</Strong> },
            { id: "Avg Duration", header: "Avg Dur", accessor: "Avg Duration", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmt(value)}</Text> },
            { id: "P90 Duration", header: "P90 Dur", accessor: "P90 Duration", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 4000 ? RED : value > 2000 ? YELLOW : GREEN }}>{fmt(value)}</Strong> },
            { id: "Error Rate", header: "Err %", accessor: "Error Rate", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 5 ? RED : value > 2 ? YELLOW : GREEN }}>{fmtPct(value)}</Text> },
            { id: "Severity", header: "Severity", accessor: "Severity", cell: ({ value }: any) => <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: `${severityColor(value)}18`, color: severityColor(value), fontWeight: 700, textTransform: "uppercase" as const }}>{value}</span> },
            { id: "Causes", header: "Root Causes", accessor: "Causes", cell: ({ value }: any) => <Text style={{ color: value !== "—" ? RED : "rgba(255,255,255,0.3)" }}>{value}</Text> },
          ]}
        />
      </div>

      {/* Diagnosis */}
      <SectionHeader title="Automated Diagnosis" />
      <Flex gap={12} flexWrap="wrap">
        {criticalHours.length > 0 && (
          <div className="uj-table-tile" style={{ padding: 16, flex: 1, minWidth: 280, borderLeft: `3px solid ${RED}` }}>
            <Strong style={{ color: RED }}>Critical: Immediate Action Required</Strong>
            <Paragraph style={{ fontSize: 12, marginTop: 6 }}>
              {criticalHours.length} hour(s) show overlapping latency spikes + error surges during conversion dips. 
              Peak impact at {criticalHours[0]?.hour ?? 0}:00 with {fmtPct(criticalHours[0]?.convRate ?? 0)} conversion ({criticalHours[0]?.causes.join(" + ") ?? "multiple signals"}).
              {stepScores[0]?.degradationScore > 30 ? ` Step "${stepScores[0].step}" shows highest degradation (${stepScores[0].degradationScore.toFixed(0)}%) — investigate this step first.` : ""}
            </Paragraph>
          </div>
        )}
        {impactHours.length > 0 && criticalHours.length === 0 && (
          <div className="uj-table-tile" style={{ padding: 16, flex: 1, minWidth: 280, borderLeft: `3px solid ${ORANGE}` }}>
            <Strong style={{ color: ORANGE }}>Warning: Monitor Closely</Strong>
            <Paragraph style={{ fontSize: 12, marginTop: 6 }}>
              {impactHours.length} hour(s) show single-signal conversion impact. Most common cause: {impactHours[0]?.causes[0] ?? "latency"}.
              Consider investigating backend performance during {impactHours[0]?.hour ?? 0}:00-{(impactHours[0]?.hour ?? 0) + 1}:00 window.
            </Paragraph>
          </div>
        )}
        {impactHours.length === 0 && (
          <div className="uj-table-tile" style={{ padding: 16, flex: 1, minWidth: 280, borderLeft: `3px solid ${GREEN}` }}>
            <Strong style={{ color: GREEN }}>Healthy: No Correlated Anomalies</Strong>
            <Paragraph style={{ fontSize: 12, marginTop: 6 }}>
              No hours show overlapping conversion drops with technical signals. Performance is stable across the period.
            </Paragraph>
          </div>
        )}
        <div className="uj-table-tile" style={{ padding: 16, flex: 1, minWidth: 280, borderLeft: `3px solid ${BLUE}` }}>
          <Strong style={{ color: BLUE }}>Summary</Strong>
          <Paragraph style={{ fontSize: 12, marginTop: 6 }}>
            Monitored {hourly.length} hours, {impactHours.length} with correlated impact. 
            Conversion {convChange >= 0 ? "improved" : "declined"} {Math.abs(convChange).toFixed(1)}% vs. previous period.
            {durationChange > 10 ? ` Duration increased ${durationChange.toFixed(0)}% — likely primary contributor.` : ""}
            {errorChange > 20 ? ` Error rate spiked ${errorChange.toFixed(0)}% — investigate error sources.` : ""}
          </Paragraph>
        </div>
      </Flex>
    </Flex>
  );
}

// ===========================================================================
// TAB: Predictive Forecasting
// ===========================================================================
function PredictiveForecastingTab({ trendData, apdexTrendData, vitalsTrendData, quality, overallApdex, overallConv, isLoading, steps }: { trendData: any; apdexTrendData: any; vitalsTrendData: any; quality: any; overallApdex: number; overallConv: number; isLoading: boolean; steps: StepDef[] }) {
  if (isLoading) return <Loading />;

  const trendRecords = (trendData.data?.records ?? []) as any[];
  const apdexRecords = (apdexTrendData.data?.records ?? []) as any[];

  // Parse daily trend data
  const dailyMetrics = trendRecords.map((r: any) => ({
    day: String(r.day_bucket ?? ""),
    sessions: Number(r.total_sessions ?? 0),
    converted: Number(r.converted_sessions ?? 0),
    convRate: Number(r.conv_rate ?? 0),
    avgDuration: Number(r.avg_duration ?? 0),
    errors: Number(r.total_errors ?? 0),
    actions: Number(r.total_actions ?? 0),
    errorRate: Number(r.error_rate ?? 0),
  }));

  const dailyApdex = apdexRecords.map((r: any) => {
    const total = Number(r.total ?? 0);
    const sat = Number(r.satisfied ?? 0);
    const tol = Number(r.tolerating ?? 0);
    return {
      day: String(r.day_bucket ?? ""),
      apdex: calcApdex(sat, tol, total),
      avgDur: Number(r.avg_dur ?? 0),
      p90Dur: Number(r.p90_dur ?? 0),
      total,
      frustrated: Number(r.frustrated ?? 0),
    };
  });

  // Linear regression helper
  function linearRegression(values: number[]): { slope: number; intercept: number; predict: (x: number) => number } {
    const n = values.length;
    if (n < 2) return { slope: 0, intercept: values[0] ?? 0, predict: () => values[0] ?? 0 };
    const xs = values.map((_, i) => i);
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((a, x, i) => a + x * values[i], 0);
    const sumX2 = xs.reduce((a, x) => a + x * x, 0);
    const denom = n * sumX2 - sumX * sumX;
    const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept, predict: (x: number) => intercept + slope * x };
  }

  // Build forecasts for key metrics
  const apdexValues = dailyApdex.map(d => d.apdex);
  const convValues = dailyMetrics.map(d => d.convRate);
  const errorValues = dailyMetrics.map(d => d.errorRate);
  const durationValues = dailyApdex.map(d => d.avgDur);

  const apdexReg = linearRegression(apdexValues);
  const convReg = linearRegression(convValues);
  const errorReg = linearRegression(errorValues);
  const durationReg = linearRegression(durationValues);

  // Web vitals trend data
  const vitalsRecords = (vitalsTrendData.data?.records ?? []) as any[];
  const lcpValues = vitalsRecords.map((r: any) => Number(r.lcp_val ?? 0)).filter(v => v > 0);
  const clsValues = vitalsRecords.map((r: any) => Number(r.cls_val ?? 0));
  const inpValues = vitalsRecords.map((r: any) => Number(r.inp_val ?? 0)).filter(v => v > 0);
  const ttfbValues = vitalsRecords.map((r: any) => Number(r.ttfb_val ?? 0)).filter(v => v > 0);
  const loadValues = vitalsRecords.map((r: any) => Number(r.load_val ?? 0)).filter(v => v > 0);

  const lcpReg = linearRegression(lcpValues);
  const clsReg = linearRegression(clsValues);
  const inpReg = linearRegression(inpValues);
  const ttfbReg = linearRegression(ttfbValues);
  const loadReg = linearRegression(loadValues);

  const currentLcp = lcpValues.length > 0 ? lcpValues[lcpValues.length - 1] : 0;
  const currentCls = clsValues.length > 0 ? clsValues[clsValues.length - 1] : 0;
  const currentInp = inpValues.length > 0 ? inpValues[inpValues.length - 1] : 0;
  const currentTtfb = ttfbValues.length > 0 ? ttfbValues[ttfbValues.length - 1] : 0;
  const currentLoad = loadValues.length > 0 ? loadValues[loadValues.length - 1] : 0;

  const n = apdexValues.length;
  const FORECAST_DAYS = 7;

  // Performance budget thresholds
  const budgets = [
    { metric: "Apdex", current: overallApdex, threshold: 0.85, direction: "above" as const, reg: apdexReg, format: (v: number) => v.toFixed(2), values: apdexValues, color: apdexClr(overallApdex) },
    { metric: "Conversion Rate", current: overallConv, threshold: 20, direction: "above" as const, reg: convReg, format: fmtPct, values: convValues, color: statusClr(overallConv) },
    { metric: "Error Rate", current: quality.total > 0 ? (quality.errors / quality.total) * 100 : 0, threshold: 2, direction: "below" as const, reg: errorReg, format: fmtPct, values: errorValues, color: (quality.total > 0 ? (quality.errors / quality.total) * 100 : 0) > 2 ? RED : GREEN },
    { metric: "Avg Duration", current: quality.avg, threshold: 2000, direction: "below" as const, reg: durationReg, format: fmt, values: durationValues, color: quality.avg > 2000 ? RED : quality.avg > 1000 ? YELLOW : GREEN },
    { metric: "LCP", current: currentLcp, threshold: CWV.lcp.good, direction: "below" as const, reg: lcpReg, format: fmt, values: lcpValues, color: cwvClr(currentLcp, "lcp") },
    { metric: "CLS", current: currentCls, threshold: CWV.cls.good, direction: "below" as const, reg: clsReg, format: (v: number) => v.toFixed(3), values: clsValues, color: cwvClr(currentCls, "cls") },
    { metric: "INP", current: currentInp, threshold: CWV.inp.good, direction: "below" as const, reg: inpReg, format: fmt, values: inpValues, color: cwvClr(currentInp, "inp") },
    { metric: "TTFB", current: currentTtfb, threshold: CWV.ttfb.good, direction: "below" as const, reg: ttfbReg, format: fmt, values: ttfbValues, color: cwvClr(currentTtfb, "ttfb") },
    { metric: "Load Event End", current: currentLoad, threshold: 3000, direction: "below" as const, reg: loadReg, format: fmt, values: loadValues, color: currentLoad <= 3000 ? GREEN : currentLoad <= 5000 ? YELLOW : RED },
  ].map((b) => {
    const bLen = b.values.length;
    const projected7d = b.reg.predict(bLen - 1 + FORECAST_DAYS);
    const dailyRate = b.reg.slope;
    // When insufficient data points, use gap between current and last value as a directional hint
    const effectiveRate = bLen >= 2 ? dailyRate : (b.values.length > 0 ? (b.values[b.values.length - 1] - b.current) : 0);
    const isStable = Math.abs(effectiveRate) < 0.001;
    const improving = isStable ? false : b.direction === "above" ? effectiveRate > 0 : effectiveRate < 0;
    const trend: "improving" | "stable" | "degrading" = isStable ? "stable" : improving ? "improving" : "degrading";
    const currentGood = b.direction === "above" ? b.current >= b.threshold : b.current <= b.threshold;
    const projectedGood = b.direction === "above" ? projected7d >= b.threshold : projected7d <= b.threshold;

    // Days to breach
    let daysToBreach: number | null = null;
    if (currentGood && !projectedGood && dailyRate !== 0) {
      if (b.direction === "above") {
        daysToBreach = dailyRate < 0 ? Math.ceil((b.threshold - b.current) / dailyRate) : null;
      } else {
        daysToBreach = dailyRate > 0 ? Math.ceil((b.threshold - b.current) / dailyRate) : null;
      }
      if (daysToBreach != null && daysToBreach < 0) daysToBreach = null;
    }

    const severity = daysToBreach != null && daysToBreach <= 3 ? "critical" : daysToBreach != null && daysToBreach <= 7 ? "warning" : !currentGood && !projectedGood ? "breached" : !currentGood && projectedGood ? "recovering" : "healthy";

    return { ...b, projected7d, dailyRate, effectiveRate, improving, trend, isStable, currentGood, projectedGood, daysToBreach, severity };
  });

  const healthyCount = budgets.filter(b => b.severity === "healthy" || b.severity === "recovering").length;
  const atRiskCount = budgets.filter(b => b.severity === "warning" || b.severity === "critical").length;
  const breachedCount = budgets.filter(b => b.severity === "breached").length;

  const severityColor = (s: string) => s === "critical" ? RED : s === "warning" ? ORANGE : s === "breached" ? RED : s === "recovering" ? YELLOW : GREEN;
  const severityLabel = (s: string) => s === "critical" ? "BREACH IMMINENT" : s === "warning" ? "AT RISK" : s === "breached" ? "BREACHED" : s === "recovering" ? "RECOVERING" : "HEALTHY";

  // SVG trend chart
  const chartW = 720;
  const chartH = 180;
  const padL = 50;
  const padR = 80;
  const padT = 20;
  const padB = 30;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;
  const totalPoints = n + FORECAST_DAYS;

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      <SectionHeader title="Predictive Forecasting" />
      <Text style={{ fontSize: 12, opacity: 0.5 }}>Projects key metrics forward {FORECAST_DAYS} days using linear regression on the selected timeframe. Flags metrics trending toward budget breach.</Text>

      {/* KPIs */}
      <Flex gap={16} flexWrap="wrap">
        <div className="uj-kpi-card" style={{ minWidth: 140 }}>
          <Text className="uj-kpi-label">Data Points</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: BLUE }}>{n}</Heading>
        </div>
        <div className="uj-kpi-card" style={{ minWidth: 140 }}>
          <Text className="uj-kpi-label">Healthy</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: GREEN }}>{healthyCount}</Heading>
        </div>
        <div className="uj-kpi-card" style={{ minWidth: 140 }}>
          <Text className="uj-kpi-label">At Risk</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: atRiskCount > 0 ? ORANGE : GREEN }}>{atRiskCount}</Heading>
        </div>
        <div className="uj-kpi-card" style={{ minWidth: 140 }}>
          <Text className="uj-kpi-label">Breached</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: breachedCount > 0 ? RED : GREEN }}>{breachedCount}</Heading>
        </div>
        <div className="uj-kpi-card" style={{ minWidth: 140 }}>
          <Text className="uj-kpi-label">Forecast</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: PURPLE }}>+{FORECAST_DAYS}d</Heading>
        </div>
      </Flex>

      {/* Forecast cards per metric */}
      <SectionHeader title="Metric Forecasts" />
      <Flex gap={12} flexWrap="wrap">
        {budgets.map((b) => (
          <div key={b.metric} className="uj-anomaly-card" style={{ borderLeftColor: severityColor(b.severity), minWidth: 320, flex: 1 }}>
            <Flex alignItems="center" justifyContent="space-between" style={{ marginBottom: 8 }}>
              <Strong style={{ fontSize: 14 }}>{b.metric}</Strong>
              <span style={{ fontSize: 10, padding: "2px 10px", borderRadius: 4, background: `${severityColor(b.severity)}18`, color: severityColor(b.severity), fontWeight: 700, textTransform: "uppercase" as const }}>{severityLabel(b.severity)}</span>
            </Flex>
            <Flex gap={20} style={{ marginBottom: 8 }}>
              <div><Text style={{ fontSize: 10, opacity: 0.5 }}>Current</Text><Strong style={{ display: "block", fontSize: 16, color: b.color }}>{b.format(b.current)}</Strong></div>
              <div><Text style={{ fontSize: 10, opacity: 0.5 }}>Projected +7d</Text><Strong style={{ display: "block", fontSize: 16, color: b.projectedGood ? GREEN : RED }}>{b.format(b.projected7d)}</Strong></div>
              <div><Text style={{ fontSize: 10, opacity: 0.5 }}>Budget</Text><Strong style={{ display: "block", fontSize: 16, opacity: 0.6 }}>{b.direction === "above" ? "≥" : "≤"} {b.format(b.threshold)}</Strong></div>
              <div><Text style={{ fontSize: 10, opacity: 0.5 }}>Daily Δ</Text><Strong style={{ display: "block", fontSize: 14, color: b.isStable ? BLUE : b.improving ? GREEN : RED }}>{b.isStable ? "● Stable" : `${b.improving ? "▲" : "▼"} ${b.format(Math.abs(b.effectiveRate))}/day`}</Strong></div>
            </Flex>
            {b.daysToBreach != null && (
              <div style={{ padding: "6px 12px", background: `${severityColor(b.severity)}10`, borderRadius: 6, marginBottom: 6 }}>
                <Strong style={{ color: severityColor(b.severity), fontSize: 12 }}>
                  Projected to breach budget in ~{b.daysToBreach} day{b.daysToBreach !== 1 ? "s" : ""}
                </Strong>
              </div>
            )}
            {b.severity === "breached" && (
              <div style={{ padding: "6px 12px", background: `${RED}10`, borderRadius: 6, marginBottom: 6 }}>
                <Strong style={{ color: RED, fontSize: 12 }}>Currently outside budget threshold — action needed</Strong>
              </div>
            )}
            {b.severity === "recovering" && (
              <div style={{ padding: "6px 12px", background: `${YELLOW}10`, borderRadius: 6, marginBottom: 6 }}>
                <Strong style={{ color: YELLOW, fontSize: 12 }}>Currently outside budget but trending back toward compliance</Strong>
              </div>
            )}
            {/* Mini trend chart */}
            {(() => {
              const svgW = 300;
              const svgH = 100;
              const rightPad = 40;
              // Build combined series: [current, ...daily values] for actual, then forecast
              const chartValues = [b.current, ...b.values];
              const chartN = chartValues.length;
              const totalPts = chartN + FORECAST_DAYS;
              const allVals = [...chartValues, b.threshold, b.projected7d];
              const vMin = Math.min(...allVals);
              const vMax = Math.max(...allVals);
              const range = vMax - vMin || 1;
              const valToY = (v: number) => (svgH - 6) - ((v - vMin) / range) * (svgH - 12);
              const thY = valToY(b.threshold);
              const actW = (chartN / totalPts) * (svgW - 10 - rightPad);
              const fmtVal = (v: number) => b.format(v);
              return (
              <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} style={{ marginTop: 4 }}>
                {/* Y-axis labels on right */}
                <text x={svgW - 2} y={valToY(vMax) + 3} textAnchor="end" fill="rgba(255,255,255,0.35)" fontSize={7}>{fmtVal(vMax)}</text>
                <text x={svgW - 2} y={valToY(vMin) - 1} textAnchor="end" fill="rgba(255,255,255,0.35)" fontSize={7}>{fmtVal(vMin)}</text>
                {Math.abs(thY - valToY(vMax)) > 12 && Math.abs(thY - valToY(vMin)) > 12 && (
                  <text x={svgW - 2} y={thY < 14 ? thY + 10 : thY - 2} textAnchor="end" fill="rgba(255,255,255,0.4)" fontSize={7}>{fmtVal(b.threshold)}</text>
                )}
                {/* Threshold line */}
                <line x1={0} y1={thY} x2={svgW - rightPad} y2={thY} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 3" />
                <text x={svgW - rightPad - 2} y={thY < 14 ? thY + 12 : thY - 3} textAnchor="end" fill="rgba(255,255,255,0.25)" fontSize={7}>budget</text>
                {/* Actual data line: current → daily values */}
                {chartValues.length > 1 ? (
                  <>
                    <polygon fill={`${BLUE}12`} points={`5,${svgH - 6} ${chartValues.map((v, i) => `${5 + (i / (chartN - 1)) * actW},${valToY(v)}`).join(" ")} ${5 + actW},${svgH - 6}`} />
                    <polyline fill="none" stroke={BLUE} strokeWidth={2} points={chartValues.map((v, i) => `${5 + (i / (chartN - 1)) * actW},${valToY(v)}`).join(" ")} />
                    {chartValues.map((v, i) => (
                      <circle key={i} cx={5 + (i / (chartN - 1)) * actW} cy={valToY(v)} r={i === 0 ? 3.5 : 2.5} fill={i === 0 ? GREEN : BLUE} style={{ cursor: "pointer" }}><title>{fmtVal(v)}</title></circle>
                    ))}
                  </>
                ) : chartValues.length === 1 ? (
                  <>
                    <line x1={5} y1={valToY(chartValues[0])} x2={5 + actW} y2={valToY(chartValues[0])} stroke={BLUE} strokeWidth={2} />
                    <circle cx={5} cy={valToY(chartValues[0])} r={3} fill={BLUE} style={{ cursor: "pointer" }}><title>{fmtVal(chartValues[0])}</title></circle>
                  </>
                ) : null}
                {/* Forecast extension */}
                {chartValues.length > 0 && (() => {
                  const lastActual = chartValues[chartValues.length - 1];
                  const forecastPts: string[] = [];
                  const forecastVals: number[] = [];
                  for (let d = 0; d <= FORECAST_DAYS; d++) {
                    const val = d === 0 ? lastActual : b.reg.predict(b.values.length - 1 + d);
                    const x = 5 + actW + (d / FORECAST_DAYS) * (svgW - 10 - rightPad - actW);
                    forecastPts.push(`${x},${valToY(val)}`);
                    forecastVals.push(val);
                  }
                  return (
                    <>
                      <polygon fill={`${PURPLE}08`} points={`${5 + actW},${svgH - 6} ${forecastPts.join(" ")} ${svgW - 5 - rightPad},${svgH - 6}`} />
                      <polyline fill="none" stroke={PURPLE} strokeWidth={2} strokeDasharray="6 3" points={forecastPts.join(" ")} />
                      {forecastVals.map((val, d) => {
                        const x = 5 + actW + (d / FORECAST_DAYS) * (svgW - 10 - rightPad - actW);
                        return d > 0 ? <circle key={`f${d}`} cx={x} cy={valToY(val)} r={1.5} fill={PURPLE} style={{ cursor: "pointer" }}><title>+{d}d: {fmtVal(val)}</title></circle> : null;
                      })}
                    </>
                  );
                })()}
                {/* Vertical divider between actual & forecast */}
                <line x1={5 + actW} y1={0} x2={5 + actW} y2={svgH} stroke="rgba(255,255,255,0.1)" strokeDasharray="2 2" />
                <text x={5 + actW + 3} y={12} fill="rgba(255,255,255,0.2)" fontSize={7}>forecast</text>
              </svg>
              );
            })()}
          </div>
        ))}
      </Flex>

      {/* Daily trend table */}
      <SectionHeader title="Trend Data" />
      <div className="uj-table-tile">
        <DataTable
          sortable
          data={dailyApdex.map((d, i) => {
            const metrics = dailyMetrics[i];
            const vitals = vitalsRecords[i];
            return {
              Day: d.day,
              Sessions: metrics?.sessions ?? 0,
              Apdex: d.apdex,
              "Conv Rate": metrics?.convRate ?? 0,
              "Avg Duration": d.avgDur,
              "P90 Duration": d.p90Dur,
              "Error Rate": metrics?.errorRate ?? 0,
              "Frustrated %": d.total > 0 ? (d.frustrated / d.total) * 100 : 0,
              LCP: Number(vitals?.lcp_val ?? 0),
              CLS: Number(vitals?.cls_val ?? 0),
              INP: Number(vitals?.inp_val ?? 0),
              TTFB: Number(vitals?.ttfb_val ?? 0),
              "Load End": Number(vitals?.load_val ?? 0),
            };
          })}
          columns={[
            { id: "Day", header: "Day", accessor: "Day", cell: ({ value }: any) => <Text style={{ fontSize: 12 }}>{value}</Text> },
            { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
            { id: "Apdex", header: "Apdex", accessor: "Apdex", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: apdexClr(value) }}>{value.toFixed(2)}</Strong> },
            { id: "Conv Rate", header: "Conv %", accessor: "Conv Rate", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: statusClr(value) }}>{fmtPct(value)}</Strong> },
            { id: "Avg Duration", header: "Avg Dur", accessor: "Avg Duration", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmt(value)}</Text> },
            { id: "P90 Duration", header: "P90 Dur", accessor: "P90 Duration", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 4000 ? RED : value > 2000 ? YELLOW : GREEN }}>{fmt(value)}</Strong> },
            { id: "Error Rate", header: "Err %", accessor: "Error Rate", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 2 ? RED : value > 1 ? YELLOW : GREEN }}>{fmtPct(value)}</Text> },
            { id: "Frustrated %", header: "Frust %", accessor: "Frustrated %", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 10 ? RED : value > 5 ? YELLOW : GREEN }}>{fmtPct(value)}</Text> },
            { id: "LCP", header: "LCP", accessor: "LCP", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: cwvClr(value, "lcp") }}>{fmt(value)}</Strong> },
            { id: "CLS", header: "CLS", accessor: "CLS", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: cwvClr(value, "cls") }}>{value.toFixed(3)}</Strong> },
            { id: "INP", header: "INP", accessor: "INP", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: cwvClr(value, "inp") }}>{fmt(value)}</Strong> },
            { id: "TTFB", header: "TTFB", accessor: "TTFB", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: cwvClr(value, "ttfb") }}>{fmt(value)}</Strong> },
            { id: "Load End", header: "Load End", accessor: "Load End", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value <= 3000 ? GREEN : value <= 5000 ? YELLOW : RED }}>{fmt(value)}</Strong> },
          ]}
        />
      </div>

      {/* Forecast summary */}
      <SectionHeader title="Forecast Summary" />
      <div className="uj-table-tile">
        <DataTable
          data={budgets.map((b) => ({
            Metric: b.metric,
            Current: b.format(b.current),
            "Budget Threshold": `${b.direction === "above" ? "≥" : "≤"} ${b.format(b.threshold)}`,
            "Projected +7d": b.format(b.projected7d),
            "Daily Rate": b.isStable ? "Stable" : `${b.improving ? "+" : ""}${b.metric === "Avg Duration" ? fmt(b.dailyRate) : b.dailyRate.toFixed(3)}/day`,
            Trend: b.trend === "stable" ? "Stable" : b.trend === "improving" ? "Improving" : "Degrading",
            "Days to Breach": b.daysToBreach != null ? `~${b.daysToBreach}d` : b.severity === "breached" ? "NOW" : "Safe",
            Status: severityLabel(b.severity),
          }))}
          columns={[
            { id: "Metric", header: "Metric", accessor: "Metric", cell: ({ value }: any) => <Strong style={{ color: BLUE }}>{value}</Strong> },
            { id: "Current", header: "Current", accessor: "Current" },
            { id: "Budget Threshold", header: "Budget", accessor: "Budget Threshold" },
            { id: "Projected +7d", header: "Proj +7d", accessor: "Projected +7d" },
            { id: "Daily Rate", header: "Daily Δ", accessor: "Daily Rate" },
            { id: "Trend", header: "Trend", accessor: "Trend", cell: ({ value }: any) => <Strong style={{ color: value === "Improving" ? GREEN : value === "Stable" ? BLUE : RED }}>{value === "Improving" ? "▲" : value === "Stable" ? "●" : "▼"} {value}</Strong> },
            { id: "Days to Breach", header: "Breach In", accessor: "Days to Breach", cell: ({ value }: any) => <Strong style={{ color: value === "Safe" ? GREEN : value === "NOW" ? RED : ORANGE }}>{value}</Strong> },
            { id: "Status", header: "Status", accessor: "Status", cell: ({ value }: any) => {
              const c = value === "HEALTHY" ? GREEN : value === "AT RISK" ? ORANGE : RED;
              return <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: `${c}18`, color: c, fontWeight: 700 }}>{value}</span>;
            } },
          ]}
        />
      </div>

      {/* Recommendations */}
      <SectionHeader title="Recommendations" />
      <Flex gap={12} flexWrap="wrap">
        {budgets.filter(b => b.severity === "critical").map((b) => (
          <div key={b.metric} className="uj-table-tile" style={{ padding: 16, flex: 1, minWidth: 280, borderLeft: `3px solid ${RED}` }}>
            <Strong style={{ color: RED }}>Urgent: {b.metric}</Strong>
            <Paragraph style={{ fontSize: 12, marginTop: 6 }}>
              Projected to breach {b.direction === "above" ? "minimum" : "maximum"} budget ({b.format(b.threshold)}) in ~{b.daysToBreach} day{(b.daysToBreach ?? 0) !== 1 ? "s" : ""}.
              Current: {b.format(b.current)} → Projected: {b.format(b.projected7d)}.
              Take immediate corrective action.
            </Paragraph>
          </div>
        ))}
        {budgets.filter(b => b.severity === "warning").map((b) => (
          <div key={b.metric} className="uj-table-tile" style={{ padding: 16, flex: 1, minWidth: 280, borderLeft: `3px solid ${ORANGE}` }}>
            <Strong style={{ color: ORANGE }}>Watch: {b.metric}</Strong>
            <Paragraph style={{ fontSize: 12, marginTop: 6 }}>
              Trending toward budget breach in ~{b.daysToBreach} days. Monitor daily and prepare mitigation.
            </Paragraph>
          </div>
        ))}
        {budgets.filter(b => b.severity === "breached").map((b) => (
          <div key={b.metric} className="uj-table-tile" style={{ padding: 16, flex: 1, minWidth: 280, borderLeft: `3px solid ${RED}` }}>
            <Strong style={{ color: RED }}>Breached: {b.metric}</Strong>
            <Paragraph style={{ fontSize: 12, marginTop: 6 }}>
              Currently {b.direction === "above" ? "below" : "above"} budget threshold ({b.format(b.threshold)}). Current value: {b.format(b.current)}.
              {b.improving ? " Trend is improving — continue monitoring." : " Trend is degrading — escalate immediately."}
            </Paragraph>
          </div>
        ))}
        {budgets.every(b => b.severity === "healthy") && (
          <div className="uj-table-tile" style={{ padding: 16, flex: 1, minWidth: 280, borderLeft: `3px solid ${GREEN}` }}>
            <Strong style={{ color: GREEN }}>All Metrics Healthy</Strong>
            <Paragraph style={{ fontSize: 12, marginTop: 6 }}>
              All metrics are within budget and projected to remain healthy over the next {FORECAST_DAYS} days. Continue regular monitoring.
            </Paragraph>
          </div>
        )}
      </Flex>

      <div className="uj-table-tile" style={{ padding: 16 }}>
        <Text style={{ fontSize: 11, opacity: 0.4 }}>
          Forecasts use linear regression on {n} data points from the selected timeframe. Accuracy improves with more data points. Projections assume current trends continue — external factors (deploys, traffic spikes) may alter trajectory.
        </Text>
      </div>
    </Flex>
  );
}

// ===========================================================================
// TAB: Resource Waterfall
// ===========================================================================
function ResourceWaterfallTab({ waterfallData, byStepData, isLoading, steps }: { waterfallData: any; byStepData: any; isLoading: boolean; steps: StepDef[] }) {
  const [selectedStep, setSelectedStep] = useState<string>("all");
  if (isLoading) return <Loading />;

  const allResources = (waterfallData.data?.records ?? []) as any[];
  const byStepRecords = (byStepData.data?.records ?? []) as any[];

  // Parse resources
  const resources = allResources.map((r: any) => ({
    step: String(r.step_tag ?? ""),
    type: String(r.res_type ?? "other"),
    name: String(r.res_name ?? "unknown"),
    count: Number(r.count ?? 0),
    avgDur: Number(r.avg_dur ?? 0),
    p50Dur: Number(r.p50_dur ?? 0),
    p90Dur: Number(r.p90_dur ?? 0),
    p99Dur: Number(r.p99_dur ?? 0),
    maxDur: Number(r.max_dur ?? 0),
    totalDur: Number(r.total_dur ?? 0),
  }));

  const filteredResources = selectedStep === "all" ? resources : resources.filter(r => r.step === selectedStep);
  const sortedResources = [...filteredResources].sort((a, b) => b.totalDur - a.totalDur);

  // Per-step resource summary
  const stepSummary = new Map<string, { types: Map<string, { count: number; avgDur: number; p90Dur: number; totalDur: number; slowCount: number }> }>();
  for (const r of byStepRecords) {
    const step = String(r.step_tag ?? "");
    const type = String(r.res_type ?? "other");
    if (!stepSummary.has(step)) stepSummary.set(step, { types: new Map() });
    stepSummary.get(step)!.types.set(type, {
      count: Number(r.resources ?? 0),
      avgDur: Number(r.avg_dur ?? 0),
      p90Dur: Number(r.p90_dur ?? 0),
      totalDur: Number(r.total_dur ?? 0),
      slowCount: Number(r.slow_count ?? 0),
    });
  }

  // Overall KPIs
  const totalResources = resources.reduce((s, r) => s + r.count, 0);
  const totalTime = resources.reduce((s, r) => s + r.totalDur, 0);
  const avgResourceDur = totalResources > 0 ? resources.reduce((s, r) => s + r.avgDur * r.count, 0) / totalResources : 0;
  const slowResources = resources.filter(r => r.p90Dur > 1000);
  const uniqueTypes = new Set(resources.map(r => r.type));

  // Type color mapping
  const TYPE_COLORS: Record<string, string> = { xhr: BLUE, fetch: BLUE, script: PURPLE, css: CYAN, image: GREEN, font: ORANGE, other: YELLOW };
  const typeClr = (t: string) => TYPE_COLORS[t.toLowerCase()] ?? YELLOW;

  // Waterfall chart
  const maxP90 = Math.max(...sortedResources.slice(0, 20).map(r => r.p90Dur), 1);
  const barW = 160;

  // Resource type breakdown per step
  const stepCards = steps.map((step) => {
    const data = stepSummary.get(step.label);
    if (!data) return { step: step.label, types: [], totalResources: 0, totalTime: 0, slowCount: 0 };
    const types = Array.from(data.types.entries()).map(([t, v]) => ({ type: t, ...v })).sort((a, b) => b.totalDur - a.totalDur);
    return {
      step: step.label,
      types,
      totalResources: types.reduce((s, t) => s + t.count, 0),
      totalTime: types.reduce((s, t) => s + t.totalDur, 0),
      slowCount: types.reduce((s, t) => s + t.slowCount, 0),
    };
  });

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      <SectionHeader title="Resource Waterfall" />
      <Text style={{ fontSize: 12, opacity: 0.5 }}>Aggregated resource timing per funnel step. Identifies third-party scripts, XHR calls, images, and other resources dragging down page performance.</Text>

      {/* KPIs */}
      <Flex gap={16} flexWrap="wrap">
        <div className="uj-kpi-card" style={{ minWidth: 140 }}>
          <Text className="uj-kpi-label">Total Resources</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: BLUE }}>{fmtCount(totalResources)}</Heading>
        </div>
        <div className="uj-kpi-card" style={{ minWidth: 140 }}>
          <Text className="uj-kpi-label">Total Load Time</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: PURPLE }}>{fmt(totalTime)}</Heading>
        </div>
        <div className="uj-kpi-card" style={{ minWidth: 140 }}>
          <Text className="uj-kpi-label">Avg Resource</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: avgResourceDur > 500 ? ORANGE : GREEN }}>{fmt(avgResourceDur)}</Heading>
        </div>
        <div className="uj-kpi-card" style={{ minWidth: 140 }}>
          <Text className="uj-kpi-label">Slow (P90 &gt;1s)</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: slowResources.length > 5 ? RED : slowResources.length > 0 ? ORANGE : GREEN }}>{slowResources.length}</Heading>
        </div>
        <div className="uj-kpi-card" style={{ minWidth: 140 }}>
          <Text className="uj-kpi-label">Resource Types</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: CYAN }}>{uniqueTypes.size}</Heading>
        </div>
      </Flex>

      {/* Step filter */}
      <Flex gap={8} alignItems="center" flexWrap="wrap">
        <Strong style={{ fontSize: 12 }}>Filter by Step:</Strong>
        <button onClick={() => setSelectedStep("all")} style={{ padding: "4px 12px", borderRadius: 4, border: `1px solid ${selectedStep === "all" ? BLUE : "rgba(255,255,255,0.15)"}`, background: selectedStep === "all" ? `${BLUE}20` : "transparent", color: selectedStep === "all" ? BLUE : "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>All Steps</button>
        {steps.map((step) => (
          <button key={step.label} onClick={() => setSelectedStep(step.label)} style={{ padding: "4px 12px", borderRadius: 4, border: `1px solid ${selectedStep === step.label ? BLUE : "rgba(255,255,255,0.15)"}`, background: selectedStep === step.label ? `${BLUE}20` : "transparent", color: selectedStep === step.label ? BLUE : "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>{step.label}</button>
        ))}
      </Flex>

      {/* Per-step resource breakdown cards */}
      <SectionHeader title="Resource Breakdown by Step" />
      <Flex gap={12} flexWrap="wrap">
        {stepCards.map((sc) => (
          <div key={sc.step} className="uj-anomaly-card" style={{ borderLeftColor: BLUE, minWidth: 280, flex: 1 }}>
            <Flex alignItems="center" justifyContent="space-between" style={{ marginBottom: 8 }}>
              <Strong style={{ fontSize: 13 }}>{sc.step}</Strong>
              <Text style={{ fontSize: 10, opacity: 0.5 }}>{fmtCount(sc.totalResources)} resources</Text>
            </Flex>
            {sc.types.length === 0 ? (
              <Text style={{ fontSize: 11, opacity: 0.4 }}>No resource data</Text>
            ) : (
              <Flex flexDirection="column" gap={4}>
                {sc.types.slice(0, 6).map((t) => (
                  <Flex key={t.type} alignItems="center" gap={8}>
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: `${typeClr(t.type)}20`, color: typeClr(t.type), fontWeight: 600, minWidth: 50, textAlign: "center" }}>{t.type}</span>
                    <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                      <div style={{ height: "100%", width: `${Math.min((t.totalDur / Math.max(sc.totalTime, 1)) * 100, 100)}%`, background: typeClr(t.type), borderRadius: 3, opacity: 0.7 }} />
                    </div>
                    <Text style={{ fontSize: 10, minWidth: 50, textAlign: "right" }}>{fmt(t.avgDur)}</Text>
                    <Text style={{ fontSize: 9, opacity: 0.4, minWidth: 30 }}>{fmtCount(t.count)}</Text>
                  </Flex>
                ))}
              </Flex>
            )}
            {sc.slowCount > 0 && (
              <Text style={{ fontSize: 10, color: ORANGE, marginTop: 6 }}>{sc.slowCount} slow resource{sc.slowCount !== 1 ? "s" : ""} (&gt;1s)</Text>
            )}
          </div>
        ))}
      </Flex>

      {/* Visual waterfall chart */}
      <SectionHeader title="Top Resources by Total Time" />
      <Text style={{ fontSize: 11, opacity: 0.5, marginBottom: 4 }}>Bar = P50 (solid) → P90 (striped). Color = resource type. Ranked by cumulative load time impact.</Text>
      <div className="uj-table-tile" style={{ padding: 16, overflowX: "auto" }}>
        <svg width="100%" viewBox={`0 0 720 ${Math.min(sortedResources.length, 20) * 28 + 30}`}>
          {/* Header */}
          <text x={4} y={14} fill="rgba(255,255,255,0.4)" fontSize={9} fontWeight={600}>Resource</text>
          <text x={412} y={14} fill="rgba(255,255,255,0.4)" fontSize={9} fontWeight={600}>Type</text>
          <text x={450} y={14} fill="rgba(255,255,255,0.4)" fontSize={9} fontWeight={600}>Timing</text>
          <text x={620} y={14} fill="rgba(255,255,255,0.4)" fontSize={9} fontWeight={600}>Count</text>
          <text x={670} y={14} fill="rgba(255,255,255,0.4)" fontSize={9} fontWeight={600}>P90</text>
          <line x1={0} y1={20} x2={720} y2={20} stroke="rgba(255,255,255,0.06)" />
          {sortedResources.slice(0, 20).map((r, i) => {
            const y = 28 + i * 28;
            const color = typeClr(r.type);
            const p50W = (r.p50Dur / maxP90) * barW;
            const p90W = (r.p90Dur / maxP90) * barW;
            const shortName = r.name.length > 50 ? "..." + r.name.slice(-47) : r.name;
            return (
              <g key={i}>
                <text x={4} y={y + 4} fill="rgba(255,255,255,0.7)" fontSize={9}>{shortName.substring(0, 52)}</text>
                <title>{`${r.name}\nType: ${r.type} | Step: ${r.step}\nAvg: ${fmt(r.avgDur)} | P50: ${fmt(r.p50Dur)} | P90: ${fmt(r.p90Dur)} | P99: ${fmt(r.p99Dur)}\nCount: ${r.count} | Total: ${fmt(r.totalDur)}`}</title>
                {/* P90 bar (background) */}
                <rect x={450} y={y - 8} width={Math.max(p90W, 2)} height={12} rx={2} fill={color} opacity={0.2} />
                {/* P50 bar (foreground) */}
                <rect x={450} y={y - 8} width={Math.max(p50W, 2)} height={12} rx={2} fill={color} opacity={0.6} />
                {/* Type badge */}
                <text x={412} y={y + 3} fill={color} fontSize={8} fontWeight={600}>{r.type}</text>
                <text x={620} y={y + 4} fill="rgba(255,255,255,0.5)" fontSize={9}>{fmtCount(r.count)}</text>
                <text x={670} y={y + 4} fill={r.p90Dur > 1000 ? RED : r.p90Dur > 500 ? ORANGE : GREEN} fontSize={9} fontWeight={600}>{fmt(r.p90Dur)}</text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Full resource table */}
      <SectionHeader title="All Resources" />
      <div className="uj-table-tile">
        <DataTable
          sortable
          data={sortedResources.map((r) => ({
            Step: r.step,
            Type: r.type,
            Resource: r.name.length > 60 ? "..." + r.name.slice(-57) : r.name,
            Count: r.count,
            "Avg (ms)": r.avgDur,
            "P50 (ms)": r.p50Dur,
            "P90 (ms)": r.p90Dur,
            "Total (ms)": r.totalDur,
          }))}
          columns={[
            { id: "Step", header: "Step", accessor: "Step", cell: ({ value }: any) => <Text style={{ fontSize: 11 }}>{value}</Text> },
            { id: "Type", header: "Type", accessor: "Type", cell: ({ value }: any) => <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: `${typeClr(value)}20`, color: typeClr(value), fontWeight: 600 }}>{value}</span> },
            { id: "Resource", header: "Resource", accessor: "Resource", cell: ({ value }: any) => <Text style={{ fontSize: 10, wordBreak: "break-all" as const }}>{value}</Text> },
            { id: "Count", header: "Count", accessor: "Count", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
            { id: "Avg (ms)", header: "Avg", accessor: "Avg (ms)", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmt(value)}</Text> },
            { id: "P50 (ms)", header: "P50", accessor: "P50 (ms)", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmt(value)}</Text> },
            { id: "P90 (ms)", header: "P90", accessor: "P90 (ms)", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 1000 ? RED : value > 500 ? ORANGE : GREEN }}>{fmt(value)}</Strong> },
            { id: "Total (ms)", header: "Total", accessor: "Total (ms)", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: PURPLE }}>{fmt(value)}</Strong> },
          ]}
        />
      </div>

      {/* Recommendations */}
      <SectionHeader title="Optimization Opportunities" />
      <Flex gap={12} flexWrap="wrap">
        {slowResources.length > 3 && (
          <div className="uj-table-tile" style={{ padding: 16, flex: 1, minWidth: 280, borderLeft: `3px solid ${RED}` }}>
            <Strong style={{ color: RED }}>Critical: {slowResources.length} Slow Resources</Strong>
            <Paragraph style={{ fontSize: 12, marginTop: 6 }}>
              {slowResources.length} resources have P90 latency &gt;1s. Top offender: "{sortedResources[0]?.name.split("/").pop()}" ({fmt(sortedResources[0]?.p90Dur)} P90). Consider lazy loading, CDN caching, or removing unused resources.
            </Paragraph>
          </div>
        )}
        {sortedResources.filter(r => r.type === "script" || r.type === "xhr" || r.type === "fetch").length > 0 && (
          <div className="uj-table-tile" style={{ padding: 16, flex: 1, minWidth: 280, borderLeft: `3px solid ${ORANGE}` }}>
            <Strong style={{ color: ORANGE }}>Watch: Script/XHR Resources</Strong>
            <Paragraph style={{ fontSize: 12, marginTop: 6 }}>
              {sortedResources.filter(r => r.type === "script" || r.type === "xhr" || r.type === "fetch").length} script/XHR resources detected. Third-party scripts can block rendering and increase LCP. Audit for defer/async loading opportunities.
            </Paragraph>
          </div>
        )}
        {slowResources.length === 0 && (
          <div className="uj-table-tile" style={{ padding: 16, flex: 1, minWidth: 280, borderLeft: `3px solid ${GREEN}` }}>
            <Strong style={{ color: GREEN }}>Healthy: All Resources Fast</Strong>
            <Paragraph style={{ fontSize: 12, marginTop: 6 }}>No resources have P90 latency above 1 second. Resource performance is healthy across all funnel steps.</Paragraph>
          </div>
        )}
      </Flex>
    </Flex>
  );
}

// ===========================================================================
// TAB: Change Intelligence
// ===========================================================================
function ChangeIntelligenceTab({ deployData, impactData, quality, qualityPrev, overallApdex, overallApdexPrev, isLoading }: { deployData: any; impactData: any; quality: any; qualityPrev: any; overallApdex: number; overallApdexPrev: number; isLoading: boolean }) {
  if (isLoading) return <Loading />;

  const deployRecords = (deployData.data?.records ?? []) as any[];
  const impactRecords = (impactData.data?.records ?? []) as any[];

  // Parse deployments (already aggregated by hour in DQL)
  const deployments = deployRecords.map((r: any) => ({
    timestamp: new Date(r.first_time).getTime(),
    tsStr: new Date(r.first_time).toLocaleString(),
    hourKey: String(r.hour_key ?? ""),
    name: String(r.deploy_name ?? "Deployment"),
    source: String(r.deploy_source ?? "unknown"),
    version: String(r.deploy_version ?? ""),
    stage: String(r.deploy_stage ?? ""),
    component: String(r.deploy_component ?? ""),
    service: String(r.deploy_service ?? ""),
    description: String(r.deploy_desc ?? ""),
    project: String(r.deploy_project ?? ""),
    repo: String(r.deploy_repo ?? ""),
    count: Number(r.deploy_count ?? 1),
  })).filter(d => d.hourKey).sort((a, b) => b.timestamp - a.timestamp);

  // Parse hourly impact data
  const hourlyImpact = impactRecords.map((r: any) => {
    const total = Number(r.actions ?? 0);
    const sat = Number(r.satisfied ?? 0);
    const tol = Number(r.tolerating ?? 0);
    return {
      hourTs: String(r.hour_ts ?? ""),
      sessions: Number(r.sessions ?? 0),
      actions: total,
      avgDur: Number(r.avg_dur ?? 0),
      p90Dur: Number(r.p90_dur ?? 0),
      errors: Number(r.errors ?? 0),
      errorRate: total > 0 ? (Number(r.errors ?? 0) / total) * 100 : 0,
      apdex: calcApdex(sat, tol, total),
      frustrated: Number(r.frustrated ?? 0),
      fruPct: total > 0 ? (Number(r.frustrated ?? 0) / total) * 100 : 0,
    };
  });

  // For each deployment, compute before/after metrics (2-hour windows)
  const deployAnalysis = deployments.map((dep) => {
    const depHour = dep.hourKey;
    const depIdx = hourlyImpact.findIndex(h => h.hourTs === depHour);

    // Gather 2 hours before and 2 hours after
    const beforeSlice = depIdx >= 2 ? hourlyImpact.slice(depIdx - 2, depIdx) : hourlyImpact.slice(0, depIdx);
    const afterSlice = depIdx >= 0 && depIdx + 3 <= hourlyImpact.length ? hourlyImpact.slice(depIdx + 1, depIdx + 3) : hourlyImpact.slice(depIdx + 1);

    const avg = (arr: any[], field: string) => arr.length > 0 ? arr.reduce((s, h) => s + h[field], 0) / arr.length : 0;

    const before = {
      apdex: avg(beforeSlice, "apdex"),
      avgDur: avg(beforeSlice, "avgDur"),
      p90Dur: avg(beforeSlice, "p90Dur"),
      errorRate: avg(beforeSlice, "errorRate"),
      fruPct: avg(beforeSlice, "fruPct"),
      sessions: beforeSlice.reduce((s, h) => s + h.sessions, 0),
    };
    const after = {
      apdex: avg(afterSlice, "apdex"),
      avgDur: avg(afterSlice, "avgDur"),
      p90Dur: avg(afterSlice, "p90Dur"),
      errorRate: avg(afterSlice, "errorRate"),
      fruPct: avg(afterSlice, "fruPct"),
      sessions: afterSlice.reduce((s, h) => s + h.sessions, 0),
    };

    const apdexDelta = after.apdex - before.apdex;
    const durDelta = before.avgDur > 0 ? ((after.avgDur - before.avgDur) / before.avgDur) * 100 : 0;
    const errorDelta = after.errorRate - before.errorRate;
    const fruDelta = after.fruPct - before.fruPct;

    const hasData = beforeSlice.length > 0;
    const severity = !hasData ? "neutral" : (apdexDelta < -0.1 || durDelta > 25 || errorDelta > 3) ? "regression" : (apdexDelta > 0.05 && durDelta < -5) ? "improvement" : "neutral";

    return { ...dep, before, after, apdexDelta, durDelta, errorDelta, fruDelta, severity, hasData };
  });

  // KPIs
  const totalDeploys = deployments.length;
  const regressions = deployAnalysis.filter(d => d.severity === "regression");
  const improvements = deployAnalysis.filter(d => d.severity === "improvement");

  const severityColor = (s: string) => s === "regression" ? RED : s === "improvement" ? GREEN : BLUE;
  const severityLabel = (s: string) => s === "regression" ? "REGR" : s === "improvement" ? "IMPR" : "NEUT";

  // SVG timeline
  const chartW = 720;
  const chartH = 200;
  const padL = 40;
  const padR = 20;
  const padT = 20;
  const padB = 30;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  const maxApdex = Math.max(...hourlyImpact.map(h => h.apdex), 1);
  const maxDur = Math.max(...hourlyImpact.map(h => h.avgDur), 1);
  const totalHours = hourlyImpact.length;

  // Find which hourly indices correspond to deployments
  // Build map: hour index → deploy info for rich tooltips
  const deployHourMap = new Map<number, { names: string[]; count: number; tsStr: string }>();
  for (const d of deployments) {
    const idx = hourlyImpact.findIndex(h => h.hourTs === d.hourKey);
    if (idx < 0) continue;
    if (!deployHourMap.has(idx)) deployHourMap.set(idx, { names: [], count: 0, tsStr: d.tsStr });
    const entry = deployHourMap.get(idx)!;
    if (!entry.names.includes(d.name)) entry.names.push(d.name);
    entry.count += (d as any).count ?? 1;
  }
  const deployHourIdxSet = new Set(deployHourMap.keys());

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16, paddingRight: 8 }}>
      <SectionHeader title="Change Intelligence" />
      <Text style={{ fontSize: 12, opacity: 0.5 }}>Overlays deployment events on performance timeline. Compares before/after metrics in a 2-hour window around each deploy to detect regressions or improvements.</Text>

      {/* KPIs */}
      <Flex gap={16} flexWrap="wrap">
        <div className="uj-kpi-card" style={{ minWidth: 140 }}>
          <Text className="uj-kpi-label">Deployments</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: BLUE }}>{totalDeploys}</Heading>
        </div>
        <div className="uj-kpi-card" style={{ minWidth: 140 }}>
          <Text className="uj-kpi-label">Regressions</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: regressions.length > 0 ? RED : GREEN }}>{regressions.length}</Heading>
        </div>
        <div className="uj-kpi-card" style={{ minWidth: 140 }}>
          <Text className="uj-kpi-label">Improvements</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: improvements.length > 0 ? GREEN : BLUE }}>{improvements.length}</Heading>
        </div>
        <div className="uj-kpi-card" style={{ minWidth: 140 }}>
          <Text className="uj-kpi-label">Neutral</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: BLUE }}>{totalDeploys - regressions.length - improvements.length}</Heading>
        </div>
        <div className="uj-kpi-card" style={{ minWidth: 140 }}>
          <Text className="uj-kpi-label">Data Points</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: PURPLE }}>{totalHours}h</Heading>
        </div>
      </Flex>

      {/* Timeline chart */}
      <SectionHeader title="Performance Timeline with Deploy Markers" />
      <Text style={{ fontSize: 11, opacity: 0.5, marginBottom: 4 }}>Green = Apdex, blue dashed = avg duration (normalized). Red vertical lines = deployment events.</Text>
      <div className="uj-table-tile" style={{ padding: 16, overflowX: "auto" }}>
        {totalHours > 0 ? (
          <svg width="100%" viewBox={`0 0 ${chartW} ${chartH}`}>
            {/* Grid */}
            <line x1={padL} y1={padT} x2={padL + plotW} y2={padT} stroke="rgba(255,255,255,0.05)" />
            <line x1={padL} y1={padT + plotH / 2} x2={padL + plotW} y2={padT + plotH / 2} stroke="rgba(255,255,255,0.05)" />
            <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="rgba(255,255,255,0.08)" />

            {/* Deploy marker lines */}
            {Array.from(deployHourIdxSet).map((idx) => {
              const x = padL + (idx / Math.max(totalHours - 1, 1)) * plotW;
              const depInfo = deployHourMap.get(idx);
              const h = hourlyImpact[idx];
              const tip = depInfo ? `🚀 ${depInfo.names.join(", ")}\nTime: ${depInfo.tsStr}\nEvents: ${depInfo.count}${h ? `\nApdex: ${h.apdex.toFixed(2)} | Dur: ${fmt(h.avgDur)} | Err: ${h.errorRate.toFixed(1)}%` : ""}` : "";
              return (
                <g key={`dep-${idx}`}>
                  <line x1={x} y1={padT} x2={x} y2={padT + plotH} stroke={RED} strokeWidth={2} opacity={0.6} strokeDasharray="4 2" />
                  <polygon points={`${x - 5},${padT - 2} ${x + 5},${padT - 2} ${x},${padT + 6}`} fill={RED} opacity={0.8} />
                  <rect x={x - 8} y={padT - 4} width={16} height={plotH + 8} fill="transparent"><title>{tip}</title></rect>
                </g>
              );
            })}

            {/* Apdex line */}
            {hourlyImpact.length > 1 && (
              <polyline fill="none" stroke={GREEN} strokeWidth={2} points={hourlyImpact.map((h, i) => {
                const x = padL + (i / (totalHours - 1)) * plotW;
                const y = padT + plotH - (h.apdex / maxApdex) * plotH;
                return `${x},${y}`;
              }).join(" ")} />
            )}

            {/* Duration line (normalized) */}
            {hourlyImpact.length > 1 && (
              <polyline fill="none" stroke={BLUE} strokeWidth={1.5} strokeDasharray="4 3" points={hourlyImpact.map((h, i) => {
                const x = padL + (i / (totalHours - 1)) * plotW;
                const y = padT + plotH - (h.avgDur / maxDur) * plotH;
                return `${x},${y}`;
              }).join(" ")} />
            )}

            {/* Data points */}
            {hourlyImpact.map((h, i) => {
              const x = padL + (i / Math.max(totalHours - 1, 1)) * plotW;
              const yApdex = padT + plotH - (h.apdex / maxApdex) * plotH;
              const isDeploy = deployHourIdxSet.has(i);
              const depTip = isDeploy ? `\n🚀 ${deployHourMap.get(i)?.names.join(", ") ?? "Deploy"} (${deployHourMap.get(i)?.count ?? 1} events)` : "";
              return <circle key={`pt-${i}`} cx={x} cy={yApdex} r={isDeploy ? 4 : 2} fill={isDeploy ? RED : GREEN} opacity={0.8}><title>{`${h.hourTs}\nApdex: ${h.apdex.toFixed(2)} | Dur: ${fmt(h.avgDur)} | Err: ${h.errorRate.toFixed(1)}%${depTip}`}</title></circle>;
            })}

            {/* Y axis labels */}
            <text x={padL - 4} y={padT + 4} textAnchor="end" fill="rgba(255,255,255,0.4)" fontSize={9}>1.0</text>
            <text x={padL - 4} y={padT + plotH / 2} textAnchor="end" fill="rgba(255,255,255,0.4)" fontSize={9}>0.5</text>
            <text x={padL - 4} y={padT + plotH} textAnchor="end" fill="rgba(255,255,255,0.4)" fontSize={9}>0</text>

            {/* X axis - first/last timestamps */}
            {hourlyImpact.length > 0 && (
              <>
                <text x={padL} y={chartH - 4} textAnchor="start" fill="rgba(255,255,255,0.4)" fontSize={8}>{hourlyImpact[0].hourTs}</text>
                <text x={padL + plotW} y={chartH - 4} textAnchor="end" fill="rgba(255,255,255,0.4)" fontSize={8}>{hourlyImpact[hourlyImpact.length - 1].hourTs}</text>
              </>
            )}
          </svg>
        ) : (
          <Text style={{ textAlign: "center", padding: 24, opacity: 0.4 }}>No hourly data available for the selected timeframe.</Text>
        )}
      </div>

      {/* Deployment analysis cards */}
      <SectionHeader title="Deployment Impact Analysis" />
      {deployAnalysis.length === 0 ? (
        <div className="uj-table-tile" style={{ padding: 24, textAlign: "center" }}>
          <Text style={{ color: BLUE, fontSize: 14 }}>No deployment events detected in the current timeframe.</Text>
          <Text style={{ display: "block", fontSize: 11, opacity: 0.5, marginTop: 8 }}>Deployment events are detected from Dynatrace DAVIS events and custom deployment events. Ensure deployment instrumentation is configured.</Text>
        </div>
      ) : (
        <Flex gap={8} flexWrap="wrap" flexDirection="column">
          {deployAnalysis.slice(0, 10).map((d, i) => {
            // Mini sparkline: 5 hours around this deploy
            const depIdx = hourlyImpact.findIndex(h => h.hourTs === d.hourKey);
            const sparkSlice = depIdx >= 0 ? hourlyImpact.slice(Math.max(0, depIdx - 2), depIdx + 3) : [];
            const sparkDepPos = depIdx >= 0 ? Math.min(depIdx, 2) : -1;
            const sparkMaxApdex = Math.max(...sparkSlice.map(s => s.apdex), 0.01);
            const sparkMaxDur = Math.max(...sparkSlice.map(s => s.avgDur), 1);
            const metaItems: string[] = [];
            if (d.component) metaItems.push(d.component + (d.version ? ` v${d.version}` : ""));
            else if (d.version) metaItems.push(`v${d.version}`);
            if (d.stage) metaItems.push(d.stage);
            if (d.service) metaItems.push(d.service);
            if (d.project) metaItems.push(d.project);
            if (d.repo) metaItems.push(d.repo);
            return (
            <div key={i} className="uj-anomaly-card" style={{ borderLeftColor: severityColor(d.severity), width: "100%", padding: "16px 20px", overflow: "hidden", boxSizing: "border-box" as const }}>
              {/* Header: name + badge */}
              <Flex alignItems="center" justifyContent="space-between" gap={12} style={{ marginBottom: 6, flexWrap: "nowrap" }}>
                <Flex alignItems="center" gap={8} style={{ minWidth: 0, flex: 1 }}>
                  <Strong style={{ fontSize: 18 }}>{d.name}</Strong>
                  {d.count > 1 && <Text style={{ fontSize: 12, opacity: 0.4 }}>+{d.count - 1} more</Text>}
                </Flex>
                <span style={{ fontSize: 12, padding: "3px 12px", borderRadius: 4, background: `${severityColor(d.severity)}18`, color: severityColor(d.severity), fontWeight: 700, flexShrink: 0 }}>{severityLabel(d.severity)}</span>
              </Flex>
              {/* Timestamp + source */}
              <Text style={{ fontSize: 13, opacity: 0.5, display: "block", marginBottom: 4 }}>{d.tsStr}{d.source !== "unknown" ? ` · ${d.source}` : ""}</Text>
              {/* Metadata tags */}
              {metaItems.length > 0 && (
                <Flex gap={6} flexWrap="wrap" style={{ marginBottom: 8 }}>
                  {metaItems.map((m, mi) => (
                    <span key={mi} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}>{m}</span>
                  ))}
                </Flex>
              )}
              {/* Description */}
              {d.description && <Text style={{ fontSize: 12, opacity: 0.5, display: "block", marginBottom: 8, lineHeight: "1.4" }}>{d.description.length > 200 ? d.description.substring(0, 200) + " " : d.description}</Text>}
              {d.hasData ? (
                <Flex flexDirection="column" gap={12}>
                  {/* Metrics row */}
                  <Flex gap={32} flexWrap="wrap">
                    <div>
                      <Text style={{ fontSize: 13, opacity: 0.5 }}>Apdex</Text>
                      <Flex gap={6} alignItems="baseline">
                        <Text style={{ fontSize: 16, opacity: 0.6 }}>{d.before.apdex.toFixed(2)}</Text>
                        <Text style={{ fontSize: 14, opacity: 0.4 }}>→</Text>
                        <Strong style={{ fontSize: 22, color: d.apdexDelta >= 0 ? GREEN : RED }}>{d.after.apdex.toFixed(2)}</Strong>
                        <Text style={{ fontSize: 13, color: d.apdexDelta >= 0 ? GREEN : RED }}>{d.apdexDelta >= 0 ? "▲" : "▼"}{Math.abs(d.apdexDelta).toFixed(2)}</Text>
                      </Flex>
                    </div>
                    <div>
                      <Text style={{ fontSize: 13, opacity: 0.5 }}>Avg Duration</Text>
                      <Flex gap={6} alignItems="baseline">
                        <Text style={{ fontSize: 16, opacity: 0.6 }}>{fmt(d.before.avgDur)}</Text>
                        <Text style={{ fontSize: 14, opacity: 0.4 }}>→</Text>
                        <Strong style={{ fontSize: 22, color: d.durDelta <= 0 ? GREEN : RED }}>{fmt(d.after.avgDur)}</Strong>
                        <Text style={{ fontSize: 13, color: d.durDelta <= 0 ? GREEN : RED }}>{d.durDelta > 0 ? "▲" : "▼"}{Math.abs(d.durDelta).toFixed(1)}%</Text>
                      </Flex>
                    </div>
                    <div>
                      <Text style={{ fontSize: 13, opacity: 0.5 }}>Error Rate</Text>
                      <Flex gap={6} alignItems="baseline">
                        <Text style={{ fontSize: 16, opacity: 0.6 }}>{fmtPct(d.before.errorRate)}</Text>
                        <Text style={{ fontSize: 14, opacity: 0.4 }}>→</Text>
                        <Strong style={{ fontSize: 22, color: d.errorDelta <= 0 ? GREEN : RED }}>{fmtPct(d.after.errorRate)}</Strong>
                        <Text style={{ fontSize: 13, color: d.errorDelta <= 0 ? GREEN : RED }}>{d.errorDelta > 0 ? "▲" : "▼"}{Math.abs(d.errorDelta).toFixed(1)}pp</Text>
                      </Flex>
                    </div>
                    <div>
                      <Text style={{ fontSize: 13, opacity: 0.5 }}>Frustrated %</Text>
                      <Flex gap={6} alignItems="baseline">
                        <Text style={{ fontSize: 16, opacity: 0.6 }}>{fmtPct(d.before.fruPct)}</Text>
                        <Text style={{ fontSize: 14, opacity: 0.4 }}>→</Text>
                        <Strong style={{ fontSize: 22, color: d.fruDelta <= 0 ? GREEN : RED }}>{fmtPct(d.after.fruPct)}</Strong>
                      </Flex>
                    </div>
                  </Flex>
                  {/* Sparkline — taller, full width */}
                  {sparkSlice.length > 1 && (
                    <div>
                      <Text style={{ fontSize: 11, opacity: 0.4, marginBottom: 2, display: "block" }}>Apdex (green) &amp; Duration (blue) ±2h around deploy</Text>
                      <svg width="100%" viewBox="0 0 400 80" style={{ maxHeight: 80 }}>
                        {/* Apdex area fill */}
                        <polygon
                          fill={`${GREEN}15`}
                          points={`5,74 ${sparkSlice.map((s, si) => `${(si / (sparkSlice.length - 1)) * 390 + 5},${68 - (s.apdex / sparkMaxApdex) * 58}`).join(" ")} 395,74`}
                        />
                        {/* Apdex line */}
                        <polyline fill="none" stroke={GREEN} strokeWidth={2.5} points={sparkSlice.map((s, si) => `${(si / (sparkSlice.length - 1)) * 390 + 5},${68 - (s.apdex / sparkMaxApdex) * 58}`).join(" ")} />
                        {/* Duration line */}
                        <polyline fill="none" stroke={BLUE} strokeWidth={2} strokeDasharray="4 3" points={sparkSlice.map((s, si) => `${(si / (sparkSlice.length - 1)) * 390 + 5},${68 - (s.avgDur / sparkMaxDur) * 58}`).join(" ")} />
                        {/* Deploy marker */}
                        {sparkDepPos >= 0 && (
                          <line x1={(sparkDepPos / (sparkSlice.length - 1)) * 390 + 5} y1={0} x2={(sparkDepPos / (sparkSlice.length - 1)) * 390 + 5} y2={80} stroke={RED} strokeWidth={2} opacity={0.5} strokeDasharray="3 2" />
                        )}
                        {/* Apdex dots */}
                        {sparkSlice.map((s, si) => (
                          <circle key={si} cx={(si / (sparkSlice.length - 1)) * 390 + 5} cy={68 - (s.apdex / sparkMaxApdex) * 58} r={si === sparkDepPos ? 6 : 3.5} fill={si === sparkDepPos ? RED : GREEN} />
                        ))}
                        {/* Hour labels */}
                        <text x={5} y={12} fill="rgba(255,255,255,0.3)" fontSize={9}>{sparkSlice[0]?.hourTs?.substring(11) ?? ""}</text>
                        <text x={395} y={12} textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize={9}>{sparkSlice[sparkSlice.length - 1]?.hourTs?.substring(11) ?? ""}</text>
                      </svg>
                    </div>
                  )}
                </Flex>
              ) : (
                <Text style={{ fontSize: 14, opacity: 0.4 }}>Insufficient before/after data. Extend timeframe for better analysis.</Text>
              )}
            </div>
            );
          })}
        </Flex>
      )}

      {/* Deployment events table */}
      <SectionHeader title="All Deployment Events" />
      <div className="uj-table-tile">
        <DataTable
          sortable
          data={deployments.map((d) => ({
            Timestamp: d.tsStr,
            Hour: d.hourKey,
            Name: d.name,
            Count: d.count ?? 1,
            Source: d.source,
            Version: d.version || "—",
            Stage: d.stage || "—",
            Component: d.component || "—",
            Service: d.service || "—",
          }))}
          columns={[
            { id: "Timestamp", header: "Time", accessor: "Timestamp", cell: ({ value }: any) => <Text style={{ fontSize: 11 }}>{value}</Text> },
            { id: "Hour", header: "Hour", accessor: "Hour", cell: ({ value }: any) => <Text style={{ fontSize: 11, opacity: 0.6 }}>{value}</Text> },
            { id: "Name", header: "Deployment", accessor: "Name", cell: ({ value }: any) => <Strong style={{ color: BLUE }}>{value}</Strong> },
            { id: "Count", header: "Events", accessor: "Count", sortType: "number" as any, cell: ({ value }: any) => <Text>{value}</Text> },
            { id: "Source", header: "Source", accessor: "Source", cell: ({ value }: any) => <Text style={{ fontSize: 11, opacity: 0.6 }}>{value}</Text> },
            { id: "Version", header: "Version", accessor: "Version", cell: ({ value }: any) => <Text style={{ fontSize: 11, opacity: 0.6 }}>{value}</Text> },
            { id: "Stage", header: "Stage", accessor: "Stage", cell: ({ value }: any) => <Text style={{ fontSize: 11, opacity: 0.6 }}>{value}</Text> },
            { id: "Component", header: "Component", accessor: "Component", cell: ({ value }: any) => <Text style={{ fontSize: 11, opacity: 0.6 }}>{value}</Text> },
            { id: "Service", header: "Service", accessor: "Service", cell: ({ value }: any) => <Text style={{ fontSize: 11, opacity: 0.6 }}>{value}</Text> },
          ]}
        />
      </div>

      {/* Summary */}
      <SectionHeader title="Summary" />
      <Flex gap={12} flexWrap="wrap">
        {regressions.length > 0 && (
          <div className="uj-table-tile" style={{ padding: 16, flex: 1, minWidth: 280, borderLeft: `3px solid ${RED}` }}>
            <Strong style={{ color: RED }}>Regressions Detected: {regressions.length}</Strong>
            <Paragraph style={{ fontSize: 12, marginTop: 6 }}>
              {regressions.length} deployment{regressions.length !== 1 ? "s" : ""} caused measurable performance degradation.
              Worst: "{regressions[0]?.name}" — Apdex dropped {Math.abs(regressions[0]?.apdexDelta ?? 0).toFixed(2)}, duration increased {Math.abs(regressions[0]?.durDelta ?? 0).toFixed(0)}%.
              Consider rollback or hotfix.
            </Paragraph>
          </div>
        )}
        {improvements.length > 0 && (
          <div className="uj-table-tile" style={{ padding: 16, flex: 1, minWidth: 280, borderLeft: `3px solid ${GREEN}` }}>
            <Strong style={{ color: GREEN }}>Improvements: {improvements.length}</Strong>
            <Paragraph style={{ fontSize: 12, marginTop: 6 }}>
              {improvements.length} deployment{improvements.length !== 1 ? "s" : ""} improved performance. Keep tracking to confirm sustained improvement.
            </Paragraph>
          </div>
        )}
        {deployments.length === 0 && (
          <div className="uj-table-tile" style={{ padding: 16, flex: 1, minWidth: 280, borderLeft: `3px solid ${BLUE}` }}>
            <Strong style={{ color: BLUE }}>No Deployments Detected</Strong>
            <Paragraph style={{ fontSize: 12, marginTop: 6 }}>
              No deployment events found. Ensure Dynatrace deployment markers are configured via OneAgent, API, or CI/CD integration. Try extending the timeframe to capture recent deploys.
            </Paragraph>
          </div>
        )}
        {deployments.length > 0 && regressions.length === 0 && improvements.length === 0 && (
          <div className="uj-table-tile" style={{ padding: 16, flex: 1, minWidth: 280, borderLeft: `3px solid ${BLUE}` }}>
            <Strong style={{ color: BLUE }}>All Deploys Neutral</Strong>
            <Paragraph style={{ fontSize: 12, marginTop: 6 }}>
              {deployments.length} deployment{deployments.length !== 1 ? "s were" : " was"} detected with no significant performance impact. Stable releases.
            </Paragraph>
          </div>
        )}
      </Flex>
    </Flex>
  );
}

// ===========================================================================
// SLO TRACKER TAB
// ===========================================================================
function SLOTrackerTab({ apdexTrend, cwvTrend, quality, overallApdex, overallConv, cwv, isLoading }: { apdexTrend: any; cwvTrend: any; quality: any; overallApdex: number; overallConv: number; cwv: any; isLoading: boolean }) {
  if (isLoading) return <Loading />;

  const apdexRecords = (apdexTrend.data?.records ?? []) as any[];
  const cwvRecords = (cwvTrend.data?.records ?? []) as any[];

  // SLO definitions
  const slos = [
    { name: "Apdex", target: 0.85, direction: "above" as const, format: (v: number) => v.toFixed(2), color: apdexClr },
    { name: "Error Rate", target: 2.0, direction: "below" as const, format: fmtPct, color: (v: number) => v <= 2 ? GREEN : v <= 5 ? YELLOW : RED },
    { name: "LCP", target: CWV.lcp.good, direction: "below" as const, format: fmt, color: (v: number) => cwvClr(v, "lcp") },
    { name: "CLS", target: CWV.cls.good, direction: "below" as const, format: (v: number) => v.toFixed(3), color: (v: number) => cwvClr(v, "cls") },
    { name: "INP", target: CWV.inp.good, direction: "below" as const, format: fmt, color: (v: number) => cwvClr(v, "inp") },
    { name: "TTFB", target: CWV.ttfb.good, direction: "below" as const, format: fmt, color: (v: number) => cwvClr(v, "ttfb") },
  ];

  const apdexBuckets = apdexRecords.map((r: any) => {
    const total = Number(r.total ?? 0);
    const sat = Number(r.satisfied ?? 0);
    const tol = Number(r.tolerating ?? 0);
    const apdex = calcApdex(sat, tol, total);
    const errRate = total > 0 ? (Number(r.errors ?? 0) / total) * 100 : 0;
    return { hour: String(r.hour_key ?? ""), apdex, errRate, total };
  });

  const cwvBuckets = cwvRecords.map((r: any) => ({
    lcp: Number(r.lcp_val ?? 0), cls: Number(r.cls_val ?? 0),
    inp: Number(r.inp_val ?? 0), ttfb: Number(r.ttfb_val ?? 0),
  }));

  const sloResults = slos.map(slo => {
    let values: number[] = [];
    if (slo.name === "Apdex") values = apdexBuckets.map(b => b.apdex);
    else if (slo.name === "Error Rate") values = apdexBuckets.map(b => b.errRate);
    else if (slo.name === "LCP") values = cwvBuckets.map(b => b.lcp);
    else if (slo.name === "CLS") values = cwvBuckets.map(b => b.cls);
    else if (slo.name === "INP") values = cwvBuckets.map(b => b.inp);
    else if (slo.name === "TTFB") values = cwvBuckets.map(b => b.ttfb);

    const totalBuckets = values.length;
    const compliant = values.filter(v => slo.direction === "above" ? v >= slo.target : v <= slo.target).length;
    const compliancePct = totalBuckets > 0 ? (compliant / totalBuckets) * 100 : 100;
    const budgetTotal = totalBuckets > 0 ? Math.max(1, Math.round(totalBuckets * 0.05)) : 1;
    const violations = totalBuckets - compliant;
    const budgetRemaining = Math.max(0, budgetTotal - violations);
    const budgetPct = (budgetRemaining / budgetTotal) * 100;
    const burnRate = totalBuckets > 0 ? violations / totalBuckets : 0;
    const current = values.length > 0 ? values[values.length - 1] : 0;
    const hoursToExhaust = burnRate > 0 && budgetRemaining > 0 ? Math.round(budgetRemaining / burnRate) : null;

    let remaining = budgetTotal;
    const burnDown = values.map(v => {
      const ok = slo.direction === "above" ? v >= slo.target : v <= slo.target;
      if (!ok) remaining = Math.max(0, remaining - 1);
      return remaining;
    });

    const status = budgetPct >= 80 ? "HEALTHY" : budgetPct >= 40 ? "AT RISK" : budgetPct > 0 ? "CRITICAL" : "EXHAUSTED";
    const sClr = status === "HEALTHY" ? GREEN : status === "AT RISK" ? ORANGE : RED;

    return { ...slo, current, compliancePct, budgetTotal, budgetRemaining, budgetPct, burnRate, hoursToExhaust, violations, totalBuckets, burnDown, status, sClr };
  });

  function BurnDownChart({ data, budgetTotal, clr }: { data: number[]; budgetTotal: number; clr: string }) {
    if (data.length < 2) return <Text style={{ fontSize: 11, opacity: 0.5 }}>Insufficient data</Text>;
    const w = 220, h = 50, pad = 2;
    const points = data.map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (w - pad * 2);
      const y = pad + (1 - v / budgetTotal) * (h - pad * 2);
      return `${x},${y}`;
    }).join(" ");
    const lastX = pad + ((data.length - 1) / (data.length - 1)) * (w - pad * 2);
    const lastY = pad + (1 - data[data.length - 1] / budgetTotal) * (h - pad * 2);
    return (
      <svg width={w} height={h} style={{ display: "block" }}>
        <line x1={pad} y1={pad} x2={w - pad} y2={pad} stroke="rgba(255,255,255,0.1)" strokeDasharray="2,2" />
        <polyline points={points} fill="none" stroke={clr} strokeWidth={2} />
        <circle cx={lastX} cy={lastY} r={3} fill={clr} />
      </svg>
    );
  }

  return (
    <Flex flexDirection="column" gap={16} style={{ paddingTop: 16 }}>
      <SectionHeader title="Service Level Objectives" />
      <Flex gap={12} flexWrap="wrap">
        {sloResults.map(slo => (
          <div key={slo.name} className="uj-table-tile" style={{ padding: 16, flex: "1 1 320px", minWidth: 320, borderLeft: `3px solid ${slo.sClr}` }}>
            <Flex justifyContent="space-between" alignItems="center">
              <Strong style={{ fontSize: 14 }}>{slo.name}</Strong>
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: `${slo.sClr}18`, color: slo.sClr, fontWeight: 700 }}>{slo.status}</span>
            </Flex>
            <Flex gap={24} style={{ marginTop: 12 }}>
              <div><Text style={{ fontSize: 10, opacity: 0.5 }}>Current</Text><Strong style={{ display: "block", fontSize: 18, color: slo.color(slo.current) }}>{slo.format(slo.current)}</Strong></div>
              <div><Text style={{ fontSize: 10, opacity: 0.5 }}>Target</Text><Text style={{ display: "block", fontSize: 14 }}>{slo.direction === "above" ? "\u2265" : "\u2264"} {slo.format(slo.target)}</Text></div>
              <div><Text style={{ fontSize: 10, opacity: 0.5 }}>Compliance</Text><Strong style={{ display: "block", fontSize: 14, color: slo.compliancePct >= 95 ? GREEN : slo.compliancePct >= 80 ? YELLOW : RED }}>{slo.compliancePct.toFixed(1)}%</Strong></div>
            </Flex>
            <Flex gap={24} style={{ marginTop: 8 }}>
              <div><Text style={{ fontSize: 10, opacity: 0.5 }}>Budget Remaining</Text><Strong style={{ display: "block", fontSize: 14, color: slo.sClr }}>{slo.budgetRemaining}/{slo.budgetTotal} ({slo.budgetPct.toFixed(0)}%)</Strong></div>
              <div><Text style={{ fontSize: 10, opacity: 0.5 }}>Violations</Text><Text style={{ display: "block", fontSize: 14, color: slo.violations > 0 ? RED : GREEN }}>{slo.violations}/{slo.totalBuckets}</Text></div>
              <div><Text style={{ fontSize: 10, opacity: 0.5 }}>Time to Exhaust</Text><Text style={{ display: "block", fontSize: 14 }}>{slo.hoursToExhaust != null ? `~${slo.hoursToExhaust}h` : slo.budgetPct <= 0 ? "Exhausted" : "Safe"}</Text></div>
            </Flex>
            <div style={{ marginTop: 12 }}>
              <Text style={{ fontSize: 10, opacity: 0.5, marginBottom: 4, display: "block" }}>Error Budget Burn-Down</Text>
              <BurnDownChart data={slo.burnDown} budgetTotal={slo.budgetTotal} clr={slo.sClr} />
            </div>
            <ProgressBar value={slo.budgetPct} style={{ height: 6, marginTop: 8 }} />
          </div>
        ))}
      </Flex>

      <SectionHeader title="SLO Summary" />
      <div className="uj-table-tile">
        <DataTable sortable data={sloResults.map(s => ({
          SLO: s.name, Current: s.format(s.current), Target: `${s.direction === "above" ? "\u2265" : "\u2264"} ${s.format(s.target)}`,
          "Compliance %": s.compliancePct, "Budget %": s.budgetPct, Violations: s.violations,
          "Burn Rate": (s.burnRate * 100).toFixed(2) + "%/bucket",
          "Time to Exhaust": s.hoursToExhaust != null ? `~${s.hoursToExhaust}h` : s.budgetPct <= 0 ? "Exhausted" : "Safe",
          Status: s.status,
        }))} columns={[
          { id: "SLO", header: "SLO", accessor: "SLO", cell: ({ value }: any) => <Strong style={{ color: BLUE }}>{value}</Strong> },
          { id: "Current", header: "Current", accessor: "Current" },
          { id: "Target", header: "Target", accessor: "Target" },
          { id: "Compliance %", header: "Compliance", accessor: "Compliance %", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value >= 95 ? GREEN : value >= 80 ? YELLOW : RED }}>{value.toFixed(1)}%</Strong> },
          { id: "Budget %", header: "Budget %", accessor: "Budget %", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value >= 80 ? GREEN : value >= 40 ? ORANGE : RED }}>{value.toFixed(0)}%</Strong> },
          { id: "Violations", header: "Violations", accessor: "Violations", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 0 ? RED : GREEN }}>{value}</Text> },
          { id: "Burn Rate", header: "Burn Rate", accessor: "Burn Rate" },
          { id: "Time to Exhaust", header: "Exhaust In", accessor: "Time to Exhaust", cell: ({ value }: any) => <Strong style={{ color: value === "Safe" ? GREEN : value === "Exhausted" ? RED : ORANGE }}>{value}</Strong> },
          { id: "Status", header: "Status", accessor: "Status", cell: ({ value }: any) => { const c = value === "HEALTHY" ? GREEN : value === "AT RISK" ? ORANGE : RED; return <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: `${c}18`, color: c, fontWeight: 700 }}>{value}</span>; } },
        ]} />
      </div>
    </Flex>
  );
}

// ===========================================================================
// SESSION REPLAY SPOTLIGHT TAB
// ===========================================================================
function SessionReplaySpotlightTab({ data, isLoading }: { data: any; isLoading: boolean }) {
  if (isLoading) return <Loading />;

  const sessions = (data.data?.records ?? []) as any[];
  const totalSessions = sessions.length;
  const withCrash = sessions.filter((s: any) => s.has_crash).length;
  const withBounce = sessions.filter((s: any) => s.is_bounce).length;
  const totalErrors = sessions.reduce((sum: number, s: any) => sum + Number(s.err ?? 0), 0);
  const avgImpact = totalSessions > 0 ? sessions.reduce((sum: number, s: any) => sum + Number(s.impact_score ?? 0), 0) / totalSessions : 0;

  function impactColor(score: number): string { return score >= 50 ? RED : score >= 20 ? ORANGE : score >= 10 ? YELLOW : GREEN; }

  return (
    <Flex flexDirection="column" gap={16} style={{ paddingTop: 16 }}>
      <SectionHeader title="High-Impact Session Replays" />
      <Flex gap={12} flexWrap="wrap">
        {[
          { label: "Replay Sessions", value: fmtCount(totalSessions), color: BLUE },
          { label: "With Crashes", value: String(withCrash), color: withCrash > 0 ? RED : GREEN },
          { label: "With Bounces", value: String(withBounce), color: withBounce > 0 ? ORANGE : GREEN },
          { label: "Total Errors", value: fmtCount(totalErrors), color: totalErrors > 5 ? RED : GREEN },
          { label: "Avg Impact Score", value: avgImpact.toFixed(1), color: impactColor(avgImpact) },
        ].map(c => (
          <div key={c.label} className="uj-table-tile" style={{ padding: 16, flex: "1 1 160px", minWidth: 160, textAlign: "center" }}>
            <Text style={{ fontSize: 10, opacity: 0.5 }}>{c.label}</Text>
            <Strong style={{ display: "block", fontSize: 22, color: c.color }}>{c.value}</Strong>
          </div>
        ))}
      </Flex>

      <SectionHeader title="Sessions Ranked by Impact" />
      {sessions.length === 0 ? (
        <div className="uj-table-tile" style={{ padding: 24, textAlign: "center" }}>
          <Paragraph style={{ opacity: 0.5 }}>No session replays found in the selected timeframe. Ensure Session Replay is enabled for this frontend.</Paragraph>
        </div>
      ) : (
        <Flex flexDirection="column" gap={8}>
          {sessions.slice(0, 20).map((s: any, i: number) => {
            const score = Number(s.impact_score ?? 0);
            const sessionStart = s.start_time ? encodeURIComponent(String(new Date(s.start_time))) : '';
            const replayUrl = `${ENV_URL}/ui/apps/dynatrace.users.sessions/session-viewer/${s.session_id}/${sessionStart}?tf=now-2h%3Bnow&df=1&perspective=general&sort=hasReplay%3Adescending`;
            return (
              <div key={s.session_id} className="uj-table-tile" style={{ padding: 12, borderLeft: `3px solid ${impactColor(score)}` }}>
                <Flex justifyContent="space-between" alignItems="center">
                  <Flex alignItems="center" gap={12}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: impactColor(score), minWidth: 28, textAlign: "center" }}>#{i + 1}</span>
                    <div>
                      <Flex gap={8} alignItems="center">
                        <Strong style={{ fontSize: 13 }}>Impact: {score}</Strong>
                        {s.has_crash && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: `${RED}20`, color: RED, fontWeight: 700 }}>CRASH</span>}
                        {s.is_bounce && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: `${ORANGE}20`, color: ORANGE, fontWeight: 700 }}>BOUNCE</span>}
                      </Flex>
                      <Text style={{ fontSize: 11, opacity: 0.6 }}>
                        {Number(s.dur_s ?? 0).toFixed(1)}s \u00b7 {s.err} error{Number(s.err) !== 1 ? "s" : ""} \u00b7 {s.navs} nav{Number(s.navs) !== 1 ? "s" : ""} \u00b7 {s.interactions} interaction{Number(s.interactions) !== 1 ? "s" : ""}
                      </Text>
                      <Text style={{ fontSize: 10, opacity: 0.4 }}>{s.device} \u00b7 {s.browser_name} \u00b7 {s.country}{s.user_tag ? ` \u00b7 ${s.user_tag}` : ""}</Text>
                    </div>
                  </Flex>
                  <Link href={replayUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="emphasized" style={{ fontSize: 11 }}>{"\u25B6"} Replay</Button>
                  </Link>
                </Flex>
              </div>
            );
          })}
        </Flex>
      )}

      {sessions.length > 0 && (
        <>
          <SectionHeader title="Session Detail Table" />
          <div className="uj-table-tile">
            <DataTable sortable data={sessions.map((s: any) => ({
              Impact: Number(s.impact_score ?? 0), Duration: Number(s.dur_s ?? 0), Errors: Number(s.err ?? 0),
              Navigations: Number(s.navs ?? 0), Interactions: Number(s.interactions ?? 0),
              Device: s.device, Browser: s.browser_name, Country: s.country,
              Crash: s.has_crash ? "Yes" : "No", Bounce: s.is_bounce ? "Yes" : "No", User: s.user_tag || "\u2014",
            }))} columns={[
              { id: "Impact", header: "Impact", accessor: "Impact", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: impactColor(value) }}>{value}</Strong> },
              { id: "Duration", header: "Duration", accessor: "Duration", sortType: "number" as any, cell: ({ value }: any) => <Text>{value.toFixed(1)}s</Text> },
              { id: "Errors", header: "Errors", accessor: "Errors", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 0 ? RED : GREEN }}>{value}</Text> },
              { id: "Navigations", header: "Navs", accessor: "Navigations", sortType: "number" as any },
              { id: "Interactions", header: "Actions", accessor: "Interactions", sortType: "number" as any },
              { id: "Device", header: "Device", accessor: "Device" },
              { id: "Browser", header: "Browser", accessor: "Browser" },
              { id: "Country", header: "Country", accessor: "Country" },
              { id: "Crash", header: "Crash", accessor: "Crash", cell: ({ value }: any) => <Text style={{ color: value === "Yes" ? RED : GREEN }}>{value}</Text> },
              { id: "Bounce", header: "Bounce", accessor: "Bounce", cell: ({ value }: any) => <Text style={{ color: value === "Yes" ? ORANGE : GREEN }}>{value}</Text> },
              { id: "User", header: "User", accessor: "User" },
            ]} />
          </div>
        </>
      )}
    </Flex>
  );
}

// ===========================================================================
// A/B COMPARISON TAB
// ===========================================================================
const AB_PRESETS: { label: string; dimension: "device" | "browser" | "country" | "custom"; a: string; b: string }[] = [
  { label: "Desktop vs Mobile", dimension: "device", a: 'device.type == "desktop"', b: 'device.type == "mobile"' },
  { label: "Chrome vs Firefox", dimension: "browser", a: 'contains(browser.name, "Chrome")', b: 'contains(browser.name, "Firefox")' },
  { label: "US vs Non-US", dimension: "country", a: 'geo.country.iso_code == "US"', b: 'geo.country.iso_code != "US"' },
];

function ABComparisonTab({ segAData, segBData, segACwv, segBCwv, dimension, setDimension, segA, segB, setSegA, setSegB, isLoading }: {
  segAData: any; segBData: any; segACwv: any; segBCwv: any;
  dimension: "device" | "browser" | "country" | "custom"; setDimension: (d: "device" | "browser" | "country" | "custom") => void;
  segA: string; segB: string; setSegA: (s: string) => void; setSegB: (s: string) => void;
  isLoading: boolean;
}) {
  const [customA, setCustomA] = useState(segA);
  const [customB, setCustomB] = useState(segB);

  const applyPreset = (preset: typeof AB_PRESETS[number]) => {
    setDimension(preset.dimension);
    setSegA(preset.a);
    setSegB(preset.b);
    setCustomA(preset.a);
    setCustomB(preset.b);
  };

  const applyCustom = () => {
    setDimension("custom");
    setSegA(customA);
    setSegB(customB);
  };

  const parseSegment = (segData: any) => {
    const records = (segData.data?.records ?? []) as any[];
    const totalSessions = records.reduce((s: number, r: any) => s + Number(r.sessions ?? 0), 0);
    const totalActions = records.reduce((s: number, r: any) => s + Number(r.actions ?? 0), 0);
    const totalErrors = records.reduce((s: number, r: any) => s + Number(r.errors ?? 0), 0);
    const totalSat = records.reduce((s: number, r: any) => s + Number(r.satisfied ?? 0), 0);
    const totalTol = records.reduce((s: number, r: any) => s + Number(r.tolerating ?? 0), 0);
    const totalFrust = records.reduce((s: number, r: any) => s + Number(r.frustrated ?? 0), 0);
    const avgDur = records.length > 0 ? records.reduce((s: number, r: any) => s + Number(r.avg_dur ?? 0), 0) / records.length : 0;
    const p90Dur = records.length > 0 ? Math.max(...records.map((r: any) => Number(r.p90_dur ?? 0))) : 0;
    const total = totalSat + totalTol + totalFrust;
    const apdex = calcApdex(totalSat, totalTol, total);
    const errRate = totalActions > 0 ? (totalErrors / totalActions) * 100 : 0;
    return { totalSessions, totalActions, avgDur, p90Dur, apdex, errRate };
  };

  const parseCwv = (cwvData: any) => {
    const r = (cwvData.data?.records?.[0]) as any;
    return { lcp: Number(r?.lcp_avg ?? 0), cls: Number(r?.cls_avg ?? 0), inp: Number(r?.inp_avg ?? 0), ttfb: Number(r?.ttfb_avg ?? 0) };
  };

  const a = parseSegment(segAData);
  const b = parseSegment(segBData);
  const aCwv = parseCwv(segACwv);
  const bCwv = parseCwv(segBCwv);

  function CmpRow({ label, valA, valB, formatFn, lowerBetter = false, colorFn }: { label: string; valA: number; valB: number; formatFn: (v: number) => string; lowerBetter?: boolean; colorFn?: (v: number) => string }) {
    const diff = valA - valB;
    const aWins = lowerBetter ? diff < 0 : diff > 0;
    const bWins = lowerBetter ? diff > 0 : diff < 0;
    return (
      <Flex style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }} justifyContent="space-between" alignItems="center">
        <Text style={{ flex: 1, fontSize: 13 }}>{label}</Text>
        <Strong style={{ flex: 1, textAlign: "center", fontSize: 15, color: colorFn ? colorFn(valA) : (aWins ? GREEN : bWins ? RED : BLUE) }}>{formatFn(valA)}{aWins ? " \u2713" : ""}</Strong>
        <Strong style={{ flex: 1, textAlign: "center", fontSize: 15, color: colorFn ? colorFn(valB) : (bWins ? GREEN : aWins ? RED : BLUE) }}>{formatFn(valB)}{bWins ? " \u2713" : ""}</Strong>
        <Text style={{ flex: 1, textAlign: "right", fontSize: 12, color: Math.abs(diff) < 0.001 ? "rgba(255,255,255,0.4)" : aWins ? GREEN : RED }}>
          {diff > 0 ? "+" : ""}{formatFn(diff)}
        </Text>
      </Flex>
    );
  }

  const activePreset = AB_PRESETS.find(p => p.a === segA && p.b === segB);

  return (
    <Flex flexDirection="column" gap={16} style={{ paddingTop: 16 }}>
      <SectionHeader title="A/B Segment Comparison" />

      <Flex gap={8} flexWrap="wrap" alignItems="center">
        <Text style={{ fontSize: 12, opacity: 0.6 }}>Quick Presets:</Text>
        {AB_PRESETS.map(p => (
          <button key={p.label} onClick={() => applyPreset(p)} style={{
            padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
            border: activePreset?.label === p.label ? `1px solid ${BLUE}` : "1px solid rgba(255,255,255,0.15)",
            background: activePreset?.label === p.label ? `${BLUE}20` : "rgba(255,255,255,0.05)",
            color: activePreset?.label === p.label ? BLUE : "rgba(255,255,255,0.7)",
          }}>{p.label}</button>
        ))}
      </Flex>

      <Flex gap={12} alignItems="flex-end" flexWrap="wrap">
        <div style={{ flex: 1, minWidth: 200 }}>
          <Text style={{ fontSize: 11, opacity: 0.5, display: "block", marginBottom: 4 }}>Segment A Filter (DQL)</Text>
          <TextInput value={customA} onChange={(v: string) => setCustomA(v)} placeholder='device.type == "desktop"' />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <Text style={{ fontSize: 11, opacity: 0.5, display: "block", marginBottom: 4 }}>Segment B Filter (DQL)</Text>
          <TextInput value={customB} onChange={(v: string) => setCustomB(v)} placeholder='device.type == "mobile"' />
        </div>
        <Button onClick={applyCustom}>Apply</Button>
      </Flex>

      {isLoading ? <Loading /> : (
        <>
          <Flex justifyContent="space-between" style={{ padding: "0 4px" }}>
            <div style={{ flex: 1 }} />
            <Strong style={{ flex: 1, textAlign: "center", color: BLUE }}>Segment A</Strong>
            <Strong style={{ flex: 1, textAlign: "center", color: PURPLE }}>Segment B</Strong>
            <Text style={{ flex: 1, textAlign: "right", opacity: 0.5, fontSize: 12 }}>{"\u0394 (A \u2212 B)"}</Text>
          </Flex>
          <Flex justifyContent="space-between" style={{ padding: "0 4px" }}>
            <div style={{ flex: 1 }} />
            <Text style={{ flex: 1, textAlign: "center", fontSize: 11, opacity: 0.6 }}>{segA}</Text>
            <Text style={{ flex: 1, textAlign: "center", fontSize: 11, opacity: 0.6 }}>{segB}</Text>
            <div style={{ flex: 1 }} />
          </Flex>

          <div className="uj-table-tile" style={{ padding: 16 }}>
            <Strong style={{ fontSize: 13, marginBottom: 8, display: "block" }}>Core Metrics</Strong>
            <CmpRow label="Sessions" valA={a.totalSessions} valB={b.totalSessions} formatFn={v => fmtCount(Math.abs(v))} />
            <CmpRow label="Apdex" valA={a.apdex} valB={b.apdex} formatFn={v => Math.abs(v).toFixed(2)} colorFn={apdexClr} />
            <CmpRow label="Avg Duration" valA={a.avgDur} valB={b.avgDur} formatFn={v => fmt(Math.abs(v))} lowerBetter />
            <CmpRow label="P90 Duration" valA={a.p90Dur} valB={b.p90Dur} formatFn={v => fmt(Math.abs(v))} lowerBetter />
            <CmpRow label="Error Rate" valA={a.errRate} valB={b.errRate} formatFn={v => fmtPct(Math.abs(v))} lowerBetter />
          </div>

          <div className="uj-table-tile" style={{ padding: 16 }}>
            <Strong style={{ fontSize: 13, marginBottom: 8, display: "block" }}>Core Web Vitals</Strong>
            <CmpRow label="LCP" valA={aCwv.lcp} valB={bCwv.lcp} formatFn={v => fmt(Math.abs(v))} lowerBetter colorFn={v => cwvClr(Math.abs(v), "lcp")} />
            <CmpRow label="CLS" valA={aCwv.cls} valB={bCwv.cls} formatFn={v => Math.abs(v).toFixed(3)} lowerBetter colorFn={v => cwvClr(Math.abs(v), "cls")} />
            <CmpRow label="INP" valA={aCwv.inp} valB={bCwv.inp} formatFn={v => fmt(Math.abs(v))} lowerBetter colorFn={v => cwvClr(Math.abs(v), "inp")} />
            <CmpRow label="TTFB" valA={aCwv.ttfb} valB={bCwv.ttfb} formatFn={v => fmt(Math.abs(v))} lowerBetter colorFn={v => cwvClr(Math.abs(v), "ttfb")} />
          </div>

          {(() => {
            const coreScore = (a.apdex > b.apdex ? 1 : -1) + (a.avgDur < b.avgDur ? 1 : -1) + (a.p90Dur < b.p90Dur ? 1 : -1) + (a.errRate < b.errRate ? 1 : -1) + (a.totalSessions > b.totalSessions ? 1 : -1);
            const coreWinner = coreScore > 0 ? "A" : coreScore < 0 ? "B" : null;
            const coreColor = coreWinner === "A" ? BLUE : coreWinner === "B" ? PURPLE : YELLOW;
            const cwvScore = (aCwv.lcp < bCwv.lcp ? 1 : -1) + (aCwv.cls < bCwv.cls ? 1 : -1) + (aCwv.inp < bCwv.inp ? 1 : -1) + (aCwv.ttfb < bCwv.ttfb ? 1 : -1);
            const cwvWinner = cwvScore > 0 ? "A" : cwvScore < 0 ? "B" : null;
            const cwvColor = cwvWinner === "A" ? BLUE : cwvWinner === "B" ? PURPLE : YELLOW;
            return (
              <Flex gap={12}>
                <div className="uj-table-tile" style={{ padding: 16, borderLeft: `3px solid ${coreColor}`, flex: 1 }}>
                  <Strong style={{ color: coreColor }}>{coreWinner ? `Segment ${coreWinner} outperforms on ${Math.abs(coreScore)}/5 core metrics` : "Segments perform equally across core metrics"}</Strong>
                  <Paragraph style={{ fontSize: 12, marginTop: 6, opacity: 0.7 }}>
                    {coreWinner === "A" && "Consider investigating Segment B for optimization opportunities."}
                    {coreWinner === "B" && "Consider investigating Segment A for optimization opportunities."}
                    {!coreWinner && "Both segments show comparable performance. Consider more granular segmentation."}
                  </Paragraph>
                </div>
                <div className="uj-table-tile" style={{ padding: 16, borderLeft: `3px solid ${cwvColor}`, flex: 1 }}>
                  <Strong style={{ color: cwvColor }}>{cwvWinner ? `Segment ${cwvWinner} outperforms on ${Math.abs(cwvScore)}/4 Core Web Vitals` : "Segments perform equally across Core Web Vitals"}</Strong>
                  <Paragraph style={{ fontSize: 12, marginTop: 6, opacity: 0.7 }}>
                    {cwvWinner === "A" && "Segment B has weaker web vitals \u2014 check LCP/INP for UX regressions."}
                    {cwvWinner === "B" && "Segment A has weaker web vitals \u2014 check LCP/INP for UX regressions."}
                    {!cwvWinner && "Both segments show comparable web vitals. No immediate action needed."}
                  </Paragraph>
                </div>
              </Flex>
            );
          })()}
        </>
      )}
    </Flex>
  );
}
