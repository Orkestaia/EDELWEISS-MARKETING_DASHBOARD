import { planning } from "@/lib/stock/planning-index";
import { stockAuthorized,stockFailure,stockJson,stockMutation } from "@/lib/stock/http";
export const runtime="nodejs";
export async function GET() {
 if(!await stockAuthorized())return stockJson({error:"Unauthorized"},401);
 try{return stockJson(await(await planning()).settings());}catch(error){return stockFailure(error);}
}
export async function POST(request:Request) {
 try{const body=await stockMutation(request);return stockJson(await(await planning()).update(body));}catch(error){return stockFailure(error);}
}
