import { secureEqual } from "@/lib/dashboard-session";
import { nightlyDue } from "@/lib/stock/domain";
import { stock } from "@/lib/stock";
import { WebsiteFeed } from "@/lib/stock/feed";
import { syncStock } from "@/lib/stock/sync";

export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (!process.env.CRON_SECRET || !secureEqual(request.headers.get("authorization") ?? "", `Bearer ${process.env.CRON_SECRET}`)) return json({ error: "Unauthorized" }, 401);
  if (!nightlyDue()) return json({ status: "skipped", message: "Outside the Maine nightly window." });
  if (!process.env.DATABASE_URL || !process.env.DASHBOARD_FEED_SECRET) return json({ error: "Stock feed configuration pending." }, 503);
  try {
    const result = await syncStock(await stock(), new WebsiteFeed(process.env.DASHBOARD_FEED_SECRET));
    return json(result, result.status === "error" ? 502 : 200);
  } catch { return json({ error: "Stock sync unavailable." }, 503); }
}
