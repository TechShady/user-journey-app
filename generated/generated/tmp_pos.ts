/**
/* Automatically generated code for generated/tmp_pos.dql
*/
import { queryExecutionClient, QueryStartResponse } from '@dynatrace-sdk/client-query';

export function getQueryString(){
  return `fetch dt.entity.application
| filter contains(lower(entity.name), "pos")
| fieldsKeep id, entity.name
| limit 20
`;
}

export async function runQuery(): Promise<QueryStartResponse> {
  return await queryExecutionClient.queryExecute({body: { query: getQueryString(), requestTimeoutMilliseconds: 30000 }});
}