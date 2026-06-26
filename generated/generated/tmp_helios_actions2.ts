/**
/* Automatically generated code for generated/tmp_helios_actions2.dql
*/
import { queryExecutionClient, QueryStartResponse } from '@dynatrace-sdk/client-query';

export function getQueryString(){
  return `timeseries cnt = sum(dt.frontend.user_action.count), from: now() - 7d, by: {dt.entity.application, dt.rum.user_action.name}
| filter dt.entity.application == "APPLICATION-608D12757C26FCA4"
| sort arraySum(cnt) desc
| limit 40
`;
}

export async function runQuery(): Promise<QueryStartResponse> {
  return await queryExecutionClient.queryExecute({body: { query: getQueryString(), requestTimeoutMilliseconds: 30000 }});
}