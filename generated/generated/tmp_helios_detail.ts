/**
/* Automatically generated code for generated/tmp_helios_detail.dql
*/
import { queryExecutionClient, QueryStartResponse } from '@dynatrace-sdk/client-query';

export function getQueryString(){
  return `fetch dt.entity.application, from: -30d
| filter entity.name == "helios.clearwateranalytics.com"
| fields id, entity.name, applicationType
`;
}

export async function runQuery(): Promise<QueryStartResponse> {
  return await queryExecutionClient.queryExecute({body: { query: getQueryString(), requestTimeoutMilliseconds: 30000 }});
}