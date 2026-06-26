// Removes auto-refresh feature (causes visual page blanking via useDql data clearing)
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../ui/app/pages/UserJourney.tsx');
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

// 1. Remove auto-refresh state + useEffect from main component
content = content.replace(
`  // Auto-refresh for Funnel Overview
  const [autoRefreshSecs, setAutoRefreshSecs] = useState<0 | 30 | 60 | 300>(0);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    if (!autoRefreshSecs) return;
    const id = setInterval(() => {
      setRefreshNonce(n => n + 1);
      setLastRefreshed(new Date());
    }, autoRefreshSecs * 1000);
    return () => clearInterval(id);
  }, [autoRefreshSecs]);

`,
``
);

// 2. Remove refreshNonce from useDql query calls
content = content
  .replace(', false, refreshNonce)', ', false)')
  .replace(', true, refreshNonce)', ', true)')
  .replace('stepMetricsQuery(timeframeDays, frontend, steps, refreshNonce)', 'stepMetricsQuery(timeframeDays, frontend, steps)')
  .replace('pageMetricsQuery(timeframeDays, frontend, steps, refreshNonce)', 'pageMetricsQuery(timeframeDays, frontend, steps)')
  .replace('todayFunnelHourlyQuery(frontend, steps, refreshNonce)', 'todayFunnelHourlyQuery(frontend, steps)');

// 3. Remove refresh props from FunnelOverviewTab call site
content = content.replace(
  ` autoRefreshSecs={autoRefreshSecs} setAutoRefreshSecs={setAutoRefreshSecs} lastRefreshed={lastRefreshed} onManualRefresh={() => { setRefreshNonce(n => n + 1); setLastRefreshed(new Date()); }}`,
  ``
);

// 4. Remove refresh props from FunnelOverviewTab function signature
content = content.replace(
  `; autoRefreshSecs: 0 | 30 | 60 | 300; setAutoRefreshSecs: (v: 0 | 30 | 60 | 300) => void; lastRefreshed: Date | null; onManualRefresh: () => void`,
  ``
);
// Also remove from destructuring
content = content.replace(
  `, autoRefreshSecs, setAutoRefreshSecs, lastRefreshed, onManualRefresh, todayHourlyData`,
  `, todayHourlyData`
);

// 5. Remove the Refresh controls bar JSX from FunnelOverviewTab return
content = content.replace(
  `      {/* Refresh controls */}
      <Flex alignItems="center" gap={12} style={{ padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.07)" }}>
        <Text style={{ fontSize: 13, opacity: 0.5, whiteSpace: "nowrap" }}>Auto-refresh</Text>
        <Select value={String(autoRefreshSecs)} onChange={(v) => { if (v !== null) setAutoRefreshSecs(Number(v) as 0 | 30 | 60 | 300); }}>
          <Select.Trigger style={{ minWidth: 90 }} />
          <Select.Content>
            <Select.Option value="0">Off</Select.Option>
            <Select.Option value="30">30 s</Select.Option>
            <Select.Option value="60">1 min</Select.Option>
            <Select.Option value="300">5 min</Select.Option>
          </Select.Content>
        </Select>
        <button onClick={onManualRefresh} className="uj-compare-toggle" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M11 6.5A4.5 4.5 0 1 1 6.5 2c1.2 0 2.3.47 3.1 1.24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M9 1v3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Refresh
        </button>
        {isLoading && <Text style={{ fontSize: 12, opacity: 0.4 }}>Refreshing...</Text>}
        {lastRefreshed && !isLoading && <Text style={{ fontSize: 12, opacity: 0.35 }}>Updated {lastRefreshed.toLocaleTimeString()}</Text>}
      </Flex>`,
  ``
);

// 6. Update help text: remove auto-refresh mentions
content = content.replace(
  ` <Strong>Auto-refresh</Strong> control (30 s / 1 min / 5 min / Off) in the toolbar keeps funnel data live without a page reload — a manual Refresh button triggers an immediate fetch. `,
  ` `
);
content = content.replace(
  ` plus <Strong>Auto-refresh</Strong> (30 s / 1 min / 5 min / Off) and a manual Refresh button that keep data live without a page reload.`,
  `.`
);
content = content.replace(
  `<Paragraph>• Use <Strong>Auto-refresh</Strong> in Funnel Overview to monitor live conversion rates during campaigns or deployments — set 30 s for real-time watching, 5 min for background monitoring.</Paragraph>\n        `,
  ``
);

// 7. Update What's New entry: remove auto-refresh bullet
content = content.replace(
  `            <Paragraph style={{ fontSize: 13 }}>• <Strong>Auto-refresh</Strong>: Live funnel data reloads at 30 s, 1 min, or 5 min intervals — no page reload. A <Strong>Refresh</Strong> button triggers an immediate manual fetch. "Updated HH:MM:SS" timestamp shows when data was last pulled.</Paragraph>\n`,
  ``
);
// Also update the heading
content = content.replace(
  `<Strong>Funnel Overview — Sub-Tabs, Real-Time Refresh &amp; Predictive EOD Model</Strong>`,
  `<Strong>Funnel Overview — Sub-Tabs &amp; Predictive EOD Model</Strong>`
);
// And the AI insights summary mentions
content = content.replace(
  ` Auto-refresh (30 s / 1 min / 5 min) and manual Refresh keep data live without a page reload. `,
  ` `
);

// Verify
const checks = [
  ['refreshNonce removed from queries', '!content.includes("refreshNonce")'],
  ['autoRefreshSecs state removed', '!content.includes("const [autoRefreshSecs")'],
  ['refresh controls bar removed', '!content.includes("Auto-refresh\\n")'],
];
let allOk = true;
for (const [name, check] of checks) {
  const ok = eval(check);
  console.log((ok ? 'OK' : 'WARN') + ': ' + name);
  if (!ok) allOk = false;
}

// Final check: no orphaned refs to autoRefreshSecs
if (content.includes('autoRefreshSecs')) {
  console.warn('WARN: autoRefreshSecs still present in file — checking locations');
  content.split('\n').forEach((l, i) => { if (l.includes('autoRefreshSecs')) console.warn('  line ' + (i+1) + ': ' + l.trim().substring(0,100)); });
}
if (content.includes('refreshNonce')) {
  console.warn('WARN: refreshNonce still present in file — checking locations');
  content.split('\n').forEach((l, i) => { if (l.includes('refreshNonce')) console.warn('  line ' + (i+1) + ': ' + l.trim().substring(0,100)); });
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('\nDone!');
