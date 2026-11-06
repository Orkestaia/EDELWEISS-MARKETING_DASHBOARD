import { cookies } from "next/headers";
import { SESSION_COOKIE, sameOrigin, validSession } from "@/lib/dashboard-session";
import { stock } from "@/lib/stock";
import { WebsiteFeed } from "@/lib/stock/feed";
import { syncStock } from "@/lib/stock/sync";

export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  if (!validSession((await cookies()).get(SESSION_COOKIE)?.value)) return json({ error: "Unauthorized" }, 401);
  if (!sameOrigin(request)) return json({ error: "Forbidden" }, 403);
  if (!process.env.DATABASE_URL || !process.env.DASHBOARD_FEED_SECRET) return json({ error: "Database and website feed setup are required before syncing." }, 503);
  try {
    const result = await syncStock(await stock(), new WebsiteFeed(process.env.DASHBOARD_FEED_SECRET));
    return json(result, result.status === "error" ? 502 : result.status === "busy" ? 409 : 200);
  } catch { return json({ error: "Stock sync could not start. Please try again." }, 503); }
}
