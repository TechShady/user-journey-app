/**
 * Fix over-aggressive template literal replacement.
 * The previous script incorrectly changed:
 *   value={fmtCount(...)}  →  value=${fmtCount(...)}
 * This fixes it back by looking for value=$ patterns that aren't inside backticks.
 */
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "ui", "app", "pages", "UserJourney.tsx");
let src = fs.readFileSync(FILE, "utf8");
let fixes = 0;

// Fix: value=${fmtXxx(...)} → value={fmtXxx(...)}
// These are JSX prop values that should be value={expr} not value=${expr}
src = src.replace(/value=\$\{(fmtPct|fmtCount|fmtCurrency|fmt)\(/g, (m, fn) => {
  fixes++;
  return `value={${fn}(`;
});

// Fix: color=${...} → color={...} (same issue)
src = src.replace(/color=\$\{/g, (m) => {
  fixes++;
  return `color={`;
});

// Fix: rawValue=${...} → rawValue={...}
src = src.replace(/rawValue=\$\{/g, (m) => {
  fixes++;
  return `rawValue={`;
});

// Fix: prevRawValue=${...} → prevRawValue={...}
src = src.replace(/prevRawValue=\$\{/g, (m) => {
  fixes++;
  return `prevRawValue={`;
});

// Fix: sparkline=${...} → sparkline={...}
src = src.replace(/sparkline=\$\{/g, (m) => {
  fixes++;
  return `sparkline={`;
});

// Fix: onDrillToForecast=${...} → onDrillToForecast={...}
src = src.replace(/onDrillToForecast=\$\{/g, (m) => {
  fixes++;
  return `onDrillToForecast={`;
});

// Fix: label=${...} → label={...} (in case)  
src = src.replace(/label=\$\{/g, (m) => {
  fixes++;
  return `label={`;
});

// Fix: inverted=${...}
src = src.replace(/inverted=\$\{/g, (m) => {
  fixes++;
  return `inverted={`;
});

// Fix: key=${...}
src = src.replace(/key=\$\{/g, (m) => {
  fixes++;
  return `key={`;
});

console.log(`Fixed ${fixes} over-aggressive $ insertions`);
fs.writeFileSync(FILE, src, "utf8");
