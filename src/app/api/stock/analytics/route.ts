import { AnalyticsService, validateAnalyticsInput, type AnalyticsInput } from "@/lib/stock/analytics-service";
import { maineDate } from "@/lib/stock/domain";
import { stockAuthorized, stockFailure, stockJson } from "@/lib/stock/http";
import { stock, stockDatabase } from "@/lib/stock/index";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    if (!await stockAuthorized()) return stockJson({ error: "Unauthorized" }, 401);
    const query = new URL(request.url).searchParams;
    const input = validateAnalyticsInput({ date: query.get("date") ?? maineDate(), kind: (query.get("kind") ?? "week") as AnalyticsInput["kind"],
      ...(query.has("productKey") ? { productKey: query.get("productKey")! } : {}), ...(query.has("family") ? { family: query.get("family")! } : {}) });
    await stock();
    return stockJson(await new AnalyticsService(await stockDatabase()).view(input));
  } catch (error) { return stockFailure(error); }
}
