/**
 * Fix broken rawValue/prevRawValue/sparkline props where extractRawValue captured partial expressions.
 * Pattern: rawValue={expr_missing_closing_paren} prevRawValue={...} sparkline={syntheticSparkline(expr_missing...)}
 * Fix: remove rawValue/prevRawValue, keep sparkline={syntheticSparkline(0)}
 */
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "ui", "app", "pages", "UserJourney.tsx");
let src = fs.readFileSync(FILE, "utf8");
const lines = src.split("\n");
let fixes = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // Fix pattern: rawValue={expr that has unbalanced parens}
  // Detect by checking if rawValue={...} has unbalanced ( vs )
  if (line.includes("rawValue={") && line.includes("<KpiCard")) {
    // Check balance of the rawValue prop
    const rawMatch = line.match(/rawValue=\{([^}]+)\}/);
    if (rawMatch) {
      const expr = rawMatch[1];
      const opens = (expr.match(/\(/g) || []).length;
      const closes = (expr.match(/\)/g) || []).length;
      if (opens !== closes) {
        // Broken expression - replace rawValue/prevRawValue/sparkline with simple sparkline
        let fixed = line;
        // Remove rawValue={...} prevRawValue={...} sparkline={syntheticSparkline(...)}
        fixed = fixed.replace(/ rawValue=\{[^}]+\}/, "");
        fixed = fixed.replace(/ prevRawValue=\{[^}]+\}/, "");
        fixed = fixed.replace(/ sparkline=\{syntheticSparkline\([^)]*\)\}/, " sparkline={syntheticSparkline(0)}");
        lines[i] = fixed;
        fixes++;
      }
    }
  }
  
  // Fix: value={`{expr}`} with nested backticks/template literals
  // value={`{totalAvg < 60 ? `${...}` : `${...}`}`} — this is invalid JSX
  if (line.includes('value={`{') && line.includes('`}') && (line.match(/`/g) || []).length > 2) {
    // Complex template — simplify to a computed string
    const valMatch = line.match(/value=\{`\{([^`]*(?:`[^`]*`[^`]*)*)\}`\}/);
    if (valMatch) {
      const inner = valMatch[1];
      const replacement = `value={${inner}}`;
      lines[i] = line.replace(valMatch[0], replacement);
      fixes++;
    }
  }
  
  // Fix: value={`{expr}pp`} → value={`${expr}pp`}
  if (line.match(/value=\{`\{[^}]+\}[^`]*`\}/)) {
    lines[i] = lines[i].replace(/value=\{`\{([^}]+)\}([^`]*)`\}/g, (m, expr, suffix) => {
      fixes++;
      return `value={\`\${${expr}}${suffix}\`}`;
    });
  }
  
  // Fix: value={`{expr1} ({expr2})`} → value={`${expr1} (${expr2})`}
  if (lines[i].match(/value=\{`\{[^}]+\}\s*\(\{[^}]+\}\)`\}/)) {
    lines[i] = lines[i].replace(/value=\{`\{([^}]+)\}\s*\(\{([^}]+)\}\)`\}/g, (m, e1, e2) => {
      fixes++;
      return `value={\`\${${e1}} (\${${e2}})\`}`;
    });
  }
  
  // Fix: value={fmtCount(nA)} / {fmtCount(nB)} — missing braces wrapper
  if (lines[i].match(/value=\{[^}]+\}\s*\/\s*\{[^}]+\}/)) {
    lines[i] = lines[i].replace(/value=\{([^}]+)\}\s*\/\s*\{([^}]+)\}/, (m, e1, e2) => {
      fixes++;
      return `value={\`\${${e1}} / \${${e2}}\`}`;
    });
  }
  
  // Fix: value={`{maxDepth + 1} pages`} → value={`${maxDepth + 1} pages`}
  if (lines[i].match(/value=\{`\{[^}]+\}\s+\w+`\}/)) {
    lines[i] = lines[i].replace(/value=\{`\{([^}]+)\}\s+(\w+)`\}/g, (m, expr, suffix) => {
      fixes++;
      return `value={\`\${${expr}} ${suffix}\`}`;
    });
  }
}

src = lines.join("\n");
fs.writeFileSync(FILE, src, "utf8");
console.log(`Applied ${fixes} targeted fixes`);
