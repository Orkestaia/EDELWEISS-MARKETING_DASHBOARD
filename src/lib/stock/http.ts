import "server-only";
import { hasDashboardSession } from "../require-dashboard-session";
import { sameOrigin } from "../dashboard-session";
import { StockError } from "./domain";

export const stockJson = (body: unknown,status=200) => Response.json(body,{status,headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"}});
export const stockAuthorized = hasDashboardSession;
export async function stockMutation(request:Request) {
  if(!await stockAuthorized())throw new StockError("Unauthorized",401);
  if(!sameOrigin(request))throw new StockError("Forbidden",403);
  const reader=request.body?.getReader();if(!reader)throw new StockError("Invalid request.");
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();throw new StockError("Request is too large.",413);}chunks.push(value);}
  let body:unknown;try{body=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new StockError("Invalid JSON request.");}
  if(!body||typeof body!=="object"||Array.isArray(body))throw new StockError("Invalid request.");return body as Record<string,unknown>;
}
export function stockFailure(error:unknown) { return stockJson({error:error instanceof StockError?error.message:"The bakery data could not be read or saved. Please retry."},error instanceof StockError?error.status:503); }
