/**
/* Automatically generated code for generated/tmp_helios_user_actions.dql
*/
import { queryExecutionClient, QueryStartResponse } from '@dynatrace-sdk/client-query';

export function getQueryString(){
  return `fetch dt.entity.user_action_of_application
| filter belongs_to[dt.entity.application] == "APPLICATION-608D12757C26FCA4"
| fields id, entity.name
| sort entity.name asc
| limit 50
`;
}

export async function runQuery(): Promise<QueryStartResponse> {
  return await queryExecutionClient.queryExecute({body: { query: getQueryString(), requestTimeoutMilliseconds: 30000 }});
}