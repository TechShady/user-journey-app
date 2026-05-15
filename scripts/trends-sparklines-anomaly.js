// Trends tab: per-metric sparklines + inline z-score anomaly signals
const fs = require('fs');
const path = require('path');

const tsFile = path.join(__dirname, '../ui/app/pages/UserJourney.tsx');
const cssFile = path.join(__dirname, '../ui/app/pages/UserJourney.css');

let content = fs.readFileSync(tsFile, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

// ─── 1. Add trendsSparklineQuery before sessionQualityQuery ─────────────────
content = content.replace(
  'function sessionQualityQuery(days: number, frontend: string, steps: StepDef[], prev = false, nonce = 0): string {',
  `function trendsSparklineQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days, false);
  return \`fetch user.events, \${period}
| filter frontend.name == "\${frontend}"
| filter \${anyStepFilter(steps)}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd day = bin(start_time, 1d)
| summarize
    total = count(),
    sessions = countDistinct(dt.rum.session.id),
    avg_dur = avg(dur_ms),
    p50_dur = percentile(dur_ms, 50),
    p90_dur = percentile(dur_ms, 90),
    errors = countIf(characteristics.has_error == true),
    satisfied = countIf(dur_ms <= \${APDEX_T}.0),
    tolerating = countIf(dur_ms > \${APDEX_T}.0 and dur_ms <= \${APDEX_4T}.0),
    frustrated = countIf(dur_ms > \${APDEX_4T}.0)
  by: { day }
| sort day asc\`;
}

function sessionQualityQuery(days: number, frontend: string, steps: StepDef[], prev = false, nonce = 0): string {`
);

// ─── 2. Add sparklineData useDql call after qualityDataPrev ─────────────────
content = content.replace(
  `  const qualityDataPrev = useDql({ query: sessionQualityQuery(timeframeDays, frontend, steps, true) });`,
  `  const qualityDataPrev = useDql({ query: sessionQualityQuery(timeframeDays, frontend, steps, true) });
  const sparklineData = useDql({ query: trendsSparklineQuery(timeframeDays, frontend, steps) });`
);

// ─── 3. Add sparklineRecords prop to TrendsTab call ─────────────────────────
content = content.replace(
  `content = <TrendsTab quality={quality} qualityPrev={qualityPrev} overallApdex={overallApdex} overallApdexPrev={overallApdexPrev} overallConv={overallConv} overallConvPrev={overallConvPrev} funnelCounts={funnelCounts} funnelCountsPrev={funnelCountsPrev} isLoading={qualityData.isLoading || qualityDataPrev.isLoading || funnelResult.isLoading || funnelResultPrev.isLoading} steps={steps} aov={aov} />; break;`,
  `content = <TrendsTab quality={quality} qualityPrev={qualityPrev} overallApdex={overallApdex} overallApdexPrev={overallApdexPrev} overallConv={overallConv} overallConvPrev={overallConvPrev} funnelCounts={funnelCounts} funnelCountsPrev={funnelCountsPrev} isLoading={qualityData.isLoading || qualityDataPrev.isLoading || funnelResult.isLoading || funnelResultPrev.isLoading} steps={steps} aov={aov} sparklineRecords={sparklineData.data?.records ?? []} />; break;`
);

// ─── 4. Rewrite TrendsTab function ─────────────────────────────────────────
const OLD_TRENDS = `function TrendsTab({ quality, qualityPrev, overallApdex, overallApdexPrev, overallConv, overallConvPrev, funnelCounts, funnelCountsPrev, isLoading, steps, aov }: { quality: any; qualityPrev: any; overallApdex: number; overallApdexPrev: number; overallConv: number; overallConvPrev: number; funnelCounts: number[]; funnelCountsPrev: number[]; isLoading: boolean; steps: StepDef[]; aov: number }) {
  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeTrends(quality, qualityPrev, overallApdex, overallApdexPrev, overallConv, overallConvPrev, funnelCounts, funnelCountsPrev, aov), [quality, qualityPrev, overallApdex, overallApdexPrev, overallConv, overallConvPrev, funnelCounts, funnelCountsPrev, aov]));

  if (isLoading) return <Loading />;

  const errorRate = quality.total > 0 ? (quality.errors / quality.total) * 100 : 0;
  const errorRatePrev = qualityPrev.total > 0 ? (qualityPrev.errors / qualityPrev.total) * 100 : 0;

  const lastIdx = steps.length - 1;
  const currRevenue = aov > 0 ? (funnelCounts[lastIdx] ?? 0) * aov : 0;
  const prevRevenue = aov > 0 ? (funnelCountsPrev[lastIdx] ?? 0) * aov : 0;

  const trends = [
    { label: "Sessions", current: quality.sessions, prev: qualityPrev.sessions, inverted: false, format: fmtCount },
    { label: "Total Actions", current: quality.total, prev: qualityPrev.total, inverted: false, format: fmtCount },
    { label: "Conversion Rate", current: overallConv, prev: overallConvPrev, inverted: false, format: fmtPct },
    ...(aov > 0 ? [{ label: "Revenue", current: currRevenue, prev: prevRevenue, inverted: false, format: fmtCurrency }] : []),
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
      {aiPanel}
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
              <Text style={{ fontSize: 12, opacity: 0.5, textTransform: "uppercase", letterSpacing: 0.5 }}>{t.label}</Text>
              <Heading level={3} style={{ margin: "6px 0 2px", color }}>{t.format(t.current)}</Heading>
              <Flex gap={8} alignItems="center">
                <Text style={{ fontSize: 13, opacity: 0.4 }}>was {t.format(t.prev)}</Text>
                <Delta current={t.current} previous={t.prev} inverted={t.inverted} />
              </Flex>
              {/* Mini bar showing direction */}
              <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: \`\${Math.min(Math.abs(pct), 100)}%\`, background: color, borderRadius: 2, transition: "width 0.4s ease" }} />
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
}`;

const NEW_TRENDS = `function TrendsTab({ quality, qualityPrev, overallApdex, overallApdexPrev, overallConv, overallConvPrev, funnelCounts, funnelCountsPrev, isLoading, steps, aov, sparklineRecords }: { quality: any; qualityPrev: any; overallApdex: number; overallApdexPrev: number; overallConv: number; overallConvPrev: number; funnelCounts: number[]; funnelCountsPrev: number[]; isLoading: boolean; steps: StepDef[]; aov: number; sparklineRecords: any[] }) {
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

  // Z-score anomaly: is the current period value unusual vs the daily series?
  function anomalySignal(series: number[], current: number, inverted: boolean): "anomaly" | "notable" | "normal" | null {
    if (series.length < 3) return null;
    const mean = series.reduce((a: number, b: number) => a + b, 0) / series.length;
    const variance = series.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / series.length;
    const std = Math.sqrt(variance);
    if (std < 0.001 * (Math.abs(mean) || 1)) return "normal";
    const z = Math.abs(current - mean) / std;
    if (z >= 2) return "anomaly";
    if (z >= 1.2) return "notable";
    return "normal";
  }

  const trends = [
    { label: "Sessions",      current: quality.sessions,   prev: qualityPrev.sessions,   inverted: false, format: fmtCount,                         sparkKey: "sessions"   as string | null },
    { label: "Total Actions", current: quality.total,      prev: qualityPrev.total,      inverted: false, format: fmtCount,                         sparkKey: "total"      as string | null },
    { label: "Conversion Rate", current: overallConv,      prev: overallConvPrev,         inverted: false, format: fmtPct,                           sparkKey: null },
    ...(aov > 0 ? [{ label: "Revenue",  current: currRevenue,        prev: prevRevenue,           inverted: false, format: fmtCurrency,                      sparkKey: null as string | null }] : []),
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
      <Text style={{ fontSize: 12, opacity: 0.5 }}>Comparing current period with the equivalent previous period. Sparklines show daily shape across the period. Anomaly badges flag changes that exceed 2σ of daily variance.</Text>

      <Flex gap={16} flexWrap="wrap">
        {trends.map((t) => {
          const delta = t.current - t.prev;
          const pct = t.prev > 0 ? (delta / t.prev) * 100 : (t.current > 0 ? 100 : 0);
          const improving = t.inverted ? delta <= 0 : delta >= 0;
          const color = Math.abs(pct) < 1 ? "rgba(255,255,255,0.5)" : improving ? GREEN : RED;
          const series: number[] = t.sparkKey ? (sparkSeries[t.sparkKey] ?? []) : [];
          const anomaly = t.sparkKey ? anomalySignal(series, t.current, t.inverted) : null;
          const hasSpark = series.length >= 2;
          const sMin = hasSpark ? Math.min(...series) : 0;
          const sMax = hasSpark ? Math.max(...series) : 1;
          const sRange = sMax - sMin || 1;
          const SW = 200, SH = 30;
          const sparkPts = hasSpark ? series.map((v, i) => \`\${(i / (series.length - 1)) * SW},\${SH - ((v - sMin) / sRange) * (SH - 4) + 2}\`).join(" ") : "";
          const dotX = hasSpark ? ((series.length - 1) / (series.length - 1)) * SW : 0;
          const dotY = hasSpark ? SH - ((series[series.length - 1] - sMin) / sRange) * (SH - 4) + 2 : 0;

          return (
            <div key={t.label} className="uj-trend-card">
              {/* Label + anomaly badge */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 11, opacity: 0.5, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>{t.label}</span>
                {anomaly === "anomaly" && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(194,25,48,0.15)", color: RED, border: "1px solid rgba(194,25,48,0.25)", whiteSpace: "nowrap" as const }}>⚠ Anomaly</span>}
                {anomaly === "notable" && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(255,167,0,0.10)", color: YELLOW, border: "1px solid rgba(255,167,0,0.25)", whiteSpace: "nowrap" as const }}>↑ Notable</span>}
                {anomaly === "normal"  && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(128,128,128,0.08)", color: "rgba(128,128,128,0.45)", border: "1px solid rgba(128,128,128,0.15)", whiteSpace: "nowrap" as const }}>∿ Normal</span>}
              </div>
              {/* Current value */}
              <Heading level={3} style={{ margin: "2px 0 6px", color }}>{t.format(t.current)}</Heading>
              {/* Sparkline */}
              {hasSpark && (
                <svg width="100%" viewBox={\`0 0 \${SW} \${SH}\`} style={{ display: "block", marginBottom: 6, overflow: "visible" }}>
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
}`;

if (!content.includes(OLD_TRENDS)) {
  console.error('FAIL: TrendsTab old text not found — check for drift');
  process.exit(1);
}
content = content.replace(OLD_TRENDS, NEW_TRENDS);

// ─── 5. Widen trend cards in CSS ─────────────────────────────────────────────
let css = fs.readFileSync(cssFile, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
css = css.replace(
  `.uj-trend-card {
  flex: 1 1 180px;
  min-width: 160px;
  max-width: 240px;`,
  `.uj-trend-card {
  flex: 1 1 200px;
  min-width: 190px;
  max-width: 300px;`
);

// Verify
const checks = [
  ['trendsSparklineQuery added',     content.includes('function trendsSparklineQuery(')],
  ['sparklineData useDql',           content.includes('sparklineData = useDql(')],
  ['sparklineRecords prop on call',  content.includes('sparklineRecords={sparklineData')],
  ['TrendsTab new signature',        content.includes('sparklineRecords: any[]')],
  ['sparkSeries object',             content.includes('sparkSeries:')],
  ['anomalySignal function',         content.includes('function anomalySignal(')],
  ['anomaly badge JSX',              content.includes('"⚠ Anomaly"') || content.includes('⚠ Anomaly')],
  ['sparkline polyline',             content.includes('<polyline points={sparkPts}')],
  ['CSS widened',                    css.includes('max-width: 300px')],
];
let allOk = true;
for (const [name, ok] of checks) {
  console.log((ok ? 'OK' : 'FAIL') + ': ' + name);
  if (!ok) allOk = false;
}
if (!allOk) { process.exit(1); }

fs.writeFileSync(tsFile, content, 'utf8');
fs.writeFileSync(cssFile, css, 'utf8');
console.log('\nDone!');
