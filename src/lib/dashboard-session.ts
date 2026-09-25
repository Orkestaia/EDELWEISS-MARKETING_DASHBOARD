import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "edelweiss_dashboard";
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin"), host = request.headers.get("host");
  if (!origin || !host) return false;
  try { const parsed = new URL(origin); return ["http:", "https:"].includes(parsed.protocol) && parsed.host === host; } catch { return false; }
}
export function secureEqual(a: string, b: string) {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}
function signature(payload: string) {
  const secret = process.env.DASHBOARD_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Configure DASHBOARD_SESSION_SECRET with at least 32 characters");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
export function createSession() {
  const payload = String(Date.now() + 8 * 60 * 60 * 1000);
  return `${payload}.${signature(payload)}`;
}
export function validSession(value?: string) {
  if (!value || !process.env.DASHBOARD_PASSWORD) return false;
  const [expires, mac, extra] = value.split(".");
  if (extra || !/^\d+$/.test(expires) || Number(expires) <= Date.now() || !mac) return false;
  try { return secureEqual(signature(expires), mac); } catch { return false; }
}
