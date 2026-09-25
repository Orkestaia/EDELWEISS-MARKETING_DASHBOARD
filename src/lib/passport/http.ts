import { passport } from "./index";
import { authenticatedBearer, signedIngest } from "./security";
export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
export async function ingestRequest(request: Request) {
  const raw = await request.text();
  if (raw.length > 16384) return json({ error: "payload_too_large" }, 413);
  if (!signedIngest(request, raw)) return json({ error: "Unauthorized" }, 401);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: "invalid_body" }, 400); }
  if (!body || Array.isArray(body) || typeof body !== "object") return json({ error: "invalid_body" }, 400);
  // Missing-email events don't need a database connection.
  if (body.customerEmail == null || (typeof body.customerEmail === "string" && !body.customerEmail.trim())) return json({ skipped: true, reason: "no_email" });
  try { return json(await (await passport()).ingest(body)); }
  catch (error) {
    if (error instanceof Error && ["invalid_body", "invalid_amount"].includes(error.message)) return json({ error: error.message }, 400);
    return json({ error: "temporarily_unavailable" }, 503);
  }
}
export async function rewardRequest(request: Request, redeem: boolean) {
  if (!authenticatedBearer(request, process.env.PASSPORT_REDEEM_SECRET)) return json({ error: "Unauthorized" }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid_body" }, 400); }
  if (!body || typeof body.code !== "string" || body.code.length > 30 || typeof body.email !== "string" || body.email.length > 320 || (redeem && (typeof body.orderId !== "string" || !body.orderId.trim() || body.orderId.length > 200))) return json({ error: "invalid_body" }, 400);
  try { return json(await (await passport()).reward(body.code, body.email, redeem ? body.orderId : undefined)); }
  catch { return json({ error: "temporarily_unavailable" }, 503); }
}
