import type { CloseValues } from "./types";

export class StockError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function dateKey(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + "T12:00:00Z")) || new Date(value + "T12:00:00Z").toISOString().slice(0, 10) !== value) throw new StockError("Choose a valid date.");
  return value;
}
export function shiftDate(date: string, days: number) {
  const value = new Date(dateKey(date) + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function monday(date: string) {
  return shiftDate(date, -((new Date(dateKey(date) + "T12:00:00Z").getUTCDay() + 6) % 7));
}
export function weekday(date: string) { return (new Date(dateKey(date) + "T12:00:00Z").getUTCDay() + 6) % 7; }
export function maineDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function nightlyDue(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(now));
  // 03:30 is the fallback on the spring day when 02:30 does not exist.
  return hour === 2 || hour === 3;
}
export function quantity(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 100000) throw new StockError("Use a whole quantity between 0 and 100,000.");
  return value;
}
export function version(value: unknown) { return quantity(value); }
export function staffName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 80) throw new StockError("Enter your name (up to 80 characters).");
  return value.trim();
}
export function reasonText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > 500) throw new StockError("Keep the reason under 500 characters.");
  return value.trim();
}
export function largeOverride(planned: number, baseline: number) { return Math.abs(planned - baseline) > baseline * 0.2; }
export function validateClose(body: Record<string, unknown>, closed: boolean): CloseValues {
  const baked = body.baked == null ? null : quantity(body.baked);
  const leftover = body.leftover == null ? null : quantity(body.leftover);
  const tgtg = quantity(body.tgtg), reused = quantity(body.reused), discarded = quantity(body.discarded);
  if (typeof body.soldOut !== "boolean") throw new StockError("Confirm whether this product sold out.");
  const soldOutAt = body.soldOutAt === "" || body.soldOutAt == null ? null : body.soldOutAt;
  if (soldOutAt !== null && (typeof soldOutAt !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(soldOutAt))) throw new StockError("Enter a valid sold-out time.");
  if (!body.soldOut && soldOutAt) throw new StockError("A sold-out time needs Sold out to be selected.");
  if (closed && (baked === null || leftover === null)) throw new StockError("Confirm actual baked and leftover quantities before closing.");
  if (baked !== null && leftover !== null && leftover > baked) throw new StockError("Leftovers cannot exceed the quantity baked.");
  if (leftover !== null && tgtg + reused + discarded > leftover) throw new StockError("TGTG, reused and discarded cannot exceed leftovers.");
  if (body.soldOut && leftover !== null && leftover > 0) throw new StockError("Check Sold out: this product still has leftovers.");
  return { baked, leftover, tgtg, reused, discarded, soldOut: body.soldOut, soldOutAt: soldOutAt as string | null };
}
