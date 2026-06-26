/**
/* Automatically generated code for generated/tmp_pos_paths.dql
*/
import { queryExecutionClient, QueryStartResponse } from '@dynatrace-sdk/client-query';

export function getQueryString(){
  return `fetch user.events, from: now()-7d
| filter frontend.name == "POS"
| summarize actions = count(), sessions = countDistinct(dt.rum.session.id), by: {url.path, event.type}
| sort actions desc
| limit 40
`;
}

export async function runQuery(): Promise<QueryStartResponse> {
  return await queryExecutionClient.queryExecute({body: { query: getQueryString(), requestTimeoutMilliseconds: 30000 }});
}