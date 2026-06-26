/**
 * Fix remaining {fmtXxx(...)} inside template literals that need ${fmtXxx(...)}
 */
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "ui", "app", "pages", "UserJourney.tsx");
let src = fs.readFileSync(FILE, "utf8");
let fixes = 0;

// Pattern: inside backtick strings, {fmtPct(...)} or {fmtCount(...)} without $ prefix
// We look for `...{fmtXxx(...)...` patterns
src = src.replace(/`([^`]*?)\{(fmtPct|fmtCount|fmtCurrency|fmt)\(/g, (m, before, fn) => {
  // Only fix if the char before { is NOT $
  if (before.endsWith("$")) return m; // already has $
  fixes++;
  return "`" + before + "${" + fn + "(";
});

console.log(`Fixed ${fixes} missing $ in template literals`);
fs.writeFileSync(FILE, src, "utf8");
