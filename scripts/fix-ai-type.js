const fs = require('fs');
const fp = 'ui/app/pages/UserJourney.tsx';
let c = fs.readFileSync(fp, 'utf8');

// The new tabs return { summary: "...", recs: [...] }
// Need to return { summary: "...", insights: [], recommendations: [...] }
// Pattern: starts around line 16780+ in new tabs

// Fix: replace `recs: [` with `insights: [], recommendations: [`  in useAIInsights callbacks of the 8 new tabs
// These are all in the last ~500 lines of the file (lines 16750+)

// Strategy: Find the 8 occurrences that look like:
//   return { summary: `...`, recs: [
// and replace with:
//   return { summary: `...`, insights: [], recommendations: [

// Also some might use single-line: summary: "...", recs: [...]
// Let's be precise and only fix within lines 16750+

const lines = c.split('\n');
let fixCount = 0;
for (let i = 16700; i < lines.length; i++) {
  if (lines[i].includes(', recs: [')) {
    lines[i] = lines[i].replace(', recs: [', ', insights: [], recommendations: [');
    fixCount++;
  }
}

console.log(`Fixed ${fixCount} recs -> recommendations`);
c = lines.join('\n');
fs.writeFileSync(fp, c, 'utf8');
console.log('Done');
