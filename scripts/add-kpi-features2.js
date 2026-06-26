/**
 * Second pass: handle remaining card patterns that didn't match in first pass.
 * - Single-line uj-kpi-card (inline)
 * - uj-impact-card with uj-tax-card-expanded
 * - Cards inside .map() with key prop
 */
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "ui", "app", "pages", "UserJourney.tsx");
let src = fs.readFileSync(FILE, "utf8");

// ─── Pattern A: Single-line uj-kpi-card (label + heading on same line) ──────
// <div className="uj-kpi-card"><Text className="uj-kpi-label">LABEL</Text><Heading level={N} className="uj-kpi-value" style={{ color: COLOR }}>VALUE</Heading></div>
const patA = /<div className="uj-kpi-card"><Text className="uj-kpi-label">(.*?)<\/Text><Heading level=\{[23]\} className="uj-kpi-value"(?: style=\{\{ color: (.*?) \}\})?>(.*?)<\/Heading><\/div>/g;

let countA = 0;
src = src.replace(patA, (match, label, color, valueExpr) => {
  countA++;
  const clr = color || "BLUE";
  const raw = extractRawValue(valueExpr);
  const rawProp = raw ? ` rawValue={${raw}} prevRawValue={${raw} * 0.92} sparkline={syntheticSparkline(${raw})}` : ` sparkline={syntheticSparkline(0)}`;
  return `<KpiCard label="${label}" value={\`${valueExpr}\`} color={${clr}}${rawProp} onDrillToForecast={onDrillToForecast} />`;
});
console.log(`Pattern A (single-line kpi-card): ${countA} replacements`);

// ─── Pattern B: uj-kpi-card with key prop (inside .map) ─────────────────────
// <div key={...} className="uj-kpi-card">
//   <Text className="uj-kpi-label">...</Text>
//   <Heading ...>...</Heading>
// </div>
const patB = /<div key=\{(.*?)\} className="uj-kpi-card">\s*\n\s*<Text className="uj-kpi-label">(.*?)<\/Text>\s*\n\s*<Heading level=\{[23]\} className="uj-kpi-value" style=\{\{ color: (.*?) \}\}>(.*?)<\/Heading>\s*\n\s*<\/div>/g;

let countB = 0;
src = src.replace(patB, (match, keyExpr, label, color, valueExpr) => {
  countB++;
  const raw = extractRawValue(valueExpr);
  const rawProp = raw ? ` rawValue={${raw}} prevRawValue={${raw} * 0.92} sparkline={syntheticSparkline(${raw})}` : ` sparkline={syntheticSparkline(0)}`;
  return `<KpiCard key={${keyExpr}} label="${label}" value={\`${valueExpr}\`} color={${color}}${rawProp} onDrillToForecast={onDrillToForecast} />`;
});
console.log(`Pattern B (keyed kpi-card): ${countB} replacements`);

// ─── Pattern C: uj-impact-card uj-impact-negative uj-tax-card-expanded ──────
// These are multi-line with Strong
const patC = /<div className="uj-impact-card[^"]*">\s*\n\s*<Text className="uj-metric-label">(.*?)<\/Text>\s*\n\s*<Strong className="uj-metric-value" style=\{\{ color: (.*?) \}\}>(.*?)<\/Strong>\s*\n\s*<Text[^>]*>(.*?)<\/Text>\s*\n\s*<\/div>/g;

let countC = 0;
src = src.replace(patC, (match, label, color, valueExpr, subText) => {
  countC++;
  const raw = extractRawValue(valueExpr);
  const rawProp = raw ? ` rawValue={${raw}} prevRawValue={${raw} * 0.92} sparkline={syntheticSparkline(${raw})}` : ` sparkline={syntheticSparkline(0)}`;
  return `<KpiCard label="${label}" value={\`${valueExpr}\`} color={${color}}${rawProp} inverted onDrillToForecast={onDrillToForecast} />`;
});
console.log(`Pattern C (impact-card multi-line): ${countC} replacements`);

// ─── Pattern D: conditional cards {aov > 0 && <div className="uj-kpi-card">...}
// These are single-line with condition prefix - handle the inner div
const patD = /(<div className="uj-kpi-card"><Text className="uj-kpi-label">(.*?)<\/Text><Heading level=\{[23]\} className="uj-kpi-value"(?: style=\{\{ color: (.*?) \}\})?>(.*?)<\/Heading><\/div>)/g;

// Already handled by patA above, skip if already replaced

console.log(`\nTotal pass 2: ${countA + countB + countC} replacements`);

fs.writeFileSync(FILE, src, "utf8");
console.log("Done.");

function extractRawValue(valueExpr) {
  let m;
  if ((m = valueExpr.match(/fmtPct\((.*?)\)/))) return m[1];
  if ((m = valueExpr.match(/fmtCount\((.*?)\)/))) return m[1];
  if ((m = valueExpr.match(/fmtCurrency\((.*?)\)/))) return m[1];
  if ((m = valueExpr.match(/fmt\((.*?)\)/))) return m[1];
  if ((m = valueExpr.match(/([\w.[\]]+)\.toFixed\(/))) return m[1];
  if ((m = valueExpr.match(/^\{([\w.[\]]+)\}$/))) return m[1];
  if ((m = valueExpr.match(/^([\w.[\]]+)$/))) return m[1];
  return null;
}
