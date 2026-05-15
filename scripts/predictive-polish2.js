// Polish the Predictive Model sub-tab:
// 1. KPI cards: ensure full-width stretch + more breathing room
// 2. Chart: thinner line, horizontal grid lines, remove cluttered dots
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../ui/app/pages/UserJourney.tsx');
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

// ─── 1. KPI cards: full-width Flex, bigger gap, more card padding ─────────────
content = content.replace(
  `            <Flex gap={16} style={{ marginBottom: 16 }}>
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
            </Flex>`,
  `            <div style={{ display: "flex", gap: 20, width: "100%", marginBottom: 20 }}>
              <div className="uj-kpi-card" style={{ flex: 1, minWidth: 0, padding: "20px 24px" }}>
                <Text className="uj-kpi-label">Projected EOD</Text>
                <Heading level={3} className="uj-kpi-value" style={{ color: statusClr(projectedEod) }}>{fmtPct(projectedEod)}</Heading>
                <Text style={{ fontSize: 12, opacity: 0.45 }}>conv rate at 23:59</Text>
              </div>
              <div className="uj-kpi-card" style={{ flex: 1, minWidth: 0, padding: "20px 24px" }}>
                <Text className="uj-kpi-label">Velocity</Text>
                <Heading level={3} className="uj-kpi-value" style={{ color: velocityClr }}>{velocitySlope >= 0 ? "+" : ""}{velocitySlope.toFixed(2)}%/h</Heading>
                <Text style={{ fontSize: 12, color: velocityClr }}>{velocityDir}</Text>
              </div>
              <div className="uj-kpi-card" style={{ flex: 1, minWidth: 0, padding: "20px 24px" }}>
                <Text className="uj-kpi-label">Hours Remaining</Text>
                <Heading level={3} className="uj-kpi-value" style={{ color: BLUE }}>{23 - currentHour}h</Heading>
                <Text style={{ fontSize: 12, opacity: 0.45 }}>until end of day</Text>
              </div>
            </div>`
);

// ─── 2. Chart: add horizontal grid lines, thin line, remove cluttered dots ────
content = content.replace(
  `              <svg width="100%" viewBox={\`0 0 \${W} \${H}\`} style={{ overflow: "visible" }}>
                <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
                <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
                <line x1={xS(currentMin)} y1={padT} x2={xS(currentMin)} y2={padT + plotH} stroke="rgba(255,255,255,0.12)" strokeWidth={1} strokeDasharray="3 2" />
                <text x={xS(currentMin)} y={padT - 2} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize={7}>now</text>
                <path d={areaD} fill={BLUE} fillOpacity={0.08} />
                <path d={actualLine} fill="none" stroke={BLUE} strokeWidth={2} strokeLinejoin="round" />
                <path d={projLine} fill="none" stroke={velocityClr} strokeWidth={1.5} strokeDasharray="5 3" />
                <circle cx={xS(1425)} cy={yS(projectedEod)} r={4} fill={velocityClr} stroke="rgba(0,0,0,0.5)" strokeWidth={1.2}><title>Projected EOD: {fmtPct(projectedEod)}</title></circle>
                {hourlyPoints.map((p, i) => <circle key={p.min} cx={xS(p.min)} cy={yS(smoothed[i])} r={1.5} fill={BLUE} fillOpacity={0.7}><title>{String(Math.floor(p.min/60)).padStart(2,"0")}:{String(p.min%60).padStart(2,"0")} — {fmtPct(p.rate)} ({fmtCount(p.sessions)} sessions)</title></circle>)}
                {[0, 360, 720, 1080, 1380].map(m => <text key={m} x={xS(m)} y={H - 4} textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize={7}>{Math.floor(m/60)}:00</text>)}
                <text x={padL - 4} y={padT + 4} textAnchor="end" fill="rgba(255,255,255,0.25)" fontSize={7}>{rateMax.toFixed(0)}%</text>
                <text x={padL - 4} y={padT + plotH} textAnchor="end" fill="rgba(255,255,255,0.25)" fontSize={7}>{rateMin.toFixed(0)}%</text>
              </svg>`,
  `              <svg width="100%" viewBox={\`0 0 \${W} \${H}\`} style={{ overflow: "visible" }}>
                {/* Horizontal grid lines at 25% intervals */}
                {[0, 0.25, 0.5, 0.75, 1].map(t => {
                  const gy = padT + plotH * t;
                  const gVal = rateMax - (rateMax - rateMin) * t;
                  return (
                    <g key={t}>
                      <line x1={padL} y1={gy} x2={padL + plotW} y2={gy} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
                      <text x={padL - 6} y={gy + 3} textAnchor="end" fill="rgba(255,255,255,0.22)" fontSize={7}>{gVal.toFixed(0)}%</text>
                    </g>
                  );
                })}
                {/* Vertical axis border */}
                <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
                <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
                {/* "now" marker */}
                <line x1={xS(currentMin)} y1={padT} x2={xS(currentMin)} y2={padT + plotH} stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="3 3" />
                <text x={xS(currentMin)} y={padT - 3} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={7} fontWeight="500">now</text>
                {/* Area fill */}
                <path d={areaD} fill={BLUE} fillOpacity={0.07} />
                {/* Actual line — thinner, clean */}
                <path d={actualLine} fill="none" stroke={BLUE} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" strokeOpacity={0.9} />
                {/* Projected dashed line */}
                <path d={projLine} fill="none" stroke={velocityClr} strokeWidth={1.3} strokeDasharray="5 4" strokeOpacity={0.85} />
                {/* EOD target dot */}
                <circle cx={xS(1425)} cy={yS(projectedEod)} r={4} fill={velocityClr} stroke="rgba(0,0,0,0.6)" strokeWidth={1.2}><title>Projected EOD: {fmtPct(projectedEod)}</title></circle>
                {/* Time labels */}
                {[0, 360, 720, 1080, 1380].map(m => <text key={m} x={xS(m)} y={H - 4} textAnchor="middle" fill="rgba(255,255,255,0.28)" fontSize={7}>{Math.floor(m/60)}:00</text>)}
              </svg>`
);

// Verify
const checks = [
  ['full-width KPI row', content.includes('display: "flex", gap: 20, width: "100%"')],
  ['padding on cards', content.includes('padding: "20px 24px"')],
  ['thinner line', content.includes('strokeWidth={1.4}')],
  ['horizontal grids', content.includes('Horizontal grid lines')],
  ['no cluttered dots', !content.includes('hourlyPoints.map((p, i) => <circle')],
];

let allOk = true;
for (const [name, ok] of checks) {
  console.log((ok ? 'OK' : 'FAIL') + ': ' + name);
  if (!ok) allOk = false;
}
if (!allOk) { process.exit(1); }

fs.writeFileSync(filePath, content, 'utf8');
console.log('\nDone!');
