const fs = require('fs');
const fp = 'ui/app/pages/UserJourney.tsx';
let c = fs.readFileSync(fp, 'utf8');

// 1. Add new tab keys to TAB_KEYS array
const oldKeys = `"Cost per Conversion", "Performance Tax", "Idle Capacity", "CDN ROI", "Cost Anomalies",
] as const;`;
const newKeys = `"Cost per Conversion", "Performance Tax", "Idle Capacity", "CDN ROI", "Cost Anomalies",
  "Right-Sizing", "Cost per Transaction", "Cloud Waste", "Scaling Efficiency", "Environment Parity", "SLO Cost Trade-offs", "Tag Allocation", "Observability ROI",
] as const;`;

if (c.includes(oldKeys)) {
  c = c.replace(oldKeys, newKeys);
  console.log('1. TAB_KEYS updated');
} else {
  console.log('1. TAB_KEYS already updated or not found');
}

// 2. Fix useAIInsights calls - remove extra title/industry/isLoading args
// Pattern: ), 'Some Title', industry, isLoading);
const aiRegex = /\)\), '[^']+', industry, isLoading\);/g;
const aiMatches = c.match(aiRegex);
if (aiMatches) {
  c = c.replace(aiRegex, '));');
  console.log(`2. Fixed ${aiMatches.length} useAIInsights calls`);
} else {
  console.log('2. No useAIInsights fixes needed');
}

// 3. Fix Flex direction="column" -> flexDirection="column"
const dirRegex = /<Flex direction="column"/g;
const dirMatches = c.match(dirRegex);
if (dirMatches) {
  c = c.replace(dirRegex, '<Flex flexDirection="column"');
  console.log(`3. Fixed ${dirMatches.length} Flex direction props`);
} else {
  console.log('3. No Flex direction fixes needed');
}

fs.writeFileSync(fp, c, 'utf8');
console.log('All fixes applied');
