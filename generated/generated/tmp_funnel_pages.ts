/**
/* Automatically generated code for generated/tmp_funnel_pages.dql
*/
import { queryExecutionClient, QueryStartResponse } from '@dynatrace-sdk/client-query';

export function getQueryString(){
  return `fetch user.events, from:now()-2h
| filter frontend.name == "www.angular.easytravel.com"
| summarize sessions = countDistinct(dt.rum.session.id), actions = count(), by:{view.name}
| sort sessions desc
| limit 50
`;
}

export async function runQuery(): Promise<QueryStartResponse> {
  return await queryExecutionClient.queryExecute({body: { query: getQueryString(), requestTimeoutMilliseconds: 30000 }});
}