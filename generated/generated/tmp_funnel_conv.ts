/**
/* Automatically generated code for generated/tmp_funnel_conv.dql
*/
import { queryExecutionClient, QueryStartResponse } from '@dynatrace-sdk/client-query';

export function getQueryString(){
  return `fetch user.events, from:now()-2h
| filter frontend.name == "www.angular.easytravel.com"
| filter isNotNull(view.name)
| sort timestamp asc
| summarize path = collectDistinct(view.name), by:{dt.rum.session.id}
| fieldsAdd reached_book = iAny(path[] == "/easytravel/journeys/:id:/book")
| summarize 
    total = count(),
    converters = countIf(reached_book == true),
    by:{path}
| sort converters desc
| limit 20
`;
}

export async function runQuery(): Promise<QueryStartResponse> {
  return await queryExecutionClient.queryExecute({body: { query: getQueryString(), requestTimeoutMilliseconds: 30000 }});
}