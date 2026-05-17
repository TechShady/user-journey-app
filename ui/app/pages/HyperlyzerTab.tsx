import React, { useEffect, useMemo, useState } from "react";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { getEnvironmentUrl } from "@dynatrace-sdk/app-environment";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph } from "@dynatrace/strato-components/typography";
import { Select, TextInput } from "@dynatrace/strato-components-preview/forms";
import { Button } from "@dynatrace/strato-components/buttons";
import { ProgressCircle } from "@dynatrace/strato-components/content";
import { Modal } from "@dynatrace/strato-components/overlays";
import {
  RadialHyperChart,
  type DimensionData,
  type DimensionKey,
  type DimensionItem,
  formatActionDuration,
  DIM_BASE_COLOR,
} from "../components/RadialHyperChart";
import { useAIInsights } from "./UserJourney";
import type { AIInsightsData, InsightItem, RecommendationItem } from "./UserJourney";

// ─── Metric Configuration ───────────────────────────────────────────────────

export type MetricKey =
  | "duration"
  | "apdex"
  | "lcp"
  | "inp"
  | "cls"
  | "ttfb"
  | "load_event_end"
  | "fcp";

interface MetricConfig {
  key: MetricKey;
  label: string;
  summarize: string;
  unit: "ms" | "seconds" | "score" | "ratio";
  higherIsBetter: boolean;
  preCompute?: string;
  postCompute?: string;
  extraFilter?: string;
  skipNavigationFilter?: boolean;
}

const METRICS: MetricConfig[] = [
  {
    key: "duration",
    label: "Action Duration",
    summarize: "metric_val = median(duration) / 1000000, cnt = count()",
    unit: "ms",
    higherIsBetter: false,
  },
  {
    key: "apdex",
    label: "Apdex",
    summarize: "satisfied = countIf(duration <= 3s), frustrated = countIf(duration > 12s), cnt = count()",
    postCompute: "| fieldsAdd metric_val = (toDouble(satisfied) + 0.5 * toDouble(cnt - satisfied - frustrated)) / toDouble(cnt)",
    unit: "score",
    higherIsBetter: true,
  },
  {
    key: "lcp",
    label: "LCP",
    summarize: "metric_val = percentile(web_vitals.largest_contentful_paint, 75) / 1000000, cnt = count()",
    unit: "ms",
    higherIsBetter: false,
    extraFilter: "| filter isNotNull(web_vitals.largest_contentful_paint)",
    skipNavigationFilter: true,
  },
  {
    key: "inp",
    label: "INP",
    summarize: "metric_val = percentile(web_vitals.interaction_to_next_paint, 75) / 1000000, cnt = count()",
    unit: "ms",
    higherIsBetter: false,
    extraFilter: "| filter isNotNull(web_vitals.interaction_to_next_paint)",
    skipNavigationFilter: true,
  },
  {
    key: "cls",
    label: "CLS",
    summarize: "metric_val = percentile(web_vitals.cumulative_layout_shift, 75), cnt = count()",
    unit: "ratio",
    higherIsBetter: false,
    extraFilter: "| filter isNotNull(web_vitals.cumulative_layout_shift)",
    skipNavigationFilter: true,
  },
  {
    key: "ttfb",
    label: "TTFB",
    summarize: "metric_val = percentile(web_vitals.time_to_first_byte, 75) / 1000000, cnt = count()",
    unit: "ms",
    higherIsBetter: false,
    extraFilter: "| filter isNotNull(web_vitals.time_to_first_byte)",
  },
  {
    key: "load_event_end",
    label: "Load Event End",
    summarize: "metric_val = percentile(performance.load_event_end, 75) / 1000000, cnt = count()",
    unit: "ms",
    higherIsBetter: false,
    extraFilter: "| filter isNotNull(performance.load_event_end)",
  },
  {
    key: "fcp",
    label: "FCP",
    summarize: "metric_val = percentile(web_vitals.first_contentful_paint, 75) / 1000000, cnt = count()",
    unit: "ms",
    higherIsBetter: false,
    extraFilter: "| filter isNotNull(web_vitals.first_contentful_paint)",
    skipNavigationFilter: true,
  },
];

const METRIC_MAP = Object.fromEntries(METRICS.map((m) => [m.key, m])) as Record<MetricKey, MetricConfig>;

const formatMetricValue = (value: number, metric: MetricConfig): string => {
  if (!isFinite(value) || value < 0) return "—";
  switch (metric.unit) {
    case "ms":
      if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
      if (value >= 1) return `${value.toFixed(0)} ms`;
      return `${(value * 1000).toFixed(0)} µs`;
    case "seconds":
      return `${value.toFixed(2)} s`;
    case "score":
      return value.toFixed(2);
    case "ratio":
      return value.toFixed(4);
  }
};

const getMetricRating = (value: number, metric: MetricConfig): "good" | "needs-improvement" | "poor" => {
  switch (metric.key) {
    case "lcp": return value < 2500 ? "good" : value < 4000 ? "needs-improvement" : "poor";
    case "fcp": return value < 1800 ? "good" : value < 3000 ? "needs-improvement" : "poor";
    case "inp": return value < 200 ? "good" : value < 500 ? "needs-improvement" : "poor";
    case "cls": return value < 0.1 ? "good" : value < 0.25 ? "needs-improvement" : "poor";
    case "ttfb": return value < 800 ? "good" : value < 1800 ? "needs-improvement" : "poor";
    case "load_event_end": return value < 2500 ? "good" : value < 4000 ? "needs-improvement" : "poor";
    case "duration": return value < 3000 ? "good" : value < 12000 ? "needs-improvement" : "poor";
    case "apdex": return value >= 0.85 ? "good" : value >= 0.5 ? "needs-improvement" : "poor";
    default: return "good";
  }
};

const RATING_COLOR: Record<string, string> = {
  good: "#0cce6b",
  "needs-improvement": "#ffa400",
  poor: "#ff4e42",
};

// ─── Interfaces & constants ─────────────────────────────────────────────────

interface DimRow extends Record<string, unknown> {
  label: string;
  metric_val: string | number | null;
  cnt: string | number | null;
}

interface MedianRow extends Record<string, unknown> {
  metric_val: string | number | null;
}

interface AppliedFilter {
  dim: DimensionKey;
  label: string;
}

const DIM_TITLE: Record<DimensionKey, string> = {
  os: "Operating System",
  geo: "Geolocation",
  user_action: "User Action",
  browser: "Browser",
};

const DIM_FIELD_EXPR: Record<DimensionKey, string> = {
  os: "os.name",
  geo: "geo.country.iso_code",
  user_action: "coalesce(page.detected_name, page.url.path, page.title)",
  browser: "browser.name",
};

const COUNTRY_NAME: Record<string, string> = {
  US: "United States", CN: "China", DE: "Germany", JP: "Japan", GB: "United Kingdom",
  KR: "South Korea", FR: "France", IT: "Italy", BR: "Brazil", IN: "India",
  CA: "Canada", AU: "Australia", ES: "Spain", MX: "Mexico", NL: "Netherlands",
  RU: "Russia", SE: "Sweden", CH: "Switzerland", PL: "Poland", BE: "Belgium",
  AT: "Austria", NO: "Norway", DK: "Denmark", FI: "Finland", IE: "Ireland",
  NZ: "New Zealand", SG: "Singapore", HK: "Hong Kong", TW: "Taiwan", IL: "Israel",
  ZA: "South Africa", AR: "Argentina", CL: "Chile", CO: "Colombia", PT: "Portugal",
  CZ: "Czech Republic", RO: "Romania", HU: "Hungary", GR: "Greece", TR: "Turkey",
  TH: "Thailand", MY: "Malaysia", PH: "Philippines", ID: "Indonesia", VN: "Vietnam",
  UA: "Ukraine", EG: "Egypt", SA: "Saudi Arabia", AE: "United Arab Emirates",
  PK: "Pakistan", BD: "Bangladesh", NG: "Nigeria", KE: "Kenya", LT: "Lithuania",
  LV: "Latvia", EE: "Estonia", SK: "Slovakia", SI: "Slovenia", HR: "Croatia",
  BG: "Bulgaria", RS: "Serbia", KZ: "Kazakhstan", BY: "Belarus", PE: "Peru",
};

const displayLabel = (dim: DimensionKey, label: string): string => {
  if (dim === "geo") return COUNTRY_NAME[label] ?? label;
  return label;
};

const TOP_N = 8;
const FULL_LIST_LIMIT = 500;
const PAGE_SIZE = 25;
const escapeStr = (s: string) => s.replace(/"/g, '\\"');

const DIM_SESSION_FILTER: Record<DimensionKey, { name: string; alwaysQuoteValue: boolean }> = {
  os: { name: "\"OS Name\"", alwaysQuoteValue: true },
  geo: { name: "Location", alwaysQuoteValue: true },
  user_action: { name: "Action name", alwaysQuoteValue: true },
  browser: { name: "Browser", alwaysQuoteValue: false },
};

// ─── Query builders (use periodClause from parent) ──────────────────────────

const filterClauses = (filters: AppliedFilter[]): string =>
  filters.map((f) => `| filter ${DIM_FIELD_EXPR[f.dim]} == "${escapeStr(f.label)}"`).join("\n");

function buildDimQuery(
  dim: DimensionKey,
  frontend: string,
  periodStr: string,
  filters: AppliedFilter[],
  metric: MetricConfig,
  topN = TOP_N,
): string {
  const navFilter = metric.skipNavigationFilter ? "" : "| filter characteristics.has_navigation == true";
  return `
fetch user.events, ${periodStr}
${navFilter}
| filter dt.rum.user_type != "robot"
| filter frontend.name == "${escapeStr(frontend)}"
${filterClauses(filters)}
${metric.extraFilter ?? ""}
| fieldsAdd label = ${DIM_FIELD_EXPR[dim]}
| filter isNotNull(label) and label != ""
${metric.preCompute ?? ""}
| summarize
    ${metric.summarize},
    by: {label}
${metric.postCompute ?? ""}
| sort cnt desc
| limit ${topN}
`.trim();
}

function buildMedianQuery(
  frontend: string,
  periodStr: string,
  filters: AppliedFilter[],
  metric: MetricConfig,
): string {
  const navFilter = metric.skipNavigationFilter ? "" : "| filter characteristics.has_navigation == true";
  return `
fetch user.events, ${periodStr}
${navFilter}
| filter dt.rum.user_type != "robot"
| filter frontend.name == "${escapeStr(frontend)}"
${filterClauses(filters)}
${metric.extraFilter ?? ""}
${metric.preCompute ?? ""}
| summarize ${metric.summarize}
${metric.postCompute ?? ""}
`.trim();
}

const toItems = (records: DimRow[] | undefined, dim?: DimensionKey): DimensionItem[] => {
  if (!records) return [];
  return records
    .map((r) => {
      const label = String(r.label ?? "—");
      return {
        label,
        displayLabel: dim ? displayLabel(dim, label) : label,
        durationMs: Number(r.metric_val ?? 0),
        count: Number(r.cnt ?? 0),
      };
    })
    .filter((i) => i.count > 0);
};

// ─── Sub-components ─────────────────────────────────────────────────────────

interface FindingCardProps {
  color: string;
  dimensionLabel: string;
  title: string;
  description: React.ReactNode;
}

const FindingCard: React.FC<FindingCardProps> = ({ color, dimensionLabel, title, description }) => (
  <div style={{ flex: "1 1 240px", minWidth: 240, border: "1px solid var(--dt-colors-border-neutral-default, rgba(0,0,0,0.08))", borderTop: `4px solid ${color}`, padding: "14px 18px 16px", background: "var(--dt-colors-background-surface-default)", color: "var(--dt-colors-text-neutral-default)", borderRadius: 6, display: "flex", flexDirection: "column", gap: 6, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.7, color, fontWeight: 700 }}>{dimensionLabel}</div>
    <div style={{ fontWeight: 600, fontSize: 18, lineHeight: 1.25 }}>{title}</div>
    <div style={{ fontSize: 14, lineHeight: 1.45, color: "var(--dt-colors-text-neutral-default)" }}>{description}</div>
  </div>
);

interface FilterChipProps {
  filter: AppliedFilter;
  onRemove: () => void;
}

const FilterChip: React.FC<FilterChipProps> = ({ filter, onRemove }) => {
  const color = DIM_BASE_COLOR[filter.dim];
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: color, color: "#fff", padding: "4px 4px 4px 10px", borderRadius: 4, fontSize: 12, fontWeight: 500, boxShadow: "0 1px 2px rgba(0,0,0,0.15)" }}>
      <span style={{ opacity: 0.85, fontSize: 10, textTransform: "uppercase" }}>{DIM_TITLE[filter.dim]}:</span>
      <span>{displayLabel(filter.dim, filter.label)}</span>
      <button type="button" onClick={onRemove} aria-label={`Remove filter ${filter.label}`} style={{ background: "rgba(255,255,255,0.25)", border: "none", color: "#fff", cursor: "pointer", width: 20, height: 20, borderRadius: 3, fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
    </div>
  );
};

// ─── Drilldown URL builder ──────────────────────────────────────────────────

function buildDrilldownUrl(
  frontend: string,
  dim: DimensionKey,
  label: string,
  periodStr: string,
  appEntityId?: string,
): string {
  let envUrl = "";
  try { envUrl = getEnvironmentUrl(); } catch { /* dev */ }
  if (dim === "user_action" && appEntityId) {
    const pageEncoded = encodeURIComponent(btoa(label));
    return `${envUrl}/ui/apps/dynatrace.experience.vitals/performance/web/${appEntityId}/pages/${pageEncoded}`;
  }
  const base = `${envUrl}/ui/apps/dynatrace.users.sessions/sessions/finished-sessions/finished-sessions`;
  const dimFilter = DIM_SESSION_FILTER[dim];
  const displayVal = displayLabel(dim, label);
  const needsQuotes = dimFilter.alwaysQuoteValue || displayVal.includes(" ");
  const valStr = needsQuotes ? `"${displayVal}"` : displayVal;
  const filterStr = `Frontends = ${frontend} ${dimFilter.name} = ${valStr} `;
  const hash = `#filtering=${encodeURIComponent(filterStr).replace(/%20/g, "+")}`;
  return `${base}?perspective=general&sort=navigationCount%3Adescending${hash}`;
}

// ─── AI Insights analysis ───────────────────────────────────────────────────

function analyzeHyperlyzer(dimensions: DimensionData[], appMedianMs: number, metric: MetricConfig, appliedFilters: AppliedFilter[]): AIInsightsData {
  const insights: InsightItem[] = [];
  const recs: RecommendationItem[] = [];
  const totalItems = dimensions.reduce((s, d) => s + d.items.length, 0);

  if (totalItems === 0) return { summary: "No data available for analysis. Try expanding the timeframe or verifying the frontend application has traffic.", insights: [{ severity: "info", icon: "📊", text: "No dimension data found." }], recommendations: [{ impact: "high", text: "Expand the timeframe or verify the frontend application name in Settings." }] };

  // Find worst outliers
  for (const d of dimensions) {
    for (const item of d.items) {
      if (appMedianMs > 0) {
        const ratio = metric.higherIsBetter ? appMedianMs / Math.max(item.durationMs, 0.001) : item.durationMs / Math.max(appMedianMs, 0.001);
        if (ratio > 3) {
          insights.push({ severity: "critical", icon: "🔴", text: `${d.title}: "${item.displayLabel ?? item.label}" is ${ratio.toFixed(1)}× worse than the app median (${formatMetricValue(item.durationMs, metric)} vs ${formatMetricValue(appMedianMs, metric)}).` });
          recs.push({ impact: "high", text: `Investigate performance for ${d.title.toLowerCase()} "${item.displayLabel ?? item.label}" — it's significantly underperforming.` });
        } else if (ratio > 2) {
          insights.push({ severity: "warning", icon: "⚠️", text: `${d.title}: "${item.displayLabel ?? item.label}" is ${ratio.toFixed(1)}× worse than the app median.` });
        }
      }
    }
  }

  // Check metric health
  if (metric.key === "apdex" && appMedianMs < 0.5) {
    insights.push({ severity: "critical", icon: "🔴", text: `Overall Apdex is ${appMedianMs.toFixed(2)} (Poor). Users are experiencing unacceptable performance.` });
    recs.push({ impact: "high", text: "Focus on the worst-performing dimensions shown in the chart — they're dragging down the overall Apdex." });
  } else if (metric.key === "apdex" && appMedianMs >= 0.85) {
    insights.push({ severity: "good", icon: "✅", text: `Apdex of ${appMedianMs.toFixed(2)} is Excellent across dimensions.` });
  }

  if (appliedFilters.length > 0) {
    insights.push({ severity: "info", icon: "🔍", text: `Analysis is filtered by ${appliedFilters.length} dimension(s): ${appliedFilters.map(f => `${DIM_TITLE[f.dim]}="${displayLabel(f.dim, f.label)}"`).join(", ")}. Remove filters to see the full picture.` });
  }

  if (insights.length === 0) {
    insights.push({ severity: "good", icon: "✅", text: `All dimensions are performing within expected ranges for ${metric.label}.` });
  }

  const summary = `Hyperlyzer provides a multidimensional radial exploration of frontend performance across OS, Geolocation, User Action, and Browser dimensions. Currently analyzing ${metric.label} across ${totalItems} dimension values with an app median of ${formatMetricValue(appMedianMs, metric)}. ${appliedFilters.length > 0 ? `Filtered by ${appliedFilters.length} dimension(s).` : "No filters applied — showing global view."} Use the radial chart to visually identify outliers (bars extending far beyond the median reference line) and click to drill down.`;
  return { summary, insights, recommendations: recs };
}

// ─── Main Tab Component ─────────────────────────────────────────────────────

interface HyperlyzerTabProps {
  frontend: string;
  periodStr: string;
  appEntityId: string;
  isLoading?: boolean;
  refetchOpts?: { refetchInterval: number } | undefined;
}

export function HyperlyzerTab({ frontend, periodStr, appEntityId, refetchOpts }: HyperlyzerTabProps) {
  const [filterText, setFilterText] = useState("");
  const [focusDim, setFocusDim] = useState<DimensionKey>("geo");
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilter[]>([]);
  const [pendingFilter, setPendingFilter] = useState<AppliedFilter | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>("duration");
  const metric = METRIC_MAP[selectedMetric];

  const browser = useDql<DimRow>({ query: buildDimQuery("browser", frontend, periodStr, appliedFilters, metric) }, refetchOpts);
  const os = useDql<DimRow>({ query: buildDimQuery("os", frontend, periodStr, appliedFilters, metric) }, refetchOpts);
  const geo = useDql<DimRow>({ query: buildDimQuery("geo", frontend, periodStr, appliedFilters, metric) }, refetchOpts);
  const userAction = useDql<DimRow>({ query: buildDimQuery("user_action", frontend, periodStr, appliedFilters, metric) }, refetchOpts);
  const median = useDql<MedianRow>({ query: buildMedianQuery(frontend, periodStr, appliedFilters, metric) }, refetchOpts);
  const focusedFull = useDql<DimRow>({ query: buildDimQuery(focusDim, frontend, periodStr, appliedFilters, metric, FULL_LIST_LIMIT) }, refetchOpts);

  const dimensions: DimensionData[] = useMemo(() => [
    { key: "os", title: DIM_TITLE.os, items: toItems(os.data?.records as DimRow[] | undefined, "os") },
    { key: "geo", title: DIM_TITLE.geo, items: toItems(geo.data?.records as DimRow[] | undefined, "geo") },
    { key: "user_action", title: DIM_TITLE.user_action, items: toItems(userAction.data?.records as DimRow[] | undefined, "user_action") },
    { key: "browser", title: DIM_TITLE.browser, items: toItems(browser.data?.records as DimRow[] | undefined, "browser") },
  ], [browser.data, os.data, geo.data, userAction.data]);

  const appMedianMs = Number((median.data?.records?.[0] as MedianRow | undefined)?.metric_val ?? 0);

  const isLoading = browser.isLoading || os.isLoading || geo.isLoading || userAction.isLoading || median.isLoading || focusedFull.isLoading;
  const firstError = browser.error || os.error || geo.error || userAction.error || median.error || focusedFull.error;

  const findings = useMemo(() => {
    const all: { dim: DimensionData; item: DimensionItem; ratio: number }[] = [];
    for (const d of dimensions) {
      for (const i of d.items) {
        if (appMedianMs > 0) all.push({ dim: d, item: i, ratio: i.durationMs / appMedianMs });
      }
    }
    all.sort((a, b) => Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1));
    const seenDim = new Set<DimensionKey>();
    const top: typeof all = [];
    for (const f of all) {
      if (!seenDim.has(f.dim.key)) { seenDim.add(f.dim.key); top.push(f); }
      if (top.length >= 4) break;
    }
    if (top.length < 4) {
      for (const f of all) {
        if (!top.includes(f)) top.push(f);
        if (top.length >= 4) break;
      }
    }
    return top;
  }, [dimensions, appMedianMs]);

  // AI Insights
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeHyperlyzer(dimensions, appMedianMs, metric, appliedFilters), [dimensions, appMedianMs, metric, appliedFilters]));

  const focusedItems: DimensionItem[] = useMemo(
    () => toItems(focusedFull.data?.records as DimRow[] | undefined, focusDim),
    [focusedFull.data, focusDim],
  );
  const focusedRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    const filtered = q ? focusedItems.filter((i) => (i.displayLabel ?? i.label).toLowerCase().includes(q)) : focusedItems;
    return [...filtered].sort((a, b) => b.durationMs - a.durationMs);
  }, [focusedItems, filterText]);

  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [focusDim, filterText, frontend, periodStr, appliedFilters]);
  const totalPages = Math.max(1, Math.ceil(focusedRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = focusedRows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const removeFilter = (idx: number) => setAppliedFilters((arr) => arr.filter((_, i) => i !== idx));
  const promptFilter = (dim: DimensionKey, item: DimensionItem) => {
    if (appliedFilters.some((f) => f.dim === dim && f.label === item.label)) return;
    setPendingFilter({ dim, label: item.label });
  };
  const applyPending = () => {
    if (pendingFilter) setAppliedFilters((arr) => [...arr, pendingFilter]);
    setPendingFilter(null);
  };

  const [chartSize, setChartSize] = useState(620);
  useEffect(() => {
    const recompute = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const byWidth = Math.min(720, Math.max(360, w / 2 - 80));
      const byHeight = Math.max(420, h - 360);
      setChartSize(Math.min(byWidth, byHeight));
    };
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, []);

  return (
    <Flex flexDirection="column" padding={24} gap={16}>
      {aiPanel}
      <Flex justifyContent="space-between" alignItems="flex-start" gap={16}>
        <Flex flexDirection="column" gap={4} style={{ flex: 1 }}>
          <Heading level={2}>{frontend}</Heading>
          <Paragraph>Multidimensional visual query interface · click a dimension label to focus, click a slice or list entry to add a filter.</Paragraph>
        </Flex>
        <Flex flexDirection="column" gap={2} style={{ minWidth: 200 }}>
          <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--dt-colors-text-neutral-subdued)" }}>Metric</span>
          <Select name="metric-select" value={selectedMetric} onChange={(v) => { if (v) setSelectedMetric(v as MetricKey); }}>
            <Select.Trigger style={{ minWidth: 200 }} />
            <Select.Content>
              {METRICS.map((m) => (<Select.Option key={m.key} value={m.key}>{m.label}</Select.Option>))}
            </Select.Content>
          </Select>
        </Flex>
      </Flex>

      {firstError && (
        <div style={{ background: "var(--dt-colors-background-container-critical-default)", color: "var(--dt-colors-text-critical-default)", padding: "8px 12px", borderRadius: 4, border: "1px solid var(--dt-colors-border-critical-default, rgba(198,34,57,0.4))" }}>
          Query error: {firstError.message}
        </div>
      )}

      {appliedFilters.length > 0 && (
        <Flex gap={8} flexWrap="wrap" alignItems="center">
          <span style={{ fontSize: 11, textTransform: "uppercase", color: "var(--dt-colors-text-neutral-subdued)", letterSpacing: 0.5, marginRight: 4 }}>Filtered dimensions</span>
          {appliedFilters.map((f, i) => (<FilterChip key={`${f.dim}-${f.label}-${i}`} filter={f} onRemove={() => removeFilter(i)} />))}
          <Button variant="default" onClick={() => setAppliedFilters([])}>Clear all</Button>
        </Flex>
      )}

      <Flex gap={16} flexWrap="wrap">
        {findings.length === 0 && !isLoading && (<Paragraph>No findings yet — try a wider timeframe.</Paragraph>)}
        {findings.map((f, idx) => {
          const slower = metric.higherIsBetter ? f.ratio < 1 : f.ratio >= 1;
          const factor = slower
            ? (metric.higherIsBetter ? (1 / Math.max(f.ratio, 0.0001)) : f.ratio).toFixed(1)
            : (metric.higherIsBetter ? f.ratio : (1 / Math.max(f.ratio, 0.0001))).toFixed(1);
          const worseLabel = metric.higherIsBetter ? "lower" : "higher";
          const betterLabel = metric.higherIsBetter ? "higher" : "lower";
          return (
            <FindingCard key={idx} color={DIM_BASE_COLOR[f.dim.key]} dimensionLabel={f.dim.title} title={f.item.displayLabel ?? f.item.label}
              description={<>{metric.label} is <strong>{factor}×</strong> {slower ? worseLabel : betterLabel} than the app median (<strong>{formatMetricValue(f.item.durationMs, metric)}</strong> vs {formatMetricValue(appMedianMs, metric)}).</>}
            />
          );
        })}
      </Flex>

      <Flex gap={24} alignItems="flex-start" style={{ width: "100%" }}>
        <Flex justifyContent="center" style={{ flex: "1 1 50%", minWidth: 0, position: "relative" }}>
          {isLoading && (
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1, pointerEvents: "none" }}>
              <ProgressCircle />
            </div>
          )}
          <RadialHyperChart
            dimensions={dimensions}
            appMedianMs={appMedianMs}
            size={chartSize}
            focusDim={focusDim}
            onDimensionFocus={(k) => setFocusDim(k)}
            onSliceClick={(k, item) => promptFilter(k, item)}
            formatValue={(v) => formatMetricValue(v, metric)}
            metricLabel={`App median ${metric.label}`}
          />
        </Flex>

        <Flex justifyContent="center" style={{ flex: "1 1 50%", minWidth: 0 }}>
          <Flex flexDirection="column" gap={8} style={{ width: "100%", maxWidth: 480 }}>
            <Flex gap={6} alignItems="center" flexWrap="wrap">
              <span style={{ fontSize: 11, textTransform: "uppercase", color: "var(--dt-colors-text-neutral-subdued)", letterSpacing: 0.5 }}>Focus</span>
              {(["geo", "os", "browser", "user_action"] as DimensionKey[]).map((k) => (
                <button key={k} type="button" onClick={() => setFocusDim(k)} style={{ border: "none", cursor: "pointer", padding: "4px 10px", borderRadius: 4, background: focusDim === k ? DIM_BASE_COLOR[k] : "var(--dt-colors-background-container-neutral-default)", color: focusDim === k ? "#fff" : "var(--dt-colors-text-neutral-default)", fontSize: 12, fontWeight: focusDim === k ? 600 : 500 }}>
                  {DIM_TITLE[k]}
                </button>
              ))}
            </Flex>

            <TextInput value={filterText} onChange={(v: string) => setFilterText(v)} placeholder={`Filter ${DIM_TITLE[focusDim]}...`} />

            <div style={{ maxHeight: chartSize - 100, overflowY: "auto", border: "1px solid var(--dt-colors-border-neutral-default, rgba(0,0,0,0.08))", borderRadius: 4, background: "var(--dt-colors-background-surface-default)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ fontSize: 11, color: "var(--dt-colors-text-neutral-subdued)", textAlign: "left", background: "var(--dt-colors-background-container-neutral-subdued)", position: "sticky", top: 0, zIndex: 1 }}>
                    <th style={{ padding: "10px 12px", letterSpacing: 0.5 }}>{DIM_TITLE[focusDim].toUpperCase()}</th>
                    <th style={{ padding: "10px 12px", textAlign: "right", letterSpacing: 0.5 }}>{metric.label.toUpperCase()}</th>
                    <th style={{ padding: "10px 12px", textAlign: "center", letterSpacing: 0.5 }}>DRILLDOWN</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r, idx) => (
                    <tr key={`${focusDim}-${r.label}-${idx}`} style={{ borderTop: "1px solid var(--dt-colors-border-neutral-default, rgba(0,0,0,0.05))", cursor: "pointer" }} onClick={() => promptFilter(focusDim, r)}>
                      <td style={{ padding: "8px 12px", fontSize: 13 }}>
                        <span style={{ display: "inline-block", width: 10, height: 10, background: DIM_BASE_COLOR[focusDim], borderRadius: 2, marginRight: 8, verticalAlign: "middle" }} />
                        {displayLabel(focusDim, r.label)}
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13, color: RATING_COLOR[getMetricRating(r.durationMs, metric)], fontWeight: 600 }}>
                        {formatMetricValue(r.durationMs, metric)}
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "center", fontSize: 13 }}>
                        <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(buildDrilldownUrl(frontend, focusDim, r.label, periodStr, appEntityId), "_blank"); }} style={{ color: "var(--dt-colors-text-primary-default, #1496ff)", textDecoration: "none", fontWeight: 500, cursor: "pointer" }}>
                          {focusDim === "user_action" ? "Vitals ↗" : "Sessions ↗"}
                        </a>
                      </td>
                    </tr>
                  ))}
                  {pageRows.length === 0 && !isLoading && (
                    <tr><td colSpan={3} style={{ padding: "16px", textAlign: "center", color: "var(--dt-colors-text-neutral-subdued)" }}>No matching entries.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <Flex justifyContent="space-between" alignItems="center" style={{ fontSize: 12, color: "var(--dt-colors-text-neutral-subdued)", padding: "4px 2px" }}>
              <span>{focusedRows.length === 0 ? "0 entries" : `${safePage * PAGE_SIZE + 1}–${Math.min(focusedRows.length, (safePage + 1) * PAGE_SIZE)} of ${focusedRows.length}`}</span>
              {totalPages > 1 && (
                <Flex gap={6} alignItems="center">
                  <Button variant="default" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}>Prev</Button>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>Page {safePage + 1} / {totalPages}</span>
                  <Button variant="default" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1}>Next</Button>
                </Flex>
              )}
            </Flex>
          </Flex>
        </Flex>
      </Flex>

      <Modal title="Apply filter" show={pendingFilter !== null} onDismiss={() => setPendingFilter(null)} size="small"
        footer={<Flex gap={8} justifyContent="flex-end"><Button variant="default" onClick={() => setPendingFilter(null)}>Cancel</Button><Button variant="accent" color="primary" onClick={applyPending}>Apply filter</Button></Flex>}
      >
        {pendingFilter && (<Paragraph>Restrict the analysis to <strong>{DIM_TITLE[pendingFilter.dim]}</strong> = <strong>{displayLabel(pendingFilter.dim, pendingFilter.label)}</strong>?</Paragraph>)}
      </Modal>
    </Flex>
  );
}
