/**
/* Automatically generated code for generated/tmp_funnel_paths.dql
*/
import { queryExecutionClient, QueryStartResponse } from '@dynatrace-sdk/client-query';

export function getQueryString(){
  return `fetch user.events, from:now()-2h
| filter frontend.name == "www.angular.easytravel.com"
| filter isNotNull(view.name)
| sort timestamp asc
| summarize path = collectArray(view.name), by:{dt.rum.session.id}
| limit 500
`;
}

export async function runQuery(): Promise<QueryStartResponse> {
  return await queryExecutionClient.queryExecute({body: { query: getQueryString(), requestTimeoutMilliseconds: 30000 }});
}