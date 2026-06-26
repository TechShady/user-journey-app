// Fix remaining stray $ before {fmtXxx()} in JSX (not template literals)
const fs = require("fs");
const file = "ui/app/pages/UserJourney.tsx";
let c = fs.readFileSync(file, "utf8");

// Find all occurrences of >${fmtXxx( that are NOT inside template literals
// Template literals are on lines starting with "return `" or containing backtick strings
// JSX lines have actual JSX tags

let count = 0;
const lines = c.split("\n");
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // Skip lines that are clearly inside template literal strings (return ` or assignment with `)
  if (line.includes("return `") || line.match(/=\s*`/)) continue;
  
  // Fix: >${ -> >{ for fmt functions in JSX
  const fixed = line.replace(/(>)\$\{(fmtCount|fmtPct|fmtCurrency|fmt)\(/g, (m, gt, fn) => {
    count++;
    return gt + "{" + fn + "(";
  });
  lines[i] = fixed;
}

c = lines.join("\n");
fs.writeFileSync(file, c);
console.log("Fixed", count, "remaining $ occurrences");
