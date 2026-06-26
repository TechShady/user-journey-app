/**
/* Automatically generated code for generated/tmp_worst_sessions_test.dql
*/
import { queryExecutionClient, QueryStartResponse } from '@dynatrace-sdk/client-query';

export function getQueryString(){
  return `fetch user.events, from:now()-2h
| filter frontend.name == "www.angular.easytravel.com"
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd satisfaction = coalesce(if(dur_ms <= 3000.0, "satisfied"), if(dur_ms <= 12000.0, "tolerating"), "frustrated")
| fieldsAdd pageName = coalesce(view.name, url.path, "unknown")
| fieldsAdd errName = if(characteristics.has_error == true, coalesce(error.display_name, error.type, "error"), else: "")
| summarize
    actions = count(),
    avg_dur = avg(dur_ms),
    max_dur = max(dur_ms),
    p90_dur = percentile(dur_ms, 90),
    errors = countIf(characteristics.has_error == true),
    frustrated = countIf(satisfaction == "frustrated"),
    satisfied = countIf(satisfaction == "satisfied"),
    tolerating = countIf(satisfaction == "tolerating"),
    start_ts = min(start_time),
    pages = collectDistinct(pageName),
    error_types = collectDistinct(errName),
    by: {dt.rum.session.id}
| sort frustrated desc, errors desc, max_dur desc
| limit 5
`;
}

export async function runQuery(): Promise<QueryStartResponse> {
  return await queryExecutionClient.queryExecute({body: { query: getQueryString(), requestTimeoutMilliseconds: 30000 }});
}