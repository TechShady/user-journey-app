/**
/* Automatically generated code for generated/tmp_helios_actions3.dql
*/
import { queryExecutionClient, QueryStartResponse } from '@dynatrace-sdk/client-query';

export function getQueryString(){
  return `timeseries cnt = sum(dt.frontend.user_action.count), from: now() - 7d, by: {dt.entity.application}
| sort arraySum(cnt) desc
| limit 20
`;
}

export async function runQuery(): Promise<QueryStartResponse> {
  return await queryExecutionClient.queryExecute({body: { query: getQueryString(), requestTimeoutMilliseconds: 30000 }});
}