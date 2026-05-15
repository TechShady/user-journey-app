// Two changes:
// 1. Add second TrafficChange slider just above "Projected Funnel" section
// 2. Fix Predictive Model KPI cards to use CSS grid (guaranteed full-width equal columns)
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../ui/app/pages/UserJourney.tsx');
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

// ─── 1. Second slider above Projected Funnel ─────────────────────────────────
content = content.replace(
  `      <Flex justifyContent="space-between" alignItems="center">
        <SectionHeader title="Projected Funnel" />
        <select value={wiFunnelStyle} onChange={(e) => setWiFunnelStyle(e.target.value as FunnelStyle)} style={{ background: "rgba(128,128,128,0.15)", border: "1px solid rgba(128,128,128,0.3)", borderRadius: 6, padding: "4px 10px", color: "inherit", fontSize: 12 }}>
          {FUNNEL_STYLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Flex>`,
  `      <MultiplierSlider value={pctChange} onChange={setPctChange} />
      <Flex justifyContent="space-between" alignItems="center">
        <SectionHeader title="Projected Funnel" />
        <select value={wiFunnelStyle} onChange={(e) => setWiFunnelStyle(e.target.value as FunnelStyle)} style={{ background: "rgba(128,128,128,0.15)", border: "1px solid rgba(128,128,128,0.3)", borderRadius: 6, padding: "4px 10px", color: "inherit", fontSize: 12 }}>
          {FUNNEL_STYLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Flex>`
);

// ─── 2. Predictive Model KPI cards: CSS grid → guaranteed equal-width fill ───
content = content.replace(
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
            </div>`,
  `            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 20 }}>
              <div className="uj-kpi-card" style={{ padding: "20px 24px" }}>
                <Text className="uj-kpi-label">Projected EOD</Text>
                <Heading level={3} className="uj-kpi-value" style={{ color: statusClr(projectedEod) }}>{fmtPct(projectedEod)}</Heading>
                <Text style={{ fontSize: 12, opacity: 0.45 }}>conv rate at 23:59</Text>
              </div>
              <div className="uj-kpi-card" style={{ padding: "20px 24px" }}>
                <Text className="uj-kpi-label">Velocity</Text>
                <Heading level={3} className="uj-kpi-value" style={{ color: velocityClr }}>{velocitySlope >= 0 ? "+" : ""}{velocitySlope.toFixed(2)}%/h</Heading>
                <Text style={{ fontSize: 12, color: velocityClr }}>{velocityDir}</Text>
              </div>
              <div className="uj-kpi-card" style={{ padding: "20px 24px" }}>
                <Text className="uj-kpi-label">Hours Remaining</Text>
                <Heading level={3} className="uj-kpi-value" style={{ color: BLUE }}>{23 - currentHour}h</Heading>
                <Text style={{ fontSize: 12, opacity: 0.45 }}>until end of day</Text>
              </div>
            </div>`
);

// Verify
const checks = [
  ['second slider present', (content.match(/MultiplierSlider value=\{pctChange\}/g) || []).length >= 2],
  ['grid layout on KPI cards', content.includes('gridTemplateColumns: "1fr 1fr 1fr"')],
  ['no flex KPI row', !content.includes('display: "flex", gap: 20, width: "100%"')],
];

let allOk = true;
for (const [name, ok] of checks) {
  console.log((ok ? 'OK' : 'FAIL') + ': ' + name);
  if (!ok) allOk = false;
}
if (!allOk) { process.exit(1); }

fs.writeFileSync(filePath, content, 'utf8');
console.log('\nDone!');
