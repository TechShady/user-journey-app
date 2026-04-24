/**
/* Automatically generated code for debug.dql
*/
import { queryExecutionClient, QueryStartResponse } from '@dynatrace-sdk/client-query';

export function getQueryString(){
  return `fetch events, from: now() - 14d
| filter event.type == "CUSTOM_DEPLOYMENT"
| fieldsAdd deploy_name = coalesce(event.name, event.title, "Deployment")
| summarize cnt = count(), deploys = collectDistinct(deploy_name)

`;
}

export async function runQuery(): Promise<QueryStartResponse> {
  return await queryExecutionClient.queryExecute({body: { query: getQueryString(), requestTimeoutMilliseconds: 30000 }});
}