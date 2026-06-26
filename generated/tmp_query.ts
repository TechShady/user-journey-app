/**
/* Automatically generated code for tmp_query.dql
*/
import { queryExecutionClient, QueryStartResponse } from '@dynatrace-sdk/client-query';

export function getQueryString(){
  return `fetch user.events, from: now() - 14d
| filter frontend.name == "www.angular.easytravel.com"
| filter view.name == "/easytravel/home"
| limit 1
| fields timestamp, startTime, start_time
`;
}

export async function runQuery(): Promise<QueryStartResponse> {
  return await queryExecutionClient.queryExecute({body: { query: getQueryString(), requestTimeoutMilliseconds: 30000 }});
}