/**
/* Automatically generated code for debug.dql
*/
import { queryExecutionClient, QueryStartResponse } from '@dynatrace-sdk/client-query';

export function getQueryString(){
  return `fetch user.events, from: now() - 7d
| filter frontend.name == "www.angular.easytravel.com"
| filter characteristics.has_request == true
| fieldsAdd step_tag = coalesce(
    if(page.url.path == "/easytravel/home", "Home Page"),
    if(contains(lower(coalesce(page.url.path, "")), "login"), "Login"),
    if(page.url.path == "/easytravel/search", "Search"),
    "other")
| summarize cnt = count(), by: {step_tag}
| sort cnt desc
`;
}

export async function runQuery(): Promise<QueryStartResponse> {
  return await queryExecutionClient.queryExecute({body: { query: getQueryString(), requestTimeoutMilliseconds: 30000 }});
}