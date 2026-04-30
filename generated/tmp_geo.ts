/**
/* Automatically generated code for tmp_geo.dql
*/
import { queryExecutionClient, QueryStartResponse } from '@dynatrace-sdk/client-query';

export function getQueryString(){
  return `fetch user.events, from: now() - 2h
| filter frontend.name == "Product_Browse"
| filter geo.country.iso_code == "US"
| fieldsKeep geo.country.iso_code, geo.city.name, geo.region.iso_code, geo.region.name, geo.location.latitude, geo.location.longitude, geo.continent.code
| limit 5
`;
}

export async function runQuery(): Promise<QueryStartResponse> {
  return await queryExecutionClient.queryExecute({body: { query: getQueryString(), requestTimeoutMilliseconds: 30000 }});
}