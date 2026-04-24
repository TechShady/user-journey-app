/**
/* Automatically generated code for debug.dql
*/
import { queryExecutionClient, QueryStartResponse } from '@dynatrace-sdk/client-query';

export function getQueryString(){
  return `fetch user.events, from: now() - 1d
| filter frontend.name == "www.angular.easytravel.com"
| filter view.name == "/easytravel/home" or url.path == "/easytravel/rest/login" or view.name == "/easytravel/search" or url.path == "/easytravel/rest/validate-creditcard"
| fieldsAdd step_tag = coalesce(
    if(view.name == "/easytravel/home", "step1"),
    if(url.path == "/easytravel/rest/login", "step2"),
    if(view.name == "/easytravel/search", "step3"),
    if(url.path == "/easytravel/rest/validate-creditcard", "step4"),
    "other")
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd hour_bucket = getHour(start_time)
| summarize
    steps = collectDistinct(step_tag),
    avg_dur = avg(dur_ms),
    actions = count(),
    errors = countIf(characteristics.has_error == true),
    by: {dt.rum.session.id, hour_bucket}
| summarize
    total_sessions = count(),
    by: {hour_bucket}
| sort hour_bucket asc
`;
}

export async function runQuery(): Promise<QueryStartResponse> {
  return await queryExecutionClient.queryExecute({body: { query: getQueryString(), requestTimeoutMilliseconds: 30000 }});
}