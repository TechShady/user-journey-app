import React, { useState, useMemo } from "react";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { getEnvironmentUrl } from "@dynatrace-sdk/app-environment";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text, Strong, Paragraph } from "@dynatrace/strato-components/typography";
import { Tabs, Tab } from "@dynatrace/strato-components-preview/navigation";
import { Select } from "@dynatrace/strato-components-preview/forms";
import { ProgressBar } from "@dynatrace/strato-components/content";
import { Button } from "@dynatrace/strato-components/buttons";
import { Sheet } from "@dynatrace/strato-components/overlays";
import { DataTable } from "@dynatrace/strato-components-preview/tables";
import "./UserJourney.css";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const FRONTEND = "www.angular.easytravel.com";
const GREEN = "#0D9C29";
const YELLOW = "#FCD53F";
const RED = "#C21930";
const BLUE = "#4589FF";
const PURPLE = "#A56EFF";
const CYAN = "#08BDBA";
const ORANGE = "#FF832B";

let ENV_URL = "";
try { ENV_URL = getEnvironmentUrl(); } catch { /* dev fallback */ }

const FUNNEL_STEPS = [
  { label: "Home Page", identifier: "/easytravel/home", type: "view" as const },
  { label: "Login", identifier: "/easytravel/rest/login", type: "request" as const },
  { label: "Search", identifier: "/easytravel/search", type: "view" as const },
  { label: "Payment", identifier: "/easytravel/rest/validate-creditcard", type: "request" as const },
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
function statusClr(pct: number): string { return pct >= 80 ? GREEN : pct >= 50 ? YELLOW : RED; }
function apdexClr(a: number): string { return a >= 0.85 ? GREEN : a >= 0.7 ? YELLOW : a >= 0.5 ? ORANGE : RED; }
function apdexLabel(a: number): string { return a >= 0.85 ? "Excellent" : a >= 0.7 ? "Good" : a >= 0.5 ? "Fair" : "Poor"; }
function cwvClr(val: number, metric: keyof typeof CWV): string { return val <= CWV[metric].good ? GREEN : val <= CWV[metric].poor ? YELLOW : RED; }
function cwvLabel(val: number, metric: keyof typeof CWV): string { return val <= CWV[metric].good ? "Good" : val <= CWV[metric].poor ? "Needs Improvement" : "Poor"; }
function calcApdex(sat: number, tol: number, total: number): number { return total > 0 ? (sat + tol / 2) / total : 0; }

function stepFilter(s: typeof FUNNEL_STEPS[number]): string { return s.type === "view" ? `view.name == "${s.identifier}"` : `url.path == "${s.identifier}"`; }
function anyStepFilter(): string { return FUNNEL_STEPS.map(stepFilter).join(" or "); }
function stepTagExpr(labels: string[]): string {
  return `coalesce(\n    ${FUNNEL_STEPS.map((s, i) => `if(${stepFilter(s)}, "${labels[i]}")`).join(",\n    ")},\n    "other")`;
}

function sessionReplayUrl(sessionId: string): string {
  return `${ENV_URL}/ui/apps/dynatrace.classic.session.segmentation/#usersessiondetail;sessionId=${encodeURIComponent(sessionId)}`;
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
function sessionFlowQuery(days: number, prev = false): string {
  const period = periodClause(days, prev);
  const tagExpr = stepTagExpr(FUNNEL_STEPS.map((_, i) => `step${i + 1}`));
  const iAnyLines = FUNNEL_STEPS.map((_, i) => `    reached_step${i + 1} = iAny(steps[] == "step${i + 1}")`).join(",\n");
  const countLines = FUNNEL_STEPS.map((_, i) => {
    const conds = Array.from({ length: i + 1 }, (__, j) => `reached_step${j + 1} == true`).join(" and ");
    return `    at_step${i + 1} = countIf(${conds})`;
  }).join(",\n");
  return `fetch user.events, ${period}
| filter frontend.name == "${FRONTEND}"
| filter ${anyStepFilter()}
| fieldsAdd step_tag = ${tagExpr}
| summarize steps = collectDistinct(step_tag), by: {dt.rum.session.id}
| fieldsAdd
${iAnyLines}
| summarize
    total_sessions = count(),
${countLines}`;
}

function stepMetricsQuery(days: number): string {
  const period = periodClause(days);
  const tagExpr = stepTagExpr(FUNNEL_STEPS.map((s) => s.label));
  return `fetch user.events, ${period}
| filter frontend.name == "${FRONTEND}"
| filter ${anyStepFilter()}
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

function cwvQuery(days: number): string {
  const period = periodClause(days);
  return `timeseries {
  lcp = avg(dt.frontend.web.page.largest_contentful_paint),
  cls = avg(dt.frontend.web.page.cumulative_layout_shift),
  inp = avg(dt.frontend.web.page.interaction_to_next_paint),
  ttfb = avg(dt.frontend.web.navigation.time_to_first_byte),
  load_end = avg(dt.frontend.web.navigation.load_event_end)
}, ${period}, filter: {frontend.name == "${FRONTEND}"}
| fieldsAdd lcp_avg = arrayAvg(lcp), cls_avg = arrayAvg(cls), inp_avg = arrayAvg(inp), ttfb_avg = arrayAvg(ttfb), load_avg = arrayAvg(load_end)
| fields lcp_avg, cls_avg, inp_avg, ttfb_avg, load_avg`;
}

function cwvByPageQuery(days: number): string {
  const period = periodClause(days);
  return `timeseries {
  lcp = avg(dt.frontend.web.page.largest_contentful_paint),
  cls = avg(dt.frontend.web.page.cumulative_layout_shift),
  ttfb = avg(dt.frontend.web.navigation.time_to_first_byte),
  load_end = avg(dt.frontend.web.navigation.load_event_end)
}, by: {dt.rum.view.name}, ${period}, filter: {frontend.name == "${FRONTEND}"}
| fieldsAdd lcp_avg = arrayAvg(lcp), cls_avg = arrayAvg(cls), ttfb_avg = arrayAvg(ttfb), load_avg = arrayAvg(load_end)
| fields dt.rum.view.name, lcp_avg, cls_avg, ttfb_avg, load_avg
| sort lcp_avg desc
| limit 20`;
}

function deviceQuery(days: number): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${FRONTEND}"
| filter ${anyStepFilter()}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd satisfaction = coalesce(if(dur_ms <= ${APDEX_T}.0, "satisfied"), if(dur_ms <= ${APDEX_4T}.0, "tolerating"), "frustrated")
| fieldsAdd deviceType = device.type
| summarize actions = count(), sessions = countDistinct(dt.rum.session.id), avg_duration_ms = avg(dur_ms), satisfied = countIf(satisfaction == "satisfied"), tolerating = countIf(satisfaction == "tolerating"), frustrated = countIf(satisfaction == "frustrated"), by: {deviceType}
| sort actions desc`;
}

function browserQuery(days: number): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${FRONTEND}"
| filter ${anyStepFilter()}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd satisfaction = coalesce(if(dur_ms <= ${APDEX_T}.0, "satisfied"), if(dur_ms <= ${APDEX_4T}.0, "tolerating"), "frustrated")
| fieldsAdd browserName = browser.name
| summarize actions = count(), sessions = countDistinct(dt.rum.session.id), avg_duration_ms = avg(dur_ms), errors = countIf(characteristics.has_error == true), satisfied = countIf(satisfaction == "satisfied"), tolerating = countIf(satisfaction == "tolerating"), frustrated = countIf(satisfaction == "frustrated"), by: {browserName}
| sort actions desc
| limit 15`;
}

function geoQuery(days: number): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${FRONTEND}"
| filter ${anyStepFilter()}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd satisfaction = coalesce(if(dur_ms <= ${APDEX_T}.0, "satisfied"), if(dur_ms <= ${APDEX_4T}.0, "tolerating"), "frustrated")
| fieldsAdd country = geo.country.iso_code
| summarize actions = count(), sessions = countDistinct(dt.rum.session.id), avg_duration_ms = avg(dur_ms), errors = countIf(characteristics.has_error == true), satisfied = countIf(satisfaction == "satisfied"), tolerating = countIf(satisfaction == "tolerating"), frustrated = countIf(satisfaction == "frustrated"), by: {country}
| sort actions desc
| limit 20`;
}

function errorQuery(days: number): string {
  const period = periodClause(days);
  const tagExpr = stepTagExpr(FUNNEL_STEPS.map((s) => s.label));
  return `fetch user.events, ${period}
| filter frontend.name == "${FRONTEND}"
| filter ${anyStepFilter()}
| filter characteristics.has_error == true
| fieldsAdd step_tag = ${tagExpr}
| summarize error_count = count(), affected_sessions = countDistinct(dt.rum.session.id), by: {step_tag}
| sort error_count desc`;
}

function sessionQualityQuery(days: number, prev = false): string {
  const period = periodClause(days, prev);
  return `fetch user.events, ${period}
| filter frontend.name == "${FRONTEND}"
| filter ${anyStepFilter()}
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
function worstSessionsQuery(days: number): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${FRONTEND}"
| filter ${anyStepFilter()}
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
    by: {dt.rum.session.id}
| sort frustrated desc, errors desc, max_dur desc
| limit 25`;
}

// NEW: JS Errors query
function jsErrorsQuery(days: number): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${FRONTEND}"
| filter characteristics.has_error == true
| fieldsAdd errorName = event.name
| fieldsAdd pageName = view.name
| summarize
    occurrences = count(),
    affected_sessions = countDistinct(dt.rum.session.id),
    first_seen = min(timestamp),
    last_seen = max(timestamp),
    pages = collectDistinct(pageName),
    by: {errorName}
| sort occurrences desc
| limit 30`;
}

// NEW: Rage/Dead Clicks query
function clickIssuesQuery(days: number): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${FRONTEND}"
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

// NEW: User Cohort query — new vs returning and by user type
function cohortQuery(days: number): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${FRONTEND}"
| filter ${anyStepFilter()}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd satisfaction = coalesce(if(dur_ms <= ${APDEX_T}.0, "satisfied"), if(dur_ms <= ${APDEX_4T}.0, "tolerating"), "frustrated")
| fieldsAdd visitorType = coalesce(if(user.type == "Real User", "Identified"), "Anonymous")
| summarize
    actions = count(),
    sessions = countDistinct(dt.rum.session.id),
    avg_dur = avg(dur_ms),
    p90_dur = percentile(dur_ms, 90),
    errors = countIf(characteristics.has_error == true),
    satisfied = countIf(satisfaction == "satisfied"),
    tolerating = countIf(satisfaction == "tolerating"),
    frustrated = countIf(satisfaction == "frustrated"),
    by: {visitorType}`;
}

// NEW: Resource loading performance (top slow resources)
function resourceQuery(days: number): string {
  const period = periodClause(days);
  return `timeseries {
  dur = avg(dt.frontend.web.resource.duration),
  transfer = avg(dt.frontend.web.resource.transfer_size)
}, by: {dt.rum.resource.url}, ${period}, filter: {frontend.name == "${FRONTEND}"}
| fieldsAdd avg_dur = arrayAvg(dur), avg_size = arrayAvg(transfer)
| fields dt.rum.resource.url, avg_dur, avg_size
| filter isNotNull(avg_dur)
| sort avg_dur desc
| limit 25`;
}

// NEW: Geographic performance deep-dive (country + city level)
function geoPerformanceQuery(days: number): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${FRONTEND}"
| filter ${anyStepFilter()}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd satisfaction = coalesce(if(dur_ms <= ${APDEX_T}.0, "satisfied"), if(dur_ms <= ${APDEX_4T}.0, "tolerating"), "frustrated")
| fieldsAdd country = geo.country.iso_code
| fieldsAdd city = geo.city.name
| summarize
    actions = count(),
    sessions = countDistinct(dt.rum.session.id),
    avg_dur = avg(dur_ms),
    p90_dur = percentile(dur_ms, 90),
    errors = countIf(characteristics.has_error == true),
    satisfied = countIf(satisfaction == "satisfied"),
    tolerating = countIf(satisfaction == "tolerating"),
    frustrated = countIf(satisfaction == "frustrated"),
    by: {country, city}
| sort actions desc
| limit 50`;
}

// NEW: Navigation paths — actual user page flows
function navigationPathsQuery(days: number): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${FRONTEND}"
| filter event.type == "useraction"
| fieldsAdd pageName = coalesce(view.name, url.path, event.name, "unknown")
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

// NEW: Hourly distribution for performance budgets
function hourlyDistributionQuery(days: number): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${FRONTEND}"
| filter ${anyStepFilter()}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd hour = getHour(timestamp)
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
function conversionAttributionQuery(days: number): string {
  const period = periodClause(days);
  const tagExpr = stepTagExpr(FUNNEL_STEPS.map((_, i) => `step${i + 1}`));
  const iAnyLines = FUNNEL_STEPS.map((_, i) => `    reached_step${i + 1} = iAny(steps[] == "step${i + 1}")`).join(",\n");
  return `fetch user.events, ${period}
| filter frontend.name == "${FRONTEND}"
| filter ${anyStepFilter()}
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
| fieldsAdd converted = if(reached_step1 == true and reached_step2 == true and reached_step3 == true and reached_step4 == true, true, else: false)
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
function sessionDurationDistributionQuery(days: number): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${FRONTEND}"
| filter ${anyStepFilter()}
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

function FunnelChart({ steps, prevSteps }: { steps: FunnelStep[]; prevSteps?: FunnelStep[] }) {
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

        return (
          <g key={i}>
            {i > 0 && <line x1={cx - widths[i] / 2} y1={y} x2={cx + widths[i] / 2} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />}
            <circle cx={24} cy={midY} r={13} fill={`${sClr}1A`} stroke={sClr} strokeWidth="1.5" />
            <text x={24} y={midY + 4} textAnchor="middle" fill={sClr} fontSize="12" fontWeight="700">{i + 1}</text>
            <text x={cx} y={midY - 10} textAnchor="middle" fill="rgba(255,255,255,0.95)" fontSize="14" fontWeight="600">{step.label}</text>
            <text x={cx} y={midY + 8} textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="12">{fmtCount(step.count)} sessions</text>
            {step.apdex != null && (
              <text x={cx} y={midY + 24} textAnchor="middle" fill={apdexClr(step.apdex)} fontSize="10" fontWeight="600">Apdex: {step.apdex.toFixed(2)}</text>
            )}
            {/* Compare delta */}
            {prevStep && Math.abs(countDeltaPct) >= 0.1 && (
              <text x={cx} y={midY + 36} textAnchor="middle" fill={countDelta >= 0 ? GREEN : RED} fontSize="10" fontWeight="600">
                {countDelta >= 0 ? "▲" : "▼"} {Math.abs(countDeltaPct).toFixed(1)}% vs prev
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

function HelpContent() {
  return (
    <div style={{ padding: "4px 0" }}>
      <HelpSection title="Overview">
        <Paragraph>The <Strong>User Journey</Strong> app provides comprehensive frontend observability for <Strong>{FRONTEND}</Strong>. It tracks users through a 4-step conversion funnel using real-time DQL queries against Dynatrace Grail. The funnel is <Strong>strict sequential</Strong>: each step requires all previous steps.</Paragraph>
      </HelpSection>
      <HelpSection title="Funnel Steps">
        <div style={{ margin: "12px 0", padding: "12px 16px", background: "rgba(69,137,255,0.08)", borderRadius: 8 }}>
          <Paragraph><Strong>Step 1 — Home Page</Strong> (view: /easytravel/home): Entry point.</Paragraph>
          <Paragraph><Strong>Step 2 — Login</Strong> (XHR: /easytravel/rest/login): Requires Step 1.</Paragraph>
          <Paragraph><Strong>Step 3 — Search</Strong> (view: /easytravel/search): Requires Steps 1-2.</Paragraph>
          <Paragraph><Strong>Step 4 — Payment</Strong> (XHR: /easytravel/rest/validate-creditcard): Requires Steps 1-3.</Paragraph>
        </div>
      </HelpSection>
      <HelpSection title="Tabs">
        <Paragraph><Strong>Funnel Overview</Strong>: KPIs, colorized funnel (color by drop-off severity), per-step Apdex, and step analysis table. Toggle <Strong>Compare</Strong> to overlay the previous period as dashed outlines and see ▲▼ deltas on each step.</Paragraph>
        <Paragraph><Strong>Trends</Strong>: Period-over-period comparison of all key metrics. Shows current vs. previous period with delta arrows — green for improvement, red for regression. Inverted logic for duration/errors (lower = better).</Paragraph>
        <Paragraph><Strong>Web Vitals</Strong>: Core Web Vitals gauges (LCP, CLS, INP, TTFB), page-level CWV breakdown, and performance health score.</Paragraph>
        <Paragraph><Strong>Step Details</Strong>: Per-step deep dive with Apdex gauges, satisfaction breakdown bars, and duration percentiles (P50/P90/P99).</Paragraph>
        <Paragraph><Strong>Worst Sessions</Strong>: Surfaces the worst-performing sessions ranked by frustrated actions, errors, and slowness. Each session links directly to <Strong>Dynatrace Session Replay</Strong> for instant root-cause analysis.</Paragraph>
        <Paragraph><Strong>JS Errors</Strong>: JavaScript errors grouped by error name. Shows occurrences, affected sessions, error velocity (new vs. recurring), and impacted pages. Helps prioritize which errors to fix first.</Paragraph>
        <Paragraph><Strong>Click Issues</Strong>: Detects rage clicks (rapid repeated clicks indicating frustration) and dead clicks (clicks on non-responsive elements). Shows the worst offending elements, pages, and session impact to guide UX fixes.</Paragraph>
        <Paragraph><Strong>User Cohorts</Strong>: Compares experience quality between identified (logged-in) and anonymous users. Shows Apdex, duration, errors, and satisfaction breakdown per cohort to reveal auth-flow overhead or personalization issues.</Paragraph>
        <Paragraph><Strong>Resources</Strong>: Surfaces the slowest-loading resources (scripts, images, fonts, APIs) with a waterfall visualization. Groups by domain to identify problematic third-party dependencies. Helps prioritize optimizations that improve LCP and load times.</Paragraph>
        <Paragraph><Strong>Perf Budgets</Strong>: Tracks actual metrics against defined performance budgets (Apdex ≥0.85, Conversion ≥20%, Avg Duration ≤2s, P90 ≤4s, Error Rate ≤2%, Frustrated ≤10%). Shows pass/fail status, margin from target, and hourly Apdex distribution to identify peak-hour degradation.</Paragraph>
        <Paragraph><Strong>Geo Heatmap</Strong>: Country and city-level performance with Apdex color-coding and satisfaction bars. Identifies regions with poor user experience for targeted CDN placement or infrastructure optimization. Includes city-level drill-down for granular insights.</Paragraph>
        <Paragraph><Strong>Navigation Paths</Strong>: Shows actual user navigation flows (not just the expected funnel). Reveals unexpected paths, loops, and exit points. Flow visualization groups transitions by source page, highlighting funnel-aligned vs. off-path navigation.</Paragraph>
        <Paragraph><Strong>Anomaly Detection</Strong>: Flags metrics with significant deviation from baseline (previous period). Shows stability score, per-metric severity (normal/medium/high/critical), per-step traffic anomalies, and a duration distribution histogram. Includes automated diagnosis with actionable recommendations.</Paragraph>
        <Paragraph><Strong>Conversion Attribution</Strong>: Correlates conversion rates with performance factors. Shows how session speed, device type, and browser affect conversion. Speed buckets (fast/medium/slow) quantify the revenue impact of performance, with full device × browser cross-section.</Paragraph>
        <Paragraph><Strong>Executive Summary</Strong>: Report-card style overview for stakeholders. Weighted letter grade (A-F), key metric trends, funnel summary, bottleneck alert, CWV snapshot, and full performance table. Designed for quick status checks and executive presentations.</Paragraph>
        <Paragraph><Strong>Segmentation</Strong>: Device, browser, and geo breakdowns with Apdex per segment.</Paragraph>
        <Paragraph><Strong>Errors &amp; Drop-offs</Strong>: Drop-off analysis between funnel steps with optimization recommendations.</Paragraph>
        <Paragraph><Strong>What-If Analysis</Strong>: Traffic impact modeling with projected Apdex, latency, and conversion degradation.</Paragraph>
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
        <Paragraph>• JS Errors with high "Affected Sessions" are top priority fixes.</Paragraph>
        <Paragraph>• Toggle Compare on the funnel to spot conversion changes instantly.</Paragraph>
        <Paragraph>• Check Perf Budgets daily to catch regressions before they impact users.</Paragraph>
        <Paragraph>• Use Geo Heatmap to justify CDN edge locations in underperforming regions.</Paragraph>
        <Paragraph>• Navigation Paths reveals where users actually go vs. the intended funnel.</Paragraph>
        <Paragraph>• Anomaly Detection flags metrics that deviate significantly from baseline — check after every release.</Paragraph>
        <Paragraph>• Conversion Attribution reveals the business impact of slow pages per device/browser.</Paragraph>
        <Paragraph>• Share Executive Summary with stakeholders for quick performance status updates.</Paragraph>
      </HelpSection>
    </div>
  );
}

// ===========================================================================
// MAIN COMPONENT
// ===========================================================================
export function UserJourney() {
  const [timeframeDays, setTimeframeDays] = useState<number>(DEFAULT_TIMEFRAME);
  const [showHelp, setShowHelp] = useState(false);
  const [compareMode, setCompareMode] = useState(false);

  // Current period queries
  const funnelResult = useDql({ query: sessionFlowQuery(timeframeDays) });
  const stepMetrics = useDql({ query: stepMetricsQuery(timeframeDays) });
  const cwvResult = useDql({ query: cwvQuery(timeframeDays) });
  const cwvByPage = useDql({ query: cwvByPageQuery(timeframeDays) });
  const deviceData = useDql({ query: deviceQuery(timeframeDays) });
  const browserData = useDql({ query: browserQuery(timeframeDays) });
  const geoData = useDql({ query: geoQuery(timeframeDays) });
  const errorData = useDql({ query: errorQuery(timeframeDays) });
  const qualityData = useDql({ query: sessionQualityQuery(timeframeDays) });

  // Previous period queries (for Trends + Funnel Compare)
  const funnelResultPrev = useDql({ query: sessionFlowQuery(timeframeDays, true) });
  const qualityDataPrev = useDql({ query: sessionQualityQuery(timeframeDays, true) });

  // NEW: Worst Sessions + JS Errors
  const worstSessionsData = useDql({ query: worstSessionsQuery(timeframeDays) });
  const jsErrorsData = useDql({ query: jsErrorsQuery(timeframeDays) });

  // NEW: Rage/Dead Clicks, User Cohorts, Resources
  const clickIssuesData = useDql({ query: clickIssuesQuery(timeframeDays) });
  const cohortData = useDql({ query: cohortQuery(timeframeDays) });
  const resourceData = useDql({ query: resourceQuery(timeframeDays) });

  // NEW: Geo Performance, Navigation Paths, Hourly Distribution
  const geoPerformanceData = useDql({ query: geoPerformanceQuery(timeframeDays) });
  const navigationPathsData = useDql({ query: navigationPathsQuery(timeframeDays) });
  const hourlyDistributionData = useDql({ query: hourlyDistributionQuery(timeframeDays) });

  // NEW: Conversion Attribution, Duration Distribution
  const conversionAttributionData = useDql({ query: conversionAttributionQuery(timeframeDays) });
  const durationDistributionData = useDql({ query: sessionDurationDistributionQuery(timeframeDays) });

  // Parse funnel
  const parseFunnel = (result: any) => {
    const r = result?.data?.records?.[0] as any;
    if (!r) return [0, 0, 0, 0];
    return [Number(r.at_step1 ?? 0), Number(r.at_step2 ?? 0), Number(r.at_step3 ?? 0), Number(r.at_step4 ?? 0)];
  };
  const funnelCounts = useMemo(() => parseFunnel(funnelResult), [funnelResult.data]);
  const funnelCountsPrev = useMemo(() => parseFunnel(funnelResultPrev), [funnelResultPrev.data]);

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
  const overallConv = funnelCounts[0] > 0 ? (funnelCounts[3] / funnelCounts[0]) * 100 : 0;
  const overallConvPrev = funnelCountsPrev[0] > 0 ? (funnelCountsPrev[3] / funnelCountsPrev[0]) * 100 : 0;
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
            <Text style={{ fontSize: 12, opacity: 0.6 }}>{FRONTEND}</Text>
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
        </Flex>
      </div>
      <Sheet title="User Journey — Help & Documentation" show={showHelp} onDismiss={() => setShowHelp(false)} actions={<Button variant="emphasized" onClick={() => setShowHelp(false)}>Close</Button>}><HelpContent /></Sheet>

      {/* Tabs */}
      <Tabs defaultIndex={0}>
        <Tab title="Funnel Overview">
          <FunnelOverviewTab funnelCounts={funnelCounts} funnelCountsPrev={funnelCountsPrev} overallConv={overallConv} overallApdex={overallApdex} stepMap={stepMap} quality={quality} compareMode={compareMode} setCompareMode={setCompareMode} isLoading={isLoading || qualityData.isLoading} />
        </Tab>
        <Tab title="Trends">
          <TrendsTab quality={quality} qualityPrev={qualityPrev} overallApdex={overallApdex} overallApdexPrev={overallApdexPrev} overallConv={overallConv} overallConvPrev={overallConvPrev} funnelCounts={funnelCounts} funnelCountsPrev={funnelCountsPrev} isLoading={qualityData.isLoading || qualityDataPrev.isLoading || funnelResult.isLoading || funnelResultPrev.isLoading} />
        </Tab>
        <Tab title="Web Vitals">
          <WebVitalsTab cwv={cwv} cwvByPage={cwvByPage} isLoading={cwvResult.isLoading || cwvByPage.isLoading} />
        </Tab>
        <Tab title="Step Details">
          <StepDetailsTab stepMap={stepMap} isLoading={stepMetrics.isLoading} />
        </Tab>
        <Tab title="Worst Sessions">
          <WorstSessionsTab data={worstSessionsData} isLoading={worstSessionsData.isLoading} />
        </Tab>
        <Tab title="JS Errors">
          <JSErrorsTab data={jsErrorsData} isLoading={jsErrorsData.isLoading} />
        </Tab>
        <Tab title="Click Issues">
          <ClickIssuesTab data={clickIssuesData} isLoading={clickIssuesData.isLoading} />
        </Tab>
        <Tab title="User Cohorts">
          <UserCohortsTab data={cohortData} isLoading={cohortData.isLoading} />
        </Tab>
        <Tab title="Resources">
          <ResourcesTab data={resourceData} isLoading={resourceData.isLoading} />
        </Tab>
        <Tab title="Perf Budgets">
          <PerfBudgetsTab quality={quality} overallApdex={overallApdex} overallConv={overallConv} hourlyData={hourlyDistributionData} isLoading={qualityData.isLoading || hourlyDistributionData.isLoading} />
        </Tab>
        <Tab title="Geo Heatmap">
          <GeoHeatmapTab data={geoPerformanceData} isLoading={geoPerformanceData.isLoading} />
        </Tab>
        <Tab title="Navigation Paths">
          <NavigationPathsTab data={navigationPathsData} isLoading={navigationPathsData.isLoading} />
        </Tab>
        <Tab title="Anomaly Detection">
          <AnomalyDetectionTab quality={quality} qualityPrev={qualityPrev} overallApdex={overallApdex} overallApdexPrev={overallApdexPrev} funnelCounts={funnelCounts} funnelCountsPrev={funnelCountsPrev} stepMap={stepMap} durationDist={durationDistributionData} isLoading={qualityData.isLoading || qualityDataPrev.isLoading || durationDistributionData.isLoading} />
        </Tab>
        <Tab title="Conversion Attribution">
          <ConversionAttributionTab data={conversionAttributionData} overallConv={overallConv} isLoading={conversionAttributionData.isLoading} />
        </Tab>
        <Tab title="Executive Summary">
          <ExecutiveSummaryTab quality={quality} qualityPrev={qualityPrev} overallApdex={overallApdex} overallApdexPrev={overallApdexPrev} overallConv={overallConv} overallConvPrev={overallConvPrev} funnelCounts={funnelCounts} funnelCountsPrev={funnelCountsPrev} cwv={cwv} stepMap={stepMap} isLoading={isLoading || qualityData.isLoading || qualityDataPrev.isLoading || cwvResult.isLoading} />
        </Tab>
        <Tab title="Segmentation">
          <SegmentationTab devices={(deviceData.data?.records ?? []) as any[]} browsers={(browserData.data?.records ?? []) as any[]} geos={(geoData.data?.records ?? []) as any[]} isLoading={deviceData.isLoading || browserData.isLoading || geoData.isLoading} />
        </Tab>
        <Tab title="Errors & Drop-offs">
          <ErrorsTab errors={(errorData.data?.records ?? []) as any[]} funnelCounts={funnelCounts} isLoading={errorData.isLoading} />
        </Tab>
        <Tab title="What-If Analysis">
          <WhatIfTab funnelCounts={funnelCounts} stepMap={stepMap} overallApdex={overallApdex} isLoading={isLoading} />
        </Tab>
      </Tabs>
    </div>
  );
}

// ===========================================================================
// TAB: Funnel Overview (with Compare)
// ===========================================================================
function FunnelOverviewTab({ funnelCounts, funnelCountsPrev, overallConv, overallApdex, stepMap, quality, compareMode, setCompareMode, isLoading }: { funnelCounts: number[]; funnelCountsPrev: number[]; overallConv: number; overallApdex: number; stepMap: Map<string, any>; quality: any; compareMode: boolean; setCompareMode: (v: boolean) => void; isLoading: boolean }) {
  if (isLoading) return <Loading />;

  const makeFunnelSteps = (counts: number[]): FunnelStep[] => FUNNEL_STEPS.map((step, i) => {
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
          <Heading level={2} className="uj-kpi-value" style={{ color: GREEN }}>{fmtCount(funnelCounts[3])}</Heading>
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
          {compareMode ? "⟵ Hide Compare" : "Compare ⟶"}
        </button>
      </Flex>
      <div className="uj-funnel-container">
        <FunnelChart steps={funnelSteps} prevSteps={prevFunnelSteps} />
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
          data={FUNNEL_STEPS.map((step, i) => {
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
function TrendsTab({ quality, qualityPrev, overallApdex, overallApdexPrev, overallConv, overallConvPrev, funnelCounts, funnelCountsPrev, isLoading }: { quality: any; qualityPrev: any; overallApdex: number; overallApdexPrev: number; overallConv: number; overallConvPrev: number; funnelCounts: number[]; funnelCountsPrev: number[]; isLoading: boolean }) {
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
          data={FUNNEL_STEPS.map((step, i) => {
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
function WebVitalsTab({ cwv: v, cwvByPage, isLoading }: { cwv: { lcp: number; cls: number; inp: number; ttfb: number; load: number }; cwvByPage: any; isLoading: boolean }) {
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
          <DataTable sortable data={pages.map((p: any) => ({ Page: p["dt.rum.view.name"] ?? "Unknown", "LCP (ms)": Number(p.lcp_avg ?? 0), CLS: Number(p.cls_avg ?? 0), "TTFB (ms)": Number(p.ttfb_avg ?? 0), "Load (ms)": Number(p.load_avg ?? 0) }))}
            columns={[
              { id: "Page", header: "Page", accessor: "Page" },
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
function StepDetailsTab({ stepMap, isLoading }: { stepMap: Map<string, any>; isLoading: boolean }) {
  if (isLoading) return <Loading />;
  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      {FUNNEL_STEPS.map((step, i) => {
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
              <Heading level={5} style={{ margin: 0 }}>{step.label}</Heading>
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
              const actions = Number(s.actions ?? 0);
              const sat = Number(s.satisfied ?? 0);
              const tol = Number(s.tolerating ?? 0);
              const frustrated = Number(s.frustrated ?? 0);
              const apdex = calcApdex(sat, tol, actions);
              return {
                Session: sid.length > 16 ? sid.substring(0, 16) + "..." : sid,
                SessionFull: sid,
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
                const url = sessionReplayUrl(rowData.SessionFull);
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
// TAB: JS Errors (Error Drilldown) — NEW
// ===========================================================================
function JSErrorsTab({ data, isLoading }: { data: any; isLoading: boolean }) {
  if (isLoading) return <Loading />;

  const errors = (data.data?.records ?? []) as any[];
  const totalOccurrences = errors.reduce((a: number, e: any) => a + Number(e.occurrences ?? 0), 0);
  const totalAffected = errors.reduce((a: number, e: any) => a + Number(e.affected_sessions ?? 0), 0);

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      <SectionHeader title="JavaScript Error Drilldown" />
      <Text style={{ fontSize: 12, opacity: 0.5 }}>Errors grouped by event name. Ranked by occurrence count to help prioritize fixes.</Text>

      {/* Summary */}
      <Flex gap={16} flexWrap="wrap">
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Unique Errors</Text>
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
        <div className="uj-table-tile" style={{ padding: 24 }}><Text style={{ color: GREEN }}>No errors detected in this timeframe</Text></div>
      ) : (
        <>
          {/* Error cards */}
          <Flex flexDirection="column" gap={12}>
            {errors.slice(0, 10).map((e: any, i: number) => {
              const name = String(e.errorName ?? "Unknown Error");
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
                        <Strong style={{ fontSize: 13, wordBreak: "break-word" }}>{name.length > 120 ? name.substring(0, 120) + "..." : name}</Strong>
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
                    Occurrences: Number(e.occurrences ?? 0),
                    "Affected Sessions": Number(e.affected_sessions ?? 0),
                    Pages: ((e.pages ?? []) as string[]).join(", "),
                  }))}
                  columns={[
                    { id: "Error", header: "Error", accessor: "Error" },
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
// TAB: User Cohorts — NEW
// ===========================================================================
function UserCohortsTab({ data, isLoading }: { data: any; isLoading: boolean }) {
  if (isLoading) return <Loading />;

  const cohorts = (data.data?.records ?? []) as any[];
  const parsed = cohorts.map((c: any) => {
    const sat = Number(c.satisfied ?? 0);
    const tol = Number(c.tolerating ?? 0);
    const fru = Number(c.frustrated ?? 0);
    const actions = Number(c.actions ?? 0);
    const sessions = Number(c.sessions ?? 0);
    const avg = Number(c.avg_dur ?? 0);
    const p90 = Number(c.p90_dur ?? 0);
    const errors = Number(c.errors ?? 0);
    const apdex = calcApdex(sat, tol, actions);
    const errRate = actions > 0 ? (errors / actions) * 100 : 0;
    return { name: String(c.visitorType ?? "Unknown"), sessions, actions, avg, p90, errors, errRate, sat, tol, fru, apdex };
  });

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      <SectionHeader title="User Cohort Comparison" />
      <Text style={{ fontSize: 12, opacity: 0.5 }}>Compare experience quality between identified (logged-in) and anonymous users. Differences may indicate issues with auth flows or personalization overhead.</Text>

      {parsed.length === 0 ? (
        <div className="uj-table-tile" style={{ padding: 24 }}><Text>No cohort data available</Text></div>
      ) : (
        <>
          {/* Cohort cards side by side */}
          <Flex gap={16} flexWrap="wrap">
            {parsed.map((c) => {
              const totalActions = c.sat + c.tol + c.fru;
              return (
                <div key={c.name} className="uj-cohort-card">
                  <Flex alignItems="center" gap={12} style={{ marginBottom: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: c.name === "Identified" ? `${BLUE}22` : `${PURPLE}22`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 18 }}>{c.name === "Identified" ? "👤" : "👥"}</span>
                    </div>
                    <div>
                      <Strong style={{ fontSize: 15 }}>{c.name}</Strong>
                      <Text style={{ display: "block", fontSize: 11, opacity: 0.5 }}>{fmtCount(c.sessions)} sessions</Text>
                    </div>
                    <div style={{ marginLeft: "auto" }}><ApdexGauge score={c.apdex} size={64} label="Apdex" /></div>
                  </Flex>

                  <Flex gap={12} flexWrap="wrap" style={{ marginBottom: 12 }}>
                    <div className="uj-metric-box"><Text className="uj-metric-label">Actions</Text><Strong className="uj-metric-value" style={{ color: BLUE }}>{fmtCount(c.actions)}</Strong></div>
                    <div className="uj-metric-box"><Text className="uj-metric-label">Avg Duration</Text><Strong className="uj-metric-value" style={{ color: c.avg > 3000 ? RED : c.avg > 1000 ? YELLOW : GREEN }}>{fmt(c.avg)}</Strong></div>
                    <div className="uj-metric-box"><Text className="uj-metric-label">P90</Text><Strong className="uj-metric-value" style={{ color: c.p90 > 3000 ? RED : c.p90 > 1500 ? YELLOW : GREEN }}>{fmt(c.p90)}</Strong></div>
                    <div className="uj-metric-box"><Text className="uj-metric-label">Errors</Text><Strong className="uj-metric-value" style={{ color: c.errors > 0 ? RED : GREEN }}>{c.errors}</Strong></div>
                    <div className="uj-metric-box"><Text className="uj-metric-label">Error Rate</Text><Strong className="uj-metric-value" style={{ color: c.errRate > 5 ? RED : c.errRate > 1 ? YELLOW : GREEN }}>{fmtPct(c.errRate)}</Strong></div>
                  </Flex>

                  {/* Satisfaction bar */}
                  <Flex gap={12} alignItems="center">
                    <Text style={{ fontSize: 10, color: GREEN }}>Sat: {c.sat}</Text>
                    <Text style={{ fontSize: 10, color: YELLOW }}>Tol: {c.tol}</Text>
                    <Text style={{ fontSize: 10, color: RED }}>Fru: {c.fru}</Text>
                    <div style={{ flex: 1, height: 6, borderRadius: 3, overflow: "hidden", display: "flex" }}>
                      <div style={{ width: `${totalActions > 0 ? (c.sat / totalActions) * 100 : 0}%`, background: GREEN, height: "100%" }} />
                      <div style={{ width: `${totalActions > 0 ? (c.tol / totalActions) * 100 : 0}%`, background: YELLOW, height: "100%" }} />
                      <div style={{ width: `${totalActions > 0 ? (c.fru / totalActions) * 100 : 0}%`, background: RED, height: "100%" }} />
                    </div>
                  </Flex>
                </div>
              );
            })}
          </Flex>

          {/* Comparison table */}
          <SectionHeader title="Side-by-Side Comparison" />
          <div className="uj-table-tile">
            <DataTable
              sortable
              data={parsed.map((c) => ({
                Cohort: c.name,
                Sessions: c.sessions,
                Actions: c.actions,
                "Avg (ms)": Math.round(c.avg),
                "P90 (ms)": Math.round(c.p90),
                Errors: c.errors,
                "Error Rate": c.errRate,
                Apdex: c.apdex,
              }))}
              columns={[
                { id: "Cohort", header: "Cohort", accessor: "Cohort", cell: ({ value }: any) => <Strong>{value}</Strong> },
                { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
                { id: "Actions", header: "Actions", accessor: "Actions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
                { id: "Avg (ms)", header: "Avg Duration", accessor: "Avg (ms)", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 3000 ? RED : value > 1000 ? YELLOW : undefined }}>{fmt(value)}</Text> },
                { id: "P90 (ms)", header: "P90", accessor: "P90 (ms)", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 3000 ? RED : value > 1500 ? YELLOW : undefined }}>{fmt(value)}</Text> },
                { id: "Errors", header: "Errors", accessor: "Errors", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 0 ? RED : GREEN }}>{value}</Strong> },
                { id: "Error Rate", header: "Error %", accessor: "Error Rate", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 5 ? RED : value > 1 ? YELLOW : GREEN }}>{fmtPct(value)}</Text> },
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
// TAB: Resources (Slowest Resources) — NEW
// ===========================================================================
function ResourcesTab({ data, isLoading }: { data: any; isLoading: boolean }) {
  if (isLoading) return <Loading />;

  const rows = (data.data?.records ?? []) as any[];
  const parsed = rows.map((r: any) => {
    const url = String(r["dt.rum.resource.url"] ?? "Unknown");
    const dur = Number(r.avg_dur ?? 0);
    const size = Number(r.avg_size ?? 0);
    // Extract domain for grouping
    let domain = "unknown";
    try { domain = new URL(url).hostname; } catch { domain = url.split("/")[2] ?? "unknown"; }
    return { url, shortUrl: url.length > 80 ? url.substring(0, 80) + "..." : url, domain, dur, size };
  });

  const maxDur = Math.max(...parsed.map((r) => r.dur), 1);
  const totalResources = parsed.length;
  const avgDur = parsed.length > 0 ? parsed.reduce((a, r) => a + r.dur, 0) / parsed.length : 0;
  const slowCount = parsed.filter((r) => r.dur > 1000).length;

  // Group by domain
  const domainMap = new Map<string, { count: number; avgDur: number; totalSize: number }>();
  parsed.forEach((r) => {
    const d = domainMap.get(r.domain) ?? { count: 0, avgDur: 0, totalSize: 0 };
    d.count++;
    d.avgDur = (d.avgDur * (d.count - 1) + r.dur) / d.count;
    d.totalSize += r.size;
    domainMap.set(r.domain, d);
  });
  const domains = Array.from(domainMap.entries()).map(([domain, d]) => ({ domain, ...d })).sort((a, b) => b.avgDur - a.avgDur);

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      <SectionHeader title="Resource Loading Performance" />
      <Text style={{ fontSize: 12, opacity: 0.5 }}>Slowest third-party and first-party resources. Slow resources contribute to poor LCP and load times.</Text>

      {/* KPI */}
      <Flex gap={16} flexWrap="wrap">
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Tracked Resources</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: BLUE }}>{totalResources}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Avg Load Time</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: avgDur > 1000 ? RED : avgDur > 500 ? YELLOW : GREEN }}>{fmt(avgDur)}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Slow Resources (&gt;1s)</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: slowCount > 5 ? RED : slowCount > 0 ? ORANGE : GREEN }}>{slowCount}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Unique Domains</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: PURPLE }}>{domains.length}</Heading>
        </div>
      </Flex>

      {parsed.length === 0 ? (
        <div className="uj-table-tile" style={{ padding: 24 }}><Text>No resource data available</Text></div>
      ) : (
        <>
          {/* Waterfall-style chart */}
          <SectionHeader title="Slowest Resources (Waterfall)" />
          <div className="uj-table-tile" style={{ padding: 16 }}>
            <Flex flexDirection="column" gap={6}>
              {parsed.slice(0, 15).map((r, i) => {
                const pct = maxDur > 0 ? (r.dur / maxDur) * 100 : 0;
                const color = r.dur > 2000 ? RED : r.dur > 1000 ? ORANGE : r.dur > 500 ? YELLOW : GREEN;
                return (
                  <Flex key={i} alignItems="center" gap={8}>
                    <Text style={{ fontSize: 10, width: 30, textAlign: "right", opacity: 0.4 }}>{i + 1}</Text>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 10, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{r.shortUrl}</Text>
                      <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden", marginTop: 2 }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width 0.4s ease" }} />
                      </div>
                    </div>
                    <Text style={{ fontSize: 11, fontWeight: 700, color, minWidth: 60, textAlign: "right" }}>{fmt(r.dur)}</Text>
                    {r.size > 0 && <Text style={{ fontSize: 10, opacity: 0.4, minWidth: 55, textAlign: "right" }}>{r.size > 1024 * 1024 ? (r.size / (1024 * 1024)).toFixed(1) + " MB" : r.size > 1024 ? (r.size / 1024).toFixed(0) + " KB" : r.size.toFixed(0) + " B"}</Text>}
                  </Flex>
                );
              })}
            </Flex>
          </div>

          {/* By domain */}
          <SectionHeader title="Performance by Domain" />
          <div className="uj-table-tile">
            <DataTable
              sortable
              data={domains.map((d) => ({
                Domain: d.domain,
                Resources: d.count,
                "Avg Duration (ms)": Math.round(d.avgDur),
                "Total Transfer": d.totalSize,
              }))}
              columns={[
                { id: "Domain", header: "Domain", accessor: "Domain", cell: ({ value }: any) => <Strong style={{ color: BLUE }}>{value}</Strong> },
                { id: "Resources", header: "Resources", accessor: "Resources", sortType: "number" as any },
                { id: "Avg Duration (ms)", header: "Avg Load", accessor: "Avg Duration (ms)", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 1000 ? RED : value > 500 ? YELLOW : GREEN }}>{fmt(value)}</Strong> },
                { id: "Total Transfer", header: "Transfer", accessor: "Total Transfer", sortType: "number" as any, cell: ({ value }: any) => <Text>{value > 1024 * 1024 ? (value / (1024 * 1024)).toFixed(1) + " MB" : value > 1024 ? (value / 1024).toFixed(0) + " KB" : value + " B"}</Text> },
              ]}
            />
          </div>

          {/* Full table */}
          <SectionHeader title="All Resources" />
          <div className="uj-table-tile">
            <DataTable
              sortable
              data={parsed.map((r) => ({
                Resource: r.shortUrl,
                Domain: r.domain,
                "Duration (ms)": Math.round(r.dur),
                "Size": r.size,
              }))}
              columns={[
                { id: "Resource", header: "Resource URL", accessor: "Resource" },
                { id: "Domain", header: "Domain", accessor: "Domain", cell: ({ value }: any) => <Text style={{ fontSize: 11, color: BLUE }}>{value}</Text> },
                { id: "Duration (ms)", header: "Load Time", accessor: "Duration (ms)", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 1000 ? RED : value > 500 ? YELLOW : GREEN }}>{fmt(value)}</Strong> },
                { id: "Size", header: "Size", accessor: "Size", sortType: "number" as any, cell: ({ value }: any) => <Text>{value > 1024 * 1024 ? (value / (1024 * 1024)).toFixed(1) + " MB" : value > 1024 ? (value / 1024).toFixed(0) + " KB" : value + " B"}</Text> },
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
function GeoHeatmapTab({ data, isLoading }: { data: any; isLoading: boolean }) {
  if (isLoading) return <Loading />;

  const rows = (data.data?.records ?? []) as any[];

  // Aggregate by country
  const countryMap = new Map<string, { sessions: number; actions: number; avgDur: number; p90: number; errors: number; sat: number; tol: number; fru: number; cities: string[] }>();
  rows.forEach((r: any) => {
    const country = String(r.country ?? "Unknown");
    const city = String(r.city ?? "");
    const d = countryMap.get(country) ?? { sessions: 0, actions: 0, avgDur: 0, p90: 0, errors: 0, sat: 0, tol: 0, fru: 0, cities: [] };
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
                <div key={c.name} className="uj-geo-card" style={{ borderLeftColor: apdexClr(c.apdex) }}>
                  <Flex alignItems="center" justifyContent="space-between" style={{ marginBottom: 6 }}>
                    <Strong style={{ fontSize: 14 }}>{c.name}</Strong>
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
              );
            })}
          </Flex>

          {/* Country table */}
          <SectionHeader title="Full Country Breakdown" />
          <div className="uj-table-tile">
            <DataTable
              sortable
              data={countries.map((c) => ({
                Country: c.name,
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
                { id: "Country", header: "Country", accessor: "Country", cell: ({ value }: any) => <Strong>{value}</Strong> },
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
// TAB: Navigation Paths — NEW
// ===========================================================================
function NavigationPathsTab({ data, isLoading }: { data: any; isLoading: boolean }) {
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
                  <Strong style={{ fontSize: 13 }}>{src.name.length > 60 ? src.name.substring(0, 60) + "..." : src.name}</Strong>
                  <Text style={{ fontSize: 10, opacity: 0.4, marginLeft: "auto" }}>{fmtCount(src.total)} transitions</Text>
                </Flex>
                <Flex flexDirection="column" gap={4} style={{ paddingLeft: 20 }}>
                  {src.targets.slice(0, 5).map((t, ti) => {
                    const pct = src.total > 0 ? (t.count / src.total) * 100 : 0;
                    const isFunnel = FUNNEL_STEPS.some((s) => t.name.includes(s.identifier));
                    const color = isFunnel ? GREEN : CYAN;
                    return (
                      <Flex key={ti} alignItems="center" gap={8}>
                        <span style={{ fontSize: 14, color: "rgba(255,255,255,0.3)" }}>→</span>
                        <div style={{ flex: 1 }}>
                          <Flex alignItems="center" gap={6}>
                            <Text style={{ fontSize: 11 }}>{t.name.length > 50 ? t.name.substring(0, 50) + "..." : t.name}</Text>
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
                To: String(p.step2 ?? "unknown").substring(0, 50),
                Transitions: Number(p.occurrences ?? 0),
                "% of Total": totalTransitions > 0 ? (Number(p.occurrences ?? 0) / totalTransitions) * 100 : 0,
                "Avg Depth": Number(p.avg_depth ?? 0),
              }))}
              columns={[
                { id: "From", header: "From", accessor: "From", cell: ({ value }: any) => <Strong style={{ color: BLUE }}>{value}</Strong> },
                { id: "To", header: "To", accessor: "To", cell: ({ value }: any) => <Text>{value}</Text> },
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
function AnomalyDetectionTab({ quality, qualityPrev, overallApdex, overallApdexPrev, funnelCounts, funnelCountsPrev, stepMap, durationDist, isLoading }: { quality: any; qualityPrev: any; overallApdex: number; overallApdexPrev: number; funnelCounts: number[]; funnelCountsPrev: number[]; stepMap: Map<string, any>; durationDist: any; isLoading: boolean }) {
  if (isLoading) return <Loading />;

  const errorRate = quality.total > 0 ? (quality.errors / quality.total) * 100 : 0;
  const errorRatePrev = qualityPrev.total > 0 ? (qualityPrev.errors / qualityPrev.total) * 100 : 0;
  const overallConv = funnelCounts[0] > 0 ? (funnelCounts[3] / funnelCounts[0]) * 100 : 0;
  const overallConvPrev = funnelCountsPrev[0] > 0 ? (funnelCountsPrev[3] / funnelCountsPrev[0]) * 100 : 0;
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
  const stepAnomalies = FUNNEL_STEPS.map((step, i) => {
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
            Sessions: funnelCounts[FUNNEL_STEPS.findIndex((f) => f.label === s.step)],
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
      <SectionHeader title="Full Device × Browser Breakdown" />
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
function ExecutiveSummaryTab({ quality, qualityPrev, overallApdex, overallApdexPrev, overallConv, overallConvPrev, funnelCounts, funnelCountsPrev, cwv: cwvMetrics, stepMap, isLoading }: { quality: any; qualityPrev: any; overallApdex: number; overallApdexPrev: number; overallConv: number; overallConvPrev: number; funnelCounts: number[]; funnelCountsPrev: number[]; cwv: { lcp: number; cls: number; inp: number; ttfb: number; load: number }; stepMap: Map<string, any>; isLoading: boolean }) {
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
  const worstStep = FUNNEL_STEPS.slice(1).map((step, i) => {
    const prev = funnelCounts[i]; const curr = funnelCounts[i + 1];
    return { from: FUNNEL_STEPS[i].label, to: step.label, dropOff: prev > 0 ? ((prev - curr) / prev) * 100 : 0 };
  }).sort((a, b) => b.dropOff - a.dropOff)[0];

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
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
          {FUNNEL_STEPS.map((step, i) => (
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
              {i < FUNNEL_STEPS.length - 1 && <span style={{ fontSize: 16, opacity: 0.3 }}>→</span>}
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
        <Text style={{ fontSize: 10, opacity: 0.3 }}>Report generated: {new Date().toLocaleString()} | Frontend: {FRONTEND}</Text>
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
function ErrorsTab({ errors, funnelCounts, isLoading }: { errors: any[]; funnelCounts: number[]; isLoading: boolean }) {
  if (isLoading) return <Loading />;

  const dropOffs = FUNNEL_STEPS.slice(1).map((step, i) => {
    const prev = funnelCounts[i]; const curr = funnelCounts[i + 1];
    return { from: FUNNEL_STEPS[i].label, to: step.label, lost: prev - curr, pctLost: prev > 0 ? ((prev - curr) / prev) * 100 : 0 };
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
function WhatIfTab({ funnelCounts, stepMap, overallApdex, isLoading }: { funnelCounts: number[]; stepMap: Map<string, any>; overallApdex: number; isLoading: boolean }) {
  const [mult, setMult] = useState(2);
  if (isLoading) return <Loading />;

  const latFactor = 1 + Math.log2(mult) * 0.5;
  const errFactor = 1 + Math.log2(mult) * 0.15;
  const convDegradation = Math.log2(mult) * 0.08;
  const projApdex = Math.max(0, overallApdex - Math.log2(mult) * 0.08);
  const projConv = funnelCounts[0] > 0 ? Math.max(0, (funnelCounts[3] / funnelCounts[0]) * 100 * (1 - convDegradation)) : 0;
  const projFunnel = funnelCounts.map((c, i) => i === 0 ? Math.round(c * mult) : Math.round(c * mult * Math.pow(1 - convDegradation, i)));

  const projSteps: FunnelStep[] = FUNNEL_STEPS.map((step, i) => ({
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
        <div className={`uj-impact-card ${projConv < (funnelCounts[3] / Math.max(1, funnelCounts[0])) * 100 ? "uj-impact-negative" : "uj-impact-positive"}`}>
          <Text className="uj-metric-label">Conversion Impact</Text>
          <Strong style={{ color: RED, fontSize: 16 }}>{fmtPct((funnelCounts[3] / Math.max(1, funnelCounts[0])) * 100)} → {fmtPct(projConv)}</Strong>
        </div>
      </Flex>

      <SectionHeader title="Projected Funnel" />
      <div className="uj-funnel-container"><FunnelChart steps={projSteps} /></div>

      <SectionHeader title="Projected Metrics by Step" />
      <div className="uj-table-tile">
        <DataTable
          data={FUNNEL_STEPS.map((step, i) => {
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
