import { createHmac } from "node:crypto";
import { dateKey } from "./domain";
import type { CatalogItem, SalesFeed } from "./types";

export const FEED_ORIGIN = "https://www.edelweisspastryshop.ch";
export class FeedError extends Error {}
export class FeedWindowError extends FeedError {
  constructor(public oldestAvailable: string) { super(`Clover history starts on ${oldestAvailable}.`); }
}
const object = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const numeric = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e12;
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 500;
const time = (v: unknown) => v === null || (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v));
export function feedSignature(secret: string, path: string, now = Date.now()) {
  const t = Math.floor(now / 1000);
  const mac = createHmac("sha256", secret).update(`${t}.GET ${path}.`).digest("hex");
  return `t=${t},v1=${mac}`;
}
export function parseCatalog(raw: unknown): CatalogItem[] {
  if (!object(raw) || !Array.isArray(raw.items) || raw.items.length > 10000) throw new FeedError("Invalid catalogue response.");
  const ids = new Set<string>();
  return raw.items.map(v => {
    if (!object(v) || !text(v.cloverItemId) || !text(v.name) || !Number.isSafeInteger(v.priceCents) || Number(v.priceCents) < 0 || typeof v.tracked !== "boolean" || !(v.stock === null || numeric(v.stock)) || !(v.category === null || typeof v.category === "string") || ids.has(v.cloverItemId)) throw new FeedError("Invalid catalogue item.");
    ids.add(v.cloverItemId);
    return { cloverItemId: v.cloverItemId, name: v.name, priceCents: v.priceCents as number, category: v.category as string | null, tracked: v.tracked, stock: v.stock as number | null };
  });
}
export function parseSales(raw: unknown, requestedDate: string): SalesFeed {
  if (!object(raw) || raw.date !== dateKey(requestedDate) || raw.timezone !== "America/New_York" || typeof raw.complete !== "boolean" || typeof raw.generatedAt !== "string" || !Number.isFinite(Date.parse(raw.generatedAt)) || !Array.isArray(raw.items) || raw.items.length > 10000) throw new FeedError("Invalid daily sales response.");
  const ids = new Set<string>();
  for (const v of raw.items) {
    if (!object(v) || !(v.cloverItemId === null || text(v.cloverItemId)) || !text(v.name) || (v.cloverItemId !== null && ids.has(v.cloverItemId)) || !numeric(v.unitsInStore) || !numeric(v.unitsOnline) || !numeric(v.unitsTotal) || Math.abs(v.unitsInStore + v.unitsOnline - v.unitsTotal) > 0.00001 || !Number.isSafeInteger(v.revenueCents) || !time(v.firstSaleAt) || !time(v.lastSaleAt) || !(v.stockEnd === null || (numeric(v.stockEnd) && Number.isSafeInteger(v.stockEnd))) || !object(v.hourly) || Object.entries(v.hourly).some(([h, n]) => !/^(?:[0-9]|1[0-9]|2[0-3])$/.test(h) || !numeric(n))) throw new FeedError("Invalid daily sales item.");
    if (v.cloverItemId !== null) ids.add(v.cloverItemId);
  }
  const source = raw as unknown as SalesFeed;
  const result: SalesFeed = { date: source.date, timezone: "America/New_York", generatedAt: source.generatedAt, complete: source.complete,
    items: source.items.map(item => ({ cloverItemId: item.cloverItemId, name: item.name, unitsInStore: item.unitsInStore, unitsOnline: item.unitsOnline, unitsTotal: item.unitsTotal, revenueCents: item.revenueCents, firstSaleAt: item.firstSaleAt, lastSaleAt: item.lastSaleAt, hourly: { ...item.hourly }, stockEnd: item.stockEnd, ...(numeric(item.refundedUnits) && item.refundedUnits >= 0 ? { refundedUnits: item.refundedUnits } : {}) })) };
  if (Number.isSafeInteger(raw.orders) && Number(raw.orders) >= 0) result.orders = Number(raw.orders);
  if (Number.isSafeInteger(raw.paidOrders) && Number(raw.paidOrders) >= 0) result.paidOrders = Number(raw.paidOrders);
  return result;
}
export interface FeedSource { items(): Promise<CatalogItem[]>; sales(date: string): Promise<SalesFeed> }
export class WebsiteFeed implements FeedSource {
  constructor(private secret: string, private request: typeof fetch = fetch) {
    if (!secret) throw new FeedError("Website feed is not configured.");
  }
  private async get(path: string) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.request(FEED_ORIGIN + path, { method: "GET", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30000), headers: { "x-edelweiss-signature": feedSignature(this.secret, path), Accept: "application/json" } });
        if (response.status >= 500 && attempt === 0) continue;
        if (response.status === 422) {
          const body: unknown = await response.json();
          if (object(body) && body.error === "outside_clover_window" && typeof body.oldestAvailable === "string") throw new FeedWindowError(dateKey(body.oldestAvailable));
        }
        if (!response.ok) throw new FeedError(`Website feed returned HTTP ${response.status}.`);
        const raw = await response.text();
        if (raw.length > 4_000_000) throw new FeedError("Website feed response is too large.");
        return JSON.parse(raw) as unknown;
      } catch (error) {
        if (error instanceof FeedError) throw error;
        if (attempt === 1) throw new FeedError("Website feed could not be reached or returned invalid JSON.");
      }
    }
    throw new FeedError("Website feed is unavailable.");
  }
  async items() { return parseCatalog(await this.get("/api/internal/items")); }
  async sales(date: string) { const day = dateKey(date); return parseSales(await this.get(`/api/internal/sales-daily?date=${day}`), day); }
}
