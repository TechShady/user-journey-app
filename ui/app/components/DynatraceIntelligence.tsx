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
export const DTIntelligenceContext = React.createContext<{ open: boolean; close: () => void; activeTabKey: string }>({
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

// ── Response normalizer ───────────────────────────────────────────────────────
// Davis CoPilot may return its own JSON schemas; map any shape to AIAssistData.
function normalizeResponse(parsed: Record<string, unknown>): AIAssistData {
  // Already the expected shape
  if (typeof parsed.summary === "string") return parsed as unknown as AIAssistData;

  // Extract summary from common Davis CoPilot nested fields
  const execSummary = parsed.executive_summary as Record<string, unknown> | undefined;
  const summaryObj = typeof parsed.summary === "object" ? parsed.summary as Record<string, unknown> : undefined;
  const summary: string =
    (typeof execSummary?.key_message === "string" ? execSummary.key_message : "") ||
    (typeof summaryObj?.key_finding === "string" ? summaryObj.key_finding : "") ||
    (typeof parsed.key_message === "string" ? parsed.key_message as string : "") ||
    (typeof parsed.key_finding === "string" ? parsed.key_finding as string : "") ||
    (typeof parsed.overview === "string" ? parsed.overview as string : "") ||
    "";

  // Map top_risks / issues / kpi_analysis → insights
  const insights: AIAssistData["insights"] = [];
  const rawInsights = (parsed.top_risks ?? parsed.risks ?? parsed.issues ?? parsed.kpi_analysis ?? []) as Record<string, unknown>[];
  if (Array.isArray(rawInsights)) {
    for (const r of (rawInsights as Record<string, unknown>[]).slice(0, 6)) {
      const sevRaw = String(r.severity ?? r.status ?? "info").toLowerCase();
      const severity: AIAssistData["insights"][number]["severity"] =
        sevRaw.includes("critical") ? "critical"
        : sevRaw.includes("high") || sevRaw.includes("warning") ? "warning"
        : sevRaw.includes("good") || sevRaw.includes("excellent") || sevRaw.includes("low") ? "good"
        : "info";
      const icon = severity === "critical" ? "🔴" : severity === "warning" ? "🟡" : severity === "good" ? "🟢" : "ℹ️";
      const text = String(r.risk ?? r.text ?? r.metric ?? r.insight ?? r.finding ?? JSON.stringify(r));
      const detail = typeof r.business_impact === "string" ? ` — ${r.business_impact}` : typeof r.value === "string" || typeof r.value === "number" ? ` (${r.value})` : "";
      insights.push({ severity, icon, text: text + detail });
    }
  }

  // Map immediate_actions / recommendations / actions → recommendations
  const recommendations: AIAssistData["recommendations"] = [];
  const rawRecs = (parsed.immediate_actions ?? parsed.recommendations ?? parsed.actions ?? parsed.next_steps ?? []) as Record<string, unknown>[];
  if (Array.isArray(rawRecs)) {
    for (const a of (rawRecs as Record<string, unknown>[]).slice(0, 5)) {
      const prio = typeof a.priority === "number" ? a.priority : 99;
      const impact: AIAssistData["recommendations"][number]["impact"] = prio === 1 ? "high" : prio === 2 ? "medium" : "low";
      const text = String(a.action ?? a.text ?? a.recommendation ?? a.description ?? JSON.stringify(a));
      const rationale = typeof a.rationale === "string" ? ` ${a.rationale}` : typeof a.expected_impact === "string" ? ` Expected: ${a.expected_impact}` : "";
      recommendations.push({ impact, text: text + rationale });
    }
  }

  if (!summary && !insights.length && !recommendations.length) {
    // Last resort: stringify prettily so at least it's readable
    return { summary: JSON.stringify(parsed, null, 2), insights: [], recommendations: [] };
  }
  return { summary: summary || "Analysis complete.", insights, recommendations };
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useDTIntelligence(buildPrompt: () => { text: string; contextData: string }): { panel: React.ReactNode } {
  const { open, close, activeTabKey } = React.useContext(DTIntelligenceContext);
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
      try {
        const cleaned = response.text.replace(/^```[a-z]*\r?\n?/i, "").replace(/\r?\n?```$/i, "").trim();
        const parsed = JSON.parse(cleaned);
        if (parsed && typeof parsed === "object") {
          setAnalysis(normalizeResponse(parsed as Record<string, unknown>));
        } else {
          setAnalysis({ summary: response.text, insights: [], recommendations: [] });
        }
      } catch {
        // Not JSON — render as plain text / markdown
        setAnalysis({ summary: response.text, insights: [], recommendations: [] });
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
          <AIAssistPanel data={analysis} onClose={close} title="Dynatrace Intelligence" />
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
