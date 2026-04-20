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
