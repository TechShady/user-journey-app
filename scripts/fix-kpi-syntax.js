/**
 * Fix pass: correct syntax errors introduced by regex replacements.
 * 1. value={`{expr}`} → value={expr} (doubled braces)
 * 2. color={COLOR, ...extra} → color={COLOR} (over-captured)
 * 3. value={`${expr}`} with nested template → value={String(expr)} or just value={expr}
 */
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "ui", "app", "pages", "UserJourney.tsx");
let src = fs.readFileSync(FILE, "utf8");

let fixes = 0;

// Fix 1: value={`{fmtXxx(...)}`} → value={fmtXxx(...)}
// The pattern is: value={`{EXPR}`} where EXPR doesn't contain backticks
src = src.replace(/value=\{`\{([^`}]+)\}`\}/g, (m, expr) => {
  fixes++;
  return `value={${expr}}`;
});

// Fix 2: value={`{EXPR} text`} or value={`text {EXPR}`} - mixed text+expr
// These need to stay as template literals but without the extra outer braces
// Actually pattern is: value={`{expr1}{expr2}`} → value={`${expr1}${expr2}`}
src = src.replace(/value=\{`\{([^}]+)\}\{([^}]+)\}`\}/g, (m, e1, e2) => {
  fixes++;
  return `value={\`\${${e1}}\${${e2}}\`}`;
});

// Fix 3: color={BLUE, fontSize: 28} → color={BLUE}
// Over-captured: color prop has comma-separated junk
src = src.replace(/color=\{([A-Z_]+),\s*fontSize:\s*\d+\}/g, (m, clr) => {
  fixes++;
  return `color={${clr}}`;
});

// Fix 4: value={`${expr1}${expr2}`} is fine but value={`${a > b ? c : d}`} needs care
// Actually let's also fix: value={`{a >= 0 ? "+" : ""}...`} patterns
// These have unescaped braces inside backticks - need ${}
src = src.replace(/value=\{`\{([^`]+)\}`\}/g, (m, inner) => {
  // If inner has balanced braces it's likely a complex expression
  fixes++;
  return `value={${inner}}`;
});

console.log(`Applied ${fixes} syntax fixes`);
fs.writeFileSync(FILE, src, "utf8");
console.log("Done.");
