/**
/* Automatically generated code for generated/tmp_helios_actions.dql
*/
import { queryExecutionClient, QueryStartResponse } from '@dynatrace-sdk/client-query';

export function getQueryString(){
  return `fetch dt.entity.service
| filter contains(entity.name, "helios") or contains(entity.name, "donner") or contains(entity.name, "ciam") or contains(entity.name, "Asset Manager") or contains(entity.name, "reporting") or contains(entity.name, "Auth WS")
| fields id, entity.name, serviceType
| sort entity.name asc
| limit 50
`;
}

export async function runQuery(): Promise<QueryStartResponse> {
  return await queryExecutionClient.queryExecute({body: { query: getQueryString(), requestTimeoutMilliseconds: 30000 }});
}