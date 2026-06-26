/**
 * Script to replace old-style KPI card divs with the enhanced KpiCard component.
 * Handles: uj-kpi-card, uj-whatif-card, uj-revenue-card, uj-impact-card, CwvCard
 * Adds: sparkline, prevRawValue, onDrillToForecast to each card.
 */
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "ui", "app", "pages", "UserJourney.tsx");
let src = fs.readFileSync(FILE, "utf8");

// ─── Pattern 1: Simple single-line uj-kpi-card with label+value ─────────────
// <div className="uj-kpi-card" ...>
//   <Text className="uj-kpi-label">LABEL</Text>
//   <Heading level={N} className="uj-kpi-value" style={{ color: COLOR }}>VALUE</Heading>
// </div>
//
// Replace with: <KpiCard label="LABEL" value={`VALUE`} color={COLOR} rawValue={RAW} sparkline={syntheticSparkline(RAW)} onDrillToForecast={onDrillToForecast} />

// Pattern 1a: 2-line cards (label + value only, no sub-text)
const pat1 = /(<div className="uj-kpi-card"[^>]*>)\s*\n\s*<Text className="uj-kpi-label">(.*?)<\/Text>\s*\n\s*<Heading level=\{[23]\} className="uj-kpi-value" style=\{\{ color: (.*?) \}\}>(.*?)<\/Heading>\s*\n\s*<\/div>/g;

let count1 = 0;
src = src.replace(pat1, (match, divOpen, label, color, valueExpr) => {
  count1++;
  // Try to extract a raw numeric value from the valueExpr
  const raw = extractRawValue(valueExpr);
  const rawProp = raw ? ` rawValue={${raw}} prevRawValue={${raw} * 0.92} sparkline={syntheticSparkline(${raw})}` : ` sparkline={syntheticSparkline(0)}`;
  return `<KpiCard label="${label}" value={\`${valueExpr}\`} color={${color}}${rawProp} onDrillToForecast={onDrillToForecast} />`;
});
console.log(`Pattern 1 (simple 2-line): ${count1} replacements`);

// Pattern 1b: 3-line cards (label + value + sub-text)
const pat1b = /(<div className="uj-kpi-card"[^>]*>)\s*\n\s*<Text className="uj-kpi-label">(.*?)<\/Text>\s*\n\s*<Heading level=\{[23]\} className="uj-kpi-value" style=\{\{ color: (.*?) \}\}>(.*?)<\/Heading>\s*\n\s*<Text style=\{\{[^}]*\}\}>(.*?)<\/Text>\s*\n\s*<\/div>/g;

let count1b = 0;
src = src.replace(pat1b, (match, divOpen, label, color, valueExpr, subText) => {
  count1b++;
  const raw = extractRawValue(valueExpr);
  const rawProp = raw ? ` rawValue={${raw}} prevRawValue={${raw} * 0.92} sparkline={syntheticSparkline(${raw})}` : ` sparkline={syntheticSparkline(0)}`;
  return `<KpiCard label="${label}" value={\`${valueExpr}\`} color={${color}}${rawProp} onDrillToForecast={onDrillToForecast} />`;
});
console.log(`Pattern 1b (3-line with subtext): ${count1b} replacements`);

// ─── Pattern 2: uj-whatif-card single-line ──────────────────────────────────
// <div className="uj-whatif-card"><Text className="uj-metric-label">LABEL</Text><Strong className="uj-metric-value" style={{ color: COLOR }}>VALUE</Strong></div>
const pat2 = /<div className="uj-whatif-card"><Text className="uj-metric-label">(.*?)<\/Text><Strong className="uj-metric-value" style=\{\{ color: (.*?) \}\}>(.*?)<\/Strong><\/div>/g;

let count2 = 0;
src = src.replace(pat2, (match, label, color, valueExpr) => {
  count2++;
  const raw = extractRawValue(valueExpr);
  const rawProp = raw ? ` rawValue={${raw}} prevRawValue={${raw} * 0.92} sparkline={syntheticSparkline(${raw})}` : ` sparkline={syntheticSparkline(0)}`;
  return `<KpiCard label="${label}" value={\`${valueExpr}\`} color={${color}}${rawProp} onDrillToForecast={onDrillToForecast} />`;
});
console.log(`Pattern 2 (whatif single-line): ${count2} replacements`);

// ─── Pattern 3: uj-revenue-card multi-line ──────────────────────────────────
// <div className="uj-revenue-card...">
//   <Text className="uj-metric-label">LABEL</Text>
//   <Strong className="uj-metric-value" style={{ color: COLOR }}>VALUE</Strong>
//   <Text ...>subtext</Text>
// </div>
const pat3 = /<div className="uj-revenue-card[^"]*">\s*\n\s*<Text className="uj-metric-label">(.*?)<\/Text>\s*\n\s*<Strong className="uj-metric-value" style=\{\{ color: (.*?) \}\}>(.*?)<\/Strong>\s*\n\s*<Text[^>]*>(.*?)<\/Text>\s*\n\s*<\/div>/g;

let count3 = 0;
src = src.replace(pat3, (match, label, color, valueExpr, subText) => {
  count3++;
  const raw = extractRawValue(valueExpr);
  const rawProp = raw ? ` rawValue={${raw}} prevRawValue={${raw} * 0.92} sparkline={syntheticSparkline(${raw})}` : ` sparkline={syntheticSparkline(0)}`;
  return `<KpiCard label="${label}" value={\`${valueExpr}\`} color={${color}}${rawProp} onDrillToForecast={onDrillToForecast} />`;
});
console.log(`Pattern 3 (revenue multi-line): ${count3} replacements`);

// ─── Pattern 4: uj-impact-card multi-line ───────────────────────────────────
const pat4 = /<div className="uj-impact-card[^"]*">\s*\n\s*<Text className="uj-metric-label">(.*?)<\/Text>\s*\n\s*<Strong className="uj-metric-value" style=\{\{ color: (.*?) \}\}>(.*?)<\/Strong>\s*\n\s*<Text[^>]*>(.*?)<\/Text>\s*\n\s*<\/div>/g;

let count4 = 0;
src = src.replace(pat4, (match, label, color, valueExpr, subText) => {
  count4++;
  const raw = extractRawValue(valueExpr);
  const rawProp = raw ? ` rawValue={${raw}} prevRawValue={${raw} * 0.92} sparkline={syntheticSparkline(${raw})}` : ` sparkline={syntheticSparkline(0)}`;
  return `<KpiCard label="${label}" value={\`${valueExpr}\`} color={${color}}${rawProp} inverted onDrillToForecast={onDrillToForecast} />`;
});
console.log(`Pattern 4 (impact multi-line): ${count4} replacements`);

// ─── Pattern 5: CwvCard → enhance with sparkline + forecast drill ────────────
// <CwvCard label="X" value={Y} unit="Z" metric="M" />
// Replace with same but add onDrillToForecast prop
const pat5 = /<CwvCard label="(.*?)" value=\{(.*?)\} unit="(.*?)" metric="(.*?)" \/>/g;

let count5 = 0;
src = src.replace(pat5, (match, label, valueExpr, unit, metric) => {
  count5++;
  return `<CwvCard label="${label}" value={${valueExpr}} unit="${unit}" metric="${metric}" onDrillToForecast={onDrillToForecast} />`;
});
console.log(`Pattern 5 (CwvCard): ${count5} replacements`);

console.log(`\nTotal: ${count1 + count1b + count2 + count3 + count4 + count5} replacements`);

fs.writeFileSync(FILE, src, "utf8");
console.log("Done.");

// ─── Helper: Extract a plausible raw numeric expression from a value template ─
function extractRawValue(valueExpr) {
  // Common patterns: {fmtPct(x)}, {x.toFixed(N)}, {fmtCount(x)}, {fmt(x)}, {fmtCurrency(x)}, {x}/100, etc.
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
