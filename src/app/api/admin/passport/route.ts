import { cookies } from "next/headers";
import { SESSION_COOKIE, validSession, sameOrigin } from "@/lib/dashboard-session";
import { passport } from "@/lib/passport";
import { json } from "@/lib/passport/http";
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
async function authorized() { return validSession((await cookies()).get(SESSION_COOKIE)?.value); }
export async function GET(request: Request) {
  if (!await authorized()) return json({ error: "Unauthorized" }, 401);
  const id = new URL(request.url).searchParams.get("customer");
  if (id && !uuid.test(id)) return json({ error: "invalid_customer" }, 400);
  try { const service = await passport(); return json(id ? await service.detail(id) : await service.admin()); }
  catch { return json({ error: "Passport database is not available." }, 503); }
}
export async function POST(request: Request) {
  if (!await authorized()) return json({ error: "Unauthorized" }, 401);
  if (!sameOrigin(request)) return json({ error: "Forbidden" }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid_body" }, 400); }
  if (!body || typeof body.orderId !== "string" || !uuid.test(body.orderId) || typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 500) return json({ error: "Order and reason are required." }, 400);
  try { return await (await passport()).voidOrder(body.orderId, body.reason.trim()) ? json({ ok: true }) : json({ error: "not_found" }, 404); }
  catch { return json({ error: "temporarily_unavailable" }, 503); }
}
