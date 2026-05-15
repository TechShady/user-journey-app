// Fix trendsSparklineQuery:
// 1. Rename 'day' field (reserved DQL keyword) → 'slot_day'
// 2. Dynamic bin size: 1h for <1d, 6h for <=3d, 1d for longer
const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, '../ui/app/pages/UserJourney.tsx');
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

// Replace the entire trendsSparklineQuery function
content = content.replace(
  `function trendsSparklineQuery(days: number, frontend: string, steps: StepDef[]): string {
  const period = periodClause(days, false);
  return \`fetch user.events, \${period}
| filter frontend.name == "\${frontend}"
| filter \${anyStepFilter(steps)}
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd day = bin(start_time, 1d)
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
  by: { day }
| sort day asc\`;
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
    frustrated = countIf(dur_ms > \${APDEX_4T}.0)
  by: {slot_day}
| sort slot_day asc\`;
}`
);

const checks = [
  ['slot_day used',         content.includes('slot_day = bin(')],
  ['dynamic bin size',      content.includes("days < 1 ? '1h'")],
  ['no reserved day field', !content.includes("fieldsAdd day = bin")],
];
let ok = true;
for (const [n, pass] of checks) { console.log((pass?'OK':'FAIL')+': '+n); if (!pass) ok = false; }
if (!ok) process.exit(1);

fs.writeFileSync(filePath, content, 'utf8');
console.log('\nDone!');
