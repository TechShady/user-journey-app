// Add per-day funnel conversion sparkline query so Conversion Rate + Revenue cards get sparklines
const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, '../ui/app/pages/UserJourney.tsx');
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

// ─── 1. Add trendsConvSparklineQuery after trendsSparklineQuery ──────────────
content = content.replace(
  'function sessionQualityQuery(days: number, frontend: string, steps: StepDef[], prev = false, nonce = 0): string {',
  `function trendsConvSparklineQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days, false);
  const binSize = days < 1 ? '1h' : days <= 3 ? '6h' : '1d';
  const tagExpr = stepTagExpr(steps, steps.map((_, i) => \`step\${i + 1}\`));
  const iAnyLines = steps.map((_, i) => \`    reached_step\${i + 1} = iAny(steps[] == "step\${i + 1}")\`).join(',\\n');
  const convertedConds = steps.map((_, i) => \`reached_step\${i + 1} == true\`).join(' and ');
  return \`fetch user.events, \${period}
| filter frontend.name == "\${frontend}"
| filter \${anyStepFilter(steps)}
| fieldsAdd step_tag = \${tagExpr}
| fieldsAdd slot_day = bin(start_time, \${binSize})
| summarize
    steps = collectDistinct(step_tag),
    by: {dt.rum.session.id, slot_day}
| fieldsAdd
\${iAnyLines}
| fieldsAdd converted = if(\${convertedConds}, true, else: false)
| summarize
    total_sessions = count(),
    converted_sessions = countIf(converted == true),
    by: {slot_day}
| fieldsAdd conv_rate = if(total_sessions > 0, toDouble(converted_sessions) / toDouble(total_sessions) * 100.0, else: 0.0)
| sort slot_day asc\`;
}

function sessionQualityQuery(days: number, frontend: string, steps: StepDef[], prev = false, nonce = 0): string {`
);

// ─── 2. Add convSparklineData useDql after sparklineData ────────────────────
content = content.replace(
  `  const sparklineData = useDql({ query: trendsSparklineQuery(timeframeDays, frontend, steps) });`,
  `  const sparklineData = useDql({ query: trendsSparklineQuery(timeframeDays, frontend, steps) });
  const convSparklineData = useDql({ query: trendsConvSparklineQuery(timeframeDays, frontend, steps) });`
);

// ─── 3. Pass convSparklineRecords prop to TrendsTab ─────────────────────────
content = content.replace(
  `sparklineRecords={sparklineData.data?.records ?? []} />; break;`,
  `sparklineRecords={sparklineData.data?.records ?? []} convSparklineRecords={convSparklineData.data?.records ?? []} />; break;`
);

// ─── 4. Update TrendsTab signature ──────────────────────────────────────────
content = content.replace(
  `sparklineRecords: any[] }) {`,
  `sparklineRecords: any[]; convSparklineRecords: any[] }) {`
);

// ─── 5. Add convSparklineRecords to destructuring ────────────────────────────
content = content.replace(
  `sparklineRecords, sparkSeries`,
  `sparklineRecords, convSparklineRecords, sparkSeries`
);

// Actually step 5 won't work since destructuring is on the signature line.
// Instead update the sparkSeries block to include conv data ─────────────────
// Find the sparkSeries definition and add convRate + revenue after it
content = content.replace(
  `  const sparkSeries: Record<string, number[]> = {
    sessions:  sparkRows.map((r: any) => r.sessions),
    total:     sparkRows.map((r: any) => r.total),
    avg_dur:   sparkRows.map((r: any) => r.avg_dur),
    p50_dur:   sparkRows.map((r: any) => r.p50_dur),
    p90_dur:   sparkRows.map((r: any) => r.p90_dur),
    errors:    sparkRows.map((r: any) => r.errors),
    errorRate: sparkRows.map((r: any) => r.total > 0 ? (r.errors / r.total) * 100 : 0),
    apdex:     sparkRows.map((r: any) => r.total > 0 ? calcApdex(r.satisfied, r.tolerating, r.total) : 0),
    frustrated: sparkRows.map((r: any) => r.frustrated),
  };`,
  `  const sparkSeries: Record<string, number[]> = {
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
  sparkSeries['revenue']  = convSparkRows.map((r: any) => r.converted_sessions * aov);`
);

// ─── 6. Update Conversion Rate and Revenue sparkKeys from null to string ─────
content = content.replace(
  `    { label: "Conversion Rate", current: overallConv,      prev: overallConvPrev,         inverted: false, format: fmtPct,                           sparkKey: null },`,
  `    { label: "Conversion Rate", current: overallConv,      prev: overallConvPrev,         inverted: false, format: fmtPct,                           sparkKey: "convRate" as string | null },`
);
content = content.replace(
  `{ label: "Revenue",  current: currRevenue,        prev: prevRevenue,           inverted: false, format: fmtCurrency,                      sparkKey: null as string | null }`,
  `{ label: "Revenue",  current: currRevenue,        prev: prevRevenue,           inverted: false, format: fmtCurrency,                      sparkKey: "revenue" as string | null }`
);

// Verify
const checks = [
  ['trendsConvSparklineQuery added',  content.includes('function trendsConvSparklineQuery(')],
  ['convSparklineData useDql',        content.includes('convSparklineData = useDql(')],
  ['prop passed to TrendsTab',        content.includes('convSparklineRecords={convSparklineData')],
  ['TrendsTab signature updated',     content.includes('convSparklineRecords: any[]')],
  ['sparkSeries has convRate',        content.includes("sparkSeries['convRate']")],
  ['sparkSeries has revenue',         content.includes("sparkSeries['revenue']")],
  ['Conversion Rate sparkKey set',    content.includes('"convRate" as string | null')],
  ['Revenue sparkKey set',            content.includes('"revenue" as string | null')],
];
let allOk = true;
for (const [name, ok] of checks) {
  console.log((ok ? 'OK' : 'FAIL') + ': ' + name);
  if (!ok) allOk = false;
}
if (!allOk) { process.exit(1); }

fs.writeFileSync(filePath, content, 'utf8');
console.log('\nDone!');
