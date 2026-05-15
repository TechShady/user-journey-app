// Applies 3 changes to FunnelOverviewTab:
// 1. Move Apdex breakdown above <Tabs>
// 2. Chart full-width below KPI cards in Predictive Model tab
// 3. 10-minute resolution for predictive query (bin instead of hourly)
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../ui/app/pages/UserJourney.tsx');
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

// ─── CHANGE 3a: Update todayFunnelHourlyQuery DQL ──────────────────────────
// Change `hour = getHour(start_time)` → `slot_ts = bin(start_time, 10m)`
// and group-by/sort accordingly
content = content.replace(
`| fieldsAdd hour = getHour(start_time)
| summarize
    steps = collectDistinct(step_tag),
    by: {dt.rum.session.id, hour}
| fieldsAdd
\${iAnyLines}
| fieldsAdd converted = if(\${convertedConds}, true, else: false)
| summarize
    total_sessions = count(),
    converted_sessions = countIf(converted == true),
    by: {hour}
| fieldsAdd conv_rate = if(total_sessions > 0, toDouble(converted_sessions) / toDouble(total_sessions) * 100.0, else: 0.0)
| sort hour asc\``,
`| fieldsAdd slot_ts = bin(start_time, 10m)
| summarize
    steps = collectDistinct(step_tag),
    by: {dt.rum.session.id, slot_ts}
| fieldsAdd
\${iAnyLines}
| fieldsAdd converted = if(\${convertedConds}, true, else: false)
| summarize
    total_sessions = count(),
    converted_sessions = countIf(converted == true),
    by: {slot_ts}
| fieldsAdd conv_rate = if(total_sessions > 0, toDouble(converted_sessions) / toDouble(total_sessions) * 100.0, else: 0.0)
| sort slot_ts asc\``
);

// ─── CHANGE 3b: Update hourlyPoints parsing + regression vars ──────────────
content = content.replace(
`  // Predictive EOD model — linear regression on today's hourly conv rates
  const todayRecords = (todayHourlyData?.data?.records ?? []) as any[];
  const hourlyPoints = todayRecords
    .map((r: any) => ({ hour: Number(r.hour ?? 0), rate: Number(r.conv_rate ?? 0), sessions: Number(r.total_sessions ?? 0) }))
    .sort((a, b) => a.hour - b.hour)
    .filter(p => p.sessions > 0);
  const predN = hourlyPoints.length;
  let projectedEod = overallConv;
  let velocitySlope = 0;
  let predConfidence = 0;
  if (predN >= 2) {
    const sumX = hourlyPoints.reduce((a, p) => a + p.hour, 0);
    const sumY = hourlyPoints.reduce((a, p) => a + p.rate, 0);
    const sumXY = hourlyPoints.reduce((a, p) => a + p.hour * p.rate, 0);
    const sumXX = hourlyPoints.reduce((a, p) => a + p.hour * p.hour, 0);
    const denom = predN * sumXX - sumX * sumX;
    velocitySlope = denom !== 0 ? (predN * sumXY - sumX * sumY) / denom : 0;
    const intercept = (sumY - velocitySlope * sumX) / predN;
    projectedEod = Math.max(0, Math.min(100, velocitySlope * 23 + intercept));
    predConfidence = Math.min(95, Math.round((predN / Math.max(1, new Date().getHours() + 1)) * 100));
  }
  const currentHour = new Date().getHours();
  const velocityDir = velocitySlope > 0.05 ? "rising" : velocitySlope < -0.05 ? "declining" : "stable";
  const velocityClr = velocitySlope > 0.05 ? GREEN : velocitySlope < -0.05 ? RED : YELLOW;`,
`  // Predictive EOD model — linear regression on today's 10-min conv rates
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
    projectedEod = Math.max(0, Math.min(100, velocitySlopePerMin * 1430 + intercept));
    const now = new Date(); const currentMinutes = now.getHours() * 60 + now.getMinutes();
    predConfidence = Math.min(95, Math.round((predN / Math.max(1, currentMinutes / 10)) * 100));
  }
  const velocitySlope = velocitySlopePerMin * 60; // convert to %/hour for display
  const currentHour = new Date().getHours();
  const currentMin = currentHour * 60 + new Date().getMinutes();
  const velocityDir = velocitySlope > 0.05 ? "rising" : velocitySlope < -0.05 ? "declining" : "stable";
  const velocityClr = velocitySlope > 0.05 ? GREEN : velocitySlope < -0.05 ? RED : YELLOW;`
);

// ─── CHANGE 1: Move Apdex breakdown above <Tabs> ──────────────────────────
// Remove Apdex tile from inside Tab 1 Flex, add it above <Tabs> with 6-space indent
const apdexTileInTab = `            {/* Apdex satisfaction breakdown */}
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
                  <div style={{ width: \`\${quality.total > 0 ? (quality.satisfied / quality.total) * 100 : 0}%\`, background: GREEN, height: "100%" }} />
                  <div style={{ width: \`\${quality.total > 0 ? (quality.tolerating / quality.total) * 100 : 0}%\`, background: YELLOW, height: "100%" }} />
                  <div style={{ width: \`\${quality.total > 0 ? (quality.frustrated / quality.total) * 100 : 0}%\`, background: RED, height: "100%" }} />
                </div>
              </Flex>
            </div>
            {/* Funnel style + compare controls */}`;

const apdexTileAboveTabs = `      {/* Apdex satisfaction breakdown */}
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
            <div style={{ width: \`\${quality.total > 0 ? (quality.satisfied / quality.total) * 100 : 0}%\`, background: GREEN, height: "100%" }} />
            <div style={{ width: \`\${quality.total > 0 ? (quality.tolerating / quality.total) * 100 : 0}%\`, background: YELLOW, height: "100%" }} />
            <div style={{ width: \`\${quality.total > 0 ? (quality.frustrated / quality.total) * 100 : 0}%\`, background: RED, height: "100%" }} />
          </div>
        </Flex>
      </div>

      <Tabs defaultIndex={0}>
        <Tab title="Conversion Funnel">
          <Flex flexDirection="column" gap={20} style={{ paddingTop: 12 }}>
            {/* Funnel style + compare controls */}`;

// Replace in content: remove Apdex from Tab 1 and insert above Tabs
const tabsMarker = `      <Tabs defaultIndex={0}>
        <Tab title="Conversion Funnel">
          <Flex flexDirection="column" gap={20} style={{ paddingTop: 12 }}>
            {/* Apdex satisfaction breakdown */}`;

if (!content.includes(tabsMarker)) {
  console.error('ERROR: tabsMarker not found!');
  process.exit(1);
}

content = content.replace(tabsMarker + apdexTileInTab.slice(apdexTileInTab.indexOf('\n')), apdexTileAboveTabs);

// ─── CHANGE 2: Chart full-width below KPI cards ───────────────────────────
// Update the chart rendering in Predictive tab: separate KPI Flex from chart
// Use per-minute scale, full-width chart
content = content.replace(
`                  <Flex gap={20} alignItems="flex-start" flexWrap="wrap">
                    <div className="uj-kpi-card" style={{ minWidth: 120 }}>
                      <Text className="uj-kpi-label">Projected EOD</Text>
                      <Heading level={3} className="uj-kpi-value" style={{ color: statusClr(projectedEod) }}>{fmtPct(projectedEod)}</Heading>
                      <Text style={{ fontSize: 12, opacity: 0.45 }}>conv rate at 23:59</Text>
                    </div>
                    <div className="uj-kpi-card" style={{ minWidth: 120 }}>
                      <Text className="uj-kpi-label">Hourly Velocity</Text>
                      <Heading level={3} className="uj-kpi-value" style={{ color: velocityClr }}>{velocitySlope >= 0 ? "+" : ""}{velocitySlope.toFixed(2)}%/h</Heading>
                      <Text style={{ fontSize: 12, color: velocityClr }}>{velocityDir}</Text>
                    </div>
                    <div className="uj-kpi-card" style={{ minWidth: 120 }}>
                      <Text className="uj-kpi-label">Hours Remaining</Text>
                      <Heading level={3} className="uj-kpi-value" style={{ color: BLUE }}>{23 - currentHour}h</Heading>
                      <Text style={{ fontSize: 12, opacity: 0.45 }}>until end of day</Text>
                    </div>
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <Text style={{ fontSize: 11, opacity: 0.4, marginBottom: 4, display: "block" }}>Hourly conv rate · actual (solid) vs projected (dashed)</Text>
                      <svg width="100%" viewBox={\`0 0 \${W} \${H}\`} style={{ overflow: "visible" }}>
                        <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
                        <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
                        <line x1={xS(currentHour)} y1={padT} x2={xS(currentHour)} y2={padT + plotH} stroke="rgba(255,255,255,0.12)" strokeWidth={1} strokeDasharray="3 2" />
                        <text x={xS(currentHour)} y={padT - 2} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize={7}>now</text>
                        <path d={areaD} fill={BLUE} fillOpacity={0.08} />
                        <path d={actualLine} fill="none" stroke={BLUE} strokeWidth={2} strokeLinejoin="round" />
                        <path d={projLine} fill="none" stroke={velocityClr} strokeWidth={1.5} strokeDasharray="5 3" />
                        <circle cx={xS(23)} cy={yS(projectedEod)} r={4} fill={velocityClr} stroke="rgba(0,0,0,0.5)" strokeWidth={1.2}><title>Projected EOD: {fmtPct(projectedEod)}</title></circle>
                        {hourlyPoints.map(p => <circle key={p.hour} cx={xS(p.hour)} cy={yS(p.rate)} r={2.5} fill={BLUE}><title>Hour {p.hour}:00 — {fmtPct(p.rate)} ({fmtCount(p.sessions)} sessions)</title></circle>)}
                        {[0, 6, 12, 18, 23].map(h => <text key={h} x={xS(h)} y={H - 4} textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize={7}>{h}:00</text>)}
                        <text x={padL - 4} y={padT + 4} textAnchor="end" fill="rgba(255,255,255,0.25)" fontSize={7}>{rateMax.toFixed(0)}%</text>
                        <text x={padL - 4} y={padT + plotH} textAnchor="end" fill="rgba(255,255,255,0.25)" fontSize={7}>{rateMin.toFixed(0)}%</text>
                      </svg>
                    </div>
                  </Flex>`,
`                  <Flex gap={16} flexWrap="wrap" style={{ marginBottom: 16 }}>
                    <div className="uj-kpi-card" style={{ minWidth: 120 }}>
                      <Text className="uj-kpi-label">Projected EOD</Text>
                      <Heading level={3} className="uj-kpi-value" style={{ color: statusClr(projectedEod) }}>{fmtPct(projectedEod)}</Heading>
                      <Text style={{ fontSize: 12, opacity: 0.45 }}>conv rate at 23:59</Text>
                    </div>
                    <div className="uj-kpi-card" style={{ minWidth: 120 }}>
                      <Text className="uj-kpi-label">Velocity</Text>
                      <Heading level={3} className="uj-kpi-value" style={{ color: velocityClr }}>{velocitySlope >= 0 ? "+" : ""}{velocitySlope.toFixed(2)}%/h</Heading>
                      <Text style={{ fontSize: 12, color: velocityClr }}>{velocityDir}</Text>
                    </div>
                    <div className="uj-kpi-card" style={{ minWidth: 120 }}>
                      <Text className="uj-kpi-label">Hours Remaining</Text>
                      <Heading level={3} className="uj-kpi-value" style={{ color: BLUE }}>{23 - currentHour}h</Heading>
                      <Text style={{ fontSize: 12, opacity: 0.45 }}>until end of day</Text>
                    </div>
                  </Flex>
                  <div style={{ width: "100%" }}>
                    <Text style={{ fontSize: 11, opacity: 0.4, marginBottom: 4, display: "block" }}>10-min conv rate · actual (solid) vs projected (dashed)</Text>
                    <svg width="100%" viewBox={\`0 0 \${W} \${H}\`} style={{ overflow: "visible" }}>
                      <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
                      <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
                      <line x1={xS(currentMin)} y1={padT} x2={xS(currentMin)} y2={padT + plotH} stroke="rgba(255,255,255,0.12)" strokeWidth={1} strokeDasharray="3 2" />
                      <text x={xS(currentMin)} y={padT - 2} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize={7}>now</text>
                      <path d={areaD} fill={BLUE} fillOpacity={0.08} />
                      <path d={actualLine} fill="none" stroke={BLUE} strokeWidth={2} strokeLinejoin="round" />
                      <path d={projLine} fill="none" stroke={velocityClr} strokeWidth={1.5} strokeDasharray="5 3" />
                      <circle cx={xS(1430)} cy={yS(projectedEod)} r={4} fill={velocityClr} stroke="rgba(0,0,0,0.5)" strokeWidth={1.2}><title>Projected EOD: {fmtPct(projectedEod)}</title></circle>
                      {hourlyPoints.map(p => <circle key={p.min} cx={xS(p.min)} cy={yS(p.rate)} r={2} fill={BLUE}><title>{String(Math.floor(p.min/60)).padStart(2,"0")}:{String(p.min%60).padStart(2,"0")} — {fmtPct(p.rate)} ({fmtCount(p.sessions)} sessions)</title></circle>)}
                      {[0, 360, 720, 1080, 1380].map(m => <text key={m} x={xS(m)} y={H - 4} textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize={7}>{Math.floor(m/60)}:00</text>)}
                      <text x={padL - 4} y={padT + 4} textAnchor="end" fill="rgba(255,255,255,0.25)" fontSize={7}>{rateMax.toFixed(0)}%</text>
                      <text x={padL - 4} y={padT + plotH} textAnchor="end" fill="rgba(255,255,255,0.25)" fontSize={7}>{rateMin.toFixed(0)}%</text>
                    </svg>
                  </div>`
);

// ─── CHANGE 3c: Update xS/yS/actualLine/projLine/areaD in chart calc ─────
// These use p.hour; change to p.min, and xS to scale to 1430 instead of 23
content = content.replace(
`              const xS = (h: number) => padL + (h / 23) * plotW;
              const yS = (r: number) => padT + plotH - ((r - rateMin) / rateRange) * plotH;
              const actualLine = hourlyPoints.map((p, i) => \`\${i === 0 ? "M" : "L"}\${xS(p.hour).toFixed(1)},\${yS(p.rate).toFixed(1)}\`).join(" ");
              const last = hourlyPoints[hourlyPoints.length - 1];
              const projLine = \`M\${xS(last.hour).toFixed(1)},\${yS(last.rate).toFixed(1)} L\${xS(23).toFixed(1)},\${yS(projectedEod).toFixed(1)}\`;
              const areaD = \`\${actualLine} L\${xS(last.hour).toFixed(1)},\${yS(rateMin).toFixed(1)} L\${xS(hourlyPoints[0].hour).toFixed(1)},\${yS(rateMin).toFixed(1)} Z\`;`,
`              const xS = (m: number) => padL + (m / 1430) * plotW;
              const yS = (r: number) => padT + plotH - ((r - rateMin) / rateRange) * plotH;
              const actualLine = hourlyPoints.map((p, i) => \`\${i === 0 ? "M" : "L"}\${xS(p.min).toFixed(1)},\${yS(p.rate).toFixed(1)}\`).join(" ");
              const last = hourlyPoints[hourlyPoints.length - 1];
              const projLine = \`M\${xS(last.min).toFixed(1)},\${yS(last.rate).toFixed(1)} L\${xS(1430).toFixed(1)},\${yS(projectedEod).toFixed(1)}\`;
              const areaD = \`\${actualLine} L\${xS(last.min).toFixed(1)},\${yS(rateMin).toFixed(1)} L\${xS(hourlyPoints[0].min).toFixed(1)},\${yS(rateMin).toFixed(1)} Z\`;`
);

// Verify all changes were applied
const checks = [
  ['todayFunnelHourlyQuery 10m', 'bin(start_time, 10m)'],
  ['hourlyPoints uses min', '.min - b.min'],
  ['slotToMin function', 'const slotToMin'],
  ['Apdex above tabs', 'satisfaction breakdown */}\n      <div className="uj-table-tile"'],
  ['xS uses 1430', '(m / 1430) * plotW'],
  ['chart uses currentMin', 'xS(currentMin)'],
  ['full-width chart div', 'style={{ width: "100%" }}'],
];

let allOk = true;
for (const [name, needle] of checks) {
  if (!content.includes(needle)) {
    console.error(`MISSING: ${name} — "${needle}"`);
    allOk = false;
  } else {
    console.log(`OK: ${name}`);
  }
}

if (!allOk) {
  console.error('\nSome changes failed — NOT writing file');
  process.exit(1);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('\nAll changes applied successfully!');
