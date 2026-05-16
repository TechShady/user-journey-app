import React, { useState, useMemo, useEffect, useRef } from "react";
import { useDql, useUserAppState, useSetUserAppState } from "@dynatrace-sdk/react-hooks";
import { getEnvironmentUrl } from "@dynatrace-sdk/app-environment";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text, Strong, Paragraph, Link } from "@dynatrace/strato-components/typography";
import { Tabs, Tab } from "@dynatrace/strato-components-preview/navigation";
import { Select, TextInput } from "@dynatrace/strato-components-preview/forms";
import { TimeframeSelector } from "@dynatrace/strato-components/filters";
import type { Timeframe } from "@dynatrace/strato-components/core";
import { ProgressBar } from "@dynatrace/strato-components/content";
import { Button } from "@dynatrace/strato-components/buttons";
import { Sheet } from "@dynatrace/strato-components/overlays";
import { Switch } from "@dynatrace/strato-components/forms";
import { MaximizeIcon, MinimizeIcon } from "@dynatrace/strato-icons";
import { TimeseriesChart, TimeseriesAnnotations } from "@dynatrace/strato-components/charts";
import type { Timeseries } from "@dynatrace/strato-components/charts";
import { DataTable } from "@dynatrace/strato-components-preview/tables";
import "./UserJourney.css";
import { useSettings, DEFAULT_FRONTEND, DEFAULT_FUNNEL_STEPS, MIN_STEPS, MAX_STEPS, DEFAULT_AOV } from "../SettingsContext";
import type { StepDef } from "../SettingsContext";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SANKEY_STYLE_STATE_KEY = "uj-sankey-style";
const MAP_VIEW_STATE_KEY = "uj-map-view";
type SankeyStyle = "classic" | "gradient" | "directed" | "alluvial" | "stateMachine" | "chord" | "heatmap";
const SANKEY_STYLE_OPTIONS: { value: SankeyStyle; label: string }[] = [
  { value: "classic", label: "Classic Sankey" },
  { value: "gradient", label: "Gradient Sankey" },
  { value: "directed", label: "Directed Flow Graph" },
  { value: "alluvial", label: "Alluvial / Columnar" },
  { value: "stateMachine", label: "State Machine" },
  { value: "chord", label: "Chord Diagram" },
  { value: "heatmap", label: "Transition Heatmap" },
];
const DEFAULT_SANKEY_STYLE: SankeyStyle = "classic";
type FunnelStyle = "classic" | "horizontal" | "cohort" | "elapsed" | "split";
const FUNNEL_STYLE_OPTIONS: { value: FunnelStyle; label: string }[] = [
  { value: "classic", label: "Classic Funnel" },
  { value: "horizontal", label: "Horizontal Bar" },
  { value: "cohort", label: "Stacked Cohort" },
  { value: "elapsed", label: "Elapsed-Time Curve" },
  { value: "split", label: "Comparison Split" },
];
const DEFAULT_FUNNEL_STYLE: FunnelStyle = "classic";
const FUNNEL_STYLE_STATE_KEY = "uj-funnel-style";
type MapViewSetting = "world" | "us";
const MAP_VIEW_OPTIONS: { value: MapViewSetting; label: string }[] = [
  { value: "world", label: "World" },
  { value: "us", label: "United States" },
];
const DEFAULT_MAP_VIEW: MapViewSetting = "world";
const GREEN = "#0D9C29";
const YELLOW = "#B8860B";
const RED = "#C21930";
const BLUE = "#4589FF";
const PURPLE = "#A56EFF";
const CYAN = "#08BDBA";
const ORANGE = "#FF832B";

let ENV_URL = "";
try { ENV_URL = getEnvironmentUrl(); } catch { /* dev fallback */ }



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
const TRAFFIC_MULTIPLIERS = [0, 1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 125, 150, 175, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000, 2000, 3000, 4000, 5000];const TRAFFIC_TICK_LABELS = new Set([0, 10, 50, 100, 200, 500, 1000, 2000, 5000]);const APDEX_T = 3000;
const APDEX_4T = 12000;

const TAB_KEYS = [
  "Funnel Overview", "Trends", "Web Vitals", "Step Details", "Worst Sessions",
  "Exceptions", "Click Issues", "Perf Budgets",
  "Geo Heatmap", "Map", "Navigation Paths", "Sankey", "Anomaly Detection",
  "Conversion Attribution", "Executive Summary", "Segmentation",
  "Errors & Drop-offs", "What-If Analysis", "Root Cause Correlation", "Predictive Forecasting",
  "Resource Waterfall", "Change Intelligence",
  "SLO Tracker", "Session Replay Spotlight", "A/B Comparison",
  "Revenue Intelligence", "Cohort Retention", "Session Engagement",
  "Third-Party Impact", "Error Clustering",
] as const;
type TabKey = typeof TAB_KEYS[number];
const DEFAULT_TAB_VISIBILITY: Record<TabKey, boolean> = Object.fromEntries(TAB_KEYS.map(k => [k, true])) as Record<TabKey, boolean>;
const TAB_STATE_KEY = "uj-tab-visibility";
const TAB_ORDER_STATE_KEY = "uj-tab-order";
const BUDGET_THRESHOLDS_STATE_KEY = "uj-budget-thresholds";
const SLO_TARGETS_STATE_KEY = "uj-slo-targets";
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
// When the TimeframeSelector arrow buttons shift the window into the past
// (e.g. `now-4h..now-2h`), we need queries to actually look at that shifted
// window — not always at `now()`. We track the current end anchor (epoch ms)
// at module scope so `periodClause` can emit absolute ISO timestamps, and so
// query strings change when the user shifts the window (driving useDql refetch).
let CURRENT_ANCHOR_MS: number | null = null;
let CURRENT_TIMEFRAME_DAYS: number = 0.083;
export function setQueryAnchorMs(ms: number | null) { CURRENT_ANCHOR_MS = ms; }
export function setCurrentTimeframeDays(d: number) { CURRENT_TIMEFRAME_DAYS = d; }

function toIso(ms: number): string { return new Date(ms).toISOString(); }

function periodClause(days: number, prev = false): string {
  // Anchored mode: emit absolute from/to so a shifted window queries the
  // shifted data window, not always now(). Bake the anchor into the string
  // so any change re-keys the query.
  if (CURRENT_ANCHOR_MS != null) {
    const durMs = Math.max(1, days) * 86400000;
    const to = prev ? CURRENT_ANCHOR_MS - durMs : CURRENT_ANCHOR_MS;
    const from = to - durMs;
    return `from: "${toIso(from)}", to: "${toIso(to)}"`;
  }
  if (days < 1) {
    const h = Math.max(1, Math.round(days * 24));
    return prev ? `from: now() - ${h * 2}h, to: now() - ${h}h` : `from: now() - ${h}h`;
  }
  const d = Math.max(1, Math.round(days));
  return prev ? `from: now() - ${d * 2}d, to: now() - ${d}d` : `from: now() - ${d}d`;
}

// Convert a Strato Timeframe selection to a "days" duration used by the query
// helpers. Absolute windows are treated as a duration anchored at now() so the
// existing `now()-Xd` query patterns and previous-period comparison logic
// continue to work unchanged.
function timeframeToDays(tf: Timeframe | null): number | null {
  if (!tf?.from?.absoluteDate || !tf?.to?.absoluteDate) return null;
  const fromMs = Date.parse(tf.from.absoluteDate);
  const toMs = Date.parse(tf.to.absoluteDate);
  if (!isFinite(fromMs) || !isFinite(toMs) || toMs <= fromMs) return null;
  return (toMs - fromMs) / 86400000;
}

// Returns the end anchor (epoch ms) for an absolute timeframe, or null when
// the user has selected a "now-relative" window (we treat that as live).
function timeframeAnchorMs(tf: Timeframe | null): number | null {
  if (!tf?.to?.absoluteDate) return null;
  const toMs = Date.parse(tf.to.absoluteDate);
  if (!isFinite(toMs)) return null;
  // If the end is essentially "now" (within 60s), treat as live → no anchor.
  if (Math.abs(Date.now() - toMs) < 60_000) return null;
  return toMs;
}
function fmt(v: number | undefined): string { if (v == null || isNaN(v)) return "N/A"; return v >= 1000 ? (v / 1000).toFixed(2) + " s" : v.toFixed(0) + " ms"; }
function fmtCount(v: number | undefined): string { if (v == null) return "0"; if (v >= 1e6) return (v / 1e6).toFixed(1) + "M"; if (v >= 1e3) return (v / 1e3).toFixed(1) + "k"; return Math.round(v).toLocaleString(); }
function fmtPct(v: number | undefined): string { return (v == null || isNaN(v)) ? "0.0%" : v.toFixed(1) + "%"; }
function fmtCurrency(v: number | undefined): string { if (v == null || isNaN(v)) return "$0.00"; if (Math.abs(v) >= 1e6) return (v < 0 ? "-" : "") + "$" + (Math.abs(v) / 1e6).toFixed(2) + "M"; if (Math.abs(v) >= 1e3) return (v < 0 ? "-" : "") + "$" + (Math.abs(v) / 1e3).toFixed(1) + "k"; return (v < 0 ? "-$" : "$") + Math.abs(v).toFixed(2); }
function formatHourKey(d: Date): string { return d.toISOString().substring(0, 13).replace("T", " ") + ":00"; }
function statusClr(pct: number): string { return pct >= 80 ? GREEN : pct >= 50 ? YELLOW : RED; }
function apdexClr(a: number): string { return a >= 0.85 ? GREEN : a >= 0.7 ? YELLOW : a >= 0.5 ? ORANGE : RED; }
function apdexLabel(a: number): string { return a >= 0.85 ? "Excellent" : a >= 0.7 ? "Good" : a >= 0.5 ? "Fair" : "Poor"; }
function cwvClr(val: number, metric: keyof typeof CWV): string { return val <= CWV[metric].good ? GREEN : val <= CWV[metric].poor ? YELLOW : RED; }
function cwvLabel(val: number, metric: keyof typeof CWV): string { return val <= CWV[metric].good ? "Good" : val <= CWV[metric].poor ? "Needs Improvement" : "Poor"; }
function calcApdex(sat: number, tol: number, total: number): number { return total > 0 ? (sat + tol / 2) / total : 0; }

// Normal CDF approximation (for statistical significance testing)
function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.8212560 + t * 1.3302744))));
  return x > 0 ? 1 - p : p;
}
function formatTimeAgo(ts: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

function identifierFilter(id: string, type: "view" | "request"): string {
  const field = type === "view" ? "view.name" : "url.path";
  const startsW = id.startsWith("*");
  const endsW = id.endsWith("*");
  // Mid-string wildcard: /easytravel/journeys/*/book → startsWith + endsWith
  const midIdx = id.indexOf("*", 1);
  if (!startsW && !endsW && midIdx > 0) {
    const parts = id.split("*");
    if (parts.length === 2) return `(startsWith(${field}, "${parts[0]}") and endsWith(${field}, "${parts[1]}"))`;
    // Multiple mid-wildcards: chain contains for inner parts
    const conds = [`startsWith(${field}, "${parts[0]}")`, `endsWith(${field}, "${parts[parts.length - 1]}")`];
    for (let i = 1; i < parts.length - 1; i++) conds.push(`contains(${field}, "${parts[i]}")`);
    return `(${conds.join(" and ")})`;
  }
  if (startsW && endsW && id.length > 2) return `contains(${field}, "${id.slice(1, -1)}")`;
  if (endsW) return `startsWith(${field}, "${id.slice(0, -1)}")`;
  if (startsW) return `endsWith(${field}, "${id.slice(1)}")`;
  return `${field} == "${id}"`;
}
function stepFilter(s: StepDef): string {
  const filters = s.identifiers.map(id => identifierFilter(id, s.type));
  return filters.length === 1 ? filters[0] : `(${filters.join(" or ")})`;
}
function anyStepFilter(steps: StepDef[]): string { return steps.map(stepFilter).join(" or "); }
function stepTagExpr(steps: StepDef[], labels: string[]): string {
  return `coalesce(\n    ${steps.map((s, i) => `if(${stepFilter(s)}, "${labels[i]}")`).join(",\n    ")},\n    "other")`;
}
// Dynatrace view-group placeholders treated as dynamic (no Vitals link)
const DT_PLACEHOLDER_RE = /:[a-zA-Z_]+:/;
function isWildcard(id: string): boolean { return id.includes("*") || DT_PLACEHOLDER_RE.test(id); }
function stepPrimaryIdentifier(s: StepDef): string | null {
  return s.identifiers.find(id => !isWildcard(id)) ?? null;
}
function identifierMatchesLabel(id: string, label: string): boolean {
  // Dynatrace placeholder tokens (:id:, :hash:, etc.) — treat as single-segment wildcard
  if (DT_PLACEHOLDER_RE.test(id)) {
    const regex = new RegExp("^" + id.replace(/:[a-zA-Z_]+:/g, "[^/]+") + "$");
    return regex.test(label);
  }
  const startsW = id.startsWith("*");
  const endsW = id.endsWith("*");
  // Mid-string wildcard: /a/*/b → startsWith("a/") && endsWith("/b")
  const midIdx = id.indexOf("*", 1);
  if (!startsW && !endsW && midIdx > 0) {
    const parts = id.split("*");
    if (!label.startsWith(parts[0]) || !label.endsWith(parts[parts.length - 1])) return false;
    // Verify all inner parts exist in order
    let pos = parts[0].length;
    for (let i = 1; i < parts.length - 1; i++) {
      const found = label.indexOf(parts[i], pos);
      if (found === -1) return false;
      pos = found + parts[i].length;
    }
    return true;
  }
  if (startsW && endsW && id.length > 2) return label.includes(id.slice(1, -1));
  if (endsW) return label.startsWith(id.slice(0, -1));
  if (startsW) return label.endsWith(id.slice(1));
  return label === id;
}

/** Build the Dynatrace `tf=` query-string value from the app's current
 *  timeframe so drilldown links open with the same window the user selected. */
function tfParam(): string {
  const days = CURRENT_TIMEFRAME_DAYS;
  const anchor = CURRENT_ANCHOR_MS;
  if (anchor != null) {
    const durMs = Math.max(1, days) * 86400000;
    const fromIso = new Date(anchor - durMs).toISOString();
    const toIso = new Date(anchor).toISOString();
    return encodeURIComponent(`${fromIso};${toIso}`);
  }
  if (days < 1) {
    const h = Math.max(1, Math.round(days * 24));
    return encodeURIComponent(`now-${h}h;now`);
  }
  const d = Math.max(1, Math.round(days));
  return encodeURIComponent(`now-${d}d;now`);
}

function sessionReplayUrl(sessionId: string, startTs?: string): string {
  return `${ENV_URL}/ui/apps/dynatrace.users.sessions/session-viewer/${sessionId}/${startTs ?? ''}?tf=now-2h%3Bnow&df=1&perspective=general&sort=navigationCount%3Adescending`;
}

function appEntityQuery(frontend: string): string {
  return `fetch dt.entity.application
| filter entity.name == "${frontend}"
| fieldsKeep id
| limit 1`;
}

function availableAppsQuery(): string {
  return `fetch user.events, from: now()-30d
| filter isNotNull(frontend.name)
| summarize count = count(), by: {frontend.name}
| sort count desc
| limit 100
| fieldsRemove count`;
}

function availablePagesQuery(frontend: string): string {
  return `fetch user.events, from: now()-7d
| filter frontend.name == "${frontend}" and isNotNull(view.name) and view.name != ""
| summarize count = count(), by: {view.name}
| sort count desc
| limit 300
| fieldsRemove count`;
}

function vitalsUrl(appEntityId: string, pageName: string): string {
  const encoded = btoa(pageName);
  return `${ENV_URL}/ui/apps/dynatrace.experience.vitals/performance/web/${encodeURIComponent(appEntityId)}/pages/${encodeURIComponent(encoded)}?tf=${tfParam()}`;
}

function errorInspectorUrl(errorId: string, frontend: string): string {
  const filter = encodeURIComponent(`"Frontend" = "${frontend}" "Error Type" = "Exception"`);
  return `${ENV_URL}/ui/apps/dynatrace.error.inspector/explorer?tf=${tfParam()}&sort=affected_users%3Adescending&perspective=impact&detailsId=${encodeURIComponent(errorId)}&sidebarOpen=true#filtering=${filter}`;
}

function sessionsFilterUrl(frontend: string, locationName?: string): string {
  let filter = `Frontends = ${frontend}`;
  if (locationName) filter += ` Location = "${locationName}"`;
  return `${ENV_URL}/ui/apps/dynatrace.users.sessions/sessions/sessions?tf=${tfParam()}&perspective=general#filtering=${encodeURIComponent(filter)}`;
}

/** Open a URL in a new tab. Uses window.open() so that Mac browsers (which block
 *  target="_blank" inside sandboxed iframes) treat it as a direct user gesture. */
function openLink(url: string, e?: React.MouseEvent) {
  if (e) e.preventDefault();
  window.open(url, '_blank', 'noopener,noreferrer');
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
  return <span style={{ fontSize: 13, color, fontWeight: 600 }}>{arrow} {Math.abs(pct).toFixed(1)}%{suffix}</span>;
}

// Polished chart card with maximize/minimize
function ChartTile({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  const [maximized, setMaximized] = useState(false);
  return (
    <>
      {maximized && (
        <div className="uj-chart-overlay" onClick={() => setMaximized(false)}>
          <div className="uj-chart-maximized" onClick={(e) => e.stopPropagation()}>
            <div className="uj-chart-title-row">
              <div className="uj-chart-title">{title}</div>
              <button className="uj-chart-toggle" onClick={() => setMaximized(false)}><MinimizeIcon /></button>
            </div>
            {description && <div className="uj-chart-description">{description}</div>}
            <div className="uj-chart-body">{children}</div>
          </div>
        </div>
      )}
      <div className="uj-chart-tile">
        <div className="uj-chart-title-row">
          <div className="uj-chart-title">{title}</div>
          <button className="uj-chart-toggle" onClick={() => setMaximized(true)}><MaximizeIcon /></button>
        </div>
        {description && <div className="uj-chart-description">{description}</div>}
        <div className="uj-chart-body">{children}</div>
      </div>
    </>
  );
}

// Build Timeseries[] from computed arrays for TimeseriesChart
function buildTimeseries(
  name: string,
  points: { time: Date; value: number }[],
  unit?: string
): Timeseries {
  const interval = points.length > 1 ? Math.abs(points[1].time.getTime() - points[0].time.getTime()) : 60000;
  return {
    name: [name],
    ...(unit ? { unit } : {}),
    datapoints: points.map((p, i) => ({
      start: p.time,
      end: i < points.length - 1 ? points[i + 1].time : new Date(p.time.getTime() + interval),
      value: p.value,
    })),
  } as Timeseries;
}

// ---------------------------------------------------------------------------
// DQL Queries
// ---------------------------------------------------------------------------
function sessionFlowQuery(days: number, frontend: string, steps: StepDef[], prev = false, nonce = 0): string {
  const period = periodClause(days, prev);
  const tagExpr = stepTagExpr(steps, steps.map((_, i) => `step${i + 1}`));
  const iAnyLines = steps.map((_, i) => `    reached_step${i + 1} = iAny(steps[] == "step${i + 1}")`).join(",\n");
  const countLines = steps.map((_, i) => {
    const conds = Array.from({ length: i + 1 }, (__, j) => `reached_step${j + 1} == true`).join(" and ");
    return `    at_step${i + 1} = countIf(${conds})`;
  }).join(",\n");
  return `// ${nonce}
fetch user.events, ${period}
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

function stepMetricsQuery(days: number, frontend: string, steps: StepDef[], nonce = 0): string {
  const period = periodClause(days);
  const tagExpr = stepTagExpr(steps, steps.map((s) => s.label));
  return `// ${nonce}
fetch user.events, ${period}
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

/** Per-page metrics — breaks down each page (view.name) individually for multi-page steps */
function pageMetricsQuery(days: number, frontend: string, steps: StepDef[], nonce = 0): string {
  const period = periodClause(days);
  const field = steps[0]?.type === "view" ? "view.name" : "url.path";
  return `// ${nonce}
fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter ${anyStepFilter(steps)}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
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
    by: {${field}}`;
}

function cwvQuery(days: number, frontend: string): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter characteristics.has_page_summary == true
| fieldsAdd
    lcp_ms = toDouble(web_vitals.largest_contentful_paint) / 1000000.0,
    cls_val = toDouble(web_vitals.cumulative_layout_shift),
    inp_ms = toDouble(web_vitals.interaction_to_next_paint) / 1000000.0,
    ttfb_ms = toDouble(web_vitals.time_to_first_byte) / 1000000.0,
    load_ms = toDouble(web_vitals.first_contentful_paint) / 1000000.0
| summarize
    lcp_avg = avg(lcp_ms),
    cls_avg = avg(cls_val),
    inp_avg = avg(inp_ms),
    ttfb_avg = avg(ttfb_ms),
    load_avg = avg(load_ms)`;
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
    inp_ms = toDouble(web_vitals.interaction_to_next_paint) / 1000000.0,
    ttfb_ms = toDouble(web_vitals.time_to_first_byte) / 1000000.0,
    fcp_ms = toDouble(web_vitals.first_contentful_paint) / 1000000.0
| summarize
    lcp_avg = avg(lcp_ms),
    cls_avg = avg(cls_val),
    inp_avg = avg(inp_ms),
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

function trendsSparklineQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days, false);
  const binSize = days < 1 ? '1h' : days <= 3 ? '6h' : '1d';
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter ${anyStepFilter(steps)}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd slot_day = bin(start_time, ${binSize})
| summarize
    total = count(),
    sessions = countDistinct(dt.rum.session.id),
    avg_dur = avg(dur_ms),
    p50_dur = percentile(dur_ms, 50),
    p90_dur = percentile(dur_ms, 90),
    errors = countIf(characteristics.has_error == true),
    satisfied = countIf(dur_ms <= ${APDEX_T}.0),
    tolerating = countIf(dur_ms > ${APDEX_T}.0 and dur_ms <= ${APDEX_4T}.0),
    frustrated = countIf(dur_ms > ${APDEX_4T}.0),
    by: {slot_day}
| sort slot_day asc`;
}

function trendsConvSparklineQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days, false);
  const binSize = days < 1 ? '1h' : days <= 3 ? '6h' : '1d';
  const tagExpr = stepTagExpr(steps, steps.map((_, i) => `step${i + 1}`));
  const iAnyLines = steps.map((_, i) => `    reached_step${i + 1} = iAny(steps[] == "step${i + 1}")`).join(',\n');
  const convertedConds = steps.map((_, i) => `reached_step${i + 1} == true`).join(' and ');
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter ${anyStepFilter(steps)}
| fieldsAdd step_tag = ${tagExpr}
| fieldsAdd slot_day = bin(start_time, ${binSize})
| summarize
    steps = collectDistinct(step_tag),
    by: {dt.rum.session.id, slot_day}
| fieldsAdd
${iAnyLines}
| fieldsAdd converted = if(${convertedConds}, true, else: false)
| summarize
    total_sessions = count(),
    converted_sessions = countIf(converted == true),
    by: {slot_day}
| fieldsAdd conv_rate = if(total_sessions > 0, toDouble(converted_sessions) / toDouble(total_sessions) * 100.0, else: 0.0)
| sort slot_day asc`;
}

function sessionQualityQuery(days: number, frontend: string, steps: StepDef[], prev = false, nonce = 0): string {
  const period = periodClause(days, prev);
  return `// ${nonce}
fetch user.events, ${period}
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

// Hourly funnel conversion for today — used by predictive EOD model
function todayFunnelHourlyQuery(frontend: string, steps: StepDef[], nonce = 0): string {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const tagExpr = stepTagExpr(steps, steps.map((_, i) => `step${i + 1}`));
  const iAnyLines = steps.map((_, i) => `    reached_step${i + 1} = iAny(steps[] == "step${i + 1}")`).join(",\n");
  const convertedConds = steps.map((_, i) => `reached_step${i + 1} == true`).join(" and ");
  return `// ${nonce}
fetch user.events, from: "${todayStart}", to: now()
| filter frontend.name == "${frontend}"
| filter ${anyStepFilter(steps)}
| fieldsAdd step_tag = ${tagExpr}
| fieldsAdd slot_ts = bin(start_time, 15m)
| summarize
    steps = collectDistinct(step_tag),
    by: {dt.rum.session.id, slot_ts}
| fieldsAdd
${iAnyLines}
| fieldsAdd converted = if(${convertedConds}, true, else: false)
| summarize
    total_sessions = count(),
    converted_sessions = countIf(converted == true),
    by: {slot_ts}
| fieldsAdd conv_rate = if(total_sessions > 0, toDouble(converted_sessions) / toDouble(total_sessions) * 100.0, else: 0.0)
| sort slot_ts asc`;
}

// NEW: Worst Sessions query
function worstSessionsQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter ${anyStepFilter(steps)}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd satisfaction = coalesce(if(dur_ms <= ${APDEX_T}.0, "satisfied"), if(dur_ms <= ${APDEX_4T}.0, "tolerating"), "frustrated")
| fieldsAdd pageName = coalesce(view.name, url.path, "unknown")
| fieldsAdd errName = if(characteristics.has_error == true, coalesce(error.display_name, error.type, "error"), else: "")
| summarize
    actions = count(),
    avg_dur = avg(dur_ms),
    max_dur = max(dur_ms),
    p90_dur = percentile(dur_ms, 90),
    errors = countIf(characteristics.has_error == true),
    frustrated = countIf(satisfaction == "frustrated"),
    satisfied = countIf(satisfaction == "satisfied"),
    tolerating = countIf(satisfaction == "tolerating"),
    start_ts = min(start_time),
    pages = collectDistinct(pageName),
    error_types = collectDistinct(errName),
    by: {dt.rum.session.id}
| sort frustrated desc, errors desc, max_dur desc
| limit 50`;
}

// Exceptions query
function jsErrorsQuery(days: number, frontend: string, prev = false): string {
  const period = periodClause(days, prev);
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
| fieldsAdd stackLocation = coalesce(error.stack_trace, "")
| summarize
    occurrences = count(),
    affected_users = countDistinct(dt.rum.instance.id),
    affected_sessions = countDistinct(dt.rum.session.id),
    first_seen = min(start_time),
    last_seen = max(start_time),
    pages = collectDistinct(pageName),
    sample_stack = takeFirst(stackLocation),
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

// NEW: Sankey CWV per page — web vitals health for funnel exit analysis
function sankeyCwvPerPageQuery(days: number, frontend: string): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter characteristics.has_page_summary == true
| fieldsAdd pageName = coalesce(view.name, page.name, url.path, "unknown")
| fieldsAdd
    lcp_ms = toDouble(web_vitals.largest_contentful_paint) / 1000000.0,
    cls_val = toDouble(web_vitals.cumulative_layout_shift),
    inp_ms = toDouble(web_vitals.interaction_to_next_paint) / 1000000.0
| summarize
    lcp = avg(lcp_ms),
    cls = avg(cls_val),
    inp = avg(inp_ms),
    pageViews = count(),
    by: {pageName}
| sort pageViews desc
| limit 50`;
}

// NEW: Sankey errors per page — error counts for exit correlation
function sankeyErrorsPerPageQuery(days: number, frontend: string): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter characteristics.has_error == true
| fieldsAdd pageName = coalesce(view.name, page.name, url.path, "unknown")
| summarize
    errorCount = count(),
    errorSessions = countDistinct(dt.rum.session.id),
    by: {pageName}
| sort errorCount desc
| limit 50`;
}

// NEW: Sankey extended paths — full session paths for return analysis
function sankeyExtendedPathsQuery(days: number, frontend: string): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter characteristics.has_navigation == true OR characteristics.has_page_summary == true
| fieldsAdd pageName = coalesce(view.name, page.name, url.path, "unknown")
| sort timestamp asc
| summarize path = collectArray(pageName), by: {dt.rum.session.id}
| fieldsAdd pathLen = arraySize(path)
| filter pathLen >= 2
| limit 500`;
}

// NEW: Sankey avg duration per page — for Page Timing sub-tab
function sankeyPageDurationQuery(days: number, frontend: string): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter characteristics.has_navigation == true OR characteristics.has_page_summary == true
| fieldsAdd pageName = coalesce(view.name, page.name, url.path, "unknown")
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| summarize
    avgDuration = avg(dur_ms),
    p90Duration = percentile(dur_ms, 90),
    sessions = count(),
    by: {pageName}
| sort sessions desc
| limit 50`;
}

// NEW: Sankey previous-period paths — for Path Trends sub-tab
function sankeyPrevPathsQuery(days: number, frontend: string): string {
  const period = periodClause(days, true);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter characteristics.has_navigation == true OR characteristics.has_page_summary == true
| fieldsAdd pageName = coalesce(view.name, page.name, url.path, "unknown")
| sort timestamp asc
| summarize path = collectArray(pageName), by: {dt.rum.session.id}
| fieldsAdd pathLen = arraySize(path)
| filter pathLen >= 2
| limit 500`;
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
    const allConds = s.identifiers.map(id => {
      const seg = id.replace(/\*/g, "").split("/").filter(Boolean).pop() || "";
      const segLower = seg.toLowerCase();
      if (s.type === "view") {
        return `page.url.path == "${id}" or contains(lower(coalesce(page.url.path, "")), "${segLower}") or contains(lower(coalesce(url.path, "")), "${segLower}")`;
      }
      return `contains(lower(coalesce(page.url.path, "")), "${segLower}") or contains(lower(coalesce(url.path, "")), "${segLower}")`;
    });
    return `if(${allConds.join(" or ")}, "${s.label}")`;
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

function resourceSessionDrillQuery(days: number, frontend: string, steps: StepDef[]): string {
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
| fieldsAdd sid = dt.rum.session.id
| sort res_dur_ms desc
| limit 50
| fields sid, res_name, res_type, res_dur_ms, step_tag, timestamp, start_time`;
}


// NEW: Geo Network/Carrier Performance Query
function geoNetworkQuery(days: number, frontend: string): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd satisfaction = coalesce(if(dur_ms <= ${APDEX_T}.0, "satisfied"), if(dur_ms <= ${APDEX_4T}.0, "tolerating"), "frustrated")
| fieldsAdd net_type = coalesce(connection.type, "unknown")
| fieldsAdd carrier_name = coalesce(connection.carrier, "unknown")
| fieldsAdd country = geo.country.iso_code
| summarize
    actions = count(),
    sessions = countDistinct(dt.rum.session.id),
    avg_dur = avg(dur_ms),
    errors = countIf(characteristics.has_error == true),
    satisfied = countIf(satisfaction == "satisfied"),
    tolerating = countIf(satisfaction == "tolerating"),
    frustrated = countIf(satisfaction == "frustrated"),
    by: {net_type, carrier_name, country}
| sort actions desc
| limit 100`;
}

// NEW: Geo Conversion Rate Query
function geoConversionQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  const firstStep = steps[0]?.identifiers?.map(id => `view.name == "${id}"`).join(" or ") ?? "true";
  const lastStep = steps[steps.length - 1]?.identifiers?.map(id => `view.name == "${id}"`).join(" or ") ?? "true";
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| fieldsAdd country = geo.country.iso_code
| fieldsAdd is_entry = ${firstStep}
| fieldsAdd is_conv = ${lastStep}
| summarize
    total_sessions = countDistinct(dt.rum.session.id),
    entry_sessions = countDistinctIf(dt.rum.session.id, is_entry == true),
    conv_sessions = countDistinctIf(dt.rum.session.id, is_conv == true),
    by: {country}
| fieldsAdd conv_rate = if(entry_sessions > 0, toDouble(conv_sessions) / toDouble(entry_sessions) * 100.0, else: 0.0)
| sort total_sessions desc
| limit 50`;
}

// NEW: Hourly Map Timelapse Query
function mapTimelapseQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter ${anyStepFilter(steps)}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd satisfaction = coalesce(if(dur_ms <= ${APDEX_T}.0, "satisfied"), if(dur_ms <= ${APDEX_4T}.0, "tolerating"), "frustrated")
| fieldsAdd country = geo.country.iso_code
| fieldsAdd hour_bucket = bin(timestamp, 1h)
| summarize
    actions = count(),
    sessions = countDistinct(dt.rum.session.id),
    avg_dur = avg(dur_ms),
    satisfied = countIf(satisfaction == "satisfied"),
    tolerating = countIf(satisfaction == "tolerating"),
    frustrated = countIf(satisfaction == "frustrated"),
    errors = countIf(characteristics.has_error == true),
    by: {country, hour_bucket}
| sort hour_bucket asc
| limit 2000`;
}

// NEW: OS Version Segmentation Query
function osVersionQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter ${anyStepFilter(steps)}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd satisfaction = coalesce(if(dur_ms <= ${APDEX_T}.0, "satisfied"), if(dur_ms <= ${APDEX_4T}.0, "tolerating"), "frustrated")
| fieldsAdd os_name = coalesce(os.name, "Unknown")
| fieldsAdd os_ver = coalesce(os.version, "Unknown")
| summarize
    actions = count(),
    sessions = countDistinct(dt.rum.session.id),
    avg_dur = avg(dur_ms),
    errors = countIf(characteristics.has_error == true),
    satisfied = countIf(satisfaction == "satisfied"),
    tolerating = countIf(satisfaction == "tolerating"),
    frustrated = countIf(satisfaction == "frustrated"),
    by: {os_name, os_ver}
| sort actions desc
| limit 50`;
}

// NEW: Navigation Path Conversion Query
function navPathConversionQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  const lastStep = steps[steps.length - 1]?.identifiers?.map(id => `view.name == "${id}"`).join(" or ") ?? "true";
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| fieldsAdd pageName = coalesce(view.name, url.path, "unknown")
| fieldsAdd is_conv = ${lastStep}
| summarize
    total_sessions = countDistinct(dt.rum.session.id),
    conv_sessions = countDistinctIf(dt.rum.session.id, is_conv == true),
    by: {pageName}
| fieldsAdd conv_rate = if(total_sessions > 0, toDouble(conv_sessions) / toDouble(total_sessions) * 100.0, else: 0.0)
| sort total_sessions desc
| limit 30`;
}

// NEW: Click Issues Session Replay Query
function clickIssuesReplayQuery(days: number, frontend: string): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter characteristics.has_rage_click == true or characteristics.has_dead_click == true
| fields sid = dt.rum.session.id, timestamp, start_time,
    element = coalesce(user_action.target, "unknown"),
    page = coalesce(view.name, url.path, "unknown"),
    click_type = if(characteristics.has_rage_click == true, "rage", else: "dead")
| sort timestamp desc
| limit 30`;
}

// NEW: Davis Problems Query for Anomaly Tab
function davisProblemsQuery(days: number, frontend: string): string {
  const period = periodClause(days);
  return `fetch dt.davis.problems, ${period}
| filter isNotNull(display_id)
| fieldsAdd app_match = contains(toString(affected_entity_ids), "APPLICATION")
| sort event.start desc
| limit 20
| fields event.id, display_id, title, event.status, event.start, event.end, root_cause_entity_id, affected_entity_ids`;
}

// NEW: Backend Services for Root Cause Tab
function backendServicesQuery(days: number, frontend: string): string {
  const period = periodClause(days);
  return `fetch dt.entity.service
| fieldsKeep id, entity.name, entity.detected_name
| limit 30`;
}

// NEW: Feature Flag / Config Change Events Query
function featureFlagEventsQuery(days: number): string {
  const period = periodClause(days);
  return `fetch events, ${period}
| filter event.type == "CUSTOM_INFO" or event.type == "CUSTOM_CONFIGURATION" or event.type == "CUSTOM_ANNOTATION"
| summarize
    count = count(),
    first_time = min(timestamp),
    last_time = max(timestamp),
    by: {event.type, dt.event.description}
| sort last_time desc
| limit 30`;
}

// NEW: UTM Attribution Query
function utmAttributionQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  const lastStep = steps[steps.length - 1]?.identifiers?.map(id => `view.name == "${id}"`).join(" or ") ?? "true";
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| fieldsAdd utm_source = coalesce(stringKey(custom_properties, "utm_source"), stringKey(custom_properties, "utmSource"), "direct")
| fieldsAdd utm_medium = coalesce(stringKey(custom_properties, "utm_medium"), stringKey(custom_properties, "utmMedium"), "none")
| fieldsAdd utm_campaign = coalesce(stringKey(custom_properties, "utm_campaign"), stringKey(custom_properties, "utmCampaign"), "none")
| fieldsAdd is_conv = ${lastStep}
| summarize
    total_sessions = countDistinct(dt.rum.session.id),
    conv_sessions = countDistinctIf(dt.rum.session.id, is_conv == true),
    by: {utm_source, utm_medium, utm_campaign}
| fieldsAdd conv_rate = if(total_sessions > 0, toDouble(conv_sessions) / toDouble(total_sessions) * 100.0, else: 0.0)
| sort total_sessions desc
| limit 30`;
}

// NEW: Infrastructure Headroom Query
function infraHeadroomQuery(): string {
  return `fetch dt.entity.host
| fieldsKeep id, entity.name
| limit 10`;
}

// NEW: Host CPU/Memory Metrics
function hostMetricsQuery(days: number): string {
  const period = periodClause(days);
  return `timeseries avg_cpu = avg(dt.host.cpu.usage), avg_mem = avg(dt.host.memory.usage), ${period}, by:{dt.entity.host}
| fieldsAdd cpu_pct = arrayAvg(avg_cpu)
| fieldsAdd mem_pct = arrayAvg(avg_mem)
| fields dt.entity.host, cpu_pct, mem_pct`;
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
// Cohort Retention — new vs returning users, retention analysis
// ---------------------------------------------------------------------------
function cohortRetentionQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  const tagExpr = stepTagExpr(steps, steps.map((_, i) => `step${i + 1}`));
  const iAnyLines = steps.map((_, i) => `    reached_step${i + 1} = iAny(steps[] == "step${i + 1}")`).join(",\n");
  const convertedConds = steps.map((_, i) => `reached_step${i + 1} == true`).join(" and ");
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter ${anyStepFilter(steps)}
| fieldsAdd step_tag = ${tagExpr}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd day_bucket = formatTimestamp(start_time, format: "yyyy-MM-dd")
| fieldsAdd deviceType = device.type
| summarize
    steps = collectDistinct(step_tag),
    actions = count(),
    avg_dur = avg(dur_ms),
    errors = countIf(characteristics.has_error == true),
    by: {dt.rum.session.id, day_bucket, deviceType}
| fieldsAdd
${iAnyLines}
| fieldsAdd converted = if(${convertedConds}, true, else: false)
| summarize
    total_sessions = count(),
    converted_sessions = countIf(converted == true),
    avg_actions = avg(toDouble(actions)),
    avg_duration = avg(avg_dur),
    error_sessions = countIf(errors > 0),
    by: {day_bucket, deviceType}
| fieldsAdd conv_rate = if(total_sessions > 0, toDouble(converted_sessions) / toDouble(total_sessions) * 100.0, else: 0.0)
| sort day_bucket asc`;
}

function cohortSessionCountQuery(days: number, frontend: string): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| fieldsAdd day_bucket = formatTimestamp(start_time, format: "yyyy-MM-dd")
| summarize
    unique_users = countDistinct(dt.rum.instance.id),
    sessions = countDistinct(dt.rum.session.id),
    actions = count(),
    by: {day_bucket}
| sort day_bucket asc`;
}

// ---------------------------------------------------------------------------
// Session Engagement Score — composite engagement metric per session
// ---------------------------------------------------------------------------
function sessionEngagementQuery(days: number, frontend: string, steps: StepDef[]): string {
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
    actions = count(),
    avg_dur = avg(dur_ms),
    max_dur = max(dur_ms),
    errors = countIf(characteristics.has_error == true),
    funnel_depth = countDistinct(step_tag),
    by: {dt.rum.session.id, deviceType, browserName}
| fieldsAdd
${iAnyLines}
| fieldsAdd converted = if(${convertedConds}, true, else: false)
| sort actions desc
| limit 500`;
}

// ---------------------------------------------------------------------------
// Funnel Velocity — time between funnel steps (for Sankey sub-tab)
// ---------------------------------------------------------------------------
function funnelVelocityQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  const tagExpr = stepTagExpr(steps, steps.map((s) => s.label));
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter ${anyStepFilter(steps)}
| fieldsAdd step_tag = ${tagExpr}
| filter step_tag != "other"
| summarize
    first_ts = min(start_time),
    by: {dt.rum.session.id, step_tag}
| sort first_ts asc
| summarize
    step_entries = collectArray(record(step = step_tag, ts = first_ts)),
    by: {dt.rum.session.id}
| limit 500`;
}

// ---------------------------------------------------------------------------
// Third-Party Impact — resource timing by domain
// ---------------------------------------------------------------------------
function thirdPartyImpactQuery(days: number, frontend: string): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter characteristics.has_request == true
| fieldsAdd res_dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd raw_url = coalesce(url.full, url.path, "")
| fieldsAdd url_no_proto = replaceString(replaceString(raw_url, "https://", ""), "http://", "")
| fieldsAdd domain = if(contains(url_no_proto, "/"), substring(url_no_proto, from: 0, to: indexOf(url_no_proto, "/")), else: url_no_proto)
| filter domain != ""
| fieldsAdd lp = lower(coalesce(url.path, ""))
| fieldsAdd res_type = ${RES_TYPE_EXPR}
| summarize
    requests = count(),
    avg_dur = avg(res_dur_ms),
    p90_dur = percentile(res_dur_ms, 90),
    total_dur = sum(res_dur_ms),
    slow_count = countIf(res_dur_ms > 1000.0),
    error_count = countIf(characteristics.has_error == true),
    sessions = countDistinct(dt.rum.session.id),
    by: {domain, res_type}
| sort total_dur desc
| limit 100`;
}

function thirdPartyCwvCorrelationQuery(days: number, frontend: string): string {
  const period = periodClause(days);
  return `fetch user.events, ${period}
| filter frontend.name == "${frontend}"
| filter characteristics.has_page_summary == true
| fieldsAdd pageName = coalesce(view.name, page.name, url.path, "unknown")
| fieldsAdd
    lcp_ms = toDouble(web_vitals.largest_contentful_paint) / 1000000.0,
    cls_val = toDouble(web_vitals.cumulative_layout_shift),
    inp_ms = toDouble(web_vitals.interaction_to_next_paint) / 1000000.0
| summarize
    lcp_avg = avg(lcp_ms),
    cls_avg = avg(cls_val),
    inp_avg = avg(inp_ms),
    page_views = count(),
    by: {pageName}
| sort page_views desc
| limit 30`;
}

// ---------------------------------------------------------------------------
// Error Clustering — group JS errors by similarity
// ---------------------------------------------------------------------------
function errorClusteringQuery(days: number, frontend: string): string {
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
| fieldsAdd errorMessage = coalesce(error.message, error.display_name, "")
| summarize
    occurrences = count(),
    affected_sessions = countDistinct(dt.rum.session.id),
    affected_users = countDistinct(dt.rum.instance.id),
    first_seen = min(start_time),
    last_seen = max(start_time),
    pages = collectDistinct(pageName),
    sample_message = takeAny(errorMessage),
    by: {error.id, errorName}
| sort occurrences desc
| limit 50`;
}

function errorTrendQuery(days: number, frontend: string): string {
  const period = periodClause(days);
  return `fetch user.events, samplingRatio: 1, ${period}
| filter characteristics.has_error
| filter isNotNull(error.type)
| fieldsAdd frontend_name = coalesce(
    entityName(dt.rum.application.entity, type: "dt.entity.application"),
    entityName(dt.rum.application.entity, type: "dt.entity.mobile_application")
  )
| filter frontend_name == "${frontend}"
| filter error.type == "exception"
| fieldsAdd errorName = error.display_name
| fieldsAdd hour_bucket = formatTimestamp(start_time, format: "yyyy-MM-dd HH:00")
| summarize
    occurrences = count(),
    unique_errors = countDistinct(errorName),
    affected_sessions = countDistinct(dt.rum.session.id),
    by: {hour_bucket}
| sort hour_bucket asc`;
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
      {label && <Text style={{ fontSize: 12, opacity: 0.6 }}>{label}</Text>}
    </div>
  );
}

function CwvCard({ label, value, unit, metric }: { label: string; value: number; unit: string; metric: keyof typeof CWV }) {
  const color = cwvClr(value, metric);
  const status = cwvLabel(value, metric);
  return (
    <div className="uj-cwv-card">
      <Text style={{ fontSize: 13, opacity: 0.6 }}>{label}</Text>
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

function useCountUp(target: number, duration = 800, delay = 0): number {
  const [value, setValue] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    if (target === prev.current) return;
    const start = prev.current;
    prev.current = target;
    const t0 = performance.now() + delay;
    let raf: number;
    const tick = (now: number) => {
      const elapsed = now - t0;
      if (elapsed < 0) { raf = requestAnimationFrame(tick); return; }
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(start + (target - start) * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, delay]);
  return value;
}

function CountUpText({ value, delay = 0, suffix = "", ...props }: { value: number; delay?: number; suffix?: string } & React.SVGProps<SVGTextElement>) {
  const animated = useCountUp(value, 800, delay);
  return <text {...props}>{fmtCount(animated)}{suffix}</text>;
}

function FunnelChart({ steps, prevSteps, appEntityId, stepDefs, aov = 0 }: { steps: FunnelStep[]; prevSteps?: FunnelStep[]; appEntityId?: string; stepDefs: StepDef[]; aov?: number }) {
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
        <path key={`prev-${i}`} d={segPath(prevWidths, i)} fill="none" stroke="rgba(128,128,128,0.4)" strokeWidth="2" strokeDasharray="6 4" />
      ))}
      {/* Current period segments */}
      {steps.map((_, i) => (
        <path key={i} d={segPath(widths, i)} fill={`url(#funnelStep${i})`} stroke={stepColors[i]} strokeWidth="1" strokeOpacity="0.5" className="uj-funnel-segment" style={{ animationDelay: `${i * 400}ms` }} />
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

        const primaryId = stepDefs[i] ? stepPrimaryIdentifier(stepDefs[i]) : null;
        const stepUrl = appEntityId && primaryId ? vitalsUrl(appEntityId, primaryId) : undefined;
        const stagger = i * 400;

        return (
          <g key={i} className="uj-funnel-label" style={{ animationDelay: `${stagger + 60}ms` }}>
            {i > 0 && <line x1={cx - widths[i] / 2} y1={y} x2={cx + widths[i] / 2} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />}
            {stepUrl ? (
              <g style={{ cursor: "pointer" }} onClick={() => openLink(stepUrl)}>
                <circle cx={24} cy={midY} r={13} fill={`${sClr}1A`} stroke={sClr} strokeWidth="1.5" />
                <text x={24} y={midY + 4} textAnchor="middle" fill={sClr} fontSize="12" fontWeight="700">{i + 1}</text>
                <text x={cx} y={midY - 10} textAnchor="middle" fill="rgba(255,255,255,0.95)" fontSize="14" fontWeight="600" textDecoration="underline">{step.label}</text>
                <CountUpText value={step.count} delay={stagger + 200} suffix=" sessions" x={cx} y={midY + 8} textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="12" />
                <title>Open in Vitals: {stepDefs[i]?.identifiers.join(", ") ?? step.label}</title>
              </g>
            ) : (
              <>
                <circle cx={24} cy={midY} r={13} fill={`${sClr}1A`} stroke={sClr} strokeWidth="1.5" />
                <text x={24} y={midY + 4} textAnchor="middle" fill={sClr} fontSize="12" fontWeight="700">{i + 1}</text>
                <text x={cx} y={midY - 10} textAnchor="middle" fill="rgba(255,255,255,0.95)" fontSize="14" fontWeight="600">{step.label}</text>
                <CountUpText value={step.count} delay={stagger + 200} suffix=" sessions" x={cx} y={midY + 8} textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="12" />
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
            {i > 0 && aov > 0 && step.count < steps[i - 1].count && (
              <text x={cx + widths[i] / 2 + 14} y={y + 20} fill={RED} fontSize="9" opacity="0.55">{fmtCurrency((steps[i - 1].count - step.count) * aov)} lost</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Horizontal Bar Funnel (Waterfall)
// ---------------------------------------------------------------------------
function HorizontalBarFunnel({ steps, prevSteps, aov }: { steps: FunnelStep[]; prevSteps?: FunnelStep[]; aov: number }) {
  const maxCount = Math.max(1, ...steps.map(s => s.count));
  const W = 760, barH = 44, gap = 6, padL = 120, padR = 160;
  const barArea = W - padL - padR;
  const H = steps.length * (barH + gap) + 30;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="uj-funnel-svg">
      {steps.map((step, i) => {
        const y = i * (barH + gap) + 10;
        const w = Math.max(4, (step.count / maxCount) * barArea);
        const prevW = prevSteps?.[i] ? Math.max(4, (prevSteps[i].count / maxCount) * barArea) : 0;
        const dropW = i > 0 ? Math.max(0, (steps[i - 1].count / maxCount) * barArea - w) : 0;
        const dropPct = i === 0 ? 0 : 100 - step.convFromPrev;
        const color = i === 0 ? BLUE : dropPct > 50 ? RED : dropPct > 30 ? ORANGE : dropPct > 15 ? YELLOW : GREEN;
        const stagger = i * 120;

        return (
          <g key={i} className="uj-funnel-segment" style={{ animationDelay: `${stagger}ms` }}>
            {/* Step label */}
            <text x={padL - 8} y={y + barH / 2 + 4} textAnchor="end" fill="rgba(255,255,255,0.85)" fontSize={12} fontWeight={600}>{step.label}</text>
            {/* Previous period ghost bar */}
            {prevSteps && prevW > 0 && (
              <rect x={padL} y={y + 2} width={prevW} height={barH - 4} rx={4} fill="none" stroke="rgba(128,128,128,0.35)" strokeWidth={2} strokeDasharray="6 4" />
            )}
            {/* Drop-off extension (red area from prev bar to current) */}
            {i > 0 && dropW > 0 && (
              <rect x={padL + w} y={y + 4} width={dropW} height={barH - 8} rx={3} fill={RED} fillOpacity={0.12} stroke={RED} strokeWidth={0.5} strokeOpacity={0.3}>
                <title>{`Drop-off: ${fmtCount(steps[i - 1].count - step.count)} sessions (${fmtPct(dropPct)})`}</title>
              </rect>
            )}
            {/* Main bar */}
            <rect x={padL} y={y} width={w} height={barH} rx={5} fill={color} fillOpacity={0.35} stroke={color} strokeWidth={1.5} strokeOpacity={0.6} />
            {/* Count inside bar */}
            <CountUpText value={step.count} delay={stagger + 100} x={padL + Math.min(w - 8, Math.max(60, w / 2))} y={y + barH / 2 + 4} textAnchor="end" fill="rgba(255,255,255,0.9)" fontSize={13} fontWeight={700} />
            {/* Right side stats */}
            <text x={W - padR + 8} y={y + 14} fill={statusClr(step.overallConv)} fontSize={11} fontWeight={600}>{fmtPct(step.overallConv)} overall</text>
            {i > 0 && (
              <text x={W - padR + 8} y={y + 30} fill={dropPct > 30 ? RED : YELLOW} fontSize={10}>{fmtPct(step.convFromPrev)} conv · {fmtPct(dropPct)} drop</text>
            )}
            {i > 0 && aov > 0 && step.count < steps[i - 1].count && (
              <text x={W - padR + 8} y={y + 42} fill={RED} fontSize={9} opacity={0.6}>{fmtCurrency((steps[i - 1].count - step.count) * aov)} lost</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Stacked Cohort Funnel (Marimekko)
// ---------------------------------------------------------------------------
function StackedCohortFunnel({ steps, prevSteps, aov }: { steps: FunnelStep[]; prevSteps?: FunnelStep[]; aov: number }) {
  const W = 720, colW = 100, gap = 12, padL = 30, padT = 30, padB = 60;
  const totalW = steps.length * (colW + gap);
  const allCounts = [...steps.map(s => s.count), ...(prevSteps ?? []).map(s => s.count)];
  const maxCount = Math.max(1, ...allCounts);
  const colH = 340;
  const H = padT + colH + padB;

  return (
    <svg width="100%" viewBox={`0 0 ${Math.max(W, padL + totalW + 40)} ${H}`} className="uj-funnel-svg">
      {steps.map((step, i) => {
        const x = padL + i * (colW + gap);
        const fullH = (step.count / maxCount) * colH;
        const nextCount = i < steps.length - 1 ? steps[i + 1].count : 0;
        const convertedH = i < steps.length - 1 ? (nextCount / maxCount) * colH : fullH;
        const droppedH = fullH - convertedH;
        const yBase = padT + colH - fullH;
        const dropPct = i === 0 ? 0 : 100 - step.convFromPrev;
        const color = i === 0 ? BLUE : dropPct > 50 ? RED : dropPct > 30 ? ORANGE : dropPct > 15 ? YELLOW : GREEN;
        const stagger = i * 150;

        return (
          <g key={i} className="uj-funnel-segment" style={{ animationDelay: `${stagger}ms` }}>
            {/* Converted portion (bottom) */}
            <rect x={x} y={yBase + droppedH} width={colW} height={Math.max(2, convertedH)} rx={4} fill={GREEN} fillOpacity={0.35} stroke={GREEN} strokeWidth={1} strokeOpacity={0.5}>
              <title>{`Converted to next step: ${fmtCount(nextCount)} sessions`}</title>
            </rect>
            {/* Dropped portion (top) */}
            {droppedH > 1 && i < steps.length - 1 && (
              <rect x={x} y={yBase} width={colW} height={droppedH} rx={4} fill={RED} fillOpacity={0.2} stroke={RED} strokeWidth={1} strokeOpacity={0.4}>
                <title>{`Dropped off: ${fmtCount(step.count - nextCount)} sessions`}</title>
              </rect>
            )}
            {/* Last step — full is converted */}
            {i === steps.length - 1 && (
              <rect x={x} y={yBase} width={colW} height={Math.max(2, fullH)} rx={4} fill={GREEN} fillOpacity={0.5} stroke={GREEN} strokeWidth={1.5} strokeOpacity={0.7}>
                <title>{`Final conversion: ${fmtCount(step.count)} sessions`}</title>
              </rect>
            )}
            {/* Previous period ghost column */}
            {prevSteps?.[i] && (() => {
              const pFullH = (prevSteps[i].count / maxCount) * colH;
              const pYBase = padT + colH - pFullH;
              return <rect x={x - 3} y={pYBase} width={colW + 6} height={Math.max(2, pFullH)} rx={5} fill="none" stroke="rgba(128,128,128,0.4)" strokeWidth={2} strokeDasharray="6 4" />;
            })()}
            {/* Connector line to next column */}
            {i < steps.length - 1 && (
              <line x1={x + colW} y1={yBase + droppedH + convertedH / 2} x2={x + colW + gap} y2={padT + colH - (nextCount / maxCount) * colH + ((nextCount / maxCount) * colH) / 2} stroke="rgba(128,128,128,0.2)" strokeWidth={1} strokeDasharray="3 3" />
            )}
            {/* Step label */}
            <text x={x + colW / 2} y={padT + colH + 16} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={11} fontWeight={600}>{step.label}</text>
            {/* Count */}
            <CountUpText value={step.count} delay={stagger + 100} x={x + colW / 2} y={padT + colH + 32} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={10} />
            {/* Conv % inside */}
            {fullH > 30 && (
              <text x={x + colW / 2} y={yBase + fullH / 2 + 4} textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize={12} fontWeight={700}>{fmtPct(step.overallConv)}</text>
            )}
            {/* Drop label between columns */}
            {droppedH > 14 && i < steps.length - 1 && (
              <text x={x + colW / 2} y={yBase + droppedH / 2 + 3} textAnchor="middle" fill={RED} fontSize={9} opacity={0.8}>-{fmtCount(step.count - nextCount)}</text>
            )}
          </g>
        );
      })}
      {/* Legend */}
      <rect x={padL} y={H - 16} width={10} height={10} rx={2} fill={GREEN} fillOpacity={0.4} />
      <text x={padL + 14} y={H - 7} fill="rgba(255,255,255,0.5)" fontSize={9}>Converted</text>
      <rect x={padL + 80} y={H - 16} width={10} height={10} rx={2} fill={RED} fillOpacity={0.3} />
      <text x={padL + 94} y={H - 7} fill="rgba(255,255,255,0.5)" fontSize={9}>Dropped</text>
      {prevSteps && (
        <g>
          <rect x={padL + 160} y={H - 16} width={14} height={10} rx={2} fill="none" stroke="rgba(128,128,128,0.5)" strokeWidth={2} strokeDasharray="4 3" />
          <text x={padL + 178} y={H - 7} fill="rgba(255,255,255,0.5)" fontSize={9}>Previous period</text>
        </g>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Elapsed-Time Funnel (Survival Curve)
// ---------------------------------------------------------------------------
function ElapsedTimeFunnel({ steps, prevSteps, stepMap, stepDefs }: { steps: FunnelStep[]; prevSteps?: FunnelStep[]; stepMap: Map<string, any>; stepDefs: StepDef[] }) {
  // Build cumulative timing data: X = time (cumulative avg duration through steps), Y = % remaining
  const W = 720, H = 360, padL = 60, padR = 40, padT = 30, padB = 50;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // For each step, get cumulative avg duration (ms) and % remaining
  const points: { step: number; label: string; cumMs: number; pctRemaining: number; count: number; avgMs: number }[] = [];
  let cumMs = 0;
  for (let i = 0; i < steps.length; i++) {
    const m = stepMap.get(stepDefs[i]?.label ?? steps[i].label);
    const avgMs = m ? Number(m.avg_duration_ms ?? 0) : 0;
    cumMs += avgMs;
    points.push({ step: i, label: steps[i].label, cumMs, pctRemaining: steps[i].overallConv, count: steps[i].count, avgMs });
  }

  // Previous period curve (reuses same X positions for direct comparison)
  const prevPoints: typeof points = [];
  if (prevSteps) {
    let pCum = 0;
    for (let i = 0; i < prevSteps.length; i++) {
      const m = stepMap.get(stepDefs[i]?.label ?? prevSteps[i].label);
      const avgMs = m ? Number(m.avg_duration_ms ?? 0) : 0;
      pCum += avgMs;
      prevPoints.push({ step: i, label: prevSteps[i].label, cumMs: pCum, pctRemaining: prevSteps[i].overallConv, count: prevSteps[i].count, avgMs });
    }
  }

  const allMs = [...points.map(p => p.cumMs), ...prevPoints.map(p => p.cumMs)];
  const maxTime = Math.max(1, ...allMs);
  const xScale = (ms: number) => padL + (ms / maxTime) * plotW;
  const yScale = (pct: number) => padT + plotH - (pct / 100) * plotH;

  // Build the path
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p.cumMs)},${yScale(p.pctRemaining)}`).join(" ");
  const areaPath = `M${xScale(0)},${yScale(100)} ${linePath} L${xScale(points[points.length - 1]?.cumMs ?? 0)},${yScale(0)} L${xScale(0)},${yScale(0)} Z`;

  // Y-axis ticks
  const yTicks = [0, 25, 50, 75, 100];
  // X-axis ticks (time)
  const xTicks = points.map(p => p.cumMs);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="uj-funnel-svg">
      {/* Grid */}
      {yTicks.map(t => (
        <g key={`yt-${t}`}>
          <line x1={padL} y1={yScale(t)} x2={padL + plotW} y2={yScale(t)} stroke="rgba(128,128,128,0.1)" strokeWidth={1} />
          <text x={padL - 8} y={yScale(t) + 4} textAnchor="end" fill="rgba(255,255,255,0.4)" fontSize={10}>{t}%</text>
        </g>
      ))}
      {/* Start point at 0,100% */}
      <circle cx={xScale(0)} cy={yScale(100)} r={4} fill={BLUE} stroke="#fff" strokeWidth={1.5} />
      {/* Previous period curve */}
      {prevPoints.length > 0 && (() => {
        const pLine = prevPoints.map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p.cumMs)},${yScale(p.pctRemaining)}`).join(" ");
        return (
          <g>
            <path d={`M${xScale(0)},${yScale(100)} ${pLine}`} fill="none" stroke="rgba(128,128,128,0.4)" strokeWidth={2} strokeDasharray="8 4" strokeLinejoin="round" />
            {prevPoints.map((p, i) => (
              <circle key={`prev-${i}`} cx={xScale(p.cumMs)} cy={yScale(p.pctRemaining)} r={4} fill="none" stroke="rgba(128,128,128,0.4)" strokeWidth={1.5}>
                <title>{`Previous — ${p.label}: ${fmtPct(p.pctRemaining)} remaining (${fmtCount(p.count)} sessions)`}</title>
              </circle>
            ))}
          </g>
        );
      })()}
      {/* Area fill */}
      <path d={areaPath} fill={BLUE} fillOpacity={0.08} />
      {/* Line */}
      <path d={`M${xScale(0)},${yScale(100)} ${linePath}`} fill="none" stroke={BLUE} strokeWidth={2.5} strokeLinejoin="round" />
      {/* Step points with vertical drop lines */}
      {points.map((p, i) => {
        const x = xScale(p.cumMs);
        const y = yScale(p.pctRemaining);
        const prevY = i === 0 ? yScale(100) : yScale(points[i - 1].pctRemaining);
        const dropPct = i === 0 ? 0 : 100 - p.pctRemaining - (100 - points[i - 1].pctRemaining);
        const color = i === 0 ? BLUE : dropPct > 30 ? RED : dropPct > 15 ? ORANGE : GREEN;
        return (
          <g key={i}>
            {/* Vertical drop line */}
            {i > 0 && (
              <line x1={x} y1={prevY} x2={x} y2={y} stroke={RED} strokeWidth={1} strokeDasharray="3 2" opacity={0.4} />
            )}
            {/* Point */}
            <circle cx={x} cy={y} r={6} fill={color} stroke="#fff" strokeWidth={1.5}>
              <title>{`${p.label}: ${fmtPct(p.pctRemaining)} remaining (${fmtCount(p.count)} sessions)\nCumulative time: ${fmt(p.cumMs)}\nStep duration: ${fmt(p.avgMs)}`}</title>
            </circle>
            {/* Label */}
            <text x={x} y={y - 12} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={10} fontWeight={600}>{p.label}</text>
            <text x={x} y={y + 18} textAnchor="middle" fill={color} fontSize={9} fontWeight={600}>{fmtPct(p.pctRemaining)}</text>
            {/* X-axis label */}
            <text x={x} y={H - padB + 16} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={9}>{fmt(p.cumMs)}</text>
          </g>
        );
      })}
      {/* Axis labels */}
      <text x={padL + plotW / 2} y={H - 4} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize={10}>Cumulative Avg Response Time →</text>
      <text x={12} y={padT + plotH / 2} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize={10} transform={`rotate(-90,12,${padT + plotH / 2})`}>% Users Remaining</text>
      {prevPoints.length > 0 && (
        <g>
          <line x1={padL + plotW - 120} y1={padT + 8} x2={padL + plotW - 100} y2={padT + 8} stroke={BLUE} strokeWidth={2.5} />
          <text x={padL + plotW - 96} y={padT + 12} fill="rgba(255,255,255,0.5)" fontSize={9}>Current</text>
          <line x1={padL + plotW - 120} y1={padT + 22} x2={padL + plotW - 100} y2={padT + 22} stroke="rgba(128,128,128,0.4)" strokeWidth={2} strokeDasharray="6 3" />
          <text x={padL + plotW - 96} y={padT + 26} fill="rgba(255,255,255,0.5)" fontSize={9}>Previous</text>
        </g>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Comparison Split Funnel (Mirror / Side-by-Side)
// ---------------------------------------------------------------------------
function ComparisonSplitFunnel({ steps, prevSteps, aov }: { steps: FunnelStep[]; prevSteps: FunnelStep[]; aov: number }) {
  const W = 720;
  const stepH = 70;
  const gap = 6;
  const H = steps.length * (stepH + gap) + 30;
  const cx = W / 2;
  const maxBarW = 280;
  const maxCount = Math.max(1, ...steps.map(s => s.count), ...prevSteps.map(s => s.count));

  const segPath = (width: number, nextWidth: number, side: "left" | "right", y: number) => {
    const sign = side === "left" ? -1 : 1;
    const w = width;
    const nw = nextWidth;
    const tl = { x: cx, y };
    const tr = { x: cx + sign * w, y };
    const bl = { x: cx, y: y + stepH };
    const br = { x: cx + sign * nw, y: y + stepH };
    const cpY = (y + y + stepH) / 2;
    if (side === "left") {
      return `M ${tl.x} ${tl.y} C ${tl.x} ${cpY}, ${bl.x} ${cpY}, ${bl.x} ${bl.y} L ${br.x} ${br.y} C ${br.x} ${cpY}, ${tr.x} ${cpY}, ${tr.x} ${tr.y} Z`;
    }
    return `M ${tl.x} ${tl.y} C ${tl.x} ${cpY}, ${bl.x} ${cpY}, ${bl.x} ${bl.y} L ${br.x} ${br.y} C ${br.x} ${cpY}, ${tr.x} ${cpY}, ${tr.x} ${tr.y} Z`;
  };

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="uj-funnel-svg">
      {/* Center axis */}
      <line x1={cx} y1={5} x2={cx} y2={H - 5} stroke="rgba(128,128,128,0.15)" strokeWidth={1} />
      {/* Headers */}
      <text x={cx - maxBarW / 2} y={10} textAnchor="middle" fill={BLUE} fontSize={11} fontWeight={700}>Current Period</text>
      <text x={cx + maxBarW / 2} y={10} textAnchor="middle" fill="rgba(128,128,128,0.6)" fontSize={11} fontWeight={700}>Previous Period</text>
      {steps.map((step, i) => {
        const y = i * (stepH + gap) + 20;
        const w = Math.max(6, (step.count / maxCount) * maxBarW);
        const nw = i < steps.length - 1 ? Math.max(6, (steps[i + 1].count / maxCount) * maxBarW) : w * 0.7;
        const pw = Math.max(6, (prevSteps[i].count / maxCount) * maxBarW);
        const pnw = i < prevSteps.length - 1 ? Math.max(6, (prevSteps[i + 1].count / maxCount) * maxBarW) : pw * 0.7;
        const dropPct = i === 0 ? 0 : 100 - step.convFromPrev;
        const prevDropPct = i === 0 ? 0 : 100 - prevSteps[i].convFromPrev;
        const color = i === 0 ? BLUE : dropPct > 50 ? RED : dropPct > 30 ? ORANGE : dropPct > 15 ? YELLOW : GREEN;
        const prevColor = i === 0 ? "rgba(128,128,128,0.5)" : prevDropPct > 50 ? RED : prevDropPct > 30 ? ORANGE : prevDropPct > 15 ? YELLOW : GREEN;
        const countDelta = step.count - prevSteps[i].count;
        const deltaPct = prevSteps[i].count > 0 ? (countDelta / prevSteps[i].count) * 100 : 0;
        const stagger = i * 200;

        return (
          <g key={i} className="uj-funnel-segment" style={{ animationDelay: `${stagger}ms` }}>
            {/* Current (left side) */}
            <path d={segPath(w, nw, "left", y)} fill={color} fillOpacity={0.3} stroke={color} strokeWidth={1} strokeOpacity={0.5} />
            {/* Previous (right side) */}
            <path d={segPath(pw, pnw, "right", y)} fill={prevColor} fillOpacity={0.15} stroke={prevColor} strokeWidth={1} strokeOpacity={0.3} />
            {/* Step label (center) */}
            <text x={cx} y={y + stepH / 2 - 6} textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize={12} fontWeight={700}>{step.label}</text>
            {/* Delta indicator */}
            {Math.abs(deltaPct) >= 0.1 && (
              <text x={cx} y={y + stepH / 2 + 10} textAnchor="middle" fill={countDelta >= 0 ? GREEN : RED} fontSize={10} fontWeight={600}>
                {countDelta >= 0 ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(1)}%
              </text>
            )}
            {/* Left count */}
            <CountUpText value={step.count} delay={stagger + 100} x={cx - w / 2} y={y + stepH / 2 + 4} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={11} />
            {/* Right count */}
            <text x={cx + pw / 2} y={y + stepH / 2 + 4} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={11}>{fmtCount(prevSteps[i].count)}</text>
          </g>
        );
      })}
      {/* Legend */}
      <rect x={10} y={H - 14} width={10} height={10} rx={2} fill={BLUE} fillOpacity={0.4} />
      <text x={24} y={H - 5} fill="rgba(255,255,255,0.5)" fontSize={9}>Current</text>
      <rect x={80} y={H - 14} width={10} height={10} rx={2} fill="rgba(128,128,128,0.4)" />
      <text x={94} y={H - 5} fill="rgba(255,255,255,0.5)" fontSize={9}>Previous</text>
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
        <Strong>Traffic Change:</Strong>
        <Strong style={{ color: BLUE, fontSize: 18 }}>+{value}%</Strong>
      </Flex>
      <input type="range" min={0} max={TRAFFIC_MULTIPLIERS.length - 1} value={TRAFFIC_MULTIPLIERS.indexOf(value)} onChange={(e) => onChange(TRAFFIC_MULTIPLIERS[Number(e.target.value)])} className="uj-slider" />
      <div style={{ position: "relative", width: "100%", height: 18 }}>
        {TRAFFIC_MULTIPLIERS.map((v, i) => (
          TRAFFIC_TICK_LABELS.has(v) ? <span key={v} style={{ position: "absolute", left: `${(i / (TRAFFIC_MULTIPLIERS.length - 1)) * 100}%`, transform: "translateX(-50%)", fontSize: 12, color: v === value ? BLUE : "rgba(128,128,128,0.6)", fontWeight: v === value ? 700 : 400 }}>{v}%</span> : null
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
      <HelpSection title="What's New">
        <div style={{ margin: "8px 0" }}>
          <div style={{ marginBottom: 12, padding: "10px 14px", background: "rgba(69,137,255,0.08)", borderRadius: 8, borderLeft: "3px solid rgba(69,137,255,0.6)" }}>
            <Paragraph style={{ fontSize: 12, opacity: 0.5, marginBottom: 4 }}>May 15, 2026</Paragraph>
            <Paragraph><Strong>Step Details — Page Drop-off Funnel &amp; Core Web Vitals</Strong></Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• <Strong>Page Drop-off Contributors</Strong> funnel: For multi-page steps, a visual bar chart shows which pages within each step have the highest vs. lowest traffic — bars are color-coded by Apdex quality and sorted by event count, with drop percentage indicators</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• <Strong>Core Web Vitals per page</Strong>: The Compare Pages view now overlays LCP, CLS, and INP for each page, color-coded against Google's Good/Needs Improvement/Poor thresholds</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Instantly identify which specific pages within a multi-page step are contributing most to user drop-off and have the worst performance</Paragraph>
          </div>
          <div style={{ marginBottom: 12, padding: "10px 14px", background: "rgba(128,128,128,0.04)", borderRadius: 8, borderLeft: "3px solid rgba(128,128,128,0.3)" }}>
            <Paragraph style={{ fontSize: 12, opacity: 0.5, marginBottom: 4 }}>May 15, 2026</Paragraph>
            <Paragraph><Strong>Worst Sessions — AI Impact Scoring &amp; Pattern Clustering</Strong></Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• <Strong>AI Impact Score (0–100)</Strong>: Replaces static composite ranking with z-score normalized scoring across 4 severity dimensions (errors 35%, frustrated 30%, avg latency 20%, max latency 15%), weighted by a systemic multiplier</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• <Strong>Systemic multiplier</Strong>: Sessions whose error patterns appear across many other sessions score higher; unique outliers are dampened — focuses attention on repeatable bugs, not noise</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• <Strong>"Sessions Like This"</Strong> column: Shows how many other sessions share the same behavioral fingerprint (error types + performance bucket + frustration level)</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• <Strong>SYSTEMIC badge</Strong>: Sessions with high systemic scores are flagged, instantly distinguishing widespread issues from isolated edge cases</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• <Strong>Pattern Clusters</Strong> section: Groups sessions by behavioral fingerprint — shows Systemic vs. Outlier counts, distinct pattern count, and top cluster descriptions</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Query enhanced to collect per-session page lists and error types for clustering analysis</Paragraph>
          </div>
          <div style={{ marginBottom: 12, padding: "10px 14px", background: "rgba(128,128,128,0.04)", borderRadius: 8, borderLeft: "3px solid rgba(128,128,128,0.3)" }}>
            <Paragraph style={{ fontSize: 12, opacity: 0.5, marginBottom: 4 }}>May 15, 2026</Paragraph>
            <Paragraph><Strong>Auto-Refresh — Live Data Updates Without Page Reload</Strong></Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• <Strong>Auto-Refresh selector</Strong> in the header bar (next to Timeframe) with options: Off, 30 seconds, 1 minute, 5 minutes, 10 minutes</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• When enabled, <Strong>all DQL queries across every tab</Strong> automatically re-execute at the selected interval — data values update seamlessly in-place without a page refresh</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• <Strong>Live status indicator</Strong> in the header: spinning icon + "Refreshing…" during data fetch, then "Last refreshed Xs ago" when idle</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Existing data remains visible during background refetch — no flicker or loading spinners on refresh cycles (only initial load shows full spinner)</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Uses the native <code>refetchInterval</code> option from <code>useDql</code> — queries are automatically stale-checked and only re-fetched when interval elapses</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Ideal for wall displays, NOC monitors, or hands-free continuous monitoring during incidents</Paragraph>
          </div>
          <div style={{ marginBottom: 12, padding: "10px 14px", background: "rgba(128,128,128,0.04)", borderRadius: 8, borderLeft: "3px solid rgba(128,128,128,0.3)" }}>
            <Paragraph style={{ fontSize: 12, opacity: 0.5, marginBottom: 4 }}>May 14, 2026</Paragraph>
            <Paragraph><Strong>Funnel Overview — Sub-Tabs &amp; Predictive EOD Model</Strong></Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• <Strong>4 Sub-Tabs</Strong>: Funnel Overview content is now organized into <Strong>Conversion Funnel</Strong> (Apdex breakdown + chart with 5 styles + Compare toggle), <Strong>Predictive Model</Strong> (EOD projection), <Strong>Step Analysis</Strong> (sortable metrics table), and <Strong>Per-Page Breakdown</Strong> (per-identifier metrics for multi-page steps).</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• <Strong>Predictive Funnel Model</Strong>: Fits a linear regression to today's hourly conversion rates (from midnight to now) and projects where today's overall conversion rate will land by 23:59. Shown when ≥2 hourly data points are available; otherwise shows a placeholder.</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Model card shows: <Strong>Projected EOD conv rate</Strong>, <Strong>Hourly velocity</Strong> (slope in %/hour, color-coded rising/stable/declining), <Strong>Hours remaining</Strong>, and a <Strong>sparkline</Strong> with actual data (solid) and projected trend (dashed) overlaid.</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Confidence % reflects how many of today's hours have data vs. hours elapsed — lower early in the day, higher by evening.</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• <Strong>Trends Tab — Sparklines &amp; Anomaly Signals</Strong>: Each metric card in the Trends tab now shows a <Strong>daily sparkline</Strong> (mini time-series for the current period) and an inline <Strong>anomaly badge</Strong>. ⚠ Anomaly = current value exceeds 2 std dev of daily variance (statistically significant); ↑ Notable = 1.2–2 std dev; ∿ Normal = within expected noise. The AI Insights panel now highlights which metrics are anomalous and advises focusing investigation on anomaly-flagged cards first.</Paragraph>
          </div>
          <div style={{ marginBottom: 12, padding: "10px 14px", background: "rgba(128,128,128,0.04)", borderRadius: 8, borderLeft: "3px solid rgba(128,128,128,0.3)" }}>
            <Paragraph style={{ fontSize: 12, opacity: 0.5, marginBottom: 4 }}>May 13, 2026</Paragraph>
            <Paragraph><Strong>Settings — App &amp; Page Dropdowns</Strong></Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• <Strong>Frontend Application</Strong> is now a searchable dropdown populated from apps with data in the last 30 days — no more manual typing</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• <Strong>Pages / Identifiers</Strong> are now searchable dropdowns showing all distinct pages seen for the selected app in the last 7 days</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Selecting a new app automatically re-queries pages so the identifier dropdowns only show pages belonging to that app</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Current saved values (including wildcard patterns) are preserved as valid options even if not in the fetched list</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Both dropdowns include a <Strong>live search filter</Strong> — type to narrow down long lists instantly</Paragraph>
          </div>
          <div style={{ marginBottom: 12, padding: "10px 14px", background: "rgba(128,128,128,0.04)", borderRadius: 8, borderLeft: "3px solid rgba(128,128,128,0.3)" }}>
            <Paragraph style={{ fontSize: 12, opacity: 0.5, marginBottom: 4 }}>May 11, 2026</Paragraph>
            <Paragraph><Strong>Multi-Page Funnel Steps + Wildcard Support</Strong></Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Each funnel step now supports <Strong>multiple pages</Strong> with OR logic — e.g. (Step1a OR Step1b) AND Step2 AND (Step3a OR Step3b)</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• <Strong>Wildcard patterns</Strong> in all positions: <code>/home*</code> (starts with), <code>*home</code> (ends with), <code>*home*</code> (contains)</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Settings UI updated with per-step <Strong>"+ Add Page"</Strong> button and per-identifier remove (✕)</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• DQL filters generate <code>startsWith()</code>, <code>endsWith()</code>, <code>contains()</code> expressions for wildcards</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Vitals links intelligently skip wildcard identifiers and Dynatrace placeholders (<code>:id:</code>, <code>:hash:</code>) — uses first non-wildcard page for linking</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• <Strong>Mid-string wildcards</Strong>: <code>/journeys/*/book</code> generates <code>startsWith() AND endsWith()</code> DQL filters</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• <Strong>Step Details — Compare Pages</Strong>: For multi-page steps, a Compare button reveals per-page metrics with the first page as primary baseline and delta indicators for all other pages</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Backward-compatible: existing single-identifier configurations are automatically migrated</Paragraph>
          </div>
          <div style={{ marginBottom: 12, padding: "10px 14px", background: "rgba(128,128,128,0.04)", borderRadius: 8, borderLeft: "3px solid rgba(128,128,128,0.3)" }}>
            <Paragraph style={{ fontSize: 12, opacity: 0.5, marginBottom: 4 }}>May 10, 2026</Paragraph>
            <Paragraph><Strong>AI Insights — Intelligent Analysis Engine</Strong></Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• <Strong>AI Insights button</Strong> in the header bar (between timeframe selector and help icon) — single toggle for all tabs</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Collapsible panel with <Strong>Summary</Strong>, color-coded <Strong>Insights</Strong> (good/warning/critical/info), and prioritized <Strong>Recommendations</Strong> (high/medium/low impact)</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• <Strong>Typewriter streaming animation</Strong>: text appears word-by-word like an AI chatbot response</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• 25+ analysis functions with industry-standard benchmarks: conversion rate (2-5% avg), Apdex thresholds, Google CWV targets, error rate benchmarks, SLO compliance, and more</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Tab-specific analysis: each tab evaluates its own data — Funnel Overview analyzes conversion & drop-offs, Web Vitals checks CWV against Google thresholds, Anomaly Detection flags significant deviations, etc.</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• All analysis runs client-side using heuristic benchmarks — no external AI API calls, zero latency</Paragraph>
          </div>
          <div style={{ marginBottom: 12, padding: "10px 14px", background: "rgba(128,128,128,0.04)", borderRadius: 8, borderLeft: "3px solid rgba(128,128,128,0.3)" }}>
            <Paragraph style={{ fontSize: 12, opacity: 0.5, marginBottom: 4 }}>May 9, 2026</Paragraph>
            <Paragraph><Strong>4 New Tabs + Funnel Velocity Sub-Tab</Strong></Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• <Strong>Cohort Retention</Strong>: Daily user cohorts with conversion retention curves, device breakdown, sessions/user metrics</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• <Strong>Session Engagement</Strong>: Per-session engagement scoring (actions × depth − errors). Histogram distribution, tier-based conversion rates, high-intent non-converter identification</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• <Strong>Third-Party Impact</Strong>: First-party vs. third-party resource analysis — request counts, payload size, avg duration. CWV correlation per page</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• <Strong>Error Clustering</Strong>: Group errors by type/pattern with occurrence counts, session impact, hourly trend chart, and sample messages</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• <Strong>Funnel Velocity</Strong> (Sankey sub-tab): Time-between-steps analysis with median/P90/avg per transition, journey time histogram, and bottleneck identification</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• 8 new DQL queries for cohort retention, session engagement, funnel velocity, third-party resources, CWV correlation, error clustering, and error trends</Paragraph>
          </div>
          <div style={{ marginBottom: 12, padding: "10px 14px", background: "rgba(128,128,128,0.04)", borderRadius: 8, borderLeft: "3px solid rgba(128,128,128,0.3)" }}>
            <Paragraph style={{ fontSize: 12, opacity: 0.5, marginBottom: 4 }}>May 9, 2026</Paragraph>
            <Paragraph><Strong>Funnel &amp; Sankey — New Chart Styles</Strong></Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Funnel Overview: 5 visualization styles — Classic, Horizontal Bar, Stacked Cohort, Elapsed-Time Curve, Comparison Split</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Horizontal Bar: left-aligned bars with red drop-off extensions showing where users are lost</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Stacked Cohort (Marimekko): columns split into converted vs. dropped segments at each step</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Elapsed-Time Curve: survival curve plotting % remaining vs. cumulative response time</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Comparison Split: mirror funnel — current vs. previous period side-by-side with delta indicators</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Funnel style persisted per user via Settings (default style configurable)</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Sankey: 7 chart styles (removed Sunburst &amp; Parallel Sets, added Chord Diagram &amp; Transition Heatmap)</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Chord Diagram: click arcs to select — highlights connected ribbons, focus mode hides unrelated, shows inbound/outbound detail</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Transition Heatmap: 52px cells, click to highlight row/column cross, selection summary with totals</Paragraph>
          </div>
          <div style={{ marginBottom: 12, padding: "10px 14px", background: "rgba(128,128,128,0.04)", borderRadius: 8, borderLeft: "3px solid rgba(128,128,128,0.3)" }}>
            <Paragraph style={{ fontSize: 12, opacity: 0.5, marginBottom: 4 }}>May 8, 2026</Paragraph>
            <Paragraph><Strong>Sankey — Funnel Analytics &amp; Health Scoring</Strong></Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Funnel pages highlighted in gold (★) with dashed borders across all 5 chart styles</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Exit detection: pages where ≥30% outbound traffic leaves the funnel flagged in red (⛔)</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Per-page Core Web Vitals (LCP, CLS, INP) and error counts on node selection</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Key Observations and Recommendations auto-generated from data</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Funnel Exit Analysis table with return rates and estimated lost revenue</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Off-Funnel Destinations table showing where users go after leaving</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Page Health Scorecard with composite health score (CWV + errors)</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Error counts in Health Scorecard link to <Strong>Dynatrace Error Inspector</Strong> filtered by page</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• 3 new DQL queries: CWV per page, errors per page, extended session paths</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• Rich hover tooltips: top 3 inbound/outbound with counts &amp; percentages, self-reload detection, error counts</Paragraph>
          </div>
        </div>
      </HelpSection>
      <HelpSection title="Overview">
        <Paragraph>The <Strong>User Journey & Experience</Strong> app provides comprehensive frontend observability for <Strong>{frontend}</Strong>. It tracks users through a {steps.length}-step conversion funnel using real-time DQL queries against Dynatrace Grail. The funnel is <Strong>strict sequential</Strong>: each step requires all previous steps.</Paragraph>
      </HelpSection>
      <HelpSection title="Funnel Steps">
        <div style={{ margin: "12px 0", padding: "12px 16px", background: "rgba(69,137,255,0.08)", borderRadius: 8 }}>
          {steps.map((step, i) => (
            <Paragraph key={i}><Strong>Step {i + 1} — {step.label}</Strong> ({step.type === "view" ? "view" : "XHR"}: {step.identifiers.join(" | ")}): {i === 0 ? "Entry point." : `Requires Step${i > 1 ? "s" : ""} 1${i > 1 ? `-${i}` : ""}.`}</Paragraph>
          ))}
        </div>
        <Paragraph style={{ fontSize: 13, opacity: 0.6, marginTop: 8 }}>Steps are configurable via Settings (⚙). Min {MIN_STEPS}, max {MAX_STEPS} steps. Each step supports <Strong>multiple pages</Strong> (OR logic) and <Strong>wildcards</Strong>: <code>/home*</code> (starts with), <code>*home</code> (ends with), <code>*home*</code> (contains). Logic: (Step1a OR Step1b) AND Step2 AND (Step3a OR Step3b) AND Step4.</Paragraph>
      </HelpSection>
      <HelpSection title="Tabs">
        <Paragraph><Strong>Funnel Overview</Strong>: KPI bar (sessions, conversions, conversion rate, Apdex, error rate, avg duration). Organized into 4 sub-tabs: <Strong>Conversion Funnel</Strong> — Apdex satisfaction breakdown tile, 5 chart styles (<Strong>Classic</Strong> tapered SVG, <Strong>Horizontal Bar</Strong> waterfall, <Strong>Stacked Cohort</Strong> Marimekko, <Strong>Elapsed-Time Curve</Strong> survival curve, <Strong>Comparison Split</Strong> mirror funnel), and a Compare toggle that overlays the previous period as dashed outlines. Default style configurable via Settings. <Strong>Predictive Model</Strong> — appears once ≥2 hourly data points exist for today; fits a linear regression on this-morning's hourly conversion rates and projects the end-of-day rate, hourly velocity, confidence score, and hours remaining on a sparkline with a dashed projection line. <Strong>Step Analysis</Strong> — sortable table of every funnel step with sessions, avg/P90 duration, Apdex, conversion %, abandons, and errors. <Strong>Per-Page Breakdown</Strong> — per-page metrics for steps that span multiple page identifiers; shows sessions, Apdex, avg/P90, errors, and a satisfaction mini-bar per page.</Paragraph>
        <Paragraph><Strong>Trends</Strong>: Period-over-period comparison of all key metrics across 11 cards (Sessions, Total Actions, Conversion Rate, Apdex, Avg/P50/P90 Duration, Error Rate, Errors, Frustrated, and optionally Revenue when AOV is set). Each card shows: current value with color-coded delta arrow, a <Strong>daily sparkline</Strong> tracing the metric's shape across the current period, and an inline <Strong>anomaly badge</Strong> — <Strong>⚠ Anomaly</Strong> (current value exceeds 2 std dev of daily variance — statistically unusual), <Strong>↑ Notable</Strong> (1.2–2 std dev — worth watching), or <Strong>∿ Normal</Strong> (&lt;1.2 std dev — within expected noise). Inverted logic applies for duration/errors (lower = better). Use anomaly badges to distinguish real regressions from day-to-day noise. The AI Insights panel at the top narrates the most critical changes and recommends next steps.</Paragraph>
        <Paragraph><Strong>Web Vitals</Strong>: Core Web Vitals gauges (LCP, CLS, INP, TTFB), CWV trend line showing improvement/degradation over time, automated remediation recommendations per failing vital (top offending pages + actionable fixes), page-level breakdown, and performance health score.</Paragraph>
        <Paragraph><Strong>Step Details</Strong>: Per-step deep dive with Apdex gauges, satisfaction breakdown bars, and duration percentiles (P50/P90/P99). For multi-page steps: a <Strong>Page Drop-off Contributors</Strong> funnel shows which pages within each step have the highest traffic volume vs. drop-off — bars are color-coded by Apdex (green/amber/red) and sorted by event count, with a percentage drop indicator showing how each page compares to the top contributor. A <Strong>Compare Pages</Strong> button reveals per-page metrics with the first page as the primary baseline — delta indicators show how each additional page performs relative to it. Each per-page breakdown now includes <Strong>Core Web Vitals (LCP, CLS, INP)</Strong> color-coded against Google thresholds for instant performance assessment.</Paragraph>
        <Paragraph><Strong>Worst Sessions</Strong>: Sessions ranked by an <Strong>AI Impact Score</Strong> that uses z-score normalization across severity dimensions (errors, frustrated actions, avg/max latency) weighted by a systemic multiplier — sessions whose error patterns appear across many other sessions score higher than isolated outliers. Each row shows its Impact score (0–100), a <Strong>"Sessions Like This"</Strong> cluster count indicating how many sessions share the same behavioral fingerprint, and a <Strong>SYSTEMIC</Strong> badge for sessions representing repeatable patterns. A <Strong>Pattern Clusters</Strong> section groups sessions by behavioral fingerprint to distinguish widespread bugs from one-off edge cases. Each session links to <Strong>Dynatrace Session Replay</Strong>.</Paragraph>
        <Paragraph><Strong>Exceptions</Strong>: JavaScript exceptions with inline source map deobfuscation (file:line:col) and a regression detector that classifies each error as NEW, RECURRING, or REGRESSION. Cards styled like Metric Forecasts with compact grid layout, severity-colored left border, and status badges.</Paragraph>
        <Paragraph><Strong>Click Issues</Strong>: Detects rage clicks (rapid repeated clicks indicating frustration) and dead clicks (clicks on non-responsive elements). Shows the worst offending elements, pages, and session impact to guide UX fixes.</Paragraph>
        <Paragraph><Strong>Perf Budgets</Strong>: User-configurable budget thresholds (click ✎ to edit, persisted per user). Tracks actual vs target with pass/fail/near-breach status. Projected time-to-breach per metric based on period-over-period trend. Alert banners when within 10% of breach with workflow trigger DQL suggestions. Hourly Apdex distribution for peak-hour analysis.</Paragraph>
        <Paragraph><Strong>Geo Heatmap</Strong>: Country and city-level performance with Apdex color-coding and satisfaction bars. Identifies regions with poor user experience for targeted CDN placement or infrastructure optimization. Includes city-level drill-down for granular insights. Country cards are clickable and open <Strong>User Sessions</Strong> filtered to that location.</Paragraph>
        <Paragraph><Strong>Map</Strong>: Interactive choropleth map with World and US views, colorized by session count, average duration, Apdex, error rate, or estimated revenue (when AOV is set). Use the dropdown to switch between World (country-level) and US (state-level) views. Countries/states with data are clickable and link to <Strong>User Sessions</Strong>.</Paragraph>
        <Paragraph><Strong>Navigation Paths</Strong>: Shows actual user navigation flows (not just the expected funnel). Reveals unexpected paths, loops, and exit points. Flow visualization groups transitions by source page, highlighting funnel-aligned vs. off-path navigation. Page names are clickable and open the <Strong>Vitals</Strong> app for detailed analysis.</Paragraph>
        <Paragraph><Strong>Sankey</Strong>: Interactive Sankey flow diagram with 9 analysis sub-tabs organized above the chart. <Strong>Flow Chart</Strong> (default): 7 chart styles — Classic, Gradient, Directed Flow, Alluvial, State Machine, <Strong>Chord Diagram</Strong> (circular arc layout with clickable arcs for path highlighting, focus mode support, center label display), and <Strong>Transition Heatmap</Strong> (NxN grid with clickable row/column highlighting, selection summary, 52px cells). All styles support funnel highlighting, exit detection, and focus mode. <Strong>Conversion Paths</Strong>: Compares converted vs. abandoned session paths — shows differentiating pages, path lengths, and top transitions for each group. <Strong>Loop Analysis</Strong>: Detects A→B→A back-and-forth navigation patterns indicating user confusion, with error/LCP correlation. <Strong>Page Timing</Strong>: Average and P90 duration per page with health scores — identifies slow funnel bottlenecks. <Strong>Session Endpoints</Strong>: Where sessions end (browser close), bounce rate, and terminal page analysis with error correlation. <Strong>Revenue Paths</Strong> (AOV required): Top revenue-generating navigation paths and page touch rates for converting sessions. <Strong>Path Trends</Strong>: Period-over-period comparison of navigation patterns — detects new/dropped pages, frequency shifts, and transition changes. <Strong>Funnel Leakage</Strong>: Deep analysis of users who navigate away from the funnel — classifies sessions into recoverers (returned) vs lost users, compares their behavior, identifies exit step hotspots, maps off-funnel destinations, and correlates exit pages with CWV/errors for performance-driven optimization. <Strong>Funnel Velocity</Strong>: Measures time between funnel step transitions — shows median, P90, and average per step pair, journey time distribution histogram, and identifies the slowest transitions causing friction.</Paragraph>
        <Paragraph><Strong>Anomaly Detection</Strong>: Flags metrics with significant deviation from baseline (previous period). Shows stability score, per-metric severity (normal/medium/high/critical), per-step traffic anomalies, and a duration distribution histogram. Includes automated diagnosis with actionable recommendations. When AOV is set, shows Revenue at Risk from anomalous conversion drops.</Paragraph>
        <Paragraph><Strong>Conversion Attribution</Strong>: Correlates conversion rates with performance factors. Shows how session speed, device type, and browser affect conversion. Speed buckets (fast/medium/slow) quantify the revenue impact of performance, with full device x browser cross-section. When AOV is set, adds revenue columns to device and browser tables and revenue totals to speed buckets.</Paragraph>
        <Paragraph><Strong>Executive Summary</Strong>: Report-card style overview for stakeholders. Weighted letter grade (A-F), key metric trends, funnel summary, bottleneck alert, CWV snapshot, and full performance table. When AOV is set, revenue appears in key metrics, performance snapshot, and exports. Use <Strong>Export PDF</Strong> to open a print-ready report in a new tab (use browser Print → Save as PDF), or <Strong>Copy Text</Strong> to get a plain-text summary for Slack/Teams/email. Designed for quick status checks and executive presentations.</Paragraph>
        <Paragraph><Strong>Segmentation</Strong>: Device, browser, and geo breakdowns with Apdex per segment.</Paragraph>
        <Paragraph><Strong>Errors &amp; Drop-offs</Strong>: Drop-off analysis between funnel steps with optimization recommendations. When AOV is set, each drop-off card shows the estimated revenue at risk from abandoned sessions.</Paragraph>
        <Paragraph><Strong>What-If Analysis</Strong>: Traffic impact modeling with projected Apdex, latency, and conversion degradation. When AOV is set in Settings, also shows revenue impact: projected revenue at higher traffic, net revenue change, conversion degradation loss, and a "Perf Tax" breakdown showing revenue lost to performance under load.</Paragraph>
        <Paragraph><Strong>Root Cause Correlation</Strong>: Automatically correlates conversion drops with technical signals — latency spikes, error surges, and frustrated sessions — on an hourly timeline. Identifies which funnel steps degrade at the exact hours conversion dips. Surfaces ranked root cause signals with severity and confidence scores so you can pinpoint the technical driver behind every conversion drop without manual cross-referencing. When AOV is set, shows the estimated revenue at risk from sessions occurring during impact hours.</Paragraph>
        <Paragraph><Strong>Predictive Forecasting</Strong>: Uses trend data from the selected timeframe to project Apdex, conversion rate, error rate, and average duration forward 7 days via linear regression. Flags when a metric is on trajectory to breach a performance budget threshold before it actually happens. Includes trend direction, rate of change, and days-to-breach estimates for proactive incident prevention.</Paragraph>
        <Paragraph><Strong>Resource Waterfall</Strong>: Aggregated resource timing per funnel step — third-party scripts, XHR/Fetch calls, images, CSS, and fonts. Top 10 Slowest Resources section shows individual requests ranked by duration with clickable session links. Session Drill-Down panel lets you select a specific session to see all resources loaded in that session (with full replay link). Includes per-step resource type breakdown, visual waterfall bar chart with P50/P90 ranges, and optimization recommendations.</Paragraph>
        <Paragraph><Strong>Change Intelligence</Strong>: Pulls deployment events from Dynatrace and overlays them on an hourly performance timeline. Automatically compares metrics in the window before and after each deployment to detect regressions. Shows before/after Apdex, duration, error rate, and frustrated % with severity classification. When AOV is set, shows estimated revenue loss per regression and total revenue impact across all regressive deployments. Use to validate whether a deploy caused a performance regression or improvement.</Paragraph>
        <Paragraph><Strong>SLO Tracker</Strong>: Define Service Level Objectives for Apdex, error rate, LCP, CLS, INP, and TTFB with user-editable targets (click ✎ to customize, persisted per user). Tracks error budget burn-down with hourly granularity. Shows remaining budget %, burn rate, and projected time to exhaustion. One-click "Create SLO" button per metric provisions the SLO natively in the Dynatrace platform (opens SLO settings pre-filled). Color-coded status indicators flag SLOs at risk before they breach.</Paragraph>
        <Paragraph><Strong>Session Replay Spotlight</Strong>: Surfaces the highest-impact session replays ranked by an impact score combining errors, crashes, bounces, and interaction density. Shows session duration, error count, device, browser, and country. Each session links directly to <Strong>Dynatrace Session Replay</Strong> for instant visual debugging. Quickly find the sessions that matter most without manually searching.</Paragraph>
        <Paragraph><Strong>A/B Comparison</Strong>: Compare two user segments side-by-side across all key metrics. Pre-built segments for Desktop vs. Mobile, Chrome vs. Firefox, and US vs. non-US — or enter custom DQL filter expressions. Shows Apdex, conversion, error rate, duration, and Core Web Vitals for each segment with delta indicators highlighting which segment performs better. Use to quantify platform-specific gaps and prioritize optimization efforts.</Paragraph>
        <Paragraph><Strong>Revenue Intelligence</Strong>: Comprehensive revenue analytics powered by the Average Order Value (AOV) set in Settings. Shows current vs. previous period revenue with change indicators, revenue per session, and three performance taxes: latency tax (revenue lost to slow pages), frustration tax (revenue lost to frustrated sessions), and error tax (revenue lost to errors). Includes a funnel leakage table showing estimated revenue lost at each drop-off step, and ranked optimization opportunities with projected revenue uplift for each improvement action. Requires AOV &gt; 0 in Settings.</Paragraph>
        <Paragraph><Strong>Cohort Retention</Strong>: Daily user cohort analysis showing sessions, unique users, conversions, and conversion rate per day. Includes device-type breakdown (desktop vs. mobile vs. tablet conversion rates), sessions-per-user engagement metric, and daily trend chart with conversion rate overlay. When AOV is set, shows cohort revenue totals.</Paragraph>
        <Paragraph><Strong>Session Engagement</Strong>: Assigns an engagement score (0-100) to each session based on actions taken (30%), funnel depth reached (40%), and error penalty (30%). Visualizes score distribution histogram with conversion overlay, shows conversion rate by engagement tier (high/medium/low), and surfaces high-intent non-converters — engaged users who didn't convert, representing the biggest optimization opportunity.</Paragraph>
        <Paragraph><Strong>Third-Party Impact</Strong>: Analyzes first-party vs. third-party resource loading. Shows request counts, payload sizes, and average durations per domain. Identifies third-party domains that may be slowing down pages. Includes page-level CWV data for correlation analysis — helps determine if third-party scripts are degrading Core Web Vitals.</Paragraph>
        <Paragraph><Strong>Error Clustering</Strong>: Groups JavaScript errors by type/pattern to help prioritize fixes. Shows occurrence count, affected sessions, and impact percentage per error cluster. Includes hourly error trend chart for detecting spikes, top clusters bar chart, and sample error messages for quick identification. Focus on high-impact clusters first.</Paragraph>
      </HelpSection>
      <HelpSection title="Auto-Refresh">
        <Paragraph>The <Strong>Auto-Refresh</Strong> selector in the header controls automatic data re-fetching. Options: <Strong>Off</Strong> (manual only), <Strong>30 seconds</Strong>, <Strong>1 minute</Strong>, <Strong>5 minutes</Strong>, <Strong>10 minutes</Strong>. When active, all DQL queries across every tab re-execute at the chosen interval. Data updates seamlessly in-place — existing values remain visible during refresh (no loading spinners). A status indicator shows "Refreshing…" with a spinner during fetch, and "Last refreshed Xs ago" when idle. Use for wall displays, NOC dashboards, or continuous incident monitoring.</Paragraph>
      </HelpSection>
      <HelpSection title="Tab Settings">
        <Paragraph>Click the <Strong>gear icon</Strong> (⚙) next to the help button to open Settings. Each of the 30 tabs can be toggled on or off individually. Drag to reorder. Settings are saved per user via Dynatrace App State — they persist across sessions and browser refreshes. All tabs default to visible. Hiding a tab does not affect data collection, only display.</Paragraph>
        <Paragraph><Strong>Frontend Application</Strong>: Searchable dropdown listing all applications with session data in the last 30 days. Selecting a different app immediately re-queries all data and updates the Pages / Identifiers dropdowns for the new app.</Paragraph>
        <Paragraph><Strong>Funnel Steps — Pages / Identifiers</Strong>: Each identifier is a searchable dropdown showing all distinct page names seen for the selected app in the last 7 days. Current saved values (including wildcard patterns such as <code>/home*</code>) appear as valid options even if they are not in the fetched list. Use the search filter to narrow long lists. Both dropdowns load only when Settings is open.</Paragraph>
        <Paragraph><Strong>Average Order Value</Strong>: Set in Settings to enable revenue metrics across What-If Analysis, Revenue Intelligence, Errors &amp; Drop-offs, Conversion Attribution, Map, Root Cause Correlation, Trends, Executive Summary, Anomaly Detection, and Change Intelligence tabs. This value represents the average revenue per conversion (final funnel step completion). Set to 0 to hide revenue metrics.</Paragraph>
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
        <Paragraph>• Sankey highlights funnel pages in gold — click any node to see CWV health, errors, and exit analysis. Check the Funnel Exit Analysis table to find where users leave and whether they return. Error counts in the Page Health Scorecard link directly to Dynatrace Error Inspector for instant drill-down.</Paragraph>
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
        <Paragraph>• Revenue Intelligence translates performance metrics into dollar impact — use it to build ROI cases for performance optimization.</Paragraph>
        <Paragraph>• Cohort Retention reveals daily user cohort patterns — look for days with unusually low conversion to correlate with releases or campaigns.</Paragraph>
        <Paragraph>• Session Engagement highlights high-intent non-converters — these are users who engaged deeply but didn't convert, representing your biggest optimization opportunity.</Paragraph>
        <Paragraph>• Third-Party Impact helps justify removing or lazy-loading slow third-party scripts — check which domains have the highest request count and duration.</Paragraph>
        <Paragraph>• Error Clustering groups similar errors together — fix the top cluster first for maximum session impact reduction.</Paragraph>
        <Paragraph>• Funnel Velocity (Sankey sub-tab) identifies the slowest step transitions — if P90 is much higher than median, a subset of users is struggling disproportionately.</Paragraph>
        <Paragraph>• Set Average Order Value in Settings to unlock revenue projections in What-If Analysis and Revenue Intelligence tabs.</Paragraph>
        <Paragraph>• Click <Strong>AI Insights</Strong> (✦) in the header bar to get instant, data-driven analysis for whichever tab you're viewing — Summary, Insights, and Recommendations powered by industry benchmarks.</Paragraph>
        <Paragraph>• The <Strong>Predictive Model</Strong> sub-tab is most reliable after 6+ hours of today's data. Early-morning projections have wide confidence intervals — check again at midday for a stable EOD forecast.</Paragraph>
        <Paragraph>• The <Strong>Step Analysis</Strong> sub-tab's sortable table is the fastest way to find which funnel step has the worst Apdex or highest abandon count — sort by "Conv %" ascending or "Abandons" descending.</Paragraph>
      </HelpSection>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 16, marginTop: 8 }}>
        <Paragraph><span style={{ color: "rgba(128,128,128,0.8)" }}>Source code &amp; issue tracker: </span><Link href="https://github.com/TechShady/user-journey-app" target="_blank" rel="noopener noreferrer">github.com/TechShady/user-journey-app</Link></Paragraph>
      </div>
    </div>
  );
}

// ===========================================================================
// MAIN COMPONENT
// ===========================================================================
export function UserJourney() {
  const [timeframeDays, setTimeframeDays] = useState<number>(DEFAULT_TIMEFRAME);
  const [timeframeRaw, setTimeframeRaw] = useState<Timeframe | null>(null);
  const [timeframeAnchor, setTimeframeAnchor] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [tabVisibility, setTabVisibility] = useState<Record<TabKey, boolean>>(DEFAULT_TAB_VISIBILITY);
  const [tabOrder, setTabOrder] = useState<TabKey[]>([...DEFAULT_TAB_ORDER]);
  const [draggedTabIdx, setDraggedTabIdx] = useState<number | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const closeAiInsights = React.useCallback(() => setAiOpen(false), []);
  const aiContextValue = React.useMemo(() => ({ open: aiOpen, close: closeAiInsights }), [aiOpen, closeAiInsights]);
  const { frontend, steps, saveFrontend, saveSteps, aov, saveAov } = useSettings();
  const [sankeyStyle, setSankeyStyle] = useState<SankeyStyle>(DEFAULT_SANKEY_STYLE);
  const [funnelStyle, setFunnelStyle] = useState<FunnelStyle>(DEFAULT_FUNNEL_STYLE);
  const [refreshIntervalMs, setRefreshIntervalMs] = useState<number>(0);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number>(Date.now());

  // Persist tab visibility per user
  const savedState = useUserAppState({ key: TAB_STATE_KEY });
  const savedTabOrder = useUserAppState({ key: TAB_ORDER_STATE_KEY });
  const savedSankeyStyle = useUserAppState({ key: SANKEY_STYLE_STATE_KEY });
  const savedFunnelStyle = useUserAppState({ key: FUNNEL_STYLE_STATE_KEY });
  const savedMapView = useUserAppState({ key: MAP_VIEW_STATE_KEY });
  const savedBudgetThresholds = useUserAppState({ key: BUDGET_THRESHOLDS_STATE_KEY });
  const savedSloTargets = useUserAppState({ key: SLO_TARGETS_STATE_KEY });
  const { execute: saveState } = useSetUserAppState();

  useEffect(() => {
    if (savedState.data?.value) {
      try {
        const parsed = JSON.parse(savedState.data.value as string);
        setTabVisibility(prev => ({ ...prev, ...parsed }));
      } catch { /* ignore parse errors */ }
    }
  }, [savedState.data?.value]);

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
  }, [savedTabOrder.data?.value]);

  useEffect(() => {
    if (savedSankeyStyle.data?.value) {
      const val = savedSankeyStyle.data.value as string;
      if (SANKEY_STYLE_OPTIONS.some(o => o.value === val)) setSankeyStyle(val as SankeyStyle);
    }
  }, [savedSankeyStyle.data?.value]);

  useEffect(() => {
    if (savedFunnelStyle.data?.value) {
      const val = savedFunnelStyle.data.value as string;
      if (FUNNEL_STYLE_OPTIONS.some(o => o.value === val)) setFunnelStyle(val as FunnelStyle);
    }
  }, [savedFunnelStyle.data?.value]);

  const [mapViewDefault, setMapViewDefault] = useState<MapViewSetting>(DEFAULT_MAP_VIEW);
  useEffect(() => {
    if (savedMapView.data?.value) {
      const val = savedMapView.data.value as string;
      if (MAP_VIEW_OPTIONS.some(o => o.value === val)) setMapViewDefault(val as MapViewSetting);
    }
  }, [savedMapView.data?.value]);

  // Fix: Mac browsers block target="_blank" inside sandboxed iframes.
  // Intercept all such clicks and use window.open() as a direct user gesture.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a[target="_blank"]') as HTMLAnchorElement | null;
      if (!anchor) return;
      // getAttribute works for both HTML <a> and SVG <a> elements
      const href = anchor.getAttribute('href');
      if (href) {
        e.preventDefault();
        window.open(href, '_blank', 'noopener,noreferrer');
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

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
  // Sync the module-level query anchor BEFORE building any query strings, so
  // arrow-shifted (past-window) timeframes produce queries against the
  // shifted window and re-key useDql to refetch.
  setQueryAnchorMs(timeframeAnchor);
  setCurrentTimeframeDays(timeframeDays);
  const refetchOpts = refreshIntervalMs > 0 ? { refetchInterval: refreshIntervalMs } : undefined;
  const funnelResult = useDql({ query: sessionFlowQuery(timeframeDays, frontend, steps, false) }, refetchOpts);
  const stepMetrics = useDql({ query: stepMetricsQuery(timeframeDays, frontend, steps) }, refetchOpts);
  const hasMultiPageSteps = steps.some(s => s.identifiers.length > 1);
  const pageMetrics = useDql({ query: hasMultiPageSteps ? pageMetricsQuery(timeframeDays, frontend, steps) : "fetch user.events | limit 0" }, refetchOpts);
  const cwvResult = useDql({ query: cwvQuery(timeframeDays, frontend) }, refetchOpts);
  const cwvByPage = useDql({ query: cwvByPageQuery(timeframeDays, frontend) }, refetchOpts);
  const deviceData = useDql({ query: deviceQuery(timeframeDays, frontend, steps) }, refetchOpts);
  const browserData = useDql({ query: browserQuery(timeframeDays, frontend, steps) }, refetchOpts);
  const geoData = useDql({ query: geoQuery(timeframeDays, frontend, steps) }, refetchOpts);
  const errorData = useDql({ query: errorQuery(timeframeDays, frontend, steps) }, refetchOpts);
  const qualityData = useDql({ query: sessionQualityQuery(timeframeDays, frontend, steps, false) }, refetchOpts);

  // Previous period queries (for Trends + Funnel Compare)
  const funnelResultPrev = useDql({ query: sessionFlowQuery(timeframeDays, frontend, steps, true) }, refetchOpts);
  const qualityDataPrev = useDql({ query: sessionQualityQuery(timeframeDays, frontend, steps, true) }, refetchOpts);
  const sparklineData = useDql({ query: trendsSparklineQuery(timeframeDays, frontend, steps) }, refetchOpts);
  const convSparklineData = useDql({ query: trendsConvSparklineQuery(timeframeDays, frontend, steps) }, refetchOpts);

  // Today's hourly funnel data for predictive EOD model
  const todayFunnelData = useDql({ query: todayFunnelHourlyQuery(frontend, steps) }, refetchOpts);

  // NEW: Worst Sessions + Exceptions
  const worstSessionsData = useDql({ query: worstSessionsQuery(timeframeDays, frontend, steps) }, refetchOpts);
  const jsErrorsData = useDql({ query: jsErrorsQuery(timeframeDays, frontend) }, refetchOpts);
  const jsErrorsPrevData = useDql({ query: jsErrorsQuery(timeframeDays, frontend, true) }, refetchOpts);

  // NEW: Rage/Dead Clicks
  const clickIssuesData = useDql({ query: clickIssuesQuery(timeframeDays, frontend) }, refetchOpts);

  // NEW: Geo Performance, Navigation Paths, Hourly Distribution
  const geoPerformanceData = useDql({ query: geoPerformanceQuery(timeframeDays, frontend, steps) }, refetchOpts);
  const navigationPathsData = useDql({ query: navigationPathsQuery(timeframeDays, frontend) }, refetchOpts);
  const sankeyData = useDql({ query: sankeyQuery(timeframeDays, frontend) }, refetchOpts);
  const sankeyCwvData = useDql({ query: sankeyCwvPerPageQuery(timeframeDays, frontend) }, refetchOpts);
  const sankeyErrorData = useDql({ query: sankeyErrorsPerPageQuery(timeframeDays, frontend) }, refetchOpts);
  const sankeyPathsData = useDql({ query: sankeyExtendedPathsQuery(timeframeDays, frontend) }, refetchOpts);
  const sankeyDurationData = useDql({ query: sankeyPageDurationQuery(timeframeDays, frontend) }, refetchOpts);
  const sankeyPrevPaths = useDql({ query: sankeyPrevPathsQuery(timeframeDays, frontend) }, refetchOpts);
  const appEntityData = useDql({ query: appEntityQuery(frontend) });
  const appEntityId = (appEntityData.data?.records?.[0] as any)?.['id'] ?? '';
  const settingsAppsData = useDql({ query: showSettings ? availableAppsQuery() : "fetch user.events | limit 0" });
  const settingsPagesData = useDql({ query: (showSettings && frontend) ? availablePagesQuery(frontend) : "fetch user.events | limit 0" });
  const availableApps: string[] = (settingsAppsData.data?.records ?? []).map((r: any) => r['frontend.name']).filter(Boolean);
  const availablePages: string[] = (settingsPagesData.data?.records ?? []).map((r: any) => r['view.name']).filter(Boolean);
  const hourlyDistributionData = useDql({ query: hourlyDistributionQuery(timeframeDays, frontend, steps) }, refetchOpts);

  // NEW: Conversion Attribution, Duration Distribution
  const conversionAttributionData = useDql({ query: conversionAttributionQuery(timeframeDays, frontend, steps) }, refetchOpts);
  const durationDistributionData = useDql({ query: sessionDurationDistributionQuery(timeframeDays, frontend, steps) }, refetchOpts);

  // NEW: Root Cause Correlation
  const rootCauseCorrelationData = useDql({ query: rootCauseCorrelationQuery(timeframeDays, frontend, steps) }, refetchOpts);
  const rootCauseStepDropData = useDql({ query: rootCauseStepDropQuery(timeframeDays, frontend, steps) }, refetchOpts);

  // NEW: Predictive Forecasting
  const forecastTrendData = useDql({ query: forecastTrendQuery(timeframeDays, frontend, steps) }, refetchOpts);
  const forecastApdexTrendData = useDql({ query: forecastApdexTrendQuery(timeframeDays, frontend, steps) }, refetchOpts);
  const forecastVitalsTrendData = useDql({ query: forecastVitalsTrendQuery(timeframeDays, frontend) }, refetchOpts);

  // NEW: Resource Waterfall
  const resourceWaterfallData = useDql({ query: resourceWaterfallQuery(timeframeDays, frontend, steps) }, refetchOpts);
  const resourceByStepData = useDql({ query: resourceByStepQuery(timeframeDays, frontend, steps) }, refetchOpts);
  const resourceSessionDrillData = useDql({ query: resourceSessionDrillQuery(timeframeDays, frontend, steps) }, refetchOpts);

  // NEW: Change Intelligence
  const deploymentEventsData = useDql({ query: deploymentEventsQuery(timeframeDays) }, refetchOpts);
  const changeImpactData = useDql({ query: changeImpactQuery(timeframeDays, frontend, steps) }, refetchOpts);

  // NEW: SLO Tracker
  const sloApdexTrendData = useDql({ query: sloApdexTrendQuery(timeframeDays, frontend, steps) }, refetchOpts);
  const sloCwvTrendData = useDql({ query: sloCwvTrendQuery(timeframeDays, frontend) }, refetchOpts);

  // NEW: Session Replay Spotlight
  const sessionReplayData = useDql({ query: sessionReplayQuery(timeframeDays, frontend) }, refetchOpts);

  // NEW: A/B Comparison (state-driven segments)
  const [abDimension, setAbDimension] = useState<"device" | "browser" | "country" | "custom">("device");
  const [abSegA, setAbSegA] = useState('device.type == "desktop"');
  const [abSegB, setAbSegB] = useState('device.type == "mobile"');
  const abSegAData = useDql({ query: abSegmentQuery(timeframeDays, frontend, steps, abSegA) }, refetchOpts);
  const abSegBData = useDql({ query: abSegmentQuery(timeframeDays, frontend, steps, abSegB) }, refetchOpts);
  const abSegACwv = useDql({ query: abSegmentCwvQuery(timeframeDays, frontend, abSegA) }, refetchOpts);
  const abSegBCwv = useDql({ query: abSegmentCwvQuery(timeframeDays, frontend, abSegB) }, refetchOpts);

  // NEW: Cohort Retention
  const cohortRetentionData = useDql({ query: cohortRetentionQuery(timeframeDays, frontend, steps) }, refetchOpts);
  const cohortSessionData = useDql({ query: cohortSessionCountQuery(timeframeDays, frontend) }, refetchOpts);

  // NEW: Session Engagement Score
  const sessionEngagementData = useDql({ query: sessionEngagementQuery(timeframeDays, frontend, steps) }, refetchOpts);

  // NEW: Funnel Velocity (Sankey sub-tab)
  const funnelVelocityData = useDql({ query: funnelVelocityQuery(timeframeDays, frontend, steps) }, refetchOpts);

  // NEW: Third-Party Impact
  const thirdPartyData = useDql({ query: thirdPartyImpactQuery(timeframeDays, frontend) }, refetchOpts);
  const thirdPartyCwvData = useDql({ query: thirdPartyCwvCorrelationQuery(timeframeDays, frontend) }, refetchOpts);

  // NEW: Error Clustering
  const errorClusterData = useDql({ query: errorClusteringQuery(timeframeDays, frontend) }, refetchOpts);
  const errorTrendData = useDql({ query: errorTrendQuery(timeframeDays, frontend) }, refetchOpts);

  // NEW: Enhanced tab queries
  const geoNetworkData = useDql({ query: geoNetworkQuery(timeframeDays, frontend) }, refetchOpts);
  const geoConversionData = useDql({ query: geoConversionQuery(timeframeDays, frontend, steps) }, refetchOpts);
  const mapTimelapseData = useDql({ query: mapTimelapseQuery(timeframeDays, frontend, steps) }, refetchOpts);
  const osVersionData = useDql({ query: osVersionQuery(timeframeDays, frontend, steps) }, refetchOpts);
  const navPathConvData = useDql({ query: navPathConversionQuery(timeframeDays, frontend, steps) }, refetchOpts);
  const clickReplayData = useDql({ query: clickIssuesReplayQuery(timeframeDays, frontend) }, refetchOpts);
  const davisProblemsData = useDql({ query: davisProblemsQuery(timeframeDays, frontend) }, refetchOpts);
  const backendServicesData = useDql({ query: backendServicesQuery(timeframeDays, frontend) }, refetchOpts);
  const featureFlagData = useDql({ query: featureFlagEventsQuery(timeframeDays) }, refetchOpts);
  const utmAttributionData = useDql({ query: utmAttributionQuery(timeframeDays, frontend, steps) }, refetchOpts);
  const hostMetricsData = useDql({ query: hostMetricsQuery(timeframeDays) }, refetchOpts);


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

  // Parse per-page metrics (for multi-page step comparison)
  const pageMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of (pageMetrics.data?.records ?? []) as any[]) {
      const key = String(r["view.name"] ?? r["url.path"] ?? "");
      if (key) m.set(key, r);
    }
    return m;
  }, [pageMetrics.data]);

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
  const isFunnelFetching = funnelResult.isFetching || stepMetrics.isFetching || qualityData.isFetching;

  // Track last refreshed timestamp — update whenever queries finish fetching
  const prevFetchingRef = useRef(false);
  useEffect(() => {
    if (prevFetchingRef.current && !isFunnelFetching) {
      setLastRefreshedAt(Date.now());
    }
    prevFetchingRef.current = isFunnelFetching;
  }, [isFunnelFetching]);

  // Ticker to keep "last refreshed X ago" text updating in the header
  const [, setHeaderTick] = useState(0);
  useEffect(() => {
    if (refreshIntervalMs <= 0) return;
    const id = setInterval(() => setHeaderTick(t => t + 1), 10000);
    return () => clearInterval(id);
  }, [refreshIntervalMs]);

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
            <Heading level={3} style={{ margin: 0 }}>User Journey & Experience</Heading>
            <Text style={{ fontSize: 12, opacity: 0.6 }}>{frontend}</Text>
          </div>
        </Flex>
        <Flex alignItems="center" gap={12}>
          <Strong style={{ fontSize: 12 }}>Timeframe</Strong>
          <div style={{ minWidth: 280 }}>
            <TimeframeSelector
              value={timeframeRaw ?? { from: "now()-2h", to: "now()" }}
              onChange={(tf) => {
                setTimeframeRaw(tf);
                const d = timeframeToDays(tf);
                if (d != null) setTimeframeDays(d);
                else setTimeframeDays(DEFAULT_TIMEFRAME);
                setTimeframeAnchor(timeframeAnchorMs(tf));
              }}
            />
          </div>
          <Strong style={{ fontSize: 12 }}>Auto-Refresh</Strong>
          <Select value={String(refreshIntervalMs)} onChange={(val) => { if (val != null) setRefreshIntervalMs(Number(val)); }}>
            <Select.Trigger style={{ minWidth: 120 }} />
            <Select.Content>
              <Select.Option value="0">Off</Select.Option>
              <Select.Option value="30000">30 seconds</Select.Option>
              <Select.Option value="60000">1 minute</Select.Option>
              <Select.Option value="300000">5 minutes</Select.Option>
              <Select.Option value="600000">10 minutes</Select.Option>
            </Select.Content>
          </Select>
          {refreshIntervalMs > 0 && (
            <Flex alignItems="center" gap={4}>
              {isFunnelFetching && (
                <svg width="12" height="12" viewBox="0 0 14 14" style={{ animation: "spin 1s linear infinite" }}>
                  <circle cx="7" cy="7" r="5.5" fill="none" stroke="rgba(69,137,255,0.4)" strokeWidth="2" />
                  <path d="M7 1.5 A5.5 5.5 0 0 1 12.5 7" fill="none" stroke="#4589FF" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
              <Text style={{ fontSize: 11, opacity: 0.5 }}>{isFunnelFetching ? "Refreshing…" : formatTimeAgo(lastRefreshedAt)}</Text>
            </Flex>
          )}
          <AIInsightsButton active={aiOpen} onClick={() => setAiOpen(v => !v)} />
          <button onClick={() => setShowHelp(true)} className="uj-help-btn" title="Help"><svg width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="10" fill="none" stroke="rgba(128,128,128,0.5)" strokeWidth="1.5" /><text x="11" y="15.5" textAnchor="middle" fill="rgba(128,128,128,0.7)" fontSize="14" fontWeight="700">?</text></svg></button>
          <button onClick={() => setShowSettings(true)} className="uj-help-btn" title="Settings" style={{ marginLeft: 4 }}><svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="10" fill="none" stroke="rgba(128,128,128,0.5)" strokeWidth="1.5" /><path d="M11 7v1.5M11 13.5V15M7 11h1.5M13.5 11H15M8.5 8.5l1 1M12.5 12.5l1 1M13.5 8.5l-1 1M9.5 12.5l-1 1" stroke="rgba(128,128,128,0.7)" strokeWidth="1.5" strokeLinecap="round" /><circle cx="11" cy="11" r="2" stroke="rgba(128,128,128,0.7)" strokeWidth="1.5" /></svg></button>
          <Text style={{ fontSize: 11, opacity: 0.4, fontFamily: "monospace", marginLeft: 8 }}>v4.47.77</Text>
        </Flex>
      </div>
      <Sheet title="User Journey & Experience — Help & Documentation" show={showHelp} onDismiss={() => setShowHelp(false)} actions={<Button variant="emphasized" onClick={() => setShowHelp(false)}>Close</Button>}><HelpContent frontend={frontend} steps={steps} /></Sheet>
      <Sheet title="Settings" show={showSettings} onDismiss={() => setShowSettings(false)} actions={<Button variant="emphasized" onClick={() => setShowSettings(false)}>Close</Button>}>
        <div style={{ padding: "4px 0" }}>
          {/* Frontend Application Name */}
          <Paragraph style={{ marginBottom: 4, fontWeight: 600 }}>Frontend Application</Paragraph>
          <Paragraph style={{ marginBottom: 8, opacity: 0.6, fontSize: 12 }}>Select the Dynatrace frontend application to monitor. The list shows apps with data in the last 30 days. Changes take effect immediately.</Paragraph>
          <div style={{ marginBottom: 20 }}>
            {settingsAppsData.isLoading ? (
              <ProgressBar style={{ width: "100%" }} />
            ) : (
              <Select value={frontend} onChange={(val) => { if (val) saveFrontend(val); }}>
                <Select.Trigger />
                <Select.Content>
                  <Select.Filter />
                  {frontend && !availableApps.includes(frontend) && (
                    <Select.Option value={frontend}>{frontend}</Select.Option>
                  )}
                  {availableApps.map(app => (
                    <Select.Option key={app} value={app}>{app}</Select.Option>
                  ))}
                  {availableApps.length === 0 && (
                    <Select.Option value="" disabled>No applications found</Select.Option>
                  )}
                </Select.Content>
              </Select>
            )}
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginBottom: 12 }} />
          {/* Funnel Steps */}
          <Paragraph style={{ marginBottom: 4, fontWeight: 600 }}>Funnel Steps</Paragraph>
          <Paragraph style={{ marginBottom: 12, opacity: 0.6, fontSize: 12 }}>Define the user journey steps (min {MIN_STEPS}, max {MAX_STEPS}). Each step can have multiple pages (OR logic within a step). Wildcards supported: <Strong>/home*</Strong>, <Strong>*home</Strong>, <Strong>*home*</Strong>. Logic: (Step1a OR Step1b) AND Step2 AND Step3.</Paragraph>
          {steps.map((step, i) => (
            <div key={i} style={{ marginBottom: 12, padding: "10px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
              <Flex alignItems="center" justifyContent="space-between" style={{ marginBottom: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: 700, color: BLUE }}>Step {i + 1}</Text>
                {steps.length > MIN_STEPS && (
                  <button onClick={() => { const next = steps.filter((_, j) => j !== i); saveSteps(next); }} style={{ background: "none", border: "none", color: RED, cursor: "pointer", fontSize: 12, padding: "2px 6px" }}>✕ Remove</button>
                )}
              </Flex>
              <Flex gap={8} style={{ marginBottom: 6 }}>
                <div style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, opacity: 0.5, display: "block", marginBottom: 2 }}>Label</Text>
                  <TextInput value={step.label} onChange={(val) => { const next = [...steps]; next[i] = { ...next[i], label: val ?? "" }; saveSteps(next); }} placeholder="e.g. Home Page" />
                </div>
                <div style={{ minWidth: 100 }}>
                  <Text style={{ fontSize: 12, opacity: 0.5, display: "block", marginBottom: 2 }}>Type</Text>
                  <Select value={step.type} onChange={(val) => { const next = [...steps]; next[i] = { ...next[i], type: (val ?? "view") as "view" | "request" }; saveSteps(next); }}>
                    <Select.Trigger style={{ minWidth: 90 }} />
                    <Select.Content>
                      <Select.Option value="view">View</Select.Option>
                      <Select.Option value="request">Request</Select.Option>
                    </Select.Content>
                  </Select>
                </div>
              </Flex>
              <Text style={{ fontSize: 12, opacity: 0.5, display: "block", marginBottom: 4, marginTop: 4 }}>Pages / Identifiers {step.identifiers.length > 1 && <span style={{ opacity: 0.7 }}>(OR logic — any match counts)</span>}</Text>
              {step.identifiers.map((id, j) => (
                <Flex key={j} gap={6} alignItems="center" style={{ marginBottom: 4 }}>
                  <div style={{ flex: 1 }}>
                    {settingsPagesData.isLoading ? (
                      <ProgressBar style={{ width: "100%" }} />
                    ) : (
                      <Select value={id} onChange={(val) => { const next = [...steps]; const ids = [...next[i].identifiers]; ids[j] = val ?? ""; next[i] = { ...next[i], identifiers: ids }; saveSteps(next); }}>
                        <Select.Trigger />
                        <Select.Content>
                          <Select.Filter />
                          {id && !availablePages.includes(id) && (
                            <Select.Option value={id}>{id}</Select.Option>
                          )}
                          {availablePages.map(page => (
                            <Select.Option key={page} value={page}>{page}</Select.Option>
                          ))}
                          {availablePages.length === 0 && (
                            <Select.Option value="" disabled>No pages found for this app</Select.Option>
                          )}
                        </Select.Content>
                      </Select>
                    )}
                  </div>
                  {step.identifiers.length > 1 && (
                    <button onClick={() => { const next = [...steps]; const ids = step.identifiers.filter((_, k) => k !== j); next[i] = { ...next[i], identifiers: ids }; saveSteps(next); }} style={{ background: "none", border: "none", color: RED, cursor: "pointer", fontSize: 11, padding: "2px 4px" }}>✕</button>
                  )}
                </Flex>
              ))}
              <button onClick={() => { const next = [...steps]; next[i] = { ...next[i], identifiers: [...step.identifiers, ""] }; saveSteps(next); }} style={{ background: "none", border: "1px dashed rgba(69,137,255,0.3)", borderRadius: 4, color: BLUE, cursor: "pointer", fontSize: 11, padding: "3px 8px", marginTop: 2 }}>+ Add Page</button>
            </div>
          ))}
          {steps.length < MAX_STEPS && (
            <button onClick={() => { const next = [...steps, { label: "", identifiers: [""], type: "view" as const }]; saveSteps(next); }} style={{ width: "100%", padding: "8px", background: "rgba(69,137,255,0.1)", border: "1px dashed rgba(69,137,255,0.3)", borderRadius: 6, color: BLUE, cursor: "pointer", fontSize: 12, marginBottom: 16 }}>+ Add Step</button>
          )}
          <button onClick={() => { saveSteps(DEFAULT_FUNNEL_STEPS); }} style={{ width: "100%", padding: "6px", background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 13, marginBottom: 16 }}>Reset to Defaults</button>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginBottom: 12 }} />
          {/* Average Order Value */}
          <Paragraph style={{ marginBottom: 4, fontWeight: 600 }}>Average Order Value (AOV)</Paragraph>
          <Paragraph style={{ marginBottom: 8, opacity: 0.6, fontSize: 12 }}>Set the average revenue per conversion. Used in What-If Analysis and Revenue Intelligence tabs to project revenue impact. Set to 0 to hide revenue metrics.</Paragraph>
          <div style={{ marginBottom: 20 }}>
            <Flex alignItems="center" gap={8}>
              <Text style={{ fontSize: 16, fontWeight: 600 }}>$</Text>
              <TextInput
                value={aov > 0 ? String(aov) : ""}
                onChange={(val) => {
                  const v = Number(val);
                  if (!isNaN(v) && v >= 0) saveAov(v);
                  else if (!val) saveAov(0);
                }}
                placeholder="e.g. 85.00"
              />
            </Flex>
          </div>
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
          {/* Default Funnel Chart Style */}
          <Paragraph style={{ marginBottom: 4, fontWeight: 600 }}>Default Funnel Chart Style</Paragraph>
          <Paragraph style={{ marginBottom: 8, opacity: 0.6, fontSize: 12 }}>Choose the default visualization style for the Funnel Overview tab. Can also be changed inline.</Paragraph>
          <div style={{ marginBottom: 20 }}>
            <Select value={funnelStyle} onChange={(val) => { if (val) { setFunnelStyle(val as FunnelStyle); saveState({ key: FUNNEL_STYLE_STATE_KEY, body: { value: val as string } }); } }}>
              <Select.Trigger style={{ minWidth: 200 }} />
              <Select.Content>
                {FUNNEL_STYLE_OPTIONS.map(o => <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>)}
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
          <button onClick={() => { saveTabOrder([...DEFAULT_TAB_ORDER]); }} style={{ width: "100%", padding: "6px", background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 13, marginTop: 8 }}>Reset Tab Order</button>
        </div>
      </Sheet>

      {/* Tabs — rendered in user-defined tabOrder */}
      <AIInsightsContext.Provider value={aiContextValue}>
      <Tabs defaultIndex={0}>
        {tabOrder.filter(t => isTabVisible(t)).map(tabId => {
          let content: React.ReactNode = null;
          switch (tabId) {
            case "Funnel Overview": content = <FunnelOverviewTab funnelCounts={funnelCounts} funnelCountsPrev={funnelCountsPrev} overallConv={overallConv} overallApdex={overallApdex} stepMap={stepMap} pageMap={pageMap} quality={quality} compareMode={compareMode} setCompareMode={setCompareMode} isLoading={isLoading || qualityData.isLoading} isFetching={isFunnelFetching} lastRefreshedAt={lastRefreshedAt} refreshIntervalMs={refreshIntervalMs} appEntityId={appEntityId} steps={steps} aov={aov} funnelStyle={funnelStyle} onFunnelStyleChange={(v: FunnelStyle) => { setFunnelStyle(v); saveState({ key: FUNNEL_STYLE_STATE_KEY, body: { value: v } }); }} todayHourlyData={todayFunnelData} />; break;
            case "Trends": content = <TrendsTab quality={quality} qualityPrev={qualityPrev} overallApdex={overallApdex} overallApdexPrev={overallApdexPrev} overallConv={overallConv} overallConvPrev={overallConvPrev} funnelCounts={funnelCounts} funnelCountsPrev={funnelCountsPrev} isLoading={qualityData.isLoading || qualityDataPrev.isLoading || funnelResult.isLoading || funnelResultPrev.isLoading} steps={steps} aov={aov} sparklineRecords={sparklineData.data?.records ?? []} convSparklineRecords={convSparklineData.data?.records ?? []} />; break;
            case "Web Vitals": content = <WebVitalsTab cwv={cwv} cwvByPage={cwvByPage} cwvTrend={sloCwvTrendData} isLoading={cwvResult.isLoading || cwvByPage.isLoading} appEntityId={appEntityId} />; break;
            case "Step Details": content = <StepDetailsTab stepMap={stepMap} pageMap={pageMap} cwvByPage={cwvByPage} isLoading={stepMetrics.isLoading} appEntityId={appEntityId} steps={steps} aov={aov} funnelCounts={funnelCounts} />; break;
            case "Worst Sessions": content = <WorstSessionsTab data={worstSessionsData} isLoading={worstSessionsData.isLoading} />; break;
            case "Exceptions": content = <JSErrorsTab data={jsErrorsData} prevData={jsErrorsPrevData} isLoading={jsErrorsData.isLoading} frontend={frontend} />; break;
            case "Click Issues": content = <ClickIssuesTab data={clickIssuesData} replayData={clickReplayData} isLoading={clickIssuesData.isLoading} />; break;
            case "Perf Budgets": content = <PerfBudgetsTab quality={quality} qualityPrev={qualityPrev} overallApdex={overallApdex} overallApdexPrev={overallApdexPrev} overallConv={overallConv} overallConvPrev={overallConvPrev} hourlyData={hourlyDistributionData} isLoading={qualityData.isLoading || hourlyDistributionData.isLoading || qualityDataPrev.isLoading} saveState={saveState} savedThresholds={savedBudgetThresholds} />; break;
            case "Geo Heatmap": content = <GeoHeatmapTab data={geoPerformanceData} isLoading={geoPerformanceData.isLoading} frontend={frontend} networkData={geoNetworkData} conversionData={geoConversionData} />; break;
            case "Map": content = <WorldMapTab data={geoPerformanceData} isLoading={geoPerformanceData.isLoading} frontend={frontend} defaultView={mapViewDefault} aov={aov} overallConv={overallConv} timelapseData={mapTimelapseData} conversionData={geoConversionData} />; break;
            case "Navigation Paths": content = <NavigationPathsTab data={navigationPathsData} navPathConvData={navPathConvData} isLoading={navigationPathsData.isLoading} appEntityId={appEntityId} steps={steps} />; break;
            case "Sankey": content = <SankeyTab data={sankeyData} isLoading={sankeyData.isLoading} appEntityId={appEntityId} chartStyle={sankeyStyle} onStyleChange={(v: SankeyStyle) => { setSankeyStyle(v); saveState({ key: SANKEY_STYLE_STATE_KEY, body: { value: v } }); }} steps={steps} aov={aov} cwvData={sankeyCwvData} errorData={sankeyErrorData} pathsData={sankeyPathsData} frontend={frontend} durationData={sankeyDurationData} prevPathsData={sankeyPrevPaths} velocityData={funnelVelocityData} />; break;
            case "Anomaly Detection": content = <AnomalyDetectionTab quality={quality} qualityPrev={qualityPrev} overallApdex={overallApdex} overallApdexPrev={overallApdexPrev} funnelCounts={funnelCounts} funnelCountsPrev={funnelCountsPrev} stepMap={stepMap} durationDist={durationDistributionData} isLoading={qualityData.isLoading || qualityDataPrev.isLoading || durationDistributionData.isLoading} steps={steps} aov={aov}  davisProblemsData={davisProblemsData} />; break;
            case "Conversion Attribution": content = <ConversionAttributionTab utmData={utmAttributionData} data={conversionAttributionData} overallConv={overallConv} isLoading={conversionAttributionData.isLoading} aov={aov} funnelCounts={funnelCounts} />; break;
            case "Executive Summary": content = <ExecutiveSummaryTab quality={quality} qualityPrev={qualityPrev} overallApdex={overallApdex} overallApdexPrev={overallApdexPrev} overallConv={overallConv} overallConvPrev={overallConvPrev} funnelCounts={funnelCounts} funnelCountsPrev={funnelCountsPrev} cwv={cwv} stepMap={stepMap} isLoading={isLoading || qualityData.isLoading || qualityDataPrev.isLoading || cwvResult.isLoading} frontend={frontend} steps={steps} aov={aov} />; break;
            case "Segmentation": /* enhanced */ content = <SegmentationTab devices={(deviceData.data?.records ?? []) as any[]} browsers={(browserData.data?.records ?? []) as any[]} geos={(geoData.data?.records ?? []) as any[]} isLoading={deviceData.isLoading || browserData.isLoading || geoData.isLoading} aov={aov} overallConv={overallConv} />; break;
            case "Errors & Drop-offs": content = <ErrorsTab errors={(errorData.data?.records ?? []) as any[]} funnelCounts={funnelCounts} isLoading={errorData.isLoading} steps={steps} aov={aov} />; break;
            case "What-If Analysis": content = <WhatIfTab hostMetricsData={hostMetricsData} funnelCounts={funnelCounts} stepMap={stepMap} overallApdex={overallApdex} isLoading={isLoading} steps={steps} aov={aov} />; break;
            case "Root Cause Correlation": content = <RootCauseCorrelationTab backendServicesData={backendServicesData} hourlyData={rootCauseCorrelationData} stepDropData={rootCauseStepDropData} quality={quality} qualityPrev={qualityPrev} overallApdex={overallApdex} overallApdexPrev={overallApdexPrev} overallConv={overallConv} overallConvPrev={overallConvPrev} isLoading={rootCauseCorrelationData.isLoading || rootCauseStepDropData.isLoading} steps={steps} aov={aov} funnelCounts={funnelCounts} />; break;
            case "Predictive Forecasting": content = <PredictiveForecastingTab trendData={forecastTrendData} apdexTrendData={forecastApdexTrendData} vitalsTrendData={forecastVitalsTrendData} quality={quality} overallApdex={overallApdex} overallConv={overallConv} isLoading={forecastTrendData.isLoading || forecastApdexTrendData.isLoading || forecastVitalsTrendData.isLoading} steps={steps} aov={aov} funnelCounts={funnelCounts} />; break;
            case "Resource Waterfall": content = <ResourceWaterfallTab waterfallData={resourceWaterfallData} byStepData={resourceByStepData} sessionDrillData={resourceSessionDrillData} isLoading={resourceWaterfallData.isLoading || resourceByStepData.isLoading || resourceSessionDrillData.isLoading} steps={steps} frontend={frontend} />; break;
            case "Change Intelligence": content = <ChangeIntelligenceTab featureFlagData={featureFlagData} deployData={deploymentEventsData} impactData={changeImpactData} quality={quality} qualityPrev={qualityPrev} overallApdex={overallApdex} overallApdexPrev={overallApdexPrev} isLoading={deploymentEventsData.isLoading || changeImpactData.isLoading} aov={aov} overallConv={overallConv} funnelCounts={funnelCounts} />; break;
            case "SLO Tracker": content = <SLOTrackerTab apdexTrend={sloApdexTrendData} cwvTrend={sloCwvTrendData} quality={quality} overallApdex={overallApdex} overallConv={overallConv} cwv={cwv} isLoading={sloApdexTrendData.isLoading || sloCwvTrendData.isLoading} saveState={saveState} savedTargets={savedSloTargets} frontend={frontend} />; break;
            case "Session Replay Spotlight": content = <SessionReplaySpotlightTab data={sessionReplayData} isLoading={sessionReplayData.isLoading} />; break;
            case "A/B Comparison": content = <ABComparisonTab segAData={abSegAData} segBData={abSegBData} segACwv={abSegACwv} segBCwv={abSegBCwv} dimension={abDimension} setDimension={setAbDimension} segA={abSegA} segB={abSegB} setSegA={setAbSegA} setSegB={setAbSegB} isLoading={abSegAData.isLoading || abSegBData.isLoading || abSegACwv.isLoading || abSegBCwv.isLoading} aov={aov} overallConv={overallConv} />; break;
            case "Revenue Intelligence": content = <RevenueIntelligenceTab funnelCounts={funnelCounts} funnelCountsPrev={funnelCountsPrev} stepMap={stepMap} overallConv={overallConv} overallConvPrev={overallConvPrev} overallApdex={overallApdex} quality={quality} qualityPrev={qualityPrev} isLoading={isLoading || qualityData.isLoading || qualityDataPrev.isLoading || funnelResultPrev.isLoading} steps={steps} aov={aov} />; break;
            case "Cohort Retention": content = <CohortRetentionTab retentionData={cohortRetentionData} sessionData={cohortSessionData} isLoading={cohortRetentionData.isLoading || cohortSessionData.isLoading} steps={steps} aov={aov} />; break;
            case "Session Engagement": content = <SessionEngagementTab data={sessionEngagementData} isLoading={sessionEngagementData.isLoading} steps={steps} aov={aov} overallConv={overallConv} />; break;
            case "Third-Party Impact": content = <ThirdPartyImpactTab data={thirdPartyData} cwvData={thirdPartyCwvData} isLoading={thirdPartyData.isLoading || thirdPartyCwvData.isLoading} frontend={frontend} />; break;
            case "Error Clustering": content = <ErrorClusteringTab deployData={deploymentEventsData} data={errorClusterData} trendData={errorTrendData} isLoading={errorClusterData.isLoading || errorTrendData.isLoading} frontend={frontend} />; break;
          }
          return <Tab key={tabId} title={tabId}>{content}</Tab>;
        })}
      </Tabs>
      </AIInsightsContext.Provider>
    </div>
  );
}

// ===========================================================================
// AI INSIGHTS — Sparkle Button, Panel & Analysis Engine
// ===========================================================================
type InsightSeverity = "good" | "warning" | "critical" | "info";
type InsightItem = { severity: InsightSeverity; icon: string; text: string };
type RecommendationItem = { impact: "high" | "medium" | "low"; text: string };
type AIInsightsData = { summary: string; insights: InsightItem[]; recommendations: RecommendationItem[] };

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Large sparkle (bottom-right) */}
      <path d="M14 4L15.2 9.6L20 12L15.2 14.4L14 20L12.8 14.4L8 12L12.8 9.6Z" fill="url(#sparkle-grad)" />
      {/* Medium sparkle (top-left) */}
      <path d="M7 2L7.7 4.8L10 6L7.7 7.2L7 10L6.3 7.2L4 6L6.3 4.8Z" fill="url(#sparkle-grad)" />
      {/* Small sparkle (left-middle) */}
      <path d="M5 13L5.5 14.8L7 16L5.5 17.2L5 19L4.5 17.2L3 16L4.5 14.8Z" fill="url(#sparkle-grad)" />
      <defs><linearGradient id="sparkle-grad" x1="3" y1="2" x2="20" y2="20"><stop stopColor="#c084fc" /><stop offset="1" stopColor="#818cf8" /></linearGradient></defs>
    </svg>
  );
}

function AIInsightsButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button className={`uj-ai-btn${active ? " active" : ""}`} onClick={onClick}>
      <SparkleIcon />
      AI Insights
    </button>
  );
}

/** Renders text word-by-word with a staggered streaming animation */
function StreamText({ text, baseDelay, style }: { text: string; baseDelay: number; style?: React.CSSProperties }) {
  const words = text.split(/(\s+)/);
  let wordIndex = 0;
  return (
    <Text style={style}>
      {words.map((w, i) => {
        if (/^\s+$/.test(w)) return w;
        const delay = baseDelay + wordIndex * 60;
        wordIndex++;
        return <span key={i} className="uj-ai-stream-word" style={{ animationDelay: `${delay}ms` }}>{w}</span>;
      })}
    </Text>
  );
}

function AIInsightsPanel({ data, onClose }: { data: AIInsightsData; onClose: () => void }) {
  // Calculate cumulative word offsets so each section streams after the previous
  const summaryWords = data.summary.split(/\s+/).length;
  const summaryDuration = summaryWords * 60;
  let insightOffset = summaryDuration + 400;
  const insightDurations: number[] = data.insights.map(ins => {
    const d = ins.text.split(/\s+/).length * 60;
    return d;
  });

  return (
    <div className="uj-ai-panel">
      <div className="uj-ai-panel-header">
        <SparkleIcon />
        <Strong style={{ flex: 1 }}>AI Insights</Strong>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 16, opacity: 0.5, padding: "2px 6px" }}>✕</button>
      </div>
      <div className="uj-ai-panel-body">
        {/* Summary */}
        <div style={{ marginBottom: 16 }}>
          <div className="uj-ai-section-title" style={{ opacity: 0, animation: "uj-ai-typewriter 0.3s ease forwards", animationDelay: "100ms" }}>Summary</div>
          <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(165,110,255,0.06)", border: "1px solid rgba(165,110,255,0.12)" }}>
            <StreamText text={data.summary} baseDelay={200} style={{ fontSize: 13, lineHeight: "1.5" }} />
          </div>
        </div>

        {/* Insights */}
        {data.insights.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div className="uj-ai-section-title" style={{ opacity: 0, animation: "uj-ai-typewriter 0.3s ease forwards", animationDelay: `${insightOffset - 200}ms` }}>Insights</div>
            {data.insights.map((ins, i) => {
              const myOffset = insightOffset;
              insightOffset += insightDurations[i] + 240;
              return (
                <div key={i} className={`uj-ai-insight-row ${ins.severity}`} style={{ opacity: 0, animation: "uj-ai-typewriter 0.3s ease forwards", animationDelay: `${myOffset - 100}ms` }}>
                  <Text style={{ fontSize: 14, flexShrink: 0 }}>{ins.icon}</Text>
                  <StreamText text={ins.text} baseDelay={myOffset} style={{ fontSize: 13 }} />
                </div>
              );
            })}
          </div>
        )}

        {/* Recommendations */}
        {data.recommendations.length > 0 && (
          <div>
            <div className="uj-ai-section-title" style={{ opacity: 0, animation: "uj-ai-typewriter 0.3s ease forwards", animationDelay: `${insightOffset}ms` }}>Recommendations</div>
            {data.recommendations.map((rec, i) => {
              const myOffset = insightOffset + 300 + i * 800;
              return (
                <div key={i} className="uj-ai-recommendation" style={{ opacity: 0, animation: "uj-ai-typewriter 0.3s ease forwards", animationDelay: `${myOffset}ms` }}>
                  <span className={`uj-ai-rec-badge ${rec.impact}`}>{rec.impact}</span>
                  <StreamText text={rec.text} baseDelay={myOffset + 100} style={{ fontSize: 13 }} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Context: shares AI Insights open/close state from header to all tabs */
const AIInsightsContext = React.createContext({ open: false, close: () => {} });

/** Hook: reads AI open state from context, returns panel only */
function useAIInsights(analysisFn: () => AIInsightsData): { panel: React.ReactNode } {
  const { open, close } = React.useContext(AIInsightsContext);
  const data = useMemo(() => open ? analysisFn() : null, [open, analysisFn]);
  return {
    panel: open && data ? <AIInsightsPanel data={data} onClose={close} /> : null,
  };
}

// ---------------------------------------------------------------------------
// Per-tab analysis functions — industry-standard benchmarks
// ---------------------------------------------------------------------------
function analyzeFunnelOverview(overallConv: number, overallApdex: number, quality: any, funnelCounts: number[], steps: StepDef[], stepMap: Map<string, any>, aov: number, pageMap?: Map<string, any>): AIInsightsData {
  const insights: InsightItem[] = [];
  const recs: RecommendationItem[] = [];
  const errorRate = quality.total > 0 ? (quality.errors / quality.total) * 100 : 0;

  // Multi-page session overlap explanation
  if (pageMap && pageMap.size > 0) {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (step.identifiers.length < 2) continue;
      const rollupSessions = funnelCounts[i] ?? 0;
      if (rollupSessions === 0) continue;
      let pageSessionSum = 0;
      for (const id of step.identifiers) {
        let pm = pageMap.get(id);
        if (!pm) { for (const [key, val] of pageMap) { if (identifierMatchesLabel(id, key)) { pm = val; break; } } }
        if (pm) pageSessionSum += Number(pm.sessions ?? 0);
      }
      if (pageSessionSum > rollupSessions) {
        const overlap = pageSessionSum - rollupSessions;
        insights.push({ severity: "info", icon: "🔗", text: `"${step.label}" has ${step.identifiers.length} pages with ${fmtCount(pageSessionSum)} combined page-level sessions but only ${fmtCount(rollupSessions)} unique sessions in the funnel rollup. ~${fmtCount(overlap)} sessions visited multiple pages in this step — the rollup correctly deduplicates them.` });
      }
    }
  }

  // Conversion
  if (overallConv >= 5) insights.push({ severity: "good", icon: "✅", text: `Conversion rate of ${fmtPct(overallConv)} is above the industry average of 2-5%.` });
  else if (overallConv >= 2) insights.push({ severity: "info", icon: "📊", text: `Conversion rate of ${fmtPct(overallConv)} is within the industry average range (2-5%).` });
  else if (overallConv > 0) { insights.push({ severity: "warning", icon: "⚠️", text: `Conversion rate of ${fmtPct(overallConv)} is below the industry average of 2-5%.` }); recs.push({ impact: "high", text: "Investigate the highest drop-off steps in the funnel and optimize page load times and UX for those pages." }); }

  // Apdex
  if (overallApdex >= 0.85) insights.push({ severity: "good", icon: "✅", text: `Apdex of ${overallApdex.toFixed(2)} is Excellent (≥0.85). Users are satisfied with performance.` });
  else if (overallApdex >= 0.7) insights.push({ severity: "info", icon: "📊", text: `Apdex of ${overallApdex.toFixed(2)} is Good (0.70-0.85). Minor performance improvements could help.` });
  else if (overallApdex >= 0.5) { insights.push({ severity: "warning", icon: "⚠️", text: `Apdex of ${overallApdex.toFixed(2)} is Fair (0.50-0.70). Users are experiencing noticeable performance issues.` }); recs.push({ impact: "high", text: "Prioritize server-side and frontend performance optimization. Target reducing P90 response times below 3 seconds." }); }
  else { insights.push({ severity: "critical", icon: "🔴", text: `Apdex of ${overallApdex.toFixed(2)} is Poor (<0.50). Performance is unacceptable for most users.` }); recs.push({ impact: "high", text: "Critical: Immediate performance intervention needed. Profile backend services, optimize database queries, and reduce page weight." }); }

  // Error rate
  if (errorRate > 5) { insights.push({ severity: "critical", icon: "🔴", text: `Error rate of ${fmtPct(errorRate)} exceeds the 5% threshold. Industry standard is <1%.` }); recs.push({ impact: "high", text: "Investigate top JavaScript exceptions. High error rates directly correlate with conversion loss — each 1% increase in errors can reduce conversion by 0.5-1%." }); }
  else if (errorRate > 1) { insights.push({ severity: "warning", icon: "⚠️", text: `Error rate of ${fmtPct(errorRate)} is above the recommended <1% threshold.` }); recs.push({ impact: "medium", text: "Review the Exceptions tab to identify and fix the most frequent errors affecting user experience." }); }
  else insights.push({ severity: "good", icon: "✅", text: `Error rate of ${fmtPct(errorRate)} is within the healthy range (<1%).` });

  // Step drop-offs
  let worstDrop = 0, worstStep = "";
  for (let i = 1; i < funnelCounts.length; i++) {
    const prev = funnelCounts[i - 1];
    const drop = prev > 0 ? ((prev - funnelCounts[i]) / prev) * 100 : 0;
    if (drop > worstDrop) { worstDrop = drop; worstStep = steps[i]?.label ?? `Step ${i + 1}`; }
  }
  if (worstDrop > 50) { insights.push({ severity: "critical", icon: "🔴", text: `Worst drop-off: ${fmtPct(worstDrop)} at "${worstStep}". More than half of users abandon at this step.` }); recs.push({ impact: "high", text: `Focus UX improvements on "${worstStep}". Consider simplifying the page, reducing form fields, or adding trust signals.` }); }
  else if (worstDrop > 30) { insights.push({ severity: "warning", icon: "⚠️", text: `Notable drop-off of ${fmtPct(worstDrop)} at "${worstStep}".` }); recs.push({ impact: "medium", text: `Analyze user behavior at "${worstStep}" with session replay to identify friction points.` }); }

  // Revenue opportunity
  if (aov > 0 && overallConv < 5 && funnelCounts[0] > 0) {
    const potentialGain = funnelCounts[0] * 0.01 * aov;
    recs.push({ impact: "medium", text: `Revenue opportunity: A 1% conversion improvement would generate ~${fmtCurrency(potentialGain)} in additional revenue.` });
  }

  // Avg duration
  if (quality.avg > 3000) { insights.push({ severity: "critical", icon: "🔴", text: `Average action duration of ${fmt(quality.avg)} exceeds 3s. Google recommends pages load within 2.5s.` }); recs.push({ impact: "high", text: "Optimize critical rendering path: defer non-essential JavaScript, compress images, use CDN caching." }); }
  else if (quality.avg > 1000) insights.push({ severity: "info", icon: "📊", text: `Average action duration of ${fmt(quality.avg)} is acceptable but has room for improvement.` });
  else insights.push({ severity: "good", icon: "✅", text: `Average action duration of ${fmt(quality.avg)} is fast, meeting the <1s best practice.` });

  const summary = `Funnel Overview is the primary command center for understanding end-to-end user conversion. It visualizes how ${fmtCount(quality.sessions)} sessions progress through your defined funnel steps, tracking where users advance, where they abandon, and why. This tab is designed for Product Managers evaluating conversion effectiveness, UX Designers identifying friction points, and Performance Engineers correlating speed with business outcomes. It answers: What is my overall conversion rate (currently ${fmtPct(overallConv)} against an industry average of 2-5%)? How satisfied are users with performance (Apdex ${overallApdex.toFixed(2)}, where ≥0.85 is excellent)? Where is the biggest drop-off in my funnel? ${worstDrop > 30 ? `The steepest abandonment occurs at "${worstStep}" where ${fmtPct(worstDrop)} of users leave — this is your highest-leverage optimization target.` : "Funnel progression is relatively smooth with no severe drop-off points."} ${errorRate > 1 ? `Error rate of ${fmtPct(errorRate)} exceeds the <1% industry benchmark and may be suppressing conversion.` : "Error rate is within healthy bounds."} The tab is organized into 4 sub-tabs: (1) Conversion Funnel — Apdex satisfaction breakdown, 5 visualization styles (Classic, Horizontal Bar, Stacked Cohort, Elapsed-Time Curve, Comparison Split), and Compare mode to overlay the previous period; (2) Predictive Model — linear regression on today's hourly conversion rates projects where the conversion rate will land by 23:59, with hourly velocity and confidence score; (3) Step Analysis — sortable table of all funnel steps with sessions, avg/P90 duration, Apdex, conversion %, abandons, and errors per step; (4) Per-Page Breakdown — per-page metrics for steps with multiple page identifiers. Revenue-lost annotations are shown when AOV is configured.`;

  return { summary, insights, recommendations: recs };
}

function analyzeTrends(quality: any, qualityPrev: any, overallApdex: number, overallApdexPrev: number, overallConv: number, overallConvPrev: number, funnelCounts: number[], funnelCountsPrev: number[], aov: number): AIInsightsData {
  const insights: InsightItem[] = [];
  const recs: RecommendationItem[] = [];

  const sessionDelta = qualityPrev.sessions > 0 ? ((quality.sessions - qualityPrev.sessions) / qualityPrev.sessions) * 100 : 0;
  const convDelta = overallConvPrev > 0 ? ((overallConv - overallConvPrev) / overallConvPrev) * 100 : 0;
  const apdexDelta = overallApdexPrev > 0 ? ((overallApdex - overallApdexPrev) / overallApdexPrev) * 100 : 0;
  const errRate = quality.total > 0 ? (quality.errors / quality.total) * 100 : 0;
  const errRatePrev = qualityPrev.total > 0 ? (qualityPrev.errors / qualityPrev.total) * 100 : 0;

  if (sessionDelta > 10) insights.push({ severity: "good", icon: "📈", text: `Traffic increased ${Math.abs(sessionDelta).toFixed(1)}% period-over-period. Growing user base.` });
  else if (sessionDelta < -10) { insights.push({ severity: "warning", icon: "📉", text: `Traffic decreased ${Math.abs(sessionDelta).toFixed(1)}% period-over-period.` }); recs.push({ impact: "medium", text: "Investigate traffic sources. Check for SEO ranking changes, campaign pauses, or external factors." }); }

  if (convDelta > 5) insights.push({ severity: "good", icon: "✅", text: `Conversion improved ${Math.abs(convDelta).toFixed(1)}% vs. previous period.` });
  else if (convDelta < -5) { insights.push({ severity: "warning", icon: "⚠️", text: `Conversion declined ${Math.abs(convDelta).toFixed(1)}% vs. previous period.` }); recs.push({ impact: "high", text: "Review recent deployments, A/B tests, or UX changes that may have caused conversion regression." }); }

  if (apdexDelta < -10) { insights.push({ severity: "critical", icon: "🔴", text: `Apdex degraded ${Math.abs(apdexDelta).toFixed(1)}% — user satisfaction is declining.` }); recs.push({ impact: "high", text: "Check Change Intelligence tab for recent deployments. Profile backend services for new performance regressions." }); }
  else if (apdexDelta > 5) insights.push({ severity: "good", icon: "✅", text: `Apdex improved ${Math.abs(apdexDelta).toFixed(1)}% — performance optimizations are working.` });

  if (errRate > errRatePrev * 1.3 && errRate > 1) { insights.push({ severity: "critical", icon: "🔴", text: `Error rate increased from ${fmtPct(errRatePrev)} to ${fmtPct(errRate)}.` }); recs.push({ impact: "high", text: "Check Error Clustering tab for new error patterns introduced in the current period." }); }

  // Anomaly signal guidance
  const anyAnomalyLikely = Math.abs(sessionDelta) > 20 || Math.abs(convDelta) > 15 || Math.abs(apdexDelta) > 15 || errRate > errRatePrev * 1.5;
  if (anyAnomalyLikely) {
    insights.push({ severity: "warning", icon: "📊", text: "One or more metrics show large period-over-period swings — check the ⚠ Anomaly badges on the cards to identify which changes exceed 2 std dev of daily variance and are statistically significant vs. noise." });
    recs.push({ impact: "medium", text: "Focus investigation on cards marked ⚠ Anomaly first. Cards showing ∿ Normal despite a visible delta are likely within expected day-to-day variance and may not warrant immediate action." });
  } else {
    insights.push({ severity: "good", icon: "📊", text: "Metric changes are moderate. Use the sparkline shapes on each card to verify trend direction, and check ↑ Notable badges for metrics approaching significance thresholds." });
  }

  const summary = `Trends provides period-over-period comparison of every key performance and business metric, enabling you to detect regressions, validate improvements, and understand momentum. It is designed for Engineering Managers tracking release impact, Product Owners monitoring business health, and SREs validating incident resolution. It answers: Are we improving or regressing? How do sessions, conversion, Apdex, errors, and duration compare to the previous equivalent period? Currently, sessions are ${sessionDelta >= 0 ? "up" : "down"} ${Math.abs(sessionDelta).toFixed(1)}%, conversion is ${convDelta >= 0 ? "up" : "down"} ${Math.abs(convDelta).toFixed(1)}%, and Apdex is ${apdexDelta >= 0 ? "up" : "down"} ${Math.abs(apdexDelta).toFixed(1)}%. ${convDelta < -5 || apdexDelta < -10 ? "A regression has been detected — correlate with recent deployments or infrastructure changes." : "Metrics are trending stable or positive."} Each metric card includes a daily sparkline tracing the metric's shape across the current period, and an inline anomaly badge powered by z-score analysis: ⚠ Anomaly (>2 std dev from daily mean — statistically significant change), ↑ Notable (1.2–2 std dev), or ∿ Normal (<1.2 std dev — within expected noise). Use the anomaly badges to quickly distinguish real regressions from day-to-day variance before digging into root cause. When AOV is configured, a Revenue trend card shows estimated revenue change. Use this tab after every deployment or campaign launch to verify impact.`;
  return { summary, insights, recommendations: recs };
}

function analyzeWebVitals(cwv: { lcp: number; cls: number; inp: number; ttfb: number; load: number }): AIInsightsData {
  const insights: InsightItem[] = [];
  const recs: RecommendationItem[] = [];

  // LCP (Google threshold: ≤2500 good, ≤4000 needs improvement, >4000 poor)
  if (cwv.lcp <= 2500) insights.push({ severity: "good", icon: "✅", text: `LCP of ${fmt(cwv.lcp)} meets Google's "Good" threshold (≤2.5s).` });
  else if (cwv.lcp <= 4000) { insights.push({ severity: "warning", icon: "⚠️", text: `LCP of ${fmt(cwv.lcp)} is in "Needs Improvement" range (2.5-4s). Google penalizes this in search rankings.` }); recs.push({ impact: "high", text: "Optimize LCP: preload hero images, inline critical CSS, defer non-essential scripts, use responsive images with proper sizing." }); }
  else { insights.push({ severity: "critical", icon: "🔴", text: `LCP of ${fmt(cwv.lcp)} is "Poor" (>4s). This significantly impacts SEO and user experience.` }); recs.push({ impact: "high", text: "Critical LCP: Audit largest visible element. Consider lazy-loading below-fold content, optimizing server TTFB, and using a CDN." }); }

  // CLS
  if (cwv.cls <= 0.1) insights.push({ severity: "good", icon: "✅", text: `CLS of ${cwv.cls.toFixed(3)} is "Good" (≤0.1). Layout is stable.` });
  else if (cwv.cls <= 0.25) { insights.push({ severity: "warning", icon: "⚠️", text: `CLS of ${cwv.cls.toFixed(3)} is in "Needs Improvement" range (0.1-0.25).` }); recs.push({ impact: "medium", text: "Reduce CLS: Set explicit width/height on images and ads, use CSS contain for dynamic content, avoid inserting content above the fold." }); }
  else { insights.push({ severity: "critical", icon: "🔴", text: `CLS of ${cwv.cls.toFixed(3)} is "Poor" (>0.25). Significant layout shifts are frustrating users.` }); recs.push({ impact: "high", text: "Critical CLS: Reserve space for ads/embeds, use font-display:swap with size-adjust, audit dynamically injected DOM elements." }); }

  // INP
  if (cwv.inp <= 200) insights.push({ severity: "good", icon: "✅", text: `INP of ${fmt(cwv.inp)} is "Good" (≤200ms). Interactions feel responsive.` });
  else if (cwv.inp <= 500) { insights.push({ severity: "warning", icon: "⚠️", text: `INP of ${fmt(cwv.inp)} is in "Needs Improvement" range (200-500ms).` }); recs.push({ impact: "medium", text: "Improve INP: Break up long tasks with yield-to-main patterns, reduce third-party script blocking, optimize event handlers." }); }
  else { insights.push({ severity: "critical", icon: "🔴", text: `INP of ${fmt(cwv.inp)} is "Poor" (>500ms). Users perceive the UI as unresponsive.` }); recs.push({ impact: "high", text: "Critical INP: Profile main-thread blocking with Chrome DevTools. Move heavy computation to Web Workers, debounce input handlers." }); }

  // TTFB
  if (cwv.ttfb <= 800) insights.push({ severity: "good", icon: "✅", text: `TTFB of ${fmt(cwv.ttfb)} is within the recommended ≤800ms.` });
  else if (cwv.ttfb <= 1800) { insights.push({ severity: "warning", icon: "⚠️", text: `TTFB of ${fmt(cwv.ttfb)} exceeds 800ms. Server response time impacts all downstream metrics.` }); recs.push({ impact: "medium", text: "Reduce TTFB: Optimize server-side rendering, implement caching (CDN, Redis), reduce database query time, consider edge computing." }); }
  else { insights.push({ severity: "critical", icon: "🔴", text: `TTFB of ${fmt(cwv.ttfb)} is significantly slow (>1.8s). This bottlenecks every other web vital.` }); recs.push({ impact: "high", text: "Critical TTFB: Audit server infrastructure. Check for cold starts, slow database queries, missing cache layers, or high server load." }); }

  const goodCount = insights.filter(i => i.severity === "good").length;
  const failingCount = 4 - goodCount;
  const summary = `Web Vitals measures your application against Google's Core Web Vitals — the metrics that directly determine search engine rankings and user-perceived performance. This tab includes CWV trend lines showing daily improvement or degradation over the selected timeframe, and automated remediation recommendations per failing vital with top offending pages and actionable fixes. It evaluates four critical metrics: LCP (Largest Contentful Paint, good ≤2.5s) measuring visual load speed, CLS (Cumulative Layout Shift, good ≤0.1) measuring visual stability, INP (Interaction to Next Paint, good ≤200ms) measuring interactivity responsiveness, and TTFB (Time to First Byte, good ≤800ms) measuring server response time. Currently ${goodCount}/4 metrics meet Google's "Good" thresholds. ${goodCount === 4 ? "All vitals are in the green — your site has excellent user experience and strong SEO standing." : goodCount >= 2 ? `${failingCount} vital(s) need attention — review the Remediation Recommendations section for specific fixes with top offending pages identified.` : `Multiple vitals are underperforming — the Remediation Recommendations section provides actionable fixes per failing metric with the specific pages contributing most to degradation.`} The trend chart reveals whether your optimizations are working or if performance is regressing over time. Use the trend direction indicators (▲ better / ▼ worse) to quickly assess trajectory.`;
  return { summary, insights, recommendations: recs };
}

function analyzeStepDetails(stepMap: Map<string, any>, steps: StepDef[], funnelCounts: number[]): AIInsightsData {
  const insights: InsightItem[] = [];
  const recs: RecommendationItem[] = [];
  let slowSteps = 0, poorApdexSteps = 0;

  for (let i = 0; i < steps.length; i++) {
    const m = stepMap.get(steps[i].label);
    if (!m) continue;
    const apdex = calcApdex(Number(m.satisfied ?? 0), Number(m.tolerating ?? 0), Number(m.total_actions ?? 0));
    const p90 = Number(m.p90 ?? 0);
    if (apdex < 0.5) { poorApdexSteps++; insights.push({ severity: "critical", icon: "🔴", text: `"${steps[i].label}" has Poor Apdex (${apdex.toFixed(2)}). Most users are frustrated at this step.` }); }
    if (p90 > 5000) { slowSteps++; insights.push({ severity: "warning", icon: "⏱", text: `"${steps[i].label}" P90 is ${fmt(p90)}. 10% of users wait over 5 seconds.` }); }
  }

  if (poorApdexSteps === 0 && slowSteps === 0) insights.push({ severity: "good", icon: "✅", text: "All funnel steps have acceptable Apdex scores and response times." });
  if (poorApdexSteps > 0) recs.push({ impact: "high", text: `${poorApdexSteps} step(s) have Poor Apdex. Focus performance optimization on these steps first — they're the biggest user satisfaction bottlenecks.` });
  if (slowSteps > 0) recs.push({ impact: "medium", text: `${slowSteps} step(s) have P90 > 5s. Consider server-side caching, lazy loading, or code splitting for these pages.` });

  const multiPageSteps = steps.filter(s => s.identifiers.length > 1).length;
  const summary = `Step Details provides a granular deep dive into each individual funnel step, revealing exactly where performance bottlenecks and user satisfaction issues exist at the page level. This tab is built for Performance Engineers diagnosing slow pages, UX Researchers understanding per-page user satisfaction, and Backend Engineers identifying which APIs or services need optimization. It answers: Which specific funnel steps have poor user satisfaction? What are the P50, P90, and P99 response time percentiles for each step? How is satisfaction distributed (satisfied vs. tolerating vs. frustrated) at each stage? Which pages within a step are the highest drop-off contributors? What are the Core Web Vitals (LCP, CLS, INP) per page? Currently evaluating ${steps.length} funnel steps${multiPageSteps > 0 ? ` (${multiPageSteps} with multiple pages — the Page Drop-off Contributors funnel shows traffic distribution within each step ranked by volume, and the Compare Pages view reveals per-page metrics with CWV overlay)` : ""}. ${poorApdexSteps > 0 ? `${poorApdexSteps} step(s) have Poor Apdex (<0.50), meaning the majority of users at these steps are frustrated — these are your most urgent optimization targets.` : "All steps have acceptable Apdex scores, indicating generally satisfied users across the funnel."} ${slowSteps > 0 ? `${slowSteps} step(s) have P90 response times exceeding 5 seconds, meaning 10% of users at these steps experience unacceptable waits.` : ""} Each step shows an Apdex gauge, satisfaction breakdown bar (green/amber/red segments), and duration percentile distribution. For multi-page steps, the Page Drop-off Contributors funnel ranks pages by event count (color-coded by Apdex quality) so you can instantly see which page variant loses the most users. The Compare view shows each page independently with LCP/CLS/INP color-coded against Google thresholds, plus per-page Apdex, durations, and satisfaction counts — the first page is the primary baseline and all other pages show delta percentages against it.`;
  return { summary, insights, recommendations: recs };
}

function analyzeWorstSessions(data: any): AIInsightsData {
  const records = (data?.data?.records ?? []) as any[];
  const insights: InsightItem[] = [];
  const recs: RecommendationItem[] = [];

  if (records.length === 0) return { summary: "No worst-session data available.", insights: [], recommendations: [] };

  const avgErrors = records.reduce((a: number, r: any) => a + Number(r.errors ?? r.error_count ?? 0), 0) / records.length;
  const avgFrustrated = records.reduce((a: number, r: any) => a + Number(r.frustrated ?? 0), 0) / records.length;

  // Cluster analysis for AI insights
  const errorTypes = new Map<string, number>();
  for (const r of records) {
    const types = Array.isArray(r.error_types) ? r.error_types.filter((e: string) => e && e !== "") : [];
    for (const t of types) errorTypes.set(t, (errorTypes.get(t) ?? 0) + 1);
  }
  const sharedErrors = [...errorTypes.entries()].filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]);
  const systemicSessions = records.filter((r: any) => {
    const types = Array.isArray(r.error_types) ? r.error_types.filter((e: string) => e && e !== "") : [];
    return types.some((t: string) => (errorTypes.get(t) ?? 0) >= 3);
  }).length;

  if (systemicSessions > records.length * 0.5) {
    insights.push({ severity: "critical", icon: "🔴", text: `${systemicSessions} of ${records.length} worst sessions share common error patterns — this is a systemic issue, not isolated incidents.` });
    recs.push({ impact: "high", text: "Focus on the shared error patterns first. Fixing these will resolve the majority of bad sessions simultaneously." });
  } else if (systemicSessions > 0) {
    insights.push({ severity: "warning", icon: "⚠️", text: `${systemicSessions} sessions share common error patterns (systemic), while ${records.length - systemicSessions} are unique outliers.` });
  } else {
    insights.push({ severity: "info", icon: "📊", text: "Worst sessions are mostly unique outliers — no dominant shared failure pattern detected." });
    recs.push({ impact: "medium", text: "With no dominant pattern, investigate the highest-impact sessions individually via Session Replay." });
  }

  if (sharedErrors.length > 0) {
    insights.push({ severity: "critical", icon: "🎯", text: `Top shared error: "${sharedErrors[0][0].substring(0, 60)}" appears in ${sharedErrors[0][1]} of the worst sessions.` });
  }

  if (avgErrors > 5) { insights.push({ severity: "critical", icon: "🔴", text: `Worst sessions average ${avgErrors.toFixed(1)} errors per session.` }); }
  if (avgFrustrated > 3) { insights.push({ severity: "warning", icon: "😤", text: `Worst sessions average ${avgFrustrated.toFixed(1)} frustrated actions — users are repeatedly hitting performance walls.` }); }

  recs.push({ impact: "medium", text: "Set up automated alerting for sessions exceeding error or duration thresholds to catch regressions early." });
  if (sharedErrors.length > 1) recs.push({ impact: "high", text: `${sharedErrors.length} error types appear in 3+ worst sessions. Prioritize these shared errors for maximum cross-session improvement.` });

  const summary = `Worst Sessions uses an AI-driven Impact Score to rank sessions by their likelihood of representing systemic issues vs. isolated outliers. The scoring model uses z-score normalization across four severity dimensions (errors, frustrated actions, avg latency, max latency) weighted by a systemic multiplier — sessions whose error types and behavioral fingerprints appear across multiple other sessions score higher, while unique edge cases are dampened. This helps teams focus on the sessions that represent the biggest patterns, not just the loudest single failures. The "Sessions Like This" cluster count reveals how many other sessions share the same behavioral fingerprint (error types + performance bucket + frustration level). Currently analyzing ${records.length} worst sessions: ${systemicSessions} classified as systemic (shared patterns) and ${records.length - systemicSessions} as outliers. ${sharedErrors.length > 0 ? `${sharedErrors.length} error type(s) appear in 3+ sessions, indicating repeatable failure modes.` : "No dominant shared error patterns detected."} The Pattern Clusters section groups sessions by behavioral fingerprint to reveal whether bad experiences are concentrated around specific failure modes or distributed randomly. Use this tab to distinguish "many users hit the same bug" from "one user had a uniquely bad day."`;
  return { summary, insights, recommendations: recs };
}

function analyzeExceptions(data: any): AIInsightsData {
  const records = (data?.data?.records ?? []) as any[];
  const insights: InsightItem[] = [];
  const recs: RecommendationItem[] = [];

  if (records.length === 0) return { summary: "No JavaScript exceptions detected — excellent error hygiene.", insights: [{ severity: "good", icon: "✅", text: "No JS exceptions in the current timeframe." }], recommendations: [] };

  const totalErrors = records.reduce((a: number, r: any) => a + Number(r.occurrences ?? r.count ?? 0), 0);
  const topError = records[0];
  const topPct = totalErrors > 0 ? (Number(topError?.occurrences ?? topError?.count ?? 0) / totalErrors) * 100 : 0;

  insights.push({ severity: totalErrors > 100 ? "critical" : "warning", icon: totalErrors > 100 ? "🔴" : "⚠️", text: `${fmtCount(totalErrors)} JavaScript exceptions across ${records.length} unique error types.` });
  if (topPct > 50) { insights.push({ severity: "critical", icon: "🎯", text: `Top error accounts for ${fmtPct(topPct)} of all exceptions. Fixing this one error would dramatically reduce error volume.` }); recs.push({ impact: "high", text: `Fix the top error "${String(topError?.errorName ?? topError?.error_name ?? "").substring(0, 50)}" — it represents over half of all exceptions.` }); }

  // Source map insight
  const withSource = records.filter((r: any) => /[^\s/]+\.(?:js|ts|mjs|cjs):\d+/.test(String(r.errorName ?? "")));
  if (withSource.length > 0) { insights.push({ severity: "info", icon: "📍", text: `${withSource.length} of ${records.length} errors have source locations decoded (file:line:col). Use these to pinpoint exact failure points in your bundled code.` }); }

  recs.push({ impact: "medium", text: "Upload source maps to Dynatrace for full deobfuscation. The decoded file:line:col shown inline provides a starting point — full source maps reveal original function names and context." });
  recs.push({ impact: "high", text: "Prioritize REGRESSION errors — these were previously fixed but have returned, often due to code revert or dependency update." });

  const summary = `Exceptions provides a comprehensive inventory of all JavaScript errors with inline source map deobfuscation (file:line:col decoding) and a regression detector that classifies each error as NEW (first appearance), RECURRING (present in both current and previous period), or REGRESSION (previously fixed but returned). This tab is essential for Frontend Engineers prioritizing bug fixes, Engineering Managers allocating debugging resources, and Reliability Engineers tracking error budgets. Currently tracking ${fmtCount(totalErrors)} total exceptions across ${records.length} unique error types. ${topPct > 50 ? `A single error type accounts for ${fmtPct(topPct)} of all exceptions — fixing this one error would eliminate over half of all JavaScript failures.` : "Errors are distributed across multiple types, suggesting systematic quality improvements are needed."} The regression detector compares current errors against the previous period: NEW errors need investigation, RECURRING errors need prioritization by impact, and REGRESSION errors are highest priority because they represent fixes that have unwound. Source locations are parsed from error names (file.js:line:col format) and displayed inline so you can identify the failing module without leaving the app.`;
  return { summary, insights, recommendations: recs };
}

function analyzeClickIssues(data: any): AIInsightsData {
  const records = (data?.data?.records ?? []) as any[];
  const insights: InsightItem[] = [];
  const recs: RecommendationItem[] = [];

  if (records.length === 0) return { summary: "No rage clicks or dead clicks detected.", insights: [{ severity: "good", icon: "✅", text: "No click issues found. UI elements are responding well." }], recommendations: [] };

  const totalRage = records.reduce((a: number, r: any) => a + Number(r.rage_clicks ?? 0), 0);
  const totalDead = records.reduce((a: number, r: any) => a + Number(r.dead_clicks ?? 0), 0);

  if (totalRage > 0) { insights.push({ severity: "critical", icon: "😤", text: `${fmtCount(totalRage)} rage clicks detected. Users are repeatedly clicking elements that aren't responding fast enough.` }); recs.push({ impact: "high", text: "Investigate rage-click targets. Common causes: slow API responses behind buttons, missing loading indicators, or unresponsive UI elements." }); }
  if (totalDead > 0) { insights.push({ severity: "warning", icon: "👻", text: `${fmtCount(totalDead)} dead clicks detected. Users are clicking non-interactive elements they expect to be clickable.` }); recs.push({ impact: "medium", text: "Review dead-click elements. Add proper cursor styling to interactive elements and make non-clickable elements visually distinct." }); }

  const summary = `Click Issues detects two critical UX anti-patterns: rage clicks (rapid repeated clicks indicating the user is frustrated because an element isn't responding) and dead clicks (clicks on non-interactive elements that users expect to be clickable). This tab is invaluable for UX Designers identifying interaction design flaws, Frontend Engineers finding unresponsive UI elements, and Product Managers quantifying user frustration. It answers: Where are users getting frustrated? Which UI elements are broken or misleading? How many sessions are impacted by click issues? Currently detecting ${fmtCount(totalRage)} rage clicks and ${fmtCount(totalDead)} dead clicks. ${totalRage > 0 ? "Rage clicks are a strong signal of user frustration — each rage click represents a user who tried multiple times to interact with something that didn't respond, often leading to session abandonment." : "No rage clicks detected, indicating UI elements are responding appropriately."} ${totalDead > 0 ? "Dead clicks suggest visual design issues where non-clickable elements appear interactive due to styling, cursor, or layout cues." : ""} The tab shows the specific elements, pages, and session counts affected. Fix rage-click targets by adding loading indicators and optimizing API response times, and fix dead-click targets by adjusting visual affordances.`;
  return { summary, insights, recommendations: recs };
}

function analyzePerfBudgets(quality: any, overallApdex: number, overallConv: number): AIInsightsData {
  const insights: InsightItem[] = [];
  const recs: RecommendationItem[] = [];

  // Industry performance budgets
  const budgets = [
    { label: "Apdex", value: overallApdex, target: 0.85, format: (v: number) => v.toFixed(2), lowerBetter: false },
    { label: "Conversion", value: overallConv, target: 3, format: fmtPct, lowerBetter: false },
    { label: "Avg Latency", value: quality.avg, target: 2000, format: fmt, lowerBetter: true },
    { label: "P90 Latency", value: quality.p90, target: 4000, format: fmt, lowerBetter: true },
    { label: "Error Rate", value: quality.total > 0 ? (quality.errors / quality.total) * 100 : 0, target: 1, format: fmtPct, lowerBetter: true },
  ];

  let passing = 0;
  for (const b of budgets) {
    const met = b.lowerBetter ? b.value <= b.target : b.value >= b.target;
    if (met) { passing++; insights.push({ severity: "good", icon: "✅", text: `${b.label}: ${b.format(b.value)} meets budget target of ${b.format(b.target)}.` }); }
    else { insights.push({ severity: "warning", icon: "⚠️", text: `${b.label}: ${b.format(b.value)} exceeds budget target of ${b.format(b.target)}.` }); recs.push({ impact: b.label === "Apdex" || b.label === "Error Rate" ? "high" : "medium", text: `Bring ${b.label} within budget. Current: ${b.format(b.value)}, Target: ${b.format(b.target)}.` }); }
  }

  const summary = `Perf Budgets tracks your application against user-configurable performance budget thresholds with projected time-to-breach estimates and near-breach alerting. Thresholds can be edited inline (click ✎ icon per metric) and are persisted per user. The tab compares current vs previous period to compute trend rate and projects when a passing metric will cross its threshold at the current trajectory. When a metric is within 10% of its threshold, it triggers a NEAR BREACH alert banner with a suggested DQL workflow trigger condition for automated notifications. Currently ${passing}/${budgets.length} budgets are met. ${passing === budgets.length ? "All performance budgets are on track." : `${budgets.length - passing} budget(s) need attention.`} The tab evaluates 6 configurable budgets: Apdex, Conversion Rate, Average Latency, P90 Latency, Error Rate, and Frustrated %. The hourly Apdex distribution chart reveals whether failures are constant or concentrated during peak traffic windows.`;
  return { summary, insights, recommendations: recs };
}

function analyzeGeoHeatmap(data: any): AIInsightsData {
  const records = (data?.data?.records ?? []) as any[];
  const insights: InsightItem[] = [];
  const recs: RecommendationItem[] = [];

  if (records.length === 0) return { summary: "No geographic performance data available.", insights: [], recommendations: [] };

  const entries = records.map((r: any) => ({ country: String(r.country ?? r.geoCountry ?? "Unknown"), avg: Number(r.avg_duration ?? r.avgDur ?? 0), sessions: Number(r.sessions ?? r.total_sessions ?? 0) })).filter((e: any) => e.sessions > 0);
  const globalAvg = entries.reduce((a: number, e: any) => a + e.avg * e.sessions, 0) / Math.max(1, entries.reduce((a: number, e: any) => a + e.sessions, 0));
  const slowRegions = entries.filter((e: any) => e.avg > globalAvg * 1.5).sort((a: any, b: any) => b.sessions - a.sessions);
  const fastRegions = entries.filter((e: any) => e.avg < globalAvg * 0.7).sort((a: any, b: any) => b.sessions - a.sessions);

  if (slowRegions.length > 0) {
    insights.push({ severity: "warning", icon: "🌍", text: `${slowRegions.length} region(s) have latency 50%+ above global average (${fmt(globalAvg)}). Slowest: ${slowRegions[0].country} at ${fmt(slowRegions[0].avg)}.` });
    recs.push({ impact: "medium", text: `Consider CDN edge locations or regional server deployment for: ${slowRegions.slice(0, 3).map((r: any) => r.country).join(", ")}.` });
  }
  if (fastRegions.length > 0) insights.push({ severity: "good", icon: "⚡", text: `${fastRegions.length} region(s) are performing 30%+ better than average. Top: ${fastRegions[0].country} at ${fmt(fastRegions[0].avg)}.` });

  const summary = `Geo Heatmap provides country-and-city-level performance analysis, revealing how user experience varies by geographic region. This tab is critical for Infrastructure Architects planning CDN edge locations, Global Product Managers understanding regional user satisfaction, and Operations Teams identifying underperforming regions. It answers: Which countries or cities have the worst performance? Is our CDN delivering content efficiently to all regions? Are there regions where poor performance is suppressing conversion? Currently analyzing ${entries.length} regions with a global average latency of ${fmt(globalAvg)}. ${slowRegions.length > 0 ? `${slowRegions.length} region(s) have latency 50%+ above the global average — these users are having a measurably worse experience that may be driving regional conversion differences.` : "Performance is consistent across all regions, suggesting your CDN and infrastructure are well-distributed."} Each region shows session count, Apdex score, average duration, and satisfaction breakdown bars. Country cards are clickable and link to User Sessions filtered by location. City-level drill-down enables granular investigation. Use this data to justify CDN investments, regional server deployments, or geo-specific performance optimizations.`;
  return { summary, insights, recommendations: recs };
}

function analyzeAnomalyDetection(quality: any, qualityPrev: any, overallApdex: number, overallApdexPrev: number, funnelCounts: number[], funnelCountsPrev: number[]): AIInsightsData {
  const insights: InsightItem[] = [];
  const recs: RecommendationItem[] = [];

  const metrics = [
    { label: "Sessions", curr: quality.sessions, prev: qualityPrev.sessions, inverted: false },
    { label: "Avg Duration", curr: quality.avg, prev: qualityPrev.avg, inverted: true },
    { label: "Error Count", curr: quality.errors, prev: qualityPrev.errors, inverted: true },
    { label: "Apdex", curr: overallApdex, prev: overallApdexPrev, inverted: false },
  ];

  let anomalyCount = 0;
  for (const m of metrics) {
    if (m.prev === 0) continue;
    const pct = ((m.curr - m.prev) / m.prev) * 100;
    const improving = m.inverted ? pct < 0 : pct > 0;
    if (Math.abs(pct) > 30) {
      anomalyCount++;
      if (improving) insights.push({ severity: "good", icon: "📈", text: `${m.label} changed ${Math.abs(pct).toFixed(1)}% (improving).` });
      else { insights.push({ severity: "critical", icon: "🔴", text: `${m.label} changed ${Math.abs(pct).toFixed(1)}% (degrading). This is a significant anomaly.` }); recs.push({ impact: "high", text: `Investigate ${m.label} regression. Check deployment timeline and infrastructure changes.` }); }
    } else if (Math.abs(pct) > 15) {
      if (!improving) { insights.push({ severity: "warning", icon: "⚠️", text: `${m.label} changed ${Math.abs(pct).toFixed(1)}% (degrading).` }); recs.push({ impact: "medium", text: `Monitor ${m.label} closely — it's trending in the wrong direction.` }); }
    }
  }

  if (anomalyCount === 0) insights.push({ severity: "good", icon: "✅", text: "No significant anomalies detected. All metrics are within normal variance." });

  const summary = `Anomaly Detection automatically compares every key metric against its baseline (the equivalent previous period) and flags statistically significant deviations. This tab is designed for SREs monitoring system stability, On-Call Engineers triaging alerts, and Release Managers validating post-deployment health. It answers: Has anything changed significantly? Are deviations improving or degrading? Which metrics are drifting from baseline? Is the system stable or experiencing an anomaly? The engine evaluates sessions, average duration, error count, and Apdex using percentage-change thresholds: >30% change is classified as significant (critical), >15% as notable (warning). Currently ${anomalyCount} significant deviation(s) detected across ${metrics.length} monitored metrics. ${anomalyCount === 0 ? "The system is stable — all metrics are within normal variance of their baselines." : "Flagged metrics should be investigated for root cause. Correlate with deployments, infrastructure changes, or traffic pattern shifts."} The tab includes a stability score, per-metric severity classification, per-step traffic anomaly detection, a duration distribution histogram, automated diagnosis, and Revenue at Risk when AOV is configured. Check this tab after every release.`;
  return { summary, insights, recommendations: recs };
}

function analyzeConversionAttribution(data: any, overallConv: number, aov: number, funnelCounts: number[]): AIInsightsData {
  const records = (data?.data?.records ?? []) as any[];
  const insights: InsightItem[] = [];
  const recs: RecommendationItem[] = [];

  if (records.length === 0) return { summary: "No conversion attribution data available.", insights: [], recommendations: [] };

  const entries = records.map((r: any) => ({ segment: String(r.segment ?? r.device ?? ""), sessions: Number(r.sessions ?? 0), convRate: Number(r.conv_rate ?? r.convRate ?? 0) })).filter((e: any) => e.sessions > 10);
  const best = entries.reduce((a: any, e: any) => e.convRate > (a?.convRate ?? 0) ? e : a, null as any);
  const worst = entries.reduce((a: any, e: any) => e.convRate < (a?.convRate ?? Infinity) ? e : a, null as any);

  if (best && worst && best.convRate > worst.convRate * 2) {
    insights.push({ severity: "warning", icon: "📊", text: `"${best.segment}" converts at ${fmtPct(best.convRate)} vs. "${worst.segment}" at ${fmtPct(worst.convRate)} — a ${(best.convRate / Math.max(0.01, worst.convRate)).toFixed(1)}x difference.` });
    recs.push({ impact: "high", text: `Optimize the experience for "${worst.segment}" users. The conversion gap suggests UX issues specific to this segment.` });
    if (aov > 0) { const opp = worst.sessions * ((best.convRate - worst.convRate) / 100) * aov; recs.push({ impact: "medium", text: `Closing the conversion gap for "${worst.segment}" could add ~${fmtCurrency(opp)} in revenue.` }); }
  } else if (best) {
    insights.push({ severity: "good", icon: "✅", text: "Conversion rates are relatively balanced across segments. No major attribution gaps." });
  }

  const summary = `Conversion Attribution correlates conversion rates with performance factors, device types, and browser platforms to identify which user segments convert best and why. This tab is built for Growth Analysts optimizing conversion funnels, Product Managers making platform investment decisions, and Performance Engineers quantifying the business impact of speed. It answers: Does page speed affect conversion? Which devices convert best? Which browsers underperform? What is the revenue impact of the conversion gap between segments? Currently analyzing ${entries.length} segments. ${best ? `Best-performing segment: "${best.segment}" at ${fmtPct(best.convRate)} conversion.` : ""} ${worst ? `Worst-performing segment: "${worst.segment}" at ${fmtPct(worst.convRate)} conversion.` : ""} ${best && worst && best.convRate > worst.convRate * 2 ? `The ${(best.convRate / Math.max(0.01, worst.convRate)).toFixed(1)}x conversion gap represents a significant optimization opportunity.` : "Conversion rates are relatively balanced across segments."} When AOV is configured, revenue columns are added to device and browser tables. Use this to build data-driven business cases for platform-specific optimizations.`;
  return { summary, insights, recommendations: recs };
}

function analyzeSegmentation(devices: any[], browsers: any[], geos: any[]): AIInsightsData {
  const insights: InsightItem[] = [];
  const recs: RecommendationItem[] = [];

  // Device analysis
  const mobile = devices.find((d: any) => String(d.deviceType ?? d.device ?? "").toLowerCase().includes("mobile"));
  const desktop = devices.find((d: any) => String(d.deviceType ?? d.device ?? "").toLowerCase().includes("desktop"));
  if (mobile && desktop) {
    const mobileSess = Number(mobile.sessions ?? 0);
    const desktopSess = Number(desktop.sessions ?? 0);
    const mobileShare = (mobileSess / Math.max(1, mobileSess + desktopSess)) * 100;
    insights.push({ severity: "info", icon: "📱", text: `Mobile traffic: ${fmtPct(mobileShare)} of sessions. ${mobileShare > 60 ? "Mobile-first optimization is critical." : mobileShare > 40 ? "Significant mobile audience — ensure mobile UX parity." : "Desktop-dominant traffic."}` });
    if (mobileShare > 50) recs.push({ impact: "medium", text: "Prioritize mobile performance: test on real mid-range devices, ensure touch targets are ≥48px, optimize for slower networks." });
  }

  // Browser diversity
  if (browsers.length > 8) insights.push({ severity: "info", icon: "🌐", text: `Users span ${browsers.length} browser types. Ensure cross-browser testing covers the top 5.` });

  const summary = `Segmentation breaks down your user base by device type, browser, and geography, showing Apdex and session distribution for each segment. This tab is designed for Product Managers understanding their audience composition, QA Leads prioritizing cross-browser testing, and Marketing Teams identifying high-value segments. It answers: What is our device mix? Which browsers do our users prefer? How is traffic distributed geographically? Does performance differ by segment? Currently spanning ${devices.length} device types, ${browsers.length} browsers, and ${geos.length} geolocations. ${mobile ? `Mobile traffic accounts for ${fmtPct(Number(mobile.sessions ?? 0) / Math.max(1, devices.reduce((a: number, d: any) => a + Number(d.sessions ?? 0), 0)) * 100)} of sessions — ${Number(mobile.sessions ?? 0) / Math.max(1, devices.reduce((a: number, d: any) => a + Number(d.sessions ?? 0), 0)) > 0.5 ? "indicating a mobile-first user base where mobile optimization is critical" : "desktop remains the primary platform"}.` : ""} Each segment shows session count, Apdex score, and when AOV is set, estimated revenue. Use this to prioritize testing and optimization efforts for your most impactful segments.`;
  return { summary, insights, recommendations: recs };
}

function analyzeErrorsDropoffs(errors: any[], funnelCounts: number[], steps: StepDef[]): AIInsightsData {
  const insights: InsightItem[] = [];
  const recs: RecommendationItem[] = [];

  const totalErrors = errors.reduce((a, e: any) => a + Number(e.occurrences ?? e.count ?? 0), 0);
  // Correlate errors with funnel drop-offs
  let maxDropIdx = 0, maxDrop = 0;
  for (let i = 1; i < funnelCounts.length; i++) {
    const drop = funnelCounts[i - 1] > 0 ? ((funnelCounts[i - 1] - funnelCounts[i]) / funnelCounts[i - 1]) * 100 : 0;
    if (drop > maxDrop) { maxDrop = drop; maxDropIdx = i; }
  }

  if (totalErrors > 0 && maxDrop > 30) {
    insights.push({ severity: "critical", icon: "🔗", text: `High error volume (${fmtCount(totalErrors)}) correlates with ${fmtPct(maxDrop)} drop-off at "${steps[maxDropIdx]?.label ?? `Step ${maxDropIdx + 1}`}". Errors may be causing abandonment.` });
    recs.push({ impact: "high", text: `Fix errors occurring at or before "${steps[maxDropIdx]?.label ?? `Step ${maxDropIdx + 1}`}" — they're likely driving the ${fmtPct(maxDrop)} drop-off.` });
  } else if (totalErrors > 0) {
    insights.push({ severity: "warning", icon: "⚠️", text: `${fmtCount(totalErrors)} errors detected but funnel drop-offs are moderate. Errors may be non-blocking.` });
  } else {
    insights.push({ severity: "good", icon: "✅", text: "No significant error-dropoff correlation detected." });
  }

  const summary = `Errors & Drop-offs analyzes the correlation between JavaScript errors and funnel abandonment, helping you determine whether technical failures are causing users to leave. This tab is designed for Reliability Engineers investigating conversion drops, Frontend Engineers prioritizing bug fixes by business impact, and Product Managers understanding the cost of technical debt. It answers: Are errors causing users to abandon the funnel? Which funnel step has the worst drop-off? Is the drop-off correlated with error volume? Currently tracking ${fmtCount(totalErrors)} errors with the largest drop-off of ${fmtPct(maxDrop)} at step ${maxDropIdx + 1} ("${steps[maxDropIdx]?.label ?? "Step " + (maxDropIdx + 1)}"). ${maxDrop > 30 && totalErrors > 0 ? "A strong correlation exists between error volume and funnel abandonment — fixing these errors should directly improve conversion." : "The correlation is weak, suggesting drop-offs are more likely driven by UX friction, content issues, or pricing rather than technical errors."} Each drop-off card shows the step pair, percentage lost, session count, and when AOV is configured, estimated revenue at risk.`;
  return { summary, insights, recommendations: recs };
}

function analyzeGenericTab(tabName: string): AIInsightsData {
  const tabDescriptions: Record<string, string> = {
    "Executive Summary": "Executive Summary provides a report-card style overview designed for stakeholders, executives, and non-technical leadership. It delivers a weighted letter grade (A-F), key metric trends, funnel summary, bottleneck alerts, CWV snapshot, and a full performance table. This tab answers: What is the overall health of our frontend? Is performance improving or declining? What are the top issues? Use Export PDF for presentations or Copy Text for Slack/Teams. It is designed for VPs of Engineering reviewing platform health, C-level executives needing quick status checks, and Product Directors preparing quarterly business reviews.",
    "Map": "Map provides an interactive choropleth visualization of user performance data projected onto a world or US map. Countries and US states are colorized by session count, average duration, Apdex, error rate, or estimated revenue (when AOV is set). This tab is designed for Infrastructure Architects evaluating CDN coverage, Global Operations Teams monitoring regional health, and Marketing Analysts understanding geographic audience distribution. It answers: Where are our users? Which regions have the best/worst performance? Are there geographic gaps in our infrastructure? Switch between World (country-level) and US (state-level) views using the dropdown. Clickable regions link to User Sessions for drill-down investigation.",
    "Navigation Paths": "Navigation Paths reveals actual user navigation flows across your site — not just the expected funnel, but the real paths users take including unexpected routes, loops, re-visits, and exit points. This tab is designed for Information Architects optimizing site structure, UX Researchers studying user wayfinding behavior, and Product Managers discovering organic user journeys that differ from the designed funnel. It answers: Where do users actually go? Which pages do users visit that aren't in the funnel? Where do navigation loops occur? Which transitions carry the most traffic? Page names are clickable and link to the Vitals app for detailed performance analysis.",
    "What-If Analysis": "What-If Analysis models the impact of traffic increases on your application's performance, projecting how Apdex, latency, conversion, and error rate would change under higher load. This tab is built for Capacity Planning Engineers preparing for traffic events (Black Friday, product launches), Performance Engineers setting scaling thresholds, and Business Stakeholders understanding the revenue risk of traffic spikes. It answers: What happens if traffic doubles? At what point will performance degrade below acceptable thresholds? What is the projected revenue impact of performance degradation under load? When AOV is set, it shows a full Revenue Impact section with projected revenue, net change, conversion degradation loss, and a Perf Tax breakdown.",
    "Session Replay Spotlight": "Session Replay Spotlight surfaces the highest-impact session replays ranked by a composite impact score combining errors, crashes, bounces, and interaction density. This tab is designed for QA Engineers reproducing bugs, UX Researchers observing real user behavior, and Support Teams investigating customer-reported issues. It answers: Which sessions had the most problems? What devices and browsers are most affected? Each session links directly to Dynatrace Session Replay for instant visual debugging — watch exactly what the user saw, clicked, and experienced. Start debugging with the sessions that matter most instead of manually searching.",
    "A/B Comparison": "A/B Comparison enables side-by-side performance analysis of two user segments across all key metrics. It includes pre-built segments (Desktop vs. Mobile, Chrome vs. Firefox, US vs. non-US) and supports custom DQL filter expressions for any segmentation you need. This tab is designed for CRO Specialists quantifying platform-specific gaps, Product Managers justifying mobile optimization investments, and Performance Engineers comparing browser rendering performance. It answers: How does performance differ between two segments? Which segment converts better? What is the Apdex, error rate, duration, and CWV comparison? Use the delta indicators to identify which segment underperforms and by how much.",
    "Revenue Intelligence": "Revenue Intelligence translates every performance metric into dollar impact using your configured Average Order Value (AOV). This tab is built for Business Analysts building ROI cases for performance optimization, CFOs understanding the financial cost of technical debt, and Product Managers prioritizing investments by revenue impact. It answers: How much revenue are we generating? How much are we losing to slow pages, frustrated sessions, and errors? Which optimization would yield the highest revenue uplift? The tab shows current vs. previous period revenue, revenue per session, three performance taxes (latency tax, frustration tax, error tax), funnel revenue leakage per step, and ranked optimization opportunities with projected revenue uplift. Requires AOV > 0 in Settings."
  };
  const desc = tabDescriptions[tabName];
  if (desc) return { summary: desc, insights: [{ severity: "info", icon: "📊", text: `Review the ${tabName} data above and compare against your organization's KPI targets.` }], recommendations: [{ impact: "low", text: "Establish baseline metrics for this view and set up alerting for deviations beyond 2 standard deviations." }] };
  return {
    summary: `${tabName} provides specialized analytics for this aspect of your user journey. Review the visualizations and data tables above, compare against your organization's KPI targets, and use the insights to drive data-informed decisions.`,
    insights: [{ severity: "info", icon: "📊", text: `Review the ${tabName} data above and compare against your organization's KPI targets.` }],
    recommendations: [{ impact: "low", text: "Establish baseline metrics for this view and set up alerting for deviations beyond 2 standard deviations." }],
  };
}

// Sankey sub-tab analysis functions
function analyzeSankeyFlow(pathAnalysis: any, observations: any[], recommendations: any[]): AIInsightsData {
  const insights: InsightItem[] = [];
  const recs: RecommendationItem[] = [];

  if (observations.length > 0) {
    for (const o of observations.slice(0, 5)) {
      insights.push({ severity: o.severity === "critical" ? "critical" : o.severity === "warning" ? "warning" : "good", icon: o.icon, text: o.text });
    }
  }
  if (recommendations.length > 0) {
    for (const r of recommendations.slice(0, 4)) {
      recs.push({ impact: r.impact === "high" ? "high" : r.impact === "medium" ? "medium" : "low", text: r.text });
    }
  }

  if (insights.length === 0) insights.push({ severity: "good", icon: "✅", text: "User flow patterns appear healthy with no critical observations." });

  const summary = `Sankey Flow Chart visualizes actual user navigation paths as an interactive flow diagram, revealing how users really move through your site versus the intended funnel. This tab is built for UX Researchers studying real navigation behavior, Information Architects optimizing site structure, and Product Managers discovering unexpected user journeys. It supports 7 chart styles (Classic, Gradient, Directed Flow, Alluvial, State Machine, Chord Diagram, Transition Heatmap), each offering different perspectives on the same data. Funnel pages are highlighted in gold (★) and exit points where ≥30% of traffic leaves are flagged in red (⛔). Currently ${observations.length} observation(s) and ${recommendations.length} recommendation(s) have been generated. ${observations.filter((o: any) => o.severity === "critical").length > 0 ? "Critical flow issues detected — review the flagged patterns." : "Flow patterns are within normal range."} Click any node to see per-page CWV health, error counts, and exit analysis.`;
  return { summary, insights, recommendations: recs };
}

function analyzeSankeySubTab(subTabName: string): AIInsightsData {
  const tips: Record<string, { summary: string; insight: string; rec: string }> = {
    "Conversion Paths": { summary: "Conversion Paths compares the navigation routes taken by users who converted against those who abandoned, revealing which pages and transitions differentiate successful journeys from failed ones. This sub-tab is designed for CRO Specialists identifying winning user flows, UX Researchers studying conversion behavior patterns, and Product Managers optimizing the path to purchase. It answers: What routes do converters take? Which pages appear in converted sessions but not abandoned ones? How do path lengths differ between converters and abandoners?", insight: "Compare top conversion paths against the designed funnel to identify unexpected but effective routes.", rec: "Promote the most successful conversion paths by making them more discoverable in navigation and CTAs." },
    "Loop Analysis": { summary: "Loop Analysis detects A\u2192B\u2192A back-and-forth navigation patterns where users cycle between pages repeatedly, indicating confusion, comparison shopping, or missing information. This sub-tab is designed for UX Designers identifying confusing navigation patterns, Content Strategists finding information gaps, and Product Managers reducing user friction. It answers: Where are users getting stuck in loops? Which page pairs have the most back-and-forth? Do loops correlate with errors or slow page loads?", insight: "Page loops often indicate confusion, missing information, or comparison behavior.", rec: "Add contextual help, progress indicators, or comparison tools on high-loop pages to reduce cycling." },
    "Page Timing": { summary: "Page Timing provides per-page load performance analysis across every page in your user journey, showing average and P90 durations with health scores. This sub-tab is designed for Performance Engineers identifying slow pages, Backend Engineers pinpointing which services need optimization, and DevOps Teams monitoring page-level SLAs. It answers: Which pages are the slowest? What are the P90 response times per page? Which pages are funnel bottlenecks due to performance? Are health scores correlating with drop-off rates?", insight: "Pages with high median load times are conversion bottlenecks — users abandon slow pages.", rec: "Target pages above 3s median load time for optimization. Use lazy loading and code splitting." },
    "Session Endpoints": { summary: "Session Endpoints analyzes where users end their sessions (browser close, navigation away), tracking bounce rates, terminal page distribution, and error correlation at exit points. This sub-tab is designed for UX Researchers understanding why users leave, Product Managers identifying content dead-ends, and Growth Teams implementing exit-intent interventions. It answers: Where do users most commonly end their sessions? Is there a correlation between errors and session termination? Which terminal pages have the highest bounce rates? Are users leaving from mid-funnel pages?", insight: "High exit rates on mid-funnel pages suggest friction or unmet expectations.", rec: "Add exit-intent interventions (offers, chat, surveys) on high-exit pages to recover abandoning users." },
    "Revenue Paths": { summary: "Revenue Paths maps user navigation journeys to monetary outcomes, identifying which specific page sequences generate the most revenue. This sub-tab is designed for Revenue Optimization Teams prioritizing high-value user flows, E-commerce Managers understanding purchase journeys, and Business Analysts calculating path-level ROI. It answers: Which navigation paths generate the most revenue? Which pages do converting users touch most frequently? What is the page touch rate for high-revenue sessions? Requires AOV to be configured in Settings.", insight: "High-revenue paths should be optimized for speed and reliability as a priority.", rec: "A/B test the top revenue-generating paths to find further conversion improvements." },
    "Path Trends": { summary: "Path Trends compares navigation patterns between the current and previous period, detecting new pages, dropped pages, frequency shifts, and transition changes over time. This sub-tab is designed for Release Managers assessing UX impact of deployments, Product Managers tracking navigation evolution, and Data Analysts monitoring user behavior shifts. It answers: How are navigation patterns changing? Are users visiting different pages than before? Have any pages appeared or disappeared from common flows? Do pattern changes correlate with deployments or campaigns?", insight: "Changing path patterns may indicate shifting user needs or the impact of site redesigns.", rec: "Correlate path trend changes with deployment dates to assess the impact of UX changes." },
    "Funnel Leakage": { summary: "Funnel Leakage performs deep analysis of users who navigate away from the intended funnel, classifying sessions into recoverers (users who returned to the funnel), lost users (who never came back), and straight-through converters. This sub-tab is designed for Growth Teams building re-engagement strategies, Product Managers understanding funnel exit behavior, and Revenue Analysts estimating the cost of leakage. It answers: Where do users exit the funnel? Do they come back? What do they do off-funnel? Which exit points have the worst recovery rates? What is the revenue impact of leakage?", insight: "Leakage points with high volume represent the largest recovery opportunities.", rec: "Implement re-engagement strategies (email retargeting, push notifications) for users who leak at high-volume exit points." },
    "Funnel Velocity": { summary: "Funnel Velocity measures the time users take between each pair of funnel steps, revealing where decision friction, information gaps, or technical slowness causes delays in the conversion journey. This sub-tab is designed for UX Researchers studying user decision-making speed, Product Managers identifying conversion friction, and Performance Engineers optimizing step transition times. It answers: How long does it take users to move between funnel steps? Which transitions are the slowest? Is the P90 much higher than the median (indicating a subset of users struggling disproportionately)? What does the overall journey time distribution look like?", insight: "Slow velocity between steps indicates decision friction or information gaps.", rec: "Reduce time-to-next-step by adding clear CTAs, reducing form complexity, and providing social proof." },
  };
  const t = tips[subTabName] ?? { summary: `${subTabName} analysis.`, insight: "Review the data above for patterns.", rec: "Establish baselines and monitor for changes." };
  return { summary: t.summary, insights: [{ severity: "info", icon: "📊", text: t.insight }], recommendations: [{ impact: "medium", text: t.rec }] };
}

function analyzeRootCauseCorrelation(hourlyData: any, quality: any, overallApdex: number, overallConv: number): AIInsightsData {
  const insights: InsightItem[] = [];
  const recs: RecommendationItem[] = [];

  const errRate = quality.total > 0 ? (quality.errors / quality.total) * 100 : 0;
  if (errRate > 3 && overallConv < 3) {
    insights.push({ severity: "critical", icon: "🔗", text: `High error rate (${fmtPct(errRate)}) coincides with low conversion (${fmtPct(overallConv)}). Strong negative correlation suggests errors are a root cause.` });
    recs.push({ impact: "high", text: "Prioritize error reduction — the statistical correlation suggests fixing errors will directly improve conversion rates." });
  }
  if (quality.avg > 3000 && overallConv < 3) {
    insights.push({ severity: "warning", icon: "⏱", text: `Slow average duration (${fmt(quality.avg)}) correlates with low conversion. Per Google, 53% of mobile users abandon sites taking >3s.` });
    recs.push({ impact: "high", text: "Performance is likely a conversion bottleneck. Focus on reducing server response time and optimizing critical rendering path." });
  }
  if (insights.length === 0) insights.push({ severity: "good", icon: "✅", text: "No strong negative correlations between performance/errors and conversion detected." });

  const summary = `Root Cause Correlation automatically cross-references conversion drops with technical signals — latency spikes, error surges, and frustrated sessions — on an hourly timeline to identify causal relationships. This tab is designed for SREs performing incident root-cause analysis, Performance Engineers diagnosing conversion impacts, and Engineering Managers understanding the business cost of technical issues. It answers: Why did conversion drop? Is it a performance issue, an error issue, or both? At what specific hours did degradation occur? ${errRate > 3 ? `The current error rate of ${fmtPct(errRate)} is a likely conversion blocker — errors and conversion drops correlate at the same hours.` : ""} ${quality.avg > 3000 ? `Average latency of ${fmt(quality.avg)} exceeds the 3s threshold — per Google, 53% of mobile users abandon sites taking more than 3 seconds.` : ""} ${insights.length === 1 && insights[0].severity === "good" ? "No dominant technical root cause identified — conversion may be influenced by UX design, content quality, pricing, or external factors." : ""} The tab provides ranked root cause signals with severity and confidence scores, hourly overlay charts, and per-step degradation analysis.`;
  return { summary, insights, recommendations: recs };
}

function analyzePredictiveForecasting(quality: any, overallApdex: number, overallConv: number): AIInsightsData {
  const insights: InsightItem[] = [];
  const recs: RecommendationItem[] = [];

  if (overallApdex < 0.7) { insights.push({ severity: "warning", icon: "📉", text: `Current Apdex (${overallApdex.toFixed(2)}) projects continued user dissatisfaction if no action is taken.` }); recs.push({ impact: "high", text: "Without performance improvements, expect Apdex to remain below acceptable thresholds. Prioritize P90 latency reduction." }); }
  else insights.push({ severity: "good", icon: "📈", text: `Current Apdex (${overallApdex.toFixed(2)}) trajectory is healthy.` });

  if (overallConv < 2) { insights.push({ severity: "warning", icon: "📉", text: `Conversion rate (${fmtPct(overallConv)}) is below industry baseline. Forecast suggests intervention needed.` }); recs.push({ impact: "high", text: "Set a 90-day improvement target of +1% conversion. Focus on reducing the top 3 funnel drop-off points." }); }

  recs.push({ impact: "low", text: "Forecasts are based on linear trends. Consider seasonality and planned launches when interpreting projections." });

  const summary = `Predictive Forecasting uses linear regression on your trend data to project key metrics (Apdex, conversion rate, error rate, average duration) forward 7 days, identifying budget breaches before they actually happen. This tab is built for SREs practicing proactive incident prevention, Engineering Managers planning sprint priorities based on projected risk, and Product Managers forecasting conversion trajectory. It answers: Where are my metrics heading? Will I breach any performance budget in the next 7 days? At what rate is each metric improving or degrading? ${overallApdex < 0.7 || overallConv < 2 ? `Current trends indicate intervention is needed — Apdex at ${overallApdex.toFixed(2)} and conversion at ${fmtPct(overallConv)} are on trajectories that will miss targets without corrective action.` : "Current trajectories are stable and within acceptable bounds."} Each metric shows trend direction, rate of change per day, current vs. projected values, and days-to-breach estimates. Longer timeframes provide more reliable forecasts. Note: consider seasonality when interpreting projections.`;
  return { summary, insights, recommendations: recs };
}

function analyzeResourceWaterfall(waterfallData: any, byStepData: any): AIInsightsData {
  const records = (waterfallData?.data?.records ?? []) as any[];
  const insights: InsightItem[] = [];
  const recs: RecommendationItem[] = [];

  if (records.length === 0) return { summary: "No resource waterfall data available.", insights: [], recommendations: [] };

  const entries = records.map((r: any) => ({ type: String(r.res_type ?? ""), avgDur: Number(r.avg_dur ?? 0), count: Number(r.requests ?? 0), totalBytes: Number(r.total_size ?? 0) }));
  const slowResources = entries.filter((e: any) => e.avgDur > 500);
  const heavyResources = entries.filter((e: any) => e.totalBytes > 500000);

  if (slowResources.length > 0) { insights.push({ severity: "warning", icon: "🐌", text: `${slowResources.length} resource type(s) have average load time >500ms. These slow down page rendering.` }); recs.push({ impact: "medium", text: "Optimize slow resources: compress images (WebP/AVIF), minify JS/CSS, implement HTTP/2 multiplexing." }); }
  if (heavyResources.length > 0) { insights.push({ severity: "warning", icon: "📦", text: `${heavyResources.length} resource type(s) exceed 500KB total. Google recommends total page weight under 1.5MB.` }); recs.push({ impact: "medium", text: "Reduce page weight: lazy-load below-fold images, tree-shake unused JavaScript, use dynamic imports for code splitting." }); }
  if (slowResources.length === 0 && heavyResources.length === 0) insights.push({ severity: "good", icon: "✅", text: "Resource loading performance is within acceptable bounds." });

  const summary = `Resource Waterfall provides aggregated resource timing analysis per funnel step plus individual session-level drill-down, revealing which scripts, images, stylesheets, XHR calls, and fonts are slowing down your pages. This tab is essential for Frontend Performance Engineers optimizing page weight and render speed, DevOps Engineers managing CDN configuration, and Tech Leads evaluating third-party script costs. It answers: Which resources take the longest to load? Which individual requests are the slowest? Which sessions are affected? How do resources differ by funnel step? Currently analyzing ${entries.length} resource types. ${slowResources.length} type(s) have average load times exceeding 500ms, and ${heavyResources.length} type(s) exceed 500KB total payload. ${slowResources.length + heavyResources.length === 0 ? "All resources are well-optimized." : "Optimization opportunities identified that could improve LCP and overall page load speed."} The Top 10 Slowest Resources section ranks individual resource requests by duration with clickable links to affected sessions. The Session Drill-Down panel shows all resources loaded within a selected session for waterfall-style analysis. Use this to identify CDN cache misses, unoptimized images, render-blocking scripts, and oversized bundles.`;
  return { summary, insights, recommendations: recs };
}

function analyzeChangeIntelligence(deployData: any, quality: any, qualityPrev: any, overallApdex: number, overallApdexPrev: number): AIInsightsData {
  const records = (deployData?.data?.records ?? []) as any[];
  const insights: InsightItem[] = [];
  const recs: RecommendationItem[] = [];

  const deployCount = records.length;
  const apdexDelta = overallApdexPrev > 0 ? ((overallApdex - overallApdexPrev) / overallApdexPrev) * 100 : 0;
  const errDelta = qualityPrev.errors > 0 ? ((quality.errors - qualityPrev.errors) / qualityPrev.errors) * 100 : 0;

  if (deployCount > 0) {
    insights.push({ severity: "info", icon: "🚀", text: `${deployCount} deployment event(s) detected in the current timeframe.` });
    if (apdexDelta < -10) { insights.push({ severity: "critical", icon: "🔴", text: `Apdex degraded ${Math.abs(apdexDelta).toFixed(1)}% post-deployment. A recent change may have introduced a performance regression.` }); recs.push({ impact: "high", text: "Correlate the Apdex drop with specific deployment timestamps. Consider rollback if the regression is severe." }); }
    if (errDelta > 30) { insights.push({ severity: "critical", icon: "🔴", text: `Errors increased ${Math.abs(errDelta).toFixed(1)}% after deployment(s). New code may have introduced bugs.` }); recs.push({ impact: "high", text: "Review error logs for new exception types introduced after the latest deployment. Consider feature flags for gradual rollout." }); }
    if (apdexDelta >= 0 && errDelta <= 0) insights.push({ severity: "good", icon: "✅", text: "No performance or error regressions detected post-deployment." });
  } else {
    insights.push({ severity: "info", icon: "📋", text: "No deployment events detected. Performance changes are likely organic or infrastructure-related." });
  }

  recs.push({ impact: "low", text: "Implement deployment markers via Dynatrace Events API to automatically correlate releases with performance changes." });

  const summary = `Change Intelligence correlates deployment events with performance metrics to automatically detect whether a release caused a regression or improvement. This tab is designed for Release Managers validating deployment safety, DevOps Engineers practicing continuous delivery, and SREs investigating post-release incidents. It answers: Did my latest deployment cause a regression? How do Apdex, error rate, duration, and frustrated sessions compare before vs. after each deployment? Currently ${deployCount} deployment event(s) detected. ${apdexDelta < -10 ? `Apdex degraded ${Math.abs(apdexDelta).toFixed(1)}% post-deployment — a recent change may have introduced a performance regression.` : ""} ${errDelta > 30 ? `Errors increased ${Math.abs(errDelta).toFixed(1)}% after deployment(s) — new code may have introduced bugs.` : ""} ${apdexDelta >= 0 && errDelta <= 0 ? "No regressions detected post-deployment — releases appear safe." : ""} The tab shows before/after metric comparisons per deployment, severity classification, and when AOV is configured, estimated revenue loss per regression. Check this tab after every release.`;
  return { summary, insights, recommendations: recs };
}

function analyzeSLOTracker(quality: any, overallApdex: number, overallConv: number, cwv: any): AIInsightsData {
  const insights: InsightItem[] = [];
  const recs: RecommendationItem[] = [];

  const slos = [
    { name: "Apdex SLO", current: overallApdex, target: 0.85, format: (v: number) => v.toFixed(2), lowerBetter: false },
    { name: "LCP SLO", current: cwv.lcp, target: 2500, format: fmt, lowerBetter: true },
    { name: "Error Budget", current: quality.total > 0 ? (quality.errors / quality.total) * 100 : 0, target: 1, format: fmtPct, lowerBetter: true },
  ];

  let slosMet = 0;
  for (const s of slos) {
    const met = s.lowerBetter ? s.current <= s.target : s.current >= s.target;
    if (met) { slosMet++; insights.push({ severity: "good", icon: "✅", text: `${s.name}: ${s.format(s.current)} meets target (${s.format(s.target)}).` }); }
    else {
      const remaining = s.lowerBetter ? s.current - s.target : s.target - s.current;
      insights.push({ severity: "critical", icon: "🔴", text: `${s.name}: ${s.format(s.current)} misses target (${s.format(s.target)}). Error budget may be exhausted.` });
      recs.push({ impact: "high", text: `${s.name} is burning error budget. ${s.lowerBetter ? "Reduce" : "Improve"} by ${s.format(Math.abs(remaining))} to meet SLO.` });
    }
  }

  const summary = `SLO Tracker provides SRE-grade Service Level Objective monitoring with error budget tracking, burn rate analysis, and projected time to exhaustion. SLO target values are now user-editable inline (click ✎ per metric) and persisted per user. A one-click "Create SLO" button per metric provisions the SLO natively in the Dynatrace platform (opens SLO settings page pre-filled with metric, target, and filter for the current frontend). This tab is built for SRE Teams managing reliability targets, Engineering Directors overseeing platform health, and Operations Managers reporting on SLA compliance. It answers: Are we meeting our SLOs? How much error budget remains? At the current burn rate, when will we exhaust our budget? Which SLOs are at risk? The tracker monitors Apdex SLO (default target ≥0.85), LCP SLO (default target ≤2.5s), and Error Budget SLO (default target ≤1% error rate) — all customizable. Currently ${slosMet}/${slos.length} SLOs are being met. ${slosMet === slos.length ? "All SLOs are healthy — error budgets have sufficient remaining capacity." : `${slos.length - slosMet} SLO(s) are at risk and may exhaust their error budget if current trends continue.`} The tab tracks error budget burn-down with hourly granularity, showing remaining budget percentage, burn rate per hour, and projected time to exhaustion. Color-coded status indicators flag SLOs transitioning from healthy to at-risk before they breach.`;
  return { summary, insights, recommendations: recs };
}

function analyzeCohortRetention(dailyData: any[], avgSessionsPerUser: number, overallConvRate: number): AIInsightsData {
  const insights: InsightItem[] = [];
  const recs: RecommendationItem[] = [];

  if (avgSessionsPerUser >= 2) insights.push({ severity: "good", icon: "✅", text: `Average ${avgSessionsPerUser.toFixed(1)} sessions/user indicates healthy return visitor engagement (benchmark: ≥1.5).` });
  else { insights.push({ severity: "warning", icon: "⚠️", text: `Average ${avgSessionsPerUser.toFixed(1)} sessions/user is below the 1.5 benchmark. Users aren't returning.` }); recs.push({ impact: "medium", text: "Improve retention: implement email re-engagement campaigns, personalized content, and push notifications for return visits." }); }

  if (overallConvRate < 2) { insights.push({ severity: "warning", icon: "📉", text: `Cohort conversion rate of ${fmtPct(overallConvRate)} is below the 2% e-commerce baseline.` }); recs.push({ impact: "high", text: "Focus on cohort-specific conversion: analyze which daily cohorts convert best and replicate those conditions." }); }

  // Look for declining trend
  if (dailyData.length >= 7) {
    const first3Avg = dailyData.slice(0, 3).reduce((a: number, d: any) => a + d.convRate, 0) / 3;
    const last3Avg = dailyData.slice(-3).reduce((a: number, d: any) => a + d.convRate, 0) / 3;
    if (last3Avg < first3Avg * 0.8) { insights.push({ severity: "warning", icon: "📉", text: `Cohort conversion is declining: recent days average ${fmtPct(last3Avg)} vs. earlier ${fmtPct(first3Avg)}.` }); recs.push({ impact: "medium", text: "Investigate the cause of declining cohort conversion — check for seasonal patterns, campaign changes, or site issues." }); }
  }

  const summary = `Cohort Retention analyzes daily user cohorts — groups of users who visited on the same day — tracking their session frequency, return patterns, and conversion over time. This tab is designed for Growth Product Managers measuring retention, Marketing Analysts evaluating campaign effectiveness by cohort, and Data Analysts identifying user lifecycle patterns. It answers: Are users coming back? How many sessions does each user have on average? Which daily cohorts convert best? Is conversion trending up or down? Currently averaging ${avgSessionsPerUser.toFixed(1)} sessions per user (benchmark: ≥1.5 indicates healthy return engagement) with an overall cohort conversion rate of ${fmtPct(overallConvRate)}. ${avgSessionsPerUser >= 2 ? "Return engagement is strong — users are coming back for repeat visits, a positive signal for product-market fit." : "Return engagement needs improvement — users are largely single-visit, suggesting opportunities for re-engagement campaigns and personalized content."} The tab includes daily cohort cards, device-type breakdown, sessions-per-user metrics, and a daily trend chart with conversion rate overlay. When AOV is configured, cohort revenue totals are displayed.`;
  return { summary, insights, recommendations: recs };
}

function analyzeSessionEngagement(avgScore: number, highPct: number, lowPct: number, highConvRate: number, lowConvRate: number): AIInsightsData {
  const insights: InsightItem[] = [];
  const recs: RecommendationItem[] = [];

  if (avgScore >= 50) insights.push({ severity: "good", icon: "✅", text: `Average engagement score of ${avgScore.toFixed(0)}/100 is healthy.` });
  else { insights.push({ severity: "warning", icon: "⚠️", text: `Average engagement score of ${avgScore.toFixed(0)}/100 is low. Users aren't deeply interacting with your site.` }); recs.push({ impact: "medium", text: "Increase engagement: add interactive elements, improve content relevance, and use progressive disclosure to guide users deeper." }); }

  if (highConvRate > lowConvRate * 3 && highConvRate > 0) {
    insights.push({ severity: "info", icon: "📊", text: `Highly engaged users convert at ${fmtPct(highConvRate)} vs ${fmtPct(lowConvRate)} for low engagement — a ${(highConvRate / Math.max(0.1, lowConvRate)).toFixed(1)}x difference.` });
    recs.push({ impact: "high", text: "Focus on moving medium-engagement users to high engagement. This group represents the largest conversion uplift opportunity." });
  }

  if (lowPct > 50) { insights.push({ severity: "warning", icon: "⚠️", text: `${fmtPct(lowPct)} of sessions have low engagement (<30). Most visitors leave without meaningful interaction.` }); recs.push({ impact: "high", text: "Reduce bounce: improve above-the-fold content, add clear value propositions, and ensure fast initial page load." }); }

  const summary = `Session Engagement assigns a quantitative engagement score (0-100) to every session based on three weighted factors: actions taken (30% weight — breadth of interaction), funnel depth reached (40% weight — progression toward conversion), and error penalty (30% weight — negative impact of errors). This tab is designed for UX Researchers understanding interaction depth, CRO Specialists identifying high-intent non-converters, and Product Managers segmenting users by engagement level. It answers: How engaged are users? Is there a correlation between engagement and conversion? Who are the high-intent users that didn't convert? Currently the average engagement score is ${avgScore.toFixed(0)}/100. High-engagement sessions (score ≥70, representing ${fmtPct(highPct)} of traffic) convert at ${fmtPct(highConvRate)}, while low-engagement sessions (score <30, representing ${fmtPct(lowPct)} of traffic) convert at ${fmtPct(lowConvRate)} — a ${(highConvRate / Math.max(0.1, lowConvRate)).toFixed(1)}x difference. ${lowPct > 50 ? "The majority of sessions have low engagement, indicating most visitors leave without meaningful interaction." : "Engagement distribution is balanced across tiers."} The tab includes a score histogram with conversion overlay, tier-based conversion analysis, and a high-intent non-converter table — deeply engaged users who didn't convert represent your biggest optimization opportunity.`;
  return { summary, insights, recommendations: recs };
}

function analyzeThirdPartyImpact(thirdPartyPct: number, avgThirdPartyDur: number, avgFirstPartyDur: number, thirdPartyCount: number): AIInsightsData {
  const insights: InsightItem[] = [];
  const recs: RecommendationItem[] = [];

  if (thirdPartyPct > 60) { insights.push({ severity: "critical", icon: "🔴", text: `Third-party requests make up ${fmtPct(thirdPartyPct)} of all requests. Industry recommendation is <40%.` }); recs.push({ impact: "high", text: "Audit third-party scripts: remove unused tags, defer non-critical scripts, and self-host critical resources where possible." }); }
  else if (thirdPartyPct > 40) insights.push({ severity: "warning", icon: "⚠️", text: `Third-party requests at ${fmtPct(thirdPartyPct)}. Monitor for growth — each additional third-party adds latency risk.` });
  else insights.push({ severity: "good", icon: "✅", text: `Third-party request share of ${fmtPct(thirdPartyPct)} is well-managed.` });

  if (avgThirdPartyDur > avgFirstPartyDur * 2 && avgThirdPartyDur > 300) {
    insights.push({ severity: "warning", icon: "⏱", text: `3P avg duration (${Math.round(avgThirdPartyDur)}ms) is ${(avgThirdPartyDur / Math.max(1, avgFirstPartyDur)).toFixed(1)}x slower than 1P (${Math.round(avgFirstPartyDur)}ms).` });
    recs.push({ impact: "medium", text: "Slow third-party resources: use async/defer loading, implement resource hints (preconnect/dns-prefetch), set timeouts for non-critical third parties." });
  }

  const summary = `Third-Party Impact analyzes the performance cost of external resources (analytics tags, ad scripts, social widgets, CDN-hosted libraries, marketing pixels) by comparing first-party vs. third-party request counts, payload sizes, and loading durations. This tab is essential for Performance Engineers auditing external dependencies, Security Teams reviewing third-party attack surface, and Tech Leads making build-vs-buy decisions. It answers: What percentage of requests go to third parties? Are third-party scripts slower than first-party resources? Which external domains have the highest request volume? Currently ${thirdPartyCount} external domains are loaded, accounting for ${fmtPct(thirdPartyPct)} of all requests (industry recommendation: <40%). ${thirdPartyPct > 60 ? "Excessive third-party dependency detected — each additional external domain adds latency, failure risk, and security attack surface." : "Third-party usage is within acceptable range."} The tab shows per-domain request counts, payload sizes, and average durations. A page-level CWV correlation table reveals whether specific third-party scripts are degrading Core Web Vitals. Use this to justify removing unused tags, self-hosting critical libraries, and implementing async/defer loading.`;
  return { summary, insights, recommendations: recs };
}

function analyzeErrorClustering(clusters: any[], totalErrors: number): AIInsightsData {
  const insights: InsightItem[] = [];
  const recs: RecommendationItem[] = [];

  if (clusters.length === 0) return { summary: "No errors to cluster.", insights: [{ severity: "good", icon: "✅", text: "Zero errors detected — excellent reliability." }], recommendations: [] };

  const topCluster = clusters[0];
  const topPct = totalErrors > 0 ? (Number(topCluster?.occurrences ?? 0) / totalErrors) * 100 : 0;

  if (topPct > 50) { insights.push({ severity: "critical", icon: "🎯", text: `Top error cluster represents ${fmtPct(topPct)} of all errors. Single point of failure risk.` }); recs.push({ impact: "high", text: `Fix "${String(topCluster?.name ?? "").substring(0, 40)}" first — eliminating this one error type cuts error volume by more than half.` }); }

  if (clusters.length > 20) { insights.push({ severity: "warning", icon: "📊", text: `${clusters.length} distinct error types — indicates widespread code quality issues.` }); recs.push({ impact: "medium", text: "Implement a systematic error triage process. Categorize errors by impact (sessions affected × frequency) and address top 5 first." }); }

  const criticalClusters = clusters.filter((c: any) => Number(c.sessions ?? 0) > 100);
  if (criticalClusters.length > 0) {
    insights.push({ severity: "critical", icon: "🔴", text: `${criticalClusters.length} error cluster(s) affect 100+ sessions each. These are high-impact reliability issues.` });
  }

  recs.push({ impact: "low", text: "Set up error budget alerting: notify when any single error type exceeds 1% of total sessions." });

  const summary = `Error Clustering groups JavaScript errors by type and pattern to create a prioritized triage list, helping engineering teams focus on the errors that affect the most users. This tab is built for Frontend Engineers debugging production errors, QA Leads tracking error regression, and Engineering Managers allocating bug-fix resources based on impact. It answers: How many distinct error types exist? Which error cluster affects the most sessions? Is one error type dominating? Are errors trending up or down? Currently tracking ${clusters.length} unique error types with ${fmtCount(totalErrors)} total occurrences. ${topPct > 50 ? `The top error cluster represents ${fmtPct(topPct)} of all errors — fixing one error type would eliminate more than half of all JavaScript failures.` : "Errors are distributed across multiple types, suggesting systematic code quality improvements are needed."} The tab includes occurrence counts and affected session counts per cluster, an hourly error trend chart for detecting spikes, a top-clusters bar chart for visual prioritization, and sample error messages for quick root cause identification.`;
  return { summary, insights, recommendations: recs };
}

// ===========================================================================
// TAB: Funnel Overview (with Compare)
// ===========================================================================
function FunnelOverviewTab({ funnelCounts, funnelCountsPrev, overallConv, overallApdex, stepMap, pageMap, quality, compareMode, setCompareMode, isLoading, isFetching, lastRefreshedAt, refreshIntervalMs, appEntityId, steps, aov, funnelStyle, onFunnelStyleChange, todayHourlyData }: { funnelCounts: number[]; funnelCountsPrev: number[]; overallConv: number; overallApdex: number; stepMap: Map<string, any>; pageMap: Map<string, any>; quality: any; compareMode: boolean; setCompareMode: (v: boolean) => void; isLoading: boolean; isFetching: boolean; lastRefreshedAt: number; refreshIntervalMs: number; appEntityId?: string; steps: StepDef[]; aov: number; funnelStyle: FunnelStyle; onFunnelStyleChange: (v: FunnelStyle) => void; todayHourlyData: any; }) {
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeFunnelOverview(overallConv, overallApdex, quality, funnelCounts, steps, stepMap, aov, pageMap), [overallConv, overallApdex, quality, funnelCounts, steps, stepMap, aov, pageMap]));
  // Ticker to keep "last refreshed X ago" text updating
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    if (refreshIntervalMs <= 0) return;
    const id = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(id);
  }, [refreshIntervalMs]);
  const [funnelSubTab, setFunnelSubTab] = React.useState<"funnel"|"predictive"|"steps"|"pages">("funnel");

  // On initial load (no data yet) show spinner; on auto-refresh keep existing data visible
  const hasNoData = funnelCounts.every(c => c === 0) && quality.total === 0;
  if (isLoading && hasNoData) return <Loading />;

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

  // Predictive EOD model — linear regression on today's 10-min conv rates
  const todayRecords = (todayHourlyData?.data?.records ?? []) as any[];
  const slotToMin = (v: any): number => {
    const n = Number(v);
    if (!isNaN(n) && n > 1e10) { const d = new Date(n); return d.getHours() * 60 + d.getMinutes(); }
    if (typeof v === "string") { const d = new Date(v); return d.getHours() * 60 + d.getMinutes(); }
    return 0;
  };
  const hourlyPoints = todayRecords
    .map((r: any) => ({ min: slotToMin(r.slot_ts), rate: Number(r.conv_rate ?? 0), sessions: Number(r.total_sessions ?? 0) }))
    .sort((a, b) => a.min - b.min)
    .filter(p => p.sessions > 0);
  const predN = hourlyPoints.length;
  let projectedEod = overallConv;
  let velocitySlopePerMin = 0;
  let predConfidence = 0;
  if (predN >= 2) {
    const sumX = hourlyPoints.reduce((a, p) => a + p.min, 0);
    const sumY = hourlyPoints.reduce((a, p) => a + p.rate, 0);
    const sumXY = hourlyPoints.reduce((a, p) => a + p.min * p.rate, 0);
    const sumXX = hourlyPoints.reduce((a, p) => a + p.min * p.min, 0);
    const denom = predN * sumXX - sumX * sumX;
    velocitySlopePerMin = denom !== 0 ? (predN * sumXY - sumX * sumY) / denom : 0;
    const intercept = (sumY - velocitySlopePerMin * sumX) / predN;
    projectedEod = Math.max(0, Math.min(100, velocitySlopePerMin * 1425 + intercept));
    const now = new Date(); const currentMinutes = now.getHours() * 60 + now.getMinutes();
    predConfidence = Math.min(95, Math.round((predN / Math.max(1, currentMinutes / 15)) * 100));
  }
  const velocitySlope = velocitySlopePerMin * 60; // convert to %/hour for display
  const currentHour = new Date().getHours();
  const currentMin = currentHour * 60 + new Date().getMinutes();
  const velocityDir = velocitySlope > 0.05 ? "rising" : velocitySlope < -0.05 ? "declining" : "stable";
  const velocityClr = velocitySlope > 0.05 ? GREEN : velocitySlope < -0.05 ? RED : YELLOW;

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      {aiPanel}

      {/* Auto-refresh indicator */}
      {refreshIntervalMs > 0 && (
        <Flex alignItems="center" gap={8} style={{ fontSize: 12, opacity: 0.6 }}>
          {isFetching && (
            <svg width="14" height="14" viewBox="0 0 14 14" style={{ animation: "spin 1s linear infinite" }}>
              <circle cx="7" cy="7" r="5.5" fill="none" stroke="rgba(69,137,255,0.4)" strokeWidth="2" />
              <path d="M7 1.5 A5.5 5.5 0 0 1 12.5 7" fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
          <Text style={{ fontSize: 12, opacity: 0.7 }}>
            {isFetching ? "Refreshing…" : `Last refreshed ${formatTimeAgo(lastRefreshedAt)}`}
          </Text>
          <Text style={{ fontSize: 11, opacity: 0.4 }}>
            (every {refreshIntervalMs < 60000 ? `${refreshIntervalMs / 1000}s` : `${refreshIntervalMs / 60000}m`})
          </Text>
        </Flex>
      )}

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
            <Text style={{ fontSize: 13, opacity: 0.5 }}>Satisfied</Text>
            <Heading level={4} style={{ color: GREEN, margin: "4px 0" }}>{fmtCount(quality.satisfied)}</Heading>
            <Text style={{ fontSize: 12, opacity: 0.4 }}>≤ {APDEX_T / 1000}s</Text>
          </div>
          <div style={{ textAlign: "center" }}>
            <Text style={{ fontSize: 13, opacity: 0.5 }}>Tolerating</Text>
            <Heading level={4} style={{ color: YELLOW, margin: "4px 0" }}>{fmtCount(quality.tolerating)}</Heading>
            <Text style={{ fontSize: 12, opacity: 0.4 }}>≤ {APDEX_4T / 1000}s</Text>
          </div>
          <div style={{ textAlign: "center" }}>
            <Text style={{ fontSize: 13, opacity: 0.5 }}>Frustrated</Text>
            <Heading level={4} style={{ color: RED, margin: "4px 0" }}>{fmtCount(quality.frustrated)}</Heading>
            <Text style={{ fontSize: 12, opacity: 0.4 }}>&gt; {APDEX_4T / 1000}s</Text>
          </div>
          <div style={{ flex: 1, height: 10, borderRadius: 5, overflow: "hidden", display: "flex", minWidth: 200 }}>
            <div style={{ width: `${quality.total > 0 ? (quality.satisfied / quality.total) * 100 : 0}%`, background: GREEN, height: "100%" }} />
            <div style={{ width: `${quality.total > 0 ? (quality.tolerating / quality.total) * 100 : 0}%`, background: YELLOW, height: "100%" }} />
            <div style={{ width: `${quality.total > 0 ? (quality.frustrated / quality.total) * 100 : 0}%`, background: RED, height: "100%" }} />
          </div>
        </Flex>
      </div>

      {/* Funnel Overview sub-tab bar — pill style matching Sankey */}
      <Flex gap={4} flexWrap="wrap" style={{ padding: "4px 0" }}>
        {([
          { key: "funnel",     label: "Conversion Funnel",  icon: "🔻" },
          { key: "predictive", label: "Predictive Model",   icon: "📈" },
          { key: "steps",      label: "Step Analysis",      icon: "📋" },
          { key: "pages",      label: "Per-Page Breakdown", icon: "📄" },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setFunnelSubTab(t.key as any)} style={{
            padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: funnelSubTab === t.key ? 700 : 400, cursor: "pointer",
            background: funnelSubTab === t.key ? "rgba(69,137,255,0.15)" : "rgba(128,128,128,0.06)",
            border: funnelSubTab === t.key ? "1px solid rgba(69,137,255,0.4)" : "1px solid rgba(128,128,128,0.15)",
            color: funnelSubTab === t.key ? BLUE : "inherit", transition: "all 0.15s",
          }}>{t.icon} {t.label}</button>
        ))}
      </Flex>

      {/* Conversion Funnel */}
      {funnelSubTab === "funnel" && (
        <Flex flexDirection="column" gap={20}>
      {/* Funnel style + compare controls */}
      <Flex alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={12}>
        <SectionHeader title="Conversion Funnel" />
        <Flex alignItems="center" gap={12}>
          <Text style={{ fontSize: 13, opacity: 0.5 }}>Style</Text>
          <Select value={funnelStyle} onChange={(val) => { if (val) onFunnelStyleChange(val as FunnelStyle); }}>
            <Select.Trigger style={{ minWidth: 170 }} />
            <Select.Content>
              {FUNNEL_STYLE_OPTIONS.map(o => <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>)}
            </Select.Content>
          </Select>
          <button onClick={() => setCompareMode(!compareMode)} className={`uj-compare-toggle ${compareMode ? "active" : ""}`}>
            {compareMode ? "\u27F5 Hide Compare" : "Compare \u27F6"}
          </button>
        </Flex>
      </Flex>
      <div className="uj-funnel-container">
        {funnelStyle === "classic" && <FunnelChart steps={funnelSteps} prevSteps={prevFunnelSteps} appEntityId={appEntityId} stepDefs={steps} aov={aov} />}
        {funnelStyle === "horizontal" && <HorizontalBarFunnel steps={funnelSteps} prevSteps={prevFunnelSteps} aov={aov} />}
        {funnelStyle === "cohort" && <StackedCohortFunnel steps={funnelSteps} prevSteps={prevFunnelSteps} aov={aov} />}
        {funnelStyle === "elapsed" && <ElapsedTimeFunnel steps={funnelSteps} prevSteps={prevFunnelSteps} stepMap={stepMap} stepDefs={steps} />}
        {funnelStyle === "split" && <ComparisonSplitFunnel steps={funnelSteps} prevSteps={makeFunnelSteps(funnelCountsPrev)} aov={aov} />}
        {compareMode && (funnelStyle === "classic" || funnelStyle === "cohort" || funnelStyle === "elapsed") && (
          <Flex gap={12} justifyContent="center" style={{ marginTop: 8 }}>
            <Flex gap={6} alignItems="center"><div style={{ width: 20, height: 3, background: BLUE, borderRadius: 2 }} /><Text style={{ fontSize: 12, opacity: 0.5 }}>Current period</Text></Flex>
            <Flex gap={6} alignItems="center"><div style={{ width: 20, height: 3, borderTop: "2px dashed rgba(255,255,255,0.3)" }} /><Text style={{ fontSize: 12, opacity: 0.5 }}>Previous period</Text></Flex>
          </Flex>
        )}
      </div>
        </Flex>
      )}

      {/* Predictive Model */}
      {funnelSubTab === "predictive" && (
        <Flex flexDirection="column" gap={20}>
      {predN >= 2 ? (() => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const actualTs = buildTimeseries("Conversion Rate", hourlyPoints.map(p => ({
          time: new Date(today.getTime() + p.min * 60000),
          value: p.rate,
        })), "percent");
        const last = hourlyPoints[hourlyPoints.length - 1];
        const projTs = buildTimeseries("Projected", [
          { time: new Date(today.getTime() + last.min * 60000), value: last.rate },
          { time: new Date(today.getTime() + 1425 * 60000), value: projectedEod },
        ], "percent");
        return (
          <ChartTile title="Predictive Funnel Model" description="Today's conversion trajectory to EOD">
            <Flex alignItems="center" justifyContent="flex-end" style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, opacity: 0.35 }}>{predConfidence}% confidence · {predN} data point{predN !== 1 ? "s" : ""}</Text>
            </Flex>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 20 }}>
              <div className="uj-kpi-card" style={{ padding: "20px 24px" }}>
                <Text className="uj-kpi-label">Projected EOD</Text>
                <Heading level={3} className="uj-kpi-value" style={{ color: statusClr(projectedEod) }}>{fmtPct(projectedEod)}</Heading>
                <Text style={{ fontSize: 12, opacity: 0.45 }}>conv rate at 23:59</Text>
              </div>
              <div className="uj-kpi-card" style={{ padding: "20px 24px" }}>
                <Text className="uj-kpi-label">Velocity</Text>
                <Heading level={3} className="uj-kpi-value" style={{ color: velocityClr }}>{velocitySlope >= 0 ? "+" : ""}{velocitySlope.toFixed(2)}%/h</Heading>
                <Text style={{ fontSize: 12, color: velocityClr }}>{velocityDir}</Text>
              </div>
              <div className="uj-kpi-card" style={{ padding: "20px 24px" }}>
                <Text className="uj-kpi-label">Hours Remaining</Text>
                <Heading level={3} className="uj-kpi-value" style={{ color: BLUE }}>{23 - currentHour}h</Heading>
                <Text style={{ fontSize: 12, opacity: 0.45 }}>until end of day</Text>
              </div>
            </div>
            {(() => {
              const forecastStart = new Date(new Date().setHours(0, 0, 0, 0) + hourlyPoints[hourlyPoints.length - 1].min * 60000);
              return (
                <TimeseriesChart gapPolicy="connect" curve="linear">
                  <TimeseriesChart.Area data={actualTs} color={BLUE} />
                  <TimeseriesChart.Line data={projTs} color={velocityClr} />
                  <TimeseriesChart.Legend hidden />
                  <TimeseriesChart.Annotations>
                    <TimeseriesAnnotations.Track>
                      <TimeseriesAnnotations.Marker start={forecastStart} title="Forecast" symbol="▸" />
                    </TimeseriesAnnotations.Track>
                  </TimeseriesChart.Annotations>
                </TimeseriesChart>
              );
            })()}
          </ChartTile>
        );
      })() : (
        <ChartTile title="Predictive Funnel Model" description="Today's conversion trajectory to EOD">
          <Text style={{ opacity: 0.5, textAlign: "center", padding: 24 }}>Predictive model requires ≥2 data points for today. Check back after more data accumulates.</Text>
        </ChartTile>
      )}
        </Flex>
      )}

      {/* Step Analysis */}
      {funnelSubTab === "steps" && (
        <Flex flexDirection="column" gap={20}>
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
            { id: "P90 (ms)", header: "P90", accessor: "P90 (ms)", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 3000 ? RED : value > 1000 ? YELLOW : GREEN }}>{fmt(value)}</Text> },
            { id: "Apdex", header: "Apdex", accessor: "Apdex", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: apdexClr(value) }}>{value.toFixed(2)}</Strong> },
            { id: "Conv %", header: "Conv %", accessor: "Conv %", sortType: "number" as any, cell: ({ value, rowData }: any) => rowData.Step === 1 ? <Text style={{ opacity: 0.5 }}>entry</Text> : <Strong style={{ color: statusClr(value) }}>{fmtPct(value)}</Strong> },
            { id: "Abandons", header: "Abandons", accessor: "Abandons", sortType: "number" as any, cell: ({ value, rowData }: any) => rowData.Step === 1 ? <Text style={{ opacity: 0.5 }}>—</Text> : <Strong style={{ color: value > 0 ? RED : GREEN }}>{fmtCount(value)}</Strong> },
            { id: "Errors", header: "Errors", accessor: "Errors", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 0 ? RED : undefined }}>{value}</Text> },
          ]}
        />
      </div>
        </Flex>
      )}

      {/* Per-Page Breakdown */}
      {funnelSubTab === "pages" && (
        <Flex flexDirection="column" gap={20}>
      {steps.some(s => s.identifiers.length > 1) ? (
        <>
          <Text style={{ fontSize: 12, opacity: 0.5 }}>Individual page metrics for steps with multiple pages. First page is the primary link target.</Text>
          {steps.map((step, i) => {
            if (step.identifiers.length < 2) return null;
            const m = stepMap.get(step.label);
            const stepApdex = m ? calcApdex(Number(m.satisfied ?? 0), Number(m.tolerating ?? 0), Number(m.total_actions ?? 0)) : 0;
            const stepSessions = funnelCounts[i] ?? 0;
            return (
              <div key={i} className="uj-table-tile" style={{ padding: 16 }}>
                <Flex alignItems="center" gap={12} style={{ marginBottom: 10 }}>
                  <span className="uj-step-badge">{i + 1}</span>
                  {(() => { const pid = stepPrimaryIdentifier(step); return appEntityId && pid ? (
                    <a href={vitalsUrl(appEntityId, pid)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: BLUE, fontWeight: 700, fontSize: 15 }} onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")} onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}>{step.label} ↗</a>
                  ) : (
                    <Heading level={5} style={{ margin: 0 }}>{step.label}</Heading>
                  ); })()}
                  <Text style={{ fontSize: 12, opacity: 0.4, marginLeft: 8 }}>Rollup: {fmtCount(stepSessions)} sessions · Apdex {stepApdex.toFixed(2)}</Text>
                </Flex>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
                  {step.identifiers.map((id, j) => {
                    let pm = pageMap.get(id);
                    if (!pm) { for (const [key, val] of pageMap) { if (identifierMatchesLabel(id, key)) { pm = val; break; } } }
                    const sessions = pm ? Number(pm.sessions ?? 0) : 0;
                    const avg = pm ? Number(pm.avg_duration_ms ?? 0) : 0;
                    const p90 = pm ? Number(pm.p90_duration_ms ?? 0) : 0;
                    const errors = pm ? Number(pm.error_count ?? 0) : 0;
                    const sat = pm ? Number(pm.satisfied ?? 0) : 0;
                    const tol = pm ? Number(pm.tolerating ?? 0) : 0;
                    const total = pm ? Number(pm.total_actions ?? 0) : 0;
                    const apdex = calcApdex(sat, tol, total);
                    const linkable = appEntityId && !isWildcard(id);
                    const isPrimary = j === 0;
                    return (
                      <div key={j} style={{ padding: "10px 12px", borderRadius: 8, background: isPrimary ? "rgba(69,137,255,0.06)" : "rgba(128,128,128,0.04)", border: `1px solid ${isPrimary ? "rgba(69,137,255,0.15)" : "rgba(128,128,128,0.1)"}` }}>
                        <Flex alignItems="center" gap={6} style={{ marginBottom: 6 }}>
                          {isPrimary && <span style={{ fontSize: 9, fontWeight: 700, color: BLUE, background: `${BLUE}18`, padding: "1px 5px", borderRadius: 3 }}>PRIMARY</span>}
                          {linkable ? (
                            <a href={vitalsUrl(appEntityId!, id)} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, textDecoration: "none", fontSize: 13, fontWeight: 600 }} onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")} onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}>{id} ↗</a>
                          ) : (
                            <Text style={{ fontSize: 13, fontWeight: 600 }}>{id}</Text>
                          )}
                        </Flex>
                        <Flex gap={12} flexWrap="wrap" alignItems="center">
                          <div><Text style={{ fontSize: 11, opacity: 0.5 }}>Sessions</Text><br/><Strong style={{ color: BLUE, fontSize: 14 }}>{fmtCount(sessions)}</Strong></div>
                          <div><Text style={{ fontSize: 11, opacity: 0.5 }}>Apdex</Text><br/><Strong style={{ color: apdexClr(apdex), fontSize: 14 }}>{apdex.toFixed(2)}</Strong></div>
                          <div><Text style={{ fontSize: 11, opacity: 0.5 }}>Avg</Text><br/><Strong style={{ color: avg > 3000 ? RED : avg > 1000 ? YELLOW : GREEN, fontSize: 14 }}>{fmt(avg)}</Strong></div>
                          <div><Text style={{ fontSize: 11, opacity: 0.5 }}>P90</Text><br/><Strong style={{ color: p90 > 3000 ? RED : p90 > 1500 ? YELLOW : GREEN, fontSize: 14 }}>{fmt(p90)}</Strong></div>
                          <div><Text style={{ fontSize: 11, opacity: 0.5 }}>Errors</Text><br/><Strong style={{ color: errors > 0 ? RED : GREEN, fontSize: 14 }}>{errors}</Strong></div>
                        </Flex>
                        <div style={{ marginTop: 6, height: 4, borderRadius: 2, overflow: "hidden", display: "flex" }}>
                          <div style={{ width: `${total > 0 ? (sat / total) * 100 : 0}%`, background: GREEN, height: "100%" }} />
                          <div style={{ width: `${total > 0 ? (tol / total) * 100 : 0}%`, background: YELLOW, height: "100%" }} />
                          <div style={{ width: `${total > 0 ? ((total - sat - tol) / total) * 100 : 0}%`, background: RED, height: "100%" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      ) : (
        <div className="uj-table-tile" style={{ padding: 24, textAlign: "center" }}>
          <Text style={{ opacity: 0.5 }}>No multi-page steps configured. Per-page breakdown is available when a step has multiple page identifiers.</Text>
        </div>
      )}
        </Flex>
      )}
    </Flex>
  );
}


// ===========================================================================
// TAB: Trends (Period-over-Period Comparison) — NEW
// ===========================================================================
function TrendsTab({ quality, qualityPrev, overallApdex, overallApdexPrev, overallConv, overallConvPrev, funnelCounts, funnelCountsPrev, isLoading, steps, aov, sparklineRecords, convSparklineRecords }: { quality: any; qualityPrev: any; overallApdex: number; overallApdexPrev: number; overallConv: number; overallConvPrev: number; funnelCounts: number[]; funnelCountsPrev: number[]; isLoading: boolean; steps: StepDef[]; aov: number; sparklineRecords: any[]; convSparklineRecords: any[] }) {
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeTrends(quality, qualityPrev, overallApdex, overallApdexPrev, overallConv, overallConvPrev, funnelCounts, funnelCountsPrev, aov), [quality, qualityPrev, overallApdex, overallApdexPrev, overallConv, overallConvPrev, funnelCounts, funnelCountsPrev, aov]));

  if (isLoading) return <Loading />;

  const errorRate = quality.total > 0 ? (quality.errors / quality.total) * 100 : 0;
  const errorRatePrev = qualityPrev.total > 0 ? (qualityPrev.errors / qualityPrev.total) * 100 : 0;
  const lastIdx = steps.length - 1;
  const currRevenue = aov > 0 ? (funnelCounts[lastIdx] ?? 0) * aov : 0;
  const prevRevenue = aov > 0 ? (funnelCountsPrev[lastIdx] ?? 0) * aov : 0;

  // Parse daily sparkline rows
  const sparkRows = sparklineRecords.map((r: any) => ({
    sessions: Number(r.sessions ?? 0), total: Number(r.total ?? 0),
    avg_dur: Number(r.avg_dur ?? 0), p50_dur: Number(r.p50_dur ?? 0), p90_dur: Number(r.p90_dur ?? 0),
    errors: Number(r.errors ?? 0), satisfied: Number(r.satisfied ?? 0),
    tolerating: Number(r.tolerating ?? 0), frustrated: Number(r.frustrated ?? 0),
  }));
  const sparkSeries: Record<string, number[]> = {
    sessions:  sparkRows.map((r: any) => r.sessions),
    total:     sparkRows.map((r: any) => r.total),
    avg_dur:   sparkRows.map((r: any) => r.avg_dur),
    p50_dur:   sparkRows.map((r: any) => r.p50_dur),
    p90_dur:   sparkRows.map((r: any) => r.p90_dur),
    errors:    sparkRows.map((r: any) => r.errors),
    errorRate: sparkRows.map((r: any) => r.total > 0 ? (r.errors / r.total) * 100 : 0),
    apdex:     sparkRows.map((r: any) => r.total > 0 ? calcApdex(r.satisfied, r.tolerating, r.total) : 0),
    frustrated: sparkRows.map((r: any) => r.frustrated),
  };
  const convSparkRows = convSparklineRecords.map((r: any) => ({
    conv_rate: Number(r.conv_rate ?? 0),
    converted_sessions: Number(r.converted_sessions ?? 0),
  }));
  sparkSeries['convRate'] = convSparkRows.map((r: any) => r.conv_rate);
  sparkSeries['revenue']  = convSparkRows.map((r: any) => r.converted_sessions * aov);

  // Z-score anomaly: is the current period value unusual vs the daily series?
  function anomalySignal(series: number[], current: number, prev: number, inverted: boolean): { level: "anomaly" | "notable" | "normal"; good: boolean } | null {
    if (series.length < 3) return null;
    const mean = series.reduce((a: number, b: number) => a + b, 0) / series.length;
    const variance = series.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / series.length;
    const std = Math.sqrt(variance);
    if (std < 0.001 * (Math.abs(mean) || 1)) return { level: "normal", good: true };
    const lastVal = series[series.length - 1];
    const z = Math.abs(lastVal - mean) / std;
    // Direction based on period-over-period to match the delta % shown on the card
    const good = inverted ? current < prev : current > prev;
    if (z >= 2) return { level: "anomaly", good };
    if (z >= 1.2) return { level: "notable", good };
    return { level: "normal", good: true };
  }

  const trends = [
    { label: "Sessions",      current: quality.sessions,   prev: qualityPrev.sessions,   inverted: false, format: fmtCount,                         sparkKey: "sessions"   as string | null },
    { label: "Total Actions", current: quality.total,      prev: qualityPrev.total,      inverted: false, format: fmtCount,                         sparkKey: "total"      as string | null },
    { label: "Conversion Rate", current: overallConv,      prev: overallConvPrev,         inverted: false, format: fmtPct,                           sparkKey: "convRate" as string | null },
    ...(aov > 0 ? [{ label: "Revenue",  current: currRevenue,        prev: prevRevenue,           inverted: false, format: fmtCurrency,                      sparkKey: "revenue" as string | null }] : []),
    { label: "Apdex",         current: overallApdex,       prev: overallApdexPrev,        inverted: false, format: (v: number) => v.toFixed(2),     sparkKey: "apdex"      as string | null },
    { label: "Avg Duration",  current: quality.avg,        prev: qualityPrev.avg,         inverted: true,  format: fmt,                             sparkKey: "avg_dur"    as string | null },
    { label: "P50 Duration",  current: quality.p50,        prev: qualityPrev.p50,         inverted: true,  format: fmt,                             sparkKey: "p50_dur"    as string | null },
    { label: "P90 Duration",  current: quality.p90,        prev: qualityPrev.p90,         inverted: true,  format: fmt,                             sparkKey: "p90_dur"    as string | null },
    { label: "Error Rate",    current: errorRate,           prev: errorRatePrev,           inverted: true,  format: fmtPct,                          sparkKey: "errorRate"  as string | null },
    { label: "Errors",        current: quality.errors,     prev: qualityPrev.errors,      inverted: true,  format: fmtCount,                        sparkKey: "errors"     as string | null },
    { label: "Frustrated",    current: quality.frustrated, prev: qualityPrev.frustrated,  inverted: true,  format: fmtCount,                        sparkKey: "frustrated" as string | null },
  ];

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      {aiPanel}
      <SectionHeader title="Period-over-Period Comparison" />
      <Text style={{ fontSize: 12, opacity: 0.5 }}>Comparing current period with the equivalent previous period. Sparklines show daily shape across the period. Anomaly badges flag changes that exceed 2 std dev of daily variance.</Text>

      <Flex gap={16} flexWrap="wrap">
        {trends.map((t) => {
          const delta = t.current - t.prev;
          const pct = t.prev > 0 ? (delta / t.prev) * 100 : (t.current > 0 ? 100 : 0);
          const improving = t.inverted ? delta <= 0 : delta >= 0;
          const color = Math.abs(pct) < 1 ? "rgba(255,255,255,0.5)" : improving ? GREEN : RED;
          const series: number[] = t.sparkKey ? (sparkSeries[t.sparkKey] ?? []) : [];
          const anomaly = t.sparkKey ? anomalySignal(series, t.current, t.prev, t.inverted) : null;
          const hasSpark = series.length >= 2;
          const sMin = hasSpark ? Math.min(...series) : 0;
          const sMax = hasSpark ? Math.max(...series) : 1;
          const sRange = sMax - sMin || 1;
          const SW = 200, SH = 30;
          const sparkPts = hasSpark ? series.map((v, i) => `${(i / (series.length - 1)) * SW},${SH - ((v - sMin) / sRange) * (SH - 4) + 2}`).join(" ") : "";
          const dotX = hasSpark ? ((series.length - 1) / (series.length - 1)) * SW : 0;
          const dotY = hasSpark ? SH - ((series[series.length - 1] - sMin) / sRange) * (SH - 4) + 2 : 0;

          return (
            <div key={t.label} className="uj-trend-card">
              {/* Label + anomaly badge */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 11, opacity: 0.5, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>{t.label}</span>
                {anomaly?.level === "anomaly" && !anomaly.good && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(194,25,48,0.15)", color: RED, border: "1px solid rgba(194,25,48,0.25)", whiteSpace: "nowrap" as const }}>⚠ Anomaly</span>}
                {anomaly?.level === "anomaly" &&  anomaly.good && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(35,134,54,0.15)", color: GREEN, border: "1px solid rgba(35,134,54,0.3)", whiteSpace: "nowrap" as const }}>↑ Spike</span>}
                {anomaly?.level === "notable" && !anomaly.good && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(255,167,0,0.10)", color: YELLOW, border: "1px solid rgba(255,167,0,0.25)", whiteSpace: "nowrap" as const }}>↓ Notable</span>}
                {anomaly?.level === "notable" &&  anomaly.good && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(35,134,54,0.10)", color: GREEN, border: "1px solid rgba(35,134,54,0.2)", whiteSpace: "nowrap" as const }}>↑ Notable</span>}
                {anomaly?.level === "normal"  && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(128,128,128,0.08)", color: "rgba(128,128,128,0.45)", border: "1px solid rgba(128,128,128,0.15)", whiteSpace: "nowrap" as const }}>∿ Normal</span>}
              </div>
              {/* Current value */}
              <Heading level={3} style={{ margin: "2px 0 6px", color }}>{t.format(t.current)}</Heading>
              {/* Sparkline */}
              {hasSpark && (
                <svg width="100%" viewBox={`0 0 ${SW} ${SH}`} style={{ display: "block", marginBottom: 6, overflow: "visible" }}>
                  <polyline points={sparkPts} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" strokeOpacity={0.65} />
                  <circle cx={dotX} cy={dotY} r={2.5} fill={color} fillOpacity={0.9} />
                </svg>
              )}
              {/* Was + delta */}
              <Flex gap={8} alignItems="center">
                <Text style={{ fontSize: 12, opacity: 0.4 }}>was {t.format(t.prev)}</Text>
                <Delta current={t.current} previous={t.prev} inverted={t.inverted} />
              </Flex>
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
function WebVitalsTab({ cwv: v, cwvByPage, cwvTrend, isLoading, appEntityId }: { cwv: { lcp: number; cls: number; inp: number; ttfb: number; load: number }; cwvByPage: any; cwvTrend: any; isLoading: boolean; appEntityId?: string }) {
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeWebVitals(v), [v]));
  if (isLoading) return <Loading />;

  const pages = (cwvByPage.data?.records ?? []) as any[];
  const trendRecords = (cwvTrend?.data?.records ?? []) as any[];
  const lcpScore = v.lcp <= CWV.lcp.good ? 100 : v.lcp <= CWV.lcp.poor ? 50 : 0;
  const clsScore = v.cls <= CWV.cls.good ? 100 : v.cls <= CWV.cls.poor ? 50 : 0;
  const inpScore = v.inp <= CWV.inp.good ? 100 : v.inp <= CWV.inp.poor ? 50 : 0;
  const ttfbScore = v.ttfb <= CWV.ttfb.good ? 100 : v.ttfb <= CWV.ttfb.poor ? 50 : 0;
  const healthScore = Math.round((lcpScore * 0.35 + clsScore * 0.25 + inpScore * 0.25 + ttfbScore * 0.15));

  // Remediation recommendations based on failing vitals + top offending pages
  const remediations: { vital: string; status: "good" | "needs-improvement" | "poor"; value: string; topPages: string[]; recommendations: string[] }[] = [];
  const sortedByLcp = [...pages].sort((a, b) => Number(b.lcp_avg ?? 0) - Number(a.lcp_avg ?? 0));
  const sortedByCls = [...pages].sort((a, b) => Number(b.cls_avg ?? 0) - Number(a.cls_avg ?? 0));
  const sortedByInp = [...pages].sort((a, b) => Number(b.inp_avg ?? 0) - Number(a.inp_avg ?? 0));
  const sortedByTtfb = [...pages].sort((a, b) => Number(b.ttfb_avg ?? 0) - Number(a.ttfb_avg ?? 0));

  if (v.lcp > CWV.lcp.good) {
    const status = v.lcp > CWV.lcp.poor ? "poor" : "needs-improvement";
    const topPages = sortedByLcp.slice(0, 3).map(p => String(p.pageName ?? "unknown"));
    remediations.push({ vital: "LCP", status, value: fmt(v.lcp), topPages, recommendations: [
      "Preload critical hero images and fonts using <link rel=\"preload\">",
      "Implement lazy loading for below-the-fold images and iframes",
      "Reduce server response time (TTFB) — consider CDN or edge caching",
      "Eliminate render-blocking CSS/JS — defer non-critical resources",
      "Optimize image formats (WebP/AVIF) and implement responsive srcset",
    ]});
  }
  if (v.cls > CWV.cls.good) {
    const status = v.cls > CWV.cls.poor ? "poor" : "needs-improvement";
    const topPages = sortedByCls.slice(0, 3).map(p => String(p.pageName ?? "unknown"));
    remediations.push({ vital: "CLS", status, value: v.cls.toFixed(3), topPages, recommendations: [
      "Set explicit width/height attributes on images and video elements",
      "Reserve space for dynamic ad slots and embeds with CSS aspect-ratio",
      "Avoid inserting content above existing content (banners, consent modals)",
      "Use CSS contain:layout on animated elements to prevent reflow",
      "Preload web fonts and use font-display:swap with size-adjust fallback",
    ]});
  }
  if (v.inp > CWV.inp.good) {
    const status = v.inp > CWV.inp.poor ? "poor" : "needs-improvement";
    const topPages = sortedByInp.slice(0, 3).map(p => String(p.pageName ?? "unknown"));
    remediations.push({ vital: "INP", status, value: fmt(v.inp), topPages, recommendations: [
      "Break up long tasks (>50ms) using requestIdleCallback or scheduler.yield()",
      "Debounce expensive event handlers (scroll, input, resize)",
      "Move heavy computation to Web Workers",
      "Reduce DOM size — large DOM trees slow style recalculation",
      "Defer third-party scripts that block the main thread",
    ]});
  }
  if (v.ttfb > CWV.ttfb.good) {
    const status = v.ttfb > CWV.ttfb.poor ? "poor" : "needs-improvement";
    const topPages = sortedByTtfb.slice(0, 3).map(p => String(p.pageName ?? "unknown"));
    remediations.push({ vital: "TTFB", status, value: fmt(v.ttfb), topPages, recommendations: [
      "Enable server-side caching (Redis, Varnish) for frequently accessed pages",
      "Use a CDN to reduce geographic latency",
      "Optimize database queries — add indexes, reduce N+1 queries",
      "Enable HTTP/2 or HTTP/3 for multiplexed connections",
      "Implement stale-while-revalidate caching strategy",
    ]});
  }

  // Trend chart data
  const trendSorted = [...trendRecords].sort((a, b) => String(a.bucket_key ?? "").localeCompare(String(b.bucket_key ?? "")));

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      {aiPanel}
      <Flex gap={16} flexWrap="wrap" alignItems="center">
        <div className="uj-kpi-card" style={{ minWidth: 160 }}>
          <Text className="uj-kpi-label">Performance Health</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: healthScore >= 80 ? GREEN : healthScore >= 50 ? YELLOW : RED }}>{healthScore}/100</Heading>
          <Text style={{ fontSize: 12, opacity: 0.5 }}>Weighted: LCP 35%, CLS 25%, INP 25%, TTFB 15%</Text>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Load Event End</Text>
          <Heading level={3} className="uj-kpi-value" style={{ color: v.load > 3000 ? RED : v.load > 1500 ? YELLOW : GREEN }}>{fmt(v.load)}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Failing Vitals</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: remediations.length > 2 ? RED : remediations.length > 0 ? YELLOW : GREEN }}>{remediations.length}/4</Heading>
        </div>
      </Flex>

      <SectionHeader title="Core Web Vitals" />
      <Flex gap={16} flexWrap="wrap">
        <CwvCard label="Largest Contentful Paint" value={v.lcp} unit="ms" metric="lcp" />
        <CwvCard label="Cumulative Layout Shift" value={v.cls} unit="" metric="cls" />
        <CwvCard label="Interaction to Next Paint" value={v.inp} unit="ms" metric="inp" />
        <CwvCard label="Time to First Byte" value={v.ttfb} unit="ms" metric="ttfb" />
      </Flex>

      {/* CWV Trend Chart */}
      {trendSorted.length > 1 && (
          <ChartTile title="CWV Trend" description="Daily averages over the selected timeframe. Dashed lines = Google thresholds (good).">
            {(() => {
              const cwvMetrics = [
                { key: "lcp_val", label: "LCP", color: BLUE },
                { key: "inp_val", label: "INP", color: PURPLE },
                { key: "ttfb_val", label: "TTFB", color: CYAN },
              ];
              const cwvTimeseries = cwvMetrics.map(m => buildTimeseries(m.label,
                trendSorted.map(r => ({ time: new Date(String(r.bucket_key ?? "")), value: Number(r[m.key] ?? 0) })),
                "millisecond"
              ));
              const clsTs = buildTimeseries("CLS",
                trendSorted.map(r => ({ time: new Date(String(r.bucket_key ?? "")), value: Number(r.cls_val ?? 0) }))
              );
              return (
                <>
                  <TimeseriesChart gapPolicy="connect" curve="linear">
                    {cwvTimeseries.map((ts, i) => (
                      <TimeseriesChart.Line key={cwvMetrics[i].key} data={ts} color={cwvMetrics[i].color} />
                    ))}
                    <TimeseriesChart.Legend hidden />
                  </TimeseriesChart>
                  <Text style={{ fontSize: 11, opacity: 0.4, marginTop: 8, display: "block" }}>CLS (separate scale)</Text>
                  <TimeseriesChart gapPolicy="connect" curve="linear" height={120}>
                    <TimeseriesChart.Line data={clsTs} color={ORANGE} />
                    <TimeseriesChart.Legend hidden />
                  </TimeseriesChart>
                </>
              );
            })()}
            {/* Trend direction indicators */}
            {trendSorted.length >= 3 && (() => {
              const first3 = trendSorted.slice(0, Math.ceil(trendSorted.length / 2));
              const last3 = trendSorted.slice(Math.ceil(trendSorted.length / 2));
              const avgFirst = (arr: any[], key: string) => arr.reduce((a, r) => a + Number(r[key] ?? 0), 0) / arr.length;
              const avgLast = (arr: any[], key: string) => arr.reduce((a, r) => a + Number(r[key] ?? 0), 0) / arr.length;
              const trends = [
                { label: "LCP", first: avgFirst(first3, "lcp_val"), last: avgLast(last3, "lcp_val"), lower: true },
                { label: "CLS", first: avgFirst(first3, "cls_val"), last: avgLast(last3, "cls_val"), lower: true },
                { label: "INP", first: avgFirst(first3, "inp_val"), last: avgLast(last3, "inp_val"), lower: true },
                { label: "TTFB", first: avgFirst(first3, "ttfb_val"), last: avgLast(last3, "ttfb_val"), lower: true },
              ];
              return (
                <Flex gap={16} style={{ marginTop: 12 }}>
                  {trends.map(t => {
                    const delta = t.last - t.first;
                    const pct = t.first > 0 ? (delta / t.first) * 100 : 0;
                    const improving = t.lower ? delta < 0 : delta > 0;
                    const stable = Math.abs(pct) < 3;
                    const color = stable ? "rgba(128,128,128,0.5)" : improving ? GREEN : RED;
                    const arrow = stable ? "●" : delta > 0 ? "▲" : "▼";
                    return (
                      <div key={t.label} style={{ fontSize: 12 }}>
                        <Text style={{ opacity: 0.5, fontSize: 11 }}>{t.label}</Text>
                        <Strong style={{ display: "block", color }}>{arrow} {stable ? "Stable" : `${Math.abs(pct).toFixed(1)}% ${improving ? "better" : "worse"}`}</Strong>
                      </div>
                    );
                  })}
                </Flex>
              );
            })()}
          </ChartTile>
      )}

      {/* Automated Remediation Recommendations */}
      {remediations.length > 0 && (
        <>
          <SectionHeader title="Remediation Recommendations" />
          <Flex flexDirection="column" gap={12}>
            {remediations.map((r) => {
              const color = r.status === "poor" ? RED : YELLOW;
              return (
                <div key={r.vital} className="uj-anomaly-card" style={{ borderLeftColor: color, minWidth: 0, flex: "none" }}>
                  <Flex alignItems="center" justifyContent="space-between" style={{ marginBottom: 8 }}>
                    <Flex alignItems="center" gap={8}>
                      <Strong style={{ fontSize: 14 }}>{r.vital} — {r.value}</Strong>
                      <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 4, background: `${color}18`, color, fontWeight: 700, textTransform: "uppercase" as const }}>{r.status === "poor" ? "FAILING" : "NEEDS IMPROVEMENT"}</span>
                    </Flex>
                  </Flex>
                  {/* Top offending pages */}
                  <div style={{ marginBottom: 10 }}>
                    <Text style={{ fontSize: 11, opacity: 0.5 }}>Top offending pages:</Text>
                    <Flex gap={6} flexWrap="wrap" style={{ marginTop: 4 }}>
                      {r.topPages.map((p, pi) => (
                        <span key={pi} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: `${color}10`, color, fontWeight: 600 }}>{p}</span>
                      ))}
                    </Flex>
                  </div>
                  {/* Actionable recommendations */}
                  <div style={{ padding: "8px 12px", background: "rgba(128,128,128,0.06)", borderRadius: 6 }}>
                    {r.recommendations.map((rec, ri) => (
                      <div key={ri} style={{ fontSize: 12, padding: "3px 0", display: "flex", gap: 6, alignItems: "flex-start" }}>
                        <span style={{ color, fontWeight: 700, flexShrink: 0 }}>→</span>
                        <Text style={{ fontSize: 12 }}>{rec}</Text>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </Flex>
        </>
      )}
      {remediations.length === 0 && (
        <div className="uj-table-tile" style={{ padding: 16 }}>
          <Text style={{ color: GREEN, fontSize: 13 }}>✅ All Core Web Vitals are passing — no remediation needed. Keep monitoring for regressions.</Text>
        </div>
      )}

      <SectionHeader title="Web Vitals by Page" />
      <div className="uj-table-tile">
        {pages.length === 0 ? <div style={{ padding: 20 }}><Text>No per-page data available</Text></div> : (
          <DataTable sortable resizable fullWidth data={pages.map((p: any) => ({ Page: p["pageName"] ?? "Unknown", "LCP (ms)": Number(p.lcp_avg ?? 0), CLS: Number(p.cls_avg ?? 0), "TTFB (ms)": Number(p.ttfb_avg ?? 0), "Load (ms)": Number(p.load_avg ?? 0) }))}
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
              <Text style={{ display: "block", fontSize: 13, opacity: 0.5, marginBottom: 4 }}>{t.desc}</Text>
              <Flex gap={8}>
                <span style={{ fontSize: 12, color: GREEN, background: `${GREEN}15`, padding: "2px 6px", borderRadius: 4 }}>{t.good}</span>
                <span style={{ fontSize: 12, color: YELLOW, background: `${YELLOW}15`, padding: "2px 6px", borderRadius: 4 }}>{t.ni}</span>
                <span style={{ fontSize: 12, color: RED, background: `${RED}15`, padding: "2px 6px", borderRadius: 4 }}>{t.poor}</span>
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
function StepDetailsTab({ stepMap, pageMap, cwvByPage, isLoading, appEntityId, steps, aov = 0, funnelCounts = [] }: { stepMap: Map<string, any>; pageMap: Map<string, any>; cwvByPage: any; isLoading: boolean; appEntityId?: string; steps: StepDef[]; aov?: number; funnelCounts?: number[] }) {
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeStepDetails(stepMap, steps, funnelCounts), [stepMap, steps, funnelCounts]));
  const [compareSteps, setCompareSteps] = React.useState<Set<number>>(new Set());
  const [cwvSteps, setCwvSteps] = React.useState<Set<number>>(new Set());

  const toggleCwv = (idx: number) => {
    setCwvSteps(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  // Build CWV lookup map: pageName → { lcp, cls, inp }
  const cwvMap = useMemo(() => {
    const m = new Map<string, { lcp: number; cls: number; inp: number }>();
    for (const r of (cwvByPage?.data?.records ?? []) as any[]) {
      const name = String(r.pageName ?? "");
      if (name) m.set(name, { lcp: Number(r.lcp_avg ?? 0), cls: Number(r.cls_avg ?? 0), inp: Number(r.inp_avg ?? 0) });
    }
    return m;
  }, [cwvByPage?.data]);
  if (isLoading) return <Loading />;

  const toggleCompare = (idx: number) => {
    setCompareSteps(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const extractMetrics = (m: any) => {
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
    return { avg, p50, p90, p99, total, errors, sat, tol, fru, apdex, errRate };
  };

  const renderDelta = (current: number, primary: number, inverted = false, suffix = "") => {
    if (primary === 0 && current === 0) return null;
    const delta = current - primary;
    const pct = primary > 0 ? (delta / primary) * 100 : (current > 0 ? 100 : 0);
    if (Math.abs(pct) < 0.5) return null;
    const better = inverted ? delta < 0 : delta > 0;
    const clr = better ? GREEN : RED;
    const arrow = delta > 0 ? "▲" : "▼";
    return <span style={{ fontSize: 11, color: clr, fontWeight: 600, marginLeft: 4 }}>{arrow}{Math.abs(pct).toFixed(1)}%{suffix}</span>;
  };

  const renderMetricRow = (label: string, met: ReturnType<typeof extractMetrics>, primaryMet?: ReturnType<typeof extractMetrics>, isPrimary = false) => (
    <>
      <Flex gap={16} flexWrap="wrap">
        <div className="uj-metric-box"><Text className="uj-metric-label">Avg Duration</Text><Strong className="uj-metric-value" style={{ color: met.avg > 3000 ? RED : met.avg > 1000 ? YELLOW : GREEN }}>{fmt(met.avg)}</Strong>{primaryMet && !isPrimary && renderDelta(met.avg, primaryMet.avg, true)}</div>
        <div className="uj-metric-box"><Text className="uj-metric-label">P50</Text><Strong className="uj-metric-value">{fmt(met.p50)}</Strong>{primaryMet && !isPrimary && renderDelta(met.p50, primaryMet.p50, true)}</div>
        <div className="uj-metric-box"><Text className="uj-metric-label">P90</Text><Strong className="uj-metric-value" style={{ color: met.p90 > 3000 ? RED : met.p90 > 1500 ? YELLOW : GREEN }}>{fmt(met.p90)}</Strong>{primaryMet && !isPrimary && renderDelta(met.p90, primaryMet.p90, true)}</div>
        <div className="uj-metric-box"><Text className="uj-metric-label">P99</Text><Strong className="uj-metric-value" style={{ color: met.p99 > 5000 ? RED : GREEN }}>{fmt(met.p99)}</Strong>{primaryMet && !isPrimary && renderDelta(met.p99, primaryMet.p99, true)}</div>
        <div className="uj-metric-box"><Text className="uj-metric-label">Events</Text><Strong className="uj-metric-value" style={{ color: BLUE }}>{fmtCount(met.total)}</Strong>{primaryMet && !isPrimary && renderDelta(met.total, primaryMet.total)}</div>
        <div className="uj-metric-box"><Text className="uj-metric-label">Errors</Text><Strong className="uj-metric-value" style={{ color: met.errors > 0 ? RED : GREEN }}>{met.errors}</Strong></div>
        <div className="uj-metric-box"><Text className="uj-metric-label">Error Rate</Text><Strong className="uj-metric-value" style={{ color: met.errRate > 5 ? RED : met.errRate > 1 ? YELLOW : GREEN }}>{fmtPct(met.errRate)}</Strong>{primaryMet && !isPrimary && renderDelta(met.errRate, primaryMet.errRate, true)}</div>
      </Flex>
      <Flex gap={12} alignItems="center" style={{ marginTop: 8 }}>
        <Text style={{ fontSize: 12, color: GREEN }}>Satisfied: {met.sat}</Text>
        <Text style={{ fontSize: 12, color: YELLOW }}>Tolerating: {met.tol}</Text>
        <Text style={{ fontSize: 12, color: RED }}>Frustrated: {met.fru}</Text>
        <div style={{ flex: 1, height: 6, borderRadius: 3, overflow: "hidden", display: "flex" }}>
          <div style={{ width: `${met.total > 0 ? (met.sat / met.total) * 100 : 0}%`, background: GREEN, height: "100%" }} />
          <div style={{ width: `${met.total > 0 ? (met.tol / met.total) * 100 : 0}%`, background: YELLOW, height: "100%" }} />
          <div style={{ width: `${met.total > 0 ? (met.fru / met.total) * 100 : 0}%`, background: RED, height: "100%" }} />
        </div>
      </Flex>
    </>
  );

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      {aiPanel}
      {steps.map((step, i) => {
        const met = extractMetrics(stepMap.get(step.label));
        const dropOff = i > 0 && funnelCounts.length > i ? (funnelCounts[i - 1] - funnelCounts[i]) : 0;
        const revenueAtRisk = aov > 0 && dropOff > 0 ? dropOff * aov : 0;
        const isMulti = step.identifiers.length > 1;
        const isComparing = compareSteps.has(i);

        // Find per-page metrics for each identifier
        const pageMetricsList = isMulti ? step.identifiers.map(id => {
          // Try exact match first, then try matching via identifierMatchesLabel
          let pm = pageMap.get(id);
          if (!pm) {
            for (const [key, val] of pageMap) {
              if (identifierMatchesLabel(id, key)) { pm = val; break; }
            }
          }
          return { id, metrics: extractMetrics(pm) };
        }) : [];

        return (
          <div key={i} className="uj-step-detail-card">
            <Flex alignItems="center" gap={12} style={{ marginBottom: 12 }}>
              <span className="uj-step-badge">{i + 1}</span>
              {(() => { const pid = stepPrimaryIdentifier(step); return appEntityId && pid ? (
                <a href={vitalsUrl(appEntityId, pid)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }} onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")} onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}>
                  <Heading level={5} style={{ margin: 0, color: BLUE }}>{step.label}</Heading>
                </a>
              ) : (
                <Heading level={5} style={{ margin: 0 }}>{step.label}</Heading>
              ); })()}
              <Text style={{ fontSize: 13, opacity: 0.5 }}>{step.identifiers.join(" | ")}</Text>
              {isMulti && (
                <button onClick={() => toggleCompare(i)} style={{ marginLeft: 8, padding: "3px 10px", fontSize: 11, fontWeight: 600, borderRadius: 4, border: `1px solid ${isComparing ? PURPLE : "rgba(128,128,128,0.3)"}`, background: isComparing ? `${PURPLE}20` : "transparent", color: isComparing ? PURPLE : "rgba(128,128,128,0.7)", cursor: "pointer" }}>{isComparing ? "Hide Compare" : "Compare Pages"}</button>
              )}
              {!isMulti && (
                <button onClick={() => toggleCwv(i)} style={{ marginLeft: 8, padding: "3px 10px", fontSize: 11, fontWeight: 600, borderRadius: 4, border: `1px solid ${cwvSteps.has(i) ? CYAN : "rgba(128,128,128,0.3)"}`, background: cwvSteps.has(i) ? `${CYAN}20` : "transparent", color: cwvSteps.has(i) ? CYAN : "rgba(128,128,128,0.7)", cursor: "pointer" }}>{cwvSteps.has(i) ? "Hide Vitals" : "Web Vitals"}</button>
              )}
              <div style={{ marginLeft: "auto" }}><ApdexGauge score={met.apdex} size={64} label="Apdex" /></div>
            </Flex>

            {/* Aggregate step metrics */}
            {renderMetricRow(step.label, met)}
            {revenueAtRisk > 0 && <Flex gap={16} style={{ marginTop: 4 }}><div className="uj-metric-box"><Text className="uj-metric-label">Revenue at Risk</Text><Strong className="uj-metric-value" style={{ color: RED }}>{fmtCurrency(revenueAtRisk)}</Strong><Text style={{ fontSize: 13, opacity: 0.4 }}>{fmtCount(dropOff)} drop-offs</Text></div></Flex>}

            {/* Page-level drop-off funnel (for multi-page steps) */}
            {isMulti && pageMetricsList.length > 1 && (() => {
              const sorted = [...pageMetricsList].sort((a, b) => b.metrics.total - a.metrics.total);
              const maxSessions = sorted[0]?.metrics.total || 1;
              return (
                <div style={{ marginTop: 14, padding: "12px 14px", background: "rgba(128,128,128,0.04)", borderRadius: 8, border: "1px solid rgba(128,128,128,0.1)" }}>
                  <Text style={{ fontSize: 12, fontWeight: 700, opacity: 0.6, marginBottom: 10, display: "block" }}>Page Drop-off Contributors</Text>
                  {sorted.map((pm, j) => {
                    const pct = maxSessions > 0 ? (pm.metrics.total / maxSessions) * 100 : 0;
                    const dropPct = j > 0 && sorted[0].metrics.total > 0 ? ((sorted[0].metrics.total - pm.metrics.total) / sorted[0].metrics.total) * 100 : 0;
                    const barColor = pm.metrics.apdex >= 0.75 ? GREEN : pm.metrics.apdex >= 0.5 ? YELLOW : RED;
                    return (
                      <div key={j} style={{ marginBottom: 6 }}>
                        <Flex alignItems="center" gap={8}>
                          <Text style={{ fontSize: 11, width: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>{pm.id}</Text>
                          <div style={{ flex: 1, height: 18, background: "rgba(128,128,128,0.08)", borderRadius: 3, overflow: "hidden", position: "relative" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 3, transition: "width 0.3s ease" }} />
                            <span style={{ position: "absolute", right: 6, top: 1, fontSize: 10, fontWeight: 600, opacity: 0.7 }}>{fmtCount(pm.metrics.total)}</span>
                          </div>
                          {j > 0 && <Text style={{ fontSize: 10, color: RED, fontWeight: 600, width: 50, textAlign: "right", flexShrink: 0 }}>−{fmtPct(dropPct)}</Text>}
                          {j === 0 && <Text style={{ fontSize: 10, color: GREEN, fontWeight: 600, width: 50, textAlign: "right", flexShrink: 0 }}>top</Text>}
                        </Flex>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* CWV panel for single-page steps */}
            {!isMulti && cwvSteps.has(i) && (() => {
              const pid = step.identifiers[0];
              let pageCwv = cwvMap.get(pid);
              if (!pageCwv) { for (const [k, v] of cwvMap) { if (identifierMatchesLabel(pid, k)) { pageCwv = v; break; } } }
              return pageCwv ? (
                <div style={{ marginTop: 12, padding: "12px 14px", background: `${CYAN}08`, borderRadius: 8, border: `1px solid ${CYAN}20` }}>
                  <Text style={{ fontSize: 12, fontWeight: 700, opacity: 0.6, marginBottom: 8, display: "block" }}>Core Web Vitals</Text>
                  <Flex gap={16}>
                    <div className="uj-metric-box">
                      <Text className="uj-metric-label">LCP</Text>
                      <Strong className="uj-metric-value" style={{ color: pageCwv.lcp <= CWV.lcp.good ? GREEN : pageCwv.lcp <= CWV.lcp.poor ? YELLOW : RED }}>{pageCwv.lcp < 1000 ? `${Math.round(pageCwv.lcp)}ms` : `${(pageCwv.lcp / 1000).toFixed(2)}s`}</Strong>
                      <Text style={{ fontSize: 10, opacity: 0.5 }}>{pageCwv.lcp <= CWV.lcp.good ? "Good" : pageCwv.lcp <= CWV.lcp.poor ? "Needs Improvement" : "Poor"}</Text>
                    </div>
                    <div className="uj-metric-box">
                      <Text className="uj-metric-label">CLS</Text>
                      <Strong className="uj-metric-value" style={{ color: pageCwv.cls <= CWV.cls.good ? GREEN : pageCwv.cls <= CWV.cls.poor ? YELLOW : RED }}>{pageCwv.cls.toFixed(3)}</Strong>
                      <Text style={{ fontSize: 10, opacity: 0.5 }}>{pageCwv.cls <= CWV.cls.good ? "Good" : pageCwv.cls <= CWV.cls.poor ? "Needs Improvement" : "Poor"}</Text>
                    </div>
                    <div className="uj-metric-box">
                      <Text className="uj-metric-label">INP</Text>
                      <Strong className="uj-metric-value" style={{ color: pageCwv.inp <= CWV.inp.good ? GREEN : pageCwv.inp <= CWV.inp.poor ? YELLOW : RED }}>{Math.round(pageCwv.inp)}ms</Strong>
                      <Text style={{ fontSize: 10, opacity: 0.5 }}>{pageCwv.inp <= CWV.inp.good ? "Good" : pageCwv.inp <= CWV.inp.poor ? "Needs Improvement" : "Poor"}</Text>
                    </div>
                  </Flex>
                </div>
              ) : <Text style={{ fontSize: 12, opacity: 0.5, marginTop: 8 }}>No CWV data available for this page.</Text>;
            })()}

            {/* Per-page comparison (when toggled) */}
            {isComparing && isMulti && (
              <div style={{ marginTop: 16, borderTop: "1px solid rgba(128,128,128,0.15)", paddingTop: 12 }}>
                <Text style={{ fontSize: 12, fontWeight: 700, opacity: 0.6, marginBottom: 8, display: "block" }}>Per-Page Breakdown — first page is primary (deltas compare against it)</Text>
                {pageMetricsList.map((pm, j) => {
                  const isPrimary = j === 0;
                  const primaryMetrics = pageMetricsList[0]?.metrics;
                  const linkable = appEntityId && !isWildcard(pm.id);
                  // Look up CWV for this page
                  let pageCwv = cwvMap.get(pm.id);
                  if (!pageCwv) { for (const [k, v] of cwvMap) { if (identifierMatchesLabel(pm.id, k)) { pageCwv = v; break; } } }
                  return (
                    <div key={j} style={{ marginTop: j > 0 ? 12 : 0, padding: "10px 12px", background: isPrimary ? "rgba(69,137,255,0.06)" : "rgba(128,128,128,0.04)", borderRadius: 8, border: `1px solid ${isPrimary ? "rgba(69,137,255,0.15)" : "rgba(128,128,128,0.1)"}` }}>
                      <Flex alignItems="center" gap={8} style={{ marginBottom: 8 }}>
                        {isPrimary && <span style={{ fontSize: 10, fontWeight: 700, color: BLUE, background: `${BLUE}18`, padding: "1px 6px", borderRadius: 3 }}>PRIMARY</span>}
                        {linkable ? (
                          <a href={vitalsUrl(appEntityId!, pm.id)} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, textDecoration: "none", fontSize: 13, fontWeight: 600 }} onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")} onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}>{pm.id} ↗</a>
                        ) : (
                          <Text style={{ fontSize: 13, fontWeight: 600 }}>{pm.id}</Text>
                        )}
                        <div style={{ marginLeft: "auto" }}><ApdexGauge score={pm.metrics.apdex} size={48} label="" /></div>
                      </Flex>
                      {renderMetricRow(pm.id, pm.metrics, isPrimary ? undefined : primaryMetrics, isPrimary)}
                      {pageCwv && (
                        <Flex gap={16} style={{ marginTop: 8 }}>
                          <div className="uj-metric-box">
                            <Text className="uj-metric-label">LCP</Text>
                            <Strong className="uj-metric-value" style={{ color: pageCwv.lcp <= CWV.lcp.good ? GREEN : pageCwv.lcp <= CWV.lcp.poor ? YELLOW : RED }}>{pageCwv.lcp < 1000 ? `${Math.round(pageCwv.lcp)}ms` : `${(pageCwv.lcp / 1000).toFixed(2)}s`}</Strong>
                          </div>
                          <div className="uj-metric-box">
                            <Text className="uj-metric-label">CLS</Text>
                            <Strong className="uj-metric-value" style={{ color: pageCwv.cls <= CWV.cls.good ? GREEN : pageCwv.cls <= CWV.cls.poor ? YELLOW : RED }}>{pageCwv.cls.toFixed(3)}</Strong>
                          </div>
                          <div className="uj-metric-box">
                            <Text className="uj-metric-label">INP</Text>
                            <Strong className="uj-metric-value" style={{ color: pageCwv.inp <= CWV.inp.good ? GREEN : pageCwv.inp <= CWV.inp.poor ? YELLOW : RED }}>{Math.round(pageCwv.inp)}ms</Strong>
                          </div>
                        </Flex>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeWorstSessions(data), [data]));

  // === ML-driven Impact Score & Clustering ===
  const { scored, clusters } = useMemo(() => {
    const rawSessions = (data?.data?.records ?? []) as any[];
    if (rawSessions.length === 0) return { scored: [], clusters: new Map<string, number>() };

    // Extract features for each session
    const features = rawSessions.map((s: any) => {
      const errors = Number(s.errors ?? 0);
      const frustrated = Number(s.frustrated ?? 0);
      const actions = Number(s.actions ?? 0);
      const avgDur = Number(s.avg_dur ?? 0);
      const maxDur = Number(s.max_dur ?? 0);
      const pages = (Array.isArray(s.pages) ? s.pages : []).filter((p: string) => p && p !== "unknown") as string[];
      const errorTypes = (Array.isArray(s.error_types) ? s.error_types : []).filter((e: string) => e && e !== "") as string[];
      return { errors, frustrated, actions, avgDur, maxDur, pages, errorTypes };
    });

    // Compute population statistics for z-score normalization
    const allErrors = features.map(f => f.errors);
    const allFrustrated = features.map(f => f.frustrated);
    const allAvgDur = features.map(f => f.avgDur);
    const allMaxDur = features.map(f => f.maxDur);

    const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const std = (arr: number[]) => { const m = mean(arr); const v = arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length; return Math.sqrt(v) || 1; };

    const errMean = mean(allErrors), errStd = std(allErrors);
    const fruMean = mean(allFrustrated), fruStd = std(allFrustrated);
    const avgDurMean = mean(allAvgDur), avgDurStd = std(allAvgDur);
    const maxDurMean = mean(allMaxDur), maxDurStd = std(allMaxDur);

    // Count how many sessions share each error type and page
    const errorFreq = new Map<string, number>();
    const pageFreq = new Map<string, number>();
    for (const f of features) {
      for (const e of f.errorTypes) errorFreq.set(e, (errorFreq.get(e) ?? 0) + 1);
      for (const p of f.pages) pageFreq.set(p, (pageFreq.get(p) ?? 0) + 1);
    }

    // Build fingerprint for clustering (error types + high-duration bucket + frustrated bucket)
    const fingerprints: string[] = features.map(f => {
      const errFp = f.errorTypes.sort().join("|") || "no-errors";
      const durBucket = f.avgDur > 5000 ? "very-slow" : f.avgDur > 2000 ? "slow" : "normal";
      const fruBucket = f.frustrated > 5 ? "high-fru" : f.frustrated > 0 ? "some-fru" : "no-fru";
      return `${errFp}::${durBucket}::${fruBucket}`;
    });

    // Count cluster sizes
    const clusterCounts = new Map<string, number>();
    for (const fp of fingerprints) clusterCounts.set(fp, (clusterCounts.get(fp) ?? 0) + 1);

    // Compute impact score per session
    // Higher score = more likely systemic (shared errors/pages across sessions)
    // Lower score = more likely outlier (unique pattern)
    const scored = rawSessions.map((s: any, i: number) => {
      const f = features[i];

      // Severity component: z-score normalized (how bad is this session?)
      const errZ = (f.errors - errMean) / errStd;
      const fruZ = (f.frustrated - fruMean) / fruStd;
      const avgDurZ = (f.avgDur - avgDurMean) / avgDurStd;
      const maxDurZ = (f.maxDur - maxDurMean) / maxDurStd;
      const severityScore = Math.max(0, (errZ * 0.35 + fruZ * 0.30 + avgDurZ * 0.20 + maxDurZ * 0.15));

      // Systemic component: how many other sessions share same errors/pages?
      let sharedErrScore = 0;
      for (const e of f.errorTypes) {
        const freq = errorFreq.get(e) ?? 0;
        sharedErrScore += freq / rawSessions.length; // 0..1 per error type
      }
      sharedErrScore = f.errorTypes.length > 0 ? sharedErrScore / f.errorTypes.length : 0;

      let sharedPageScore = 0;
      for (const p of f.pages) {
        const freq = pageFreq.get(p) ?? 0;
        sharedPageScore += freq / rawSessions.length;
      }
      sharedPageScore = f.pages.length > 0 ? sharedPageScore / f.pages.length : 0;

      const systemicScore = sharedErrScore * 0.7 + sharedPageScore * 0.3;

      // Combined impact: severity weighted by how systemic it is
      // systemic issues get boosted, outliers get dampened
      const rawImpact = severityScore * (0.4 + systemicScore * 0.6);
      const impactScore = Math.min(100, Math.round(rawImpact * 25));

      const clusterSize = clusterCounts.get(fingerprints[i]) ?? 1;
      const isSystemic = systemicScore > 0.4;

      return { ...s, _impactScore: impactScore, _clusterSize: clusterSize, _isSystemic: isSystemic, _systemicScore: systemicScore, _fingerprint: fingerprints[i] };
    });

    // Sort by impact score descending
    scored.sort((a: any, b: any) => b._impactScore - a._impactScore);

    return { scored: scored.slice(0, 25), clusters: clusterCounts };
  }, [data?.data]);

  if (isLoading) return <Loading />;

  const sessions = scored;

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      {aiPanel}
      <SectionHeader title="Worst-Performing Sessions" />
      <Text style={{ fontSize: 12, opacity: 0.5 }}>Sessions ranked by AI Impact Score — a weighted composite of severity (errors, frustrated actions, latency) and systemic likelihood (shared error patterns across sessions). Higher scores indicate systemic issues affecting multiple users.</Text>

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
                Impact: s._impactScore,
                Cluster: s._clusterSize,
                IsSystemic: s._isSystemic,
                Actions: actions,
                "Avg (ms)": Number(s.avg_dur ?? 0),
                "Max (ms)": Number(s.max_dur ?? 0),
                Errors: Number(s.errors ?? 0),
                Frustrated: frustrated,
                Apdex: apdex,
              };
            })}
            columns={[
              { id: "Impact", header: "Impact", accessor: "Impact", sortType: "number" as any, cell: ({ value, rowData }: any) => {
                const clr = value >= 70 ? RED : value >= 40 ? ORANGE : value >= 20 ? YELLOW : GREEN;
                return (
                  <Flex alignItems="center" gap={6}>
                    <div style={{ width: 36, height: 20, borderRadius: 4, background: `${clr}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Strong style={{ fontSize: 11, color: clr }}>{value}</Strong>
                    </div>
                    {rowData.IsSystemic && <span style={{ fontSize: 9, fontWeight: 700, color: RED, background: `${RED}15`, padding: "1px 4px", borderRadius: 3 }}>SYSTEMIC</span>}
                  </Flex>
                );
              }},
              { id: "Cluster", header: "Like This", accessor: "Cluster", sortType: "number" as any, cell: ({ value }: any) => {
                const clr = value >= 5 ? RED : value >= 3 ? ORANGE : "rgba(128,128,128,0.6)";
                return <Text style={{ fontSize: 12, fontWeight: 600, color: clr }}>{value === 1 ? "unique" : `${value} sessions`}</Text>;
              }},
              { id: "Session", header: "Session", accessor: "Session", cell: ({ value, rowData }: any) => {
                const url = sessionReplayUrl(rowData.SessionFull, rowData.StartTs);
                return ENV_URL ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" className="uj-session-link">{value} ↗</a>
                ) : <Text>{value}</Text>;
              }},
              { id: "Actions", header: "Actions", accessor: "Actions", sortType: "number" as any, cell: ({ value }: any) => <Text>{value}</Text> },
              { id: "Avg (ms)", header: "Avg Duration", accessor: "Avg (ms)", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 3000 ? RED : value > 1000 ? YELLOW : GREEN }}>{fmt(value)}</Text> },
              { id: "Max (ms)", header: "Max Duration", accessor: "Max (ms)", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 10000 ? RED : value > 5000 ? ORANGE : GREEN }}>{fmt(value)}</Strong> },
              { id: "Errors", header: "Errors", accessor: "Errors", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 0 ? RED : GREEN }}>{value}</Strong> },
              { id: "Frustrated", header: "Frustrated", accessor: "Frustrated", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 0 ? RED : GREEN }}>{value}</Strong> },
              { id: "Apdex", header: "Apdex", accessor: "Apdex", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: apdexClr(value) }}>{value.toFixed(2)}</Strong> },
            ]}
          />
        </div>
      )}

      {/* Cluster analysis summary */}
      {sessions.length > 0 && (
        <>
          <SectionHeader title="Pattern Clusters" />
          <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Sessions grouped by behavioral fingerprint (error types + performance bucket + frustration level). Larger clusters indicate systemic issues affecting many users in the same way.</Text>
          <Flex gap={12} flexWrap="wrap">
            {(() => {
              const clusterEntries = [...clusters.entries()].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]).slice(0, 6);
              const systemicCount = sessions.filter((s: any) => s._isSystemic).length;
              const outlierCount = sessions.length - systemicCount;
              return (
                <>
                  <div className="uj-kpi-card">
                    <Text className="uj-kpi-label">Systemic</Text>
                    <Heading level={3} className="uj-kpi-value" style={{ color: RED }}>{systemicCount}</Heading>
                    <Text style={{ fontSize: 10, opacity: 0.5 }}>shared patterns</Text>
                  </div>
                  <div className="uj-kpi-card">
                    <Text className="uj-kpi-label">Outliers</Text>
                    <Heading level={3} className="uj-kpi-value" style={{ color: GREEN }}>{outlierCount}</Heading>
                    <Text style={{ fontSize: 10, opacity: 0.5 }}>unique edge cases</Text>
                  </div>
                  <div className="uj-kpi-card">
                    <Text className="uj-kpi-label">Distinct Patterns</Text>
                    <Heading level={3} className="uj-kpi-value" style={{ color: BLUE }}>{clusters.size}</Heading>
                    <Text style={{ fontSize: 10, opacity: 0.5 }}>behavioral clusters</Text>
                  </div>
                  {clusterEntries.length > 0 && (
                    <div style={{ width: "100%", marginTop: 8 }}>
                      {clusterEntries.map(([fp, count], j) => {
                        const parts = fp.split("::");
                        const label = parts[0] === "no-errors" ? `${parts[1]}, ${parts[2]}` : `${parts[0].split("|").slice(0, 2).join(", ")}${parts[0].split("|").length > 2 ? " +more" : ""} · ${parts[1]}`;
                        return (
                          <Flex key={j} alignItems="center" gap={8} style={{ marginBottom: 4 }}>
                            <div style={{ width: 28, height: 16, borderRadius: 3, background: `${RED}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <Text style={{ fontSize: 10, fontWeight: 700, color: RED }}>{count}</Text>
                            </div>
                            <Text style={{ fontSize: 11, opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</Text>
                          </Flex>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}
          </Flex>
        </>
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
              const avgImpact = Math.round(sessions.reduce((a: number, s: any) => a + (s._impactScore ?? 0), 0) / sessions.length);
              return [
                { label: "Avg Impact Score", value: String(avgImpact), color: avgImpact >= 50 ? RED : avgImpact >= 25 ? ORANGE : GREEN },
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

/** Parse source location from error name (e.g. "domain.com/file.js:718:494") */
function parseSourceLocation(name: string): { file: string; line: number; col: number } | null {
  const m = name.match(/([^\s/]+\.(?:js|ts|mjs|cjs))(?::(\d+))(?::(\d+))?/);
  if (!m) return null;
  return { file: m[1], line: Number(m[2]), col: m[3] ? Number(m[3]) : 0 };
}

/** Classify error regression status: NEW, RECURRING, REGRESSION */
function classifyErrorStatus(errId: string, firstSeen: string | null, prevErrors: any[]): "new" | "recurring" | "regression" {
  const inPrev = prevErrors.some((pe: any) => String(pe["error.id"] ?? "") === errId);
  if (inPrev) return "recurring";
  // Not in previous period — check if first_seen is older than current period (would mean it existed before, disappeared, came back)
  if (firstSeen) {
    const firstMs = new Date(firstSeen).getTime();
    const nowMs = Date.now();
    const periodMs = 7 * 86400000; // approximate — if first_seen is older than the window, it's a regression
    if (nowMs - firstMs > periodMs * 2) return "regression";
  }
  return "new";
}

const STATUS_CONFIG = {
  new: { label: "NEW", color: "#08BDBA", icon: "●" },
  recurring: { label: "RECURRING", color: "#B8860B", icon: "↻" },
  regression: { label: "REGRESSION", color: "#C21930", icon: "⚠" },
} as const;

function JSErrorsTab({ data, prevData, isLoading, frontend }: { data: any; prevData: any; isLoading: boolean; frontend: string }) {
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeExceptions(data), [data]));
  const prevErrors = useMemo(() => (prevData?.data?.records ?? []) as any[], [prevData?.data]);

  if (isLoading) return <Loading />;

  const errors = (data.data?.records ?? []) as any[];
  const totalOccurrences = errors.reduce((a: number, e: any) => a + Number(e.occurrences ?? 0), 0);
  const totalAffected = errors.reduce((a: number, e: any) => a + Number(e.affected_sessions ?? 0), 0);

  // Count by status
  const statusCounts = errors.reduce((acc, e) => {
    const s = classifyErrorStatus(String(e["error.id"] ?? ""), e.first_seen, prevErrors);
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      {aiPanel}
      <SectionHeader title="Exception Drilldown" />
      <Text style={{ fontSize: 12, opacity: 0.5 }}>Exceptions grouped by error name. Source locations decoded in-app. Regression status compared to previous period.</Text>

      {/* Summary KPIs */}
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
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">New</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: CYAN }}>{statusCounts.new || 0}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Recurring</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: YELLOW }}>{statusCounts.recurring || 0}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Regressions</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: RED }}>{statusCounts.regression || 0}</Heading>
        </div>
      </Flex>

      {errors.length === 0 ? (
        <div className="uj-table-tile" style={{ padding: 24 }}><Text style={{ color: GREEN }}>No exceptions detected in this timeframe</Text></div>
      ) : (
        <>
          {/* Error cards — Metric Forecast style */}
          <Flex flexDirection="column" gap={12}>
            {errors.slice(0, 10).map((e: any, i: number) => {
              const name = String(e.errorName ?? "Unknown Error");
              const errId = String(e["error.id"] ?? "");
              const occurrences = Number(e.occurrences ?? 0);
              const affected = Number(e.affected_sessions ?? 0);
              const pages = (e.pages ?? []) as string[];
              const firstSeen = e.first_seen ? new Date(e.first_seen).toLocaleString() : "—";
              const lastSeen = e.last_seen ? new Date(e.last_seen).toLocaleString() : "—";
              const severity = occurrences > 100 ? RED : occurrences > 20 ? ORANGE : occurrences > 5 ? YELLOW : "rgba(128,128,128,0.5)";
              const pctOfTotal = totalOccurrences > 0 ? (occurrences / totalOccurrences) * 100 : 0;
              const status = classifyErrorStatus(errId, e.first_seen, prevErrors);
              const statusCfg = STATUS_CONFIG[status];
              const source = parseSourceLocation(name);

              return (
                <div key={i} className="uj-anomaly-card" style={{ borderLeftColor: severity, minWidth: 0, flex: "none" }}>
                  {/* Header row: name + status badge */}
                  <Flex alignItems="center" justifyContent="space-between" gap={8} style={{ marginBottom: 8 }}>
                    <Flex alignItems="center" gap={8} style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: severity, opacity: 0.7 }}>#{i + 1}</span>
                      {errId ? (
                        <a href={errorInspectorUrl(errId, frontend)} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, textDecoration: "none", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {name.length > 100 ? name.substring(0, 100) + "…" : name} ↗
                        </a>
                      ) : (
                        <Strong style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name.length > 100 ? name.substring(0, 100) + "…" : name}</Strong>
                      )}
                    </Flex>
                    <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 4, background: `${statusCfg.color}18`, color: statusCfg.color, fontWeight: 700, whiteSpace: "nowrap" }}>{statusCfg.icon} {statusCfg.label}</span>
                  </Flex>

                  {/* Source location (deobfuscated) */}
                  {source && (
                    <div style={{ marginBottom: 8, padding: "4px 10px", background: "rgba(128,128,128,0.08)", borderRadius: 4, fontFamily: "monospace", fontSize: 11 }}>
                      <span style={{ opacity: 0.5 }}>Source:</span>{" "}
                      <span style={{ color: BLUE }}>{source.file}</span>
                      <span style={{ opacity: 0.4 }}> : </span>
                      <span style={{ color: CYAN }}>line {source.line}</span>
                      {source.col > 0 && <><span style={{ opacity: 0.4 }}> : </span><span style={{ color: PURPLE }}>col {source.col}</span></>}
                    </div>
                  )}

                  {/* Metrics grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 12, marginBottom: 8 }}>
                    <div><Text style={{ fontSize: 11, opacity: 0.5, whiteSpace: "nowrap" }}>Occurrences</Text><Strong style={{ display: "block", fontSize: 18, color: severity }}>{fmtCount(occurrences)}</Strong></div>
                    <div><Text style={{ fontSize: 11, opacity: 0.5, whiteSpace: "nowrap" }}>Sessions</Text><Strong style={{ display: "block", fontSize: 18, color: ORANGE }}>{fmtCount(affected)}</Strong></div>
                    <div><Text style={{ fontSize: 11, opacity: 0.5, whiteSpace: "nowrap" }}>% of Total</Text><Strong style={{ display: "block", fontSize: 18 }}>{fmtPct(pctOfTotal)}</Strong></div>
                    <div><Text style={{ fontSize: 11, opacity: 0.5, whiteSpace: "nowrap" }}>First Seen</Text><Text style={{ display: "block", fontSize: 12 }}>{firstSeen}</Text></div>
                    <div><Text style={{ fontSize: 11, opacity: 0.5, whiteSpace: "nowrap" }}>Last Seen</Text><Text style={{ display: "block", fontSize: 12 }}>{lastSeen}</Text></div>
                  </div>

                  {/* Pages pills */}
                  {pages.length > 0 && (
                    <Flex gap={6} flexWrap="wrap">
                      {pages.slice(0, 5).map((p: string, pi: number) => (
                        <span key={pi} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "rgba(69,137,255,0.1)", color: BLUE }}>{p ?? "unknown"}</span>
                      ))}
                      {pages.length > 5 && <span style={{ fontSize: 11, opacity: 0.4 }}>+{pages.length - 5} more</span>}
                    </Flex>
                  )}

                  {/* Impact bar */}
                  <div style={{ marginTop: 8, height: 3, borderRadius: 2, background: "rgba(128,128,128,0.1)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pctOfTotal}%`, background: severity, borderRadius: 2 }} />
                  </div>
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
                  data={errors.map((e: any) => {
                    const status = classifyErrorStatus(String(e["error.id"] ?? ""), e.first_seen, prevErrors);
                    return {
                      Error: String(e.errorName ?? "Unknown").substring(0, 80),
                      errorId: String(e["error.id"] ?? ""),
                      Status: STATUS_CONFIG[status].label,
                      Occurrences: Number(e.occurrences ?? 0),
                      "Affected Sessions": Number(e.affected_sessions ?? 0),
                      Pages: ((e.pages ?? []) as string[]).join(", "),
                    };
                  })}
                  columns={[
                    { id: "Error", header: "Error", accessor: "Error", cell: ({ value, row }: any) => {
                      const eid = row?.original?.errorId;
                      return eid ? <a href={errorInspectorUrl(eid, frontend)} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, textDecoration: "none" }}>{value} ↗</a> : <Text>{value}</Text>;
                    }},
                    { id: "Status", header: "Status", accessor: "Status", cell: ({ value }: any) => {
                      const cfg = value === "REGRESSION" ? STATUS_CONFIG.regression : value === "RECURRING" ? STATUS_CONFIG.recurring : STATUS_CONFIG.new;
                      return <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: `${cfg.color}18`, color: cfg.color, fontWeight: 700 }}>{cfg.icon} {value}</span>;
                    }},
                    { id: "Occurrences", header: "Count", accessor: "Occurrences", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 50 ? RED : ORANGE }}>{fmtCount(value)}</Strong> },
                    { id: "Affected Sessions", header: "Sessions", accessor: "Affected Sessions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
                    { id: "Pages", header: "Pages", accessor: "Pages", cell: ({ value }: any) => <Text style={{ fontSize: 12, opacity: 0.6 }}>{value}</Text> },
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
function ClickIssuesTab({ data, isLoading, replayData }: { data: any; isLoading: boolean; replayData?: any }) {
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeClickIssues(data), [data]));
  if (isLoading) return <Loading />;

  const rows = (data.data?.records ?? []) as any[];
  const rageClicks = rows.filter((r: any) => r.eventType === "rageClick");
  const deadClicks = rows.filter((r: any) => r.eventType === "deadClick");
  const totalRage = rageClicks.reduce((a: number, r: any) => a + Number(r.occurrences ?? 0), 0);
  const totalDead = deadClicks.reduce((a: number, r: any) => a + Number(r.occurrences ?? 0), 0);
  const totalAffected = rows.reduce((a: number, r: any) => a + Number(r.affected_sessions ?? 0), 0);

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      {aiPanel}
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
                        <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, background: `${color}18`, color, fontWeight: 700, textTransform: "uppercase" }}>{isRage ? "Rage" : "Dead"}</span>
                        <Strong style={{ fontSize: 13, wordBreak: "break-word" }}>{target.length > 100 ? target.substring(0, 100) + "..." : target}</Strong>
                      </Flex>
                      <Flex gap={16} flexWrap="wrap">
                        <div><Text style={{ fontSize: 24, opacity: 0.5 }}>Occurrences</Text><Strong style={{ display: "block", fontSize: 32, color }}>{fmtCount(occ)}</Strong></div>
                        <div><Text style={{ fontSize: 24, opacity: 0.5 }}>Affected Sessions</Text><Strong style={{ display: "block", fontSize: 32, color: ORANGE }}>{fmtCount(affected)}</Strong></div>
                        <div><Text style={{ fontSize: 24, opacity: 0.5 }}>% of Total</Text><Strong style={{ display: "block", fontSize: 32 }}>{fmtPct(pctOfTotal)}</Strong></div>
                        <div><Text style={{ fontSize: 24, opacity: 0.5 }}>Page</Text><Text style={{ display: "block", fontSize: 26, color: BLUE }}>{page}</Text></div>
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
                { id: "Page", header: "Page", accessor: "Page", cell: ({ value }: any) => <Text style={{ fontSize: 13, color: BLUE }}>{value}</Text> },
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

function PerfBudgetsTab({ quality, qualityPrev, overallApdex, overallApdexPrev, overallConv, overallConvPrev, hourlyData, isLoading, saveState, savedThresholds }: { quality: any; qualityPrev: any; overallApdex: number; overallApdexPrev: number; overallConv: number; overallConvPrev: number; hourlyData: any; isLoading: boolean; saveState: any; savedThresholds: any }) {
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzePerfBudgets(quality, overallApdex, overallConv), [quality, overallApdex, overallConv]));

  // User-configurable thresholds (persisted)
  const [thresholds, setThresholds] = useState<Record<string, number>>(() => {
    try {
      const raw = savedThresholds?.data?.value;
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const [editingMetric, setEditingMetric] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Sync when saved state loads
  useEffect(() => {
    try {
      const raw = savedThresholds?.data?.value;
      if (raw) setThresholds(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [savedThresholds?.data?.value]);

  const getTarget = (metric: string, defaultTarget: number) => thresholds[metric] ?? defaultTarget;
  const saveThreshold = (metric: string, value: number) => {
    const next = { ...thresholds, [metric]: value };
    setThresholds(next);
    saveState({ key: BUDGET_THRESHOLDS_STATE_KEY, body: { value: JSON.stringify(next) } });
  };
  const resetThreshold = (metric: string) => {
    const next = { ...thresholds };
    delete next[metric];
    setThresholds(next);
    saveState({ key: BUDGET_THRESHOLDS_STATE_KEY, body: { value: JSON.stringify(next) } });
  };

  if (isLoading) return <Loading />;

  const errorRate = quality.total > 0 ? (quality.errors / quality.total) * 100 : 0;
  const frustratedPct = quality.total > 0 ? (quality.frustrated / quality.total) * 100 : 0;
  const errorRatePrev = qualityPrev.total > 0 ? (qualityPrev.errors / qualityPrev.total) * 100 : 0;
  const frustratedPctPrev = qualityPrev.total > 0 ? (qualityPrev.frustrated / qualityPrev.total) * 100 : 0;

  const actuals: Record<string, number> = {
    "Apdex": overallApdex,
    "Conversion Rate": overallConv,
    "Avg Duration": quality.avg,
    "P90 Duration": quality.p90,
    "Error Rate": errorRate,
    "Frustrated %": frustratedPct,
  };
  const prevActuals: Record<string, number> = {
    "Apdex": overallApdexPrev,
    "Conversion Rate": overallConvPrev,
    "Avg Duration": qualityPrev.avg,
    "P90 Duration": qualityPrev.p90,
    "Error Rate": errorRatePrev,
    "Frustrated %": frustratedPctPrev,
  };

  const budgetStatus = PERF_BUDGETS.map((b) => {
    const target = getTarget(b.metric, b.target);
    const actual = actuals[b.metric] ?? 0;
    const prev = prevActuals[b.metric] ?? 0;
    const passing = b.inverted ? actual <= target : actual >= target;
    const margin = target > 0 ? ((actual - target) / target) * 100 : 0;

    // Daily rate of change (current - prev gives delta over 1 period)
    const dailyDelta = actual - prev; // change per period
    // Time-to-breach: how many periods until breach at current rate
    let daysToBreach: number | null = null;
    if (passing && dailyDelta !== 0) {
      if (b.inverted) {
        // metric should stay below target; breach if actual goes above
        const headroom = target - actual;
        if (dailyDelta > 0 && headroom > 0) daysToBreach = Math.ceil(headroom / dailyDelta);
      } else {
        // metric should stay above target; breach if actual drops below
        const headroom = actual - target;
        if (dailyDelta < 0 && headroom > 0) daysToBreach = Math.ceil(headroom / Math.abs(dailyDelta));
      }
    }
    if (daysToBreach != null && daysToBreach <= 0) daysToBreach = null;

    // Near-breach alert: within 10% of target
    let nearBreach = false;
    if (passing) {
      if (b.inverted) {
        nearBreach = actual >= target * 0.9; // within 10% of max
      } else {
        nearBreach = actual <= target * 1.1; // within 10% of min
      }
    }

    return { ...b, target, actual, prev, passing, margin, daysToBreach, nearBreach, dailyDelta };
  });

  const passingCount = budgetStatus.filter((b) => b.passing).length;
  const overallHealth = Math.round((passingCount / budgetStatus.length) * 100);
  const nearBreachCount = budgetStatus.filter((b) => b.nearBreach).length;
  const alertMetrics = budgetStatus.filter((b) => b.nearBreach || (b.daysToBreach != null && b.daysToBreach <= 7));

  // Parse hourly data
  const hours = (hourlyData.data?.records ?? []) as any[];

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      {aiPanel}
      <SectionHeader title="Performance Budget Tracking" />
      <Text style={{ fontSize: 12, opacity: 0.5 }}>Track actual metrics against configurable budgets. Click the edit icon to customize thresholds. Alerts trigger when within 10% of breach.</Text>

      {/* Alert banner */}
      {alertMetrics.length > 0 && (
        <div style={{ padding: "12px 16px", background: `${YELLOW}12`, border: `1px solid ${YELLOW}44`, borderRadius: 8 }}>
          <Flex alignItems="center" gap={8} style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 16 }}>⚠</span>
            <Strong style={{ fontSize: 13, color: YELLOW }}>Budget Alert — {alertMetrics.length} metric{alertMetrics.length > 1 ? "s" : ""} near breach threshold</Strong>
          </Flex>
          <Flex flexDirection="column" gap={4}>
            {alertMetrics.map(a => (
              <Text key={a.metric} style={{ fontSize: 12, paddingLeft: 24 }}>
                <Strong style={{ color: a.passing ? YELLOW : RED }}>{a.metric}</Strong>: {a.format(a.actual)} {a.inverted ? "→ max" : "→ min"} {a.format(a.target)}
                {a.daysToBreach != null && <span style={{ color: ORANGE }}> — projected breach in ~{a.daysToBreach} period{a.daysToBreach !== 1 ? "s" : ""}</span>}
                {a.nearBreach && !a.daysToBreach && <span style={{ color: YELLOW }}> — within 10% of threshold</span>}
              </Text>
            ))}
          </Flex>
          <Text style={{ fontSize: 11, opacity: 0.5, marginTop: 6, paddingLeft: 24 }}>Recommendation: Create a Dynatrace Workflow with a DQL trigger to automate notifications when these metrics cross their threshold.</Text>
        </div>
      )}

      {/* Overall compliance */}
      <Flex gap={16} flexWrap="wrap">
        <div className="uj-kpi-card" style={{ minWidth: 180 }}>
          <Text className="uj-kpi-label">Budget Compliance</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: overallHealth >= 80 ? GREEN : overallHealth >= 50 ? YELLOW : RED }}>{overallHealth}%</Heading>
          <Text style={{ fontSize: 12, opacity: 0.5 }}>{passingCount} of {budgetStatus.length} passing</Text>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Passing</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: GREEN }}>{passingCount}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Failing</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: budgetStatus.length - passingCount > 0 ? RED : GREEN }}>{budgetStatus.length - passingCount}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Near Breach</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: nearBreachCount > 0 ? YELLOW : GREEN }}>{nearBreachCount}</Heading>
        </div>
      </Flex>

      {/* Budget cards */}
      <SectionHeader title="Budget Status" />
      <Flex gap={16} flexWrap="wrap">
        {budgetStatus.map((b) => {
          const pctOfTarget = b.inverted
            ? (b.target > 0 ? Math.min((b.actual / b.target) * 100, 150) : 0)
            : (b.target > 0 ? Math.min((b.actual / b.target) * 100, 150) : 0);
          const barColor = b.passing ? (b.nearBreach ? YELLOW : GREEN) : RED;
          const isEditing = editingMetric === b.metric;

          return (
            <div key={b.metric} className="uj-budget-card" style={{ borderColor: b.nearBreach ? `${YELLOW}44` : undefined }}>
              <Flex alignItems="center" justifyContent="space-between" style={{ marginBottom: 8 }}>
                <Strong style={{ fontSize: 13 }}>{b.metric}</Strong>
                <Flex gap={6} alignItems="center">
                  {b.nearBreach && <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: `${YELLOW}18`, color: YELLOW, fontWeight: 700 }}>NEAR</span>}
                  <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, background: b.passing ? `${GREEN}18` : `${RED}18`, color: b.passing ? GREEN : RED, fontWeight: 700 }}>
                    {b.passing ? "PASS" : "FAIL"}
                  </span>
                </Flex>
              </Flex>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 8 }}>
                <div>
                  <Text style={{ fontSize: 11, opacity: 0.5 }}>Actual</Text>
                  <Strong style={{ display: "block", color: b.passing ? GREEN : RED, fontSize: 18 }}>{b.format(b.actual)}</Strong>
                </div>
                <div>
                  <Text style={{ fontSize: 11, opacity: 0.5 }}>Target</Text>
                  <Flex alignItems="center" gap={4}>
                    {isEditing ? (
                      <input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const v = parseFloat(editValue);
                            if (!isNaN(v) && v > 0) saveThreshold(b.metric, v);
                            setEditingMetric(null);
                          }
                          if (e.key === "Escape") setEditingMetric(null);
                        }}
                        onBlur={() => {
                          const v = parseFloat(editValue);
                          if (!isNaN(v) && v > 0) saveThreshold(b.metric, v);
                          setEditingMetric(null);
                        }}
                        autoFocus
                        style={{ width: 60, fontSize: 14, padding: "2px 4px", borderRadius: 4, border: `1px solid ${BLUE}`, background: "transparent", color: "inherit", outline: "none" }}
                      />
                    ) : (
                      <Strong style={{ display: "block", fontSize: 16 }}>{b.inverted ? "≤ " : "≥ "}{b.format(b.target)}</Strong>
                    )}
                    {!isEditing && (
                      <span
                        onClick={() => { setEditingMetric(b.metric); setEditValue(String(b.target)); }}
                        style={{ cursor: "pointer", fontSize: 12, opacity: 0.4, padding: "2px 4px" }}
                        title="Edit threshold"
                      >✎</span>
                    )}
                  </Flex>
                  {thresholds[b.metric] != null && (
                    <span onClick={() => resetThreshold(b.metric)} style={{ fontSize: 10, cursor: "pointer", color: BLUE, opacity: 0.6 }}>reset</span>
                  )}
                </div>
                <div>
                  <Text style={{ fontSize: 11, opacity: 0.5 }}>Margin</Text>
                  <Text style={{ display: "block", fontSize: 14, color: b.passing ? GREEN : RED }}>
                    {b.inverted ? (b.margin <= 0 ? `${Math.abs(b.margin).toFixed(1)}% under` : `${b.margin.toFixed(1)}% over`) : (b.margin >= 0 ? `${b.margin.toFixed(1)}% above` : `${Math.abs(b.margin).toFixed(1)}% below`)}
                  </Text>
                </div>
              </div>
              {/* Time-to-breach + trend */}
              <Flex gap={12} style={{ marginBottom: 8 }}>
                <div>
                  <Text style={{ fontSize: 11, opacity: 0.5 }}>Time to Breach</Text>
                  <Strong style={{ display: "block", fontSize: 14, color: b.daysToBreach != null ? (b.daysToBreach <= 3 ? RED : b.daysToBreach <= 7 ? ORANGE : YELLOW) : GREEN }}>
                    {!b.passing ? "NOW" : b.daysToBreach != null ? `~${b.daysToBreach} period${b.daysToBreach !== 1 ? "s" : ""}` : "Safe"}
                  </Strong>
                </div>
                <div>
                  <Text style={{ fontSize: 11, opacity: 0.5 }}>Period Δ</Text>
                  <Strong style={{ display: "block", fontSize: 14, color: b.dailyDelta === 0 ? "rgba(128,128,128,0.5)" : (b.inverted ? (b.dailyDelta > 0 ? RED : GREEN) : (b.dailyDelta < 0 ? RED : GREEN)) }}>
                    {b.dailyDelta === 0 ? "● Stable" : `${b.dailyDelta > 0 ? "▲" : "▼"} ${b.format(Math.abs(b.dailyDelta))}`}
                  </Strong>
                </div>
              </Flex>
              {/* Progress bar toward target */}
              <div style={{ position: "relative", height: 6, borderRadius: 3, background: "rgba(128,128,128,0.1)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(pctOfTarget, 100)}%`, background: barColor, borderRadius: 3, transition: "width 0.4s ease" }} />
                <div style={{ position: "absolute", top: 0, left: "100%", width: 2, height: "100%", background: "rgba(128,128,128,0.4)" }} />
              </div>
            </div>
          );
        })}
      </Flex>

      {/* Workflow trigger recommendation */}
      {alertMetrics.length > 0 && (
        <>
          <SectionHeader title="Workflow Trigger Suggestion" />
          <div className="uj-table-tile" style={{ padding: 16 }}>
            <Text style={{ fontSize: 12, opacity: 0.7, marginBottom: 8, display: "block" }}>
              The following DQL condition can be used as a Dynatrace Workflow trigger to alert when budgets are within 10% of breach:
            </Text>
            <pre style={{ fontSize: 11, padding: "10px 14px", borderRadius: 6, background: "rgba(128,128,128,0.08)", border: "1px solid rgba(128,128,128,0.15)", overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
{alertMetrics.map(a => {
  const op = a.inverted ? ">=" : "<=";
  const thresholdVal = a.inverted ? (a.target * 0.9).toFixed(2) : (a.target * 1.1).toFixed(2);
  return `// ${a.metric}: alert when ${a.inverted ? "above" : "below"} ${thresholdVal}\n// Current: ${a.format(a.actual)} | Target: ${a.format(a.target)}`;
}).join("\n\n")}

{`// Example Workflow DQL trigger condition:
// fetch user.events, from:now()-1h
// | filter frontend.name == "<your_app>"
// | ... compute metric ...
// | filter metric_value ${alertMetrics[0]?.inverted ? ">=" : "<="} ${alertMetrics[0]?.inverted ? (alertMetrics[0].target * 0.9).toFixed(2) : (alertMetrics[0].target * 1.1).toFixed(2)}`}
            </pre>
          </div>
        </>
      )}

      {/* Full budget table */}
      <SectionHeader title="Budget Summary Table" />
      <div className="uj-table-tile">
        <DataTable
          sortable
          data={budgetStatus.map((b) => ({
            Metric: b.metric,
            Actual: b.actual,
            Target: b.target,
            Status: b.passing ? (b.nearBreach ? "NEAR" : "PASS") : "FAIL",
            "Time to Breach": b.daysToBreach != null ? `~${b.daysToBreach}p` : (!b.passing ? "NOW" : "Safe"),
            "Margin %": b.margin,
          }))}
          columns={[
            { id: "Metric", header: "Metric", accessor: "Metric", cell: ({ value }: any) => <Strong>{value}</Strong> },
            { id: "Status", header: "Status", accessor: "Status", cell: ({ value }: any) => <Strong style={{ color: value === "PASS" ? GREEN : value === "NEAR" ? YELLOW : RED }}>{value}</Strong> },
            { id: "Actual", header: "Actual", accessor: "Actual", sortType: "number" as any, cell: ({ value, rowData }: any) => {
              const b = budgetStatus.find((x) => x.metric === rowData.Metric);
              return <Text>{b ? b.format(value) : value}</Text>;
            }},
            { id: "Target", header: "Target", accessor: "Target", sortType: "number" as any, cell: ({ value, rowData }: any) => {
              const b = budgetStatus.find((x) => x.metric === rowData.Metric);
              return <Text style={{ opacity: 0.6 }}>{b ? (b.inverted ? "≤ " : "≥ ") + b.format(value) : value}</Text>;
            }},
            { id: "Time to Breach", header: "Breach", accessor: "Time to Breach", cell: ({ value }: any) => {
              const color = value === "NOW" ? RED : value === "Safe" ? GREEN : ORANGE;
              return <Strong style={{ color }}>{value}</Strong>;
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
                    <Text style={{ fontSize: 12, width: 35, textAlign: "right", opacity: 0.5 }}>{String(hour).padStart(2, "0")}:00</Text>
                    <div style={{ flex: 1, height: 12, borderRadius: 3, background: "rgba(128,128,128,0.04)", overflow: "hidden", position: "relative" }}>
                      <div style={{ height: "100%", width: `${barWidth}%`, background: apdexClr(apdex), borderRadius: 3, opacity: 0.7, transition: "width 0.3s ease" }} />
                    </div>
                    <Text style={{ fontSize: 12, minWidth: 45, textAlign: "right", color: BLUE }}>{fmtCount(actions)}</Text>
                    <Text style={{ fontSize: 12, minWidth: 35, textAlign: "right", fontWeight: 700, color: apdexClr(apdex) }}>{apdex.toFixed(2)}</Text>
                  </Flex>
                );
              })}
            </Flex>
            <Flex gap={16} justifyContent="flex-end" style={{ marginTop: 8 }}>
              <Flex gap={4} alignItems="center"><div style={{ width: 10, height: 10, borderRadius: 2, background: GREEN }} /><Text style={{ fontSize: 13, opacity: 0.5 }}>≥0.85</Text></Flex>
              <Flex gap={4} alignItems="center"><div style={{ width: 10, height: 10, borderRadius: 2, background: YELLOW }} /><Text style={{ fontSize: 13, opacity: 0.5 }}>≥0.7</Text></Flex>
              <Flex gap={4} alignItems="center"><div style={{ width: 10, height: 10, borderRadius: 2, background: ORANGE }} /><Text style={{ fontSize: 13, opacity: 0.5 }}>≥0.5</Text></Flex>
              <Flex gap={4} alignItems="center"><div style={{ width: 10, height: 10, borderRadius: 2, background: RED }} /><Text style={{ fontSize: 13, opacity: 0.5 }}>&lt;0.5</Text></Flex>
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
function GeoHeatmapTab({ data, isLoading, frontend, networkData, conversionData }: { data: any; isLoading: boolean; frontend: string; networkData?: any; conversionData?: any }) {
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeGeoHeatmap(data), [data]));
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
      {aiPanel}
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
                    <span style={{ fontSize: 12, padding: "2px 6px", borderRadius: 4, background: `${apdexClr(c.apdex)}18`, color: apdexClr(c.apdex), fontWeight: 700 }}>{c.apdex.toFixed(2)}</span>
                  </Flex>
                  <Flex gap={12} flexWrap="wrap" style={{ marginBottom: 6 }}>
                    <div><Text style={{ fontSize: 13, opacity: 0.5 }}>Sessions</Text><Text style={{ display: "block", fontSize: 13, fontWeight: 700, color: BLUE }}>{fmtCount(c.sessions)}</Text></div>
                    <div><Text style={{ fontSize: 13, opacity: 0.5 }}>Avg</Text><Text style={{ display: "block", fontSize: 13, fontWeight: 700, color: c.avgDur > 3000 ? RED : c.avgDur > 1000 ? YELLOW : GREEN }}>{fmt(c.avgDur)}</Text></div>
                    <div><Text style={{ fontSize: 13, opacity: 0.5 }}>Err%</Text><Text style={{ display: "block", fontSize: 13, fontWeight: 700, color: c.errRate > 5 ? RED : c.errRate > 1 ? YELLOW : GREEN }}>{fmtPct(c.errRate)}</Text></div>
                  </Flex>
                  {/* Mini satisfaction bar */}
                  <div style={{ height: 4, borderRadius: 2, overflow: "hidden", display: "flex" }}>
                    <div style={{ width: `${totalActions > 0 ? (c.sat / totalActions) * 100 : 0}%`, background: GREEN, height: "100%" }} />
                    <div style={{ width: `${totalActions > 0 ? (c.tol / totalActions) * 100 : 0}%`, background: YELLOW, height: "100%" }} />
                    <div style={{ width: `${totalActions > 0 ? (c.fru / totalActions) * 100 : 0}%`, background: RED, height: "100%" }} />
                  </div>
                  {c.cities.length > 0 && (
                    <Text style={{ fontSize: 13, opacity: 0.4, marginTop: 4 }}>{c.cities.slice(0, 3).join(", ")}{c.cities.length > 3 ? ` +${c.cities.length - 3}` : ""}</Text>
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
                { id: "Avg (ms)", header: "Avg Duration", accessor: "Avg (ms)", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 3000 ? RED : value > 1000 ? YELLOW : GREEN }}>{fmt(value)}</Text> },
                { id: "P90 (ms)", header: "P90", accessor: "P90 (ms)", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 4000 ? RED : value > 2000 ? YELLOW : GREEN }}>{fmt(value)}</Text> },
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
                { id: "Avg (ms)", header: "Avg Duration", accessor: "Avg (ms)", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 3000 ? RED : value > 1000 ? YELLOW : GREEN }}>{fmt(value)}</Text> },
                { id: "Errors", header: "Errors", accessor: "Errors", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 0 ? RED : GREEN }}>{value}</Strong> },
                { id: "Apdex", header: "Apdex", accessor: "Apdex", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: apdexClr(value) }}>{value.toFixed(2)}</Strong> },
              ]}
            />
          </div>
        </>
      )}

      {/* Network Type Performance */}
      <SectionHeader title="Network Type Performance" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Performance breakdown by connection type (WiFi, 4G, 3G, etc.)</Text>
      {(() => {
        const netRows = (networkData?.data?.records ?? []) as any[];
        const netMap = new Map<string, { sessions: number; actions: number; avgDur: number; errors: number; sat: number; tol: number; fru: number }>();
        netRows.forEach((r: any) => {
          const nt = String(r.net_type ?? "unknown");
          const d = netMap.get(nt) ?? { sessions: 0, actions: 0, avgDur: 0, errors: 0, sat: 0, tol: 0, fru: 0 };
          const actions = Number(r.actions ?? 0);
          d.avgDur = d.actions > 0 ? (d.avgDur * d.actions + Number(r.avg_dur ?? 0) * actions) / (d.actions + actions) : Number(r.avg_dur ?? 0);
          d.sessions += Number(r.sessions ?? 0);
          d.actions += actions;
          d.errors += Number(r.errors ?? 0);
          d.sat += Number(r.satisfied ?? 0);
          d.tol += Number(r.tolerating ?? 0);
          d.fru += Number(r.frustrated ?? 0);
          netMap.set(nt, d);
        });
        const nets = Array.from(netMap.entries()).map(([name, d]) => ({ name, ...d, apdex: calcApdex(d.sat, d.tol, d.actions) })).sort((a, b) => b.sessions - a.sessions);
        if (nets.length === 0) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>No network type data available</Text></div>;
        return (
          <Flex gap={12} flexWrap="wrap">
            {nets.map(n => (
              <div key={n.name} className="uj-geo-card" style={{ borderLeftColor: apdexClr(n.apdex), minWidth: 180 }}>
                <Strong style={{ fontSize: 14, textTransform: "uppercase" }}>{n.name}</Strong>
                <Flex gap={12} style={{ marginTop: 6 }}>
                  <div><Text style={{ fontSize: 11, opacity: 0.5 }}>Sessions</Text><Text style={{ display: "block", fontWeight: 700, color: BLUE }}>{fmtCount(n.sessions)}</Text></div>
                  <div><Text style={{ fontSize: 11, opacity: 0.5 }}>Avg</Text><Text style={{ display: "block", fontWeight: 700, color: n.avgDur > 3000 ? RED : n.avgDur > 1000 ? YELLOW : GREEN }}>{fmt(n.avgDur)}</Text></div>
                  <div><Text style={{ fontSize: 11, opacity: 0.5 }}>Apdex</Text><Text style={{ display: "block", fontWeight: 700, color: apdexClr(n.apdex) }}>{n.apdex.toFixed(2)}</Text></div>
                </Flex>
              </div>
            ))}
          </Flex>
        );
      })()}

      {/* Carrier/ISP Performance */}
      <SectionHeader title="Carrier / ISP Performance" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Performance by mobile carrier or ISP. Identifies network providers causing poor experience.</Text>
      {(() => {
        const netRows = (networkData?.data?.records ?? []) as any[];
        const carrierMap = new Map<string, { sessions: number; actions: number; avgDur: number; errors: number; sat: number; tol: number; fru: number; countries: Set<string> }>();
        netRows.forEach((r: any) => {
          const carrier = String(r.carrier_name ?? "unknown");
          if (carrier === "unknown") return;
          const d = carrierMap.get(carrier) ?? { sessions: 0, actions: 0, avgDur: 0, errors: 0, sat: 0, tol: 0, fru: 0, countries: new Set() };
          const actions = Number(r.actions ?? 0);
          d.avgDur = d.actions > 0 ? (d.avgDur * d.actions + Number(r.avg_dur ?? 0) * actions) / (d.actions + actions) : Number(r.avg_dur ?? 0);
          d.sessions += Number(r.sessions ?? 0);
          d.actions += actions;
          d.errors += Number(r.errors ?? 0);
          d.sat += Number(r.satisfied ?? 0);
          d.tol += Number(r.tolerating ?? 0);
          d.fru += Number(r.frustrated ?? 0);
          if (r.country) d.countries.add(String(r.country));
          carrierMap.set(carrier, d);
        });
        const carriers = Array.from(carrierMap.entries()).map(([name, d]) => ({ name, ...d, apdex: calcApdex(d.sat, d.tol, d.actions), countryList: [...d.countries].slice(0, 3).join(", ") })).sort((a, b) => b.sessions - a.sessions).slice(0, 15);
        if (carriers.length === 0) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>No carrier data available (requires mobile traffic)</Text></div>;
        return (
          <div className="uj-table-tile"><DataTable sortable data={carriers.map(c => ({
            Carrier: c.name, Sessions: c.sessions, "Avg (ms)": Math.round(c.avgDur), Errors: c.errors, Apdex: c.apdex, Countries: c.countryList,
          }))} columns={[
            { id: "Carrier", header: "Carrier/ISP", accessor: "Carrier", cell: ({ value }: any) => <Strong>{value}</Strong> },
            { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
            { id: "Avg (ms)", header: "Avg Duration", accessor: "Avg (ms)", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 3000 ? RED : value > 1000 ? YELLOW : GREEN }}>{fmt(value)}</Text> },
            { id: "Errors", header: "Errors", accessor: "Errors", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 0 ? RED : GREEN }}>{value}</Strong> },
            { id: "Apdex", header: "Apdex", accessor: "Apdex", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: apdexClr(value) }}>{value.toFixed(2)}</Strong> },
            { id: "Countries", header: "Countries", accessor: "Countries", cell: ({ value }: any) => <Text style={{ fontSize: 11, opacity: 0.5 }}>{value}</Text> },
          ]} /></div>
        );
      })()}

      {/* Conversion Rate by Geography */}
      <SectionHeader title="Conversion Rate by Geography" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Conversion rate per country — reveals where business impact of geo performance is highest.</Text>
      {(() => {
        const convRows = (conversionData?.data?.records ?? []) as any[];
        if (convRows.length === 0) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>No conversion data by geography</Text></div>;
        const sorted = convRows.map((r: any) => ({
          country: String(r.country ?? "??"),
          sessions: Number(r.total_sessions ?? 0),
          convRate: Number(r.conv_rate ?? 0),
        })).sort((a: any, b: any) => b.sessions - a.sessions).slice(0, 20);
        const maxConv = Math.max(1, ...sorted.map((s: any) => s.convRate));
        return (
          <div className="uj-table-tile" style={{ padding: 16 }}>
            {sorted.map((c: any) => (
              <Flex key={c.country} alignItems="center" gap={8} style={{ marginBottom: 6 }}>
                <Strong style={{ width: 30, fontSize: 12 }}>{c.country}</Strong>
                <div style={{ flex: 1, height: 18, background: "rgba(128,128,128,0.1)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(c.convRate / maxConv) * 100}%`, background: c.convRate > 5 ? GREEN : c.convRate > 2 ? YELLOW : RED, borderRadius: 3 }} />
                </div>
                <Text style={{ width: 60, fontSize: 12, fontWeight: 700, textAlign: "right", color: c.convRate > 5 ? GREEN : c.convRate > 2 ? YELLOW : RED }}>{fmtPct(c.convRate)}</Text>
                <Text style={{ width: 60, fontSize: 11, opacity: 0.5, textAlign: "right" }}>{fmtCount(c.sessions)}</Text>
              </Flex>
            ))}
          </div>
        );
      })()}

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

type MapMetric = "sessions" | "avgDur" | "apdex" | "errRate" | "lcp" | "cls" | "inp" | "revenue" | "convRate";
type MapView = "world" | "us";

function WorldMapTab({ data, isLoading, frontend, defaultView = "world", aov = 0, overallConv = 0, timelapseData, conversionData }: { data: any; isLoading: boolean; frontend: string; defaultView?: MapView; aov?: number; overallConv?: number; timelapseData?: any; conversionData?: any }) {
  const [metric, setMetric] = useState<MapMetric>("sessions");
  const [mapView, setMapView] = useState<MapView>(defaultView);
  const [animKey, setAnimKey] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hasUserChanged, setHasUserChanged] = useState(false);
  // Sync with saved default if user hasn't manually changed yet
  useEffect(() => { if (!hasUserChanged) setMapView(defaultView); }, [defaultView, hasUserChanged]);
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeGeoHeatmap(data), [data]));
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
    estRevenue: aov > 0 && overallConv > 0 ? d.sessions * (overallConv / 100) * aov : 0,
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
      case "revenue": return c.estRevenue;
      case "convRate": return 0;
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
      case "revenue": {
        const intensity = maxVal > 0 ? v / maxVal : 0;
        const r = Math.round(20 + intensity * 10);
        const g = Math.round(80 + intensity * 100);
        const b = Math.round(50 + intensity * 50);
        return `rgb(${r}, ${g}, ${b})`;
      }
      case "convRate": return v > 5 ? GREEN : v > 2 ? YELLOW : RED;
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
      case "revenue": return fmtCurrency(v);
      case "convRate": return fmtPct(v);
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
    revenue: "Est. Revenue",
    convRate: "Conversion Rate",
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
      {aiPanel}
      <style>{animCSS}</style>
      <Flex alignItems="center" justifyContent="space-between">
        <SectionHeader title="Map" />
        <Flex alignItems="center" gap={8}>
          <Text style={{ fontSize: 13, opacity: 0.5 }}>View</Text>
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
          {(["sessions", "avgDur", "apdex", "errRate", "lcp", "cls", "inp", ...(aov > 0 ? ["revenue"] : [])] as MapMetric[]).map((m) => (
            <button
              key={m}
              onClick={() => handleMetricChange(m)}
              style={{
                padding: "6px 14px", borderRadius: 6, border: "1px solid",
                borderColor: metric === m ? BLUE : "rgba(128,128,128,0.3)",
                background: metric === m ? `${BLUE}22` : "transparent",
                color: metric === m ? BLUE : "rgba(128,128,128,0.7)",
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
                      <g key={numId} style={{ cursor: "pointer" }} onClick={() => openLink(sessionsFilterUrl(frontend, c.countryName))}>
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
                      </g>
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
            <Text style={{ fontSize: 13, opacity: 0.5 }}>Legend ({metricLabel[metric]}):</Text>
            {metric === "sessions" && <>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: "rgb(30, 90, 140)" }} /><Text style={{ fontSize: 12 }}>Low</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: "rgb(38, 108, 188)" }} /><Text style={{ fontSize: 12 }}>Medium</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: "rgb(55, 137, 255)" }} /><Text style={{ fontSize: 12 }}>High</Text></Flex>
            </>}
            {metric === "avgDur" && <>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: GREEN }} /><Text style={{ fontSize: 12 }}>&lt;800ms</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: YELLOW }} /><Text style={{ fontSize: 12 }}>800-1500ms</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: ORANGE }} /><Text style={{ fontSize: 12 }}>1500-3000ms</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: RED }} /><Text style={{ fontSize: 12 }}>&gt;3000ms</Text></Flex>
            </>}
            {metric === "apdex" && <>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: RED }} /><Text style={{ fontSize: 12 }}>&lt;0.5</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: ORANGE }} /><Text style={{ fontSize: 12 }}>0.5-0.7</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: YELLOW }} /><Text style={{ fontSize: 12 }}>0.7-0.85</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: GREEN }} /><Text style={{ fontSize: 12 }}>&gt;0.85</Text></Flex>
            </>}
            {metric === "errRate" && <>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: GREEN }} /><Text style={{ fontSize: 12 }}>&lt;0.5%</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: YELLOW }} /><Text style={{ fontSize: 12 }}>0.5-2%</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: ORANGE }} /><Text style={{ fontSize: 12 }}>2-5%</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: RED }} /><Text style={{ fontSize: 12 }}>&gt;5%</Text></Flex>
            </>}
            {metric === "lcp" && <>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: GREEN }} /><Text style={{ fontSize: 12 }}>Good ≤{CWV.lcp.good}ms</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: ORANGE }} /><Text style={{ fontSize: 12 }}>Needs Improvement</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: RED }} /><Text style={{ fontSize: 12 }}>Poor &gt;{CWV.lcp.poor}ms</Text></Flex>
            </>}
            {metric === "cls" && <>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: GREEN }} /><Text style={{ fontSize: 12 }}>Good ≤{CWV.cls.good}</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: ORANGE }} /><Text style={{ fontSize: 12 }}>Needs Improvement</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: RED }} /><Text style={{ fontSize: 12 }}>Poor &gt;{CWV.cls.poor}</Text></Flex>
            </>}
            {metric === "inp" && <>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: GREEN }} /><Text style={{ fontSize: 12 }}>Good ≤{CWV.inp.good}ms</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: ORANGE }} /><Text style={{ fontSize: 12 }}>Needs Improvement</Text></Flex>
              <Flex alignItems="center" gap={4}><div style={{ width: 14, height: 14, borderRadius: 3, background: RED }} /><Text style={{ fontSize: 12 }}>Poor &gt;{CWV.inp.poor}ms</Text></Flex>
            </>}
            <Text style={{ fontSize: 12, opacity: 0.3, marginLeft: 8 }}>({countries.length} countries with data)</Text>
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
                        <g key={fipsId} style={{ cursor: "pointer" }} onClick={() => openLink(sessionsFilterUrl(frontend, stateName))}>
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
                        </g>
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
function NavigationPathsTab({ data, isLoading, appEntityId, steps, navPathConvData }: { data: any; isLoading: boolean; appEntityId: string; steps: StepDef[]; navPathConvData?: any }) {
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeGenericTab("Navigation Paths"), []));
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
      {aiPanel}
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
                  <Text style={{ fontSize: 12, opacity: 0.4, marginLeft: "auto" }}>{fmtCount(src.total)} transitions</Text>
                </Flex>
                <Flex flexDirection="column" gap={4} style={{ paddingLeft: 20 }}>
                  {src.targets.slice(0, 5).map((t, ti) => {
                    const pct = src.total > 0 ? (t.count / src.total) * 100 : 0;
                    const isFunnel = steps.some((s) => s.identifiers.some(id => identifierMatchesLabel(id, t.name)));
                    const color = isFunnel ? GREEN : CYAN;
                    return (
                      <Flex key={ti} alignItems="center" gap={8}>
                        <span style={{ fontSize: 14, color: "rgba(255,255,255,0.3)" }}>→</span>
                        <div style={{ flex: 1 }}>
                          <Flex alignItems="center" gap={6}>
                            {appEntityId ? (
                              <a href={vitalsUrl(appEntityId, t.name)} target="_blank" rel="noopener noreferrer" style={{ color: isFunnel ? GREEN : CYAN, textDecoration: "none", fontSize: 13 }}>
                                {t.name.length > 50 ? t.name.substring(0, 50) + "..." : t.name} ↗
                              </a>
                            ) : (
                              <Text style={{ fontSize: 13 }}>{t.name.length > 50 ? t.name.substring(0, 50) + "..." : t.name}</Text>
                            )}
                            {isFunnel && <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: `${GREEN}18`, color: GREEN }}>funnel</span>}
                          </Flex>
                          <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden", marginTop: 2 }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, opacity: 0.7 }} />
                          </div>
                        </div>
                        <Text style={{ fontSize: 12, fontWeight: 700, color, minWidth: 40, textAlign: "right" }}>{fmtCount(t.count)}</Text>
                        <Text style={{ fontSize: 12, opacity: 0.4, minWidth: 35, textAlign: "right" }}>{fmtPct(pct)}</Text>
                      </Flex>
                    );
                  })}
                  {src.targets.length > 5 && (
                    <Text style={{ fontSize: 12, opacity: 0.4, paddingLeft: 22 }}>+{src.targets.length - 5} more destinations</Text>
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

      {/* AI Path Optimization Recommendations */}
      <SectionHeader title="AI Path Optimization Insights" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>ML-driven analysis of which navigation paths correlate with higher conversion rates.</Text>
      {(() => {
        const convRows = (navPathConvData?.data?.records ?? []) as any[];
        if (convRows.length < 2) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>Insufficient data for path optimization analysis.</Text></div>;
        const pageConv = convRows.map((r: any) => ({ page: String(r.pageName ?? "unknown"), sessions: Number(r.total_sessions ?? 0), convRate: Number(r.conv_rate ?? 0) })).filter((p: any) => p.sessions >= 5);
        const avgConv = pageConv.length > 0 ? pageConv.reduce((a: number, p: any) => a + p.convRate, 0) / pageConv.length : 0;
        const highConv = pageConv.filter((p: any) => p.convRate > avgConv * 1.5).sort((a: any, b: any) => b.convRate - a.convRate).slice(0, 5);
        const lowConv = pageConv.filter((p: any) => p.convRate < avgConv * 0.5 && p.sessions >= 10).sort((a: any, b: any) => a.convRate - b.convRate).slice(0, 5);
        // Build path flow recommendations from source data
        const flowRecs: string[] = [];
        if (highConv.length > 0 && sources.length > 1) {
          const topPage = highConv[0].page;
          const routesToTop = sources.filter(s => s.targets.some(t => t.name === topPage));
          if (routesToTop.length > 0) flowRecs.push(`Users who navigate through "${routesToTop[0].name}" → "${topPage}" convert at ${highConv[0].convRate.toFixed(1)}% — ${(highConv[0].convRate / Math.max(0.1, avgConv)).toFixed(1)}x above average. Consider surfacing this path earlier in the user journey.`);
        }
        if (lowConv.length > 0) flowRecs.push(`Pages with lowest conversion include "${lowConv[0].page}" (${lowConv[0].convRate.toFixed(1)}%). Users reaching this page rarely convert — investigate if this is a dead end or distraction in the funnel.`);
        if (sources.length > 3) {
          const deepPaths = sources.filter(s => s.targets.length > 4);
          if (deepPaths.length > 0) flowRecs.push(`"${deepPaths[0].name}" branches into ${deepPaths[0].targets.length} different destinations — high branching may indicate user confusion. Consider guided navigation or progressive disclosure.`);
        }
        return (
          <Flex flexDirection="column" gap={8}>
            {flowRecs.map((rec, i) => (
              <div key={i} className="uj-table-tile" style={{ padding: 12, borderLeft: `3px solid ${BLUE}` }}>
                <Text style={{ fontSize: 13 }}>💡 {rec}</Text>
              </div>
            ))}
            {highConv.length > 0 && (
              <div className="uj-table-tile" style={{ padding: 12 }}>
                <Strong style={{ fontSize: 12, color: GREEN }}>High-Converting Pages:</Strong>
                <Flex gap={8} flexWrap="wrap" style={{ marginTop: 6 }}>
                  {highConv.map((p: any) => <span key={p.page} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: `${GREEN}15`, color: GREEN, fontWeight: 600 }}>{p.page} ({fmtPct(p.convRate)})</span>)}
                </Flex>
              </div>
            )}
            {/* Conversion Rate Overlay Per Path */}
            <SectionHeader title="Conversion Rate by Page" />
            <div className="uj-table-tile"><DataTable sortable data={pageConv.slice(0, 20).map((p: any) => ({
              Page: p.page, Sessions: p.sessions, "Conv Rate": p.convRate, "vs Avg": p.convRate - avgConv,
            }))} columns={[
              { id: "Page", header: "Page", accessor: "Page", cell: ({ value }: any) => <Text style={{ fontSize: 12 }}>{String(value).substring(0, 50)}</Text> },
              { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
              { id: "Conv Rate", header: "Conv %", accessor: "Conv Rate", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 5 ? GREEN : value > 2 ? YELLOW : RED }}>{fmtPct(value)}</Strong> },
              { id: "vs Avg", header: "vs Avg", accessor: "vs Avg", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 0 ? GREEN : RED, fontWeight: 600 }}>{value > 0 ? "+" : ""}{value.toFixed(1)}pp</Text> },
            ]} /></div>
          </Flex>
        );
      })()}

    </Flex>
  );
}

// ===========================================================================
// TAB: Anomaly Detection — NEW
// ===========================================================================
function AnomalyDetectionTab({ quality, qualityPrev, overallApdex, overallApdexPrev, funnelCounts, funnelCountsPrev, stepMap, durationDist, isLoading, steps, aov, davisProblemsData }: { quality: any; qualityPrev: any; overallApdex: number; overallApdexPrev: number; funnelCounts: number[]; funnelCountsPrev: number[]; stepMap: Map<string, any>; durationDist: any; isLoading: boolean; steps: StepDef[]; aov: number; davisProblemsData?: any }) {
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeAnomalyDetection(quality, qualityPrev, overallApdex, overallApdexPrev, funnelCounts, funnelCountsPrev), [quality, qualityPrev, overallApdex, overallApdexPrev, funnelCounts, funnelCountsPrev]));
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
      {aiPanel}
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
        {aov > 0 && (() => {
          const convAnomaly = anomalies.find(a => a.metric === "Conversion");
          const convDrop = convAnomaly && convAnomaly.deviation < 0 ? Math.abs(convAnomaly.deviation) : 0;
          const revenueAtRisk = convDrop > 0 ? (funnelCounts[0] ?? 0) * (convDrop / 100) * aov : 0;
          return revenueAtRisk > 0 ? (
            <div className="uj-kpi-card">
              <Text className="uj-kpi-label">Revenue at Risk</Text>
              <Heading level={2} className="uj-kpi-value" style={{ color: RED }}>{fmtCurrency(revenueAtRisk)}</Heading>
            </div>
          ) : null;
        })()}
      </Flex>

      {/* Anomaly cards */}
      <SectionHeader title="Metric Anomaly Status" />
      <Flex gap={12} flexWrap="wrap">
        {anomalies.map((a) => (
          <div key={a.metric} className="uj-anomaly-card" style={{ borderLeftColor: severityColor(a.severity) }}>
            <Flex alignItems="center" justifyContent="space-between" style={{ marginBottom: 6 }}>
              <Strong style={{ fontSize: 13 }}>{a.metric}</Strong>
              <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, background: `${severityColor(a.severity)}18`, color: severityColor(a.severity), fontWeight: 700, textTransform: "uppercase" }}>{a.severity}</span>
            </Flex>
            <Flex gap={16} style={{ marginBottom: 6 }}>
              <div><Text style={{ fontSize: 12, opacity: 0.5 }}>Current</Text><Strong style={{ display: "block", fontSize: 15, color: a.isAnomaly ? severityColor(a.severity) : undefined }}>{a.format(a.current)}</Strong></div>
              <div><Text style={{ fontSize: 12, opacity: 0.5 }}>Baseline</Text><Text style={{ display: "block", fontSize: 13, opacity: 0.6 }}>{a.format(a.prev)}</Text></div>
              <div><Text style={{ fontSize: 12, opacity: 0.5 }}>Deviation</Text><Strong style={{ display: "block", color: a.isAnomaly ? severityColor(a.severity) : GREEN }}>{a.improving ? "▲" : "▼"} {(a.deviation * 100).toFixed(1)}%</Strong></div>
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
            { id: "Avg (ms)", header: "Avg Duration", accessor: "Avg (ms)", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 3000 ? RED : value > 1000 ? YELLOW : GREEN }}>{fmt(value)}</Text> },
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
                    <Text style={{ fontSize: 12, width: 65, textAlign: "right", opacity: 0.6 }}>{bucket}</Text>
                    <div style={{ flex: 1, height: 16, borderRadius: 4, background: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, opacity: 0.7 }} />
                    </div>
                    <Text style={{ fontSize: 12, minWidth: 50, textAlign: "right", color: BLUE }}>{fmtCount(actions)}</Text>
                    {errRate > 0 && <Text style={{ fontSize: 13, minWidth: 40, textAlign: "right", color: RED }}>{fmtPct(errRate)} err</Text>}
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
                  <Text style={{ display: "block", fontSize: 13, opacity: 0.6 }}>
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

      {/* Davis AI Problem Events */}
      <SectionHeader title="Davis AI — Active Problems" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Active Davis-detected problems that may correlate with funnel anomalies. Links directly to Davis problem cards.</Text>
      {(() => {
        const problems = (davisProblemsData?.data?.records ?? []) as any[];
        if (problems.length === 0) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>No active Davis problems detected in this timeframe.</Text></div>;
        return (
          <Flex flexDirection="column" gap={8}>
            {problems.slice(0, 10).map((p: any, i: number) => {
              const status = String(p["event.status"] ?? "OPEN");
              const title = String(p.title ?? "Unknown Problem");
              const eventId = String(p["event.id"] ?? "");
              const displayId = String(p.display_id ?? "");
              const start = p["event.start"] ? new Date(p["event.start"]).toLocaleString() : "";
              const problemUrl = eventId ? `${ENV_URL}/ui/apps/dynatrace.davis.problems/problem/${eventId}` : "";
              return (
                <div key={i} className="uj-table-tile" style={{ padding: 12, borderLeft: `3px solid ${status === "OPEN" ? RED : ORANGE}` }}>
                  <Flex justifyContent="space-between" alignItems="center">
                    <Flex alignItems="center" gap={8}>
                      <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 3, background: status === "OPEN" ? `${RED}20` : `${GREEN}20`, color: status === "OPEN" ? RED : GREEN, fontWeight: 700 }}>{status}</span>
                      <Strong style={{ fontSize: 13 }}>{title.substring(0, 60)}</Strong>
                      {displayId && <Text style={{ fontSize: 11, opacity: 0.5 }}>{displayId}</Text>}
                    </Flex>
                    <Flex gap={8} alignItems="center">
                      <Text style={{ fontSize: 11, opacity: 0.5 }}>{start}</Text>
                      {problemUrl && <a href={problemUrl} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, fontSize: 11, textDecoration: "none", fontWeight: 600 }}>View Problem ↗</a>}
                    </Flex>
                  </Flex>
                </div>
              );
            })}
          </Flex>
        );
      })()}

    </Flex>
  );
}

// ===========================================================================
// TAB: Conversion Attribution — NEW
// ===========================================================================
function ConversionAttributionTab({ data, overallConv, isLoading, aov, funnelCounts, utmData }: { data: any; isLoading: boolean; overallConv: number; aov: number; funnelCounts: number[]; utmData?: any }) {
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeConversionAttribution(data, overallConv, aov, funnelCounts), [data, overallConv, aov, funnelCounts]));
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
  const bucketConverted = (arr: typeof parsed) => arr.reduce((a, r) => a + r.converted, 0);
  const speedBuckets = [
    { label: "Fast (≤1s)", sessions: fastSessions.reduce((a, r) => a + r.sessions, 0), converted: bucketConverted(fastSessions), convRate: bucketConv(fastSessions), color: GREEN },
    { label: "Medium (1-3s)", sessions: medSessions.reduce((a, r) => a + r.sessions, 0), converted: bucketConverted(medSessions), convRate: bucketConv(medSessions), color: YELLOW },
    { label: "Slow (>3s)", sessions: slowSessions.reduce((a, r) => a + r.sessions, 0), converted: bucketConverted(slowSessions), convRate: bucketConv(slowSessions), color: RED },
  ];

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      {aiPanel}
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
              <div><Text style={{ fontSize: 12, opacity: 0.5 }}>Sessions</Text><Strong style={{ display: "block", color: BLUE }}>{fmtCount(b.sessions)}</Strong></div>
              <div><Text style={{ fontSize: 12, opacity: 0.5 }}>Conv Rate</Text><Strong style={{ display: "block", fontSize: 18, color: statusClr(b.convRate) }}>{fmtPct(b.convRate)}</Strong></div>
              {aov > 0 && <div><Text style={{ fontSize: 12, opacity: 0.5 }}>Revenue</Text><Strong style={{ display: "block", color: b.color }}>{fmtCurrency(b.converted * aov)}</Strong></div>}
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
          <DataTable sortable resizable fullWidth data={devices.map((d) => ({ Device: d.name, Sessions: d.sessions, Converted: d.converted, "Conv %": d.convRate, Revenue: d.converted * aov, "Avg Duration": Math.round(d.avgDur), "Avg Errors": d.avgErr }))}
            columns={[
              { id: "Device", header: "Device", accessor: "Device", cell: ({ value }: any) => <Strong>{value}</Strong> },
              { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
              { id: "Converted", header: "Converted", accessor: "Converted", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: GREEN }}>{fmtCount(value)}</Strong> },
              { id: "Conv %", header: "Conv %", accessor: "Conv %", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: statusClr(value) }}>{fmtPct(value)}</Strong> },
              ...(aov > 0 ? [{ id: "Revenue", header: "Revenue", accessor: "Revenue", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: CYAN }}>{fmtCurrency(value)}</Strong> }] : []),
              { id: "Avg Duration", header: "Avg Duration", accessor: "Avg Duration", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 3000 ? RED : value > 1000 ? YELLOW : GREEN }}>{fmt(value)}</Text> },
              { id: "Avg Errors", header: "Avg Errors/Session", accessor: "Avg Errors", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 1 ? RED : value > 0 ? ORANGE : GREEN }}>{value.toFixed(2)}</Text> },
            ]}
          />
        )}
      </div>

      {/* Browser attribution */}
      <SectionHeader title="Browser → Conversion" />
      <div className="uj-table-tile">
        {browsers.length === 0 ? <Text style={{ padding: 16 }}>No browser data</Text> : (
          <DataTable sortable resizable fullWidth data={browsers.map((b) => ({ Browser: b.name, Sessions: b.sessions, Converted: b.converted, "Conv %": b.convRate, Revenue: b.converted * aov, "Avg Duration": Math.round(b.avgDur), "Avg Errors": b.avgErr }))}
            columns={[
              { id: "Browser", header: "Browser", accessor: "Browser", cell: ({ value }: any) => <Strong>{value}</Strong> },
              { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
              { id: "Converted", header: "Converted", accessor: "Converted", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: GREEN }}>{fmtCount(value)}</Strong> },
              { id: "Conv %", header: "Conv %", accessor: "Conv %", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: statusClr(value) }}>{fmtPct(value)}</Strong> },
              ...(aov > 0 ? [{ id: "Revenue", header: "Revenue", accessor: "Revenue", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: CYAN }}>{fmtCurrency(value)}</Strong> }] : []),
              { id: "Avg Duration", header: "Avg Duration", accessor: "Avg Duration", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 3000 ? RED : value > 1000 ? YELLOW : GREEN }}>{fmt(value)}</Text> },
              { id: "Avg Errors", header: "Avg Errors/Session", accessor: "Avg Errors", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 1 ? RED : value > 0 ? ORANGE : GREEN }}>{value.toFixed(2)}</Text> },
            ]}
          />
        )}
      </div>

      {/* Full cross-section */}
      <SectionHeader title="Full Device x Browser Breakdown" />
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
            { id: "Avg (ms)", header: "Avg Duration", accessor: "Avg (ms)", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 3000 ? RED : value > 1000 ? YELLOW : GREEN }}>{fmt(value)}</Text> },
            { id: "Avg Errors", header: "Avg Errors", accessor: "Avg Errors", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 1 ? RED : value > 0 ? ORANGE : GREEN }}>{value.toFixed(2)}</Text> },
          ]}
        />
      </div>

      {/* Marketing Channel Attribution (UTM) */}
      <SectionHeader title="Marketing Channel Attribution (UTM)" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Conversion rates by marketing channel using UTM parameters from session data. Identifies which acquisition channels drive the highest-quality traffic.</Text>
      {(() => {
        const utmRows = (utmData?.data?.records ?? []) as any[];
        if (utmRows.length === 0) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>No UTM parameter data available. Ensure UTM tags (utm_source, utm_medium, utm_campaign) are present in URLs or custom properties.</Text></div>;
        const channels = utmRows.map((r: any) => ({
          source: String(r.utm_source ?? "direct"),
          medium: String(r.utm_medium ?? "none"),
          campaign: String(r.utm_campaign ?? "none"),
          sessions: Number(r.total_sessions ?? 0),
          conversions: Number(r.conv_sessions ?? 0),
          convRate: Number(r.conv_rate ?? 0),
        })).sort((a: any, b: any) => b.sessions - a.sessions);
        // Multi-touch attribution weight (simplified position-based)
        const totalConv = channels.reduce((a: number, c: any) => a + c.conversions, 0);
        return (
          <div className="uj-table-tile"><DataTable sortable data={channels.map((c: any) => ({
            Source: c.source, Medium: c.medium, Campaign: c.campaign === "none" ? "—" : c.campaign,
            Sessions: c.sessions, Conversions: c.conversions, "Conv %": c.convRate,
            "Attribution %": totalConv > 0 ? Number(((c.conversions / totalConv) * 100).toFixed(1)) : 0,
          }))} columns={[
            { id: "Source", header: "Source", accessor: "Source", cell: ({ value }: any) => <Strong style={{ color: BLUE }}>{value}</Strong> },
            { id: "Medium", header: "Medium", accessor: "Medium", cell: ({ value }: any) => <Text style={{ fontSize: 12 }}>{value}</Text> },
            { id: "Campaign", header: "Campaign", accessor: "Campaign", cell: ({ value }: any) => <Text style={{ fontSize: 11, opacity: 0.6 }}>{value}</Text> },
            { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
            { id: "Conversions", header: "Conv", accessor: "Conversions", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: GREEN }}>{value}</Strong> },
            { id: "Conv %", header: "Conv %", accessor: "Conv %", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 5 ? GREEN : value > 2 ? YELLOW : RED }}>{fmtPct(value)}</Strong> },
            { id: "Attribution %", header: "Attribution", accessor: "Attribution %", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ fontWeight: 600 }}>{value}%</Text> },
          ]} /></div>
        );
      })()}

    </Flex>
  );
}

// ===========================================================================
// TAB: Executive Summary — NEW
// ===========================================================================
function ExecutiveSummaryTab({ quality, qualityPrev, overallApdex, overallApdexPrev, overallConv, overallConvPrev, funnelCounts, funnelCountsPrev, cwv: cwvMetrics, stepMap, isLoading, frontend, steps, aov }: { quality: any; qualityPrev: any; overallApdex: number; overallApdexPrev: number; overallConv: number; overallConvPrev: number; funnelCounts: number[]; funnelCountsPrev: number[]; cwv: { lcp: number; cls: number; inp: number; ttfb: number; load: number }; stepMap: Map<string, any>; isLoading: boolean; frontend: string; steps: StepDef[]; aov: number }) {
  const [copied, setCopied] = useState(false);
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeFunnelOverview(overallConv, overallApdex, quality, funnelCounts, steps, stepMap, aov), [overallConv, overallApdex, quality, funnelCounts, steps, stepMap, aov]));
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
  const lastIdx = steps.length - 1;
  const currRevenue = aov > 0 ? (funnelCounts[lastIdx] ?? 0) * aov : 0;
  const prevRevenue = aov > 0 ? (funnelCountsPrev[lastIdx] ?? 0) * aov : 0;

  const highlights: { label: string; value: string; trend: "up" | "down" | "flat"; good: boolean }[] = [
    { label: "Sessions", value: fmtCount(quality.sessions), trend: quality.sessions > qualityPrev.sessions ? "up" : quality.sessions < qualityPrev.sessions ? "down" : "flat", good: quality.sessions >= qualityPrev.sessions },
    { label: "Conversion", value: fmtPct(overallConv), trend: overallConv > overallConvPrev ? "up" : overallConv < overallConvPrev ? "down" : "flat", good: overallConv >= overallConvPrev },
    ...(aov > 0 ? [{ label: "Revenue", value: fmtCurrency(currRevenue), trend: (currRevenue > prevRevenue ? "up" : currRevenue < prevRevenue ? "down" : "flat") as "up" | "down" | "flat", good: currRevenue >= prevRevenue }] : []),
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
      ...(aov > 0 ? [{ m: "Revenue", v: fmtCurrency(currRevenue), s: currRevenue >= prevRevenue ? "Good" : "Poor" }, { m: "AOV", v: fmtCurrency(aov), s: "—" }] : []),
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

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>User Journey & Experience Report — ${frontend}</title>
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
<h1>User Journey & Experience — Executive Report</h1>
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
  User Journey & Experience v4.0 | ${frontend} | ${ts}
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
      `USER JOURNEY & EXPERIENCE — EXECUTIVE REPORT`,
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
    if (aov > 0) {
      lines.push(``, `REVENUE`, `  Current: ${fmtCurrency(currRevenue)}`, `  Previous: ${fmtCurrency(prevRevenue)}`, `  AOV: ${fmtCurrency(aov)}`);
    }
    navigator.clipboard.writeText(lines.join("\n")).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      {aiPanel}
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
          <Text style={{ fontSize: 13, opacity: 0.5, textTransform: "uppercase", letterSpacing: 1 }}>Overall Grade</Text>
          <Heading level={1} style={{ fontSize: 64, margin: "8px 0", color: gradeColor, lineHeight: 1 }}>{letterGrade}</Heading>
          <Text style={{ fontSize: 12, opacity: 0.6 }}>{Math.round(overallGradeNum)}/100 weighted score</Text>
        </div>
        <Flex flexDirection="column" gap={6} style={{ flex: 1, minWidth: 300 }}>
          {gradeMetrics.map((m) => {
            const color = m.score >= 75 ? GREEN : m.score >= 50 ? YELLOW : RED;
            return (
              <Flex key={m.label} alignItems="center" gap={8}>
                <Text style={{ fontSize: 12, width: 80, textAlign: "right", opacity: 0.6 }}>{m.label}</Text>
                <div style={{ flex: 1, height: 10, borderRadius: 5, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${m.score}%`, background: color, borderRadius: 5, transition: "width 0.4s ease" }} />
                </div>
                <Text style={{ fontSize: 12, minWidth: 30, fontWeight: 700, color }}>{m.score}</Text>
                <Text style={{ fontSize: 13, opacity: 0.4, minWidth: 20 }}>{m.weight}%</Text>
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
            <Text style={{ fontSize: 13, color: h.good ? GREEN : RED }}>{h.trend === "up" ? "▲" : h.trend === "down" ? "▼" : "●"} vs prev period</Text>
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
                <Text style={{ fontSize: 24, opacity: 0.5, display: "block" }}>{step.label}</Text>
                <Strong style={{ fontSize: 32, color: BLUE }}>{fmtCount(funnelCounts[i])}</Strong>
                {i > 0 && (
                  <Text style={{ fontSize: 24, display: "block", color: funnelCounts[i - 1] > 0 ? statusClr((funnelCounts[i] / funnelCounts[i - 1]) * 100) : undefined }}>
                    {funnelCounts[i - 1] > 0 ? fmtPct((funnelCounts[i] / funnelCounts[i - 1]) * 100) : "—"}
                  </Text>
                )}
              </div>
              {i < steps.length - 1 && <span style={{ fontSize: 32, opacity: 0.3 }}>→</span>}
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
              <Text style={{ display: "block", fontSize: 13, opacity: 0.6 }}>{fmtPct(worstStep.dropOff)} drop-off rate. {worstStep.dropOff > 40 ? "Critical friction point — requires immediate attention." : "Significant abandonment — consider UX optimization."}</Text>
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
            <Text style={{ fontSize: 12, color: cwvClr(v.value, v.metric) }}>{cwvLabel(v.value, v.metric)}</Text>
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
            ...(aov > 0 ? [{ Metric: "Revenue", Value: fmtCurrency(currRevenue), Status: currRevenue >= prevRevenue ? "Good" : "Poor" }, { Metric: "AOV", Value: fmtCurrency(aov), Status: "—" }] : []),
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
        <Text style={{ fontSize: 12, opacity: 0.3 }}>Report generated: {new Date().toLocaleString()} | Frontend: {frontend}</Text>
      </div>

      {/* AI-Generated Executive Narrative */}
      <SectionHeader title="AI Executive Narrative" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Auto-generated plain-English summary of the period's key trends and events.</Text>
      {(() => {
        // Build narrative from available metrics
        const convChange = overallConvPrev > 0 ? ((overallConv - overallConvPrev) / overallConvPrev) * 100 : 0;
        const apdexChange = overallApdexPrev > 0 ? overallApdex - overallApdexPrev : 0;
        const sessionsChange = qualityPrev.sessions > 0 ? ((quality.sessions - qualityPrev.sessions) / qualityPrev.sessions) * 100 : 0;
        const errRateNow = quality.total > 0 ? (quality.errors / quality.total) * 100 : 0;
        const errRatePrev = qualityPrev.total > 0 ? (qualityPrev.errors / qualityPrev.total) * 100 : 0;
        let narrative = `This period: `;
        if (Math.abs(convChange) > 5) narrative += `conversion ${convChange > 0 ? "improved" : "dropped"} ${Math.abs(convChange).toFixed(0)}% (${fmtPct(overallConvPrev)} → ${fmtPct(overallConv)})`;
        else narrative += `conversion remained stable at ${fmtPct(overallConv)}`;
        narrative += `. Apdex is ${overallApdex.toFixed(2)} (${apdexChange > 0 ? "+" : ""}${apdexChange.toFixed(3)} vs prior period). `;
        narrative += `Traffic ${sessionsChange > 5 ? "grew" : sessionsChange < -5 ? "declined" : "held steady"} at ${fmtCount(quality.sessions)} sessions`;
        if (Math.abs(sessionsChange) > 5) narrative += ` (${sessionsChange > 0 ? "+" : ""}${sessionsChange.toFixed(0)}%)`;
        narrative += `. `;
        if (errRateNow > errRatePrev * 1.5 && errRateNow > 1) narrative += `⚠️ Error rate increased significantly to ${fmtPct(errRateNow)} (was ${fmtPct(errRatePrev)}) — investigate recent deployments. `;
        if (overallApdex < 0.7) narrative += `User satisfaction is below acceptable levels (Apdex < 0.7) — prioritize performance optimization. `;
        if (overallConv > 5) narrative += `Conversion rate is above industry average (2-5%) — maintain current optimization efforts. `;
        return (
          <div className="uj-table-tile" style={{ padding: 16, borderLeft: `3px solid ${BLUE}`, background: "rgba(30,144,255,0.03)" }}>
            <Text style={{ fontSize: 14, lineHeight: "1.6" }}>📋 {narrative}</Text>
            <Text style={{ fontSize: 11, opacity: 0.4, marginTop: 8 }}>💡 For scheduled Slack/email delivery, create a Dynatrace Workflow with a "Run DQL" action pulling these metrics on a cron schedule, then route to a Slack/email notification action.</Text>
          </div>
        );
      })()}

    </Flex>
  );
}

// ===========================================================================
// TAB: Segmentation
// ===========================================================================
function SegmentationTab({ devices, browsers, geos, isLoading, aov = 0, overallConv = 0, osVersionData }: { devices: any[]; browsers: any[]; geos: any[]; isLoading: boolean; aov?: number; overallConv?: number; osVersionData?: any }) {
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeSegmentation(devices, browsers, geos), [devices, browsers, geos]));
  if (isLoading) return <Loading />;

  const showRevenue = aov > 0 && overallConv > 0;

  const segCols = (nameHeader: string, nameField: string) => [
    { id: nameField, header: nameHeader, accessor: nameField },
    { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Strong>{fmtCount(value)}</Strong> },
    { id: "Actions", header: "Actions", accessor: "Actions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
    { id: "Avg (ms)", header: "Avg Duration", accessor: "Avg (ms)", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 3000 ? RED : value > 1000 ? YELLOW : GREEN }}>{fmt(value)}</Text> },
    { id: "Apdex", header: "Apdex", accessor: "Apdex", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: apdexClr(value) }}>{value.toFixed(2)}</Strong> },
    ...(showRevenue ? [{ id: "Est Revenue", header: "Est Revenue", accessor: "Est Revenue", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: GREEN }}>{fmtCurrency(value)}</Strong> }] : []),
  ];

  const mapSeg = (data: any[], nameKey: string) => data.map((d: any) => {
    const sat = Number(d.satisfied ?? 0); const tol = Number(d.tolerating ?? 0); const total = Number(d.actions ?? 0);
    const sessions = Number(d.sessions ?? 0);
    return { [nameKey]: d[nameKey] ?? "Unknown", Sessions: sessions, Actions: total, "Avg (ms)": Number(d.avg_duration_ms ?? 0), Apdex: calcApdex(sat, tol, total), Errors: Number(d.errors ?? 0), "Est Revenue": showRevenue ? sessions * (overallConv / 100) * aov : 0 };
  });

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      {aiPanel}
      <SectionHeader title="By Device Type" />
      <div className="uj-table-tile"><DataTable sortable resizable fullWidth data={mapSeg(devices, "deviceType")} columns={segCols("Device", "deviceType")} /></div>
      <SectionHeader title="By Browser" />
      <div className="uj-table-tile"><DataTable sortable resizable fullWidth data={mapSeg(browsers, "browserName")} columns={[...segCols("Browser", "browserName"), { id: "Errors", header: "Errors", accessor: "Errors", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 0 ? RED : undefined }}>{value}</Text> }]} /></div>
      <SectionHeader title="By Geography" />
      <div className="uj-table-tile"><DataTable sortable resizable fullWidth data={mapSeg(geos, "country")} columns={[...segCols("Country", "country"), { id: "Errors", header: "Errors", accessor: "Errors", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 0 ? RED : undefined }}>{value}</Text> }]} /></div>
    </Flex>
  );
}

// ===========================================================================
// TAB: Errors & Drop-offs
// ===========================================================================
function ErrorsTab({ errors, funnelCounts, isLoading, steps, aov }: { errors: any[]; funnelCounts: number[]; isLoading: boolean; steps: StepDef[]; aov: number }) {
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeErrorsDropoffs(errors, funnelCounts, steps), [errors, funnelCounts, steps]));
  if (isLoading) return <Loading />;

  const lastIdx = steps.length - 1;
  const dropOffs = steps.slice(1).map((step, i) => {
    const prev = funnelCounts[i]; const curr = funnelCounts[i + 1];
    const lost = prev - curr;
    const pctLost = prev > 0 ? (lost / prev) * 100 : 0;
    const downstreamConvRate = (funnelCounts[i + 1] ?? 0) > 0 ? ((funnelCounts[lastIdx] ?? 0) / funnelCounts[i + 1]) : 0;
    const lostRevenue = aov > 0 ? lost * downstreamConvRate * aov : 0;
    return { from: steps[i].label, to: step.label, lost, pctLost, lostRevenue };
  }).sort((a, b) => b.lost - a.lost);

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      {aiPanel}
      <SectionHeader title="Biggest Drop-offs" />
      <Flex gap={16} flexWrap="wrap">
        {dropOffs.map((d, i) => (
          <div key={i} className="uj-dropoff-card">
            <Flex alignItems="center" gap={8}><Text style={{ fontSize: 24 }}>{d.from}</Text><span style={{ color: RED, fontSize: 32 }}>→</span><Text style={{ fontSize: 24 }}>{d.to}</Text></Flex>
            <Heading level={3} style={{ color: RED, margin: "8px 0 4px" }}>{fmtCount(d.lost)} lost</Heading>
            <Text style={{ fontSize: 24, opacity: 0.6 }}>{fmtPct(d.pctLost)} abandonment</Text>
            {aov > 0 && d.lostRevenue > 0 && <Text style={{ fontSize: 24, color: RED, fontWeight: 600, marginTop: 4 }}>~{fmtCurrency(d.lostRevenue)} revenue at risk</Text>}
            <div className="uj-dropoff-bar"><div className="uj-dropoff-bar-fill" style={{ width: `${100 - d.pctLost}%` }} /></div>
          </div>
        ))}
      </Flex>
      <SectionHeader title="Errors by Step" />
      <div className="uj-table-tile">
        {errors.length === 0 ? <div style={{ padding: 20 }}><Text>No errors in selected timeframe</Text></div> : (
          <DataTable sortable resizable fullWidth data={errors.map((e: any) => ({ Step: e.step_tag ?? "Unknown", Errors: Number(e.error_count ?? 0), "Affected Sessions": Number(e.affected_sessions ?? 0) }))} columns={[
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
                <Text style={{ fontSize: 13, opacity: 0.6, display: "block" }}>
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
function WhatIfTab({ funnelCounts, stepMap, overallApdex, isLoading, steps, aov, hostMetricsData }: { funnelCounts: number[]; stepMap: Map<string, any>; overallApdex: number; isLoading: boolean; steps: StepDef[]; aov: number; hostMetricsData?: any }) {
  const [pctChange, setPctChange] = useState(100);
  const [latencyImprovement, setLatencyImprovement] = useState(0);
  const [wiFunnelStyle, setWiFunnelStyle] = useState<FunnelStyle>(DEFAULT_FUNNEL_STYLE);
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeGenericTab("What-If Analysis"), []));
  if (isLoading) return <Loading />;

  const mult = 1 + pctChange / 100;
  const lastIdx = steps.length - 1;
  const log2m = mult > 1 ? Math.log2(mult) : 0;
  const latFactor = 1 + log2m * 0.5;
  const errFactor = 1 + log2m * 0.15;
  const convDegradation = log2m * 0.08;
  const projApdex = Math.max(0, overallApdex - log2m * 0.08);
  const currConvRate = funnelCounts[0] > 0 ? (funnelCounts[lastIdx] / funnelCounts[0]) * 100 : 0;
  const projConv = Math.max(0, currConvRate * (1 - convDegradation));
  const projFunnel = funnelCounts.map((c, i) => i === 0 ? Math.round(c * mult) : Math.round(c * mult * Math.pow(1 - convDegradation, i)));

  // Revenue calculations
  const currConversions = funnelCounts[lastIdx] ?? 0;
  const projConversions = projFunnel[lastIdx] ?? 0;
  const currRevenue = currConversions * aov;
  const projRevenue = projConversions * aov;
  const revenueDelta = projRevenue - currRevenue;
  // What the revenue WOULD be if conv rate didn't degrade
  const idealConversions = Math.round((funnelCounts[lastIdx] ?? 0) * mult);
  const idealRevenue = idealConversions * aov;
  const convLossRevenue = idealRevenue - projRevenue;

  const projSteps: FunnelStep[] = steps.map((step, i) => ({
    label: step.label,
    count: projFunnel[i],
    convFromPrev: i === 0 ? 100 : projFunnel[i - 1] > 0 ? (projFunnel[i] / projFunnel[i - 1]) * 100 : 0,
    overallConv: projFunnel[0] > 0 ? (projFunnel[i] / projFunnel[0]) * 100 : 0,
  }));

  const currSteps: FunnelStep[] = steps.map((step, i) => ({
    label: step.label,
    count: funnelCounts[i],
    convFromPrev: i === 0 ? 100 : funnelCounts[i - 1] > 0 ? (funnelCounts[i] / funnelCounts[i - 1]) * 100 : 0,
    overallConv: funnelCounts[0] > 0 ? (funnelCounts[i] / funnelCounts[0]) * 100 : 0,
  }));

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      {aiPanel}
      <MultiplierSlider value={pctChange} onChange={setPctChange} />

      <Flex gap={16} flexWrap="wrap">
        <div className="uj-whatif-card"><Text className="uj-metric-label">Projected Sessions</Text><Strong className="uj-metric-value" style={{ color: PURPLE }}>{fmtCount(projFunnel[0])}</Strong></div>
        <div className="uj-whatif-card"><Text className="uj-metric-label">Projected Apdex</Text><Strong className="uj-metric-value" style={{ color: apdexClr(projApdex) }}>{projApdex.toFixed(2)}</Strong></div>
        <div className="uj-whatif-card"><Text className="uj-metric-label">Projected Conv</Text><Strong className="uj-metric-value" style={{ color: statusClr(projConv) }}>{fmtPct(projConv)}</Strong></div>
        <div className="uj-whatif-card"><Text className="uj-metric-label">Latency Factor</Text><Strong className="uj-metric-value" style={{ color: latFactor > 2 ? RED : latFactor > 1.5 ? YELLOW : BLUE }}>{latFactor.toFixed(2)}x</Strong></div>
      </Flex>

      <Flex gap={16} flexWrap="wrap">
        <div className={`uj-impact-card ${projApdex < overallApdex ? "uj-impact-negative" : "uj-impact-positive"}`}>
          <Text className="uj-metric-label">Apdex Impact</Text>
          <Strong style={{ color: projApdex < overallApdex ? RED : GREEN, fontSize: 32 }}>{overallApdex.toFixed(2)} → {projApdex.toFixed(2)}</Strong>
        </div>
        <div className={`uj-impact-card ${projConv < currConvRate ? "uj-impact-negative" : "uj-impact-positive"}`}>
          <Text className="uj-metric-label">Conversion Impact</Text>
          <Strong style={{ color: RED, fontSize: 32 }}>{fmtPct(currConvRate)} → {fmtPct(projConv)}</Strong>
        </div>
      </Flex>

      {aov > 0 && (
        <>
          <SectionHeader title="Revenue Impact" />
          <Flex gap={16} flexWrap="wrap">
            <div className="uj-revenue-card">
              <Text className="uj-metric-label">Current Revenue</Text>
              <Strong className="uj-metric-value" style={{ color: BLUE }}>{fmtCurrency(currRevenue)}</Strong>
              <Text style={{ fontSize: 13, opacity: 0.5 }}>{fmtCount(currConversions)} conversions × {fmtCurrency(aov)}</Text>
            </div>
            <div className="uj-revenue-card">
              <Text className="uj-metric-label">Projected Revenue (+{pctChange}%)</Text>
              <Strong className="uj-metric-value" style={{ color: projRevenue > currRevenue ? GREEN : RED }}>{fmtCurrency(projRevenue)}</Strong>
              <Text style={{ fontSize: 13, opacity: 0.5 }}>{fmtCount(projConversions)} conversions × {fmtCurrency(aov)}</Text>
            </div>
            <div className="uj-revenue-card">
              <Text className="uj-metric-label">Net Revenue Change</Text>
              <Strong className="uj-metric-value" style={{ color: revenueDelta >= 0 ? GREEN : RED }}>{revenueDelta >= 0 ? "+" : ""}{fmtCurrency(revenueDelta)}</Strong>
              <Text style={{ fontSize: 13, opacity: 0.5 }}>{revenueDelta >= 0 ? "Gain" : "Loss"} from +{pctChange}% traffic</Text>
            </div>
            <div className={`uj-impact-card uj-impact-negative`}>
              <Text className="uj-metric-label">Conv Degradation Loss</Text>
              <Strong className="uj-metric-value" style={{ color: RED }}>{fmtCurrency(convLossRevenue)}</Strong>
              <Text style={{ fontSize: 13, opacity: 0.5 }}>Revenue lost vs. ideal (no conv drop)</Text>
            </div>
          </Flex>

          <div className="uj-table-tile" style={{ padding: 16 }}>
            <Flex gap={24} flexWrap="wrap" alignItems="center">
              <div><Text style={{ fontSize: 13, opacity: 0.5 }}>Ideal Revenue (no degradation)</Text><br /><Strong style={{ color: CYAN }}>{fmtCurrency(idealRevenue)}</Strong></div>
              <div><Text style={{ fontSize: 13, opacity: 0.5 }}>→ Actual Projected</Text><br /><Strong style={{ color: projRevenue < idealRevenue ? YELLOW : GREEN }}>{fmtCurrency(projRevenue)}</Strong></div>
              <div><Text style={{ fontSize: 13, opacity: 0.5 }}>= Perf Tax</Text><br /><Strong style={{ color: RED }}>{convLossRevenue > 0 ? "-" : ""}{fmtCurrency(convLossRevenue)}</Strong></div>
              <div><Text style={{ fontSize: 13, opacity: 0.5 }}>Perf Tax Rate</Text><br /><Strong style={{ color: RED }}>{idealRevenue > 0 ? fmtPct((convLossRevenue / idealRevenue) * 100) : "0.0%"}</Strong></div>
            </Flex>
          </div>
        </>
      )}

      <MultiplierSlider value={pctChange} onChange={setPctChange} />
      <Flex justifyContent="space-between" alignItems="center">
        <SectionHeader title="Projected Funnel" />
        <select value={wiFunnelStyle} onChange={(e) => setWiFunnelStyle(e.target.value as FunnelStyle)} style={{ background: "rgba(128,128,128,0.15)", border: "1px solid rgba(128,128,128,0.3)", borderRadius: 6, padding: "4px 10px", color: "inherit", fontSize: 12 }}>
          {FUNNEL_STYLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Flex>
      <div className="uj-funnel-container">
        {wiFunnelStyle === "classic" && <FunnelChart steps={projSteps} stepDefs={steps} />}
        {wiFunnelStyle === "horizontal" && <HorizontalBarFunnel steps={projSteps} prevSteps={currSteps} aov={aov} />}
        {wiFunnelStyle === "cohort" && <StackedCohortFunnel steps={projSteps} prevSteps={currSteps} aov={aov} />}
        {wiFunnelStyle === "elapsed" && <ElapsedTimeFunnel steps={projSteps} prevSteps={currSteps} stepMap={stepMap} stepDefs={steps} />}
        {wiFunnelStyle === "split" && <ComparisonSplitFunnel steps={projSteps} prevSteps={currSteps} aov={aov} />}
      </div>
      <Flex gap={12} justifyContent="center" style={{ marginTop: 4 }}>
        <Flex gap={6} alignItems="center"><div style={{ width: 14, height: 3, background: BLUE, borderRadius: 2 }} /><Text style={{ fontSize: 11, opacity: 0.5 }}>Projected (+{pctChange}%)</Text></Flex>
        {wiFunnelStyle !== "classic" && <Flex gap={6} alignItems="center"><div style={{ width: 14, height: 3, borderTop: "2px dashed rgba(128,128,128,0.4)" }} /><Text style={{ fontSize: 11, opacity: 0.5 }}>Current baseline</Text></Flex>}
      </Flex>

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
            { id: "Proj Sessions", header: `Proj (+${pctChange}%)`, accessor: "Proj Sessions", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: PURPLE }}>{fmtCount(value)}</Strong> },
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
        <Text style={{ fontSize: 13, opacity: 0.5 }}>
          Projections: logarithmic contention model. At 2x: ~35% latency increase, ~8% conversion degradation per doubling. Apdex degrades ~0.08 per doubling.{aov > 0 ? ` Revenue projections use AOV of ${fmtCurrency(aov)}. "Perf Tax" is the revenue lost due to conversion degradation under load.` : " Set Average Order Value in Settings to enable revenue projections."}
        </Text>
      </div>
    </Flex>
  );
}

// ===========================================================================
// TAB: Revenue Intelligence
// ===========================================================================
function RevenueIntelligenceTab({ funnelCounts, funnelCountsPrev, stepMap, overallConv, overallConvPrev, overallApdex, quality, qualityPrev, isLoading, steps, aov }: { funnelCounts: number[]; funnelCountsPrev: number[]; stepMap: Map<string, any>; overallConv: number; overallConvPrev: number; overallApdex: number; quality: any; qualityPrev: any; isLoading: boolean; steps: StepDef[]; aov: number }) {
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeGenericTab("Revenue Intelligence"), []));
  if (isLoading) return <Loading />;

  if (aov <= 0) {
    return (
      <Flex flexDirection="column" gap={16} style={{ paddingTop: 16 }} alignItems="center">
        <div className="uj-table-tile" style={{ padding: 32, textAlign: "center", maxWidth: 500 }}>
          <Text style={{ fontSize: 36, display: "block", marginBottom: 12 }}>💰</Text>
          <Heading level={5}>Average Order Value Not Set</Heading>
          <Paragraph style={{ opacity: 0.6, marginTop: 8 }}>Open <Strong>Settings</Strong> (⚙) and set an <Strong>Average Order Value</Strong> to enable Revenue Intelligence. This value represents the average revenue per conversion and is used to calculate all revenue metrics.</Paragraph>
        </div>
      </Flex>
    );
  }

  const lastIdx = steps.length - 1;
  const currConversions = funnelCounts[lastIdx] ?? 0;
  const prevConversions = funnelCountsPrev[lastIdx] ?? 0;
  const currRevenue = currConversions * aov;
  const prevRevenue = prevConversions * aov;
  const revenueDelta = currRevenue - prevRevenue;
  const revenueDeltaPct = prevRevenue > 0 ? ((revenueDelta / prevRevenue) * 100) : 0;

  // Revenue per session
  const rps = quality.sessions > 0 ? currRevenue / quality.sessions : 0;
  const rpsPrev = qualityPrev.sessions > 0 ? prevRevenue / qualityPrev.sessions : 0;

  // Funnel leakage — revenue lost at each step
  // For each transition, estimate: if those dropped users had continued at the same
  // rate as users who DID pass this step, how many would have converted?
  const stepLeakage = steps.slice(1).map((step, i) => {
    const entering = funnelCounts[i];
    const exiting = funnelCounts[i + 1];
    const dropped = entering - exiting;
    const dropRate = entering > 0 ? (dropped / entering) * 100 : 0;
    // Conversion rate from the NEXT step onward (for users who passed this step)
    const downstreamConvRate = exiting > 0 ? (funnelCounts[lastIdx] / exiting) : 0;
    const lostRevenue = dropped * downstreamConvRate * aov;
    return { from: steps[i].label, to: step.label, dropped, dropRate, lostRevenue };
  }).sort((a, b) => b.lostRevenue - a.lostRevenue);

  const totalLeakedRevenue = stepLeakage.reduce((a, s) => a + s.lostRevenue, 0);

  // Performance-speed revenue correlation (based on Apdex bands)
  const errRate = quality.total > 0 ? (quality.errors / quality.total) * 100 : 0;
  const fruPct = quality.total > 0 ? (quality.frustrated / quality.total) * 100 : 0;
  const frustratedRevLoss = currRevenue * (fruPct / 100) * 0.5; // ~50% of frustrated users abandon
  const errorRevLoss = currRevenue * (errRate / 100) * 0.3; // ~30% of error-affected sessions convert less

  // Latency tax: every 100ms above 1s costs ~1% conversion (industry benchmark)
  const avgDuration = quality.avg ?? 0;
  const latencyPenaltyPct = avgDuration > 1000 ? Math.min(30, ((avgDuration - 1000) / 100) * 1) : 0;
  const latencyRevLoss = currRevenue > 0 ? (funnelCounts[0] * (overallConv / 100) * aov * latencyPenaltyPct / 100) : 0;

  // Improvement scenarios
  const scenarios = [
    { label: "Fix top drop-off step", improvement: stepLeakage[0] ? Math.min(stepLeakage[0].dropRate * 0.25, 15) : 0 },
    { label: "Reduce avg duration to <1s", improvement: latencyPenaltyPct * 0.5 },
    { label: "Eliminate frustrated sessions", improvement: fruPct * 0.5 },
    { label: "Cut error rate in half", improvement: errRate * 0.15 },
    { label: "Improve Apdex to 0.95", improvement: overallApdex < 0.95 ? (0.95 - overallApdex) * 20 : 0 },
  ].map(s => ({ ...s, addedRevenue: currRevenue * (s.improvement / 100) })).filter(s => s.addedRevenue > 0).sort((a, b) => b.addedRevenue - a.addedRevenue);

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      {aiPanel}
      {/* Top-line revenue KPIs */}
      <Flex gap={16} flexWrap="wrap">
        <div className="uj-revenue-card uj-revenue-hero">
          <Text className="uj-metric-label">Current Revenue</Text>
          <Strong className="uj-metric-value" style={{ color: BLUE, fontSize: 28 }}>{fmtCurrency(currRevenue)}</Strong>
          <Text style={{ fontSize: 13, opacity: 0.5 }}>{fmtCount(currConversions)} conversions × {fmtCurrency(aov)} AOV</Text>
        </div>
        <div className="uj-revenue-card">
          <Text className="uj-metric-label">Previous Period</Text>
          <Strong className="uj-metric-value" style={{ color: "rgba(128,128,128,0.7)" }}>{fmtCurrency(prevRevenue)}</Strong>
          <Text style={{ fontSize: 13, opacity: 0.5 }}>{fmtCount(prevConversions)} conversions</Text>
        </div>
        <div className={`uj-revenue-card ${revenueDelta >= 0 ? "uj-revenue-positive" : "uj-revenue-negative"}`}>
          <Text className="uj-metric-label">Revenue Change</Text>
          <Strong className="uj-metric-value" style={{ color: revenueDelta >= 0 ? GREEN : RED }}>{revenueDelta >= 0 ? "+" : ""}{fmtCurrency(revenueDelta)}</Strong>
          <Text style={{ fontSize: 13, color: revenueDelta >= 0 ? GREEN : RED }}>{revenueDelta >= 0 ? "▲" : "▼"} {fmtPct(Math.abs(revenueDeltaPct))} vs prev</Text>
        </div>
        <div className="uj-revenue-card">
          <Text className="uj-metric-label">Revenue per Session</Text>
          <Strong className="uj-metric-value" style={{ color: CYAN }}>{fmtCurrency(rps)}</Strong>
          <Text style={{ fontSize: 13, color: rps >= rpsPrev ? GREEN : RED }}>{rps >= rpsPrev ? "▲" : "▼"} prev: {fmtCurrency(rpsPrev)}</Text>
        </div>
      </Flex>

      {/* Performance Tax Summary */}
      <SectionHeader title="Performance Tax" />
      <Flex gap={16} flexWrap="wrap">
        <div className="uj-impact-card uj-impact-negative uj-tax-card-expanded">
          <Text className="uj-metric-label">Latency Tax</Text>
          <Strong style={{ color: RED, fontSize: 22, display: "block", margin: "6px 0" }}>{fmtCurrency(latencyRevLoss)}</Strong>
          <Text style={{ fontSize: 13, opacity: 0.5 }}>Avg {fmt(avgDuration)} → {fmtPct(latencyPenaltyPct)} conv penalty</Text>
          <Text className="uj-tax-summary">Revenue lost due to slow page loads. Every 100ms of latency above 1s costs ~1% in conversion rate, compounding across all sessions.</Text>
        </div>
        <div className="uj-impact-card uj-impact-negative uj-tax-card-expanded">
          <Text className="uj-metric-label">Frustration Tax</Text>
          <Strong style={{ color: RED, fontSize: 22, display: "block", margin: "6px 0" }}>{fmtCurrency(frustratedRevLoss)}</Strong>
          <Text style={{ fontSize: 13, opacity: 0.5 }}>{fmtPct(fruPct)} frustrated sessions</Text>
          <Text className="uj-tax-summary">Revenue lost from sessions flagged as frustrated due to rage clicks, long waits, or poor responsiveness. ~50% of frustrated users abandon.</Text>
        </div>
        <div className="uj-impact-card uj-impact-negative uj-tax-card-expanded">
          <Text className="uj-metric-label">Error Tax</Text>
          <Strong style={{ color: RED, fontSize: 22, display: "block", margin: "6px 0" }}>{fmtCurrency(errorRevLoss)}</Strong>
          <Text style={{ fontSize: 13, opacity: 0.5 }}>{fmtPct(errRate)} error rate</Text>
          <Text className="uj-tax-summary">Revenue lost when users encounter JavaScript errors, failed requests, or broken flows. ~30% of error-affected sessions see reduced conversion.</Text>
        </div>
        <div className="uj-impact-card uj-impact-negative uj-tax-card-expanded">
          <Text className="uj-metric-label">Total Perf Tax</Text>
          <Strong style={{ color: RED, fontSize: 22, display: "block", margin: "6px 0" }}>{fmtCurrency(latencyRevLoss + frustratedRevLoss + errorRevLoss)}</Strong>
          <Text style={{ fontSize: 13, opacity: 0.5 }}>Revenue recoverable via perf</Text>
          <Text className="uj-tax-summary">Combined revenue impact of all performance issues. This is the total opportunity cost that can be recovered by improving speed, stability, and user experience.</Text>
        </div>
      </Flex>

      {/* Funnel Revenue Leakage */}
      <SectionHeader title="Funnel Revenue Leakage" />
      <div className="uj-table-tile">
        <DataTable
          data={stepLeakage.map(s => ({
            Transition: `${s.from} → ${s.to}`,
            DroppedSessions: s.dropped,
            DropRate: s.dropRate,
            LostRevenue: s.lostRevenue,
          }))}
          columns={[
            { id: "Transition", header: "Transition", accessor: "Transition" },
            { id: "DroppedSessions", header: "Dropped", accessor: "DroppedSessions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
            { id: "DropRate", header: "Drop %", accessor: "DropRate", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 40 ? RED : value > 20 ? YELLOW : GREEN }}>{fmtPct(value)}</Strong> },
            { id: "LostRevenue", header: "Est. Lost Revenue", accessor: "LostRevenue", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: RED }}>{fmtCurrency(value)}</Strong> },
          ]}
        />
      </div>
      <div className="uj-table-tile" style={{ padding: 12 }}>
        <Flex justifyContent="space-between" alignItems="center">
          <Text style={{ fontSize: 24, fontWeight: 600 }}>Total Funnel Leakage</Text>
          <Strong style={{ color: RED, fontSize: 32 }}>{fmtCurrency(totalLeakedRevenue)}</Strong>
        </Flex>
      </div>

      {/* Improvement Opportunities */}
      <SectionHeader title="Revenue Optimization Opportunities" />
      <div className="uj-rec-list">
        {scenarios.map((s, i) => (
          <div key={i} className="uj-rec-item">
            <Flex alignItems="center" gap={8}>
              <span className="uj-rec-icon">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "💡"}</span>
              <div style={{ flex: 1 }}>
                <Strong style={{ fontSize: 13 }}>{s.label}</Strong>
                <Text style={{ fontSize: 13, opacity: 0.6, display: "block" }}>+{fmtPct(s.improvement)} conversion uplift potential</Text>
              </div>
              <Strong style={{ color: GREEN, fontSize: 32 }}>+{fmtCurrency(s.addedRevenue)}</Strong>
            </Flex>
          </div>
        ))}
      </div>

      <div className="uj-table-tile" style={{ padding: 24 }}>
        <Text style={{ fontSize: 13, opacity: 0.5 }}>
          Revenue Intelligence uses an AOV of {fmtCurrency(aov)}. Latency tax uses the industry benchmark of ~1% conversion loss per 100ms above 1s. Frustration/error taxes use conservative impact estimates. Funnel leakage estimates assume dropped users had equal downstream conversion probability. Change AOV in Settings (⚙) to recalculate.
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

function SankeyTab({ data, isLoading, appEntityId, chartStyle, onStyleChange, steps, aov, cwvData, errorData, pathsData, frontend, durationData, prevPathsData, velocityData }: { data: any; isLoading: boolean; appEntityId: string; chartStyle: SankeyStyle; onStyleChange: (v: SankeyStyle) => void; steps: StepDef[]; aov: number; cwvData: any; errorData: any; pathsData: any; frontend: string; durationData: any; prevPathsData: any; velocityData: any }) {
  const [sankeySubTab, setSankeySubTab] = useState<"flow" | "convPaths" | "loops" | "timing" | "endpoints" | "revPaths" | "pathTrends" | "leakage" | "velocity">("flow");

  const sankeySubTabLabel = useMemo(() => {
    const map: Record<string, string> = { flow: "Flow Chart", convPaths: "Conversion Paths", loops: "Loop Analysis", timing: "Page Timing", endpoints: "Session Endpoints", revPaths: "Revenue Paths", pathTrends: "Path Trends", leakage: "Funnel Leakage", velocity: "Funnel Velocity" };
    return map[sankeySubTab] ?? "Flow Chart";
  }, [sankeySubTab]);
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeSankeySubTab(sankeySubTabLabel), [sankeySubTabLabel]));

  const records = (data.data?.records ?? []) as any[];
  const { nodes, links, maxDepth } = useMemo(() => buildSankey(records), [records]);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [focusLabel, setFocusLabel] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);

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

  // Set of labels connected to the focused label (for directed/alluvial/stateMachine focus mode)
  const connectedLabelSet = useMemo(() => {
    if (!focusLabel) return new Set<string>();
    const cl = new Set<string>([focusLabel]);
    for (const l of links) {
      const src = nodes.find(n => n.id === l.source);
      const tgt = nodes.find(n => n.id === l.target);
      if (src && tgt) {
        if (src.label === focusLabel) cl.add(tgt.label);
        if (tgt.label === focusLabel) cl.add(src.label);
      }
    }
    return cl;
  }, [focusLabel, links, nodes]);

  // ---- Funnel page identification ----
  const funnelPageIds = useMemo(() => new Set(steps.flatMap(s => s.identifiers)), [steps]);
  const funnelPageLabels = useMemo(() => new Set(steps.map(s => s.label)), [steps]);
  const isFunnelPage = (label: string): boolean => {
    for (const s of steps) {
      if (s.identifiers.some(id => identifierMatchesLabel(id, label))) return true;
      if (label === s.label) return true;
    }
    return funnelPageLabels.has(label) || funnelPageIds.has(label);
  };
  const funnelStepIndex = (label: string): number => {
    return steps.findIndex(s => {
      if (s.identifiers.some(id => identifierMatchesLabel(id, label))) return true;
      return label === s.label;
    });
  };

  // ---- CWV per page map ----
  const cwvMap = useMemo(() => {
    const m = new Map<string, { lcp: number; cls: number; inp: number; pageViews: number }>();
    for (const r of (cwvData?.data?.records ?? []) as any[]) {
      m.set(String(r.pageName ?? ""), { lcp: Number(r.lcp ?? 0), cls: Number(r.cls ?? 0), inp: Number(r.inp ?? 0), pageViews: Number(r.pageViews ?? 0) });
    }
    return m;
  }, [cwvData]);

  // ---- Errors per page map ----
  const errorMap = useMemo(() => {
    const m = new Map<string, { errorCount: number; errorSessions: number }>();
    for (const r of (errorData?.data?.records ?? []) as any[]) {
      m.set(String(r.pageName ?? ""), { errorCount: Number(r.errorCount ?? 0), errorSessions: Number(r.errorSessions ?? 0) });
    }
    return m;
  }, [errorData]);

  // ---- Duration per page map ----
  const durationMap = useMemo(() => {
    const m = new Map<string, { avgDuration: number; p90Duration: number; sessions: number }>();
    for (const r of (durationData?.data?.records ?? []) as any[]) {
      const pg = r.pageName ?? r.d0 ?? "";
      m.set(pg, { avgDuration: Number(r.avgDuration ?? 0), p90Duration: Number(r.p90Duration ?? 0), sessions: Number(r.sessions ?? 0) });
    }
    return m;
  }, [durationData]);

  // ---- Extended path analysis: funnel exits, returns, lost revenue ----
  const pathAnalysis = useMemo(() => {
    const pathRecords = (pathsData?.data?.records ?? []) as any[];
    let totalPaths = 0;
    let funnelCompletions = 0;
    let funnelExits = 0;
    let returnsAfterExit = 0;
    const exitPoints = new Map<string, { exits: number; returns: number; nextPages: Map<string, number> }>();
    const offFunnelPages = new Map<string, number>();

    for (const r of pathRecords) {
      const path: string[] = (r.path ?? []).map((p: any) => String(p));
      if (path.length < 2) continue;
      totalPaths++;

      let maxFunnelStep = -1;
      let exitedAt = "";
      let didReturn = false;
      let wasInFunnel = false;

      for (let i = 0; i < path.length; i++) {
        const page = path[i];
        const stepIdx = funnelStepIndex(page);
        if (stepIdx >= 0) {
          if (exitedAt && !didReturn) {
            didReturn = true;
            returnsAfterExit++;
            const ep = exitPoints.get(exitedAt);
            if (ep) ep.returns++;
          }
          maxFunnelStep = Math.max(maxFunnelStep, stepIdx);
          wasInFunnel = true;
          exitedAt = "";
        } else if (wasInFunnel && !exitedAt) {
          // User just left the funnel
          exitedAt = path[i - 1] ?? "";
          funnelExits++;
          const ep = exitPoints.get(exitedAt) ?? { exits: 0, returns: 0, nextPages: new Map() };
          ep.exits++;
          const nextCount = ep.nextPages.get(page) ?? 0;
          ep.nextPages.set(page, nextCount + 1);
          exitPoints.set(exitedAt, ep);
          offFunnelPages.set(page, (offFunnelPages.get(page) ?? 0) + 1);
        } else if (!isFunnelPage(page)) {
          offFunnelPages.set(page, (offFunnelPages.get(page) ?? 0) + 1);
        }
      }

      if (maxFunnelStep === steps.length - 1) funnelCompletions++;
    }

    // Sort exit points by exits desc
    const sortedExits = Array.from(exitPoints.entries())
      .map(([page, data]) => ({ page, ...data, nextPagesList: Array.from(data.nextPages.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5) }))
      .sort((a, b) => b.exits - a.exits);

    // Sort off-funnel pages
    const sortedOffFunnel = Array.from(offFunnelPages.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);

    return { totalPaths, funnelCompletions, funnelExits, returnsAfterExit, sortedExits, sortedOffFunnel };
  }, [pathsData, steps]);

  // ---- Funnel Leakage Analysis (sub-tab 8) ----
  const leakageAnalysis = useMemo(() => {
    const pathRecords = (pathsData?.data?.records ?? []) as any[];
    const lastStepDef = steps[steps.length - 1];
    const matchesLastStep = (page: string) => lastStepDef ? lastStepDef.identifiers.some(id => identifierMatchesLabel(id, page)) : false;

    // Classify each session
    type SessionClass = {
      path: string[];
      completed: boolean;         // reached last funnel step
      leftFunnel: boolean;        // went off-funnel at some point
      returnedToFunnel: boolean;  // came back to funnel after leaving
      exitStep: number;           // funnel step index where they left (-1 if never left)
      exitPage: string;           // the funnel page they were on when leaving
      offFunnelPages: string[];   // pages visited while off-funnel
      offFunnelCount: number;     // total off-funnel page views
      pathLength: number;
      maxFunnelStep: number;      // deepest funnel step reached
    };

    const sessions: SessionClass[] = [];
    const leavers: SessionClass[] = [];     // left funnel
    const recoverers: SessionClass[] = [];  // left and returned
    const lostUsers: SessionClass[] = [];   // left and never returned
    const converters: SessionClass[] = [];  // completed funnel
    const straightThrough: SessionClass[] = []; // completed without leaving

    for (const r of pathRecords) {
      const path: string[] = (r.path ?? []).map((p: any) => String(p));
      if (path.length < 2) continue;

      const s: SessionClass = {
        path, completed: false, leftFunnel: false, returnedToFunnel: false,
        exitStep: -1, exitPage: "", offFunnelPages: [], offFunnelCount: 0,
        pathLength: path.length, maxFunnelStep: -1,
      };

      let wasInFunnel = false;
      let isOffFunnel = false;

      for (let i = 0; i < path.length; i++) {
        const page = path[i];
        const stepIdx = funnelStepIndex(page);
        if (stepIdx >= 0) {
          s.maxFunnelStep = Math.max(s.maxFunnelStep, stepIdx);
          if (isOffFunnel) {
            s.returnedToFunnel = true;
            isOffFunnel = false;
          }
          wasInFunnel = true;
          if (matchesLastStep(page)) s.completed = true;
        } else if (wasInFunnel && !isOffFunnel) {
          // First time leaving funnel
          s.leftFunnel = true;
          isOffFunnel = true;
          s.exitStep = s.maxFunnelStep;
          s.exitPage = path[i - 1] ?? "";
          s.offFunnelPages.push(page);
          s.offFunnelCount++;
        } else if (isOffFunnel) {
          s.offFunnelPages.push(page);
          s.offFunnelCount++;
        }
      }

      sessions.push(s);
      if (s.completed) converters.push(s);
      if (s.leftFunnel) {
        leavers.push(s);
        if (s.returnedToFunnel) recoverers.push(s);
        else lostUsers.push(s);
      }
      if (s.completed && !s.leftFunnel) straightThrough.push(s);
    }

    // --- Exit step distribution: where do users leave the funnel ---
    const exitStepCounts = new Map<number, { total: number; recovered: number; lost: number; converted: number }>();
    for (const s of leavers) {
      const e = exitStepCounts.get(s.exitStep) ?? { total: 0, recovered: 0, lost: 0, converted: 0 };
      e.total++;
      if (s.returnedToFunnel) e.recovered++;
      else e.lost++;
      if (s.completed) e.converted++;
      exitStepCounts.set(s.exitStep, e);
    }
    const exitStepData = steps.map((step, i) => {
      const d = exitStepCounts.get(i) ?? { total: 0, recovered: 0, lost: 0, converted: 0 };
      return { step: step.label, index: i, ...d, recoveryRate: d.total > 0 ? (d.recovered / d.total) * 100 : 0, convRate: d.total > 0 ? (d.converted / d.total) * 100 : 0 };
    });

    // --- Off-funnel destinations: where do users go when they leave ---
    const destMap = new Map<string, { count: number; fromRecoverers: number; fromLost: number; fromConverters: number }>();
    for (const s of leavers) {
      for (const pg of s.offFunnelPages) {
        const d = destMap.get(pg) ?? { count: 0, fromRecoverers: 0, fromLost: 0, fromConverters: 0 };
        d.count++;
        if (s.returnedToFunnel) d.fromRecoverers++;
        else d.fromLost++;
        if (s.completed) d.fromConverters++;
        destMap.set(pg, d);
      }
    }
    const offFunnelDests = Array.from(destMap.entries())
      .map(([page, d]) => ({ page, ...d, recoveryRate: d.count > 0 ? (d.fromRecoverers / d.count) * 100 : 0, convRate: d.count > 0 ? (d.fromConverters / d.count) * 100 : 0 }))
      .sort((a, b) => b.count - a.count).slice(0, 15);

    // --- Behavioral comparison: recoverers vs lost users ---
    const avgPathLen = (arr: SessionClass[]) => arr.length > 0 ? arr.reduce((s, x) => s + x.pathLength, 0) / arr.length : 0;
    const avgOffFunnel = (arr: SessionClass[]) => arr.length > 0 ? arr.reduce((s, x) => s + x.offFunnelCount, 0) / arr.length : 0;
    const avgMaxStep = (arr: SessionClass[]) => arr.length > 0 ? arr.reduce((s, x) => s + x.maxFunnelStep, 0) / arr.length : 0;

    // --- CWV & error comparison: exit pages of recoverers vs lost ---
    const exitPageStats = (arr: SessionClass[]) => {
      const pages = new Map<string, number>();
      for (const s of arr) if (s.exitPage) pages.set(s.exitPage, (pages.get(s.exitPage) ?? 0) + 1);
      return Array.from(pages.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    };

    // --- Diagnostic signals: correlate leakage with performance ---
    const leakageSignals: { page: string; exitCount: number; avgLoad: number; errors: number; healthScore: number }[] = [];
    const exitPageTotals = new Map<string, number>();
    for (const s of leavers) if (s.exitPage) exitPageTotals.set(s.exitPage, (exitPageTotals.get(s.exitPage) ?? 0) + 1);
    for (const [page, count] of exitPageTotals) {
      const dur = durationMap.get(page);
      const err = errorMap.get(page);
      const avgLoad = dur?.avgDuration ?? 0;
      const errors = err?.errorCount ?? 0;
      let score = 100;
      if (avgLoad > 4000) score -= 30; else if (avgLoad > 2000) score -= 15;
      if (errors > 0) score -= Math.min(30, errors);
      leakageSignals.push({ page, exitCount: count, avgLoad, errors, healthScore: Math.max(0, score) });
    }
    leakageSignals.sort((a, b) => b.exitCount - a.exitCount);

    // --- Auto-generated insights ---
    const insights: { icon: string; text: string; severity: "critical" | "warning" | "info" }[] = [];
    const leakageRate = sessions.length > 0 ? (leavers.length / sessions.length) * 100 : 0;
    const recoveryRate = leavers.length > 0 ? (recoverers.length / leavers.length) * 100 : 0;
    const leakConvRate = leavers.length > 0 ? (leavers.filter(s => s.completed).length / leavers.length) * 100 : 0;
    const straightConvRate = sessions.length > 0 ? (straightThrough.length / sessions.length) * 100 : 0;

    if (leakageRate > 60) insights.push({ icon: "🚨", text: `${fmtPct(leakageRate)} of sessions leave the funnel at some point — significant leakage`, severity: "critical" });
    else if (leakageRate > 30) insights.push({ icon: "⚠️", text: `${fmtPct(leakageRate)} funnel leakage rate — users are navigating off-path`, severity: "warning" });
    else insights.push({ icon: "✅", text: `${fmtPct(leakageRate)} leakage rate — most users stay on the funnel`, severity: "info" });

    if (recoveryRate > 50) insights.push({ icon: "🔄", text: `${fmtPct(recoveryRate)} of users who leave eventually return — the funnel has strong pull-back`, severity: "info" });
    else if (recoveryRate > 20) insights.push({ icon: "⚠️", text: `Only ${fmtPct(recoveryRate)} of off-funnel users return — most who leave are lost`, severity: "warning" });
    else if (leavers.length > 0) insights.push({ icon: "🚨", text: `Only ${fmtPct(recoveryRate)} recovery rate — almost all users who leave never come back`, severity: "critical" });

    if (leakConvRate > 30) insights.push({ icon: "✅", text: `${fmtPct(leakConvRate)} of users who leave the funnel still end up converting`, severity: "info" });
    else if (leakConvRate > 10) insights.push({ icon: "⚠️", text: `Only ${fmtPct(leakConvRate)} of off-funnel users eventually convert`, severity: "warning" });
    else if (leavers.length > 0) insights.push({ icon: "🚨", text: `Only ${fmtPct(leakConvRate)} of users who leave the funnel convert — off-funnel is a dead end`, severity: "critical" });

    // Performance-correlated insight
    const worstExitPage = leakageSignals[0];
    if (worstExitPage && worstExitPage.avgLoad > 2000) insights.push({ icon: "🐌", text: `Top exit page "${worstExitPage.page.substring(0, 30)}" has ${Math.round(worstExitPage.avgLoad)}ms avg load — slow performance may be driving users away`, severity: "warning" });
    if (worstExitPage && worstExitPage.errors > 5) insights.push({ icon: "💥", text: `Top exit page "${worstExitPage.page.substring(0, 30)}" has ${worstExitPage.errors} errors — errors may be causing funnel abandonment`, severity: "critical" });

    // Path length insight
    const recAvgPath = avgPathLen(recoverers);
    const lostAvgPath = avgPathLen(lostUsers);
    if (recAvgPath > lostAvgPath * 1.3 && recoverers.length > 3) insights.push({ icon: "📏", text: `Recoverers have ${recAvgPath.toFixed(1)}-page avg paths vs ${lostAvgPath.toFixed(1)} for lost users — longer engagement correlates with return`, severity: "info" });

    return {
      sessions: sessions.length, leavers: leavers.length, recoverers: recoverers.length,
      lostUsers: lostUsers.length, converters: converters.length, straightThrough: straightThrough.length,
      leakageRate, recoveryRate, leakConvRate, straightConvRate,
      exitStepData, offFunnelDests, leakageSignals: leakageSignals.slice(0, 10), insights,
      recAvgPath: avgPathLen(recoverers), lostAvgPath: avgPathLen(lostUsers),
      recAvgOffFunnel: avgOffFunnel(recoverers), lostAvgOffFunnel: avgOffFunnel(lostUsers),
      recAvgMaxStep: avgMaxStep(recoverers), lostAvgMaxStep: avgMaxStep(lostUsers),
      recExitPages: exitPageStats(recoverers), lostExitPages: exitPageStats(lostUsers),
      recConvRate: recoverers.length > 0 ? (recoverers.filter(s => s.completed).length / recoverers.length) * 100 : 0,
    };
  }, [pathsData, steps, durationMap, errorMap]);

  // ---- Page health: combine CWV + errors for each page ----
  const pageHealth = useMemo(() => {
    const allLabels = new Set(nodes.map(n => n.label));
    const health: { label: string; isFunnel: boolean; lcp: number; cls: number; inp: number; errors: number; errorSessions: number; sessions: number; healthScore: number; issues: string[] }[] = [];
    for (const label of allLabels) {
      const cwv = cwvMap.get(label);
      const err = errorMap.get(label);
      const nodeVal = nodes.filter(n => n.label === label).reduce((a, n) => Math.max(a, n.value), 0);
      const lcp = cwv?.lcp ?? 0;
      const cls = cwv?.cls ?? 0;
      const inp = cwv?.inp ?? 0;
      const errors = err?.errorCount ?? 0;
      const errorSessions = err?.errorSessions ?? 0;
      const issues: string[] = [];
      if (lcp > CWV.lcp.poor) issues.push("LCP Poor");
      else if (lcp > CWV.lcp.good) issues.push("LCP Needs Improvement");
      if (cls > CWV.cls.poor) issues.push("CLS Poor");
      else if (cls > CWV.cls.good) issues.push("CLS Needs Improvement");
      if (inp > CWV.inp.poor) issues.push("INP Poor");
      else if (inp > CWV.inp.good) issues.push("INP Needs Improvement");
      if (errors > 0) issues.push(`${fmtCount(errors)} errors`);
      // Health score: 100 = perfect, deduct for issues
      let score = 100;
      if (lcp > CWV.lcp.poor) score -= 30; else if (lcp > CWV.lcp.good) score -= 15;
      if (cls > CWV.cls.poor) score -= 20; else if (cls > CWV.cls.good) score -= 10;
      if (inp > CWV.inp.poor) score -= 25; else if (inp > CWV.inp.good) score -= 12;
      if (nodeVal > 0 && errorSessions > 0) score -= Math.min(25, Math.round((errorSessions / nodeVal) * 100));
      health.push({ label, isFunnel: isFunnelPage(label), lcp, cls, inp, errors, errorSessions, sessions: nodeVal, healthScore: Math.max(0, score), issues });
    }
    return health.sort((a, b) => a.healthScore - b.healthScore);
  }, [nodes, cwvMap, errorMap, steps]);

  // ---- Key observations & recommendations engine ----
  const { observations, recommendations } = useMemo(() => {
    const obs: { icon: string; text: string; severity: "critical" | "warning" | "info" }[] = [];
    const recs: { text: string; impact: "high" | "medium" | "low" }[] = [];

    // Funnel completion rate
    const completionRate = pathAnalysis.totalPaths > 0 ? (pathAnalysis.funnelCompletions / pathAnalysis.totalPaths) * 100 : 0;
    if (completionRate < 20) {
      obs.push({ icon: "\u{1F6A8}", text: `Only ${fmtPct(completionRate)} of sessions complete the full funnel`, severity: "critical" });
      recs.push({ text: "Investigate top funnel exit points — most users are abandoning before conversion", impact: "high" });
    } else if (completionRate < 50) {
      obs.push({ icon: "⚠️", text: `${fmtPct(completionRate)} funnel completion rate — room for improvement`, severity: "warning" });
    } else {
      obs.push({ icon: "✅", text: `${fmtPct(completionRate)} funnel completion rate`, severity: "info" });
    }

    // Return rate after exit
    const returnRate = pathAnalysis.funnelExits > 0 ? (pathAnalysis.returnsAfterExit / pathAnalysis.funnelExits) * 100 : 0;
    if (returnRate < 15) {
      obs.push({ icon: "\u{1F6A8}", text: `Only ${fmtPct(returnRate)} of users return after leaving the funnel`, severity: "critical" });
      recs.push({ text: "Add re-engagement CTAs on off-funnel pages to guide users back", impact: "high" });
    } else if (returnRate < 40) {
      obs.push({ icon: "⚠️", text: `${fmtPct(returnRate)} return rate after funnel exit`, severity: "warning" });
    }

    // Lost revenue
    if (aov > 0 && pathAnalysis.funnelExits > pathAnalysis.returnsAfterExit) {
      const lostSessions = pathAnalysis.funnelExits - pathAnalysis.returnsAfterExit;
      const potentialRevenue = lostSessions * aov * (completionRate / 100);
      if (potentialRevenue > 0) {
        obs.push({ icon: "\u{1F4B0}", text: `Est. ${fmtCurrency(potentialRevenue)} potential lost revenue from ${fmtCount(lostSessions)} non-returning exits`, severity: "warning" });
      }
    }

    // Poor CWV on funnel pages
    const poorFunnelPages = pageHealth.filter(p => p.isFunnel && p.healthScore < 60);
    if (poorFunnelPages.length > 0) {
      obs.push({ icon: "\u{1F534}", text: `${poorFunnelPages.length} funnel page(s) have poor health scores: ${poorFunnelPages.map(p => p.label).join(", ")}`, severity: "critical" });
      recs.push({ text: `Fix performance on ${poorFunnelPages[0].label} — ${poorFunnelPages[0].issues.join(", ")}`, impact: "high" });
    }

    // Error-heavy pages
    const errorPages = pageHealth.filter(p => p.errors > 10).sort((a, b) => b.errors - a.errors);
    if (errorPages.length > 0) {
      obs.push({ icon: "❌", text: `${errorPages[0].label} has ${fmtCount(errorPages[0].errors)} errors affecting ${fmtCount(errorPages[0].errorSessions)} sessions`, severity: "critical" });
      recs.push({ text: `Prioritize error resolution on ${errorPages[0].label} — high error volume is likely driving abandonment`, impact: "high" });
    }

    // Top exit point analysis
    if (pathAnalysis.sortedExits.length > 0) {
      const topExit = pathAnalysis.sortedExits[0];
      obs.push({ icon: "\u{1F6AA}", text: `Top exit point: "${topExit.page}" with ${fmtCount(topExit.exits)} exits (${fmtPct(topExit.exits > 0 ? (topExit.returns / topExit.exits) * 100 : 0)} return)`, severity: "warning" });
      if (topExit.nextPagesList.length > 0) {
        recs.push({ text: `Users leaving "${topExit.page}" go to "${topExit.nextPagesList[0][0]}" — consider adding funnel CTAs there`, impact: "medium" });
      }
    }

    // Off-funnel traffic
    if (pathAnalysis.sortedOffFunnel.length > 0) {
      const topOff = pathAnalysis.sortedOffFunnel[0];
      obs.push({ icon: "↗️", text: `"${topOff[0]}" is the #1 off-funnel destination with ${fmtCount(topOff[1])} visits`, severity: "info" });
    }

    // Recommendations for pages with poor INP (usability)
    const poorInpPages = pageHealth.filter(p => p.inp > CWV.inp.poor);
    if (poorInpPages.length > 0) {
      recs.push({ text: `${poorInpPages.length} page(s) have poor INP (>500ms) — poor interactivity may frustrate users and cause exits`, impact: "medium" });
    }

    // Recommendation: optimize LCP on entry pages
    const entryNodes = nodes.filter(n => n.depth === 0);
    for (const en of entryNodes) {
      const cwv = cwvMap.get(en.label);
      if (cwv && cwv.lcp > CWV.lcp.good) {
        recs.push({ text: `Entry page "${en.label}" has LCP ${Math.round(cwv.lcp)}ms — slow first impressions increase bounce rate`, impact: "high" });
        break;
      }
    }

    return { observations: obs, recommendations: recs };
  }, [pathAnalysis, pageHealth, aov, nodes, cwvMap, steps]);

  // ==== SUB-TAB ANALYTICS ====

  // --- Conversion Path Analysis (sub-tab 2) ---
  const conversionPaths = useMemo(() => {
    const paths = (pathsData?.data?.records ?? []) as any[];
    const lastStepDef = steps[steps.length - 1];
    const matchesStep = (page: string) => lastStepDef ? lastStepDef.identifiers.some(id => identifierMatchesLabel(id, page)) : false;
    const converted: string[][] = [];
    const abandoned: string[][] = [];
    for (const r of paths) {
      const p = r.path as string[] ?? [];
      if (p.some(matchesStep)) converted.push(p);
      else abandoned.push(p);
    }
    // Top page frequencies
    const convPages = new Map<string, number>();
    const abandPages = new Map<string, number>();
    for (const p of converted) for (const pg of p) convPages.set(pg, (convPages.get(pg) ?? 0) + 1);
    for (const p of abandoned) for (const pg of p) abandPages.set(pg, (abandPages.get(pg) ?? 0) + 1);
    // Avg path length
    const avgConvLen = converted.length > 0 ? converted.reduce((a, p) => a + p.length, 0) / converted.length : 0;
    const avgAbandLen = abandoned.length > 0 ? abandoned.reduce((a, p) => a + p.length, 0) / abandoned.length : 0;
    // Top transitions for each
    const convTransitions = new Map<string, number>();
    const abandTransitions = new Map<string, number>();
    for (const p of converted) for (let i = 0; i < p.length - 1; i++) { const k = `${p[i]} → ${p[i + 1]}`; convTransitions.set(k, (convTransitions.get(k) ?? 0) + 1); }
    for (const p of abandoned) for (let i = 0; i < p.length - 1; i++) { const k = `${p[i]} → ${p[i + 1]}`; abandTransitions.set(k, (abandTransitions.get(k) ?? 0) + 1); }
    return {
      converted, abandoned,
      convRate: paths.length > 0 ? (converted.length / paths.length) * 100 : 0,
      avgConvLen, avgAbandLen,
      topConvPages: Array.from(convPages.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10),
      topAbandPages: Array.from(abandPages.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10),
      topConvTransitions: Array.from(convTransitions.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10),
      topAbandTransitions: Array.from(abandTransitions.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10),
      // Pages that appear significantly more in abandoned than converted
      differentiators: (() => {
        const all = new Set([...convPages.keys(), ...abandPages.keys()]);
        const diffs: { page: string; convPct: number; abandPct: number; diff: number }[] = [];
        for (const pg of all) {
          const cPct = converted.length > 0 ? ((convPages.get(pg) ?? 0) / converted.length) * 100 : 0;
          const aPct = abandoned.length > 0 ? ((abandPages.get(pg) ?? 0) / abandoned.length) * 100 : 0;
          diffs.push({ page: pg, convPct: cPct, abandPct: aPct, diff: aPct - cPct });
        }
        return diffs.sort((a, b) => b.diff - a.diff).slice(0, 10);
      })(),
    };
  }, [pathsData, steps]);

  // --- Loop/Cycle Detection (sub-tab 3) ---
  const loopAnalysis = useMemo(() => {
    const paths = (pathsData?.data?.records ?? []) as any[];
    const loopMap = new Map<string, { count: number; sessions: number }>();
    let sessionsWithLoops = 0;
    for (const r of paths) {
      const p = r.path as string[] ?? [];
      let hasLoop = false;
      for (let i = 0; i < p.length - 2; i++) {
        if (p[i] === p[i + 2] && p[i] !== p[i + 1]) {
          const key = `${p[i]} ⇄ ${p[i + 1]}`;
          const existing = loopMap.get(key);
          if (existing) { existing.count++; existing.sessions++; } else loopMap.set(key, { count: 1, sessions: 1 });
          hasLoop = true;
        }
      }
      if (hasLoop) sessionsWithLoops++;
    }
    const loops = Array.from(loopMap.entries()).map(([pair, data]) => ({
      pair, ...data,
      pageA: pair.split(" ⇄ ")[0],
      pageB: pair.split(" ⇄ ")[1],
    })).sort((a, b) => b.count - a.count);
    return { loops, sessionsWithLoops, totalSessions: paths.length, loopRate: paths.length > 0 ? (sessionsWithLoops / paths.length) * 100 : 0 };
  }, [pathsData]);

  // --- Session Endpoints (sub-tab 5) ---
  const endpointAnalysis = useMemo(() => {
    const paths = (pathsData?.data?.records ?? []) as any[];
    const terminalPages = new Map<string, { count: number; avgPathLen: number; totalLen: number }>();
    const bounceSessions: string[] = [];
    for (const r of paths) {
      const p = r.path as string[] ?? [];
      if (p.length === 0) continue;
      const lastPage = p[p.length - 1];
      const existing = terminalPages.get(lastPage);
      if (existing) { existing.count++; existing.totalLen += p.length; existing.avgPathLen = existing.totalLen / existing.count; }
      else terminalPages.set(lastPage, { count: 1, avgPathLen: p.length, totalLen: p.length });
      if (p.length <= 2) bounceSessions.push(lastPage);
    }
    const bouncePages = new Map<string, number>();
    for (const pg of bounceSessions) bouncePages.set(pg, (bouncePages.get(pg) ?? 0) + 1);
    const terminals = Array.from(terminalPages.entries()).map(([page, data]) => ({
      page, count: data.count, avgPathLen: Math.round(data.avgPathLen * 10) / 10,
      isFunnel: isFunnelPage(page),
      errors: errorMap.get(page)?.errorCount ?? 0,
      lcp: cwvMap.get(page)?.lcp ?? 0,
    })).sort((a, b) => b.count - a.count);
    return {
      terminals,
      bouncePages: Array.from(bouncePages.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10),
      totalSessions: paths.length,
      bounceRate: paths.length > 0 ? (bounceSessions.length / paths.length) * 100 : 0,
    };
  }, [pathsData, isFunnelPage, errorMap, cwvMap]);

  // --- Revenue Paths (sub-tab 6) ---
  const revenuePaths = useMemo(() => {
    if (aov <= 0) return null;
    const paths = (pathsData?.data?.records ?? []) as any[];
    const lastStepDef = steps[steps.length - 1];
    const matchesStep = (page: string) => lastStepDef ? lastStepDef.identifiers.some(id => identifierMatchesLabel(id, page)) : false;
    const converted = paths.filter(r => (r.path as string[] ?? []).some(matchesStep));
    // Top converting paths (stringify first 5 steps)
    const pathCounts = new Map<string, number>();
    for (const r of converted) {
      const p = (r.path as string[] ?? []).slice(0, 6);
      const key = p.join(" → ");
      pathCounts.set(key, (pathCounts.get(key) ?? 0) + 1);
    }
    const topPaths = Array.from(pathCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([path, count]) => ({
      path, count, revenue: count * aov, pctOfConversions: converted.length > 0 ? (count / converted.length) * 100 : 0,
    }));
    // Revenue by page (pages in converting paths)
    const pageRev = new Map<string, { conversions: number }>();
    for (const r of converted) {
      const p = r.path as string[] ?? [];
      const seen = new Set<string>();
      for (const pg of p) { if (!seen.has(pg)) { seen.add(pg); const e = pageRev.get(pg); if (e) e.conversions++; else pageRev.set(pg, { conversions: 1 }); } }
    }
    const pageRevenue = Array.from(pageRev.entries()).map(([page, data]) => ({
      page, conversions: data.conversions, revenue: data.conversions * aov,
      touchRate: converted.length > 0 ? (data.conversions / converted.length) * 100 : 0,
    })).sort((a, b) => b.conversions - a.conversions).slice(0, 15);
    return { topPaths, pageRevenue, totalConversions: converted.length, totalRevenue: converted.length * aov };
  }, [pathsData, steps, aov]);

  // --- Path Trends (sub-tab 7) ---
  const pathTrends = useMemo(() => {
    const currPaths = (pathsData?.data?.records ?? []) as any[];
    const prevPaths = (prevPathsData?.data?.records ?? []) as any[];
    if (prevPaths.length === 0) return null;
    // Page frequency comparison
    const currFreq = new Map<string, number>();
    const prevFreq = new Map<string, number>();
    for (const r of currPaths) for (const pg of (r.path as string[] ?? [])) currFreq.set(pg, (currFreq.get(pg) ?? 0) + 1);
    for (const r of prevPaths) for (const pg of (r.path as string[] ?? [])) prevFreq.set(pg, (prevFreq.get(pg) ?? 0) + 1);
    // Normalize to percentages
    const allPages = new Set([...currFreq.keys(), ...prevFreq.keys()]);
    const trends: { page: string; currPct: number; prevPct: number; delta: number; currCount: number; prevCount: number }[] = [];
    for (const pg of allPages) {
      const cPct = currPaths.length > 0 ? ((currFreq.get(pg) ?? 0) / currPaths.length) * 100 : 0;
      const pPct = prevPaths.length > 0 ? ((prevFreq.get(pg) ?? 0) / prevPaths.length) * 100 : 0;
      trends.push({ page: pg, currPct: cPct, prevPct: pPct, delta: cPct - pPct, currCount: currFreq.get(pg) ?? 0, prevCount: prevFreq.get(pg) ?? 0 });
    }
    // Transition comparison
    const currTrans = new Map<string, number>();
    const prevTrans = new Map<string, number>();
    for (const r of currPaths) { const p = r.path as string[] ?? []; for (let i = 0; i < p.length - 1; i++) currTrans.set(`${p[i]} → ${p[i + 1]}`, (currTrans.get(`${p[i]} → ${p[i + 1]}`) ?? 0) + 1); }
    for (const r of prevPaths) { const p = r.path as string[] ?? []; for (let i = 0; i < p.length - 1; i++) prevTrans.set(`${p[i]} → ${p[i + 1]}`, (prevTrans.get(`${p[i]} → ${p[i + 1]}`) ?? 0) + 1); }
    const transitionTrends: { transition: string; currCount: number; prevCount: number; delta: number }[] = [];
    const allTrans = new Set([...currTrans.keys(), ...prevTrans.keys()]);
    for (const t of allTrans) {
      const c = currTrans.get(t) ?? 0;
      const p = prevTrans.get(t) ?? 0;
      transitionTrends.push({ transition: t, currCount: c, prevCount: p, delta: c - p });
    }
    // Avg path length comparison
    const currAvgLen = currPaths.length > 0 ? currPaths.reduce((a: number, r: any) => a + (r.path as string[] ?? []).length, 0) / currPaths.length : 0;
    const prevAvgLen = prevPaths.length > 0 ? prevPaths.reduce((a: number, r: any) => a + (r.path as string[] ?? []).length, 0) / prevPaths.length : 0;
    return {
      pageTrends: trends.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 15),
      transitionTrends: transitionTrends.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 10),
      currSessions: currPaths.length, prevSessions: prevPaths.length,
      currAvgLen, prevAvgLen,
      newPages: trends.filter(t => t.prevCount === 0 && t.currCount > 0).map(t => t.page),
      droppedPages: trends.filter(t => t.currCount === 0 && t.prevCount > 0).map(t => t.page),
    };
  }, [pathsData, prevPathsData]);

  // ---- Exit node detection: nodes with outbound < 30% of their value ----
  const exitNodeIds = useMemo(() => {
    const outboundByNode = new Map<string, number>();
    for (const l of links) {
      outboundByNode.set(l.source, (outboundByNode.get(l.source) ?? 0) + l.value);
    }
    const exitIds = new Set<string>();
    for (const n of nodes) {
      const outbound = outboundByNode.get(n.id) ?? 0;
      if (n.value > 0 && outbound < n.value * 0.3) {
        exitIds.add(n.id);
      }
    }
    return exitIds;
  }, [nodes, links]);

  // Also compute exit labels (for Directed/Alluvial/StateMachine which use label-based focus)
  const exitLabels = useMemo(() => {
    const labelOutbound = new Map<string, number>();
    const labelValue = new Map<string, number>();
    for (const l of links) {
      const src = nodes.find(n => n.id === l.source);
      if (src) labelOutbound.set(src.label, (labelOutbound.get(src.label) ?? 0) + l.value);
    }
    for (const n of nodes) {
      labelValue.set(n.label, Math.max(labelValue.get(n.label) ?? 0, n.value));
    }
    const exitSet = new Set<string>();
    for (const [label, value] of labelValue) {
      const outbound = labelOutbound.get(label) ?? 0;
      if (value > 0 && outbound < value * 0.3) {
        exitSet.add(label);
      }
    }
    return exitSet;
  }, [nodes, links]);

  if (isLoading) return <Loading />;

  const totalSessions = records.reduce((a: number, r: any) => a + Number(r.sessions ?? r.d0 ?? 0), 0);
  const uniquePages = new Set(nodes.map(n => n.label)).size;

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

  const hasLabelFocus = focusLabel !== null;

  const handleLabelClick = (label: string) => {
    setFocusLabel(prev => prev === label ? null : label);
  };

  // ---- Node tooltip builder (rich hover with top 3 inbound/outbound) ----
  const buildNodeTooltip = (nodeId: string): string => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return "";
    const inFunnel = isFunnelPage(node.label);
    const isExit = exitNodeIds.has(nodeId);
    const inbound = links.filter(l => l.target === nodeId).map(l => {
      const src = nodes.find(n => n.id === l.source)!;
      return { label: src.label, value: l.value };
    }).sort((a, b) => b.value - a.value);
    const outbound = links.filter(l => l.source === nodeId).map(l => {
      const tgt = nodes.find(n => n.id === l.target)!;
      return { label: tgt.label, value: l.value };
    }).sort((a, b) => b.value - a.value);
    const totalIn = inbound.reduce((s, x) => s + x.value, 0);
    const totalOut = outbound.reduce((s, x) => s + x.value, 0);
    const selfIn = inbound.find(x => x.label === node.label);
    const selfReloadPct = selfIn && node.value > 0 ? (selfIn.value / node.value) * 100 : 0;
    const lines: string[] = [`${node.label}: ${fmtCount(node.value)} sessions`];
    if (isExit) lines[0] += " ⛔ Exit Point";
    else if (inFunnel) lines[0] += " ★ Funnel";
    if (selfReloadPct > 5) lines.push(`⟲ Self-reload: ${Math.round(selfReloadPct)}% (${fmtCount(selfIn!.value)})`);
    if (inbound.length > 0) {
      lines.push(`Inbound (${inbound.length}):`);
      inbound.slice(0, 3).forEach(x => { const pct = totalIn > 0 ? (x.value / totalIn) * 100 : 0; lines.push(`  ${Math.round(pct)}% (${fmtCount(x.value)})  ${x.label}`); });
    }
    if (outbound.length > 0) {
      lines.push(`Outbound (${outbound.length}):`);
      outbound.slice(0, 3).forEach(x => { const pct = totalOut > 0 ? (x.value / totalOut) * 100 : 0; lines.push(`  ${Math.round(pct)}% (${fmtCount(x.value)})  ${x.label}`); });
    }
    const err = errorMap.get(node.label);
    if (err && err.errorCount > 0) lines.push(`Errors: ${fmtCount(err.errorCount)} (${fmtCount(err.errorSessions)} sessions)`);
    return lines.join("\n");
  };

  const buildLabelTooltip = (label: string): string => {
    const matchNodes = nodes.filter(n => n.label === label);
    const totalSessions = matchNodes.reduce((a, n) => Math.max(a, n.value), 0);
    const nodeIds = matchNodes.map(n => n.id);
    const inFunnel = isFunnelPage(label);
    const isExit = exitLabels.has(label);
    const inbound = links.filter(l => nodeIds.includes(l.target)).reduce((acc, l) => {
      const src = nodes.find(n => n.id === l.source)!;
      const existing = acc.find(a => a.label === src.label);
      if (existing) existing.value += l.value; else acc.push({ label: src.label, value: l.value });
      return acc;
    }, [] as { label: string; value: number }[]).sort((a, b) => b.value - a.value);
    const outbound = links.filter(l => nodeIds.includes(l.source)).reduce((acc, l) => {
      const tgt = nodes.find(n => n.id === l.target)!;
      const existing = acc.find(a => a.label === tgt.label);
      if (existing) existing.value += l.value; else acc.push({ label: tgt.label, value: l.value });
      return acc;
    }, [] as { label: string; value: number }[]).sort((a, b) => b.value - a.value);
    const totalIn = inbound.reduce((s, x) => s + x.value, 0);
    const totalOut = outbound.reduce((s, x) => s + x.value, 0);
    const selfIn = inbound.find(x => x.label === label);
    const selfReloadPct = selfIn && totalSessions > 0 ? (selfIn.value / totalSessions) * 100 : 0;
    const lines: string[] = [`${label}: ${fmtCount(totalSessions)} sessions`];
    if (isExit) lines[0] += " ⛔ Exit Point";
    else if (inFunnel) lines[0] += " ★ Funnel";
    if (selfReloadPct > 5) lines.push(`⟲ Self-reload: ${Math.round(selfReloadPct)}% (${fmtCount(selfIn!.value)})`);
    if (inbound.length > 0) {
      lines.push(`Inbound (${inbound.length}):`);
      inbound.slice(0, 3).forEach(x => { const pct = totalIn > 0 ? (x.value / totalIn) * 100 : 0; lines.push(`  ${Math.round(pct)}% (${fmtCount(x.value)})  ${x.label}`); });
    }
    if (outbound.length > 0) {
      lines.push(`Outbound (${outbound.length}):`);
      outbound.slice(0, 3).forEach(x => { const pct = totalOut > 0 ? (x.value / totalOut) * 100 : 0; lines.push(`  ${Math.round(pct)}% (${fmtCount(x.value)})  ${x.label}`); });
    }
    const err = errorMap.get(label);
    if (err && err.errorCount > 0) lines.push(`Errors: ${fmtCount(err.errorCount)} (${fmtCount(err.errorSessions)} sessions)`);
    return lines.join("\n");
  };

  const renderLabelPopup = () => {
    if (!focusLabel) return null;
    return (
      <div style={{ marginTop: 12, padding: "12px 16px", background: "rgba(69,137,255,0.08)", borderRadius: 8, borderLeft: "3px solid " + BLUE }}>
        <Flex alignItems="center" gap={8} style={{ marginBottom: 8 }}>
          <Strong style={{ fontSize: 13 }}>{focusLabel}</Strong>
          <Text style={{ fontSize: 12, opacity: 0.5 }}>{fmtCount(labelSessions)} sessions</Text>
          {isFunnelPage(focusLabel) && <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 3, background: "rgba(255,215,0,0.12)", border: "1px solid rgba(255,215,0,0.3)", color: "#FFD700", fontWeight: 700 }}>★ Funnel</span>}
          <button onClick={() => setFocusLabel(null)} style={{ marginLeft: "auto", background: "none", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 4, color: "rgba(255,255,255,0.6)", cursor: "pointer", padding: "2px 8px", fontSize: 12 }}>Clear</button>
        </Flex>
        {labelInbound.length > 0 && (
          <div style={{ marginBottom: 6 }}>
            <Text style={{ fontSize: 12, opacity: 0.5 }}>Inbound ({labelInbound.length}):</Text>
            <Flex gap={6} flexWrap="wrap" style={{ marginTop: 2 }}>
              {labelInbound.slice(0, 8).map((l, i) => (
                <a key={i} href={appEntityId ? vitalsUrl(appEntityId, l.label) : '#'} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, padding: "1px 6px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: "inherit", textDecoration: "none", cursor: appEntityId ? "pointer" : "default" }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(69,137,255,0.18)")} onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")} title={appEntityId ? `Open in Vitals: ${l.label}` : l.label}>{truncLabel(l.label, 30)} <Strong style={{ color: CYAN }}>{fmtCount(l.value)}</Strong></a>
              ))}
            </Flex>
          </div>
        )}
        {labelOutbound.length > 0 && (
          <div style={{ marginBottom: 6 }}>
            <Text style={{ fontSize: 12, opacity: 0.5 }}>Outbound ({labelOutbound.length}):</Text>
            <Flex gap={6} flexWrap="wrap" style={{ marginTop: 2 }}>
              {labelOutbound.slice(0, 8).map((l, i) => {
                const outFunnel = !isFunnelPage(l.label);
                return <a key={i} href={appEntityId ? vitalsUrl(appEntityId, l.label) : '#'} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, padding: "1px 6px", borderRadius: 3, background: outFunnel ? "rgba(194,25,48,0.1)" : "rgba(255,255,255,0.06)", color: "inherit", textDecoration: "none", cursor: appEntityId ? "pointer" : "default", border: outFunnel ? "1px solid rgba(194,25,48,0.2)" : "none" }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(69,137,255,0.18)")} onMouseLeave={(e) => (e.currentTarget.style.background = outFunnel ? "rgba(194,25,48,0.1)" : "rgba(255,255,255,0.06)")} title={appEntityId ? `Open in Vitals: ${l.label}` : l.label}>{outFunnel ? "↗ " : ""}{truncLabel(l.label, 30)} <Strong style={{ color: outFunnel ? RED : GREEN }}>{fmtCount(l.value)}</Strong></a>;
              })}
            </Flex>
          </div>
        )}
        {/* CWV + Error health */}
        {(() => {
          const cwv = cwvMap.get(focusLabel);
          const err = errorMap.get(focusLabel);
          const health = pageHealth.find(p => p.label === focusLabel);
          if (!cwv && !err) return null;
          return (
            <div style={{ marginTop: 6, padding: "6px 10px", background: "rgba(128,128,128,0.06)", borderRadius: 6, border: "1px solid rgba(128,128,128,0.12)" }}>
              <Flex gap={12} flexWrap="wrap" alignItems="center">
                {health && <Text style={{ fontSize: 11, fontWeight: 700 }}>Health: <span style={{ color: health.healthScore >= 70 ? GREEN : health.healthScore >= 40 ? YELLOW : RED }}>{health.healthScore}/100</span></Text>}
                {cwv && cwv.lcp > 0 && <Text style={{ fontSize: 11 }}>LCP: <span style={{ color: cwvClr(cwv.lcp, "lcp"), fontWeight: 600 }}>{Math.round(cwv.lcp)}ms</span></Text>}
                {cwv && cwv.cls > 0 && <Text style={{ fontSize: 11 }}>CLS: <span style={{ color: cwvClr(cwv.cls, "cls"), fontWeight: 600 }}>{cwv.cls.toFixed(3)}</span></Text>}
                {cwv && cwv.inp > 0 && <Text style={{ fontSize: 11 }}>INP: <span style={{ color: cwvClr(cwv.inp, "inp"), fontWeight: 600 }}>{Math.round(cwv.inp)}ms</span></Text>}
                {err && err.errorCount > 0 && <Text style={{ fontSize: 11 }}>Errors: <span style={{ color: RED, fontWeight: 600 }}>{fmtCount(err.errorCount)}</span></Text>}
              </Flex>
            </div>
          );
        })()}
        {/* Exit analysis */}
        {(() => {
          const exitInfo = pathAnalysis.sortedExits.find(e => e.page === focusLabel);
          if (!exitInfo) return null;
          return (
            <div style={{ marginTop: 6, padding: "6px 10px", background: "rgba(194,25,48,0.06)", borderRadius: 6, border: "1px solid rgba(194,25,48,0.12)" }}>
              <Flex gap={12} flexWrap="wrap" alignItems="center">
                <Text style={{ fontSize: 11, fontWeight: 700, color: RED }}>Funnel Exits: {fmtCount(exitInfo.exits)}</Text>
                <Text style={{ fontSize: 11 }}>Returns: <span style={{ color: GREEN, fontWeight: 600 }}>{fmtCount(exitInfo.returns)}</span></Text>
                {exitInfo.nextPagesList.length > 0 && <Text style={{ fontSize: 11 }}>→ {exitInfo.nextPagesList[0][0]}</Text>}
              </Flex>
            </div>
          );
        })()}
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
          <button
            style={{
              background: focusMode ? "rgba(69, 137, 255, 0.25)" : "rgba(99, 130, 191, 0.15)",
              border: focusMode ? "1px solid rgba(69, 137, 255, 0.6)" : "1px solid rgba(99, 130, 191, 0.3)",
              borderRadius: 6,
              padding: "4px 10px",
              fontSize: 12,
              color: focusMode ? "#4589FF" : "rgba(128,128,128,0.8)",
              cursor: "pointer",
              fontWeight: focusMode ? 700 : 400,
            }}
            onClick={() => setFocusMode(!focusMode)}
            title={focusMode ? "Focus Mode: ON — unrelated nodes hidden on click" : "Focus Mode: OFF — unrelated nodes dimmed on click"}
          >
            Focus: {focusMode ? "ON" : "OFF"}
          </button>
          <Text style={{ fontSize: 13, opacity: 0.5 }}>Chart Style</Text>
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
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Funnel Completion</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: pathAnalysis.totalPaths > 0 && (pathAnalysis.funnelCompletions / pathAnalysis.totalPaths) < 0.3 ? RED : GREEN }}>{fmtPct(pathAnalysis.totalPaths > 0 ? (pathAnalysis.funnelCompletions / pathAnalysis.totalPaths) * 100 : 0)}</Heading>
        </div>
        <div className="uj-kpi-card">
          <Text className="uj-kpi-label">Funnel Exits</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: RED }}>{fmtCount(pathAnalysis.funnelExits)}</Heading>
        </div>
      </Flex>
      <Flex gap={12} alignItems="center" style={{ padding: "4px 0" }}>
        <Flex gap={4} alignItems="center"><span style={{ width: 12, height: 12, borderRadius: 2, background: "#FFD700", display: "inline-block", border: "1px dashed rgba(255,215,0,0.6)" }} /><Text style={{ fontSize: 11, opacity: 0.6 }}>Funnel Page</Text></Flex>
        <Flex gap={4} alignItems="center"><span style={{ width: 12, height: 12, borderRadius: 2, background: BLUE, display: "inline-block" }} /><Text style={{ fontSize: 11, opacity: 0.6 }}>Non-Funnel</Text></Flex>
        <Flex gap={4} alignItems="center"><span style={{ width: 12, height: 12, borderRadius: 2, background: RED, display: "inline-block" }} /><Text style={{ fontSize: 11, opacity: 0.6 }}>Exit Point</Text></Flex>
      </Flex>
    </>
  );

  // ---- Classic Sankey (original) ----
  const renderClassicSankey = (useGradient: boolean) => (
    <div className="uj-table-tile" style={{ padding: 16, overflowX: "auto" }}>
      <svg className="uj-sankey-wipe" width={W} height={H} style={{ display: "block", margin: "0 auto", cursor: hasFocus ? "pointer" : "default" }} onClick={() => setFocusNodeId(null)}>
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
          const opacity = hasFocus ? (isConnected ? 0.7 : (focusMode ? 0 : 0.06)) : 0.35;
          return (
            <path
              key={`link-${i}`}
              d={`M${x0},${y0} C${x0 + curvature},${y0} ${x1 - curvature},${y1} ${x1},${y1}`}
              fill="none"
              stroke={color}
              strokeWidth={Math.max(1, l.thickness * scaleY)}
              strokeOpacity={useGradient ? (hasFocus ? (isConnected ? 0.8 : (focusMode ? 0 : 0.08)) : 0.5) : opacity}
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
          const inFunnel = isFunnelPage(n.label);
          const isExit = exitNodeIds.has(n.id);
          const color = isExit ? RED : inFunnel ? "#FFD700" : SANKEY_COLORS[n.depth % SANKEY_COLORS.length];
          const isLeft = n.depth === 0;
          const isRight = n.depth === maxDepth;
          const labelX = isLeft ? x - 4 : isRight ? x + NODE_W + 4 : x + NODE_W + 4;
          const anchor = isLeft ? "end" : "start";
          const isFocused = n.id === focusNodeId;
          const isConnected = !hasFocus || connectedNodes.has(n.id);
          const nodeOpacity = hasFocus ? (isFocused ? 1 : isConnected ? 0.85 : (focusMode ? 0 : 0.15)) : 0.85;
          const labelOpacity = hasFocus ? (isConnected ? 0.9 : (focusMode ? 0 : 0.15)) : 0.7;
          return (
            <g key={n.id} style={{ cursor: "pointer", transition: "opacity 0.2s" }} onClick={(e) => { e.stopPropagation(); setFocusNodeId(isFocused ? null : n.id); }}>
              {inFunnel && !isExit && <rect x={x - 3} y={y - 3} width={NODE_W + 6} height={h + 6} rx={5} fill="none" stroke="#FFD700" strokeWidth={2} strokeDasharray="4 2" opacity={nodeOpacity * 0.6} />}
              <rect x={x} y={y} width={NODE_W} height={h} rx={3} fill={color} opacity={nodeOpacity} stroke={isFocused ? "#fff" : (isExit ? RED : inFunnel ? "#FFD700" : "none")} strokeWidth={isFocused ? 2 : (isExit || inFunnel ? 1.5 : 0)}>
                <title>{buildNodeTooltip(n.id)}</title>
              </rect>
              {h > 8 && (
                <text x={labelX} y={y + h / 2 + 3.5} textAnchor={anchor} fill={`rgba(255,255,255,${labelOpacity})`} fontSize={10} fontWeight={isFocused || inFunnel || isExit ? 700 : 400}>
                  {isExit ? "⛔ " : inFunnel ? "★ " : ""}{truncLabel(n.label)}
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
            <Text style={{ fontSize: 12, opacity: 0.5 }}>{fmtCount(focusSessions)} sessions</Text>
            <button onClick={() => setFocusNodeId(null)} style={{ marginLeft: "auto", background: "none", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 4, color: "rgba(255,255,255,0.6)", cursor: "pointer", padding: "2px 8px", fontSize: 12 }}>Clear</button>
          </Flex>
          {/* Funnel status badge */}
          {isFunnelPage(focusNode.label) && (
            <div style={{ marginBottom: 8, padding: "3px 8px", background: "rgba(255,215,0,0.12)", border: "1px solid rgba(255,215,0,0.3)", borderRadius: 4, display: "inline-block" }}>
              <Text style={{ fontSize: 11, color: "#FFD700", fontWeight: 700 }}>★ Funnel Step {funnelStepIndex(focusNode.label) + 1}: {steps[funnelStepIndex(focusNode.label)]?.label ?? ""}</Text>
            </div>
          )}
          {focusInbound.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <Text style={{ fontSize: 12, opacity: 0.5 }}>Inbound ({focusInbound.length}):</Text>
              <Flex gap={6} flexWrap="wrap" style={{ marginTop: 2 }}>
                {focusInbound.sort((a, b) => b.value - a.value).slice(0, 6).map((l, i) => {
                  const src = nodes.find(n => n.id === l.source)!;
                  return <a key={i} href={appEntityId ? vitalsUrl(appEntityId, src.label) : '#'} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, padding: "1px 6px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: "inherit", textDecoration: "none", cursor: appEntityId ? "pointer" : "default" }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(69,137,255,0.18)")} onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")} title={appEntityId ? `Open in Vitals: ${src.label}` : src.label}>{truncLabel(src.label, 30)} <Strong style={{ color: CYAN }}>{fmtCount(l.value)}</Strong></a>;
                })}
              </Flex>
            </div>
          )}
          {focusOutbound.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <Text style={{ fontSize: 12, opacity: 0.5 }}>Outbound ({focusOutbound.length}):</Text>
              <Flex gap={6} flexWrap="wrap" style={{ marginTop: 2 }}>
                {focusOutbound.sort((a, b) => b.value - a.value).slice(0, 6).map((l, i) => {
                  const tgt = nodes.find(n => n.id === l.target)!;
                  const outFunnel = !isFunnelPage(tgt.label);
                  return <a key={i} href={appEntityId ? vitalsUrl(appEntityId, tgt.label) : '#'} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, padding: "1px 6px", borderRadius: 3, background: outFunnel ? "rgba(194,25,48,0.1)" : "rgba(255,255,255,0.06)", color: "inherit", textDecoration: "none", cursor: appEntityId ? "pointer" : "default", border: outFunnel ? "1px solid rgba(194,25,48,0.2)" : "none" }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(69,137,255,0.18)")} onMouseLeave={(e) => (e.currentTarget.style.background = outFunnel ? "rgba(194,25,48,0.1)" : "rgba(255,255,255,0.06)")} title={appEntityId ? `Open in Vitals: ${tgt.label}` : tgt.label}>{outFunnel ? "↗ " : ""}{truncLabel(tgt.label, 30)} <Strong style={{ color: outFunnel ? RED : GREEN }}>{fmtCount(l.value)}</Strong></a>;
                })}
              </Flex>
            </div>
          )}
          {/* CWV + Error health for focused page */}
          {(() => {
            const cwv = cwvMap.get(focusNode.label);
            const err = errorMap.get(focusNode.label);
            const health = pageHealth.find(p => p.label === focusNode.label);
            if (!cwv && !err) return null;
            return (
              <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(128,128,128,0.06)", borderRadius: 6, border: "1px solid rgba(128,128,128,0.12)" }}>
                <Flex gap={16} flexWrap="wrap" alignItems="center">
                  {health && <Text style={{ fontSize: 11, fontWeight: 700 }}>Health: <span style={{ color: health.healthScore >= 70 ? GREEN : health.healthScore >= 40 ? YELLOW : RED }}>{health.healthScore}/100</span></Text>}
                  {cwv && cwv.lcp > 0 && <Text style={{ fontSize: 11 }}>LCP: <span style={{ color: cwvClr(cwv.lcp, "lcp"), fontWeight: 600 }}>{Math.round(cwv.lcp)}ms</span></Text>}
                  {cwv && cwv.cls > 0 && <Text style={{ fontSize: 11 }}>CLS: <span style={{ color: cwvClr(cwv.cls, "cls"), fontWeight: 600 }}>{cwv.cls.toFixed(3)}</span></Text>}
                  {cwv && cwv.inp > 0 && <Text style={{ fontSize: 11 }}>INP: <span style={{ color: cwvClr(cwv.inp, "inp"), fontWeight: 600 }}>{Math.round(cwv.inp)}ms</span></Text>}
                  {err && err.errorCount > 0 && <Text style={{ fontSize: 11 }}>Errors: <span style={{ color: RED, fontWeight: 600 }}>{fmtCount(err.errorCount)}</span> ({fmtCount(err.errorSessions)} sessions)</Text>}
                </Flex>
                {health && health.issues.length > 0 && (
                  <Text style={{ fontSize: 11, color: RED, marginTop: 4 }}>Issues: {health.issues.join(" · ")}</Text>
                )}
              </div>
            );
          })()}
          {/* Exit analysis for this page */}
          {(() => {
            const exitInfo = pathAnalysis.sortedExits.find(e => e.page === focusNode.label);
            if (!exitInfo) return null;
            const nonReturning = exitInfo.exits - exitInfo.returns;
            const lostRev = aov > 0 ? nonReturning * aov * 0.5 : 0;
            return (
              <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(194,25,48,0.06)", borderRadius: 6, border: "1px solid rgba(194,25,48,0.15)" }}>
                <Text style={{ fontSize: 12, fontWeight: 700, color: RED }}>Funnel Exit Analysis</Text>
                <Flex gap={16} flexWrap="wrap" style={{ marginTop: 4 }}>
                  <Text style={{ fontSize: 11 }}>Exits: <Strong>{fmtCount(exitInfo.exits)}</Strong></Text>
                  <Text style={{ fontSize: 11 }}>Returns: <Strong style={{ color: GREEN }}>{fmtCount(exitInfo.returns)}</Strong> ({fmtPct(exitInfo.exits > 0 ? (exitInfo.returns / exitInfo.exits) * 100 : 0)})</Text>
                  <Text style={{ fontSize: 11 }}>Non-returning: <Strong style={{ color: RED }}>{fmtCount(nonReturning)}</Strong></Text>
                  {lostRev > 0 && <Text style={{ fontSize: 11 }}>Est. Lost Revenue: <Strong style={{ color: RED }}>{fmtCurrency(lostRev)}</Strong></Text>}
                </Flex>
                {exitInfo.nextPagesList.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <Text style={{ fontSize: 11, opacity: 0.5 }}>Where they go:</Text>
                    <Flex gap={6} flexWrap="wrap" style={{ marginTop: 2 }}>
                      {exitInfo.nextPagesList.map(([page, count], i) => (
                        <span key={i} style={{ fontSize: 11, padding: "1px 6px", borderRadius: 3, background: "rgba(194,25,48,0.08)", border: "1px solid rgba(194,25,48,0.15)" }}>{truncLabel(page, 25)} <Strong style={{ color: ORANGE }}>{fmtCount(count)}</Strong></span>
                      ))}
                    </Flex>
                  </div>
                )}
              </div>
            );
          })()}
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
        <svg className="uj-sankey-wipe" width={gW} height={gH} style={{ display: "block", margin: "0 auto" }}>
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
            const edgeConnected = !hasLabelFocus || connectedLabelSet.has(e.from) && connectedLabelSet.has(e.to) && (e.from === focusLabel || e.to === focusLabel);
            const edgeOpacity = hasLabelFocus ? (edgeConnected ? 0.5 : (focusMode ? 0 : 0.06)) : 0.4;
            return (
              <g key={`edge-${i}`} style={{ transition: "opacity 0.2s" }}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={SANKEY_COLORS[i % SANKEY_COLORS.length]} strokeWidth={thickness} strokeOpacity={edgeOpacity} markerEnd="url(#arrowhead)" />
                {(!hasLabelFocus || edgeConnected) && <text x={midX} y={midY} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize={9} fontWeight={600}>{fmtCount(e.value)}</text>}
              </g>
            );
          })}
          {/* Nodes */}
          {uNodes.map((n, i) => {
            const pos = nodePositions.get(n.label);
            if (!pos) return null;
            const inFunnel = isFunnelPage(n.label);
            const isExit = exitLabels.has(n.label);
            const color = isExit ? RED : inFunnel ? "#FFD700" : SANKEY_COLORS[n.depth % SANKEY_COLORS.length];
            const isFocused = focusLabel === n.label;
            const isConnected = !hasLabelFocus || connectedLabelSet.has(n.label);
            const nodeOpacity = hasLabelFocus ? (isFocused ? 1 : isConnected ? 0.85 : (focusMode ? 0 : 0.15)) : 0.8;
            const labelVis = hasLabelFocus ? (isConnected ? 1 : (focusMode ? 0 : 0.15)) : 1;
            return (
              <g key={`node-${i}`} style={{ cursor: "pointer", transition: "opacity 0.2s" }} onClick={(e) => { e.stopPropagation(); handleLabelClick(n.label); }}>
                {inFunnel && !isExit && <circle cx={pos.x} cy={pos.y} r={nodeRadius + 4} fill="none" stroke="#FFD700" strokeWidth={2} strokeDasharray="4 2" opacity={nodeOpacity * 0.6} />}
                <circle cx={pos.x} cy={pos.y} r={nodeRadius} fill={color} fillOpacity={nodeOpacity} stroke={isFocused ? "#fff" : color} strokeWidth={isFocused ? 3 : 2}>
                  <title>{buildLabelTooltip(n.label)}</title>
                </circle>
                <text x={pos.x} y={pos.y - 3} textAnchor="middle" fill="white" fontSize={8} fontWeight={600} opacity={labelVis}>{isExit ? "⛔ " : inFunnel ? "★ " : ""}{truncLabel(n.label, 14)}</text>
                <text x={pos.x} y={pos.y + 10} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={8} opacity={labelVis}>{fmtCount(n.totalValue)}</text>
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
        <svg className="uj-sankey-wipe" width={aW} height={aH} style={{ display: "block", margin: "0 auto" }}>
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
            const edgeConnected = !hasLabelFocus || (connectedLabelSet.has(src.label) && connectedLabelSet.has(tgt.label) && (src.label === focusLabel || tgt.label === focusLabel));
            const edgeOpacity = hasLabelFocus ? (edgeConnected ? 0.5 : (focusMode ? 0 : 0.06)) : 0.4;
            const color = `rgba(180,180,200,${edgeOpacity})`;
            return (
              <path key={`al-${i}`} d={`M${x0},${y0} C${x0 + cp},${y0} ${x1 - cp},${y1} ${x1},${y1}`} fill="none" stroke={color} strokeWidth={thickness} markerEnd="url(#alluvial-arrow)" style={{ transition: "stroke 0.2s" }} />
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
            const inFunnel = isFunnelPage(n.label);
            const isExit = exitLabels.has(n.label);
            const color = isExit ? RED : inFunnel ? "#FFD700" : SANKEY_COLORS[n.depth % SANKEY_COLORS.length];
            const isFocused = focusLabel === n.label;
            const isConnected = !hasLabelFocus || connectedLabelSet.has(n.label);
            const nodeOpacity = hasLabelFocus ? (isFocused ? 1 : isConnected ? 0.85 : (focusMode ? 0 : 0.15)) : 0.9;
            const labelVis = hasLabelFocus ? (isConnected ? 1 : (focusMode ? 0 : 0.15)) : 1;
            return (
              <g key={id} style={{ cursor: "pointer", transition: "opacity 0.2s" }} onClick={(e) => { e.stopPropagation(); handleLabelClick(n.label); }}>
                {inFunnel && !isExit && <rect x={n.x - 3} y={n.y - 3} width={n.w + 6} height={n.h + 6} rx={7} fill="none" stroke="#FFD700" strokeWidth={2} strokeDasharray="4 2" opacity={nodeOpacity * 0.6} />}
                <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={5} fill={color} fillOpacity={nodeOpacity} stroke={isFocused ? "#fff" : (isExit ? RED : inFunnel ? "#FFD700" : "rgba(255,255,255,0.15)")} strokeWidth={isFocused ? 2.5 : 1}>
                  <title>{buildLabelTooltip(n.label)}</title>
                </rect>
                <text x={n.cx} y={n.y + n.h / 2 + 4} textAnchor="middle" fill="white" fontSize={10} fontWeight={600} opacity={labelVis}>
                  {isExit ? "⛔ " : inFunnel ? "★ " : ""}{truncLabel(n.label, 16)} — {fmtCount(n.value)}
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
        <svg className="uj-sankey-wipe" width={smW} height={smH} style={{ display: "block", margin: "0 auto" }}>
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
            const edgeConnected = !hasLabelFocus || (connectedLabelSet.has(e.from) && connectedLabelSet.has(e.to) && (e.from === focusLabel || e.to === focusLabel));
            const edgeOpacity = hasLabelFocus ? (edgeConnected ? 0.6 : (focusMode ? 0 : 0.06)) : 0.5;
            const color = `rgba(200,200,220,${edgeOpacity})`;
            return (
              <g key={`sme-${i}`} style={{ transition: "opacity 0.2s" }}>
                <path d={`M${x1},${y1} Q${midX},${midY} ${x2},${y2}`} fill="none" stroke={color} strokeWidth={thickness} markerEnd="url(#sm-arrow)" />
                {(!hasLabelFocus || edgeConnected) && <text x={midX} y={midY - 2} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={9} fontWeight={700}>{fmtCount(e.value)}</text>}
              </g>
            );
          })}
          {/* State nodes as filled colored rectangles */}
          {smNodes.map((n, i) => {
            const pos = smPositions.get(n.label);
            if (!pos) return null;
            const isExit = exitLabels.has(n.label);
            const inFunnel = isFunnelPage(n.label);
            const color = isExit ? RED : inFunnel ? "#FFD700" : SANKEY_COLORS[i % SANKEY_COLORS.length];
            const isFocused = focusLabel === n.label;
            const isConnected = !hasLabelFocus || connectedLabelSet.has(n.label);
            const nodeOpacity = hasLabelFocus ? (isFocused ? 1 : isConnected ? 0.85 : (focusMode ? 0 : 0.15)) : 0.9;
            const labelVis = hasLabelFocus ? (isConnected ? 1 : (focusMode ? 0 : 0.15)) : 1;
            return (
              <g key={`smn-${i}`} style={{ cursor: "pointer", transition: "opacity 0.2s" }} onClick={(e) => { e.stopPropagation(); handleLabelClick(n.label); }}>
                {inFunnel && <rect x={pos.x - nodeRectW / 2 - 3} y={pos.y - nodeRectH / 2 - 3} width={nodeRectW + 6} height={nodeRectH + 6} rx={8} fill="none" stroke="#FFD700" strokeWidth={2} strokeDasharray="4 2" opacity={nodeOpacity * 0.6} />}
                <rect x={pos.x - nodeRectW / 2} y={pos.y - nodeRectH / 2} width={nodeRectW} height={nodeRectH} rx={6} fill={color} fillOpacity={nodeOpacity} stroke={isFocused ? "#fff" : (inFunnel ? "#FFD700" : "rgba(255,255,255,0.15)")} strokeWidth={isFocused ? 2.5 : 1}>
                  <title>{buildLabelTooltip(n.label)}</title>
                </rect>
                <text x={pos.x} y={pos.y - 4} textAnchor="middle" fill="white" fontSize={10} fontWeight={700} opacity={labelVis}>{isExit ? "Exit" : (inFunnel ? "★ " : "") + truncLabel(n.label, 14)}</text>
                <text x={pos.x} y={pos.y + 12} textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize={9} opacity={labelVis}>{fmtCount(n.value)} sessions</text>
              </g>
            );
          })}
        </svg>
        {renderLabelPopup()}
      </div>
    );
  };

  // ---- Chord Diagram ----
  const renderChordDiagram = () => {
    // Build unique labels and a matrix of transitions between them
    const labelSet = new Set<string>();
    for (const n of nodes) labelSet.add(n.label);
    const labels = Array.from(labelSet);
    const idx = new Map<string, number>();
    labels.forEach((l, i) => idx.set(l, i));
    const N = labels.length;
    const matrix: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
    for (const l of links) {
      const srcNode = nodes.find(n => n.id === l.source);
      const tgtNode = nodes.find(n => n.id === l.target);
      if (srcNode && tgtNode) {
        const si = idx.get(srcNode.label);
        const ti = idx.get(tgtNode.label);
        if (si !== undefined && ti !== undefined) matrix[si][ti] += l.value;
      }
    }
    // Total per label
    const totals = labels.map((_, i) => {
      let s = 0;
      for (let j = 0; j < N; j++) { s += matrix[i][j] + matrix[j][i]; }
      return s;
    });
    const grandTotal = totals.reduce((a, b) => a + b, 0) || 1;
    // Layout arcs around a circle
    const cW = 700, cH = 700;
    const cx = cW / 2, cy = cH / 2, outerR = 280, innerR = 260, ribbonR = 240;
    const gapAngle = 0.02;
    const totalGap = gapAngle * N;
    const availAngle = Math.PI * 2 - totalGap;
    const arcs: { start: number; end: number; label: string; total: number; color: string }[] = [];
    let angle = 0;
    for (let i = 0; i < N; i++) {
      const span = (totals[i] / grandTotal) * availAngle;
      arcs.push({ start: angle, end: angle + span, label: labels[i], total: totals[i], color: SANKEY_COLORS[i % SANKEY_COLORS.length] });
      angle += span + gapAngle;
    }
    const arcPath = (startA: number, endA: number, r: number) => {
      const x1 = cx + Math.cos(startA) * r, y1 = cy + Math.sin(startA) * r;
      const x2 = cx + Math.cos(endA) * r, y2 = cy + Math.sin(endA) * r;
      const large = endA - startA > Math.PI ? 1 : 0;
      return `M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2}`;
    };
    const ribbons: { srcIdx: number; tgtIdx: number; srcStart: number; srcEnd: number; tgtStart: number; tgtEnd: number; value: number }[] = [];
    const arcCursor = arcs.map(a => a.start);
    const arcCursorTgt = arcs.map(a => a.start);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const val = matrix[i][j];
        if (val <= 0) continue;
        const srcSpan = (val / grandTotal) * availAngle;
        const tgtSpan = (val / grandTotal) * availAngle;
        ribbons.push({ srcIdx: i, tgtIdx: j, srcStart: arcCursor[i], srcEnd: arcCursor[i] + srcSpan, tgtStart: arcCursorTgt[j], tgtEnd: arcCursorTgt[j] + tgtSpan, value: val });
        arcCursor[i] += srcSpan;
        arcCursorTgt[j] += tgtSpan;
      }
    }
    const ribbonPath = (r: typeof ribbons[0]) => {
      const sx1 = cx + Math.cos(r.srcStart) * ribbonR, sy1 = cy + Math.sin(r.srcStart) * ribbonR;
      const sx2 = cx + Math.cos(r.srcEnd) * ribbonR, sy2 = cy + Math.sin(r.srcEnd) * ribbonR;
      const tx1 = cx + Math.cos(r.tgtStart) * ribbonR, ty1 = cy + Math.sin(r.tgtStart) * ribbonR;
      const tx2 = cx + Math.cos(r.tgtEnd) * ribbonR, ty2 = cy + Math.sin(r.tgtEnd) * ribbonR;
      const srcLarge = r.srcEnd - r.srcStart > Math.PI ? 1 : 0;
      const tgtLarge = r.tgtEnd - r.tgtStart > Math.PI ? 1 : 0;
      return `M${sx1},${sy1} A${ribbonR},${ribbonR} 0 ${srcLarge} 1 ${sx2},${sy2} Q${cx},${cy} ${tx1},${ty1} A${ribbonR},${ribbonR} 0 ${tgtLarge} 1 ${tx2},${ty2} Q${cx},${cy} ${sx1},${sy1} Z`;
    };

    // Selection: use focusLabel to match chord arcs by label
    const selectedChordIdx = focusLabel ? idx.get(focusLabel) ?? -1 : -1;
    const hasChordFocus = selectedChordIdx >= 0;
    const isChordConnected = (arcIdx: number) => {
      if (!hasChordFocus) return true;
      if (arcIdx === selectedChordIdx) return true;
      return matrix[selectedChordIdx][arcIdx] > 0 || matrix[arcIdx][selectedChordIdx] > 0;
    };

    // Click handler for arcs - set focusNodeId to match the label
    const handleChordClick = (label: string) => {
      if (focusLabel === label) { setFocusNodeId(null); setFocusLabel(null); }
      else {
        const node = nodes.find(n => n.label === label);
        if (node) { setFocusNodeId(node.id); setFocusLabel(label); }
        else setFocusLabel(label);
      }
    };

    return (
      <div className="uj-table-tile" style={{ padding: 16, overflowX: "auto" }} onClick={() => { setFocusNodeId(null); setFocusLabel(null); }}>
        <svg className="uj-sankey-wipe" width={cW} height={cH} style={{ display: "block", margin: "0 auto" }}>
          {/* Ribbons */}
          {ribbons.map((r, i) => {
            const isConnected = !hasChordFocus || r.srcIdx === selectedChordIdx || r.tgtIdx === selectedChordIdx;
            const opacity = hasChordFocus ? (isConnected ? 0.55 : (focusMode ? 0 : 0.04)) : 0.35;
            return (
              <path key={`ribbon-${i}`} d={ribbonPath(r)} fill={arcs[r.srcIdx].color} fillOpacity={opacity} stroke={arcs[r.srcIdx].color} strokeWidth={isConnected && hasChordFocus ? 1 : 0.5} strokeOpacity={hasChordFocus ? (isConnected ? 0.8 : (focusMode ? 0 : 0.1)) : 0.5} style={{ cursor: "pointer", transition: "fill-opacity 0.2s, stroke-opacity 0.2s" }} onClick={(e) => { e.stopPropagation(); handleChordClick(labels[r.srcIdx]); }}>
                <title>{`${labels[r.srcIdx]} → ${labels[r.tgtIdx]}: ${fmtCount(r.value)} sessions`}</title>
              </path>
            );
          })}
          {/* Outer arcs */}
          {arcs.map((a, i) => {
            const inFunnel = isFunnelPage(a.label);
            const isExit = exitNodeIds.has(nodes.find(n => n.label === a.label)?.id ?? "");
            const color = isExit ? RED : inFunnel ? "#FFD700" : a.color;
            const mid = (a.start + a.end) / 2;
            const lx = cx + Math.cos(mid) * (outerR + 18);
            const ly = cy + Math.sin(mid) * (outerR + 18);
            const anchor = mid > Math.PI / 2 && mid < Math.PI * 1.5 ? "end" : "start";
            const rot = (mid * 180 / Math.PI) + (anchor === "end" ? 180 : 0);
            const isSelected = selectedChordIdx === i;
            const connected = isChordConnected(i);
            const arcOpacity = hasChordFocus ? (isSelected ? 1 : connected ? 0.7 : (focusMode ? 0 : 0.15)) : 0.85;
            const labelFill = hasChordFocus ? (connected ? "rgba(255,255,255,0.9)" : (focusMode ? "rgba(255,255,255,0)" : "rgba(255,255,255,0.15)")) : "rgba(255,255,255,0.7)";
            return (
              <g key={`arc-${i}`} style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); handleChordClick(a.label); }}>
                {inFunnel && <path d={arcPath(a.start, a.end, outerR + 4)} fill="none" stroke="#FFD700" strokeWidth={3} strokeDasharray="4 2" opacity={arcOpacity * 0.6} />}
                {isSelected && <path d={arcPath(a.start, a.end, outerR + 2)} fill="none" stroke="#fff" strokeWidth={outerR - innerR + 4} strokeLinecap="butt" opacity={0.3} />}
                <path d={arcPath(a.start, a.end, outerR)} fill="none" stroke={color} strokeWidth={outerR - innerR} strokeLinecap="butt" opacity={arcOpacity} style={{ transition: "opacity 0.2s" }}>
                  <title>{`${a.label}: ${fmtCount(a.total)} connections${inFunnel ? " ★ Funnel" : ""}${isExit ? " ⛔ Exit" : ""}${isSelected ? " (selected)" : ""}`}</title>
                </path>
                {a.end - a.start > 0.12 && (
                  <text x={lx} y={ly} textAnchor={anchor} fill={labelFill} fontSize={9} fontWeight={isSelected || inFunnel ? 700 : 400} style={{ transition: "fill 0.2s" }} transform={`rotate(${rot},${lx},${ly})`}>
                    {isExit ? "⛔ " : inFunnel ? "★ " : ""}{truncLabel(a.label, 18)}
                  </text>
                )}
              </g>
            );
          })}
          {/* Selected label in center */}
          {hasChordFocus && (
            <>
              <text x={cx} y={cy - 8} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={12} fontWeight={700}>{truncLabel(labels[selectedChordIdx], 24)}</text>
              <text x={cx} y={cy + 10} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={10}>{fmtCount(arcs[selectedChordIdx].total)} connections</text>
            </>
          )}
        </svg>
      </div>
    );
  };

  // ---- Transition Heatmap ----
  const renderTransitionHeatmap = () => {
    // Build from→to matrix using unique labels
    const labelSet = new Set<string>();
    for (const n of nodes) labelSet.add(n.label);
    const labels = Array.from(labelSet).sort((a, b) => {
      const va = nodes.find(n => n.label === a)?.value ?? 0;
      const vb = nodes.find(n => n.label === b)?.value ?? 0;
      return vb - va;
    });
    const topLabels = labels.slice(0, 15);
    const idxMap = new Map<string, number>();
    topLabels.forEach((l, i) => idxMap.set(l, i));
    const NL = topLabels.length;
    const matrix: number[][] = Array.from({ length: NL }, () => new Array(NL).fill(0));
    let maxVal = 0;
    for (const l of links) {
      const srcNode = nodes.find(n => n.id === l.source);
      const tgtNode = nodes.find(n => n.id === l.target);
      if (srcNode && tgtNode) {
        const si = idxMap.get(srcNode.label);
        const ti = idxMap.get(tgtNode.label);
        if (si !== undefined && ti !== undefined) {
          matrix[si][ti] += l.value;
          if (matrix[si][ti] > maxVal) maxVal = matrix[si][ti];
        }
      }
    }
    if (maxVal === 0) maxVal = 1;
    const hmPad = { top: 160, left: 180, right: 30, bottom: 40 };
    const cellSize = 52;
    const hmW = hmPad.left + NL * cellSize + hmPad.right;
    const hmH = hmPad.top + NL * cellSize + hmPad.bottom;
    const heatColor = (v: number) => {
      if (v === 0) return "rgba(128,128,128,0.06)";
      const t = v / maxVal;
      if (t < 0.33) return `rgba(69,137,255,${0.2 + t * 1.5})`;
      if (t < 0.66) return `rgba(255,200,0,${0.3 + (t - 0.33) * 1.5})`;
      return `rgba(194,25,48,${0.4 + (t - 0.66) * 1.5})`;
    };

    // Selection: highlight row/col by focusLabel
    const hmSelectedIdx = focusLabel ? (idxMap.get(focusLabel) ?? -1) : -1;
    const hasHmFocus = hmSelectedIdx >= 0;
    const handleHmRowClick = (label: string) => {
      if (focusLabel === label) { setFocusNodeId(null); setFocusLabel(null); }
      else {
        const node = nodes.find(n => n.label === label);
        if (node) { setFocusNodeId(node.id); setFocusLabel(label); }
        else setFocusLabel(label);
      }
    };

    return (
      <div className="uj-table-tile" style={{ padding: 16, overflowX: "auto" }} onClick={() => { setFocusNodeId(null); setFocusLabel(null); }}>
        <svg className="uj-sankey-wipe" width={hmW} height={hmH} style={{ display: "block", margin: "0 auto" }}>
          {/* Row highlight strip */}
          {hasHmFocus && (
            <rect x={hmPad.left} y={hmPad.top + hmSelectedIdx * cellSize - 1} width={NL * cellSize} height={cellSize + 1} rx={2} fill="rgba(69,137,255,0.08)" stroke="rgba(69,137,255,0.3)" strokeWidth={1} />
          )}
          {/* Column highlight strip */}
          {hasHmFocus && (
            <rect x={hmPad.left + hmSelectedIdx * cellSize - 1} y={hmPad.top} width={cellSize + 1} height={NL * cellSize} rx={2} fill="rgba(69,137,255,0.08)" stroke="rgba(69,137,255,0.3)" strokeWidth={1} />
          )}
          {/* Column labels (top, rotated) */}
          {topLabels.map((label, i) => {
            const inFunnel = isFunnelPage(label);
            const isSelected = hasHmFocus && i === hmSelectedIdx;
            return (
              <text key={`col-${i}`} x={hmPad.left + i * cellSize + cellSize / 2} y={hmPad.top - 8} textAnchor="start" fill={isSelected ? "#4589FF" : inFunnel ? "#FFD700" : "rgba(255,255,255,0.6)"} fontSize={11} fontWeight={isSelected || inFunnel ? 700 : 400} style={{ cursor: "pointer" }} transform={`rotate(-45,${hmPad.left + i * cellSize + cellSize / 2},${hmPad.top - 8})`} onClick={(e) => { e.stopPropagation(); handleHmRowClick(label); }}>
                {inFunnel ? "★ " : ""}{truncLabel(label, 24)}
              </text>
            );
          })}
          {/* Row labels (left) */}
          {topLabels.map((label, i) => {
            const inFunnel = isFunnelPage(label);
            const isSelected = hasHmFocus && i === hmSelectedIdx;
            return (
              <text key={`row-${i}`} x={hmPad.left - 8} y={hmPad.top + i * cellSize + cellSize / 2 + 4} textAnchor="end" fill={isSelected ? "#4589FF" : inFunnel ? "#FFD700" : "rgba(255,255,255,0.6)"} fontSize={11} fontWeight={isSelected || inFunnel ? 700 : 400} style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); handleHmRowClick(label); }}>
                {inFunnel ? "★ " : ""}{truncLabel(label, 24)}
              </text>
            );
          })}
          {/* Cells */}
          {topLabels.map((_, ri) => topLabels.map((_, ci) => {
            const val = matrix[ri][ci];
            const isFocusedCell = hasHmFocus && (ri === hmSelectedIdx || ci === hmSelectedIdx);
            const cellOpacity = hasHmFocus ? (isFocusedCell ? 1 : (focusMode ? 0.05 : 0.3)) : 1;
            return (
              <g key={`cell-${ri}-${ci}`} style={{ cursor: "pointer", transition: "opacity 0.2s" }} opacity={cellOpacity} onClick={(e) => { e.stopPropagation(); handleHmRowClick(topLabels[ri]); }}>
                <rect x={hmPad.left + ci * cellSize} y={hmPad.top + ri * cellSize} width={cellSize - 1} height={cellSize - 1} rx={3} fill={heatColor(val)} stroke={isFocusedCell && val > 0 ? "rgba(69,137,255,0.5)" : "rgba(128,128,128,0.1)"} strokeWidth={isFocusedCell && val > 0 ? 1.5 : 0.5}>
                  <title>{`${topLabels[ri]} → ${topLabels[ci]}: ${fmtCount(val)} sessions`}</title>
                </rect>
                {val > 0 && cellSize > 20 && (
                  <text x={hmPad.left + ci * cellSize + cellSize / 2 - 0.5} y={hmPad.top + ri * cellSize + cellSize / 2 + 4} textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize={11} fontWeight={600}>{val >= 1000 ? fmtCount(val) : val}</text>
                )}
              </g>
            );
          }))}
          {/* Axis labels */}
          <text x={hmPad.left + (NL * cellSize) / 2} y={14} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize={12} fontWeight={600}>To Page →</text>
          <text x={14} y={hmPad.top + (NL * cellSize) / 2} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize={12} fontWeight={600} transform={`rotate(-90,14,${hmPad.top + (NL * cellSize) / 2})`}>From Page →</text>
          {/* Legend */}
          <text x={hmPad.left} y={hmH - 8} fill="rgba(255,255,255,0.3)" fontSize={10}>Low</text>
          <rect x={hmPad.left + 28} y={hmH - 18} width={24} height={12} rx={3} fill="rgba(69,137,255,0.5)" />
          <rect x={hmPad.left + 56} y={hmH - 18} width={24} height={12} rx={3} fill="rgba(255,200,0,0.6)" />
          <rect x={hmPad.left + 84} y={hmH - 18} width={24} height={12} rx={3} fill="rgba(194,25,48,0.7)" />
          <text x={hmPad.left + 114} y={hmH - 8} fill="rgba(255,255,255,0.3)" fontSize={10}>High</text>
          {/* Selection summary */}
          {hasHmFocus && (
            <>
              <text x={hmPad.left + 160} y={hmH - 8} fill="rgba(69,137,255,0.7)" fontSize={10} fontWeight={600}>Selected: {truncLabel(topLabels[hmSelectedIdx], 20)}</text>
              <text x={hmPad.left + 160} y={hmH + 6} fill="rgba(255,255,255,0.4)" fontSize={9}>
                Outbound: {fmtCount(matrix[hmSelectedIdx].reduce((a, b) => a + b, 0))} | Inbound: {fmtCount(matrix.reduce((a, row) => a + row[hmSelectedIdx], 0))}
              </text>
            </>
          )}
        </svg>
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
      case "chord": return renderChordDiagram();
      case "heatmap": return renderTransitionHeatmap();
      case "classic":
      default: return renderClassicSankey(false);
    }
  };

  // ---- Sub-tab definitions ----
  const SUB_TABS: { key: typeof sankeySubTab; label: string; icon: string; show?: boolean }[] = [
    { key: "flow", label: "Flow Chart", icon: "📊" },
    { key: "convPaths", label: "Conversion Paths", icon: "🔀" },
    { key: "loops", label: "Loop Analysis", icon: "🔄" },
    { key: "timing", label: "Page Timing", icon: "⏱" },
    { key: "endpoints", label: "Session Endpoints", icon: "🛑" },
    { key: "revPaths", label: "Revenue Paths", icon: "💰", show: aov > 0 },
    { key: "pathTrends", label: "Path Trends", icon: "📈" },
    { key: "leakage", label: "Funnel Leakage", icon: "🔍" },
    { key: "velocity", label: "Funnel Velocity", icon: "⚡" },
  ];

  const subTabBar = (
    <Flex gap={4} flexWrap="wrap" style={{ padding: "4px 0" }}>
      {SUB_TABS.filter(t => t.show !== false).map(t => (
        <button key={t.key} onClick={() => setSankeySubTab(t.key)} style={{
          padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: sankeySubTab === t.key ? 700 : 400, cursor: "pointer",
          background: sankeySubTab === t.key ? "rgba(69,137,255,0.15)" : "rgba(128,128,128,0.06)",
          border: sankeySubTab === t.key ? "1px solid rgba(69,137,255,0.4)" : "1px solid rgba(128,128,128,0.15)",
          color: sankeySubTab === t.key ? BLUE : "inherit", transition: "all 0.15s",
        }}>{t.icon} {t.label}</button>
      ))}
    </Flex>
  );

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      {aiPanel}
      {chartHeader}
      {subTabBar}

      {/* ==== FLOW CHART sub-tab ==== */}
      {sankeySubTab === "flow" && (
        <>
          {renderChart()}

          {observations.length > 0 && (
            <>
              <SectionHeader title="Key Observations" />
              <div className="uj-table-tile" style={{ padding: 16 }}>
                <Flex flexDirection="column" gap={8}>
                  {observations.map((o, i) => (
                    <Flex key={i} gap={8} alignItems="flex-start" style={{ padding: "6px 10px", background: o.severity === "critical" ? "rgba(194,25,48,0.06)" : o.severity === "warning" ? "rgba(255,131,43,0.06)" : "rgba(128,128,128,0.04)", borderRadius: 6, borderLeft: `3px solid ${o.severity === "critical" ? RED : o.severity === "warning" ? ORANGE : GREEN}` }}>
                      <Text style={{ fontSize: 14, flexShrink: 0 }}>{o.icon}</Text>
                      <Text style={{ fontSize: 13 }}>{o.text}</Text>
                    </Flex>
                  ))}
                </Flex>
              </div>
            </>
          )}

          {recommendations.length > 0 && (
            <>
              <SectionHeader title="Recommendations" />
              <div className="uj-table-tile" style={{ padding: 16 }}>
                <Flex flexDirection="column" gap={6}>
                  {recommendations.map((r, i) => (
                    <Flex key={i} gap={8} alignItems="center" style={{ padding: "6px 10px", background: "rgba(128,128,128,0.04)", borderRadius: 6 }}>
                      <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 3, fontWeight: 700, background: r.impact === "high" ? "rgba(194,25,48,0.12)" : r.impact === "medium" ? "rgba(255,131,43,0.12)" : "rgba(128,128,128,0.1)", color: r.impact === "high" ? RED : r.impact === "medium" ? ORANGE : "inherit" }}>{r.impact.toUpperCase()}</span>
                      <Text style={{ fontSize: 13 }}>{r.text}</Text>
                    </Flex>
                  ))}
                </Flex>
              </div>
            </>
          )}

          {pathAnalysis.sortedExits.length > 0 && (
            <>
              <SectionHeader title="Funnel Exit Analysis" />
              <Flex gap={16} flexWrap="wrap">
                <div className="uj-kpi-card"><Text className="uj-kpi-label">Sessions Analyzed</Text><Heading level={2} className="uj-kpi-value" style={{ color: BLUE }}>{fmtCount(pathAnalysis.totalPaths)}</Heading></div>
                <div className="uj-kpi-card"><Text className="uj-kpi-label">Funnel Completions</Text><Heading level={2} className="uj-kpi-value" style={{ color: GREEN }}>{fmtCount(pathAnalysis.funnelCompletions)}</Heading></div>
                <div className="uj-kpi-card"><Text className="uj-kpi-label">Funnel Exits</Text><Heading level={2} className="uj-kpi-value" style={{ color: RED }}>{fmtCount(pathAnalysis.funnelExits)}</Heading></div>
                <div className="uj-kpi-card"><Text className="uj-kpi-label">Return After Exit</Text><Heading level={2} className="uj-kpi-value" style={{ color: pathAnalysis.funnelExits > 0 && (pathAnalysis.returnsAfterExit / pathAnalysis.funnelExits) < 0.3 ? RED : YELLOW }}>{fmtCount(pathAnalysis.returnsAfterExit)} ({fmtPct(pathAnalysis.funnelExits > 0 ? (pathAnalysis.returnsAfterExit / pathAnalysis.funnelExits) * 100 : 0)})</Heading></div>
                {aov > 0 && <div className="uj-kpi-card"><Text className="uj-kpi-label">Est. Lost Revenue</Text><Heading level={2} className="uj-kpi-value" style={{ color: RED }}>{fmtCurrency((pathAnalysis.funnelExits - pathAnalysis.returnsAfterExit) * aov * 0.5)}</Heading></div>}
              </Flex>
              <div className="uj-table-tile"><DataTable sortable resizable fullWidth data={pathAnalysis.sortedExits.slice(0, 15).map(e => ({ "Exit Page": e.page.substring(0, 40), Exits: e.exits, Returns: e.returns, "Return Rate": e.exits > 0 ? (e.returns / e.exits) * 100 : 0, "Non-Returning": e.exits - e.returns, "Lost Revenue": aov > 0 ? (e.exits - e.returns) * aov * 0.5 : 0, "Top Destination": e.nextPagesList[0]?.[0]?.substring(0, 30) ?? "—" }))} columns={[ { id: "Exit Page", header: "Exit Page", accessor: "Exit Page", cell: ({ value }: any) => <Strong style={{ color: RED }}>{value}</Strong> }, { id: "Exits", header: "Exits", accessor: "Exits", sortType: "number" as any, cell: ({ value }: any) => <Strong>{fmtCount(value)}</Strong> }, { id: "Returns", header: "Returns", accessor: "Returns", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: GREEN }}>{fmtCount(value)}</Text> }, { id: "Return Rate", header: "Return %", accessor: "Return Rate", sortType: "number" as any, cell: ({ value }: any) => <span style={{ color: value < 20 ? RED : value < 50 ? YELLOW : GREEN, fontWeight: 600 }}>{fmtPct(value)}</span> }, { id: "Non-Returning", header: "Lost Users", accessor: "Non-Returning", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: RED }}>{fmtCount(value)}</Strong> }, ...(aov > 0 ? [{ id: "Lost Revenue", header: "Est. Lost Revenue", accessor: "Lost Revenue", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: RED }}>{fmtCurrency(value)}</Strong> }] : []), { id: "Top Destination", header: "Where They Go", accessor: "Top Destination", cell: ({ value }: any) => <Text style={{ color: ORANGE }}>{value}</Text> } ]} /></div>
            </>
          )}

          {pathAnalysis.sortedOffFunnel.length > 0 && (
            <>
              <SectionHeader title="Off-Funnel Destinations" />
              <div className="uj-table-tile" style={{ padding: 16 }}>
                <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8, display: "block" }}>Pages users navigate to after leaving the defined funnel flow</Text>
                <Flex gap={8} flexWrap="wrap">
                  {pathAnalysis.sortedOffFunnel.map(([page, count], i) => (
                    <a key={i} href={appEntityId ? vitalsUrl(appEntityId, page) : "#"} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, background: "rgba(255,131,43,0.08)", border: "1px solid rgba(255,131,43,0.2)", color: "inherit", textDecoration: "none" }}>
                      {truncLabel(page, 30)} <Strong style={{ color: ORANGE }}>{fmtCount(count)}</Strong>
                    </a>
                  ))}
                </Flex>
              </div>
            </>
          )}

          <SectionHeader title="Page Health Scorecard" />
          <div className="uj-table-tile"><DataTable sortable resizable fullWidth data={pageHealth.slice(0, 20).map(p => ({ Page: p.label.substring(0, 40), Funnel: p.isFunnel ? "★ Yes" : "No", Health: p.healthScore, Sessions: p.sessions, "LCP (ms)": p.lcp > 0 ? Math.round(p.lcp) : null, CLS: p.cls > 0 ? p.cls : null, "INP (ms)": p.inp > 0 ? Math.round(p.inp) : null, Errors: `${p.errors}\t${p.label}`, Issues: p.issues.join(", ") || "None" }))} columns={[ { id: "Page", header: "Page", accessor: "Page", cell: ({ value }: any) => <Strong>{value}</Strong> }, { id: "Funnel", header: "Funnel", accessor: "Funnel", cell: ({ value }: any) => <Text style={{ color: value === "★ Yes" ? "#FFD700" : "inherit", fontWeight: value === "★ Yes" ? 700 : 400 }}>{value}</Text> }, { id: "Health", header: "Health", accessor: "Health", sortType: "number" as any, cell: ({ value }: any) => <span style={{ display: "inline-block", width: "100%", padding: "2px 8px", borderRadius: 4, background: value >= 70 ? "rgba(13,156,41,0.15)" : value >= 40 ? "rgba(184,134,11,0.15)" : "rgba(194,25,48,0.15)", color: value >= 70 ? GREEN : value >= 40 ? YELLOW : RED, fontWeight: 700, textAlign: "center" }}>{value}/100</span> }, { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> }, { id: "LCP (ms)", header: "LCP", accessor: "LCP (ms)", sortType: "number" as any, cell: ({ value }: any) => value != null ? <span style={{ color: cwvClr(value, "lcp"), fontWeight: 600 }}>{value}ms</span> : <Text style={{ opacity: 0.3 }}>—</Text> }, { id: "CLS", header: "CLS", accessor: "CLS", sortType: "number" as any, cell: ({ value }: any) => value != null ? <span style={{ color: cwvClr(value, "cls"), fontWeight: 600 }}>{value.toFixed(3)}</span> : <Text style={{ opacity: 0.3 }}>—</Text> }, { id: "INP (ms)", header: "INP", accessor: "INP (ms)", sortType: "number" as any, cell: ({ value }: any) => value != null ? <span style={{ color: cwvClr(value, "inp"), fontWeight: 600 }}>{value}ms</span> : <Text style={{ opacity: 0.3 }}>—</Text> }, { id: "Errors", header: "Errors", accessor: "Errors", cell: ({ value }: any) => { const [cnt, pg] = String(value).split("\t"); const n = Number(cnt); return n > 0 ? <a href={`${ENV_URL}/ui/apps/dynatrace.error.inspector/explorer?tf=now-2h%3Bnow&sort=affected_users%3Adescending&perspective=impact#filtering=${encodeURIComponent(`"Frontend" = "${frontend}" "(Web) Page Name" = "${pg}"`)}`} target="_blank" rel="noopener noreferrer" style={{ color: RED, fontWeight: 700, textDecoration: "none" }} onMouseEnter={(e: any) => (e.currentTarget.style.textDecoration = "underline")} onMouseLeave={(e: any) => (e.currentTarget.style.textDecoration = "none")} title="Open in Error Inspector">{fmtCount(n)}</a> : <Text style={{ opacity: 0.3 }}>0</Text>; } }, { id: "Issues", header: "Issues", accessor: "Issues", cell: ({ value }: any) => <Text style={{ fontSize: 11, color: value === "None" ? GREEN : RED }}>{value}</Text> } ]} /></div>

          <SectionHeader title="Top Transitions" />
          <div className="uj-table-tile"><DataTable sortable resizable fullWidth data={links.slice(0, 30).map((l) => { const srcNode = nodes.find(n => n.id === l.source)!; const tgtNode = nodes.find(n => n.id === l.target)!; return { From: srcNode.label.substring(0, 40), To: tgtNode.label.substring(0, 40), Sessions: l.value, "% of Total": totalSessions > 0 ? (l.value / totalSessions) * 100 : 0 }; })} columns={[ { id: "From", header: "From", accessor: "From", cell: ({ value }: any) => <Strong style={{ color: BLUE }}>{value}</Strong> }, { id: "To", header: "To", accessor: "To", cell: ({ value }: any) => <Text>{value}</Text> }, { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Strong>{fmtCount(value)}</Strong> }, { id: "% of Total", header: "% of Total", accessor: "% of Total", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtPct(value)}</Text> } ]} /></div>
        </>
      )}

      {/* ==== CONVERSION PATHS sub-tab ==== */}
      {sankeySubTab === "convPaths" && (
        <>
          <Flex gap={16} flexWrap="wrap">
            <div className="uj-kpi-card"><Text className="uj-kpi-label">Total Sessions</Text><Heading level={2} className="uj-kpi-value" style={{ color: BLUE }}>{fmtCount(conversionPaths.converted.length + conversionPaths.abandoned.length)}</Heading></div>
            <div className="uj-kpi-card"><Text className="uj-kpi-label">Converted</Text><Heading level={2} className="uj-kpi-value" style={{ color: GREEN }}>{fmtCount(conversionPaths.converted.length)}</Heading></div>
            <div className="uj-kpi-card"><Text className="uj-kpi-label">Abandoned</Text><Heading level={2} className="uj-kpi-value" style={{ color: RED }}>{fmtCount(conversionPaths.abandoned.length)}</Heading></div>
            <div className="uj-kpi-card"><Text className="uj-kpi-label">Conversion Rate</Text><Heading level={2} className="uj-kpi-value" style={{ color: conversionPaths.convRate >= 20 ? GREEN : conversionPaths.convRate >= 10 ? YELLOW : RED }}>{fmtPct(conversionPaths.convRate)}</Heading></div>
            <div className="uj-kpi-card"><Text className="uj-kpi-label">Avg Path (Conv)</Text><Heading level={2} className="uj-kpi-value">{conversionPaths.avgConvLen.toFixed(1)} pages</Heading></div>
            <div className="uj-kpi-card"><Text className="uj-kpi-label">Avg Path (Aband)</Text><Heading level={2} className="uj-kpi-value">{conversionPaths.avgAbandLen.toFixed(1)} pages</Heading></div>
          </Flex>

          <SectionHeader title="Path Differentiators — Pages that distinguish converted from abandoned" />
          <div className="uj-table-tile"><DataTable sortable resizable fullWidth data={conversionPaths.differentiators.map(d => ({ Page: d.page.substring(0, 40), "Converted %": d.convPct, "Abandoned %": d.abandPct, "Diff (pp)": d.diff }))} columns={[ { id: "Page", header: "Page", accessor: "Page", cell: ({ value }: any) => <Strong>{value}</Strong> }, { id: "Converted %", header: "In Converted", accessor: "Converted %", sortType: "number" as any, cell: ({ value }: any) => <span style={{ color: GREEN, fontWeight: 600 }}>{fmtPct(value)}</span> }, { id: "Abandoned %", header: "In Abandoned", accessor: "Abandoned %", sortType: "number" as any, cell: ({ value }: any) => <span style={{ color: RED, fontWeight: 600 }}>{fmtPct(value)}</span> }, { id: "Diff (pp)", header: "Difference", accessor: "Diff (pp)", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 0 ? RED : value < 0 ? GREEN : "inherit" }}>{value > 0 ? "+" : ""}{value.toFixed(1)}pp</Strong> } ]} /></div>

          <Flex gap={20}>
            <div style={{ flex: 1 }}>
              <SectionHeader title="Top Converted Transitions" />
              <div className="uj-table-tile"><DataTable sortable resizable fullWidth data={conversionPaths.topConvTransitions.map(([t, c]) => ({ Transition: t, Sessions: c }))} columns={[ { id: "Transition", header: "Transition", accessor: "Transition", cell: ({ value }: any) => <Text style={{ fontSize: 12 }}>{value}</Text> }, { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: GREEN }}>{fmtCount(value)}</Strong> } ]} /></div>
            </div>
            <div style={{ flex: 1 }}>
              <SectionHeader title="Top Abandoned Transitions" />
              <div className="uj-table-tile"><DataTable sortable resizable fullWidth data={conversionPaths.topAbandTransitions.map(([t, c]) => ({ Transition: t, Sessions: c }))} columns={[ { id: "Transition", header: "Transition", accessor: "Transition", cell: ({ value }: any) => <Text style={{ fontSize: 12 }}>{value}</Text> }, { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: RED }}>{fmtCount(value)}</Strong> } ]} /></div>
            </div>
          </Flex>
        </>
      )}

      {/* ==== LOOP ANALYSIS sub-tab ==== */}
      {sankeySubTab === "loops" && (
        <>
          <Flex gap={16} flexWrap="wrap">
            <div className="uj-kpi-card"><Text className="uj-kpi-label">Sessions with Loops</Text><Heading level={2} className="uj-kpi-value" style={{ color: loopAnalysis.loopRate > 20 ? RED : loopAnalysis.loopRate > 10 ? YELLOW : GREEN }}>{fmtCount(loopAnalysis.sessionsWithLoops)}</Heading></div>
            <div className="uj-kpi-card"><Text className="uj-kpi-label">Loop Rate</Text><Heading level={2} className="uj-kpi-value" style={{ color: loopAnalysis.loopRate > 20 ? RED : loopAnalysis.loopRate > 10 ? YELLOW : GREEN }}>{fmtPct(loopAnalysis.loopRate)}</Heading></div>
            <div className="uj-kpi-card"><Text className="uj-kpi-label">Unique Loop Pairs</Text><Heading level={2} className="uj-kpi-value">{loopAnalysis.loops.length}</Heading></div>
          </Flex>
          {loopAnalysis.loops.length > 0 ? (
            <>
              <SectionHeader title="Back-and-Forth Navigation Patterns (A → B → A)" />
              <div className="uj-table-tile"><DataTable sortable resizable fullWidth data={loopAnalysis.loops.slice(0, 15).map(l => ({ Loop: l.pair, Occurrences: l.count, "Page A Errors": errorMap.get(l.pageA)?.errorCount ?? 0, "Page B Errors": errorMap.get(l.pageB)?.errorCount ?? 0, "Page A LCP": Math.round(cwvMap.get(l.pageA)?.lcp ?? 0), "Page B LCP": Math.round(cwvMap.get(l.pageB)?.lcp ?? 0) }))} columns={[ { id: "Loop", header: "Loop Pattern", accessor: "Loop", cell: ({ value }: any) => <Strong>{value}</Strong> }, { id: "Occurrences", header: "Count", accessor: "Occurrences", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 10 ? RED : YELLOW }}>{fmtCount(value)}</Strong> }, { id: "Page A Errors", header: "Page A Errors", accessor: "Page A Errors", sortType: "number" as any, cell: ({ value }: any) => value > 0 ? <Strong style={{ color: RED }}>{fmtCount(value)}</Strong> : <Text style={{ opacity: 0.3 }}>0</Text> }, { id: "Page B Errors", header: "Page B Errors", accessor: "Page B Errors", sortType: "number" as any, cell: ({ value }: any) => value > 0 ? <Strong style={{ color: RED }}>{fmtCount(value)}</Strong> : <Text style={{ opacity: 0.3 }}>0</Text> }, { id: "Page A LCP", header: "Page A LCP", accessor: "Page A LCP", sortType: "number" as any, cell: ({ value }: any) => value > 0 ? <span style={{ color: cwvClr(value, "lcp"), fontWeight: 600 }}>{value}ms</span> : <Text style={{ opacity: 0.3 }}>—</Text> }, { id: "Page B LCP", header: "Page B LCP", accessor: "Page B LCP", sortType: "number" as any, cell: ({ value }: any) => value > 0 ? <span style={{ color: cwvClr(value, "lcp"), fontWeight: 600 }}>{value}ms</span> : <Text style={{ opacity: 0.3 }}>—</Text> } ]} /></div>
              <div className="uj-table-tile" style={{ padding: 16 }}>
                <Text style={{ fontSize: 13, opacity: 0.7 }}>💡 Back-and-forth navigation often indicates user confusion, slow page loads causing retries, or errors forcing users to go back. Check the error and LCP columns — high errors or poor LCP on either page strongly correlates with looping behavior.</Text>
              </div>
            </>
          ) : (
            <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>No back-and-forth navigation loops detected in current data.</Text></div>
          )}
        </>
      )}

      {/* ==== PAGE TIMING sub-tab ==== */}
      {sankeySubTab === "timing" && (
        <>
          <SectionHeader title="Average Duration per Page" />
          <div className="uj-table-tile"><DataTable sortable resizable fullWidth data={Array.from(durationMap.entries()).sort((a, b) => b[1].sessions - a[1].sessions).slice(0, 20).map(([page, d]) => ({ Page: page.substring(0, 40), "Avg (ms)": Math.round(d.avgDuration), "P90 (ms)": Math.round(d.p90Duration), Sessions: d.sessions, Funnel: isFunnelPage(page) ? "★ Yes" : "No", "Health": pageHealth.find(p => p.label === page)?.healthScore ?? "—", Errors: errorMap.get(page)?.errorCount ?? 0 }))} columns={[ { id: "Page", header: "Page", accessor: "Page", cell: ({ value }: any) => <Strong>{value}</Strong> }, { id: "Avg (ms)", header: "Avg Duration", accessor: "Avg (ms)", sortType: "number" as any, cell: ({ value }: any) => <span style={{ color: value > 4000 ? RED : value > 2000 ? YELLOW : GREEN, fontWeight: 600 }}>{fmtCount(value)}ms</span> }, { id: "P90 (ms)", header: "P90 Duration", accessor: "P90 (ms)", sortType: "number" as any, cell: ({ value }: any) => <span style={{ color: value > 8000 ? RED : value > 4000 ? YELLOW : GREEN, fontWeight: 600 }}>{fmtCount(value)}ms</span> }, { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> }, { id: "Funnel", header: "Funnel", accessor: "Funnel", cell: ({ value }: any) => <Text style={{ color: value === "★ Yes" ? "#FFD700" : "inherit", fontWeight: value === "★ Yes" ? 700 : 400 }}>{value}</Text> }, { id: "Health", header: "Health", accessor: "Health", cell: ({ value }: any) => typeof value === "number" ? <span style={{ color: value >= 70 ? GREEN : value >= 40 ? YELLOW : RED, fontWeight: 600 }}>{value}/100</span> : <Text style={{ opacity: 0.3 }}>—</Text> }, { id: "Errors", header: "Errors", accessor: "Errors", sortType: "number" as any, cell: ({ value }: any) => value > 0 ? <Strong style={{ color: RED }}>{fmtCount(value)}</Strong> : <Text style={{ opacity: 0.3 }}>0</Text> } ]} /></div>
          <div className="uj-table-tile" style={{ padding: 16 }}>
            <Text style={{ fontSize: 13, opacity: 0.7 }}>💡 Slow pages in the funnel are conversion bottlenecks — users abandon slow pages before completing the next step. Pages with high P90 indicate inconsistent performance affecting a subset of users. Cross-reference with errors: slow + high errors = likely infrastructure issue.</Text>
          </div>
        </>
      )}

      {/* ==== SESSION ENDPOINTS sub-tab ==== */}
      {sankeySubTab === "endpoints" && (
        <>
          <Flex gap={16} flexWrap="wrap">
            <div className="uj-kpi-card"><Text className="uj-kpi-label">Bounce Rate</Text><Heading level={2} className="uj-kpi-value" style={{ color: endpointAnalysis.bounceRate > 30 ? RED : endpointAnalysis.bounceRate > 15 ? YELLOW : GREEN }}>{fmtPct(endpointAnalysis.bounceRate)}</Heading></div>
            <div className="uj-kpi-card"><Text className="uj-kpi-label">Total Sessions</Text><Heading level={2} className="uj-kpi-value" style={{ color: BLUE }}>{fmtCount(endpointAnalysis.totalSessions)}</Heading></div>
          </Flex>

          <SectionHeader title="Where Sessions End — Pages where users close the browser" />
          <div className="uj-table-tile"><DataTable sortable resizable fullWidth data={endpointAnalysis.terminals.slice(0, 15).map(t => ({ Page: t.page.substring(0, 40), "Sessions Ending": t.count, "% of Total": endpointAnalysis.totalSessions > 0 ? (t.count / endpointAnalysis.totalSessions) * 100 : 0, "Avg Path Len": t.avgPathLen, Funnel: t.isFunnel ? "★ Yes" : "No", Errors: t.errors, LCP: t.lcp > 0 ? Math.round(t.lcp) : null }))} columns={[ { id: "Page", header: "Terminal Page", accessor: "Page", cell: ({ value }: any) => <Strong>{value}</Strong> }, { id: "Sessions Ending", header: "Sessions Ending", accessor: "Sessions Ending", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: RED }}>{fmtCount(value)}</Strong> }, { id: "% of Total", header: "% of Total", accessor: "% of Total", sortType: "number" as any, cell: ({ value }: any) => <span style={{ fontWeight: 600 }}>{fmtPct(value)}</span> }, { id: "Avg Path Len", header: "Avg Path Len", accessor: "Avg Path Len", sortType: "number" as any, cell: ({ value }: any) => <Text>{value} pages</Text> }, { id: "Funnel", header: "Funnel", accessor: "Funnel", cell: ({ value }: any) => <Text style={{ color: value === "★ Yes" ? "#FFD700" : "inherit", fontWeight: value === "★ Yes" ? 700 : 400 }}>{value}</Text> }, { id: "Errors", header: "Errors", accessor: "Errors", sortType: "number" as any, cell: ({ value }: any) => value > 0 ? <Strong style={{ color: RED }}>{fmtCount(value)}</Strong> : <Text style={{ opacity: 0.3 }}>0</Text> }, { id: "LCP", header: "LCP", accessor: "LCP", sortType: "number" as any, cell: ({ value }: any) => value != null ? <span style={{ color: cwvClr(value, "lcp"), fontWeight: 600 }}>{value}ms</span> : <Text style={{ opacity: 0.3 }}>—</Text> } ]} /></div>

          {endpointAnalysis.bouncePages.length > 0 && (
            <>
              <SectionHeader title="Bounce Pages — Sessions ending after ≤2 pages" />
              <div className="uj-table-tile" style={{ padding: 16 }}>
                <Flex gap={8} flexWrap="wrap">
                  {endpointAnalysis.bouncePages.map(([page, count], i) => (
                    <span key={i} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, background: "rgba(194,25,48,0.08)", border: "1px solid rgba(194,25,48,0.15)" }}>
                      {truncLabel(page, 30)} <Strong style={{ color: RED }}>{fmtCount(count)}</Strong>
                    </span>
                  ))}
                </Flex>
              </div>
            </>
          )}
          <div className="uj-table-tile" style={{ padding: 16 }}>
            <Text style={{ fontSize: 13, opacity: 0.7 }}>💡 Terminal pages are where sessions end (user closes browser). If funnel pages appear here, users are giving up mid-flow. Short average path length on terminal pages suggests quick abandonment. High errors on terminal pages may be the root cause of session termination.</Text>
          </div>
        </>
      )}

      {/* ==== REVENUE PATHS sub-tab ==== */}
      {sankeySubTab === "revPaths" && revenuePaths && (
        <>
          <Flex gap={16} flexWrap="wrap">
            <div className="uj-kpi-card"><Text className="uj-kpi-label">Conversions</Text><Heading level={2} className="uj-kpi-value" style={{ color: GREEN }}>{fmtCount(revenuePaths.totalConversions)}</Heading></div>
            <div className="uj-kpi-card"><Text className="uj-kpi-label">Total Revenue</Text><Heading level={2} className="uj-kpi-value" style={{ color: GREEN }}>{fmtCurrency(revenuePaths.totalRevenue)}</Heading></div>
            <div className="uj-kpi-card"><Text className="uj-kpi-label">AOV</Text><Heading level={2} className="uj-kpi-value">{fmtCurrency(aov)}</Heading></div>
          </Flex>

          <SectionHeader title="Top Revenue-Generating Paths" />
          <div className="uj-table-tile"><DataTable sortable resizable fullWidth defaultColumnSizing={{ Path: 700 }} data={revenuePaths.topPaths.map(p => ({ Path: p.path, Conversions: p.count, Revenue: p.revenue, "% of Conv": p.pctOfConversions }))} columns={[ { id: "Path", header: "Navigation Path", accessor: "Path", cell: ({ value }: any) => <Text style={{ fontSize: 11, whiteSpace: "normal", wordBreak: "break-word" }}>{value}</Text> }, { id: "Conversions", header: "Conversions", accessor: "Conversions", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: GREEN }}>{fmtCount(value)}</Strong> }, { id: "Revenue", header: "Revenue", accessor: "Revenue", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: GREEN }}>{fmtCurrency(value)}</Strong> }, { id: "% of Conv", header: "% of Conv", accessor: "% of Conv", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtPct(value)}</Text> } ]} /></div>

          <SectionHeader title="Revenue by Page — Pages touched during converting sessions" />
          <div className="uj-table-tile"><DataTable sortable resizable fullWidth defaultColumnSizing={{ Page: 400 }} data={revenuePaths.pageRevenue.map(p => ({ Page: p.page.substring(0, 40), "Touch Rate": p.touchRate, Conversions: p.conversions, Revenue: p.revenue }))} columns={[ { id: "Page", header: "Page", accessor: "Page", cell: ({ value }: any) => <Strong>{value}</Strong> }, { id: "Touch Rate", header: "Touch Rate", accessor: "Touch Rate", sortType: "number" as any, cell: ({ value }: any) => <span style={{ fontWeight: 600, color: value >= 50 ? GREEN : YELLOW }}>{fmtPct(value)}</span> }, { id: "Conversions", header: "Conversions", accessor: "Conversions", sortType: "number" as any, cell: ({ value }: any) => <Strong>{fmtCount(value)}</Strong> }, { id: "Revenue", header: "Revenue", accessor: "Revenue", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: GREEN }}>{fmtCurrency(value)}</Strong> } ]} /></div>
        </>
      )}
      {sankeySubTab === "revPaths" && !revenuePaths && (
        <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>Set Average Order Value (AOV) in Settings to enable Revenue Paths analysis.</Text></div>
      )}

      {/* ==== PATH TRENDS sub-tab ==== */}
      {sankeySubTab === "pathTrends" && (
        <>
          {pathTrends ? (
            <>
              <Flex gap={16} flexWrap="wrap">
                <div className="uj-kpi-card"><Text className="uj-kpi-label">Current Sessions</Text><Heading level={2} className="uj-kpi-value" style={{ color: BLUE }}>{fmtCount(pathTrends.currSessions)}</Heading></div>
                <div className="uj-kpi-card"><Text className="uj-kpi-label">Previous Sessions</Text><Heading level={2} className="uj-kpi-value" style={{ color: "inherit" }}>{fmtCount(pathTrends.prevSessions)}</Heading></div>
                <div className="uj-kpi-card"><Text className="uj-kpi-label">Avg Path (Current)</Text><Heading level={2} className="uj-kpi-value">{pathTrends.currAvgLen.toFixed(1)} pages</Heading></div>
                <div className="uj-kpi-card"><Text className="uj-kpi-label">Avg Path (Previous)</Text><Heading level={2} className="uj-kpi-value">{pathTrends.prevAvgLen.toFixed(1)} pages</Heading></div>
              </Flex>

              {pathTrends.newPages.length > 0 && (
                <div className="uj-table-tile" style={{ padding: 12 }}>
                  <Text style={{ fontSize: 12, fontWeight: 700, color: GREEN, marginBottom: 6, display: "block" }}>🆕 New Pages (not seen in previous period):</Text>
                  <Flex gap={6} flexWrap="wrap">{pathTrends.newPages.slice(0, 10).map((pg, i) => <span key={i} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, background: "rgba(13,156,41,0.08)", border: "1px solid rgba(13,156,41,0.2)" }}>{pg}</span>)}</Flex>
                </div>
              )}
              {pathTrends.droppedPages.length > 0 && (
                <div className="uj-table-tile" style={{ padding: 12 }}>
                  <Text style={{ fontSize: 12, fontWeight: 700, color: RED, marginBottom: 6, display: "block" }}>❌ Dropped Pages (no longer visited):</Text>
                  <Flex gap={6} flexWrap="wrap">{pathTrends.droppedPages.slice(0, 10).map((pg, i) => <span key={i} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, background: "rgba(194,25,48,0.08)", border: "1px solid rgba(194,25,48,0.2)" }}>{pg}</span>)}</Flex>
                </div>
              )}

              <SectionHeader title="Page Frequency Changes — Biggest shifts in navigation patterns" />
              <div className="uj-table-tile"><DataTable sortable resizable fullWidth data={pathTrends.pageTrends.map(t => ({ Page: t.page.substring(0, 40), "Current %": t.currPct, "Previous %": t.prevPct, "Change (pp)": t.delta, "Current Count": t.currCount, "Previous Count": t.prevCount }))} columns={[ { id: "Page", header: "Page", accessor: "Page", cell: ({ value }: any) => <Strong>{value}</Strong> }, { id: "Current %", header: "Current %", accessor: "Current %", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtPct(value)}</Text> }, { id: "Previous %", header: "Previous %", accessor: "Previous %", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ opacity: 0.5 }}>{fmtPct(value)}</Text> }, { id: "Change (pp)", header: "Change", accessor: "Change (pp)", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: Math.abs(value) > 5 ? (value > 0 ? ORANGE : GREEN) : "inherit" }}>{value > 0 ? "▲" : value < 0 ? "▼" : "—"} {Math.abs(value).toFixed(1)}pp</Strong> }, { id: "Current Count", header: "Curr #", accessor: "Current Count", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> }, { id: "Previous Count", header: "Prev #", accessor: "Previous Count", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ opacity: 0.5 }}>{fmtCount(value)}</Text> } ]} /></div>

              <SectionHeader title="Transition Changes — Biggest shifts in page-to-page navigation" />
              <div className="uj-table-tile"><DataTable sortable resizable fullWidth data={pathTrends.transitionTrends.map(t => ({ Transition: t.transition.length > 60 ? t.transition.substring(0, 60) + "…" : t.transition, Current: t.currCount, Previous: t.prevCount, Change: t.delta }))} columns={[ { id: "Transition", header: "Transition", accessor: "Transition", cell: ({ value }: any) => <Text style={{ fontSize: 12 }}>{value}</Text> }, { id: "Current", header: "Current", accessor: "Current", sortType: "number" as any, cell: ({ value }: any) => <Strong>{fmtCount(value)}</Strong> }, { id: "Previous", header: "Previous", accessor: "Previous", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ opacity: 0.5 }}>{fmtCount(value)}</Text> }, { id: "Change", header: "Change", accessor: "Change", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: Math.abs(value) > 3 ? (value > 0 ? ORANGE : GREEN) : "inherit" }}>{value > 0 ? "+" : ""}{fmtCount(value)}</Strong> } ]} /></div>
            </>
          ) : (
            <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>No previous period data available for comparison. Path trend analysis requires data from both current and previous periods.</Text></div>
          )}
        </>
      )}

      {/* ==== FUNNEL LEAKAGE sub-tab ==== */}
      {sankeySubTab === "leakage" && (
        <>
          {/* Insights banner */}
          {leakageAnalysis.insights.length > 0 && (
            <div className="uj-table-tile" style={{ padding: 14 }}>
              {leakageAnalysis.insights.map((ins, i) => (
                <div key={i} style={{ padding: "4px 0", fontSize: 13, opacity: ins.severity === "info" ? 0.7 : 1, color: ins.severity === "critical" ? RED : ins.severity === "warning" ? YELLOW : "inherit" }}>
                  {ins.icon} {ins.text}
                </div>
              ))}
            </div>
          )}

          {/* KPIs */}
          <Flex gap={16} flexWrap="wrap">
            <div className="uj-kpi-card"><Text className="uj-kpi-label">Total Sessions</Text><Heading level={2} className="uj-kpi-value" style={{ color: BLUE }}>{fmtCount(leakageAnalysis.sessions)}</Heading></div>
            <div className="uj-kpi-card"><Text className="uj-kpi-label">Left Funnel</Text><Heading level={2} className="uj-kpi-value" style={{ color: RED }}>{fmtCount(leakageAnalysis.leavers)} ({fmtPct(leakageAnalysis.leakageRate)})</Heading></div>
            <div className="uj-kpi-card"><Text className="uj-kpi-label">Returned</Text><Heading level={2} className="uj-kpi-value" style={{ color: leakageAnalysis.recoveryRate > 40 ? GREEN : leakageAnalysis.recoveryRate > 20 ? YELLOW : RED }}>{fmtCount(leakageAnalysis.recoverers)} ({fmtPct(leakageAnalysis.recoveryRate)})</Heading></div>
            <div className="uj-kpi-card"><Text className="uj-kpi-label">Lost (Never Returned)</Text><Heading level={2} className="uj-kpi-value" style={{ color: RED }}>{fmtCount(leakageAnalysis.lostUsers)}</Heading></div>
            <div className="uj-kpi-card"><Text className="uj-kpi-label">Leaker Conv Rate</Text><Heading level={2} className="uj-kpi-value" style={{ color: leakageAnalysis.leakConvRate >= 20 ? GREEN : leakageAnalysis.leakConvRate >= 10 ? YELLOW : RED }}>{fmtPct(leakageAnalysis.leakConvRate)}</Heading></div>
            <div className="uj-kpi-card"><Text className="uj-kpi-label">Straight-Through</Text><Heading level={2} className="uj-kpi-value" style={{ color: GREEN }}>{fmtCount(leakageAnalysis.straightThrough)} ({fmtPct(leakageAnalysis.straightConvRate)})</Heading></div>
          </Flex>

          {/* Exit Step Distribution */}
          <SectionHeader title="Where Users Leave the Funnel — Exit step distribution" />
          <div className="uj-table-tile" style={{ padding: 16 }}>
            <svg width="100%" viewBox={`0 0 720 ${Math.max(180, leakageAnalysis.exitStepData.length * 36 + 40)}`}>
              {leakageAnalysis.exitStepData.map((d, i) => {
                const maxExits = Math.max(1, ...leakageAnalysis.exitStepData.map(x => x.total));
                const y = i * 36 + 20;
                const barW = Math.max(4, (d.total / maxExits) * 400);
                const recW = d.total > 0 ? (d.recovered / d.total) * barW : 0;
                const lostW = barW - recW;
                return (
                  <g key={i}>
                    <text x={120} y={y + 14} textAnchor="end" fill="rgba(255,255,255,0.7)" fontSize={11} fontWeight={600}>Step {d.index + 1}: {d.step.substring(0, 16)}</text>
                    {/* Lost portion */}
                    <rect x={130} y={y} width={lostW} height={24} rx={4} fill={RED} fillOpacity={0.3} stroke={RED} strokeWidth={0.5} strokeOpacity={0.4}>
                      <title>{`Lost: ${fmtCount(d.lost)} users`}</title>
                    </rect>
                    {/* Recovered portion */}
                    <rect x={130 + lostW} y={y} width={recW} height={24} rx={4} fill={GREEN} fillOpacity={0.3} stroke={GREEN} strokeWidth={0.5} strokeOpacity={0.4}>
                      <title>{`Recovered: ${fmtCount(d.recovered)} users`}</title>
                    </rect>
                    <text x={130 + barW + 8} y={y + 10} fill="rgba(255,255,255,0.8)" fontSize={10} fontWeight={700}>{fmtCount(d.total)}</text>
                    <text x={130 + barW + 8} y={y + 22} fill="rgba(255,255,255,0.4)" fontSize={9}>{fmtPct(d.recoveryRate)} recovered · {fmtPct(d.convRate)} converted</text>
                  </g>
                );
              })}
              {/* Legend */}
              <rect x={130} y={leakageAnalysis.exitStepData.length * 36 + 24} width={10} height={10} rx={2} fill={RED} fillOpacity={0.4} />
              <text x={144} y={leakageAnalysis.exitStepData.length * 36 + 33} fill="rgba(255,255,255,0.5)" fontSize={9}>Lost</text>
              <rect x={190} y={leakageAnalysis.exitStepData.length * 36 + 24} width={10} height={10} rx={2} fill={GREEN} fillOpacity={0.4} />
              <text x={204} y={leakageAnalysis.exitStepData.length * 36 + 33} fill="rgba(255,255,255,0.5)" fontSize={9}>Recovered</text>
            </svg>
          </div>

          {/* Behavioral Comparison: Recoverers vs Lost */}
          <SectionHeader title="Behavioral Comparison — Recoverers vs. Lost Users" />
          <Flex gap={16} flexWrap="wrap">
            <div className="uj-table-tile" style={{ padding: 16, flex: 1, minWidth: 280 }}>
              <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8, display: "block" }}>🔄 Recoverers (left but returned)</Text>
              <Flex flexDirection="column" gap={6}>
                <Flex justifyContent="space-between"><Text style={{ fontSize: 12 }}>Count</Text><Strong style={{ color: GREEN }}>{fmtCount(leakageAnalysis.recoverers)}</Strong></Flex>
                <Flex justifyContent="space-between"><Text style={{ fontSize: 12 }}>Conversion Rate</Text><Strong style={{ color: leakageAnalysis.recConvRate >= 20 ? GREEN : leakageAnalysis.recConvRate >= 10 ? YELLOW : RED }}>{fmtPct(leakageAnalysis.recConvRate)}</Strong></Flex>
                <Flex justifyContent="space-between"><Text style={{ fontSize: 12 }}>Avg Path Length</Text><Strong>{leakageAnalysis.recAvgPath.toFixed(1)} pages</Strong></Flex>
                <Flex justifyContent="space-between"><Text style={{ fontSize: 12 }}>Avg Off-Funnel Pages</Text><Strong>{leakageAnalysis.recAvgOffFunnel.toFixed(1)}</Strong></Flex>
                <Flex justifyContent="space-between"><Text style={{ fontSize: 12 }}>Avg Deepest Step</Text><Strong>Step {(leakageAnalysis.recAvgMaxStep + 1).toFixed(1)}</Strong></Flex>
                {leakageAnalysis.recExitPages.length > 0 && (
                  <>
                    <Text style={{ fontSize: 11, opacity: 0.4, marginTop: 4 }}>Top exit pages:</Text>
                    {leakageAnalysis.recExitPages.map(([pg, ct], i) => (
                      <Flex key={i} justifyContent="space-between"><Text style={{ fontSize: 11, opacity: 0.7 }}>{pg.substring(0, 28)}</Text><Text style={{ fontSize: 11 }}>{fmtCount(ct)}</Text></Flex>
                    ))}
                  </>
                )}
              </Flex>
            </div>
            <div className="uj-table-tile" style={{ padding: 16, flex: 1, minWidth: 280 }}>
              <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8, display: "block" }}>❌ Lost Users (left, never returned)</Text>
              <Flex flexDirection="column" gap={6}>
                <Flex justifyContent="space-between"><Text style={{ fontSize: 12 }}>Count</Text><Strong style={{ color: RED }}>{fmtCount(leakageAnalysis.lostUsers)}</Strong></Flex>
                <Flex justifyContent="space-between"><Text style={{ fontSize: 12 }}>Conversion Rate</Text><Strong style={{ color: RED }}>0.0%</Strong></Flex>
                <Flex justifyContent="space-between"><Text style={{ fontSize: 12 }}>Avg Path Length</Text><Strong>{leakageAnalysis.lostAvgPath.toFixed(1)} pages</Strong></Flex>
                <Flex justifyContent="space-between"><Text style={{ fontSize: 12 }}>Avg Off-Funnel Pages</Text><Strong>{leakageAnalysis.lostAvgOffFunnel.toFixed(1)}</Strong></Flex>
                <Flex justifyContent="space-between"><Text style={{ fontSize: 12 }}>Avg Deepest Step</Text><Strong>Step {(leakageAnalysis.lostAvgMaxStep + 1).toFixed(1)}</Strong></Flex>
                {leakageAnalysis.lostExitPages.length > 0 && (
                  <>
                    <Text style={{ fontSize: 11, opacity: 0.4, marginTop: 4 }}>Top exit pages:</Text>
                    {leakageAnalysis.lostExitPages.map(([pg, ct], i) => (
                      <Flex key={i} justifyContent="space-between"><Text style={{ fontSize: 11, opacity: 0.7 }}>{pg.substring(0, 28)}</Text><Text style={{ fontSize: 11 }}>{fmtCount(ct)}</Text></Flex>
                    ))}
                  </>
                )}
              </Flex>
            </div>
          </Flex>

          {/* Off-Funnel Destinations */}
          <SectionHeader title="Off-Funnel Destinations — Where users go when they leave" />
          <div className="uj-table-tile"><DataTable sortable resizable fullWidth data={leakageAnalysis.offFunnelDests.map(d => ({
            Page: d.page.substring(0, 40), Visits: d.count,
            "From Recoverers": d.fromRecoverers, "From Lost": d.fromLost,
            "Recovery Rate": d.recoveryRate, "Conv Rate": d.convRate,
          }))} columns={[
            { id: "Page", header: "Page", accessor: "Page", cell: ({ value }: any) => <Strong>{value}</Strong> },
            { id: "Visits", header: "Visits", accessor: "Visits", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: BLUE }}>{fmtCount(value)}</Strong> },
            { id: "From Recoverers", header: "Recoverers", accessor: "From Recoverers", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: GREEN }}>{fmtCount(value)}</Text> },
            { id: "From Lost", header: "Lost", accessor: "From Lost", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: RED }}>{fmtCount(value)}</Text> },
            { id: "Recovery Rate", header: "Recovery %", accessor: "Recovery Rate", sortType: "number" as any, cell: ({ value }: any) => <span style={{ display: "inline-block", width: "100%", padding: "2px 8px", borderRadius: 4, background: value >= 50 ? "rgba(13,156,41,0.15)" : value >= 25 ? "rgba(184,134,11,0.15)" : "rgba(194,25,48,0.15)", color: value >= 50 ? GREEN : value >= 25 ? YELLOW : RED, fontWeight: 700, textAlign: "center" }}>{fmtPct(value)}</span> },
            { id: "Conv Rate", header: "Conv %", accessor: "Conv Rate", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value >= 20 ? GREEN : value >= 10 ? YELLOW : RED }}>{fmtPct(value)}</Strong> },
          ]} /></div>

          {/* Diagnostic Signals — Performance correlation */}
          <SectionHeader title="Leakage Diagnostic Signals — Is performance driving users away?" />
          <div className="uj-table-tile"><DataTable sortable resizable fullWidth data={leakageAnalysis.leakageSignals.map(s => ({
            "Exit Page": s.page.substring(0, 40), "Exit Count": s.exitCount,
            "Avg Load (ms)": s.avgLoad > 0 ? Math.round(s.avgLoad) : null,
            Errors: s.errors, Health: s.healthScore,
          }))} columns={[
            { id: "Exit Page", header: "Exit Page", accessor: "Exit Page", cell: ({ value }: any) => <Strong>{value}</Strong> },
            { id: "Exit Count", header: "Exits", accessor: "Exit Count", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: RED }}>{fmtCount(value)}</Strong> },
            { id: "Avg Load (ms)", header: "Avg Load", accessor: "Avg Load (ms)", sortType: "number" as any, cell: ({ value }: any) => value != null ? <span style={{ color: value > 4000 ? RED : value > 2000 ? YELLOW : GREEN, fontWeight: 600 }}>{fmtCount(value)}ms</span> : <Text style={{ opacity: 0.3 }}>—</Text> },
            { id: "Errors", header: "Errors", accessor: "Errors", sortType: "number" as any, cell: ({ value }: any) => value > 0 ? <Strong style={{ color: RED }}>{fmtCount(value)}</Strong> : <Text style={{ opacity: 0.3 }}>0</Text> },
            { id: "Health", header: "Health", accessor: "Health", sortType: "number" as any, cell: ({ value }: any) => <span style={{ display: "inline-block", width: "100%", padding: "2px 8px", borderRadius: 4, background: value >= 70 ? "rgba(13,156,41,0.15)" : value >= 40 ? "rgba(184,134,11,0.15)" : "rgba(194,25,48,0.15)", color: value >= 70 ? GREEN : value >= 40 ? YELLOW : RED, fontWeight: 700, textAlign: "center" }}>{value}/100</span> },
          ]} /></div>

          {aov > 0 && (
            <>
              <SectionHeader title="Revenue Impact of Funnel Leakage" />
              <Flex gap={16} flexWrap="wrap">
                <div className="uj-revenue-card">
                  <Text className="uj-metric-label">Lost Users</Text>
                  <Strong className="uj-metric-value" style={{ color: RED }}>{fmtCount(leakageAnalysis.lostUsers)}</Strong>
                  <Text style={{ fontSize: 13, opacity: 0.5 }}>Never returned to funnel</Text>
                </div>
                <div className="uj-revenue-card">
                  <Text className="uj-metric-label">Est. Revenue at Risk</Text>
                  <Strong className="uj-metric-value" style={{ color: RED }}>{fmtCurrency(leakageAnalysis.lostUsers * aov * (leakageAnalysis.leakConvRate / 100))}</Strong>
                  <Text style={{ fontSize: 13, opacity: 0.5 }}>If lost users converted at leaker rate ({fmtPct(leakageAnalysis.leakConvRate)})</Text>
                </div>
                <div className="uj-revenue-card">
                  <Text className="uj-metric-label">Recovery Revenue Saved</Text>
                  <Strong className="uj-metric-value" style={{ color: GREEN }}>{fmtCurrency(leakageAnalysis.recoverers * aov * (leakageAnalysis.recConvRate / 100))}</Strong>
                  <Text style={{ fontSize: 13, opacity: 0.5 }}>Revenue from recoverers who converted</Text>
                </div>
              </Flex>
            </>
          )}

          <div className="uj-table-tile" style={{ padding: 16 }}>
            <Text style={{ fontSize: 13, opacity: 0.7 }}>
              💡 <Strong>Funnel Leakage</Strong> tracks users who navigate away from the defined funnel steps. <Strong>Recoverers</Strong> are users who left but found their way back and may still convert. <Strong>Lost users</Strong> left and never returned. Compare their behavior — longer sessions and deeper funnel penetration before leaving correlate with higher recovery rates. Pages with poor LCP or high error counts on exit pages are strong candidates for performance optimization to reduce leakage.
            </Text>
          </div>
        </>
      )}

      {/* ==== FUNNEL VELOCITY sub-tab ==== */}
      {sankeySubTab === "velocity" && (() => {
        const velRecords = (velocityData?.data?.records ?? []) as any[];
        // Parse step_entries: each record has step_entries = [{step, ts}, ...] — one entry per unique step
        // Build step order from user-defined steps
        const stepOrder = steps.map(s => s.label);
        type StepTiming = { sessionId: string; deltas: number[] };
        const timings: StepTiming[] = [];
        for (const r of velRecords) {
          const st = (r.step_entries ?? r.step_times ?? []) as any[];
          // Build map: step label → earliest timestamp
          const stepMap = new Map<string, number>();
          for (const entry of st) {
            if (!entry || typeof entry !== 'object') continue;
            const stepName = String(entry.step ?? "");
            const ts = new Date(String(entry.ts ?? "")).getTime();
            if (!stepName || isNaN(ts)) continue;
            const existing = stepMap.get(stepName);
            if (existing === undefined || ts < existing) stepMap.set(stepName, ts);
          }
          // Order by defined step sequence, compute deltas between consecutive steps
          const orderedTimes: number[] = [];
          for (const label of stepOrder) {
            const ts = stepMap.get(label);
            if (ts !== undefined) orderedTimes.push(ts);
          }
          if (orderedTimes.length < 2) continue;
          const deltas: number[] = [];
          for (let i = 1; i < orderedTimes.length; i++) deltas.push(Math.max(0, (orderedTimes[i] - orderedTimes[i - 1]) / 1000));
          timings.push({ sessionId: String(r["dt.rum.session.id"] ?? ""), deltas });
        }
        // Per-step-transition stats
        const maxSteps = Math.max(0, ...timings.map(t => t.deltas.length));
        const stepStats: { label: string; avg: number; median: number; p90: number; count: number }[] = [];
        for (let i = 0; i < maxSteps; i++) {
          const vals = timings.map(t => t.deltas[i]).filter((v): v is number => v !== undefined && v >= 0).sort((a, b) => a - b);
          if (vals.length === 0) { stepStats.push({ label: `Step ${i + 1} → ${i + 2}`, avg: 0, median: 0, p90: 0, count: 0 }); continue; }
          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
          const median = vals[Math.floor(vals.length / 2)];
          const p90 = vals[Math.floor(vals.length * 0.9)];
          const fromLabel = steps[i]?.label ?? `Step ${i + 1}`;
          const toLabel = steps[i + 1]?.label ?? `Step ${i + 2}`;
          stepStats.push({ label: `${fromLabel} → ${toLabel}`, avg, median, p90, count: vals.length });
        }
        const totalAvg = timings.length > 0 ? timings.reduce((a, t) => a + t.deltas.reduce((s, d) => s + d, 0), 0) / timings.length : 0;
        const slowest = stepStats.reduce((best, s) => s.median > best.median ? s : best, stepStats[0] ?? { label: "", avg: 0, median: 0, p90: 0, count: 0 });
        const fastest = stepStats.reduce((best, s) => s.count > 0 && s.median < best.median ? s : best, stepStats[0] ?? { label: "", avg: 0, median: 0, p90: 0, count: 0 });
        // Histogram of total journey time
        const journeyTimes = timings.map(t => t.deltas.reduce((a, b) => a + b, 0)).sort((a, b) => a - b);
        const bucketCount = 12;
        const maxJT = journeyTimes.length > 0 ? journeyTimes[journeyTimes.length - 1] : 60;
        const bucketSize = Math.max(1, Math.ceil(maxJT / bucketCount));
        const histBuckets: { label: string; count: number }[] = [];
        for (let b = 0; b < bucketCount; b++) {
          const lo = b * bucketSize;
          const hi = lo + bucketSize;
          const cnt = journeyTimes.filter(t => t >= lo && t < hi).length;
          histBuckets.push({ label: `${Math.round(lo)}s`, count: cnt });
        }
        const histMax = Math.max(1, ...histBuckets.map(b => b.count));
        // SVG chart dimensions
        const W = 720, H = 260, PAD = { top: 30, right: 20, bottom: 40, left: 60 };
        const iW = W - PAD.left - PAD.right, iH = H - PAD.top - PAD.bottom;
        const barMaxH = iH;

        return (
          <>
            <SectionHeader title="Funnel Velocity — How fast do users progress through the funnel?" />
            <Flex gap={16} flexWrap="wrap">
              <div className="uj-kpi-card"><Text className="uj-kpi-label">Sessions Analyzed</Text><Heading level={2} className="uj-kpi-value" style={{ color: BLUE }}>{fmtCount(timings.length)}</Heading></div>
              <div className="uj-kpi-card"><Text className="uj-kpi-label">Avg Total Journey</Text><Heading level={2} className="uj-kpi-value" style={{ color: PURPLE }}>{totalAvg < 60 ? `${totalAvg.toFixed(1)}s` : `${(totalAvg / 60).toFixed(1)}m`}</Heading></div>
              <div className="uj-kpi-card"><Text className="uj-kpi-label">Slowest Transition</Text><Heading level={2} className="uj-kpi-value" style={{ color: RED }}>{slowest.label.substring(0, 25)}</Heading><Text style={{ fontSize: 11, opacity: 0.5 }}>Median: {slowest.median.toFixed(1)}s</Text></div>
              <div className="uj-kpi-card"><Text className="uj-kpi-label">Fastest Transition</Text><Heading level={2} className="uj-kpi-value" style={{ color: GREEN }}>{fastest.label.substring(0, 25)}</Heading><Text style={{ fontSize: 11, opacity: 0.5 }}>Median: {fastest.median.toFixed(1)}s</Text></div>
            </Flex>

            {/* Step-by-step velocity chart */}
            <SectionHeader title="Step Transition Times" />
            <div className="uj-table-tile" style={{ padding: 16 }}>
              <svg width="100%" viewBox={`0 0 ${W} ${Math.max(H, stepStats.length * 40 + 60)}`}>
                {stepStats.map((s, i) => {
                  const y = i * 40 + 30;
                  const maxMedian = Math.max(1, ...stepStats.map(x => x.p90));
                  const medW = Math.max(4, (s.median / maxMedian) * 450);
                  const p90W = Math.max(4, (s.p90 / maxMedian) * 450);
                  return (
                    <g key={i}>
                      <text x={140} y={y + 14} textAnchor="end" fill="rgba(255,255,255,0.7)" fontSize={11} fontWeight={600}>{s.label.length > 20 ? s.label.substring(0, 20) + "…" : s.label}</text>
                      <rect x={150} y={y} width={p90W} height={24} rx={4} fill={BLUE} fillOpacity={0.15} stroke={BLUE} strokeWidth={0.5} strokeOpacity={0.3}><title>P90: {s.p90.toFixed(1)}s</title></rect>
                      <rect x={150} y={y + 2} width={medW} height={20} rx={4} fill={s.median > 30 ? RED : s.median > 10 ? YELLOW : GREEN} fillOpacity={0.4}><title>Median: {s.median.toFixed(1)}s</title></rect>
                      <text x={150 + p90W + 8} y={y + 10} fill="rgba(255,255,255,0.8)" fontSize={10} fontWeight={700}>Med: {s.median.toFixed(1)}s</text>
                      <text x={150 + p90W + 8} y={y + 22} fill="rgba(255,255,255,0.4)" fontSize={9}>P90: {s.p90.toFixed(1)}s · Avg: {s.avg.toFixed(1)}s · n={fmtCount(s.count)}</text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Journey time distribution histogram */}
            <SectionHeader title="Journey Time Distribution" />
            <div className="uj-table-tile" style={{ padding: 16 }}>
              <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
                <text x={PAD.left} y={PAD.top - 10} fill="rgba(255,255,255,0.4)" fontSize={10}>Sessions</text>
                {histBuckets.map((b, i) => {
                  const bW = iW / histBuckets.length - 4;
                  const x = PAD.left + i * (iW / histBuckets.length) + 2;
                  const bH = Math.max(1, (b.count / histMax) * barMaxH);
                  const y = PAD.top + barMaxH - bH;
                  return (
                    <g key={i}>
                      <rect x={x} y={y} width={bW} height={bH} rx={3} fill={PURPLE} fillOpacity={0.5} stroke={PURPLE} strokeWidth={0.5} strokeOpacity={0.3}><title>{b.label}: {b.count} sessions</title></rect>
                      {b.count > 0 && <text x={x + bW / 2} y={y - 4} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={9} fontWeight={600}>{b.count}</text>}
                      <text x={x + bW / 2} y={H - PAD.bottom + 14} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={9}>{b.label}</text>
                    </g>
                  );
                })}
                <text x={PAD.left + iW / 2} y={H - 4} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={10}>Journey Duration</text>
              </svg>
            </div>

            {/* DataTable with per-step details */}
            <SectionHeader title="Step Velocity Details" />
            <div className="uj-table-tile"><DataTable sortable resizable fullWidth data={stepStats.map(s => ({
              Transition: s.label, "Median (s)": Number(s.median.toFixed(1)), "Avg (s)": Number(s.avg.toFixed(1)),
              "P90 (s)": Number(s.p90.toFixed(1)), Sessions: s.count,
            }))} columns={[
              { id: "Transition", header: "Transition", accessor: "Transition", cell: ({ value }: any) => <Strong>{value}</Strong> },
              { id: "Median (s)", header: "Median", accessor: "Median (s)", sortType: "number" as any, cell: ({ value }: any) => <span style={{ color: value > 30 ? RED : value > 10 ? YELLOW : GREEN, fontWeight: 700 }}>{value}s</span> },
              { id: "Avg (s)", header: "Average", accessor: "Avg (s)", sortType: "number" as any, cell: ({ value }: any) => <Strong>{value}s</Strong> },
              { id: "P90 (s)", header: "P90", accessor: "P90 (s)", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: BLUE }}>{value}s</Strong> },
              { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
            ]} /></div>

            <div className="uj-table-tile" style={{ padding: 16 }}>
              <Text style={{ fontSize: 13, opacity: 0.7 }}>
                ⚡ <Strong>Funnel Velocity</Strong> measures how quickly users move between funnel steps. Slower transitions often indicate friction, confusion, or external distractions. The P90 shows the experience of your slowest users — if the P90 is significantly higher than the median, a subset of users is struggling disproportionately.
              </Text>
            </div>
          </>
        );
      })()}
    </Flex>
  );
}
function RootCauseCorrelationTab({ hourlyData, stepDropData, quality, qualityPrev, overallApdex, overallApdexPrev, overallConv, overallConvPrev, isLoading, steps, aov, funnelCounts, backendServicesData }: { hourlyData: any; stepDropData: any; quality: any; qualityPrev: any; overallApdex: number; overallApdexPrev: number; overallConv: number; overallConvPrev: number; isLoading: boolean; steps: StepDef[]; aov: number; funnelCounts: number[]; backendServicesData?: any }) {
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeRootCauseCorrelation(hourlyData, quality, overallApdex, overallConv), [hourlyData, quality, overallApdex, overallConv]));
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
      {aiPanel}
      <SectionHeader title="Root Cause Correlation" />
      <Text style={{ fontSize: 12, opacity: 0.5 }}>Correlates conversion drops with latency spikes, error surges, and P90 outliers on an hourly timeline. Identifies the technical driver behind every drop.</Text>

      {/* Period-over-period change summary */}
      <Flex gap={16} flexWrap="wrap">
        <div className="uj-kpi-card" style={{ minWidth: 150 }}>
          <Text className="uj-kpi-label">Conversion Δ</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: convChange >= 0 ? GREEN : RED }}>{convChange >= 0 ? "▲" : "▼"} {Math.abs(convChange).toFixed(1)}%</Heading>
          <Text style={{ fontSize: 12, opacity: 0.5 }}>{fmtPct(overallConvPrev)} → {fmtPct(overallConv)}</Text>
        </div>
        <div className="uj-kpi-card" style={{ minWidth: 150 }}>
          <Text className="uj-kpi-label">Apdex Δ</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: apdexChange >= 0 ? GREEN : RED }}>{apdexChange >= 0 ? "▲" : "▼"} {Math.abs(apdexChange).toFixed(1)}%</Heading>
          <Text style={{ fontSize: 12, opacity: 0.5 }}>{overallApdexPrev.toFixed(2)} → {overallApdex.toFixed(2)}</Text>
        </div>
        <div className="uj-kpi-card" style={{ minWidth: 150 }}>
          <Text className="uj-kpi-label">Error Rate Δ</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: errorChange <= 0 ? GREEN : RED }}>{errorChange > 0 ? "▲" : "▼"} {Math.abs(errorChange).toFixed(1)}%</Heading>
          <Text style={{ fontSize: 12, opacity: 0.5 }}>{fmtPct(errorRatePrev)} → {fmtPct(errorRate)}</Text>
        </div>
        <div className="uj-kpi-card" style={{ minWidth: 150 }}>
          <Text className="uj-kpi-label">Duration Δ</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: durationChange <= 0 ? GREEN : RED }}>{durationChange > 0 ? "▲" : "▼"} {Math.abs(durationChange).toFixed(1)}%</Heading>
          <Text style={{ fontSize: 12, opacity: 0.5 }}>{fmt(qualityPrev.avg)} → {fmt(quality.avg)}</Text>
        </div>
        <div className="uj-kpi-card" style={{ minWidth: 130 }}>
          <Text className="uj-kpi-label">Impact Hours</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: impactHours.length > 3 ? RED : impactHours.length > 0 ? ORANGE : GREEN }}>{impactHours.length}</Heading>
        </div>
        <div className="uj-kpi-card" style={{ minWidth: 130 }}>
          <Text className="uj-kpi-label">Critical Hours</Text>
          <Heading level={2} className="uj-kpi-value" style={{ color: criticalHours.length > 0 ? RED : GREEN }}>{criticalHours.length}</Heading>
        </div>
        {aov > 0 && (() => {
          const lastIdx = steps.length - 1;
          const totalSessions = hourly.reduce((s, h) => s + h.sessions, 0);
          const impactSessions = impactHours.reduce((s, h) => s + h.sessions, 0);
          const revenueAtRisk = totalSessions > 0 ? (impactSessions / totalSessions) * (funnelCounts[lastIdx] ?? 0) * aov : 0;
          return (
            <div className="uj-kpi-card" style={{ minWidth: 150 }}>
              <Text className="uj-kpi-label">Revenue at Risk</Text>
              <Heading level={2} className="uj-kpi-value" style={{ color: revenueAtRisk > 0 ? RED : GREEN }}>{fmtCurrency(revenueAtRisk)}</Heading>
              <Text style={{ fontSize: 12, opacity: 0.5 }}>{fmtCount(impactSessions)} sessions in impact hours</Text>
            </div>
          );
        })()}
      </Flex>

      {/* Hourly correlation timeline */}
      <ChartTile title="Hourly Correlation Timeline" description="Conversion rate (green), avg duration (blue), error rate (red).">
        {signals.length > 1 ? (() => {
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const convTs = buildTimeseries("Conversion Rate", signals.map(s => ({
            time: new Date(today.getTime() + s.hour * 3600000), value: s.convRate,
          })), "percent");
          const durTs = buildTimeseries("Avg Duration", signals.map(s => ({
            time: new Date(today.getTime() + s.hour * 3600000), value: (s.avgDuration / maxDur) * maxConv,
          })), "percent");
          const errTs = buildTimeseries("Error Rate", signals.map(s => ({
            time: new Date(today.getTime() + s.hour * 3600000), value: (s.errorRate / maxErr) * maxConv,
          })), "percent");
          return (
            <TimeseriesChart gapPolicy="connect" curve="linear">
              <TimeseriesChart.Line data={convTs} color={GREEN} />
              <TimeseriesChart.Line data={durTs} color={BLUE} />
              <TimeseriesChart.Line data={errTs} color={RED} />
              <TimeseriesChart.Legend hidden />
            </TimeseriesChart>
          );
        })() : null}
      </ChartTile>

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
                <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, background: `${severityColor(s.severity)}18`, color: severityColor(s.severity), fontWeight: 700, textTransform: "uppercase" as const }}>{s.severity}</span>
              </Flex>
              <Flex gap={16} style={{ marginBottom: 6 }}>
                <div><Text style={{ fontSize: 12, opacity: 0.5 }}>Conversion</Text><Strong style={{ display: "block", fontSize: 14, color: RED }}>{s.convRate.toFixed(1)}%</Strong></div>
                <div><Text style={{ fontSize: 12, opacity: 0.5 }}>Avg Duration</Text><Strong style={{ display: "block", fontSize: 14, color: s.isLatencySpike ? RED : BLUE }}>{fmt(s.avgDuration)}</Strong></div>
                <div><Text style={{ fontSize: 12, opacity: 0.5 }}>Error Rate</Text><Strong style={{ display: "block", fontSize: 14, color: s.isErrorSurge ? RED : GREEN }}>{s.errorRate.toFixed(1)}%</Strong></div>
                <div><Text style={{ fontSize: 12, opacity: 0.5 }}>Confidence</Text><Strong style={{ display: "block", fontSize: 14, color: s.confidence > 60 ? ORANGE : BLUE }}>{s.confidence}%</Strong></div>
              </Flex>
              <Flex gap={6} flexWrap="wrap">
                {s.causes.map((c, ci) => (
                  <span key={ci} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, background: "rgba(194,25,48,0.12)", color: RED, fontWeight: 600 }}>{c}</span>
                ))}
              </Flex>
            </div>
          ))}
        </Flex>
      )}

      {/* Funnel step degradation ranking */}
      <SectionHeader title="Step Degradation Ranking" />
      <Text style={{ fontSize: 13, opacity: 0.5 }}>Steps ranked by P90 vs. Avg duration spread — higher degradation score = more tail latency, likely root cause contributor.</Text>
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
            { id: "Severity", header: "Severity", accessor: "Severity", cell: ({ value }: any) => <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, background: `${severityColor(value)}18`, color: severityColor(value), fontWeight: 700, textTransform: "uppercase" as const }}>{value}</span> },
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
function PredictiveForecastingTab({ trendData, apdexTrendData, vitalsTrendData, quality, overallApdex, overallConv, isLoading, steps, aov = 0, funnelCounts = [] }: { trendData: any; apdexTrendData: any; vitalsTrendData: any; quality: any; overallApdex: number; overallConv: number; isLoading: boolean; steps: StepDef[]; aov?: number; funnelCounts?: number[] }) {
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzePredictiveForecasting(quality, overallApdex, overallConv), [quality, overallApdex, overallConv]));
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
      {aiPanel}
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

      {/* Revenue Forecast */}
      {aov > 0 && funnelCounts.length > 0 && (() => {
        const lastIdx = funnelCounts.length - 1;
        const currConversions = funnelCounts[lastIdx] ?? 0;
        const currRevenue = currConversions * aov;
        const projConvRate = Math.max(0, convReg.predict(convValues.length - 1 + FORECAST_DAYS));
        const projSessions = funnelCounts[0] ?? 0;
        const projConversions = Math.round(projSessions * (projConvRate / 100));
        const projRevenue = projConversions * aov;
        const revDelta = projRevenue - currRevenue;
        return (
          <>
            <SectionHeader title="Revenue Forecast" />
            <Flex gap={16} flexWrap="wrap">
              <div className="uj-revenue-card">
                <Text className="uj-metric-label">Current Revenue</Text>
                <Strong className="uj-metric-value" style={{ color: BLUE }}>{fmtCurrency(currRevenue)}</Strong>
                <Text style={{ fontSize: 13, opacity: 0.5 }}>{fmtCount(currConversions)} conv × {fmtCurrency(aov)}</Text>
              </div>
              <div className="uj-revenue-card">
                <Text className="uj-metric-label">Projected Revenue (+{FORECAST_DAYS}d)</Text>
                <Strong className="uj-metric-value" style={{ color: projRevenue >= currRevenue ? GREEN : RED }}>{fmtCurrency(projRevenue)}</Strong>
                <Text style={{ fontSize: 13, opacity: 0.5 }}>Conv rate: {fmtPct(overallConv)} → {fmtPct(projConvRate)}</Text>
              </div>
              <div className="uj-revenue-card">
                <Text className="uj-metric-label">Revenue Delta</Text>
                <Strong className="uj-metric-value" style={{ color: revDelta >= 0 ? GREEN : RED }}>{revDelta >= 0 ? "+" : ""}{fmtCurrency(revDelta)}</Strong>
                <Text style={{ fontSize: 13, opacity: 0.5 }}>Based on conv rate trend</Text>
              </div>
            </Flex>
          </>
        );
      })()}

      {/* Forecast cards per metric */}
      <ChartTile title="Metric Forecasts" description="Budget tracking with 7-day forecast projections per metric">
        <Flex gap={12} flexWrap="wrap">
          {budgets.map((b) => (
            <div key={b.metric} className="uj-anomaly-card" style={{ borderLeftColor: severityColor(b.severity), minWidth: 420, flex: 1 }}>
            <Flex alignItems="center" justifyContent="space-between" style={{ marginBottom: 8 }}>
              <Strong style={{ fontSize: 14 }}>{b.metric}</Strong>
              <span style={{ fontSize: 12, padding: "2px 10px", borderRadius: 4, background: `${severityColor(b.severity)}18`, color: severityColor(b.severity), fontWeight: 700, textTransform: "uppercase" as const }}>{severityLabel(b.severity)}</span>
            </Flex>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 8 }}>
              <div><Text style={{ fontSize: 11, opacity: 0.5, whiteSpace: "nowrap" }}>Current</Text><Strong style={{ display: "block", fontSize: 18, color: b.color }}>{b.format(b.current)}</Strong></div>
              <div><Text style={{ fontSize: 11, opacity: 0.5, whiteSpace: "nowrap" }}>Projected +7d</Text><Strong style={{ display: "block", fontSize: 18, color: b.projectedGood ? GREEN : RED }}>{b.format(b.projected7d)}</Strong></div>
              <div><Text style={{ fontSize: 11, opacity: 0.5, whiteSpace: "nowrap" }}>Budget</Text><Strong style={{ display: "block", fontSize: 18, opacity: 0.6 }}>{b.direction === "above" ? "≥" : "≤"} {b.format(b.threshold)}</Strong></div>
              <div><Text style={{ fontSize: 11, opacity: 0.5, whiteSpace: "nowrap" }}>Daily Δ</Text><Strong style={{ display: "block", fontSize: 16, color: b.isStable ? BLUE : b.improving ? GREEN : RED, whiteSpace: "nowrap" }}>{b.isStable ? "● Stable" : `${b.improving ? "▲" : "▼"} ${b.format(Math.abs(b.effectiveRate))}/day`}</Strong></div>
            </div>
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
              const chartValues = [b.current, ...b.values];
              const now = new Date();
              const actualTs = buildTimeseries("Actual", chartValues.map((v, i) => ({
                time: new Date(now.getTime() - (chartValues.length - 1 - i) * 86400000), value: v,
              })));
              const forecastPts: { time: Date; value: number }[] = [];
              for (let d = 0; d <= FORECAST_DAYS; d++) {
                const val = d === 0 ? chartValues[chartValues.length - 1] : b.reg.predict(b.values.length - 1 + d);
                forecastPts.push({ time: new Date(now.getTime() + d * 86400000), value: val });
              }
              const forecastTs = buildTimeseries("Forecast", forecastPts);
              const markerTime = new Date(now.getTime());
              return (
                <TimeseriesChart gapPolicy="connect" curve="linear" height={100}>
                  <TimeseriesChart.Area data={actualTs} color={BLUE} />
                  <TimeseriesChart.Line data={forecastTs} color={PURPLE} />
                  <TimeseriesChart.Legend hidden />
                  <TimeseriesChart.Annotations>
                    <TimeseriesAnnotations.Track>
                      <TimeseriesAnnotations.Marker start={markerTime} title="Forecast" symbol="▸" />
                    </TimeseriesAnnotations.Track>
                  </TimeseriesChart.Annotations>
                </TimeseriesChart>
              );
            })()}
            </div>
          ))}
        </Flex>
      </ChartTile>

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
              return <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, background: `${c}18`, color: c, fontWeight: 700 }}>{value}</span>;
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
        <Text style={{ fontSize: 13, opacity: 0.4 }}>
          Forecasts use linear regression on {n} data points from the selected timeframe. Accuracy improves with more data points. Projections assume current trends continue — external factors (deploys, traffic spikes) may alter trajectory.
        </Text>
      </div>

      {/* SLO Breach Probability */}
      <SectionHeader title="SLO Breach Risk Assessment" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Probability of breaching SLO thresholds within 7 days based on current trends.</Text>
      {(() => {
        // Simple trend extrapolation for breach probability
        const trendRecords = (apdexTrendData?.data?.records ?? []) as any[];
        if (trendRecords.length < 3) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>Insufficient trend data for breach prediction.</Text></div>;
        const apdexTrend = trendRecords.map((r: any) => {
          const total = Number(r.total ?? 0);
          const sat = Number(r.satisfied ?? 0);
          const tol = Number(r.tolerating ?? 0);
          return calcApdex(sat, tol, total);
        });
        const n = apdexTrend.length;
        const xMean = (n - 1) / 2;
        const slope = apdexTrend.reduce((a, y, i) => a + (i - xMean) * (y - apdexTrend.reduce((s, v) => s + v, 0) / n), 0) / apdexTrend.reduce((a, _, i) => a + Math.pow(i - xMean, 2), 0);
        const currentApdex = apdexTrend[n - 1] ?? 0;
        const projectedApdex7d = currentApdex + slope * 7 * 24;
        const sloTarget = 0.85;
        const breachProb = projectedApdex7d < sloTarget ? Math.min(95, Math.round((sloTarget - projectedApdex7d) / 0.1 * 30 + 40)) : Math.max(5, Math.round(20 - (projectedApdex7d - sloTarget) / 0.05 * 5));
        const residuals = apdexTrend.map((y, i) => y - (currentApdex + slope * (i - n + 1)));
        const stdErr = Math.sqrt(residuals.reduce((a, r) => a + r * r, 0) / Math.max(1, n - 2));
        const upperBound = projectedApdex7d + 1.96 * stdErr;
        const lowerBound = projectedApdex7d - 1.96 * stdErr;
        return (
          <Flex gap={16} flexWrap="wrap">
            <div className="uj-kpi-card">
              <Text className="uj-kpi-label">Breach Probability (7d)</Text>
              <Heading level={2} className="uj-kpi-value" style={{ color: breachProb > 60 ? RED : breachProb > 30 ? ORANGE : GREEN }}>{breachProb}%</Heading>
              <Text style={{ fontSize: 10, opacity: 0.5 }}>Target: Apdex ≥ {sloTarget}</Text>
            </div>
            <div className="uj-kpi-card">
              <Text className="uj-kpi-label">Projected Apdex (7d)</Text>
              <Heading level={2} className="uj-kpi-value" style={{ color: apdexClr(projectedApdex7d) }}>{projectedApdex7d.toFixed(3)}</Heading>
              <Text style={{ fontSize: 10, opacity: 0.5 }}>95% CI: [{lowerBound.toFixed(3)}, {upperBound.toFixed(3)}]</Text>
            </div>
            <div className="uj-kpi-card">
              <Text className="uj-kpi-label">Trend Slope</Text>
              <Heading level={2} className="uj-kpi-value" style={{ color: slope < -0.001 ? RED : slope > 0.001 ? GREEN : YELLOW }}>{slope > 0 ? "+" : ""}{(slope * 24).toFixed(4)}/day</Heading>
              <Text style={{ fontSize: 10, opacity: 0.5 }}>{slope < -0.001 ? "Degrading" : slope > 0.001 ? "Improving" : "Stable"}</Text>
            </div>
            <div className="uj-kpi-card">
              <Text className="uj-kpi-label">Forecast Std Error</Text>
              <Heading level={2} className="uj-kpi-value" style={{ color: stdErr > 0.05 ? ORANGE : GREEN }}>{stdErr.toFixed(4)}</Heading>
              <Text style={{ fontSize: 10, opacity: 0.5 }}>{stdErr > 0.05 ? "High variance" : "Low variance"}</Text>
            </div>
          </Flex>
        );
      })()}

    </Flex>
  );
}

// ===========================================================================
// TAB: Resource Waterfall
// ===========================================================================
function ResourceWaterfallTab({ waterfallData, byStepData, sessionDrillData, isLoading, steps, frontend }: { waterfallData: any; byStepData: any; sessionDrillData: any; isLoading: boolean; steps: StepDef[]; frontend: string }) {
  const [selectedStep, setSelectedStep] = useState<string>("all");
  const [drillSession, setDrillSession] = useState<string | null>(null);
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeResourceWaterfall(waterfallData, byStepData), [waterfallData, byStepData]));
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
      {aiPanel}
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
        <button onClick={() => setSelectedStep("all")} style={{ padding: "4px 12px", borderRadius: 4, border: `1px solid ${selectedStep === "all" ? BLUE : "rgba(255,255,255,0.15)"}`, background: selectedStep === "all" ? `${BLUE}20` : "transparent", color: selectedStep === "all" ? BLUE : "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>All Steps</button>
        {steps.map((step) => (
          <button key={step.label} onClick={() => setSelectedStep(step.label)} style={{ padding: "4px 12px", borderRadius: 4, border: `1px solid ${selectedStep === step.label ? BLUE : "rgba(255,255,255,0.15)"}`, background: selectedStep === step.label ? `${BLUE}20` : "transparent", color: selectedStep === step.label ? BLUE : "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>{step.label}</button>
        ))}
      </Flex>

      {/* Per-step resource breakdown cards */}
      <SectionHeader title="Resource Breakdown by Step" />
      <Flex gap={12} flexWrap="wrap">
        {stepCards.map((sc) => (
          <div key={sc.step} className="uj-anomaly-card" style={{ borderLeftColor: BLUE, minWidth: 280, flex: 1 }}>
            <Flex alignItems="center" justifyContent="space-between" style={{ marginBottom: 8 }}>
              <Strong style={{ fontSize: 13 }}>{sc.step}</Strong>
              <Text style={{ fontSize: 12, opacity: 0.5 }}>{fmtCount(sc.totalResources)} resources</Text>
            </Flex>
            {sc.types.length === 0 ? (
              <Text style={{ fontSize: 13, opacity: 0.4 }}>No resource data</Text>
            ) : (
              <Flex flexDirection="column" gap={4}>
                {sc.types.slice(0, 6).map((t) => (
                  <Flex key={t.type} alignItems="center" gap={8}>
                    <span style={{ fontSize: 12, padding: "1px 6px", borderRadius: 3, background: `${typeClr(t.type)}20`, color: typeClr(t.type), fontWeight: 600, minWidth: 50, textAlign: "center" }}>{t.type}</span>
                    <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                      <div style={{ height: "100%", width: `${Math.min((t.totalDur / Math.max(sc.totalTime, 1)) * 100, 100)}%`, background: typeClr(t.type), borderRadius: 3, opacity: 0.7 }} />
                    </div>
                    <Text style={{ fontSize: 12, minWidth: 50, textAlign: "right" }}>{fmt(t.avgDur)}</Text>
                    <Text style={{ fontSize: 13, opacity: 0.4, minWidth: 30 }}>{fmtCount(t.count)}</Text>
                  </Flex>
                ))}
              </Flex>
            )}
            {sc.slowCount > 0 && (
              <Text style={{ fontSize: 12, color: ORANGE, marginTop: 6 }}>{sc.slowCount} slow resource{sc.slowCount !== 1 ? "s" : ""} (&gt;1s)</Text>
            )}
          </div>
        ))}
      </Flex>

      {/* Visual waterfall chart */}
      <SectionHeader title="Top Resources by Total Time" />
      <Text style={{ fontSize: 13, opacity: 0.5, marginBottom: 4 }}>Bar = P50 (solid) → P90 (striped). Color = resource type. Ranked by cumulative load time impact.</Text>
      <div className="uj-table-tile" style={{ padding: 16, overflowX: "auto" }}>
        <svg width="100%" viewBox={`0 0 720 ${Math.min(sortedResources.length, 20) * 28 + 30}`}>
          {/* Header */}
          <text x={4} y={14} fill="rgba(128,128,128,0.7)" fontSize={9} fontWeight={600}>Resource</text>
          <text x={412} y={14} fill="rgba(128,128,128,0.7)" fontSize={9} fontWeight={600}>Type</text>
          <text x={450} y={14} fill="rgba(128,128,128,0.7)" fontSize={9} fontWeight={600}>Timing</text>
          <text x={620} y={14} fill="rgba(128,128,128,0.7)" fontSize={9} fontWeight={600}>Count</text>
          <text x={670} y={14} fill="rgba(128,128,128,0.7)" fontSize={9} fontWeight={600}>P90</text>
          <line x1={0} y1={20} x2={720} y2={20} stroke="rgba(128,128,128,0.15)" />
          {sortedResources.slice(0, 20).map((r, i) => {
            const y = 28 + i * 28;
            const color = typeClr(r.type);
            const p50W = (r.p50Dur / maxP90) * barW;
            const p90W = (r.p90Dur / maxP90) * barW;
            const shortName = r.name.length > 50 ? "..." + r.name.slice(-47) : r.name;
            return (
              <g key={i}>
                <text x={4} y={y + 4} fill="rgba(128,128,128,0.85)" fontSize={9}>{shortName.substring(0, 52)}</text>
                <title>{`${r.name}\nType: ${r.type} | Step: ${r.step}\nAvg: ${fmt(r.avgDur)} | P50: ${fmt(r.p50Dur)} | P90: ${fmt(r.p90Dur)} | P99: ${fmt(r.p99Dur)}\nCount: ${r.count} | Total: ${fmt(r.totalDur)}`}</title>
                {/* P90 bar (background) */}
                <rect x={450} y={y - 8} width={Math.max(p90W, 2)} height={12} rx={2} fill={color} opacity={0.2} />
                {/* P50 bar (foreground) */}
                <rect x={450} y={y - 8} width={Math.max(p50W, 2)} height={12} rx={2} fill={color} opacity={0.6} />
                {/* Type badge */}
                <text x={412} y={y + 3} fill={color} fontSize={8} fontWeight={600}>{r.type}</text>
                <text x={620} y={y + 4} fill="rgba(128,128,128,0.7)" fontSize={9}>{fmtCount(r.count)}</text>
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
            { id: "Step", header: "Step", accessor: "Step", cell: ({ value }: any) => <Text style={{ fontSize: 13 }}>{value}</Text> },
            { id: "Type", header: "Type", accessor: "Type", cell: ({ value }: any) => <span style={{ fontSize: 12, padding: "1px 6px", borderRadius: 3, background: `${typeClr(value)}20`, color: typeClr(value), fontWeight: 600 }}>{value}</span> },
            { id: "Resource", header: "Resource", accessor: "Resource", cell: ({ value }: any) => <Text style={{ fontSize: 12, wordBreak: "break-all" as const }}>{value}</Text> },
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

      {/* Top 10 Slowest Resources (Session-Level) */}
      <SectionHeader title="Top 10 Slowest Resources (Individual Requests)" />
      <Text style={{ fontSize: 13, opacity: 0.5, marginBottom: 4 }}>Individual resource requests ranked by duration. Click a session to view full replay.</Text>
      {(() => {
        const sessionRecords = (sessionDrillData.data?.records ?? []) as any[];
        const top10 = sessionRecords.slice(0, 10).map((r: any) => ({
          sid: String(r.sid ?? ""),
          name: String(r.res_name ?? "unknown"),
          type: String(r.res_type ?? "other"),
          dur: Number(r.res_dur_ms ?? 0),
          step: String(r.step_tag ?? ""),
          ts: r.timestamp ? new Date(r.timestamp).toLocaleString() : "",
          rawTs: r.start_time ? String(r.start_time) : r.timestamp ? new Date(r.timestamp).toISOString() : "",
        }));
        if (top10.length === 0) return <div className="uj-table-tile" style={{ padding: 24, textAlign: "center" }}><Text style={{ opacity: 0.5 }}>No individual resource data available.</Text></div>;
        return (
          <div className="uj-table-tile">
            <DataTable sortable resizable fullWidth data={top10.map((r, i) => ({
              "#": i + 1,
              Resource: r.name.length > 70 ? "..." + r.name.slice(-67) : r.name,
              Type: r.type,
              Duration: r.dur,
              Step: r.step,
              Time: r.ts,
              Session: r.sid,
              _rawTs: r.rawTs,
            }))} columns={[
              { id: "#", header: "#", accessor: "#", cell: ({ value }: any) => <Strong style={{ color: BLUE }}>{value}</Strong> },
              { id: "Resource", header: "Resource", accessor: "Resource", cell: ({ value }: any) => <Text style={{ fontSize: 12, wordBreak: "break-all" as const }}>{value}</Text> },
              { id: "Type", header: "Type", accessor: "Type", cell: ({ value }: any) => <span style={{ fontSize: 12, padding: "1px 6px", borderRadius: 3, background: `${typeClr(value)}20`, color: typeClr(value), fontWeight: 600 }}>{value}</span> },
              { id: "Duration", header: "Duration", accessor: "Duration", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 2000 ? RED : value > 1000 ? ORANGE : GREEN }}>{fmt(value)}</Strong> },
              { id: "Step", header: "Step", accessor: "Step" },
              { id: "Time", header: "Time", accessor: "Time", cell: ({ value }: any) => <Text style={{ fontSize: 12, opacity: 0.6 }}>{value}</Text> },
              { id: "Session", header: "Session", accessor: "Session", cell: ({ value, rowData }: any) => { const sid = value; const rawTs = rowData?._rawTs; return sid ? <a href={sessionReplayUrl(sid, rawTs)} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, fontSize: 12, textDecoration: "none" }} onMouseEnter={(e: any) => (e.currentTarget.style.textDecoration = "underline")} onMouseLeave={(e: any) => (e.currentTarget.style.textDecoration = "none")} title="Open session">{sid.slice(0, 8)}...</a> : <Text style={{ opacity: 0.3 }}>{"\u2014"}</Text>; } },
            ]} />
          </div>
        );
      })()}

      {/* Session Drill-Down Panel */}
      <SectionHeader title="Session Resource Drill-Down" />
      <Text style={{ fontSize: 13, opacity: 0.5, marginBottom: 4 }}>Select a session to see all resources loaded in that session.</Text>
      {(() => {
        const sessionRecords = (sessionDrillData.data?.records ?? []) as any[];
        const sessionIds = [...new Set(sessionRecords.map((r: any) => String(r.sid ?? "")))].filter(Boolean);
        if (sessionIds.length === 0) return <div className="uj-table-tile" style={{ padding: 24, textAlign: "center" }}><Text style={{ opacity: 0.5 }}>No session-level data available.</Text></div>;

        const sessionResources = drillSession ? sessionRecords.filter((r: any) => String(r.sid) === drillSession).map((r: any) => ({
          name: String(r.res_name ?? "unknown"),
          type: String(r.res_type ?? "other"),
          dur: Number(r.res_dur_ms ?? 0),
          step: String(r.step_tag ?? ""),
          ts: r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : "",
        })) : [];

        return (
          <Flex flexDirection="column" gap={12}>
            <Flex gap={8} alignItems="center" flexWrap="wrap">
              <Strong style={{ fontSize: 12 }}>Session:</Strong>
              {sessionIds.slice(0, 15).map(sid => (
                <button key={sid} onClick={() => setDrillSession(drillSession === sid ? null : sid)} style={{ padding: "4px 10px", borderRadius: 4, border: `1px solid ${drillSession === sid ? BLUE : "rgba(128,128,128,0.3)"}`, background: drillSession === sid ? `${BLUE}20` : "transparent", color: drillSession === sid ? BLUE : "inherit", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>{sid.slice(0, 8)}...</button>
              ))}
            </Flex>
            {drillSession && (
              <Flex flexDirection="column" gap={8}>
                <Flex gap={8} alignItems="center">
                  <Strong style={{ fontSize: 13 }}>Session: {drillSession.slice(0, 16)}...</Strong>
                  <a href={sessionReplayUrl(drillSession, (() => { const rec = sessionRecords.find((r: any) => String(r.sid) === drillSession); return rec?.start_time ? String(rec.start_time) : rec?.timestamp ? new Date(rec.timestamp).toISOString() : undefined; })())} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                    <Button variant="emphasized" style={{ fontSize: 11, padding: "2px 8px" }}>{"\u25B6"} View Full Session</Button>
                  </a>
                  <Text style={{ fontSize: 12, opacity: 0.5 }}>{sessionResources.length} resource{sessionResources.length !== 1 ? "s" : ""}</Text>
                </Flex>
                <div className="uj-table-tile">
                  <DataTable sortable resizable fullWidth data={sessionResources.map((r, i) => ({
                    "#": i + 1, Resource: r.name.length > 60 ? "..." + r.name.slice(-57) : r.name, Type: r.type, Duration: r.dur, Step: r.step, Time: r.ts,
                  }))} columns={[
                    { id: "#", header: "#", accessor: "#" },
                    { id: "Resource", header: "Resource", accessor: "Resource", cell: ({ value }: any) => <Text style={{ fontSize: 12, wordBreak: "break-all" as const }}>{value}</Text> },
                    { id: "Type", header: "Type", accessor: "Type", cell: ({ value }: any) => <span style={{ fontSize: 12, padding: "1px 6px", borderRadius: 3, background: `${typeClr(value)}20`, color: typeClr(value), fontWeight: 600 }}>{value}</span> },
                    { id: "Duration", header: "Duration", accessor: "Duration", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 2000 ? RED : value > 1000 ? ORANGE : GREEN }}>{fmt(value)}</Strong> },
                    { id: "Step", header: "Step", accessor: "Step" },
                    { id: "Time", header: "Time", accessor: "Time", cell: ({ value }: any) => <Text style={{ fontSize: 12, opacity: 0.6 }}>{value}</Text> },
                  ]} />
                </div>
              </Flex>
            )}
          </Flex>
        );
      })()}
    </Flex>
  );
}

// ===========================================================================
// TAB: Change Intelligence
// ===========================================================================
function ChangeIntelligenceTab({ deployData, impactData, quality, qualityPrev, overallApdex, overallApdexPrev, isLoading, aov, overallConv, funnelCounts, featureFlagData }: { deployData: any; impactData: any; quality: any; qualityPrev: any; overallApdex: number; overallApdexPrev: number; isLoading: boolean; aov: number; overallConv: number; funnelCounts: number[]; featureFlagData?: any }) {
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeChangeIntelligence(deployData, quality, qualityPrev, overallApdex, overallApdexPrev), [deployData, quality, qualityPrev, overallApdex, overallApdexPrev]));
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
      {aiPanel}
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
        {aov > 0 && regressions.length > 0 && (() => {
          const totalRevenueImpact = regressions.reduce((sum, d) => {
            const sessionsAfter = d.after.sessions || (quality.sessions / Math.max(totalDeploys, 1));
            const convDrop = Math.max(0, -d.apdexDelta) * 10; // rough: 0.1 apdex drop ≈ 1% conversion drop
            return sum + sessionsAfter * (convDrop / 100) * aov;
          }, 0);
          return totalRevenueImpact > 0 ? (
            <div className="uj-kpi-card" style={{ minWidth: 140 }}>
              <Text className="uj-kpi-label">Revenue Impact</Text>
              <Heading level={2} className="uj-kpi-value" style={{ color: RED }}>{fmtCurrency(totalRevenueImpact)}</Heading>
            </div>
          ) : null;
        })()}
      </Flex>

      {/* Timeline chart */}
      <ChartTile title="Performance Timeline with Deploy Markers" description="Green = Apdex, blue dashed = avg duration (normalized). Red vertical lines = deployment events.">
        {totalHours > 0 && hourlyImpact.length > 1 ? (() => {
          const apdexTs = buildTimeseries("Apdex", hourlyImpact.map(h => ({
            time: new Date(h.hourTs), value: h.apdex,
          })));
          const durTs = buildTimeseries("Avg Duration (normalized)", hourlyImpact.map(h => ({
            time: new Date(h.hourTs), value: (h.avgDur / maxDur) * maxApdex,
          })));
          return (
            <TimeseriesChart gapPolicy="connect" curve="linear">
              <TimeseriesChart.Line data={apdexTs} color={GREEN} />
              <TimeseriesChart.Line data={durTs} color={BLUE} />
              <TimeseriesChart.Legend hidden />
              {deployments.length > 0 && (
                <TimeseriesChart.Annotations>
                  <TimeseriesAnnotations.Track>
                    {deployments.map((dep, i) => (
                      <TimeseriesAnnotations.Marker key={i} start={new Date(dep.timestamp)} title={dep.name} description={dep.version || dep.source} />
                    ))}
                  </TimeseriesAnnotations.Track>
                </TimeseriesChart.Annotations>
              )}
            </TimeseriesChart>
          );
        })() : (
          <Text style={{ textAlign: "center", padding: 24, opacity: 0.4 }}>No hourly data available for the selected timeframe.</Text>
        )}
      </ChartTile>

      {/* Deployment analysis cards */}
      <SectionHeader title="Deployment Impact Analysis" />
      {deployAnalysis.length === 0 ? (
        <div className="uj-table-tile" style={{ padding: 24, textAlign: "center" }}>
          <Text style={{ color: BLUE, fontSize: 14 }}>No deployment events detected in the current timeframe.</Text>
          <Text style={{ display: "block", fontSize: 13, opacity: 0.5, marginTop: 8 }}>Deployment events are detected from Dynatrace DAVIS events and custom deployment events. Ensure deployment instrumentation is configured.</Text>
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
                    <span key={mi} style={{ fontSize: 13, padding: "2px 8px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}>{m}</span>
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
                      <Text style={{ fontSize: 26, opacity: 0.5 }}>Apdex</Text>
                      <Flex gap={6} alignItems="baseline">
                        <Text style={{ fontSize: 32, opacity: 0.6 }}>{d.before.apdex.toFixed(2)}</Text>
                        <Text style={{ fontSize: 28, opacity: 0.4 }}>→</Text>
                        <Strong style={{ fontSize: 44, color: d.apdexDelta >= 0 ? GREEN : RED }}>{d.after.apdex.toFixed(2)}</Strong>
                        <Text style={{ fontSize: 26, color: d.apdexDelta >= 0 ? GREEN : RED }}>{d.apdexDelta >= 0 ? "▲" : "▼"}{Math.abs(d.apdexDelta).toFixed(2)}</Text>
                      </Flex>
                    </div>
                    <div>
                      <Text style={{ fontSize: 26, opacity: 0.5 }}>Avg Duration</Text>
                      <Flex gap={6} alignItems="baseline">
                        <Text style={{ fontSize: 32, opacity: 0.6 }}>{fmt(d.before.avgDur)}</Text>
                        <Text style={{ fontSize: 28, opacity: 0.4 }}>→</Text>
                        <Strong style={{ fontSize: 44, color: d.durDelta <= 0 ? GREEN : RED }}>{fmt(d.after.avgDur)}</Strong>
                        <Text style={{ fontSize: 26, color: d.durDelta <= 0 ? GREEN : RED }}>{d.durDelta > 0 ? "▲" : "▼"}{Math.abs(d.durDelta).toFixed(1)}%</Text>
                      </Flex>
                    </div>
                    <div>
                      <Text style={{ fontSize: 26, opacity: 0.5 }}>Error Rate</Text>
                      <Flex gap={6} alignItems="baseline">
                        <Text style={{ fontSize: 32, opacity: 0.6 }}>{fmtPct(d.before.errorRate)}</Text>
                        <Text style={{ fontSize: 28, opacity: 0.4 }}>→</Text>
                        <Strong style={{ fontSize: 44, color: d.errorDelta <= 0 ? GREEN : RED }}>{fmtPct(d.after.errorRate)}</Strong>
                        <Text style={{ fontSize: 26, color: d.errorDelta <= 0 ? GREEN : RED }}>{d.errorDelta > 0 ? "▲" : "▼"}{Math.abs(d.errorDelta).toFixed(1)}pp</Text>
                      </Flex>
                    </div>
                    <div>
                      <Text style={{ fontSize: 26, opacity: 0.5 }}>Frustrated %</Text>
                      <Flex gap={6} alignItems="baseline">
                        <Text style={{ fontSize: 32, opacity: 0.6 }}>{fmtPct(d.before.fruPct)}</Text>
                        <Text style={{ fontSize: 28, opacity: 0.4 }}>→</Text>
                        <Strong style={{ fontSize: 44, color: d.fruDelta <= 0 ? GREEN : RED }}>{fmtPct(d.after.fruPct)}</Strong>
                      </Flex>
                    </div>
                    {aov > 0 && d.apdexDelta < 0 && (() => {
                      const sessionsAfter = d.after.sessions || (quality.sessions / Math.max(totalDeploys, 1));
                      const estRevLoss = sessionsAfter * (Math.abs(d.apdexDelta) * 10 / 100) * aov;
                      return estRevLoss > 0 ? (
                        <div>
                          <Text style={{ fontSize: 13, opacity: 0.5 }}>Est. Revenue Loss</Text>
                          <Strong style={{ fontSize: 22, color: RED }}>{fmtCurrency(estRevLoss)}</Strong>
                        </div>
                      ) : null;
                    })()}
                  </Flex>
                  {/* Sparkline — taller, full width */}
                  {sparkSlice.length > 1 && (
                    <div>
                      <Text style={{ fontSize: 13, opacity: 0.4, marginBottom: 2, display: "block" }}>Apdex (green) &amp; Duration (blue) ±2h around deploy</Text>
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
            { id: "Timestamp", header: "Time", accessor: "Timestamp", cell: ({ value }: any) => <Text style={{ fontSize: 13 }}>{value}</Text> },
            { id: "Hour", header: "Hour", accessor: "Hour", cell: ({ value }: any) => <Text style={{ fontSize: 13, opacity: 0.6 }}>{value}</Text> },
            { id: "Name", header: "Deployment", accessor: "Name", cell: ({ value }: any) => <Strong style={{ color: BLUE }}>{value}</Strong> },
            { id: "Count", header: "Events", accessor: "Count", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ textAlign: "center", width: "100%", display: "block" }}>{value}</Text> },
            { id: "Source", header: "Source", accessor: "Source", cell: ({ value }: any) => <Text style={{ fontSize: 13, opacity: 0.6 }}>{value}</Text> },
            { id: "Version", header: "Version", accessor: "Version", cell: ({ value }: any) => <Text style={{ fontSize: 13, opacity: 0.6 }}>{value}</Text> },
            { id: "Stage", header: "Stage", accessor: "Stage", cell: ({ value }: any) => <Text style={{ fontSize: 13, opacity: 0.6 }}>{value}</Text> },
            { id: "Component", header: "Component", accessor: "Component", cell: ({ value }: any) => <Text style={{ fontSize: 13, opacity: 0.6 }}>{value}</Text> },
            { id: "Service", header: "Service", accessor: "Service", cell: ({ value }: any) => <Text style={{ fontSize: 13, opacity: 0.6 }}>{value}</Text> },
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

      {/* Feature Flag & Configuration Changes */}
      <SectionHeader title="Feature Flags & Configuration Changes" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Non-deployment changes detected from custom events (feature flags, config updates, annotations).</Text>
      {(() => {
        const flagRows = (featureFlagData?.data?.records ?? []) as any[];
        if (flagRows.length === 0) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>No feature flag or configuration change events detected. Send CUSTOM_INFO or CUSTOM_CONFIGURATION events from your feature flag provider to see them here.</Text></div>;
        return (
          <div className="uj-table-tile"><DataTable sortable data={flagRows.map((r: any, i: number) => ({
            "#": i + 1,
            Type: String(r["event.type"] ?? "unknown"),
            Description: String(r["dt.event.description"] ?? "").substring(0, 60),
            Count: Number(r.count ?? 0),
            "First Seen": r.first_time ? new Date(r.first_time).toLocaleString() : "",
            "Last Seen": r.last_time ? new Date(r.last_time).toLocaleString() : "",
          }))} columns={[
            { id: "#", header: "#", accessor: "#" },
            { id: "Type", header: "Type", accessor: "Type", cell: ({ value }: any) => <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 3, background: `${PURPLE}20`, color: PURPLE, fontWeight: 600 }}>{value.replace("CUSTOM_", "")}</span> },
            { id: "Description", header: "Description", accessor: "Description", cell: ({ value }: any) => <Text style={{ fontSize: 12 }}>{value}</Text> },
            { id: "Count", header: "Events", accessor: "Count", sortType: "number" as any, cell: ({ value }: any) => <Strong>{value}</Strong> },
            { id: "First Seen", header: "First", accessor: "First Seen", cell: ({ value }: any) => <Text style={{ fontSize: 11, opacity: 0.6 }}>{value}</Text> },
            { id: "Last Seen", header: "Last", accessor: "Last Seen", cell: ({ value }: any) => <Text style={{ fontSize: 11, opacity: 0.6 }}>{value}</Text> },
          ]} /></div>
        );
      })()}

      {/* Statistical Changepoint Detection */}
      <SectionHeader title="Statistical Changepoint Detection" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Auto-detects significant metric shifts that weren't tagged as deployments — identifies configuration drift and hidden changes.</Text>
      {(() => {
        const impactRecords = (impactData?.data?.records ?? []) as any[];
        if (impactRecords.length < 6) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>Insufficient hourly data for changepoint detection (need 6+ hours).</Text></div>;
        // Simple CUSUM-style changepoint detection on hourly apdex
        const hourlyApdex = impactRecords.map((r: any) => {
          const total = Number(r.actions ?? 0);
          const sat = Number(r.satisfied ?? 0);
          const tol = Number(r.tolerating ?? 0);
          return { hour: String(r.hour_ts ?? ""), apdex: calcApdex(sat, tol, total), sessions: Number(r.sessions ?? 0) };
        }).filter(h => h.hour);
        if (hourlyApdex.length < 6) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>Insufficient data.</Text></div>;
        const mean = hourlyApdex.reduce((a, h) => a + h.apdex, 0) / hourlyApdex.length;
        const stdDev = Math.sqrt(hourlyApdex.reduce((a, h) => a + Math.pow(h.apdex - mean, 2), 0) / hourlyApdex.length) || 0.01;
        const changepoints = hourlyApdex.map((h, i) => ({ ...h, idx: i, zScore: (h.apdex - mean) / stdDev })).filter(h => Math.abs(h.zScore) > 1.5);
        if (changepoints.length === 0) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ color: GREEN }}>✓ No significant changepoints detected — metrics are stable within expected variance.</Text></div>;
        return (
          <Flex flexDirection="column" gap={8}>
            {changepoints.slice(0, 8).map((cp, i) => (
              <div key={i} className="uj-table-tile" style={{ padding: 10, borderLeft: `3px solid ${cp.zScore < -1.5 ? RED : GREEN}` }}>
                <Flex justifyContent="space-between" alignItems="center">
                  <Flex gap={8} alignItems="center">
                    <span style={{ fontSize: 18 }}>{cp.zScore < -1.5 ? "📉" : "📈"}</span>
                    <Text style={{ fontSize: 12 }}><Strong>Changepoint at {cp.hour.substring(11, 16)}</Strong> — Apdex {cp.apdex.toFixed(2)} ({cp.zScore > 0 ? "+" : ""}{cp.zScore.toFixed(1)}σ from mean)</Text>
                  </Flex>
                  <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 3, background: Math.abs(cp.zScore) > 2.5 ? `${RED}20` : `${ORANGE}20`, color: Math.abs(cp.zScore) > 2.5 ? RED : ORANGE, fontWeight: 600 }}>{Math.abs(cp.zScore) > 2.5 ? "HIGH" : "MODERATE"} confidence</span>
                </Flex>
              </div>
            ))}
          </Flex>
        );
      })()}

    </Flex>
  );
}

// ===========================================================================
// SLO TRACKER TAB
// ===========================================================================
function SLOTrackerTab({ apdexTrend, cwvTrend, quality, overallApdex, overallConv, cwv, isLoading, saveState, savedTargets, frontend }: { apdexTrend: any; cwvTrend: any; quality: any; overallApdex: number; overallConv: number; cwv: any; isLoading: boolean; saveState: any; savedTargets: any; frontend: string }) {
  const DEFAULT_SLO_TARGETS: Record<string, number> = { Apdex: 0.85, "Error Rate": 2.0, LCP: CWV.lcp.good, CLS: CWV.cls.good, INP: CWV.inp.good, TTFB: CWV.ttfb.good };
  const [targets, setTargets] = useState<Record<string, number>>(DEFAULT_SLO_TARGETS);
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [createdSlos, setCreatedSlos] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (savedTargets?.data?.value) {
      try { const parsed = JSON.parse(savedTargets.data.value); setTargets({ ...DEFAULT_SLO_TARGETS, ...parsed }); } catch {}
    }
  }, [savedTargets?.data?.value]);

  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeSLOTracker(quality, overallApdex, overallConv, cwv), [quality, overallApdex, overallConv, cwv]));
  if (isLoading) return <Loading />;

  function startEdit(name: string) { setEditing(name); setEditVal(String(targets[name] ?? DEFAULT_SLO_TARGETS[name])); }
  function commitEdit(name: string) {
    const v = parseFloat(editVal);
    if (!isNaN(v) && v > 0) {
      const next = { ...targets, [name]: v };
      setTargets(next);
      saveState({ key: SLO_TARGETS_STATE_KEY, body: { value: JSON.stringify(next) } });
    }
    setEditing(null);
  }
  function resetTarget(name: string) {
    const next = { ...targets, [name]: DEFAULT_SLO_TARGETS[name] };
    setTargets(next);
    saveState({ key: SLO_TARGETS_STATE_KEY, body: { value: JSON.stringify(next) } });
  }

  function getSloCreateUrl(slo: { name: string; target: number; direction: string }) {
    return `${ENV_URL}/ui/apps/dynatrace.service.level.objectives`;
  }

  const apdexRecords = (apdexTrend.data?.records ?? []) as any[];
  const cwvRecords = (cwvTrend.data?.records ?? []) as any[];

  // SLO definitions with editable targets
  const slos = [
    { name: "Apdex", target: targets["Apdex"], direction: "above" as const, format: (v: number) => v.toFixed(2), color: apdexClr },
    { name: "Error Rate", target: targets["Error Rate"], direction: "below" as const, format: fmtPct, color: (v: number) => v <= targets["Error Rate"] ? GREEN : v <= 5 ? YELLOW : RED },
    { name: "LCP", target: targets["LCP"], direction: "below" as const, format: fmt, color: (v: number) => cwvClr(v, "lcp") },
    { name: "CLS", target: targets["CLS"], direction: "below" as const, format: (v: number) => v.toFixed(3), color: (v: number) => cwvClr(v, "cls") },
    { name: "INP", target: targets["INP"], direction: "below" as const, format: fmt, color: (v: number) => cwvClr(v, "inp") },
    { name: "TTFB", target: targets["TTFB"], direction: "below" as const, format: fmt, color: (v: number) => cwvClr(v, "ttfb") },
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
    if (data.length < 2) return <Text style={{ fontSize: 13, opacity: 0.5 }}>Insufficient data</Text>;
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
      {aiPanel}
      <SectionHeader title="Service Level Objectives" />
      <Flex gap={12} flexWrap="wrap">
        {sloResults.map(slo => (
          <div key={slo.name} className="uj-table-tile" style={{ padding: 16, flex: "1 1 320px", minWidth: 320, borderLeft: `3px solid ${slo.sClr}` }}>
            <Flex justifyContent="space-between" alignItems="center">
              <Strong style={{ fontSize: 14 }}>{slo.name}</Strong>
              <Flex gap={8} alignItems="center">
                <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, background: `${slo.sClr}18`, color: slo.sClr, fontWeight: 700 }}>{slo.status}</span>
                <a href={getSloCreateUrl(slo)} target="_blank" rel="noopener noreferrer" title={`Create "${slo.name}" SLO in Dynatrace`} style={{ textDecoration: "none" }}>
                  <Button variant="emphasized" style={{ fontSize: 11, padding: "2px 8px", lineHeight: 1.2 }}>{createdSlos.has(slo.name) ? "\u2713 Created" : "+ Create SLO"}</Button>
                </a>
              </Flex>
            </Flex>
            <Flex gap={24} style={{ marginTop: 12 }}>
              <div><Text style={{ fontSize: 12, opacity: 0.5 }}>Current</Text><Strong style={{ display: "block", fontSize: 18, color: slo.color(slo.current) }}>{slo.format(slo.current)}</Strong></div>
              <div>
                <Text style={{ fontSize: 12, opacity: 0.5 }}>Target</Text>
                {editing === slo.name ? (
                  <Flex gap={4} alignItems="center" style={{ marginTop: 2 }}>
                    <input type="number" step="any" value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={e => { if (e.key === "Enter") commitEdit(slo.name); if (e.key === "Escape") setEditing(null); }} autoFocus style={{ width: 70, fontSize: 13, padding: "2px 4px", background: "rgba(128,128,128,0.1)", border: "1px solid rgba(128,128,128,0.3)", borderRadius: 3, color: "inherit" }} />
                    <span onClick={() => commitEdit(slo.name)} style={{ cursor: "pointer", fontSize: 14, color: GREEN }} title="Save">{"\u2713"}</span>
                    <span onClick={() => setEditing(null)} style={{ cursor: "pointer", fontSize: 14, opacity: 0.5 }} title="Cancel">{"\u2717"}</span>
                  </Flex>
                ) : (
                  <Flex gap={4} alignItems="center">
                    <Text style={{ display: "block", fontSize: 14 }}>{slo.direction === "above" ? "\u2265" : "\u2264"} {slo.format(slo.target)}</Text>
                    <span onClick={() => startEdit(slo.name)} style={{ cursor: "pointer", fontSize: 13, opacity: 0.5 }} title="Edit target">{"\u270e"}</span>
                    {targets[slo.name] !== DEFAULT_SLO_TARGETS[slo.name] && <span onClick={() => resetTarget(slo.name)} style={{ cursor: "pointer", fontSize: 11, opacity: 0.4 }} title="Reset to default">{"\u21ba"}</span>}
                  </Flex>
                )}
              </div>
              <div><Text style={{ fontSize: 12, opacity: 0.5 }}>Compliance</Text><Strong style={{ display: "block", fontSize: 14, color: slo.compliancePct >= 95 ? GREEN : slo.compliancePct >= 80 ? YELLOW : RED }}>{slo.compliancePct.toFixed(1)}%</Strong></div>
            </Flex>
            <Flex gap={24} style={{ marginTop: 8 }}>
              <div><Text style={{ fontSize: 12, opacity: 0.5 }}>Budget Remaining</Text><Strong style={{ display: "block", fontSize: 14, color: slo.sClr }}>{slo.budgetRemaining}/{slo.budgetTotal} ({slo.budgetPct.toFixed(0)}%)</Strong></div>
              <div><Text style={{ fontSize: 12, opacity: 0.5 }}>Violations</Text><Text style={{ display: "block", fontSize: 14, color: slo.violations > 0 ? RED : GREEN }}>{slo.violations}/{slo.totalBuckets}</Text></div>
              <div><Text style={{ fontSize: 12, opacity: 0.5 }}>Time to Exhaust</Text><Text style={{ display: "block", fontSize: 14 }}>{slo.hoursToExhaust != null ? `~${slo.hoursToExhaust}h` : slo.budgetPct <= 0 ? "Exhausted" : "Safe"}</Text></div>
            </Flex>
            <div style={{ marginTop: 12 }}>
              <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 4, display: "block" }}>Error Budget Burn-Down</Text>
              <BurnDownChart data={slo.burnDown} budgetTotal={slo.budgetTotal} clr={slo.sClr} />
            </div>
            <ProgressBar value={slo.budgetPct} style={{ height: 6, marginTop: 8 }} />
          </div>
        ))}
      </Flex>

      <SectionHeader title="SLO Summary" />
      <div className="uj-table-tile">
        <DataTable sortable resizable fullWidth data={sloResults.map(s => ({
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
          { id: "Status", header: "Status", accessor: "Status", cell: ({ value }: any) => { const c = value === "HEALTHY" ? GREEN : value === "AT RISK" ? ORANGE : RED; return <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, background: `${c}18`, color: c, fontWeight: 700 }}>{value}</span>; } },
        ]} />
      </div>
    </Flex>
  );
}

// ===========================================================================
// SESSION REPLAY SPOTLIGHT TAB
// ===========================================================================
function SessionReplaySpotlightTab({ data, isLoading }: { data: any; isLoading: boolean }) {
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeGenericTab("Session Replay Spotlight"), []));
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
      {aiPanel}
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
            <Text style={{ fontSize: 12, opacity: 0.5 }}>{c.label}</Text>
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
                        {s.has_crash && <span style={{ fontSize: 12, padding: "1px 6px", borderRadius: 3, background: `${RED}20`, color: RED, fontWeight: 700 }}>CRASH</span>}
                        {s.is_bounce && <span style={{ fontSize: 12, padding: "1px 6px", borderRadius: 3, background: `${ORANGE}20`, color: ORANGE, fontWeight: 700 }}>BOUNCE</span>}
                      </Flex>
                      <Text style={{ fontSize: 13, opacity: 0.6 }}>
                        {Number(s.dur_s ?? 0).toFixed(1)}s \u00b7 {s.err} error{Number(s.err) !== 1 ? "s" : ""} \u00b7 {s.navs} nav{Number(s.navs) !== 1 ? "s" : ""} \u00b7 {s.interactions} interaction{Number(s.interactions) !== 1 ? "s" : ""}
                      </Text>
                      <Text style={{ fontSize: 12, opacity: 0.4 }}>{s.device} \u00b7 {s.browser_name} \u00b7 {s.country}{s.user_tag ? ` \u00b7 ${s.user_tag}` : ""}</Text>
                    </div>
                  </Flex>
                  <Link href={replayUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="emphasized" style={{ fontSize: 13 }}>{"\u25B6"} Replay</Button>
                  </Link>
                </Flex>
              </div>
            );
          })}
        </Flex>
      )}

      {sessions.length > 0 && (
        <>
          <SectionHeader title="AI Session Summarization" />
          <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Auto-generated one-sentence descriptions of what users did and where they struggled. Sessions grouped by behavioral pattern.</Text>
          {(() => {
            // Generate summaries based on session attributes
            const summarized = sessions.slice(0, 10).map((s: any) => {
              const pages = Number(s.navs ?? s.actions ?? 0);
              const errors = Number(s.err ?? s.errors ?? 0);
              const duration = Number(s.dur_s ?? 0);
              const hasCrash = Boolean(s.has_crash);
              const hasBounce = Boolean(s.is_bounce);
              let summary = `Viewed ${pages} page${pages !== 1 ? "s" : ""} over ${duration.toFixed(1)}s`;
              if (errors > 0) summary += `, encountered ${errors} error${errors !== 1 ? "s" : ""}`;
              if (hasCrash) summary += " (session crashed)";
              if (hasBounce) summary += " — bounced after first page";
              else if (pages > 5) summary += " — high engagement session";
              return { ...s, _summary: summary };
            });
            // Group by error pattern
            const errorGroups = new Map<string, number>();
            sessions.forEach((s: any) => {
              const pattern = Number(s.err ?? s.errors ?? 0) > 0 ? "with-errors" : "clean";
              errorGroups.set(pattern, (errorGroups.get(pattern) ?? 0) + 1);
            });
            return (
              <Flex flexDirection="column" gap={8}>
                <Flex gap={8} flexWrap="wrap" style={{ marginBottom: 8 }}>
                  {[...errorGroups.entries()].map(([pattern, count]) => (
                    <span key={pattern} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, background: pattern === "with-errors" ? `${RED}15` : `${GREEN}15`, color: pattern === "with-errors" ? RED : GREEN, fontWeight: 600 }}>{pattern}: {count} sessions</span>
                  ))}
                </Flex>
                {summarized.map((s: any, i: number) => (
                  <div key={i} className="uj-table-tile" style={{ padding: 10, borderLeft: `3px solid ${Number(s.err ?? 0) > 0 ? RED : Number(s.navs ?? 0) > 5 ? GREEN : "rgba(128,128,128,0.3)"}` }}>
                    <Text style={{ fontSize: 12 }}>🎬 {s._summary}</Text>
                  </div>
                ))}
              </Flex>
            );
          })()}

          <SectionHeader title="Session Detail Table" />
          <div className="uj-table-tile">
            <DataTable sortable resizable fullWidth data={sessions.map((s: any) => ({
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

function ABComparisonTab({ segAData, segBData, segACwv, segBCwv, dimension, setDimension, segA, segB, setSegA, setSegB, isLoading, aov = 0, overallConv = 0 }: {
  segAData: any; segBData: any; segACwv: any; segBCwv: any;
  dimension: "device" | "browser" | "country" | "custom"; setDimension: (d: "device" | "browser" | "country" | "custom") => void;
  segA: string; segB: string; setSegA: (s: string) => void; setSegB: (s: string) => void;
  isLoading: boolean; aov?: number; overallConv?: number;
}) {
  const [customA, setCustomA] = useState(segA);
  const [customB, setCustomB] = useState(segB);
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeGenericTab("A/B Comparison"), []));

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
      {aiPanel}
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
          <Text style={{ fontSize: 13, opacity: 0.5, display: "block", marginBottom: 4 }}>Segment A Filter (DQL)</Text>
          <TextInput value={customA} onChange={(v: string) => setCustomA(v)} placeholder='device.type == "desktop"' />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <Text style={{ fontSize: 13, opacity: 0.5, display: "block", marginBottom: 4 }}>Segment B Filter (DQL)</Text>
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
            <Text style={{ flex: 1, textAlign: "center", fontSize: 13, opacity: 0.6 }}>{segA}</Text>
            <Text style={{ flex: 1, textAlign: "center", fontSize: 13, opacity: 0.6 }}>{segB}</Text>
            <div style={{ flex: 1 }} />
          </Flex>

          <div className="uj-table-tile" style={{ padding: 16 }}>
            <Strong style={{ fontSize: 13, marginBottom: 8, display: "block" }}>Core Metrics</Strong>
            <CmpRow label="Sessions" valA={a.totalSessions} valB={b.totalSessions} formatFn={v => fmtCount(Math.abs(v))} />
            <CmpRow label="Apdex" valA={a.apdex} valB={b.apdex} formatFn={v => Math.abs(v).toFixed(2)} colorFn={apdexClr} />
            <CmpRow label="Avg Duration" valA={a.avgDur} valB={b.avgDur} formatFn={v => fmt(Math.abs(v))} lowerBetter />
            <CmpRow label="P90 Duration" valA={a.p90Dur} valB={b.p90Dur} formatFn={v => fmt(Math.abs(v))} lowerBetter />
            <CmpRow label="Error Rate" valA={a.errRate} valB={b.errRate} formatFn={v => fmtPct(Math.abs(v))} lowerBetter />
            {aov > 0 && overallConv > 0 && <CmpRow label="Est Revenue" valA={a.totalSessions * (overallConv / 100) * aov} valB={b.totalSessions * (overallConv / 100) * aov} formatFn={v => fmtCurrency(Math.abs(v))} />}
          </div>

          <div className="uj-table-tile" style={{ padding: 16 }}>
            <Strong style={{ fontSize: 13, marginBottom: 8, display: "block" }}>Core Web Vitals</Strong>
            <CmpRow label="LCP" valA={aCwv.lcp} valB={bCwv.lcp} formatFn={v => fmt(Math.abs(v))} lowerBetter colorFn={v => cwvClr(Math.abs(v), "lcp")} />
            <CmpRow label="CLS" valA={aCwv.cls} valB={bCwv.cls} formatFn={v => Math.abs(v).toFixed(3)} lowerBetter colorFn={v => cwvClr(Math.abs(v), "cls")} />
            <CmpRow label="INP" valA={aCwv.inp} valB={bCwv.inp} formatFn={v => fmt(Math.abs(v))} lowerBetter colorFn={v => cwvClr(Math.abs(v), "inp")} />
            <CmpRow label="TTFB" valA={aCwv.ttfb} valB={bCwv.ttfb} formatFn={v => fmt(Math.abs(v))} lowerBetter colorFn={v => cwvClr(Math.abs(v), "ttfb")} />
          </div>

          {(() => {
            const cmp = (va: number, vb: number, lowerBetter = false) => {
              if (va === vb || (va == null && vb == null)) return 0;
              const aWins = lowerBetter ? va < vb : va > vb;
              return aWins ? 1 : -1;
            };
            const coreResults = [cmp(a.totalSessions, b.totalSessions), cmp(a.apdex, b.apdex), cmp(a.avgDur, b.avgDur, true), cmp(a.p90Dur, b.p90Dur, true), cmp(a.errRate, b.errRate, true)];
            const coreAWins = coreResults.filter(r => r === 1).length;
            const coreBWins = coreResults.filter(r => r === -1).length;
            const coreTied = coreResults.filter(r => r === 0).length;
            const coreWinner = coreAWins > coreBWins ? "A" : coreBWins > coreAWins ? "B" : null;
            const coreWinCount = Math.max(coreAWins, coreBWins);
            const coreColor = coreWinner === "A" ? BLUE : coreWinner === "B" ? PURPLE : YELLOW;

            const cwvResults = [cmp(aCwv.lcp, bCwv.lcp, true), cmp(aCwv.cls, bCwv.cls, true), cmp(aCwv.inp, bCwv.inp, true), cmp(aCwv.ttfb, bCwv.ttfb, true)];
            const cwvAWins = cwvResults.filter(r => r === 1).length;
            const cwvBWins = cwvResults.filter(r => r === -1).length;
            const cwvTied = cwvResults.filter(r => r === 0).length;
            const cwvWinner = cwvAWins > cwvBWins ? "A" : cwvBWins > cwvAWins ? "B" : null;
            const cwvWinCount = Math.max(cwvAWins, cwvBWins);
            const cwvColor = cwvWinner === "A" ? BLUE : cwvWinner === "B" ? PURPLE : YELLOW;

            const coreSummary = coreWinner
              ? `Segment ${coreWinner} outperforms on ${coreWinCount}/5 core metrics${coreTied ? ` (${coreTied} tied)` : ""}`
              : `Segments tied across core metrics${coreTied ? ` (${coreTied} equal)` : ""}`;
            const cwvSummary = cwvWinner
              ? `Segment ${cwvWinner} outperforms on ${cwvWinCount}/4 Core Web Vitals${cwvTied ? ` (${cwvTied} tied)` : ""}`
              : `Segments tied across Core Web Vitals${cwvTied ? ` (${cwvTied} equal)` : ""}`;

            return (
              <Flex gap={12}>
                <div className="uj-table-tile" style={{ padding: 16, borderLeft: `3px solid ${coreColor}`, flex: 1 }}>
                  <Strong style={{ color: coreColor }}>{coreSummary}</Strong>
                  <Paragraph style={{ fontSize: 12, marginTop: 6, opacity: 0.7 }}>
                    {coreWinner === "A" && "Consider investigating Segment B for optimization opportunities."}
                    {coreWinner === "B" && "Consider investigating Segment A for optimization opportunities."}
                    {!coreWinner && "Both segments show comparable performance. Consider more granular segmentation."}
                  </Paragraph>
                </div>
                <div className="uj-table-tile" style={{ padding: 16, borderLeft: `3px solid ${cwvColor}`, flex: 1 }}>
                  <Strong style={{ color: cwvColor }}>{cwvSummary}</Strong>
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

      {/* Statistical Significance Testing */}
      <SectionHeader title="Statistical Significance" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Two-proportion z-test to determine whether metric deltas between segments are statistically meaningful.</Text>
      {(() => {
        const aRecords = (segAData?.data?.records ?? []) as any[];
        const bRecords = (segBData?.data?.records ?? []) as any[];
        const aRec = aRecords[0] as any;
        const bRec = bRecords[0] as any;
        if (!aRec || !bRec) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>Both segments need data for significance testing.</Text></div>;
        const nA = Number(aRec.total ?? aRec.actions ?? 0);
        const nB = Number(bRec.total ?? bRec.actions ?? 0);
        const satA = Number(aRec.satisfied ?? 0); const satB = Number(bRec.satisfied ?? 0);
        const tolA = Number(aRec.tolerating ?? 0); const tolB = Number(bRec.tolerating ?? 0);
        const apdexA = calcApdex(satA, tolA, nA);
        const apdexB = calcApdex(satB, tolB, nB);
        // Two-proportion z-test on "satisfied" rate
        const pA = nA > 0 ? satA / nA : 0;
        const pB = nB > 0 ? satB / nB : 0;
        const pPool = (nA + nB) > 0 ? (satA + satB) / (nA + nB) : 0;
        const se = Math.sqrt(pPool * (1 - pPool) * (1 / Math.max(1, nA) + 1 / Math.max(1, nB)));
        const zScore = se > 0 ? (pA - pB) / se : 0;
        const pValue = 2 * (1 - normalCDF(Math.abs(zScore)));
        const isSignificant = pValue < 0.05;
        const confInterval = 1.96 * se;
        // Minimum detectable effect
        const mde = nA > 0 && nB > 0 ? 2.8 * Math.sqrt(pPool * (1 - pPool) * (1 / nA + 1 / nB)) * 100 : 0;
        return (
          <Flex gap={16} flexWrap="wrap">
            <div className="uj-kpi-card">
              <Text className="uj-kpi-label">p-value</Text>
              <Heading level={2} className="uj-kpi-value" style={{ color: pValue < 0.05 ? GREEN : pValue < 0.1 ? YELLOW : RED }}>{pValue < 0.001 ? "<0.001" : pValue.toFixed(3)}</Heading>
              <Text style={{ fontSize: 10, opacity: 0.5 }}>{isSignificant ? "✓ Significant (p<0.05)" : "✗ Not significant"}</Text>
            </div>
            <div className="uj-kpi-card">
              <Text className="uj-kpi-label">Z-Score</Text>
              <Heading level={2} className="uj-kpi-value" style={{ color: Math.abs(zScore) > 1.96 ? GREEN : YELLOW }}>{zScore.toFixed(2)}</Heading>
              <Text style={{ fontSize: 10, opacity: 0.5 }}>95% CI: ±{(confInterval * 100).toFixed(2)}pp</Text>
            </div>
            <div className="uj-kpi-card">
              <Text className="uj-kpi-label">Effect Size</Text>
              <Heading level={2} className="uj-kpi-value" style={{ color: Math.abs(pA - pB) > 0.05 ? BLUE : "inherit" }}>{((pA - pB) * 100).toFixed(2)}pp</Heading>
              <Text style={{ fontSize: 10, opacity: 0.5 }}>Seg A vs B satisfaction</Text>
            </div>
            <div className="uj-kpi-card">
              <Text className="uj-kpi-label">Min Detectable Effect</Text>
              <Heading level={2} className="uj-kpi-value" style={{ color: PURPLE }}>{mde.toFixed(1)}pp</Heading>
              <Text style={{ fontSize: 10, opacity: 0.5 }}>With current sample sizes</Text>
            </div>
            <div className="uj-kpi-card">
              <Text className="uj-kpi-label">Sample Sizes</Text>
              <Heading level={3} className="uj-kpi-value" style={{ color: BLUE }}>{fmtCount(nA)} / {fmtCount(nB)}</Heading>
              <Text style={{ fontSize: 10, opacity: 0.5 }}>Seg A / Seg B</Text>
            </div>
          </Flex>
        );
      })()}

    </Flex>
  );
}

// ===========================================================================
// TAB: Cohort Retention
// ===========================================================================
function CohortRetentionTab({ retentionData, sessionData, isLoading, steps, aov }: { retentionData: any; sessionData: any; isLoading: boolean; steps: StepDef[]; aov: number }) {
  // Hook must be above early returns
  const analysisData = useMemo(() => {
    const retRecords = (retentionData?.data?.records ?? []) as any[];
    const sessRecords = (sessionData?.data?.records ?? []) as any[];
    const cohorts = retRecords.map((r: any) => ({ sessions: Number(r.total_sessions ?? 0), conversions: Number(r.converted_sessions ?? 0), day: String(r.day_bucket ?? "").substring(0, 10) })).filter((c: any) => c.day);
    const dayMap = new Map<string, { sessions: number; conversions: number }>();
    for (const c of cohorts) { const d = dayMap.get(c.day) ?? { sessions: 0, conversions: 0 }; d.sessions += c.sessions; d.conversions += c.conversions; dayMap.set(c.day, d); }
    const dailyData = Array.from(dayMap.entries()).map(([day, d]) => ({ day, ...d, convRate: d.sessions > 0 ? (d.conversions / d.sessions) * 100 : 0 })).sort((a, b) => a.day.localeCompare(b.day));
    const totalUsers = sessRecords.reduce((a: number, r: any) => a + Number(r.unique_users ?? 0), 0);
    const totalSessions = dailyData.reduce((a, d) => a + d.sessions, 0);
    const totalConversions = dailyData.reduce((a, d) => a + d.conversions, 0);
    const avgSessionsPerUser = totalUsers > 0 ? totalSessions / totalUsers : 0;
    const overallConvRate = totalSessions > 0 ? (totalConversions / totalSessions) * 100 : 0;
    return { dailyData, avgSessionsPerUser, overallConvRate };
  }, [retentionData, sessionData]);
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeCohortRetention(analysisData.dailyData, analysisData.avgSessionsPerUser, analysisData.overallConvRate), [analysisData]));
  if (isLoading) return <Loading />;

  const retRecords = (retentionData?.data?.records ?? []) as any[];
  const sessRecords = (sessionData?.data?.records ?? []) as any[];

  // Parse daily cohorts: day_bucket, deviceType, sessions, users, conversions
  type CohortDay = { day: string; device: string; sessions: number; users: number; conversions: number; convRate: number };
  const cohorts: CohortDay[] = retRecords.map((r: any) => {
    const sessions = Number(r.total_sessions ?? 0);
    const users = Number(r.total_sessions ?? 0);
    const conversions = Number(r.converted_sessions ?? 0);
    return { day: String(r.day_bucket ?? "").substring(0, 10), device: String(r.deviceType ?? "Unknown"), sessions, users, conversions, convRate: sessions > 0 ? (conversions / sessions) * 100 : 0 };
  }).filter((c: CohortDay) => c.day);

  // Aggregate by day
  const dayMap = new Map<string, { sessions: number; users: number; conversions: number }>();
  for (const c of cohorts) {
    const d = dayMap.get(c.day) ?? { sessions: 0, users: 0, conversions: 0 };
    d.sessions += c.sessions;
    d.users += c.users;
    d.conversions += c.conversions;
    dayMap.set(c.day, d);
  }
  const dailyData = Array.from(dayMap.entries()).map(([day, d]) => ({ day, ...d, convRate: d.sessions > 0 ? (d.conversions / d.sessions) * 100 : 0 })).sort((a, b) => a.day.localeCompare(b.day));

  // Session count data (unique users + sessions per day)
  const sessionCountData = sessRecords.map((r: any) => ({
    day: String(r.day_bucket ?? "").substring(0, 10),
    uniqueUsers: Number(r.unique_users ?? 0),
    totalSessions: Number(r.sessions ?? 0),
    sessionsPerUser: Number(r.unique_users ?? 0) > 0 ? Number(r.sessions ?? 0) / Number(r.unique_users ?? 0) : 0,
  })).filter((d: any) => d.day).sort((a: any, b: any) => a.day.localeCompare(b.day));

  // Device breakdown
  const deviceMap = new Map<string, { sessions: number; conversions: number }>();
  for (const c of cohorts) {
    const d = deviceMap.get(c.device) ?? { sessions: 0, conversions: 0 };
    d.sessions += c.sessions;
    d.conversions += c.conversions;
    deviceMap.set(c.device, d);
  }
  const devices = Array.from(deviceMap.entries()).map(([device, d]) => ({ device, ...d, convRate: d.sessions > 0 ? (d.conversions / d.sessions) * 100 : 0 })).sort((a, b) => b.sessions - a.sessions);

  const totalUsers = sessionCountData.reduce((a: number, d: any) => a + d.uniqueUsers, 0);
  const totalSessions = dailyData.reduce((a, d) => a + d.sessions, 0);
  const totalConversions = dailyData.reduce((a, d) => a + d.conversions, 0);
  const overallConvRate = totalSessions > 0 ? (totalConversions / totalSessions) * 100 : 0;
  const avgSessionsPerUser = totalUsers > 0 ? totalSessions / totalUsers : 0;

  // Chart: daily sessions + conversion rate overlay
  const W = 720, H = 260, PAD = { top: 30, right: 60, bottom: 40, left: 60 };
  const iW = W - PAD.left - PAD.right, iH = H - PAD.top - PAD.bottom;
  const maxSess = Math.max(1, ...dailyData.map(d => d.sessions));
  const maxConvR = Math.max(1, ...dailyData.map(d => d.convRate));

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      {aiPanel}
      <SectionHeader title="Cohort Retention — Daily user cohorts and conversion retention" />
      <Flex gap={16} flexWrap="wrap">
        <div className="uj-kpi-card"><Text className="uj-kpi-label">Total Unique Users</Text><Heading level={2} className="uj-kpi-value" style={{ color: BLUE }}>{fmtCount(totalUsers)}</Heading></div>
        <div className="uj-kpi-card"><Text className="uj-kpi-label">Total Sessions</Text><Heading level={2} className="uj-kpi-value" style={{ color: PURPLE }}>{fmtCount(totalSessions)}</Heading></div>
        <div className="uj-kpi-card"><Text className="uj-kpi-label">Sessions/User</Text><Heading level={2} className="uj-kpi-value" style={{ color: CYAN }}>{avgSessionsPerUser.toFixed(1)}</Heading></div>
        <div className="uj-kpi-card"><Text className="uj-kpi-label">Total Conversions</Text><Heading level={2} className="uj-kpi-value" style={{ color: GREEN }}>{fmtCount(totalConversions)}</Heading></div>
        <div className="uj-kpi-card"><Text className="uj-kpi-label">Overall Conv Rate</Text><Heading level={2} className="uj-kpi-value" style={{ color: overallConvRate >= 5 ? GREEN : overallConvRate >= 2 ? YELLOW : RED }}>{fmtPct(overallConvRate)}</Heading></div>
        {aov > 0 && <div className="uj-kpi-card"><Text className="uj-kpi-label">Cohort Revenue</Text><Heading level={2} className="uj-kpi-value" style={{ color: GREEN }}>{fmtCurrency(totalConversions * aov)}</Heading></div>}
      </Flex>

      {/* Daily cohort chart */}
      <SectionHeader title="Daily Sessions & Conversion Rate" />
      <div className="uj-table-tile" style={{ padding: 16 }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
          <text x={PAD.left} y={PAD.top - 10} fill="rgba(255,255,255,0.4)" fontSize={10}>Sessions</text>
          <text x={W - PAD.right} y={PAD.top - 10} textAnchor="end" fill={GREEN} fontSize={10}>Conv %</text>
          {dailyData.map((d, i) => {
            const bW = Math.max(4, iW / dailyData.length - 2);
            const x = PAD.left + i * (iW / dailyData.length);
            const bH = Math.max(1, (d.sessions / maxSess) * iH);
            const y = PAD.top + iH - bH;
            return (
              <g key={i}>
                <rect x={x} y={y} width={bW} height={bH} rx={2} fill={BLUE} fillOpacity={0.4}><title>{d.day}: {fmtCount(d.sessions)} sessions, {fmtPct(d.convRate)} conv</title></rect>
                {i % Math.max(1, Math.floor(dailyData.length / 8)) === 0 && <text x={x + bW / 2} y={H - PAD.bottom + 14} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={8}>{d.day.substring(5)}</text>}
              </g>
            );
          })}
          {/* Conversion rate line */}
          {dailyData.length > 1 && (
            <polyline fill="none" stroke={GREEN} strokeWidth={2} opacity={0.8} points={dailyData.map((d, i) => {
              const x = PAD.left + i * (iW / dailyData.length) + (iW / dailyData.length) / 2;
              const y = PAD.top + iH - (d.convRate / maxConvR) * iH;
              return `${x},${y}`;
            }).join(" ")} />
          )}
        </svg>
      </div>

      {/* Device breakdown */}
      <SectionHeader title="Cohort by Device Type" />
      <div className="uj-table-tile"><DataTable sortable resizable fullWidth data={devices.map(d => ({
        Device: d.device, Sessions: d.sessions, Conversions: d.conversions, "Conv Rate": d.convRate,
      }))} columns={[
        { id: "Device", header: "Device", accessor: "Device", cell: ({ value }: any) => <Strong>{value}</Strong> },
        { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: BLUE }}>{fmtCount(value)}</Strong> },
        { id: "Conversions", header: "Conversions", accessor: "Conversions", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: GREEN }}>{fmtCount(value)}</Strong> },
        { id: "Conv Rate", header: "Conv %", accessor: "Conv Rate", sortType: "number" as any, cell: ({ value }: any) => <span style={{ display: "inline-block", width: "100%", padding: "2px 8px", borderRadius: 4, background: value >= 5 ? "rgba(13,156,41,0.15)" : value >= 2 ? "rgba(184,134,11,0.15)" : "rgba(194,25,48,0.15)", color: value >= 5 ? GREEN : value >= 2 ? YELLOW : RED, fontWeight: 700, textAlign: "center" }}>{fmtPct(value)}</span> },
      ]} /></div>

      {/* Daily detail table */}
      <SectionHeader title="Daily Cohort Details" />
      <div className="uj-table-tile"><DataTable sortable resizable fullWidth data={dailyData.map(d => ({
        Date: d.day, Sessions: d.sessions, Users: d.users, Conversions: d.conversions, "Conv Rate": d.convRate,
      }))} columns={[
        { id: "Date", header: "Date", accessor: "Date" },
        { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: BLUE }}>{fmtCount(value)}</Strong> },
        { id: "Users", header: "Users", accessor: "Users", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
        { id: "Conversions", header: "Conv", accessor: "Conversions", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: GREEN }}>{fmtCount(value)}</Strong> },
        { id: "Conv Rate", header: "Conv %", accessor: "Conv Rate", sortType: "number" as any, cell: ({ value }: any) => <span style={{ display: "inline-block", width: "100%", padding: "2px 8px", borderRadius: 4, background: value >= 5 ? "rgba(13,156,41,0.15)" : value >= 2 ? "rgba(184,134,11,0.15)" : "rgba(194,25,48,0.15)", color: value >= 5 ? GREEN : value >= 2 ? YELLOW : RED, fontWeight: 700, textAlign: "center" }}>{fmtPct(value)}</span> },
      ]} /></div>

      {/* Behavioral Cohort Discovery */}
      <SectionHeader title="Behavioral Cohort Discovery" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>ML-driven analysis of which in-session behaviors predict conversion. Identifies cohorts you haven't thought to look for.</Text>
      {(() => {
        const records = (sessionData?.data?.records ?? []) as any[];
        if (records.length < 5) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>Insufficient data for behavioral cohort analysis.</Text></div>;
        // Analyze patterns: sessions with high page depth, specific pages, or interactions that convert
        const converters = records.filter((r: any) => Number(r.converted ?? r.is_converter ?? 0) > 0);
        const nonConverters = records.filter((r: any) => Number(r.converted ?? r.is_converter ?? 0) === 0);
        const convAvgActions = converters.length > 0 ? converters.reduce((a: number, r: any) => a + Number(r.actions ?? r.page_views ?? 0), 0) / converters.length : 0;
        const nonConvAvgActions = nonConverters.length > 0 ? nonConverters.reduce((a: number, r: any) => a + Number(r.actions ?? r.page_views ?? 0), 0) / nonConverters.length : 0;
        const convRate = records.length > 0 ? (converters.length / records.length) * 100 : 0;
        const insights: string[] = [];
        if (convAvgActions > nonConvAvgActions * 1.5) insights.push(`Users who view ${Math.round(convAvgActions)} pages convert at ${fmtPct(convRate)} — ${(convAvgActions / Math.max(1, nonConvAvgActions)).toFixed(1)}x more page views than non-converters. Higher engagement strongly predicts conversion.`);
        if (converters.length > 0 && nonConverters.length > 0) {
          const convAvgDur = converters.reduce((a: number, r: any) => a + Number(r.avg_dur ?? r.session_duration ?? 0), 0) / converters.length;
          const nonConvDur = nonConverters.reduce((a: number, r: any) => a + Number(r.avg_dur ?? r.session_duration ?? 0), 0) / nonConverters.length;
          if (convAvgDur > nonConvDur * 1.3) insights.push(`Converting sessions average ${fmt(convAvgDur)} duration vs ${fmt(nonConvDur)} for non-converters. Longer, deeper sessions indicate higher intent.`);
        }
        if (insights.length === 0) insights.push("Behavioral patterns between converters and non-converters are similar — consider analyzing specific page sequences or interaction types for differentiation.");
        return (
          <Flex flexDirection="column" gap={8}>
            {insights.map((insight, i) => (
              <div key={i} className="uj-table-tile" style={{ padding: 12, borderLeft: `3px solid ${PURPLE}` }}>
                <Text style={{ fontSize: 13 }}>🧠 {insight}</Text>
              </div>
            ))}
            <Flex gap={16} flexWrap="wrap">
              <div className="uj-kpi-card"><Text className="uj-kpi-label">Converters Avg Pages</Text><Heading level={3} className="uj-kpi-value" style={{ color: GREEN }}>{convAvgActions.toFixed(1)}</Heading></div>
              <div className="uj-kpi-card"><Text className="uj-kpi-label">Non-Converters Avg</Text><Heading level={3} className="uj-kpi-value" style={{ color: ORANGE }}>{nonConvAvgActions.toFixed(1)}</Heading></div>
              <div className="uj-kpi-card"><Text className="uj-kpi-label">Engagement Lift</Text><Heading level={3} className="uj-kpi-value" style={{ color: PURPLE }}>{nonConvAvgActions > 0 ? (convAvgActions / nonConvAvgActions).toFixed(1) : "—"}x</Heading></div>
            </Flex>
          </Flex>
        );
      })()}

    </Flex>
  );
}

// ===========================================================================
// TAB: Session Engagement Score
// ===========================================================================
function SessionEngagementTab({ data, isLoading, steps, aov, overallConv }: { data: any; isLoading: boolean; steps: StepDef[]; aov: number; overallConv: number }) {
  const engStats = useMemo(() => {
    const records = (data?.data?.records ?? []) as any[];
    const sessions = records.map((r: any) => {
      const actions = Number(r.actions ?? 0), depth = Number(r.funnel_depth ?? 0), errors = Number(r.errors ?? 0);
      const converted = r.converted === true || r.converted === "true" || Number(r.converted ?? 0) > 0;
      const maxD = steps.length > 0 ? steps.length : 5;
      const score = Math.max(0, Math.min(100, Math.min(1, actions / 20) * 30 + Math.min(1, depth / maxD) * 40 + 30 - Math.min(30, errors * 10)));
      return { score, converted };
    });
    const avg = sessions.length > 0 ? sessions.reduce((a, s) => a + s.score, 0) / sessions.length : 0;
    const high = sessions.filter(s => s.score >= 70), low = sessions.filter(s => s.score < 30);
    const highPct = sessions.length > 0 ? (high.length / sessions.length) * 100 : 0;
    const lowPct = sessions.length > 0 ? (low.length / sessions.length) * 100 : 0;
    const hConv = high.length > 0 ? (high.filter(s => s.converted).length / high.length) * 100 : 0;
    const lConv = low.length > 0 ? (low.filter(s => s.converted).length / low.length) * 100 : 0;
    return { avg, highPct, lowPct, hConv, lConv };
  }, [data, steps]);
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeSessionEngagement(engStats.avg, engStats.highPct, engStats.lowPct, engStats.hConv, engStats.lConv), [engStats]));
  if (isLoading) return <Loading />;

  const records = (data?.data?.records ?? []) as any[];
  // Each record: sessionId, action_count, max_depth, error_count, converted (0/1)
  type EngSession = { sessionId: string; actions: number; depth: number; errors: number; converted: boolean; score: number };
  const sessions: EngSession[] = records.map((r: any) => {
    const actions = Number(r.actions ?? 0);
    const depth = Number(r.funnel_depth ?? 0);
    const errors = Number(r.errors ?? 0);
    const converted = r.converted === true || r.converted === "true" || Number(r.converted ?? 0) > 0;
    // Engagement score: weighted formula — actions (30%), depth (40%), errors penalty (30%)
    const maxActions = 20;
    const maxDepth = steps.length > 0 ? steps.length : 5;
    const actionScore = Math.min(1, actions / maxActions) * 30;
    const depthScore = Math.min(1, depth / maxDepth) * 40;
    const errorPenalty = Math.min(30, errors * 10);
    const score = Math.max(0, Math.min(100, actionScore + depthScore + 30 - errorPenalty));
    return { sessionId: String(r["dt.rum.session.id"] ?? ""), actions, depth, errors, converted, score };
  });

  if (sessions.length === 0) return <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}><SectionHeader title="Session Engagement Score" /><div className="uj-table-tile" style={{ padding: 24 }}><Text>No session engagement data available.</Text></div></Flex>;

  // Stats
  const avgScore = sessions.reduce((a, s) => a + s.score, 0) / sessions.length;
  const highEngagement = sessions.filter(s => s.score >= 70);
  const medEngagement = sessions.filter(s => s.score >= 30 && s.score < 70);
  const lowEngagement = sessions.filter(s => s.score < 30);
  const highConvRate = highEngagement.length > 0 ? (highEngagement.filter(s => s.converted).length / highEngagement.length) * 100 : 0;
  const medConvRate = medEngagement.length > 0 ? (medEngagement.filter(s => s.converted).length / medEngagement.length) * 100 : 0;
  const lowConvRate = lowEngagement.length > 0 ? (lowEngagement.filter(s => s.converted).length / lowEngagement.length) * 100 : 0;
  // High-intent non-converters: high engagement + no conversion
  const highIntentNonConv = highEngagement.filter(s => !s.converted).sort((a, b) => b.score - a.score);
  const totalConverted = sessions.filter(s => s.converted).length;
  const totalConvRate = sessions.length > 0 ? (totalConverted / sessions.length) * 100 : 0;

  // Histogram: score distribution
  const buckets = Array.from({ length: 10 }, (_, i) => ({ lo: i * 10, hi: (i + 1) * 10, count: 0, converted: 0 }));
  for (const s of sessions) {
    const idx = Math.min(9, Math.floor(s.score / 10));
    buckets[idx].count++;
    if (s.converted) buckets[idx].converted++;
  }
  const histMax = Math.max(1, ...buckets.map(b => b.count));
  const W = 720, H = 240, PAD = { top: 30, right: 20, bottom: 40, left: 60 };
  const iW = W - PAD.left - PAD.right, iH = H - PAD.top - PAD.bottom;

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      {aiPanel}
      <SectionHeader title="Session Engagement Score — Quantify user engagement per session" />
      <Flex gap={16} flexWrap="wrap">
        <div className="uj-kpi-card"><Text className="uj-kpi-label">Sessions Analyzed</Text><Heading level={2} className="uj-kpi-value" style={{ color: BLUE }}>{fmtCount(sessions.length)}</Heading></div>
        <div className="uj-kpi-card"><Text className="uj-kpi-label">Avg Score</Text><Heading level={2} className="uj-kpi-value" style={{ color: avgScore >= 50 ? GREEN : avgScore >= 25 ? YELLOW : RED }}>{avgScore.toFixed(1)}/100</Heading></div>
        <div className="uj-kpi-card"><Text className="uj-kpi-label">High Engagement (≥70)</Text><Heading level={2} className="uj-kpi-value" style={{ color: GREEN }}>{fmtCount(highEngagement.length)} ({fmtPct(sessions.length > 0 ? (highEngagement.length / sessions.length) * 100 : 0)})</Heading></div>
        <div className="uj-kpi-card"><Text className="uj-kpi-label">Low Engagement (&lt;30)</Text><Heading level={2} className="uj-kpi-value" style={{ color: RED }}>{fmtCount(lowEngagement.length)} ({fmtPct(sessions.length > 0 ? (lowEngagement.length / sessions.length) * 100 : 0)})</Heading></div>
        <div className="uj-kpi-card"><Text className="uj-kpi-label">High-Intent Non-Conv</Text><Heading level={2} className="uj-kpi-value" style={{ color: ORANGE }}>{fmtCount(highIntentNonConv.length)}</Heading></div>
      </Flex>

      {/* Score histogram */}
      <SectionHeader title="Engagement Score Distribution" />
      <div className="uj-table-tile" style={{ padding: 16 }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
          <text x={PAD.left} y={PAD.top - 10} fill="rgba(255,255,255,0.4)" fontSize={10}>Sessions</text>
          {buckets.map((b, i) => {
            const bW = iW / 10 - 4;
            const x = PAD.left + i * (iW / 10) + 2;
            const bH = Math.max(1, (b.count / histMax) * iH);
            const convH = b.count > 0 ? (b.converted / b.count) * bH : 0;
            const y = PAD.top + iH - bH;
            const color = b.lo >= 70 ? GREEN : b.lo >= 30 ? YELLOW : RED;
            return (
              <g key={i}>
                <rect x={x} y={y} width={bW} height={bH} rx={3} fill={color} fillOpacity={0.2} stroke={color} strokeWidth={0.5} strokeOpacity={0.4}><title>{b.lo}-{b.hi}: {b.count} sessions</title></rect>
                <rect x={x} y={y + bH - convH} width={bW} height={convH} rx={3} fill={GREEN} fillOpacity={0.5}><title>Converted: {b.converted}</title></rect>
                {b.count > 0 && <text x={x + bW / 2} y={y - 4} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={9} fontWeight={600}>{b.count}</text>}
                <text x={x + bW / 2} y={H - PAD.bottom + 14} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={9}>{b.lo}-{b.hi}</text>
              </g>
            );
          })}
          <text x={PAD.left + iW / 2} y={H - 4} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={10}>Engagement Score</text>
          <Flex gap={12} alignItems="center" style={{ position: "absolute", bottom: 4, right: 20 }}>
          </Flex>
        </svg>
        <Flex gap={16} style={{ marginTop: 8 }}>
          <Flex gap={4} alignItems="center"><span style={{ width: 10, height: 10, borderRadius: 2, background: GREEN, opacity: 0.5, display: "inline-block" }} /><Text style={{ fontSize: 11, opacity: 0.5 }}>Converted</Text></Flex>
          <Flex gap={4} alignItems="center"><span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(128,128,128,0.3)", display: "inline-block" }} /><Text style={{ fontSize: 11, opacity: 0.5 }}>Non-converted</Text></Flex>
        </Flex>
      </div>

      {/* Conv rate by engagement tier */}
      <SectionHeader title="Conversion Rate by Engagement Tier" />
      <Flex gap={16} flexWrap="wrap">
        <div className="uj-table-tile" style={{ padding: 16, flex: 1, minWidth: 200, textAlign: "center" }}>
          <Text style={{ fontSize: 12, opacity: 0.5, display: "block" }}>🟢 High (≥70)</Text>
          <Heading level={2} style={{ color: GREEN, margin: "8px 0" }}>{fmtPct(highConvRate)}</Heading>
          <Text style={{ fontSize: 11, opacity: 0.5 }}>{fmtCount(highEngagement.length)} sessions</Text>
        </div>
        <div className="uj-table-tile" style={{ padding: 16, flex: 1, minWidth: 200, textAlign: "center" }}>
          <Text style={{ fontSize: 12, opacity: 0.5, display: "block" }}>🟡 Medium (30-69)</Text>
          <Heading level={2} style={{ color: YELLOW, margin: "8px 0" }}>{fmtPct(medConvRate)}</Heading>
          <Text style={{ fontSize: 11, opacity: 0.5 }}>{fmtCount(medEngagement.length)} sessions</Text>
        </div>
        <div className="uj-table-tile" style={{ padding: 16, flex: 1, minWidth: 200, textAlign: "center" }}>
          <Text style={{ fontSize: 12, opacity: 0.5, display: "block" }}>🔴 Low (&lt;30)</Text>
          <Heading level={2} style={{ color: RED, margin: "8px 0" }}>{fmtPct(lowConvRate)}</Heading>
          <Text style={{ fontSize: 11, opacity: 0.5 }}>{fmtCount(lowEngagement.length)} sessions</Text>
        </div>
      </Flex>

      {/* High-intent non-converters table */}
      {highIntentNonConv.length > 0 && (
        <>
          <SectionHeader title="High-Intent Non-Converters — Engaged users who didn't convert" />
          <div className="uj-table-tile"><DataTable sortable resizable fullWidth data={highIntentNonConv.slice(0, 50).map(s => ({
            "Session ID": s.sessionId.substring(0, 20), Score: Number(s.score.toFixed(1)), Actions: s.actions, "Max Depth": s.depth, Errors: s.errors,
          }))} columns={[
            { id: "Session ID", header: "Session", accessor: "Session ID" },
            { id: "Score", header: "Score", accessor: "Score", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: GREEN }}>{value}</Strong> },
            { id: "Actions", header: "Actions", accessor: "Actions", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: BLUE }}>{value}</Strong> },
            { id: "Max Depth", header: "Max Depth", accessor: "Max Depth", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: PURPLE }}>{value}</Strong> },
            { id: "Errors", header: "Errors", accessor: "Errors", sortType: "number" as any, cell: ({ value }: any) => value > 0 ? <Strong style={{ color: RED }}>{value}</Strong> : <Text style={{ opacity: 0.3 }}>0</Text> },
          ]} /></div>
        </>
      )}

      {aov > 0 && highIntentNonConv.length > 0 && (
        <div className="uj-table-tile" style={{ padding: 16 }}>
          <Text style={{ fontSize: 13, opacity: 0.7 }}>
            💰 <Strong>Revenue Opportunity:</Strong> {fmtCount(highIntentNonConv.length)} highly-engaged sessions didn't convert. If even {fmtPct(Math.min(50, highConvRate))} were recovered, that's ~{fmtCurrency(highIntentNonConv.length * (Math.min(50, highConvRate) / 100) * aov)} in additional revenue.
          </Text>
        </div>
      )}

      {/* High-Intent Non-Converter Alerting */}
      <SectionHeader title="High-Intent Non-Converter Alerts" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Sessions crossing the engagement threshold without converting — candidates for real-time retargeting via Dynatrace Workflows → CDP/CRM integration.</Text>
      {(() => {
        const records = (data?.data?.records ?? []) as any[];
        const highIntent = records.filter((r: any) => {
          const score = Number(r.engagement_score ?? r.score ?? 0);
          const converted = Number(r.converted ?? r.is_converter ?? 0);
          return score >= 70 && converted === 0;
        }).slice(0, 10);
        if (highIntent.length === 0) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>No high-intent non-converters detected in this timeframe. All highly-engaged users converted, or engagement threshold not met.</Text></div>;
        return (
          <Flex flexDirection="column" gap={8}>
            <div className="uj-table-tile" style={{ padding: 12, borderLeft: `3px solid ${ORANGE}`, background: "rgba(184,134,11,0.05)" }}>
              <Text style={{ fontSize: 13 }}>⚡ <Strong>{highIntent.length} high-intent sessions</Strong> crossed engagement threshold (score ≥70) without converting. Configure a Dynatrace Workflow with trigger: <code style={{ fontSize: 11, background: "rgba(128,128,128,0.15)", padding: "1px 4px", borderRadius: 3 }}>bizevents.engagement_score &gt;= 70 AND converted == false</code> to push these to your CDP for retargeting.</Text>
            </div>
            <div className="uj-table-tile"><DataTable sortable data={highIntent.map((r: any, i: number) => ({
              "#": i + 1,
              Session: String(r["dt.rum.session.id"] ?? r.session_id ?? "").substring(0, 12) + "...",
              Score: Number(r.engagement_score ?? r.score ?? 0),
              Actions: Number(r.actions ?? r.page_views ?? 0),
              Duration: fmt(Number(r.session_duration ?? r.avg_dur ?? 0)),
            }))} columns={[
              { id: "#", header: "#", accessor: "#" },
              { id: "Session", header: "Session", accessor: "Session", cell: ({ value }: any) => <Text style={{ fontSize: 11, fontFamily: "monospace" }}>{value}</Text> },
              { id: "Score", header: "Engagement", accessor: "Score", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value >= 80 ? RED : ORANGE }}>{value}</Strong> },
              { id: "Actions", header: "Pages", accessor: "Actions", sortType: "number" as any },
              { id: "Duration", header: "Duration", accessor: "Duration" },
            ]} /></div>
          </Flex>
        );
      })()}

    </Flex>
  );
}

// ===========================================================================
// TAB: Third-Party Impact
// ===========================================================================
function ThirdPartyImpactTab({ data, cwvData, isLoading, frontend }: { data: any; cwvData: any; isLoading: boolean; frontend: string }) {
  const tpStats = useMemo(() => {
    const records = (data?.data?.records ?? []) as any[];
    const rawEntries = records.map((r: any) => ({ domain: String(r.domain ?? "unknown"), reqCount: Number(r.requests ?? 0) }));
    const fWords = frontend.toLowerCase().split(/[\s-]+/).filter((w: string) => w.length > 3);
    const domReqs = new Map<string, number>();
    for (const e of rawEntries) domReqs.set(e.domain, (domReqs.get(e.domain) ?? 0) + e.reqCount);
    const sorted = Array.from(domReqs.entries()).sort((a, b) => b[1] - a[1]);
    const isFirstParty = (d: string) => fWords.length > 0 && fWords.some((w: string) => d.toLowerCase().includes(w));
    const anyMatch = sorted.some(([d]) => isFirstParty(d));
    const topDomain = sorted[0]?.[0] ?? "";
    let tpReqs = 0, totalReqs = 0, tpCount = 0, tpDurSum = 0, fpDurSum = 0, tpDurN = 0, fpDurN = 0;
    for (const r of records as any[]) {
      const d = String(r.domain ?? "unknown"); const reqs = Number(r.requests ?? 0); const dur = Number(r.avg_dur ?? 0);
      totalReqs += reqs;
      const is3P = anyMatch ? !isFirstParty(d) : d !== topDomain;
      if (is3P) { tpReqs += reqs; tpDurSum += dur * reqs; tpDurN += reqs; } else { fpDurSum += dur * reqs; fpDurN += reqs; }
    }
    tpCount = Array.from(domReqs.keys()).filter(d => anyMatch ? !isFirstParty(d) : d !== topDomain).length;
    return { thirdPartyPct: totalReqs > 0 ? (tpReqs / totalReqs) * 100 : 0, avg3P: tpDurN > 0 ? tpDurSum / tpDurN : 0, avg1P: fpDurN > 0 ? fpDurSum / fpDurN : 0, tpCount };
  }, [data, frontend]);
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeThirdPartyImpact(tpStats.thirdPartyPct, tpStats.avg3P, tpStats.avg1P, tpStats.tpCount), [tpStats]));
  if (isLoading) return <Loading />;

  const records = (data?.data?.records ?? []) as any[];
  const cwvRecords = (cwvData?.data?.records ?? []) as any[];

  // Parse resource records: domain, res_type, total_dur, avg_duration, req_count
  type ResEntry = { domain: string; resType: string; totalBytes: number; avgDuration: number; reqCount: number; isThirdParty: boolean };
  // First pass: collect all entries without 1P/3P classification
  const rawEntries = records.map((r: any) => ({
    domain: String(r.domain ?? "unknown"),
    resType: String(r.res_type ?? "other"),
    totalBytes: Number(r.total_dur ?? 0),
    avgDuration: Number(r.avg_dur ?? 0),
    reqCount: Number(r.requests ?? 0),
  }));

  // Determine first-party domain: use frontend name word matching, then fall back to top domain
  const fWords = frontend.toLowerCase().split(/[\s-]+/).filter((w: string) => w.length > 3);
  // Aggregate request counts by domain to find the top one
  const domainReqCounts = new Map<string, number>();
  for (const e of rawEntries) {
    domainReqCounts.set(e.domain, (domainReqCounts.get(e.domain) ?? 0) + e.reqCount);
  }
  const sortedDomains = Array.from(domainReqCounts.entries()).sort((a, b) => b[1] - a[1]);
  // A domain is first-party if it contains keywords from the frontend name
  const isFirstPartyDomain = (d: string): boolean => {
    const dl = d.toLowerCase();
    if (fWords.length > 0 && fWords.some((w: string) => dl.includes(w))) return true;
    return false;
  };
  // If no domain matches frontend words, treat the top-request domain as first-party
  const anyMatch = sortedDomains.some(([d]) => isFirstPartyDomain(d));
  const topDomain = sortedDomains[0]?.[0] ?? "";

  const resources: ResEntry[] = rawEntries.map((e) => {
    let isThirdParty: boolean;
    if (anyMatch) {
      isThirdParty = !isFirstPartyDomain(e.domain);
    } else {
      // No word match — treat the domain with the most requests as first-party
      isThirdParty = e.domain !== topDomain;
    }
    return { ...e, isThirdParty };
  });

  // Aggregate by domain
  const domainMap = new Map<string, { totalBytes: number; avgDuration: number; reqCount: number; resTypes: Set<string>; isThirdParty: boolean }>();
  for (const r of resources) {
    const d = domainMap.get(r.domain) ?? { totalBytes: 0, avgDuration: 0, reqCount: 0, resTypes: new Set(), isThirdParty: r.isThirdParty };
    d.totalBytes += r.totalBytes;
    d.avgDuration = d.reqCount > 0 ? ((d.avgDuration * d.reqCount) + (r.avgDuration * r.reqCount)) / (d.reqCount + r.reqCount) : r.avgDuration;
    d.reqCount += r.reqCount;
    d.resTypes.add(r.resType);
    domainMap.set(r.domain, d);
  }
  const domains = Array.from(domainMap.entries()).map(([domain, d]) => ({
    domain, ...d, resTypes: Array.from(d.resTypes).join(", "),
  })).sort((a, b) => b.reqCount - a.reqCount);

  const firstParty = domains.filter(d => !d.isThirdParty);
  const thirdParty = domains.filter(d => d.isThirdParty);
  const totalReqs = domains.reduce((a, d) => a + d.reqCount, 0);
  const thirdPartyReqs = thirdParty.reduce((a, d) => a + d.reqCount, 0);
  const thirdPartyBytes = thirdParty.reduce((a, d) => a + d.totalBytes, 0);
  const firstPartyBytes = firstParty.reduce((a, d) => a + d.totalBytes, 0);
  const thirdPartyPct = totalReqs > 0 ? (thirdPartyReqs / totalReqs) * 100 : 0;
  const avgThirdPartyDur = thirdParty.length > 0 ? thirdParty.reduce((a, d) => a + d.avgDuration * d.reqCount, 0) / Math.max(1, thirdPartyReqs) : 0;
  const avgFirstPartyDur = firstParty.length > 0 ? firstParty.reduce((a, d) => a + d.avgDuration * d.reqCount, 0) / Math.max(1, firstParty.reduce((a, d) => a + d.reqCount, 0)) : 0;

  // CWV correlation
  const cwvPages = cwvRecords.map((r: any) => ({
    page: String(r.pageName ?? ""), lcp: Number(r.lcp_avg ?? 0), cls: Number(r.cls_avg ?? 0), inp: Number(r.inp_avg ?? 0),
  })).filter((p: any) => p.page);

  // Duration formatter (totalBytes holds total_dur in ms)
  const fmtBytes = (b: number) => b >= 60000 ? `${(b / 60000).toFixed(1)} min` : b >= 1000 ? `${(b / 1000).toFixed(1)}s` : `${Math.round(b)}ms`;

  // Chart: top domains bar chart
  const topDomains = domains.slice(0, 12);
  const W = 720, H = Math.max(200, topDomains.length * 36 + 60);

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      {aiPanel}
      <SectionHeader title="Third-Party Impact — How external resources affect performance" />
      <Flex gap={16} flexWrap="wrap">
        <div className="uj-kpi-card"><Text className="uj-kpi-label">Total Domains</Text><Heading level={2} className="uj-kpi-value" style={{ color: BLUE }}>{domains.length}</Heading></div>
        <div className="uj-kpi-card"><Text className="uj-kpi-label">3rd-Party Domains</Text><Heading level={2} className="uj-kpi-value" style={{ color: ORANGE }}>{thirdParty.length}</Heading></div>
        <div className="uj-kpi-card"><Text className="uj-kpi-label">3rd-Party Request %</Text><Heading level={2} className="uj-kpi-value" style={{ color: thirdPartyPct > 60 ? RED : thirdPartyPct > 30 ? YELLOW : GREEN }}>{fmtPct(thirdPartyPct)}</Heading></div>
        <div className="uj-kpi-card"><Text className="uj-kpi-label">3rd-Party Load Time</Text><Heading level={2} className="uj-kpi-value" style={{ color: PURPLE }}>{fmtBytes(thirdPartyBytes)}</Heading></div>
        <div className="uj-kpi-card"><Text className="uj-kpi-label">Avg 3P Duration</Text><Heading level={2} className="uj-kpi-value" style={{ color: avgThirdPartyDur > 500 ? RED : avgThirdPartyDur > 200 ? YELLOW : GREEN }}>{Math.round(avgThirdPartyDur)}ms</Heading></div>
        <div className="uj-kpi-card"><Text className="uj-kpi-label">Avg 1P Duration</Text><Heading level={2} className="uj-kpi-value" style={{ color: GREEN }}>{Math.round(avgFirstPartyDur)}ms</Heading></div>
      </Flex>

      {/* 1P vs 3P comparison */}
      <SectionHeader title="First-Party vs. Third-Party Comparison" />
      <Flex gap={16} flexWrap="wrap">
        <div className="uj-table-tile" style={{ padding: 16, flex: 1, minWidth: 280, textAlign: "center" }}>
          <Text style={{ fontSize: 12, opacity: 0.5, display: "block" }}>🏠 First-Party</Text>
          <Heading level={2} style={{ color: GREEN, margin: "8px 0" }}>{fmtCount(firstParty.reduce((a, d) => a + d.reqCount, 0))} requests</Heading>
          <Text style={{ fontSize: 12, opacity: 0.5 }}>{fmtBytes(firstPartyBytes)} · {Math.round(avgFirstPartyDur)}ms avg</Text>
        </div>
        <div className="uj-table-tile" style={{ padding: 16, flex: 1, minWidth: 280, textAlign: "center" }}>
          <Text style={{ fontSize: 12, opacity: 0.5, display: "block" }}>🌐 Third-Party</Text>
          <Heading level={2} style={{ color: ORANGE, margin: "8px 0" }}>{fmtCount(thirdPartyReqs)} requests</Heading>
          <Text style={{ fontSize: 12, opacity: 0.5 }}>{fmtBytes(thirdPartyBytes)} · {Math.round(avgThirdPartyDur)}ms avg</Text>
        </div>
      </Flex>

      {/* Top domains chart */}
      <SectionHeader title="Top Domains by Request Count" />
      <div className="uj-table-tile" style={{ padding: 16 }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
          {topDomains.map((d, i) => {
            const y = i * 36 + 20;
            const maxReqs = Math.max(1, topDomains[0]?.reqCount ?? 1);
            const barW = Math.max(4, (d.reqCount / maxReqs) * 360);
            const color = d.isThirdParty ? ORANGE : GREEN;
            return (
              <g key={i}>
                <text x={16} y={y + 14} fill={color} fontSize={9} fontWeight={700}>{d.isThirdParty ? "3P" : "1P"}</text>
                <text x={220} y={y + 14} textAnchor="end" fill="rgba(255,255,255,0.7)" fontSize={11} fontWeight={600}>{d.domain.length > 30 ? d.domain.substring(0, 30) + "…" : d.domain}</text>
                <rect x={230} y={y} width={barW} height={24} rx={4} fill={color} fillOpacity={0.35} stroke={color} strokeWidth={0.5} strokeOpacity={0.4}><title>{d.domain}: {fmtCount(d.reqCount)} reqs, {fmtBytes(d.totalBytes)}, {Math.round(d.avgDuration)}ms avg</title></rect>
                <text x={230 + barW + 8} y={y + 10} fill="rgba(255,255,255,0.8)" fontSize={10} fontWeight={700}>{fmtCount(d.reqCount)}</text>
                <text x={230 + barW + 8} y={y + 22} fill="rgba(255,255,255,0.4)" fontSize={9}>{fmtBytes(d.totalBytes)} · {Math.round(d.avgDuration)}ms</text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Full domain table */}
      <SectionHeader title="All Domains" />
      <div className="uj-table-tile"><DataTable sortable resizable fullWidth data={domains.map(d => ({
        Domain: d.domain, Type: d.isThirdParty ? "Third-Party" : "First-Party",
        Requests: d.reqCount, "Total Dur": d.totalBytes, "Avg Duration (ms)": Math.round(d.avgDuration), "Resource Types": d.resTypes,
      }))} columns={[
        { id: "Domain", header: "Domain", accessor: "Domain", cell: ({ value }: any) => <Strong>{String(value).substring(0, 40)}</Strong> },
        { id: "Type", header: "Type", accessor: "Type", cell: ({ value }: any) => <span style={{ padding: "2px 8px", borderRadius: 4, background: value === "Third-Party" ? "rgba(255,131,43,0.15)" : "rgba(13,156,41,0.15)", color: value === "Third-Party" ? ORANGE : GREEN, fontWeight: 700, fontSize: 11 }}>{value}</span> },
        { id: "Requests", header: "Requests", accessor: "Requests", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: BLUE }}>{fmtCount(value)}</Strong> },
        { id: "Total Dur", header: "Total Dur", accessor: "Total Dur", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtBytes(value)}</Text> },
        { id: "Avg Duration (ms)", header: "Avg Duration", accessor: "Avg Duration (ms)", sortType: "number" as any, cell: ({ value }: any) => <span style={{ color: value > 500 ? RED : value > 200 ? YELLOW : GREEN, fontWeight: 600 }}>{fmtCount(value)}ms</span> },
        { id: "Resource Types", header: "Types", accessor: "Resource Types", cell: ({ value }: any) => <Text style={{ fontSize: 11, opacity: 0.6 }}>{value}</Text> },
      ]} /></div>

      {/* CWV pages (if available) */}
      {cwvPages.length > 0 && (
        <>
          <SectionHeader title="Page-Level CWV for Correlation" />
          <div className="uj-table-tile"><DataTable sortable resizable fullWidth data={cwvPages.slice(0, 20).map(p => ({
            Page: p.page.substring(0, 40), "LCP (ms)": Math.round(p.lcp), CLS: Number(p.cls.toFixed(3)), "INP (ms)": Math.round(p.inp),
          }))} columns={[
            { id: "Page", header: "Page", accessor: "Page", cell: ({ value }: any) => <Strong>{value}</Strong> },
            { id: "LCP (ms)", header: "LCP", accessor: "LCP (ms)", sortType: "number" as any, cell: ({ value }: any) => <span style={{ color: value > CWV.lcp.poor ? RED : value > CWV.lcp.good ? YELLOW : GREEN, fontWeight: 600 }}>{fmtCount(value)}ms</span> },
            { id: "CLS", header: "CLS", accessor: "CLS", sortType: "number" as any, cell: ({ value }: any) => <span style={{ color: value > CWV.cls.poor ? RED : value > CWV.cls.good ? YELLOW : GREEN, fontWeight: 600 }}>{value}</span> },
            { id: "INP (ms)", header: "INP", accessor: "INP (ms)", sortType: "number" as any, cell: ({ value }: any) => <span style={{ color: value > CWV.inp.poor ? RED : value > CWV.inp.good ? YELLOW : GREEN, fontWeight: 600 }}>{fmtCount(value)}ms</span> },
          ]} /></div>
        </>
      )}

      {/* Blocking vs Non-Blocking Classification */}
      <SectionHeader title="Resource Blocking Classification" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Identifies render-blocking resources (scripts, CSS) vs async/deferred. Blocking resources directly impact First Contentful Paint and LCP.</Text>
      {(() => {
        const rows = (data?.data?.records ?? []) as any[];
        if (rows.length === 0) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>No third-party data available.</Text></div>;
        // Classify by type: scripts (potentially blocking) vs images/fonts (non-blocking)
        const classified = rows.map((r: any) => {
          const domain = String(r.domain ?? r.resource_domain ?? "unknown");
          const resType = String(r.resource_type ?? r.type ?? "other").toLowerCase();
          const isBlocking = resType.includes("script") || resType.includes("css") || resType.includes("stylesheet");
          const avgDur = Number(r.avg_duration ?? r.avg_dur ?? 0);
          return { domain, resType, isBlocking, avgDur, count: Number(r.count ?? r.requests ?? 0) };
        });
        const blocking = classified.filter(c => c.isBlocking).sort((a, b) => b.avgDur - a.avgDur);
        const nonBlocking = classified.filter(c => !c.isBlocking);
        const totalBlocking = blocking.reduce((a, c) => a + c.count, 0);
        const totalNonBlocking = nonBlocking.reduce((a, c) => a + c.count, 0);
        return (
          <Flex flexDirection="column" gap={8}>
            <Flex gap={16} flexWrap="wrap">
              <div className="uj-kpi-card"><Text className="uj-kpi-label">Blocking Resources</Text><Heading level={3} className="uj-kpi-value" style={{ color: blocking.length > 5 ? RED : ORANGE }}>{blocking.length} domains</Heading><Text style={{ fontSize: 10, opacity: 0.5 }}>{fmtCount(totalBlocking)} requests</Text></div>
              <div className="uj-kpi-card"><Text className="uj-kpi-label">Non-Blocking</Text><Heading level={3} className="uj-kpi-value" style={{ color: GREEN }}>{nonBlocking.length} domains</Heading><Text style={{ fontSize: 10, opacity: 0.5 }}>{fmtCount(totalNonBlocking)} requests</Text></div>
            </Flex>
            {blocking.length > 0 && (
              <div className="uj-table-tile"><DataTable sortable data={blocking.slice(0, 10).map((c, i) => ({
                "#": i + 1, Domain: c.domain, Type: c.resType, "Avg (ms)": Math.round(c.avgDur), Requests: c.count, Impact: "🔴 BLOCKING",
              }))} columns={[
                { id: "#", header: "#", accessor: "#" },
                { id: "Domain", header: "Domain", accessor: "Domain", cell: ({ value }: any) => <Strong style={{ fontSize: 12 }}>{value}</Strong> },
                { id: "Type", header: "Type", accessor: "Type", cell: ({ value }: any) => <Text style={{ fontSize: 11 }}>{value}</Text> },
                { id: "Avg (ms)", header: "Avg Latency", accessor: "Avg (ms)", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 500 ? RED : value > 200 ? ORANGE : GREEN }}>{fmt(value)}</Strong> },
                { id: "Requests", header: "Requests", accessor: "Requests", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
                { id: "Impact", header: "Impact", accessor: "Impact", cell: ({ value }: any) => <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: `${RED}15`, color: RED, fontWeight: 700 }}>{value}</span> },
              ]} /></div>
            )}
          </Flex>
        );
      })()}

      {/* Automated CDN Recommendations */}
      <SectionHeader title="CDN Optimization Recommendations" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Automated recommendations for slow third-party domains that could benefit from CDN, async loading, or removal.</Text>
      {(() => {
        const rows = (data?.data?.records ?? []) as any[];
        const recs: { domain: string; avgDur: number; rec: string; impact: string }[] = [];
        rows.forEach((r: any) => {
          const domain = String(r.domain ?? r.resource_domain ?? "");
          const avgDur = Number(r.avg_duration ?? r.avg_dur ?? 0);
          const resType = String(r.resource_type ?? r.type ?? "").toLowerCase();
          const count = Number(r.count ?? r.requests ?? 0);
          if (!domain || domain === "unknown") return;
          if (avgDur > 500 && (resType.includes("image") || resType.includes("font") || resType.includes("media"))) {
            recs.push({ domain, avgDur, rec: `Serves static assets (${resType}) — moving to a CDN would reduce avg latency by ~${Math.round(avgDur * 0.6)}ms based on current TTFB.`, impact: "high" });
          } else if (avgDur > 1000 && resType.includes("script")) {
            recs.push({ domain, avgDur, rec: `Render-blocking script with ${fmt(avgDur)} avg load time. Consider async/defer loading or self-hosting critical scripts.`, impact: "critical" });
          } else if (avgDur > 300 && count > 100) {
            recs.push({ domain, avgDur, rec: `High-volume domain (${fmtCount(count)} requests). Pre-connect hint (<link rel="preconnect">) would save ~100-200ms on first request.`, impact: "medium" });
          }
        });
        if (recs.length === 0) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ color: GREEN }}>✓ No critical third-party optimization opportunities detected.</Text></div>;
        return (
          <Flex flexDirection="column" gap={8}>
            {recs.sort((a, b) => b.avgDur - a.avgDur).slice(0, 8).map((r, i) => (
              <div key={i} className="uj-table-tile" style={{ padding: 12, borderLeft: `3px solid ${r.impact === "critical" ? RED : r.impact === "high" ? ORANGE : YELLOW}` }}>
                <Flex justifyContent="space-between" alignItems="flex-start">
                  <div>
                    <Strong style={{ fontSize: 12 }}>{r.domain}</Strong> <Text style={{ fontSize: 11, opacity: 0.5 }}>({fmt(r.avgDur)} avg)</Text>
                    <Text style={{ display: "block", fontSize: 12, marginTop: 4 }}>💡 {r.rec}</Text>
                  </div>
                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: r.impact === "critical" ? `${RED}15` : r.impact === "high" ? `${ORANGE}15` : `${YELLOW}15`, color: r.impact === "critical" ? RED : r.impact === "high" ? ORANGE : YELLOW, fontWeight: 700, whiteSpace: "nowrap" }}>{r.impact.toUpperCase()}</span>
                </Flex>
              </div>
            ))}
          </Flex>
        );
      })()}

    </Flex>
  );
}

// ===========================================================================
// TAB: Error Clustering
// ===========================================================================
function ErrorClusteringTab({ data, trendData, isLoading, frontend, deployData }: { data: any; trendData: any; isLoading: boolean; frontend: string; deployData?: any }) {
  const ecStats = useMemo(() => {
    const records = (data?.data?.records ?? []) as any[];
    const clusters = records.map((r: any) => ({
      name: String(r.errorName ?? r.error_name ?? "Unknown Error"),
      occurrences: Number(r.occurrences ?? 0),
    })).sort((a: any, b: any) => b.occurrences - a.occurrences);
    const totalErrors = clusters.reduce((a: number, c: any) => a + c.occurrences, 0);
    return { clusters, totalErrors };
  }, [data]);
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeErrorClustering(ecStats.clusters, ecStats.totalErrors), [ecStats]));
  if (isLoading) return <Loading />;

  const records = (data?.data?.records ?? []) as any[];
  const trendRecords = (trendData?.data?.records ?? []) as any[];

  // Parse error clusters: error_id, errorName, occurrences, affected_sessions, sample_message
  type ErrorCluster = { errorId: string; name: string; occurrences: number; sessions: number; sampleMessage: string };
  const clusters: ErrorCluster[] = records.map((r: any) => ({
    errorId: String(r.error_id ?? r["error.id"] ?? "unknown"),
    name: String(r.errorName ?? r.error_name ?? "Unknown Error"),
    occurrences: Number(r.occurrences ?? 0),
    sessions: Number(r.affected_sessions ?? 0),
    sampleMessage: String(r.sample_message ?? ""),
  })).sort((a: ErrorCluster, b: ErrorCluster) => b.occurrences - a.occurrences);

  // Parse hourly trend: hour_bucket, error_count
  type HourTrend = { hour: string; count: number };
  const hourly: HourTrend[] = trendRecords.map((r: any) => ({
    hour: String(r.hour_bucket ?? ""),
    count: Number(r.occurrences ?? 0),
  })).filter((h: HourTrend) => h.hour).sort((a: HourTrend, b: HourTrend) => a.hour.localeCompare(b.hour));

  const totalErrors = clusters.reduce((a, c) => a + c.occurrences, 0);
  const totalSessions = clusters.reduce((a, c) => a + c.sessions, 0);
  const uniqueClusters = clusters.length;
  const topCluster = clusters[0];
  const topClusterPct = totalErrors > 0 && topCluster ? (topCluster.occurrences / totalErrors) * 100 : 0;

  if (clusters.length === 0 && hourly.length === 0) return <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}><SectionHeader title="Error Clustering" /><div className="uj-table-tile" style={{ padding: 24 }}><Text>No error data available for this timeframe.</Text></div></Flex>;

  // Error trend chart
  const W = 720, H = 200, PAD = { top: 30, right: 20, bottom: 40, left: 60 };
  const iW = W - PAD.left - PAD.right, iH = H - PAD.top - PAD.bottom;
  const maxCount = Math.max(1, ...hourly.map(h => h.count));

  // Top clusters bar chart
  const topClusters = clusters.slice(0, 10);
  const clusterChartH = Math.max(180, topClusters.length * 40 + 40);
  const maxOcc = Math.max(1, topClusters[0]?.occurrences ?? 1);

  return (
    <Flex flexDirection="column" gap={20} style={{ paddingTop: 16 }}>
      {aiPanel}
      <SectionHeader title="Error Clustering — Group and analyze errors by pattern" />
      <Flex gap={16} flexWrap="wrap">
        <div className="uj-kpi-card"><Text className="uj-kpi-label">Total Errors</Text><Heading level={2} className="uj-kpi-value" style={{ color: RED }}>{fmtCount(totalErrors)}</Heading></div>
        <div className="uj-kpi-card"><Text className="uj-kpi-label">Unique Error Types</Text><Heading level={2} className="uj-kpi-value" style={{ color: ORANGE }}>{uniqueClusters}</Heading></div>
        <div className="uj-kpi-card"><Text className="uj-kpi-label">Sessions w/ Errors</Text><Heading level={2} className="uj-kpi-value" style={{ color: PURPLE }}>{fmtCount(totalSessions)}</Heading></div>
        {topCluster && <div className="uj-kpi-card"><Text className="uj-kpi-label">Top Error ({fmtPct(topClusterPct)})</Text><Heading level={2} className="uj-kpi-value" style={{ color: RED, fontSize: 16 }}>{topCluster.name.substring(0, 30)}</Heading></div>}
      </Flex>

      {/* Error trend over time */}
      {hourly.length > 1 && (
          <ChartTile title="Error Trend Over Time" description="Hourly error count distribution across the selected timeframe">
            {(() => {
              const errTs = buildTimeseries("Errors", hourly.map(h => ({
                time: new Date(h.hour), value: h.count,
              })));
              return (
                <TimeseriesChart gapPolicy="connect" curve="linear">
                  <TimeseriesChart.Area data={errTs} color={RED} />
                  <TimeseriesChart.Legend hidden />
                </TimeseriesChart>
              );
            })()}
          </ChartTile>
      )}

      {/* Top error clusters chart */}
      <SectionHeader title="Top Error Clusters" />
      <div className="uj-table-tile" style={{ padding: 16 }}>
        <svg width="100%" viewBox={`0 0 720 ${clusterChartH}`}>
          {topClusters.map((c, i) => {
            const y = i * 40 + 20;
            const barW = Math.max(4, (c.occurrences / maxOcc) * 350);
            return (
              <g key={i}>
                <text x={180} y={y + 14} textAnchor="end" fill="rgba(255,255,255,0.7)" fontSize={11} fontWeight={600}>{c.name.length > 26 ? c.name.substring(0, 26) + "…" : c.name}</text>
                <rect x={190} y={y} width={barW} height={28} rx={4} fill={RED} fillOpacity={0.3} stroke={RED} strokeWidth={0.5} strokeOpacity={0.4}><title>{c.name}: {fmtCount(c.occurrences)} occurrences, {fmtCount(c.sessions)} sessions</title></rect>
                <text x={190 + barW + 8} y={y + 12} fill="rgba(255,255,255,0.8)" fontSize={10} fontWeight={700}>{fmtCount(c.occurrences)}</text>
                <text x={190 + barW + 8} y={y + 24} fill="rgba(255,255,255,0.4)" fontSize={9}>{fmtCount(c.sessions)} sessions</text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Full error table */}
      <SectionHeader title="Error Cluster Details" />
      <div className="uj-table-tile"><DataTable sortable resizable fullWidth data={clusters.map(c => ({
        "Error Name": c.name, Occurrences: c.occurrences, Sessions: c.sessions,
        "Impact %": totalErrors > 0 ? Number(((c.occurrences / totalErrors) * 100).toFixed(1)) : 0,
        "Sample Message": c.sampleMessage.substring(0, 80),
      }))} columns={[
        { id: "Error Name", header: "Error Name", accessor: "Error Name", cell: ({ value }: any) => <Strong style={{ color: RED }}>{String(value).substring(0, 35)}</Strong> },
        { id: "Occurrences", header: "Count", accessor: "Occurrences", sortType: "number" as any, cell: ({ value }: any) => <Strong>{fmtCount(value)}</Strong> },
        { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: PURPLE }}>{fmtCount(value)}</Strong> },
        { id: "Impact %", header: "Impact %", accessor: "Impact %", sortType: "number" as any, cell: ({ value }: any) => <span style={{ display: "inline-block", width: "100%", padding: "2px 8px", borderRadius: 4, background: value >= 20 ? "rgba(194,25,48,0.15)" : value >= 5 ? "rgba(184,134,11,0.15)" : "rgba(128,128,128,0.1)", color: value >= 20 ? RED : value >= 5 ? YELLOW : "inherit", fontWeight: 700, textAlign: "center" }}>{value}%</span> },
        { id: "Sample Message", header: "Sample", accessor: "Sample Message", cell: ({ value }: any) => <Text style={{ fontSize: 11, opacity: 0.6 }}>{value}</Text> },
      ]} /></div>

      <div className="uj-table-tile" style={{ padding: 16 }}>
        <Text style={{ fontSize: 13, opacity: 0.7 }}>
          🐛 <Strong>Error Clustering</Strong> groups similar errors by type to help prioritize fixes. The "Impact %" shows how much of total error volume each cluster represents. Focus on clusters with high occurrence counts and high session impact first — these are the errors affecting the most users.
        </Text>
      </div>

      {/* Automated Root Cause Suggestions */}
      <SectionHeader title="Root Cause Analysis" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Correlates error clusters with deployments, browser versions, and temporal patterns to suggest probable root causes.</Text>
      {(() => {
        const deployRecords = (deployData?.data?.records ?? []) as any[];
        const recentDeploys = deployRecords.slice(0, 3).map((r: any) => String(r.deploy_name ?? r.first_time ?? "deployment"));
        const suggestions: { cluster: string; cause: string; action: string }[] = [];
        // Simple correlation: if errors spiked recently and there was a deployment
        if (clusters.length > 0 && recentDeploys.length > 0) {
          suggestions.push({ cluster: clusters[0].name, cause: `Correlates temporally with recent deployment: "${recentDeploys[0].substring(0, 40)}". Error count spiked after this event.`, action: "Investigate rollback or hotfix for the deployment." });
        }
        if (clusters.length > 1 && hourly.length > 2) {
          const recentHours = hourly.slice(-3);
          const earlyHours = hourly.slice(0, 3);
          const recentAvg = recentHours.reduce((a, h) => a + h.count, 0) / recentHours.length;
          const earlyAvg = earlyHours.reduce((a, h) => a + h.count, 0) / Math.max(1, earlyHours.length);
          if (recentAvg > earlyAvg * 2) suggestions.push({ cluster: "All errors", cause: "Error rate is accelerating over time — likely an ongoing regression rather than intermittent issue.", action: "Check for memory leaks, growing queues, or saturating resources." });
        }
        if (suggestions.length === 0) suggestions.push({ cluster: clusters[0]?.name ?? "General", cause: "No clear temporal correlation with deployments found. May be environment-specific (browser, region).", action: "Segment errors by browser/OS and check for device-specific issues." });
        return (
          <Flex flexDirection="column" gap={8}>
            {suggestions.map((s, i) => (
              <div key={i} className="uj-table-tile" style={{ padding: 12, borderLeft: `3px solid ${ORANGE}` }}>
                <Strong style={{ fontSize: 12, color: RED }}>{s.cluster.substring(0, 40)}</Strong>
                <Text style={{ display: "block", fontSize: 12, marginTop: 4 }}>🔍 {s.cause}</Text>
                <Text style={{ display: "block", fontSize: 12, marginTop: 4, color: BLUE }}>→ {s.action}</Text>
              </div>
            ))}
          </Flex>
        );
      })()}

      {/* Quick Fix Actions */}
      <SectionHeader title="Quick Actions" />
      <Flex gap={8} flexWrap="wrap">
        {clusters.slice(0, 5).map((c, i) => {
          const inspectorUrl = `${ENV_URL}/ui/apps/dynatrace.classic.errors.analysis/errors?gtf=-2h&gf=all&errorType=${encodeURIComponent(c.name)}`;
          return (
            <a key={i} href={inspectorUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
              <button style={{ padding: "6px 12px", borderRadius: 4, border: `1px solid ${RED}40`, background: `${RED}08`, color: RED, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>🔧 Fix: {c.name.substring(0, 25)}{c.name.length > 25 ? "…" : ""} ({fmtCount(c.occurrences)})</button>
            </a>
          );
        })}
      </Flex>

    </Flex>
  );
}
