const fs = require('fs');
const fp = 'ui/app/pages/UserJourney.tsx';
let c = fs.readFileSync(fp, 'utf8');

// Fix useAIInsights calls - remove extra title/industry/isLoading args
// Pattern: ]), 'Some Title', industry, isLoading);
const aiRegex = /\]\), '[^']+', industry, isLoading\);/g;
const aiMatches = c.match(aiRegex);
if (aiMatches) {
  c = c.replace(aiRegex, ']));');
  console.log(`Fixed ${aiMatches.length} useAIInsights calls`);
} else {
  console.log('No useAIInsights fixes needed');
}

fs.writeFileSync(fp, c, 'utf8');
console.log('Done');
