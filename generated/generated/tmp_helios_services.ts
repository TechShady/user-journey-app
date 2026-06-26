/**
/* Automatically generated code for generated/tmp_helios_services.dql
*/
import { queryExecutionClient, QueryStartResponse } from '@dynatrace-sdk/client-query';

export function getQueryString(){
  return `fetch dt.entity.application
| filter entity.name == "helios.clearwateranalytics.com"
| expand svc = calls[dt.entity.service]
| lookup [fetch dt.entity.service | fields id, entity.name], sourceField:svc, lookupField:id, prefix:"svc."
| fields id, entity.name, svc, svc.entity.name
| limit 30
`;
}

export async function runQuery(): Promise<QueryStartResponse> {
  return await queryExecutionClient.queryExecute({body: { query: getQueryString(), requestTimeoutMilliseconds: 30000 }});
}