const fs = require('fs');
let code = fs.readFileSync('ui/app/pages/UserJourney.tsx', 'utf8');

const lines = code.split('\n');
let changed = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.includes('KpiCard')) continue;
  
  // Extract label from the line
  const labelMatch = line.match(/label=["{\`]([^"}\`]+)/);
  if (!labelMatch) continue;
  let label = labelMatch[1].replace(/\$/g, '').replace(/\{/g, '').replace(/\}/g, '').replace(/"/g, '').substring(0, 30);
  
  // Replace prevRawValue={X * 0.92} patterns
  if (line.includes('* 0.92')) {
    lines[i] = line.replace(/prevRawValue=\{([^}]+)\s*\*\s*0\.92\}/g, (match, expr) => {
      return `prevRawValue={syntheticPrev(${expr.trim()}, "${label}")}`;
    });
    if (lines[i] !== line) changed++;
  }
}
code = lines.join('\n');

// Now replace syntheticSparkline(X) calls inside KpiCard lines to pass label
const lines2 = code.split('\n');
let changed2 = 0;
for (let i = 0; i < lines2.length; i++) {
  const line = lines2[i];
  if (!line.includes('KpiCard')) continue;
  if (!line.includes('syntheticSparkline(')) continue;
  
  const labelMatch = line.match(/label=["{\`]([^"}\`]+)/);
  if (!labelMatch) continue;
  let label = labelMatch[1].replace(/\$/g, '').replace(/\{/g, '').replace(/\}/g, '').replace(/"/g, '').substring(0, 30);
  
  // Replace syntheticSparkline(expr) with syntheticSparkline(expr, 8, "label")
  // Skip if already has more than 1 arg (contains comma after first arg)
  lines2[i] = line.replace(/syntheticSparkline\(([^,)]+)\)/g, (match, expr) => {
    return `syntheticSparkline(${expr}, 8, "${label}")`;
  });
  if (lines2[i] !== line) changed2++;
}
code = lines2.join('\n');

fs.writeFileSync('ui/app/pages/UserJourney.tsx', code, 'utf8');
console.log('prevRawValue replacements:', changed);
console.log('sparkline label additions:', changed2);
