import { passport } from "@/lib/passport";
import { authenticatedBearer } from "@/lib/passport/security";
import { json } from "@/lib/passport/http";
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  if (!authenticatedBearer(request, process.env.PASSPORT_READ_SECRET)) return json({ error: "Unauthorized" }, 401);
  const { token } = await context.params;
  if (!/^[\w-]{43}$/.test(token)) return json({ error: "not_found" }, 404);
  try {
    const card = await (await passport()).card(token);
    return card ? json(card) : json({ error: "not_found" }, 404);
  } catch { return json({ error: "temporarily_unavailable" }, 503); }
}
