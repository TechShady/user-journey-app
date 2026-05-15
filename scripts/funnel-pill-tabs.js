// Replace Strato <Tabs>/<Tab> in FunnelOverviewTab with Sankey-style pill button bar
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../ui/app/pages/UserJourney.tsx');
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const lines = content.split('\n');

// Known line indices (0-based): verified above
const TABS_OPEN  = 3463; // line 3464: "      <Tabs defaultIndex={0}>"
const TABS_CLOSE = 3678; // line 3679: "      </Tabs>"

// Tab content boundaries (0-based, the <Flex> content lines inside each Tab)
// Tab 1 Conversion Funnel:  lines 3466-3496  (inner Flex: 3466, </Tab>: 3497)
// Tab 2 Predictive Model:   lines 3499-3571  (inner Flex: 3499, </Tab>: 3572)
// Tab 3 Step Analysis:      lines 3574-3605  (inner Flex: 3574, </Tab>: 3606)
// Tab 4 Per-Page Breakdown: lines 3608-3677  (inner Flex: 3608, </Tab>: 3678)
// Each Tab wraps its content in: <Flex flexDirection="column" gap={20} style={{ paddingTop: 12 }}>...</Flex>

// Extract the inner content of each tab (strip the surrounding <Tab>/<Flex> wrapper)
function extractTabContent(startIdx, endIdx) {
  // startIdx = line after <Tab title="...">, which is the <Flex flexDirection="column"...> line
  // endIdx = line before </Tab>, which is </Flex>
  // We want the lines INSIDE the Flex, i.e. startIdx+1 .. endIdx-1
  const innerLines = lines.slice(startIdx + 1, endIdx - 1);
  // Re-indent: current indent is 12 spaces (inside Tabs > Tab > Flex), target is 6 spaces
  return innerLines.map(l => {
    if (l.trim() === '') return '';
    // Remove 6 leading spaces (going from 12-space to 6-space indent)
    return l.startsWith('      ') ? l.slice(6) : l;
  }).join('\n');
}

const tab1Content = extractTabContent(3465, 3496); // Conversion Funnel inner content
const tab2Content = extractTabContent(3498, 3571); // Predictive Model inner content
const tab3Content = extractTabContent(3573, 3605); // Step Analysis inner content
const tab4Content = extractTabContent(3607, 3677); // Per-Page Breakdown inner content

// Build replacement block (replaces lines 3463..3678 inclusive)
const replacement = `      {/* Funnel Overview sub-tab bar — pill style matching Sankey */}
      <Flex gap={4} flexWrap="wrap" style={{ padding: "4px 0" }}>
        {([
          { key: "funnel",     label: "Conversion Funnel",  icon: "🔻" },
          { key: "predictive", label: "Predictive Model",   icon: "📈" },
          { key: "steps",      label: "Step Analysis",      icon: "📋" },
          { key: "pages",      label: "Per-Page Breakdown", icon: "📄" },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setFunnelSubTab(t.key as any)} style={{
            padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: funnelSubTab === t.key ? 700 : 400, cursor: "pointer",
            background: funnelSubTab === t.key ? "rgba(69,137,255,0.15)" : "rgba(128,128,128,0.06)",
            border: funnelSubTab === t.key ? "1px solid rgba(69,137,255,0.4)" : "1px solid rgba(128,128,128,0.15)",
            color: funnelSubTab === t.key ? BLUE : "inherit", transition: "all 0.15s",
          }}>{t.icon} {t.label}</button>
        ))}
      </Flex>

      {/* Conversion Funnel */}
      {funnelSubTab === "funnel" && (
        <Flex flexDirection="column" gap={20}>
${tab1Content}
        </Flex>
      )}

      {/* Predictive Model */}
      {funnelSubTab === "predictive" && (
        <Flex flexDirection="column" gap={20}>
${tab2Content}
        </Flex>
      )}

      {/* Step Analysis */}
      {funnelSubTab === "steps" && (
        <Flex flexDirection="column" gap={20}>
${tab3Content}
        </Flex>
      )}

      {/* Per-Page Breakdown */}
      {funnelSubTab === "pages" && (
        <Flex flexDirection="column" gap={20}>
${tab4Content}
        </Flex>
      )}`;

// Splice into lines array
const before = lines.slice(0, TABS_OPEN);
const after  = lines.slice(TABS_CLOSE + 1);
const newLines = [...before, ...replacement.split('\n'), ...after];
let newContent = newLines.join('\n');

// Add funnelSubTab state inside FunnelOverviewTab (after the aiPanel line)
newContent = newContent.replace(
  `  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeFunnelOverview(overallConv, overallApdex, quality, funnelCounts, steps, stepMap, aov, pageMap), [overallConv, overallApdex, quality, funnelCounts, steps, stepMap, aov, pageMap]));

  // On initial load`,
  `  const { panel: aiPanel } = useAIInsights(React.useCallback(() => analyzeFunnelOverview(overallConv, overallApdex, quality, funnelCounts, steps, stepMap, aov, pageMap), [overallConv, overallApdex, quality, funnelCounts, steps, stepMap, aov, pageMap]));
  const [funnelSubTab, setFunnelSubTab] = React.useState<"funnel"|"predictive"|"steps"|"pages">("funnel");

  // On initial load`
);

// Verify
const checks = [
  ['pill bar present',    newContent.includes('Funnel Overview sub-tab bar')],
  ['funnelSubTab state',  newContent.includes('const [funnelSubTab')],
  ['Conversion Funnel pill', newContent.includes('"funnel"')],
  ['Predictive pill',     newContent.includes('"predictive"')],
  ['Steps pill',          newContent.includes('"steps"')],
  ['Pages pill',          newContent.includes('"pages"')],
  ['No Funnel Tab titles', !newContent.includes('<Tab title="Conversion Funnel">')],
];
let ok = true;
for (const [name, pass] of checks) {
  console.log((pass ? 'OK' : 'FAIL') + ': ' + name);
  if (!pass) ok = false;
}
if (!ok) { process.exit(1); }

fs.writeFileSync(filePath, newContent, 'utf8');
console.log('\nDone!');
