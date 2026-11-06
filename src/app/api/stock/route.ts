import { cookies } from "next/headers";
import { SESSION_COOKIE, validSession } from "@/lib/dashboard-session";
import { dateKey, maineDate, monday, StockError } from "@/lib/stock/domain";
import { loadStockSeed } from "@/lib/stock/seed";
import { stock } from "@/lib/stock";
import type { StockData } from "@/lib/stock/types";
import { stockMutation } from "@/lib/stock/http";

export const runtime = "nodejs";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
async function authorized() { return validSession((await cookies()).get(SESSION_COOKIE)?.value); }
export async function GET(request: Request) {
  if (!await authorized()) return json({ error: "Unauthorized" }, 401);
  try {
    const today = maineDate(), week = monday(dateKey(new URL(request.url).searchParams.get("week") ?? today));
    const feedConfigured = Boolean(process.env.DASHBOARD_FEED_SECRET);
    if (!process.env.DATABASE_URL) {
      const data: StockData = { today, week, persistent: false, feedConfigured, products: loadStockSeed(), plans: [], closes: [], catalog: [], snapshots: [], sales: [], sync: null };
      return json(data);
    }
    return json(await (await stock()).view(week, feedConfigured));
  } catch (error) {
    return json({ error: error instanceof StockError ? error.message : "Stock database could not be reached. Try again; no counts have been changed." }, error instanceof StockError ? error.status : 503);
  }
}
export async function POST(request: Request) {
  let body:Record<string,unknown>;
  try { body=await stockMutation(request); }catch(error){return json({error:error instanceof StockError?error.message:"Invalid request."},error instanceof StockError?error.status:400);}
  if (typeof body.action!=="string" || !["plan", "close", "product"].includes(body.action)) return json({ error: "Choose a valid action." }, 400);
  if (!process.env.DATABASE_URL) return json({ error: "Database setup is pending. Counts cannot be saved yet." }, 503);
  try {
    const service = await stock();
    const result = body.action === "plan" ? await service.savePlan(body) : body.action === "close" ? await service.saveClose(body) : await service.saveProduct(body);
    return json(result);
  } catch (error) {
    return json({ error: error instanceof StockError ? error.message : "Could not save. Keep this screen open and retry." }, error instanceof StockError ? error.status : 503);
  }
}
