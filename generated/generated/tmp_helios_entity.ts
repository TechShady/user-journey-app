/**
/* Automatically generated code for generated/tmp_helios_entity.dql
*/
import { queryExecutionClient, QueryStartResponse } from '@dynatrace-sdk/client-query';

export function getQueryString(){
  return `fetch dt.entity.application
| filter entity.name == "helios.clearwateranalytics.com"
| fields id, entity.name, lifetime, tags
`;
}

export async function runQuery(): Promise<QueryStartResponse> {
  return await queryExecutionClient.queryExecute({body: { query: getQueryString(), requestTimeoutMilliseconds: 30000 }});
}