// Restructures FunnelOverviewTab return into 4 sub-tabs
// Replaces lines 3460-3683 (0-indexed: 3459-3682) with new tab structure
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../ui/app/pages/UserJourney.tsx');
const raw = fs.readFileSync(filePath, 'utf8');
const lines = raw.split('\n');
const eol = lines[0].endsWith('\r') ? '\r\n' : '\n';

// Remove \r from each line for processing, we'll re-add eol at the end
const L = lines.map(l => l.replace(/\r$/, ''));

// Verify we're editing the right region
console.assert(L[3459].includes('</Flex>'), 'Line 3460 should be KPI </Flex>: ' + L[3459]);
console.assert(L[3461].includes('Apdex satisfaction breakdown'), 'Line 3462 should be Apdex comment: ' + L[3461]);
console.assert(L[3682].trim() === '}', 'Line 3683 should be function close: ' + L[3682]);

// The new section to insert (replacing lines 3459-3682, i.e. indices 3459..3682 inclusive)
const newSection = `      </Flex>

      <Tabs defaultIndex={0}>
        <Tab title="Conversion Funnel">
          <Flex flexDirection="column" gap={20} style={{ paddingTop: 12 }}>
            {/* Apdex satisfaction breakdown */}
            <div className="uj-table-tile" style={{ padding: 16 }}>
              <Flex gap={24} alignItems="center" flexWrap="wrap">
                <div style={{ textAlign: "center" }}>
                  <Text style={{ fontSize: 13, opacity: 0.5 }}>Satisfied</Text>
                  <Heading level={4} style={{ color: GREEN, margin: "4px 0" }}>{fmtCount(quality.satisfied)}</Heading>
                  <Text style={{ fontSize: 12, opacity: 0.4 }}>≤ {APDEX_T / 1000}s</Text>
                </div>
                <div style={{ textAlign: "center" }}>
                  <Text style={{ fontSize: 13, opacity: 0.5 }}>Tolerating</Text>
                  <Heading level={4} style={{ color: YELLOW, margin: "4px 0" }}>{fmtCount(quality.tolerating)}</Heading>
                  <Text style={{ fontSize: 12, opacity: 0.4 }}>≤ {APDEX_4T / 1000}s</Text>
                </div>
                <div style={{ textAlign: "center" }}>
                  <Text style={{ fontSize: 13, opacity: 0.5 }}>Frustrated</Text>
                  <Heading level={4} style={{ color: RED, margin: "4px 0" }}>{fmtCount(quality.frustrated)}</Heading>
                  <Text style={{ fontSize: 12, opacity: 0.4 }}>&gt; {APDEX_4T / 1000}s</Text>
                </div>
                <div style={{ flex: 1, height: 10, borderRadius: 5, overflow: "hidden", display: "flex", minWidth: 200 }}>
                  <div style={{ width: \`\${quality.total > 0 ? (quality.satisfied / quality.total) * 100 : 0}%\`, background: GREEN, height: "100%" }} />
                  <div style={{ width: \`\${quality.total > 0 ? (quality.tolerating / quality.total) * 100 : 0}%\`, background: YELLOW, height: "100%" }} />
                  <div style={{ width: \`\${quality.total > 0 ? (quality.frustrated / quality.total) * 100 : 0}%\`, background: RED, height: "100%" }} />
                </div>
              </Flex>
            </div>
            {/* Funnel style + compare controls */}
            <Flex alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={12}>
              <SectionHeader title="Conversion Funnel" />
              <Flex alignItems="center" gap={12}>
                <Text style={{ fontSize: 13, opacity: 0.5 }}>Style</Text>
                <Select value={funnelStyle} onChange={(val) => { if (val) onFunnelStyleChange(val as FunnelStyle); }}>
                  <Select.Trigger style={{ minWidth: 170 }} />
                  <Select.Content>
                    {FUNNEL_STYLE_OPTIONS.map(o => <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>)}
                  </Select.Content>
                </Select>
                <button onClick={() => setCompareMode(!compareMode)} className={\`uj-compare-toggle \${compareMode ? "active" : ""}\`}>
                  {compareMode ? "\\u27F5 Hide Compare" : "Compare \\u27F6"}
                </button>
              </Flex>
            </Flex>
            <div className="uj-funnel-container">
              {funnelStyle === "classic" && <FunnelChart steps={funnelSteps} prevSteps={prevFunnelSteps} appEntityId={appEntityId} stepDefs={steps} aov={aov} />}
              {funnelStyle === "horizontal" && <HorizontalBarFunnel steps={funnelSteps} prevSteps={prevFunnelSteps} aov={aov} />}
              {funnelStyle === "cohort" && <StackedCohortFunnel steps={funnelSteps} prevSteps={prevFunnelSteps} aov={aov} />}
              {funnelStyle === "elapsed" && <ElapsedTimeFunnel steps={funnelSteps} prevSteps={prevFunnelSteps} stepMap={stepMap} stepDefs={steps} />}
              {funnelStyle === "split" && <ComparisonSplitFunnel steps={funnelSteps} prevSteps={makeFunnelSteps(funnelCountsPrev)} aov={aov} />}
              {compareMode && (funnelStyle === "classic" || funnelStyle === "cohort" || funnelStyle === "elapsed") && (
                <Flex gap={12} justifyContent="center" style={{ marginTop: 8 }}>
                  <Flex gap={6} alignItems="center"><div style={{ width: 20, height: 3, background: BLUE, borderRadius: 2 }} /><Text style={{ fontSize: 12, opacity: 0.5 }}>Current period</Text></Flex>
                  <Flex gap={6} alignItems="center"><div style={{ width: 20, height: 3, borderTop: "2px dashed rgba(255,255,255,0.3)" }} /><Text style={{ fontSize: 12, opacity: 0.5 }}>Previous period</Text></Flex>
                </Flex>
              )}
            </div>
          </Flex>
        </Tab>
        <Tab title="Predictive Model">
          <Flex flexDirection="column" gap={20} style={{ paddingTop: 12 }}>
            {predN >= 2 ? (() => {
              const W = 300, H = 80, padL = 28, padT = 8, padB = 22, padR = 16;
              const plotW = W - padL - padR;
              const plotH = H - padT - padB;
              const allRates = hourlyPoints.map(p => p.rate);
              const rateMin = Math.max(0, Math.min(...allRates, projectedEod) - 3);
              const rateMax = Math.min(100, Math.max(...allRates, projectedEod) + 3);
              const rateRange = rateMax - rateMin || 1;
              const xS = (h: number) => padL + (h / 23) * plotW;
              const yS = (r: number) => padT + plotH - ((r - rateMin) / rateRange) * plotH;
              const actualLine = hourlyPoints.map((p, i) => \`\${i === 0 ? "M" : "L"}\${xS(p.hour).toFixed(1)},\${yS(p.rate).toFixed(1)}\`).join(" ");
              const last = hourlyPoints[hourlyPoints.length - 1];
              const projLine = \`M\${xS(last.hour).toFixed(1)},\${yS(last.rate).toFixed(1)} L\${xS(23).toFixed(1)},\${yS(projectedEod).toFixed(1)}\`;
              const areaD = \`\${actualLine} L\${xS(last.hour).toFixed(1)},\${yS(rateMin).toFixed(1)} L\${xS(hourlyPoints[0].hour).toFixed(1)},\${yS(rateMin).toFixed(1)} Z\`;
              return (
                <div className="uj-table-tile" style={{ padding: 16 }}>
                  <Flex alignItems="center" justifyContent="space-between" style={{ marginBottom: 12 }}>
                    <Flex alignItems="center" gap={8}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke={BLUE} strokeWidth="1.2"/><path d="M4 10l2.5-3 2 2 3-4" stroke={BLUE} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      <Strong style={{ fontSize: 14 }}>Predictive Funnel Model</Strong>
                      <Text style={{ fontSize: 12, opacity: 0.45 }}>Today's conversion trajectory to EOD</Text>
                    </Flex>
                    <Text style={{ fontSize: 12, opacity: 0.35 }}>{predConfidence}% confidence · {predN} data point{predN !== 1 ? "s" : ""}</Text>
                  </Flex>
                  <Flex gap={20} alignItems="flex-start" flexWrap="wrap">
                    <div className="uj-kpi-card" style={{ minWidth: 120 }}>
                      <Text className="uj-kpi-label">Projected EOD</Text>
                      <Heading level={3} className="uj-kpi-value" style={{ color: statusClr(projectedEod) }}>{fmtPct(projectedEod)}</Heading>
                      <Text style={{ fontSize: 12, opacity: 0.45 }}>conv rate at 23:59</Text>
                    </div>
                    <div className="uj-kpi-card" style={{ minWidth: 120 }}>
                      <Text className="uj-kpi-label">Hourly Velocity</Text>
                      <Heading level={3} className="uj-kpi-value" style={{ color: velocityClr }}>{velocitySlope >= 0 ? "+" : ""}{velocitySlope.toFixed(2)}%/h</Heading>
                      <Text style={{ fontSize: 12, color: velocityClr }}>{velocityDir}</Text>
                    </div>
                    <div className="uj-kpi-card" style={{ minWidth: 120 }}>
                      <Text className="uj-kpi-label">Hours Remaining</Text>
                      <Heading level={3} className="uj-kpi-value" style={{ color: BLUE }}>{23 - currentHour}h</Heading>
                      <Text style={{ fontSize: 12, opacity: 0.45 }}>until end of day</Text>
                    </div>
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <Text style={{ fontSize: 11, opacity: 0.4, marginBottom: 4, display: "block" }}>Hourly conv rate · actual (solid) vs projected (dashed)</Text>
                      <svg width="100%" viewBox={\`0 0 \${W} \${H}\`} style={{ overflow: "visible" }}>
                        <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
                        <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
                        <line x1={xS(currentHour)} y1={padT} x2={xS(currentHour)} y2={padT + plotH} stroke="rgba(255,255,255,0.12)" strokeWidth={1} strokeDasharray="3 2" />
                        <text x={xS(currentHour)} y={padT - 2} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize={7}>now</text>
                        <path d={areaD} fill={BLUE} fillOpacity={0.08} />
                        <path d={actualLine} fill="none" stroke={BLUE} strokeWidth={2} strokeLinejoin="round" />
                        <path d={projLine} fill="none" stroke={velocityClr} strokeWidth={1.5} strokeDasharray="5 3" />
                        <circle cx={xS(23)} cy={yS(projectedEod)} r={4} fill={velocityClr} stroke="rgba(0,0,0,0.5)" strokeWidth={1.2}><title>Projected EOD: {fmtPct(projectedEod)}</title></circle>
                        {hourlyPoints.map(p => <circle key={p.hour} cx={xS(p.hour)} cy={yS(p.rate)} r={2.5} fill={BLUE}><title>Hour {p.hour}:00 — {fmtPct(p.rate)} ({fmtCount(p.sessions)} sessions)</title></circle>)}
                        {[0, 6, 12, 18, 23].map(h => <text key={h} x={xS(h)} y={H - 4} textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize={7}>{h}:00</text>)}
                        <text x={padL - 4} y={padT + 4} textAnchor="end" fill="rgba(255,255,255,0.25)" fontSize={7}>{rateMax.toFixed(0)}%</text>
                        <text x={padL - 4} y={padT + plotH} textAnchor="end" fill="rgba(255,255,255,0.25)" fontSize={7}>{rateMin.toFixed(0)}%</text>
                      </svg>
                    </div>
                  </Flex>
                </div>
              );
            })() : (
              <div className="uj-table-tile" style={{ padding: 24, textAlign: "center" }}>
                <Text style={{ opacity: 0.5 }}>Predictive model requires ≥2 hourly data points for today. Check back after more data accumulates.</Text>
              </div>
            )}
          </Flex>
        </Tab>
        <Tab title="Step Analysis">
          <Flex flexDirection="column" gap={20} style={{ paddingTop: 12 }}>
            <div className="uj-table-tile">
              <DataTable
                sortable
                data={steps.map((step, i) => {
                  const prev = i === 0 ? funnelCounts[0] : funnelCounts[i - 1];
                  const conv = i === 0 ? 100 : prev > 0 ? (funnelCounts[i] / prev) * 100 : 0;
                  const m = stepMap.get(step.label);
                  const apdex = m ? calcApdex(Number(m.satisfied ?? 0), Number(m.tolerating ?? 0), Number(m.total_actions ?? 0)) : 0;
                  return {
                    Step: i + 1, Action: step.label, Sessions: funnelCounts[i],
                    "Avg (ms)": m ? Number(m.avg_duration_ms ?? 0) : 0,
                    "P90 (ms)": m ? Number(m.p90_duration_ms ?? 0) : 0,
                    Apdex: apdex, "Conv %": conv,
                    Abandons: i === 0 ? 0 : prev - funnelCounts[i],
                    Errors: m ? Number(m.error_count ?? 0) : 0,
                  };
                })}
                columns={[
                  { id: "Step", header: "#", accessor: "Step", sortType: "number" as any },
                  { id: "Action", header: "Step", accessor: "Action" },
                  { id: "Sessions", header: "Sessions", accessor: "Sessions", sortType: "number" as any, cell: ({ value }: any) => <Strong>{fmtCount(value)}</Strong> },
                  { id: "Avg (ms)", header: "Avg Duration", accessor: "Avg (ms)", sortType: "number" as any, cell: ({ value }: any) => <Text>{fmt(value)}</Text> },
                  { id: "P90 (ms)", header: "P90", accessor: "P90 (ms)", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 3000 ? RED : value > 1000 ? YELLOW : GREEN }}>{fmt(value)}</Text> },
                  { id: "Apdex", header: "Apdex", accessor: "Apdex", sortType: "number" as any, cell: ({ value }: any) => <Strong style={{ color: apdexClr(value) }}>{value.toFixed(2)}</Strong> },
                  { id: "Conv %", header: "Conv %", accessor: "Conv %", sortType: "number" as any, cell: ({ value, rowData }: any) => rowData.Step === 1 ? <Text style={{ opacity: 0.5 }}>entry</Text> : <Strong style={{ color: statusClr(value) }}>{fmtPct(value)}</Strong> },
                  { id: "Abandons", header: "Abandons", accessor: "Abandons", sortType: "number" as any, cell: ({ value, rowData }: any) => rowData.Step === 1 ? <Text style={{ opacity: 0.5 }}>—</Text> : <Strong style={{ color: value > 0 ? RED : GREEN }}>{fmtCount(value)}</Strong> },
                  { id: "Errors", header: "Errors", accessor: "Errors", sortType: "number" as any, cell: ({ value }: any) => <Text style={{ color: value > 0 ? RED : undefined }}>{value}</Text> },
                ]}
              />
            </div>
          </Flex>
        </Tab>
        <Tab title="Per-Page Breakdown">
          <Flex flexDirection="column" gap={20} style={{ paddingTop: 12 }}>
            {steps.some(s => s.identifiers.length > 1) ? (
              <>
                <Text style={{ fontSize: 12, opacity: 0.5 }}>Individual page metrics for steps with multiple pages. First page is the primary link target.</Text>
                {steps.map((step, i) => {
                  if (step.identifiers.length < 2) return null;
                  const m = stepMap.get(step.label);
                  const stepApdex = m ? calcApdex(Number(m.satisfied ?? 0), Number(m.tolerating ?? 0), Number(m.total_actions ?? 0)) : 0;
                  const stepSessions = funnelCounts[i] ?? 0;
                  return (
                    <div key={i} className="uj-table-tile" style={{ padding: 16 }}>
                      <Flex alignItems="center" gap={12} style={{ marginBottom: 10 }}>
                        <span className="uj-step-badge">{i + 1}</span>
                        {(() => { const pid = stepPrimaryIdentifier(step); return appEntityId && pid ? (
                          <a href={vitalsUrl(appEntityId, pid)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: BLUE, fontWeight: 700, fontSize: 15 }} onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")} onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}>{step.label} ↗</a>
                        ) : (
                          <Heading level={5} style={{ margin: 0 }}>{step.label}</Heading>
                        ); })()}
                        <Text style={{ fontSize: 12, opacity: 0.4, marginLeft: 8 }}>Rollup: {fmtCount(stepSessions)} sessions · Apdex {stepApdex.toFixed(2)}</Text>
                      </Flex>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
                        {step.identifiers.map((id, j) => {
                          let pm = pageMap.get(id);
                          if (!pm) { for (const [key, val] of pageMap) { if (identifierMatchesLabel(id, key)) { pm = val; break; } } }
                          const sessions = pm ? Number(pm.sessions ?? 0) : 0;
                          const avg = pm ? Number(pm.avg_duration_ms ?? 0) : 0;
                          const p90 = pm ? Number(pm.p90_duration_ms ?? 0) : 0;
                          const errors = pm ? Number(pm.error_count ?? 0) : 0;
                          const sat = pm ? Number(pm.satisfied ?? 0) : 0;
                          const tol = pm ? Number(pm.tolerating ?? 0) : 0;
                          const total = pm ? Number(pm.total_actions ?? 0) : 0;
                          const apdex = calcApdex(sat, tol, total);
                          const linkable = appEntityId && !isWildcard(id);
                          const isPrimary = j === 0;
                          return (
                            <div key={j} style={{ padding: "10px 12px", borderRadius: 8, background: isPrimary ? "rgba(69,137,255,0.06)" : "rgba(128,128,128,0.04)", border: \`1px solid \${isPrimary ? "rgba(69,137,255,0.15)" : "rgba(128,128,128,0.1)"}\` }}>
                              <Flex alignItems="center" gap={6} style={{ marginBottom: 6 }}>
                                {isPrimary && <span style={{ fontSize: 9, fontWeight: 700, color: BLUE, background: \`\${BLUE}18\`, padding: "1px 5px", borderRadius: 3 }}>PRIMARY</span>}
                                {linkable ? (
                                  <a href={vitalsUrl(appEntityId!, id)} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, textDecoration: "none", fontSize: 13, fontWeight: 600 }} onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")} onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}>{id} ↗</a>
                                ) : (
                                  <Text style={{ fontSize: 13, fontWeight: 600 }}>{id}</Text>
                                )}
                              </Flex>
                              <Flex gap={12} flexWrap="wrap" alignItems="center">
                                <div><Text style={{ fontSize: 11, opacity: 0.5 }}>Sessions</Text><br/><Strong style={{ color: BLUE, fontSize: 14 }}>{fmtCount(sessions)}</Strong></div>
                                <div><Text style={{ fontSize: 11, opacity: 0.5 }}>Apdex</Text><br/><Strong style={{ color: apdexClr(apdex), fontSize: 14 }}>{apdex.toFixed(2)}</Strong></div>
                                <div><Text style={{ fontSize: 11, opacity: 0.5 }}>Avg</Text><br/><Strong style={{ color: avg > 3000 ? RED : avg > 1000 ? YELLOW : GREEN, fontSize: 14 }}>{fmt(avg)}</Strong></div>
                                <div><Text style={{ fontSize: 11, opacity: 0.5 }}>P90</Text><br/><Strong style={{ color: p90 > 3000 ? RED : p90 > 1500 ? YELLOW : GREEN, fontSize: 14 }}>{fmt(p90)}</Strong></div>
                                <div><Text style={{ fontSize: 11, opacity: 0.5 }}>Errors</Text><br/><Strong style={{ color: errors > 0 ? RED : GREEN, fontSize: 14 }}>{errors}</Strong></div>
                              </Flex>
                              <div style={{ marginTop: 6, height: 4, borderRadius: 2, overflow: "hidden", display: "flex" }}>
                                <div style={{ width: \`\${total > 0 ? (sat / total) * 100 : 0}%\`, background: GREEN, height: "100%" }} />
                                <div style={{ width: \`\${total > 0 ? (tol / total) * 100 : 0}%\`, background: YELLOW, height: "100%" }} />
                                <div style={{ width: \`\${total > 0 ? ((total - sat - tol) / total) * 100 : 0}%\`, background: RED, height: "100%" }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="uj-table-tile" style={{ padding: 24, textAlign: "center" }}>
                <Text style={{ opacity: 0.5 }}>No multi-page steps configured. Per-page breakdown is available when a step has multiple page identifiers.</Text>
              </div>
            )}
          </Flex>
        </Tab>
      </Tabs>
    </Flex>
  );
}`;

// Build the new file: keep everything before line index 3459, insert newSection, keep everything after 3682
const before = L.slice(0, 3459);
const after = L.slice(3683);

const newLines = [...before, ...newSection.split('\n'), '', ...after];
const newContent = newLines.join(eol === '\r\n' ? '\r\n' : '\n');

fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Done! Lines replaced: 3460-3683');
console.log('New line count:', newLines.length);
