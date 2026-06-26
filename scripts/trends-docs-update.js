// Update Help, analyzeTrends AI summary, and What's New for Trends tab v2
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../ui/app/pages/UserJourney.tsx');
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

// ─── 1. Help text: Trends tab paragraph ──────────────────────────────────────
content = content.replace(
  `        <Paragraph><Strong>Trends</Strong>: Period-over-period comparison of all key metrics. Shows current vs. previous period with delta arrows — green for improvement, red for regression. Inverted logic for duration/errors (lower = better). When AOV is set, adds a Revenue trend card showing current vs. previous period estimated revenue.</Paragraph>`,
  `        <Paragraph><Strong>Trends</Strong>: Period-over-period comparison of all key metrics across 11 cards (Sessions, Total Actions, Conversion Rate, Apdex, Avg/P50/P90 Duration, Error Rate, Errors, Frustrated, and optionally Revenue when AOV is set). Each card shows: current value with color-coded delta arrow, a <Strong>daily sparkline</Strong> tracing the metric's shape across the current period, and an inline <Strong>anomaly badge</Strong> — <Strong>⚠ Anomaly</Strong> (current value exceeds 2σ of daily variance — statistically unusual), <Strong>↑ Notable</Strong> (1.2–2σ — worth watching), or <Strong>∿ Normal</Strong> (&lt;1.2σ — within expected noise). Inverted logic applies for duration/errors (lower = better). Use anomaly badges to distinguish real regressions from day-to-day noise. The AI Insights panel at the top narrates the most critical changes and recommends next steps.</Paragraph>`
);

// ─── 2. analyzeTrends: enrich summary + add anomaly-awareness insight ─────────

// 2a. Replace the summary string
content = content.replace(
  `  const summary = \`Trends provides period-over-period comparison of every key performance and business metric, enabling you to detect regressions, validate improvements, and understand momentum. It is designed for Engineering Managers tracking release impact, Product Owners monitoring business health, and SREs validating incident resolution. It answers: Are we improving or regressing? How do sessions, conversion, Apdex, errors, and duration compare to the previous equivalent period? Currently, sessions are \${sessionDelta >= 0 ? "up" : "down"} \${Math.abs(sessionDelta).toFixed(1)}%, conversion is \${convDelta >= 0 ? "up" : "down"} \${Math.abs(convDelta).toFixed(1)}%, and Apdex is \${apdexDelta >= 0 ? "up" : "down"} \${Math.abs(apdexDelta).toFixed(1)}%. \${convDelta < -5 || apdexDelta < -10 ? "A regression has been detected — correlate with recent deployments or infrastructure changes." : "Metrics are trending stable or positive."} Each metric displays current vs. previous values with color-coded delta arrows (green for improvement, red for regression, inverted for metrics where lower is better like duration and errors). When AOV is configured, a Revenue trend card shows estimated revenue change. Use this tab after every deployment or campaign launch to verify impact.\`;`,
  `  const summary = \`Trends provides period-over-period comparison of every key performance and business metric, enabling you to detect regressions, validate improvements, and understand momentum. It is designed for Engineering Managers tracking release impact, Product Owners monitoring business health, and SREs validating incident resolution. It answers: Are we improving or regressing? How do sessions, conversion, Apdex, errors, and duration compare to the previous equivalent period? Currently, sessions are \${sessionDelta >= 0 ? "up" : "down"} \${Math.abs(sessionDelta).toFixed(1)}%, conversion is \${convDelta >= 0 ? "up" : "down"} \${Math.abs(convDelta).toFixed(1)}%, and Apdex is \${apdexDelta >= 0 ? "up" : "down"} \${Math.abs(apdexDelta).toFixed(1)}%. \${convDelta < -5 || apdexDelta < -10 ? "A regression has been detected — correlate with recent deployments or infrastructure changes." : "Metrics are trending stable or positive."} Each metric card includes a daily sparkline tracing the metric's shape across the current period, and an inline anomaly badge powered by z-score analysis: ⚠ Anomaly (>2σ from daily mean — statistically significant change), ↑ Notable (1.2–2σ), or ∿ Normal (<1.2σ — within expected noise). Use the anomaly badges to quickly distinguish real regressions from day-to-day variance before digging into root cause. When AOV is configured, a Revenue trend card shows estimated revenue change. Use this tab after every deployment or campaign launch to verify impact.\`;`
);

// 2b. Add anomaly-related insight after the errRate insight block
content = content.replace(
  `  if (errRate > errRatePrev * 1.3 && errRate > 1) { insights.push({ severity: "critical", icon: "🔴", text: \`Error rate increased from \${fmtPct(errRatePrev)} to \${fmtPct(errRate)}.\` }); recs.push({ impact: "high", text: "Check Error Clustering tab for new error patterns introduced in the current period." }); }`,
  `  if (errRate > errRatePrev * 1.3 && errRate > 1) { insights.push({ severity: "critical", icon: "🔴", text: \`Error rate increased from \${fmtPct(errRatePrev)} to \${fmtPct(errRate)}.\` }); recs.push({ impact: "high", text: "Check Error Clustering tab for new error patterns introduced in the current period." }); }

  // Anomaly signal guidance
  const anyAnomalyLikely = Math.abs(sessionDelta) > 20 || Math.abs(convDelta) > 15 || Math.abs(apdexDelta) > 15 || errRate > errRatePrev * 1.5;
  if (anyAnomalyLikely) {
    insights.push({ severity: "warning", icon: "📊", text: "One or more metrics show large period-over-period swings — check the ⚠ Anomaly badges on the cards to identify which changes exceed 2σ of daily variance and are statistically significant vs. noise." });
    recs.push({ impact: "medium", text: "Focus investigation on cards marked ⚠ Anomaly first. Cards showing ∿ Normal despite a visible delta are likely within expected day-to-day variance and may not warrant immediate action." });
  } else {
    insights.push({ severity: "good", icon: "📊", text: "Metric changes are moderate. Use the sparkline shapes on each card to verify trend direction, and check ↑ Notable badges for metrics approaching significance thresholds." });
  }`
);

// ─── 3. What's New: add Trends v2 bullets to May 14, 2026 entry ──────────────
content = content.replace(
  `            <Paragraph style={{ fontSize: 13 }}>• Confidence % reflects how many of today's hours have data vs. hours elapsed — lower early in the day, higher by evening.</Paragraph>
          </div>
          <div style={{ marginBottom: 12, padding: "10px 14px", background: "rgba(128,128,128,0.04)", borderRadius: 8, borderLeft: "3px solid rgba(128,128,128,0.3)" }}>
            <Paragraph style={{ fontSize: 12, opacity: 0.5, marginBottom: 4 }}>May 13, 2026</Paragraph>`,
  `            <Paragraph style={{ fontSize: 13 }}>• Confidence % reflects how many of today's hours have data vs. hours elapsed — lower early in the day, higher by evening.</Paragraph>
            <Paragraph style={{ fontSize: 13 }}>• <Strong>Trends Tab — Sparklines &amp; Anomaly Signals</Strong>: Each metric card in the Trends tab now shows a <Strong>daily sparkline</Strong> (mini time-series for the current period) and an inline <Strong>anomaly badge</Strong>. ⚠ Anomaly = current value exceeds 2σ of daily variance (statistically significant); ↑ Notable = 1.2–2σ; ∿ Normal = within expected noise. The AI Insights panel now highlights which metrics are anomalous and advises focusing investigation on anomaly-flagged cards first.</Paragraph>
          </div>
          <div style={{ marginBottom: 12, padding: "10px 14px", background: "rgba(128,128,128,0.04)", borderRadius: 8, borderLeft: "3px solid rgba(128,128,128,0.3)" }}>
            <Paragraph style={{ fontSize: 12, opacity: 0.5, marginBottom: 4 }}>May 13, 2026</Paragraph>`
);

// Verify
const checks = [
  ['Help Trends updated',        content.includes('daily sparkline')   && content.includes('⚠ Anomaly')],
  ['analyzeTrends summary updated', content.includes('z-score analysis')],
  ['anomaly insight added',      content.includes('statistically significant vs. noise')],
  ["What's New Trends entry",    content.includes('Trends Tab — Sparklines')],
];

let allOk = true;
for (const [name, ok] of checks) {
  console.log((ok ? 'OK' : 'FAIL') + ': ' + name);
  if (!ok) allOk = false;
}
if (!allOk) { process.exit(1); }

fs.writeFileSync(filePath, content, 'utf8');
console.log('\nDone!');
