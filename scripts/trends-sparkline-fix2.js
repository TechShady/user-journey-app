// Fix trendsSparklineQuery: move by: inside summarize as last comma-separated item
const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, '../ui/app/pages/UserJourney.tsx');
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

content = content.replace(
  `function trendsSparklineQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days, false);
  const binSize = days < 1 ? '1h' : days <= 3 ? '6h' : '1d';
  return \`fetch user.events, \${period}
| filter frontend.name == "\${frontend}"
| filter \${anyStepFilter(steps)}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd slot_day = bin(start_time, \${binSize})
| summarize
    total = count(),
    sessions = countDistinct(dt.rum.session.id),
    avg_dur = avg(dur_ms),
    p50_dur = percentile(dur_ms, 50),
    p90_dur = percentile(dur_ms, 90),
    errors = countIf(characteristics.has_error == true),
    satisfied = countIf(dur_ms <= \${APDEX_T}.0),
    tolerating = countIf(dur_ms > \${APDEX_T}.0 and dur_ms <= \${APDEX_4T}.0),
    frustrated = countIf(dur_ms > \${APDEX_4T}.0)
  by: {slot_day}
| sort slot_day asc\`;
}`,
  `function trendsSparklineQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days, false);
  const binSize = days < 1 ? '1h' : days <= 3 ? '6h' : '1d';
  return \`fetch user.events, \${period}
| filter frontend.name == "\${frontend}"
| filter \${anyStepFilter(steps)}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd slot_day = bin(start_time, \${binSize})
| summarize
    total = count(),
    sessions = countDistinct(dt.rum.session.id),
    avg_dur = avg(dur_ms),
    p50_dur = percentile(dur_ms, 50),
    p90_dur = percentile(dur_ms, 90),
    errors = countIf(characteristics.has_error == true),
    satisfied = countIf(dur_ms <= \${APDEX_T}.0),
    tolerating = countIf(dur_ms > \${APDEX_T}.0 and dur_ms <= \${APDEX_4T}.0),
    frustrated = countIf(dur_ms > \${APDEX_4T}.0),
    by: {slot_day}
| sort slot_day asc\`;
}`
);

const checks = [
  ['by inside summarize', content.includes('frustrated = countIf(dur_ms > ${APDEX_4T}.0),\n    by: {slot_day}')],
  ['no standalone by line', !content.includes('  by: {slot_day}')],
];
let ok = true;
for (const [n, pass] of checks) { console.log((pass?'OK':'FAIL')+': '+n); if (!pass) ok = false; }
if (!ok) process.exit(1);

fs.writeFileSync(filePath, content, 'utf8');
console.log('\nDone!');
