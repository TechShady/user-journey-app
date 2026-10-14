import React, { useState, useEffect, useRef } from "react";
import { publicClient as davisCopilotClient } from "@dynatrace-sdk/client-davis-copilot";
import { AIAssistPanel, ensureStyles } from "./AIAssist";
import type { AIAssistData } from "./AIAssist";

// ── Spinner CSS (injected once) ───────────────────────────────────────────────
const DT_STYLE_ID = "cio-dt-intelligence-styles";
function ensureDTStyles() {
  if (typeof document === "undefined" || document.getElementById(DT_STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = DT_STYLE_ID;
  s.textContent = `
@keyframes cio-dt-spin { to { transform: rotate(360deg); } }
.cio-dt-spinner {
  width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0;
  border: 2px solid rgba(192,132,252,0.2);
  border-top-color: #c084fc;
  animation: cio-dt-spin 0.75s linear infinite;
}
`;
  document.head.appendChild(s);
}

// ── Context ───────────────────────────────────────────────────────────────────
export const DTIntelligenceContext = React.createContext<{
  open: boolean;
  close: () => void;
  activeTabKey: string;
  viewLabel?: string;
  subSubTabKey?: string;
  setSubSubTab?: (key: string) => void;
}>({
  open: false,
  close: () => {},
  activeTabKey: "",
});

// ── Loading / Error panels ────────────────────────────────────────────────────
function DTLoadingPanel({ onClose }: { onClose: () => void }) {
  ensureDTStyles();
  return (
    <div className="cio-ai-panel">
      <div className="cio-ai-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L13.5 10.5L22 12L13.5 13.5L12 22L10.5 13.5L2 12L10.5 10.5Z" fill="#c084fc" />
        </svg>
        <span className="cio-ai-title">Dynatrace Intelligence</span>
        <button className="cio-ai-close" onClick={onClose}>✕</button>
      </div>
      <div className="cio-ai-body">
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }}>
          <div className="cio-dt-spinner" />
          <span style={{ fontSize: 13, color: "#8b92a8" }}>Analyzing with Davis CoPilot…</span>
        </div>
      </div>
    </div>
  );
}

function DTErrorPanel({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="cio-ai-panel">
      <div className="cio-ai-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L13.5 10.5L22 12L13.5 13.5L12 22L10.5 13.5L2 12L10.5 10.5Z" fill="#c084fc" />
        </svg>
        <span className="cio-ai-title">Dynatrace Intelligence</span>
        <button className="cio-ai-close" onClick={onClose}>✕</button>
      </div>
      <div className="cio-ai-body">
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "4px 10px", borderRadius: 6, background: "rgba(248,49,47,0.06)", borderLeft: "3px solid #F8312F" }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
          <span style={{ fontSize: 13, color: "#c8cedf" }}>{message}</span>
        </div>
      </div>
    </div>
  );
}

// ── Davis boilerplate stripper ────────────────────────────────────────────────
// Remove known Davis CoPilot filler sentences that aren't useful to the user.
function stripBoilerplate(text: string): string {
  return text
    .replace(/\n?If you want help with[^.]*?Agentic AI[^.]*\./gi, "")
    .replace(/\n?Ask your admin to enable Agentic AI[^.]*\./gi, "")
    .trim();
}

// ── Response normalizer ───────────────────────────────────────────────────────
// Davis CoPilot returns varied JSON schemas; map any shape to AIAssistData.
function normalizeResponse(parsed: Record<string, unknown>): AIAssistData {
  // Unwrap single-key wrapper objects (e.g. { "funnel_health_assessment": { ... } })
  const topKeys = Object.keys(parsed);
  if (topKeys.length === 1 && parsed[topKeys[0]] !== null && typeof parsed[topKeys[0]] === "object" && !Array.isArray(parsed[topKeys[0]])) {
    parsed = parsed[topKeys[0]] as Record<string, unknown>;
  }

  // Already the expected shape — accept only when insights/recs items also have required text fields
  const insightsOk = Array.isArray(parsed.insights) && (parsed.insights as unknown[]).every(i => typeof (i as Record<string, unknown>).text === "string");
  const recsOk = Array.isArray(parsed.recommendations) && (parsed.recommendations as unknown[]).every(r => typeof (r as Record<string, unknown>).text === "string");
  if (typeof parsed.summary === "string" && parsed.summary.length > 30 && insightsOk && recsOk) {
    const recs = parsed.recommendations as AIAssistData["recommendations"];
    const bizRec: AIAssistData["recommendations"][number] = { impact: "high", text: "Engage Dynatrace Business Insights to maximize revenue, conversion, and customer experience through real-time business observability." };
    const hasBiz = recs.some(r => r.text.includes("Business Insights"));
    return { summary: parsed.summary as string, insights: parsed.insights as AIAssistData["insights"], recommendations: hasBiz ? recs : [bizRec, ...recs] };
  }

  const execSummary = parsed.executive_summary as Record<string, unknown> | undefined;
  const summaryObj = parsed.summary !== null && typeof parsed.summary === "object"
    ? parsed.summary as Record<string, unknown> : undefined;

  let summary = "";
  if (execSummary) {
    summary =
      (typeof execSummary.key_message === "string" ? execSummary.key_message : "") ||
      (typeof execSummary.key_finding === "string" ? execSummary.key_finding : "") ||
      (typeof execSummary.overall_health === "string" ? execSummary.overall_health : "");
  }
  if (!summary && summaryObj) {
    // Format all primitive fields of the summary object as readable markdown
    summary = Object.entries(summaryObj)
      .filter(([, v]) => typeof v === "string" || typeof v === "number")
      .map(([k, v]) => `**${k.replace(/_/g, " ")}:** ${v}`)
      .join("  \n");
  }
  if (!summary) {
    summary =
      (typeof parsed.health_summary === "string" ? parsed.health_summary as string : "") ||
      (typeof parsed.overall_summary === "string" ? parsed.overall_summary as string : "") ||
      (typeof parsed.analysis_summary === "string" ? parsed.analysis_summary as string : "") ||
      (typeof parsed.key_message === "string" ? parsed.key_message as string : "") ||
      (typeof parsed.key_finding === "string" ? parsed.key_finding as string : "") ||
      (typeof parsed.overview === "string" ? parsed.overview as string : "") ||
      (typeof parsed.conclusion === "string" ? parsed.conclusion as string : "") ||
      "";
  }

  // Map insight arrays — broad set of field names Davis uses
  const insights: AIAssistData["insights"] = [];
  // Pick the first non-empty array from the many names Davis uses
  const rawInsightsArr = [
    parsed.insights,
    parsed.domain_insights, parsed.kpi_insights, parsed.metric_insights,
    parsed.critical_risks, parsed.top_risks, parsed.risks, parsed.issues,
    parsed.kpi_analysis, parsed.step_by_step_analysis, parsed.step_analysis,
    parsed.steps, parsed.analysis, parsed.findings, parsed.observations,
    parsed.bottleneck_analysis, parsed.performance_analysis, parsed.metrics,
  ].find(v => Array.isArray(v) && (v as unknown[]).length > 0) ?? [];
  const rawInsights = rawInsightsArr as Record<string, unknown>[];
  for (const r of rawInsights.slice(0, 6)) {
    const sevRaw = String(r.severity ?? r.status ?? r.health ?? "info").toLowerCase();
    const severity: AIAssistData["insights"][number]["severity"] =
      sevRaw.includes("critical") ? "critical"
      : sevRaw.includes("high") || sevRaw.includes("warning") || sevRaw.includes("poor") ? "warning"
      : sevRaw.includes("good") || sevRaw.includes("excellent") || sevRaw.includes("low") ? "good"
      : "info";
    const icon = severity === "critical" ? "🔴" : severity === "warning" ? "🟡" : severity === "good" ? "🟢" : "ℹ️";
    const domainPrefix = typeof r.domain === "string" ? `[${r.domain}] ` : "";
    const stepPrefix = typeof r.step === "string" ? `**${r.step}**: ` : "";
    const rtext = stepPrefix + domainPrefix + String(
      r.risk ?? r.text ?? r.metric ?? r.insight ?? r.finding ??
      r.name ?? r.title ?? r.description ?? r.detail ?? r.assessment ??
      r.summary ?? r.message ?? r.content ?? r.observation ?? JSON.stringify(r)
    );
    const dropoffVal = r.drop_off_rate ?? r.dropoff_rate ?? r.dropoff ?? r.drop_off ?? "";
    const dropoffStr = typeof dropoffVal === "string" && dropoffVal !== "--" && dropoffVal !== "—" ? dropoffVal : "";
    const detail =
      typeof r.business_impact === "string" ? ` — ${r.business_impact}`
      : typeof r.business_consequence === "string" ? ` — ${r.business_consequence}`
      : dropoffStr ? ` (drop-off: ${dropoffStr})`
      : typeof r.notes === "string" ? ` — ${r.notes}`
      : (typeof r.value === "string" || typeof r.value === "number") ? ` (${r.value})`
      : "";
    insights.push({ severity, icon, text: rtext + detail });
  }

  // Map recommendation arrays — broad set of field names Davis uses
  const recommendations: AIAssistData["recommendations"] = [];
  // Handle top_N_immediate_actions pattern (e.g. top_3_immediate_actions)
  const actionsKey = Object.keys(parsed).find(k => /^top_\d+_immediate_actions$/.test(k));

  // Deep-search for recommendation arrays: look for recommended_fix objects, specific_interventions, etc.
  const deepFindRecs = (obj: unknown, depth = 0): Record<string, unknown>[] | string[] | null => {
    if (depth > 4 || !obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    // recommended_fix object → wrap as single recommendation
    if (typeof o.action === "string" && (typeof o.priority === "string" || typeof o.rank === "number")) return [o];
    // specific_interventions → array of strings
    if (Array.isArray(o.specific_interventions) && o.specific_interventions.length > 0) return o.specific_interventions as string[];
    // Recurse into values
    for (const v of Object.values(o)) {
      const found = deepFindRecs(v, depth + 1);
      if (found) return found;
    }
    return null;
  };
  const deepRecs = deepFindRecs(parsed);
  // Normalize deepRecs: if they're strings, convert to rec objects
  const deepRecsNorm: Record<string, unknown>[] = deepRecs
    ? (deepRecs as unknown[]).map(r => typeof r === "string" ? { priority: "high", action: r } : r as Record<string, unknown>)
    : [];

  const rawRecs = ([
    parsed.immediate_actions, parsed.recommendations, parsed.actions,
    parsed.next_steps, parsed.optimizations,
    actionsKey ? parsed[actionsKey] : undefined,
    deepRecsNorm.length > 0 ? deepRecsNorm : undefined,
  ].find(v => Array.isArray(v) && (v as unknown[]).length > 0) ?? []) as Record<string, unknown>[];
  for (const a of rawRecs.slice(0, 5)) {
    const prioRaw = String(a.priority ?? a.rank ?? a.urgency ?? "").toLowerCase();
    const impact: AIAssistData["recommendations"][number]["impact"] =
      prioRaw === "1" || prioRaw.includes("high") || prioRaw.includes("immediate") || prioRaw.includes("critical") ? "high"
      : prioRaw === "2" || prioRaw.includes("medium") || prioRaw.includes("moderate") ? "medium"
      : "low";
    const targetPrefix = typeof a.target_step === "string" ? `**${a.target_step}**: ` : "";
    const atext = String(
      a.action ?? a.text ?? a.recommendation ?? a.description ?? a.title ??
      a.specific_fix ?? a.issue ?? a.finding ?? JSON.stringify(a)
    );
    const rationale = typeof a.expected_impact === "string" ? ` Expected: ${a.expected_impact}`
      : typeof a.rationale === "string" ? ` ${a.rationale}` : "";
    recommendations.push({ impact, text: targetPrefix + atext + rationale });
  }

  const bizInsights: AIAssistData["recommendations"][number] = {
    impact: "high",
    text: "Engage Dynatrace Business Insights to maximize revenue, conversion, and customer experience through real-time business observability.",
  };

  // Last-resort: walk the entire tree looking for any string > 80 chars to use as summary
  if (!summary) {
    const walk = (obj: unknown, depth = 0): string => {
      if (depth > 4 || !obj || typeof obj !== "object") return "";
      for (const v of Object.values(obj as Record<string, unknown>)) {
        if (typeof v === "string" && v.length > 80) return v;
        if (typeof v === "object") { const r = walk(v, depth + 1); if (r) return r; }
      }
      return "";
    };
    summary = walk(parsed);
  }

  if (!summary && !insights.length && !recommendations.length) {
    return { summary: JSON.stringify(parsed, null, 2), insights: [], recommendations: [bizInsights] };
  }
  return { summary: summary || "Analysis complete.", insights, recommendations: [bizInsights, ...recommendations] };
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useDTIntelligence(buildPrompt: () => { text: string; contextData: string }): { panel: React.ReactNode } {
  const { open, close, activeTabKey, viewLabel } = React.useContext(DTIntelligenceContext);
  const [analysis, setAnalysis] = useState<AIAssistData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);
  const prevTabKeyRef = useRef<string>("");
  const buildPromptRef = useRef(buildPrompt);
  useEffect(() => { buildPromptRef.current = buildPrompt; });

  useEffect(() => {
    if (!open) {
      fetchedRef.current = false;
      prevTabKeyRef.current = "";
      setAnalysis(null);
      setError(null);
      return;
    }
    if (fetchedRef.current && activeTabKey === prevTabKeyRef.current) return;
    fetchedRef.current = true;
    prevTabKeyRef.current = activeTabKey;
    setAnalysis(null);
    setError(null);

    const { text, contextData } = buildPromptRef.current();
    setLoading(true);

    davisCopilotClient.recommenderConversation({
      body: {
        text,
        ...(contextData ? { context: [{ type: "supplementary" as const, value: contextData }] } : {}),
        annotations: { "origin-app": "my.user.journey.app" },
      },
    }).then((response) => {
      if (Array.isArray(response)) {
        setError("Unexpected streaming response from Davis CoPilot.");
        setLoading(false);
        return;
      }
      // Robustly extract JSON: prefer a code fence, otherwise find first { to last }
      const raw = response.text;
      const fenceMatch = raw.match(/```[a-z]*\r?\n([\s\S]*?)\r?\n```/i);
      let jsonStr: string | null = null;
      let afterText = "";
      if (fenceMatch && fenceMatch.index !== undefined) {
        jsonStr = fenceMatch[1];
        afterText = raw.slice(fenceMatch.index + fenceMatch[0].length).trim();
      } else {
        const firstBrace = raw.indexOf("{");
        const lastBrace = raw.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          jsonStr = raw.slice(firstBrace, lastBrace + 1);
          afterText = raw.slice(lastBrace + 1).trim();
        }
      }
      try {
        if (!jsonStr) throw new Error("no json");
        const parsed = JSON.parse(jsonStr);
        if (parsed && typeof parsed === "object") {
          const normalized = normalizeResponse(parsed as Record<string, unknown>);
          const cleanAfter = stripBoilerplate(afterText);
          if (cleanAfter) {
            normalized.summary = cleanAfter + (normalized.summary && normalized.summary !== "Analysis complete." ? "\n\n" + normalized.summary : "");
          }
          normalized.summary = stripBoilerplate(normalized.summary);
          setAnalysis(normalized);
        } else {
          setAnalysis({ summary: raw, insights: [], recommendations: [] });
        }
      } catch {
        setAnalysis({ summary: raw, insights: [], recommendations: [] });
      }
      setLoading(false);
    }).catch((err: unknown) => {
      setError(
        err instanceof Error
          ? err.message
          : "Dynatrace Intelligence is unavailable. Verify the Davis CoPilot scope is granted."
      );
      setLoading(false);
    });
  }, [open, activeTabKey]);

  if (!open) return { panel: null };

  return {
    panel: (
      <div style={{ padding: "12px 20px 0" }}>
        {loading ? (
          <DTLoadingPanel onClose={close} />
        ) : error ? (
          <DTErrorPanel message={error} onClose={close} />
        ) : analysis ? (
          <AIAssistPanel data={analysis} onClose={close} title="Dynatrace Intelligence" subtitle={viewLabel} />
        ) : null}
      </div>
    ),
  };
}

// ── Button ────────────────────────────────────────────────────────────────────
export function DTIntelligenceButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  ensureStyles();
  return (
    <button
      className={`cio-ai-assist-btn${open ? " active" : ""}`}
      onClick={onToggle}
      title="Dynatrace Intelligence — generative analysis via Davis CoPilot"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
        <path d="M14 4L15.2 9.6L20 12L15.2 14.4L14 20L12.8 14.4L8 12L12.8 9.6Z" fill="url(#cio-dt-btn-g)" />
        <path d="M7 2L7.7 4.8L10 6L7.7 7.2L7 10L6.3 7.2L4 6L6.3 4.8Z" fill="url(#cio-dt-btn-g)" />
        <path d="M5 13L5.5 14.8L7 16L5.5 17.2L5 19L4.5 17.2L3 16L4.5 14.8Z" fill="url(#cio-dt-btn-g)" />
        <defs>
          <linearGradient id="cio-dt-btn-g" x1="3" y1="2" x2="20" y2="20">
            <stop stopColor="#c084fc" /><stop offset="1" stopColor="#818cf8" />
          </linearGradient>
        </defs>
      </svg>
      Dynatrace Intelligence
    </button>
  );
}

// ── Prompt builder ────────────────────────────────────────────────────────────
export function buildDTPromptUserJourney(params: {
  activeTabLabel: string;
  funnelName: string;
  conversionRate: number | null;
  totalSessions: number | null;
  totalErrors: number | null;
  errorRate: number | null;
  apdex: number | null;
  avgDurationMs: number | null;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
  aov: number;
  revenue: number | null;
  industry: string;
  openProblems: number | null;
  deploymentsToday: number | null;
}): { text: string; contextData: string } {
  const { activeTabLabel, funnelName, conversionRate, totalSessions, totalErrors, errorRate, apdex, avgDurationMs, lcp, cls, inp, aov, revenue, industry, openProblems, deploymentsToday } = params;
  const pct = (v: number | null) => v != null ? v.toFixed(2) + "%" : "N/A";
  const ms = (v: number | null) => v != null ? v.toFixed(0) + "ms" : "N/A";
  const num = (v: number | null) => v != null ? v.toLocaleString() : "N/A";
  return {
    text: `Analyze this user journey and conversion funnel data from Dynatrace User Journey & Experience app for funnel "${funnelName}"${activeTabLabel ? " (viewing: " + activeTabLabel + ")" : ""}. Identify conversion bottlenecks, user experience issues, and performance problems. Provide prioritized recommendations to improve conversion rate and digital experience.`,
    contextData: `Dynatrace User Journey — Funnel Analysis
Funnel: ${funnelName}
${industry ? "Industry: " + industry : ""}
Active view: ${activeTabLabel || "Executive Summary"}

Funnel Performance:
  Total sessions: ${num(totalSessions)}
  Conversion rate: ${pct(conversionRate)}
  Average order value: $${aov.toFixed(0)}
  Estimated revenue (conversions × AOV): ${revenue != null ? "$" + revenue.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "N/A"}

User Experience:
  Apdex score: ${apdex != null ? apdex.toFixed(3) : "N/A"}
  Avg session duration: ${ms(avgDurationMs)}
  Error rate: ${pct(errorRate)}
  Total errors: ${num(totalErrors)}

Core Web Vitals:
  LCP (Largest Contentful Paint): ${ms(lcp)} (target <2500ms)
  INP (Interaction to Next Paint): ${ms(inp)} (target <200ms)
  CLS (Cumulative Layout Shift): ${cls != null ? cls.toFixed(3) : "N/A"} (target <0.1)

Incidents & Deployments:
  Open Davis problems: ${openProblems != null ? openProblems : "N/A"}
  Deployments today: ${deploymentsToday != null ? deploymentsToday : "N/A"}`,
  };
}
