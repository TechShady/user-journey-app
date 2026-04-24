/**
/* Automatically generated code for debug.dql
*/
import { queryExecutionClient, QueryStartResponse } from '@dynatrace-sdk/client-query';

export function getQueryString(){
  return `fetch user.events, from: now() - 1d
| filter frontend.name == "www.angular.easytravel.com"
| filter characteristics.has_request == true
| filter page.url.path == "/"
| fieldsAdd rpath = lower(coalesce(url.path, "")), ref = page.referrer.url.path, pggroup = page.group, aname = useraction.name
| filter contains(rpath, "journey") or contains(rpath, "validate") or contains(rpath, "booking")
| summarize cnt = count(), by: {rpath, ref, pggroup}
| sort cnt desc
| limit 20
`;
}

export async function runQuery(): Promise<QueryStartResponse> {
  return await queryExecutionClient.queryExecute({body: { query: getQueryString(), requestTimeoutMilliseconds: 30000 }});
}