/**
/* Automatically generated code for debug.dql
*/
import { queryExecutionClient, QueryStartResponse } from '@dynatrace-sdk/client-query';

export function getQueryString(){
  return `fetch user.events, from: now() - 14d
| filter frontend.name == "www.angular.easytravel.com"
| filter view.name == "/easytravel/home" or url.path == "/easytravel/rest/login" or view.name == "/easytravel/search" or url.path == "/easytravel/rest/validate-creditcard"
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| fieldsAdd hour_ts = formatTimestamp(start_time, format: "yyyy-MM-dd HH:00")
| summarize
    actions = count(),
    by: {hour_ts}
| sort hour_ts asc
| limit 20
`;
}

export async function runQuery(): Promise<QueryStartResponse> {
  return await queryExecutionClient.queryExecute({body: { query: getQueryString(), requestTimeoutMilliseconds: 30000 }});
}