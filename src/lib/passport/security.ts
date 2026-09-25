import { createHmac, timingSafeEqual } from "node:crypto";
import { secureEqual } from "../dashboard-session";
export function authenticatedBearer(request: Request, secret?: string) {
  return Boolean(secret && secureEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`));
}
export function signedIngest(request: Request, body: string, secret = process.env.PASSPORT_INGEST_SECRET, now = Date.now()) {
  const timestamp = request.headers.get("x-passport-timestamp") ?? "";
  const signature = request.headers.get("x-passport-signature") ?? "";
  if (!secret || !/^\d{1,12}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300 || !/^[a-f\d]{64}$/i.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signature, "hex"), createHmac("sha256", secret).update(`${timestamp}.${body}`).digest());
}
export function normalizeEmail(value: string) { return value.toLowerCase().replace(/\s/g, ""); }
export function cents(value: unknown) {
  if (typeof value !== "string" || !/^\$?(?:\d+|\d{1,3}(?:,\d{3})+)\.\d{2}$/.test(value)) throw new Error("invalid_amount");
  const [whole, fraction] = value.replace(/[$,]/g, "").split(".");
  const amount = Number(whole) * 100 + Number(fraction);
  if (!Number.isSafeInteger(amount) || amount > 2147483647) throw new Error("invalid_amount");
  return amount;
}
