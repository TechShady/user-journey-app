import React, { useMemo } from "react";

// ── Types ────────────────────────────────────────────────────────────────────
export type InsightSeverity = "good" | "warning" | "critical" | "info";
export type InsightItem = { severity: InsightSeverity; icon: string; text: string };
export type RecommendationItem = { impact: "high" | "medium" | "low"; text: string };
export type AIAssistData = { summary: string; insights: InsightItem[]; recommendations: RecommendationItem[] };

// ── CSS injection ────────────────────────────────────────────────────────────
const STYLE_ID = "cio-ai-assist-styles";
export function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
.cio-ai-panel {
  border: 1px solid rgba(165,110,255,0.25);
  border-radius: 10px;
  background: rgba(165,110,255,0.04);
  overflow: hidden;
  animation: cio-ai-slide-in 0.25s ease-out;
  margin: 0 0 4px;
}
@keyframes cio-ai-slide-in {
  from { opacity: 0; max-height: 0; transform: translateY(-8px); }
  to   { opacity: 1; max-height: 2000px; transform: translateY(0); }
}
.cio-ai-header {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(165,110,255,0.15);
}
.cio-ai-header svg { width: 16px; height: 16px; flex-shrink: 0; }
.cio-ai-title { font-size: 13px; font-weight: 700; color: #e8eaf0; flex: 1; }
.cio-ai-close {
  background: none; border: none; cursor: pointer;
  color: #8b92a8; font-size: 14px; padding: 2px 6px; line-height: 1;
}
.cio-ai-close:hover { color: #e8eaf0; }
.cio-ai-pdf {
  background: none; border: none; cursor: pointer;
  color: #8b92a8; padding: 2px 4px; line-height: 1; display: flex; align-items: center;
  transition: color 0.15s ease;
}
.cio-ai-pdf:hover { color: #a78bfa; }
.cio-ai-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 14px; }
.cio-ai-section-label {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.8px; color: #5c6480; margin-bottom: 6px;
}
.cio-ai-summary-box {
  padding: 10px 14px; border-radius: 8px;
  background: rgba(165,110,255,0.06);
  border: 1px solid rgba(165,110,255,0.12);
  font-size: 13px; line-height: 1.55; color: #c8cedf;
}
.cio-ai-insight-row {
  display: flex; gap: 8px; align-items: flex-start;
  padding: 6px 10px; border-radius: 6px; margin-bottom: 4px;
  font-size: 13px; line-height: 1.5; color: #c8cedf;
}
.cio-ai-insight-row.good     { background: rgba(0,210,106,0.06);  border-left: 3px solid #00D26A; }
.cio-ai-insight-row.warning  { background: rgba(252,213,63,0.06); border-left: 3px solid #FCD53F; }
.cio-ai-insight-row.critical { background: rgba(248,49,47,0.06);  border-left: 3px solid #F8312F; }
.cio-ai-insight-row.info     { background: rgba(82,108,255,0.06); border-left: 3px solid #526cff; }
.cio-ai-rec-row {
  display: flex; gap: 8px; align-items: flex-start;
  padding: 7px 10px; border-radius: 6px; margin-bottom: 4px;
  background: rgba(255,255,255,0.03);
  font-size: 13px; line-height: 1.5; color: #c8cedf;
}
.cio-ai-badge {
  font-size: 9px; font-weight: 700; text-transform: uppercase;
  padding: 2px 6px; border-radius: 3px; white-space: nowrap; flex-shrink: 0; margin-top: 1px;
}
.cio-ai-badge.high   { background: rgba(248,49,47,0.15);  color: #F8312F; }
.cio-ai-badge.medium { background: rgba(252,213,63,0.15); color: #FCD53F; }
.cio-ai-badge.low    { background: rgba(255,255,255,0.08); color: #8b92a8; }
@keyframes cio-ai-word-in {
  from { opacity: 0; transform: translateY(3px); }
  to   { opacity: 1; transform: translateY(0); }
}
.cio-ai-word { display: inline; opacity: 0; animation: cio-ai-word-in 0.25s ease forwards; }
.cio-ai-assist-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 14px; border-radius: 20px;
  border: 1px solid rgba(255,255,255,0.12);
  background: #1e2030;
  color: #e8eaf0; font-size: 13px; font-weight: 700;
  cursor: pointer; transition: all 0.18s ease; white-space: nowrap;
  letter-spacing: 0.01em;
}
.cio-ai-assist-btn:hover { background: #252840; border-color: rgba(165,110,255,0.4); }
.cio-ai-assist-btn.active { background: #252840; border-color: rgba(165,110,255,0.55); box-shadow: 0 0 10px rgba(165,110,255,0.15); }
`;
  document.head.appendChild(s);
}

// ── SparkleIcon ──────────────────────────────────────────────────────────────
function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M14 4L15.2 9.6L20 12L15.2 14.4L14 20L12.8 14.4L8 12L12.8 9.6Z" fill="url(#cio-sp-grad)" />
      <path d="M7 2L7.7 4.8L10 6L7.7 7.2L7 10L6.3 7.2L4 6L6.3 4.8Z" fill="url(#cio-sp-grad)" />
      <path d="M5 13L5.5 14.8L7 16L5.5 17.2L5 19L4.5 17.2L3 16L4.5 14.8Z" fill="url(#cio-sp-grad)" />
      <defs>
        <linearGradient id="cio-sp-grad" x1="3" y1="2" x2="20" y2="20">
          <stop stopColor="#c084fc" /><stop offset="1" stopColor="#818cf8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ── StreamText ───────────────────────────────────────────────────────────────
function StreamText({ text, baseDelay }: { text: string; baseDelay: number }) {
  const words = text.split(/(\s+)/);
  let wi = 0;
  return (
    <>
      {words.map((w, i) => {
        if (/^\s+$/.test(w)) return w;
        const delay = baseDelay + wi * 50;
        wi++;
        return <span key={i} className="cio-ai-word" style={{ animationDelay: `${delay}ms` }}>{w}</span>;
      })}
    </>
  );
}

// ── MarkdownContent ───────────────────────────────────────────────────────────
// Lightweight inline markdown renderer for Davis CoPilot prose responses.
// Uses the same cio-ai-word animation as StreamText, with a shared counter
// so words stream in left-to-right, top-to-bottom across all elements.
function MarkdownContent({ text, baseDelay = 100 }: { text: string; baseDelay?: number }) {
  // Shared mutable counter — increments for every non-whitespace word rendered
  const counter = { i: 0 };
  const WPD = 35; // ms per word

  const word = (w: string): React.ReactNode => {
    const delay = baseDelay + counter.i++ * WPD;
    return <span className="cio-ai-word" style={{ animationDelay: `${delay}ms` }}>{w}</span>;
  };

  const parseInline = (str: string): React.ReactNode => {
    const parts = str.split(/(\*\*[^*]+\*\*)/g);
    const out: React.ReactNode[] = [];
    parts.forEach((part, pi) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        const inner = part.slice(2, -2);
        const tokens = inner.split(/(\s+)/);
        out.push(<strong key={pi} style={{ color: "#e8eaf0" }}>
          {tokens.map((t, ti) => /^\s+$/.test(t) ? t : <React.Fragment key={ti}>{word(t)}</React.Fragment>)}
        </strong>);
      } else {
        part.split(/(\s+)/).forEach((t, ti) => {
          out.push(/^\s+$/.test(t) ? t : <React.Fragment key={`${pi}-${ti}`}>{word(t)}</React.Fragment>);
        });
      }
    });
    return out;
  };

  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("### ") || trimmed.startsWith("## ")) {
      const content = trimmed.replace(/^#{2,3} /, "");
      nodes.push(<div key={i} style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.5px", marginTop: 10, marginBottom: 4 }}>{parseInline(content)}</div>);
    } else if (trimmed.startsWith("# ")) {
      nodes.push(<div key={i} style={{ fontSize: 13, fontWeight: 700, color: "#e8eaf0", marginTop: 6, marginBottom: 6 }}>{parseInline(trimmed.slice(2))}</div>);
    } else if (trimmed.match(/^\|[\s\-:|]+\|$/)) {
      // table separator row — skip
    } else if (trimmed.startsWith("|")) {
      const cells = trimmed.split("|").slice(1, -1).map(c => c.trim());
      const isHeader = i + 1 < lines.length && lines[i + 1].trim().match(/^\|[\s\-:|]+\|$/);
      nodes.push(
        <div key={i} style={{ display: "flex", gap: 12, marginBottom: 2, paddingBottom: isHeader ? 4 : 0, borderBottom: isHeader ? "1px solid rgba(165,110,255,0.2)" : "none" }}>
          {cells.map((cell, ci) => (
            <div key={ci} style={{ flex: 1, fontSize: 12, color: isHeader ? "#a78bfa" : "#c8cedf", fontWeight: isHeader ? 700 : 400 }}>{parseInline(cell)}</div>
          ))}
        </div>
      );
    } else if (trimmed.match(/^[-*] /)) {
      nodes.push(
        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 3, paddingLeft: 4 }}>
          <span style={{ color: "#a78bfa", flexShrink: 0, lineHeight: "20px" }}>•</span>
          <span style={{ fontSize: 13, color: "#c8cedf", lineHeight: 1.55 }}>{parseInline(trimmed.slice(2))}</span>
        </div>
      );
    } else if (line.match(/^\s{2,}[-*] /)) {
      nodes.push(
        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 2, paddingLeft: 18 }}>
          <span style={{ color: "#6b7280", flexShrink: 0, lineHeight: "20px", fontSize: 11 }}>◦</span>
          <span style={{ fontSize: 12, color: "#8b92a8", lineHeight: 1.5 }}>{parseInline(trimmed.replace(/^\s+[-*] /, ""))}</span>
        </div>
      );
    } else {
      nodes.push(<div key={i} style={{ fontSize: 13, color: "#c8cedf", lineHeight: 1.6, marginBottom: 3 }}>{parseInline(trimmed)}</div>);
    }
  }

  return <>{nodes}</>;
}

function isMarkdown(text: string) {
  return /^#{1,3} |^\*\*|^\|.+\||^[-*] /m.test(text);
}

// ── PDF export ────────────────────────────────────────────────────────────────
function markdownToHtml(text: string): string {
  const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) => escHtml(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  const lines = text.split("\n");
  const out: string[] = [];
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (!t) { if (inTable) { out.push("</table>"); inTable = false; } continue; }

    if (t.startsWith("## ") || t.startsWith("### ")) {
      out.push(`<h3>${inline(t.replace(/^#{2,3} /, ""))}</h3>`);
    } else if (t.startsWith("# ")) {
      out.push(`<h2>${inline(t.slice(2))}</h2>`);
    } else if (t.match(/^\|[\s\-:|]+\|$/)) {
      // skip separator
    } else if (t.startsWith("|")) {
      const cells = t.split("|").slice(1, -1).map(c => c.trim());
      const isHeader = i + 1 < lines.length && lines[i + 1].trim().match(/^\|[\s\-:|]+\|$/);
      if (!inTable) { out.push("<table>"); inTable = true; }
      const tag = isHeader ? "th" : "td";
      out.push(`<tr>${cells.map(c => `<${tag}>${inline(c)}</${tag}>`).join("")}</tr>`);
    } else if (t.match(/^[-*] /)) {
      if (inTable) { out.push("</table>"); inTable = false; }
      out.push(`<li>${inline(t.slice(2))}</li>`);
    } else {
      if (inTable) { out.push("</table>"); inTable = false; }
      out.push(`<p>${inline(t)}</p>`);
    }
  }
  if (inTable) out.push("</table>");
  return out.join("\n");
}

function exportPDF(data: AIAssistData, title: string) {
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const summaryHtml = isMarkdown(data.summary) ? markdownToHtml(data.summary) : `<p>${data.summary}</p>`;

  const insightsHtml = data.insights.map(ins => `
    <div class="insight ${ins.severity}">
      <span class="icon">${ins.icon}</span>
      <span>${ins.text}</span>
    </div>`).join("");

  const recsHtml = data.recommendations.map(rec => `
    <div class="rec">
      <span class="badge ${rec.impact}">${rec.impact}</span>
      <span>${rec.text}</span>
    </div>`).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${title}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 48px; color: #111827; font-size: 14px; line-height: 1.6; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #7c3aed; padding-bottom: 12px; margin-bottom: 24px; }
  .header-title { font-size: 22px; font-weight: 700; color: #7c3aed; }
  .header-date { font-size: 12px; color: #6b7280; margin-top: 4px; }
  .label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #6b7280; margin: 20px 0 8px; }
  .summary-box { background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 8px; padding: 14px 18px; }
  .summary-box p { margin: 4px 0; } .summary-box h2 { font-size: 15px; color: #7c3aed; margin: 14px 0 4px; } .summary-box h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #7c3aed; margin: 12px 0 4px; }
  .summary-box table { border-collapse: collapse; width: 100%; margin: 8px 0; } .summary-box th { font-weight: 700; color: #7c3aed; border-bottom: 2px solid #ddd6fe; padding: 4px 8px; text-align: left; font-size: 12px; } .summary-box td { padding: 4px 8px; border-bottom: 1px solid #ede9fe; font-size: 12px; } .summary-box li { margin: 3px 0; }
  .insight { display: flex; gap: 10px; padding: 8px 12px; border-radius: 6px; margin-bottom: 6px; }
  .insight.good { background: #f0fdf4; border-left: 3px solid #22c55e; } .insight.warning { background: #fffbeb; border-left: 3px solid #f59e0b; } .insight.critical { background: #fef2f2; border-left: 3px solid #ef4444; } .insight.info { background: #eff6ff; border-left: 3px solid #3b82f6; }
  .icon { flex-shrink: 0; }
  .rec { display: flex; gap: 10px; padding: 8px 12px; border-radius: 6px; margin-bottom: 6px; background: #f9fafb; }
  .badge { font-size: 9px; font-weight: 700; text-transform: uppercase; padding: 2px 7px; border-radius: 3px; white-space: nowrap; flex-shrink: 0; margin-top: 3px; }
  .badge.high { background: #fee2e2; color: #dc2626; } .badge.medium { background: #fef3c7; color: #d97706; } .badge.low { background: #f3f4f6; color: #6b7280; }
  @media print { @page { margin: 32px; } body { margin: 0; } }
</style></head><body>
<div class="header">
  <div><div class="header-title">${title}</div><div class="header-date">Generated ${date}</div></div>
</div>
<div class="label">Summary</div>
<div class="summary-box">${summaryHtml}</div>
${data.insights.length > 0 ? `<div class="label">Insights</div>${insightsHtml}` : ""}
${data.recommendations.length > 0 ? `<div class="label">Recommendations</div>${recsHtml}` : ""}
</body></html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 400);
}

// ── AIAssistPanel ────────────────────────────────────────────────────────────
export function AIAssistPanel({ data, onClose, title = "AI Insights" }: { data: AIAssistData; onClose: () => void; title?: string }) {
  ensureStyles();
  const summaryWordCount = data.summary.split(/\s+/).length;
  const summaryDuration = summaryWordCount * 50;

  let insightOffset = summaryDuration + 300;
  const insightDurations = data.insights.map(ins => ins.text.split(/\s+/).length * 50);

  return (
    <div className="cio-ai-panel">
      <div className="cio-ai-header">
        <SparkleIcon />
        <span className="cio-ai-title">{title}</span>
        <button className="cio-ai-pdf" title="Export to PDF" onClick={() => exportPDF(data, title)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <polyline points="9 15 12 18 15 15"/>
          </svg>
        </button>
        <button className="cio-ai-close" onClick={onClose}>✕</button>
      </div>
      <div className="cio-ai-body">
        {/* Summary */}
        <div>
          <div className="cio-ai-section-label" style={{ opacity: 0, animation: "cio-ai-word-in 0.25s ease forwards", animationDelay: "80ms" }}>Summary</div>
          <div className="cio-ai-summary-box">
            {isMarkdown(data.summary)
              ? <MarkdownContent text={data.summary} />
              : <StreamText text={data.summary} baseDelay={150} />}
          </div>
        </div>

        {/* Insights */}
        {data.insights.length > 0 && (
          <div>
            <div className="cio-ai-section-label" style={{ opacity: 0, animation: "cio-ai-word-in 0.25s ease forwards", animationDelay: `${insightOffset - 150}ms` }}>Insights</div>
            {data.insights.map((ins, i) => {
              const myOffset = insightOffset;
              insightOffset += insightDurations[i] + 200;
              return (
                <div key={i} className={`cio-ai-insight-row ${ins.severity}`} style={{ opacity: 0, animation: "cio-ai-word-in 0.25s ease forwards", animationDelay: `${myOffset - 80}ms` }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{ins.icon}</span>
                  <span><StreamText text={ins.text} baseDelay={myOffset} /></span>
                </div>
              );
            })}
          </div>
        )}

        {/* Recommendations */}
        {data.recommendations.length > 0 && (
          <div>
            <div className="cio-ai-section-label" style={{ opacity: 0, animation: "cio-ai-word-in 0.25s ease forwards", animationDelay: `${insightOffset}ms` }}>Recommendations</div>
            {data.recommendations.map((rec, i) => {
              const myOffset = insightOffset + 250 + i * 700;
              return (
                <div key={i} className="cio-ai-rec-row" style={{ opacity: 0, animation: "cio-ai-word-in 0.25s ease forwards", animationDelay: `${myOffset}ms` }}>
                  <span className={`cio-ai-badge ${rec.impact}`}>{rec.impact}</span>
                  <span><StreamText text={rec.text} baseDelay={myOffset + 80} /></span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Context ──────────────────────────────────────────────────────────────────
export const AIAssistContext = React.createContext<{ open: boolean; close: () => void }>({ open: false, close: () => {} });

// ── useAIAssist ──────────────────────────────────────────────────────────────
export function useAIAssist(analysisFn: () => AIAssistData): { panel: React.ReactNode } {
  const { open, close } = React.useContext(AIAssistContext);
  const data = useMemo(() => (open ? analysisFn() : null), [open, analysisFn]);
  return {
    panel: open && data ? (
      <div style={{ padding: "12px 20px 0" }}>
        <AIAssistPanel data={data} onClose={close} />
      </div>
    ) : null,
  };
}

// ── AIAssistButton ───────────────────────────────────────────────────────────
export function AIAssistButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  ensureStyles();
  return (
    <button className={`cio-ai-assist-btn${open ? " active" : ""}`} onClick={onToggle} title="AI Assist — intelligent insights for this tab">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
        <path d="M14 4L15.2 9.6L20 12L15.2 14.4L14 20L12.8 14.4L8 12L12.8 9.6Z" fill="url(#cio-ai-btn-g)" />
        <path d="M7 2L7.7 4.8L10 6L7.7 7.2L7 10L6.3 7.2L4 6L6.3 4.8Z" fill="url(#cio-ai-btn-g)" />
        <path d="M5 13L5.5 14.8L7 16L5.5 17.2L5 19L4.5 17.2L3 16L4.5 14.8Z" fill="url(#cio-ai-btn-g)" />
        <defs>
          <linearGradient id="cio-ai-btn-g" x1="3" y1="2" x2="20" y2="20">
            <stop stopColor="#c084fc" /><stop offset="1" stopColor="#818cf8" />
          </linearGradient>
        </defs>
      </svg>
      AI Assist
    </button>
  );
}

// ── Per-tab analysis functions ───────────────────────────────────────────────

// Q1 — Service Health
export function analyzeServiceHealth(params: {
  openProblems: number;
  apiErrorRate: number;
  svcRows: Array<{ name: string; avail: number; errorRate: number }>;
  latencyTotalMs: number;
  slaTarget: number;
}): AIAssistData {
  const { openProblems, apiErrorRate, svcRows, latencyTotalMs, slaTarget } = params;
  const belowSla = svcRows.filter(r => r.avail < slaTarget);
  const criticalSvcs = svcRows.filter(r => r.avail < 99.0);
  const avgAvail = svcRows.length > 0 ? svcRows.reduce((s, r) => s + r.avail, 0) / svcRows.length : 100;

  const errorStatus = apiErrorRate > 2 ? "critical" : apiErrorRate > 0.5 ? "elevated" : "healthy";
  const summary = svcRows.length === 0
    ? "No service data is available. Configure a service name filter in Settings to begin monitoring service health."
    : `Monitoring ${svcRows.length} service${svcRows.length !== 1 ? "s" : ""} with an average availability of ${avgAvail.toFixed(2)}%. API error rate is ${apiErrorRate.toFixed(2)}% (${errorStatus}) and ${openProblems} Davis problem${openProblems !== 1 ? "s are" : " is"} currently open. E2E latency totals ${latencyTotalMs.toFixed(0)}ms across monitored services.`;

  const insights: InsightItem[] = [];
  if (openProblems > 0) insights.push({ severity: "critical", icon: "🚨", text: `${openProblems} active problem${openProblems !== 1 ? "s" : ""} detected by Davis AI — root-cause analysis is in progress. Check the Root-Cause Signal panel for the top affected entity.` });
  else insights.push({ severity: "good", icon: "✅", text: "No open Davis problems. All services are operating within baseline parameters." });

  if (apiErrorRate > 2) insights.push({ severity: "critical", icon: "🔴", text: `API error rate is ${apiErrorRate.toFixed(2)}% — above the 2% critical threshold. This directly degrades member experience and may indicate a failing service or dependency.` });
  else if (apiErrorRate > 0.5) insights.push({ severity: "warning", icon: "⚠️", text: `API error rate of ${apiErrorRate.toFixed(2)}% is elevated. Investigate service call chains for upstream failures or timeouts.` });
  else insights.push({ severity: "good", icon: "✅", text: `API error rate is healthy at ${apiErrorRate.toFixed(2)}% — below the 0.5% warning threshold.` });

  if (belowSla.length > 0) insights.push({ severity: "warning", icon: "📉", text: `${belowSla.length} service${belowSla.length !== 1 ? "s are" : " is"} below the ${slaTarget}% SLA target: ${belowSla.map(s => s.name).join(", ")}.` });
  if (criticalSvcs.length > 0) insights.push({ severity: "critical", icon: "🔥", text: `${criticalSvcs.length} service${criticalSvcs.length !== 1 ? "s have" : " has"} availability below 99.0%, indicating systemic degradation rather than transient spikes.` });

  if (latencyTotalMs > 3000) insights.push({ severity: "warning", icon: "⏱️", text: `E2E latency total of ${latencyTotalMs.toFixed(0)}ms exceeds 3 seconds. Members will perceive sluggish response times for digital banking workflows.` });
  else if (latencyTotalMs > 0) insights.push({ severity: "good", icon: "⚡", text: `E2E latency is ${latencyTotalMs.toFixed(0)}ms — within acceptable bounds for digital banking transactions.` });

  const recommendations: RecommendationItem[] = [];
  if (openProblems > 0) recommendations.push({ impact: "high", text: `Acknowledge and assign the ${openProblems} open Davis problem${openProblems !== 1 ? "s" : ""}. Use the Dynatrace problem detail view to review impacted entities, evidence items, and suggested root causes before escalating to on-call engineers.` });
  if (apiErrorRate > 0.5) recommendations.push({ impact: "high", text: `Drill into the service with the highest error rate using Dynatrace Service Analysis. Filter for the top failure reason (HTTP 5xx vs timeout vs dependency failure) to accelerate root-cause isolation.` });
  if (belowSla.length > 0) recommendations.push({ impact: "medium", text: `Services below the ${slaTarget}% SLA target should be reviewed in the Error Budget tab. If the burn rate is accelerating, consider triggering an incident and freezing deployments until stability is restored.` });
  recommendations.push({ impact: "low", text: `Set Davis anomaly detection metric events on service availability at ${slaTarget - 0.1}% to get early warnings before SLA breaches compound into member impact.` });

  return { summary, insights, recommendations };
}

// Q2 — Member Impact
export function analyzeMemberImpact(params: {
  membersOnline: number;
  membersImpacted: number;
  activeIncidents: number;
  loginSuccessRate: number | null;
  crashFree: number;
  abandonment: number | null;
  apdex: number;
  watchCount: number;
  journeySuccessPct: number | null;
}): AIAssistData {
  const { membersOnline, membersImpacted, activeIncidents, loginSuccessRate, crashFree, abandonment, apdex, watchCount, journeySuccessPct } = params;
  const impactPct = membersOnline > 0 ? (membersImpacted / membersOnline) * 100 : 0;
  const apdexLabel = apdex >= 0.94 ? "Excellent" : apdex >= 0.85 ? "Good" : apdex >= 0.7 ? "Fair" : "Poor";

  const summary = `${membersOnline.toLocaleString()} members active (last 15 min) with ${membersImpacted.toLocaleString()} sessions experiencing errors${membersOnline > 0 ? ` (${impactPct.toFixed(1)}% impact rate)` : ""}. ${activeIncidents} active major incident${activeIncidents !== 1 ? "s" : ""}, Apdex ${apdex.toFixed(2)} (${apdexLabel}), mobile crash-free rate ${crashFree.toFixed(1)}%.`;

  const insights: InsightItem[] = [];
  if (activeIncidents > 0) insights.push({ severity: "critical", icon: "🚨", text: `${activeIncidents} active major incident${activeIncidents !== 1 ? "s are" : " is"} causing member-facing disruption. All available SRE resources should be engaged immediately.` });
  else insights.push({ severity: "good", icon: "✅", text: "No active major incidents. Member experience is operating normally." });

  if (membersImpacted > 0) insights.push({ severity: impactPct > 5 ? "critical" : "warning", icon: "👥", text: `${membersImpacted.toLocaleString()} member session${membersImpacted !== 1 ? "s are" : " is"} impacted (${impactPct.toFixed(1)}% of active members). Prioritize root-cause identification to limit session abandonment.` });

  if (loginSuccessRate !== null) {
    if (loginSuccessRate < 95) insights.push({ severity: "critical", icon: "🔐", text: `Login success rate of ${loginSuccessRate.toFixed(1)}% is critically low — members cannot authenticate. This is the highest-priority member experience failure.` });
    else if (loginSuccessRate < 99) insights.push({ severity: "warning", icon: "🔐", text: `Login success rate of ${loginSuccessRate.toFixed(1)}% is below the 99% target. Auth errors at this level will drive measurable call-center volume.` });
    else insights.push({ severity: "good", icon: "🔐", text: `Login success rate of ${loginSuccessRate.toFixed(1)}% is healthy — members are authenticating without friction.` });
  }

  if (journeySuccessPct !== null && journeySuccessPct < 99.5) insights.push({ severity: "warning", icon: "🔄", text: `End-to-end journey success of ${journeySuccessPct.toFixed(1)}% is below the 99.5% target. Review funnel drop-offs at each step (Login → Balance → Transfer → Confirm) to isolate the highest-dropout stage.` });

  if (crashFree < 99.5) insights.push({ severity: "warning", icon: "📱", text: `Mobile crash-free session rate of ${crashFree.toFixed(1)}% is below 99.5%. Mobile crashes cause immediate session abandonment and generate app store complaints.` });
  else insights.push({ severity: "good", icon: "📱", text: `Mobile crash-free rate of ${crashFree.toFixed(1)}% meets the 99.5% target — mobile stability is healthy.` });

  if (abandonment !== null && abandonment > 8) insights.push({ severity: "critical", icon: "🚪", text: `Digital abandonment rate of ${abandonment.toFixed(1)}% is critically high. More than 1 in 12 members who start the login journey never complete a transaction.` });
  else if (abandonment !== null && abandonment > 3) insights.push({ severity: "warning", icon: "🚪", text: `Digital abandonment rate of ${abandonment.toFixed(1)}% is elevated. Investigate friction points between Login and Confirm transaction steps.` });

  if (watchCount > 0) insights.push({ severity: "info", icon: "👁️", text: `${watchCount} service${watchCount !== 1 ? "s are" : " is"} on the watch list — elevated risk detected but not yet member-impacting. Monitor closely to get ahead of potential escalation.` });

  const recommendations: RecommendationItem[] = [];
  if (activeIncidents > 0) recommendations.push({ impact: "high", text: `Activate incident response playbook. Assign an incident commander, open a war room channel, and send member communication if impact exceeds 5% of active sessions.` });
  if (loginSuccessRate !== null && loginSuccessRate < 99) recommendations.push({ impact: "high", text: `Check authentication service response times and downstream identity provider health. An auth service at degraded capacity is the most common cause of login success rate drops.` });
  if (abandonment !== null && abandonment > 3) recommendations.push({ impact: "medium", text: `Use Dynatrace Session Replay filtered to abandoned sessions to watch member journeys end-to-end. Identify the exact error or UI friction point causing early dropout.` });
  recommendations.push({ impact: "low", text: `Set automated Davis anomaly alerts on login success rate (<99%) and mobile crash rate (<99.5%) to enable proactive escalation before members self-report via call center.` });

  return { summary, insights, recommendations };
}

// Q3 — Business Risk
export function analyzeBusinessRisk(params: {
  errorRate: number;
  revenueAtRiskPerHr: number;
  slaAvailability: number;
  slaTarget: number;
  budgetRemaining: number;
  blendedErrorPer1k: number;
  moneyInMotionTotal: number;
  avgTxValue: number;
}): AIAssistData {
  const { errorRate, revenueAtRiskPerHr, slaAvailability, slaTarget, budgetRemaining, blendedErrorPer1k, moneyInMotionTotal, avgTxValue } = params;
  const slaGap = slaAvailability - slaTarget;
  const slaOk = slaGap >= 0;

  const summary = `SLA compliance MTD is ${slaAvailability.toFixed(3)}% (${slaOk ? `+${slaGap.toFixed(3)} pt above` : `${slaGap.toFixed(3)} pt below`} ${slaTarget}% target) with ${budgetRemaining.toFixed(0)}% error budget remaining. Current revenue exposure is ${revenueAtRiskPerHr > 0 ? `$${revenueAtRiskPerHr.toLocaleString(undefined, { maximumFractionDigits: 0 })}/hr` : "$0"} based on a ${errorRate.toFixed(2)}% error rate. Today's money in motion totals ${moneyInMotionTotal > 0 ? `$${(moneyInMotionTotal / 1_000_000).toFixed(1)}M` : "not available from bizevents"}.`;

  const insights: InsightItem[] = [];
  if (!slaOk) insights.push({ severity: "critical", icon: "🚨", text: `SLA compliance of ${slaAvailability.toFixed(3)}% is ${Math.abs(slaGap).toFixed(3)} percentage points below the ${slaTarget}% MTD target. This constitutes an active SLA breach that may trigger financial penalties or contractual obligations.` });
  else insights.push({ severity: slaGap < 0.1 ? "warning" : "good", icon: slaGap < 0.1 ? "⚠️" : "✅", text: `SLA compliance of ${slaAvailability.toFixed(3)}% is ${slaGap < 0.1 ? "narrowly" : ""} above the ${slaTarget}% target (${slaGap.toFixed(3)} pt headroom). ${slaGap < 0.1 ? "Buffer is thin — any further errors will burn through remaining headroom." : ""}` });

  if (budgetRemaining < 20) insights.push({ severity: "critical", icon: "🔥", text: `Error budget is ${budgetRemaining.toFixed(0)}% remaining — critically low. Further reliability incidents this month will push SLA compliance below target.` });
  else if (budgetRemaining < 50) insights.push({ severity: "warning", icon: "⏳", text: `Error budget is ${budgetRemaining.toFixed(0)}% consumed. Avoid risky deployments until the error budget resets at month-end.` });
  else insights.push({ severity: "good", icon: "💚", text: `Error budget is ${budgetRemaining.toFixed(0)}% remaining — sufficient headroom for normal operations and planned deployments.` });

  if (revenueAtRiskPerHr > 50000) insights.push({ severity: "critical", icon: "💸", text: `Revenue at risk is $${revenueAtRiskPerHr.toLocaleString(undefined, { maximumFractionDigits: 0 })}/hr based on the ${errorRate.toFixed(2)}% error rate and $${avgTxValue} average transaction value. Sustained degradation for 4 hours would project to $${(revenueAtRiskPerHr * 4).toLocaleString(undefined, { maximumFractionDigits: 0 })} in at-risk revenue.` });
  else if (revenueAtRiskPerHr > 10000) insights.push({ severity: "warning", icon: "💰", text: `Revenue exposure of $${revenueAtRiskPerHr.toLocaleString(undefined, { maximumFractionDigits: 0 })}/hr warrants attention. Reducing the service error rate to <0.1% would eliminate this exposure.` });
  else insights.push({ severity: "good", icon: "💚", text: `Revenue exposure is minimal at $${revenueAtRiskPerHr.toLocaleString(undefined, { maximumFractionDigits: 0 })}/hr — error rate is not meaningfully impacting transaction completion.` });

  if (blendedErrorPer1k > 3) insights.push({ severity: "warning", icon: "📊", text: `Blended error rate of ${blendedErrorPer1k.toFixed(1)}/1,000 transactions is above the 3.0 tolerance threshold. High-traffic services are disproportionately contributing to member-facing failures.` });

  const recommendations: RecommendationItem[] = [];
  if (!slaOk) recommendations.push({ impact: "high", text: `Convene an emergency SLA review with the CTO and service owners. Identify the services responsible for the availability gap and initiate a change freeze until the error rate falls below ${(100 - slaTarget).toFixed(1)}%.` });
  if (budgetRemaining < 20) recommendations.push({ impact: "high", text: `Freeze non-essential deployments immediately. With less than 20% error budget remaining, any new reliability incident will breach SLA. Resume deployments only after a full root-cause review of current month errors.` });
  if (revenueAtRiskPerHr > 0) recommendations.push({ impact: "medium", text: `Quantify financial impact in the incident ticket. A $${revenueAtRiskPerHr.toLocaleString(undefined, { maximumFractionDigits: 0 })}/hr exposure justifies escalation to senior engineering leadership and accelerated remediation.` });
  recommendations.push({ impact: "low", text: `Verify that BizEvents are instrumented on all financial transaction types (deposits, withdrawals, transfers) to enable accurate real-time money-in-motion tracking rather than estimation from request counts.` });

  return { summary, insights, recommendations };
}

// Q4 — Change Intel
export function analyzeChangeIntel(params: {
  cfr: number;
  avgMttrMin: number;
  totalClosedProblems: number;
  deploysToday: number;
  rollbacksToday: number;
  deploys30d: number;
  avgCpu: number;
  avgMem: number;
  securityEventCount: number;
  cloudBurnPct: number | null;
}): AIAssistData {
  const { cfr, avgMttrMin, totalClosedProblems, deploysToday, rollbacksToday, deploys30d, avgCpu, avgMem, securityEventCount, cloudBurnPct } = params;
  const cfrStatus = cfr <= 5 ? "healthy" : cfr <= 15 ? "elevated" : "critical";
  const mttrStatus = avgMttrMin <= 60 ? "within target" : "above target";

  const summary = `Change failure rate over the last 30 days is ${cfr.toFixed(1)}% (${cfrStatus}), with MTTR of ${avgMttrMin < 1 ? "<1 min" : avgMttrMin >= 60 ? `${(avgMttrMin / 60).toFixed(1)}h` : `${Math.round(avgMttrMin)} min`} (${mttrStatus}) across ${totalClosedProblems} resolved incidents. Today: ${deploysToday} deployment${deploysToday !== 1 ? "s" : ""}${rollbacksToday > 0 ? `, ${rollbacksToday} rollback${rollbacksToday !== 1 ? "s" : ""}` : ""}. Infrastructure saturation: CPU ${avgCpu.toFixed(0)}%, memory ${avgMem.toFixed(0)}%.`;

  const insights: InsightItem[] = [];
  if (cfr > 15) insights.push({ severity: "critical", icon: "🚨", text: `Change failure rate of ${cfr.toFixed(1)}% is critically above the 15% threshold. More than 1 in 6 deployments is introducing a reliability incident — deployment practices require immediate review.` });
  else if (cfr > 5) insights.push({ severity: "warning", icon: "⚠️", text: `Change failure rate of ${cfr.toFixed(1)}% is in the elevated range (5–15%). Consider implementing additional pre-deployment health checks or expanding canary deployment coverage.` });
  else if (deploys30d > 0) insights.push({ severity: "good", icon: "✅", text: `Change failure rate of ${cfr.toFixed(1)}% is within the ≤5% elite engineering target — deployment practices are effective.` });

  if (rollbacksToday > 0) insights.push({ severity: "warning", icon: "⏪", text: `${rollbacksToday} rollback${rollbacksToday !== 1 ? "s were" : " was"} executed today. Every rollback represents a deployment that introduced instability — review the root cause and strengthen pre-merge testing for the affected services.` });

  if (avgMttrMin > 120) insights.push({ severity: "critical", icon: "⏱️", text: `MTTR of ${Math.round(avgMttrMin)} minutes exceeds the 2-hour threshold. Long recovery times compound member impact — investigate whether runbooks, auto-remediation, or alerting are causing the delay.` });
  else if (avgMttrMin > 60) insights.push({ severity: "warning", icon: "⏱️", text: `MTTR of ${Math.round(avgMttrMin)} minutes is above the 60-minute target. Review on-call response procedures and whether Davis AI is surfacing root-cause fast enough.` });
  else if (totalClosedProblems > 0) insights.push({ severity: "good", icon: "⏱️", text: `MTTR of ${Math.round(avgMttrMin)} minutes is within the 60-minute target — incident response is effective.` });

  if (avgCpu > 80) insights.push({ severity: "critical", icon: "💻", text: `Average CPU utilization of ${avgCpu.toFixed(0)}% is above 80% — the infrastructure is at saturation risk. New deployments under current load may trigger cascading failures.` });
  else if (avgCpu > 70) insights.push({ severity: "warning", icon: "💻", text: `Average CPU of ${avgCpu.toFixed(0)}% is approaching saturation. Validate that auto-scaling thresholds are set below this level to prevent compute-induced degradation.` });

  if (securityEventCount > 0) insights.push({ severity: "critical", icon: "🔒", text: `${securityEventCount} critical or high runtime security event${securityEventCount !== 1 ? "s were" : " was"} detected. Review immediately — runtime vulnerabilities represent direct risk to member data and regulatory compliance.` });
  else insights.push({ severity: "good", icon: "🔒", text: "No critical runtime security events detected in the selected timeframe." });

  if (cloudBurnPct !== null && cloudBurnPct > 90) insights.push({ severity: "warning", icon: "💰", text: `Cloud spend is ${cloudBurnPct.toFixed(0)}% of monthly budget with time remaining in the month — risk of overrun. Review over-provisioned resources and idle services.` });

  const recommendations: RecommendationItem[] = [];
  if (cfr > 5) recommendations.push({ impact: "high", text: `Implement mandatory staging environment validation and automated smoke tests as a deployment gate. DORA elite performers target CFR below 5% — the gap represents deployable risk.` });
  if (rollbacksToday > 0) recommendations.push({ impact: "high", text: `For each rollback today, conduct a 15-minute post-mortem to identify what pre-production test would have caught the failure. Build that test into the CI pipeline before the next release.` });
  if (avgMttrMin > 60) recommendations.push({ impact: "medium", text: `Configure Davis AI workflows to auto-notify on-call engineers within 5 minutes of problem creation and auto-attach runbooks to problem tickets. Reducing acknowledgement lag is the fastest MTTR lever.` });
  if (avgCpu > 70) recommendations.push({ impact: "medium", text: `Review auto-scaling policies for host groups above 70% CPU. Set scale-out triggers at 65% to build in headroom before saturation causes latency degradation.` });
  recommendations.push({ impact: "low", text: `Tag all deployment events with service owner and release version to enable automatic correlation between deployments and the problems they cause — this dramatically accelerates root-cause identification.` });

  return { summary, insights, recommendations };
}

// Q5 — Capacity & Growth
export function analyzeCapacity(params: {
  wowGrowth: number | null;
  avgCpu: number;
  avgMem: number;
  runwayMonths: number | null;
  deploys30d: number;
  peakHrLoad: number;
  hostCount: number;
  curTotal: number;
  prevTotal: number;
}): AIAssistData {
  const { wowGrowth, avgCpu, avgMem, runwayMonths, deploys30d, peakHrLoad, hostCount, curTotal, prevTotal } = params;
  const runwayDesc = runwayMonths === null ? "stable (no upward CPU growth trend detected)" : runwayMonths > 24 ? ">24 months" : `${runwayMonths.toFixed(1)} months`;

  const summary = `Infrastructure spans ${hostCount} monitored host${hostCount !== 1 ? "s" : ""} with current utilization at ${avgCpu.toFixed(0)}% CPU and ${avgMem.toFixed(0)}% memory. Capacity runway at current growth rate: ${runwayDesc}. Week-over-week traffic growth is ${wowGrowth !== null ? `${wowGrowth >= 0 ? "+" : ""}${wowGrowth.toFixed(1)}%` : "unavailable"} with ${peakHrLoad.toLocaleString()} peak events/hour this week. Deployment velocity: ${deploys30d} deploys over the last 30 days.`;

  const insights: InsightItem[] = [];
  if (runwayMonths !== null && runwayMonths < 3) insights.push({ severity: "critical", icon: "🚨", text: `CPU capacity runway is only ${runwayMonths.toFixed(1)} months at the current growth rate. Infrastructure provisioning lead time typically exceeds this window — escalate to cloud/infrastructure team immediately.` });
  else if (runwayMonths !== null && runwayMonths < 6) insights.push({ severity: "warning", icon: "⚠️", text: `CPU capacity runway of ${runwayMonths.toFixed(1)} months is below the 6-month planning buffer. Begin provisioning conversations with the infrastructure team to avoid a capacity crunch.` });
  else insights.push({ severity: "good", icon: "✅", text: `Capacity runway is ${runwayDesc} — sufficient headroom for planned growth.` });

  if (avgCpu > 80) insights.push({ severity: "critical", icon: "💻", text: `Current CPU utilization of ${avgCpu.toFixed(0)}% is above the 80% saturation threshold. The system is at risk of compute-induced latency spikes under any load increase.` });
  else if (avgCpu > 60) insights.push({ severity: "warning", icon: "💻", text: `CPU utilization of ${avgCpu.toFixed(0)}% is in the warning zone (60–80%). Validate that auto-scaling is configured to add capacity before this level is sustained.` });
  else insights.push({ severity: "good", icon: "💚", text: `CPU utilization of ${avgCpu.toFixed(0)}% is healthy — infrastructure has adequate headroom.` });

  if (avgMem > 85) insights.push({ severity: "critical", icon: "🧠", text: `Memory utilization of ${avgMem.toFixed(0)}% is above 85%. Memory pressure increases GC frequency, causes latency spikes, and risks OOM-related crashes.` });
  else if (avgMem > 70) insights.push({ severity: "warning", icon: "🧠", text: `Memory utilization of ${avgMem.toFixed(0)}% is elevated. Review whether heap tuning or right-sizing opportunities exist before saturation forces reactive scaling.` });

  if (wowGrowth !== null && wowGrowth > 25) insights.push({ severity: "warning", icon: "📈", text: `Week-over-week traffic growth of +${wowGrowth.toFixed(1)}% is high. Sustained growth at this rate will compress the capacity runway significantly — validate auto-scaling can absorb next week's peak.` });
  else if (wowGrowth !== null && wowGrowth > 0) insights.push({ severity: "info", icon: "📈", text: `Traffic grew +${wowGrowth.toFixed(1)}% week-over-week (${prevTotal.toLocaleString()} → ${curTotal.toLocaleString()} requests). Healthy growth is being handled without saturation.` });

  if (deploys30d === 0) insights.push({ severity: "warning", icon: "🚢", text: "No deployments detected in the last 30 days. Deployment velocity is a leading indicator of team productivity — verify that CI/CD integration is properly configured." });
  else if (deploys30d < 3) insights.push({ severity: "info", icon: "🚢", text: `Low deployment velocity (${deploys30d} deploy${deploys30d !== 1 ? "s" : ""} / 30d). Consider whether release cycle frequency aligns with the team's reliability and feature delivery goals.` });
  else insights.push({ severity: "good", icon: "🚢", text: `Active deployment pipeline with ${deploys30d} releases over 30 days (~${(30 / deploys30d).toFixed(1)}-day cadence) — enabling continuous delivery of improvements.` });

  const recommendations: RecommendationItem[] = [];
  if (runwayMonths !== null && runwayMonths < 6) recommendations.push({ impact: "high", text: `Initiate a capacity planning review immediately. Present the ${runwayDesc} runway projection to infrastructure leadership with a provisioning plan for at least 6 months of headroom. Consider reserved instance commitments to reduce cloud cost for predictable baseline load.` });
  if (avgCpu > 60 || avgMem > 70) recommendations.push({ impact: "medium", text: `Review auto-scaling policies to ensure they trigger at 60% CPU and 70% memory utilization — not the current saturation levels. Proactive scaling prevents availability incidents from capacity exhaustion.` });
  if (wowGrowth !== null && wowGrowth > 15) recommendations.push({ impact: "medium", text: `Run a load test at 150% of the current peak (${Math.round(peakHrLoad * 1.5).toLocaleString()} events/hr) to validate the system degrades gracefully rather than failing catastrophically under surge traffic.` });
  recommendations.push({ impact: "low", text: `Instrument capacity runway projections as a recurring CIO metric — updated monthly — to replace reactive provisioning with proactive planning. Target a minimum 6-month runway at all times.` });

  return { summary, insights, recommendations };
}

// Q6 — Security & Compliance
export function analyzeSecurity(params: {
  complianceScore: number;
  criticalVulns: number;
  highVulns: number;
  mediumVulns: number;
  authIsAnomaly: boolean;
  authFailNow: number;
  authFailBaseline: number;
  authAnomalyMultiple: number | null;
  passingCount: number;
  deploys30d: number;
  openProblems: number;
  criticalProblems: number;
  slaOk: boolean;
  slaAvailability: number;
  slaTarget: number;
}): AIAssistData {
  const { complianceScore, criticalVulns, highVulns, mediumVulns, authIsAnomaly, authFailNow, authFailBaseline, authAnomalyMultiple, passingCount, deploys30d, openProblems, criticalProblems, slaOk, slaAvailability, slaTarget } = params;
  const complianceLabel = complianceScore >= 90 ? "strong" : complianceScore >= 70 ? "moderate" : "weak";
  const totalVulns = criticalVulns + highVulns + mediumVulns;

  const summary = `Composite compliance score is ${complianceScore}/100 (${complianceLabel}) with ${passingCount}/5 NCUA examination pillars passing. ${totalVulns > 0 ? `${criticalVulns} critical, ${highVulns} high, and ${mediumVulns} medium runtime security findings detected in the last 24 hours.` : "No active runtime security findings."} Authentication failure rate is ${authFailNow.toFixed(1)}% (${authIsAnomaly ? "ANOMALY — above baseline" : `within ${authFailBaseline.toFixed(1)}% baseline`}).`;

  const insights: InsightItem[] = [];
  if (complianceScore < 70) insights.push({ severity: "critical", icon: "🚨", text: `Compliance score of ${complianceScore}/100 is below the 70-point acceptable threshold. ${5 - passingCount} of 5 NCUA examination areas require remediation before the next regulatory review.` });
  else if (complianceScore < 90) insights.push({ severity: "warning", icon: "⚠️", text: `Compliance score of ${complianceScore}/100 indicates moderate posture. Address the ${5 - passingCount} failing NCUA check${5 - passingCount !== 1 ? "s" : ""} to achieve a strong compliance rating before the next exam.` });
  else insights.push({ severity: "good", icon: "✅", text: `Compliance score of ${complianceScore}/100 — strong posture. All ${passingCount} NCUA examination pillars are passing.` });

  if (criticalVulns > 0) insights.push({ severity: "critical", icon: "🔒", text: `${criticalVulns} critical runtime security vulnerability detected in the last 24 hours. Critical findings represent active exploitability risk and must be remediated or mitigated within 24 hours per NCUA guidance.` });
  else if (highVulns > 0) insights.push({ severity: "warning", icon: "🔒", text: `${highVulns} high-severity vulnerability findings require attention. While not critical, high findings in a regulated financial environment should be triaged within 72 hours.` });
  else if (totalVulns === 0) insights.push({ severity: "good", icon: "🔒", text: "No active security findings. Runtime Application Security is reporting a clean posture for the last 24 hours." });

  if (authIsAnomaly) insights.push({ severity: "critical", icon: "🚫", text: `Authentication failure rate of ${authFailNow.toFixed(1)}% is ${authAnomalyMultiple?.toFixed(1)}× above the 7-day baseline of ${authFailBaseline.toFixed(1)}%. This pattern is consistent with credential stuffing, brute-force attacks, or a broken authentication service. Investigate with the security team immediately.` });
  else if (authFailNow > 5) insights.push({ severity: "warning", icon: "🔐", text: `Authentication failure rate of ${authFailNow.toFixed(1)}% is elevated even if within statistical norms. Monitor for upward trend over the next hour.` });
  else insights.push({ severity: "good", icon: "🔐", text: `Authentication failure rate of ${authFailNow.toFixed(1)}% is within the normal range (baseline: ${authFailBaseline.toFixed(1)}%) — no credential attack signals detected.` });

  if (criticalProblems > 0) insights.push({ severity: "critical", icon: "📋", text: `${criticalProblems} critical open incident${criticalProblems !== 1 ? "s" : ""} would fail the NCUA "no open critical incidents" examination check. These must be resolved before any regulatory review.` });

  if (!slaOk) insights.push({ severity: "warning", icon: "📊", text: `SLA compliance of ${slaAvailability.toFixed(3)}% is below the ${slaTarget}% MTD target — the SLA pillar is currently failing the NCUA readiness check.` });

  if (deploys30d === 0) insights.push({ severity: "warning", icon: "🚢", text: "No deployment events detected in the last 30 days. NCUA examination requires evidence of an active change control process — zero deployments may appear as a gap in the audit trail." });

  const recommendations: RecommendationItem[] = [];
  if (criticalVulns > 0) recommendations.push({ impact: "high", text: `Immediately review and remediate the ${criticalVulns} critical runtime vulnerability finding${criticalVulns !== 1 ? "s" : ""}. For each, document the CVE, affected component, remediation plan, and timeline. This documentation is required for NCUA examiner evidence packages.` });
  if (authIsAnomaly) recommendations.push({ impact: "high", text: `Escalate the authentication anomaly to the Security Operations Center. Investigate source IPs, account patterns, and geographic distribution using Dynatrace RUM session data. Consider temporarily increasing CAPTCHA requirements or enabling step-up authentication for affected accounts.` });
  if (complianceScore < 90) recommendations.push({ impact: "medium", text: `Create a compliance remediation task in your issue tracker for each failing NCUA pillar. Assign ownership, set a 30-day resolution target, and schedule a pre-exam compliance review at least 60 days before the next scheduled NCUA examination.` });
  recommendations.push({ impact: "low", text: `Export the current compliance report and distribute to the CTO, CISO, and Chief Risk Officer weekly. Real-time compliance visibility prevents exam surprises and demonstrates a proactive regulatory posture.` });

  return { summary, insights, recommendations };
}
