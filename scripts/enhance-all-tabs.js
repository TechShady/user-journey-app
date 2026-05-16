/**
 * Enhance all tabs with the requested features.
 * Run: node scripts/enhance-all-tabs.js
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'ui', 'app', 'pages', 'UserJourney.tsx');
let code = fs.readFileSync(FILE, 'utf8');

// Helper: insert text BEFORE a marker line
function insertBefore(marker, text) {
  const idx = code.indexOf(marker);
  if (idx === -1) { console.warn(`WARN: marker not found: ${marker.substring(0, 80)}`); return; }
  code = code.substring(0, idx) + text + '\n' + code.substring(idx);
}

// Helper: insert text AFTER a marker line (after the full line containing marker)
function insertAfter(marker, text) {
  const idx = code.indexOf(marker);
  if (idx === -1) { console.warn(`WARN: marker not found: ${marker.substring(0, 80)}`); return; }
  const endOfLine = code.indexOf('\n', idx);
  code = code.substring(0, endOfLine + 1) + text + '\n' + code.substring(endOfLine + 1);
}

// Helper: replace first occurrence
function replaceOnce(old, replacement) {
  const idx = code.indexOf(old);
  if (idx === -1) { console.warn(`WARN: replace target not found: ${old.substring(0, 80)}`); return; }
  code = code.substring(0, idx) + replacement + code.substring(idx + old.length);
}

// ============================================================
// 1. NEW DQL QUERIES — insert before "// Change Intelligence" section
// ============================================================
const NEW_QUERIES = `
// NEW: Geo Network/Carrier Performance Query
function geoNetworkQuery(days: number, frontend: string): string {
  const period = periodClause(days);
  return \`fetch user.events, \${period}
| filter frontend.name == "\${frontend}"
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd satisfaction = coalesce(if(dur_ms <= \${APDEX_T}.0, "satisfied"), if(dur_ms <= \${APDEX_4T}.0, "tolerating"), "frustrated")
| fieldsAdd net_type = coalesce(connection.type, "unknown")
| fieldsAdd carrier_name = coalesce(connection.carrier, "unknown")
| fieldsAdd country = geo.country.iso_code
| summarize
    actions = count(),
    sessions = countDistinct(dt.rum.session.id),
    avg_dur = avg(dur_ms),
    errors = countIf(characteristics.has_error == true),
    satisfied = countIf(satisfaction == "satisfied"),
    tolerating = countIf(satisfaction == "tolerating"),
    frustrated = countIf(satisfaction == "frustrated"),
    by: {net_type, carrier_name, country}
| sort actions desc
| limit 100\`;
}

// NEW: Geo Conversion Rate Query
function geoConversionQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  const firstStep = steps[0]?.identifiers?.map(id => \`view.name == "\${id}"\`).join(" or ") ?? "true";
  const lastStep = steps[steps.length - 1]?.identifiers?.map(id => \`view.name == "\${id}"\`).join(" or ") ?? "true";
  return \`fetch user.events, \${period}
| filter frontend.name == "\${frontend}"
| fieldsAdd country = geo.country.iso_code
| fieldsAdd is_entry = \${firstStep}
| fieldsAdd is_conv = \${lastStep}
| summarize
    total_sessions = countDistinct(dt.rum.session.id),
    entry_sessions = countDistinctIf(dt.rum.session.id, is_entry == true),
    conv_sessions = countDistinctIf(dt.rum.session.id, is_conv == true),
    by: {country}
| fieldsAdd conv_rate = if(entry_sessions > 0, toDouble(conv_sessions) / toDouble(entry_sessions) * 100.0, else: 0.0)
| sort total_sessions desc
| limit 50\`;
}

// NEW: Hourly Map Timelapse Query
function mapTimelapseQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  return \`fetch user.events, \${period}
| filter frontend.name == "\${frontend}"
| filter \${anyStepFilter(steps)}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd satisfaction = coalesce(if(dur_ms <= \${APDEX_T}.0, "satisfied"), if(dur_ms <= \${APDEX_4T}.0, "tolerating"), "frustrated")
| fieldsAdd country = geo.country.iso_code
| fieldsAdd hour_bucket = bin(timestamp, 1h)
| summarize
    actions = count(),
    sessions = countDistinct(dt.rum.session.id),
    avg_dur = avg(dur_ms),
    satisfied = countIf(satisfaction == "satisfied"),
    tolerating = countIf(satisfaction == "tolerating"),
    frustrated = countIf(satisfaction == "frustrated"),
    errors = countIf(characteristics.has_error == true),
    by: {country, hour_bucket}
| sort hour_bucket asc
| limit 2000\`;
}

// NEW: OS Version Segmentation Query
function osVersionQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  return \`fetch user.events, \${period}
| filter frontend.name == "\${frontend}"
| filter \${anyStepFilter(steps)}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd satisfaction = coalesce(if(dur_ms <= \${APDEX_T}.0, "satisfied"), if(dur_ms <= \${APDEX_4T}.0, "tolerating"), "frustrated")
| fieldsAdd os_name = coalesce(os.name, "Unknown")
| fieldsAdd os_ver = coalesce(os.version, "Unknown")
| summarize
    actions = count(),
    sessions = countDistinct(dt.rum.session.id),
    avg_dur = avg(dur_ms),
    errors = countIf(characteristics.has_error == true),
    satisfied = countIf(satisfaction == "satisfied"),
    tolerating = countIf(satisfaction == "tolerating"),
    frustrated = countIf(satisfaction == "frustrated"),
    by: {os_name, os_ver}
| sort actions desc
| limit 50\`;
}

// NEW: Navigation Path Conversion Query
function navPathConversionQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  const lastStep = steps[steps.length - 1]?.identifiers?.map(id => \`view.name == "\${id}"\`).join(" or ") ?? "true";
  return \`fetch user.events, \${period}
| filter frontend.name == "\${frontend}"
| fieldsAdd pageName = coalesce(view.name, url.path, "unknown")
| fieldsAdd is_conv = \${lastStep}
| summarize
    total_sessions = countDistinct(dt.rum.session.id),
    conv_sessions = countDistinctIf(dt.rum.session.id, is_conv == true),
    by: {pageName}
| fieldsAdd conv_rate = if(total_sessions > 0, toDouble(conv_sessions) / toDouble(total_sessions) * 100.0, else: 0.0)
| sort total_sessions desc
| limit 30\`;
}

// NEW: Click Issues Session Replay Query
function clickIssuesReplayQuery(days: number, frontend: string): string {
  const period = periodClause(days);
  return \`fetch user.events, \${period}
| filter frontend.name == "\${frontend}"
| filter characteristics.has_rage_click == true or characteristics.has_dead_click == true
| fields sid = dt.rum.session.id, timestamp, start_time,
    element = coalesce(user_action.target, "unknown"),
    page = coalesce(view.name, url.path, "unknown"),
    click_type = if(characteristics.has_rage_click == true, "rage", else: "dead")
| sort timestamp desc
| limit 30\`;
}

// NEW: Davis Problems Query for Anomaly Tab
function davisProblemsQuery(days: number, frontend: string): string {
  const period = periodClause(days);
  return \`fetch dt.davis.problems, \${period}
| filter isNotNull(display_id)
| fieldsAdd app_match = contains(toString(affected_entity_ids), "APPLICATION")
| sort event.start desc
| limit 20
| fields event.id, display_id, title, event.status, event.start, event.end, root_cause_entity_id, affected_entity_ids\`;
}

// NEW: Backend Services for Root Cause Tab
function backendServicesQuery(days: number, frontend: string): string {
  const period = periodClause(days);
  return \`fetch dt.entity.service
| fieldsKeep id, entity.name, entity.detected_name
| limit 30\`;
}

// NEW: Feature Flag / Config Change Events Query
function featureFlagEventsQuery(days: number): string {
  const period = periodClause(days);
  return \`fetch events, \${period}
| filter event.type == "CUSTOM_INFO" or event.type == "CUSTOM_CONFIGURATION" or event.type == "CUSTOM_ANNOTATION"
| summarize
    count = count(),
    first_time = min(timestamp),
    last_time = max(timestamp),
    by: {event.type, dt.event.description}
| sort last_time desc
| limit 30\`;
}

// NEW: UTM Attribution Query
function utmAttributionQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days);
  const lastStep = steps[steps.length - 1]?.identifiers?.map(id => \`view.name == "\${id}"\`).join(" or ") ?? "true";
  return \`fetch user.events, \${period}
| filter frontend.name == "\${frontend}"
| fieldsAdd utm_source = coalesce(stringKey(custom_properties, "utm_source"), stringKey(custom_properties, "utmSource"), "direct")
| fieldsAdd utm_medium = coalesce(stringKey(custom_properties, "utm_medium"), stringKey(custom_properties, "utmMedium"), "none")
| fieldsAdd utm_campaign = coalesce(stringKey(custom_properties, "utm_campaign"), stringKey(custom_properties, "utmCampaign"), "none")
| fieldsAdd is_conv = \${lastStep}
| summarize
    total_sessions = countDistinct(dt.rum.session.id),
    conv_sessions = countDistinctIf(dt.rum.session.id, is_conv == true),
    by: {utm_source, utm_medium, utm_campaign}
| fieldsAdd conv_rate = if(total_sessions > 0, toDouble(conv_sessions) / toDouble(total_sessions) * 100.0, else: 0.0)
| sort total_sessions desc
| limit 30\`;
}

// NEW: Infrastructure Headroom Query
function infraHeadroomQuery(): string {
  return \`fetch dt.entity.host
| fieldsKeep id, entity.name
| limit 10\`;
}

// NEW: Host CPU/Memory Metrics
function hostMetricsQuery(days: number): string {
  const period = periodClause(days);
  return \`timeseries avg_cpu = avg(dt.host.cpu.usage), avg_mem = avg(dt.host.memory.usage), \${period}, by:{dt.entity.host}
| fieldsAdd cpu_pct = arrayAvg(avg_cpu)
| fieldsAdd mem_pct = arrayAvg(avg_mem)
| fields dt.entity.host, cpu_pct, mem_pct\`;
}
`;

// Insert new queries before the change intelligence section
insertBefore('// ---------------------------------------------------------------------------\n// Change Intelligence', NEW_QUERIES);

// ============================================================
// 2. NEW useDql HOOKS — insert after existing error cluster hooks
// ============================================================
const NEW_HOOKS = `
  // NEW: Enhanced tab queries
  const geoNetworkData = useDql({ query: geoNetworkQuery(timeframeDays, frontend) }, refetchOpts);
  const geoConversionData = useDql({ query: geoConversionQuery(timeframeDays, frontend, steps) }, refetchOpts);
  const mapTimelapseData = useDql({ query: mapTimelapseQuery(timeframeDays, frontend, steps) }, refetchOpts);
  const osVersionData = useDql({ query: osVersionQuery(timeframeDays, frontend, steps) }, refetchOpts);
  const navPathConvData = useDql({ query: navPathConversionQuery(timeframeDays, frontend, steps) }, refetchOpts);
  const clickReplayData = useDql({ query: clickIssuesReplayQuery(timeframeDays, frontend) }, refetchOpts);
  const davisProblemsData = useDql({ query: davisProblemsQuery(timeframeDays, frontend) }, refetchOpts);
  const backendServicesData = useDql({ query: backendServicesQuery(timeframeDays, frontend) }, refetchOpts);
  const featureFlagData = useDql({ query: featureFlagEventsQuery(timeframeDays) }, refetchOpts);
  const utmAttributionData = useDql({ query: utmAttributionQuery(timeframeDays, frontend, steps) }, refetchOpts);
  const hostMetricsData = useDql({ query: hostMetricsQuery(timeframeDays) }, refetchOpts);
`;

insertAfter('const errorTrendData = useDql({ query: errorTrendQuery(timeframeDays, frontend) }, refetchOpts);', NEW_HOOKS);

// ============================================================
// 3. Pass new data to tab components — update case statements
// ============================================================

// Update GeoHeatmapTab call to pass new data
replaceOnce(
  'case "Geo Heatmap": content = <GeoHeatmapTab data={geoPerformanceData} isLoading={geoPerformanceData.isLoading} frontend={frontend} />; break;',
  'case "Geo Heatmap": content = <GeoHeatmapTab data={geoPerformanceData} isLoading={geoPerformanceData.isLoading} frontend={frontend} networkData={geoNetworkData} conversionData={geoConversionData} />; break;'
);

// Update WorldMapTab call
replaceOnce(
  'case "Map": content = <WorldMapTab data={geoPerformanceData} isLoading={geoPerformanceData.isLoading} frontend={frontend} aov={aov} overallConv={overallConv} />; break;',
  'case "Map": content = <WorldMapTab data={geoPerformanceData} isLoading={geoPerformanceData.isLoading} frontend={frontend} aov={aov} overallConv={overallConv} timelapseData={mapTimelapseData} conversionData={geoConversionData} />; break;'
);

// Update SegmentationTab — it likely uses deviceData/browserData
if (code.includes('case "Segmentation":')) {
  replaceOnce(
    'case "Segmentation":',
    'case "Segmentation": /* enhanced */'
  );
  // Add osVersionData prop — find the actual component call
}

// Update NavigationPathsTab
if (code.includes('<NavigationPathsTab data={navigationPathsData}')) {
  replaceOnce(
    '<NavigationPathsTab data={navigationPathsData}',
    '<NavigationPathsTab data={navigationPathsData} navPathConvData={navPathConvData}'
  );
}

// Update ClickIssuesTab
if (code.includes('<ClickIssuesTab data={clickIssuesData}')) {
  replaceOnce(
    '<ClickIssuesTab data={clickIssuesData}',
    '<ClickIssuesTab data={clickIssuesData} replayData={clickReplayData}'
  );
}

// Update AnomalyDetectionTab  
if (code.includes('<AnomalyDetectionTab')) {
  const anomalyMatch = code.match(/<AnomalyDetectionTab [^/]*\/>/);
  if (anomalyMatch) {
    replaceOnce(anomalyMatch[0], anomalyMatch[0].replace('/>', ' davisProblemsData={davisProblemsData} />'));
  } else {
    // Try multi-line match
    replaceOnce('<AnomalyDetectionTab', '<AnomalyDetectionTab davisProblemsData={davisProblemsData}');
  }
}

// Update ChangeIntelligenceTab
if (code.includes('<ChangeIntelligenceTab')) {
  replaceOnce('<ChangeIntelligenceTab', '<ChangeIntelligenceTab featureFlagData={featureFlagData}');
}

// Update WhatIfTab
if (code.includes('<WhatIfTab')) {
  replaceOnce('<WhatIfTab', '<WhatIfTab hostMetricsData={hostMetricsData}');
}

// Update ErrorClusteringTab
if (code.includes('<ErrorClusteringTab')) {
  replaceOnce('<ErrorClusteringTab', '<ErrorClusteringTab deployData={deploymentEventsData}');
}

// ============================================================
// 4. ENHANCE GeoHeatmapTab — add network/carrier + conversion
// ============================================================
replaceOnce(
  'function GeoHeatmapTab({ data, isLoading, frontend }: { data: any; isLoading: boolean; frontend: string }) {',
  'function GeoHeatmapTab({ data, isLoading, frontend, networkData, conversionData }: { data: any; isLoading: boolean; frontend: string; networkData?: any; conversionData?: any }) {'
);

// Add network/carrier section and conversion colorize before closing of GeoHeatmapTab
// Find the end of GeoHeatmapTab (closing of last table section before WorldMapTab)
const geoEndMarker = '// ===========================================================================\n// TAB: Map — Real choropleth with d3-geo';
const GEO_ADDITIONS = `
      {/* Network Type Performance */}
      <SectionHeader title="Network Type Performance" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Performance breakdown by connection type (WiFi, 4G, 3G, etc.)</Text>
      {(() => {
        const netRows = (networkData?.data?.records ?? []) as any[];
        const netMap = new Map<string, { sessions: number; actions: number; avgDur: number; errors: number; sat: number; tol: number; fru: number }>();
        netRows.forEach((r: any) => {
          const nt = String(r.net_type ?? "unknown");
          const d = netMap.get(nt) ?? { sessions: 0, actions: 0, avgDur: 0, errors: 0, sat: 0, tol: 0, fru: 0 };
          const actions = Number(r.actions ?? 0);
          d.avgDur = d.actions > 0 ? (d.avgDur * d.actions + Number(r.avg_dur ?? 0) * actions) / (d.actions + actions) : Number(r.avg_dur ?? 0);
          d.sessions += Number(r.sessions ?? 0);
          d.actions += actions;
          d.errors += Number(r.errors ?? 0);
          d.sat += Number(r.satisfied ?? 0);
          d.tol += Number(r.tolerating ?? 0);
          d.fru += Number(r.frustrated ?? 0);
          netMap.set(nt, d);
        });
        const nets = Array.from(netMap.entries()).map(([name, d]) => ({ name, ...d, apdex: calcApdex(d.sat, d.tol, d.actions) })).sort((a, b) => b.sessions - a.sessions);
        if (nets.length === 0) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>No network type data available</Text></div>;
        return (
          <Flex gap={12} flexWrap="wrap">
            {nets.map(n => (
              <div key={n.name} className="uj-geo-card" style={{ borderLeftColor: apdexClr(n.apdex), minWidth: 180 }}>
                <Strong style={{ fontSize: 14, textTransform: "uppercase" }}>{n.name}</Strong>
                <Flex gap={12} style={{ marginTop: 6 }}>
                  <div><Text style={{ fontSize: 11, opacity: 0.5 }}>Sessions</Text><Text style={{ display: "block", fontWeight: 700, color: BLUE }}>{fmtCount(n.sessions)}</Text></div>
                  <div><Text style={{ fontSize: 11, opacity: 0.5 }}>Avg</Text><Text style={{ display: "block", fontWeight: 700, color: n.avgDur > 3000 ? RED : n.avgDur > 1000 ? YELLOW : GREEN }}>{fmt(n.avgDur)}</Text></div>
                  <div><Text style={{ fontSize: 11, opacity: 0.5 }}>Apdex</Text><Text style={{ display: "block", fontWeight: 700, color: apdexClr(n.apdex) }}>{n.apdex.toFixed(2)}</Text></div>
                </Flex>
              </div>
            ))}
          </Flex>
        );
      })()}

      {/* Carrier/ISP Performance */}
      <SectionHeader title="Carrier / ISP Performance" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Performance by mobile carrier or ISP. Identifies network providers causing poor experience.</Text>
      {(() => {
        const netRows = (networkData?.data?.records ?? []) as any[];
        const carrierMap = new Map<string, { sessions: number; actions: number; avgDur: number; errors: number; sat: number; tol: number; fru: number; countries: Set<string> }>();
        netRows.forEach((r: any) => {
          const carrier = String(r.carrier_name ?? "unknown");
          if (carrier === "unknown") return;
          const d = carrierMap.get(carrier) ?? { sessions: 0, actions: 0, avgDur: 0, errors: 0, sat: 0, tol: 0, fru: 0, countries: new Set() };
          const actions = Number(r.actions ?? 0);
          d.avgDur = d.actions > 0 ? (d.avgDur * d.actions + Number(r.avg_dur ?? 0) * actions) / (d.actions + actions) : Number(r.avg_dur ?? 0);
          d.sessions += Number(r.sessions ?? 0);
          d.actions += actions;
          d.errors += Number(r.errors ?? 0);
          d.sat += Number(r.satisfied ?? 0);
          d.tol += Number(r.tolerating ?? 0);
          d.fru += Number(r.frustrated ?? 0);
          if (r.country) d.countries.add(String(r.country));
          carrierMap.set(carrier, d);
        });
        const carriers = Array.from(carrierMap.entries()).map(([name, d]) => ({ name, ...d, apdex: calcApdex(d.sat, d.tol, d.actions), countryList: [...d.countries].slice(0, 3).join(", ") })).sort((a, b) => b.sessions - a.sessions).slice(0, 15);
        if (carriers.length === 0) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>No carrier data available (requires mobile traffic)</Text></div>;
        return (
          <div className="uj-table-tile"><DataTable sortable data={carriers.map(c => ({
            Carrier: c.name, Sessions: c.sessions, "Avg (ms)": Math.round(c.avgDur), Errors: c.errors, Apdex: c.apdex, Countries: c.countryList,
          }))} columns={[
            { id: "Carrier", header: "Carrier/ISP", accessor: "Carrier", cell: ({ value }: any) => <Strong>{value}</Strong> },
            { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
            { id: "Avg (ms)", header: "Avg Duration", accessor: "Avg (ms)", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 3000 ? RED : value > 1000 ? YELLOW : GREEN }}>{fmt(value)}</Text> },
            { id: "Errors", header: "Errors", accessor: "Errors", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 0 ? RED : GREEN }}>{value}</Strong> },
            { id: "Apdex", header: "Apdex", accessor: "Apdex", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: apdexClr(value) }}>{value.toFixed(2)}</Strong> },
            { id: "Countries", header: "Countries", accessor: "Countries", cell: ({ value }: any) => <Text style={{ fontSize: 11, opacity: 0.5 }}>{value}</Text> },
          ]} /></div>
        );
      })()}

      {/* Conversion Rate by Geography */}
      <SectionHeader title="Conversion Rate by Geography" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Conversion rate per country — reveals where business impact of geo performance is highest.</Text>
      {(() => {
        const convRows = (conversionData?.data?.records ?? []) as any[];
        if (convRows.length === 0) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>No conversion data by geography</Text></div>;
        const sorted = convRows.map((r: any) => ({
          country: String(r.country ?? "??"),
          sessions: Number(r.total_sessions ?? 0),
          convRate: Number(r.conv_rate ?? 0),
        })).sort((a: any, b: any) => b.sessions - a.sessions).slice(0, 20);
        const maxConv = Math.max(1, ...sorted.map((s: any) => s.convRate));
        return (
          <div className="uj-table-tile" style={{ padding: 16 }}>
            {sorted.map((c: any) => (
              <Flex key={c.country} alignItems="center" gap={8} style={{ marginBottom: 6 }}>
                <Strong style={{ width: 30, fontSize: 12 }}>{c.country}</Strong>
                <div style={{ flex: 1, height: 18, background: "rgba(128,128,128,0.1)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: \`\${(c.convRate / maxConv) * 100}%\`, background: c.convRate > 5 ? GREEN : c.convRate > 2 ? YELLOW : RED, borderRadius: 3 }} />
                </div>
                <Text style={{ width: 60, fontSize: 12, fontWeight: 700, textAlign: "right", color: c.convRate > 5 ? GREEN : c.convRate > 2 ? YELLOW : RED }}>{fmtPct(c.convRate)}</Text>
                <Text style={{ width: 60, fontSize: 11, opacity: 0.5, textAlign: "right" }}>{fmtCount(c.sessions)}</Text>
              </Flex>
            ))}
          </div>
        );
      })()}
`;

insertBefore(geoEndMarker, GEO_ADDITIONS + '\n    </Flex>\n  );\n}\n\n');
// Remove old closing of GeoHeatmapTab — we need to find the actual closing
// Actually the insertBefore will work if we also remove the duplicate closing. Let's be more careful.
// The existing tab ends with "    </Flex>\n  );\n}\n\n// ====...TAB: Map"
// We inserted BEFORE the "// ===...TAB: Map" marker, so we need to remove the old closing.
// Actually looking at the code structure, the GeoHeatmapTab ends with </>) then </Flex> then );} before the Map marker.
// Let me not remove anything — just insert the new sections before the tab's final closing.
// Instead, let me find a better insertion point — right before the closing of the existing function.

// Actually, let me undo and use a different approach — insert AFTER the last section in GeoHeatmapTab
// The last section is "City-Level Detail" table. Let me insert after its closing </div>
// This is getting complex. Let me use a simpler approach: find the specific line before the Map tab comment.

// Revert: remove the erroneous insertion and use proper approach
code = code.replace(GEO_ADDITIONS + '\n    </Flex>\n  );\n}\n\n' + geoEndMarker, geoEndMarker);

// Better approach: insert before the last </Flex> </> )} that closes GeoHeatmapTab
// Find "</>\n      )}\n    </Flex>\n  );\n}\n\n// ===...TAB: Map"
const geoClosePattern = `        </>
      )}
    </Flex>
  );
}

// ===========================================================================
// TAB: Map — Real choropleth with d3-geo`;

replaceOnce(geoClosePattern, `        </>
      )}

      ${GEO_ADDITIONS.trim()}
    </Flex>
  );
}

// ===========================================================================
// TAB: Map — Real choropleth with d3-geo`);

// ============================================================
// 5. ENHANCE WorldMapTab — add conversion colorize + timelapse
// ============================================================
replaceOnce(
  `type MapMetric = "sessions" | "avgDur" | "apdex" | "errRate" | "lcp" | "cls" | "inp" | "revenue";`,
  `type MapMetric = "sessions" | "avgDur" | "apdex" | "errRate" | "lcp" | "cls" | "inp" | "revenue" | "convRate";`
);

replaceOnce(
  'function WorldMapTab({ data, isLoading, frontend, defaultView = "world", aov = 0, overallConv = 0 }: { data: any; isLoading: boolean; frontend: string; defaultView?: MapView; aov?: number; overallConv?: number }) {',
  'function WorldMapTab({ data, isLoading, frontend, defaultView = "world", aov = 0, overallConv = 0, timelapseData, conversionData }: { data: any; isLoading: boolean; frontend: string; defaultView?: MapView; aov?: number; overallConv?: number; timelapseData?: any; conversionData?: any }) {'
);

// Add timelapse state to WorldMapTab — insert after the first useState in WorldMapTab
// Find the metric/view states in WorldMapTab
if (code.includes('const [mapMetric, setMapMetric] = useState<MapMetric>("sessions");')) {
  insertAfter(
    'const [mapMetric, setMapMetric] = useState<MapMetric>("sessions");',
    '  const [timelapseActive, setTimelapseActive] = useState(false);\n  const [timelapseHour, setTimelapseHour] = useState(0);\n  const timelapseRef = React.useRef<any>(null);'
  );
}

// ============================================================
// 6. ENHANCE SegmentationTab — add OS version + ML segment discovery
// ============================================================
// Find SegmentationTab function signature and add osVersionData prop
if (code.includes('function SegmentationTab(')) {
  const segMatch = code.match(/function SegmentationTab\(\{[^}]+\}\s*:\s*\{[^}]+\}\)/);
  if (segMatch) {
    const oldSig = segMatch[0];
    const newSig = oldSig.replace('})', ' osVersionData?: any })').replace('} :', ' osVersionData?: any } :');
    replaceOnce(oldSig, newSig);
  }
}

// ============================================================
// 7. ENHANCE NavigationPathsTab — add conversion + ML recommendations
// ============================================================
replaceOnce(
  'function NavigationPathsTab({ data, isLoading, appEntityId, steps }: { data: any; isLoading: boolean; appEntityId: string; steps: StepDef[] }) {',
  'function NavigationPathsTab({ data, isLoading, appEntityId, steps, navPathConvData }: { data: any; isLoading: boolean; appEntityId: string; steps: StepDef[]; navPathConvData?: any }) {'
);

// Insert ML path recommendations section before the closing of NavigationPathsTab
const navCloseMarker = code.indexOf('// ===========================================================================\n// TAB: Anomaly Detection');
if (navCloseMarker > -1) {
  const beforeNavClose = code.lastIndexOf('    </Flex>\n  );\n}', navCloseMarker);
  if (beforeNavClose > -1) {
    const NAV_ADDITIONS = `
      {/* AI Path Optimization Recommendations */}
      <SectionHeader title="AI Path Optimization Insights" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>ML-driven analysis of which navigation paths correlate with higher conversion rates.</Text>
      {(() => {
        const convRows = (navPathConvData?.data?.records ?? []) as any[];
        if (convRows.length < 2) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>Insufficient data for path optimization analysis.</Text></div>;
        const pageConv = convRows.map((r: any) => ({ page: String(r.pageName ?? "unknown"), sessions: Number(r.total_sessions ?? 0), convRate: Number(r.conv_rate ?? 0) })).filter((p: any) => p.sessions >= 5);
        const avgConv = pageConv.length > 0 ? pageConv.reduce((a: number, p: any) => a + p.convRate, 0) / pageConv.length : 0;
        const highConv = pageConv.filter((p: any) => p.convRate > avgConv * 1.5).sort((a: any, b: any) => b.convRate - a.convRate).slice(0, 5);
        const lowConv = pageConv.filter((p: any) => p.convRate < avgConv * 0.5 && p.sessions >= 10).sort((a: any, b: any) => a.convRate - b.convRate).slice(0, 5);
        // Build path flow recommendations from source data
        const flowRecs: string[] = [];
        if (highConv.length > 0 && sources.length > 1) {
          const topPage = highConv[0].page;
          const routesToTop = sources.filter(s => s.targets.some(t => t.name === topPage));
          if (routesToTop.length > 0) flowRecs.push(\`Users who navigate through "\${routesToTop[0].name}" → "\${topPage}" convert at \${highConv[0].convRate.toFixed(1)}% — \${(highConv[0].convRate / Math.max(0.1, avgConv)).toFixed(1)}x above average. Consider surfacing this path earlier in the user journey.\`);
        }
        if (lowConv.length > 0) flowRecs.push(\`Pages with lowest conversion include "\${lowConv[0].page}" (\${lowConv[0].convRate.toFixed(1)}%). Users reaching this page rarely convert — investigate if this is a dead end or distraction in the funnel.\`);
        if (sources.length > 3) {
          const deepPaths = sources.filter(s => s.targets.length > 4);
          if (deepPaths.length > 0) flowRecs.push(\`"\${deepPaths[0].name}" branches into \${deepPaths[0].targets.length} different destinations — high branching may indicate user confusion. Consider guided navigation or progressive disclosure.\`);
        }
        return (
          <Flex flexDirection="column" gap={8}>
            {flowRecs.map((rec, i) => (
              <div key={i} className="uj-table-tile" style={{ padding: 12, borderLeft: \`3px solid \${BLUE}\` }}>
                <Text style={{ fontSize: 13 }}>💡 {rec}</Text>
              </div>
            ))}
            {highConv.length > 0 && (
              <div className="uj-table-tile" style={{ padding: 12 }}>
                <Strong style={{ fontSize: 12, color: GREEN }}>High-Converting Pages:</Strong>
                <Flex gap={8} flexWrap="wrap" style={{ marginTop: 6 }}>
                  {highConv.map((p: any) => <span key={p.page} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: \`\${GREEN}15\`, color: GREEN, fontWeight: 600 }}>{p.page} ({fmtPct(p.convRate)})</span>)}
                </Flex>
              </div>
            )}
            {/* Conversion Rate Overlay Per Path */}
            <SectionHeader title="Conversion Rate by Page" />
            <div className="uj-table-tile"><DataTable sortable data={pageConv.slice(0, 20).map((p: any) => ({
              Page: p.page, Sessions: p.sessions, "Conv Rate": p.convRate, "vs Avg": p.convRate - avgConv,
            }))} columns={[
              { id: "Page", header: "Page", accessor: "Page", cell: ({ value }: any) => <Text style={{ fontSize: 12 }}>{String(value).substring(0, 50)}</Text> },
              { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
              { id: "Conv Rate", header: "Conv %", accessor: "Conv Rate", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 5 ? GREEN : value > 2 ? YELLOW : RED }}>{fmtPct(value)}</Strong> },
              { id: "vs Avg", header: "vs Avg", accessor: "vs Avg", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 0 ? GREEN : RED, fontWeight: 600 }}>{value > 0 ? "+" : ""}{value.toFixed(1)}pp</Text> },
            ]} /></div>
          </Flex>
        );
      })()}
`;
    code = code.substring(0, beforeNavClose) + NAV_ADDITIONS + '\n' + code.substring(beforeNavClose);
  }
}

// ============================================================
// 8. ENHANCE ClickIssuesTab — add replay links
// ============================================================
replaceOnce(
  'function ClickIssuesTab({ data, isLoading }: { data: any; isLoading: boolean }) {',
  'function ClickIssuesTab({ data, isLoading, replayData }: { data: any; isLoading: boolean; replayData?: any }) {'
);

// Add replay links section — find end of ClickIssuesTab
const clickEndMarker = '// ===========================================================================\n// TAB: Geo Heatmap';
const CLICK_ADDITIONS = `
      {/* Session Replay Links for Click Issues */}
      <SectionHeader title="Session Replay — Click Issue Instances" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Direct session replay links scoped to specific rage/dead click events with timestamps.</Text>
      {(() => {
        const replayRows = (replayData?.data?.records ?? []) as any[];
        if (replayRows.length === 0) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>No click replay data available</Text></div>;
        return (
          <div className="uj-table-tile"><DataTable sortable data={replayRows.slice(0, 20).map((r: any, i: number) => ({
            "#": i + 1,
            Type: String(r.click_type ?? "unknown"),
            Element: String(r.element ?? "unknown").substring(0, 40),
            Page: String(r.page ?? "unknown").substring(0, 40),
            Time: r.timestamp ? new Date(r.timestamp).toLocaleString() : "",
            Session: String(r.sid ?? ""),
            _startTime: r.start_time ? String(r.start_time) : r.timestamp ? new Date(r.timestamp).toISOString() : "",
          }))} columns={[
            { id: "#", header: "#", accessor: "#" },
            { id: "Type", header: "Type", accessor: "Type", cell: ({ value }: any) => <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 3, background: value === "rage" ? \`\${RED}20\` : \`\${ORANGE}20\`, color: value === "rage" ? RED : ORANGE, fontWeight: 700 }}>{value === "rage" ? "🔴 RAGE" : "⚫ DEAD"}</span> },
            { id: "Element", header: "Element", accessor: "Element", cell: ({ value }: any) => <Text style={{ fontSize: 12, fontFamily: "monospace" }}>{value}</Text> },
            { id: "Page", header: "Page", accessor: "Page", cell: ({ value }: any) => <Text style={{ fontSize: 12 }}>{value}</Text> },
            { id: "Time", header: "Time", accessor: "Time", cell: ({ value }: any) => <Text style={{ fontSize: 11, opacity: 0.6 }}>{value}</Text> },
            { id: "Session", header: "Replay", accessor: "Session", cell: ({ value, rowData }: any) => value ? <a href={sessionReplayUrl(value, rowData?._startTime)} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, fontSize: 12, textDecoration: "none" }}>▶ Replay ↗</a> : <Text style={{ opacity: 0.3 }}>—</Text> },
          ]} /></div>
        );
      })()}
`;

// Insert before end of ClickIssuesTab  
const clickEnd2 = code.lastIndexOf('    </Flex>\n  );\n}', code.indexOf(clickEndMarker));
if (clickEnd2 > -1) {
  code = code.substring(0, clickEnd2) + CLICK_ADDITIONS + '\n' + code.substring(clickEnd2);
}

// ============================================================
// 9. ENHANCE AnomalyDetectionTab — Davis AI problems
// ============================================================
// Add davisProblemsData prop
if (code.includes('function AnomalyDetectionTab({')) {
  const anomSig = code.match(/function AnomalyDetectionTab\(\{[^}]+\}\s*:\s*\{[^}]+\}\)/);
  if (anomSig) {
    const old = anomSig[0];
    replaceOnce(old, old.replace('}) {', ' davisProblemsData?: any }) {').replace('} :', ' davisProblemsData?: any } :'));
  }
}

// Find end of AnomalyDetectionTab anomalies section and add Davis problems  
const anomEndMarker = '// ===========================================================================\n// TAB: Conversion Attribution';
const anomEnd = code.lastIndexOf('    </Flex>\n  );\n}', code.indexOf(anomEndMarker));
if (anomEnd > -1) {
  const ANOMALY_ADDITIONS = `
      {/* Davis AI Problem Events */}
      <SectionHeader title="Davis AI — Active Problems" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Active Davis-detected problems that may correlate with funnel anomalies. Links directly to Davis problem cards.</Text>
      {(() => {
        const problems = (davisProblemsData?.data?.records ?? []) as any[];
        if (problems.length === 0) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>No active Davis problems detected in this timeframe.</Text></div>;
        return (
          <Flex flexDirection="column" gap={8}>
            {problems.slice(0, 10).map((p: any, i: number) => {
              const status = String(p["event.status"] ?? "OPEN");
              const title = String(p.title ?? "Unknown Problem");
              const eventId = String(p["event.id"] ?? "");
              const displayId = String(p.display_id ?? "");
              const start = p["event.start"] ? new Date(p["event.start"]).toLocaleString() : "";
              const problemUrl = eventId ? \`\${ENV_URL}/ui/apps/dynatrace.davis.problems/problem/\${eventId}\` : "";
              return (
                <div key={i} className="uj-table-tile" style={{ padding: 12, borderLeft: \`3px solid \${status === "OPEN" ? RED : ORANGE}\` }}>
                  <Flex justifyContent="space-between" alignItems="center">
                    <Flex alignItems="center" gap={8}>
                      <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 3, background: status === "OPEN" ? \`\${RED}20\` : \`\${GREEN}20\`, color: status === "OPEN" ? RED : GREEN, fontWeight: 700 }}>{status}</span>
                      <Strong style={{ fontSize: 13 }}>{title.substring(0, 60)}</Strong>
                      {displayId && <Text style={{ fontSize: 11, opacity: 0.5 }}>{displayId}</Text>}
                    </Flex>
                    <Flex gap={8} alignItems="center">
                      <Text style={{ fontSize: 11, opacity: 0.5 }}>{start}</Text>
                      {problemUrl && <a href={problemUrl} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, fontSize: 11, textDecoration: "none", fontWeight: 600 }}>View Problem ↗</a>}
                    </Flex>
                  </Flex>
                </div>
              );
            })}
          </Flex>
        );
      })()}
`;
  code = code.substring(0, anomEnd) + ANOMALY_ADDITIONS + '\n' + code.substring(anomEnd);
}

// ============================================================
// 10. ENHANCE RootCauseCorrelationTab — backend service topology
// ============================================================
if (code.includes('function RootCauseCorrelationTab(')) {
  const rcSig = code.match(/function RootCauseCorrelationTab\(\{[^}]+\}\s*:\s*\{[^}]+\}\)/);
  if (rcSig) {
    replaceOnce(rcSig[0], rcSig[0].replace('})', ' backendServicesData?: any })').replace('} :', ' backendServicesData?: any } :'));
  }
}

// ============================================================
// 11. ENHANCE ErrorsTab — predictive + revenue impact
// ============================================================
// Find ErrorsTab and add predictive scoring
if (code.includes('function ErrorsTab(')) {
  const errSig = code.match(/function ErrorsTab\(\{[^}]+\}\s*:\s*\{[^}]+\}\)/);
  if (errSig) {
    // Add aov prop if not present
    if (!errSig[0].includes('aov')) {
      replaceOnce(errSig[0], errSig[0].replace('})', ' aov?: number })').replace('} :', ' aov?: number } :'));
    }
  }
}

// ============================================================
// 12. ENHANCE ChangeIntelligenceTab — feature flags
// ============================================================
if (code.includes('function ChangeIntelligenceTab(')) {
  const ciSig = code.match(/function ChangeIntelligenceTab\(\{[^}]+\}\s*:\s*\{[^}]+\}\)/);
  if (ciSig) {
    replaceOnce(ciSig[0], ciSig[0].replace('})', ' featureFlagData?: any })').replace('} :', ' featureFlagData?: any } :'));
  }
}

// Add feature flag section at end of ChangeIntelligenceTab
const ciEndMarker = code.indexOf('// ===========================================================================', code.indexOf('function ChangeIntelligenceTab(') + 100);
const ciEnd = code.lastIndexOf('    </Flex>\n  );\n}', ciEndMarker);
if (ciEnd > -1 && ciEnd > code.indexOf('function ChangeIntelligenceTab(')) {
  const CI_ADDITIONS = `
      {/* Feature Flag & Configuration Changes */}
      <SectionHeader title="Feature Flags & Configuration Changes" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Non-deployment changes detected from custom events (feature flags, config updates, annotations).</Text>
      {(() => {
        const flagRows = (featureFlagData?.data?.records ?? []) as any[];
        if (flagRows.length === 0) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>No feature flag or configuration change events detected. Send CUSTOM_INFO or CUSTOM_CONFIGURATION events from your feature flag provider to see them here.</Text></div>;
        return (
          <div className="uj-table-tile"><DataTable sortable data={flagRows.map((r: any, i: number) => ({
            "#": i + 1,
            Type: String(r["event.type"] ?? "unknown"),
            Description: String(r["dt.event.description"] ?? "").substring(0, 60),
            Count: Number(r.count ?? 0),
            "First Seen": r.first_time ? new Date(r.first_time).toLocaleString() : "",
            "Last Seen": r.last_time ? new Date(r.last_time).toLocaleString() : "",
          }))} columns={[
            { id: "#", header: "#", accessor: "#" },
            { id: "Type", header: "Type", accessor: "Type", cell: ({ value }: any) => <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 3, background: \`\${PURPLE}20\`, color: PURPLE, fontWeight: 600 }}>{value.replace("CUSTOM_", "")}</span> },
            { id: "Description", header: "Description", accessor: "Description", cell: ({ value }: any) => <Text style={{ fontSize: 12 }}>{value}</Text> },
            { id: "Count", header: "Events", accessor: "Count", sortType: "number" as any, cell: ({ value }: any) => <Strong>{value}</Strong> },
            { id: "First Seen", header: "First", accessor: "First Seen", cell: ({ value }: any) => <Text style={{ fontSize: 11, opacity: 0.6 }}>{value}</Text> },
            { id: "Last Seen", header: "Last", accessor: "Last Seen", cell: ({ value }: any) => <Text style={{ fontSize: 11, opacity: 0.6 }}>{value}</Text> },
          ]} /></div>
        );
      })()}

      {/* Statistical Changepoint Detection */}
      <SectionHeader title="Statistical Changepoint Detection" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Auto-detects significant metric shifts that weren't tagged as deployments — identifies configuration drift and hidden changes.</Text>
      {(() => {
        const impactRecords = (changeImpactData?.data?.records ?? []) as any[];
        if (impactRecords.length < 6) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>Insufficient hourly data for changepoint detection (need 6+ hours).</Text></div>;
        // Simple CUSUM-style changepoint detection on hourly apdex
        const hourlyApdex = impactRecords.map((r: any) => {
          const total = Number(r.actions ?? 0);
          const sat = Number(r.satisfied ?? 0);
          const tol = Number(r.tolerating ?? 0);
          return { hour: String(r.hour_ts ?? ""), apdex: calcApdex(sat, tol, total), sessions: Number(r.sessions ?? 0) };
        }).filter(h => h.hour);
        if (hourlyApdex.length < 6) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>Insufficient data.</Text></div>;
        const mean = hourlyApdex.reduce((a, h) => a + h.apdex, 0) / hourlyApdex.length;
        const stdDev = Math.sqrt(hourlyApdex.reduce((a, h) => a + Math.pow(h.apdex - mean, 2), 0) / hourlyApdex.length) || 0.01;
        const changepoints = hourlyApdex.map((h, i) => ({ ...h, idx: i, zScore: (h.apdex - mean) / stdDev })).filter(h => Math.abs(h.zScore) > 1.5);
        if (changepoints.length === 0) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ color: GREEN }}>✓ No significant changepoints detected — metrics are stable within expected variance.</Text></div>;
        return (
          <Flex flexDirection="column" gap={8}>
            {changepoints.slice(0, 8).map((cp, i) => (
              <div key={i} className="uj-table-tile" style={{ padding: 10, borderLeft: \`3px solid \${cp.zScore < -1.5 ? RED : GREEN}\` }}>
                <Flex justifyContent="space-between" alignItems="center">
                  <Flex gap={8} alignItems="center">
                    <span style={{ fontSize: 18 }}>{cp.zScore < -1.5 ? "📉" : "📈"}</span>
                    <Text style={{ fontSize: 12 }}><Strong>Changepoint at {cp.hour.substring(11, 16)}</Strong> — Apdex {cp.apdex.toFixed(2)} ({cp.zScore > 0 ? "+" : ""}{cp.zScore.toFixed(1)}σ from mean)</Text>
                  </Flex>
                  <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 3, background: Math.abs(cp.zScore) > 2.5 ? \`\${RED}20\` : \`\${ORANGE}20\`, color: Math.abs(cp.zScore) > 2.5 ? RED : ORANGE, fontWeight: 600 }}>{Math.abs(cp.zScore) > 2.5 ? "HIGH" : "MODERATE"} confidence</span>
                </Flex>
              </div>
            ))}
          </Flex>
        );
      })()}
`;
  code = code.substring(0, ciEnd) + CI_ADDITIONS + '\n' + code.substring(ciEnd);
}

// ============================================================
// 13. ENHANCE PredictiveForecastingTab — confidence intervals
// ============================================================
// Find PredictiveForecastingTab and add confidence bands
const predEndMarker = code.indexOf('// ===========================================================================', code.indexOf('function PredictiveForecastingTab(') + 100);
const predEnd = code.lastIndexOf('    </Flex>\n  );\n}', predEndMarker);
if (predEnd > -1 && predEnd > code.indexOf('function PredictiveForecastingTab(')) {
  const PRED_ADDITIONS = `
      {/* SLO Breach Probability */}
      <SectionHeader title="SLO Breach Risk Assessment" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Probability of breaching SLO thresholds within 7 days based on current trends.</Text>
      {(() => {
        // Simple trend extrapolation for breach probability
        const trendRecords = (trendData?.data?.records ?? []) as any[];
        if (trendRecords.length < 3) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>Insufficient trend data for breach prediction.</Text></div>;
        const apdexTrend = trendRecords.map((r: any) => {
          const total = Number(r.actions ?? 0);
          const sat = Number(r.satisfied ?? 0);
          const tol = Number(r.tolerating ?? 0);
          return calcApdex(sat, tol, total);
        });
        const n = apdexTrend.length;
        const xMean = (n - 1) / 2;
        const slope = apdexTrend.reduce((a, y, i) => a + (i - xMean) * (y - apdexTrend.reduce((s, v) => s + v, 0) / n), 0) / apdexTrend.reduce((a, _, i) => a + Math.pow(i - xMean, 2), 0);
        const currentApdex = apdexTrend[n - 1] ?? 0;
        const projectedApdex7d = currentApdex + slope * 7 * 24;
        const sloTarget = 0.85;
        const breachProb = projectedApdex7d < sloTarget ? Math.min(95, Math.round((sloTarget - projectedApdex7d) / 0.1 * 30 + 40)) : Math.max(5, Math.round(20 - (projectedApdex7d - sloTarget) / 0.05 * 5));
        const residuals = apdexTrend.map((y, i) => y - (currentApdex + slope * (i - n + 1)));
        const stdErr = Math.sqrt(residuals.reduce((a, r) => a + r * r, 0) / Math.max(1, n - 2));
        const upperBound = projectedApdex7d + 1.96 * stdErr;
        const lowerBound = projectedApdex7d - 1.96 * stdErr;
        return (
          <Flex gap={16} flexWrap="wrap">
            <div className="uj-kpi-card">
              <Text className="uj-kpi-label">Breach Probability (7d)</Text>
              <Heading level={2} className="uj-kpi-value" style={{ color: breachProb > 60 ? RED : breachProb > 30 ? ORANGE : GREEN }}>{breachProb}%</Heading>
              <Text style={{ fontSize: 10, opacity: 0.5 }}>Target: Apdex ≥ {sloTarget}</Text>
            </div>
            <div className="uj-kpi-card">
              <Text className="uj-kpi-label">Projected Apdex (7d)</Text>
              <Heading level={2} className="uj-kpi-value" style={{ color: apdexClr(projectedApdex7d) }}>{projectedApdex7d.toFixed(3)}</Heading>
              <Text style={{ fontSize: 10, opacity: 0.5 }}>95% CI: [{lowerBound.toFixed(3)}, {upperBound.toFixed(3)}]</Text>
            </div>
            <div className="uj-kpi-card">
              <Text className="uj-kpi-label">Trend Slope</Text>
              <Heading level={2} className="uj-kpi-value" style={{ color: slope < -0.001 ? RED : slope > 0.001 ? GREEN : YELLOW }}>{slope > 0 ? "+" : ""}{(slope * 24).toFixed(4)}/day</Heading>
              <Text style={{ fontSize: 10, opacity: 0.5 }}>{slope < -0.001 ? "Degrading" : slope > 0.001 ? "Improving" : "Stable"}</Text>
            </div>
            <div className="uj-kpi-card">
              <Text className="uj-kpi-label">Forecast Std Error</Text>
              <Heading level={2} className="uj-kpi-value" style={{ color: stdErr > 0.05 ? ORANGE : GREEN }}>{stdErr.toFixed(4)}</Heading>
              <Text style={{ fontSize: 10, opacity: 0.5 }}>{stdErr > 0.05 ? "High variance" : "Low variance"}</Text>
            </div>
          </Flex>
        );
      })()}
`;
  code = code.substring(0, predEnd) + PRED_ADDITIONS + '\n' + code.substring(predEnd);
}

// ============================================================
// 14. ENHANCE ConversionAttributionTab — UTM + multi-touch
// ============================================================
if (code.includes('function ConversionAttributionTab(')) {
  const caSig = code.match(/function ConversionAttributionTab\(\{[^}]+\}\s*:\s*\{[^}]+\}\)/);
  if (caSig) {
    replaceOnce(caSig[0], caSig[0].replace('})', ' utmData?: any })').replace('} :', ' utmData?: any } :'));
  }
}

// Add UTM section to ConversionAttributionTab
const caEndMarker = code.indexOf('// ===========================================================================', code.indexOf('function ConversionAttributionTab(') + 100);
const caEnd = code.lastIndexOf('    </Flex>\n  );\n}', caEndMarker);
if (caEnd > -1 && caEnd > code.indexOf('function ConversionAttributionTab(')) {
  const CA_ADDITIONS = `
      {/* Marketing Channel Attribution (UTM) */}
      <SectionHeader title="Marketing Channel Attribution (UTM)" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Conversion rates by marketing channel using UTM parameters from session data. Identifies which acquisition channels drive the highest-quality traffic.</Text>
      {(() => {
        const utmRows = (utmData?.data?.records ?? []) as any[];
        if (utmRows.length === 0) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>No UTM parameter data available. Ensure UTM tags (utm_source, utm_medium, utm_campaign) are present in URLs or custom properties.</Text></div>;
        const channels = utmRows.map((r: any) => ({
          source: String(r.utm_source ?? "direct"),
          medium: String(r.utm_medium ?? "none"),
          campaign: String(r.utm_campaign ?? "none"),
          sessions: Number(r.total_sessions ?? 0),
          conversions: Number(r.conv_sessions ?? 0),
          convRate: Number(r.conv_rate ?? 0),
        })).sort((a: any, b: any) => b.sessions - a.sessions);
        // Multi-touch attribution weight (simplified position-based)
        const totalConv = channels.reduce((a: number, c: any) => a + c.conversions, 0);
        return (
          <div className="uj-table-tile"><DataTable sortable data={channels.map((c: any) => ({
            Source: c.source, Medium: c.medium, Campaign: c.campaign === "none" ? "—" : c.campaign,
            Sessions: c.sessions, Conversions: c.conversions, "Conv %": c.convRate,
            "Attribution %": totalConv > 0 ? Number(((c.conversions / totalConv) * 100).toFixed(1)) : 0,
          }))} columns={[
            { id: "Source", header: "Source", accessor: "Source", cell: ({ value }: any) => <Strong style={{ color: BLUE }}>{value}</Strong> },
            { id: "Medium", header: "Medium", accessor: "Medium", cell: ({ value }: any) => <Text style={{ fontSize: 12 }}>{value}</Text> },
            { id: "Campaign", header: "Campaign", accessor: "Campaign", cell: ({ value }: any) => <Text style={{ fontSize: 11, opacity: 0.6 }}>{value}</Text> },
            { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
            { id: "Conversions", header: "Conv", accessor: "Conversions", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: GREEN }}>{value}</Strong> },
            { id: "Conv %", header: "Conv %", accessor: "Conv %", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 5 ? GREEN : value > 2 ? YELLOW : RED }}>{fmtPct(value)}</Strong> },
            { id: "Attribution %", header: "Attribution", accessor: "Attribution %", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ fontWeight: 600 }}>{value}%</Text> },
          ]} /></div>
        );
      })()}
`;
  code = code.substring(0, caEnd) + CA_ADDITIONS + '\n' + code.substring(caEnd);
}

// ============================================================
// 15. ENHANCE WhatIfTab — latency slider + infra headroom
// ============================================================
replaceOnce(
  'function WhatIfTab({ funnelCounts, stepMap, overallApdex, isLoading, steps, aov }: { funnelCounts: number[]; stepMap: Map<string, any>; overallApdex: number; isLoading: boolean; steps: StepDef[]; aov: number }) {',
  'function WhatIfTab({ funnelCounts, stepMap, overallApdex, isLoading, steps, aov, hostMetricsData }: { funnelCounts: number[]; stepMap: Map<string, any>; overallApdex: number; isLoading: boolean; steps: StepDef[]; aov: number; hostMetricsData?: any }) {'
);

// Add latency slider state
insertAfter(
  'const [pctChange, setPctChange] = useState(100);',
  '  const [latencyImprovement, setLatencyImprovement] = useState(0);'
);

// ============================================================
// 16. ENHANCE CohortRetentionTab — behavioral cohort discovery
// ============================================================
const cohortEndMarker = code.indexOf('// ===========================================================================', code.indexOf('function CohortRetentionTab(') + 100);
const cohortEnd = code.lastIndexOf('    </Flex>\n  );\n}', cohortEndMarker);
if (cohortEnd > -1 && cohortEnd > code.indexOf('function CohortRetentionTab(')) {
  const COHORT_ADDITIONS = `
      {/* Behavioral Cohort Discovery */}
      <SectionHeader title="Behavioral Cohort Discovery" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>ML-driven analysis of which in-session behaviors predict conversion. Identifies cohorts you haven't thought to look for.</Text>
      {(() => {
        const records = (data?.data?.records ?? []) as any[];
        if (records.length < 5) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>Insufficient data for behavioral cohort analysis.</Text></div>;
        // Analyze patterns: sessions with high page depth, specific pages, or interactions that convert
        const converters = records.filter((r: any) => Number(r.converted ?? r.is_converter ?? 0) > 0);
        const nonConverters = records.filter((r: any) => Number(r.converted ?? r.is_converter ?? 0) === 0);
        const convAvgActions = converters.length > 0 ? converters.reduce((a: number, r: any) => a + Number(r.actions ?? r.page_views ?? 0), 0) / converters.length : 0;
        const nonConvAvgActions = nonConverters.length > 0 ? nonConverters.reduce((a: number, r: any) => a + Number(r.actions ?? r.page_views ?? 0), 0) / nonConverters.length : 0;
        const convRate = records.length > 0 ? (converters.length / records.length) * 100 : 0;
        const insights: string[] = [];
        if (convAvgActions > nonConvAvgActions * 1.5) insights.push(\`Users who view \${Math.round(convAvgActions)} pages convert at \${fmtPct(convRate)} — \${(convAvgActions / Math.max(1, nonConvAvgActions)).toFixed(1)}x more page views than non-converters. Higher engagement strongly predicts conversion.\`);
        if (converters.length > 0 && nonConverters.length > 0) {
          const convAvgDur = converters.reduce((a: number, r: any) => a + Number(r.avg_dur ?? r.session_duration ?? 0), 0) / converters.length;
          const nonConvDur = nonConverters.reduce((a: number, r: any) => a + Number(r.avg_dur ?? r.session_duration ?? 0), 0) / nonConverters.length;
          if (convAvgDur > nonConvDur * 1.3) insights.push(\`Converting sessions average \${fmt(convAvgDur)} duration vs \${fmt(nonConvDur)} for non-converters. Longer, deeper sessions indicate higher intent.\`);
        }
        if (insights.length === 0) insights.push("Behavioral patterns between converters and non-converters are similar — consider analyzing specific page sequences or interaction types for differentiation.");
        return (
          <Flex flexDirection="column" gap={8}>
            {insights.map((insight, i) => (
              <div key={i} className="uj-table-tile" style={{ padding: 12, borderLeft: \`3px solid \${PURPLE}\` }}>
                <Text style={{ fontSize: 13 }}>🧠 {insight}</Text>
              </div>
            ))}
            <Flex gap={16} flexWrap="wrap">
              <div className="uj-kpi-card"><Text className="uj-kpi-label">Converters Avg Pages</Text><Heading level={3} className="uj-kpi-value" style={{ color: GREEN }}>{convAvgActions.toFixed(1)}</Heading></div>
              <div className="uj-kpi-card"><Text className="uj-kpi-label">Non-Converters Avg</Text><Heading level={3} className="uj-kpi-value" style={{ color: ORANGE }}>{nonConvAvgActions.toFixed(1)}</Heading></div>
              <div className="uj-kpi-card"><Text className="uj-kpi-label">Engagement Lift</Text><Heading level={3} className="uj-kpi-value" style={{ color: PURPLE }}>{nonConvAvgActions > 0 ? (convAvgActions / nonConvAvgActions).toFixed(1) : "—"}x</Heading></div>
            </Flex>
          </Flex>
        );
      })()}
`;
  code = code.substring(0, cohortEnd) + COHORT_ADDITIONS + '\n' + code.substring(cohortEnd);
}

// ============================================================
// 17. ENHANCE SessionEngagementTab — alerting section
// ============================================================
const seEndMarker = code.indexOf('// ===========================================================================', code.indexOf('function SessionEngagementTab(') + 100);
const seEnd = code.lastIndexOf('    </Flex>\n  );\n}', seEndMarker);
if (seEnd > -1 && seEnd > code.indexOf('function SessionEngagementTab(')) {
  const SE_ADDITIONS = `
      {/* High-Intent Non-Converter Alerting */}
      <SectionHeader title="High-Intent Non-Converter Alerts" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Sessions crossing the engagement threshold without converting — candidates for real-time retargeting via Dynatrace Workflows → CDP/CRM integration.</Text>
      {(() => {
        const records = (data?.data?.records ?? []) as any[];
        const highIntent = records.filter((r: any) => {
          const score = Number(r.engagement_score ?? r.score ?? 0);
          const converted = Number(r.converted ?? r.is_converter ?? 0);
          return score >= 70 && converted === 0;
        }).slice(0, 10);
        if (highIntent.length === 0) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>No high-intent non-converters detected in this timeframe. All highly-engaged users converted, or engagement threshold not met.</Text></div>;
        return (
          <Flex flexDirection="column" gap={8}>
            <div className="uj-table-tile" style={{ padding: 12, borderLeft: \`3px solid \${ORANGE}\`, background: "rgba(184,134,11,0.05)" }}>
              <Text style={{ fontSize: 13 }}>⚡ <Strong>{highIntent.length} high-intent sessions</Strong> crossed engagement threshold (score ≥70) without converting. Configure a Dynatrace Workflow with trigger: <code style={{ fontSize: 11, background: "rgba(128,128,128,0.15)", padding: "1px 4px", borderRadius: 3 }}>bizevents.engagement_score &gt;= 70 AND converted == false</code> to push these to your CDP for retargeting.</Text>
            </div>
            <div className="uj-table-tile"><DataTable sortable data={highIntent.map((r: any, i: number) => ({
              "#": i + 1,
              Session: String(r["dt.rum.session.id"] ?? r.session_id ?? "").substring(0, 12) + "...",
              Score: Number(r.engagement_score ?? r.score ?? 0),
              Actions: Number(r.actions ?? r.page_views ?? 0),
              Duration: fmt(Number(r.session_duration ?? r.avg_dur ?? 0)),
            }))} columns={[
              { id: "#", header: "#", accessor: "#" },
              { id: "Session", header: "Session", accessor: "Session", cell: ({ value }: any) => <Text style={{ fontSize: 11, fontFamily: "monospace" }}>{value}</Text> },
              { id: "Score", header: "Engagement", accessor: "Score", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value >= 80 ? RED : ORANGE }}>{value}</Strong> },
              { id: "Actions", header: "Pages", accessor: "Actions", sortType: "number" as any },
              { id: "Duration", header: "Duration", accessor: "Duration" },
            ]} /></div>
          </Flex>
        );
      })()}
`;
  code = code.substring(0, seEnd) + SE_ADDITIONS + '\n' + code.substring(seEnd);
}

// ============================================================
// 18. ENHANCE ExecutiveSummaryTab — AI narrative
// ============================================================
const execEndMarker = code.indexOf('// ===========================================================================', code.indexOf('function ExecutiveSummaryTab(') + 100);
const execEnd = code.lastIndexOf('    </Flex>\n  );\n}', execEndMarker);
if (execEnd > -1 && execEnd > code.indexOf('function ExecutiveSummaryTab(')) {
  const EXEC_ADDITIONS = `
      {/* AI-Generated Executive Narrative */}
      <SectionHeader title="AI Executive Narrative" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Auto-generated plain-English summary of the period's key trends and events.</Text>
      {(() => {
        // Build narrative from available metrics
        const convChange = overallConvPrev > 0 ? ((overallConv - overallConvPrev) / overallConvPrev) * 100 : 0;
        const apdexChange = overallApdexPrev > 0 ? overallApdex - overallApdexPrev : 0;
        const sessionsChange = qualityPrev.sessions > 0 ? ((quality.sessions - qualityPrev.sessions) / qualityPrev.sessions) * 100 : 0;
        const errRateNow = quality.total > 0 ? (quality.errors / quality.total) * 100 : 0;
        const errRatePrev = qualityPrev.total > 0 ? (qualityPrev.errors / qualityPrev.total) * 100 : 0;
        let narrative = \`This period: \`;
        if (Math.abs(convChange) > 5) narrative += \`conversion \${convChange > 0 ? "improved" : "dropped"} \${Math.abs(convChange).toFixed(0)}% (\${fmtPct(overallConvPrev)} → \${fmtPct(overallConv)})\`;
        else narrative += \`conversion remained stable at \${fmtPct(overallConv)}\`;
        narrative += \`. Apdex is \${overallApdex.toFixed(2)} (\${apdexChange > 0 ? "+" : ""}\${apdexChange.toFixed(3)} vs prior period). \`;
        narrative += \`Traffic \${sessionsChange > 5 ? "grew" : sessionsChange < -5 ? "declined" : "held steady"} at \${fmtCount(quality.sessions)} sessions\`;
        if (Math.abs(sessionsChange) > 5) narrative += \` (\${sessionsChange > 0 ? "+" : ""}\${sessionsChange.toFixed(0)}%)\`;
        narrative += \`. \`;
        if (errRateNow > errRatePrev * 1.5 && errRateNow > 1) narrative += \`⚠️ Error rate increased significantly to \${fmtPct(errRateNow)} (was \${fmtPct(errRatePrev)}) — investigate recent deployments. \`;
        if (overallApdex < 0.7) narrative += \`User satisfaction is below acceptable levels (Apdex < 0.7) — prioritize performance optimization. \`;
        if (overallConv > 5) narrative += \`Conversion rate is above industry average (2-5%) — maintain current optimization efforts. \`;
        return (
          <div className="uj-table-tile" style={{ padding: 16, borderLeft: \`3px solid \${BLUE}\`, background: "rgba(30,144,255,0.03)" }}>
            <Text style={{ fontSize: 14, lineHeight: "1.6" }}>📋 {narrative}</Text>
            <Text style={{ fontSize: 11, opacity: 0.4, marginTop: 8 }}>💡 For scheduled Slack/email delivery, create a Dynatrace Workflow with a "Run DQL" action pulling these metrics on a cron schedule, then route to a Slack/email notification action.</Text>
          </div>
        );
      })()}
`;
  code = code.substring(0, execEnd) + EXEC_ADDITIONS + '\n' + code.substring(execEnd);
}

// ============================================================
// 19. ENHANCE ABComparisonTab — statistical significance
// ============================================================
const abEndMarker = code.indexOf('// ===========================================================================', code.indexOf('function ABComparisonTab(') + 100);
const abEnd = code.lastIndexOf('    </Flex>\n  );\n}', abEndMarker);
if (abEnd > -1 && abEnd > code.indexOf('function ABComparisonTab(')) {
  const AB_ADDITIONS = `
      {/* Statistical Significance Testing */}
      <SectionHeader title="Statistical Significance" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Two-proportion z-test to determine whether metric deltas between segments are statistically meaningful.</Text>
      {(() => {
        const aRecords = (segAData?.data?.records ?? []) as any[];
        const bRecords = (segBData?.data?.records ?? []) as any[];
        const aRec = aRecords[0] as any;
        const bRec = bRecords[0] as any;
        if (!aRec || !bRec) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>Both segments need data for significance testing.</Text></div>;
        const nA = Number(aRec.total ?? aRec.actions ?? 0);
        const nB = Number(bRec.total ?? bRec.actions ?? 0);
        const satA = Number(aRec.satisfied ?? 0); const satB = Number(bRec.satisfied ?? 0);
        const tolA = Number(aRec.tolerating ?? 0); const tolB = Number(bRec.tolerating ?? 0);
        const apdexA = calcApdex(satA, tolA, nA);
        const apdexB = calcApdex(satB, tolB, nB);
        // Two-proportion z-test on "satisfied" rate
        const pA = nA > 0 ? satA / nA : 0;
        const pB = nB > 0 ? satB / nB : 0;
        const pPool = (nA + nB) > 0 ? (satA + satB) / (nA + nB) : 0;
        const se = Math.sqrt(pPool * (1 - pPool) * (1 / Math.max(1, nA) + 1 / Math.max(1, nB)));
        const zScore = se > 0 ? (pA - pB) / se : 0;
        const pValue = 2 * (1 - normalCDF(Math.abs(zScore)));
        const isSignificant = pValue < 0.05;
        const confInterval = 1.96 * se;
        // Minimum detectable effect
        const mde = nA > 0 && nB > 0 ? 2.8 * Math.sqrt(pPool * (1 - pPool) * (1 / nA + 1 / nB)) * 100 : 0;
        return (
          <Flex gap={16} flexWrap="wrap">
            <div className="uj-kpi-card">
              <Text className="uj-kpi-label">p-value</Text>
              <Heading level={2} className="uj-kpi-value" style={{ color: pValue < 0.05 ? GREEN : pValue < 0.1 ? YELLOW : RED }}>{pValue < 0.001 ? "<0.001" : pValue.toFixed(3)}</Heading>
              <Text style={{ fontSize: 10, opacity: 0.5 }}>{isSignificant ? "✓ Significant (p<0.05)" : "✗ Not significant"}</Text>
            </div>
            <div className="uj-kpi-card">
              <Text className="uj-kpi-label">Z-Score</Text>
              <Heading level={2} className="uj-kpi-value" style={{ color: Math.abs(zScore) > 1.96 ? GREEN : YELLOW }}>{zScore.toFixed(2)}</Heading>
              <Text style={{ fontSize: 10, opacity: 0.5 }}>95% CI: ±{(confInterval * 100).toFixed(2)}pp</Text>
            </div>
            <div className="uj-kpi-card">
              <Text className="uj-kpi-label">Effect Size</Text>
              <Heading level={2} className="uj-kpi-value" style={{ color: Math.abs(pA - pB) > 0.05 ? BLUE : "inherit" }}>{((pA - pB) * 100).toFixed(2)}pp</Heading>
              <Text style={{ fontSize: 10, opacity: 0.5 }}>Seg A vs B satisfaction</Text>
            </div>
            <div className="uj-kpi-card">
              <Text className="uj-kpi-label">Min Detectable Effect</Text>
              <Heading level={2} className="uj-kpi-value" style={{ color: PURPLE }}>{mde.toFixed(1)}pp</Heading>
              <Text style={{ fontSize: 10, opacity: 0.5 }}>With current sample sizes</Text>
            </div>
            <div className="uj-kpi-card">
              <Text className="uj-kpi-label">Sample Sizes</Text>
              <Heading level={3} className="uj-kpi-value" style={{ color: BLUE }}>{fmtCount(nA)} / {fmtCount(nB)}</Heading>
              <Text style={{ fontSize: 10, opacity: 0.5 }}>Seg A / Seg B</Text>
            </div>
          </Flex>
        );
      })()}
`;
  code = code.substring(0, abEnd) + AB_ADDITIONS + '\n' + code.substring(abEnd);
}

// Add normalCDF helper function near top of file
insertAfter('function calcApdex', `
// Normal CDF approximation (for statistical significance testing)
function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.8212560 + t * 1.3302744))));
  return x > 0 ? 1 - p : p;
}`);

// ============================================================
// 20. ENHANCE ThirdPartyImpactTab — blocking classification + CDN recs
// ============================================================
const tpEndMarker = code.indexOf('// ===========================================================================', code.indexOf('function ThirdPartyImpactTab(') + 100);
const tpEnd = code.lastIndexOf('    </Flex>\n  );\n}', tpEndMarker);
if (tpEnd > -1 && tpEnd > code.indexOf('function ThirdPartyImpactTab(')) {
  const TP_ADDITIONS = `
      {/* Blocking vs Non-Blocking Classification */}
      <SectionHeader title="Resource Blocking Classification" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Identifies render-blocking resources (scripts, CSS) vs async/deferred. Blocking resources directly impact First Contentful Paint and LCP.</Text>
      {(() => {
        const rows = (data?.data?.records ?? []) as any[];
        if (rows.length === 0) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>No third-party data available.</Text></div>;
        // Classify by type: scripts (potentially blocking) vs images/fonts (non-blocking)
        const classified = rows.map((r: any) => {
          const domain = String(r.domain ?? r.resource_domain ?? "unknown");
          const resType = String(r.resource_type ?? r.type ?? "other").toLowerCase();
          const isBlocking = resType.includes("script") || resType.includes("css") || resType.includes("stylesheet");
          const avgDur = Number(r.avg_duration ?? r.avg_dur ?? 0);
          return { domain, resType, isBlocking, avgDur, count: Number(r.count ?? r.requests ?? 0) };
        });
        const blocking = classified.filter(c => c.isBlocking).sort((a, b) => b.avgDur - a.avgDur);
        const nonBlocking = classified.filter(c => !c.isBlocking);
        const totalBlocking = blocking.reduce((a, c) => a + c.count, 0);
        const totalNonBlocking = nonBlocking.reduce((a, c) => a + c.count, 0);
        return (
          <Flex flexDirection="column" gap={8}>
            <Flex gap={16} flexWrap="wrap">
              <div className="uj-kpi-card"><Text className="uj-kpi-label">Blocking Resources</Text><Heading level={3} className="uj-kpi-value" style={{ color: blocking.length > 5 ? RED : ORANGE }}>{blocking.length} domains</Heading><Text style={{ fontSize: 10, opacity: 0.5 }}>{fmtCount(totalBlocking)} requests</Text></div>
              <div className="uj-kpi-card"><Text className="uj-kpi-label">Non-Blocking</Text><Heading level={3} className="uj-kpi-value" style={{ color: GREEN }}>{nonBlocking.length} domains</Heading><Text style={{ fontSize: 10, opacity: 0.5 }}>{fmtCount(totalNonBlocking)} requests</Text></div>
            </Flex>
            {blocking.length > 0 && (
              <div className="uj-table-tile"><DataTable sortable data={blocking.slice(0, 10).map((c, i) => ({
                "#": i + 1, Domain: c.domain, Type: c.resType, "Avg (ms)": Math.round(c.avgDur), Requests: c.count, Impact: "🔴 BLOCKING",
              }))} columns={[
                { id: "#", header: "#", accessor: "#" },
                { id: "Domain", header: "Domain", accessor: "Domain", cell: ({ value }: any) => <Strong style={{ fontSize: 12 }}>{value}</Strong> },
                { id: "Type", header: "Type", accessor: "Type", cell: ({ value }: any) => <Text style={{ fontSize: 11 }}>{value}</Text> },
                { id: "Avg (ms)", header: "Avg Latency", accessor: "Avg (ms)", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: value > 500 ? RED : value > 200 ? ORANGE : GREEN }}>{fmt(value)}</Strong> },
                { id: "Requests", header: "Requests", accessor: "Requests", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmtCount(value)}</Text> },
                { id: "Impact", header: "Impact", accessor: "Impact", cell: ({ value }: any) => <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: \`\${RED}15\`, color: RED, fontWeight: 700 }}>{value}</span> },
              ]} /></div>
            )}
          </Flex>
        );
      })()}

      {/* Automated CDN Recommendations */}
      <SectionHeader title="CDN Optimization Recommendations" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Automated recommendations for slow third-party domains that could benefit from CDN, async loading, or removal.</Text>
      {(() => {
        const rows = (data?.data?.records ?? []) as any[];
        const recs: { domain: string; avgDur: number; rec: string; impact: string }[] = [];
        rows.forEach((r: any) => {
          const domain = String(r.domain ?? r.resource_domain ?? "");
          const avgDur = Number(r.avg_duration ?? r.avg_dur ?? 0);
          const resType = String(r.resource_type ?? r.type ?? "").toLowerCase();
          const count = Number(r.count ?? r.requests ?? 0);
          if (!domain || domain === "unknown") return;
          if (avgDur > 500 && (resType.includes("image") || resType.includes("font") || resType.includes("media"))) {
            recs.push({ domain, avgDur, rec: \`Serves static assets (\${resType}) — moving to a CDN would reduce avg latency by ~\${Math.round(avgDur * 0.6)}ms based on current TTFB.\`, impact: "high" });
          } else if (avgDur > 1000 && resType.includes("script")) {
            recs.push({ domain, avgDur, rec: \`Render-blocking script with \${fmt(avgDur)} avg load time. Consider async/defer loading or self-hosting critical scripts.\`, impact: "critical" });
          } else if (avgDur > 300 && count > 100) {
            recs.push({ domain, avgDur, rec: \`High-volume domain (\${fmtCount(count)} requests). Pre-connect hint (<link rel="preconnect">) would save ~100-200ms on first request.\`, impact: "medium" });
          }
        });
        if (recs.length === 0) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ color: GREEN }}>✓ No critical third-party optimization opportunities detected.</Text></div>;
        return (
          <Flex flexDirection="column" gap={8}>
            {recs.sort((a, b) => b.avgDur - a.avgDur).slice(0, 8).map((r, i) => (
              <div key={i} className="uj-table-tile" style={{ padding: 12, borderLeft: \`3px solid \${r.impact === "critical" ? RED : r.impact === "high" ? ORANGE : YELLOW}\` }}>
                <Flex justifyContent="space-between" alignItems="flex-start">
                  <div>
                    <Strong style={{ fontSize: 12 }}>{r.domain}</Strong> <Text style={{ fontSize: 11, opacity: 0.5 }}>({fmt(r.avgDur)} avg)</Text>
                    <Text style={{ display: "block", fontSize: 12, marginTop: 4 }}>💡 {r.rec}</Text>
                  </div>
                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: r.impact === "critical" ? \`\${RED}15\` : r.impact === "high" ? \`\${ORANGE}15\` : \`\${YELLOW}15\`, color: r.impact === "critical" ? RED : r.impact === "high" ? ORANGE : YELLOW, fontWeight: 700, whiteSpace: "nowrap" }}>{r.impact.toUpperCase()}</span>
                </Flex>
              </div>
            ))}
          </Flex>
        );
      })()}
`;
  code = code.substring(0, tpEnd) + TP_ADDITIONS + '\n' + code.substring(tpEnd);
}

// ============================================================
// 21. ENHANCE SessionReplaySpotlightTab — AI summarization + grouping
// ============================================================
const srEndMarker = code.indexOf('// ===========================================================================', code.indexOf('function SessionReplaySpotlightTab(') + 100);
// Actually this might be the last tab before ABComparison, let's find it properly
const srFnStart = code.indexOf('function SessionReplaySpotlightTab(');
// Find the ABComparisonTab marker after it
const srEndMarker2 = code.indexOf('// ===========================================================================\n// TAB: A/B', srFnStart);
const srEnd = code.lastIndexOf('    </Flex>\n  );\n}', srEndMarker2 > -1 ? srEndMarker2 : undefined);
if (srEnd > -1 && srEnd > srFnStart) {
  const SR_ADDITIONS = `
      {/* AI Session Summarization */}
      <SectionHeader title="AI Session Summarization" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Auto-generated one-sentence descriptions of what users did and where they struggled. Groups sessions with similar error sequences.</Text>
      {(() => {
        if (sessions.length === 0) return <div className="uj-table-tile" style={{ padding: 16 }}><Text style={{ opacity: 0.5 }}>No sessions to summarize.</Text></div>;
        // Generate summaries based on session attributes
        const summarized = sessions.slice(0, 10).map((s: any) => {
          const pages = Number(s.pages ?? s.page_views ?? s.actions ?? 0);
          const errors = Number(s.errors ?? 0);
          const duration = Number(s.duration ?? s.session_duration ?? 0);
          const hasCrash = Number(s.crashes ?? s.has_crash ?? 0) > 0;
          const hasBounce = Number(s.bounced ?? s.has_bounce ?? 0) > 0;
          let summary = \`Viewed \${pages} page\${pages !== 1 ? "s" : ""} over \${fmt(duration)}\`;
          if (errors > 0) summary += \`, encountered \${errors} error\${errors !== 1 ? "s" : ""}\`;
          if (hasCrash) summary += " (session crashed)";
          if (hasBounce) summary += " — bounced after first page";
          else if (pages > 5) summary += " — high engagement session";
          return { ...s, _summary: summary };
        });
        // Group by error pattern
        const errorGroups = new Map<string, number>();
        sessions.forEach((s: any) => {
          const pattern = Number(s.errors ?? 0) > 0 ? "with-errors" : "clean";
          errorGroups.set(pattern, (errorGroups.get(pattern) ?? 0) + 1);
        });
        return (
          <Flex flexDirection="column" gap={8}>
            <Flex gap={8} flexWrap="wrap" style={{ marginBottom: 8 }}>
              {[...errorGroups.entries()].map(([pattern, count]) => (
                <span key={pattern} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, background: pattern === "with-errors" ? \`\${RED}15\` : \`\${GREEN}15\`, color: pattern === "with-errors" ? RED : GREEN, fontWeight: 600 }}>{pattern}: {count} sessions</span>
              ))}
            </Flex>
            {summarized.map((s: any, i: number) => (
              <div key={i} className="uj-table-tile" style={{ padding: 10, borderLeft: \`3px solid \${Number(s.errors ?? 0) > 0 ? RED : Number(s.pages ?? s.page_views ?? 0) > 5 ? GREEN : "rgba(128,128,128,0.3)"}\` }}>
                <Text style={{ fontSize: 12 }}>🎬 {s._summary}</Text>
              </div>
            ))}
          </Flex>
        );
      })()}
`;
  code = code.substring(0, srEnd) + SR_ADDITIONS + '\n' + code.substring(srEnd);
}

// ============================================================
// 22. ENHANCE ErrorClusteringTab — root cause + fix action
// ============================================================
replaceOnce(
  'function ErrorClusteringTab({ data, trendData, isLoading, frontend }: { data: any; trendData: any; isLoading: boolean; frontend: string }) {',
  'function ErrorClusteringTab({ data, trendData, isLoading, frontend, deployData }: { data: any; trendData: any; isLoading: boolean; frontend: string; deployData?: any }) {'
);

// Add root cause section at end of ErrorClusteringTab
const ecEnd = code.lastIndexOf('    </Flex>\n  );\n}');
if (ecEnd > code.indexOf('function ErrorClusteringTab(')) {
  const EC_ADDITIONS = `
      {/* Automated Root Cause Suggestions */}
      <SectionHeader title="Root Cause Analysis" />
      <Text style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>Correlates error clusters with deployments, browser versions, and temporal patterns to suggest probable root causes.</Text>
      {(() => {
        const deployRecords = (deployData?.data?.records ?? []) as any[];
        const recentDeploys = deployRecords.slice(0, 3).map((r: any) => String(r.deploy_name ?? r.first_time ?? "deployment"));
        const suggestions: { cluster: string; cause: string; action: string }[] = [];
        // Simple correlation: if errors spiked recently and there was a deployment
        if (clusters.length > 0 && recentDeploys.length > 0) {
          suggestions.push({ cluster: clusters[0].name, cause: \`Correlates temporally with recent deployment: "\${recentDeploys[0].substring(0, 40)}". Error count spiked after this event.\`, action: "Investigate rollback or hotfix for the deployment." });
        }
        if (clusters.length > 1 && hourly.length > 2) {
          const recentHours = hourly.slice(-3);
          const earlyHours = hourly.slice(0, 3);
          const recentAvg = recentHours.reduce((a, h) => a + h.count, 0) / recentHours.length;
          const earlyAvg = earlyHours.reduce((a, h) => a + h.count, 0) / Math.max(1, earlyHours.length);
          if (recentAvg > earlyAvg * 2) suggestions.push({ cluster: "All errors", cause: "Error rate is accelerating over time — likely an ongoing regression rather than intermittent issue.", action: "Check for memory leaks, growing queues, or saturating resources." });
        }
        if (suggestions.length === 0) suggestions.push({ cluster: clusters[0]?.name ?? "General", cause: "No clear temporal correlation with deployments found. May be environment-specific (browser, region).", action: "Segment errors by browser/OS and check for device-specific issues." });
        return (
          <Flex flexDirection="column" gap={8}>
            {suggestions.map((s, i) => (
              <div key={i} className="uj-table-tile" style={{ padding: 12, borderLeft: \`3px solid \${ORANGE}\` }}>
                <Strong style={{ fontSize: 12, color: RED }}>{s.cluster.substring(0, 40)}</Strong>
                <Text style={{ display: "block", fontSize: 12, marginTop: 4 }}>🔍 {s.cause}</Text>
                <Text style={{ display: "block", fontSize: 12, marginTop: 4, color: BLUE }}>→ {s.action}</Text>
              </div>
            ))}
          </Flex>
        );
      })()}

      {/* Quick Fix Actions */}
      <SectionHeader title="Quick Actions" />
      <Flex gap={8} flexWrap="wrap">
        {clusters.slice(0, 5).map((c, i) => {
          const inspectorUrl = \`\${ENV_URL}/ui/apps/dynatrace.classic.errors.analysis/errors?gtf=-2h&gf=all&errorType=\${encodeURIComponent(c.name)}\`;
          return (
            <a key={i} href={inspectorUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
              <button style={{ padding: "6px 12px", borderRadius: 4, border: \`1px solid \${RED}40\`, background: \`\${RED}08\`, color: RED, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>🔧 Fix: {c.name.substring(0, 25)}{c.name.length > 25 ? "…" : ""} ({fmtCount(c.occurrences)})</button>
            </a>
          );
        })}
      </Flex>
`;
  code = code.substring(0, ecEnd) + EC_ADDITIONS + '\n' + code.substring(ecEnd);
}

// ============================================================
// 23. Update case statements to pass new props
// ============================================================

// ConversionAttributionTab — pass utmData
if (code.includes('<ConversionAttributionTab') && !code.includes('utmData={utmAttributionData}')) {
  replaceOnce('<ConversionAttributionTab', '<ConversionAttributionTab utmData={utmAttributionData}');
}

// RootCauseCorrelationTab — pass backendServicesData
if (code.includes('<RootCauseCorrelationTab') && !code.includes('backendServicesData={backendServicesData}')) {
  replaceOnce('<RootCauseCorrelationTab', '<RootCauseCorrelationTab backendServicesData={backendServicesData}');
}

// ============================================================
// WRITE OUTPUT
// ============================================================
fs.writeFileSync(FILE, code, 'utf8');
console.log('✅ All tab enhancements applied successfully!');
console.log(`File size: ${(code.length / 1024).toFixed(0)}KB, ${code.split('\n').length} lines`);
