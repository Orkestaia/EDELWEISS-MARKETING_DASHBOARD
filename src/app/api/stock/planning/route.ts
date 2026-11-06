import { planning } from "@/lib/stock/planning-index";
import { dateKey, maineDate, shiftDate, StockError } from "@/lib/stock/domain";
import { stockAuthorized,stockFailure,stockJson,stockMutation } from "@/lib/stock/http";
export const runtime="nodejs";
export const maxDuration=60;
export async function GET(request:Request) {
 if(!await stockAuthorized())return stockJson({error:"Unauthorized"},401);
 try {const date=dateKey(new URL(request.url).searchParams.get("date")??shiftDate(maineDate(),1));return stockJson(await(await planning()).preview(date));}catch(error){return stockFailure(error);}
}
export async function POST(request:Request) {
 try {const body=await stockMutation(request);if(body.action!=="apply")throw new StockError("Choose a valid action.");return stockJson(await(await planning()).apply(body));}catch(error){return stockFailure(error);}
}
