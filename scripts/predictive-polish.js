// Two changes to Predictive Model tab:
// 1. KPI cards stretch full width (flex: 1 on each card)
// 2. Cleaner graph: 15-min bins (4/hr), smoothed line, smaller dots
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../ui/app/pages/UserJourney.tsx');
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

// ─── 1. Change bin from 10m to 15m in query ─────────────────────────────────
content = content.replace('bin(start_time, 10m)', 'bin(start_time, 15m)');

// ─── 2. Update confidence calc (15-min slots instead of 10-min) ─────────────
content = content.replace(
  'predConfidence = Math.min(95, Math.round((predN / Math.max(1, currentMinutes / 10)) * 100));',
  'predConfidence = Math.min(95, Math.round((predN / Math.max(1, currentMinutes / 15)) * 100));'
);

// ─── 3. Update EOD projection from min 1430 to 1425 (last 15-min slot) ──────
content = content.replace(
  'projectedEod = Math.max(0, Math.min(100, velocitySlopePerMin * 1430 + intercept));',
  'projectedEod = Math.max(0, Math.min(100, velocitySlopePerMin * 1425 + intercept));'
);

// ─── 4. KPI cards: add flex: 1 so they stretch across full width ─────────────
// Change minWidth-only cards to flex: 1 cards
content = content.replace(
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
                  </Flex>`,
  `                  <Flex gap={16} style={{ marginBottom: 16 }}>
                    <div className="uj-kpi-card" style={{ flex: 1 }}>
                      <Text className="uj-kpi-label">Projected EOD</Text>
                      <Heading level={3} className="uj-kpi-value" style={{ color: statusClr(projectedEod) }}>{fmtPct(projectedEod)}</Heading>
                      <Text style={{ fontSize: 12, opacity: 0.45 }}>conv rate at 23:59</Text>
                    </div>
                    <div className="uj-kpi-card" style={{ flex: 1 }}>
                      <Text className="uj-kpi-label">Velocity</Text>
                      <Heading level={3} className="uj-kpi-value" style={{ color: velocityClr }}>{velocitySlope >= 0 ? "+" : ""}{velocitySlope.toFixed(2)}%/h</Heading>
                      <Text style={{ fontSize: 12, color: velocityClr }}>{velocityDir}</Text>
                    </div>
                    <div className="uj-kpi-card" style={{ flex: 1 }}>
                      <Text className="uj-kpi-label">Hours Remaining</Text>
                      <Heading level={3} className="uj-kpi-value" style={{ color: BLUE }}>{23 - currentHour}h</Heading>
                      <Text style={{ fontSize: 12, opacity: 0.45 }}>until end of day</Text>
                    </div>
                  </Flex>`
);

// ─── 5. Smoothed line + smaller dots + update 1430 → 1425 in chart ───────────
content = content.replace(
  `              const xS = (m: number) => padL + (m / 1430) * plotW;
              const yS = (r: number) => padT + plotH - ((r - rateMin) / rateRange) * plotH;
              const actualLine = hourlyPoints.map((p, i) => \`\${i === 0 ? "M" : "L"}\${xS(p.min).toFixed(1)},\${yS(p.rate).toFixed(1)}\`).join(" ");
              const last = hourlyPoints[hourlyPoints.length - 1];
              const projLine = \`M\${xS(last.min).toFixed(1)},\${yS(last.rate).toFixed(1)} L\${xS(1430).toFixed(1)},\${yS(projectedEod).toFixed(1)}\`;
              const areaD = \`\${actualLine} L\${xS(last.min).toFixed(1)},\${yS(rateMin).toFixed(1)} L\${xS(hourlyPoints[0].min).toFixed(1)},\${yS(rateMin).toFixed(1)} Z\`;`,
  `              const xS = (m: number) => padL + (m / 1440) * plotW;
              const yS = (r: number) => padT + plotH - ((r - rateMin) / rateRange) * plotH;
              // 3-point weighted moving average for smoother line
              const smoothed = hourlyPoints.map((p, i) => {
                const w0 = i > 0 ? hourlyPoints[i - 1].rate : p.rate;
                const w2 = i < hourlyPoints.length - 1 ? hourlyPoints[i + 1].rate : p.rate;
                return (w0 + 2 * p.rate + w2) / 4;
              });
              const actualLine = hourlyPoints.map((p, i) => \`\${i === 0 ? "M" : "L"}\${xS(p.min).toFixed(1)},\${yS(smoothed[i]).toFixed(1)}\`).join(" ");
              const last = hourlyPoints[hourlyPoints.length - 1];
              const projLine = \`M\${xS(last.min).toFixed(1)},\${yS(smoothed[smoothed.length - 1]).toFixed(1)} L\${xS(1425).toFixed(1)},\${yS(projectedEod).toFixed(1)}\`;
              const areaD = \`\${actualLine} L\${xS(last.min).toFixed(1)},\${yS(rateMin).toFixed(1)} L\${xS(hourlyPoints[0].min).toFixed(1)},\${yS(rateMin).toFixed(1)} Z\`;`
);

// ─── 6. Update EOD circle position 1430 → 1425, reduce dot size ─────────────
content = content.replace(
  `                      <circle cx={xS(1430)} cy={yS(projectedEod)} r={4} fill={velocityClr} stroke="rgba(0,0,0,0.5)" strokeWidth={1.2}><title>Projected EOD: {fmtPct(projectedEod)}</title></circle>
                      {hourlyPoints.map(p => <circle key={p.min} cx={xS(p.min)} cy={yS(p.rate)} r={2} fill={BLUE}><title>{String(Math.floor(p.min/60)).padStart(2,"0")}:{String(p.min%60).padStart(2,"0")} — {fmtPct(p.rate)} ({fmtCount(p.sessions)} sessions)</title></circle>)}`,
  `                      <circle cx={xS(1425)} cy={yS(projectedEod)} r={4} fill={velocityClr} stroke="rgba(0,0,0,0.5)" strokeWidth={1.2}><title>Projected EOD: {fmtPct(projectedEod)}</title></circle>
                      {hourlyPoints.map((p, i) => <circle key={p.min} cx={xS(p.min)} cy={yS(smoothed[i])} r={1.5} fill={BLUE} fillOpacity={0.7}><title>{String(Math.floor(p.min/60)).padStart(2,"0")}:{String(p.min%60).padStart(2,"0")} — {fmtPct(p.rate)} ({fmtCount(p.sessions)} sessions)</title></circle>)}`
);

// ─── 7. Update chart label text ───────────────────────────────────────────────
content = content.replace(
  `<Text style={{ fontSize: 11, opacity: 0.4, marginBottom: 4, display: "block" }}>10-min conv rate · actual (solid) vs projected (dashed)</Text>`,
  `<Text style={{ fontSize: 11, opacity: 0.4, marginBottom: 4, display: "block" }}>15-min conv rate · actual (solid, smoothed) vs projected (dashed)</Text>`
);

// ─── 8. Update placeholder text ──────────────────────────────────────────────
content = content.replace(
  'Predictive model requires ≥2 hourly data points for today. Check back after more data accumulates.',
  'Predictive model requires ≥2 data points for today. Check back after more data accumulates.'
);

// Verify key changes
const checks = [
  ['15m bin', content.includes('bin(start_time, 15m)')],
  ['confidence /15', content.includes('currentMinutes / 15')],
  ['1425 EOD', content.includes('1425')],
  ['flex: 1 on cards', content.includes('"flex: 1"') || content.includes('flex: 1')],
  ['smoothed array', content.includes('const smoothed')],
  ['1440 scale', content.includes('(m / 1440)')],
];

let allOk = true;
for (const [name, ok] of checks) {
  console.log((ok ? 'OK' : 'FAIL') + ': ' + name);
  if (!ok) allOk = false;
}

if (!allOk) { console.error('Some checks failed'); process.exit(1); }

fs.writeFileSync(filePath, content, 'utf8');
console.log('\nDone!');
